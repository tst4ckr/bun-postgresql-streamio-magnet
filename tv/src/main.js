// Importaciones del sistema de archivos y utilidades de Node.js
import { promises as fs } from 'fs';
import path from 'path';
// Importaciones de configuración y contenedor de servicios
import { EnvLoader } from './infrastructure/config/EnvLoader.js';
import TVAddonConfig from './infrastructure/config/TVAddonConfig.js';
import ChannelRepositoryFactory from './infrastructure/factories/ChannelRepositoryFactory.js';
import { ServiceContainer } from './infrastructure/container/ServiceContainer.js';
import { registerServices } from './infrastructure/container/ServiceRegistry.js';
import { BannedChannelsFilterService } from './domain/services/BannedChannelsFilterService.js';
import M3UChannelService from './application/M3UChannelService.js';
import ChannelNameCleaningService from './domain/services/ChannelNameCleaningService.js';
import LogoGenerationService from './services/LogoGenerationService.js';
import GenreDetectionService from './services/GenreDetectionService.js';

/**
 * Pipeline principal: Carga → Filtrado → Deduplicación → Conversión → Validación → Archivos finales
 * Procesa canales IPTV desde múltiples fuentes y genera tv.csv + M3U para Stremio
 */
async function main() {
    const startTime = Date.now(); // Medición de tiempo total de procesamiento
    try {
        console.log('=== GENERADOR DE TV.CSV Y PLAYLIST M3U ===');
        console.log('Iniciando proceso de generación automática...\n');

        // FASE 1: CONFIGURACIÓN - Carga variables de entorno y configuración centralizada
        console.log('📋 Paso 1: Cargando configuración...');
        EnvLoader.getInstance(); // Singleton para cargar .env una sola vez
        const config = TVAddonConfig.getInstance(); // Configuración centralizada del addon
        const logger = createLogger(); // Logger personalizado para trazabilidad
        
        console.log('✅ Configuración cargada correctamente\n');

        // FASE 2: INICIALIZACIÓN - Instancia servicios según configuración
        console.log('🔧 Paso 2: Inicializando servicios...');
        
        // Crear contenedor de servicios y registrar todas las dependencias
        const serviceContainer = new ServiceContainer(logger);
        registerServices(serviceContainer, config);
        
        // Resolver servicios desde el contenedor (sin dependencias circulares)
        const channelRepository = await ChannelRepositoryFactory.createRepository(config, logger);
        const deduplicationService = serviceContainer.resolve('channelDeduplicationService');
        const httpsToHttpService = serviceContainer.resolve('httpsToHttpService');
        const streamValidationService = serviceContainer.resolve('streamValidationService');
        const validatedChannelsCsvService = serviceContainer.resolve('validatedChannelsCsvService');
        const ipExtractionService = serviceContainer.resolve('ipExtractionService');
        const ipLatencyValidationService = serviceContainer.resolve('ipLatencyValidationService');
        
        console.log('✅ Servicios inicializados correctamente desde contenedor IoC\n');

        // FASE 3: CARGA DE DATOS - Obtiene canales desde fuentes configuradas (CSV/M3U/Híbrido)
        console.log('📡 Paso 3: Cargando canales desde fuentes...');
        const filteredChannels = await channelRepository.getAllChannels(); // Carga y filtra automáticamente
        console.log(`📊 Canales cargados y filtrados: ${filteredChannels.length}`);
        
        // Estadísticas de origen de canales para diagnóstico
        const sourceStats = getSourceStatistics(filteredChannels);
        logSourceStatistics(sourceStats);
        console.log('');

        // FASE 4: FILTRADO - Ya aplicado automáticamente por el repositorio
        console.log('🔍 Paso 4: Filtrado de contenido ya aplicado por el repositorio híbrido');
        console.log('');

        // FASE 5: PREPARACIÓN DE DATOS - Asignar IDs únicos para tracking consistente
        console.log('🔧 Paso 5: Preparando datos para procesamiento...');
        const channelsWithIds = assignUniqueIds(filteredChannels);
        console.log(`✅ IDs únicos asignados a ${channelsWithIds.length} canales\n`);

        // FASE 6: PROCESAMIENTO CORE PARALELO - Deduplicación, conversión y validación
        console.log('🔄 Paso 6: Procesamiento core paralelo (deduplicación, conversión, validación)...');
        
        // Separar operaciones críticas de las opcionales para fail-fast apropiado
        let deduplicatedResult, conversionResult, validationResult;
        
        try {
            // OPERACIONES CRÍTICAS: Usar Promise.all para fail-fast en errores de configuración/servicio
            const [deduplicationPromise, conversionPromise] = await Promise.all([
                // Deduplicación: Crítica para evitar duplicados - debe fallar rápido si hay error de configuración
                deduplicationService.deduplicateChannels(channelsWithIds).catch(error => {
                    if (error.message?.includes('configuration') || error.message?.includes('service') || error.name === 'ConfigurationError') {
                        console.error('❌ ERROR CRÍTICO en deduplicación - Interrumpiendo procesamiento:', error.message);
                        throw error; // Fail-fast para errores críticos
                    }
                    console.warn('⚠️  Error no crítico en deduplicación, continuando:', error.message);
                    return { channels: channelsWithIds, stats: { duplicatesRemoved: 0 } }; // Fallback graceful
                }),
                
                // Conversión: Crítica para compatibilidad - debe fallar rápido si hay error de servicio
                httpsToHttpService.processChannels(channelsWithIds).catch(error => {
                    if (error.message?.includes('configuration') || error.message?.includes('service') || error.name === 'ConfigurationError') {
                        console.error('❌ ERROR CRÍTICO en conversión - Interrumpiendo procesamiento:', error.message);
                        throw error; // Fail-fast para errores críticos
                    }
                    console.warn('⚠️  Error no crítico en conversión, continuando:', error.message);
                    return { processed: channelsWithIds, stats: { converted: 0, httpWorking: 0 } }; // Fallback graceful
                })
            ]);
            
            deduplicatedResult = { status: 'fulfilled', value: deduplicationPromise };
            conversionResult = { status: 'fulfilled', value: conversionPromise };
            
            // OPERACIÓN OPCIONAL: Validación puede fallar sin interrumpir el flujo completo
            try {
                const validationPromise = config.validation?.enableStreamValidation 
                    ? await streamValidationService.validateChannelsParallel(channelsWithIds, {
                        concurrency: 15,
                        maxBatchSize: 30,
                        showProgress: true
                      })
                    : { validChannels: channelsWithIds, invalidChannels: [], stats: {} };
                
                validationResult = { status: 'fulfilled', value: validationPromise };
            } catch (validationError) {
                console.warn('⚠️  Error en validación (no crítico), continuando sin validación:', validationError.message);
                validationResult = { 
                    status: 'rejected', 
                    reason: validationError,
                    fallback: { validChannels: channelsWithIds, invalidChannels: [], stats: {} }
                };
            }
            
        } catch (criticalError) {
            console.error('💥 ERROR CRÍTICO en procesamiento core - Sistema debe detenerse:', criticalError.message);
            console.error('🔧 Verifique la configuración de servicios y dependencias');
            throw criticalError; // Fail-fast para errores críticos de configuración/servicio
        }

        // Consolidar resultados del procesamiento core
        const coreProcessingResults = processParallelResults(
            channelsWithIds,
            { deduplicatedResult, conversionResult, validationResult }
        );
        
        console.log('✅ Procesamiento core completado\n');

        // FASE 7: PROCESAMIENTO POR CHUNKS - Limpieza, géneros y logos en paralelo controlado
        console.log('🔄 Paso 7: Procesamiento por chunks (nombres, géneros, logos)...');
        
        const enhancedChannels = await processChannelsInChunks(
            coreProcessingResults.validatedChannels,
            {
                nameCleaningService: new ChannelNameCleaningService(),
                genreDetectionService: new GenreDetectionService(),
                logoGenerationService: new LogoGenerationService()
            }
        );
        
        console.log('✅ Procesamiento por chunks completado\n');

        // DEBUG: Verificar géneros en enhancedChannels
        console.log('🔍 DEBUG: Verificando géneros en enhancedChannels...');
        const genreStats = {};
        enhancedChannels.slice(0, 10).forEach((channel, index) => {
            console.log(`  Canal ${index + 1}: ${channel.name} -> Género: ${channel.genre}`);
            const genre = channel.genre || 'General';
            genreStats[genre] = (genreStats[genre] || 0) + 1;
        });
        console.log('🔍 DEBUG: Estadísticas de géneros en muestra:', genreStats);
        console.log(`🔍 DEBUG: Total de canales procesados: ${enhancedChannels.length}\n`);

        // FASE 8: GENERACIÓN CSV - Escritura completamente separada y secuencial
        console.log('📊 Paso 8: Generando archivo tv.csv...');
        const csvOutputPath = config.csv?.validatedChannelsCsv || process.env.VALIDATED_CHANNELS_CSV || 'data/tv.csv';
        
        // Escribir CSV de forma completamente independiente
        console.log('   📝 Escribiendo archivo CSV...');
        const csvPath = await validatedChannelsCsvService.generateValidatedChannelsCsv(enhancedChannels);
        console.log(`   ✅ CSV completado y guardado: ${csvPath}`);
        
        // Verificar que el archivo CSV se escribió correctamente antes de continuar
        const fs = await import('fs');
        if (!fs.existsSync(csvPath)) {
            throw new Error(`Error: El archivo CSV no se generó correctamente en ${csvPath}`);
        }
        console.log(`   ✓ Verificación CSV exitosa: archivo existe y es accesible\n`);

        // FASE 9: GENERACIÓN M3U - Escritura completamente separada y secuencial
        console.log('📺 Paso 9: Generando archivos M3U...');
        
        // Esperar explícitamente antes de proceder con M3U para asegurar separación total
        console.log('   ⏳ Preparando generación M3U (escritura separada)...');
        await new Promise(resolve => setTimeout(resolve, 100)); // Pausa explícita para separación
        
        const m3uService = new M3UChannelService();
        
        // Leer canales desde el CSV ya generado para mantener orden exacto
        console.log('   📖 Leyendo canales desde CSV generado...');
        const orderedChannelsFromCsv = await validatedChannelsCsvService.getOrderedChannelsFromCsv(csvPath);
        console.log(`   📋 Canales leídos para M3U: ${orderedChannelsFromCsv.length}`);
        
        // Escribir M3U de forma completamente independiente
        console.log('   📝 Escribiendo archivo M3U...');
        await generateM3UFiles(m3uService, orderedChannelsFromCsv);
        console.log('   ✅ M3U completado y guardado');

        // FASE 10: RESUMEN FINAL - Muestra estadísticas completas del procesamiento
        const endTime = Date.now();
        showFinalSummary({
            rawChannels: filteredChannels.length,
            filteredChannels: filteredChannels.length,
            uniqueChannels: coreProcessingResults.uniqueChannelsCount,
            convertedChannels: coreProcessingResults.convertedChannelsCount,
            validatedChannels: enhancedChannels.length,
            csvPath,
            processingTime: endTime - startTime
        });

    } catch (error) {
        // Manejo centralizado de errores con información detallada
        console.error('\n❌ ERROR EN EL PROCESO:');
        console.error(error.message);
        console.error('\nDetalles del error:');
        console.error(error.stack);
        process.exit(1);
    }
}

