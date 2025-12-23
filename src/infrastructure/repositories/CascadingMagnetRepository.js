/**
 * @fileoverview CascadingMagnetRepository - Repositorio con búsqueda en cascada.
 * Implementa búsqueda secuencial: magnets.csv → torrentio.csv → API Torrentio.
 */

import { MagnetRepository, MagnetNotFoundError, RepositoryError } from '../../domain/repositories/MagnetRepository.js';
import { CSVMagnetRepository } from './CSVMagnetRepository.js';
import { TorrentioApiService } from '../services/TorrentioApiService.js';
import { unifiedIdService } from '../services/UnifiedIdService.js';
import { metadataService } from '../services/MetadataService.js';
import { cacheService } from '../services/CacheService.js';
import { ConfigurationCommandFactory } from '../patterns/ConfigurationCommand.js';
import { CsvFileInitializer } from '../utils/CsvFileInitializer.js';
import { dirname, join, basename } from 'path';

/**
 * Repositorio que implementa búsqueda en cascada con fallback automático.
 * Prioriza fuentes locales antes de consultar APIs externas.
 */
export class CascadingMagnetRepository extends MagnetRepository {
  #primaryRepository;
  #secondaryRepository;
  #animeRepository;
  #englishRepository;
  #torrentioApiService;
  #logger;
  #isInitialized = false;
  #secondaryCsvPath;
  #animeCsvPath;
  #englishCsvPath;
  #idService;
  #configInvoker;
  #cacheService;
  #exhaustedSourcesCache = new Map(); // Cache de fuentes agotadas por contentId
  #clearExhaustedSource(contentId, source) { this.#exhaustedSourcesCache.delete(`${contentId}:${source}`); }



  /**
   * @param {string} primaryCsvPath - Ruta del archivo magnets.csv principal
   * @param {string} secondaryCsvPath - Ruta del archivo torrentio.csv secundario
   * @param {string} animeCsvPath - Ruta del archivo anime.csv para contenido de anime
   * @param {string} torrentioApiUrl - URL base de la API de Torrentio
   * @param {Object} logger - Logger para trazabilidad
   * @param {number} timeout - Timeout para operaciones remotas
   * @param {string} englishCsvPath - Ruta del archivo english.csv para contenido en inglés
   */
  constructor(primaryCsvPath, secondaryCsvPath, animeCsvPath, torrentioApiUrl, logger = console, timeout = 30000, idService = unifiedIdService, torConfig = null, englishCsvPath = null) {
    super();
    this.#logger = logger;
    this.#secondaryCsvPath = secondaryCsvPath;
    this.#animeCsvPath = animeCsvPath;
    this.#englishCsvPath = englishCsvPath || join(dirname(secondaryCsvPath), 'english.csv');
    this.#idService = idService;

    // Repositorio principal (magnets.csv)
    this.#primaryRepository = new CSVMagnetRepository(primaryCsvPath, logger);

    // Repositorio secundario (torrentio.csv)
    this.#secondaryRepository = new CSVMagnetRepository(secondaryCsvPath, logger);

    // Repositorio de anime (anime.csv)
    this.#animeRepository = new CSVMagnetRepository(animeCsvPath, logger);

    // Repositorio de inglés (english.csv)
    this.#englishRepository = new CSVMagnetRepository(this.#englishCsvPath, logger);

    // Servicio de API externa
    this.#torrentioApiService = new TorrentioApiService(
      torrentioApiUrl,
      secondaryCsvPath,
      logger,
      timeout,
      torConfig,
      this.#englishCsvPath
    );

    // Inicializar invoker de comandos de configuración
    this.#configInvoker = ConfigurationCommandFactory.createInvoker(this.#logger);

