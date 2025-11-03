/**
 * @fileoverview TVChannelProcessor - Librería para procesamiento de canales de TV
 * Encapsula toda la lógica de main.js en una interfaz reutilizable
 */

import { promises as fs } from 'fs';
import path from 'path';
import { ConfigurationManager } from './ConfigurationManager.js';
import ChannelRepositoryFactory from '../infrastructure/factories/ChannelRepositoryFactory.js';
import { ChannelDeduplicationService } from '../domain/services/ChannelDeduplicationService.js';
import { HttpsToHttpConversionService } from '../infrastructure/services/HttpsToHttpConversionService.js';
import { StreamValidationService } from '../infrastructure/services/StreamValidationService.js';
import ValidatedChannelsCsvService from '../domain/services/ValidatedChannelsCsvService.js';
import M3UChannelService from '../application/M3UChannelService.js';

/**
 * Procesador principal de canales de TV
 * Convierte el flujo de main.js en una librería reutilizable
 */
export class TVChannelProcessor {
    #config;
    #logger;
    #configManager;

    /**
     * Constructor del procesador
     * @param {Object|string} configSource - Configuración como objeto o ruta a archivo de configuración
     * @param {Object} options - Opciones adicionales
     * @param {Object} options.logger - Logger personalizado (opcional)
     * @param {boolean} options.silent - Ejecutar en modo silencioso (opcional)
     */
    constructor(configSource = null, options = {}) {
        this.#configManager = new ConfigurationManager();
        this.#config = this.#configManager.loadConfiguration(configSource);
        this.#logger = options.logger || this.#createDefaultLogger(options.silent);
        
        // Validar configuración
        this.#validateConfiguration();
    }

    /**
     * Procesa los canales de TV siguiendo el flujo completo
     * @returns {Promise<Object>} Resultado del procesamiento con estadísticas y rutas de archivos
     */
    async processChannels() {
        const startTime = Date.now();
        
        try {
            this.#logger.info('=== INICIANDO PROCESAMIENTO DE CANALES DE TV ===');
            
            // Paso 1: Inicializar servicios
            this.#logger.info('🔧 Inicializando servicios...');
            const services = await this.#initializeServices();
            this.#logger.info('✅ Servicios inicializados correctamente');

            // Paso 2: Cargar canales desde fuentes
            this.#logger.info('📡 Cargando canales desde fuentes...');
            const filteredChannels = await services.channelRepository.getAllChannels();
            this.#logger.info(`📊 Canales cargados y filtrados: ${filteredChannels.length}`);
            
            // Mostrar estadísticas de fuentes
            const sourceStats = this.#getSourceStatistics(filteredChannels);
            this.#logSourceStatistics(sourceStats);

            // Paso 3: Procesamiento paralelo (deduplicación, conversión, validación)
            this.#logger.info('🔄 Procesamiento paralelo (deduplicación, conversión, validación)...');
            const processedChannels = await this.#processChannelsParallel(filteredChannels, services);
            this.#logger.info('✅ Procesamiento paralelo completado');

            // Paso 4: Generar archivos de salida
            this.#logger.info('📊 Generando archivos de salida...');
            const outputFiles = await this.#generateOutputFiles(processedChannels, services);
            this.#logger.info('✅ Archivos generados correctamente');

            // Resultado final
            const endTime = Date.now();
            const result = {
                success: true,
                statistics: {
                    rawChannels: filteredChannels.length,
                    processedChannels: processedChannels.length,
                    processingTime: endTime - startTime,
                    sourceStats
                },
                outputFiles,
                channels: processedChannels
            };

            this.#logger.info('🎉 Procesamiento completado exitosamente');
            return result;

        } catch (error) {
            this.#logger.error('❌ Error en el procesamiento:', error.message);
            return {
                success: false,
                error: error.message,
                stack: error.stack,
                processingTime: Date.now() - startTime
            };
        }
    }

