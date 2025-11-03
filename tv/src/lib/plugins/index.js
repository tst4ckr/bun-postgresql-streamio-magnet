/**
 * IPTV Plugin System
 * 
 * Provides a flexible and extensible plugin architecture for the IPTV library.
 * Inspired by Unplugin patterns, adapted for IPTV processing workflows.
 * 
 * @module PluginSystem
 */

/**
 * Plugin hook types available in the IPTV processing pipeline
 * @typedef {Object} PluginHooks
 * @property {Function} [init] - Called during plugin initialization
 * @property {Function} [beforeLoad] - Called before data loading
 * @property {Function} [load] - Custom data loading logic
 * @property {Function} [afterLoad] - Called after data loading
 * @property {Function} [beforeFilter] - Called before data filtering
 * @property {Function} [filter] - Custom filtering logic
 * @property {Function} [afterFilter] - Called after data filtering
 * @property {Function} [beforeTransform] - Called before data transformation
 * @property {Function} [transform] - Custom transformation logic
 * @property {Function} [afterTransform] - Called after data transformation
 * @property {Function} [beforeValidate] - Called before validation
 * @property {Function} [validate] - Custom validation logic
 * @property {Function} [afterValidate] - Called after validation
 * @property {Function} [beforeOutput] - Called before output generation
 * @property {Function} [output] - Custom output generation
 * @property {Function} [afterOutput] - Called after output generation
 * @property {Function} [error] - Called when errors occur
 * @property {Function} [cleanup] - Called during cleanup
 */

/**
 * Plugin context provided to plugin hooks
 * @typedef {Object} PluginContext
 * @property {Object} config - Current configuration
 * @property {Object} services - Available services
 * @property {Object} data - Current processing data
 * @property {Object} metadata - Processing metadata
 * @property {Function} emit - Event emitter function
 * @property {Function} log - Logging function
 * @property {Map} cache - Plugin-specific cache
 */

/**
 * Plugin definition structure
 * @typedef {Object} PluginDefinition
 * @property {string} name - Plugin name
 * @property {string} [version] - Plugin version
 * @property {string} [description] - Plugin description
 * @property {Array<string>} [dependencies] - Plugin dependencies
 * @property {Object} [options] - Plugin options
 * @property {PluginHooks} hooks - Plugin hooks
 * @property {Function} [setup] - Plugin setup function
 * @property {Function} [teardown] - Plugin teardown function
 */

/**
 * Plugin factory function type
 * @typedef {Function} PluginFactory
 * @param {Object} options - Plugin options
 * @param {Object} meta - Plugin metadata
 * @returns {PluginDefinition|Array<PluginDefinition>}
 */

/**
 * Core plugin manager for the IPTV system
 */
class PluginManager {
    constructor(options = {}) {
        this.options = {
            autoLoad: options.autoLoad !== false,
            strict: options.strict || false,
            maxPlugins: options.maxPlugins || 50,
            hookTimeout: options.hookTimeout || 30000,
            ...options
        };
        
        this.plugins = new Map();
        this.hooks = new Map();
        this.context = new Map();
        this.dependencies = new Map();
        this.loadOrder = [];
        this.initialized = false;
        
        this._initializeHooks();
    }

    /**
     * Initialize available hooks
     * @private
     */
    _initializeHooks() {
        const hookNames = [
            'init', 'beforeLoad', 'load', 'afterLoad',
            'beforeFilter', 'filter', 'afterFilter',
            'beforeTransform', 'transform', 'afterTransform',
            'beforeValidate', 'validate', 'afterValidate',
            'beforeOutput', 'output', 'afterOutput',
            'error', 'cleanup'
        ];
        
        hookNames.forEach(hookName => {
            this.hooks.set(hookName, []);
        });
    }

