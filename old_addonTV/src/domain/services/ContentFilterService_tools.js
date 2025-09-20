/**
 * Herramientas auxiliares para el filtrado de contenido
 * Contiene funciones puras y utilidades reutilizables
 * Implementa principios SOLID y separación de responsabilidades
 */

/**
 * Crea patrones de expresiones regulares desde palabras clave
 * @param {string[]} keywords - Array de palabras clave
 * @returns {RegExp[]} Array de patrones de expresiones regulares
 * @throws {Error} Si keywords no es un array válido
 */
export function createPatterns(keywords) {
  if (!Array.isArray(keywords)) {
    throw new Error('Keywords debe ser un array válido');
  }
  
  return keywords
    .filter(keyword => typeof keyword === 'string' && keyword.trim().length > 0)
    .map(keyword => {
      // Escapar caracteres especiales y crear patrón que busque la palabra completa
      const escapedKeyword = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    });
}

/**
 * Verifica si el texto coincide con alguno de los patrones
 * @param {string} text - Texto a verificar
 * @param {RegExp[]} patterns - Array de patrones de expresiones regulares
 * @returns {boolean} True si encuentra coincidencia
 */
export function matchesPatterns(text, patterns) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }

  return patterns.some(pattern => {
    try {
      return pattern instanceof RegExp && pattern.test(text);
    } catch (error) {
      console.warn('Error al evaluar patrón:', error.message);
      return false;
    }
  });
}

/**
 * Extrae texto relevante del canal para análisis
 * @param {Object} channel - Objeto canal
 * @returns {string} Texto combinado del canal en minúsculas
 */
export function extractChannelText(channel) {
  if (!channel || typeof channel !== 'object') {
    return '';
  }
  
  const textParts = [];
  
  // Propiedades de texto del canal
  const textProperties = ['name', 'title', 'description', 'category', 'group'];
  
  textProperties.forEach(prop => {
    if (channel[prop] && typeof channel[prop] === 'string') {
      textParts.push(channel[prop].trim());
    }
  });
  
  // Agregar géneros si existen
  if (Array.isArray(channel.genres)) {
    const validGenres = channel.genres.filter(genre => 
      typeof genre === 'string' && genre.trim().length > 0
    );
    textParts.push(...validGenres);
  }
  
  // Procesar URLs
  const urls = [channel.url, channel.stream].filter(Boolean);
  urls.forEach(url => {
    if (typeof url === 'string') {
      const urlText = extractUrlText(url);
      if (urlText) {
        textParts.push(urlText);
      }
    }
  });
  
  return textParts.join(' ').toLowerCase();
}

/**
 * Extrae texto relevante de una URL
 * @param {string} url - URL a procesar
 * @returns {string} Texto extraído de la URL
 */
export function extractUrlText(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  const textParts = [];
  
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    textParts.push(domain);
    textParts.push(url.toLowerCase());
  } catch (error) {
    // Si la URL no es válida, agregar como texto plano
    textParts.push(url.toLowerCase());
  }
  
  return textParts.join(' ');
}

/**
 * Verifica si el canal contiene contenido religioso con lógica mejorada
 * @param {Object} channel - Canal a evaluar
 * @param {string} text - Texto del canal
 * @param {RegExp[]} religiousPatterns - Patrones religiosos
 * @returns {Object} Resultado del análisis religioso
 */
export function checkReligiousContent(channel, text, religiousPatterns) {
  // Lista de excepciones conocidas que no deben ser filtradas
  const exceptions = ['telefe', 'telefonica', 'telefilm', 'telefutura'];
  
  // Verificar si el canal está en la lista de excepciones
  const channelName = (channel?.name || '').toLowerCase();
  if (exceptions.some(exception => channelName.includes(exception))) {
    return { isReligious: false, reason: 'exception' };
  }
  
  // Verificar patrones religiosos con mayor precisión
  const hasReligiousPattern = matchesPatterns(text, religiousPatterns);
  
  return {
    isReligious: hasReligiousPattern,
    reason: hasReligiousPattern ? 'pattern_match' : 'no_match'
  };
}

