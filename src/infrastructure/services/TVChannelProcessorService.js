/**
 * @fileoverview TVChannelProcessorService - Servicio wrapper para la librería TVChannelProcessor.
 * Integra la librería TVChannelProcessor con la arquitectura existente del proyecto Stremio.
 * Implementa Clean Architecture y se integra con el TechnicalBootstrapManager.
 */

import { 
  TVChannelProcessor, 
  ConfigurationManager, 
  getCustomTVConfig 
} from '../../../tv/src/lib/index.js';

/**
 * Servicio que encapsula la funcionalidad de TVChannelProcessor
 * para integrarse con el sistema de bootstrap y repositorios existentes.
 */
export class TVChannelProcessorService {
  #processor = null;
  #configManager = null;
  #finalConfig = null;
  #logger = null;
  #isInitialized = false;
  #channels = new Map();
  #lastProcessTime = null;
  #processingPromise = null;

  /**
   * @param {EnhancedLogger} logger - Instancia del logger del proyecto
   * @param {Object} projectConfig - Configuración del proyecto principal
   */
  constructor(logger, projectConfig = {}) {
    this.#logger = logger;
    this.#configManager = new ConfigurationManager();
    
    // Configuración personalizada para el proyecto
    this.projectConfig = {
      customConfigPath: projectConfig.tvProcessor?.customConfigPath || null,
      refreshInterval: projectConfig.tvProcessor?.refreshInterval || 300000, // 5 minutos
      enableAutoRefresh: projectConfig.tvProcessor?.enableAutoRefresh ?? true,
      ...projectConfig.tvProcessor
    };
  }

