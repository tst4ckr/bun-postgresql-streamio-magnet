/**
 * Validador de configuración del sistema IPTV
 * 
 * Proporciona validación robusta y detallada de todas las
 * configuraciones del sistema con mensajes de error claros.
 */

/**
 * Validador centralizado de configuración
 * Valida estructura, tipos y valores de la configuración del sistema
 */
export class ConfigurationValidator {
    constructor() {
        this.validationRules = this.initializeValidationRules();
    }

    /**
     * Valida una configuración completa
     * @param {Object} config - Configuración a validar
     * @returns {Object} Resultado de validación
     */
    async validate(config) {
        const errors = [];
        const warnings = [];
        
        try {
            // Validaciones estructurales
            this.validateStructure(config, errors);
            
            // Validaciones por módulo
            await this.validateEnvironment(config, errors, warnings);
            await this.validateSources(config, errors, warnings);
            await this.validateProcessing(config, errors, warnings);
            await this.validateValidation(config, errors, warnings);
            await this.validateOutput(config, errors, warnings);
            await this.validatePlugins(config, errors, warnings);
            await this.validateLogging(config, errors, warnings);
            await this.validateCache(config, errors, warnings);
            await this.validateHTTP(config, errors, warnings);
            await this.validateDatabase(config, errors, warnings);
            
            // Validaciones de coherencia entre módulos
            this.validateCoherence(config, errors, warnings);
            
        } catch (error) {
            errors.push(`Validation process failed: ${error.message}`);
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            summary: this.generateValidationSummary(config, errors, warnings)
        };
    }

    /**
     * Valida la estructura básica de la configuración
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     */
    validateStructure(config, errors) {
        if (!config || typeof config !== 'object') {
            errors.push('Configuration must be an object');
            return;
        }
        
        const requiredSections = ['environment'];
        for (const section of requiredSections) {
            if (!(section in config)) {
                errors.push(`Required configuration section '${section}' is missing`);
            }
        }
    }

