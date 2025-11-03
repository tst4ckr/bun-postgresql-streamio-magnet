// Librería principal para procesamiento de canales IPTV
// Encapsula toda la lógica de main.js en una interfaz reutilizable

import { promises as fs } from 'fs';
import path from 'path';

// Importaciones de configuración y contenedor de servicios
import { EnvLoader } from '../infrastructure/config/EnvLoader.js';
import TVAddonConfig from '../infrastructure/config/TVAddonConfig.js';
import ChannelRepositoryFactory from '../infrastructure/factories/ChannelRepositoryFactory.js';
import { ServiceContainer } from '../infrastructure/container/ServiceContainer.js';
import { registerServices } from '../infrastructure/container/ServiceRegistry.js';
import M3UChannelService from '../application/M3UChannelService.js';
import ChannelNameCleaningService from '../domain/services/ChannelNameCleaningService.js';
import LogoGenerationService from '../services/LogoGenerationService.js';
import GenreDetectionService from '../services/GenreDetectionService.js';

/**
 * Librería principal para procesamiento de canales IPTV
 * Encapsula todo el pipeline de procesamiento en una interfaz reutilizable
 */
export class TVChannelProcessor {
    constructor(options = {}) {
        this.options = {
            enableLogging: options.enableLogging ?? true,
            enableValidation: options.enableValidation ?? true,
            customConfig: options.customConfig || null,
            outputDirectory: options.outputDirectory || 'data',
            ...options
        };
        
        this.config = null;
        this.logger = null;
        this.serviceContainer = null;
        this.stats = {
            startTime: null,
            endTime: null,
            rawChannels: 0,
            filteredChannels: 0,
            uniqueChannels: 0,
            convertedChannels: 0,
            validatedChannels: 0,
            csvPath: null,
            m3uPath: null
        };
    }

    /**
     * Inicializa la librería con configuración
     */
    async initialize() {
        this.stats.startTime = Date.now();
        
        if (this.options.enableLogging) {
            console.log('=== TV CHANNEL PROCESSOR LIBRARY ===');
            console.log('Inicializando procesador de canales...\n');
        }

        // FASE 1: CONFIGURACIÓN
        await this._loadConfiguration();
        
        // FASE 2: INICIALIZACIÓN DE SERVICIOS
        await this._initializeServices();
        
        if (this.options.enableLogging) {
            console.log('✅ Librería inicializada correctamente\n');
        }
    }

    /**
     * Procesa canales y genera archivos CSV y M3U
     * @param {Object} options - Opciones específicas para este procesamiento
     * @returns {Object} - Estadísticas del procesamiento
     */
    async processChannels(options = {}) {
        if (!this.config || !this.serviceContainer) {
            throw new Error('La librería debe ser inicializada antes de procesar canales. Llame a initialize() primero.');
        }

        const processingOptions = {
            generateCsv: options.generateCsv ?? true,
            generateM3u: options.generateM3u ?? true,
            customOutputPath: options.customOutputPath || null,
            ...options
        };

        try {
            // FASE 3: CARGA DE DATOS
            const filteredChannels = await this._loadChannelData();
            
            // FASE 4: PROCESAMIENTO CORE
            const coreResults = await this._processCoreOperations(filteredChannels);
            
            // FASE 5: PROCESAMIENTO POR CHUNKS
            const enhancedChannels = await this._processChannelEnhancements(coreResults.validatedChannels);
            
            // FASE 6: GENERACIÓN DE ARCHIVOS
            const outputPaths = await this._generateOutputFiles(enhancedChannels, processingOptions);
            
            // FASE 7: ESTADÍSTICAS FINALES
            this._updateFinalStats(filteredChannels, coreResults, enhancedChannels, outputPaths);
            
            return this.getProcessingStats();
            
        } catch (error) {
            if (this.options.enableLogging) {
                console.error('\n❌ ERROR EN PROCESAMIENTO:', error.message);
            }
            throw error;
        }
    }

