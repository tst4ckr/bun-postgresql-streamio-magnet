/**
 * IPTV Processor Core - Encapsula toda la lógica principal de procesamiento IPTV
 * 
 * Este módulo centraliza el pipeline completo de procesamiento que anteriormente
 * estaba en main.js, siguiendo el patrón de separación de responsabilidades.
 * 
 * Pipeline: Configuración → Inicialización → Carga → Filtrado → Deduplicación → 
 *          Conversión → Validación → Procesamiento por chunks → Generación de archivos
 * 
 * @module IPTVProcessor
 */

import { EnvLoader } from '../../infrastructure/config/EnvLoader.js';
import TVAddonConfig from '../../infrastructure/config/TVAddonConfig.js';
import ChannelRepositoryFactory from '../../infrastructure/factories/ChannelRepositoryFactory.js';
import { ServiceContainer } from '../../infrastructure/container/ServiceContainer.js';
import { registerServices } from '../../infrastructure/container/ServiceRegistry.js';
import { BannedChannelsFilterService } from '../../domain/services/BannedChannelsFilterService.js';
import M3UChannelService from '../../application/M3UChannelService.js';
import ChannelNameCleaningService from '../../domain/services/ChannelNameCleaningService.js';
import LogoGenerationService from '../../services/LogoGenerationService.js';
import GenreDetectionService from '../../services/GenreDetectionService.js';
import ArtworkGenerationService from '../../services/ArtworkGenerationService.js';
import { getM3UOutputPath } from '../../domain/services/ValidatedChannelsCsvService_tools.js';
import { sanitizeTitle, isValidChannel, generateExtInf } from '../../infrastructure/services/M3UGeneratorService_tools.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Procesador principal de IPTV que implementa el pipeline completo
 */
export class IPTVProcessor {
    constructor(options = {}) {
        this.options = {
            enableLogging: options.enableLogging !== false,
            enableMetrics: options.enableMetrics !== false,
            enableValidation: options.enableValidation !== false,
            chunkSize: options.chunkSize || 15,
            ...options
        };
        
        this.logger = null;
        this.config = null;
        this.serviceContainer = null;
        this.channelRepository = null; // Repositorio único para toda la ejecución
        this.metrics = {
            startTime: null,
            phases: {}
        };
    }

    /**
     * Ejecuta el pipeline completo de procesamiento IPTV
     * @param {Object} processingOptions - Opciones específicas de procesamiento
     * @returns {Promise<Object>} Resultado del procesamiento con estadísticas
     */
    async process(processingOptions = {}) {
        this.metrics.startTime = Date.now();
        
        try {
            if (this.options.enableLogging) {
                console.log('=== GENERADOR DE TV.CSV Y PLAYLIST M3U ===');
                console.log('Iniciando proceso de generación automática...\n');
            }

            // FASE 1: CONFIGURACIÓN
            const configResult = await this._executePhase('configuration', () => this._loadConfiguration());
            
            // FASE 2: INICIALIZACIÓN
            const initResult = await this._executePhase('initialization', () => this._initializeServices());
            
            // FASE 3: CARGA DE DATOS
            const loadResult = await this._executePhase('dataLoading', () => this._loadChannelData());
            
            // FASE 4: PREPARACIÓN
            const prepResult = await this._executePhase('dataPreparation', () => this._prepareChannelData(loadResult.channels));
            
            // FASE 5: PROCESAMIENTO CORE
            const coreResult = await this._executePhase('coreProcessing', () => this._executeCoreProcessing(prepResult.channelsWithIds));
            
            // FASE 6: PROCESAMIENTO POR CHUNKS
            const enhancedResult = await this._executePhase('chunkProcessing', () => this._processChannelsInChunks(coreResult.validatedChannels));
            
            // FASE 7: GENERACIÓN DE ARCHIVOS
            const outputResult = await this._executePhase('fileGeneration', () => this._generateOutputFiles(enhancedResult.enhancedChannels));
            
            // FASE 8: RESUMEN FINAL
            const finalResult = this._generateFinalSummary({
                rawChannels: loadResult.channels.length,
                filteredChannels: loadResult.channels.length,
                uniqueChannels: coreResult.uniqueChannelsCount,
                convertedChannels: coreResult.convertedChannelsCount,
                validatedChannels: enhancedResult.enhancedChannels.length,
                csvPath: outputResult.csvPath,
                m3uPath: outputResult.m3uPath,
                processingTime: Date.now() - this.metrics.startTime
            });

            return finalResult;

        } catch (error) {
            if (this.options.enableLogging) {
                console.error('\n❌ ERROR EN EL PROCESO:');
                console.error(error.message);
                console.error('\nDetalles del error:');
                console.error(error.stack);
            }
            throw error;
        }
    }

