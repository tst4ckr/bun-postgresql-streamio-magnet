/**
 * Servicio de configuración del sistema IPTV
 * 
 * Gestiona la carga, validación y acceso a la configuración
 * del sistema de manera centralizada y segura.
 */

import { ConfigurationBuilder } from './builder.js';

/**
 * Servicio centralizado de configuración
 * Proporciona acceso seguro y validado a la configuración del sistema
 */
export class ConfigurationService {
    constructor(initialConfig = {}, eventEmitter = null) {
        this.config = null;
        this.initialConfig = initialConfig;
        this.eventEmitter = eventEmitter;
        this.watchers = new Map();
        this.isLoaded = false;
    }

    /**
     * Carga y valida la configuración del sistema
     * @param {Object} overrides - Configuración adicional
     * @returns {Promise<Object>} Configuración cargada
     */
    async loadAndValidate(overrides = {}) {
        try {
            this.emitEvent('config:loading');
            
            // Construir configuración usando el builder
            const builder = new ConfigurationBuilder()
                .setDefaults()
                .merge(this.initialConfig)
                .loadFromEnv()
                .merge(overrides);
            
            // Intentar cargar desde archivo si existe
            const configFile = process.env.IPTV_CONFIG_FILE || './config/iptv.config.js';
            builder.loadFromFile(configFile);
            
            // Construir configuración final
            this.config = builder.build();
            this.isLoaded = true;
            
            this.emitEvent('config:loaded', { config: this.config });
            
            return this.config;
        } catch (error) {
            this.emitEvent('config:error', { error });
            throw new Error(`Configuration loading failed: ${error.message}`);
        }
    }

    /**
     * Obtiene un valor de configuración por ruta
     * @param {string} path - Ruta del valor (ej: 'processing.chunkSize')
     * @param {*} defaultValue - Valor por defecto
     * @returns {*} Valor de configuración
     */
    get(path, defaultValue = undefined) {
        if (!this.isLoaded) {
            throw new Error('Configuration not loaded. Call loadAndValidate() first.');
        }
        
        return this.getNestedValue(this.config, path.split('.'), defaultValue);
    }

    /**
     * Verifica si existe un valor de configuración
     * @param {string} path - Ruta del valor
     * @returns {boolean} True si existe el valor
     */
    has(path) {
        if (!this.isLoaded) {
            return false;
        }
        
        try {
            const value = this.getNestedValue(this.config, path.split('.'));
            return value !== undefined;
        } catch {
            return false;
        }
    }

    /**
     * Obtiene toda la configuración
     * @returns {Object} Configuración completa
     */
    getAll() {
        if (!this.isLoaded) {
            throw new Error('Configuration not loaded. Call loadAndValidate() first.');
        }
        
        return { ...this.config };
    }

    /**
     * Obtiene configuración de un módulo específico
     * @param {string} module - Nombre del módulo
     * @returns {Object} Configuración del módulo
     */
    getModule(module) {
        return this.get(module, {});
    }

    /**
     * Verifica si está en un entorno específico
     * @param {string} environment - Entorno a verificar
     * @returns {boolean} True si coincide el entorno
     */
    isEnvironment(environment) {
        return this.get('environment') === environment;
    }

    /**
     * Verifica si está en modo desarrollo
     * @returns {boolean} True si es desarrollo
     */
    isDevelopment() {
        return this.isEnvironment('development');
    }

    /**
     * Verifica si está en modo producción
     * @returns {boolean} True si es producción
     */
    isProduction() {
        return this.isEnvironment('production');
    }

    /**
     * Verifica si está en modo test
     * @returns {boolean} True si es test
     */
    isTest() {
        return this.isEnvironment('test');
    }

    /**
     * Observa cambios en un valor de configuración
     * @param {string} path - Ruta a observar
     * @param {Function} callback - Callback para cambios
     * @returns {Function} Función para cancelar observación
     */
    watch(path, callback) {
        if (!this.watchers.has(path)) {
            this.watchers.set(path, new Set());
        }
        
        this.watchers.get(path).add(callback);
        
        // Retornar función para cancelar observación
        return () => {
            const pathWatchers = this.watchers.get(path);
            if (pathWatchers) {
                pathWatchers.delete(callback);
                if (pathWatchers.size === 0) {
                    this.watchers.delete(path);
                }
            }
        };
    }

    /**
     * Actualiza un valor de configuración en tiempo de ejecución
     * @param {string} path - Ruta del valor
     * @param {*} value - Nuevo valor
     */
    set(path, value) {
        if (!this.isLoaded) {
            throw new Error('Configuration not loaded. Call loadAndValidate() first.');
        }
        
        const oldValue = this.get(path);
        this.setNestedValue(this.config, path.split('.'), value);
        
        // Notificar a watchers
        this.notifyWatchers(path, value, oldValue);
        
        this.emitEvent('config:updated', { path, value, oldValue });
    }

    /**
     * Recarga la configuración desde las fuentes
     * @returns {Promise<Object>} Nueva configuración
     */
    async reload() {
        const oldConfig = this.config;
        
        try {
            await this.loadAndValidate();
            this.emitEvent('config:reloaded', { oldConfig, newConfig: this.config });
            return this.config;
        } catch (error) {
            // Restaurar configuración anterior en caso de error
            this.config = oldConfig;
            throw error;
        }
    }

