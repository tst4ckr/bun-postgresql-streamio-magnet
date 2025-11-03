/**
 * Registro de servicios del sistema IPTV
 * 
 * Centraliza el registro de todos los servicios en el contenedor
 * de dependencias, organizados por categorías funcionales.
 */

/**
 * Registro centralizado de servicios para el contenedor DI
 * Organiza y registra todos los servicios del sistema por categorías
 */
export class ServiceRegistry {
    constructor(container, config, eventEmitter) {
        this.container = container;
        this.config = config;
        this.eventEmitter = eventEmitter;
    }

    /**
     * Registra todos los servicios del pipeline principal
     */
    registerPipelineServices() {
        // Servicio de configuración
        this.container.singleton('configurationService', () => {
            const { ConfigurationService } = require('../config/service.js');
            return new ConfigurationService(this.config, this.eventEmitter);
        });

        // Validador de configuración
        this.container.singleton('configurationValidator', () => {
            const { ConfigurationValidator } = require('../config/validator.js');
            return new ConfigurationValidator();
        });

        // Servicio de preparación de datos
        this.container.singleton('dataPreparationService', () => {
            const { DataPreparationService } = require('../services/data-preparation.js');
            return new DataPreparationService(this.config.dataPreparation || {});
        }, {
            dependencies: ['eventEmitter']
        });

        // Servicio de procesamiento por chunks
        this.container.singleton('chunkProcessingService', () => {
            const { ChunkProcessingService } = require('../services/chunk-processing.js');
            return new ChunkProcessingService(this.config.processing || {});
        });

        // Procesadores de chunks
        this.container.factory('chunkProcessors', (container) => {
            const processors = [];
            
            // Agregar procesadores según configuración
            if (this.config.processing?.enableOptimization) {
                const { OptimizationProcessor } = require('../services/processors/optimization.js');
                processors.push(new OptimizationProcessor());
            }
            
            if (this.config.processing?.enableEnrichment) {
                const { EnrichmentProcessor } = require('../services/processors/enrichment.js');
                processors.push(new EnrichmentProcessor());
            }
            
            return processors;
        });
    }

    /**
     * Registra servicios de carga y manejo de datos
     */
    registerDataServices() {
        // Servicio de carga de datos
        this.container.singleton('dataLoaderService', () => {
            const { DataLoaderService } = require('../services/data-loader.js');
            return new DataLoaderService(this.config.sources || {});
        }, {
            dependencies: ['eventEmitter']
        });

        // Servicio de filtrado
        this.container.singleton('filterService', () => {
            const { FilterService } = require('../services/filter.js');
            return new FilterService(this.config.filtering || {});
        });

        // Repositorio de canales
        this.container.singleton('channelRepository', () => {
            const { ChannelRepository } = require('../repositories/channel-repository.js');
            return new ChannelRepository(this.config.database || {});
        });

        // Cache de datos
        this.container.singleton('dataCache', () => {
            const { DataCache } = require('../services/cache.js');
            return new DataCache(this.config.cache || {});
        });
    }

    /**
     * Registra servicios de procesamiento core
     */
    registerCoreProcessingServices() {
        // Servicio de deduplicación
        this.container.singleton('deduplicationService', () => {
            const { DeduplicationService } = require('../services/deduplication.js');
            return new DeduplicationService(this.config.deduplication || {});
        }, {
            dependencies: ['eventEmitter', 'dataCache']
        });

        // Servicio de conversión
        this.container.singleton('conversionService', () => {
            const { ConversionService } = require('../services/conversion.js');
            return new ConversionService(this.config.conversion || {});
        }, {
            dependencies: ['eventEmitter']
        });

        // Servicio de normalización
        this.container.singleton('normalizationService', () => {
            const { NormalizationService } = require('../services/normalization.js');
            return new NormalizationService(this.config.normalization || {});
        });
    }

    /**
     * Registra servicios de validación
     */
    registerValidationServices() {
        // Servicio principal de validación
        this.container.singleton('validationService', () => {
            const { ValidationService } = require('../services/validation.js');
            return new ValidationService(this.config.validation || {});
        }, {
            dependencies: ['eventEmitter', 'validationRules']
        });

        // Reglas de validación
        this.container.factory('validationRules', () => {
            const { ValidationRules } = require('../services/validation/rules.js');
            return new ValidationRules(this.config.validation?.rules || {});
        });

        // Validadores específicos
        this.container.transient('streamValidator', () => {
            const { StreamValidator } = require('../services/validation/stream-validator.js');
            return new StreamValidator(this.config.validation?.stream || {});
        });

        this.container.transient('channelValidator', () => {
            const { ChannelValidator } = require('../services/validation/channel-validator.js');
            return new ChannelValidator(this.config.validation?.channel || {});
        });
    }

