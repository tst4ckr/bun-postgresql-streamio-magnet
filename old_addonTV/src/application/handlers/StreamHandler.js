/**
 * @fileoverview StreamHandler - Maneja las peticiones de streams de Stremio
 * Implementa los principios de Clean Architecture con separación de responsabilidades
 */

import { ChannelNotFoundError } from '../../domain/repositories/ChannelRepository.js';
import { BitelUidService } from '../../infrastructure/services/BitelUidService.js';



/**
 * Handler para peticiones de streams de TV en vivo
 * Responsabilidad única: convertir canales a formato de stream de Stremio
 */
export class StreamHandler {
  /**
   * @private
   */
  #channelService;
  #config;
  #logger;
  #bitelUidService;



  /**
   * @param {Object} channelService - Servicio de canales
   * @param {Object} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(channelService, config, logger = console) {
    this.#channelService = channelService;
    this.#config = config;
    this.#logger = logger;
    this.#bitelUidService = new BitelUidService(config, logger);

  }



  /**
   * Crea el handler para el addon de Stremio
   * @returns {Function} Handler function para defineStreamHandler
   */
  createAddonHandler() {
    return async (args) => {
      const startTime = Date.now();
      
      try {
        this.#logger.info(`Petición de stream: ${JSON.stringify(args)}`);
        
        const result = await this.#handleStreamRequest(args);
        
        const duration = Date.now() - startTime;
        this.#logger.info(`Petición completada en ${duration}ms`);
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        this.#logger.error(`Petición fallida en ${duration}ms:`, error);
        
        return this.#createErrorResponse(error);
      }
    };
  }

  /**
   * Maneja la petición de stream de Stremio
   * @private
   * @param {Object} args - Argumentos de la petición
   * @returns {Promise<Object>}
   */
  async #handleStreamRequest(args) {
    const { type, id, config: userConfig } = args;
    
    // Validar argumentos
    this.#validateStreamRequest(args);
    
    // Validar que el repositorio esté completamente inicializado
    await this.#ensureRepositoryReady();
    
    // Solo manejar tipos TV
    if (!this.#isSupportedType(type)) {
      this.#logger.warn(`Tipo no soportado: ${type}`);
      return this.#createEmptyResponse();
    }

    // Obtener el canal
    const channel = await this.#getChannel(id, userConfig);
    
    if (!channel) {
      this.#logger.warn(`Canal no hallado: ${id}`);
      return this.#createEmptyResponse();
    }

    // Validar que el canal tenga stream válido
    if (!channel.isValidStream()) {
      this.#logger.warn(`Stream inválido: ${id}`);
      return this.#createEmptyResponse();
    }

    // Crear stream para TV en vivo con validación y fallback
    const stream = await this.#createStreamFromChannel(channel, userConfig);
    
    // Aplicar filtros de configuración de usuario
    const filteredStreams = this.#applyUserFilters([stream], userConfig);
    
