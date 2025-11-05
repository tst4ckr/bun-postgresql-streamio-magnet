/**
 * Constructor de configuración usando patrón Builder
 * 
 * Permite crear configuraciones flexibles y adaptables para diferentes
 * entornos y casos de uso del sistema IPTV.
 */

/**
 * Builder para crear configuraciones del sistema IPTV
 * Implementa el patrón Builder para construcción fluida de configuración
 */
export class ConfigurationBuilder {
    constructor() {
        this.config = {
            environment: 'development',
            sources: {},
            processing: {},
            validation: {},
            output: {},
            plugins: [],
            logging: {},
            cache: {},
            http: {},
            database: {}
        };
    }

    /**
     * Establece el entorno de ejecución
     * @param {string} environment - Entorno (development, production, test)
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setEnvironment(environment) {
        this.config.environment = environment;
        
        // Aplicar configuraciones específicas del entorno
        switch (environment) {
            case 'production':
                this.applyProductionDefaults();
                break;
            case 'test':
                this.applyTestDefaults();
                break;
            case 'development':
            default:
                this.applyDevelopmentDefaults();
                break;
        }
        
        return this;
    }

    /**
     * Configura las fuentes de datos
     * @param {Object} sources - Configuración de fuentes
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setSources(sources) {
        this.config.sources = { ...this.config.sources, ...sources };
        return this;
    }

    /**
     * Configura fuente CSV
     * @param {string|Object} csvConfig - Ruta o configuración CSV
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setCSVSource(csvConfig) {
        if (typeof csvConfig === 'string') {
            this.config.sources.csv = { path: csvConfig };
        } else {
            this.config.sources.csv = csvConfig;
        }
        return this;
    }

    /**
     * Configura fuente M3U
     * @param {string|Object} m3uConfig - URL o configuración M3U
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setM3USource(m3uConfig) {
        if (typeof m3uConfig === 'string') {
            this.config.sources.m3u = { url: m3uConfig };
        } else {
            this.config.sources.m3u = m3uConfig;
        }
        return this;
    }

    /**
     * Configura fuente API
     * @param {Object} apiConfig - Configuración de API
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setAPISource(apiConfig) {
        this.config.sources.api = apiConfig;
        return this;
    }

    /**
     * Configura parámetros de procesamiento
     * @param {Object} processing - Configuración de procesamiento
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setProcessing(processing) {
        this.config.processing = { ...this.config.processing, ...processing };
        return this;
    }

    /**
     * Establece el tamaño de chunk para procesamiento
     * @param {number} chunkSize - Tamaño del chunk
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setChunkSize(chunkSize) {
        this.config.processing.chunkSize = chunkSize;
        return this;
    }

    /**
     * Habilita procesamiento paralelo
     * @param {boolean} enabled - Si habilitar paralelismo
     * @param {number} maxConcurrency - Máxima concurrencia
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    enableParallelProcessing(enabled = true, maxConcurrency = 4) {
        this.config.processing.parallel = enabled;
        this.config.processing.maxConcurrency = maxConcurrency;
        return this;
    }

    /**
     * Configura validación
     * @param {Object} validation - Configuración de validación
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setValidation(validation) {
        this.config.validation = { ...this.config.validation, ...validation };
        return this;
    }

    /**
     * Habilita validación de streams
     * @param {boolean} enabled - Si habilitar validación
     * @param {number} timeout - Timeout para validación
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    enableStreamValidation(enabled = true, timeout = 5000) {
        this.config.validation.enableStreamValidation = enabled;
        this.config.validation.streamTimeout = timeout;
        return this;
    }

    /**
     * Configura salidas
     * @param {Object} output - Configuración de salida
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setOutput(output) {
        this.config.output = { ...this.config.output, ...output };
        return this;
    }

    /**
     * Configura salida CSV
     * @param {string|Object} csvOutput - Ruta o configuración CSV
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setCSVOutput(csvOutput) {
        if (typeof csvOutput === 'string') {
            this.config.output.csv = { path: csvOutput };
        } else {
            this.config.output.csv = csvOutput;
        }
        return this;
    }

    /**
     * Configura salida M3U
     * @param {string|Object} m3uOutput - Ruta o configuración M3U
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setM3UOutput(m3uOutput) {
        if (typeof m3uOutput === 'string') {
            this.config.output.m3u = { path: m3uOutput };
        } else {
            this.config.output.m3u = m3uOutput;
        }
        return this;
    }

    /**
     * Agrega plugins al sistema
     * @param {...string} plugins - Lista de plugins
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    addPlugins(...plugins) {
        this.config.plugins.push(...plugins);
        return this;
    }

    /**
     * Configura logging
     * @param {Object} logging - Configuración de logging
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setLogging(logging) {
        this.config.logging = { ...this.config.logging, ...logging };
        return this;
    }

    /**
     * Establece nivel de logging
     * @param {string} level - Nivel (debug, info, warn, error)
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setLogLevel(level) {
        this.config.logging.level = level;
        return this;
    }

    /**
     * Configura cache
     * @param {Object} cache - Configuración de cache
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setCache(cache) {
        this.config.cache = { ...this.config.cache, ...cache };
        return this;
    }

    /**
     * Habilita cache en memoria
     * @param {number} maxSize - Tamaño máximo del cache
     * @param {number} ttl - Time to live en milisegundos
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    enableMemoryCache(maxSize = 1000, ttl = 300000) {
        this.config.cache.type = 'memory';
        this.config.cache.maxSize = maxSize;
        this.config.cache.ttl = ttl;
        return this;
    }

    /**
     * Configura cliente HTTP
     * @param {Object} http - Configuración HTTP
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setHTTP(http) {
        this.config.http = { ...this.config.http, ...http };
        return this;
    }

    /**
     * Establece timeout para requests HTTP
     * @param {number} timeout - Timeout en milisegundos
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setHTTPTimeout(timeout) {
        this.config.http.timeout = timeout;
        return this;
    }

    /**
     * Configura base de datos
     * @param {Object} database - Configuración de base de datos
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setDatabase(database) {
        this.config.database = { ...this.config.database, ...database };
        return this;
    }

    /**
     * Fusiona configuración externa
     * @param {Object} externalConfig - Configuración externa
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    merge(externalConfig) {
        this.config = this.deepMerge(this.config, externalConfig);
        return this;
    }

    /**
     * Carga configuración desde archivo
     * @param {string} filePath - Ruta del archivo de configuración
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    loadFromFile(filePath) {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const ext = path.extname(filePath);
            let fileConfig;
            
            if (ext === '.json') {
                fileConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } else if (ext === '.js') {
                fileConfig = require(filePath);
            } else {
                throw new Error(`Unsupported config file format: ${ext}`);
            }
            
            return this.merge(fileConfig);
        } catch (error) {
            console.warn(`Could not load config from ${filePath}:`, error.message);
            return this;
        }
    }

    /**
     * Carga configuración desde variables de entorno
     * @param {string} prefix - Prefijo para variables de entorno
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    loadFromEnv(prefix = 'IPTV_') {
        const envConfig = {};
        
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith(prefix)) {
                const configKey = key.slice(prefix.length).toLowerCase();
                const configPath = configKey.split('_');
                
                this.setNestedValue(envConfig, configPath, this.parseEnvValue(value));
            }
        }
        
        return this.merge(envConfig);
    }

    /**
     * Aplica configuraciones por defecto
     * @returns {ConfigurationBuilder} Instancia del builder
     */
    setDefaults() {
        const defaults = {
            processing: {
                chunkSize: 1000,
                parallel: true,
                maxConcurrency: 4,
                enableOptimization: true
            },
            validation: {
                enableStreamValidation: false,
                streamTimeout: 5000,
                enableChannelValidation: true,
                strictMode: false
            },
            output: {
                csv: { enabled: true },
                m3u: { enabled: true },
                json: { enabled: false }
            },
            logging: {
                level: 'info',
                format: 'json',
                timestamp: true
            },
            cache: {
                type: 'memory',
                maxSize: 1000,
                ttl: 300000
            },
            http: {
                timeout: 10000,
                retries: 3,
                userAgent: 'IPTV-Library/1.0'
            }
        };
        
        return this.merge(defaults);
    }