    /**
     * Valida configuración de entorno
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validateEnvironment(config, errors, warnings) {
        const environment = config.environment;
        
        if (!environment) {
            errors.push('Environment is required');
            return;
        }
        
        const validEnvironments = ['development', 'production', 'test', 'staging'];
        if (!validEnvironments.includes(environment)) {
            errors.push(`Invalid environment '${environment}'. Valid options: ${validEnvironments.join(', ')}`);
        }
        
        // Advertencias específicas por entorno
        if (environment === 'production') {
            if (config.logging?.level === 'debug') {
                warnings.push('Debug logging enabled in production environment');
            }
            
            if (!config.validation?.strictMode) {
                warnings.push('Strict validation mode disabled in production');
            }
        }
    }

    /**
     * Valida configuración de fuentes de datos
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validateSources(config, errors, warnings) {
        const sources = config.sources || {};
        
        if (Object.keys(sources).length === 0) {
            errors.push('At least one data source must be configured');
            return;
        }
        
        // Validar fuente CSV
        if (sources.csv) {
            this.validateCSVSource(sources.csv, errors, warnings);
        }
        
        // Validar fuente M3U
        if (sources.m3u) {
            this.validateM3USource(sources.m3u, errors, warnings);
        }
        
        // Validar fuente API
        if (sources.api) {
            this.validateAPISource(sources.api, errors, warnings);
        }
        
        // Validar combinaciones de fuentes
        this.validateSourceCombinations(sources, errors, warnings);
    }

    /**
     * Valida fuente CSV
     * @param {Object} csvConfig - Configuración CSV
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateCSVSource(csvConfig, errors, warnings) {
        if (!csvConfig.path) {
            errors.push('CSV source requires a path');
            return;
        }
        
        if (typeof csvConfig.path !== 'string') {
            errors.push('CSV path must be a string');
        }
        
        // Validar opciones CSV
        if (csvConfig.delimiter && typeof csvConfig.delimiter !== 'string') {
            errors.push('CSV delimiter must be a string');
        }
        
        if (csvConfig.encoding && !this.isValidEncoding(csvConfig.encoding)) {
            errors.push(`Invalid CSV encoding: ${csvConfig.encoding}`);
        }
        
        // Advertencias
        if (!csvConfig.headers) {
            warnings.push('CSV headers not specified, auto-detection will be used');
        }
    }

    /**
     * Valida fuente M3U
     * @param {Object} m3uConfig - Configuración M3U
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateM3USource(m3uConfig, errors, warnings) {
        if (!m3uConfig.url) {
            errors.push('M3U source requires a URL');
            return;
        }
        
        if (!this.isValidURL(m3uConfig.url)) {
            errors.push('M3U URL is not valid');
        }
        
        // Validar opciones M3U
        if (m3uConfig.timeout && (typeof m3uConfig.timeout !== 'number' || m3uConfig.timeout < 0)) {
            errors.push('M3U timeout must be a non-negative number');
        }
        
        if (m3uConfig.retries && (typeof m3uConfig.retries !== 'number' || m3uConfig.retries < 0)) {
            errors.push('M3U retries must be a non-negative number');
        }
        
        // Advertencias
        if (m3uConfig.url.startsWith('http://')) {
            warnings.push('M3U URL uses HTTP instead of HTTPS');
        }
    }

    /**
     * Valida fuente API
     * @param {Object} apiConfig - Configuración API
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateAPISource(apiConfig, errors, warnings) {
        if (!apiConfig.endpoint) {
            errors.push('API source requires an endpoint');
            return;
        }
        
        if (!this.isValidURL(apiConfig.endpoint)) {
            errors.push('API endpoint is not a valid URL');
        }
        
        // Validar autenticación
        if (apiConfig.auth) {
            this.validateAPIAuth(apiConfig.auth, errors, warnings);
        }
        
        // Validar headers
        if (apiConfig.headers && typeof apiConfig.headers !== 'object') {
            errors.push('API headers must be an object');
        }
    }

    /**
     * Valida autenticación de API
     * @param {Object} authConfig - Configuración de autenticación
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateAPIAuth(authConfig, errors, warnings) {
        const validAuthTypes = ['bearer', 'basic', 'apikey'];
        
        if (!authConfig.type || !validAuthTypes.includes(authConfig.type)) {
            errors.push(`Invalid auth type. Valid options: ${validAuthTypes.join(', ')}`);
        }
        
        switch (authConfig.type) {
            case 'bearer':
                if (!authConfig.token) {
                    errors.push('Bearer auth requires a token');
                }
                break;
            case 'basic':
                if (!authConfig.username || !authConfig.password) {
                    errors.push('Basic auth requires username and password');
                }
                break;
            case 'apikey':
                if (!authConfig.key || !authConfig.header) {
                    errors.push('API key auth requires key and header name');
                }
                break;
        }
    }

    /**
     * Valida combinaciones de fuentes
     * @param {Object} sources - Configuración de fuentes
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateSourceCombinations(sources, errors, warnings) {
        const sourceCount = Object.keys(sources).length;
        
        if (sourceCount > 3) {
            warnings.push('Multiple data sources configured, ensure proper deduplication');
        }
        
        // Validar compatibilidad entre fuentes
        if (sources.csv && sources.m3u) {
            if (!sources.csv.channelIdField || !sources.m3u.channelIdField) {
                warnings.push('Channel ID fields should be specified for proper data merging');
            }
        }
    }

    /**
     * Valida configuración de procesamiento
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validateProcessing(config, errors, warnings) {
        const processing = config.processing || {};
        
        // Validar chunk size
        if (processing.chunkSize !== undefined) {
            if (typeof processing.chunkSize !== 'number' || processing.chunkSize < 1) {
                errors.push('Processing chunk size must be a positive number');
            } else if (processing.chunkSize > 10000) {
                warnings.push('Large chunk size may cause memory issues');
            }
        }
        
        // Validar concurrencia
        if (processing.maxConcurrency !== undefined) {
            if (typeof processing.maxConcurrency !== 'number' || processing.maxConcurrency < 1) {
                errors.push('Max concurrency must be a positive number');
            } else if (processing.maxConcurrency > 16) {
                warnings.push('High concurrency may overwhelm system resources');
            }
        }
        
        // Validar opciones booleanas
        const booleanOptions = ['parallel', 'enableOptimization', 'enableEnrichment'];
        for (const option of booleanOptions) {
            if (processing[option] !== undefined && typeof processing[option] !== 'boolean') {
                errors.push(`Processing option '${option}' must be a boolean`);
            }
        }
    }

    /**
     * Valida configuración de validación
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validateValidation(config, errors, warnings) {
        const validation = config.validation || {};
        
        // Validar timeout de stream
        if (validation.streamTimeout !== undefined) {
            if (typeof validation.streamTimeout !== 'number' || validation.streamTimeout < 0) {
                errors.push('Stream validation timeout must be a non-negative number');
            } else if (validation.streamTimeout > 30000) {
                warnings.push('High stream timeout may slow down processing');
            }
        }
        
        // Validar reglas de validación
        if (validation.rules) {
            this.validateValidationRules(validation.rules, errors, warnings);
        }
        
        // Validar opciones booleanas
        const booleanOptions = ['enableStreamValidation', 'enableChannelValidation', 'strictMode'];
        for (const option of booleanOptions) {
            if (validation[option] !== undefined && typeof validation[option] !== 'boolean') {
                errors.push(`Validation option '${option}' must be a boolean`);
            }
        }
    }

    /**
     * Valida reglas de validación personalizadas
     * @param {Object} rules - Reglas de validación
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateValidationRules(rules, errors, warnings) {
        if (typeof rules !== 'object') {
            errors.push('Validation rules must be an object');
            return;
        }
        
        for (const [ruleName, ruleConfig] of Object.entries(rules)) {
            if (typeof ruleConfig !== 'object') {
                errors.push(`Validation rule '${ruleName}' must be an object`);
                continue;
            }
            
            if (!ruleConfig.type) {
                errors.push(`Validation rule '${ruleName}' requires a type`);
            }
            
            const validRuleTypes = ['regex', 'length', 'range', 'custom'];
            if (ruleConfig.type && !validRuleTypes.includes(ruleConfig.type)) {
                errors.push(`Invalid rule type '${ruleConfig.type}' for rule '${ruleName}'`);
            }
        }
    }

    /**
     * Valida configuración de salida
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validateOutput(config, errors, warnings) {
        const output = config.output || {};
        
        // Verificar que al menos una salida esté habilitada
        const enabledOutputs = Object.entries(output).filter(([_, config]) => 
            config && config.enabled !== false
        );
        
        if (enabledOutputs.length === 0) {
            errors.push('At least one output format must be enabled');
        }
        
        // Validar cada formato de salida
        if (output.csv) {
            this.validateCSVOutput(output.csv, errors, warnings);
        }
        
        if (output.m3u) {
            this.validateM3UOutput(output.m3u, errors, warnings);
        }
        
        if (output.json) {
            this.validateJSONOutput(output.json, errors, warnings);
        }
    }

    /**
     * Valida salida CSV
     * @param {Object} csvOutput - Configuración de salida CSV
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateCSVOutput(csvOutput, errors, warnings) {
        if (csvOutput.path && !this.isValidPath(csvOutput.path)) {
            errors.push('Invalid CSV output path');
        }
        
        if (csvOutput.delimiter && typeof csvOutput.delimiter !== 'string') {
            errors.push('CSV output delimiter must be a string');
        }
        
        if (csvOutput.encoding && !this.isValidEncoding(csvOutput.encoding)) {
            errors.push(`Invalid CSV output encoding: ${csvOutput.encoding}`);
        }
    }

    /**
     * Valida salida M3U
     * @param {Object} m3uOutput - Configuración de salida M3U
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateM3UOutput(m3uOutput, errors, warnings) {
        if (m3uOutput.path && !this.isValidPath(m3uOutput.path)) {
            errors.push('Invalid M3U output path');
        }
        
        if (m3uOutput.template && typeof m3uOutput.template !== 'string') {
            errors.push('M3U template must be a string');
        }
    }

    /**
     * Valida salida JSON
     * @param {Object} jsonOutput - Configuración de salida JSON
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateJSONOutput(jsonOutput, errors, warnings) {
        if (jsonOutput.path && !this.isValidPath(jsonOutput.path)) {
            errors.push('Invalid JSON output path');
        }
        
        if (jsonOutput.indent !== undefined && (typeof jsonOutput.indent !== 'number' || jsonOutput.indent < 0)) {
            errors.push('JSON indent must be a non-negative number');
        }
    }

    /**
     * Valida configuración de plugins
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validatePlugins(config, errors, warnings) {
        const plugins = config.plugins || [];
        
        if (!Array.isArray(plugins)) {
            errors.push('Plugins configuration must be an array');
            return;
        }
        
        const validPlugins = [
            'deduplication', 'validation', 'genreDetection', 
            'logoGeneration', 'nameCleanup', 'streamTesting'
        ];
        
        for (const plugin of plugins) {
            if (typeof plugin !== 'string') {
                errors.push('Plugin names must be strings');
            } else if (!validPlugins.includes(plugin)) {
                warnings.push(`Unknown plugin '${plugin}' - ensure it's properly installed`);
            }
        }
        
        // Verificar dependencias entre plugins
        if (plugins.includes('validation') && !plugins.includes('deduplication')) {
            warnings.push('Validation plugin works better with deduplication plugin');
        }
    }

    /**
     * Valida configuración de logging
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validateLogging(config, errors, warnings) {
        const logging = config.logging || {};
        
        const validLevels = ['debug', 'info', 'warn', 'error'];
        if (logging.level && !validLevels.includes(logging.level)) {
            errors.push(`Invalid log level '${logging.level}'. Valid options: ${validLevels.join(', ')}`);
        }
        
        const validFormats = ['json', 'text', 'structured'];
        if (logging.format && !validFormats.includes(logging.format)) {
            errors.push(`Invalid log format '${logging.format}'. Valid options: ${validFormats.join(', ')}`);
        }
        
        if (logging.file && !this.isValidPath(logging.file)) {
            errors.push('Invalid log file path');
        }
    }

    /**
     * Valida configuración de cache
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validateCache(config, errors, warnings) {
        const cache = config.cache || {};
        
        const validTypes = ['memory', 'redis', 'file'];
        if (cache.type && !validTypes.includes(cache.type)) {
            errors.push(`Invalid cache type '${cache.type}'. Valid options: ${validTypes.join(', ')}`);
        }
        
        if (cache.maxSize !== undefined && (typeof cache.maxSize !== 'number' || cache.maxSize < 0)) {
            errors.push('Cache max size must be a non-negative number');
        }
        
        if (cache.ttl !== undefined && (typeof cache.ttl !== 'number' || cache.ttl < 0)) {
            errors.push('Cache TTL must be a non-negative number');
        }
    }

    /**
     * Valida configuración HTTP
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validateHTTP(config, errors, warnings) {
        const http = config.http || {};
        
        if (http.timeout !== undefined && (typeof http.timeout !== 'number' || http.timeout < 0)) {
            errors.push('HTTP timeout must be a non-negative number');
        }
        
        if (http.retries !== undefined && (typeof http.retries !== 'number' || http.retries < 0)) {
            errors.push('HTTP retries must be a non-negative number');
        }
        
        if (http.userAgent && typeof http.userAgent !== 'string') {
            errors.push('HTTP user agent must be a string');
        }
    }

    /**
     * Valida configuración de base de datos
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    async validateDatabase(config, errors, warnings) {
        const database = config.database || {};
        
        if (Object.keys(database).length === 0) {
            return; // Base de datos es opcional
        }
        
        if (database.type) {
            const validTypes = ['sqlite', 'postgresql', 'mysql'];
            if (!validTypes.includes(database.type)) {
                errors.push(`Invalid database type '${database.type}'. Valid options: ${validTypes.join(', ')}`);
            }
        }
        
        if (database.connectionString && typeof database.connectionString !== 'string') {
            errors.push('Database connection string must be a string');
        }
    }

    /**
     * Valida coherencia entre módulos
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     */
    validateCoherence(config, errors, warnings) {
        // Validar coherencia entre fuentes y validación
        if (config.sources?.m3u && config.validation?.enableStreamValidation === false) {
            warnings.push('M3U source configured but stream validation is disabled');
        }
        
        // Validar coherencia entre procesamiento y salida
        if (config.processing?.chunkSize && config.output) {
            const outputCount = Object.keys(config.output).length;
            if (config.processing.chunkSize < outputCount * 100) {
                warnings.push('Small chunk size with multiple outputs may impact performance');
            }
        }
        
        // Validar coherencia entre entorno y configuraciones
        if (config.environment === 'production') {
            if (config.logging?.level === 'debug') {
                warnings.push('Debug logging in production may impact performance');
            }
            
            if (config.cache?.ttl && config.cache.ttl < 60000) {
                warnings.push('Short cache TTL in production may increase load');
            }
        }
    }

