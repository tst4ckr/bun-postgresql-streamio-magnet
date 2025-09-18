/**
 * @fileoverview M3UParser - Parser para archivos M3U de canales de TV.
 * Extrae información de canales desde formato M3U estándar.
 */

import { Channel } from '../../domain/entities/Channel.js';

/**
 * Parser para archivos M3U que extrae información de canales de TV.
 * Responsabilidad única: parsear formato M3U a entidades Channel.
 */
export class M3UParser {
  /**
   * Parsea contenido M3U y retorna array de canales.
   * @param {string} m3uContent - Contenido del archivo M3U
   * @returns {Channel[]} Array de canales parseados
   */
  static parse(m3uContent) {
    if (!m3uContent || typeof m3uContent !== 'string') {
      throw new Error('M3U content must be a non-empty string');
    }

    const lines = m3uContent.split('\n').map(line => line.trim()).filter(Boolean);
    const channels = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Buscar líneas EXTINF que definen canales
      if (line.startsWith('#EXTINF:')) {
        const channelInfo = this.#parseExtinfLine(line);
        const nextLine = lines[i + 1];
        
        // La siguiente línea debe ser la URL del stream
        if (nextLine && !nextLine.startsWith('#')) {
          try {
            const channelData = {
              ...channelInfo,
              streamUrl: nextLine,
              id: Channel.generateId(channelInfo.name, channelInfo.group)
            };
            
            const channel = new Channel(channelData);
            channels.push(channel);
            i++; // Saltar la línea de URL ya procesada
          } catch (error) {
            // Continuar con el siguiente canal si hay error en uno específico
            console.warn(`Error creating channel: ${error.message}`, channelInfo);
          }
        }
      }
    }
    
    return channels;
  }

  /**
   * Parsea una línea EXTINF para extraer metadatos del canal.
   * @private
   * @param {string} extinfLine - Línea EXTINF del M3U
   * @returns {Object} Metadatos del canal
   */
  static #parseExtinfLine(extinfLine) {
    const channelInfo = {
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
      channelInfo.logo = attributes['tvg-logo'];
    }
    
    if (attributes['group-title']) {
      channelInfo.group = attributes['group-title'];
    }
    
    if (attributes['tvg-id']) {
      channelInfo.tvgId = attributes['tvg-id'];
    }
    
    if (attributes['tvg-name']) {
      channelInfo.tvgName = attributes['tvg-name'];
    }

    // Extraer nombre del canal (después de la última coma)
    const nameMatch = extinfLine.match(/,(.+)$/);
    if (nameMatch) {
      channelInfo.name = nameMatch[1].trim();
    }

    // Si no hay nombre, usar tvg-name como fallback
    if (!channelInfo.name && channelInfo.tvgName) {
      channelInfo.name = channelInfo.tvgName;
    }

    // Validar que tenemos al menos un nombre
    if (!channelInfo.name) {
      throw new Error('Channel name is required');
    }

    return channelInfo;
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

  /**
   * Obtiene estadísticas del contenido M3U parseado.
   * @param {string} m3uContent - Contenido M3U
   * @returns {Object} Estadísticas del parseo
   */
  static getParseStats(m3uContent) {
    if (!this.isValidM3U(m3uContent)) {
      return {
        isValid: false,
        totalLines: 0,
        channelCount: 0,
        groups: []
      };
    }

    const lines = m3uContent.split('\n').map(line => line.trim()).filter(Boolean);
    const extinfLines = lines.filter(line => line.startsWith('#EXTINF:'));
    const groups = new Set();

    extinfLines.forEach(line => {
      const attributes = this.#extractAttributes(line);
      if (attributes['group-title']) {
        groups.add(attributes['group-title']);
      }
    });

    return {
      isValid: true,
      totalLines: lines.length,
      channelCount: extinfLines.length,
      groups: Array.from(groups).sort()
    };
  }
}