    /**
     * Register a plugin
     * @param {PluginDefinition|PluginFactory} plugin - Plugin to register
     * @param {Object} options - Plugin options
     * @returns {Promise<void>}
     */
    async register(plugin, options = {}) {
        if (this.plugins.size >= this.options.maxPlugins) {
            throw new Error(`Maximum number of plugins (${this.options.maxPlugins}) exceeded`);
        }

        let pluginDefinition;
        
        // Handle plugin factory
        if (typeof plugin === 'function') {
            const meta = {
                framework: 'iptv-library',
                version: '1.0.0',
                options: this.options
            };
            pluginDefinition = plugin(options, meta);
        } else {
            pluginDefinition = plugin;
        }

        // Handle array of plugins
        if (Array.isArray(pluginDefinition)) {
            for (const def of pluginDefinition) {
                await this._registerSingle(def, options);
            }
            return;
        }

        await this._registerSingle(pluginDefinition, options);
    }

    /**
     * Register a single plugin
     * @param {PluginDefinition} pluginDefinition - Plugin definition
     * @param {Object} options - Plugin options
     * @private
     */
    async _registerSingle(pluginDefinition, options) {
        if (!pluginDefinition.name) {
            throw new Error('Plugin must have a name');
        }

        if (this.plugins.has(pluginDefinition.name)) {
            if (this.options.strict) {
                throw new Error(`Plugin '${pluginDefinition.name}' is already registered`);
            }
            return;
        }

        // Validate plugin structure
        this._validatePlugin(pluginDefinition);

        // Check dependencies
        if (pluginDefinition.dependencies) {
            for (const dep of pluginDefinition.dependencies) {
                if (!this.plugins.has(dep)) {
                    throw new Error(`Plugin '${pluginDefinition.name}' depends on '${dep}' which is not registered`);
                }
            }
        }

        // Create plugin context
        const context = this._createPluginContext(pluginDefinition.name, options);
        this.context.set(pluginDefinition.name, context);

        // Setup plugin if setup function exists
        if (typeof pluginDefinition.setup === 'function') {
            await pluginDefinition.setup(context);
        }

        // Register hooks
        if (pluginDefinition.hooks) {
            this._registerHooks(pluginDefinition.name, pluginDefinition.hooks);
        }

        // Store plugin
        this.plugins.set(pluginDefinition.name, {
            ...pluginDefinition,
            options,
            registered: Date.now()
        });

        // Update load order
        this._updateLoadOrder(pluginDefinition.name, pluginDefinition.dependencies);

        console.log(`Plugin '${pluginDefinition.name}' registered successfully`);
    }

    /**
     * Validate plugin structure
     * @param {PluginDefinition} plugin - Plugin to validate
     * @private
     */
    _validatePlugin(plugin) {
        if (typeof plugin !== 'object' || plugin === null) {
            throw new Error('Plugin must be an object');
        }

        if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
            throw new Error('Plugin must have a valid name');
        }

        if (plugin.hooks && typeof plugin.hooks !== 'object') {
            throw new Error('Plugin hooks must be an object');
        }

        if (plugin.setup && typeof plugin.setup !== 'function') {
            throw new Error('Plugin setup must be a function');
        }

