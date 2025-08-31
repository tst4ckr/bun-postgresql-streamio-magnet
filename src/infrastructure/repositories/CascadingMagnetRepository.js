/**
 * @fileoverview CascadingMagnetRepository - Repositorio con búsqueda en cascada.
 * Implementa búsqueda secuencial: magnets.csv → torrentio.csv → API Torrentio.
 */

import { MagnetRepository, MagnetNotFoundError, RepositoryError } from '../../domain/repositories/MagnetRepository.js';
import { CSVMagnetRepository } from './CSVMagnetRepository.js';
import { TorrentioApiService } from '../services/TorrentioApiService.js';
import { unifiedIdService } from '../services/UnifiedIdService.js';

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

  /**
   * Método auxiliar para logging seguro
   * @param {string} level - Nivel de log (info, warn, error)
   * @param {string} message - Mensaje a loggear
   * @param {any} data - Datos adicionales
   */
  #log(level, message, data = null) {
    if (this.#logger && typeof this.#logger[level] === 'function') {
      if (data !== null && data !== undefined) {
        this.#logger[level](message, data);
      } else {
        this.#logger[level](message);
      }
    } else {
      if (data !== null && data !== undefined) {
        console[level](message, data);
      } else {
        console[level](message);
      }
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
  constructor(primaryCsvPath, secondaryCsvPath, animeCsvPath, torrentioApiUrl, logger = console, timeout = 30000, idService = unifiedIdService) {
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
      timeout
    );
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
    
    // Paso 1: Buscar en magnets.csv (repositorio principal)
    const primaryResults = await this.#searchInRepository(
      this.#primaryRepository,
      imdbId,
      'magnets.csv'
    );
    
    if (primaryResults.length > 0) {
      this.#log('info', `Encontrados ${primaryResults.length} magnets en magnets.csv para ${imdbId}`);
      return primaryResults;
    }
    
    // Paso 2: Buscar en torrentio.csv (repositorio secundario)
    const secondaryResults = await this.#searchInRepository(
      this.#secondaryRepository,
      imdbId,
      'torrentio.csv'
    );
    
    if (secondaryResults.length > 0) {
      this.#log('info', `Encontrados ${secondaryResults.length} magnets en torrentio.csv para ${imdbId}`);
      return secondaryResults;
    }
    
    // Paso 3: Buscar en anime.csv (repositorio anime)
    const animeResults = await this.#searchInRepository(
      this.#animeRepository,
      imdbId,
      'anime.csv'
    );
    
    if (animeResults.length > 0) {
      this.#log('info', `Encontrados ${animeResults.length} magnets en anime.csv para ${imdbId}`);
      return animeResults;
    }
    
    // Paso 4: Buscar en API de Torrentio
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
   * Busca magnets por cualquier tipo de ID de contenido (IMDb o Kitsu).
   * Utiliza el servicio unificado de IDs para detectar y convertir automáticamente.
   * @param {string} contentId - ID de contenido (IMDb o Kitsu)
   * @param {string} type - Tipo de contenido ('movie', 'series', 'anime')
   * @param {Object} options - Opciones adicionales para la búsqueda
   * @returns {Promise<Magnet[]>} Array de magnets encontrados
   */
  async getMagnetsByContentId(contentId, type = 'movie', options = {}) {
    if (!this.#isInitialized) {
      await this.initialize();
    }
    
    this.#log('info', `Búsqueda en cascada iniciada para content ID: ${contentId} (${type})`);
    
    // Paso 1: Buscar en repositorio primario (magnets.csv)
    const primaryResults = await this.#searchInRepositoryByContentId(this.#primaryRepository, contentId, 'magnets.csv');
    if (primaryResults.length > 0) {
      this.#log('info', `Encontrados ${primaryResults.length} magnets en repositorio primario para ${contentId}`);
      return primaryResults;
    }
    
    // Paso 2: Buscar en repositorio secundario (torrentio.csv)
    const secondaryResults = await this.#searchInRepositoryByContentId(this.#secondaryRepository, contentId, 'torrentio.csv');
    if (secondaryResults.length > 0) {
      this.#log('info', `Encontrados ${secondaryResults.length} magnets en repositorio secundario para ${contentId}`);
      return secondaryResults;
    }
    
    // Paso 3: Buscar en repositorio de anime (anime.csv)
    const animeResults = await this.#searchInRepositoryByContentId(this.#animeRepository, contentId, 'anime.csv');
    if (animeResults.length > 0) {
      this.#log('info', `Encontrados ${animeResults.length} magnets en repositorio de anime para ${contentId}`);
      return animeResults;
    }
    
    // Paso 4: Buscar en API de Torrentio
    this.#log('info', `No se encontraron magnets locales, consultando API Torrentio para ${contentId} (${type})`);
    const apiResults = await this.#torrentioApiService.searchMagnetsById(contentId, type);
    
    if (apiResults.length > 0) {
      this.#log('info', `Encontrados ${apiResults.length} magnets en API Torrentio para ${contentId}`);
      
      // Reinicializar repositorio secundario para incluir nuevos datos
      await this.#reinitializeSecondaryRepository();
      
      return apiResults;
    }
    
    // No se encontraron magnets en ninguna fuente
    this.#log('warn', `No se encontraron magnets para ${contentId} en ninguna fuente`);
    throw new MagnetNotFoundError(contentId);
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
   * Configura el idioma prioritario para búsquedas de torrents.
   * @param {string} language - Idioma a configurar (ej: 'spanish', 'english')
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