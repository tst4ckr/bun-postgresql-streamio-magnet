import csv from 'csv-parser';
import { MagnetRepository, RepositoryError, MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { Magnet } from '../../domain/entities/Magnet.js';
import { Readable } from 'stream';

/**
 * Repositorio para cargar magnets desde URLs remotas de archivos CSV.
 * Implementa el patrón Repository con soporte para fuentes remotas.
 */
export class RemoteCSVMagnetRepository extends MagnetRepository {
  #url;
  #magnets = [];
  #magnetMap = new Map();
  #isInitialized = false;
  #logger;
  #timeout;

  constructor(url, logger = console, timeout = 30000) {
    super();
    this.#url = url;
    this.#logger = logger;
    this.#timeout = timeout;
  }

  async initialize() {
    if (this.#isInitialized) return;

    try {
      await this.#loadFromRemoteCSV();
      this.#isInitialized = true;
    } catch (error) {
      throw new RepositoryError(`Error al cargar CSV desde URL: ${this.#url}`, error);
    }
  }

  async #loadFromRemoteCSV() {
    this.#logger.info(`Cargando magnets desde URL remota: ${this.#url}`);
    
    const response = await this.#fetchWithTimeout(this.#url, this.#timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const csvText = await response.text();
    const stream = Readable.from(csvText).pipe(csv());
    
    for await (const row of stream) {
      try {
        // Mapear campos para compatibilidad con el nuevo esquema
        const magnetData = {
          content_id: row.imdb_id || row.content_id, // Compatibilidad hacia atrás
          name: row.name,
          magnet: row.magnet,
          quality: row.quality,
          size: row.size,
          // Campos opcionales para compatibilidad
          imdb_id: row.imdb_id,
          id_type: row.id_type || (row.imdb_id ? 'imdb' : 'unknown'),
          // Campos adicionales opcionales
          provider: row.provider,
          filename: row.filename,
          seeders: row.seeders ? parseInt(row.seeders, 10) : undefined,
          peers: row.peers ? parseInt(row.peers, 10) : undefined,
          // Campos de temporada y episodio para series/anime
          season: row.season ? parseInt(row.season, 10) : undefined,
          episode: row.episode ? parseInt(row.episode, 10) : undefined
        };
        
        // Filtrar campos undefined para mantener el objeto limpio
        Object.keys(magnetData).forEach(key => {
          if (magnetData[key] === undefined || magnetData[key] === '') {
            delete magnetData[key];
          }
        });
        
        const magnet = new Magnet(magnetData);
        this.#magnets.push(magnet);
        this.#addToMap(magnet);
      } catch (error) {
        this.#logger.error(`Fila CSV inválida: ${JSON.stringify(row)}, error: ${JSON.stringify(error.issues || error.message)}`);
      }
    }
    
    this.#logger.info(`Cargados ${this.#magnets.length} magnets desde URL remota`);
  }

  #addToMap(magnet) {
    // Indexar por content_id (principal)
    if (!this.#magnetMap.has(magnet.content_id)) {
      this.#magnetMap.set(magnet.content_id, []);
    }
    this.#magnetMap.get(magnet.content_id).push(magnet);
    
    // Indexar también por imdb_id para compatibilidad hacia atrás
    if (magnet.imdb_id && magnet.imdb_id !== magnet.content_id) {
      if (!this.#magnetMap.has(magnet.imdb_id)) {
        this.#magnetMap.set(magnet.imdb_id, []);
      }
      this.#magnetMap.get(magnet.imdb_id).push(magnet);
    }
  }

  async #fetchWithTimeout(url, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Stremio-Magnet-Search-Addon/1.0.0'
        }
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Timeout al cargar CSV desde URL: ${url}`);
      }
      throw error;
    }
  }

  /**
   * Busca magnets por content ID con soporte para filtrado por season/episode.
   * @param {string} contentId - ID de contenido (puede incluir season:episode, ej: tt1234567:1:2)
   * @param {string} type - Tipo de contenido ('movie', 'series', 'anime')
   * @param {Object} options - Opciones de búsqueda (season, episode)
   * @returns {Promise<Magnet[]>} Array de magnets encontrados, filtrados por season/episode si se especifica
   * @throws {MagnetNotFoundError} Si no se encuentran magnets
   */
  async getMagnetsByContentId(contentId, type = 'movie', options = {}) {
    if (!this.#isInitialized) await this.initialize();
    
    // Extraer season/episode del contentId o de options
    let targetSeason = options.season;
    let targetEpisode = options.episode;
    let baseContentId = contentId;
    
    // Si el contentId incluye season:episode, extraerlos
    if (contentId.includes(':')) {
      const parts = contentId.split(':');
      if (parts.length >= 3) {
        // Formato: id:season:episode
        baseContentId = parts[0];
        if (targetSeason === undefined) {
          const seasonPart = parts[parts.length - 2];
          if (/^\d+$/.test(seasonPart)) {
            targetSeason = parseInt(seasonPart, 10);
          }
        }
        if (targetEpisode === undefined) {
          const episodePart = parts[parts.length - 1];
          if (/^\d+$/.test(episodePart)) {
            targetEpisode = parseInt(episodePart, 10);
          }
        }
      }
    }
    
    // Buscar magnets por contentId completo primero
    let magnets = this.#magnetMap.get(contentId) || [];
    
    // Si no se encontraron, buscar por ID base
    if (magnets.length === 0) {
      const imdbish = baseContentId.startsWith('tt') ? baseContentId : `tt${baseContentId}`;
      magnets = this.#magnetMap.get(baseContentId) || this.#magnetMap.get(imdbish) || [];
    }
    
    // Filtrar por season/episode si se especificó y es una serie/anime
    if ((type === 'series' || type === 'anime') && (targetSeason !== undefined || targetEpisode !== undefined)) {
      magnets = this.#filterMagnetsByEpisode(magnets, targetSeason, targetEpisode, baseContentId);
    }
    
    if (magnets.length === 0) {
      this.#logger?.debug(`No se encontraron magnets para ${contentId} (type=${type}, season=${targetSeason}, episode=${targetEpisode})`);
      throw new MagnetNotFoundError(contentId);
    }
    
    this.#logger?.debug(`Retornando ${magnets.length} magnets para ${contentId} (type=${type}, season=${targetSeason}, episode=${targetEpisode})`);
    return magnets;
  }
  
  /**
   * Filtra magnets por season/episode.
   * @private
   * @param {Magnet[]} magnets - Lista de magnets a filtrar
   * @param {number|undefined} targetSeason - Temporada objetivo
   * @param {number|undefined} targetEpisode - Episodio objetivo
   * @param {string} baseContentId - ID base para logging
   * @returns {Magnet[]} Magnets filtrados
   */
  #filterMagnetsByEpisode(magnets, targetSeason, targetEpisode, baseContentId) {
    if (!magnets || magnets.length === 0) return [];
    
    // Si no hay season/episode especificado, devolver todos
    if (targetSeason === undefined && targetEpisode === undefined) {
      return magnets;
    }
    
    const filtered = magnets.filter(magnet => {
      let magnetSeason, magnetEpisode;
      
      // Prioridad 1: Si el magnet tiene season/episode explícitos, usarlos
      if (magnet.season !== undefined && magnet.episode !== undefined) {
        magnetSeason = magnet.season;
        magnetEpisode = magnet.episode;
      }
      // Prioridad 2: Si el magnet no tiene season/episode pero el content_id los incluye, extraerlos
      else if (magnet.content_id && magnet.content_id.includes(':')) {
        const parts = magnet.content_id.split(':');
        if (parts.length >= 3) {
          const seasonPart = parts[parts.length - 2];
          const episodePart = parts[parts.length - 1];
          
          if (/^\d+$/.test(seasonPart) && /^\d+$/.test(episodePart)) {
            magnetSeason = parseInt(seasonPart, 10);
            magnetEpisode = parseInt(episodePart, 10);
          }
        }
      }
      
      // Si se especificó season y episode, hacer coincidencia estricta
      if (targetSeason !== undefined && targetEpisode !== undefined) {
        // Solo incluir si el magnet tiene season/episode Y coinciden exactamente
        if (magnetSeason !== undefined && magnetEpisode !== undefined) {
          const exactMatch = magnetSeason === targetSeason && magnetEpisode === targetEpisode;
          if (!exactMatch) {
            this.#logger?.debug(`Magnets filtrado: magnet S${magnetSeason}E${magnetEpisode} no coincide con S${targetSeason}E${targetEpisode}`);
          }
          return exactMatch;
        }
        // Si el magnet no tiene season/episode y se requiere coincidencia exacta, excluir
        return false;
      }
      
      // Si solo se especifica season o episode, hacer coincidencia parcial
      if (targetSeason !== undefined) {
        return magnetSeason === targetSeason;
      }
      
      if (targetEpisode !== undefined) {
        return magnetEpisode === targetEpisode;
      }
      
      // Si no se especificó filtro, incluir todos
      return true;
    });
    
    if (magnets.length !== filtered.length) {
      this.#logger?.info(`Filtrado de magnets para ${baseContentId}: ${magnets.length} -> ${filtered.length} (season=${targetSeason}, episode=${targetEpisode})`);
    } else if (targetSeason !== undefined || targetEpisode !== undefined) {
      this.#logger?.debug(`Filtrado de magnets para ${baseContentId}: ${magnets.length} magnets (todos coinciden con season=${targetSeason}, episode=${targetEpisode})`);
    }
    
    return filtered;
  }

  /**
   * Busca magnets por IMDb ID (método legacy para compatibilidad).
   * @param {string} imdbId - ID de IMDb
   * @param {string} type - Tipo de contenido ('movie' o 'series') - no usado en CSV remoto
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   * @throws {MagnetNotFoundError} Si no se encuentran magnets
   */
  async getMagnetsByImdbId(imdbId, type = 'movie') {
    return this.getMagnetsByContentId(imdbId, type);
  }
}