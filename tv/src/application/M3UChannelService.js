import ChannelRepositoryFactory from '../infrastructure/factories/ChannelRepositoryFactory.js';
import { ChannelDeduplicationService, DeduplicationConfig } from '../domain/services/ChannelDeduplicationService.js';
import ContentFilterService from '../domain/services/ContentFilterService.js';
import HttpsToHttpConversionService from '../domain/services/HttpsToHttpConversionService.js';
import M3UGeneratorService from '../infrastructure/services/M3UGeneratorService.js';
import TVAddonConfig from '../infrastructure/config/TVAddonConfig.js';
import { ErrorHandler } from '../infrastructure/error/ErrorHandler.js';

/**
 * Servicio de aplicación para procesar canales y generar archivos M3U
 * Orquesta todos los servicios necesarios para el procesamiento completo
 */
class M3UChannelService {
    constructor() {
        this.config = new TVAddonConfig();
        this.channelRepository = null;
        const envDedupConfig = DeduplicationConfig.fromEnvironment();
        this.deduplicationService = new ChannelDeduplicationService(envDedupConfig);
        this.contentFilterService = new ContentFilterService(this.config.filters);
        this.httpsToHttpService = new HttpsToHttpConversionService();
        this.m3uGeneratorService = new M3UGeneratorService();
        // Crear un logger completo
        const logger = {
            info: (msg) => console.log(`[INFO] ${msg}`),
            error: (msg) => console.error(`[ERROR] ${msg}`),
            warn: (msg) => console.warn(`[WARN] ${msg}`),
            debug: (msg) => console.log(`[DEBUG] ${msg}`),
            fatal: (msg) => console.error(`[FATAL] ${msg}`)
        };
        this.errorHandler = new ErrorHandler(logger, this.config);
    }

    /**
     * Inicializa el repositorio de canales de manera lazy
     * @private
     */
    async _initializeRepository() {
        if (!this.channelRepository) {
            // Crear un logger completo para el factory
            const logger = {
                info: (msg) => console.log(`[INFO] ${msg}`),
                error: (msg) => console.error(`[ERROR] ${msg}`),
                warn: (msg) => console.warn(`[WARN] ${msg}`),
                debug: (msg) => console.log(`[DEBUG] ${msg}`)
            };
            this.channelRepository = await ChannelRepositoryFactory.createRepository(this.config, logger);
        }
    }

    /**
     * Genera un archivo M3U desde canales ya procesados
     * @param {Object} options - Opciones de procesamiento
     * @param {Array} processedChannels - Canales ya procesados (opcional, si no se proporciona procesa desde cero)
     * @returns {Promise<string>} Contenido del archivo M3U generado
     */
    async generateM3UPlaylist(options = {}, processedChannels = null) {
        try {
            let channels;
            
            if (processedChannels && processedChannels.length > 0) {
                // Usar canales ya procesados (evita duplicación de procesamiento)
                console.log(`Generando M3U desde ${processedChannels.length} canales ya procesados...`);
                channels = processedChannels;
            } else {
                // Procesar desde cero (mantiene compatibilidad con uso independiente)
                console.log('Iniciando procesamiento completo de canales para M3U...');
                
                // 1. Obtener canales de todas las fuentes
                const rawChannels = await this._getAllChannels();
                console.log(`Canales obtenidos: ${rawChannels.length}`);
                
                // 2. Aplicar filtros de contenido
                const filteredChannels = this._applyContentFilters(rawChannels);
                console.log(`Canales después del filtrado: ${filteredChannels.length}`);
                
                // 3. Eliminar duplicados
                const uniqueChannels = await this._removeDuplicates(filteredChannels);
                console.log(`Canales únicos: ${uniqueChannels.length}`);
                
                // 4. Convertir HTTPS a HTTP si es necesario
                channels = this._convertHttpsToHttp(uniqueChannels);
            }
            
            // 5. Generar archivo M3U
            const m3uContent = this._generateM3UContent(channels, options);
            
            console.log('Generación M3U completada exitosamente');
            return m3uContent;
            
        } catch (error) {
            this.errorHandler.handleAsyncError(error, 'M3UChannelService.generateM3UPlaylist');
            throw error;
        }
    }

