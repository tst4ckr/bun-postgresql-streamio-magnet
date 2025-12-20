import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { MagnetRepository, RepositoryError, MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { Magnet } from '../../domain/entities/Magnet.js';

export class CSVMagnetRepository extends MagnetRepository {
  #filePath;
  #magnets = [];
  #magnetMap = new Map();
  #isInitialized = false;
  #logger;

  constructor(filePath, logger = console) {
    super();
    this.#filePath = filePath;
    this.#logger = logger;
  }

  async initialize() {
    if (this.#isInitialized) return;

    try {
      const { magnets, magnetMap } = await this.#loadDataFromCSV();
      this.#magnets = magnets;
      this.#magnetMap = magnetMap;
      this.#isInitialized = true;
    } catch (error) {
      throw new RepositoryError(`Error al cargar el archivo CSV: ${this.#filePath}`, error);
    }
  }

  /**
   * Recarga los datos del CSV de forma atómica.
   * Si falla la carga, mantiene los datos anteriores.
   */
  async reload() {
    try {
      const { magnets, magnetMap } = await this.#loadDataFromCSV();
      this.#magnets = magnets;
      this.#magnetMap = magnetMap;
      this.#isInitialized = true;
      this.#logger.info(`Repositorio CSV recargado: ${this.#filePath} (${magnets.length} items)`);
    } catch (error) {
      throw new RepositoryError(`Error al recargar el archivo CSV: ${this.#filePath}`, error);
    }
  }

  async #loadDataFromCSV() {
    const magnets = [];
    const magnetMap = new Map();
    const stream = createReadStream(this.#filePath).pipe(csv());

    for await (const row of stream) {
      try {
        // Preservar content_id original para construcción de URLs
        const originalContentId = row.content_id || row.imdb_id;

        // Mapear campos para compatibilidad con el nuevo esquema
        const magnetData = {
          content_id: originalContentId, // Preservar ID original
          original_content_id: originalContentId, // Campo adicional para referencia
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
        magnets.push(magnet);
        this.#addToMap(magnet, magnetMap);
      } catch (error) {
        this.#logger.error(`Fila CSV inválida: ${JSON.stringify(row)}, error: ${JSON.stringify(error.issues || error.message)}`);
      }
    }
    return { magnets, magnetMap };
  }

  #addToMap(magnet, map) {
    // Indexar por content_id (principal)
    if (!map.has(magnet.content_id)) {
      map.set(magnet.content_id, []);
    }
    map.get(magnet.content_id).push(magnet);

    // Indexar también por imdb_id para compatibilidad hacia atrás
    if (magnet.imdb_id && magnet.imdb_id !== magnet.content_id) {
      if (!map.has(magnet.imdb_id)) {
        map.set(magnet.imdb_id, []);
      }
      map.get(magnet.imdb_id).push(magnet);
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
      const beforeFilter = magnets.length;
      magnets = this.#filterMagnetsByEpisode(magnets, targetSeason, targetEpisode, baseContentId);
      if (beforeFilter > 0 && magnets.length === 0) {
        this.#logger?.warn(`Filtrado eliminó todos los magnets para ${contentId} (season=${targetSeason}, episode=${targetEpisode}). Posible problema de datos en CSV.`);
      }
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
      // Si el magnet tiene season/episode explícitos, usarlos
      if (magnet.season !== undefined && magnet.episode !== undefined) {
        const seasonMatch = targetSeason === undefined || magnet.season === targetSeason;
        const episodeMatch = targetEpisode === undefined || magnet.episode === targetEpisode;
        return seasonMatch && episodeMatch;
      }
      
      // Si el magnet no tiene season/episode pero el content_id los incluye, extraerlos
      if (magnet.content_id && magnet.content_id.includes(':')) {
        const parts = magnet.content_id.split(':');
        if (parts.length >= 3) {
          const magnetSeason = parseInt(parts[parts.length - 2], 10);
          const magnetEpisode = parseInt(parts[parts.length - 1], 10);
          
          if (!isNaN(magnetSeason) && !isNaN(magnetEpisode)) {
            const seasonMatch = targetSeason === undefined || magnetSeason === targetSeason;
            const episodeMatch = targetEpisode === undefined || magnetEpisode === targetEpisode;
            return seasonMatch && episodeMatch;
          }
        }
      }
      
      // Si no se puede determinar season/episode del magnet, incluir solo si no se especificó filtro estricto
      // Para series/anime, si se especifica season/episode, solo incluir magnets que coincidan
      if (targetSeason !== undefined && targetEpisode !== undefined) {
        // Filtro estricto: solo incluir si tiene season/episode y coincide
        return false;
      }
      
      // Si solo se especifica season o episode, ser más permisivo
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
   * @param {string} type - Tipo de contenido ('movie' o 'series') - no usado en CSV local
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   * @throws {MagnetNotFoundError} Si no se encuentran magnets
   */
  async getMagnetsByImdbId(imdbId, type = 'movie') {
    return this.getMagnetsByContentId(imdbId, type);
  }

  /**
   * Obtiene el número total de entradas cargadas en el repositorio.
   * @returns {Promise<number>} Número total de magnets
   */
  async getTotalEntries() {
    if (!this.#isInitialized) await this.initialize();
    return this.#magnets.length;
  }
}