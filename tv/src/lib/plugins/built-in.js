/**
 * Built-in Plugins for IPTV Library
 * 
 * Collection of pre-built plugins for common IPTV processing tasks.
 * These plugins provide essential functionality out of the box.
 * 
 * @module BuiltInPlugins
 */

/**
 * Cache plugin for data caching
 * @param {Object} options - Plugin options
 * @param {number} [options.ttl=300000] - Cache TTL in milliseconds
 * @param {number} [options.maxSize=1000] - Maximum cache size
 * @param {string} [options.strategy='lru'] - Cache strategy
 * @returns {Object} Plugin definition
 */
function cachePlugin(options = {}) {
    const config = {
        ttl: options.ttl || 300000, // 5 minutes
        maxSize: options.maxSize || 1000,
        strategy: options.strategy || 'lru',
        ...options
    };

    const cache = new Map();
    const timestamps = new Map();

    return {
        name: 'cache',
        version: '1.0.0',
        description: 'Data caching plugin with TTL and size limits',
        options: config,
        
        hooks: {
            beforeLoad: async function(context) {
                const cacheKey = this._generateCacheKey(context);
                const cached = cache.get(cacheKey);
                const timestamp = timestamps.get(cacheKey);
                
                if (cached && timestamp && (Date.now() - timestamp) < config.ttl) {
                    this.log('info', `Cache hit for key: ${cacheKey}`);
                    context.data = cached;
                    context.metadata.fromCache = true;
                    return context;
                }
                
                return context;
            },
            
            afterLoad: async function(context) {
                if (!context.metadata.fromCache && context.data) {
                    const cacheKey = this._generateCacheKey(context);
                    
                    // Implement LRU eviction if cache is full
                    if (cache.size >= config.maxSize) {
                        const oldestKey = cache.keys().next().value;
                        cache.delete(oldestKey);
                        timestamps.delete(oldestKey);
                    }
                    
                    cache.set(cacheKey, context.data);
                    timestamps.set(cacheKey, Date.now());
                    this.log('info', `Cached data for key: ${cacheKey}`);
                }
                
                return context;
            }
        },
        
        setup: async function(context) {
            context._generateCacheKey = function(ctx) {
                const source = ctx.config?.source || 'unknown';
                const params = JSON.stringify(ctx.config?.params || {});
                return `${source}:${Buffer.from(params).toString('base64')}`;
            };
        }
    };
}

/**
 * Logging plugin for comprehensive logging
 * @param {Object} options - Plugin options
 * @param {string} [options.level='info'] - Log level
 * @param {boolean} [options.logToFile=false] - Log to file
 * @param {string} [options.logFile] - Log file path
 * @returns {Object} Plugin definition
 */
function loggingPlugin(options = {}) {
    const config = {
        level: options.level || 'info',
        logToFile: options.logToFile || false,
        logFile: options.logFile || 'iptv-processing.log',
        includeTimestamp: options.includeTimestamp !== false,
        includeMetadata: options.includeMetadata !== false,
        ...options
    };

    const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
    const currentLevel = logLevels[config.level] || 2;

    return {
        name: 'logging',
        version: '1.0.0',
        description: 'Comprehensive logging plugin',
        options: config,
        
        hooks: {
            init: async function(context) {
                this.log('info', 'Logging plugin initialized', { config });
            },
            
            beforeLoad: async function(context) {
                if (currentLevel >= 2) {
                    this.log('info', 'Starting data load', {
                        source: context.config?.source,
                        timestamp: new Date().toISOString()
                    });
                }
                return context;
            },
            
            afterLoad: async function(context) {
                if (currentLevel >= 2) {
                    this.log('info', 'Data load completed', {
                        recordCount: Array.isArray(context.data) ? context.data.length : 1,
                        fromCache: context.metadata?.fromCache || false,
                        timestamp: new Date().toISOString()
                    });
                }
                return context;
            },
            
            beforeValidate: async function(context) {
                if (currentLevel >= 3) {
                    this.log('debug', 'Starting validation');
                }
                return context;
            },
            
            afterValidate: async function(context) {
                if (currentLevel >= 2) {
                    this.log('info', 'Validation completed', {
                        validRecords: context.metadata?.validRecords || 0,
                        invalidRecords: context.metadata?.invalidRecords || 0
                    });
                }
                return context;
            },
            
            error: async function(context) {
                this.log('error', 'Processing error occurred', {
                    error: context.error?.message,
                    hook: context.hook,
                    plugin: context.plugin,
                    timestamp: new Date().toISOString()
                });
                return context;
            }
        }
    };
}

