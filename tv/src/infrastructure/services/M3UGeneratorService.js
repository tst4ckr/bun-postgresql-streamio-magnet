/**
 * Servicio para generar archivos M3U con los canales procesados
 * Implementa la funcionalidad principal para crear playlists M3U
 */
class M3UGeneratorService {
    constructor() {
        this.header = '#EXTM3U';
    }

    /**
     * Genera un archivo M3U a partir de una lista de canales
     * @param {Array} channels - Array de objetos Channel
     * @param {Object} options - Opciones de configuración
     * @returns {string} Contenido del archivo M3U
     */
    generateM3U(channels, options = {}) {
        if (!Array.isArray(channels)) {
            throw new Error('Los canales deben ser un array');
        }

        const lines = [this.header];
        
        channels.forEach(channel => {
            if (this._isValidChannel(channel)) {
                const extinf = this._generateExtInf(channel);
                lines.push(extinf);
                lines.push(channel.streamUrl || channel.url);
            }
        });

        return lines.join('\n');
    }

    /**
     * Genera la línea EXTINF para un canal
     * @param {Object} channel - Objeto Channel
     * @returns {string} Línea EXTINF formateada
     */
    _generateExtInf(channel) {
        const duration = -1; // -1 indica stream en vivo
        const title = this._sanitizeTitle(channel.name || 'Canal sin nombre');
        const group = channel.category ? ` group-title="${channel.category}"` : '';
        const logo = channel.logo ? ` tvg-logo="${channel.logo}"` : '';
        const id = channel.id ? ` tvg-id="${channel.id}"` : '';
        
        return `#EXTINF:${duration}${group}${logo}${id}, ${title}`;
    }

    /**
     * Sanitiza el título del canal para el formato M3U
     * @param {string} title - Título original
     * @returns {string} Título sanitizado
     */
    _sanitizeTitle(title) {
        return title
            .replace(/[^\w\s\-\.\(\)\[\]]/g, '') // Remover caracteres especiales
            .trim();
    }

    /**
     * Valida si un canal es válido para incluir en el M3U
     * @param {Object} channel - Objeto Channel
     * @returns {boolean} True si es válido
     */
    _isValidChannel(channel) {
        const streamUrl = channel.streamUrl || channel.url;
        return channel && 
               typeof streamUrl === 'string' && 
               streamUrl.trim() !== '' &&
               (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'));
    }

    /**
     * Genera un archivo M3U con metadatos extendidos
     * @param {Array} channels - Array de objetos Channel
     * @param {Object} metadata - Metadatos adicionales
     * @returns {string} Contenido del archivo M3U extendido
     */
    generateExtendedM3U(channels, metadata = {}) {
        const lines = [this.header];
        
        // Agregar metadatos si están disponibles
        if (metadata.title) {
            lines.push(`#PLAYLIST:${metadata.title}`);
        }
        
        if (metadata.description) {
            lines.push(`#EXTDESC:${metadata.description}`);
        }

        channels.forEach(channel => {
            if (this._isValidChannel(channel)) {
                const extinf = this._generateExtendedExtInf(channel);
                lines.push(extinf);
                lines.push(channel.streamUrl || channel.url);
            }
        });

        return lines.join('\n');
    }

    /**
     * Genera una línea EXTINF extendida con más metadatos
     * @param {Object} channel - Objeto Channel
     * @returns {string} Línea EXTINF extendida
     */
    _generateExtendedExtInf(channel) {
        const duration = -1;
        const title = this._sanitizeTitle(channel.name || 'Canal sin nombre');
        
        const attributes = [];
        
        if (channel.category) {
            attributes.push(`group-title="${channel.category}"`);
        }
        
        if (channel.logo) {
            attributes.push(`tvg-logo="${channel.logo}"`);
        }
        
        if (channel.id) {
            attributes.push(`tvg-id="${channel.id}"`);
        }
        
        if (channel.language) {
            attributes.push(`tvg-language="${channel.language}"`);
        }
        
        if (channel.country) {
            attributes.push(`tvg-country="${channel.country}"`);
        }

        const attributeString = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
        
        return `#EXTINF:${duration}${attributeString}, ${title}`;
    }

    /**
     * Agrupa canales por categoría y genera M3U organizado
     * @param {Array} channels - Array de objetos Channel
     * @returns {string} Contenido del archivo M3U organizado por categorías
     */
    generateCategorizedM3U(channels) {
        if (!Array.isArray(channels)) {
            throw new Error('Los canales deben ser un array');
        }

        const lines = [this.header];
        
        // Agrupar canales por categoría
        const channelsByCategory = this._groupChannelsByCategory(channels);
        
        // Orden personalizado de categorías solicitado por el usuario
        const categoryOrder = [
            'TV Local',
            'TV Premium', 
            'Deportes',
            'Infantil'
        ];
        
        // Función para ordenar categorías según prioridad personalizada
        const sortCategories = (categories) => {
            return categories.sort((a, b) => {
                const indexA = categoryOrder.indexOf(a);
                const indexB = categoryOrder.indexOf(b);
                
                // Si ambas están en el orden personalizado, usar ese orden
                if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB;
                }
                
                // Si solo una está en el orden personalizado, darle prioridad
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                
                // Si ninguna está en el orden personalizado, orden alfabético
                return a.localeCompare(b);
            });
        };
        
        // Generar M3U organizado por categorías con orden personalizado
        const sortedCategories = sortCategories(Object.keys(channelsByCategory));
        sortedCategories.forEach(category => {
            lines.push(`# === ${category.toUpperCase()} ===`);
            
            channelsByCategory[category].forEach(channel => {
                if (this._isValidChannel(channel)) {
                    const extinf = this._generateExtInf(channel);
                    lines.push(extinf);
                    lines.push(channel.streamUrl || channel.url);
                }
            });
            
            lines.push(''); // Línea en blanco entre categorías
        });

        return lines.join('\n');
    }

    /**
     * Agrupa canales por categoría
     * @param {Array} channels - Array de objetos Channel
     * @returns {Object} Objeto con canales agrupados por categoría
     */
    _groupChannelsByCategory(channels) {
        return channels.reduce((groups, channel) => {
            const category = channel.category || 'Sin categoría';
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(channel);
            return groups;
        }, {});
    }
}

export default M3UGeneratorService;