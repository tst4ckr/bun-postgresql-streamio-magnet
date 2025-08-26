/**
 * @fileoverview CascadingMagnetRepository - Repositorio con búsqueda en cascada.
 * Implementa búsqueda secuencial: magnets.csv → torrentio.csv → API Torrentio.
 */

import { MagnetRepository, MagnetNotFoundError } from '../../domain/repositories/MagnetRepository.js';
import { CSVMagnetRepository } from './CSVMagnetRepository.js';
import { TorrentioApiService } from '../services/TorrentioApiService.js';

/**
 * Repositorio que implementa búsqueda en cascada con fallback automático.
 * Prioriza fuentes locales antes de consultar APIs externas.
 */
export class CascadingMagnetRepository extends MagnetRepository {
  #primaryRepository;
  #secondaryRepository;
  #torrentioApiService;
  #logger;
  #isInitialized = false;
  #secondaryCsvPath;

  /**
   * @param {string} primaryCsvPath - Ruta del archivo magnets.csv principal
   * @param {string} secondaryCsvPath - Ruta del archivo torrentio.csv secundario
   * @param {string} torrentioApiUrl - URL base de la API de Torrentio
   * @param {Object} logger - Logger para trazabilidad
   * @param {number} timeout - Timeout para operaciones remotas
   */
  constructor(primaryCsvPath, secondaryCsvPath, torrentioApiUrl, logger = console, timeout = 30000) {
    super();
    this.#logger = logger;
    this.#secondaryCsvPath = secondaryCsvPath;
    
    // Repositorio principal (magnets.csv)
    this.#primaryRepository = new CSVMagnetRepository(primaryCsvPath, logger);
    
    // Repositorio secundario (torrentio.csv)
    this.#secondaryRepository = new CSVMagnetRepository(secondaryCsvPath, logger);
    
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
      this.#logger.info('Inicializando repositorios en cascada...');
      
      // Inicializar repositorio principal
      await this.#initializeRepository(this.#primaryRepository, 'magnets.csv');
      
      // Inicializar repositorio secundario
      await this.#initializeRepository(this.#secondaryRepository, 'torrentio.csv');
      
      this.#isInitialized = true;
      this.#logger.info('Repositorios en cascada inicializados correctamente');
      
    } catch (error) {
      this.#logger.error('Error al inicializar repositorios en cascada:', error);
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
      this.#logger.warn(`Advertencia: No se pudo inicializar ${name}:`, error.message);
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
    
    // Paso 1: Buscar en magnets.csv (repositorio principal)
    const primaryResults = await this.#searchInRepository(
      this.#primaryRepository,
      imdbId,
      'magnets.csv'
    );
    
    if (primaryResults.length > 0) {
      this.#logger.info(`Encontrados ${primaryResults.length} magnets en magnets.csv para ${imdbId}`);
      return primaryResults;
    }
    
    // Paso 2: Buscar en torrentio.csv (repositorio secundario)
    const secondaryResults = await this.#searchInRepository(
      this.#secondaryRepository,
      imdbId,
      'torrentio.csv'
    );
    
    if (secondaryResults.length > 0) {
      this.#logger.info(`Encontrados ${secondaryResults.length} magnets en torrentio.csv para ${imdbId}`);
      return secondaryResults;
    }
    
    // Paso 3: Buscar en API de Torrentio
    this.#logger.info(`No se encontraron magnets locales, consultando API Torrentio para ${imdbId} (${type})`);
    const apiResults = await this.#torrentioApiService.searchMagnetsByImdbId(imdbId, type);
    
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
        this.#logger.debug(`No se encontraron magnets en ${sourceName} para ${imdbId}`);
        return [];
      }
      
      this.#logger.error(`Error al buscar en ${sourceName} para ${imdbId}:`, error);
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
      this.#logger.debug('Repositorio secundario reinicializado');
      
    } catch (error) {
      this.#logger.error('Error al reinicializar repositorio secundario:', error);
    }
  }

  /**
   * Obtiene estadísticas de los repositorios.
   * @returns {Promise<Object>} Estadísticas de cada fuente
   */
  async getRepositoryStats() {
    const stats = {
      primary: { name: 'magnets.csv', count: 0, status: 'unknown' },
      secondary: { name: 'torrentio.csv', count: 0, status: 'unknown' },
      api: { name: 'torrentio-api', status: 'available' }
    };
    
    try {
      // Intentar obtener estadísticas del repositorio principal
      await this.#primaryRepository.getMagnetsByImdbId('test');
      stats.primary.status = 'loaded';
    } catch (error) {
      stats.primary.status = this.#primaryRepository ? 'loaded' : 'error';
    }
    
    try {
      // Intentar obtener estadísticas del repositorio secundario
      await this.#secondaryRepository.getMagnetsByImdbId('test');
      stats.secondary.status = 'loaded';
    } catch (error) {
      stats.secondary.status = this.#secondaryRepository ? 'loaded' : 'error';
    }
    
    return stats;
  }
}

export default CascadingMagnetRepository;