    /**
     * Genera resumen de validación
     * @param {Object} config - Configuración
     * @param {string[]} errors - Array de errores
     * @param {string[]} warnings - Array de advertencias
     * @returns {Object} Resumen de validación
     */
    generateValidationSummary(config, errors, warnings) {
        return {
            environment: config.environment,
            sourcesConfigured: Object.keys(config.sources || {}).length,
            outputsConfigured: Object.keys(config.output || {}).length,
            pluginsConfigured: (config.plugins || []).length,
            errorsCount: errors.length,
            warningsCount: warnings.length,
            overallStatus: errors.length === 0 ? 'valid' : 'invalid'
        };
    }

    /**
     * Inicializa reglas de validación
     * @returns {Object} Reglas de validación
     */
    initializeValidationRules() {
        return {
            url: /^https?:\/\/.+/,
            path: /^[^<>:"|?*]+$/,
            encoding: ['utf8', 'utf-8', 'ascii', 'latin1', 'base64', 'hex']
        };
    }

    /**
     * Verifica si una URL es válida
     * @param {string} url - URL a verificar
     * @returns {boolean} True si es válida
     */
    isValidURL(url) {
        return this.validationRules.url.test(url);
    }

    /**
     * Verifica si una ruta es válida
     * @param {string} path - Ruta a verificar
     * @returns {boolean} True si es válida
     */
    isValidPath(path) {
        return this.validationRules.path.test(path);
    }

    /**
     * Verifica si una codificación es válida
     * @param {string} encoding - Codificación a verificar
     * @returns {boolean} True si es válida
     */
    isValidEncoding(encoding) {
        return this.validationRules.encoding.includes(encoding);
    }
}