        if (plugin.teardown && typeof plugin.teardown !== 'function') {
            throw new Error('Plugin teardown must be a function');
        }
    }

    /**
     * Create plugin context
     * @param {string} pluginName - Plugin name
     * @param {Object} options - Plugin options
     * @returns {PluginContext}
     * @private
     */
    _createPluginContext(pluginName, options) {
        return {
            name: pluginName,
            options,
            config: {},
            services: {},
            data: {},
            metadata: {},
            cache: new Map(),
            emit: (event, data) => this._emitEvent(pluginName, event, data),
            log: (level, message, data) => this._log(pluginName, level, message, data),
            getPlugin: (name) => this.plugins.get(name),
            hasPlugin: (name) => this.plugins.has(name)
        };
    }

    /**
     * Register plugin hooks
     * @param {string} pluginName - Plugin name
     * @param {PluginHooks} hooks - Plugin hooks
     * @private
     */
    _registerHooks(pluginName, hooks) {
        for (const [hookName, hookFunction] of Object.entries(hooks)) {
            if (!this.hooks.has(hookName)) {
                console.warn(`Unknown hook '${hookName}' in plugin '${pluginName}'`);
                continue;
            }

            if (typeof hookFunction !== 'function') {
                console.warn(`Hook '${hookName}' in plugin '${pluginName}' is not a function`);
                continue;
            }

            this.hooks.get(hookName).push({
                plugin: pluginName,
                handler: hookFunction,
                priority: hooks.priority || 0
            });
        }

        // Sort hooks by priority
        for (const [hookName, hookList] of this.hooks.entries()) {
            hookList.sort((a, b) => b.priority - a.priority);
        }
    }

    /**
     * Update plugin load order based on dependencies
     * @param {string} pluginName - Plugin name
     * @param {Array<string>} dependencies - Plugin dependencies
     * @private
     */
    _updateLoadOrder(pluginName, dependencies = []) {
        // Remove plugin if already in order
        const index = this.loadOrder.indexOf(pluginName);
        if (index !== -1) {
            this.loadOrder.splice(index, 1);
        }

        // Find insertion point based on dependencies
        let insertIndex = this.loadOrder.length;
        for (const dep of dependencies) {
            const depIndex = this.loadOrder.indexOf(dep);
            if (depIndex !== -1 && depIndex < insertIndex) {
                insertIndex = depIndex + 1;
            }
        }

        this.loadOrder.splice(insertIndex, 0, pluginName);
    }

    /**
     * Execute a hook
     * @param {string} hookName - Hook name
     * @param {Object} context - Execution context
     * @returns {Promise<*>}
     */
    async executeHook(hookName, context = {}) {
        const hookList = this.hooks.get(hookName);
        if (!hookList || hookList.length === 0) {
            return context;
        }

        let result = context;

        for (const hook of hookList) {
            try {
                const pluginContext = this.context.get(hook.plugin);
                if (!pluginContext) {
                    continue;
                }

                // Update plugin context with current data
                Object.assign(pluginContext, {
                    config: context.config || {},
                    services: context.services || {},
                    data: context.data || {},
                    metadata: context.metadata || {}
                });

                // Execute hook with timeout
                const hookPromise = Promise.resolve(hook.handler.call(pluginContext, result, pluginContext));
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Hook '${hookName}' in plugin '${hook.plugin}' timed out`)), this.options.hookTimeout);
                });

                const hookResult = await Promise.race([hookPromise, timeoutPromise]);
                
                if (hookResult !== undefined) {
                    result = hookResult;
                }

            } catch (error) {
                console.error(`Error in hook '${hookName}' of plugin '${hook.plugin}':`, error);
                
                if (this.options.strict) {
                    throw error;
                }

                // Execute error hook
                await this.executeHook('error', {
                    ...context,
                    error,
                    hook: hookName,
                    plugin: hook.plugin
                });
            }
        }

        return result;
    }

    /**
     * Initialize all plugins
     * @param {Object} context - Initialization context
     * @returns {Promise<void>}
     */
    async initialize(context = {}) {
        if (this.initialized) {
            return;
        }

        // Execute init hooks in load order
        for (const pluginName of this.loadOrder) {
            const plugin = this.plugins.get(pluginName);
            if (plugin && plugin.hooks && plugin.hooks.init) {
                await this.executeHook('init', {
                    ...context,
                    plugin: pluginName
                });
            }
        }

        this.initialized = true;
        console.log(`Initialized ${this.plugins.size} plugins`);
    }

    /**
     * Unregister a plugin
     * @param {string} pluginName - Plugin name
     * @returns {Promise<void>}
     */
    async unregister(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) {
            return;
        }

        // Execute teardown if exists
        if (typeof plugin.teardown === 'function') {
            const context = this.context.get(pluginName);
            await plugin.teardown(context);
        }

        // Remove from hooks
        for (const [hookName, hookList] of this.hooks.entries()) {
            const filtered = hookList.filter(hook => hook.plugin !== pluginName);
            this.hooks.set(hookName, filtered);
        }

        // Remove from collections
        this.plugins.delete(pluginName);
        this.context.delete(pluginName);
        
        const orderIndex = this.loadOrder.indexOf(pluginName);
        if (orderIndex !== -1) {
            this.loadOrder.splice(orderIndex, 1);
        }

        console.log(`Plugin '${pluginName}' unregistered`);
    }

    /**
     * Get plugin information
     * @param {string} pluginName - Plugin name
     * @returns {Object|null}
     */
    getPlugin(pluginName) {
        return this.plugins.get(pluginName) || null;
    }

    /**
     * List all registered plugins
     * @returns {Array<Object>}
     */
    listPlugins() {
        return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
            name,
            version: plugin.version,
            description: plugin.description,
            dependencies: plugin.dependencies || [],
            registered: plugin.registered
        }));
    }

    /**
     * Check if plugin is registered
     * @param {string} pluginName - Plugin name
     * @returns {boolean}
     */
    hasPlugin(pluginName) {
        return this.plugins.has(pluginName);
    }

    /**
     * Get plugin statistics
     * @returns {Object}
     */
    getStats() {
        const hookStats = {};
        for (const [hookName, hookList] of this.hooks.entries()) {
            hookStats[hookName] = hookList.length;
        }

        return {
            totalPlugins: this.plugins.size,
            loadOrder: [...this.loadOrder],
            hooks: hookStats,
            initialized: this.initialized
        };
    }

    /**
     * Emit event from plugin
     * @param {string} pluginName - Plugin name
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @private
     */
    _emitEvent(pluginName, event, data) {
        console.log(`[${pluginName}] Event: ${event}`, data);
    }

    /**
     * Log message from plugin
     * @param {string} pluginName - Plugin name
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} data - Additional data
     * @private
     */
    _log(pluginName, level, message, data) {
        console.log(`[${pluginName}] ${level.toUpperCase()}: ${message}`, data || '');
    }

    /**
     * Cleanup all plugins
     * @returns {Promise<void>}
     */
    async cleanup() {
        // Execute cleanup hooks
        await this.executeHook('cleanup', {});

        // Unregister all plugins
        const pluginNames = Array.from(this.plugins.keys());
        for (const pluginName of pluginNames) {
            await this.unregister(pluginName);
        }

        this.initialized = false;
        console.log('Plugin system cleaned up');
    }
}

/**
 * Plugin factory for creating IPTV plugins
 */
class IPTVPluginFactory {
    /**
     * Create a data loader plugin
     * @param {Object} options - Plugin options
     * @returns {PluginDefinition}
     */
    static createDataLoader(options = {}) {
        return {
            name: 'data-loader',
            version: '1.0.0',
            description: 'Custom data loading plugin',
            hooks: {
                load: async function(context) {
                    if (options.customLoader) {
                        return await options.customLoader(context);
                    }
                    return context;
                }
            }
        };
    }

    /**
     * Create a data transformer plugin
     * @param {Object} options - Plugin options
     * @returns {PluginDefinition}
     */
    static createTransformer(options = {}) {
        return {
            name: 'transformer',
            version: '1.0.0',
            description: 'Data transformation plugin',
            hooks: {
                transform: async function(context) {
                    if (options.transformFunction) {
                        context.data = await options.transformFunction(context.data);
                    }
                    return context;
                }
            }
        };
    }

    /**
     * Create a validator plugin
     * @param {Object} options - Plugin options
     * @returns {PluginDefinition}
     */
    static createValidator(options = {}) {
        return {
            name: 'validator',
            version: '1.0.0',
            description: 'Data validation plugin',
            hooks: {
                validate: async function(context) {
                    if (options.validationRules) {
                        // Apply custom validation rules
                        const errors = [];
                        for (const rule of options.validationRules) {
                            const result = await rule(context.data);
                            if (!result.isValid) {
                                errors.push(result.error);
                            }
                        }
                        if (errors.length > 0) {
                            throw new Error(`Validation failed: ${errors.join(', ')}`);
                        }
                    }
                    return context;
                }
            }
        };
    }

    /**
     * Create an output formatter plugin
     * @param {Object} options - Plugin options
     * @returns {PluginDefinition}
     */
    static createOutputFormatter(options = {}) {
        return {
            name: 'output-formatter',
            version: '1.0.0',
            description: 'Output formatting plugin',
            hooks: {
                output: async function(context) {
                    if (options.formatFunction) {
                        return await options.formatFunction(context);
                    }
                    return context;
                }
            }
        };
    }
}

module.exports = {
    PluginManager,
    IPTVPluginFactory
};