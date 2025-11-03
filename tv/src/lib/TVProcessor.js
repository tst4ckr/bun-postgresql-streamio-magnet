// Importaciones del sistema de archivos y utilidades de Node.js
import { promises as fs } from 'fs';
import path from 'path';

// Importaciones de servicios y contenedor (reutilizando la infraestructura existente)
import ChannelRepositoryFactory from '../infrastructure/factories/ChannelRepositoryFactory.js';
import { ServiceContainer } from '../infrastructure/container/ServiceContainer.js';
import { registerServices } from '../infrastructure/container/ServiceRegistry.js';
import M3UChannelService from '../application/M3UChannelService.js';
import ChannelNameCleaningService from '../domain/services/ChannelNameCleaningService.js';
import LogoGenerationService from '../services/LogoGenerationService.js';
import GenreDetectionService from '../services/GenreDetectionService.js';

/**
 * TVProcessor - Librería que encapsula toda la funcionalidad de procesamiento de canales IPTV
 * Usa únicamente configuración de archivo, sin variables de entorno
 */
export class TVProcessor {
    constructor(config) {
        this.config = config;
        this.logger = this.createLogger();
        this.serviceContainer = null;
        this.startTime = null;
    }

    /**
     * Procesa canales IPTV según la configuración proporcionada
     * @returns {Object} Resultado del procesamiento con estadísticas y rutas de archivos
     */
    async process() {
        this.startTime = Date.now();
        
        try {
            console.log('=== GENERADOR DE TV.CSV Y PLAYLIST M3U ===');
            console.log('Iniciando proceso de generación automática...\n');

            // FASE 1: INICIALIZACIÓN
            console.log('🔧 Paso 1: Inicializando servicios...');
            await this.initializeServices();
            console.log('✅ Servicios inicializados correctamente\n');

            // FASE 2: CARGA DE DATOS
            console.log('📡 Paso 2: Cargando canales desde fuentes...');
            const filteredChannels = await this.loadChannels();
            console.log(`📊 Canales cargados y filtrados: ${filteredChannels.length}\n`);

            // FASE 3: PREPARACIÓN DE DATOS
            console.log('🔧 Paso 3: Preparando datos para procesamiento...');
            const channelsWithIds = this.assignUniqueIds(filteredChannels);
            console.log(`✅ IDs únicos asignados a ${channelsWithIds.length} canales\n`);

            // FASE 4: PROCESAMIENTO CORE
            console.log('🔄 Paso 4: Procesamiento core (deduplicación, conversión, validación)...');
            const coreResults = await this.processCoreOperations(channelsWithIds);
            console.log('✅ Procesamiento core completado\n');

            // FASE 5: PROCESAMIENTO POR CHUNKS
            console.log('🔄 Paso 5: Procesamiento por chunks (nombres, géneros, logos)...');
            const enhancedChannels = await this.processChannelsInChunks(coreResults.validatedChannels);
            console.log('✅ Procesamiento por chunks completado\n');

            // FASE 6: GENERACIÓN DE ARCHIVOS
            console.log('📊 Paso 6: Generando archivos de salida...');
            const outputFiles = await this.generateOutputFiles(enhancedChannels);
            console.log('✅ Archivos generados correctamente\n');

            // RESUMEN FINAL
            const result = this.generateFinalSummary({
                rawChannels: filteredChannels.length,
                uniqueChannels: coreResults.uniqueChannelsCount,
                convertedChannels: coreResults.convertedChannelsCount,
                validatedChannels: enhancedChannels.length,
                outputFiles
            });

            return result;

        } catch (error) {
            console.error('\n❌ ERROR EN EL PROCESO:');
            console.error(error.message);
            throw error;
        }
    }

    /**
     * Inicializa servicios usando la configuración proporcionada
     */
    async initializeServices() {
        this.serviceContainer = new ServiceContainer(this.logger);
        
        // Crear un objeto de configuración compatible con TVAddonConfig
        const configAdapter = {
            getInstance: () => this.config,
            ...this.config
        };
        
        registerServices(this.serviceContainer, configAdapter);
    }

    /**
     * Carga canales desde las fuentes configuradas
     */
    async loadChannels() {
        const channelRepository = await ChannelRepositoryFactory.createRepository(this.config, this.logger);
        return await channelRepository.getAllChannels();
    }

    /**
     * Procesa operaciones core: deduplicación, conversión y validación
     */
    async processCoreOperations(channels) {
        const deduplicationService = this.serviceContainer.resolve('channelDeduplicationService');
        const httpsToHttpService = this.serviceContainer.resolve('httpsToHttpService');
        const streamValidationService = this.serviceContainer.resolve('streamValidationService');

        let processedChannels = channels;
        let uniqueChannelsCount = channels.length;
        let convertedChannelsCount = channels.length;

        // Deduplicación
        try {
            const deduplicationResult = await deduplicationService.deduplicateChannels(channels);
            processedChannels = deduplicationResult.channels;
            uniqueChannelsCount = processedChannels.length;
            console.log(`📊 Canales únicos: ${uniqueChannelsCount} (duplicados eliminados: ${channels.length - uniqueChannelsCount})`);
        } catch (error) {
            console.warn('⚠️ Error en deduplicación, continuando:', error.message);
        }

        // Conversión HTTPS→HTTP
        try {
            const conversionResult = await httpsToHttpService.processChannels(processedChannels);
            processedChannels = conversionResult.processed;
            convertedChannelsCount = processedChannels.length;
            console.log(`🔄 Conversiones HTTPS→HTTP: ${conversionResult.stats.converted}`);
        } catch (error) {
            console.warn('⚠️ Error en conversión, continuando:', error.message);
        }

        // Validación
        try {
            if (this.config.validation?.enableStreamValidation) {
                const validationResult = await streamValidationService.validateChannelsParallel(processedChannels, {
                    concurrency: this.config.validation.concurrency || 15,
                    maxBatchSize: this.config.validation.batchSize || 30,
                    showProgress: true
                });
                processedChannels = validationResult.validChannels;
                console.log(`📊 Canales validados: ${processedChannels.length} (${validationResult.invalidChannels.length} inválidos)`);
            }
        } catch (error) {
            console.warn('⚠️ Error en validación, continuando:', error.message);
        }

        return {
            validatedChannels: processedChannels,
            uniqueChannelsCount,
            convertedChannelsCount
        };
    }