    return this.#createStreamResponse(filteredStreams);
  }

  /**
   * Valida los argumentos de la petición
   * @private
   * @param {Object} args 
   * @throws {Error}
   */
  #validateStreamRequest(args) {
    if (!args?.type || typeof args.type !== 'string') {
      throw new Error('Tipo de contenido inválido');
    }
    if (!args.id || typeof args.id !== 'string') {
      throw new Error('ID de contenido inválido');
    }
  }

  /**
   * Verifica si el tipo es soportado por Stremio TV
   * @private
   * @param {string} type 
   * @returns {boolean}
   */
  #isSupportedType(type) {
    return type === 'tv';
  }

  /**
   * Obtiene el canal por ID
   * @private
   * @param {string} id 
   * @param {Object} userConfig 
   * @returns {Promise<Channel|null>}
   */
  async #getChannel(id, userConfig = {}) {
    try {
      // Si el usuario proporcionó una URL M3U personalizada
      if (userConfig.m3u_url) {
        const customChannels = await this.#channelService.getChannelsFromCustomM3U(userConfig.m3u_url);
        const customChannel = customChannels.find(ch => ch.id === id);
        if (customChannel) {
          return customChannel;
        }
      }

      // Buscar en el repositorio principal
      return await this.#channelService.getChannelById(id);
      
    } catch (error) {
      if (error instanceof ChannelNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Crea un stream desde un canal con validación y fallback
   * @private
   * @param {Channel} channel 
   * @param {Object} userConfig 
   * @returns {Promise<Object>}
   */
  async #createStreamFromChannel(channel, userConfig = {}) {
    // Obtener configuración de calidad preferida del usuario
    const preferredQuality = userConfig.preferred_quality || this.#config.streaming.defaultQuality;
    
    // Procesar URL con servicio de UID dinámico para canales BITEL
    let streamUrl = this.#bitelUidService.processStreamUrl(channel.streamUrl, channel.id);

    // Crear stream base
    const stream = {
      name: this.#generateStreamName(channel, preferredQuality),
      description: this.#generateStreamDescription(channel),
      url: streamUrl
    };

    // Configurar hints de comportamiento
    const behaviorHints = this.#createBehaviorHints(channel, userConfig);
    if (Object.keys(behaviorHints).length > 0) {
      stream.behaviorHints = behaviorHints;
    }

    // Agregar información adicional si está disponible
    if (channel.logo) {
      stream.icon = channel.logo;
    }

    return stream;
  }

  /**
   * Genera el nombre del stream
   * @private
   * @param {Channel} channel 
   * @param {string} preferredQuality 
   * @param {boolean} fallbackUsed 
   * @returns {string}
   */
  #generateStreamName(channel, preferredQuality, fallbackUsed = false) {
    const qualityInfo = channel.quality.value !== 'Auto' 
      ? channel.quality.value 
      : preferredQuality;
    
    const fallbackIndicator = fallbackUsed ? ' (Backup)' : '';
    
    return `${channel.name} (${qualityInfo})${fallbackIndicator}`;
  }

  /**
   * Genera la descripción del stream
   * @private
   * @param {Channel} channel 
   * @returns {string}
   */
  #generateStreamDescription(channel) {
    const parts = [
      channel.genre,
      channel.country,
      channel.language.toUpperCase()
    ];

    if (channel.quality.isHighDefinition()) {
      parts.push('HD');
    }

    return parts.join(' • ');
  }



  /**
   * Crea hints de comportamiento para el stream
   * @private
   * @param {Channel} channel 
   * @param {Object} userConfig 
   * @returns {Object}
   */
  #createBehaviorHints(channel, userConfig) {
    const hints = {};

    // Para streams RTMP o no-HTTP
    if (this.#requiresNotWebReady(channel.streamUrl)) {
      hints.notWebReady = true;
    }

    // Restricciones geográficas
    const countryWhitelist = this.#getCountryWhitelist(channel, userConfig);
    if (countryWhitelist.length > 0) {
      hints.countryWhitelist = countryWhitelist;
    }

    // Grupo de binge watching (para canales relacionados)
    if (channel.genre !== 'General') {
      hints.bingeGroup = `tv-iptv-${channel.genre.toLowerCase()}`;
    }

    // Headers de proxy si son necesarios
    const proxyHeaders = this.#getProxyHeaders(channel);
    if (proxyHeaders) {
      hints.proxyHeaders = proxyHeaders;
      hints.notWebReady = true; // Requerido cuando se usan proxy headers
    }

    return hints;
  }

  /**
   * Determina si el stream requiere notWebReady
   * @private
   * @param {string} streamUrl 
   * @returns {boolean}
   */
  #requiresNotWebReady(streamUrl) {
    return streamUrl.startsWith('rtmp') || 
           (streamUrl.startsWith('http://') && !streamUrl.startsWith('https://'));
  }

  /**
   * Obtiene la lista blanca de países
   * @private
   * @param {Channel} channel 
   * @param {Object} userConfig 
   * @returns {string[]}
   */
  #getCountryWhitelist(channel, userConfig) {
    const allowedCountries = this.#config.filters.allowedCountries;
    
    if (!allowedCountries?.length) return [];

    const countryCodeMap = {
      'MÉXICO': 'mx', 'MEXICO': 'mx', 'ESPAÑA': 'es', 'SPAIN': 'es',
      'ARGENTINA': 'ar', 'COLOMBIA': 'co', 'CHILE': 'cl', 'PERÚ': 'pe',
      'PERU': 'pe', 'ESTADOS UNIDOS': 'us', 'USA': 'us', 'REINO UNIDO': 'gb', 'UK': 'gb'
    };

    return allowedCountries
      .map(country => countryCodeMap[country.toUpperCase()] || country.toLowerCase())
      .filter(code => code.length === 2);
  }

  /**
   * Obtiene headers de proxy si son necesarios
   * @private
   * @param {Channel} channel 
   * @returns {Object|null}
   */
  #getProxyHeaders(channel) {
    // Algunos streams requieren headers específicos
    const streamUrl = channel.streamUrl.toLowerCase();
    
    if (streamUrl.includes('youtube') || streamUrl.includes('youtu.be')) {
      return {
        request: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      };
    }

    return null;
  }

  /**
   * Aplica filtros de configuración de usuario
   * @private
   * @param {Array} streams 
   * @param {Object} userConfig 
   * @returns {Array}
   */
  #applyUserFilters(streams, userConfig) {
    let filteredStreams = [...streams];

    if (userConfig.preferred_language) {
      const preferredLang = userConfig.preferred_language.toLowerCase();
      filteredStreams = filteredStreams.filter(stream => 
        stream.description.toLowerCase().includes(preferredLang)
      );
    }

    return userConfig.preferred_quality 
      ? this.#sortStreamsByQuality(filteredStreams, userConfig.preferred_quality)
      : filteredStreams;
  }

  /**
   * Ordena streams por calidad preferida
   * @private
   * @param {Array} streams 
   * @param {string} preferredQuality 
   * @returns {Array}
   */
  #sortStreamsByQuality(streams, preferredQuality) {
    const qualityPriority = {
      'HD': 3,
      'SD': 2,
      'Auto': 1
    };

    const preferredPriority = qualityPriority[preferredQuality] || 1;

    return streams.sort((a, b) => {
      const aPriority = this.#getStreamQualityPriority(a.name);
      const bPriority = this.#getStreamQualityPriority(b.name);
      
      // Priorizar streams que coincidan con la preferencia
      const aMatchesPreference = Math.abs(aPriority - preferredPriority);
      const bMatchesPreference = Math.abs(bPriority - preferredPriority);
      
      return aMatchesPreference - bMatchesPreference;
    });
  }

  /**
   * Obtiene la prioridad de calidad de un stream
   * @private
   * @param {string} streamName 
   * @returns {number}
   */
  #getStreamQualityPriority(streamName) {
    const name = streamName.toLowerCase();
    
    if (name.includes('hd') || name.includes('720') || name.includes('1080')) return 3;
    if (name.includes('sd') || name.includes('480')) return 2;
    return 1;
  }

  /**
   * Crea respuesta de streams para Stremio con cache optimizado para TV en vivo
   * @private
   * @param {Array} streams - Array de streams
   * @returns {Object}
   */
  #createStreamResponse(streams) {
    const cacheMaxAge = this.#config.cache.streamCacheMaxAge || 30;
    return {
      streams: streams || [],
      cacheMaxAge: cacheMaxAge,
      staleRevalidate: this.#config.cache.streamStaleRevalidate || cacheMaxAge * 2,
      staleError: this.#config.cache.streamStaleError || cacheMaxAge * 10
    };
  }

  /**
   * Asegura que el repositorio esté completamente inicializado
   * @private
   * @returns {Promise<void>}
   */
  async #ensureRepositoryReady() {
    // Verificar si el channelService tiene método de inicialización
    if (typeof this.#channelService.initialize === 'function') {
      // Esperar a que la inicialización esté completa
      await this.#channelService.initialize();
    }
    
    // Verificar estado de inicialización si está disponible
    if (this.#channelService.isInitialized !== undefined && !this.#channelService.isInitialized) {
      throw new Error('Repositorio no inicializado');
    }
  }

  /**
   * Crea respuesta vacía
   * @private
   * @returns {Object}
   */
  #createEmptyResponse() {
    return {
      streams: [],
      cacheMaxAge: this.#config.cache.streamCacheMaxAge
    };
  }

  /**
   * Crea respuesta de error
   * @private
   * @param {Error} error 
   * @returns {Object}
   */
  #createErrorResponse(error) {
    // No exponer detalles internos del error a Stremio
    this.#logger.error('Error en handler:', error);
    
    return {
      streams: [],
      cacheMaxAge: 60 // Cache corto para errores
    };
  }
}

export default StreamHandler;
