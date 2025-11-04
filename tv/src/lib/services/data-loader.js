/**
 * Servicio de carga de datos con batching y caching
 * 
 * Implementa el patrón DataLoader para optimizar la carga de datos
 * desde múltiples fuentes (CSV, M3U, API) con batching automático,
 * caching inteligente y manejo de errores robusto.
 */

import { EventEmitter } from '../core/event-emitter.js';

/**
 * Clase base para carga de datos con batching y caching
 * Inspirada en el patrón DataLoader de Facebook
 */
export class DataLoader extends EventEmitter {
    constructor(batchLoadFn, options = {}) {
        super();
        
        this.batchLoadFn = batchLoadFn;
        this.options = {
            batch: true,
            cache: true,
            maxBatchSize: Infinity,
            batchScheduleFn: callback => process.nextTick(callback),
            cacheKeyFn: key => key,
            cacheMap: new Map(),
            name: null,
            ...options
        };
        
        // Estado interno
        this._promiseCache = this.options.cache ? this.options.cacheMap : null;
        this._batch = null;
        this._batchScheduled = false;
    }

    /**
     * Carga un valor individual por clave
     * @param {*} key - Clave a cargar
     * @returns {Promise} Promise que resuelve al valor
     */
    async load(key) {
        if (key === null || key === undefined) {
            throw new TypeError('DataLoader key cannot be null or undefined');
        }

        const cacheKey = this.options.cacheKeyFn(key);
        
        // Verificar cache si está habilitado
        if (this._promiseCache) {
            const cachedPromise = this._promiseCache.get(cacheKey);
            if (cachedPromise) {
                this.emit('cache_hit', { key, cacheKey });
                return cachedPromise;
            }
        }

        // Crear nueva promesa para esta carga
        const promise = new Promise((resolve, reject) => {
            // Agregar a batch actual o crear nuevo
            if (!this._batch) {
                this._batch = {
                    keys: [],
                    callbacks: [],
                    cacheKeys: []
                };
            }

            this._batch.keys.push(key);
            this._batch.cacheKeys.push(cacheKey);
            this._batch.callbacks.push({ resolve, reject });

            // Programar ejecución del batch si no está programada
            if (!this._batchScheduled) {
                this._batchScheduled = true;
                this.options.batchScheduleFn(() => {
                    this._dispatchBatch();
                });
            }

            // Verificar límite de batch
            if (this._batch.keys.length >= this.options.maxBatchSize) {
                this._dispatchBatch();
            }
        });

        // Cachear la promesa si el cache está habilitado
        if (this._promiseCache) {
            this._promiseCache.set(cacheKey, promise);
        }

        this.emit('load_requested', { key, cacheKey });
        return promise;
    }

    /**
     * Carga múltiples valores
     * @param {Array} keys - Array de claves a cargar
     * @returns {Promise<Array>} Promise que resuelve a array de valores
     */
    async loadMany(keys) {
        if (!Array.isArray(keys)) {
            throw new TypeError('DataLoader keys must be an array');
        }

        return Promise.all(keys.map(key => this.load(key)));
    }

    /**
     * Prepara el cache con un valor
     * @param {*} key - Clave
     * @param {*} value - Valor o Error
     * @returns {DataLoader} Esta instancia para chaining
     */
    prime(key, value) {
        if (!this._promiseCache) {
            return this;
        }

        const cacheKey = this.options.cacheKeyFn(key);
        
        // No sobrescribir valores existentes
        if (this._promiseCache.has(cacheKey)) {
            return this;
        }

        const promise = value instanceof Error 
            ? Promise.reject(value)
            : Promise.resolve(value);

        this._promiseCache.set(cacheKey, promise);
        this.emit('cache_primed', { key, cacheKey, value });
        
        return this;
    }

    /**
     * Limpia una clave específica del cache
     * @param {*} key - Clave a limpiar
     * @returns {DataLoader} Esta instancia para chaining
     */
    clear(key) {
        if (!this._promiseCache) {
            return this;
        }

        const cacheKey = this.options.cacheKeyFn(key);
        this._promiseCache.delete(cacheKey);
        this.emit('cache_cleared', { key, cacheKey });
        
        return this;
    }

    /**
     * Limpia todo el cache
     * @returns {DataLoader} Esta instancia para chaining
     */
    clearAll() {
        if (!this._promiseCache) {
            return this;
        }

        this._promiseCache.clear();
        this.emit('cache_cleared_all');
        
        return this;
    }

