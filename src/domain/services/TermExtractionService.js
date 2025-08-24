/**
 * @fileoverview TermExtractionService - Servicio para extraer términos de búsqueda desde archivos de documentación
 * Implementa análisis de texto para identificar títulos, géneros y términos relevantes
 */

export class TermExtractionService {
  constructor() {
    // Patrones para identificar diferentes tipos de contenido
    this.patterns = {
      // Títulos de películas y series
      titles: [
        /(?:título|title|nombre)\s*:?\s*([^\n\r]+)/gi,
        /(?:película|movie|film)\s*:?\s*([^\n\r]+)/gi,
        /(?:serie|series|show)\s*:?\s*([^\n\r]+)/gi,
        /"([^"]+)"/g, // Títulos entre comillas
        /'([^']+)'/g   // Títulos entre comillas simples
      ],
      
      // Géneros cinematográficos
      genres: [
        /(?:género|genre|categoría|category)\s*:?\s*([^\n\r]+)/gi,
        /\b(acción|action|drama|comedia|comedy|terror|horror|thriller|ciencia ficción|sci-fi|fantasía|fantasy|romance|aventura|adventure|animación|animation|documental|documentary|crimen|crime|misterio|mystery|guerra|war|western|musical|biografía|biography|historia|history|familia|family)\b/gi
      ],
      
      // Años y fechas
      years: [
        /\b(19|20)\d{2}\b/g,
        /(?:año|year)\s*:?\s*(\d{4})/gi
      ],
      
      // Calidad de video
      quality: [
        /\b(4K|UHD|1080p|720p|480p|HD|Full HD|BluRay|BDRip|DVDRip|WEBRip|HDTV)\b/gi
      ],
      
      // Idiomas
      languages: [
        /\b(español|spanish|inglés|english|francés|french|italiano|italian|alemán|german|portugués|portuguese|japonés|japanese|coreano|korean|chino|chinese|ruso|russian)\b/gi,
        /\b(castellano|latino|subtitulado|dubbed|sub|dub)\b/gi
      ]
    };
    
    // Palabras comunes a filtrar
    this.stopWords = new Set([
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
      'de', 'del', 'en', 'con', 'por', 'para', 'sin', 'sobre',
      'y', 'o', 'pero', 'si', 'no', 'que', 'como', 'cuando',
      'the', 'a', 'an', 'and', 'or', 'but', 'if', 'not',
      'that', 'this', 'with', 'for', 'from', 'to', 'of', 'in'
    ]);
  }

  /**
   * Extrae términos de búsqueda desde texto
   * @param {string} text - Texto a analizar
   * @param {Object} options - Opciones de extracción
   * @returns {Object} Términos extraídos categorizados
   */
  extractTerms(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return this.createEmptyResult();
    }

    const {
      includeTitles = true,
      includeGenres = true,
      includeYears = true,
      includeQuality = true,
      includeLanguages = true,
      minTermLength = 2,
      maxTerms = 50
    } = options;

    const result = {
      titles: [],
      genres: [],
      years: [],
      quality: [],
      languages: [],
      keywords: [],
      metadata: {
        textLength: text.length,
        extractedAt: new Date().toISOString(),
        confidence: 0
      }
    };

    try {
      // Limpiar texto
      const cleanText = this.cleanText(text);
      
      // Extraer diferentes categorías
      if (includeTitles) {
        result.titles = this.extractByPatterns(cleanText, this.patterns.titles, minTermLength);
      }
      
      if (includeGenres) {
        result.genres = this.extractByPatterns(cleanText, this.patterns.genres, minTermLength);
      }
      
      if (includeYears) {
        result.years = this.extractByPatterns(cleanText, this.patterns.years, 4)
          .map(year => parseInt(year))
          .filter(year => year >= 1900 && year <= new Date().getFullYear() + 5);
      }
      
      if (includeQuality) {
        result.quality = this.extractByPatterns(cleanText, this.patterns.quality, minTermLength);
      }
      
      if (includeLanguages) {
        result.languages = this.extractByPatterns(cleanText, this.patterns.languages, minTermLength);
      }
      
      // Extraer palabras clave generales
      result.keywords = this.extractKeywords(cleanText, minTermLength, maxTerms);
      
      // Calcular confianza
      result.metadata.confidence = this.calculateConfidence(result);
      
      return result;
    } catch (error) {
      console.warn('Error extrayendo términos:', error.message);
      return this.createEmptyResult();
    }
  }

  /**
   * Extrae términos desde múltiples archivos
   * @param {string[]} filePaths - Rutas de archivos a procesar
   * @param {Object} options - Opciones de extracción
   * @returns {Promise<Object>} Términos agregados de todos los archivos
   */
  async extractFromFiles(filePaths, options = {}) {
    const results = [];
    
    for (const filePath of filePaths) {
      try {
        const content = await this.readFile(filePath);
        const terms = this.extractTerms(content, options);
        terms.metadata.source = filePath;
        results.push(terms);
      } catch (error) {
        console.warn(`Error procesando archivo ${filePath}:`, error.message);
      }
    }
    
    return this.aggregateResults(results);
  }

  /**
   * Genera consultas de búsqueda optimizadas
   * @param {Object} extractedTerms - Términos extraídos
   * @param {Object} options - Opciones de generación
   * @returns {string[]} Array de consultas de búsqueda
   */
  generateSearchQueries(extractedTerms, options = {}) {
    const {
      maxQueries = 10,
      includeGenreFilters = true,
      includeYearFilters = true,
      includeQualityFilters = false
    } = options;

    const queries = new Set();
    
    try {
      // Consultas basadas en títulos
      for (const title of extractedTerms.titles.slice(0, 5)) {
        queries.add(title.trim());
        
        // Combinar con géneros
        if (includeGenreFilters && extractedTerms.genres.length > 0) {
          const genre = extractedTerms.genres[0];
          queries.add(`${title} ${genre}`);
        }
        
        // Combinar con años
        if (includeYearFilters && extractedTerms.years.length > 0) {
          const year = extractedTerms.years[0];
          queries.add(`${title} ${year}`);
        }
      }
      
      // Consultas basadas en géneros + años
      if (includeGenreFilters && includeYearFilters) {
        for (const genre of extractedTerms.genres.slice(0, 3)) {
          for (const year of extractedTerms.years.slice(0, 2)) {
            queries.add(`${genre} ${year}`);
          }
        }
      }
      
      // Consultas basadas en palabras clave
      for (const keyword of extractedTerms.keywords.slice(0, 5)) {
        if (keyword.length >= 3) {
          queries.add(keyword);
        }
      }
      
      // Limitar número de consultas
      return Array.from(queries).slice(0, maxQueries);
    } catch (error) {
      console.warn('Error generando consultas:', error.message);
      return [];
    }
  }

  // Métodos privados

  /**
   * Limpia el texto para procesamiento
   * @param {string} text - Texto a limpiar
   * @returns {string}
   */
  cleanText(text) {
    return text
      .replace(/[\r\n]+/g, ' ') // Reemplazar saltos de línea
      .replace(/\s+/g, ' ')     // Normalizar espacios
      .replace(/[^\w\s\-'".:;,()]/g, '') // Remover caracteres especiales
      .trim();
  }

  /**
   * Extrae términos usando patrones regex
   * @param {string} text - Texto a procesar
   * @param {RegExp[]} patterns - Patrones a aplicar
   * @param {number} minLength - Longitud mínima
   * @returns {string[]}
   */
  extractByPatterns(text, patterns, minLength = 2) {
    const matches = new Set();
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const term = match[1] || match[0];
        if (term && term.length >= minLength) {
          matches.add(term.trim().toLowerCase());
        }
      }
    }
    
    return Array.from(matches);
  }

  /**
   * Extrae palabras clave generales
   * @param {string} text - Texto a procesar
   * @param {number} minLength - Longitud mínima
   * @param {number} maxTerms - Máximo número de términos
   * @returns {string[]}
   */
  extractKeywords(text, minLength = 2, maxTerms = 50) {
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(word => 
        word.length >= minLength && 
        !this.stopWords.has(word) &&
        /^[a-záéíóúñü]+$/i.test(word)
      );
    
    // Contar frecuencias
    const frequencies = new Map();
    for (const word of words) {
      frequencies.set(word, (frequencies.get(word) || 0) + 1);
    }
    
    // Ordenar por frecuencia y retornar top términos
    return Array.from(frequencies.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTerms)
      .map(([word]) => word);
  }

  /**
   * Calcula la confianza de la extracción
   * @param {Object} result - Resultado de extracción
   * @returns {number} Confianza entre 0 y 1
   */
  calculateConfidence(result) {
    let score = 0;
    let maxScore = 0;
    
    // Puntuación por categorías encontradas
    if (result.titles.length > 0) { score += result.titles.length * 0.3; maxScore += 3; }
    if (result.genres.length > 0) { score += result.genres.length * 0.2; maxScore += 2; }
    if (result.years.length > 0) { score += result.years.length * 0.1; maxScore += 1; }
    if (result.quality.length > 0) { score += result.quality.length * 0.1; maxScore += 1; }
    if (result.languages.length > 0) { score += result.languages.length * 0.1; maxScore += 1; }
    if (result.keywords.length > 0) { score += Math.min(result.keywords.length * 0.05, 1); maxScore += 1; }
    
    return maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
  }

  /**
   * Crea un resultado vacío
   * @returns {Object}
   */
  createEmptyResult() {
    return {
      titles: [],
      genres: [],
      years: [],
      quality: [],
      languages: [],
      keywords: [],
      metadata: {
        textLength: 0,
        extractedAt: new Date().toISOString(),
        confidence: 0
      }
    };
  }

  /**
   * Agrega resultados de múltiples extracciones
   * @param {Object[]} results - Array de resultados
   * @returns {Object} Resultado agregado
   */
  aggregateResults(results) {
    const aggregated = this.createEmptyResult();
    
    for (const result of results) {
      aggregated.titles.push(...result.titles);
      aggregated.genres.push(...result.genres);
      aggregated.years.push(...result.years);
      aggregated.quality.push(...result.quality);
      aggregated.languages.push(...result.languages);
      aggregated.keywords.push(...result.keywords);
    }
    
    // Eliminar duplicados y ordenar
    aggregated.titles = [...new Set(aggregated.titles)];
    aggregated.genres = [...new Set(aggregated.genres)];
    aggregated.years = [...new Set(aggregated.years)].sort((a, b) => b - a);
    aggregated.quality = [...new Set(aggregated.quality)];
    aggregated.languages = [...new Set(aggregated.languages)];
    aggregated.keywords = [...new Set(aggregated.keywords)];
    
    // Actualizar metadata
    aggregated.metadata.sources = results.map(r => r.metadata.source).filter(Boolean);
    aggregated.metadata.confidence = this.calculateConfidence(aggregated);
    
    return aggregated;
  }

  /**
   * Lee un archivo (implementación básica)
   * @param {string} filePath - Ruta del archivo
   * @returns {Promise<string>} Contenido del archivo
   */
  async readFile(filePath) {
    // En un entorno real, usar fs.readFile o similar
    // Esta es una implementación placeholder
    throw new Error('readFile debe ser implementado según el entorno');
  }
}