    /**
     * Inicializa todos los servicios necesarios
     * @private
     * @returns {Promise<Object>} Servicios inicializados
     */
    async #initializeServices() {
        const channelRepository = await ChannelRepositoryFactory.createRepository(this.#config, this.#logger);
        
        return {
            channelRepository,
            deduplicationService: new ChannelDeduplicationService(this.#config, this.#logger),
            httpsToHttpService: new HttpsToHttpConversionService(this.#config, this.#logger),
            streamValidationService: new StreamValidationService(this.#config, this.#logger),
            validatedChannelsCsvService: new ValidatedChannelsCsvService(this.#config, this.#logger),
            m3uService: new M3UChannelService()
        };
    }

    /**
     * Procesa los canales en paralelo (deduplicación, conversión, validación)
     * @private
     * @param {Array} channels - Canales a procesar
     * @param {Object} services - Servicios inicializados
     * @returns {Promise<Array>} Canales procesados
     */
    async #processChannelsParallel(channels, services) {
        const [
            deduplicatedResult,
            conversionResult,
            validationResult
        ] = await Promise.allSettled([
            // Deduplicación
            services.deduplicationService.deduplicateChannels(channels),
            
            // Conversión HTTPS a HTTP
            services.httpsToHttpService.processChannels(channels),
            
            // Validación de streams
            this.#config.validation?.enableStreamValidation 
                ? services.streamValidationService.validateChannelsParallel(channels, {
                    concurrency: 15,
                    maxBatchSize: 30,
                    showProgress: true
                  })
                : Promise.resolve({ validChannels: channels, invalidChannels: [], stats: {} })
        ]);

        // Procesar resultados y combinar
        let processedChannels = channels;

        // Aplicar deduplicación
        if (deduplicatedResult.status === 'fulfilled') {
            processedChannels = deduplicatedResult.value.channels;
            this.#logger.info(`🗑️ Duplicados eliminados: ${channels.length - processedChannels.length}`);
        } else {
            this.#logger.error(`❌ Error en deduplicación: ${deduplicatedResult.reason?.message}`);
        }

        // Aplicar conversión HTTPS->HTTP
        if (conversionResult.status === 'fulfilled') {
            const convertedChannels = conversionResult.value.processed;
            processedChannels = processedChannels.map(channel => {
                const converted = convertedChannels.find(c => c.id === channel.id);
                return converted || channel;
            });
            this.#logger.info(`🔄 Conversiones HTTPS→HTTP: ${conversionResult.value.stats.converted}`);
        } else {
            this.#logger.error(`❌ Error en conversión: ${conversionResult.reason?.message}`);
        }

        // Aplicar validación
        if (validationResult.status === 'fulfilled') {
            const { validChannels, invalidChannels } = validationResult.value;
            processedChannels = processedChannels.filter(channel => 
                validChannels.some(valid => valid.id === channel.id)
            );
            this.#logger.info(`📊 Canales validados: ${processedChannels.length} (${invalidChannels.length} inválidos)`);
        } else {
            this.#logger.error(`❌ Error en validación: ${validationResult.reason?.message}`);
        }

        return processedChannels;
    }

    /**
     * Genera los archivos de salida (CSV y M3U)
     * @private
     * @param {Array} channels - Canales procesados
     * @param {Object} services - Servicios inicializados
     * @returns {Promise<Object>} Rutas de archivos generados
     */
    async #generateOutputFiles(channels, services) {
        // Generar CSV
        const csvPath = await services.validatedChannelsCsvService.generateValidatedChannelsCsv(channels);
        
        // Generar M3U
        const dataDir = this.#config.csv?.outputDirectory || 'data';
        await this.#ensureDirectoryExists(dataDir);
        
        const standardM3U = await services.m3uService.generateM3UPlaylist({
            format: 'standard'
        }, channels);
        
        const m3uFilePath = path.join(dataDir, 'channels.m3u');
        await fs.writeFile(m3uFilePath, standardM3U, 'utf8');

        return {
            csvFile: csvPath,
            m3uFile: m3uFilePath
        };
    }

    /**
     * Obtiene estadísticas de fuentes de canales
     * @private
     * @param {Array} channels - Canales
     * @returns {Object} Estadísticas por fuente
     */
    #getSourceStatistics(channels) {
        const stats = {};
        channels.forEach(channel => {
            const source = channel.source || 'unknown';
            stats[source] = (stats[source] || 0) + 1;
        });
        return stats;
    }

    /**
     * Registra estadísticas de fuentes en el log
     * Optimizado para evitar logging excesivo en bucles
     * @private
     * @param {Object} sourceStats - Estadísticas por fuente
     */
    #logSourceStatistics(sourceStats) {
        // Verificar si el logging está habilitado antes de procesar
        if (!this.#logger.info || typeof this.#logger.info !== 'function') {
            return;
        }
        
        this.#logger.info('📊 Estadísticas por fuente:');
        
        // Optimización: construir mensaje completo en lugar de múltiples llamadas
        const sortedStats = Object.entries(sourceStats)
            .sort(([,a], [,b]) => b - a);
            
        // Batch logging: crear un solo mensaje en lugar de múltiples logs
        if (sortedStats.length <= 10) {
            // Para pocas fuentes, log individual es aceptable
            sortedStats.forEach(([source, count]) => {
                this.#logger.info(`   - ${source}: ${count} canales`);
            });
        } else {
            // Para muchas fuentes, crear mensaje consolidado
            const statsMessage = sortedStats
                .map(([source, count]) => `   - ${source}: ${count} canales`)
                .join('\n');
            this.#logger.info(statsMessage);
        }
    }

    /**
     * Asegura que un directorio existe
     * @private
     * @param {string} dirPath - Ruta del directorio
     */
    async #ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.mkdir(dirPath, { recursive: true });
                this.#logger.info(`📁 Directorio creado: ${dirPath}`);
            } else {
                throw error;
            }
        }
    }

    /**
     * Crea un logger por defecto
     * @private
     * @param {boolean} silent - Modo silencioso
     * @returns {Object} Logger
     */
    #createDefaultLogger(silent = false) {
        if (silent) {
            return {
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
                fatal: () => {}
            };
        }

        return {
            info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
            warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
            error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
            debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args),
            fatal: (msg, ...args) => console.error(`[FATAL] ${msg}`, ...args)
        };
    }

    /**
     * Valida la configuración cargada
     * @private
     */
    #validateConfiguration() {
        if (!this.#config) {
            throw new Error('Configuración no válida o no encontrada');
        }
        
        // Validaciones básicas
        if (!this.#config.dataSources) {
            throw new Error('Configuración de fuentes de datos requerida');
        }
    }

    /**
     * Obtiene la configuración actual
     * @returns {Object} Configuración
     */
    getConfiguration() {
        return { ...this.#config };
    }
}