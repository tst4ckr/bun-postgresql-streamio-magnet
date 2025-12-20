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
   * @param {string} m3uContent - Contenido del archito M3U
   * @returns {Tv[]} Array de canales de TV parseados
   */
  static parse(m3uContent) {
    if (!m3uContent || typeof m3uContent !== 'string' || m3uContent.trim().length === 0) {
      throw new Error('M3U content must be a non-empty string');
    }

    const lines = m3uContent.split('\n');
    const tvs = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Buscar líneas EXTINF que definen canales de TV
      if (line.startsWith('#EXTINF:')) {
        const tvInfo = this.#parseExtinfLine(line);
        // Algunas listas M3U incluyen líneas intermedias (p.ej., #EXTVLCOPT) antes de la URL del stream.
        // Avanzar hasta encontrar la primera línea no-comentario y usarla como URL.
        let j = i + 1;
        let streamLine = null;
        while (j < lines.length) {
          const candidate = lines[j].trim();
          if (!candidate) { j++; continue; }
          if (!candidate.startsWith('#')) {
            streamLine = candidate;
            break;
          }
          j++;
        }

        // La siguiente línea no-comentario debe ser la URL del stream
        if (streamLine) {
          try {
            const tvData = {
              ...tvInfo,
              streamUrl: streamLine,
              id: Tv.generateId(tvInfo.name)
            };

            const tv = new Tv(tvData);
            tvs.push(tv);
            i = j; // Saltar todas las líneas procesadas hasta la URL
          } catch (error) {
            // Continuar con el siguiente canal si hay error en uno específico
            console.warn(`Error creating tv from line ${i}: ${error.message}`);
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

    // Validar y registrar nombres sospechosos con "undefined"
    if (tvInfo.name && (tvInfo.name.includes('undefined') || tvInfo.name.includes('sundefinedeundefined'))) {
      console.warn(`[M3UParser] Nombre de canal sospechoso detectado: "${tvInfo.name}"`, { extinfLine });
    }

    return tvInfo;
  }

  /**
   * Extrae atributos de una línea EXTINF usando parsing manual más eficiente.
   * @private
   * @param {string} line - Línea EXTINF
   * @returns {Object} Objeto con atributos extraídos
   */
  static #extractAttributes(line) {
    const attributes = {};
    
    // Extraer sección de atributos (después de : y antes de la última coma)
    const attrSection = line.slice(line.indexOf(':') + 1, line.lastIndexOf(',')).trim();
    
    if (!attrSection) return attributes;
    
    // Parsear atributos manualmente para mejor rendimiento
    let currentPos = 0;
    while (currentPos < attrSection.length) {
      // Buscar inicio de key
      const keyStart = attrSection.indexOf(' ', currentPos);
      if (keyStart === -1) break;
      
      // Buscar igual y comillas
      const equalsPos = attrSection.indexOf('=', keyStart);
      if (equalsPos === -1) break;
      
      const quoteStart = attrSection.indexOf('"', equalsPos);
      if (quoteStart === -1) break;
      
      const quoteEnd = attrSection.indexOf('"', quoteStart + 1);
      if (quoteEnd === -1) break;
      
      const key = attrSection.slice(keyStart + 1, equalsPos).trim();
      const value = attrSection.slice(quoteStart + 1, quoteEnd);
      
      if (key && value) {
        attributes[key] = value;
      }
      
      currentPos = quoteEnd + 1;
    }
    
    return attributes;
  }

  /**
   * Valida si el contenido es un archivo M3U válido.
   * @param {string} content - Contenido a validar
   * @returns {boolean} True si es M3U válido
   */
  static isValidM3U(content) {
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return false;
    }

    // Verificar rápidamente las primeras líneas sin split completo
    const firstLine = content.substring(0, 100).split('\n')[0].trim();
    
    // Debe empezar con #EXTM3U
    if (!firstLine.startsWith('#EXTM3U')) {
      return false;
    }

    // Verificar rápidamente si hay al menos una línea EXTINF
    return content.includes('#EXTINF:');
  }

  
}