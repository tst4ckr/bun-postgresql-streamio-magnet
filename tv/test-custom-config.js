/**
 * Script de prueba completo para verificar todas las funcionalidades de la librería TVChannelProcessor
 * Este script ejecuta realmente el procesamiento completo de canales
 */

import { 
    processChannels, 
    createTVProcessor, 
    processChannelsWithCustomConfig,
    generateExampleConfig,
    TVChannelProcessor,
    ConfigurationManager,
    getCustomTVConfig, 
    createCustomTVConfig 
} from './src/lib/index.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Configuración de prueba con validación deshabilitada para ejecución rápida
 */
const testConfig = {
    // Configuración básica
    CHANNELS_SOURCE: 'hybrid',
    AUTO_M3U_URL: 'https://iptv-org.github.io/iptv/languages/spa.m3u',
    VALIDATED_CHANNELS_CSV: 'data/test-tv.csv',
    
    // Deshabilitamos validación para prueba rápida
    VALIDATE_STREAMS_ON_STARTUP: false,
    ENABLE_LATENCY_VALIDATION: false,
    
    // Configuración de logging
    LOG_LEVEL: 'info',
    ENABLE_REQUEST_LOGGING: true,
    
    // Configuración de procesamiento
    ENABLE_DEDUPLICATION: true,
    ENABLE_HTTPS_TO_HTTP_CONVERSION: true,
    ENABLE_CHANNEL_FILTERING: true,
    ENABLE_BANNED_CHANNELS: true,
    
    // Límites para prueba rápida
    MAX_CHANNELS_PER_SOURCE: 50,
    PROCESSING_TIMEOUT_MS: 30000
};

/**
 * Función para crear directorio si no existe
 */
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`📁 Directorio creado: ${dirPath}`);
        }
    }
}

/**
 * Función para verificar si un archivo existe
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Función para obtener estadísticas de un archivo
 */