/**
 * Metrics plugin for performance monitoring
 * @param {Object} options - Plugin options
 * @param {boolean} [options.collectMemory=true] - Collect memory metrics
 * @param {boolean} [options.collectTiming=true] - Collect timing metrics
 * @returns {Object} Plugin definition
 */
function metricsPlugin(options = {}) {
    const config = {
        collectMemory: options.collectMemory !== false,
        collectTiming: options.collectTiming !== false,
        ...options
    };

    const metrics = {
        startTime: null,
        endTime: null,
        memoryUsage: {},
        timings: {},
        counters: {}
    };

    return {
        name: 'metrics',
        version: '1.0.0',
        description: 'Performance monitoring and metrics collection',
        options: config,
        
        hooks: {
            init: async function(context) {
                metrics.startTime = Date.now();
                if (config.collectMemory) {
                    metrics.memoryUsage.start = process.memoryUsage();
                }
                this.log('info', 'Metrics collection started');
            },
            
            beforeLoad: async function(context) {
                if (config.collectTiming) {
                    metrics.timings.loadStart = Date.now();
                }
                return context;
            },
            
            afterLoad: async function(context) {
                if (config.collectTiming) {
                    metrics.timings.loadEnd = Date.now();
                    metrics.timings.loadDuration = metrics.timings.loadEnd - metrics.timings.loadStart;
                }
                
                metrics.counters.recordsLoaded = Array.isArray(context.data) ? context.data.length : 1;
                return context;
            },
            
            beforeValidate: async function(context) {
                if (config.collectTiming) {
                    metrics.timings.validateStart = Date.now();
                }
                return context;
            },
            
            afterValidate: async function(context) {
                if (config.collectTiming) {
                    metrics.timings.validateEnd = Date.now();
                    metrics.timings.validateDuration = metrics.timings.validateEnd - metrics.timings.validateStart;
                }
                
                metrics.counters.validRecords = context.metadata?.validRecords || 0;
                metrics.counters.invalidRecords = context.metadata?.invalidRecords || 0;
                return context;
            },
            
            cleanup: async function(context) {
                metrics.endTime = Date.now();
                metrics.timings.totalDuration = metrics.endTime - metrics.startTime;
                
                if (config.collectMemory) {
                    metrics.memoryUsage.end = process.memoryUsage();
                }
                
                this.log('info', 'Processing metrics', metrics);
                
                // Store metrics in context for external access
                context.metadata.metrics = { ...metrics };
                return context;
            }
        }
    };
}

/**
 * Data enrichment plugin for enhancing channel data
 * @param {Object} options - Plugin options
 * @param {Function} [options.enrichFunction] - Custom enrichment function
 * @param {Object} [options.enrichmentData] - Static enrichment data
 * @returns {Object} Plugin definition
 */
