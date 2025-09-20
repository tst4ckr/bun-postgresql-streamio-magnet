/**
 * @fileoverview RemoteM3UChannelRepository - Implementación para listas M3U remotas
 * Implementa ChannelRepository para fuentes de datos desde una URL M3U
 */

import axios from 'axios';
import { ChannelRepository, RepositoryError, ChannelNotFoundError } from '../../domain/repositories/ChannelRepository.js';
import { Channel } from '../../domain/entities/Channel.js';
import { M3UParserService } from '../parsers/M3UParserService.js';
import ContentFilterService from '../../domain/services/ContentFilterService.js';
import { filterAllowedChannels } from '../../config/allowed-channels.js';
import { filterBannedChannels } from '../../config/banned-channels.js';
import fetch from 'node-fetch';

/**
 * Repositorio de canales basado en una URL M3U remota
 * Responsabilidad: gestionar canales desde una fuente M3U remota, incluyendo cache
 */
export class RemoteM3UChannelRepository extends ChannelRepository {
  #m3uUrl;
  #parser;
  #config;
  #logger;
  #channels = [];
  #channelMap = new Map();
  #isInitialized = false;
  #isInitializing = false;
  #lastLoadTime = null;
  #deactivatedChannels = new Set();
  #validatedChannels = new Map(); // channelId -> timestamp
  #contentFilter; // Servicio de filtrado de contenido

