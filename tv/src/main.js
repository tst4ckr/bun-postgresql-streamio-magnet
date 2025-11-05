/**
 * Cliente principal para el procesamiento de canales IPTV
 * 
 * Este archivo actúa como punto de entrada y cliente de la librería IPTV.
 * Toda la lógica de procesamiento ha sido movida a la carpeta lib.
 * 
 * @module Main
 */

// Cargar variables de entorno primero
import { config } from 'dotenv';
config({ path: '.env' });

import { IPTVLibraryFactory } from './lib/index.js';

/**
 * Función principal que ejecuta el procesamiento completo de IPTV
 * Utiliza la librería para realizar todo el trabajo pesado
 */
async function main() {
    let library = null;
    
    try {
        // Crear instancia de la librería con configuración estándar
        library = IPTVLibraryFactory.createStandard({
            enableLogging: true,
            enableMetrics: true,
            enableValidation: process.env.ENABLE_STREAM_VALIDATION !== 'false',
            chunkSize: parseInt(process.env.CHUNK_SIZE) || 15
        });

        // Configurar manejadores de eventos para monitoreo
        setupEventHandlers(library);

        // Ejecutar el procesamiento completo
        console.log('� Iniciando procesamiento de canales IPTV...\n');
        
        const result = await library.processComplete();

        // Mostrar resultado final
        if (result.success) {
            console.log('\n✅ Procesamiento completado exitosamente');
            console.log(`📊 Archivos generados:`);
            console.log(`   - CSV: ${result.files.csv}`);
            console.log(`   - M3U: ${result.files.m3u}`);
            
            if (result.metrics) {
                const totalTime = (result.metrics.startTime ? Date.now() - result.metrics.startTime : 0) / 1000;
                console.log(`⏱️  Tiempo total: ${totalTime.toFixed(2)}s`);
            }
        }

        return result;

    } catch (error) {
        console.error('\n❌ Error en el procesamiento principal:');
        console.error(error.message);
        
        if (process.env.NODE_ENV === 'development') {
            console.error('\n🔧 Stack trace:');
            console.error(error.stack);
        }
        
        process.exit(1);
        
    } finally {
        // Limpieza de recursos
        if (library) {
            try {
                await library.cleanup();
            } catch (cleanupError) {
                console.warn('⚠️  Error durante la limpieza:', cleanupError.message);
            }
        }
    }
}

/**
 * Configura los manejadores de eventos para monitorear el progreso
 * @param {IPTVLibrary} library - Instancia de la librería
 */
function setupEventHandlers(library) {
    // Eventos de inicialización
    library.on('initializing', () => {
        console.log('🔧 Inicializando librería...');
    });

    library.on('initialized', () => {
        console.log('✅ Librería inicializada correctamente\n');
    });

    // Eventos de procesamiento
    library.on('processing-started', () => {
        console.log('🔄 Iniciando procesamiento...');
    });

    library.on('processing-completed', (result) => {
        console.log('✅ Procesamiento completado');
    });

    library.on('processing-error', (error) => {
        console.error('❌ Error en procesamiento:', error.message);
    });

    // Eventos de plugins
    library.on('plugin-registered', (plugin) => {
        console.log(`📦 Plugin registrado: ${plugin.name || 'Plugin sin nombre'}`);
    });

    // Eventos de limpieza
    library.on('cleanup-started', () => {
        console.log('🧹 Iniciando limpieza de recursos...');
    });

    library.on('cleanup-completed', () => {
        console.log('✅ Limpieza completada');
    });

    // Manejo de errores generales
    library.on('error', (error) => {
        console.error('💥 Error en la librería:', error.message);
    });
}

/**
 * Manejador de señales del sistema para cierre limpio
 */
function setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM'];
    
    signals.forEach(signal => {
        process.on(signal, async () => {
            console.log(`\n📡 Señal ${signal} recibida. Cerrando aplicación...`);
            
            try {
                // Aquí se podría agregar lógica de limpieza adicional si fuera necesaria
                console.log('✅ Aplicación cerrada correctamente');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error durante el cierre:', error.message);
                process.exit(1);
            }
        });
    });
}

/**
 * Verifica si este archivo se está ejecutando directamente
 */
function isMainModule() {
    // En ES modules, no existe require.main, usamos import.meta.url
    return import.meta.url === `file://${process.argv[1]}` || 
           process.argv[1]?.endsWith('main.js');
}

// Configurar manejadores de señales
setupSignalHandlers();

// Ejecutar solo si es el módulo principal
if (isMainModule()) {
    main().catch(error => {
        console.error('💥 Error fatal en main:', error.message);
        process.exit(1);
    });
}

// Exportar para uso como módulo
export { main };
export default main;