    /**
     * FASE 1: Carga la configuración del sistema
     * @private
     */
    async _loadConfiguration() {
        if (this.options.enableLogging) {
            console.log('📋 Paso 1: Cargando configuración...');
        }
        
        // Cargar variables de entorno solo si no están ya definidas
        if (!process.env.CHANNELS_SOURCE && !process.env.M3U_URL) {
            EnvLoader.getInstance();
        }
        
        this.config = TVAddonConfig.getInstance();
        this.logger = this._createLogger();
        
        if (this.options.enableLogging) {
            console.log('✅ Configuración cargada correctamente\n');
        }
        
        return { config: this.config, logger: this.logger };
    }

    /**
     * FASE 2: Inicializa todos los servicios necesarios
     * @private
     */
    async _initializeServices() {
        if (this.options.enableLogging) {
            console.log('🔧 Paso 2: Inicializando servicios...');
        }
        
        // Crear contenedor de servicios y registrar dependencias
        this.serviceContainer = new ServiceContainer(this.logger);
        registerServices(this.serviceContainer, this.config);
        
        // Resolver servicios desde el contenedor
        const services = {
            // Crear repositorio de canales UNA SOLA VEZ y reutilizarlo
            channelRepository: await ChannelRepositoryFactory.createRepository(this.config, this.logger),
            deduplicationService: this.serviceContainer.resolve('channelDeduplicationService'),
            httpsToHttpService: this.serviceContainer.resolve('httpsToHttpService'),
            streamValidationService: this.serviceContainer.resolve('streamValidationService'),
            validatedChannelsCsvService: this.serviceContainer.resolve('validatedChannelsCsvService'),
            ipExtractionService: this.serviceContainer.resolve('ipExtractionService'),
            ipLatencyValidationService: this.serviceContainer.resolve('ipLatencyValidationService')
        };

        // Guardar referencia para evitar recrear el repositorio en otras fases
        this.channelRepository = services.channelRepository;
        
        if (this.options.enableLogging) {
            console.log('✅ Servicios inicializados correctamente desde contenedor IoC\n');
        }
        
        return services;
    }

    /**
     * FASE 3: Carga canales desde las fuentes configuradas
     * @private
     */
    async _loadChannelData() {
        if (this.options.enableLogging) {
            console.log('📡 Paso 3: Cargando canales desde fuentes...');
        }
        
        // Usar el repositorio ya inicializado en la fase 2 para evitar duplicaciones
        const channelRepository = this.channelRepository || await ChannelRepositoryFactory.createRepository(this.config, this.logger);
        const channels = await channelRepository.getAllChannels();
        
        if (this.options.enableLogging) {
            console.log(`📊 Canales cargados y filtrados: ${channels.length}`);
            
            // Estadísticas de origen
            const sourceStats = this._getSourceStatistics(channels);
            this._logSourceStatistics(sourceStats);
            console.log('');
        }
        
        return { channels };
    }

    /**
     * FASE 4: Prepara los datos asignando IDs únicos
     * @private
     */
    async _prepareChannelData(channels) {
        if (this.options.enableLogging) {
            console.log('🔧 Paso 5: Preparando datos para procesamiento...');
        }
        
        const channelsWithIds = this._assignUniqueIds(channels);
        
        if (this.options.enableLogging) {
            console.log(`✅ IDs únicos asignados a ${channelsWithIds.length} canales\n`);
        }
        
        return { channelsWithIds };
    }