  constructor(m3uUrl, parser, config, logger = console) {
    super();
    if (!m3uUrl) {
      throw new Error('La URL del M3U es requerida para RemoteM3UChannelRepository');
    }
    this.#m3uUrl = m3uUrl;
    this.#parser = parser;
    this.#config = config;
    this.#logger = logger;
    
    // Inicializar servicio de filtrado de contenido
    this.#contentFilter = new ContentFilterService(config.filters);
  }

  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Repo M3U remoto ya inicializado.');
      return;
    }

    if (this.#isInitializing) {
      this.#logger.info('Inicialización en progreso, esperando...');
      // Esperar hasta que termine la inicialización
      while (this.#isInitializing && !this.#isInitialized) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    try {
      this.#isInitializing = true;
      this.#logger.info(`Cargando M3U remoto: ${this.#m3uUrl}`);
      await this.#fetchAndParseM3U();
      this.#isInitialized = true;
      this.#logger.info(`Repo M3U remoto inicializado: ${this.#channels.length} canales`);
    } catch (error) {
      throw new RepositoryError(`Error inicializando repo M3U remoto: ${error.message}`, error);
    } finally {
      this.#isInitializing = false;
    }
  }

  async #fetchAndParseM3U() {
    try {
      const response = await axios.get(this.#m3uUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'Stremio-TV-IPTV-Addon/1.0.0' }
      });
      
      if (response.status !== 200) {
        throw new Error(`Respuesta HTTP inesperada: ${response.status}`);
      }

      const parsedChannels = await this.#parser.parseM3U(response.data);
      const configFilteredChannels = parsedChannels.filter(channel => this.#passesConfigFilters(channel));
      
      // Aplicar filtro inteligente de canales permitidos
      const beforeAllowedCount = configFilteredChannels.length;
      const allowedFilteredChannels = filterAllowedChannels(configFilteredChannels);
      const afterAllowedCount = allowedFilteredChannels.length;
      const allowedRemovedCount = beforeAllowedCount - afterAllowedCount;
      
      // Aplicar filtro de canales prohibidos
      const beforeBannedCount = allowedFilteredChannels.length;
      this.#channels = filterBannedChannels(allowedFilteredChannels);
      const afterBannedCount = this.#channels.length;
      const bannedRemovedCount = beforeBannedCount - afterBannedCount;
      
      this.#channelMap.clear();
      this.#channels.forEach(channel => this.#channelMap.set(channel.id, channel));
      
      this.#lastLoadTime = new Date();
      this.#logger.info(`M3U remoto cargado: ${this.#channels.length} canales válidos${allowedRemovedCount > 0 ? ` (${allowedRemovedCount} no permitidos)` : ''}${bannedRemovedCount > 0 ? `, ${bannedRemovedCount} prohibidos` : ''}`);

    } catch (error) {
      this.#logger.error(`Error obteniendo/parseando M3U de ${this.#m3uUrl}: ${error.message}`);
      
      if (this.#config.advanced.enableFailover && this.#config.dataSources.backupM3uUrl) {
        this.#logger.warn(`Intentando failover a: ${this.#config.dataSources.backupM3uUrl}`);
        this.#m3uUrl = this.#config.dataSources.backupM3uUrl;
        await this.#fetchAndParseM3U();
      } else if (this.#channels.length === 0) {
        throw new RepositoryError(`No se pudo cargar M3U y no hay backup.`, error);
      } else {
        this.#logger.warn('No se pudo refrescar M3U, usando caché.');
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
  
  #needsRefresh() {
    if (!this.#lastLoadTime) return true;
    const { cacheChannelsHours } = this.#config.streaming;
    const cacheAgeMs = cacheChannelsHours * 60 * 60 * 1000;
    return (new Date() - this.#lastLoadTime) > cacheAgeMs;
  }

  async #refreshIfNeeded() {
    // No refrescar si está inicializando
    if (this.#isInitializing) {
      return;
    }
    
    if (!this.#isInitialized) {
      if (this.#isInitializing) {
        // Si está inicializando, esperar a que termine
        while (this.#isInitializing && !this.#isInitialized) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else {
        await this.initialize();
      }
      return;
    }
    
    if (this.#needsRefresh()) {
      this.#logger.info('Refrescando M3U remoto...');
      await this.#fetchAndParseM3U();
    }
  }

  // Implementación de métodos del contrato ChannelRepository
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
        this.#logger.info(`Filtros de contenido: ${removedCount} canales removidos`, {
          religioso: stats.removedByCategory.religious,
          adulto: stats.removedByCategory.adult,
          político: stats.removedByCategory.political
        });
      }
    }
    
    // Aplicar filtrado de canales prohibidos (BANNED_CHANNELS)
    const beforeBannedCount = channels.length;
    channels = filterBannedChannels(channels);
    const afterBannedCount = channels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de prohibidos: ${bannedRemovedCount} canales removidos`);
    }
    
    return channels;
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
    const channels = this.#channels.filter(ch => ch.genre.toLowerCase() === genre.toLowerCase());
    let filteredChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      filteredChannels = this.#contentFilter.filterChannels(filteredChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    filteredChannels = filterBannedChannels(filteredChannels);
    
    return filteredChannels;
  }
  
  async getChannelsByCountry(country) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.country.toLowerCase().includes(country.toLowerCase()));
    let filteredChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      filteredChannels = this.#contentFilter.filterChannels(filteredChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    filteredChannels = filterBannedChannels(filteredChannels);
    
    return filteredChannels;
  }

  async getChannelsByLanguage(language) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.language.toLowerCase() === language.toLowerCase());
    let filteredChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      filteredChannels = this.#contentFilter.filterChannels(filteredChannels);
    }
    
    return filteredChannels;
  }

  async searchChannels(searchTerm) {
    await this.#refreshIfNeeded();
    const term = searchTerm.toLowerCase();
    const channels = this.#channels.filter(ch => ch.name.toLowerCase().includes(term) || ch.genre.toLowerCase().includes(term));
    let filteredChannels = this.#filterActiveChannels(channels);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      filteredChannels = this.#contentFilter.filterChannels(filteredChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    filteredChannels = filterBannedChannels(filteredChannels);
    
    return filteredChannels;
  }
  
  async getChannelsPaginated(skip = 0, limit = 20) {
    await this.#refreshIfNeeded();
    let activeChannels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    activeChannels = filterBannedChannels(activeChannels);
    
    return activeChannels.slice(skip, skip + limit);
  }

  async getAvailableGenres() {
    await this.#refreshIfNeeded();
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
    const genres = new Set(activeChannels.map(ch => ch.genre));
    return Array.from(genres).sort();
  }
  
  async getChannelsCount() {
    await this.#refreshIfNeeded();
    let activeChannels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    return activeChannels.length;
  }

  async refreshFromRemote() {
    this.#logger.info('Forzando refresco de M3U remoto...');
    await this.#fetchAndParseM3U();
  }

  // Métodos no aplicables para un repo remoto de solo lectura
  async updateChannel(channel) {
    throw new RepositoryError('El repositorio M3U remoto es de solo lectura.');
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
   * @override
   */
  async markChannelAsValidated(id) {
    if (!this.#channelMap.has(id)) {
      throw new ChannelNotFoundError(id);
    }

    this.#validatedChannels.set(id, new Date());
    this.#logger.debug(`Canal validado: ${id}`);
    
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
      this.#logger.debug(`Desactivación omitida (REMOVE_INVALID_STREAMS=false): ${id}`);
      return channel;
    }

    this.#deactivatedChannels.add(id);
    this.#logger.info(`Canal desactivado: ${id}`);
    return channel.deactivate();
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
    return this.#channels.slice(skip, skip + limit);
  }
}

export default RemoteM3UChannelRepository;