    /**
     * Despacha el batch actual
     * @private
     */
    async _dispatchBatch() {
        const batch = this._batch;
        this._batch = null;
        this._batchScheduled = false;

        if (!batch || batch.keys.length === 0) {
            return;
        }

        this.emit('batch_dispatched', { 
            keys: batch.keys, 
            size: batch.keys.length 
        });

        try {
            const values = await this.batchLoadFn(batch.keys);
            
            if (!Array.isArray(values)) {
                throw new TypeError('Batch function must return an array');
            }

            if (values.length !== batch.keys.length) {
                throw new TypeError(
                    `Batch function returned ${values.length} values, ` +
                    `expected ${batch.keys.length}`
                );
            }

            // Resolver cada promesa con su valor correspondiente
            for (let i = 0; i < batch.callbacks.length; i++) {
                const value = values[i];
                const callback = batch.callbacks[i];
                
                if (value instanceof Error) {
                    callback.reject(value);
                    
                    // Limpiar del cache si es un error que no debe persistir
                    if (this._promiseCache && this._shouldClearError(value)) {
                        this._promiseCache.delete(batch.cacheKeys[i]);
                    }
                } else {
                    callback.resolve(value);
                }
            }

            this.emit('batch_completed', { 
                keys: batch.keys, 
                values,
                size: batch.keys.length 
            });

        } catch (error) {
            // Rechazar todas las promesas del batch
            for (const callback of batch.callbacks) {
                callback.reject(error);
            }

            // Limpiar del cache todas las claves del batch fallido
            if (this._promiseCache) {
                for (const cacheKey of batch.cacheKeys) {
                    this._promiseCache.delete(cacheKey);
                }
            }

            this.emit('batch_failed', { 
                keys: batch.keys, 
                error,
                size: batch.keys.length 
            });
        }
    }

    /**
     * Determina si un error debe ser limpiado del cache
     * @param {Error} error - Error a evaluar
     * @returns {boolean} True si debe ser limpiado
     * @private
     */
    _shouldClearError(error) {
        // Limpiar errores de red temporales
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return true;
        }
        
        // Limpiar errores de timeout
        if (error.code === 'ETIMEDOUT') {
            return true;
        }
        
        // Mantener errores de validación y datos no encontrados
        return false;
    }

    /**
     * Obtiene estadísticas del DataLoader
     * @returns {Object} Estadísticas
     */
    getStats() {
        return {
            name: this.options.name,
            cacheSize: this._promiseCache ? this._promiseCache.size : 0,
            batchPending: this._batch ? this._batch.keys.length : 0,
            batchScheduled: this._batchScheduled,
            options: {
                batch: this.options.batch,
                cache: this.options.cache,
                maxBatchSize: this.options.maxBatchSize
            }
        };
    }
}

/**
 * Servicio especializado para carga de datos IPTV
 * Maneja múltiples fuentes de datos con optimizaciones específicas
 */
export class IPTVDataLoader {
    constructor(containerOrConfig) {
        // Detectar si es un container o un config directo
        if (containerOrConfig && typeof containerOrConfig.resolve === 'function') {
            // Es un container
            this.container = containerOrConfig;
            this.config = containerOrConfig.resolve('configurationService');
            this.logger = containerOrConfig.resolve('logger');
        } else {
            // Es un config directo
            this.container = null;
            this.config = containerOrConfig;
            this.logger = console; // Fallback a console
        }
        
        this.loaders = new Map();
        this._initializeLoaders();
    }

    /**
     * Obtiene la configuración de fuentes de manera compatible
     * @private
     * @returns {Object} Configuración de fuentes
     */
    _getSourcesConfig() {
        // Si el config tiene método get (patrón container)
        if (this.config && typeof this.config.get === 'function') {
            return this.config.get('sources', {});
        }
        
        // Si es TVAddonConfig, usar getAll() y extraer fuentes
        if (this.config && typeof this.config.getAll === 'function') {
            const allConfig = this.config.getAll();
            return {
                csv: allConfig.dataSources?.channelsSource === 'csv',
                m3u: allConfig.dataSources?.m3uUrl || allConfig.dataSources?.autoM3uUrl,
                api: false // Por ahora no hay fuente API configurada
            };
        }
        
        // Fallback: configuración vacía
        return {};
    }

