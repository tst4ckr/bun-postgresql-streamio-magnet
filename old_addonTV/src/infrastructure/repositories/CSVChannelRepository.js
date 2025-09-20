/**
 * @fileoverview CSVChannelRepository - Implementación del repositorio para archivos CSV
 * Implementa ChannelRepository para fuentes de datos CSV locales
 */

import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { ChannelRepository, RepositoryError, ChannelNotFoundError } from '../../domain/repositories/ChannelRepository.js';
import { Channel } from '../../domain/entities/Channel.js';
import ContentFilterService from '../../domain/services/ContentFilterService.js';
import { filterBannedChannels } from '../../config/banned-channels.js';
import { StreamHealthService } from '../services/StreamHealthService.js';

/**
 * Repositorio de canales basado en archivo CSV
 * Responsabilidad única: gestión de canales desde archivos CSV
 */
export class CSVChannelRepository extends ChannelRepository {
  /**
   * @private
   */
  #filePath;
  #config;
  #logger;
  #channels = [];
  #channelMap = new Map();
  #isInitialized = false;
  #lastLoadTime = null;
  #deactivatedChannels = new Set();
  #validatedChannels = new Map(); // channelId -> timestamp
  #contentFilter; // Servicio de filtrado de contenido
  #urlAvailabilityCache = new Map(); // streamUrl -> {available: boolean, timestamp: Date}
  #streamHealthService; // Servicio de validación de streams con soporte para Bitel UIDs

