/**
 * Main entry point - Generador de TV.CSV y Playlist M3U
 * Ahora utiliza la librería TVChannelProcessor para procesamiento modular
 */

import { TVChannelProcessorFactory } from './lib/index.js';

/**
 * Función principal simplificada que utiliza la librería
 */
async function main() {
    const startTime = Date.now();
    
    try {
        console.log('=== GENERADOR DE TV.CSV Y PLAYLIST M3U ===');
        console.log('Iniciando proceso de generación automática...\n');

        // Crear procesador con configuración por defecto
        const processor = TVChannelProcessorFactory.createDefault({
            enableLogging: true,
            outputDirectory: 'data'
        });

        // Ejecutar procesamiento completo
        const results = await processor.run();

        // Mostrar estadísticas finales
        const stats = processor.getProcessingStats();
        showFinalSummary(stats, startTime);

        return results;

    } catch (error) {
        console.error('❌ Error crítico en el procesamiento:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

/**
 * Muestra el resumen final del procesamiento
 */
function showFinalSummary(stats, startTime) {
    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 PROCESAMIENTO COMPLETADO EXITOSAMENTE');
    console.log('='.repeat(60));
    
    console.log(`📊 Estadísticas finales:`);
    console.log(`   • Canales procesados: ${stats.processedChannels || 0}`);
    console.log(`   • Canales válidos: ${stats.validChannels || 0}`);
    console.log(`   • Canales duplicados eliminados: ${stats.duplicatesRemoved || 0}`);
    console.log(`   • Conversiones HTTPS→HTTP: ${stats.httpsToHttpConversions || 0}`);
    console.log(`   • Géneros detectados: ${stats.genresDetected || 0}`);
    console.log(`   • Logos generados: ${stats.logosGenerated || 0}`);
    
    if (stats.outputPaths) {
        console.log(`\n📁 Archivos generados:`);
        if (stats.outputPaths.csv) {
            console.log(`   • CSV: ${stats.outputPaths.csv}`);
        }
        if (stats.outputPaths.m3u) {
            console.log(`   • M3U: ${stats.outputPaths.m3u}`);
        }
    }
    
    console.log(`\n⏱️  Tiempo total: ${totalTime}s`);
    console.log('='.repeat(60));
}

// Manejo de señales del sistema
process.on('SIGINT', () => {
    console.log('\n⚠️  Proceso interrumpido por el usuario');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n⚠️  Proceso terminado por el sistema');
    process.exit(0);
});

// Ejecutar si es el módulo principal
const isMainModule = import.meta.main || 
                    (process.argv[1] && import.meta.url.includes(process.argv[1])) || 
                    import.meta.url.includes('main.js');

if (isMainModule) {
    const startTime = Date.now();
    main().then(() => {
        const endTime = Date.now();
        console.log(`\n✅ Proceso completado en ${((endTime - startTime) / 1000).toFixed(2)}s`);
    }).catch(error => {
        console.error('❌ Error fatal:', error.message);
        process.exit(1);
    });
}

export { main };