function dataEnrichmentPlugin(options = {}) {
    const config = {
        enrichFunction: options.enrichFunction,
        enrichmentData: options.enrichmentData || {},
        fields: options.fields || ['country', 'language', 'category'],
        ...options
    };

    return {
        name: 'data-enrichment',
        version: '1.0.0',
        description: 'Data enrichment and enhancement plugin',
        options: config,
        
        hooks: {
            afterLoad: async function(context) {
                if (!Array.isArray(context.data)) {
                    return context;
                }
                
                const enrichedData = [];
                
                for (const item of context.data) {
                    let enrichedItem = { ...item };
                    
                    // Apply custom enrichment function
                    if (config.enrichFunction) {
                        enrichedItem = await config.enrichFunction(enrichedItem, config.enrichmentData);
                    }
                    
                    // Apply default enrichments
                    enrichedItem = this._applyDefaultEnrichments(enrichedItem);
                    
                    enrichedData.push(enrichedItem);
                }
                
                context.data = enrichedData;
                context.metadata.enriched = true;
                
                this.log('info', `Enriched ${enrichedData.length} records`);
                return context;
            }
        },
        
        setup: async function(context) {
            context._applyDefaultEnrichments = function(item) {
                // Extract country from name or URL
                if (!item.country && item.name) {
                    const countryMatch = item.name.match(/\[([A-Z]{2})\]/);
                    if (countryMatch) {
                        item.country = countryMatch[1];
                    }
                }
                
                // Extract language from name
                if (!item.language && item.name) {
                    const langPatterns = {
                        'EN': /english|eng\b/i,
                        'ES': /spanish|español|esp\b/i,
                        'FR': /french|français|fra\b/i,
                        'DE': /german|deutsch|ger\b/i,
                        'IT': /italian|italiano|ita\b/i
                    };
                    
                    for (const [lang, pattern] of Object.entries(langPatterns)) {
                        if (pattern.test(item.name)) {
                            item.language = lang;
                            break;
                        }
                    }
                }
                
                // Extract category from name or group
                if (!item.category) {
                    const categoryPatterns = {
                        'Sports': /sport|football|soccer|basketball|tennis/i,
                        'News': /news|noticias|actualidad/i,
                        'Entertainment': /entertainment|variety|show/i,
                        'Movies': /movie|cinema|film/i,
                        'Kids': /kids|children|cartoon|infantil/i,
                        'Music': /music|radio|música/i
                    };
                    
                    const searchText = `${item.name} ${item.group || ''}`;
                    for (const [category, pattern] of Object.entries(categoryPatterns)) {
                        if (pattern.test(searchText)) {
                            item.category = category;
                            break;
                        }
                    }
                }
                
                return item;
            };
        }
    };
}

/**
 * Rate limiting plugin for API calls
 * @param {Object} options - Plugin options
 * @param {number} [options.maxRequests=100] - Max requests per window
 * @param {number} [options.windowMs=60000] - Time window in milliseconds
 * @returns {Object} Plugin definition
 */
function rateLimitPlugin(options = {}) {
    const config = {
        maxRequests: options.maxRequests || 100,
        windowMs: options.windowMs || 60000, // 1 minute
        ...options
    };

    const requests = [];

    return {
        name: 'rate-limit',
        version: '1.0.0',
        description: 'Rate limiting plugin for API calls',
        options: config,
        
        hooks: {
            beforeLoad: async function(context) {
                const now = Date.now();
                
                // Clean old requests
                const cutoff = now - config.windowMs;
                while (requests.length > 0 && requests[0] < cutoff) {
                    requests.shift();
                }
                
                // Check rate limit
                if (requests.length >= config.maxRequests) {
                    const waitTime = requests[0] + config.windowMs - now;
                    this.log('warn', `Rate limit exceeded, waiting ${waitTime}ms`);
                    
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    return this.hooks.beforeLoad.call(this, context);
                }
                
                // Record request
                requests.push(now);
                return context;
            }
        }
    };
}

/**
 * Error recovery plugin for handling failures
 * @param {Object} options - Plugin options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.retryDelay=1000] - Delay between retries
 * @returns {Object} Plugin definition
 */
function errorRecoveryPlugin(options = {}) {
    const config = {
        maxRetries: options.maxRetries || 3,
        retryDelay: options.retryDelay || 1000,
        exponentialBackoff: options.exponentialBackoff !== false,
        ...options
    };

    return {
        name: 'error-recovery',
        version: '1.0.0',
        description: 'Error recovery and retry plugin',
        options: config,
        
        hooks: {
            error: async function(context) {
                const retryCount = context.metadata.retryCount || 0;
                
                if (retryCount < config.maxRetries) {
                    const delay = config.exponentialBackoff 
                        ? config.retryDelay * Math.pow(2, retryCount)
                        : config.retryDelay;
                    
                    this.log('warn', `Retrying after error (attempt ${retryCount + 1}/${config.maxRetries})`, {
                        error: context.error?.message,
                        delay
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    context.metadata.retryCount = retryCount + 1;
                    context.metadata.shouldRetry = true;
                } else {
                    this.log('error', 'Max retries exceeded, giving up', {
                        error: context.error?.message,
                        retries: retryCount
                    });
                    context.metadata.shouldRetry = false;
                }
                
                return context;
            }
        }
    };
}

module.exports = {
    cachePlugin,
    loggingPlugin,
    metricsPlugin,
    dataEnrichmentPlugin,
    rateLimitPlugin,
    errorRecoveryPlugin
};