    /**
     * Inicializa los loaders para cada fuente de datos
     * @private
     */
    _initializeLoaders() {
        // Obtener configuración de fuentes de manera compatible
        const sources = this._getSourcesConfig();
        
        // Loader para datos CSV
        if (sources.csv) {
            this.loaders.set('csv', new DataLoader(
                keys => this._batchLoadCSV(keys),
                {
                    name: 'csv-loader',
                    maxBatchSize: 100,
                    cache: true
                }
            ));
        }

        // Loader para datos M3U
        if (sources.m3u) {
            this.loaders.set('m3u', new DataLoader(
                keys => this._batchLoadM3U(keys),
                {
                    name: 'm3u-loader',
                    maxBatchSize: 50,
                    cache: true,
                    batchScheduleFn: callback => setTimeout(callback, 100) // Delay para M3U
                }
            ));
        }

        // Loader para API
        if (sources.api) {
            this.loaders.set('api', new DataLoader(
                keys => this._batchLoadAPI(keys),
                {
                    name: 'api-loader',
                    maxBatchSize: 25,
                    cache: true
                }
            ));
        }

        // Loader para validación de streams
        this.loaders.set('validation', new DataLoader(
            urls => this._batchValidateStreams(urls),
            {
                name: 'validation-loader',
                maxBatchSize: 10,
                cache: false, // No cachear validaciones
                batchScheduleFn: callback => setTimeout(callback, 200)
            }
        ));
    }

    /**
     * Carga datos desde fuente CSV en batch
     * @param {Array} keys - Claves a cargar
     * @returns {Promise<Array>} Datos cargados
     * @private
     */
    async _batchLoadCSV(keys) {
        try {
            const csvService = this.container.resolve('csvService');
            const results = await csvService.loadByKeys(keys);
            
            return keys.map(key => 
                results.find(item => item.id === key) || 
                new Error(`CSV data not found for key: ${key}`)
            );
        } catch (error) {
            this.logger.error('Batch CSV load failed', { keys, error });
            return keys.map(() => error);
        }
    }

    /**
     * Carga datos desde fuente M3U en batch
     * @param {Array} keys - Claves a cargar
     * @returns {Promise<Array>} Datos cargados
     * @private
     */
    async _batchLoadM3U(keys) {
        try {
            const m3uService = this.container.resolve('m3uService');
            const results = await m3uService.loadByKeys(keys);
            
            return keys.map(key => 
                results.find(item => item.id === key) || 
                new Error(`M3U data not found for key: ${key}`)
            );
        } catch (error) {
            this.logger.error('Batch M3U load failed', { keys, error });
            return keys.map(() => error);
        }
    }

    /**
     * Carga datos desde API en batch
     * @param {Array} keys - Claves a cargar
     * @returns {Promise<Array>} Datos cargados
     * @private
     */
    async _batchLoadAPI(keys) {
        try {
            const apiService = this.container.resolve('apiService');
            const results = await apiService.loadByKeys(keys);
            
            return keys.map(key => 
                results.find(item => item.id === key) || 
                new Error(`API data not found for key: ${key}`)
            );
        } catch (error) {
            this.logger.error('Batch API load failed', { keys, error });
            return keys.map(() => error);
        }
    }

    /**
     * Valida streams en batch
     * @param {Array} urls - URLs a validar
     * @returns {Promise<Array>} Resultados de validación
     * @private
     */
    async _batchValidateStreams(urls) {
        try {
            const validationService = this.container.resolve('validationService');
            const results = await validationService.validateStreams(urls);
            
            return urls.map(url => 
                results.find(result => result.url === url) || 
                { url, valid: false, error: 'Validation failed' }
            );
        } catch (error) {
            this.logger.error('Batch stream validation failed', { urls, error });
            return urls.map(url => ({ url, valid: false, error: error.message }));
        }
    }

    /**
     * Carga datos por clave desde una fuente específica
     * @param {string} source - Fuente de datos ('csv', 'm3u', 'api')
     * @param {*} key - Clave a cargar
     * @returns {Promise} Datos cargados
     */
    async load(source, key) {
        const loader = this.loaders.get(source);
        if (!loader) {
            throw new Error(`Unknown data source: ${source}`);
        }

        return loader.load(key);
    }

    /**
     * Carga múltiples datos desde una fuente
     * @param {string} source - Fuente de datos
     * @param {Array} keys - Claves a cargar
     * @returns {Promise<Array>} Array de datos cargados
     */
    async loadMany(source, keys) {
        const loader = this.loaders.get(source);
        if (!loader) {
            throw new Error(`Unknown data source: ${source}`);
        }

        return loader.loadMany(keys);
    }