    /**
     * Valida la configuración actual
     * @returns {Object} Resultado de validación
     */
    validate() {
        if (!this.isLoaded) {
            return { isValid: false, errors: ['Configuration not loaded'] };
        }
        
        const errors = [];
        
        // Validaciones específicas del dominio IPTV
        this.validateSources(errors);
        this.validateProcessing(errors);
        this.validateOutput(errors);
        this.validatePlugins(errors);
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Valida configuración de fuentes
     * @param {string[]} errors - Array de errores
     */
    validateSources(errors) {
        const sources = this.get('sources', {});
        
        if (Object.keys(sources).length === 0) {
            errors.push('At least one data source must be configured');
        }
        
        // Validar fuente CSV
        if (sources.csv && !sources.csv.path) {
            errors.push('CSV source requires a path');
        }
        
        // Validar fuente M3U
        if (sources.m3u && !sources.m3u.url) {
            errors.push('M3U source requires a URL');
        }
        
        // Validar fuente API
        if (sources.api && !sources.api.endpoint) {
            errors.push('API source requires an endpoint');
        }
    }

    /**
     * Valida configuración de procesamiento
     * @param {string[]} errors - Array de errores
     */
    validateProcessing(errors) {
        const processing = this.get('processing', {});
        
        if (processing.chunkSize && processing.chunkSize < 1) {
            errors.push('Processing chunk size must be greater than 0');
        }
        
        if (processing.maxConcurrency && processing.maxConcurrency < 1) {
            errors.push('Max concurrency must be greater than 0');
        }
    }

    /**
     * Valida configuración de salida
     * @param {string[]} errors - Array de errores
     */
    validateOutput(errors) {
        const output = this.get('output', {});
        
        // Verificar que al menos una salida esté habilitada
        const enabledOutputs = Object.values(output).filter(config => 
            config && config.enabled !== false
        );
        
        if (enabledOutputs.length === 0) {
            errors.push('At least one output format must be enabled');
        }
        
        // Validar rutas de salida
        if (output.csv && output.csv.path && !this.isValidPath(output.csv.path)) {
            errors.push('Invalid CSV output path');
        }
        
        if (output.m3u && output.m3u.path && !this.isValidPath(output.m3u.path)) {
            errors.push('Invalid M3U output path');
        }
    }

    /**
     * Valida configuración de plugins
     * @param {string[]} errors - Array de errores
     */
    validatePlugins(errors) {
        const plugins = this.get('plugins', []);
        
        if (!Array.isArray(plugins)) {
            errors.push('Plugins configuration must be an array');
        }
    }

    /**
     * Verifica si una ruta es válida
     * @param {string} path - Ruta a verificar
     * @returns {boolean} True si es válida
     */
    isValidPath(path) {
        try {
            const pathModule = require('path');
            pathModule.parse(path);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Obtiene valor anidado de un objeto
     * @param {Object} obj - Objeto fuente
     * @param {string[]} path - Ruta del valor
     * @param {*} defaultValue - Valor por defecto
     * @returns {*} Valor encontrado
     */
    getNestedValue(obj, path, defaultValue = undefined) {
        let current = obj;
        
        for (const key of path) {
            if (current === null || current === undefined || !(key in current)) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    }

    /**
     * Establece valor anidado en un objeto
     * @param {Object} obj - Objeto destino
     * @param {string[]} path - Ruta del valor
     * @param {*} value - Valor a establecer
     */
    setNestedValue(obj, path, value) {
        let current = obj;
        
        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[path[path.length - 1]] = value;
    }

    /**
     * Notifica a los watchers sobre cambios
     * @param {string} path - Ruta que cambió
     * @param {*} newValue - Nuevo valor
     * @param {*} oldValue - Valor anterior
     */
    notifyWatchers(path, newValue, oldValue) {
        const watchers = this.watchers.get(path);
        if (watchers) {
            for (const callback of watchers) {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error(`Error in config watcher for ${path}:`, error);
                }
            }
        }
    }

    /**
     * Emite un evento si hay eventEmitter disponible
     * @param {string} eventName - Nombre del evento
     * @param {*} data - Datos del evento
     */
    emitEvent(eventName, data = {}) {
        if (this.eventEmitter) {
            this.eventEmitter.emit(eventName, data);
        }
    }

    /**
     * Obtiene información de diagnóstico
     * @returns {Object} Información de diagnóstico
     */
    getDiagnostics() {
        return {
            isLoaded: this.isLoaded,
            environment: this.get('environment'),
            configKeys: this.isLoaded ? Object.keys(this.config) : [],
            watchersCount: this.watchers.size,
            validation: this.isLoaded ? this.validate() : { isValid: false, errors: ['Not loaded'] }
        };
    }

    /**
     * Exporta la configuración actual
     * @param {string} format - Formato de exportación (json, js)
     * @returns {string} Configuración exportada
     */
    export(format = 'json') {
        if (!this.isLoaded) {
            throw new Error('Configuration not loaded');
        }
        
        switch (format) {
            case 'json':
                return JSON.stringify(this.config, null, 2);
            case 'js':
                return `module.exports = ${JSON.stringify(this.config, null, 2)};`;
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Limpia recursos del servicio
     */
    destroy() {
        this.watchers.clear();
        this.config = null;
        this.isLoaded = false;
    }
}