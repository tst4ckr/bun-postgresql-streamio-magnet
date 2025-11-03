/**
 * @fileoverview Punto de entrada principal de la librería TVChannelProcessor
 * Exporta todas las funcionalidades públicas de forma organizada
 */

import { TVChannelProcessor } from './TVChannelProcessor.js';
import { ConfigurationManager } from './ConfigurationManager.js';

// Re-exportar las clases principales
export { TVChannelProcessor, ConfigurationManager };

/**
 * Función de conveniencia para crear y ejecutar el procesador en una sola llamada
 * @param {Object|string} config - Configuración como objeto o ruta a archivo
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} Resultado del procesamiento
 */
export async function processChannels(config = null, options = {}) {
    const processor = new TVChannelProcessor(config, options);
    return await processor.processChannels();
}

/**
 * Función para generar un archivo de configuración de ejemplo
 * @param {string} outputPath - Ruta donde guardar el archivo de ejemplo
 * @returns {Promise<void>}
 */
export async function generateExampleConfig(outputPath = './tv-config.example.js') {
    const configManager = new ConfigurationManager();
    return await configManager.generateExampleConfig(outputPath);
}

// Exportación por defecto para compatibilidad
export default {
    TVChannelProcessor,
    ConfigurationManager,
    processChannels,
    generateExampleConfig
};