    /**
     * Registra servicios de salida y generación
     */
    registerOutputServices() {
        // Servicio principal de salida
        this.container.singleton('outputService', () => {
            const { OutputService } = require('../services/output.js');
            return new OutputService(this.config.output || {});
        }, {
            dependencies: ['eventEmitter', 'csvGenerator', 'm3uGenerator']
        });

        // Generadores específicos
        this.container.singleton('csvGenerator', () => {
            const { CSVGenerator } = require('../services/generators/csv-generator.js');
            return new CSVGenerator(this.config.output?.csv || {});
        });

        this.container.singleton('m3uGenerator', () => {
            const { M3UGenerator } = require('../services/generators/m3u-generator.js');
            return new M3UGenerator(this.config.output?.m3u || {});
        });

        this.container.singleton('jsonGenerator', () => {
            const { JSONGenerator } = require('../services/generators/json-generator.js');
            return new JSONGenerator(this.config.output?.json || {});
        });

        // Servicio de archivos
        this.container.singleton('fileService', () => {
            const { FileService } = require('../services/file.js');
            return new FileService(this.config.files || {});
        });
    }

    /**
     * Registra servicios de utilidades y herramientas
     */
    registerUtilityServices() {
        // Emisor de eventos
        this.container.singleton('eventEmitter', this.eventEmitter);

        // Logger
        this.container.singleton('logger', () => {
            const { Logger } = require('../utils/logger.js');
            return new Logger(this.config.logging || {});
        });

        // Métricas y monitoreo
        this.container.singleton('metricsService', () => {
            const { MetricsService } = require('../services/metrics.js');
            return new MetricsService(this.config.metrics || {});
        }, {
            dependencies: ['eventEmitter']
        });

        // Servicio de HTTP para APIs externas
        this.container.singleton('httpService', () => {
            const { HttpService } = require('../services/http.js');
            return new HttpService(this.config.http || {});
        });
    }

    /**
     * Registra servicios específicos del dominio IPTV
     */
    registerDomainServices() {
        // Servicio de detección de géneros
        this.container.singleton('genreDetectionService', () => {
            const { GenreDetectionService } = require('../services/genre-detection.js');
            return new GenreDetectionService(this.config.genreDetection || {});
        });

        // Servicio de logos
        this.container.singleton('logoService', () => {
            const { LogoService } = require('../services/logo.js');
            return new LogoService(this.config.logos || {});
        }, {
            dependencies: ['httpService', 'fileService']
        });

        // Servicio de EPG (Electronic Program Guide)
        this.container.singleton('epgService', () => {
            const { EPGService } = require('../services/epg.js');
            return new EPGService(this.config.epg || {});
        }, {
            dependencies: ['httpService', 'dataCache']
        });
    }

    /**
     * Registra todos los servicios del sistema
     */
    registerAllServices() {
        this.registerPipelineServices();
        this.registerDataServices();
        this.registerCoreProcessingServices();
        this.registerValidationServices();
        this.registerOutputServices();
        this.registerUtilityServices();
        this.registerDomainServices();
        
        // Registrar aliases comunes
        this.registerAliases();
        
        // Configurar interceptores
        this.setupInterceptors();
    }

    /**
     * Registra aliases para servicios comúnmente usados
     */
    registerAliases() {
        this.container.alias('config', 'configurationService');
        this.container.alias('events', 'eventEmitter');
        this.container.alias('cache', 'dataCache');
        this.container.alias('logger', 'logger');
        this.container.alias('metrics', 'metricsService');
        this.container.alias('http', 'httpService');
    }

    /**
     * Configura interceptores para servicios
     */
    setupInterceptors() {
        // Interceptor de logging para servicios críticos
        const criticalServices = [
            'validationService',
            'deduplicationService',
            'outputService'
        ];

        for (const serviceName of criticalServices) {
            this.container.intercept(serviceName, (instance, container) => {
                const logger = container.resolve('logger');
                
                // Proxy para logging automático
                return new Proxy(instance, {
                    get(target, prop) {
                        const value = target[prop];
                        
                        if (typeof value === 'function') {
                            return function(...args) {
                                logger.debug(`Calling ${serviceName}.${prop}`, { args });
                                
                                try {
                                    const result = value.apply(target, args);
                                    
                                    // Si es una promesa, manejar async
                                    if (result && typeof result.then === 'function') {
                                        return result.catch(error => {
                                            logger.error(`Error in ${serviceName}.${prop}`, { error, args });
                                            throw error;
                                        });
                                    }
                                    
                                    return result;
                                } catch (error) {
                                    logger.error(`Error in ${serviceName}.${prop}`, { error, args });
                                    throw error;
                                }
                            };
                        }
                        
                        return value;
                    }
                });
            });
        }

        // Interceptor de métricas
        this.container.intercept('metricsService', (instance, container) => {
            const eventEmitter = container.resolve('eventEmitter');
            
            // Auto-registrar métricas en eventos del sistema
            eventEmitter.on('*', (eventName, data) => {
                instance.recordEvent(eventName, data);
            });
            
            return instance;
        });
    }

    /**
     * Obtiene información de diagnóstico del registro
     */
    getDiagnostics() {
        return {
            containerDiagnostics: this.container.getDiagnostics(),
            registeredServices: this.container.getServiceNames(),
            configurationKeys: Object.keys(this.config)
        };
    }
}