    /**
     * Valida un stream
     * @param {string} url - URL del stream a validar
     * @returns {Promise} Resultado de validación
     */
    async validateStream(url) {
        const loader = this.loaders.get('validation');
        return loader.load(url);
    }

    /**
     * Prepara el cache con datos conocidos
     * @param {string} source - Fuente de datos
     * @param {*} key - Clave
     * @param {*} value - Valor
     * @returns {IPTVDataLoader} Esta instancia
     */
    prime(source, key, value) {
        const loader = this.loaders.get(source);
        if (loader) {
            loader.prime(key, value);
        }
        return this;
    }

    /**
     * Limpia el cache de una fuente específica
     * @param {string} source - Fuente de datos
     * @param {*} key - Clave a limpiar (opcional)
     * @returns {IPTVDataLoader} Esta instancia
     */
    clearCache(source, key = null) {
        const loader = this.loaders.get(source);
        if (loader) {
            if (key !== null) {
                loader.clear(key);
            } else {
                loader.clearAll();
            }
        }
        return this;
    }

    /**
     * Limpia todos los caches
     * @returns {IPTVDataLoader} Esta instancia
     */
    clearAllCaches() {
        for (const loader of this.loaders.values()) {
            loader.clearAll();
        }
        return this;
    }

    /**
     * Obtiene estadísticas de todos los loaders
     * @returns {Object} Estadísticas por fuente
     */
    getStats() {
        const stats = {};
        for (const [source, loader] of this.loaders.entries()) {
            stats[source] = loader.getStats();
        }
        return stats;
    }

    /**
     * Destruye todos los loaders y limpia recursos
     */
    destroy() {
        for (const loader of this.loaders.values()) {
            loader.clearAll();
            loader.removeAllListeners();
        }
        this.loaders.clear();
    }

    /**
     * Método de limpieza para compatibilidad
     * Alias para destroy()
     */
    cleanup() {
        this.destroy();
    }
}

/**
 * Factory para crear DataLoaders personalizados
 */
export class DataLoaderFactory {
    /**
     * Crea un DataLoader con configuración optimizada para IPTV
     * @param {Function} batchLoadFn - Función de carga en batch
     * @param {Object} options - Opciones de configuración
     * @returns {DataLoader} Nueva instancia de DataLoader
     */
    static createOptimized(batchLoadFn, options = {}) {
        const defaultOptions = {
            batch: true,
            cache: true,
            maxBatchSize: 50,
            batchScheduleFn: callback => process.nextTick(callback),
            cacheKeyFn: key => String(key),
            name: 'iptv-loader'
        };

        return new DataLoader(batchLoadFn, { ...defaultOptions, ...options });
    }

    /**
     * Crea un DataLoader para validación de streams
     * @param {Function} validationFn - Función de validación
     * @returns {DataLoader} DataLoader para validación
     */
    static createValidationLoader(validationFn) {
        return new DataLoader(validationFn, {
            name: 'stream-validation-loader',
            batch: true,
            cache: false, // No cachear validaciones
            maxBatchSize: 10,
            batchScheduleFn: callback => setTimeout(callback, 100)
        });
    }

    /**
     * Crea un DataLoader con cache LRU personalizado
     * @param {Function} batchLoadFn - Función de carga en batch
     * @param {number} maxCacheSize - Tamaño máximo del cache
     * @returns {DataLoader} DataLoader con cache LRU
     */
    static createWithLRUCache(batchLoadFn, maxCacheSize = 1000) {
        const lruCache = new Map();
        
        // Implementación simple de LRU
        const lruCacheMap = {
            get(key) {
                const value = lruCache.get(key);
                if (value) {
                    // Mover al final (más reciente)
                    lruCache.delete(key);
                    lruCache.set(key, value);
                }
                return value;
            },
            
            set(key, value) {
                if (lruCache.has(key)) {
                    lruCache.delete(key);
                } else if (lruCache.size >= maxCacheSize) {
                    // Eliminar el más antiguo
                    const firstKey = lruCache.keys().next().value;
                    lruCache.delete(firstKey);
                }
                lruCache.set(key, value);
            },
            
            has(key) {
                return lruCache.has(key);
            },
            
            delete(key) {
                return lruCache.delete(key);
            },
            
            clear() {
                lruCache.clear();
            },
            
            get size() {
                return lruCache.size;
            }
        };

        return new DataLoader(batchLoadFn, {
            name: 'lru-cached-loader',
            cacheMap: lruCacheMap,
            maxBatchSize: 25
        });
    }
}