    /**
     * Obtiene las estadísticas del último procesamiento
     */
    getProcessingStats() {
        return { ...this.stats };
    }

    /**
     * Procesa canales de forma completa (inicializar + procesar)
     * Método de conveniencia para uso simple
     */
    async run(options = {}) {
        await this.initialize();
        return await this.processChannels(options);
    }

    // ==================== MÉTODOS PRIVADOS ====================

    /**
     * Carga la configuración del sistema
     */
    async _loadConfiguration() {
        if (this.options.enableLogging) {
            console.log('📋 Cargando configuración...');
        }

        // Usar configuración personalizada si se proporciona
        if (this.options.customConfig) {
            this.config = this.options.customConfig;
        } else {
            // Cargar variables de entorno solo si no están definidas
            if (!process.env.CHANNELS_SOURCE && !process.env.M3U_URL) {
                EnvLoader.getInstance();
            }
            this.config = TVAddonConfig.getInstance();
        }

        this.logger = this._createLogger();
        
        if (this.options.enableLogging) {
            console.log('✅ Configuración cargada correctamente');
        }
    }

    /**
     * Inicializa el contenedor de servicios
     */
    async _initializeServices() {
        if (this.options.enableLogging) {
            console.log('🔧 Inicializando servicios...');
        }

        this.serviceContainer = new ServiceContainer(this.logger);
        registerServices(this.serviceContainer, this.config);
        
        if (this.options.enableLogging) {
            console.log('✅ Servicios inicializados correctamente');
        }
    }

    /**
     * Carga los datos de canales desde las fuentes configuradas
     */
    async _loadChannelData() {
        if (this.options.enableLogging) {
            console.log('📡 Cargando canales desde fuentes...');
        }

        const channelRepository = await ChannelRepositoryFactory.createRepository(this.config, this.logger);
        const filteredChannels = await channelRepository.getAllChannels();
        
        // Asignar IDs únicos para tracking consistente
        const channelsWithIds = this._assignUniqueIds(filteredChannels);
        
        this.stats.rawChannels = channelsWithIds.length;
        this.stats.filteredChannels = channelsWithIds.length;
        
        if (this.options.enableLogging) {
            console.log(`📊 Canales cargados y filtrados: ${channelsWithIds.length}`);
            this._logSourceStatistics(channelsWithIds);
        }

        return channelsWithIds;
    }

    /**
     * Ejecuta las operaciones core: deduplicación, conversión y validación
     */
    async _processCoreOperations(channels) {
        if (this.options.enableLogging) {
            console.log('🔄 Procesamiento core paralelo...');
        }

        // Asignar IDs únicos
        const channelsWithIds = this._assignUniqueIds(channels);

        // Resolver servicios
        const deduplicationService = this.serviceContainer.resolve('channelDeduplicationService');
        const httpsToHttpService = this.serviceContainer.resolve('httpsToHttpService');
        const streamValidationService = this.serviceContainer.resolve('streamValidationService');

        // Operaciones críticas
        const [deduplicationResult, conversionResult] = await Promise.all([
            deduplicationService.deduplicateChannels(channelsWithIds).catch(error => {
                if (this.options.enableLogging) {
                    console.warn('⚠️  Error en deduplicación:', error.message);
                }
                return { channels: channelsWithIds, stats: { duplicatesRemoved: 0 } };
            }),
            httpsToHttpService.processChannels(channelsWithIds).catch(error => {
                if (this.options.enableLogging) {
                    console.warn('⚠️  Error en conversión:', error.message);
                }
                return { processed: channelsWithIds, stats: { converted: 0, httpWorking: 0 } };
            })
        ]);

        // Validación opcional
        let validationResult;
        if (this.options.enableValidation && this.config.validation?.enableStreamValidation) {
            try {
                validationResult = await streamValidationService.validateChannelsParallel(channelsWithIds, {
                    concurrency: 15,
                    maxBatchSize: 30,
                    showProgress: this.options.enableLogging
                });
            } catch (error) {
                if (this.options.enableLogging) {
                    console.warn('⚠️  Error en validación:', error.message);
                }
                validationResult = { validChannels: channelsWithIds, invalidChannels: [], stats: {} };
            }
        } else {
            validationResult = { validChannels: channelsWithIds, invalidChannels: [], stats: {} };
        }

        const results = this._processParallelResults(channelsWithIds, {
            deduplicatedResult: { status: 'fulfilled', value: deduplicationResult },
            conversionResult: { status: 'fulfilled', value: conversionResult },
            validationResult: { status: 'fulfilled', value: validationResult }
        });

        this.stats.uniqueChannels = results.uniqueChannelsCount;
        this.stats.convertedChannels = results.convertedChannelsCount;

        if (this.options.enableLogging) {
            console.log('✅ Procesamiento core completado');
        }

        return results;
    }

