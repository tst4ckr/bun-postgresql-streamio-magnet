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

/**
 * Repositorio que implementa búsqueda en cascada con fallback automático.
 * Prioriza fuentes locales antes de consultar APIs externas.
 */
export class CascadingMagnetRepository extends MagnetRepository {
  #primaryRepository;
  #secondaryRepository;
  #animeRepository;
  #torrentioApiService;
  #logger;
  #isInitialized = false;
  #secondaryCsvPath;
  #animeCsvPath;
  #idService;
  #configInvoker;

  /**
   * Método auxiliar para logging optimizado con contexto estructurado
   * @param {string} level - Nivel de log (info, warn, error, debug)
   * @param {string} message - Mensaje a loggear
   * @param {any} data - Datos adicionales para contexto estructurado
   */
  #log(level, message, data = null) {
    if (!this.#logger) {
      // Fallback a console si no hay logger disponible
      const timestamp = new Date().toISOString();
      const formattedMessage = `[${level.toUpperCase()}] ${timestamp} [CascadingMagnetRepository] - ${message}`;
      console[level] ? console[level](formattedMessage, data || '') : console.log(formattedMessage, data || '');
      return;
    }

    // Usar logging estructurado si el logger lo soporta
    if (typeof this.#logger.structured === 'function' && data !== null && data !== undefined) {
      this.#logger.structured(level, message, {
        component: 'CascadingMagnetRepository',
        ...data
      });
    } else if (typeof this.#logger[level] === 'function') {
      // Usar método de nivel específico
      this.#logger[level](message, data);
    } else {
      // Fallback final
      const timestamp = new Date().toISOString();
      const formattedMessage = `[${level.toUpperCase()}] ${timestamp} [CascadingMagnetRepository] - ${message}`;
      console[level] ? console[level](formattedMessage, data || '') : console.log(formattedMessage, data || '');
    }
  }

  /**
   * @param {string} primaryCsvPath - Ruta del archivo magnets.csv principal
   * @param {string} secondaryCsvPath - Ruta del archivo torrentio.csv secundario
   * @param {string} animeCsvPath - Ruta del archivo anime.csv para contenido de anime
   * @param {string} torrentioApiUrl - URL base de la API de Torrentio
   * @param {Object} logger - Logger para trazabilidad
   * @param {number} timeout - Timeout para operaciones remotas
   */
  constructor(primaryCsvPath, secondaryCsvPath, animeCsvPath, torrentioApiUrl, logger = console, timeout = 30000, idService = unifiedIdService, torConfig = null) {
    super();
    this.#logger = logger;
    this.#secondaryCsvPath = secondaryCsvPath;
    this.#animeCsvPath = animeCsvPath;
    this.#idService = idService;
    
    // Repositorio principal (magnets.csv)
    this.#primaryRepository = new CSVMagnetRepository(primaryCsvPath, logger);
    
    // Repositorio secundario (torrentio.csv)
    this.#secondaryRepository = new CSVMagnetRepository(secondaryCsvPath, logger);
    
    // Repositorio de anime (anime.csv)
    this.#animeRepository = new CSVMagnetRepository(animeCsvPath, logger);
    
    // Servicio de API externa
    this.#torrentioApiService = new TorrentioApiService(
      torrentioApiUrl,
      secondaryCsvPath,
      logger,
      timeout,
      torConfig
    );
    
    // Inicializar invoker de comandos de configuración
    this.#configInvoker = ConfigurationCommandFactory.createInvoker(this.#logger);
  }

  /**
   * Inicializa los repositorios locales.
   */
  async initialize() {
    if (this.#isInitialized) return;
    
    try {
      this.#log('info', 'Inicializando repositorios en cascada...');
      
      // Inicializar repositorio principal
      await this.#initializeRepository(this.#primaryRepository, 'magnets.csv');
      
      // Inicializar repositorio secundario
      await this.#initializeRepository(this.#secondaryRepository, 'torrentio.csv');
      
      // Inicializar repositorio anime
      await this.#initializeRepository(this.#animeRepository, 'anime.csv');
      
      this.#isInitialized = true;
      this.#log('info', 'Repositorios en cascada inicializados correctamente');
      
    } catch (error) {
      this.#log('error', 'Error al inicializar repositorios en cascada:', error);
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
      this.#log('info', `Repositorio ${name} inicializado correctamente`);
    } catch (error) {
      this.#log('warn', `Advertencia: No se pudo inicializar ${name}:`, error.message);
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
    
    this.#log('info', `Iniciando búsqueda en cascada para: ${imdbId}`);
    
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
      this.#log('info', `Resultado principal encontrado en torrentio.csv para ${imdbId}`);
      
      // Agregar coincidencias adicionales de magnets.csv
      if (primaryResults.length > 0) {
        finalResults.push(...primaryResults);
        this.#log('info', `Agregados ${primaryResults.length} resultados adicionales de magnets.csv`);
      }
      
      // Agregar coincidencias adicionales de anime.csv
      if (animeResults.length > 0) {
        finalResults.push(...animeResults);
        this.#log('info', `Agregados ${animeResults.length} resultados adicionales de anime.csv`);
      }
      
      return finalResults;
    }
    
    // Si no hay resultados en torrentio.csv, usar lógica de cascada tradicional
    if (primaryResults.length > 0) {
      this.#log('info', `Encontrados ${primaryResults.length} magnets en magnets.csv para ${imdbId}`);
      return primaryResults;
    }
    
    if (animeResults.length > 0) {
      this.#log('info', `Encontrados ${animeResults.length} magnets en anime.csv para ${imdbId}`);
      return animeResults;
    }
    
    // Paso final: Buscar en API de Torrentio
    this.#log('info', `No se encontraron magnets locales, consultando API Torrentio para ${imdbId} (${type})`);
    const apiResults = await this.#torrentioApiService.searchMagnetsById(imdbId, type);
    
    if (apiResults.length > 0) {
      this.#log('info', `Encontrados ${apiResults.length} magnets en API Torrentio para ${imdbId}`);
      
      // Reinicializar repositorio secundario para incluir nuevos datos
      await this.#reinitializeSecondaryRepository();
      
      return apiResults;
    }
    
    // No se encontraron magnets en ninguna fuente
    this.#log('warn', `No se encontraron magnets para ${imdbId} en ninguna fuente`);
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

    if (!['movie', 'series', 'anime'].includes(type)) {
      throw new RepositoryError('Tipo de contenido debe ser movie, series o anime', {
        provided: type,
        validTypes: ['movie', 'series', 'anime']
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
    this.#log('info', `Búsqueda en cascada iniciada para content ID: ${contentId} (${type})`);
    
    // Verificar cache primero
    const cacheKey = cacheService.generateMagnetCacheKey(contentId, type, options);
    const cachedResults = cacheService.get(cacheKey);
    
    if (cachedResults) {
      const duration = Date.now() - startTime;
      this.#log('info', `Resultados obtenidos desde cache para ${contentId} en ${duration}ms`);
      return cachedResults;
    }
    
    try {
      // Obtener metadatos del contenido para enriquecer la búsqueda
      const metadata = await metadataService.getMetadata(contentId, type);
      this.#log('info', `Metadatos obtenidos para ${contentId}: ${metadata.title || 'Sin título'}`);
      
      // Detectar tipo de ID y aplicar estrategia específica
      const idType = this.#detectIdType(contentId);
      this.#log('debug', `Tipo de ID detectado: ${idType} para ${contentId}`);
      
      // Buscar en todas las fuentes locales simultáneamente usando Promise.allSettled
      // para evitar que un error en una fuente cancele las demás búsquedas
      const searchPromises = [
        this.#searchInRepositoryByContentId(this.#primaryRepository, contentId, 'magnets.csv'),
        this.#searchInRepositoryByContentId(this.#secondaryRepository, contentId, 'torrentio.csv')
      ];
      
      // Para anime, priorizar búsqueda en repositorio de anime
      if (type === 'anime' || idType === 'kitsu' || idType === 'mal' || idType === 'anilist') {
        searchPromises.push(this.#searchInRepositoryByContentId(this.#animeRepository, contentId, 'anime.csv'));
      } else {
        searchPromises.push(Promise.resolve([]));
      }
      
      const searchResults = await Promise.allSettled(searchPromises);
      
      // Extraer resultados exitosos y loggear errores sin interrumpir el flujo
      const primaryResults = searchResults[0].status === 'fulfilled' ? searchResults[0].value : [];
      const secondaryResults = searchResults[1].status === 'fulfilled' ? searchResults[1].value : [];
      const animeResults = searchResults[2].status === 'fulfilled' ? searchResults[2].value : [];
      
      // Loggear errores de búsquedas fallidas sin interrumpir el proceso
      searchResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          const sources = ['magnets.csv', 'torrentio.csv', 'anime.csv'];
          this.#log('warn', `Error en búsqueda de ${sources[index]} para ${contentId}:`, result.reason?.message);
        }
      });
      
      // Enriquecer magnets con metadatos
      const enrichedPrimary = this.#enrichMagnetsWithMetadata(primaryResults, metadata);
      const enrichedSecondary = this.#enrichMagnetsWithMetadata(secondaryResults, metadata);
      const enrichedAnime = this.#enrichMagnetsWithMetadata(animeResults, metadata);
      
      // Lógica de priorización mejorada según tipo de contenido
      let finalResults = this.#prioritizeResults({
        primary: enrichedPrimary,
        secondary: enrichedSecondary, 
        anime: enrichedAnime
      }, type, contentId);
      
      if (finalResults.length > 0) {
        // Cachear resultados exitosos
        const cacheTTL = this.#getCacheTTL(type, finalResults.length);
        cacheService.set(cacheKey, finalResults, cacheTTL);
        
        const duration = Date.now() - startTime;
        this.#log('info', `Encontrados ${finalResults.length} magnets en fuentes locales para ${contentId} en ${duration}ms`);
        return finalResults;
      }
      
      // Paso final: Buscar en API de Torrentio
      this.#log('info', `No se encontraron magnets locales, consultando API Torrentio para ${contentId} (${type})`);
      const apiResults = await this.#torrentioApiService.searchMagnetsById(contentId, type);
      
      if (apiResults.length > 0) {
        this.#log('info', `Encontrados ${apiResults.length} magnets en API Torrentio para ${contentId}`);
        
        // Enriquecer resultados de API con metadatos
        const enrichedApiResults = this.#enrichMagnetsWithMetadata(apiResults, metadata);
        
        // Cachear resultados de API con TTL más corto
        const apiCacheTTL = this.#getCacheTTL(type, enrichedApiResults.length, true);
        cacheService.set(cacheKey, enrichedApiResults, apiCacheTTL);
        
        // Reinicializar repositorio secundario para incluir nuevos datos
        await this.#reinitializeSecondaryRepository();
        
        const duration = Date.now() - startTime;
        this.#log('info', `Búsqueda completada con API en ${duration}ms`);
        return enrichedApiResults;
      }
      
      // No se encontraron magnets en ninguna fuente
      const duration = Date.now() - startTime;
      this.#log('warn', `No se encontraron magnets para ${contentId} en ninguna fuente (${duration}ms)`);
      
      // Cachear resultado vacío con TTL corto para evitar búsquedas repetidas
      cacheService.set(cacheKey, [], 300000); // 5 minutos
      
      throw new MagnetNotFoundError(contentId);
      
    } catch (error) {
      if (error instanceof MagnetNotFoundError) {
        throw error;
      }
      this.#log('error', `Error en búsqueda con metadatos para ${contentId}:`, error);
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
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async #searchInRepositoryByContentId(repository, contentId, sourceName) {
    try {
      return await repository.getMagnetsByContentId(contentId);
    } catch (error) {
      if (error instanceof MagnetNotFoundError) {
        this.#log('debug', `No se encontraron magnets en ${sourceName} para content ID: ${contentId}`);
        return [];
      }
      this.#log('error', `Error buscando en ${sourceName} para content ID ${contentId}:`, error);
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
        this.#log('info', `No se encontraron magnets en ${sourceName} para ${imdbId}`);  
        return [];
      }
      
      this.#log('error', `Error al buscar en ${sourceName} para ${imdbId}:`, error);
      return [];
    }
  }

  /**
   * Reinicializa el repositorio secundario para incluir nuevos datos.
   * @private
   */
  async #reinitializeSecondaryRepository() {
    try {
      // Crear nuevo repositorio secundario para incluir datos actualizados
      this.#secondaryRepository = new CSVMagnetRepository(
        this.#secondaryCsvPath,
        this.#logger
      );
      
      await this.#secondaryRepository.initialize();
      this.#log('debug', 'Repositorio secundario reinicializado');
      
    } catch (error) {
      this.#log('error', 'Error al reinicializar repositorio secundario:', error);
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
        this.#log('info', `Idioma prioritario configurado temporalmente: ${language} para ${type}`);
        
        // Retornar función para revertir
        return () => {
          this.#configInvoker.undoLastCommand();
          this.#log('info', `Configuración de idioma revertida para ${type}`);
        };
      } else {
        this.#log('error', 'No se pudo aplicar la configuración temporal de idioma');
        return null;
      }
    } catch (error) {
      this.#log('error', 'Error al configurar idioma prioritario temporal:', error);
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
    const { primary, secondary, anime } = results;
    let finalResults = [];
    
    // Para anime, priorizar repositorio de anime
    if (type === 'anime') {
      if (anime.length > 0) {
        finalResults.push(...anime);
        this.#log('info', `Encontrados ${anime.length} magnets en repositorio de anime para ${contentId}`);
      }
      
      // Agregar resultados de torrentio como secundarios para anime
      if (secondary.length > 0) {
        finalResults.push(...secondary.slice(0, 3)); // Limitar a 3 resultados adicionales
        this.#log('info', `Agregados ${Math.min(secondary.length, 3)} resultados adicionales de torrentio.csv`);
      }
      
      // Agregar algunos resultados del repositorio principal si es necesario
      if (primary.length > 0 && finalResults.length < 5) {
        const remainingSlots = 5 - finalResults.length;
        finalResults.push(...primary.slice(0, remainingSlots));
        this.#log('info', `Agregados ${Math.min(primary.length, remainingSlots)} resultados adicionales de magnets.csv`);
      }
      
      return finalResults;
    }
    
    // Para películas y series, usar lógica tradicional mejorada
    if (secondary.length > 0) {
      // Tomar el primer resultado de torrentio.csv como principal
      finalResults.push(secondary[0]);
      this.#log('info', `Resultado principal encontrado en torrentio.csv para ${contentId}`);
      
      // Agregar coincidencias adicionales de magnets.csv
      if (primary.length > 0) {
        finalResults.push(...primary.slice(0, 4)); // Limitar a 4 adicionales
        this.#log('info', `Agregados ${Math.min(primary.length, 4)} resultados adicionales de magnets.csv`);
      }
      
      // Para series, también considerar anime.csv si hay resultados
      if (type === 'series' && anime.length > 0) {
        finalResults.push(...anime.slice(0, 2)); // Máximo 2 de anime
        this.#log('info', `Agregados ${Math.min(anime.length, 2)} resultados adicionales de anime.csv`);
      }
      
      return finalResults;
    }
    
    // Si no hay resultados en torrentio.csv, usar repositorio principal
    if (primary.length > 0) {
      this.#log('info', `Encontrados ${primary.length} magnets en repositorio primario para ${contentId}`);
      return primary;
    }
    
    // Como último recurso, usar repositorio de anime
    if (anime.length > 0) {
      this.#log('info', `Encontrados ${anime.length} magnets en repositorio de anime para ${contentId}`);
      return anime;
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
      this.#log('error', 'Error obteniendo estadísticas del repositorio principal:', error.message);
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
      this.#log('error', 'Error obteniendo estadísticas del repositorio secundario:', error.message);
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
      this.#log('error', 'Error obteniendo estadísticas del repositorio de anime:', error.message);
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
    this.#log('info', `Ejecutando búsqueda de fallback para ${contentId}`);
    
    try {
      // Detectar tipo de ID y aplicar estrategia específica
      const idType = this.#detectIdType(contentId);
      
      // Buscar en todas las fuentes locales simultáneamente usando Promise.allSettled
      const searchPromises = [
        this.#searchInRepositoryByContentId(this.#primaryRepository, contentId, 'magnets.csv'),
        this.#searchInRepositoryByContentId(this.#secondaryRepository, contentId, 'torrentio.csv')
      ];
      
      // Para anime, priorizar búsqueda en repositorio de anime
      if (type === 'anime' || idType === 'kitsu' || idType === 'mal' || idType === 'anilist') {
        searchPromises.push(this.#searchInRepositoryByContentId(this.#animeRepository, contentId, 'anime.csv'));
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
          this.#log('warn', `Error en fallback de ${sources[index]} para ${contentId}:`, result.reason?.message);
        }
      });
    
    // Lógica de priorización básica
    let finalResults = this.#prioritizeResults({
      primary: primaryResults,
      secondary: secondaryResults, 
      anime: animeResults
    }, type, contentId);
    
    if (finalResults.length > 0) {
      this.#log('info', `Encontrados ${finalResults.length} magnets en búsqueda de fallback para ${contentId}`);
      return finalResults;
    }
    
    // Paso final: Buscar en API de Torrentio con fallback de idioma
    this.#log('info', `Consultando API Torrentio con fallback de idioma para ${contentId} (${type})`);
    const apiResults = await this.#torrentioApiService.searchMagnetsWithLanguageFallback(contentId, type);
    
    if (apiResults.length > 0) {
      this.#log('info', `Encontrados ${apiResults.length} magnets en API Torrentio (fallback con idioma) para ${contentId}`);
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
      
      this.#log('error', 'Error crítico en búsqueda de fallback:', fallbackError);
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
    // TTL base según tipo de contenido
    let baseTTL;
    
    if (type === 'anime') {
      baseTTL = 3600000; // 1 hora para anime
    } else if (type === 'series') {
      baseTTL = 1800000; // 30 minutos para series
    } else {
      baseTTL = 2700000; // 45 minutos para películas
    }
    
    // Ajustar TTL según número de resultados
    if (resultCount > 10) {
      baseTTL *= 1.5; // Más tiempo para muchos resultados
    } else if (resultCount < 3) {
      baseTTL *= 0.5; // Menos tiempo para pocos resultados
    }
    
    // Resultados de API tienen TTL más corto
    if (isApiResult) {
      baseTTL *= 0.7;
    }
    
    return Math.floor(baseTTL);
  }

  /**
   * Método de depuración para acceder a los repositorios internos.
   * @returns {Object} Repositorios internos para depuración
   */
  getInternalRepositories() {
    return {
      primary: this.#primaryRepository,
      secondary: this.#secondaryRepository,
      anime: this.#animeRepository,
      torrentioApi: this.#torrentioApiService
    };
  }
}

export default CascadingMagnetRepository;