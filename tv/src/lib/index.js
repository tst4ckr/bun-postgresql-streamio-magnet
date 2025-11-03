/**
 * IPTV Processing Library
 * 
 * A comprehensive, modular library for IPTV channel data processing.
 * Provides unified API for loading, validating, transforming, and outputting IPTV data.
 * 
 * @module IPTVLibrary
 * @version 1.0.0
 */

// Core modules
const EventEmitter = require('./core/event-emitter');

// Configuration modules
const { ConfigurationBuilder } = require('./config/builder');
const { ConfigurationService } = require('./config/service');
const { ConfigurationValidator } = require('./config/validator');

// Service modules
const { DataLoader, IPTVDataLoader, DataLoaderFactory } = require('./services/data-loader');
const { ValidationService, ValidationServiceFactory } = require('./services/validation');

// Plugin system
const { PluginManager, IPTVPluginFactory } = require('./plugins');
const builtInPlugins = require('./plugins/built-in');

/**
 * Main IPTV Library class that orchestrates all components
 */
class IPTVLibrary {
    constructor(options = {}) {
        this.options = {
            autoInitialize: options.autoInitialize !== false,
            enablePlugins: options.enablePlugins !== false,
            enableMetrics: options.enableMetrics !== false,
            enableCaching: options.enableCaching !== false,
            ...options
        };

        // Initialize core components
        this.eventEmitter = new EventEmitter();
        this.configService = new ConfigurationService();
        this.pluginManager = new PluginManager({
            autoLoad: this.options.enablePlugins,
            strict: false
        });

        // Initialize services
        this.dataLoader = null;
        this.validationService = null;

        // State management
        this.initialized = false;
        this.processing = false;

        // Bind methods
        this.process = this.process.bind(this);
        this.initialize = this.initialize.bind(this);
        this.cleanup = this.cleanup.bind(this);

        // Auto-initialize if requested
        if (this.options.autoInitialize) {
            this.initialize().catch(error => {
                this.eventEmitter.emit('error', error);
            });
        }
    }

    /**
     * Initialize the library with configuration
     * @param {Object} config - Configuration object
     * @returns {Promise<void>}
     */
    async initialize(config = {}) {
        if (this.initialized) {
            return;
        }

        try {
            // Load and validate configuration
            await this.configService.load(config);
            const finalConfig = this.configService.getConfig();

            // Initialize services
            this.dataLoader = DataLoaderFactory.create('iptv', {
                config: finalConfig,
                eventEmitter: this.eventEmitter
            });

            this.validationService = ValidationServiceFactory.create('standard', {
                config: finalConfig,
                eventEmitter: this.eventEmitter
            });

            // Register built-in plugins if enabled
            if (this.options.enablePlugins) {
                await this._registerBuiltInPlugins(finalConfig);
            }

            // Initialize plugin system
            await this.pluginManager.initialize({
                config: finalConfig,
                services: {
                    dataLoader: this.dataLoader,
                    validationService: this.validationService,
                    configService: this.configService
                }
            });

            this.initialized = true;
            this.eventEmitter.emit('initialized', { config: finalConfig });

        } catch (error) {
            this.eventEmitter.emit('error', error);
            throw error;
        }
    }

    /**
     * Process IPTV data through the complete pipeline
     * @param {Object} options - Processing options
     * @param {string} options.source - Data source (file path, URL, or data)
     * @param {string} [options.type] - Source type (csv, m3u, api, auto)
     * @param {Object} [options.config] - Override configuration
     * @returns {Promise<Object>} Processing result
     */
    async process(options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.processing) {
            throw new Error('Processing is already in progress');
        }

        this.processing = true;
        const startTime = Date.now();

        try {
            // Prepare processing context
            const context = {
                config: { ...this.configService.getConfig(), ...options.config },
                services: {
                    dataLoader: this.dataLoader,
                    validationService: this.validationService,
                    configService: this.configService
                },
                data: null,
                metadata: {
                    source: options.source,
                    type: options.type || 'auto',
                    startTime,
                    processingId: this._generateProcessingId()
                }
            };

            this.eventEmitter.emit('processing:start', context.metadata);

            // Execute processing pipeline with plugin hooks
            const result = await this._executeProcessingPipeline(context, options);

            // Finalize result
            const endTime = Date.now();
            const finalResult = {
                success: true,
                data: result.data,
                metadata: {
                    ...result.metadata,
                    endTime,
                    duration: endTime - startTime,
                    recordCount: Array.isArray(result.data) ? result.data.length : 1
                }
            };

            this.eventEmitter.emit('processing:complete', finalResult);
            return finalResult;

        } catch (error) {
            const errorResult = {
                success: false,
                error: error.message,
                metadata: {
                    source: options.source,
                    type: options.type,
                    startTime,
                    endTime: Date.now(),
                    duration: Date.now() - startTime
                }
            };

            this.eventEmitter.emit('processing:error', { error, result: errorResult });
            
            // Execute error recovery if available
            await this.pluginManager.executeHook('error', {
                ...context,
                error
            });

            throw error;
        } finally {
            this.processing = false;
        }
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
     * Register a custom plugin
     * @param {Object|Function} plugin - Plugin definition or factory
     * @param {Object} options - Plugin options
     * @returns {Promise<void>}
     */
    async registerPlugin(plugin, options = {}) {
        return await this.pluginManager.register(plugin, options);
    }