    /**
     * FASE 5: Ejecuta el procesamiento core (deduplicación, conversión, validación)
     * @private
     */
    async _executeCoreProcessing(channelsWithIds) {
        if (this.options.enableLogging) {
            console.log('🔄 Paso 6: Procesamiento core paralelo (deduplicación, conversión, validación)...');
        }
        
        const services = {
            deduplicationService: this.serviceContainer.resolve('channelDeduplicationService'),
            httpsToHttpService: this.serviceContainer.resolve('httpsToHttpService'),
            streamValidationService: this.serviceContainer.resolve('streamValidationService')
        };
        
        let deduplicatedResult, conversionResult, validationResult;
        
        try {
            // Operaciones críticas con fail-fast
            const [deduplicationPromise, conversionPromise] = await Promise.all([
                this._executeDeduplication(services.deduplicationService, channelsWithIds),
                this._executeConversion(services.httpsToHttpService, channelsWithIds)
            ]);
            
            deduplicatedResult = { status: 'fulfilled', value: deduplicationPromise };
            conversionResult = { status: 'fulfilled', value: conversionPromise };
            
            // Operación opcional: Validación
            validationResult = await this._executeValidation(services.streamValidationService, channelsWithIds);
            
        } catch (criticalError) {
            if (this.options.enableLogging) {
                console.error('💥 ERROR CRÍTICO en procesamiento core - Sistema debe detenerse:', criticalError.message);
                console.error('🔧 Verifique la configuración de servicios y dependencias');
            }
            throw criticalError;
        }
        
        // Consolidar resultados
        const coreResults = this._processParallelResults(
            channelsWithIds,
            { deduplicatedResult, conversionResult, validationResult }
        );
        
        if (this.options.enableLogging) {
            console.log('✅ Procesamiento core completado\n');
        }
        
        return coreResults;
    }

    /**
     * FASE 6: Procesa canales en chunks para optimización
     * @private
     */
    async _processChannelsInChunks(validatedChannels) {
        if (this.options.enableLogging) {
            console.log('🔄 Paso 7: Procesamiento por chunks (nombres, géneros, logos)...');
        }
        
        const services = {
            nameCleaningService: new ChannelNameCleaningService(),
            genreDetectionService: new GenreDetectionService(),
            logoGenerationService: new LogoGenerationService(),
            artworkGenerationService: new ArtworkGenerationService()
        };
        
        const enhancedChannels = await this._processInChunks(validatedChannels, services);
        
        if (this.options.enableLogging) {
            console.log('✅ Procesamiento por chunks completado\n');
        }
        
        return { enhancedChannels };
    }

    /**
     * FASE 7: Genera los archivos de salida (CSV y M3U)
     * @private
     */
    async _generateOutputFiles(enhancedChannels) {
        if (this.options.enableLogging) {
            console.log('📊 Paso 8: Generando archivos de salida...');
        }
        
        const validatedChannelsCsvService = this.serviceContainer.resolve('validatedChannelsCsvService');
        
        // Generar CSV
        if (this.options.enableLogging) {
            console.log('   📝 Escribiendo archivo CSV...');
        }
        const csvPath = await validatedChannelsCsvService.generateValidatedChannelsCsv(enhancedChannels);
        
        // Verificar CSV
        if (!await this._fileExists(csvPath)) {
            throw new Error(`Error: El archivo CSV no se generó correctamente en ${csvPath}`);
        }
        
        if (this.options.enableLogging) {
            console.log(`   ✅ CSV completado y guardado: ${csvPath}`);
        }
        
        // Generar M3U
        if (this.options.enableLogging) {
            console.log('   📝 Escribiendo archivo M3U...');
        }
        
        const m3uService = new M3UChannelService();
        const orderedChannelsFromCsv = await validatedChannelsCsvService.getOrderedChannelsFromCsv(csvPath);
        const m3uPath = await this._generateM3UFiles(m3uService, orderedChannelsFromCsv);
        
        if (this.options.enableLogging) {
            console.log('   ✅ M3U completado y guardado\n');
        }
        
        return { csvPath, m3uPath };
    }