/**
 * Crea un logger personalizado para el proceso
 */
/**
 * Crea un logger optimizado basado en el entorno
 * Implementa logging condicional para reducir overhead en producción
 */
function createLogger() {
    const env = process.env.NODE_ENV?.toLowerCase() || 'development';
    const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
    
    // Configuración de niveles por entorno
    const levelConfig = {
        production: { info: true, warn: true, error: true, debug: false, fatal: true },
        test: { info: false, warn: false, error: true, debug: false, fatal: true },
        development: { info: true, warn: true, error: true, debug: true, fatal: true }
    };
    
    const currentLevels = levelConfig[env] || levelConfig.development;
    
    // Override con LOG_LEVEL específico si está definido
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
        info: currentLevels.info ? 
            (msg, ...args) => console.log(`[INFO] ${msg}`, ...args) : 
            () => {}, // No-op en producción si está deshabilitado
        warn: currentLevels.warn ? 
            (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args) : 
            () => {},
        error: currentLevels.error ? 
            (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args) : 
            () => {},
        debug: currentLevels.debug ? 
            (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args) : 
            () => {}, // Siempre deshabilitado en producción
        fatal: currentLevels.fatal ? 
            (msg, ...args) => console.error(`[FATAL] ${msg}`, ...args) : 
            () => {}
    };
}

