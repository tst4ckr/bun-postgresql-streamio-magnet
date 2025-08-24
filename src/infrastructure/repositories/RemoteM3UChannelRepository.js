/**
 * @fileoverview RemoteM3UChannelRepository - Implementación para listas M3U remotas
 * Implementa ChannelRepository para fuentes de datos desde una URL M3U
 */

import axios from 'axios';
import { ChannelRepository, RepositoryError, ChannelNotFoundError } from '../../domain/repositories/ChannelRepository.js';
import { Channel } from '../../domain/entities/Channel.js';
import { M3UParserService } from '../parsers/M3UParserService.js';

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
  #lastLoadTime = null;
  #deactivatedChannels = new Set();
  #validatedChannels = new Map(); // channelId -> timestamp

  constructor(m3uUrl, parser, config, logger = console) {
    super();
    if (!m3uUrl) {
      throw new Error('La URL del M3U es requerida para RemoteM3UChannelRepository');
    }
    this.#m3uUrl = m3uUrl;
    this.#parser = parser;
    this.#config = config;
    this.#logger = logger;
  }

  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Repositorio M3U Remoto ya inicializado');
      return;
    }
    try {
      this.#logger.info(`Cargando canales desde M3U remoto: ${this.#m3uUrl}`);
      await this.#fetchAndParseM3U();
      this.#isInitialized = true;
      this.#logger.info(`Repositorio M3U Remoto inicializado con ${this.#channels.length} canales`);
    } catch (error) {
      throw new RepositoryError(`Error inicializando repositorio M3U remoto: ${error.message}`, error);
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
      this.#channels = parsedChannels.filter(channel => this.#passesConfigFilters(channel));
      
      this.#channelMap.clear();
      this.#channels.forEach(channel => this.#channelMap.set(channel.id, channel));
      
      this.#lastLoadTime = new Date();
      this.#logger.info(`M3U remoto cargado: ${this.#channels.length} canales válidos`);

    } catch (error) {
      this.#logger.error(`Error al obtener o parsear M3U de ${this.#m3uUrl}`, error);
      
      if (this.#config.advanced.enableFailover && this.#config.dataSources.backupM3uUrl) {
        this.#logger.warn(`Intentando failover con URL de backup: ${this.#config.dataSources.backupM3uUrl}`);
        this.#m3uUrl = this.#config.dataSources.backupM3uUrl;
        await this.#fetchAndParseM3U();
      } else if (this.#channels.length === 0) {
        throw new RepositoryError(`No se pudo cargar la lista M3U y no hay backup.`, error);
      } else {
        this.#logger.warn('No se pudo refrescar la lista M3U. Se usarán los datos cacheados.');
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
    if (this.#needsRefresh()) {
      this.#logger.info('Refrescando canales desde M3U remoto...');
      await this.#fetchAndParseM3U();
    }
  }

  // Implementación de métodos del contrato ChannelRepository
  async getAllChannels() {
    await this.#refreshIfNeeded();
    return this.#filterActiveChannels([...this.#channels]);
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
    return this.#filterActiveChannels(channels);
  }
  
  async getChannelsByCountry(country) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.country.toLowerCase().includes(country.toLowerCase()));
    return this.#filterActiveChannels(channels);
  }

  async getChannelsByLanguage(language) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.language.toLowerCase() === language.toLowerCase());
    return this.#filterActiveChannels(channels);
  }

  async searchChannels(searchTerm) {
    await this.#refreshIfNeeded();
    const term = searchTerm.toLowerCase();
    const channels = this.#channels.filter(ch => ch.name.toLowerCase().includes(term) || ch.genre.toLowerCase().includes(term));
    return this.#filterActiveChannels(channels);
  }
  
  async getChannelsPaginated(skip = 0, limit = 20) {
    await this.#refreshIfNeeded();
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
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
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
    return activeChannels.length;
  }

  async refreshFromRemote() {
    this.#logger.info('Forzando refresco desde M3U remoto...');
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