    /**
     * Ejecuta una fase del pipeline con métricas
     * @private
     */
    async _executePhase(phaseName, phaseFunction) {
        const phaseStart = Date.now();
        
        try {
            const result = await phaseFunction();
            this.metrics.phases[phaseName] = {
                duration: Date.now() - phaseStart,
                status: 'completed'
            };
            return result;
        } catch (error) {
            this.metrics.phases[phaseName] = {
                duration: Date.now() - phaseStart,
                status: 'failed',
                error: error.message
            };
            throw error;
        }
    }

    /**
     * Crea un logger optimizado basado en el entorno
     * @private
     */
    _createLogger() {
        const env = process.env.NODE_ENV?.toLowerCase() || 'development';
        const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
        
        const levelConfig = {
            production: { info: true, warn: true, error: true, debug: false, fatal: true },
            test: { info: false, warn: false, error: true, debug: false, fatal: true },
            development: { info: true, warn: true, error: true, debug: true, fatal: true }
        };
        
        const currentLevels = levelConfig[env] || levelConfig.development;
        
        if (logLevel === 'debug') {
            currentLevels.debug = true;
            currentLevels.info = true;
        } else if (logLevel === 'warn') {
            currentLevels.info = false;
            currentLevels.debug = false;
        } else if (logLevel === 'error') {
            currentLevels.info = false;
            currentLevels.warn = false;
            currentLevels.debug = false;
        }
        
        return {
            info: currentLevels.info ? (msg, ...args) => console.log(`[INFO] ${msg}`, ...args) : () => {},
            warn: currentLevels.warn ? (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args) : () => {},
            error: currentLevels.error ? (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args) : () => {},
            debug: currentLevels.debug ? (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args) : () => {},
            fatal: currentLevels.fatal ? (msg, ...args) => console.error(`[FATAL] ${msg}`, ...args) : () => {}
        };
    }

    /**
     * Obtiene estadísticas de fuentes de canales
     * @private
     */
    _getSourceStatistics(channels) {
        const stats = {};
        channels.forEach(channel => {
            const source = channel.source || 'unknown';
            stats[source] = (stats[source] || 0) + 1;
        });
        return stats;
    }

    /**
     * Registra estadísticas de fuentes en el log
     * @private
     */
    _logSourceStatistics(sourceStats) {
        console.log('📊 Estadísticas por fuente:');
        Object.entries(sourceStats)
            .sort(([,a], [,b]) => b - a)
            .forEach(([source, count]) => {
                console.log(`   - ${source}: ${count} canales`);
            });
    }

    /**
     * Asigna IDs únicos a canales que no los tengan
     * @private
     */
    _assignUniqueIds(channels) {
        return channels.map((channel, index) => {
            if (channel.constructor.name === 'Channel') {
                return {
                    id: channel.id || `channel_${Date.now()}_${index}`,
                    name: channel.name,
                    streamUrl: channel.streamUrl,
                    logo: channel.logo,
                    genre: channel.genre,
                    country: channel.country,
                    language: channel.language,
                    quality: channel.quality,
                    type: channel.type,
                    isActive: channel.isActive,
                    metadata: channel.metadata,
                    originalIndex: index
                };
            }
            
            return {
                ...channel,
                id: channel.id || `channel_${Date.now()}_${index}`,
                originalIndex: index
            };
        });
    }