/**
 * Obtiene estadísticas de fuentes de canales
 */
function getSourceStatistics(channels) {
    const stats = {};
    channels.forEach(channel => {
        const source = channel.source || 'unknown';
        stats[source] = (stats[source] || 0) + 1;
    });
    return stats;
}

/**
 * Registra estadísticas de fuentes en el log
 */
function logSourceStatistics(sourceStats) {
    console.log('📊 Estadísticas por fuente:');
    Object.entries(sourceStats)
        .sort(([,a], [,b]) => b - a)
        .forEach(([source, count]) => {
            console.log(`   - ${source}: ${count} canales`);
        });
}

/**
 * Genera archivo M3U estándar en la carpeta data de forma completamente separada
 * Asegura escritura secuencial sin paralelización
 */
async function generateM3UFiles(m3uService, validatedChannels) {
    try {
        // Verificar que tenemos canales válidos antes de proceder
        if (!validatedChannels || validatedChannels.length === 0) {
            throw new Error('No hay canales válidos para generar M3U');
        }

        // Asegurar que el directorio data existe (operación separada)
        const dataDir = 'data';
        console.log(`   📁 Verificando directorio: ${dataDir}`);
        await ensureDirectoryExists(dataDir);
        console.log(`   ✓ Directorio confirmado: ${dataDir}`);

        // Generar contenido M3U (operación separada de la escritura)
        console.log('   🔄 Generando contenido M3U...');
        const standardM3U = await m3uService.generateM3UPlaylist({
            format: 'standard'
        }, validatedChannels);
        console.log(`   ✓ Contenido M3U generado: ${standardM3U.length} caracteres`);

        // Escribir archivo M3U de forma completamente independiente
        const m3uFilePath = path.join(dataDir, 'channels.m3u');
        console.log(`   💾 Escribiendo archivo M3U: ${m3uFilePath}`);
        
        // Escritura síncrona para asegurar separación total
        await fs.writeFile(m3uFilePath, standardM3U, 'utf8');
        
        // Verificar que el archivo se escribió correctamente
        const fs_sync = await import('fs');
        if (!fs_sync.existsSync(m3uFilePath)) {
            throw new Error(`Error: El archivo M3U no se escribió correctamente en ${m3uFilePath}`);
        }
        
        console.log(`   ✅ Archivo M3U guardado y verificado: ${m3uFilePath}`);
        return standardM3U; // Devolver el contenido M3U

    } catch (error) {
        console.error('   ❌ Error generando archivo M3U:', error.message);
        throw error;
    }
}

