/**
 * @fileoverview ValidatedChannelsCsvService - Servicio para generar archivo tv.csv con canales validados
 * Responsabilidad única: gestión del archivo tv.csv como resultado del pipeline de procesamiento
 * Arquitectura: Servicio de dominio que coordina la persistencia de canales validados
 */

import { ChannelPersistenceService } from './ChannelPersistenceService.js';
import { RepositoryError } from '../repositories/ChannelRepository.js';
import { 
  getPriorityChannelsFromEnv, 
  getCategoryOrderFromEnv, 
  getValidatedChannelsCsvPath 
} from './ValidatedChannelsCsvService_tools.js';

/**
 * Servicio para generar y mantener el archivo tv.csv con canales validados
 * Este archivo sirve como fuente de datos limpia para el addon de Stremio
 */
export class ValidatedChannelsCsvService {
  /**
   * @private
   */
  #config;
  #logger;
  #persistenceService;

  /**
   * @param {Object} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
    this.#persistenceService = new ChannelPersistenceService(config, logger);
  }

  /**
   * Genera el archivo tv.csv con canales validados
   * Este es el resultado final del pipeline de procesamiento
   * @param {Array<Channel>} validatedChannels - Canales que han pasado todas las validaciones
   * @returns {Promise<string>} - Ruta del archivo generado
   * @throws {RepositoryError}
   */
  async generateValidatedChannelsCsv(validatedChannels) {
    try {
      const outputPath = this.#getValidatedChannelsCsvPath();
      
      this.#logger.info(`Generando archivo tv.csv con ${validatedChannels.length} canales validados`);
      this.#logger.info(`Ruta de salida: ${outputPath}`);

      // Crear backup si el archivo existe y está habilitado
      if (this.#config.files?.enableBackup === true) {
        await this.#createBackupIfExists(outputPath);
      }

      // Ordenar canales por categoría con prioridad personalizada
      const sortedChannels = this.#sortChannelsByCategory(validatedChannels);

      // Persistir canales validados y ordenados
      await this.#persistenceService.persistChannelsToCSV(sortedChannels, outputPath);

      // Generar estadísticas del archivo generado
      const stats = this.#generateFileStats(sortedChannels);
      this.#logGenerationStats(stats, outputPath);

      this.#logger.info(`✅ Archivo tv.csv generado exitosamente: ${outputPath}`);
      
      return outputPath;

    } catch (error) {
      const errorMsg = `Error generando archivo tv.csv: ${error.message}`;
      this.#logger.error(errorMsg, error);
      throw new RepositoryError(errorMsg, error);
    }
  }

  /**
   * Ordena los canales por categoría con prioridad personalizada
   * Prioridad: Canales prioritarios desde .env (solo 1 por nombre), luego categorías configurables desde .env, resto alfabéticamente
   * @private
   * @param {Array<Channel>} channels - Canales a ordenar
   * @returns {Array<Channel>} - Canales ordenados
   */
  #sortChannelsByCategory(channels) {
    // Obtener canales prioritarios desde .env
    const priorityChannelNames = getPriorityChannelsFromEnv();
    
    // Obtener orden de categorías desde .env
    const priorityCategories = getCategoryOrderFromEnv();
    
    // Si no hay configuración en .env, usar orden por defecto
    if (priorityCategories.length === 0) {
      priorityCategories.push('TV Local', 'TV Premium', 'Deportes', 'Infantil');
    }
    
    // Función auxiliar para verificar coincidencia exacta de nombres prioritarios
    const isExactPriorityMatch = (channelName, priorityName) => {
      // Normalizar ambos nombres removiendo espacios extra y caracteres especiales
      const normalizeForComparison = (name) => 
        name.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      
      const normalizedChannel = normalizeForComparison(channelName);
      const normalizedPriority = normalizeForComparison(priorityName);
      
      // Coincidencia exacta
      if (normalizedChannel === normalizedPriority) return true;
      
      // Coincidencia donde el nombre del canal contiene exactamente el nombre prioritario como palabra completa
      const regex = new RegExp(`\\b${normalizedPriority.replace(/\s+/g, '\\s+')}\\b`, 'i');
      return regex.test(normalizedChannel);
    };
    
    // Separar canales prioritarios y no prioritarios, permitiendo hasta 2 versiones de cada canal prioritario
    const priorityChannels = [];
    const nonPriorityChannels = [];
    const usedPriorityNames = new Map(); // Cambio a Map para contar ocurrencias
    