    /**
     * Verifica si un archivo existe
     * @private
     */
    async _fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Genera el resumen final del procesamiento
     * @private
     */
    _generateFinalSummary(stats) {
        const processingTimeSeconds = (stats.processingTime / 1000).toFixed(2);
        
        if (this.options.enableLogging) {
            console.log('\n🎉 === PROCESO COMPLETADO EXITOSAMENTE ===');
            console.log('\n📊 Resumen del procesamiento:');
            console.log(`   📡 Canales originales: ${stats.rawChannels}`);
            console.log(`   🔍 Después del filtrado: ${stats.filteredChannels}`);
            console.log(`   🔄 Después de deduplicación: ${stats.uniqueChannels}`);
            console.log(`   🔄 Después de conversión: ${stats.convertedChannels}`);
            console.log(`   ✅ Canales validados finales: ${stats.validatedChannels}`);
            
            console.log('\n📄 Archivos generados:');
            console.log(`   📊 Archivo principal: ${stats.csvPath}`);
            console.log(`   📺 Playlist M3U: ${stats.m3uPath}`);
            
            console.log(`\n⏱️  Tiempo de procesamiento: ${processingTimeSeconds}s`);
            console.log('\n🚀 ¡Sistema listo para usar con Stremio!');
            console.log('💡 El archivo tv.csv contiene todos los canales validados y procesados.');
        }
        
        return {
            success: true,
            stats,
            files: {
                csv: stats.csvPath,
                m3u: stats.m3uPath
            },
            metrics: this.metrics
        };
    }

    // Métodos auxiliares que implementan la lógica específica de cada operación
    // Estos métodos encapsulan la lógica compleja de main.backup.js

    async _executeDeduplication(service, channels) {
        return await service.deduplicateChannels(channels).catch(error => {
            if (error.message?.includes('configuration') || error.message?.includes('service') || error.name === 'ConfigurationError') {
                console.error('❌ ERROR CRÍTICO en deduplicación - Interrumpiendo procesamiento:', error.message);
                throw error;
            }
            console.warn('⚠️  Error no crítico en deduplicación, continuando:', error.message);
            return { channels, stats: { duplicatesRemoved: 0 } };
        });
    }

    async _executeConversion(service, channels) {
        return await service.processChannels(channels).catch(error => {
            if (error.message?.includes('configuration') || error.message?.includes('service') || error.name === 'ConfigurationError') {
                console.error('❌ ERROR CRÍTICO en conversión - Interrumpiendo procesamiento:', error.message);
                throw error;
            }
            console.warn('⚠️  Error no crítico en conversión, continuando:', error.message);
            return { processed: channels, stats: { converted: 0, httpWorking: 0 } };
        });
    }

    async _executeValidation(service, channels) {
        try {
            const validationPromise = this.config.validation?.enableStreamValidation 
                ? await service.validateChannelsParallel(channels, {
                    concurrency: 15,
                    maxBatchSize: 30,
                    showProgress: true
                  })
                : { validChannels: channels, invalidChannels: [], stats: {} };
            
            return { status: 'fulfilled', value: validationPromise };
        } catch (validationError) {
            console.warn('⚠️  Error en validación (no crítico), continuando sin validación:', validationError.message);
            return { 
                status: 'rejected', 
                reason: validationError,
                fallback: { validChannels: channels, invalidChannels: [], stats: {} }
            };
        }
    }