/**
 * Verifica si el canal contiene contenido adulto
 * @param {Object} channel - Canal a verificar
 * @param {string} text - Texto extraído del canal
 * @param {RegExp[]} adultPatterns - Patrones de contenido adulto
 * @returns {boolean} True si contiene contenido adulto
 */
export function containsAdultContent(channel, text, adultPatterns) {
  return matchesPatterns(text, adultPatterns);
}

/**
 * Verifica si el canal contiene contenido político
 * @param {Object} channel - Canal a verificar
 * @param {string} text - Texto extraído del canal
 * @param {RegExp[]} politicalPatterns - Patrones de contenido político
 * @returns {boolean} True si contiene contenido político
 */
export function containsPoliticalContent(channel, text, politicalPatterns) {
  return matchesPatterns(text, politicalPatterns);
}

/**
 * Cuenta canales removidos por categoría
 * @param {Array} originalChannels - Canales originales
 * @param {Array} filteredChannels - Canales filtrados
 * @param {Object} patterns - Objeto con patrones de filtrado
 * @returns {Object} Conteo por categoría
 */
export function countRemovedByCategory(originalChannels, filteredChannels, patterns) {
  if (!Array.isArray(originalChannels) || !Array.isArray(filteredChannels)) {
    return { religious: 0, adult: 0, political: 0 };
  }

  const filteredIds = new Set(
    filteredChannels.map(ch => ch?.id || ch?.name).filter(Boolean)
  );
  
  const removedChannels = originalChannels.filter(ch => 
    !filteredIds.has(ch?.id || ch?.name)
  );

  let religious = 0;
  let adult = 0;
  let political = 0;

  removedChannels.forEach(channel => {
    const channelText = extractChannelText(channel);
    
    if (matchesPatterns(channelText, patterns.religious || [])) religious++;
    if (matchesPatterns(channelText, patterns.adult || [])) adult++;
    if (matchesPatterns(channelText, patterns.political || [])) political++;
  });

  return { religious, adult, political };
}

/**
 * Calcula estadísticas de filtrado
 * @param {number} originalCount - Cantidad original de canales
 * @param {number} filteredCount - Cantidad de canales filtrados
 * @param {Object} removedByCategory - Conteo por categoría
 * @param {Object} filtersActive - Estado de filtros activos
 * @returns {Object} Estadísticas completas
 */
export function calculateFilterStats(originalCount, filteredCount, removedByCategory, filtersActive) {
  const removedCount = originalCount - filteredCount;
  const removalPercentage = originalCount > 0 
    ? ((removedCount / originalCount) * 100).toFixed(2) 
    : '0.00';

  return {
    originalChannels: originalCount,
    filteredChannels: filteredCount,
    removedChannels: removedCount,
    removalPercentage,
    removedByCategory,
    filtersActive
  };
}

/**
 * Patrones religiosos predefinidos con alta precisión
 * @returns {RegExp[]} Array de patrones religiosos
 */
export function getDefaultReligiousPatterns() {
  return [
    // Palabras específicamente religiosas (alta precisión)
    /\b(iglesia|pastor|predicador|sermon|biblia|evangelio)\b/i,
    /\b(cristiano|catolico|protestante|pentecostal|bautista|metodista)\b/i,
    /\b(adventista|testigo|jehova|mormon|mision|ministerio)\b/i,
    /\b(apostol|profeta|sacerdote|obispo|papa|vaticano)\b/i,
    /\b(templo|catedral|capilla|santuario|altar|cruz|crucifijo)\b/i,
    /\b(rosario|oracion|rezo|bendicion|milagro|santo|santa)\b/i,
    /\b(virgen|maria|jesus|cristo|dios|señor|espiritu|trinidad)\b/i,
    /\b(salvacion|pecado|perdon|gracia|gloria|aleluya|amen|hosanna)\b/i,
    /\b(gospel|church|christian|catholic|protestant|baptist)\b/i,
    /\b(methodist|pentecostal|evangelical|apostolic|ministry)\b/i,
    /\b(priest|bishop|pope|temple|cathedral|chapel|sanctuary)\b/i,
    /\b(prayer|blessing|miracle|saint|virgin|mary|jesus|christ)\b/i,
    /\b(god|lord|spirit|trinity|salvation|sin|forgiveness)\b/i,
    /\b(grace|glory|hallelujah|amen|hosanna)\b/i
  ];
}

