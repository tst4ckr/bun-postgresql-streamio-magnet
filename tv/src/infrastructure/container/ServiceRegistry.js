/**
 * @fileoverview ServiceRegistry - Registro centralizado de servicios y sus dependencias
 * 
 * RESPONSABILIDAD PRINCIPAL: Definir y registrar todos los servicios del sistema con sus dependencias
 * 
 * Arquitectura de Registro:
 * - Definición declarativa de servicios
 * - Configuración de dependencias explícitas
 * - Factories para instanciación controlada
 * - Configuración centralizada por servicio
 * 
 * Flujo de registro:
 * 1. Import de clases de servicios
 * 2. Definición de factories
 * 3. Registro en contenedor
 * 4. Validación de dependencias
 * 
 * @author Sistema de Inyección de Dependencias
 * @version 1.0.0
 */

// Importaciones de servicios del sistema TV
import { StreamHealthService } from '../services/StreamHealthService.js';
import { HttpsToHttpConversionService } from '../services/HttpsToHttpConversionService.js';
import { StreamValidationService } from '../services/StreamValidationService.js';
import { BitelUidService } from '../services/BitelUidService.js';
import { IpExtractionService } from '../services/IpExtractionService.js';
import { IpLatencyValidationService } from '../services/IpLatencyValidationService.js';
import { EnhancedLoggerService } from '../services/EnhancedLoggerService.js';
import { OptimizedLoggerService } from '../services/OptimizedLoggerService.js';
import { MemoryOptimizationService } from '../services/MemoryOptimizationService.js';
import ProcessFlowControlService from '../services/ProcessFlowControlService.js';
import { M3UParserService } from '../parsers/M3UParserService.js';
import { ChannelDeduplicationService } from '../../domain/services/ChannelDeduplicationService.js';
import ContentFilterService from '../../domain/services/ContentFilterService.js';
import ValidatedChannelsCsvService from '../../domain/services/ValidatedChannelsCsvService.js';
import ChannelNameCleaningService from '../../domain/services/ChannelNameCleaningService.js';
import { BannedChannelsFilterService } from '../../domain/services/BannedChannelsFilterService.js';
import M3UChannelService from '../../application/M3UChannelService.js';
import LogoGenerationService from '../../services/LogoGenerationService.js';
import ArtworkGenerationService from '../../services/ArtworkGenerationService.js';
import GenreDetectionService from '../../services/GenreDetectionService.js';

/**
 * Registra todos los servicios del sistema en el contenedor
 * @param {ServiceContainer} container - Contenedor de servicios
 * @param {Object} config - Configuración global del sistema
 */