    _processParallelResults(baseChannels, { deduplicatedResult, conversionResult, validationResult }) {
        let processedChannels = baseChannels;
        let uniqueChannelsCount = baseChannels.length;
        let convertedChannelsCount = baseChannels.length;
        
        // Procesamiento de deduplicación
        if (deduplicatedResult.status === 'fulfilled') {
            const uniqueChannels = deduplicatedResult.value.channels;
            const deduplicationStats = this._calculateDeduplicationStats(baseChannels.length, uniqueChannels.length);
            
            if (this.options.enableLogging) {
                console.log(`📊 Canales únicos: ${uniqueChannels.length} (${deduplicationStats.efficiency}% únicos)`);
                console.log(`🗑️  Duplicados eliminados: ${deduplicationStats.duplicatesRemoved}`);
            }
            
            processedChannels = uniqueChannels;
            uniqueChannelsCount = uniqueChannels.length;
        }

        // Procesamiento de conversión
        if (conversionResult.status === 'fulfilled') {
            const convertedChannels = conversionResult.value.processed;
            if (this.options.enableLogging) {
                console.log(`📊 Canales procesados para conversión: ${convertedChannels.length}`);
                console.log(`🔄 Conversiones HTTPS→HTTP: ${conversionResult.value.stats.converted}`);
                console.log(`✅ URLs HTTP funcionales: ${conversionResult.value.stats.httpWorking}`);
            }
            
            processedChannels = this._applyChannelUpdates(processedChannels, convertedChannels);
            convertedChannelsCount = processedChannels.length;
        }

        // Procesamiento de validación
        if (validationResult.status === 'fulfilled') {
            const { validChannels, invalidChannels, stats } = validationResult.value;
            
            processedChannels = processedChannels.filter(channel => 
                validChannels.some(valid => valid.id === channel.id)
            );
            
            if (this.options.enableLogging) {
                console.log(`📊 Canales validados: ${processedChannels.length} (${invalidChannels.length} inválidos)`);
                
                if (stats.processingTime) {
                    console.log(`⏱️  Tiempo de validación: ${(stats.processingTime/1000).toFixed(1)}s`);
                }
            }
        } else if (validationResult.fallback) {
            if (this.options.enableLogging) {
                console.warn(`⚠️  Usando fallback para validación: todos los canales marcados como válidos`);
            }
        }

        return {
            validatedChannels: processedChannels,
            uniqueChannelsCount,
            convertedChannelsCount
        };
    }

    _calculateDeduplicationStats(before, after) {
        return {
            beforeDedup: before,
            afterDedup: after,
            duplicatesRemoved: before - after,
            efficiency: ((after / before) * 100).toFixed(1)
        };
    }

    _applyChannelUpdates(baseChannels, updatedChannels) {
        return baseChannels.map(channel => {
            const updated = updatedChannels.find(c => c.id === channel.id);
            return updated || channel;
        });
    }

    async _processInChunks(channels, services) {
        const { nameCleaningService, genreDetectionService, logoGenerationService } = services;
        const CHUNK_SIZE = this.options.chunkSize;
        
        // Dividir canales en chunks
        const chunks = [];
        for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
            chunks.push(channels.slice(i, i + CHUNK_SIZE));
        }
        
        if (this.options.enableLogging) {
            console.log(`   📦 Procesando ${channels.length} canales en ${chunks.length} chunks de ${CHUNK_SIZE}`);
        }
        
        // Asegurar directorios de assets
        await logoGenerationService.ensureLogoDirectory();
        await services.artworkGenerationService.ensureBackgroundDirectory();
        await services.artworkGenerationService.ensurePosterDirectory();
        
        // Procesar chunks en paralelo
        const processedChunks = await Promise.all(
            chunks.map(async (chunk, chunkIndex) => {
                if (this.options.enableLogging) {
                    console.log(`   🔄 Procesando chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} canales)`);
                }
                
                let processedChunk = [...chunk];
                
                // 1. Limpieza de nombres
                processedChunk = await nameCleaningService.processChannelsInBatches(processedChunk);
                
                // 2. Detección de géneros
                const genreResults = genreDetectionService.processChannels(processedChunk);
                processedChunk = genreResults.channels;
                
                // 3. Generación de logos
                const channelsForLogos = processedChunk.map(channel => ({
                    id: channel.id,
                    name: channel.name || `Canal ${channel.originalIndex + 1}`
                }));
                
                const logoResults = await logoGenerationService.generateMultipleLogos(channelsForLogos);
                
                // 4. Generación de artwork (background y poster)
                const bgResults = await services.artworkGenerationService.generateMultipleBackgrounds(channelsForLogos, { concurrency: 4 });
                // Elegimos poster cuadrado por defecto; opcionalmente se puede cambiar a 'poster'
                const posterResults = await services.artworkGenerationService.generateMultiplePosters(channelsForLogos, { concurrency: 4, shape: 'square' });

                // 5. Integración de logos/background/poster
                const logoMap = new Map();
                logoResults.forEach(result => {
                    if (result.success && result.logoPath) {
                        logoMap.set(result.channelId, result.logoPath);
                    }
                });
                const bgMap = new Map();
                bgResults.forEach(result => {
                    if (result.success && result.backgroundPath) {
                        bgMap.set(result.channelId, result.backgroundPath);
                    }
                });
                const posterMap = new Map();
                posterResults.forEach(result => {
                    if (result.success && result.posterPath) {
                        posterMap.set(result.channelId, result.posterPath);
                    }
                });
                
                processedChunk.forEach(channel => {
                    const logoPath = logoMap.get(channel.id);
                    if (logoPath) {
                        const relativePath = path.relative(process.cwd(), logoPath).replace(/\\/g, '/');
                        channel.logo = relativePath;
                    }
                    const bgPath = bgMap.get(channel.id);
                    if (bgPath) {
                        const relBg = path.relative(process.cwd(), bgPath).replace(/\\/g, '/');
                        channel.background = relBg;
                    }
                    const posterPath = posterMap.get(channel.id);
                    if (posterPath) {
                        const relPoster = path.relative(process.cwd(), posterPath).replace(/\\/g, '/');
                        channel.poster = relPoster;
                    }
                });
                
                return {
                    channels: processedChunk,
                    stats: {
                        chunkIndex,
                        processed: processedChunk.length,
                        logosGenerated: logoResults.filter(r => r.success).length,
                        backgroundsGenerated: bgResults.filter(r => r.success).length,
                        postersGenerated: posterResults.filter(r => r.success).length,
                        genreStats: genreResults.stats
                    }
                };
            })
        );
        
