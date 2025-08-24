/**
 * @fileoverview ChannelRepositoryFactory - Crea el repositorio de canales correcto
 * Implementa el Factory Pattern para desacoplar la creación de repositorios
 */

import { TVAddonConfig } from '../config/TVAddonConfig.js';
import { M3UParserService } from '../parsers/M3UParserService.js';
import { CSVChannelRepository } from '../repositories/CSVChannelRepository.js';
// Importaremos el nuevo repositorio M3U aquí cuando exista
import { RemoteM3UChannelRepository } from '../repositories/RemoteM3UChannelRepository.js';

/**
 * Factory para crear la implementación correcta de ChannelRepository
 * Responsabilidad única: crear y configurar el repositorio según la fuente de datos
 */
export class ChannelRepositoryFactory {
  /**
   * Crea y retorna una instancia del repositorio de canales configurado
   * @static
   * @param {TVAddonConfig} config - Instancia de la configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   * @returns {Promise<ChannelRepository>}
   * @throws {Error} si la fuente de datos no es soportada
   */
  static async createRepository(config, logger) {
    const { dataSources } = config;
    logger.info(`ChannelRepositoryFactory: Creando repositorio para fuente -> ${dataSources.channelsSource}`);

    let repository;

    switch (dataSources.channelsSource) {
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
        throw new Error('Repositorio híbrido no implementado aún');

      default:
        logger.error(`Fuente de canales no soportada: ${dataSources.channelsSource}`);
        throw new Error(`Fuente de canales no soportada: ${dataSources.channelsSource}`);
    }

    // Inicializar el repositorio (cargar datos iniciales)
    if (typeof repository.initialize === 'function') {
      await repository.initialize();
    }

    const channelCount = await repository.getChannelsCount();
    logger.info(`Repositorio "${dataSources.channelsSource}" creado e inicializado con ${channelCount} canales.`);

    return repository;
  }
}

export default ChannelRepositoryFactory;
