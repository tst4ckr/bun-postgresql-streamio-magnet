/**
 * Herramientas auxiliares para M3UGeneratorService
 * Contiene funciones puras y utilitarias para generación de archivos M3U
 */

/**
 * Sanitiza el título del canal para el formato M3U
 * @param {string} title - Título original
 * @returns {string} Título sanitizado
 */
export function sanitizeTitle(title) {
    return title
        .replace(/[^\w\s\-\.\(\)\[\]]/g, '') // Remover caracteres especiales
        .trim();
}

/**
 * Valida si un canal es válido para incluir en el M3U
 * @param {Object} channel - Objeto Channel
 * @returns {boolean} True si es válido
 */
export function isValidChannel(channel) {
    const streamUrl = channel.streamUrl || channel.url;
    return channel && 
           typeof streamUrl === 'string' && 
           streamUrl.trim() !== '' &&
           (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'));
}

/**
 * Genera la línea EXTINF básica para un canal
 * @param {Object} channel - Objeto Channel
 * @returns {string} Línea EXTINF formateada
 */
export function generateExtInf(channel) {
    const duration = -1; // -1 indica stream en vivo
    const title = sanitizeTitle(channel.name || 'Canal sin nombre');
    const group = channel.category ? ` group-title="${channel.category}"` : '';
    const logo = channel.logo ? ` tvg-logo="${channel.logo}"` : '';
    const id = channel.id ? ` tvg-id="${channel.id}"` : '';
    
    return `#EXTINF:${duration}${group}${logo}${id}, ${title}`;
}

/**
 * Genera una línea EXTINF extendida con más metadatos
 * @param {Object} channel - Objeto Channel
 * @returns {string} Línea EXTINF extendida
 */
export function generateExtendedExtInf(channel) {
    const duration = -1;
    const title = sanitizeTitle(channel.name || 'Canal sin nombre');
    
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
 * Agrupa canales por categoría
 * @param {Array} channels - Array de objetos Channel
 * @returns {Object} Objeto con canales agrupados por categoría
 */
export function groupChannelsByCategory(channels) {
    return channels.reduce((groups, channel) => {
        const category = channel.category || 'Sin categoría';
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(channel);
        return groups;
    }, {});
}

/**
 * Ordena categorías según prioridad personalizada
 * @param {Array} categories - Array de nombres de categorías
 * @returns {Array} Categorías ordenadas
 */
export function sortCategories(categories) {
    // Orden personalizado de categorías solicitado por el usuario
    const categoryOrder = [
        'TV Local',
        'TV Premium', 
        'Deportes',
        'Infantil'
    ];
    
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
}

/**
 * Valida que los canales sean un array válido
 * @param {*} channels - Datos a validar
 * @throws {Error} Si los canales no son válidos
 */
export function validateChannelsArray(channels) {
    if (!Array.isArray(channels)) {
        throw new Error('Los canales deben ser un array');
    }
}

/**
 * Genera líneas de metadatos para M3U extendido
 * @param {Object} metadata - Metadatos adicionales
 * @returns {Array} Array de líneas de metadatos
 */
export function generateMetadataLines(metadata) {
    const lines = [];
    
    if (metadata.title) {
        lines.push(`#PLAYLIST:${metadata.title}`);
    }
    
    if (metadata.description) {
        lines.push(`#EXTDESC:${metadata.description}`);
    }
    
    return lines;
}

/**
 * Genera líneas de separación de categorías
 * @param {string} category - Nombre de la categoría
 * @returns {Array} Array con líneas de separación
 */
export function generateCategorySeparator(category) {
    return [`# === ${category.toUpperCase()} ===`];
}

export function createSlug(value) {
    // Validar y limpiar el valor antes de procesar
    if (value === null || value === undefined) {
        return '';
    }
    
    const stringValue = String(value).trim();
    if (stringValue.length === 0) {
        return '';
    }
    
    // Eliminar "null" y "undefined" que puedan aparecer como strings
    const cleanedValue = stringValue
        .replace(/null/gi, '')
        .replace(/undefined/gi, '')
        .trim();
    
    if (cleanedValue.length === 0) {
        return '';
    }
    
    return cleanedValue
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export function createTvgIdFromChannel(channel, options = {}) {
    const prefix = options.tvgIdPrefix ?? 'tv_';
    
    // Validar que channel.name exista y sea válido antes de procesar
    const base = (channel && channel.name && typeof channel.name === 'string' && channel.name.trim())
        ? channel.name.trim()
        : '';
    
    const slug = createSlug(base);
    
    // Si el slug está vacío después de procesar, usar fallback
    const finalSlug = slug || 'canal_desconocido';
    
    const appendCountry = options.appendCountry ?? false;
    const country = appendCountry && channel && channel.country && typeof channel.country === 'string' && channel.country.trim()
        ? `_${String(channel.country).toLowerCase().trim()}`
        : '';
    
    return `${prefix}${finalSlug}${country}`;
}

export function assignDynamicTvgIds(channels, options = {}) {
    const used = new Set();
    return channels.map(ch => {
        const baseId = (ch.id && String(ch.id).trim() !== '') ? String(ch.id).trim() : createTvgIdFromChannel(ch, options);
        let id = baseId;
        let i = 2;
        while (used.has(id)) {
            id = `${baseId}_${i}`;
            i++;
        }
        used.add(id);
        return { ...ch, id };
    });
}