        // Consolidar resultados
        const allProcessedChannels = processedChunks.flatMap(chunk => chunk.channels);
        
        // Estadísticas consolidadas
        const totalLogosGenerated = processedChunks.reduce((sum, chunk) => sum + chunk.stats.logosGenerated, 0);
        const totalBackgroundsGenerated = processedChunks.reduce((sum, chunk) => sum + (chunk.stats.backgroundsGenerated || 0), 0);
        const totalPostersGenerated = processedChunks.reduce((sum, chunk) => sum + (chunk.stats.postersGenerated || 0), 0);
        const cleaningMetrics = nameCleaningService.getMetrics();
        
        if (this.options.enableLogging) {
            console.log(`   ✅ Limpieza: ${cleaningMetrics.totalCleaned}/${cleaningMetrics.totalProcessed} nombres (${cleaningMetrics.cleaningRate}%)`);
            console.log(`   ✅ Logos: ${totalLogosGenerated}/${allProcessedChannels.length} generados`);
            console.log(`   ✅ Backgrounds: ${totalBackgroundsGenerated}/${allProcessedChannels.length} generados`);
            console.log(`   ✅ Posters: ${totalPostersGenerated}/${allProcessedChannels.length} generados`);
        }
        
        return allProcessedChannels;
    }

    async _generateM3UFiles(m3uService, validatedChannels) {
        try {
            console.log(`[DEBUG] _generateM3UFiles iniciado con ${validatedChannels?.length || 0} canales`);
            
            if (!validatedChannels || validatedChannels.length === 0) {
                throw new Error('No hay canales válidos para generar M3U');
            }

            // Obtener la ruta configurada desde variables de entorno
            const m3uFilePath = getM3UOutputPath(this.config);
            console.log(`[DEBUG] Ruta M3U: ${m3uFilePath}`);
            
            const dataDir = path.dirname(m3uFilePath);
            console.log(`[DEBUG] Directorio: ${dataDir}`);
            await this._ensureDirectoryExists(dataDir);

            console.log(`[DEBUG] Generando M3U con ${validatedChannels.length} canales...`);
            const standardM3U = await m3uService.generateM3UPlaylist({
                format: 'standard'
            }, validatedChannels);

            console.log(`[DEBUG] M3U generado, longitud: ${standardM3U?.length || 0} caracteres`);
            await fs.writeFile(m3uFilePath, standardM3U, 'utf8');
            console.log(`[DEBUG] Archivo M3U escrito en: ${m3uFilePath}`);
            
            if (!await this._fileExists(m3uFilePath)) {
                throw new Error(`Error: El archivo M3U no se escribió correctamente en ${m3uFilePath}`);
            }
            
            console.log(`[DEBUG] Archivo M3U verificado exitosamente`);
            
            // Generar archivos individuales .m3u8 por canal (ruta configurable desde app.conf)
            try {
                const perChannelDir = await this._generatePerChannelM3U8Files(validatedChannels, m3uFilePath);
                console.log(`[DEBUG] Archivos individuales .m3u8 generados en: ${perChannelDir}`);
            } catch (perFileError) {
                console.warn(`   ⚠️  No se pudieron generar algunos archivos .m3u8 individuales: ${perFileError.message}`);
            }

            return m3uFilePath;

        } catch (error) {
            console.error(`[DEBUG] Error en _generateM3UFiles:`, error);
            if (this.options.enableLogging) {
                console.error('   ❌ Error generando archivo M3U:', error.message);
            }
            throw error;
        }
    }

    /**
     * Genera archivos .m3u8 individuales por canal en data/m3u8
     * @private
     * @param {Array} channels - Canales validados y ordenados
     * @param {string} aggregateM3UPath - Ruta del archivo M3U agregado (para derivar el directorio base)
     */
    async _generatePerChannelM3U8Files(channels, aggregateM3UPath) {
        try {
            const baseDir = path.dirname(aggregateM3UPath);
            // Permitir configurar el directorio de salida desde app.conf (PER_CHANNEL_M3U8_DIR)
            const configuredDir = this.config?.files?.perChannelM3u8Dir;
            const m3u8Dir = configuredDir && configuredDir.trim().length > 0
                ? path.resolve(configuredDir)
                : path.join(baseDir, 'm3u8');
            await this._ensureDirectoryExists(m3u8Dir);

            // Limpiar archivos previos para evitar mezcla de formatos
            try {
                const existing = await fs.readdir(m3u8Dir);
                await Promise.all(existing.map(name => fs.unlink(path.join(m3u8Dir, name))));
            } catch (_) {
                // Ignorar errores de limpieza
            }

            const usedNames = new Set();
            const writes = [];

            for (const channel of channels) {
                if (!isValidChannel(channel)) continue;

                // Contenido del archivo por canal en formato M3U correcto
                // Mantener encabezado y EXTINF (compatibilidad), y asegurar que el link esté en minúsculas y sin espacios
                const rawUrl = channel.streamUrl || channel.url || '';
                const urlLine = String(rawUrl).trim().toLowerCase().replace(/\s+/g, '');
                const lines = ['#EXTM3U', generateExtInf(channel), urlLine];
                const content = lines.join('\n');

                // Nombre de archivo seguro y único
                const namePart = sanitizeTitle(channel.name || 'canal')
                    .toLowerCase()
                    .replace(/\s+/g, '_');
                const idPart = String(channel.id || '')
                    .toLowerCase()
                    .replace(/[^\w\-]/g, '')
                    .slice(0, 64);
                let fileBase = namePart || idPart || `canal_${Date.now()}`;
                if (idPart) fileBase = `${fileBase}_${idPart}`;
                let fileName = `${fileBase}.m3u8`;
                let attempt = 1;
                while (usedNames.has(fileName)) {
                    fileName = `${fileBase}_${attempt}.m3u8`;
                    attempt++;
                }
                usedNames.add(fileName);

                const filePath = path.join(m3u8Dir, fileName);
                writes.push(fs.writeFile(filePath, content, 'utf8'));
            }

            await Promise.all(writes);

            if (this.options.enableLogging) {
                console.log(`   ✅ ${writes.length} archivos .m3u8 individuales generados en: ${m3u8Dir}`);
            }

            // Devolver el directorio donde se generaron los archivos
            return m3u8Dir;

        } catch (error) {
            // No bloquear el proceso principal por errores individuales
            throw error;
        }
    }

    async _ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.mkdir(dirPath, { recursive: true });
                if (this.options.enableLogging) {
                    console.log(`   📁 Directorio creado: ${dirPath}`);
                }
            } else {
                throw error;
            }
        }
    }
}