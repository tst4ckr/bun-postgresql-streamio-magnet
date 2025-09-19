/**
 * @fileoverview M3UParser - Parser para archivos M3U de canales de TV.
 * Extrae información de canales desde formato M3U estándar.
 */

import { Tv } from '../../domain/entities/Tv.js';

/**
 * Parser para archivos M3U que extrae información de canales de TV.
 * Responsabilidad única: parsear formato M3U a entidades Tv.
 */
export class M3UParser {
  /**
   * Parsea contenido M3U y retorna array de canales de TV.
   * @param {string} m3uContent - Contenido del archivo M3U
   * @returns {Tv[]} Array de canales de TV parseados
   */
  static parse(m3uContent) {
    if (!m3uContent || typeof m3uContent !== 'string') {
      throw new Error('M3U content must be a non-empty string');
    }

    const lines = m3uContent.split('\n').map(line => line.trim()).filter(Boolean);
    const tvs = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Buscar líneas EXTINF que definen canales de TV
      if (line.startsWith('#EXTINF:')) {
        const tvInfo = this.#parseExtinfLine(line);
        const nextLine = lines[i + 1];
        
        // La siguiente línea debe ser la URL del stream
        if (nextLine && !nextLine.startsWith('#')) {
          try {
            const tvData = {
              ...tvInfo,
              streamUrl: nextLine,
              id: Tv.generateId(tvInfo.name)
            };
            
            const tv = new Tv(tvData);
            tvs.push(tv);
            i++; // Saltar la línea de URL ya procesada
          } catch (error) {
            // Continuar con el siguiente canal si hay error en uno específico
            console.warn(`Error creating tv: ${error.message}`, tvInfo);
          }
        }
      }
    }
    
    return tvs;
  }

  /**
   * Parsea una línea EXTINF para extraer metadatos del canal.
   * @private
   * @param {string} extinfLine - Línea EXTINF del M3U
   * @returns {Object} Metadatos del canal
   */
  static #parseExtinfLine(extinfLine) {
    const tvInfo = {
      name: '',
      logo: null,
      group: 'General',
      tvgId: null,
      tvgName: null
    };

    // Extraer atributos usando regex
    const attributes = this.#extractAttributes(extinfLine);
    
    // Mapear atributos conocidos
    if (attributes['tvg-logo']) {
      tvInfo.logo = attributes['tvg-logo'];
    }
    
    if (attributes['group-title']) {
      tvInfo.group = attributes['group-title'];
    }
    
    if (attributes['tvg-id']) {
      tvInfo.tvgId = attributes['tvg-id'];
    }
    
    if (attributes['tvg-name']) {
      tvInfo.tvgName = attributes['tvg-name'];
    }

    // Extraer nombre del canal (después de la última coma)
    const nameMatch = extinfLine.match(/,(.+)$/);
    if (nameMatch) {
      tvInfo.name = nameMatch[1].trim();
    }

    // Si no hay nombre, usar tvg-name como fallback
    if (!tvInfo.name && tvInfo.tvgName) {
      tvInfo.name = tvInfo.tvgName;
    }

    // Validar que tenemos al menos un nombre
    if (!tvInfo.name) {
      throw new Error('Tv name is required');
    }

    return tvInfo;
  }

  /**
   * Extrae atributos de una línea EXTINF usando regex.
   * @private
   * @param {string} line - Línea EXTINF
   * @returns {Object} Objeto con atributos extraídos
   */
  static #extractAttributes(line) {
    const attributes = {};
    
    // Regex para extraer atributos del formato key="value"
    const attributeRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
    let match;
    
    while ((match = attributeRegex.exec(line)) !== null) {
      const [, key, value] = match;
      attributes[key] = value;
    }
    
    return attributes;
  }

  /**
   * Valida si el contenido es un archivo M3U válido.
   * @param {string} content - Contenido a validar
   * @returns {boolean} True si es M3U válido
   */
  static isValidM3U(content) {
    if (!content || typeof content !== 'string') {
      return false;
    }

    const lines = content.split('\n').map(line => line.trim());
    
    // Debe empezar con #EXTM3U
    if (!lines[0] || !lines[0].startsWith('#EXTM3U')) {
      return false;
    }

    // Debe tener al menos una línea EXTINF
    return lines.some(line => line.startsWith('#EXTINF:'));
  }

  
}