  /**
   * Inicializa el servicio TVChannelProcessor.
   * Se ejecuta durante la fase de bootstrap del proyecto.
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      this.#logger.debug('TVChannelProcessorService ya está inicializado');
      return;
    }

    try {
      this.#logger.info('🎬 Inicializando TVChannelProcessor Service...');
      
      // 1. Cargar configuración base (CustomTVConfig.js)
      const baseConfig = getCustomTVConfig();
      this.#logger.debug('✅ Configuración base cargada desde CustomTVConfig.js');

      // 2. Cargar configuración personalizada si existe
      let fileConfig = {};
      if (this.projectConfig.customConfigPath) {
        try {
          fileConfig = this.#configManager.loadConfiguration(this.projectConfig.customConfigPath);
          this.#logger.info(`✅ Configuración personalizada cargada desde: ${this.projectConfig.customConfigPath}`);
        } catch (error) {
          this.#logger.warn(`⚠️ No se pudo cargar configuración personalizada: ${error.message}`);
        }
      }

      // 3. Fusionar configuraciones
      this.#finalConfig = this.#configManager.mergeConfigurations(baseConfig, fileConfig);
      this.#logger.debug('✅ Configuraciones fusionadas exitosamente');

      // 4. Crear instancia del procesador
      this.#processor = new TVChannelProcessor(this.#finalConfig);
      this.#logger.info('✅ TVChannelProcessor instanciado correctamente');

      // 5. Procesar canales inicialmente
      await this.#processChannelsInternal();

      // 6. Configurar auto-refresh si está habilitado
      if (this.projectConfig.enableAutoRefresh) {
        this.#setupAutoRefresh();
      }

      this.#isInitialized = true;
      this.#logger.info('🚀 TVChannelProcessorService inicializado exitosamente', {
        channelsProcessed: this.#channels.size,
        autoRefreshEnabled: this.projectConfig.enableAutoRefresh,
        refreshInterval: this.projectConfig.refreshInterval
      });

    } catch (error) {
      this.#logger.error('❌ Error inicializando TVChannelProcessorService:', error);
      throw new Error(`TVChannelProcessorService initialization failed: ${error.message}`);
    }
  }

  /**
   * Obtiene todos los canales procesados.
   * Compatible con la interfaz del M3UTvRepository existente.
   * @returns {Promise<Array>} Array de canales procesados
   */
  async getAllTvs() {
    await this.#ensureInitialized();
    return Array.from(this.#channels.values());
  }

  /**
   * Obtiene un canal por su ID.
   * @param {string} channelId - ID del canal
   * @returns {Promise<Object|null>} Canal encontrado o null
   */
  async getTvById(channelId) {
    await this.#ensureInitialized();
    return this.#channels.get(channelId) || null;
  }

  /**
   * Obtiene todos los grupos disponibles.
   * @returns {Promise<string[]>} Array de grupos únicos
   */
  async getAvailableGroups() {
    await this.#ensureInitialized();
    const groups = new Set();
    this.#channels.forEach(channel => {
      if (channel.group) groups.add(channel.group);
    });
    return Array.from(groups).sort();
  }

  /**
   * Obtiene estadísticas de los canales procesados.
   * @returns {Promise<Object>} Objeto con estadísticas
   */
  async getStats() {
    await this.#ensureInitialized();
    
    const groups = new Set();
    this.#channels.forEach(channel => {
      if (channel.group) groups.add(channel.group);
    });

    return {
      total: this.#channels.size,
      groups: groups.size,
      groupNames: Array.from(groups).sort(),
      lastUpdated: this.#lastProcessTime,
      processorConfig: {
        sources: this.#finalConfig?.sources?.length || 0,
        filtersEnabled: this.#finalConfig?.filters?.enabled || false,
        deduplicationEnabled: this.#finalConfig?.deduplication?.enabled || false
      }
    };
  }

  /**
   * Fuerza el reprocesamiento de canales.
   * @returns {Promise<void>}
   */
  async refreshTvs() {
    await this.#ensureInitialized();
    this.#logger.info('🔄 Forzando reprocesamiento de canales...');
    await this.#processChannelsInternal();
  }

  /**
   * Obtiene información de configuración del servicio.
   * @returns {Object} Información de configuración
   */
  getConfig() {
    return {
      isInitialized: this.#isInitialized,
      channelsLoaded: this.#channels.size,
      lastProcessTime: this.#lastProcessTime,
      autoRefreshEnabled: this.projectConfig.enableAutoRefresh,
      refreshInterval: this.projectConfig.refreshInterval,
      customConfigPath: this.projectConfig.customConfigPath,
      finalConfig: this.#finalConfig
    };
  }

  /**
   * Limpia recursos y detiene procesos automáticos.
   */
  cleanup() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.#logger.info('🧹 TVChannelProcessorService limpiado');
  }

  // ==================== MÉTODOS PRIVADOS ====================

  /**
   * Asegura que el servicio esté inicializado.
   * @private
   */
  async #ensureInitialized() {
    if (!this.#isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Procesa canales internamente y actualiza el cache.
   * @private
   * @returns {Promise<void>}
   */
  async #processChannelsInternal() {
    // Evitar procesamiento concurrente
    if (this.#processingPromise) {
      return this.#processingPromise;
    }

    this.#processingPromise = this.#doProcessChannels();
    
    try {
      await this.#processingPromise;
    } finally {
      this.#processingPromise = null;
    }
  }

  /**
   * Ejecuta el procesamiento real de canales.
   * @private
   * @returns {Promise<void>}
   */
  async #doProcessChannels() {
    try {
      const startTime = Date.now();
      this.#logger.debug('🔄 Iniciando procesamiento de canales...');

      // Procesar canales usando TVChannelProcessor
      const processedChannels = await this.#processor.processChannels();
      
      // Actualizar cache interno
      this.#channels.clear();
      processedChannels.forEach(channel => {
        this.#channels.set(channel.id, channel);
      });

      this.#lastProcessTime = Date.now();
      const duration = this.#lastProcessTime - startTime;

      this.#logger.info('✅ Canales procesados exitosamente', {
        totalChannels: processedChannels.length,
        processingTime: `${duration}ms`,
        timestamp: new Date(this.#lastProcessTime).toISOString()
      });

    } catch (error) {
      this.#logger.error('❌ Error procesando canales:', error);
      throw error;
    }
  }

  /**
   * Configura el auto-refresh de canales.
   * @private
   */
  #setupAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        this.#logger.debug('⏰ Ejecutando auto-refresh de canales...');
        await this.#processChannelsInternal();
      } catch (error) {
        this.#logger.error('❌ Error en auto-refresh:', error);
      }
    }, this.projectConfig.refreshInterval);

    this.#logger.debug(`⏰ Auto-refresh configurado cada ${this.projectConfig.refreshInterval}ms`);
  }
}