    /**
     * Unregister a plugin
     * @param {string} pluginName - Plugin name
     * @returns {Promise<void>}
     */
    async unregisterPlugin(pluginName) {
        return await this.pluginManager.unregister(pluginName);
    }

    /**
     * Get library statistics
     * @returns {Object}
     */
    getStats() {
        return {
            initialized: this.initialized,
            processing: this.processing,
            config: this.configService.getStats(),
            plugins: this.pluginManager.getStats(),
            events: this.eventEmitter.getStats()
        };
    }

    /**
     * Get current configuration
     * @returns {Object}
     */
    getConfig() {
        return this.configService.getConfig();
    }

    /**
     * Update configuration
     * @param {Object} config - New configuration
     * @returns {Promise<void>}
     */
    async updateConfig(config) {
        await this.configService.load(config);
        this.eventEmitter.emit('config:updated', config);
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener
     */
    on(event, listener) {
        this.eventEmitter.on(event, listener);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener
     */
    off(event, listener) {
        this.eventEmitter.off(event, listener);
    }

    /**
     * Cleanup library resources
     * @returns {Promise<void>}
     */
    async cleanup() {
        if (this.processing) {
            throw new Error('Cannot cleanup while processing');
        }

        try {
            // Cleanup plugins
            await this.pluginManager.cleanup();

            // Cleanup services
            if (this.dataLoader && typeof this.dataLoader.cleanup === 'function') {
                await this.dataLoader.cleanup();
            }

            if (this.validationService && typeof this.validationService.cleanup === 'function') {
                await this.validationService.cleanup();
            }

            // Cleanup event emitter
            this.eventEmitter.destroy();

            this.initialized = false;
            console.log('IPTV Library cleaned up successfully');

        } catch (error) {
            console.error('Error during cleanup:', error);
            throw error;
        }
    }
}

/**
 * Factory for creating IPTV Library instances
 */
class IPTVLibraryFactory {
    /**
     * Create a standard IPTV library instance
     * @param {Object} options - Library options
     * @returns {IPTVLibrary}
     */
    static create(options = {}) {
        return new IPTVLibrary(options);
    }

    /**
     * Create a minimal IPTV library instance (no plugins)
     * @param {Object} options - Library options
     * @returns {IPTVLibrary}
     */
    static createMinimal(options = {}) {
        return new IPTVLibrary({
            ...options,
            enablePlugins: false,
            enableMetrics: false,
            enableCaching: false
        });
    }

    /**
     * Create a full-featured IPTV library instance
     * @param {Object} options - Library options
     * @returns {IPTVLibrary}
     */
    static createFull(options = {}) {
        return new IPTVLibrary({
            ...options,
            enablePlugins: true,
            enableMetrics: true,
            enableCaching: true,
            autoInitialize: true
        });
    }

    /**
     * Create a testing-optimized IPTV library instance
     * @param {Object} options - Library options
     * @returns {IPTVLibrary}
     */
    static createForTesting(options = {}) {
        return new IPTVLibrary({
            ...options,
            enablePlugins: false,
            enableMetrics: false,
            enableCaching: false,
            autoInitialize: false
        });
    }
}

// Export main classes and utilities
module.exports = {
    // Main library
    IPTVLibrary,
    IPTVLibraryFactory,

    // Core components
    EventEmitter,

    // Configuration
    ConfigurationBuilder,
    ConfigurationService,
    ConfigurationValidator,

    // Services
    DataLoader,
    IPTVDataLoader,
    DataLoaderFactory,
    ValidationService,
    ValidationServiceFactory,

    // Plugin system
    PluginManager,
    IPTVPluginFactory,
    builtInPlugins,

    // Convenience exports
    createLibrary: IPTVLibraryFactory.create,
    createMinimalLibrary: IPTVLibraryFactory.createMinimal,
    createFullLibrary: IPTVLibraryFactory.createFull,
    createTestingLibrary: IPTVLibraryFactory.createForTesting
};