    /**
     * Procesa mejoras de canales: limpieza de nombres, géneros y logos
     */
    async _processChannelEnhancements(channels) {
        if (this.options.enableLogging) {
            console.log('🔄 Procesamiento de mejoras (nombres, géneros, logos)...');
        }

        const enhancedChannels = await this._processChannelsInChunks(channels, {
            nameCleaningService: new ChannelNameCleaningService(),
            genreDetectionService: new GenreDetectionService(),
            logoGenerationService: new LogoGenerationService()
        });

        this.stats.validatedChannels = enhancedChannels.length;

        if (this.options.enableLogging) {
            console.log('✅ Procesamiento de mejoras completado');
        }

        return enhancedChannels;
    }

    /**
     * Genera los archivos de salida CSV y M3U
     */
    async _generateOutputFiles(channels, options) {
        const outputPaths = {};

        // Asegurar que el directorio de salida existe
        await this._ensureDirectoryExists(this.options.outputDirectory);

        if (options.generateCsv) {
            outputPaths.csv = await this._generateCsvFile(channels, options.customOutputPath);
        }

        if (options.generateM3u) {
            outputPaths.m3u = await this._generateM3uFile(channels, options.customOutputPath);
        }

        return outputPaths;
    }

    /**
     * Genera el archivo CSV
     */
    async _generateCsvFile(channels, customPath) {
        if (this.options.enableLogging) {
            console.log('📊 Generando archivo CSV...');
        }

        const validatedChannelsCsvService = this.serviceContainer.resolve('validatedChannelsCsvService');
        const csvPath = customPath || this.config.csv?.validatedChannelsCsv || path.join(this.options.outputDirectory, 'tv.csv');
        
        const generatedPath = await validatedChannelsCsvService.generateValidatedChannelsCsv(channels);
        
        if (this.options.enableLogging) {
            console.log(`✅ CSV generado: ${generatedPath}`);
        }

        return generatedPath;
    }

    /**
     * Genera el archivo M3U
     */
    async _generateM3uFile(channels, customPath) {
        if (this.options.enableLogging) {
            console.log('📺 Generando archivo M3U...');
        }

        const m3uService = new M3UChannelService();
        const m3uPath = await this._generateM3UFiles(m3uService, channels);
        
        if (this.options.enableLogging) {
            console.log(`✅ M3U generado: ${m3uPath}`);
        }

        return m3uPath;
    }

    /**
     * Actualiza las estadísticas finales
     */
    _updateFinalStats(filteredChannels, coreResults, enhancedChannels, outputPaths) {
        this.stats.endTime = Date.now();
        this.stats.processedChannels = enhancedChannels.length;
        this.stats.validChannels = enhancedChannels.length;
        this.stats.duplicatesRemoved = coreResults.duplicatesRemoved || 0;
        this.stats.httpsToHttpConversions = coreResults.httpsToHttpConversions || 0;
        this.stats.genresDetected = coreResults.genresDetected || 0;
        this.stats.logosGenerated = coreResults.logosGenerated || 0;
        this.stats.outputPaths = outputPaths;
        this.stats.csvPath = outputPaths.csv;
        this.stats.m3uPath = outputPaths.m3u;

        if (this.options.enableLogging) {
            this._showFinalSummary();
        }
    }