/**
 * Muestra el resumen final del procesamiento
 */
function showFinalSummary(stats) {
    const processingTimeSeconds = (stats.processingTime / 1000).toFixed(2);
    
    console.log('\n🎉 === PROCESO COMPLETADO EXITOSAMENTE ===');
    console.log('\n📊 Resumen del procesamiento:');
    console.log(`   📡 Canales originales: ${stats.rawChannels}`);
    console.log(`   🔍 Después del filtrado: ${stats.filteredChannels}`);
    console.log(`   🔄 Después de deduplicación: ${stats.uniqueChannels}`);
    console.log(`   🔄 Después de conversión: ${stats.convertedChannels}`);
    console.log(`   ✅ Canales validados finales: ${stats.validatedChannels}`);
    
    console.log('\n📄 Archivos generados:');
    console.log(`   📊 Archivo principal: ${stats.csvPath}`);
    console.log(`   📺 Playlist M3U: data/channels.m3u`);
    
    console.log(`\n⏱️  Tiempo de procesamiento: ${processingTimeSeconds}s`);
    console.log('\n🚀 ¡Sistema listo para usar con Stremio!');
    console.log('💡 El archivo tv.csv contiene todos los canales validados y procesados.');
}

/**
 * Asegura que un directorio existe, creándolo si es necesario
 * @param {string} dirPath - Ruta del directorio
 */
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`   📁 Directorio creado: ${dirPath}`);
        } else {
            throw error;
        }
    }
}

/**
 * Manejo de señales del sistema para cierre limpio
 */
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Proceso interrumpido por el usuario');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n⚠️  Proceso terminado');
    process.exit(0);
});

// Ejecutar función principal si este archivo es ejecutado directamente
// En Bun, verificamos si el archivo actual es el punto de entrada
const isMainModule = import.meta.main || (process.argv[1] && import.meta.url.includes(process.argv[1])) || import.meta.url.includes('main.js');

