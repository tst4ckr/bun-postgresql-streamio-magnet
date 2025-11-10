/**
 * @fileoverview StreamQuality Value Object - Representa la calidad de un stream
 * Implementa los principios de DDD con inmutabilidad y validación
 */

export class StreamQuality {
  static QUALITIES = {
    AUTO: 'Auto',
    SD: 'SD',
    HD: 'HD',
    FULL_HD: 'Full HD',
    ULTRA_HD: '4K'
  };

  static QUALITY_PRIORITIES = {
    'Auto': 0,
    'SD': 1,
    'HD': 2,
    'Full HD': 3,
    '4K': 4
  };

  /**
   * @private
   */
  #quality;
  #priority;

  /**
   * @param {string} quality - Calidad del stream
   */
  constructor(quality) {
    this.#validateQuality(quality);
    this.#quality = quality;
    this.#priority = StreamQuality.QUALITY_PRIORITIES[quality] ?? 0;
    Object.freeze(this);
  }

  /**
   * Valida que la calidad sea válida
   * @private
   * @param {string} quality 
   */
  #validateQuality(quality) {
    if (!quality || typeof quality !== 'string') {
      throw new Error('La calidad debe ser una cadena no vacía');
    }

    const validQualities = Object.values(StreamQuality.QUALITIES);
    if (!validQualities.includes(quality)) {
      throw new Error(`Calidad inválida: ${quality}. Valores válidos: ${validQualities.join(', ')}`);
    }
  }

  /**
   * @returns {string} Calidad del stream
   */
  get value() {
    return this.#quality;
  }

  /**
   * @returns {number} Prioridad numérica de la calidad
   */
  get priority() {
    return this.#priority;
  }

  /**
   * Determina si es una calidad HD o superior
   * @returns {boolean}
   */
  isHighDefinition() {
    return this.#priority >= StreamQuality.QUALITY_PRIORITIES.HD;
  }

  /**
   * Compara con otra calidad
   * @param {StreamQuality} other 
   * @returns {number} -1, 0, 1 para menor, igual, mayor
   */
  compareTo(other) {
    if (!(other instanceof StreamQuality)) {
      throw new Error('Solo se puede comparar con otra instancia de StreamQuality');
    }
    return this.#priority - other.#priority;
  }

  /**
   * Detecta la calidad desde una URL
   * @static
   * @param {string} url 
   * @returns {StreamQuality}
   */
  static fromUrl(url) {
    if (!url || typeof url !== 'string') {
      return new StreamQuality(StreamQuality.QUALITIES.AUTO);
    }

    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('4k') || urlLower.includes('2160')) {
      return new StreamQuality(StreamQuality.QUALITIES.ULTRA_HD);
    }
    
    if (urlLower.includes('1080') || urlLower.includes('fullhd') || urlLower.includes('full_hd')) {
      return new StreamQuality(StreamQuality.QUALITIES.FULL_HD);
    }
    
    if (urlLower.includes('720') || urlLower.includes('hd')) {
      return new StreamQuality(StreamQuality.QUALITIES.HD);
    }
    
    if (urlLower.includes('480') || urlLower.includes('sd')) {
      return new StreamQuality(StreamQuality.QUALITIES.SD);
    }

    return new StreamQuality(StreamQuality.QUALITIES.AUTO);
  }

  /**
   * Crea instancia desde string con validación
   * @static
   * @param {string} qualityString 
   * @returns {StreamQuality}
   */
  static fromString(qualityString) {
    // Normalizar entrada
    const normalized = qualityString?.trim();
    
    // Mapeo de variaciones comunes
    const qualityMap = {
      'auto': StreamQuality.QUALITIES.AUTO,
      'sd': StreamQuality.QUALITIES.SD,
      'hd': StreamQuality.QUALITIES.HD,
      '720p': StreamQuality.QUALITIES.HD,
      '1080p': StreamQuality.QUALITIES.FULL_HD,
      'fullhd': StreamQuality.QUALITIES.FULL_HD,
      'full_hd': StreamQuality.QUALITIES.FULL_HD,
      '4k': StreamQuality.QUALITIES.ULTRA_HD,
      'ultrahd': StreamQuality.QUALITIES.ULTRA_HD,
      '2160p': StreamQuality.QUALITIES.ULTRA_HD
    };

    const mappedQuality = qualityMap[normalized?.toLowerCase()] || 
                         Object.values(StreamQuality.QUALITIES).find(q => 
                           q.toLowerCase() === normalized?.toLowerCase()
                         );

    return new StreamQuality(mappedQuality || StreamQuality.QUALITIES.AUTO);
  }

  /**
   * Convierte a string
   * @returns {string}
   */
  toString() {
    return this.#quality;
  }

  /**
   * Convierte a JSON
   * @returns {string}
   */
  toJSON() {
    return {
      quality: this.#quality,
      priority: this.#priority,
      isHD: this.isHighDefinition()
    };
  }

  /**
   * Verifica igualdad con otro objeto
   * @param {*} other 
   * @returns {boolean}
   */
  equals(other) {
    return other instanceof StreamQuality && 
           this.#quality === other.#quality;
  }
}

export default StreamQuality;