/**
 * Obtiene patrones de contenido adulto predefinidos
 * @returns {RegExp[]} Array de patrones de contenido adulto
 */
export function getDefaultAdultPatterns() {
  const adultKeywords = [
    'xxx', 'adult', 'porn', 'sexy', 'hot', '+18', 'adulto', 'erotico',
    'sexual', 'playboy', 'penthouse', 'erotic', 'nude', 'naked',
    'strip', 'lingerie', 'fetish', 'bdsm', 'hardcore', 'softcore'
  ];
  
  return createPatterns(adultKeywords);
}

/**
 * Obtiene patrones de contenido político predefinidos
 * @returns {RegExp[]} Array de patrones de contenido político
 */
export function getDefaultPoliticalPatterns() {
  const politicalKeywords = [
    'politica', 'gobierno', 'presidente', 'elecciones', 'congreso',
    'senado', 'diputado', 'ministro', 'alcalde', 'gobernador',
    'partido', 'campana', 'voto', 'democracia', 'parlamento',
    'tribunal', 'corte', 'justicia', 'ley', 'decreto'
  ];
  
  return createPatterns(politicalKeywords);
}

/**
 * Valida la configuración de filtros
 * @param {Object} filterConfig - Configuración de filtros
 * @returns {Object} Configuración validada
 * @throws {Error} Si la configuración es inválida
 */
export function validateFilterConfig(filterConfig) {
  if (!filterConfig || typeof filterConfig !== 'object') {
    throw new Error('La configuración de filtros debe ser un objeto válido');
  }

  const defaultConfig = {
    filterReligiousContent: false,
    filterAdultContent: false,
    filterPoliticalContent: false,
    religiousKeywords: [],
    adultKeywords: [],
    politicalKeywords: []
  };

  return {
    ...defaultConfig,
    ...filterConfig,
    religiousKeywords: Array.isArray(filterConfig.religiousKeywords) 
      ? filterConfig.religiousKeywords 
      : [],
    adultKeywords: Array.isArray(filterConfig.adultKeywords) 
      ? filterConfig.adultKeywords 
      : [],
    politicalKeywords: Array.isArray(filterConfig.politicalKeywords) 
      ? filterConfig.politicalKeywords 
      : []
  };
}

/**
 * Verifica si hay filtros activos
 * @param {Object} filterConfig - Configuración de filtros
 * @returns {boolean} True si hay al menos un filtro activo
 */
export function hasActiveFilters(filterConfig) {
  if (!filterConfig || typeof filterConfig !== 'object') {
    return false;
  }
  
  return Boolean(
    filterConfig.filterReligiousContent || 
    filterConfig.filterAdultContent || 
    filterConfig.filterPoliticalContent
  );
}

/**
 * Crea la configuración de filtros para visualización
 * @param {Object} filterConfig - Configuración de filtros
 * @returns {Object} Configuración formateada
 */
export function createFilterConfiguration(filterConfig) {
  const validatedConfig = validateFilterConfig(filterConfig);
  
  return {
    religious: {
      enabled: Boolean(validatedConfig.filterReligiousContent),
      keywordCount: validatedConfig.religiousKeywords?.length || 0
    },
    adult: {
      enabled: Boolean(validatedConfig.filterAdultContent),
      keywordCount: validatedConfig.adultKeywords?.length || 0
    },
    political: {
      enabled: Boolean(validatedConfig.filterPoliticalContent),
      keywordCount: validatedConfig.politicalKeywords?.length || 0
    }
  };
}