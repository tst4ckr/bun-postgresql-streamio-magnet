#!/usr/bin/env node

/**
 * @fileoverview Ejecutor principal de TVChannelProcessor
 * Usa únicamente la configuración de tv-config.js sin dependencias de getCustomTVConfig()
 * Ejecuta todo el procesamiento de canales y genera archivos CSV/M3U
 */

import { TVChannelProcessor } from './src/lib/index.js';
import tvConfig from './data/tv-config.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Función principal que ejecuta el procesamiento completo
 */
async function main() {
    console.log('🚀 INICIANDO PROCESADOR DE CANALES TV');
    console.log('=====================================');
    
    const startTime = Date.now();
    
    try {
        // Verificar que existe la configuración
        if (!tvConfig) {
            throw new Error('❌ No se pudo cargar la configuración de tv-config.js');
        }
        
        console.log('✅ Configuración cargada desde tv-config.js');
        console.log(`📊 Fuente principal: ${tvConfig.dataSources?.channelsSource || 'No definida'}`);
        console.log(`📁 Directorio de salida CSV: ${tvConfig.csv?.outputDirectory || 'data'}`);
        console.log(`📁 Directorio de salida M3U: ${tvConfig.m3u?.outputDirectory || 'data'}`);
        
        // Crear directorios de salida si no existen
        await ensureDirectoriesExist(tvConfig);
        
        // Crear el procesador con la configuración de tv-config.js
        console.log('\n🔧 Inicializando TVChannelProcessor...');
        const processor = new TVChannelProcessor(tvConfig, {
            logger: createCustomLogger(),
            silent: false
        });
        
        console.log('✅ Procesador inicializado correctamente');
        
        // Ejecutar el procesamiento completo
        console.log('\n🎬 Iniciando procesamiento de canales...');
        const result = await processor.processChannels();
        
        // Mostrar resultados
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        console.log('\n🎉 PROCESAMIENTO COMPLETADO');
        console.log('============================');
        
        if (result.success) {
            console.log('✅ Estado: EXITOSO');
            console.log(`📊 Canales procesados: ${result.statistics?.processedChannels || 0}`);
            console.log(`📊 Canales originales: ${result.statistics?.rawChannels || 0}`);
            console.log(`⏱️  Tiempo total: ${formatTime(totalTime)}`);
            console.log(`⏱️  Tiempo de procesamiento: ${formatTime(result.statistics?.processingTime || 0)}`);
            
            // Mostrar archivos generados
            if (result.outputFiles) {
                console.log('\n📁 Archivos generados:');
                Object.entries(result.outputFiles).forEach(([type, filePath]) => {
                    console.log(`   ${type.toUpperCase()}: ${filePath}`);
                });
            }
            
            // Mostrar estadísticas de fuentes
            if (result.statistics?.sourceStats) {
                console.log('\n📡 Estadísticas por fuente:');
                Object.entries(result.statistics.sourceStats).forEach(([source, count]) => {
                    console.log(`   ${source}: ${count} canales`);
                });
            }
            
            // Verificar archivos generados
            await verifyGeneratedFiles(result.outputFiles);
            
        } else {
            console.error('❌ Estado: ERROR');
            console.error(`❌ Error: ${result.error}`);
            if (result.stack) {
                console.error('📋 Stack trace:');
                console.error(result.stack);
            }
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n💥 ERROR CRÍTICO EN EL PROCESAMIENTO');
        console.error('=====================================');
        console.error(`❌ Error: ${error.message}`);
        console.error(`📋 Stack: ${error.stack}`);
        process.exit(1);
    }
}

/**
 * Crea un logger personalizado con formato mejorado
 */
function createCustomLogger() {
    const getTimestamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    return {
        info: (msg, ...args) => {
            console.log(`[${getTimestamp()}] [INFO] ${msg}`, ...args);
        },
        warn: (msg, ...args) => {
            console.warn(`[${getTimestamp()}] [WARN] ${msg}`, ...args);
        },
        error: (msg, ...args) => {
            console.error(`[${getTimestamp()}] [ERROR] ${msg}`, ...args);
        },
        debug: (msg, ...args) => {
            if (process.env.DEBUG || process.env.LOG_LEVEL === 'debug') {
                console.log(`[${getTimestamp()}] [DEBUG] ${msg}`, ...args);
            }
        },
        fatal: (msg, ...args) => {
            console.error(`[${getTimestamp()}] [FATAL] ${msg}`, ...args);
        }
    };
}

/**
 * Asegura que los directorios de salida existan
 */
async function ensureDirectoriesExist(config) {
    const directories = new Set();
    
    // Directorio CSV
    if (config.csv?.outputDirectory) {
        directories.add(config.csv.outputDirectory);
    }
    
    // Directorio M3U
    if (config.m3u?.outputDirectory) {
        directories.add(config.m3u.outputDirectory);
    }
    
    // Directorio de logs
    if (config.logging?.logFilePath) {
        const logDir = path.dirname(config.logging.logFilePath);
        directories.add(logDir);
    }
    
    // Crear directorios
    for (const dir of directories) {
        try {
            await fs.mkdir(dir, { recursive: true });
            console.log(`📁 Directorio asegurado: ${dir}`);
        } catch (error) {
            console.warn(`⚠️  No se pudo crear directorio ${dir}: ${error.message}`);
        }
    }
}

/**
 * Verifica que los archivos se hayan generado correctamente
 */
async function verifyGeneratedFiles(outputFiles) {
    if (!outputFiles) return;
    
    console.log('\n🔍 Verificando archivos generados...');
    
    for (const [type, filePath] of Object.entries(outputFiles)) {
        try {
            const stats = await fs.stat(filePath);
            const sizeKB = Math.round(stats.size / 1024);
            console.log(`✅ ${type.toUpperCase()}: ${filePath} (${sizeKB} KB)`);
        } catch (error) {
            console.error(`❌ ${type.toUpperCase()}: ${filePath} - No encontrado`);
        }
    }
}

/**
 * Formatea tiempo en milisegundos a formato legible
 */
function formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Manejo de señales del sistema
 */
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Procesamiento interrumpido por el usuario');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n⚠️  Procesamiento terminado por el sistema');
    process.exit(0);
});

// Ejecutar función principal
main().catch(error => {
    console.error('💥 Error no capturado:', error);
    process.exit(1);
});

export default main;