export function registerServices(container, config) {
  // ============================================================================
  // SERVICIOS BASE (sin dependencias externas)
  // ============================================================================

  // Logger optimizado - servicio base para logging con throttling y batching
  container.register('optimizedLogger', (deps, serviceConfig, logger) => {
    return new OptimizedLoggerService(serviceConfig);
  }, {
    dependencies: [],
    singleton: true,
    config: {
      level: config.logging?.level || 'info',
      enableConsole: config.logging?.enableConsole !== false,
      enableFile: config.logging?.enableFile || false,
      logFile: config.logging?.logFile || './logs/app.log',
      throttleMs: config.logging?.throttleMs || 100,
      batchSize: config.logging?.batchSize || 50,
      maxMemoryMB: config.logging?.maxMemoryMB || 10
    }
  });

  // Logger mejorado - servicio base para logging (legacy)
  container.register('enhancedLogger', (deps, serviceConfig, logger) => {
    return new EnhancedLoggerService(serviceConfig, null);
  }, {
    dependencies: [],
    singleton: true,
    config: {
      logLevel: config.logLevel || 'info',
      enableRequestLogging: config.enableRequestLogging || false,
      enablePerformanceMetrics: config.enablePerformanceMetrics || true,
      logFilePath: config.logFilePath || null
    }
  });

  // Servicio de optimización de memoria - reduce duplicación de datos
  container.register('memoryOptimizationService', (deps, serviceConfig, logger) => {
    return new MemoryOptimizationService(serviceConfig, deps.optimizedLogger);
  }, {
    dependencies: ['optimizedLogger'],
    singleton: true,
    config: {
      enableStringPooling: config.memory?.enableStringPooling !== false,
      enableObjectPooling: config.memory?.enableObjectPooling !== false,
      maxStringPoolSize: config.memory?.maxStringPoolSize || 10000,
      maxObjectPoolSize: config.memory?.maxObjectPoolSize || 5000,
      enableWeakRefs: config.memory?.enableWeakRefs !== false,
      enableLazyLoading: config.memory?.enableLazyLoading !== false
    }
  });

  // Servicio de UID para canales Bitel
  container.register('bitelUidService', (deps, serviceConfig, logger) => {
    return new BitelUidService(serviceConfig, deps.optimizedLogger);
  }, {
    dependencies: ['optimizedLogger'],
    singleton: true,
    config: {
      enableBitelUid: config.enableBitelUid || false,
      bitelUidExpiration: config.bitelUidExpiration || 3600,
      bitelUidCacheSize: config.bitelUidCacheSize || 1000
    }
  });

  // Parser M3U - servicio stateless para parsing
  container.register('m3uParser', (deps, serviceConfig, logger) => {
    return new M3UParserService(serviceConfig);
  }, {
    dependencies: [],
    singleton: true,
    config: {
      filters: config.filters || {},
      enableStrictParsing: config.enableStrictParsing || false
    }
  });

  // Servicio de filtrado de contenido
  container.register('contentFilter', (deps, serviceConfig, logger) => {
    return new ContentFilterService(serviceConfig.filters);
  }, {
    dependencies: [],
    singleton: true,
    config: {
      filters: config.filters || {}
    }
  });

  // ============================================================================
  // SERVICIOS DE VALIDACIÓN Y SALUD
  // ============================================================================

  // Servicio de salud de streams - base para validaciones
  container.register('streamHealthService', (deps, serviceConfig, logger) => {
    return new StreamHealthService(serviceConfig, deps.optimizedLogger, {
      bitelUidService: deps.bitelUidService
    });
  }, {
    dependencies: ['optimizedLogger'],
    singleton: true,
    config: {
      validation: config.validation || {},
      streamValidationTimeout: config.streamValidationTimeout || 45,
      maxValidationRetries: config.maxValidationRetries || 3
    }
  });

  // Servicio de conversión HTTPS a HTTP
  container.register('httpsToHttpService', (deps, serviceConfig, logger) => {
    return new HttpsToHttpConversionService(
      serviceConfig,
      deps.streamHealthService,
      deps.optimizedLogger,
      {
        flowControlService: new ProcessFlowControlService(deps.optimizedLogger, {
          maxConcurrent: serviceConfig.httpsToHttp?.maxConcurrentConversions || 5,
          timeout: serviceConfig.httpsToHttp?.conversionTimeout || 15000
        })
      }
    );
  }, {
    dependencies: ['streamHealthService', 'optimizedLogger'],
    singleton: true,
    config: {
      enableHttpsToHttpConversion: config.enableHttpsToHttpConversion || false,
      HTTPS_TO_HTTP_CONCURRENCY: config.HTTPS_TO_HTTP_CONCURRENCY || 3,
      MEMORY_USAGE_THRESHOLD: config.MEMORY_USAGE_THRESHOLD || 70,
      validation: config.validation || {}
    }
  });

  // Servicio de validación de streams
  container.register('streamValidationService', (deps, serviceConfig, logger) => {
    return new StreamValidationService(serviceConfig, deps.optimizedLogger, {
      streamHealthService: deps.streamHealthService,
      httpsToHttpService: deps.httpsToHttpService,
      flowControlService: new ProcessFlowControlService(deps.optimizedLogger, {
        memoryThreshold: serviceConfig.MEMORY_USAGE_THRESHOLD || 70,
        cpuThreshold: 80,
        checkInterval: 2000,
        minConcurrency: 1,
        maxConcurrency: serviceConfig.STREAM_VALIDATION_GENERAL_CONCURRENCY || 5
      })
    });
  }, {
    dependencies: ['optimizedLogger', 'streamHealthService', 'httpsToHttpService'],
    singleton: true,
    config: {
      validation: config.validation || {},
      enableEarlyValidation: config.enableEarlyValidation || false,
      streamValidationConcurrency: config.streamValidationConcurrency || 5,
      MEMORY_USAGE_THRESHOLD: config.MEMORY_USAGE_THRESHOLD || 70,
      STREAM_VALIDATION_GENERAL_CONCURRENCY: config.STREAM_VALIDATION_GENERAL_CONCURRENCY || 5
    }
  });

  // ============================================================================
  // SERVICIOS DE PROCESAMIENTO DE DATOS
  // ============================================================================

  // Servicio de extracción de IPs
  container.register('ipExtractionService', (deps, serviceConfig, logger) => {
    return new IpExtractionService(serviceConfig, deps.optimizedLogger);
  }, {
    dependencies: ['optimizedLogger'],
    singleton: true,
    config: {
      enableIpExtraction: config.enableIpExtraction || false,
      ipExtractionConcurrency: config.ipExtractionConcurrency || 10
    }
  });

  // Servicio de validación de latencia por IP
  container.register('ipLatencyValidationService', (deps, serviceConfig, logger) => {
    return new IpLatencyValidationService(serviceConfig, deps.optimizedLogger);
  }, {
    dependencies: ['optimizedLogger'],
    singleton: true,
    config: {
      validation: config.validation || {},
      maxLatencyMs: config.maxLatencyMs || 50,
      pingTimeoutMs: config.pingTimeoutMs || 5000,
      pingRetries: config.pingRetries || 2,
      pingConcurrency: config.pingConcurrency || 5
    }
  });

  // Servicio de deduplicación de canales
  container.register('channelDeduplicationService', (deps, serviceConfig, logger) => {
    return new ChannelDeduplicationService(serviceConfig, deps.optimizedLogger);
  }, {
    dependencies: ['optimizedLogger'],
    singleton: true,
    config: {
      enableIntelligentDeduplication: config.enableIntelligentDeduplication || true,
      deduplicationStrategy: config.deduplicationStrategy || 'intelligent',
      nameSimilarityThreshold: config.nameSimilarityThreshold || 0.95,
      urlSimilarityThreshold: config.urlSimilarityThreshold || 0.98,
      enableHdUpgrade: config.enableHdUpgrade !== false,
      preserveSourcePriority: config.preserveSourcePriority !== false
    }
  });

  // ============================================================================
  // SERVICIOS DE APLICACIÓN
  // ============================================================================

  // Servicio de limpieza de nombres de canales
  container.register('channelNameCleaningService', (deps, serviceConfig, logger) => {
    return new ChannelNameCleaningService();
  }, {
    dependencies: [],
    singleton: true,
    config: {}
  });

  // Servicio de filtrado de canales baneados
  container.register('bannedChannelsFilterService', (deps, serviceConfig, logger) => {
    return new BannedChannelsFilterService();
  }, {
    dependencies: [],
    singleton: true,
    config: {}
  });

  // Servicio de generación de CSV validado
  container.register('validatedChannelsCsvService', (deps, serviceConfig, logger) => {
    return new ValidatedChannelsCsvService(serviceConfig, deps.optimizedLogger);
  }, {
    dependencies: ['optimizedLogger'],
    singleton: true,
    config: {
      outputPath: config.outputPath || './tv.csv',
      enableCsvGeneration: config.enableCsvGeneration !== false
    }
  });

  // Servicio de generación M3U
  container.register('m3uChannelService', (deps, serviceConfig, logger) => {
    return new M3UChannelService();
  }, {
    dependencies: [],
    singleton: true,
    config: {}
  });

  // Servicio de generación de logos
  container.register('logoGenerationService', (deps, serviceConfig, logger) => {
    return new LogoGenerationService();
  }, {
    dependencies: [],
    singleton: true,
    config: {}
  });

  // Servicio de generación de artwork (backgrounds y posters)
  container.register('artworkGenerationService', (deps, serviceConfig, logger) => {
    return new ArtworkGenerationService();
  }, {
    dependencies: [],
    singleton: true,
    config: {}
  });

  // Servicio de detección de géneros
  container.register('genreDetectionService', (deps, serviceConfig, logger) => {
    return new GenreDetectionService();
  }, {
    dependencies: [],
    singleton: true,
    config: {}
  });

  // Validar que no existan dependencias circulares
  container.validateDependencies();
  
  console.log('✅ Servicios registrados correctamente en el contenedor');
  console.log(`📊 Total de servicios: ${container.listServices().length}`);
}

export default registerServices;