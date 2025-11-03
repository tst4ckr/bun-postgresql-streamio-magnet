/**
 * Ejemplo de uso de la librería TVChannelProcessor desde la carpeta tv/src/lib
 *
 * Cómo ejecutarlo (desde la raíz del repositorio):
 *
 * 1) Usar configuración por defecto (tv/data/tv-config.js):
 *    - Bun:  bun tv/src/lib/example-usage.js
 *    - Node: node tv/src/lib/example-usage.js
 *
 * 2) Usar una ruta de configuración específica:
 *    - Bun:  bun tv/src/lib/example-usage.js tv/data/tv-config.js
 *    - Node: node tv/src/lib/example-usage.js tv/data/tv-config.js
 *
 * 3) Generar un archivo de configuración de ejemplo:
 *    - Bun:  bun tv/src/lib/example-usage.js --generate-example [ruta_opcional]
 *    - Node: node tv/src/lib/example-usage.js --generate-example [ruta_opcional]
 */

import { processChannels, generateExampleConfig } from './index.js';

/**
 * Parser de argumentos de línea de comandos
 * Responsabilidad única: extraer y validar argumentos
 */
class ArgumentParser {
    constructor(args) {
        this.args = args;
    }

    hasFlag(flag) {
        return this.args.includes(flag);
    }

    getFlagValue(flag) {
        const idx = this.args.indexOf(flag);
        return (idx !== -1 && idx + 1 < this.args.length && !this.args[idx + 1].startsWith('--')) 
            ? this.args[idx + 1] 
            : null;
    }

    getConfigPath() {
        return this.args.find(arg => !arg.startsWith('--')) || null;
    }
}

/**
 * Manejador de comandos
 * Responsabilidad única: ejecutar comandos específicos
 */
class CommandHandler {
    constructor(parser) {
        this.parser = parser;
    }

    async handleGenerateExample() {
        if (!this.parser.hasFlag('--generate-example')) return false;

        const outputPath = this.parser.getFlagValue('--generate-example') || './tv-config.example.js';
        
        try {
            await generateExampleConfig(outputPath);
            console.log(`[OK] Archivo de configuración de ejemplo generado en: ${outputPath}`);
            return true;
        } catch (error) {
            console.error('[ERROR] No se pudo generar el archivo de ejemplo:', error.message);
            process.exitCode = 1;
            return true;
        }
    }

    async handleProcessChannels() {
        const configSource = this.parser.getConfigPath();
        
        try {
            console.log('[INFO] Iniciando procesamiento de canales...');
            
            if (configSource) {
                console.log(`[INFO] Usando configuración desde: ${configSource}`);
            } else {
                console.log('[INFO] Usando configuración por defecto (tv/data/tv-config.js)');
            }

            const result = await processChannels(configSource, {});
            this.displayResult(result);
            
        } catch (error) {
            console.error('\n[ERROR] Fallo durante el procesamiento de canales:', error.message);
            if (error.stack && process.env.NODE_ENV === 'development') {
                console.error('Stack trace:', error.stack);
            }
            process.exitCode = 1;
        }
    }

    displayResult(result) {
        console.log('\n[OK] Procesamiento completado. Resumen:');
        try {
            console.log(JSON.stringify(result, null, 2));
        } catch (serializationError) {
            console.log('[WARN] No se pudo serializar el resultado completo, mostrando versión simplificada:');
            console.log(result);
        }
    }
}

/**
 * Función principal
 * Responsabilidad única: coordinar la ejecución del programa
 */
async function main() {
    const args = process.argv.slice(2);
    const parser = new ArgumentParser(args);
    const handler = new CommandHandler(parser);

    // Manejar comando de generación de ejemplo
    const exampleHandled = await handler.handleGenerateExample();
    if (exampleHandled) return;

    // Manejar procesamiento de canales
    await handler.handleProcessChannels();
}

// Ejecutar programa principal con manejo de errores global
main().catch(error => {
    console.error('[FATAL] Error inesperado:', error.message);
    if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace:', error.stack);
    }
    process.exitCode = 1;
});