  /**
   * @param {string} filePath - Ruta al archivo CSV
   * @param {Object} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(filePath, config, logger = console) {
    super();
    this.#filePath = filePath;
    this.#config = config;
    this.#logger = logger;
    
    // Inicializar servicio de filtrado de contenido
    this.#contentFilter = new ContentFilterService(config.filters);
    
    // Inicializar servicio de validación de streams con soporte para Bitel UIDs
    this.#streamHealthService = new StreamHealthService(config, logger);
  }

  /**
   * Inicializa el repositorio cargando los canales
   * @returns {Promise<void>}
   * @throws {RepositoryError}
   */
  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Repositorio CSV ya inicializado.');
      return;
    }

    try {
      this.#logger.info(`Cargando canales desde: ${this.#filePath}`);
      await this.#loadChannelsFromCSV();
      this.#isInitialized = true;
      this.#logger.info(`Repositorio CSV inicializado: ${this.#channels.length} canales`);
      
    } catch (error) {
      throw new RepositoryError(`Error inicializando repositorio CSV: ${error.message}`);
    }
  }

  /**
   * Carga canales desde el archivo CSV
   * @private
   * @returns {Promise<void>}
   */
  async #loadChannelsFromCSV() {
    return new Promise((resolve, reject) => {
      const channels = [];
      const channelMap = new Map();
      const processedUrls = new Set();
      const pendingChecks = [];

      createReadStream(this.#filePath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            // Validar fila
            if (!this.#isValidCSVRow(row)) {
              this.#logger.warn('Fila CSV inválida ignorada:', row);
              return;
            }

            // Crear canal desde CSV
            const channel = Channel.fromCSV(row);

            // Evitar duplicados por stream_url y verificar disponibilidad
            if (processedUrls.has(channel.streamUrl)) {
              this.#logger.warn(`Stream duplicado ignorado: ${channel.streamUrl}`);
              return;
            }

            // Aplicar filtros de configuración
            if (!this.#passesConfigFilters(channel)) {
              this.#logger.debug(`Canal filtrado por config: ${channel.id}`);
              return;
            }

            // Verificar disponibilidad HTTP de forma asíncrona
            const checkPromise = this.#checkStreamAvailability(channel)
              .then(isAvailable => {
                if (isAvailable) {
                  channels.push(channel);
                  channelMap.set(channel.id, channel);
                  processedUrls.add(channel.streamUrl);
                  this.#logger.debug(`Stream activo: ${channel.streamUrl}`);
                } else {
                  this.#logger.warn(`Stream no disponible: ${channel.streamUrl}`);
                }
              })
              .catch(error => {
                this.#logger.error(`Error verificando disponibilidad de ${channel.streamUrl}: ${error.message}`);
              });
            
            pendingChecks.push(checkPromise);

          } catch (error) {
            this.#logger.error('Error procesando fila CSV:', error, row);
          }
        })
        .on('end', () => {
          // Esperar a que todas las verificaciones asíncronas se completen
          Promise.allSettled(pendingChecks)
            .then(() => {
              // Aplicar filtro de canales prohibidos antes de almacenar en caché
              const filteredChannels = filterBannedChannels(channels);
              const bannedCount = channels.length - filteredChannels.length;
              
              // Reconstruir el mapa de canales con los canales filtrados
              const filteredChannelMap = new Map();
              filteredChannels.forEach(channel => {
                filteredChannelMap.set(channel.id, channel);
              });
              
              this.#channels = filteredChannels;
              this.#channelMap = filteredChannelMap;
              this.#lastLoadTime = new Date();
              
              this.#logger.info(`CSV cargado: ${filteredChannels.length} canales (${bannedCount} prohibidos)`);
              resolve();
            })
            .catch(error => {
              reject(new RepositoryError(`Error en verificaciones asíncronas: ${error.message}`));
            });
        })
        .on('error', (error) => {
          reject(new RepositoryError(`Error leyendo archivo CSV: ${error.message}`));
        });
    });
  }

  /**
   * Verifica la disponibilidad de un stream usando StreamHealthService
   * Incluye soporte para procesamiento de UIDs dinámicos de Bitel
   * @private
   * @param {Channel} channel - Canal a verificar
   * @returns {Promise<boolean>} - true si el stream está disponible
   */
  async #checkStreamAvailability(channel) {
    if (!channel.streamUrl || !channel.streamUrl.startsWith('http')) {
      return false;
    }

    // Verificar caché de disponibilidad (válido por 5 minutos)
    const cached = this.#urlAvailabilityCache.get(channel.streamUrl);
    if (cached && (new Date() - cached.timestamp) < 300000) {
      return cached.available;
    }

    try {
      // Usar StreamHealthService que incluye procesamiento de Bitel UIDs
      const result = await this.#streamHealthService.checkStream(channel.streamUrl, channel.id);
      
      // Cachear resultado
      this.#urlAvailabilityCache.set(channel.streamUrl, {
        available: result.ok,
        timestamp: new Date()
      });
      
      if (!result.ok && result.reason) {
        this.#logger.debug(`Stream no disponible ${channel.streamUrl}: ${result.reason}`);
      }
      
      return result.ok;
    } catch (error) {
      this.#logger.debug(`Error verificando disponibilidad de ${channel.streamUrl}: ${error.message}`);
      
      // Cachear resultado negativo
      this.#urlAvailabilityCache.set(channel.streamUrl, {
        available: false,
        timestamp: new Date()
      });
      
      return false;
    }
  }

  /**
   * Valida una fila del CSV
   * @private
   * @param {Object} row 
   * @returns {boolean}
   */
  #isValidCSVRow(row) {
    // Campos mínimos requeridos
    const requiredFields = ['name', 'stream_url'];
    
    for (const field of requiredFields) {
      if (!row[field] || typeof row[field] !== 'string' || row[field].trim().length === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Verifica si un canal pasa los filtros de configuración
   * @private
   * @param {Channel} channel 
   * @returns {boolean}
   */
  #passesConfigFilters(channel) {
    const { filters, streaming } = this.#config;
    const channelCountry = channel.country.toUpperCase();

    // Verificar países permitidos
    if (filters.allowedCountries.length > 0) {
      const isAllowed = filters.allowedCountries.some(country => 
        channelCountry.includes(country) || country.includes(channelCountry)
      );
      if (!isAllowed) return false;
    }

    // Verificar países bloqueados
    if (filters.blockedCountries.length > 0) {
      const isBlocked = filters.blockedCountries.some(country => 
        channelCountry.includes(country) || country.includes(channelCountry)
      );
      if (isBlocked) return false;
    }

    // Verificar contenido adulto
    if (!streaming.enableAdultChannels) {
      const adultGenres = ['adulto', 'adult', 'xxx', '+18'];
      const isAdultChannel = adultGenres.some(genre => 
        channel.genre.toLowerCase().includes(genre) ||
        channel.name.toLowerCase().includes(genre)
      );
      if (isAdultChannel) return false;
    }

    return true;
  }

  /**
   * Verifica si el repositorio necesita ser actualizado
   * @private
   * @returns {boolean}
   */
  #needsRefresh() {
    if (!this.#lastLoadTime) return true;
    
    const { cacheChannelsHours } = this.#config.streaming;
    const cacheAgeMs = cacheChannelsHours * 60 * 60 * 1000;
    
    return (new Date() - this.#lastLoadTime) > cacheAgeMs;
  }

  /**
   * Refresca los datos si es necesario
   * @private
   * @returns {Promise<void>}
   */
  async #refreshIfNeeded() {
    if (this.#needsRefresh()) {
      this.#logger.info('Refrescando canales desde CSV...');
      await this.#loadChannelsFromCSV();
    }
  }

  // Implementación de métodos del contrato ChannelRepository

  /**
   * @override
   */
  async getAllChannels() {
    await this.#refreshIfNeeded();
    let channels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const beforeCount = channels.length;
      channels = this.#contentFilter.filterChannels(channels);
      const afterCount = channels.length;
      const removedCount = beforeCount - afterCount;
      
      if (removedCount > 0) {
        const originalChannels = this.#channels.slice(0, beforeCount);
        const stats = this.#contentFilter.getFilterStats(originalChannels, channels);
        this.#logger.info(`Filtros de contenido: ${removedCount} removidos`, {
          religious: stats.removedByCategory.religious,
          adult: stats.removedByCategory.adult,
          political: stats.removedByCategory.political
        });
      }
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = channels.length;
    channels = filterBannedChannels(channels);
    const afterBannedCount = channels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtro de prohibidos: ${bannedRemovedCount} removidos de ${beforeBannedCount}`);
    }
    
    return channels;
  }

  /**
   * @override
   */
  async getChannelById(id) {
    await this.#refreshIfNeeded();
    
    const channel = this.#channelMap.get(id);
    if (!channel || (this.#config.validation.removeInvalidStreams && this.#deactivatedChannels.has(id))) {
      throw new ChannelNotFoundError(id);
    }
    
    return channel;
  }

  /**
   * @override
   */
  async getChannelsByGenre(genre) {
    await this.#refreshIfNeeded();
    
    const channels = this.#channels.filter(channel => 
      channel.genre.toLowerCase() === genre.toLowerCase()
    );
    let filteredChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      filteredChannels = this.#contentFilter.filterChannels(filteredChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = filteredChannels.length;
    filteredChannels = filterBannedChannels(filteredChannels);
    const afterBannedCount = filteredChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtro de prohibidos: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return filteredChannels;
  }

  /**
   * @override
   */
  async getChannelsByCountry(country) {
    await this.#refreshIfNeeded();
    
    const channels = this.#channels.filter(channel => 
      channel.country.toLowerCase().includes(country.toLowerCase()) ||
      country.toLowerCase().includes(channel.country.toLowerCase())
    );
    let filteredChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      filteredChannels = this.#contentFilter.filterChannels(filteredChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = filteredChannels.length;
    filteredChannels = filterBannedChannels(filteredChannels);
    const afterBannedCount = filteredChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtro de prohibidos: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return filteredChannels;
  }

  /**
   * @override
   */
  async getChannelsByLanguage(language) {
    await this.#refreshIfNeeded();
    
    const channels = this.#channels.filter(channel => 
      channel.language.toLowerCase() === language.toLowerCase()
    );
    let filteredChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      filteredChannels = this.#contentFilter.filterChannels(filteredChannels);
    }
    
    return filteredChannels;
  }

  /**
   * @override
   */
  async searchChannels(searchTerm) {
    await this.#refreshIfNeeded();
    
    if (!searchTerm || searchTerm.trim().length === 0) {
      return [];
    }

    const term = searchTerm.toLowerCase().trim();
    
    const channels = this.#channels.filter(channel => {
      return channel.name.toLowerCase().includes(term) ||
             channel.genre.toLowerCase().includes(term) ||
             channel.country.toLowerCase().includes(term);
    });
    let filteredChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      filteredChannels = this.#contentFilter.filterChannels(filteredChannels);
    }
    
    return filteredChannels;
  }

  /**
   * @override
   */
  async getChannelsPaginated(skip = 0, limit = 20) {
    await this.#refreshIfNeeded();
    
    let activeChannels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = activeChannels.length;
    activeChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = activeChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return activeChannels.slice(Math.max(0, skip), Math.max(0, skip) + limit);
  }

  /**
   * @override
   */
  async getChannelsFiltered(filters = {}) {
    await this.#refreshIfNeeded();
    
    let filteredChannels = [...this.#channels];

    // Aplicar filtros
    if (filters.genre) {
      filteredChannels = filteredChannels.filter(channel => 
        channel.genre.toLowerCase() === filters.genre.toLowerCase()
      );
    }

    if (filters.country) {
      filteredChannels = filteredChannels.filter(channel => 
        channel.country.toLowerCase().includes(filters.country.toLowerCase())
      );
    }

    if (filters.language) {
      filteredChannels = filteredChannels.filter(channel => 
        channel.language.toLowerCase() === filters.language.toLowerCase()
      );
    }

    if (filters.quality) {
      filteredChannels = filteredChannels.filter(channel => 
        channel.quality.value.toLowerCase() === filters.quality.toLowerCase()
      );
    }

    if (typeof filters.isActive === 'boolean') {
      filteredChannels = filteredChannels.filter(channel => 
        channel.isActive === filters.isActive
      );
    }

    // Aplicar paginación
    const skip = Math.max(0, filters.skip || 0);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    
    let activeChannels = this.#filterActiveChannels(filteredChannels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    return activeChannels.slice(skip, skip + limit);
  }

  /**
   * @override
   */
  async getAvailableGenres() {
    await this.#refreshIfNeeded();
    
    const genres = new Set();
    this.#channels.forEach(channel => genres.add(channel.genre));
    
    return Array.from(genres).sort();
  }

  /**
   * @override
   */
  async getAvailableCountries() {
    await this.#refreshIfNeeded();
    
    const countries = new Set();
    this.#channels.forEach(channel => countries.add(channel.country));
    
    return Array.from(countries).sort();
  }

  /**
   * @override
   */
  async getAvailableLanguages() {
    await this.#refreshIfNeeded();
    
    const languages = new Set();
    this.#channels.forEach(channel => languages.add(channel.language));
    
    return Array.from(languages).sort();
  }

  /**
   * @override
   */
  async channelExists(id) {
    await this.#refreshIfNeeded();
    return this.#channelMap.has(id);
  }

  /**
   * @override
   */
  async getChannelsCount() {
    await this.#refreshIfNeeded();
    let activeChannels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    return activeChannels.length;
  }

  /**
   * @override
   */
  async getChannelsCountByGenre() {
    await this.#refreshIfNeeded();
    
    const genreCount = {};
    this.#channels.forEach(channel => {
      genreCount[channel.genre] = (genreCount[channel.genre] || 0) + 1;
    });
    
    return genreCount;
  }

  /**
   * @override
   */
  async updateChannel(channel) {
    throw new RepositoryError('Actualización de canales no soportada en repositorio CSV de solo lectura');
  }

  /**
   * @override
   */
  async markChannelAsValidated(id) {
    if (!this.#channelMap.has(id)) {
      throw new ChannelNotFoundError(id);
    }

    this.#validatedChannels.set(id, new Date());
    this.#logger.debug(`Canal marcado como validado: ${id}`);
    
    const channel = this.#channelMap.get(id);
    return channel.markAsValidated();
  }

  /**
   * @override
   */
  async deactivateChannel(id) {
    if (!this.#channelMap.has(id)) {
      throw new ChannelNotFoundError(id);
    }

    const channel = this.#channelMap.get(id);
    
    if (!this.#config.validation.removeInvalidStreams) {
      this.#logger.debug(`Desactivación de canal ${id} omitida (REMOVE_INVALID_STREAMS=false)`);
      return channel;
    }

    this.#deactivatedChannels.add(id);
    this.#logger.info(`Canal desactivado: ${id}`);
    return channel.deactivate();
  }

  /**
   * @override
   */
  async refreshFromRemote() {
    this.#logger.info('Refrescando repositorio CSV...');
    await this.#loadChannelsFromCSV();
  }

  /**
   * @override
   */
  async getChannelsNeedingValidation(hoursThreshold = 6) {
    await this.#refreshIfNeeded();
    
    const sampleSize = Math.min(10, this.#channels.length);
    const shuffled = [...this.#channels].sort(() => 0.5 - Math.random());
    
    return shuffled.slice(0, sampleSize);
  }

  /**
   * @override
   */
  async getRepositoryStats() {
    await this.#refreshIfNeeded();
    
    const genreStats = await this.getChannelsCountByGenre();
    const countries = await this.getAvailableCountries();
    const languages = await this.getAvailableLanguages();
    
    // Estadísticas de calidad
    const qualityStats = {};
    this.#channels.forEach(channel => {
      const quality = channel.quality.value;
      qualityStats[quality] = (qualityStats[quality] || 0) + 1;
    });

    // Estadísticas de streams válidos
    const validStreams = this.#channels.filter(ch => ch.isValidStream()).length;
    const invalidStreams = this.#channels.length - validStreams;

    return {
      totalChannels: this.#channels.length,
      validStreams,
      invalidStreams,
      validStreamPercentage: ((validStreams / this.#channels.length) * 100).toFixed(2),
      genreStats,
      qualityStats,
      countries: countries.length,
      languages: languages.length,
      lastLoadTime: this.#lastLoadTime,
      filePath: this.#filePath,
      repositoryType: 'CSV'
    };
  }

  /**
   * Filtra canales activos según configuración
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #filterActiveChannels(channels) {
    if (!this.#config.validation.removeInvalidStreams) {
      return channels;
    }
    
    return channels.filter(channel => !this.#deactivatedChannels.has(channel.id));
  }

  /**
   * Obtiene todos los canales sin filtrar (incluye desactivados)
   * Para uso en validaciones que deben verificar la lista completa original
   * @returns {Promise<Channel[]>}
   */
  async getAllChannelsUnfiltered() {
    await this.#refreshIfNeeded();
    return [...this.#channels];
  }

  /**
   * Obtiene canales paginados sin filtrar (incluye desactivados)
   * Para uso en validaciones que deben verificar la lista completa original
   * @param {number} skip - Número de canales a omitir
   * @param {number} limit - Número máximo de canales a retornar
   * @returns {Promise<Channel[]>}
   */
  async getChannelsPaginatedUnfiltered(skip = 0, limit = 20) {
    await this.#refreshIfNeeded();
    return this.#channels.slice(Math.max(0, skip), Math.max(0, skip) + limit);
  }

  /**
   * Obtiene información de diagnóstico del repositorio
   * @returns {Object}
   */
  getDiagnosticInfo() {
    return {
      isInitialized: this.#isInitialized,
      filePath: this.#filePath,
      channelCount: this.#channels.length,
      activeChannelCount: this.#filterActiveChannels(this.#channels).length,
      deactivatedChannelCount: this.#deactivatedChannels.size,
      lastLoadTime: this.#lastLoadTime,
      needsRefresh: this.#needsRefresh()
    };
  }
}

export default CSVChannelRepository;
