/**
 * IPTV Library - Librería modular para procesamiento de datos IPTV
 * 
 * Esta librería proporciona una interfaz unificada para el procesamiento
 * de canales IPTV, incluyendo carga, validación, deduplicación y generación
 * de archivos de salida.
 * 
 * @module IPTVLibrary
 */

// Módulos de configuración
import { EnvLoader } from '../infrastructure/config/EnvLoader.js';
import TVAddonConfig from '../infrastructure/config/TVAddonConfig.js';

// Procesador principal
import { IPTVProcessor } from './core/iptv-processor.js';

// Servicios principales
import { IPTVDataLoader } from './services/data-loader.js';
import { ValidationService } from './services/validation.js';

// Sistema de plugins
import { PluginManager } from './plugins/index.js';

// Eventos
import { EventEmitter } from 'events';

/**
 * Clase principal de la librería IPTV
 * Orquesta todos los componentes y proporciona una interfaz unificada
 */
export class IPTVLibrary extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            autoInit: options.autoInit !== false,
            enableLogging: options.enableLogging !== false,
            enableMetrics: options.enableMetrics !== false,
            enableValidation: options.enableValidation !== false,
            chunkSize: options.chunkSize || 15,
            ...options
        };
        
        this.config = null;
        this.processor = null;
        this.dataLoader = null;
        this.validationService = null;
        this.pluginManager = null;
        
        // Estado interno
        this.initialized = false;
        this.processing = false;
        
        // Bind methods para evitar problemas de contexto
        this.process = this.process.bind(this);
        this.processComplete = this.processComplete.bind(this);
        this.initialize = this.initialize.bind(this);
        this.cleanup = this.cleanup.bind(this);
        
        // Auto-inicialización si está habilitada
        if (this.options.autoInit) {
            this.initialize().catch(error => {
                this.emit('error', error);
            });
        }
    }

    /**
     * Inicializa la librería y todos sus componentes
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            this.emit('initializing');

            // 1. Cargar y validar configuración
            if (this.options.enableLogging) {
                console.log('🔧 Inicializando librería IPTV...');
            }

            // Cargar variables de entorno si no están definidas
            if (!process.env.CHANNELS_SOURCE && !process.env.M3U_URL) {
                EnvLoader.getInstance();
            }

            this.config = TVAddonConfig.getInstance();

            // 2. Inicializar procesador principal
            this.processor = new IPTVProcessor({
                enableLogging: this.options.enableLogging,
                enableMetrics: this.options.enableMetrics,
                enableValidation: this.options.enableValidation,
                chunkSize: this.options.chunkSize
            });

            // 3. Inicializar servicios auxiliares
            this.dataLoader = new IPTVDataLoader(this.config);
            this.validationService = new ValidationService(this.config);

            // 4. Inicializar sistema de plugins
            this.pluginManager = new PluginManager();

            // 5. Registrar plugins built-in si están habilitados
            if (this.options.enablePlugins !== false) {
                await this._registerBuiltInPlugins();
            }

            this.initialized = true;
            this.emit('initialized');

            if (this.options.enableLogging) {
                console.log('✅ Librería IPTV inicializada correctamente');
            }

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Procesa canales IPTV usando el pipeline completo
     * @param {Object} processingOptions - Opciones específicas de procesamiento
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async process(processingOptions = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.processing) {
            throw new Error('Ya hay un procesamiento en curso');
        }

        this.processing = true;
        this.emit('processing-started');

        try {
            // Ejecutar el pipeline completo usando el procesador
            const result = await this.processor.process(processingOptions);
            
            this.emit('processing-completed', result);
            return result;

        } catch (error) {
            this.emit('processing-error', error);
            throw error;
        } finally {
            this.processing = false;
        }
    }

    /**
     * Método de conveniencia para procesamiento completo
     * Alias para process() que mantiene compatibilidad
     * @param {Object} options - Opciones de procesamiento
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async processComplete(options = {}) {
        return await this.process(options);
    }

    /**
     * Execute the complete processing pipeline
     * @param {Object} context - Processing context
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processing result
     * @private
     */
    async _executeProcessingPipeline(context, options) {
        // 1. Before Load Hook
        await this.pluginManager.executeHook('beforeLoad', context);

        // 2. Data Loading
        let loadResult = await this.pluginManager.executeHook('load', context);
        if (!loadResult.data) {
            loadResult.data = await this.dataLoader.load(options.source, {
                type: options.type,
                ...context.config
            });
        }

        // 3. After Load Hook
        loadResult = await this.pluginManager.executeHook('afterLoad', loadResult);

        // 4. Data Filtering (if configured)
        if (context.config.filters && context.config.filters.length > 0) {
            loadResult = await this.pluginManager.executeHook('beforeFilter', loadResult);
            loadResult = await this.pluginManager.executeHook('filter', loadResult);
            loadResult = await this.pluginManager.executeHook('afterFilter', loadResult);
        }

        // 5. Data Transformation (if configured)
        if (context.config.transformations && context.config.transformations.length > 0) {
            loadResult = await this.pluginManager.executeHook('beforeTransform', loadResult);
            loadResult = await this.pluginManager.executeHook('transform', loadResult);
            loadResult = await this.pluginManager.executeHook('afterTransform', loadResult);
        }

        // 6. Data Validation
        loadResult = await this.pluginManager.executeHook('beforeValidate', loadResult);
        
        let validationResult = await this.pluginManager.executeHook('validate', loadResult);
        if (!validationResult.metadata?.validated) {
            if (Array.isArray(validationResult.data)) {
                validationResult = await this.validationService.validateChannelBatch(validationResult.data);
            } else {
                validationResult = await this.validationService.validateChannel(validationResult.data);
            }
        }

        validationResult = await this.pluginManager.executeHook('afterValidate', validationResult);

        // 7. Output Generation
        validationResult = await this.pluginManager.executeHook('beforeOutput', validationResult);
        validationResult = await this.pluginManager.executeHook('output', validationResult);
        validationResult = await this.pluginManager.executeHook('afterOutput', validationResult);

        return validationResult;
    }

    /**
     * Register built-in plugins based on configuration
     * @param {Object} config - Configuration object
     * @private
     */
    async _registerBuiltInPlugins(config) {
        // Register caching plugin if enabled
        if (this.options.enableCaching || config.cache?.enabled) {
            await this.pluginManager.register(builtInPlugins.cachePlugin({
                ttl: config.cache?.ttl,
                maxSize: config.cache?.maxSize
            }));
        }

        // Register logging plugin if configured
        if (config.logging?.enabled) {
            await this.pluginManager.register(builtInPlugins.loggingPlugin({
                level: config.logging.level,
                logToFile: config.logging.logToFile,
                logFile: config.logging.logFile
            }));
        }

        // Register metrics plugin if enabled
        if (this.options.enableMetrics || config.metrics?.enabled) {
            await this.pluginManager.register(builtInPlugins.metricsPlugin({
                collectMemory: config.metrics?.collectMemory,
                collectTiming: config.metrics?.collectTiming
            }));
        }

        // Register data enrichment plugin if configured
        if (config.enrichment?.enabled) {
            await this.pluginManager.register(builtInPlugins.dataEnrichmentPlugin({
                enrichFunction: config.enrichment.customFunction,
                enrichmentData: config.enrichment.data,
                fields: config.enrichment.fields
            }));
        }

        // Register rate limiting plugin if configured
        if (config.rateLimit?.enabled) {
            await this.pluginManager.register(builtInPlugins.rateLimitPlugin({
                maxRequests: config.rateLimit.maxRequests,
                windowMs: config.rateLimit.windowMs
            }));
        }

        // Register error recovery plugin if configured
        if (config.errorRecovery?.enabled) {
            await this.pluginManager.register(builtInPlugins.errorRecoveryPlugin({
                maxRetries: config.errorRecovery.maxRetries,
                retryDelay: config.errorRecovery.retryDelay,
                exponentialBackoff: config.errorRecovery.exponentialBackoff
            }));
        }
    }

    /**
     * Generate unique processing ID
     * @returns {string}
     * @private
     */
    _generateProcessingId() {
        return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Registra un plugin personalizado
     * @param {Object} plugin - Plugin a registrar
     * @returns {Promise<void>}
     */
    async registerPlugin(plugin) {
        if (!this.pluginManager) {
            throw new Error('Plugin manager no inicializado');
        }
        
        await this.pluginManager.register(plugin);
        this.emit('plugin-registered', plugin);
    }

    /**
     * Obtiene la configuración actual
     * @returns {Object} Configuración actual
     */
    getConfig() {
        return this.config;
    }

    /**
     * Obtiene métricas del último procesamiento
     * @returns {Object} Métricas de rendimiento
     */
    getMetrics() {
        return this.processor?.metrics || {};
    }

    /**
     * Verifica si la librería está inicializada
     * @returns {boolean} Estado de inicialización
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Verifica si hay un procesamiento en curso
     * @returns {boolean} Estado de procesamiento
     */
    isProcessing() {
        return this.processing;
    }

    /**
     * Limpia recursos y cierra conexiones
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            this.emit('cleanup-started');

            if (this.pluginManager) {
                await this.pluginManager.cleanup();
            }

            if (this.dataLoader) {
                await this.dataLoader.cleanup();
            }

            if (this.validationService) {
                await this.validationService.cleanup();
            }

            this.initialized = false;
            this.processing = false;
            
            this.emit('cleanup-completed');

        } catch (error) {
            this.emit('cleanup-error', error);
            throw error;
        }
    }

    /**
     * Registra plugins built-in
     * @private
     */
    async _registerBuiltInPlugins() {
        // Aquí se pueden registrar plugins built-in si existen
        // Por ahora, mantenemos la funcionalidad básica
        if (this.options.enableLogging) {
            console.log('📦 Plugins built-in registrados');
        }
    }
}