if (isMainModule) {
    const startTime = Date.now();
    main().then(() => {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n⏱️  Tiempo total de ejecución: ${totalTime}s`);
    }).catch(error => {
        console.error('\n💥 Error fatal:', error);
        process.exit(1);
    });
}

/**
 * Procesador unificado para resultados de Promise.allSettled - Elimina duplicación y mejora estabilidad
 * ACTUALIZADO: Manejo mejorado de errores críticos vs no críticos
 * @param {Array} baseChannels - Canales base para procesar
 * @param {Object} results - Resultados de deduplicación, conversión y validación
 * @returns {Object} Canales procesados y estadísticas consolidadas
 */
function processParallelResults(baseChannels, { deduplicatedResult, conversionResult, validationResult }) {
    let processedChannels = baseChannels; // Canales que van siendo transformados
    let uniqueChannelsCount = baseChannels.length;
    let convertedChannelsCount = baseChannels.length;
    
    // Procesador de deduplicación con manejo robusto de errores
    if (deduplicatedResult.status === 'fulfilled') {
        const uniqueChannels = deduplicatedResult.value.channels;
        const deduplicationStats = calculateDeduplicationStats(baseChannels.length, uniqueChannels.length);
        
        console.log(`📊 Canales únicos: ${uniqueChannels.length} (${deduplicationStats.efficiency}% únicos)`);
        console.log(`🗑️  Duplicados eliminados: ${deduplicationStats.duplicatesRemoved}`);
        
        processedChannels = uniqueChannels; // Aplicar deduplicación
        uniqueChannelsCount = uniqueChannels.length;
    } else {
        // NOTA: Los errores críticos ya fueron manejados con fail-fast en el flujo principal
        console.error(`❌ Error en deduplicación (ya manejado): ${deduplicatedResult.reason?.message}`);
    }

    // Procesador de conversión HTTPS→HTTP con actualización inteligente
    if (conversionResult.status === 'fulfilled') {
        const convertedChannels = conversionResult.value.processed;
        console.log(`📊 Canales procesados para conversión: ${convertedChannels.length}`);
        console.log(`🔄 Conversiones HTTPS→HTTP: ${conversionResult.value.stats.converted}`);
        console.log(`✅ URLs HTTP funcionales: ${conversionResult.value.stats.httpWorking}`);
        
        // Aplicar conversiones manteniendo integridad de datos
        processedChannels = applyChannelUpdates(processedChannels, convertedChannels);
        convertedChannelsCount = processedChannels.length;
    } else {
        // NOTA: Los errores críticos ya fueron manejados con fail-fast en el flujo principal
        console.error(`❌ Error en conversión (ya manejado): ${conversionResult.reason?.message}`);
    }

    // Procesador de validación con filtrado seguro y fallback mejorado
    if (validationResult.status === 'fulfilled') {
        const { validChannels, invalidChannels, stats } = validationResult.value;
        
        // Filtrar solo canales validados manteniendo consistencia
        processedChannels = processedChannels.filter(channel => 
            validChannels.some(valid => valid.id === channel.id)
        );
        
        console.log(`📊 Canales validados: ${processedChannels.length} (${invalidChannels.length} inválidos)`);
        
        if (stats.processingTime) {
            console.log(`⏱️  Tiempo de validación: ${(stats.processingTime/1000).toFixed(1)}s`);
        }
    } else {
        // Para validación, usar fallback si está disponible (error no crítico)
        if (validationResult.fallback) {
            console.warn(`⚠️  Usando fallback para validación: todos los canales marcados como válidos`);
            // No filtrar canales, mantener todos como válidos por defecto
        } else {
            console.error(`❌ Error en validación sin fallback: ${validationResult.reason?.message}`);
        }
    }

    return {
        validatedChannels: processedChannels,
        uniqueChannelsCount,
        convertedChannelsCount
    };
}

/**
 * Calcula estadísticas de deduplicación de forma consistente
 * @param {number} before - Cantidad antes de deduplicar
 * @param {number} after - Cantidad después de deduplicar
 * @returns {Object} Estadísticas calculadas
 */
function calculateDeduplicationStats(before, after) {
    return {
        beforeDedup: before,
        afterDedup: after,
        duplicatesRemoved: before - after,
        efficiency: ((after / before) * 100).toFixed(1)
    };
}

/**
 * Aplica actualizaciones de canales de forma segura evitando pérdida de datos
 * @param {Array} baseChannels - Canales base
 * @param {Array} updatedChannels - Canales con actualizaciones
 * @returns {Array} Canales con actualizaciones aplicadas
 */
function applyChannelUpdates(baseChannels, updatedChannels) {
    return baseChannels.map(channel => {
        const updated = updatedChannels.find(c => c.id === channel.id);
        return updated || channel; // Usar versión actualizada si existe, sino mantener original
    });
}

/**
 * Asigna IDs únicos a canales que no los tengan
 * @param {Array} channels - Array de canales
 * @returns {Array} Canales con IDs únicos asignados
 */
function assignUniqueIds(channels) {
    return channels.map((channel, index) => {
        // Manejar instancias de la clase Channel que usan propiedades privadas
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
        
        // Para objetos planos usar spread operator
        return {
            ...channel,
            id: channel.id || `channel_${Date.now()}_${index}`,
            originalIndex: index
        };
    });
}

/**
 * Procesa canales en chunks para optimizar rendimiento y mantener funcionalidades
 * @param {Array} channels - Canales a procesar
 * @param {Object} services - Servicios de procesamiento
 * @returns {Array} Canales procesados con todas las mejoras aplicadas
 */
async function processChannelsInChunks(channels, services) {
    const { nameCleaningService, genreDetectionService, logoGenerationService } = services;
    const CHUNK_SIZE = 15; // Tamaño óptimo para procesamiento paralelo
    
    // Dividir canales en chunks
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
            
            // Procesar cada chunk de forma secuencial para mantener consistencia
            let processedChunk = [...chunk];
            
            // DEBUG: Verificar canales antes del procesamiento
            console.log(`     🔍 DEBUG Chunk ${chunkIndex}: Canales antes del procesamiento:`);
            processedChunk.slice(0, 3).forEach((channel, idx) => {
                console.log(`       Canal ${idx + 1}: ${channel.name} -> Género: ${channel.genre}`);
            });
            
            // 1. Limpieza de nombres
            processedChunk = await nameCleaningService.processChannelsInBatches(processedChunk);
            
            // DEBUG: Verificar canales después de limpieza de nombres
            console.log(`     🔍 DEBUG Chunk ${chunkIndex}: Canales después de limpieza:`);
            processedChunk.slice(0, 3).forEach((channel, idx) => {
                console.log(`       Canal ${idx + 1}: ${channel.name} -> Género: ${channel.genre}`);
            });

            // 2. Detección de géneros
            const genreResults = genreDetectionService.processChannels(processedChunk);
            processedChunk = genreResults.channels; // Los géneros ya están aplicados en cada canal
            
            // DEBUG: Verificar canales después de detección de géneros
            console.log(`     🔍 DEBUG Chunk ${chunkIndex}: Canales después de géneros:`);
            processedChunk.slice(0, 3).forEach((channel, idx) => {
                console.log(`       Canal ${idx + 1}: ${channel.name} -> Género: ${channel.genre}`);
            });
            
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
    
    // DEBUG: Verificar contenido de processedChunks
    console.log('🔍 DEBUG processChannelsInChunks: Verificando chunks procesados...');
    processedChunks.slice(0, 2).forEach((chunk, chunkIndex) => {
        console.log(`  Chunk ${chunkIndex}: ${chunk.channels.length} canales`);
        chunk.channels.slice(0, 3).forEach((channel, channelIndex) => {
            console.log(`    Canal ${channelIndex + 1}: ${channel.name} -> Género: ${channel.genre}`);
        });
    });
    console.log(`🔍 DEBUG: Total allProcessedChannels: ${allProcessedChannels.length}`);
    console.log('🔍 DEBUG: Muestra de allProcessedChannels:');
    allProcessedChannels.slice(0, 5).forEach((channel, index) => {
        console.log(`  Canal ${index + 1}: ${channel.name} -> Género: ${channel.genre}`);
    });
    
    // Estadísticas consolidadas
    const totalLogosGenerated = processedChunks.reduce((sum, chunk) => sum + chunk.stats.logosGenerated, 0);
    const cleaningMetrics = nameCleaningService.getMetrics();
    
    // Consolidar estadísticas de géneros
    const allGenreStats = processedChunks.map(chunk => chunk.stats.genreStats);
    const consolidatedGenreStats = consolidateGenreStats(allGenreStats);
    
    console.log(`   ✅ Limpieza: ${cleaningMetrics.totalCleaned}/${cleaningMetrics.totalProcessed} nombres (${cleaningMetrics.cleaningRate}%)`);
    console.log(`   ✅ Géneros: ${consolidatedGenreStats.totalGenres} únicos detectados`);
    console.log(`   ✅ Logos: ${totalLogosGenerated}/${allProcessedChannels.length} generados`);
    
    return allProcessedChannels;
}

/**
 * Consolida estadísticas de géneros de múltiples chunks
 * @param {Array} genreStatsArray - Array de estadísticas de géneros
 * @returns {Object} Estadísticas consolidadas
 */
function consolidateGenreStats(genreStatsArray) {
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

export { main };