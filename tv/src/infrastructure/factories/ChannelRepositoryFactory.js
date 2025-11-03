/**
 * @fileoverview ChannelRepositoryFactory - Crea el repositorio de canales correcto
 * Implementa el Factory Pattern para desacoplar la creación de repositorios
 */

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
        repository = new CSVChannelRepository(
          dataSources.channelsFile,
          config,
          logger
        );
        break;

      // Implementación para M3U Remoto (se activará después)
      case 'remote_m3U':
      case 'remote_m3u':
        const m3uParser = new M3UParserService(config.filters);
        repository = new RemoteM3UChannelRepository(
          dataSources.m3uUrl,
          m3uParser,
          config,
          logger
        );
        break;

      case 'm3u':
        throw new Error('Repositorio M3U local no implementado aún');

      case 'hybrid':
        // Crear repositorio híbrido: CSV + M3U URLs (remotas y locales)
        const remoteM3uUrls = [
          dataSources.m3uUrl,
          dataSources.backupM3uUrl,
          dataSources.m3uUrl1,
          dataSources.m3uUrl2,
          dataSources.m3uUrl3,
          dataSources.m3uUrl4,
          dataSources.m3uUrl5
        ].filter(Boolean);
        
        const localM3uFiles = [
          dataSources.localM3uLatam1,
          dataSources.localM3uLatam2,
          dataSources.localM3uLatam3,
          dataSources.localM3uLatam4,
          dataSources.localM3uIndex
        ].filter(Boolean);
        
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
        
        repository = new HybridChannelRepository(
          dataSources.channelsFile,
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
    logger.info(`Repositorio inicializado con ${await repository.getChannelsCount()} canales`);

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
}

export default ChannelRepositoryFactory;
