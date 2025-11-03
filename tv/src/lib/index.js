/**
 * TV Channel Processing Library
 * 
 * Librería completa para procesamiento de canales IPTV que incluye:
 * - Carga y filtrado de canales desde múltiples fuentes
 * - Deduplicación inteligente de canales
 * - Conversión HTTPS a HTTP
 * - Validación de streams
 * - Detección automática de géneros
 * - Generación de logos
 * - Limpieza de nombres de canales
 * - Generación de archivos CSV y M3U
 * 
 * @example
 * // Uso básico
 * import { TVChannelProcessorFactory } from './lib/index.js';
 * 
 * const processor = TVChannelProcessorFactory.createDefault();
 * await processor.run();
 * 
 * @example
 * // Uso avanzado con configuración personalizada
 * import { TVChannelProcessor } from './lib/index.js';
 * 
 * const processor = new TVChannelProcessor({
 *   enableLogging: true,
 *   outputDirectory: 'custom-output',
 *   chunkSize: 20
 * });
 * 
 * await processor.initialize();
 * const results = await processor.processChannels();
 * console.log(processor.getProcessingStats());
 */

// Exportaciones principales
export { TVChannelProcessor } from './TVChannelProcessor.js';
export { TVChannelProcessorFactory } from './TVChannelProcessorFactory.js';

// Exportación por defecto para compatibilidad
export { TVChannelProcessorFactory as default } from './TVChannelProcessorFactory.js';

/**
 * Funciones de conveniencia para casos de uso comunes
 */

/**
 * Procesa canales con configuración por defecto
 * @param {Object} options - Opciones de configuración
 * @returns {Promise<Object>} Resultados del procesamiento
 */
export async function processChannels(options = {}) {
    const processor = TVChannelProcessorFactory.createDefault(options);
    return await processor.run();
}

/**
 * Procesa canales de forma silenciosa (sin logging)
 * @param {Object} options - Opciones de configuración
 * @returns {Promise<Object>} Resultados del procesamiento
 */
export async function processChannelsSilent(options = {}) {
    const processor = TVChannelProcessorFactory.createSilent(options);
    return await processor.run();
}

/**
 * Procesa canales de forma rápida (sin validación pesada)
 * @param {Object} options - Opciones de configuración
 * @returns {Promise<Object>} Resultados del procesamiento
 */
export async function processChannelsFast(options = {}) {
    const processor = TVChannelProcessorFactory.createFast(options);
    return await processor.run();
}

/**
 * Procesa canales con todas las características habilitadas
 * @param {Object} options - Opciones de configuración
 * @returns {Promise<Object>} Resultados del procesamiento
 */
export async function processChannelsComplete(options = {}) {
    const processor = TVChannelProcessorFactory.createComplete(options);
    return await processor.run();
}