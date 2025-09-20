/**
 * @fileoverview LocalM3UChannelRepository - Implementación para archivos M3U locales
 * Implementa ChannelRepository para fuentes de datos desde archivos M3U en el sistema de archivos
 */

import fs from 'fs/promises';
import path from 'path';
import { ChannelRepository, RepositoryError, ChannelNotFoundError } from '../../domain/repositories/ChannelRepository.js';
import { Channel } from '../../domain/entities/Channel.js';
import { M3UParserService } from '../parsers/M3UParserService.js';
import ContentFilterService from '../../domain/services/ContentFilterService.js';
import { filterBannedChannels } from '../../config/banned-channels.js';

/**
 * Repositorio de canales basado en un archivo M3U local
 * Responsabilidad: gestionar canales desde un archivo M3U local, incluyendo cache
 */
export class LocalM3UChannelRepository extends ChannelRepository {
  #m3uFilePath;
  #parser;
  #config;
  #logger;
  #channels = [];
  #channelMap = new Map();
  #isInitialized = false;
  #lastLoadTime = null;
  #deactivatedChannels = new Set();
  #validatedChannels = new Map(); // channelId -> timestamp
  #lastModifiedTime = null;
  #contentFilter; // Servicio de filtrado de contenido

  constructor(m3uFilePath, parser, config, logger = console) {
    super();
    if (!m3uFilePath) {
      throw new Error('La ruta del archivo M3U es requerida para LocalM3UChannelRepository');
    }
    this.#m3uFilePath = path.resolve(m3uFilePath);
    this.#parser = parser;
    this.#config = config;
    this.#logger = logger;
    
    // Inicializar servicio de filtrado de contenido
    this.#contentFilter = new ContentFilterService(config.filters);
  }

  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Repositorio M3U local ya inicializado.');
      return;
    }
    try {
      this.#logger.info(`Cargando M3U local: ${this.#m3uFilePath}`);
      await this.#loadAndParseM3U();
      this.#isInitialized = true;
      this.#logger.info(`Repositorio M3U local inicializado: ${this.#channels.length} canales`);
    } catch (error) {
      throw new RepositoryError(`Error inicializando M3U local: ${error.message}`, error);
    }
  }

  async #loadAndParseM3U() {
    try {
      // Verificar si el archivo existe
      const stats = await fs.stat(this.#m3uFilePath);
      this.#lastModifiedTime = stats.mtime;
      
      // Leer el contenido del archivo
      const content = await fs.readFile(this.#m3uFilePath, 'utf-8');
      
      if (!content.trim()) {
        this.#logger.warn(`M3U local vacío: ${this.#m3uFilePath}`);
        this.#channels = [];
        this.#channelMap.clear();
        return;
      }

      const parsedChannels = await this.#parser.parseM3U(content);
      let filteredChannels = parsedChannels.filter(channel => this.#passesConfigFilters(channel));
      
      // Aplicar filtrado de canales prohibidos durante la inicialización
      const beforeBannedCount = filteredChannels.length;
      filteredChannels = filterBannedChannels(filteredChannels);
      const bannedRemovedCount = beforeBannedCount - filteredChannels.length;
      
      this.#channels = filteredChannels;
      
      this.#channelMap.clear();
      this.#channels.forEach(channel => this.#channelMap.set(channel.id, channel));
      
      this.#lastLoadTime = new Date();
      this.#logger.info(`M3U local cargado: ${this.#channels.length} canales desde ${this.#m3uFilePath}${bannedRemovedCount > 0 ? ` (${bannedRemovedCount} prohibidos)` : ''}`);

    } catch (error) {
      if (error.code === 'ENOENT') {
        this.#logger.warn(`M3U local no encontrado: ${this.#m3uFilePath}`);
        this.#channels = [];
        this.#channelMap.clear();
        return;
      }
      
      this.#logger.error(`Error leyendo M3U local ${this.#m3uFilePath}: ${error.message}`);
      
      if (this.#channels.length === 0) {
        throw new RepositoryError(`No se pudo cargar M3U local.`, error);
      } else {
        this.#logger.warn('No se pudo refrescar M3U local, usando caché.');
      }
    }
  }

  #passesConfigFilters(channel) {
    const { filters, streaming } = this.#config;
    const channelCountry = (channel.country || '').toUpperCase();

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
      if (adultGenres.some(g => channel.genre.toLowerCase().includes(g))) return false;
    }

    return true;
  }
  
  async #needsRefresh() {
    if (!this.#lastLoadTime || !this.#lastModifiedTime) return true;
    
    try {
      const stats = await fs.stat(this.#m3uFilePath);
      // Verificar si el archivo ha sido modificado
      if (stats.mtime > this.#lastModifiedTime) {
        return true;
      }
    } catch (error) {
      // Si no se puede acceder al archivo, no necesita refresco
      return false;
    }
    
    // Verificar cache por tiempo
    const { cacheChannelsHours } = this.#config.streaming;
    const cacheAgeMs = cacheChannelsHours * 60 * 60 * 1000;
    return (new Date() - this.#lastLoadTime) > cacheAgeMs;
  }

  async #refreshIfNeeded() {
    if (await this.#needsRefresh()) {
      this.#logger.info('Refrescando M3U local...');
      await this.#loadAndParseM3U();
    }
  }

  #filterActiveChannels(channels) {
    if (!this.#config.validation.removeInvalidStreams) {
      return channels;
    }
    return channels.filter(channel => !this.#deactivatedChannels.has(channel.id));
  }

  // Implementación de métodos del contrato ChannelRepository
  async getAllChannels() {
    await this.#refreshIfNeeded();
    let channels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const originalCount = channels.length;
      const filterResult = this.#contentFilter.filterChannels(channels);
      channels = filterResult.filteredChannels;
      
      // Log de estadísticas de filtrado
      if (filterResult.removedChannels.length > 0) {
        this.#logger.info(`Filtros de contenido: ${filterResult.removedChannels.length} canales removidos`);
        this.#logger.debug('Canales removidos por categoría:', {
          religioso: filterResult.removedByCategory.religious,
          adulto: filterResult.removedByCategory.adult,
          político: filterResult.removedByCategory.political
        });
      }
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = channels.length;
    channels = filterBannedChannels(channels);
    const afterBannedCount = channels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de prohibidos: ${bannedRemovedCount} canales removidos`);
    }
    
    return channels;
  }

  async getAllChannelsUnfiltered() {
    await this.#refreshIfNeeded();
    return [...this.#channels];
  }

  async getChannelById(id) {
    await this.#refreshIfNeeded();
    const channel = this.#channelMap.get(id);
    if (!channel || (this.#config.validation.removeInvalidStreams && this.#deactivatedChannels.has(id))) {
      throw new ChannelNotFoundError(id);
    }
    return channel;
  }

  async getChannelsByGenre(genre) {
    await this.#refreshIfNeeded();
    let channels = this.#channels.filter(ch => ch.genre.toLowerCase() === genre.toLowerCase());
    channels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filterResult = this.#contentFilter.filterChannels(channels);
      channels = filterResult.filteredChannels;
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = channels.length;
    channels = filterBannedChannels(channels);
    const afterBannedCount = channels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de prohibidos: ${bannedRemovedCount} canales removidos`);
    }
    
    return channels;
  }
  
  async getChannelsByCountry(country) {
    await this.#refreshIfNeeded();
    let channels = this.#channels.filter(ch => ch.country.toLowerCase().includes(country.toLowerCase()));
    channels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filterResult = this.#contentFilter.filterChannels(channels);
      channels = filterResult.filteredChannels;
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = channels.length;
    channels = filterBannedChannels(channels);
    const afterBannedCount = channels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de prohibidos: ${bannedRemovedCount} canales removidos`);
    }
    
    return channels;
  }

  async getChannelsByLanguage(language) {
    await this.#refreshIfNeeded();
    let channels = this.#channels.filter(ch => ch.language.toLowerCase() === language.toLowerCase());
    channels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filterResult = this.#contentFilter.filterChannels(channels);
      channels = filterResult.filteredChannels;
    }
    
    return channels;
  }

  async searchChannels(searchTerm) {
    await this.#refreshIfNeeded();
    const term = searchTerm.toLowerCase();
    let channels = this.#channels.filter(ch => 
      ch.name.toLowerCase().includes(term) || 
      ch.genre.toLowerCase().includes(term)
    );
    channels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filterResult = this.#contentFilter.filterChannels(channels);
      channels = filterResult.filteredChannels;
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = channels.length;
    channels = filterBannedChannels(channels);
    const afterBannedCount = channels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de prohibidos: ${bannedRemovedCount} canales removidos`);
    }
    
    return channels;
  }

  async getChannelsByFilter(filter) {
    await this.#refreshIfNeeded();
    let channels = [...this.#channels];

    if (filter.genre) {
      channels = channels.filter(ch => ch.genre.toLowerCase() === filter.genre.toLowerCase());
    }
    if (filter.country) {
      channels = channels.filter(ch => ch.country.toLowerCase().includes(filter.country.toLowerCase()));
    }
    if (filter.language) {
      channels = channels.filter(ch => ch.language.toLowerCase() === filter.language.toLowerCase());
    }
    if (filter.quality) {
      channels = channels.filter(ch => ch.quality === filter.quality);
    }

    channels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filterResult = this.#contentFilter.filterChannels(channels);
      channels = filterResult.filteredChannels;
    }
    
    return channels;
  }
  
  async getChannelsPaginated(skip = 0, limit = 50) {
    await this.#refreshIfNeeded();
    let channels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filterResult = this.#contentFilter.filterChannels(channels);
      channels = filterResult.filteredChannels;
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = channels.length;
    channels = filterBannedChannels(channels);
    const afterBannedCount = channels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de prohibidos: ${bannedRemovedCount} canales removidos`);
    }
    
    return channels.slice(skip, skip + limit);
  }

  async getChannelsPaginatedUnfiltered(skip = 0, limit = 50) {
    await this.#refreshIfNeeded();
    return this.#channels.slice(skip, skip + limit);
  }

  async getAvailableGenres() {
    await this.#refreshIfNeeded();
    let channels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filterResult = this.#contentFilter.filterChannels(channels);
      channels = filterResult.filteredChannels;
    }
    
    const genres = new Set(channels.map(ch => ch.genre));
    return Array.from(genres).sort();
  }
  
  async getChannelsCount() {
    await this.#refreshIfNeeded();
    let channels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filterResult = this.#contentFilter.filterChannels(channels);
      channels = filterResult.filteredChannels;
    }
    
    return channels.length;
  }

  async refreshFromRemote() {
    this.#logger.info('Forzando refresco de M3U local...');
    await this.#loadAndParseM3U();
  }

  async getChannelsNeedingValidation(hoursThreshold = 6) {
    await this.#refreshIfNeeded();
    
    const sampleSize = Math.min(30, this.#channels.length);
    const shuffled = [...this.#channels].sort(() => 0.5 - Math.random());
    
    return shuffled.slice(0, sampleSize);
  }

  // Métodos de gestión de canales inválidos
  async markChannelAsValidated(channelId) {
    this.#validatedChannels.set(channelId, new Date());
    this.#deactivatedChannels.delete(channelId);
    this.#logger.debug(`Canal M3U local ${channelId} validado`);
  }

  async deactivateChannel(channelId, reason) {
    this.#deactivatedChannels.add(channelId);
    this.#logger.info(`Canal M3U local ${channelId} desactivado: ${reason}`);
  }

  async getDeactivationStats() {
    return {
      deactivatedCount: this.#deactivatedChannels.size,
      validatedCount: this.#validatedChannels.size,
      deactivatedChannels: Array.from(this.#deactivatedChannels),
      lastValidationTimes: Object.fromEntries(this.#validatedChannels)
    };
  }

  async getRepositoryStats() {
    await this.#refreshIfNeeded();
    const totalChannels = this.#channels.length;
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
    const activeCount = activeChannels.length;
    
    let filteredCount = activeCount;
    let contentFilterStats = null;
    
    // Obtener estadísticas de filtrado de contenido si está activo
    if (this.#contentFilter.hasActiveFilters()) {
      const filterResult = this.#contentFilter.filterChannels(activeChannels);
      filteredCount = filterResult.filteredChannels.length;
      
      contentFilterStats = {
        enabled: true,
        removedChannels: filterResult.removedChannels.length,
        removalPercentage: activeCount > 0 ? ((filterResult.removedChannels.length / activeCount) * 100).toFixed(2) : '0.00',
        removedByCategory: filterResult.removedByCategory,
        activeFilters: this.#contentFilter.getActiveFilters(),
        filterConfiguration: this.#contentFilter.getFilterConfiguration()
      };
    } else {
      contentFilterStats = {
        enabled: false,
        removedChannels: 0,
        removalPercentage: '0.00',
        removedByCategory: { religious: 0, adult: 0, political: 0 },
        activeFilters: [],
        filterConfiguration: {}
      };
    }
    
    return {
      type: 'LocalM3U',
      filePath: this.#m3uFilePath,
      totalChannels,
      activeChannels: activeCount,
      filteredChannels: filteredCount,
      deactivatedChannels: this.#deactivatedChannels.size,
      validatedChannels: this.#validatedChannels.size,
      lastLoadTime: this.#lastLoadTime,
      lastModifiedTime: this.#lastModifiedTime,
      contentFiltering: contentFilterStats
    };
  }

  // Métodos no aplicables para un repo local de solo lectura
  async updateChannel(channel) {
    throw new RepositoryError('El repositorio M3U local es de solo lectura.');
  }

  // Método específico para obtener información del archivo
  async getFileInfo() {
    try {
      const stats = await fs.stat(this.#m3uFilePath);
      return {
        filePath: this.#m3uFilePath,
        exists: true,
        size: stats.size,
        lastModified: stats.mtime,
        lastLoaded: this.#lastLoadTime
      };
    } catch (error) {
      return {
        filePath: this.#m3uFilePath,
        exists: false,
        error: error.message
      };
    }
  }
}

export default LocalM3UChannelRepository;