    /**
     * Procesa canales en chunks para optimizar rendimiento
     */
    async processChannelsInChunks(channels) {
        const nameCleaningService = new ChannelNameCleaningService();
        const genreDetectionService = new GenreDetectionService();
        const logoGenerationService = new LogoGenerationService();

        const CHUNK_SIZE = 15;
        const chunks = [];
        
        for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
            chunks.push(channels.slice(i, i + CHUNK_SIZE));
        }

        console.log(`   📦 Procesando ${channels.length} canales en ${chunks.length} chunks de ${CHUNK_SIZE}`);

        // Asegurar directorio de logos
        await logoGenerationService.ensureLogoDirectory();

        // Procesar chunks en paralelo
        const processedChunks = await Promise.all(
            chunks.map(async (chunk, chunkIndex) => {
                console.log(`   🔄 Procesando chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} canales)`);

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

                // 4. Integración de logos
                const logoMap = new Map();
                logoResults.forEach(result => {
                    if (result.success && result.logoPath) {
                        logoMap.set(result.channelId, result.logoPath);
                    }
                });

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
                        processed: processedChunk.length,
                        logosGenerated: logoResults.filter(r => r.success).length
                    }
                };
            })
        );

        const allProcessedChannels = processedChunks.flatMap(chunk => chunk.channels);
        const totalLogosGenerated = processedChunks.reduce((sum, chunk) => sum + chunk.stats.logosGenerated, 0);

        console.log(`   ✅ Logos: ${totalLogosGenerated}/${allProcessedChannels.length} generados`);

        return allProcessedChannels;
    }

    /**
     * Genera archivos de salida CSV y M3U
     */
    async generateOutputFiles(channels) {
        const validatedChannelsCsvService = this.serviceContainer.resolve('validatedChannelsCsvService');
        const m3uService = new M3UChannelService();

        // Generar CSV
        console.log('   📝 Escribiendo archivo CSV...');
        const csvPath = await validatedChannelsCsvService.generateValidatedChannelsCsv(channels);
        console.log(`   ✅ CSV completado: ${csvPath}`);

        // Generar M3U
        console.log('   📝 Escribiendo archivo M3U...');
        const m3uPath = await this.generateM3UFiles(m3uService, channels);
        console.log(`   ✅ M3U completado: ${m3uPath}`);

        return {
            csvPath,
            m3uPath,
            logoDirectory: 'logo'
        };
    }

    /**
     * Genera archivo M3U
     */
    async generateM3UFiles(m3uService, validatedChannels) {
        const dataDir = this.config.m3u?.outputDirectory || 'data';
        const filename = this.config.m3u?.filename || 'channels.m3u';
        
        await this.ensureDirectoryExists(dataDir);

        const standardM3U = await m3uService.generateM3UPlaylist({
            format: 'standard'
        }, validatedChannels);

        const m3uFilePath = path.join(dataDir, filename);
        await fs.writeFile(m3uFilePath, standardM3U, 'utf8');

        return m3uFilePath;
    }

    /**
     * Asigna IDs únicos a canales
     */
    assignUniqueIds(channels) {
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
     * Genera resumen final del procesamiento
     */
    generateFinalSummary(stats) {
        const endTime = Date.now();
        const processingTime = endTime - this.startTime;
        const processingTimeSeconds = (processingTime / 1000).toFixed(2);

        console.log('\n🎉 === PROCESO COMPLETADO EXITOSAMENTE ===');
        console.log('\n📊 Resumen del procesamiento:');
        console.log(`   📡 Canales originales: ${stats.rawChannels}`);
        console.log(`   🔄 Después de deduplicación: ${stats.uniqueChannels}`);
        console.log(`   🔄 Después de conversión: ${stats.convertedChannels}`);
        console.log(`   ✅ Canales validados finales: ${stats.validatedChannels}`);

        console.log('\n📄 Archivos generados:');
        console.log(`   📊 Archivo CSV: ${stats.outputFiles.csvPath}`);
        console.log(`   📺 Playlist M3U: ${stats.outputFiles.m3uPath}`);
        console.log(`   🖼️ Directorio de logos: ${stats.outputFiles.logoDirectory}`);

        console.log(`\n⏱️ Tiempo de procesamiento: ${processingTimeSeconds}s`);
        console.log('\n🚀 ¡Sistema listo para usar con Stremio!');

        return {
            success: true,
            stats: {
                rawChannels: stats.rawChannels,
                uniqueChannels: stats.uniqueChannels,
                convertedChannels: stats.convertedChannels,
                validatedChannels: stats.validatedChannels,
                processingTime: processingTime
            },
            outputFiles: stats.outputFiles
        };
    }

    /**
     * Crea logger optimizado
     */
    createLogger() {
        const logLevel = this.config.logging?.logLevel || 'info';
        
        return {
            info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
            warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
            error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
            debug: logLevel === 'debug' ? 
                (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args) : 
                () => {}
        };
    }

    /**
     * Asegura que un directorio existe
     */
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.mkdir(dirPath, { recursive: true });
            } else {
                throw error;
            }
        }
    }
}

export default TVProcessor;