    channels.forEach(channel => {
      const channelName = (channel.name || '').toUpperCase().trim();
      
      // Verificar si es un canal prioritario
      const matchingPriorityName = priorityChannelNames.find(priorityName => 
        isExactPriorityMatch(channelName, priorityName)
      );
      
      if (matchingPriorityName) {
        const currentCount = usedPriorityNames.get(matchingPriorityName) || 0;
        
        if (currentCount < 2) {
          // Es prioritario y aún no hemos alcanzado el límite de 2 por nombre
          usedPriorityNames.set(matchingPriorityName, currentCount + 1);
          priorityChannels.push({
            channel,
            priorityIndex: priorityChannelNames.indexOf(matchingPriorityName),
            instanceNumber: currentCount + 1 // Para mantener orden dentro del mismo nombre
          });
        } else {
          // Ya tenemos 2 versiones de este canal prioritario
          nonPriorityChannels.push(channel);
        }
      } else {
        // No es prioritario
        nonPriorityChannels.push(channel);
      }
    });
    
    // Ordenar canales prioritarios por su índice en la lista de prioridad y luego por número de instancia
    priorityChannels.sort((a, b) => {
      // Primero ordenar por índice de prioridad (LATINA, AMERICA, PANAMERICANA, etc.)
      if (a.priorityIndex !== b.priorityIndex) {
        return a.priorityIndex - b.priorityIndex;
      }
      // Si tienen el mismo índice de prioridad, ordenar por número de instancia (1, 2)
      return a.instanceNumber - b.instanceNumber;
    });
    
    // Ordenar canales no prioritarios por categoría
    nonPriorityChannels.sort((a, b) => {
      // Extraer la categoría principal (antes de la coma) del género
      // Validar que split retorne al menos un elemento antes de acceder a [0]
      const genreASplit = (a.genre || 'General').split(',');
      const genreBSplit = (b.genre || 'General').split(',');
      const genreA = (genreASplit.length > 0 ? genreASplit[0] : 'General').trim().replace(/^"/, '').replace(/"$/, '');
      const genreB = (genreBSplit.length > 0 ? genreBSplit[0] : 'General').trim().replace(/^"/, '').replace(/"$/, '');
      
      const priorityA = priorityCategories.indexOf(genreA);
      const priorityB = priorityCategories.indexOf(genreB);
      
      // Si ambos están en la lista de prioridad de categorías, ordenar por índice de prioridad
      if (priorityA !== -1 && priorityB !== -1) {
        return priorityA - priorityB;
      }
      
      // Si solo A está en la lista de prioridad de categorías, A va primero
      if (priorityA !== -1 && priorityB === -1) {
        return -1;
      }
      
      // Si solo B está en la lista de prioridad de categorías, B va primero
      if (priorityA === -1 && priorityB !== -1) {
        return 1;
      }
      
      // Si ninguno está en la lista de prioridad de categorías, ordenar alfabéticamente por género
      return genreA.localeCompare(genreB);
    });
    
