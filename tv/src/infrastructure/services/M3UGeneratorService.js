import {
    sanitizeTitle,
    isValidChannel,
    generateExtInf,
    generateExtendedExtInf,
    groupChannelsByCategory,
    sortCategories,
    validateChannelsArray,
    generateMetadataLines,
    generateCategorySeparator
} from './M3UGeneratorService_tools.js';

/**
 * Servicio para generar archivos M3U con los canales procesados
 * Implementa la funcionalidad principal para crear playlists M3U
 * La lógica principal se concentra en la orquestación de la generación,
 * mientras que las herramientas auxiliares están separadas en _tools.js
 */
class M3UGeneratorService {
    constructor() {
        this.header = '#EXTM3U';
    }

    /**
     * Genera un archivo M3U a partir de una lista de canales usando herramientas auxiliares
     * @param {Array} channels - Array de objetos Channel
     * @param {Object} options - Opciones de configuración
     * @returns {string} Contenido del archivo M3U
     */
    generateM3U(channels, options = {}) {
        validateChannelsArray(channels);

        const lines = [this.header];
        
        channels.forEach(channel => {
            if (isValidChannel(channel)) {
                const extinf = generateExtInf(channel);
                lines.push(extinf);
                lines.push(channel.streamUrl || channel.url);
            }
        });

        return lines.join('\n');
    }

    /**
     * Genera un archivo M3U con metadatos extendidos usando herramientas auxiliares
     * @param {Array} channels - Array de objetos Channel
     * @param {Object} metadata - Metadatos adicionales
     * @returns {string} Contenido del archivo M3U extendido
     */
    generateExtendedM3U(channels, metadata = {}) {
        const lines = [this.header];
        
        // Agregar metadatos usando herramientas auxiliares
        const metadataLines = generateMetadataLines(metadata);
        lines.push(...metadataLines);

        channels.forEach(channel => {
            if (isValidChannel(channel)) {
                const extinf = generateExtendedExtInf(channel);
                lines.push(extinf);
                lines.push(channel.streamUrl || channel.url);
            }
        });

        return lines.join('\n');
    }

    /**
     * Agrupa canales por categoría y genera M3U organizado usando herramientas auxiliares
     * @param {Array} channels - Array de objetos Channel
     * @returns {string} Contenido del archivo M3U organizado por categorías
     */
    generateCategorizedM3U(channels) {
        validateChannelsArray(channels);

        const lines = [this.header];
        
        // Agrupar canales por categoría usando herramientas auxiliares
        const channelsByCategory = groupChannelsByCategory(channels);
        
        // Generar M3U organizado por categorías con orden personalizado
        const sortedCategories = sortCategories(Object.keys(channelsByCategory));
        sortedCategories.forEach(category => {
            const separatorLines = generateCategorySeparator(category);
            lines.push(...separatorLines);
            
            channelsByCategory[category].forEach(channel => {
                if (isValidChannel(channel)) {
                    const extinf = generateExtInf(channel);
                    lines.push(extinf);
                    lines.push(channel.streamUrl || channel.url);
                }
            });
            
            lines.push(''); // Línea en blanco entre categorías
        });

        return lines.join('\n');
    }
}

export default M3UGeneratorService;