/**
 * IPTV Library - Librería simplificada para procesamiento de datos IPTV
 * 
 * Esta librería proporciona una interfaz unificada para el procesamiento
 * de canales IPTV, incluyendo carga, validación, deduplicación y generación
 * de archivos de salida.
 * 
 * @module IPTVLibrary
 */

// Módulos de configuración
import { EnvLoader } from '../infrastructure/config/EnvLoader.js';
import TVAddonConfig from '../infrastructure/config/TVAddonConfig.js';

// Procesador principal
import { IPTVProcessor } from './core/iptv-processor.js';

// Servicios principales
import { IPTVDataLoader } from './services/data-loader.js';
import { ValidationService } from './services/validation.js';

// Eventos
import { EventEmitter } from 'events';

/**
 * Clase principal de la librería IPTV simplificada
 * Orquesta los componentes esenciales y proporciona una interfaz unificada
 */
export class IPTVLibrary extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableLogging: options.enableLogging !== false,
            enableValidation: options.enableValidation !== false,
            chunkSize: options.chunkSize || 15,
            ...options
        };
        
        this.config = null;
        this.processor = null;
        this.dataLoader = null;
        this.validationService = null;
        this.initialized = false;
        this.processing = false;
        
        if (this.options.autoInit !== false) {
            this.initialize().catch(error => {
                this.emit('error', error);
            });
        }
    }

    /**
     * Inicializa la librería y todos sus componentes
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            this.emit('initializing');

            if (this.options.enableLogging) {
                console.log('🔧 Inicializando librería IPTV...');
            }

            // Cargar variables de entorno si no están definidas
            if (!process.env.CHANNELS_SOURCE && !process.env.M3U_URL) {
                EnvLoader.getInstance();
            }

            this.config = TVAddonConfig.getInstance();

            // Inicializar procesador principal
            this.processor = new IPTVProcessor({
                enableLogging: this.options.enableLogging,
                enableValidation: this.options.enableValidation,
                chunkSize: this.options.chunkSize
            });

            // Inicializar servicios auxiliares
            this.dataLoader = new IPTVDataLoader(this.config);
            this.validationService = new ValidationService(this.config);

            this.initialized = true;
            this.emit('initialized');

            if (this.options.enableLogging) {
                console.log('✅ Librería IPTV inicializada correctamente');
            }

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Procesa canales IPTV usando el pipeline completo
     * @param {Object} processingOptions - Opciones específicas de procesamiento
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async process(processingOptions = {}) {
        if (!this.initialized) {
            throw new Error('La librería debe ser inicializada antes de procesar');
        }

        if (this.processing) {
            throw new Error('Ya hay un procesamiento en curso');
        }

        try {
            this.processing = true;
            this.emit('processing-started');

            const result = await this.processor.process(processingOptions);
            
            this.emit('processing-completed', result);
            return result;

        } catch (error) {
            this.emit('processing-error', error);
            throw error;
        } finally {
            this.processing = false;
        }
    }

    /**
     * Procesa canales IPTV de forma completa (alias para process)
     * @param {Object} options - Opciones de procesamiento
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async processComplete(options = {}) {
        return this.process(options);
    }

    /**
     * Obtiene la configuración actual
     * @returns {Object} Configuración actual
     */
    getConfig() {
        return this.config;
    }

    /**
     * Verifica si la librería está inicializada
     * @returns {boolean} Estado de inicialización
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Verifica si hay un procesamiento en curso
     * @returns {boolean} Estado de procesamiento
     */
    isProcessing() {
        return this.processing;
    }

    /**
     * Limpia recursos y resetea el estado
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            this.emit('cleanup-started');

            if (this.dataLoader) {
                await this.dataLoader.cleanup();
            }

            if (this.validationService) {
                await this.validationService.cleanup();
            }

            this.initialized = false;
            this.processing = false;
            
            this.emit('cleanup-completed');

        } catch (error) {
            this.emit('cleanup-error', error);
            throw error;
        }
    }
}

/**
 * Factory simplificado para crear instancias de la librería IPTV
 */
export class IPTVLibraryFactory {
    /**
     * Crea una instancia estándar de la librería
     * @param {Object} options - Opciones de configuración
     * @returns {IPTVLibrary} Instancia de la librería
     */
    static createStandard(options = {}) {
        return new IPTVLibrary({
            enableLogging: true,
            enableValidation: true,
            autoInit: true,
            ...options
        });
    }

    /**
     * Crea una instancia silenciosa (sin logging)
     * @param {Object} options - Opciones de configuración
     * @returns {IPTVLibrary} Instancia de la librería
     */
    static createSilent(options = {}) {
        return new IPTVLibrary({
            enableLogging: false,
            enableValidation: true,
            autoInit: true,
            ...options
        });
    }

    /**
     * Crea una instancia básica con configuración mínima
     * @param {Object} config - Configuración personalizada
     * @returns {IPTVLibrary} Instancia de la librería
     */
    static create(config = {}) {
        return new IPTVLibrary(config);
    }
}

// Exportaciones principales
export { IPTVProcessor } from './core/iptv-processor.js';
export { IPTVDataLoader } from './services/data-loader.js';
export { ValidationService } from './services/validation.js';

export default IPTVLibrary;