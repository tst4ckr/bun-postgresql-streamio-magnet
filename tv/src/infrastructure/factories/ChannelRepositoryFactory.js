/**
 * @fileoverview ChannelRepositoryFactory - Crea el repositorio de canales correcto
 * Implementa el Factory Pattern para desacoplar la creación de repositorios
 */

import path from 'path';
import { M3UParserService } from '../parsers/M3UParserService.js';
import { CSVChannelRepository } from '../repositories/CSVChannelRepository.js';
import { RemoteM3UChannelRepository } from '../repositories/RemoteM3UChannelRepository.js';
import { HybridChannelRepository } from '../repositories/HybridChannelRepository.js';
import { AutomaticChannelRepository } from '../repositories/AutomaticChannelRepository.js';

/**
 * Factory para crear la implementación correcta de ChannelRepository
 * Responsabilidad única: crear y configurar el repositorio según la fuente de datos
 */
export class ChannelRepositoryFactory {
  /**
   * Crea y retorna una instancia del repositorio de canales configurado
   * @static
   * @param {Object} config - Configuración del procesador (ConfigurationManager)
   * @param {Object} logger - Logger para trazabilidad
   * @returns {Promise<ChannelRepository>}
   * @throws {Error} si la fuente de datos no es soportada
   */
  static async createRepository(config, logger) {
    const { dataSources } = config;
    const channelsSource = dataSources.channelsSource;
    
    logger.info(`Creando repositorio para fuente: ${channelsSource}`);

    let repository;

    // Si channelsSource es una URL directa, usar RemoteM3UChannelRepository
    if (this.#isUrl(channelsSource)) {
      logger.info(`Detectada URL directa: ${channelsSource}`);
      const m3uParser = new M3UParserService(config.filters);
      repository = new RemoteM3UChannelRepository(
        channelsSource,
        m3uParser,
        config,
        logger
      );
    } else {
      // Usar el switch tradicional para fuentes nombradas
      switch (channelsSource) {
      case 'csv':
        // Resolver rutas relativas del CSV con base en el archivo de configuración cargado
        const resolvedCsvPath = this.#resolvePath(dataSources.channelsFile, config);
        repository = new CSVChannelRepository(
          resolvedCsvPath,
          config,
          logger
        );
        break;

      // Implementación para M3U Remoto (se activará después)
      case 'remote_m3u':
        {
          const m3uParser = new M3UParserService(config.filters);
          const candidates = [
            dataSources.m3uUrl1,
            dataSources.m3uUrl2,
            dataSources.m3uUrl3,
            dataSources.m3uUrl4,
            dataSources.m3uUrl5,
            dataSources.m3uUrl6
          ].filter(u => typeof u === 'string' && u.trim().length > 0);
          const firstUrl = candidates[0];
          if (!firstUrl) {
            throw new Error('Fuente remote_m3u requiere al menos una M3U_URL1..M3U_URL6');
          }
          repository = new RemoteM3UChannelRepository(
            firstUrl,
            m3uParser,
            config,
            logger
          );
        }
        break;

      case 'm3u':
        throw new Error('Repositorio M3U local no implementado aún');

      case 'hybrid':
        // Crear repositorio híbrido: CSV + M3U URLs (remotas y locales)
        // Construir lista de URLs remotas y eliminar duplicados
        const remoteM3uUrlsRaw = [
          dataSources.m3uUrl1,
          dataSources.m3uUrl2,
          dataSources.m3uUrl3,
          dataSources.m3uUrl4,
          dataSources.m3uUrl5,
          dataSources.m3uUrl6,
          dataSources.backupM3uUrl
        ].filter(Boolean);
        const remoteM3uUrls = [...new Set(remoteM3uUrlsRaw)];
        
        const localM3uFilesRaw = [
          dataSources.localM3uLatam1,
          dataSources.localM3uLatam2,
          dataSources.localM3uLatam3,
          dataSources.localM3uLatam4,
          dataSources.localM3uIndex
        ].filter(Boolean);
        const localM3uFiles = localM3uFilesRaw.map(fp => this.#resolvePath(fp, config));
        
        // El archivo CSV adicional se maneja automáticamente por HybridChannelRepository
        // a través de config.dataSources.localChannelsCsv - NO agregarlo a M3U
        if (dataSources.localChannelsCsv) {
          logger.info(`CSV adicional configurado: ${dataSources.localChannelsCsv}`);
        }
        
        const allM3uSources = [...remoteM3uUrls, ...localM3uFiles];
        
        if (allM3uSources.length === 0) {
          logger.warn('Repositorio híbrido sin fuentes M3U, usando solo CSV');
        } else {
          logger.info(`Repositorio híbrido: ${remoteM3uUrls.length} URLs remotas, ${localM3uFiles.length} archivos locales`);
        }
        
        const resolvedHybridCsv = this.#resolvePath(dataSources.channelsFile, config);
        repository = new HybridChannelRepository(
          resolvedHybridCsv,
          allM3uSources,
          config,
          logger
        );
        break;

      case 'automatic':
        repository = new AutomaticChannelRepository(config, logger);
        break;

      default:
        logger.error(`Fuente de canales no soportada: ${channelsSource}`);
        throw new Error(`Fuente de canales no soportada: ${channelsSource}`);
      }
    }

    // Inicializar el repositorio
    await repository.initialize();

    // IMPORTANTE: evitar trabajo duplicado y logs repetidos.
    // getChannelsCount() en repositorios como Hybrid/Remote puede aplicar
    // conversión HTTPS->HTTP, filtros y validaciones de nuevo, lo que
    // re-ejecuta tareas pesadas antes de que el Processor cargue los datos.
    // Para medir el tamaño inicial sin disparar procesamiento adicional,
    // usamos getAllChannelsUnfiltered() y contamos su longitud.
    try {
      const initialChannels = await repository.getAllChannelsUnfiltered();
      logger.info(`Repositorio inicializado con ${initialChannels.length} canales (sin filtros adicionales)`);
    } catch (e) {
      // Como fallback, si el repositorio no soporta getAllChannelsUnfiltered,
      // evitamos llamar a getChannelsCount() para no duplicar trabajo.
      // Solo registramos que fue inicializado.
      logger.info('Repositorio inicializado (conteo omitido para evitar trabajo duplicado)');
    }

    return repository;
  }

  /**
   * Verifica si una cadena es una URL válida
   * @private
   * @static
   * @param {string} str - Cadena a verificar
   * @returns {boolean} true si es una URL válida
   */
  static #isUrl(str) {
    if (!str || typeof str !== 'string') return false;
    
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resuelve una ruta para archivos locales considerando la ubicación del archivo de configuración.
   * - Si es URL, retorna tal cual.
   * - Si es absoluta, retorna tal cual.
   * - Si es relativa, intenta resolver respecto a config.__baseDir y luego respecto a process.cwd().
   * @private
   * @static
   * @param {string} filePath
   * @param {Object} config
   * @returns {string}
   */
  static #resolvePath(filePath, config) {
    if (!filePath || typeof filePath !== 'string') return filePath;
    if (this.#isUrl(filePath)) return filePath;

    // Si ya es absoluta
    if (path.isAbsolute(filePath)) return filePath;

    // Normalizar separadores y detectar si comienza con 'data/'
    const normalized = filePath.replace(/\\/g, '/');
    const startsWithData = normalized.replace(/^\.\//, '').startsWith('data/');

    const baseDir = config.__baseDir || process.cwd();
    const rootDir = config.__rootDir || path.resolve(baseDir, '..');
    const base = startsWithData ? rootDir : baseDir;
    const resolved = path.resolve(base, filePath);
    return resolved;
  }
}

export default ChannelRepositoryFactory;