    /**
     * Obtiene canales de todas las fuentes configuradas
     * @returns {Promise<Array>} Array de canales
     */
    async _getAllChannels() {
        try {
            await this._initializeRepository();
            return await this.channelRepository.getAllChannels();
        } catch (error) {
            this.errorHandler.handleAsyncError(error, 'M3UChannelService._getAllChannels');
            throw new Error(`Error al obtener canales: ${error.message}`);
        }
    }

    /**
     * Aplica filtros de contenido a los canales
     * @param {Array} channels - Array de canales
     * @returns {Array} Canales filtrados
     */
    _applyContentFilters(channels) {
        try {
            return this.contentFilterService.filterChannels(channels);
        } catch (error) {
            this.errorHandler.handleAsyncError(error, 'M3UChannelService._applyContentFilters');
            throw new Error(`Error al aplicar filtros de contenido: ${error.message}`);
        }
    }

    /**
     * Elimina canales duplicados
     * @param {Array} channels - Array de canales
     * @returns {Array} Canales sin duplicados
     */
    async _removeDuplicates(channels) {
        try {
            const result = await this.deduplicationService.deduplicateChannels(channels);
            return result.channels;
        } catch (error) {
            this.errorHandler.handleAsyncError(error, 'M3UChannelService._removeDuplicates');
            throw new Error(`Error al eliminar duplicados: ${error.message}`);
        }
    }

    /**
     * Convierte URLs HTTPS a HTTP según configuración
     * @param {Array} channels - Array de canales
     * @returns {Array} Canales con URLs convertidas
     */
    _convertHttpsToHttp(channels) {
        try {
            if (!this.config.validation.convertHttpsToHttp) {
                return channels;
            }
            return this.httpsToHttpService.convertChannels(channels);
        } catch (error) {
            this.errorHandler.handleAsyncError(error, 'M3UChannelService._convertHttpsToHttp');
            throw new Error(`Error al convertir HTTPS a HTTP: ${error.message}`);
        }
    }

    /**
     * Genera el contenido del archivo M3U
     * @param {Array} channels - Array de canales procesados
     * @param {Object} options - Opciones de generación
     * @returns {string} Contenido del archivo M3U
     */
    _generateM3UContent(channels, options) {
        try {
            const { 
                format = 'standard', 
                categorized = false,
                metadata = {} 
            } = options;

            if (categorized) {
                return this.m3uGeneratorService.generateCategorizedM3U(channels);
            }

            if (format === 'extended') {
                return this.m3uGeneratorService.generateExtendedM3U(channels, metadata);
            }

            return this.m3uGeneratorService.generateM3U(channels, options);
            
        } catch (error) {
            this.errorHandler.handleAsyncError(error, 'M3UChannelService._generateM3UContent');
            throw new Error(`Error al generar M3U: ${error.message}`);
        }
    }

    /**
     * Genera estadísticas del procesamiento
     * @returns {Promise<Object>} Objeto con estadísticas
     */
    async generateProcessingStats() {
        try {
            const rawChannels = await this._getAllChannels();
            const filteredChannels = this._applyContentFilters(rawChannels);
            const uniqueChannels = await this._removeDuplicates(filteredChannels);
            
            // Validar divisiones por cero antes de calcular eficiencias
            const filteringEfficiency = (rawChannels.length > 0)
                ? ((rawChannels.length - filteredChannels.length) / rawChannels.length * 100).toFixed(2)
                : '0.00';
            
            const deduplicationEfficiency = (filteredChannels.length > 0)
                ? ((filteredChannels.length - uniqueChannels.length) / filteredChannels.length * 100).toFixed(2)
                : '0.00';
            
            return {
                totalChannels: rawChannels.length,
                filteredChannels: filteredChannels.length,
                uniqueChannels: uniqueChannels.length,
                duplicatesRemoved: filteredChannels.length - uniqueChannels.length,
                filteringEfficiency,
                deduplicationEfficiency
            };
        } catch (error) {
            this.errorHandler.handleAsyncError(error, 'M3UChannelService.generateProcessingStats');
            throw error;
        }
    }

    /**
     * Valida la configuración del servicio
     * @returns {boolean} True si la configuración es válida
     */
    validateConfiguration() {
        try {
            if (!this.config) {
                throw new Error('La configuración es requerida');
            }

            // Usar el método validate del config si existe
            if (typeof this.config.validate === 'function') {
                return this.config.validate();
            }

            return true;

        } catch (error) {
            this.errorHandler.handleAsyncError(error, 'M3UChannelService.validateConfiguration');
            return false;
        }
    }
}

export default M3UChannelService;