/**
 * Factory para crear instancias de la librería IPTV
 * Proporciona diferentes configuraciones predefinidas
 */
export class IPTVLibraryFactory {
    /**
     * Crea una instancia estándar de la librería
     * @param {Object} options - Opciones de configuración
     * @returns {IPTVLibrary} Instancia de la librería
     */
    static createStandard(options = {}) {
        return new IPTVLibrary({
            enableLogging: true,
            enableMetrics: true,
            enableValidation: true,
            autoInit: true,
            ...options
        });
    }

    /**
     * Crea una instancia silenciosa (sin logging)
     * @param {Object} options - Opciones de configuración
     * @returns {IPTVLibrary} Instancia de la librería
     */
    static createSilent(options = {}) {
        return new IPTVLibrary({
            enableLogging: false,
            enableMetrics: false,
            enableValidation: true,
            autoInit: true,
            ...options
        });
    }

    /**
     * Crea una instancia para desarrollo
     * @param {Object} options - Opciones de configuración
     * @returns {IPTVLibrary} Instancia de la librería
     */
    static createDevelopment(options = {}) {
        return new IPTVLibrary({
            enableLogging: true,
            enableMetrics: true,
            enableValidation: false, // Más rápido para desarrollo
            autoInit: false, // Inicialización manual
            chunkSize: 5, // Chunks más pequeños para debugging
            ...options
        });
    }

    /**
     * Crea una instancia para producción
     * @param {Object} options - Opciones de configuración
     * @returns {IPTVLibrary} Instancia de la librería
     */
    static createProduction(options = {}) {
        return new IPTVLibrary({
            enableLogging: false,
            enableMetrics: true,
            enableValidation: true,
            autoInit: true,
            chunkSize: 20, // Chunks más grandes para eficiencia
            ...options
        });
    }

    /**
     * Crea una instancia personalizada
     * @param {Object} config - Configuración completa
     * @returns {IPTVLibrary} Instancia de la librería
     */
    static create(config = {}) {
        return new IPTVLibrary(config);
    }
}

// Exportaciones principales
export { IPTVProcessor } from './core/iptv-processor.js';
export { DataLoader } from './services/data-loader.js';
export { ValidationService } from './services/validation.js';
export { PluginManager } from './plugins/index.js';

// Exportación por defecto
export default IPTVLibrary;