    // Combinar: primero canales prioritarios (sin duplicados), luego el resto
    return [
      ...priorityChannels.map(item => item.channel),
      ...nonPriorityChannels
    ];
  }

  /**
   * Obtiene la ruta configurada para el archivo tv.csv
   * @private
   * @returns {string} - Ruta del archivo tv.csv
   */
  #getValidatedChannelsCsvPath() {
    return getValidatedChannelsCsvPath(this.#config);
  }

  /**
   * Crea backup del archivo existente si es necesario
   * @private
   * @param {string} filePath - Ruta del archivo
   */
  async #createBackupIfExists(filePath) {
    try {
      const backupPath = await this.#persistenceService.createBackup(filePath);
      if (backupPath) {
        this.#logger.info(`Backup creado: ${backupPath}`);
      }
    } catch (error) {
      // El backup es opcional, no debe fallar el proceso principal
      this.#logger.warn(`No se pudo crear backup: ${error.message}`);
    }
  }

  /**
   * Genera estadísticas del archivo generado
   * @private
   * @param {Array<Channel>} channels - Canales procesados
   * @returns {Object} - Estadísticas del archivo
   */
  #generateFileStats(channels) {
    const genreStats = {};
    const countryStats = {};
    let activeChannels = 0;

    channels.forEach(channel => {
      // Estadísticas por género
      const genre = channel.genre || 'General';
      genreStats[genre] = (genreStats[genre] || 0) + 1;

      // Estadísticas por país
      const country = channel.country || 'Internacional';
      countryStats[country] = (countryStats[country] || 0) + 1;

      // Canales activos
      if (channel.isActive !== false) {
        activeChannels++;
      }
    });

    return {
      totalChannels: channels.length,
      activeChannels,
      inactiveChannels: channels.length - activeChannels,
      genreStats,
      countryStats,
      topGenres: Object.entries(genreStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5),
      topCountries: Object.entries(countryStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
    };
  }

  /**
   * Registra estadísticas de generación en el log
   * @private
   * @param {Object} stats - Estadísticas del archivo
   * @param {string} filePath - Ruta del archivo generado
   */
  /**
   * Registra estadísticas de generación del CSV
   * Optimizado para evitar logging excesivo en bucles
   * @private
   */
  #logGenerationStats(stats, filePath) {
    this.#logger.info('\n--- Estadísticas del Archivo tv.csv ---');
    this.#logger.info(`Total de canales: ${stats.totalChannels}`);
    this.#logger.info(`Canales activos: ${stats.activeChannels}`);
    this.#logger.info(`Canales inactivos: ${stats.inactiveChannels}`);
    
    if (stats.topGenres.length > 0) {
      this.#logger.info('\nTop géneros:');
      
      // Optimización: batch logging para géneros
      if (stats.topGenres.length <= 5) {
        stats.topGenres.forEach(([genre, count]) => {
          this.#logger.info(`  - ${genre}: ${count} canales`);
        });
      } else {
        const genresMessage = stats.topGenres
          .map(([genre, count]) => `  - ${genre}: ${count} canales`)
          .join('\n');
        this.#logger.info(genresMessage);
      }
    }

    if (stats.topCountries.length > 0) {
      this.#logger.info('\nTop países:');
      
      // Optimización: batch logging para países
      if (stats.topCountries.length <= 5) {
        stats.topCountries.forEach(([country, count]) => {
          this.#logger.info(`  - ${country}: ${count} canales`);
        });
      } else {
        const countriesMessage = stats.topCountries
          .map(([country, count]) => `  - ${country}: ${count} canales`)
          .join('\n');
        this.#logger.info(countriesMessage);
      }
    }

    this.#logger.info(`\nArchivo guardado en: ${filePath}`);
  }

  /**
   * Lee el archivo CSV generado y devuelve los canales en el mismo orden
   * @param {string} csvPath - Ruta del archivo CSV
   * @returns {Promise<Array>} - Canales ordenados según el CSV
   */
  async getOrderedChannelsFromCsv(csvPath) {
    try {
      const fs = await import('fs');
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      
      if (lines.length < 2) {
        this.#logger.warn(`Archivo CSV vacío o sin datos: ${csvPath}`);
        return [];
      }
      
      const headers = lines[0].split(',').map(h => h.trim());
      
      const channels = lines.slice(1).map(line => {
        const values = this.#parseCSVLine(line);
        const channel = {};
        
        headers.forEach((header, index) => {
          channel[header] = values[index]?.trim() || '';
        });
        
        // Normalizar campos para compatibilidad con M3U Generator
        if (channel.stream_url && !channel.streamUrl) {
          channel.streamUrl = channel.stream_url;
        }
        if (channel.stream_url && !channel.url) {
          channel.url = channel.stream_url;
        }
        
        return channel;
      });
      
      this.#logger.info(`Canales leídos desde CSV: ${channels.length}`);
      return channels;
      
    } catch (error) {
      this.#logger.error(`Error leyendo canales desde CSV: ${error.message}`);
      throw new RepositoryError(`Error leyendo canales desde CSV: ${error.message}`);
    }
  }

  /**
   * Parsea una línea CSV manejando comas dentro de comillas
   * @param {string} line - Línea CSV
   * @returns {Array} Array de valores
   * @private
   */
  #parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current);
    return values;
  }

  /**
   * Valida que los canales cumplan con los requisitos mínimos para tv.csv
   * @param {Array<Channel>} channels - Canales a validar
   * @returns {Array<Channel>} - Canales válidos para tv.csv
   */
  validateChannelsForCsv(channels) {
    return channels.filter(channel => {
      // Validaciones mínimas para tv.csv
      const hasRequiredFields = channel.name && channel.streamUrl;
      const hasValidUrl = channel.streamUrl && 
        (channel.streamUrl.startsWith('http://') || channel.streamUrl.startsWith('https://'));
      
      return hasRequiredFields && hasValidUrl;
    });
  }
}

export default ValidatedChannelsCsvService;