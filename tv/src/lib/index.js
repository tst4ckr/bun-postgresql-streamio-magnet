/**
 * @fileoverview Punto de entrada principal de la librería TVChannelProcessor
 * Exporta todas las funcionalidades públicas de forma organizada
 */

import { TVChannelProcessor } from './TVChannelProcessor.js';
import { ConfigurationManager } from './ConfigurationManager.js';
import { customTVConfig, getCustomTVConfig, createCustomTVConfig } from './CustomTVConfig.js';

// Re-exportar las clases principales
export { TVChannelProcessor, ConfigurationManager };

// Re-exportar la configuración personalizada
export { customTVConfig, getCustomTVConfig, createCustomTVConfig };

/**
 * Función de conveniencia para crear y ejecutar el procesador en una sola llamada
 * Usa la configuración personalizada por defecto si no se proporciona ninguna
 * @param {Object|string} config - Configuración como objeto o ruta a archivo (opcional)
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} Resultado del procesamiento
 */
export async function processChannels(config = null, options = {}) {
    // Si no se proporciona configuración, usar la configuración personalizada
    const finalConfig = config || getCustomTVConfig();
    const processor = new TVChannelProcessor(finalConfig, options);
    return await processor.processChannels();
}

/**
 * Función de conveniencia para crear el procesador con configuración personalizada
 * @param {Object} overrides - Configuraciones que sobrescriben las por defecto
 * @param {Object} options - Opciones adicionales
 * @returns {TVChannelProcessor} Instancia del procesador configurado
 */
export function createTVProcessor(overrides = {}, options = {}) {
    const config = createCustomTVConfig(overrides);
    return new TVChannelProcessor(config, options);
}

/**
 * Función para procesar canales con configuración personalizada y overrides
 * @param {Object} overrides - Configuraciones que sobrescriben las por defecto
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} Resultado del procesamiento
 */
export async function processChannelsWithCustomConfig(overrides = {}, options = {}) {
    const processor = createTVProcessor(overrides, options);
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
    customTVConfig,
    getCustomTVConfig,
    createCustomTVConfig,
    createTVProcessor,
    processChannels,
    processChannelsWithCustomConfig,
    generateExampleConfig
};