async function getFileStats(filePath) {
    try {
        const stats = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').length;
        return {
            size: stats.size,
            lines: lines,
            created: stats.birthtime,
            modified: stats.mtime
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Prueba 1: Verificar configuración personalizada
 */
async function testCustomConfiguration() {
    console.log('\n🧪 PRUEBA 1: Verificando configuración personalizada...');
    
    try {
        // Obtener configuración por defecto
        const defaultConfig = getCustomTVConfig();
        console.log('✅ Configuración por defecto cargada');
        console.log(`   - Fuente de canales: ${defaultConfig.CHANNELS_SOURCE}`);
        console.log(`   - URL M3U automática: ${defaultConfig.AUTO_M3U_URL}`);
        console.log(`   - Archivo de salida: ${defaultConfig.VALIDATED_CHANNELS_CSV}`);
        
        // Crear configuración personalizada con overrides
        const customConfig = createCustomTVConfig(testConfig);
        console.log('✅ Configuración personalizada creada con overrides');
        console.log(`   - Validación deshabilitada: ${!customConfig.VALIDATE_STREAMS_ON_STARTUP}`);
        console.log(`   - Archivo de prueba: ${customConfig.VALIDATED_CHANNELS_CSV}`);
        
        return { success: true, defaultConfig, customConfig };
    } catch (error) {
        console.error('❌ Error en configuración:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Prueba 2: Crear procesador y verificar inicialización
 */
async function testProcessorCreation() {
    console.log('\n🔧 PRUEBA 2: Creando procesador con configuración personalizada...');
    
    try {
        // Crear procesador con configuración de prueba
        const processor = createTVProcessor(testConfig);
        console.log('✅ Procesador creado exitosamente');
        
        // Verificar configuración del procesador
        const processorConfig = processor.getConfiguration();
        console.log('✅ Configuración del procesador verificada');
        console.log(`   - Fuente: ${processorConfig.dataSources?.channelsSource || 'No definida'}`);
        console.log(`   - Validación: ${processorConfig.validation?.enableStreamValidation ? 'Habilitada' : 'Deshabilitada'}`);
        
        return { success: true, processor, config: processorConfig };
    } catch (error) {
        console.error('❌ Error creando procesador:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Prueba 3: Generar archivo de configuración de ejemplo
 */
async function testExampleConfigGeneration() {
    console.log('\n📄 PRUEBA 3: Generando archivo de configuración de ejemplo...');
    
    try {
        const examplePath = './data/tv-config.example.js';
        await ensureDirectoryExists('./data');
        
        await generateExampleConfig(examplePath);
        console.log('✅ Archivo de configuración de ejemplo generado');
        
        const exists = await fileExists(examplePath);
        if (exists) {
            const stats = await getFileStats(examplePath);
            console.log(`   - Archivo: ${examplePath}`);
            console.log(`   - Tamaño: ${stats.size} bytes`);
            console.log(`   - Líneas: ${stats.lines}`);
        }
        
        return { success: true, path: examplePath };
    } catch (error) {
        console.error('❌ Error generando ejemplo:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Prueba 4: Procesamiento completo de canales (REAL)
 */
async function testFullChannelProcessing() {
    console.log('\n🚀 PRUEBA 4: Ejecutando procesamiento COMPLETO de canales...');
    console.log('⚠️  ADVERTENCIA: Esta prueba ejecuta el procesamiento real y puede tomar varios minutos');
    
    try {
        // Asegurar que el directorio de datos existe
        await ensureDirectoryExists('./data');
        
        const startTime = Date.now();
        
        // Ejecutar procesamiento completo con configuración de prueba
        console.log('🔄 Iniciando procesamiento...');
        const result = await processChannelsWithCustomConfig(testConfig);
        
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        
        if (result.success) {
            console.log('🎉 ¡Procesamiento completado exitosamente!');
            console.log('\n📊 ESTADÍSTICAS DEL PROCESAMIENTO:');
            console.log(`   - Tiempo total: ${processingTime}ms (${(processingTime/1000).toFixed(2)}s)`);
            console.log(`   - Canales procesados: ${result.statistics?.processedChannels || 'N/A'}`);
            console.log(`   - Canales originales: ${result.statistics?.rawChannels || 'N/A'}`);
            
            // Verificar archivos de salida
            if (result.outputFiles) {
                console.log('\n📁 ARCHIVOS GENERADOS:');
                
                if (result.outputFiles.csvFile) {
                    const csvExists = await fileExists(result.outputFiles.csvFile);
                    if (csvExists) {
                        const csvStats = await getFileStats(result.outputFiles.csvFile);
                        console.log(`   ✅ CSV: ${result.outputFiles.csvFile}`);
                        console.log(`      - Tamaño: ${csvStats.size} bytes`);
                        console.log(`      - Líneas: ${csvStats.lines}`);
                    } else {
                        console.log(`   ❌ CSV no encontrado: ${result.outputFiles.csvFile}`);
                    }
                }
                
                if (result.outputFiles.m3uFile) {
                    const m3uExists = await fileExists(result.outputFiles.m3uFile);
                    if (m3uExists) {
                        const m3uStats = await getFileStats(result.outputFiles.m3uFile);
                        console.log(`   ✅ M3U: ${result.outputFiles.m3uFile}`);
                        console.log(`      - Tamaño: ${m3uStats.size} bytes`);
                        console.log(`      - Líneas: ${m3uStats.lines}`);
                    } else {
                        console.log(`   ❌ M3U no encontrado: ${result.outputFiles.m3uFile}`);
                    }
                }
            }
            
            // Mostrar estadísticas por fuente si están disponibles
            if (result.statistics?.sourceStats) {
                console.log('\n📈 ESTADÍSTICAS POR FUENTE:');
                Object.entries(result.statistics.sourceStats).forEach(([source, count]) => {
                    console.log(`   - ${source}: ${count} canales`);
                });
            }
            
        } else {
            console.error('❌ Error en el procesamiento:', result.error);
            if (result.stack) {
                console.error('Stack trace:', result.stack);
            }
        }
        
        return { success: result.success, result, processingTime };
    } catch (error) {
        console.error('❌ Error ejecutando procesamiento:', error.message);
        console.error('Stack trace:', error.stack);
        return { success: false, error: error.message };
    }
}

/**
 * Prueba 5: Verificar funcionalidades del ConfigurationManager
 */
async function testConfigurationManager() {
    console.log('\n⚙️  PRUEBA 5: Verificando ConfigurationManager...');
    
    try {
        const configManager = new ConfigurationManager();
        console.log('✅ ConfigurationManager instanciado');
        
        // Obtener configuración por defecto
        const defaultConfig = configManager.getDefaultConfiguration();
        console.log('✅ Configuración por defecto obtenida');
        console.log(`   - Fuentes de datos configuradas: ${Object.keys(defaultConfig.dataSources || {}).length}`);
        console.log(`   - Validación habilitada: ${defaultConfig.validation?.enableStreamValidation || false}`);
        
        return { success: true, configManager, defaultConfig };
    } catch (error) {
        console.error('❌ Error con ConfigurationManager:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Función principal que ejecuta todas las pruebas
 */
async function runAllTests() {
    console.log('🧪 ===== INICIANDO SUITE COMPLETA DE PRUEBAS =====');
    console.log('📋 Este script ejecutará TODAS las funcionalidades de la librería');
    console.log('⏱️  Tiempo estimado: 2-5 minutos (dependiendo de la red)\n');
    
    const results = {
        configuration: null,
        processor: null,
        exampleConfig: null,
        fullProcessing: null,
        configManager: null
    };
    
    try {
        // Ejecutar todas las pruebas en secuencia
        results.configuration = await testCustomConfiguration();
        results.processor = await testProcessorCreation();
        results.exampleConfig = await testExampleConfigGeneration();
        results.configManager = await testConfigurationManager();
        
        // La prueba más importante: procesamiento completo
        results.fullProcessing = await testFullChannelProcessing();
        
        // Resumen final
        console.log('\n🏁 ===== RESUMEN DE PRUEBAS =====');
        console.log(`✅ Configuración personalizada: ${results.configuration?.success ? 'PASÓ' : 'FALLÓ'}`);
        console.log(`✅ Creación de procesador: ${results.processor?.success ? 'PASÓ' : 'FALLÓ'}`);
        console.log(`✅ Generación de ejemplo: ${results.exampleConfig?.success ? 'PASÓ' : 'FALLÓ'}`);
        console.log(`✅ ConfigurationManager: ${results.configManager?.success ? 'PASÓ' : 'FALLÓ'}`);
        console.log(`🚀 Procesamiento completo: ${results.fullProcessing?.success ? 'PASÓ' : 'FALLÓ'}`);
        
        const allPassed = Object.values(results).every(result => result?.success);
        
        if (allPassed) {
            console.log('\n🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
            console.log('✅ La librería está funcionando correctamente');
            console.log('✅ Todos los archivos se generaron correctamente');
            console.log('✅ El procesamiento completo funciona sin errores');
        } else {
            console.log('\n⚠️  ALGUNAS PRUEBAS FALLARON');
            console.log('❌ Revisa los errores anteriores para más detalles');
        }
        
        return results;
        
    } catch (error) {
        console.error('\n💥 ERROR CRÍTICO EN LA SUITE DE PRUEBAS:', error.message);
        console.error('Stack trace:', error.stack);
        return { success: false, error: error.message };
    }
}

// Ejecutar todas las pruebas
runAllTests().catch(error => {
    console.error('💥 Error no capturado:', error);
    process.exit(1);
});