    // ==================== MÉTODOS AUXILIARES ====================
    // Estos métodos son copias adaptadas de las funciones auxiliares de main.js

    _createLogger() {
        const isDevelopment = process.env.NODE_ENV === 'development';
        return {
            info: (message) => isDevelopment && this.options.enableLogging && console.log(message),
            warn: (message) => this.options.enableLogging && console.warn(message),
            error: (message) => this.options.enableLogging && console.error(message),
            debug: (message) => isDevelopment && this.options.enableLogging && console.debug(message)
        };
    }

    _logSourceStatistics(channels) {
        if (!this.options.enableLogging) return;
        
        const sourceStats = {};
        channels.forEach(channel => {
            const source = channel.source || 'unknown';
            sourceStats[source] = (sourceStats[source] || 0) + 1;
        });

        console.log('📊 Estadísticas por fuente:');
        Object.entries(sourceStats).forEach(([source, count]) => {
            console.log(`   ${source}: ${count} canales`);
        });
    }

    _assignUniqueIds(channels) {
        return channels.map((channel, index) => ({
            ...channel,
            id: channel.id || `channel_${index + 1}_${Date.now()}`
        }));
    }

    _showFinalSummary() {
        if (!this.options.enableLogging) return;
        
        const processingTime = this.stats.endTime - this.stats.startTime;
        console.log('\n=== RESUMEN FINAL ===');
        console.log(`📊 Canales procesados: ${this.stats.validatedChannels}`);
        console.log(`📁 Archivo CSV: ${this.stats.csvPath}`);
        console.log(`📺 Archivo M3U: ${this.stats.m3uPath}`);
        console.log(`⏱️  Tiempo total: ${(processingTime / 1000).toFixed(2)}s`);
        console.log('✅ Procesamiento completado exitosamente\n');
    }

