/**
 * Interfaces y contratos principales de la librería IPTV
 * 
 * Define los contratos que deben cumplir los diferentes componentes
 * para garantizar la intercambiabilidad y extensibilidad del sistema.
 */

/**
 * Interfaz principal del procesador IPTV
 * Define el contrato que debe cumplir cualquier implementación del procesador
 */
export class IPTVProcessorInterface {
    /**
     * Procesa canales IPTV según la configuración establecida
     * @param {Object} options - Opciones de procesamiento
     * @returns {Promise<ProcessingResult>} Resultado del procesamiento
     */
    async process(options = {}) {
        throw new Error('Method process() must be implemented');
    }

    /**
     * Obtiene estadísticas del último procesamiento
     * @returns {Object} Estadísticas de procesamiento
     */
    getStats() {
        throw new Error('Method getStats() must be implemented');
    }

    /**
     * Configura el procesador con nuevas opciones
     * @param {Object} config - Nueva configuración
     */
    configure(config) {
        throw new Error('Method configure() must be implemented');
    }
}

/**
 * Interfaz para servicios de procesamiento
 * Define el contrato para servicios modulares del pipeline
 */
export class ProcessingServiceInterface {
    /**
     * Procesa una lista de canales
     * @param {Array} channels - Canales a procesar
     * @param {Object} options - Opciones de procesamiento
     * @returns {Promise<ProcessingServiceResult>} Resultado del procesamiento
     */
    async process(channels, options = {}) {
        throw new Error('Method process() must be implemented');
    }

    /**
     * Valida la configuración del servicio
     * @param {Object} config - Configuración a validar
     * @returns {boolean} True si la configuración es válida
     */
    validateConfig(config) {
        throw new Error('Method validateConfig() must be implemented');
    }

    /**
     * Obtiene el nombre del servicio
     * @returns {string} Nombre del servicio
     */
    getName() {
        throw new Error('Method getName() must be implemented');
    }
}

/**
 * Interfaz para repositorios de datos
 * Define el contrato para acceso a datos de canales
 */
export class ChannelRepositoryInterface {
    /**
     * Obtiene todos los canales disponibles
     * @returns {Promise<Array>} Lista de canales
     */
    async getAllChannels() {
        throw new Error('Method getAllChannels() must be implemented');
    }

    /**
     * Obtiene canales filtrados por criterios
     * @param {Object} criteria - Criterios de filtrado
     * @returns {Promise<Array>} Lista de canales filtrados
     */
    async getChannelsByCriteria(criteria) {
        throw new Error('Method getChannelsByCriteria() must be implemented');
    }

    /**
     * Guarda canales procesados
     * @param {Array} channels - Canales a guardar
     * @returns {Promise<void>}
     */
    async saveChannels(channels) {
        throw new Error('Method saveChannels() must be implemented');
    }
}

/**
 * Interfaz para configuración
 * Define el contrato para objetos de configuración
 */
export class ConfigurationInterface {
    /**
     * Obtiene un valor de configuración
     * @param {string} key - Clave de configuración
     * @param {*} defaultValue - Valor por defecto
     * @returns {*} Valor de configuración
     */
    get(key, defaultValue = null) {
        throw new Error('Method get() must be implemented');
    }

    /**
     * Establece un valor de configuración
     * @param {string} key - Clave de configuración
     * @param {*} value - Valor a establecer
     */
    set(key, value) {
        throw new Error('Method set() must be implemented');
    }

    /**
     * Valida la configuración completa
     * @returns {boolean} True si la configuración es válida
     */
    validate() {
        throw new Error('Method validate() must be implemented');
    }

    /**
     * Convierte la configuración a objeto plano
     * @returns {Object} Configuración como objeto
     */
    toObject() {
        throw new Error('Method toObject() must be implemented');
    }
}

/**
 * Tipos de resultado para operaciones de procesamiento
 */
export const ProcessingResultTypes = {
    SUCCESS: 'success',
    PARTIAL_SUCCESS: 'partial_success',
    FAILURE: 'failure',
    SKIPPED: 'skipped'
};

/**
 * Estructura estándar para resultados de procesamiento
 */
export class ProcessingResult {
    constructor(type, data, stats = {}, errors = []) {
        this.type = type;
        this.data = data;
        this.stats = stats;
        this.errors = errors;
        this.timestamp = new Date().toISOString();
    }

    /**
     * Verifica si el resultado es exitoso
     * @returns {boolean} True si es exitoso
     */
    isSuccess() {
        return this.type === ProcessingResultTypes.SUCCESS;
    }

    /**
     * Verifica si hay errores
     * @returns {boolean} True si hay errores
     */
    hasErrors() {
        return this.errors.length > 0;
    }

    /**
     * Añade un error al resultado
     * @param {Error|string} error - Error a añadir
     */
    addError(error) {
        this.errors.push(error instanceof Error ? error.message : error);
    }
}

/**
 * Estructura para resultados de servicios de procesamiento
 */
export class ProcessingServiceResult extends ProcessingResult {
    constructor(type, channels, stats = {}, errors = []) {
        super(type, channels, stats, errors);
        this.channels = channels; // Alias para facilitar acceso
    }
}

/**
 * Eventos del sistema para comunicación entre componentes
 */
export const SystemEvents = {
    PROCESSING_STARTED: 'processing:started',
    PROCESSING_COMPLETED: 'processing:completed',
    PROCESSING_FAILED: 'processing:failed',
    SERVICE_REGISTERED: 'service:registered',
    SERVICE_UNREGISTERED: 'service:unregistered',
    PLUGIN_LOADED: 'plugin:loaded',
    PLUGIN_UNLOADED: 'plugin:unloaded',
    CONFIG_CHANGED: 'config:changed'
};

/**
 * Interfaz para emisores de eventos
 */
export class EventEmitterInterface {
    /**
     * Emite un evento
     * @param {string} event - Nombre del evento
     * @param {*} data - Datos del evento
     */
    emit(event, data) {
        throw new Error('Method emit() must be implemented');
    }

    /**
     * Escucha un evento
     * @param {string} event - Nombre del evento
     * @param {Function} listener - Función listener
     */
    on(event, listener) {
        throw new Error('Method on() must be implemented');
    }

    /**
     * Remueve un listener
     * @param {string} event - Nombre del evento
     * @param {Function} listener - Función listener
     */
    off(event, listener) {
        throw new Error('Method off() must be implemented');
    }
}