    /**
     * Aplica configuraciones para desarrollo
     */
    applyDevelopmentDefaults() {
        this.merge({
            logging: { level: 'debug' },
            validation: { strictMode: false },
            cache: { ttl: 60000 }, // Cache más corto en desarrollo
            http: { timeout: 5000 }
        });
    }

    /**
     * Aplica configuraciones para producción
     */
    applyProductionDefaults() {
        this.merge({
            logging: { level: 'warn' },
            validation: { strictMode: true },
            processing: { maxConcurrency: 8 },
            cache: { ttl: 600000 }, // Cache más largo en producción
            http: { timeout: 15000, retries: 5 }
        });
    }

    /**
     * Aplica configuraciones para testing
     */
    applyTestDefaults() {
        this.merge({
            logging: { level: 'error' },
            validation: { enableStreamValidation: false },
            cache: { type: 'memory', maxSize: 100, ttl: 1000 },
            http: { timeout: 1000, retries: 1 },
            processing: { chunkSize: 10, maxConcurrency: 1 }
        });
    }

    /**
     * Valida la configuración construida
     * @returns {Object} Resultado de validación
     */
    validate() {
        const errors = [];
        
        // Validaciones básicas
        if (!this.config.environment) {
            errors.push('Environment is required');
        }
        
        if (this.config.processing?.chunkSize && this.config.processing.chunkSize < 1) {
            errors.push('Chunk size must be greater than 0');
        }
        
        if (this.config.http?.timeout && this.config.http.timeout < 0) {
            errors.push('HTTP timeout must be non-negative');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Construye la configuración final
     * @returns {Object} Configuración construida
     */
    build() {
        const validation = this.validate();
        
        if (!validation.isValid) {
            throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
        }
        
        return Object.freeze(this.deepClone(this.config));
    }

    /**
     * Fusión profunda de objetos
     * @param {Object} target - Objeto destino
     * @param {Object} source - Objeto fuente
     * @returns {Object} Objeto fusionado
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const [key, value] of Object.entries(source)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this.deepMerge(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }
        
        return result;
    }

    /**
     * Clonación profunda de objetos
     * @param {Object} obj - Objeto a clonar
     * @returns {Object} Objeto clonado
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Establece valor anidado en objeto
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
     * Parsea valor de variable de entorno
     * @param {string} value - Valor a parsear
     * @returns {*} Valor parseado
     */
    parseEnvValue(value) {
        // Intentar parsear como JSON
        try {
            return JSON.parse(value);
        } catch {
            // Si no es JSON válido, devolver como string
            return value;
        }
    }
}