    async _ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }

    // Métodos que necesitan ser implementados basándose en main.js
    // Por ahora los dejo como stubs que necesitarán la lógica completa

    _processParallelResults(baseChannels, { deduplicatedResult, conversionResult, validationResult }) {
        let processedChannels = baseChannels; // Canales que van siendo transformados
        let uniqueChannelsCount = baseChannels.length;
        let convertedChannelsCount = baseChannels.length;
        
        // Procesador de deduplicación con manejo robusto de errores
        if (deduplicatedResult.status === 'fulfilled') {
            const uniqueChannels = deduplicatedResult.value.channels;
            const deduplicationStats = this._calculateDeduplicationStats(baseChannels.length, uniqueChannels.length);
            
            if (this.options.enableLogging) {
                console.log(`📊 Canales únicos: ${uniqueChannels.length} (${deduplicationStats.efficiency}% únicos)`);
                console.log(`🗑️  Duplicados eliminados: ${deduplicationStats.duplicatesRemoved}`);
            }
            
            processedChannels = uniqueChannels; // Aplicar deduplicación
            uniqueChannelsCount = uniqueChannels.length;
        } else {
            if (this.options.enableLogging) {
                console.error(`❌ Error en deduplicación (ya manejado): ${deduplicatedResult.reason?.message}`);
            }
        }

        // Procesador de conversión HTTPS→HTTP con actualización inteligente
        if (conversionResult.status === 'fulfilled') {
            const convertedChannels = conversionResult.value.processed;
            if (this.options.enableLogging) {
                console.log(`📊 Canales procesados para conversión: ${convertedChannels.length}`);
                console.log(`🔄 Conversiones HTTPS→HTTP: ${conversionResult.value.stats.converted}`);
                console.log(`✅ URLs HTTP funcionales: ${conversionResult.value.stats.httpWorking}`);
            }
            
            // Aplicar conversiones manteniendo integridad de datos
            processedChannels = this._applyChannelUpdates(processedChannels, convertedChannels);
            convertedChannelsCount = processedChannels.length;
        } else {
            if (this.options.enableLogging) {
                console.error(`❌ Error en conversión (ya manejado): ${conversionResult.reason?.message}`);
            }
        }

        // Procesador de validación con filtrado seguro y fallback mejorado
        if (validationResult.status === 'fulfilled') {
            const { validChannels, invalidChannels, stats } = validationResult.value;
            
            // Filtrar solo canales validados manteniendo consistencia
            processedChannels = processedChannels.filter(channel => 
                validChannels.some(valid => valid.id === channel.id)
            );
            
            if (this.options.enableLogging) {
                console.log(`📊 Canales validados: ${processedChannels.length} (${invalidChannels.length} inválidos)`);
                
                if (stats.processingTime) {
                    console.log(`⏱️  Tiempo de validación: ${(stats.processingTime/1000).toFixed(1)}s`);
                }
            }
        } else {
            // Para validación, usar fallback si está disponible (error no crítico)
            if (validationResult.fallback) {
                if (this.options.enableLogging) {
                    console.warn(`⚠️  Usando fallback para validación: todos los canales marcados como válidos`);
                }
                // No filtrar canales, mantener todos como válidos por defecto
            } else {
                if (this.options.enableLogging) {
                    console.error(`❌ Error en validación sin fallback: ${validationResult.reason?.message}`);
                }
            }
        }

        return {
            validatedChannels: processedChannels,
            uniqueChannelsCount,
            convertedChannelsCount
        };
    }

    async _processChannelsInChunks(channels, services) {
        const { nameCleaningService, genreDetectionService, logoGenerationService } = services;
        const CHUNK_SIZE = 15; // Tamaño óptimo para procesamiento paralelo
        
        // Dividir canales en chunks
        const chunks = [];
        for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
            chunks.push(channels.slice(i, i + CHUNK_SIZE));
        }
        
        if (this.options.enableLogging) {
            console.log(`   📦 Procesando ${channels.length} canales en ${chunks.length} chunks de ${CHUNK_SIZE}`);
        }
        
        // Asegurar directorio de logos
        await logoGenerationService.ensureLogoDirectory();
        
        // Procesar chunks en paralelo
        const processedChunks = await Promise.all(
            chunks.map(async (chunk, chunkIndex) => {
                if (this.options.enableLogging) {
                    console.log(`   🔄 Procesando chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} canales)`);
                }
                
                // Procesar cada chunk de forma secuencial para mantener consistencia
                let processedChunk = [...chunk];
                
                // 1. Limpieza de nombres
                processedChunk = await nameCleaningService.processChannelsInBatches(processedChunk);

                // 2. Detección de géneros
                const genreResults = genreDetectionService.processChannels(processedChunk);
                processedChunk = genreResults.channels; // Los géneros ya están aplicados en cada canal
                
                // 3. Generación de logos
                const channelsForLogos = processedChunk.map(channel => ({
                    id: channel.id,
                    name: channel.name || `Canal ${channel.originalIndex + 1}`
                }));
                
                const logoResults = await logoGenerationService.generateMultipleLogos(channelsForLogos);
                
                // 4. Integración de logos
                const logoMap = new Map();
                logoResults.forEach(result => {
                    if (result.success && result.logoPath) {
                        logoMap.set(result.channelId, result.logoPath);
                    }
                });
                
                // Aplicar logos a canales
                processedChunk.forEach(channel => {
                    const logoPath = logoMap.get(channel.id);
                    if (logoPath) {
                        const relativePath = path.relative(process.cwd(), logoPath).replace(/\\/g, '/');
                        channel.logo = relativePath;
                    }
                });
                
                return {
                    channels: processedChunk,
                    stats: {
                        chunkIndex,
                        processed: processedChunk.length,
                        logosGenerated: logoResults.filter(r => r.success).length,
                        genreStats: genreResults.stats
                    }
                };
            })
        );
        
        // Consolidar resultados
        const allProcessedChannels = processedChunks.flatMap(chunk => chunk.channels);
        
        // Estadísticas consolidadas
        const totalLogosGenerated = processedChunks.reduce((sum, chunk) => sum + chunk.stats.logosGenerated, 0);
        const cleaningMetrics = nameCleaningService.getMetrics();
        
        // Consolidar estadísticas de géneros
        const allGenreStats = processedChunks.map(chunk => chunk.stats.genreStats);
        const consolidatedGenreStats = this._consolidateGenreStats(allGenreStats);
        
        if (this.options.enableLogging) {
            console.log(`   ✅ Limpieza: ${cleaningMetrics.totalCleaned}/${cleaningMetrics.totalProcessed} nombres (${cleaningMetrics.cleaningRate}%)`);
            console.log(`   ✅ Géneros: ${consolidatedGenreStats.totalGenres} únicos detectados`);
            console.log(`   ✅ Logos: ${totalLogosGenerated}/${allProcessedChannels.length} generados`);
        }
        
        return allProcessedChannels;
    }

    async _generateM3UFiles(m3uService, validatedChannels) {
        try {
            // Verificar que tenemos canales válidos antes de proceder
            if (!validatedChannels || validatedChannels.length === 0) {
                throw new Error('No hay canales válidos para generar M3U');
            }

            // Asegurar que el directorio de salida existe
            if (this.options.enableLogging) {
                console.log(`   📁 Verificando directorio: ${this.options.outputDirectory}`);
            }
            await this._ensureDirectoryExists(this.options.outputDirectory);
            if (this.options.enableLogging) {
                console.log(`   ✓ Directorio confirmado: ${this.options.outputDirectory}`);
            }

            // Generar contenido M3U
            if (this.options.enableLogging) {
                console.log('   🔄 Generando contenido M3U...');
            }
            const standardM3U = await m3uService.generateM3UPlaylist({
                format: 'standard'
            }, validatedChannels);
            if (this.options.enableLogging) {
                console.log(`   ✓ Contenido M3U generado: ${standardM3U.length} caracteres`);
            }

            // Escribir archivo M3U
            const m3uFilePath = path.join(this.options.outputDirectory, 'channels.m3u');
            if (this.options.enableLogging) {
                console.log(`   💾 Escribiendo archivo M3U: ${m3uFilePath}`);
            }
            
            await fs.writeFile(m3uFilePath, standardM3U, 'utf8');
            
            if (this.options.enableLogging) {
                console.log(`   ✅ M3U guardado exitosamente: ${m3uFilePath}`);
            }

            return m3uFilePath;
        } catch (error) {
            if (this.options.enableLogging) {
                console.error(`❌ Error generando M3U: ${error.message}`);
            }
            throw error;
        }
    }

    // Métodos auxiliares privados
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
            return updated || channel; // Usar versión actualizada si existe, sino mantener original
        });
    }

    _consolidateGenreStats(genreStatsArray) {
        const allGenres = new Set();
        let totalChannelsWithGenres = 0;
        const genreCounts = new Map();
        
        genreStatsArray.forEach(stats => {
            if (stats && stats.topGenres) {
                stats.topGenres.forEach(([genre, count]) => {
                    allGenres.add(genre);
                    genreCounts.set(genre, (genreCounts.get(genre) || 0) + count);
                });
            }
            if (stats && stats.totalChannelsWithGenres) {
                totalChannelsWithGenres += stats.totalChannelsWithGenres;
            }
        });
        
        const topGenres = Array.from(genreCounts.entries())
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
        
        return {
            totalGenres: allGenres.size,
            totalChannelsWithGenres,
            topGenres,
            avgGenresPerChannel: totalChannelsWithGenres > 0 ? (allGenres.size / totalChannelsWithGenres).toFixed(2) : 0
        };
    }
}

export default TVChannelProcessor;