    // Inicializar servicio de caché
    this.#cacheService = cacheService;
  }

  /**
   * Inicializa los repositorios locales.
   */
  async initialize() {
    if (this.#isInitialized) return;

    try {
      this.#logger.info('Inicializando repositorios en cascada...', { component: 'CascadingMagnetRepository' });

      // Inicializar archivos CSV automáticamente
      const dataDirectory = dirname(this.#secondaryCsvPath);
      CsvFileInitializer.initializeAllCsvFiles(dataDirectory);

      // Inicializar repositorio principal
      await this.#initializeRepository(this.#primaryRepository, 'magnets.csv');

      // Inicializar repositorio secundario
      await this.#initializeRepository(this.#secondaryRepository, basename(this.#secondaryCsvPath));

      // Inicializar repositorio anime
      await this.#initializeRepository(this.#animeRepository, 'anime.csv');

      // Inicializar repositorio inglés
      await this.#initializeRepository(this.#englishRepository, 'english.csv');

      this.#isInitialized = true;
      this.#logger.info('Repositorios en cascada inicializados correctamente', { component: 'CascadingMagnetRepository' });

    } catch (error) {
      this.#logger.error('Error al inicializar repositorios en cascada', { component: 'CascadingMagnetRepository', error: error.message });
      throw error;
    }
  }

  /**
   * Inicializa un repositorio individual con manejo de errores.
   * @private
   * @param {CSVMagnetRepository} repository - Repositorio a inicializar
   * @param {string} name - Nombre del repositorio para logging
   */
  async #initializeRepository(repository, name) {
    try {
      await repository.initialize();
      this.#logger.info(`Repositorio ${name} inicializado correctamente`);
    } catch (error) {
      this.#logger.warn(`Advertencia: No se pudo inicializar ${name}:`, error.message, { component: 'CascadingMagnetRepository' });
      // No lanzamos error para permitir que otros repositorios funcionen
    }
  }

  /**
   * Busca magnets por IMDb ID con estrategia de cascada.
   * @param {string} imdbId - ID de IMDb
   * @param {string} type - Tipo de contenido ('movie' o 'series')
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async getMagnetsByImdbId(imdbId, type = 'movie') {
    if (!this.#isInitialized) {
      await this.initialize();
    }

    this.#logger.info(`Iniciando búsqueda en cascada para: ${imdbId}`);

    // Buscar en todas las fuentes locales simultáneamente
    const [primaryResults, secondaryResults, animeResults] = await Promise.all([
      this.#searchInRepository(this.#primaryRepository, imdbId, 'magnets.csv'),
      this.#searchInRepository(this.#secondaryRepository, imdbId, 'torrentio.csv'),
      this.#searchInRepository(this.#animeRepository, imdbId, 'anime.csv')
    ]);

    // Lógica de priorización según los requisitos del usuario:
    // 1. Si hay resultados en torrentio.csv, usar 1 resultado principal
    // 2. Agregar coincidencias adicionales de magnets.csv o anime.csv
    let finalResults = [];

    if (secondaryResults.length > 0) {
      // Tomar solo el primer resultado de torrentio.csv como principal
      finalResults.push(secondaryResults[0]);
      this.#logger.info(`Resultado principal encontrado en torrentio.csv para ${imdbId}`);

      // Agregar coincidencias adicionales de magnets.csv
      if (primaryResults.length > 0) {
        finalResults.push(...primaryResults);
        this.#logger.info(`Agregados ${primaryResults.length} resultados adicionales de magnets.csv`);
      }

      // Agregar coincidencias adicionales de anime.csv
      if (animeResults.length > 0) {
        finalResults.push(...animeResults);
        this.#logger.info(`Agregados ${animeResults.length} resultados adicionales de anime.csv`);
      }

      return finalResults;
    }

    // Si no hay resultados en torrentio.csv, usar lógica de cascada tradicional
    if (primaryResults.length > 0) {
      this.#logger.info(`Encontrados ${primaryResults.length} magnets en magnets.csv para ${imdbId}`);
      return primaryResults;
    }

    if (animeResults.length > 0) {
      this.#logger.info(`Encontrados ${animeResults.length} magnets en anime.csv para ${imdbId}`);
      return animeResults;
    }

    // Paso final: Buscar en API de Torrentio
    this.#logger.info(`No se encontraron magnets locales, consultando API Torrentio para ${imdbId} (${type})`, { component: 'CascadingMagnetRepository' });
    const apiResults = await this.#torrentioApiService.searchMagnetsById(imdbId, type);

    if (apiResults.length > 0) {
      this.#logger.info(`Encontrados ${apiResults.length} magnets en API Torrentio para ${imdbId}`);

      // Reinicializar repositorio secundario para incluir nuevos datos
      await this.#reinitializeSecondaryRepository();

      return apiResults;
    }

    // No se encontraron magnets en ninguna fuente
    this.#logger.warn(`No se encontraron magnets para ${imdbId} en ninguna fuente`);
    throw new MagnetNotFoundError(`No se encontraron magnets para IMDB ID: ${imdbId}`);
  }

  /**
   * Busca magnets por cualquier tipo de ID de contenido (IMDb, Kitsu, MAL, etc.).
   * Utiliza el servicio unificado de IDs para detectar y convertir automáticamente.
   * @param {string} contentId - ID de contenido (IMDb, Kitsu, MAL, AniList, etc.)
   * @param {string} type - Tipo de contenido ('movie', 'series', 'anime')
   * @param {Object} options - Opciones adicionales para la búsqueda
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async getMagnetsByContentId(contentId, type = 'movie', options = {}) {
    // Validación de entrada con early returns
    if (!contentId || typeof contentId !== 'string') {
      throw new RepositoryError('ID de contenido requerido y debe ser string', {
        provided: typeof contentId,
        value: contentId
      });
    }

    if (contentId.trim().length === 0) {
      throw new RepositoryError('ID de contenido no puede estar vacío');
    }

    if (!type || typeof type !== 'string') {
      throw new RepositoryError('Tipo de contenido requerido y debe ser string', {
        provided: typeof type,
        value: type
      });
    }

    if (!['movie', 'series', 'anime', 'tv'].includes(type)) {
      throw new RepositoryError('Tipo de contenido debe ser movie, series, anime o tv', {
        type,
        validTypes: ['movie', 'series', 'anime', 'tv']
      });
    }

    if (!options || typeof options !== 'object') {
      throw new RepositoryError('Opciones deben ser un objeto', {
        provided: typeof options,
        value: options
      });
    }

    if (!this.#isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    
    // Extraer season/episode del contentId o de options para logging y caché
    let targetSeason = options.season;
    let targetEpisode = options.episode;
    let baseContentId = contentId;
    
    if (contentId.includes(':')) {
      const parts = contentId.split(':');
      if (parts.length >= 3) {
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
    
    // Sincronizar options con season/episode extraídos
    const searchOptions = {
      ...options,
      season: targetSeason,
      episode: targetEpisode
    };
    
    this.#logger.info(`Búsqueda en cascada iniciada para content ID: ${contentId} (${type}, season=${targetSeason}, episode=${targetEpisode})`, { component: 'CascadingMagnetRepository' });

    // Verificar cache primero - usar baseContentId + season/episode para consistencia con StreamHandler
    const cacheKey = cacheService.generateMagnetCacheKey(baseContentId, type, searchOptions);
    const cachedResults = cacheService.get(cacheKey);

    // Solo usar caché si tiene resultados. Si el caché está vacío, continuar con búsqueda en APIs
    // Esto evita que un caché vacío previo bloquee búsquedas en APIs cuando hay nuevos datos disponibles
    if (cachedResults && Array.isArray(cachedResults) && cachedResults.length > 0) {
      const duration = Date.now() - startTime;
      this.#logger.info(`Resultados obtenidos desde cache para ${contentId} en ${duration}ms (${cachedResults.length} magnets)`);
      return cachedResults;
    }
    
    // Si el caché está vacío o no existe, limpiar caché y continuar con búsqueda completa
    if (cachedResults && cachedResults.length === 0) {
      this.#logger.debug(`Caché vacío encontrado para ${contentId}, continuando con búsqueda completa en APIs`);
      cacheService.delete(cacheKey);
    }

    try {
      // Obtener metadatos del contenido para enriquecer la búsqueda
      const metadata = await metadataService.getMetadata(contentId, type);
      this.#logger.info(`Metadatos obtenidos para ${contentId}: ${metadata.title || 'Sin título'}`);

      // Detectar tipo de ID y aplicar estrategia específica
      const idType = this.#detectIdType(contentId);
      this.#logger.debug(`Tipo de ID detectado: ${idType} para ${contentId}`);

      const searchPromises = [];

      // Verificar si las fuentes locales ya fueron agotadas para evitar búsquedas redundantes
      if (!this.#isSourceExhausted(contentId, 'magnets.csv')) {
        searchPromises.push(this.#searchInRepositoryByContentId(this.#primaryRepository, contentId, 'magnets.csv', type, searchOptions));
      } else {
        searchPromises.push(Promise.resolve([]));
        this.#logger.debug(`Saltando búsqueda en magnets.csv - fuente agotada para ${contentId}`);
      }

      if (!this.#isSourceExhausted(contentId, 'torrentio.csv')) {
        searchPromises.push(this.#searchInRepositoryByContentId(this.#secondaryRepository, contentId, 'torrentio.csv', type, searchOptions));
      } else {
        searchPromises.push(Promise.resolve([]));
        this.#logger.debug(`Saltando búsqueda en torrentio.csv - fuente agotada para ${contentId}`);
      }

      // Para anime, verificar también si ya fue agotado
      if (type === 'anime' || idType === 'kitsu' || idType === 'mal' || idType === 'anilist') {
        if (!this.#isSourceExhausted(contentId, 'anime.csv')) {
          searchPromises.push(this.#searchInRepositoryByContentId(this.#animeRepository, contentId, 'anime.csv', type, searchOptions));
        } else {
          searchPromises.push(Promise.resolve([]));
          this.#logger.debug(`Saltando búsqueda en anime.csv - fuente agotada para ${contentId}`);
        }
      } else {
        searchPromises.push(Promise.resolve([]));
      }

      // Repositorio en inglés como fuente local adicional
      if (!this.#isSourceExhausted(contentId, 'english.csv')) {
        searchPromises.push(this.#searchInRepositoryByContentId(this.#englishRepository, contentId, 'english.csv', type, searchOptions));
      } else {
        searchPromises.push(Promise.resolve([]));
        this.#logger.debug(`Saltando búsqueda en english.csv - fuente agotada para ${contentId}`);
      }

      const searchResults = await Promise.allSettled(searchPromises);

      // Extraer resultados exitosos y loggear errores sin interrumpir el flujo
      const primaryResults = searchResults[0].status === 'fulfilled' ? searchResults[0].value : [];
      const secondaryResults = searchResults[1].status === 'fulfilled' ? searchResults[1].value : [];
      const animeResults = searchResults[2].status === 'fulfilled' ? searchResults[2].value : [];
      const englishResults = searchResults[3] && searchResults[3].status === 'fulfilled' ? searchResults[3].value : [];

      // Marcar fuentes como agotadas si no encontraron resultados
      if (primaryResults.length === 0) {
        this.#markSourceAsExhausted(contentId, 'magnets.csv');
      }
      if (secondaryResults.length === 0) {
        this.#markSourceAsExhausted(contentId, 'torrentio.csv');
      }
      if (animeResults.length === 0 && (type === 'anime' || idType === 'kitsu' || idType === 'mal' || idType === 'anilist')) {
        this.#markSourceAsExhausted(contentId, 'anime.csv');
      }
      if (englishResults.length === 0) {
        this.#markSourceAsExhausted(contentId, 'english.csv');
      }

      // Loggear errores de búsquedas fallidas sin interrumpir el proceso
      searchResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          const sources = ['magnets.csv', 'torrentio.csv', 'anime.csv', 'english.csv'];
          this.#logger.warn(`Error en búsqueda de ${sources[index]} para ${contentId}:`, result.reason?.message, { component: 'CascadingMagnetRepository' });
          this.#markSourceAsExhausted(contentId, sources[index]);
        }
      });

      const enrichedPrimary = this.#enrichMagnetsWithMetadata(primaryResults, metadata);
      const enrichedSecondary = this.#enrichMagnetsWithMetadata(secondaryResults, metadata);
      const enrichedAnime = this.#enrichMagnetsWithMetadata(animeResults, metadata);
      const enrichedEnglish = this.#enrichMagnetsWithMetadata(englishResults, metadata);

      // Lógica de priorización mejorada según tipo de contenido
      let finalResults = this.#prioritizeResults({
        primary: enrichedPrimary,
        secondary: enrichedSecondary,
        anime: enrichedAnime,
        english: enrichedEnglish
      }, type, contentId);

      if (finalResults.length > 0) {
        // Cachear resultados exitosos
        const cacheTTL = this.#getCacheTTL(type, finalResults.length);
        cacheService.set(cacheKey, finalResults, cacheTTL, {
          contentType: type,
          metadata: {
            resultCount: finalResults.length,
            source: 'repository',
            duration: Date.now() - startTime
          }
        });

        const duration = Date.now() - startTime;
        this.#logger.info(`Encontrados ${finalResults.length} magnets en fuentes locales para ${contentId} en ${duration}ms`);
        return finalResults;
      }

      // Paso 1: Buscar en API de Torrentio en español (siempre intentar, incluso si fue marcada como agotada)
      // Para series, cada episodio es único, así que no debemos bloquear basándonos en otros episodios
      const apiSpanishKey = `${baseContentId}:api-spanish`; // Usar baseContentId para no bloquear por episodio
      const wasExhausted = this.#isSourceExhausted(baseContentId, 'api-spanish');
      
      if (!wasExhausted) {
        this.#logger.info(`No se encontraron magnets locales, consultando API Torrentio en español para ${contentId} (${type}, season=${searchOptions.season}, episode=${searchOptions.episode})`, { component: 'CascadingMagnetRepository' });
        try {
          const spanishApiResults = await this.#torrentioApiService.searchMagnetsWithLanguageFallback(
            baseContentId, 
            type, 
            searchOptions.season, 
            searchOptions.episode
          );

          if (spanishApiResults.length > 0) {
            this.#logger.info(`Encontrados ${spanishApiResults.length} magnets en API Torrentio español para ${contentId}`);

            // Enriquecer resultados de API con metadatos
            const enrichedSpanishResults = this.#enrichMagnetsWithMetadata(spanishApiResults, metadata);

            // Cachear resultados de API con TTL más corto
            const apiCacheTTL = this.#getCacheTTL(type, enrichedSpanishResults.length, true);
            cacheService.set(cacheKey, enrichedSpanishResults, apiCacheTTL, {
              contentType: type,
              metadata: {
                resultCount: enrichedSpanishResults.length,
                source: 'api',
                language: 'spanish',
                season: searchOptions.season,
                episode: searchOptions.episode,
                duration: Date.now() - startTime
              }
            });

            // Reinicializar repositorio secundario para incluir nuevos datos
            await this.#reinitializeSecondaryRepository();
            this.#clearExhaustedSource(baseContentId, 'torrentio.csv');
            this.#clearExhaustedSource(baseContentId, 'api-spanish'); // Limpiar marca de agotado

            const duration = Date.now() - startTime;
            this.#logger.info(`Búsqueda completada con API español en ${duration}ms`);
            if (process.env.ALWAYS_SEARCH_ENGLISH === 'true') {
              try {
                await this.#torrentioApiService.searchMagnetsInEnglish(
                  baseContentId, 
                  type, 
                  searchOptions.season, 
                  searchOptions.episode
                );
                await this.#reinitializeRepository(this.#englishRepository, 'english.csv');
              } catch (e) { }
            }
            return enrichedSpanishResults;
          } else {
            // Solo marcar como agotada si realmente no hay resultados después de intentar
            this.#logger.warn(`API Torrentio español no devolvió resultados para ${contentId} (S${searchOptions.season}E${searchOptions.episode})`);
            // NO marcar como agotada inmediatamente - puede haber otros episodios disponibles
          }
        } catch (apiError) {
          this.#logger.error(`Error consultando API Torrentio español para ${contentId}:`, apiError);
          // No marcar como agotada por errores temporales
        }
      } else {
        this.#logger.debug(`Saltando API Torrentio español - fuente agotada para ${baseContentId} (pero puede haber nuevos episodios)`);
        // Para series, intentar de todos modos si es un episodio diferente
        if (type === 'series' && searchOptions.season !== undefined && searchOptions.episode !== undefined) {
          this.#logger.info(`Reintentando API español para episodio específico ${contentId} aunque la serie esté marcada como agotada`);
          try {
            const spanishApiResults = await this.#torrentioApiService.searchMagnetsWithLanguageFallback(
              baseContentId, 
              type, 
              searchOptions.season, 
              searchOptions.episode
            );
            if (spanishApiResults.length > 0) {
              const enrichedSpanishResults = this.#enrichMagnetsWithMetadata(spanishApiResults, metadata);
              const apiCacheTTL = this.#getCacheTTL(type, enrichedSpanishResults.length, true);
              cacheService.set(cacheKey, enrichedSpanishResults, apiCacheTTL, {
                contentType: type,
                metadata: {
                  resultCount: enrichedSpanishResults.length,
                  source: 'api',
                  language: 'spanish',
                  season: searchOptions.season,
                  episode: searchOptions.episode,
                  duration: Date.now() - startTime
                }
              });
              this.#clearExhaustedSource(baseContentId, 'api-spanish');
              return enrichedSpanishResults;
            }
          } catch (retryError) {
            this.#logger.debug(`Reintento de API español falló para ${contentId}:`, retryError.message);
          }
        }
      }

      // Paso 2: Buscar en archivo english.csv (solo si no fue agotada)
      if (!this.#isSourceExhausted(contentId, 'english.csv')) {
        this.#logger.info(`No se encontraron magnets en API español, buscando en english.csv para ${contentId}`, { component: 'CascadingMagnetRepository' });
        const englishResults = await this.#searchInRepositoryByContentId(this.#englishRepository, contentId, 'english.csv', type, searchOptions);

        if (englishResults.length > 0) {
          const enrichedEnglishResults = this.#enrichMagnetsWithMetadata(englishResults, metadata);
          const finalEnglishResults = this.#prioritizeResults({
            primary: [],
            secondary: [],
            anime: [],
            english: enrichedEnglishResults
          }, type, contentId);

          if (finalEnglishResults.length > 0) {
            // Cachear resultados de english.csv
            const cacheTTL = this.#getCacheTTL(type, finalEnglishResults.length);
            cacheService.set(cacheKey, finalEnglishResults, cacheTTL, {
              contentType: type,
              metadata: {
                resultCount: finalEnglishResults.length,
                source: 'repository',
                language: 'english',
                duration: Date.now() - startTime
              }
            });

            const duration = Date.now() - startTime;
            this.#logger.info(`Encontrados ${finalEnglishResults.length} magnets en english.csv para ${contentId} en ${duration}ms`);
            return finalEnglishResults;
          }
        } else {
          // Marcar english.csv como agotada
          this.#markSourceAsExhausted(contentId, 'english.csv');
        }
      } else {
        this.#logger.debug(`Saltando english.csv - fuente agotada para ${contentId}`);
      }

      // Paso 3: Buscar en API de Torrentio en inglés (siempre intentar para series)
      const apiEnglishExhausted = this.#isSourceExhausted(baseContentId, 'api-english');
      if (!apiEnglishExhausted) {
        this.#logger.info(`No se encontraron magnets en english.csv, consultando API Torrentio en inglés para ${contentId} (season=${searchOptions.season}, episode=${searchOptions.episode})`, { component: 'CascadingMagnetRepository' });
        try {
          const englishApiResults = await this.#torrentioApiService.searchMagnetsInEnglish(
            baseContentId, 
            type, 
            searchOptions.season, 
            searchOptions.episode
          );

          if (englishApiResults.length > 0) {
            this.#logger.info(`Encontrados ${englishApiResults.length} magnets en API Torrentio inglés para ${contentId}`);

            // Enriquecer resultados de API con metadatos
            const enrichedEnglishApiResults = this.#enrichMagnetsWithMetadata(englishApiResults, metadata);

            // Cachear resultados de API con TTL más corto
            const apiCacheTTL = this.#getCacheTTL(type, enrichedEnglishApiResults.length, true);
            cacheService.set(cacheKey, enrichedEnglishApiResults, apiCacheTTL, {
              contentType: type,
              metadata: {
                resultCount: enrichedEnglishApiResults.length,
                source: 'api',
                language: 'english',
                season: searchOptions.season,
                episode: searchOptions.episode,
                duration: Date.now() - startTime
              }
            });

            // Reinicializar repositorio de inglés para incluir nuevos datos
            await this.#reinitializeRepository(this.#englishRepository, 'english.csv');
            this.#clearExhaustedSource(baseContentId, 'api-english'); // Limpiar marca de agotado

            const duration = Date.now() - startTime;
            this.#logger.info(`Búsqueda completada con API inglés en ${duration}ms`);
            return enrichedEnglishApiResults;
          } else {
            this.#logger.warn(`API Torrentio inglés no devolvió resultados para ${contentId} (S${searchOptions.season}E${searchOptions.episode})`);
            // NO marcar como agotada - puede haber otros episodios disponibles
          }
        } catch (apiError) {
          this.#logger.error(`Error consultando API Torrentio inglés para ${contentId}:`, apiError);
          // No marcar como agotada por errores temporales
        }
      } else {
        this.#logger.debug(`Saltando API Torrentio inglés - fuente agotada para ${baseContentId}`);
        // Para series, intentar de todos modos si es un episodio diferente
        if (type === 'series' && searchOptions.season !== undefined && searchOptions.episode !== undefined) {
          this.#logger.info(`Reintentando API inglés para episodio específico ${contentId}`);
          try {
            const englishApiResults = await this.#torrentioApiService.searchMagnetsInEnglish(
              baseContentId, 
              type, 
              searchOptions.season, 
              searchOptions.episode
            );
            if (englishApiResults.length > 0) {
              const enrichedEnglishApiResults = this.#enrichMagnetsWithMetadata(englishApiResults, metadata);
              const apiCacheTTL = this.#getCacheTTL(type, enrichedEnglishApiResults.length, true);
              cacheService.set(cacheKey, enrichedEnglishApiResults, apiCacheTTL, {
                contentType: type,
                metadata: {
                  resultCount: enrichedEnglishApiResults.length,
                  source: 'api',
                  language: 'english',
                  season: searchOptions.season,
                  episode: searchOptions.episode,
                  duration: Date.now() - startTime
                }
              });
              this.#clearExhaustedSource(baseContentId, 'api-english');
              return enrichedEnglishApiResults;
            }
          } catch (retryError) {
            this.#logger.debug(`Reintento de API inglés falló para ${contentId}:`, retryError.message);
          }
        }
      }

      // No se encontraron magnets en ninguna fuente
      const duration = Date.now() - startTime;
      this.#logger.warn(`No se encontraron magnets para ${contentId} en ninguna fuente (${duration}ms)`, { component: 'CascadingMagnetRepository' });

      // Cachear resultado vacío con TTL corto para evitar búsquedas repetidas
      const emptyTTL = this.#getCacheTTL(type, 0);
      cacheService.set(cacheKey, [], emptyTTL, {
        contentType: type,
        metadata: {
          resultCount: 0,
          source: 'repository',
          duration: Date.now() - startTime
        }
      });

      throw new MagnetNotFoundError(contentId);

    } catch (error) {
      if (error instanceof MagnetNotFoundError) {
        throw error;
      }
      this.#logger.error(`Error en búsqueda con metadatos para ${contentId}:`, error, { component: 'CascadingMagnetRepository' });
      // Fallback a búsqueda sin metadatos
      return this.#fallbackSearch(contentId, type);
    }
  }

  /**
   * Busca en un repositorio específico con manejo de errores usando content ID.
   * @private
   * @param {CSVMagnetRepository} repository - Repositorio donde buscar
   * @param {string} contentId - ID de contenido
   * @param {string} sourceName - Nombre de la fuente para logging
   * @param {string} type - Tipo de contenido
   * @param {Object} options - Opciones de búsqueda (season, episode)
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async #searchInRepositoryByContentId(repository, contentId, sourceName, type = 'movie', options = {}) {
    try {
      return await repository.getMagnetsByContentId(contentId, type, options);
    } catch (error) {
      if (error instanceof MagnetNotFoundError) {
        this.#logger.debug(`No se encontraron magnets en ${sourceName} para content ID: ${contentId} (season=${options.season}, episode=${options.episode})`);
        return [];
      }
      this.#logger.error(`Error buscando en ${sourceName} para content ID ${contentId}:`, error, { component: 'CascadingMagnetRepository' });
      return [];
    }
  }

  /**
   * Busca en un repositorio específico con manejo de errores.
   * @private
   * @param {CSVMagnetRepository} repository - Repositorio donde buscar
   * @param {string} imdbId - ID de IMDb
   * @param {string} sourceName - Nombre de la fuente para logging
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async #searchInRepository(repository, imdbId, sourceName) {
    try {
      return await repository.getMagnetsByImdbId(imdbId);
    } catch (error) {
      if (error instanceof MagnetNotFoundError) {
        this.#logger.info(`No se encontraron magnets en ${sourceName} para ${imdbId}`);
        return [];
      }

      this.#logger.error(`Error al buscar en ${sourceName} para ${imdbId}:`, error, { component: 'CascadingMagnetRepository' });
      return [];
    }
  }

  /**
   * Reinicializa el repositorio secundario para incluir nuevos datos.
   * @private
   */
  async #reinitializeSecondaryRepository() {
    try {
      // Usar reload() para recargar atómicamente los datos actualizados
      await this.#secondaryRepository.reload();
      this.#logger.debug('Repositorio secundario reinicializado');

    } catch (error) {
      this.#logger.error('Error al reinicializar repositorio secundario:', error, { component: 'CascadingMagnetRepository' });
    }
  }

  /**
   * Verifica si una fuente ya fue agotada para un contentId específico.
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} source - Nombre de la fuente
   * @returns {boolean} true si la fuente fue agotada recientemente
   */
  #isSourceExhausted(contentId, source) {
    const key = `${contentId}:${source}`;
    const exhaustedTime = this.#exhaustedSourcesCache.get(key);

    if (!exhaustedTime) return false;

    // TTL más corto para APIs (2 minutos) y más largo para CSVs (5 minutos)
    // Esto permite reintentar APIs más frecuentemente ya que pueden tener nuevos datos
    const TTL = source.startsWith('api-') ? 2 * 60 * 1000 : 5 * 60 * 1000;
    const isExpired = Date.now() - exhaustedTime > TTL;

    if (isExpired) {
      this.#exhaustedSourcesCache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Marca una fuente como agotada para un contentId específico.
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} source - Nombre de la fuente
   */
  #markSourceAsExhausted(contentId, source) {
    const key = `${contentId}:${source}`;
    this.#exhaustedSourcesCache.set(key, Date.now());
    this.#logger.debug(`Fuente ${source} marcada como agotada para ${contentId}`);
  }

  /**
   * Limpia el cache de fuentes agotadas (útil para testing).
   */
  clearExhaustedSourcesCache() {
    this.#exhaustedSourcesCache.clear();
    this.#logger.info('Cache de fuentes agotadas limpiado');
  }

  /**
   * Reinicializa un repositorio específico para incluir nuevos datos.
   * @private
   * @param {CSVMagnetRepository} repository - Repositorio a reinicializar
   * @param {string} name - Nombre del repositorio para logging
   */
  async #reinitializeRepository(repository, name) {
    try {
      // Usar reload() para recargar atómicamente los datos actualizados
      await repository.reload();
      this.#logger.debug(`Repositorio ${name} reinicializado`);

    } catch (error) {
      this.#logger.error(`Error al reinicializar repositorio ${name}:`, error, { component: 'CascadingMagnetRepository' });
    }
  }

  /**
   * Configura el idioma prioritario temporalmente usando patrón Command/Memento.
   * @param {string} language - Idioma a configurar (ej: 'spanish', 'english')
   * @param {string} type - Tipo de contenido (movie, series, anime)
   * @returns {Function|null} Función para revertir el cambio, o null si falla
   */
  setPriorityLanguageTemporary(language, type = 'movie') {
    try {
      // Crear comando para cambio temporal de idioma en el servicio API
      const languageConfig = {
        providers: this.#getProvidersForLanguage(language, type),
        priorityLanguage: language
      };

      const command = ConfigurationCommandFactory.createLanguageCommand(
        this.#torrentioApiService,
        type,
        languageConfig,
        this.#logger
      );

      // Ejecutar comando
      if (this.#configInvoker.executeCommand(command)) {
        this.#logger.info('Idioma prioritario configurado temporalmente', { component: 'CascadingMagnetRepository', language, type });

        // Retornar función para revertir
        return () => {
          this.#configInvoker.undoLastCommand();
          this.#logger.info(`Configuración de idioma revertida para ${type}`);
        };
      } else {
        this.#logger.error('No se pudo aplicar la configuración temporal de idioma');
        return null;
      }
    } catch (error) {
      this.#logger.error('Error al configurar idioma prioritario temporal:', error, { component: 'CascadingMagnetRepository' });
      return null;
    }
  }

  /**
   * Configura el idioma prioritario de forma permanente (método legacy).
   * @param {string} language - Idioma a configurar (ej: 'spanish', 'english')
   * @deprecated Usar setPriorityLanguageTemporary para cambios temporales
   */
  setPriorityLanguage(language) {
    this.#torrentioApiService.setPriorityLanguage(language);
  }

  /**
   * Obtiene el idioma prioritario configurado.
   * @returns {string} Idioma prioritario actual
   */
  getPriorityLanguage() {
    return this.#torrentioApiService.getPriorityLanguage();
  }

  /**
   * Obtiene los proveedores apropiados para un idioma y tipo de contenido.
   * @private
   * @param {string} language - Idioma solicitado
   * @param {string} type - Tipo de contenido
   * @returns {string} Lista de proveedores separados por coma
   */
  #getProvidersForLanguage(language, type) {
    // Mapeo básico de idiomas a configuraciones de proveedores
    const languageProviderMap = {
      spanish: {
        movie: 'mejortorrent,wolfmax4k,cinecalidad',
        series: 'mejortorrent,wolfmax4k,cinecalidad',
        anime: 'mejortorrent,wolfmax4k,cinecalidad'
      },
      english: {
        movie: 'yts,eztv,rarbg,1337x,thepiratebay',
        series: 'eztv,rarbg,1337x,thepiratebay,horriblesubs,nyaasi',
        anime: 'horriblesubs,nyaasi,tokyotosho,anidex,subsplease,erai-raws'
      }
    };

    return languageProviderMap[language]?.[type] ||
      languageProviderMap.spanish[type] ||
      'mejortorrent,wolfmax4k,cinecalidad';
  }

  /**
   * Detecta el tipo de ID de contenido basado en su formato.
   * @private
   * @param {string} contentId - ID de contenido a analizar
   * @returns {string} Tipo de ID detectado
   */
  #detectIdType(contentId) {
    if (!contentId) return 'unknown';

    // IMDb IDs empiezan con 'tt'
    if (contentId.startsWith('tt')) {
      return 'imdb';
    }

    // Kitsu IDs empiezan con 'kitsu:'
    if (contentId.startsWith('kitsu:')) {
      return 'kitsu';
    }

    // MyAnimeList IDs empiezan con 'mal:'
    if (contentId.startsWith('mal:')) {
      return 'mal';
    }

    // AniList IDs empiezan con 'anilist:'
    if (contentId.startsWith('anilist:')) {
      return 'anilist';
    }

    // AniDB IDs empiezan con 'anidb:'
    if (contentId.startsWith('anidb:')) {
      return 'anidb';
    }

    // Si es solo números, podría ser Kitsu sin prefijo
    if (/^\d+$/.test(contentId)) {
      return 'numeric';
    }

    return 'unknown';
  }

  /**
   * Prioriza los resultados según el tipo de contenido y fuente.
   * @private
   * @param {Object} results - Resultados de las diferentes fuentes
   * @param {string} type - Tipo de contenido
   * @param {string} contentId - ID de contenido para logging
   * @returns {Array} Resultados priorizados
   */
  #prioritizeResults(results, type, contentId) {
    const { primary, secondary, anime, english } = results;
    let finalResults = [];

    // Para anime, priorizar repositorio de anime
    if (type === 'anime') {
      if (anime.length > 0) {
        finalResults.push(...anime);
        this.#logger.info(`Encontrados ${anime.length} magnets en repositorio de anime para ${contentId}`);
      }

      // Agregar resultados de torrentio como secundarios para anime
      if (secondary.length > 0) {
        finalResults.push(...secondary.slice(0, 3)); // Limitar a 3 resultados adicionales
        this.#logger.info(`Agregados ${Math.min(secondary.length, 3)} resultados adicionales de torrentio.csv`, { component: 'CascadingMagnetRepository' });
      }

      // Agregar algunos resultados del repositorio principal si es necesario
      if (primary.length > 0 && finalResults.length < 5) {
        const remainingSlots = 5 - finalResults.length;
        finalResults.push(...primary.slice(0, remainingSlots));
        this.#logger.info(`Agregados ${Math.min(primary.length, remainingSlots)} resultados adicionales de magnets.csv`, { component: 'CascadingMagnetRepository' });
      }

      return finalResults;
    }

    // Para películas y series, usar lógica tradicional mejorada
    if (secondary.length > 0) {
      // Tomar el primer resultado de torrentio.csv como principal
      finalResults.push(secondary[0]);
      this.#logger.info(`Resultado principal encontrado en torrentio.csv para ${contentId}`);

      // Agregar coincidencias adicionales de magnets.csv
      if (primary.length > 0) {
        finalResults.push(...primary.slice(0, 4)); // Limitar a 4 adicionales
        this.#logger.info(`Agregados ${Math.min(primary.length, 4)} resultados adicionales de magnets.csv`, { component: 'CascadingMagnetRepository' });
      }

      // Para series, también considerar anime.csv si hay resultados
      if (type === 'series' && anime.length > 0) {
        finalResults.push(...anime.slice(0, 2)); // Máximo 2 de anime
        this.#logger.info(`Agregados ${Math.min(anime.length, 2)} resultados adicionales de anime.csv`, { component: 'CascadingMagnetRepository' });
      }

      return finalResults;
    }

    // Si no hay resultados en torrentio.csv, usar repositorio principal
    if (primary.length > 0) {
      this.#logger.info(`Encontrados ${primary.length} magnets en repositorio primario para ${contentId}`);
      return primary;
    }

    // Como último recurso, usar repositorio de anime
    if (anime.length > 0) {
      this.#logger.info(`Encontrados ${anime.length} magnets en repositorio de anime para ${contentId}`);
      return anime;
    }

    // Finalmente, usar repositorio inglés si está disponible
    if (english && english.length > 0) {
      this.#logger.info(`Encontrados ${english.length} magnets en repositorio inglés para ${contentId}`);
      return english;
    }

    return [];
  }

  /**
   * Obtiene estadísticas de los repositorios.
   * @returns {Promise<Object>} Estadísticas de cada fuente
   */
  async getRepositoryStats() {
    const stats = {
      primary: { name: 'magnets.csv', count: 0, status: 'unknown' },
      secondary: { name: 'torrentio.csv', count: 0, status: 'unknown' },
      anime: { name: 'anime.csv', count: 0, status: 'unknown' },
      api: { name: 'torrentio-api', status: 'available' }
    };

    try {
      // Obtener estadísticas del repositorio principal
      if (this.#primaryRepository && typeof this.#primaryRepository.getTotalEntries === 'function') {
        stats.primary.count = await this.#primaryRepository.getTotalEntries();
        stats.primary.status = stats.primary.count > 0 ? 'loaded' : 'empty';
      } else {
        stats.primary.status = 'not accessible';
      }
    } catch (error) {
      stats.primary.status = 'error';
      this.#logger.error('Error obteniendo estadísticas del repositorio principal:', error.message, { component: 'CascadingMagnetRepository' });
    }

    try {
      // Obtener estadísticas del repositorio secundario
      if (this.#secondaryRepository && typeof this.#secondaryRepository.getTotalEntries === 'function') {
        stats.secondary.count = await this.#secondaryRepository.getTotalEntries();
        stats.secondary.status = stats.secondary.count > 0 ? 'loaded' : 'empty';
      } else {
        stats.secondary.status = 'not accessible';
      }
    } catch (error) {
      stats.secondary.status = 'error';
      this.#logger.error('Error obteniendo estadísticas del repositorio secundario:', error.message, { component: 'CascadingMagnetRepository' });
    }

    try {
      // Obtener estadísticas del repositorio de anime
      if (this.#animeRepository && typeof this.#animeRepository.getTotalEntries === 'function') {
        stats.anime.count = await this.#animeRepository.getTotalEntries();
        stats.anime.status = stats.anime.count > 0 ? 'loaded' : 'empty';
      } else {
        stats.anime.status = 'not accessible';
      }
    } catch (error) {
      stats.anime.status = 'error';
      this.#logger.error('Error obteniendo estadísticas del repositorio de anime:', error.message, { component: 'CascadingMagnetRepository' });
    }

    return stats;
  }

  /**
   * Enriquece los magnets con metadatos del contenido.
   * @private
   * @param {Array} magnets - Array de magnets a enriquecer
   * @param {Object} metadata - Metadatos del contenido
   * @returns {Array} Magnets enriquecidos
   */
  #enrichMagnetsWithMetadata(magnets, metadata) {
    if (!magnets || !Array.isArray(magnets) || !metadata) {
      return magnets || [];
    }

    return magnets.map(magnet => ({
      ...magnet,
      metadata: {
        title: metadata.title,
        year: metadata.year,
        genre: metadata.genre,
        imdbRating: metadata.imdbRating,
        type: metadata.type
      },
      // Mejorar scoring basado en metadatos
      qualityScore: this.#calculateQualityScore(magnet, metadata)
    }));
  }

  /**
   * Calcula un score de calidad basado en metadatos y características del magnet.
   * @private
   * @param {Object} magnet - Magnet a evaluar
   * @param {Object} metadata - Metadatos del contenido
   * @returns {number} Score de calidad (0-100)
   */
  #calculateQualityScore(magnet, metadata) {
    let score = 50; // Score base

    // Bonus por coincidencia de título
    if (metadata.title && magnet.title) {
      const titleSimilarity = this.#calculateTitleSimilarity(magnet.title, metadata.title);
      score += titleSimilarity * 20;
    }

    // Bonus por año
    if (metadata.year && magnet.title && magnet.title.includes(metadata.year)) {
      score += 10;
    }

    // Bonus por calidad de video
    if (magnet.title) {
      if (magnet.title.includes('2160p') || magnet.title.includes('4K')) score += 15;
      else if (magnet.title.includes('1080p')) score += 10;
      else if (magnet.title.includes('720p')) score += 5;
    }

    // Bonus por seeders
    if (magnet.seeders) {
      score += Math.min(magnet.seeders / 10, 15);
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Calcula la similitud entre dos títulos.
   * @private
   * @param {string} title1 - Primer título
   * @param {string} title2 - Segundo título
   * @returns {number} Similitud (0-1)
   */
  #calculateTitleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0;

    const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm1 = normalize(title1);
    const norm2 = normalize(title2);

    if (norm1 === norm2) return 1;
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;

    // Algoritmo simple de distancia de Levenshtein normalizada
    const maxLen = Math.max(norm1.length, norm2.length);
    if (maxLen === 0) return 1;

    const distance = this.#levenshteinDistance(norm1, norm2);
    return 1 - (distance / maxLen);
  }

  /**
   * Calcula la distancia de Levenshtein entre dos strings.
   * @private
   * @param {string} str1 - Primer string
   * @param {string} str2 - Segundo string
   * @returns {number} Distancia de Levenshtein
   */
  #levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Búsqueda de fallback sin metadatos.
   * @private
   * @param {string} contentId - ID del contenido
   * @param {string} type - Tipo de contenido
   * @returns {Promise<Array>} Array de magnets encontrados
   */
  async #fallbackSearch(contentId, type) {
    this.#logger.info(`Ejecutando búsqueda de fallback para ${contentId}`);

    try {
      // Detectar tipo de ID y aplicar estrategia específica
      const idType = this.#detectIdType(contentId);

      // Extraer season/episode del contentId para fallback
      let fallbackSeason = undefined;
      let fallbackEpisode = undefined;
      let fallbackBaseId = contentId;
      
      if (contentId.includes(':')) {
        const parts = contentId.split(':');
        if (parts.length >= 3) {
          fallbackBaseId = parts[0];
          const seasonPart = parts[parts.length - 2];
          const episodePart = parts[parts.length - 1];
          if (/^\d+$/.test(seasonPart)) fallbackSeason = parseInt(seasonPart, 10);
          if (/^\d+$/.test(episodePart)) fallbackEpisode = parseInt(episodePart, 10);
        }
      }
      
      const fallbackOptions = {
        season: fallbackSeason,
        episode: fallbackEpisode
      };
      
      // Buscar en todas las fuentes locales simultáneamente usando Promise.allSettled
      const searchPromises = [
        this.#searchInRepositoryByContentId(this.#primaryRepository, contentId, 'magnets.csv', type, fallbackOptions),
        this.#searchInRepositoryByContentId(this.#secondaryRepository, contentId, 'torrentio.csv', type, fallbackOptions)
      ];

      // Para anime, priorizar búsqueda en repositorio de anime
      if (type === 'anime' || idType === 'kitsu' || idType === 'mal' || idType === 'anilist') {
        searchPromises.push(this.#searchInRepositoryByContentId(this.#animeRepository, contentId, 'anime.csv', type, fallbackOptions));
      } else {
        searchPromises.push(Promise.resolve([]));
      }

      const searchResults = await Promise.allSettled(searchPromises);

      // Extraer resultados exitosos de fallback
      const primaryResults = searchResults[0].status === 'fulfilled' ? searchResults[0].value : [];
      const secondaryResults = searchResults[1].status === 'fulfilled' ? searchResults[1].value : [];
      const animeResults = searchResults[2].status === 'fulfilled' ? searchResults[2].value : [];

      // Loggear errores de fallback sin interrumpir
      searchResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          const sources = ['magnets.csv', 'torrentio.csv', 'anime.csv'];
          this.#logger.warn(`Error en fallback de ${sources[index]} para ${contentId}:`, result.reason?.message, { component: 'CascadingMagnetRepository' });
        }
      });

      // Lógica de priorización básica
      let finalResults = this.#prioritizeResults({
        primary: primaryResults,
        secondary: secondaryResults,
        anime: animeResults
      }, type, contentId);

      if (finalResults.length > 0) {
        this.#logger.info(`Encontrados ${finalResults.length} magnets en búsqueda de fallback para ${contentId}`);
        return finalResults;
      }

      // Paso final: Buscar en API de Torrentio con fallback de idioma
      // Extraer baseContentId para la API (sin season:episode si están en el contentId)
      let fallbackBaseContentId = contentId;
      if (contentId.includes(':')) {
        const parts = contentId.split(':');
        if (parts.length >= 3) {
          fallbackBaseContentId = parts[0];
        }
      }
      this.#logger.info(`Consultando API Torrentio con fallback de idioma para ${contentId} (${type}, season=${fallbackOptions.season}, episode=${fallbackOptions.episode})`, { component: 'CascadingMagnetRepository' });
      const apiResults = await this.#torrentioApiService.searchMagnetsWithLanguageFallback(
        fallbackBaseContentId, 
        type, 
        fallbackOptions.season, 
        fallbackOptions.episode
      );

      if (apiResults.length > 0) {
        this.#logger.info(`Encontrados ${apiResults.length} magnets en API Torrentio (fallback con idioma) para ${contentId}`, { component: 'CascadingMagnetRepository' });
        await this.#reinitializeSecondaryRepository();
        return apiResults;
      }

      throw new MagnetNotFoundError(contentId);

    } catch (error) {
      // Preservar stack trace completo del error de fallback
      const fallbackError = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        contentId,
        type,
        operation: 'fallback_search'
      };

      this.#logger.error('Error crítico en búsqueda de fallback:', fallbackError, { component: 'CascadingMagnetRepository' });
      throw new RepositoryError(`Fallback search failed for ${contentId}`, { cause: error, contentId, type });
    }
  }

  /**
   * Calcula el TTL del cache basado en el tipo de contenido y número de resultados.
   * @private
   * @param {string} type - Tipo de contenido
   * @param {number} resultCount - Número de resultados encontrados
   * @param {boolean} isApiResult - Si los resultados vienen de API
   * @returns {number} TTL en milisegundos
   */
  #getCacheTTL(type, resultCount, isApiResult = false) {
    // Usar el optimizador de caché para TTL adaptativo
    const adaptiveTTL = this.#cacheService.calculateAdaptiveTTL(type, resultCount, {
      source: isApiResult ? 'api' : 'repository',
      timestamp: Date.now()
    });

    this.#logger.info(`TTL adaptativo calculado para ${type} con ${resultCount} resultados (API: ${isApiResult}): ${adaptiveTTL}ms`, { component: 'CascadingMagnetRepository' });
    return adaptiveTTL;
  }


}

export default CascadingMagnetRepository;