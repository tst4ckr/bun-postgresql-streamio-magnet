/**
 * Factory principal para crear instancias del procesador IPTV
 * 
 * Implementa Factory Pattern para crear procesadores configurados
 * con todos los servicios y plugins necesarios.
 */

import { IPTVProcessor } from './pipeline.js';
import { PluginRegistry } from '../plugins/registry.js';
import { ServiceRegistry } from './service-registry.js';
import { EventEmitter } from './event-emitter.js';

/**
 * Factory para crear procesadores IPTV
 * Centraliza la lógica de creación e inicialización de componentes
 */
export class IPTVProcessorFactory {
    /**
     * Crea un procesador IPTV completamente configurado
     * @param {Object} config - Configuración del procesador
     * @param {ServiceContainer} container - Contenedor de servicios
     * @param {string[]} plugins - Lista de plugins a cargar
     * @returns {IPTVProcessor} Procesador configurado
     */
    static create(config, container, plugins = []) {
        // Crear emisor de eventos para comunicación entre componentes
        const eventEmitter = new EventEmitter();
        
        // Registrar servicios core en el contenedor
        this.registerCoreServices(container, config, eventEmitter);
        
        // Cargar y registrar plugins
        this.loadPlugins(container, plugins, eventEmitter);
        
        // Crear y configurar el procesador principal
        const processor = new IPTVProcessor(config, container, eventEmitter);
        
        // Inicializar el procesador
        processor.initialize();
        
        return processor;
    }

    /**
     * Registra los servicios core necesarios para el funcionamiento básico
     * @param {ServiceContainer} container - Contenedor de servicios
     * @param {Object} config - Configuración del sistema
     * @param {EventEmitter} eventEmitter - Emisor de eventos
     */
    static registerCoreServices(container, config, eventEmitter) {
        const serviceRegistry = new ServiceRegistry(container, config, eventEmitter);
        
        // Registrar servicios básicos del pipeline
        serviceRegistry.registerPipelineServices();
        
        // Registrar servicios de datos
        serviceRegistry.registerDataServices();
        
        // Registrar servicios de validación
        serviceRegistry.registerValidationServices();
        
        // Registrar servicios de salida
        serviceRegistry.registerOutputServices();
    }

    /**
     * Carga y registra plugins en el sistema
     * @param {ServiceContainer} container - Contenedor de servicios
     * @param {string[]} plugins - Lista de plugins a cargar
     * @param {EventEmitter} eventEmitter - Emisor de eventos
     */
    static loadPlugins(container, plugins, eventEmitter) {
        const pluginRegistry = PluginRegistry.getInstance();
        
        for (const pluginName of plugins) {
            try {
                const plugin = pluginRegistry.get(pluginName);
                if (plugin) {
                    // Inicializar plugin con acceso al contenedor
                    if (typeof plugin.initialize === 'function') {
                        plugin.initialize(container, eventEmitter);
                    }
                    
                    // Registrar servicios del plugin si los tiene
                    if (typeof plugin.registerServices === 'function') {
                        plugin.registerServices(container);
                    }
                    
                    eventEmitter.emit('plugin:loaded', { name: pluginName, plugin });
                }
            } catch (error) {
                console.warn(`Error loading plugin ${pluginName}:`, error.message);
                eventEmitter.emit('plugin:error', { name: pluginName, error });
            }
        }
    }

    /**
     * Crea un procesador con configuración mínima para testing
     * @param {Object} overrides - Configuración personalizada
     * @returns {IPTVProcessor} Procesador para testing
     */
    static createForTesting(overrides = {}) {
        const { ServiceContainer } = require('./container.js');
        const { ConfigurationBuilder } = require('../config/builder.js');
        
        const config = new ConfigurationBuilder()
            .setEnvironment('test')
            .merge(overrides)
            .build();
            
        const container = new ServiceContainer();
        
        return this.create(config, container, []);
    }

    /**
     * Crea un procesador con configuración por defecto
     * @returns {IPTVProcessor} Procesador con configuración estándar
     */
    static createDefault() {
        const { ServiceContainer } = require('./container.js');
        const { ConfigurationBuilder } = require('../config/builder.js');
        
        const config = new ConfigurationBuilder()
            .setDefaults()
            .build();
            
        const container = new ServiceContainer();
        
        return this.create(config, container, ['deduplication', 'validation']);
    }

    /**
     * Valida que todos los servicios requeridos estén disponibles
     * @param {ServiceContainer} container - Contenedor a validar
     * @param {string[]} requiredServices - Servicios requeridos
     * @throws {Error} Si falta algún servicio requerido
     */
    static validateRequiredServices(container, requiredServices) {
        const missingServices = [];
        
        for (const serviceName of requiredServices) {
            if (!container.has(serviceName)) {
                missingServices.push(serviceName);
            }
        }
        
        if (missingServices.length > 0) {
            throw new Error(
                `Missing required services: ${missingServices.join(', ')}`
            );
        }
    }
}

/**
 * Factory especializado para crear procesadores según el tipo de fuente
 */
export class SourceSpecificProcessorFactory extends IPTVProcessorFactory {
    /**
     * Crea un procesador optimizado para fuentes CSV
     * @param {Object} config - Configuración base
     * @returns {IPTVProcessor} Procesador optimizado para CSV
     */
    static createForCSV(config = {}) {
        const csvConfig = {
            ...config,
            sources: { type: 'csv', ...config.sources },
            validation: { enableStreamValidation: false, ...config.validation },
            plugins: ['deduplication', 'nameCleanup']
        };
        
        return this.createDefault().configure(csvConfig);
    }

    /**
     * Crea un procesador optimizado para fuentes M3U
     * @param {Object} config - Configuración base
     * @returns {IPTVProcessor} Procesador optimizado para M3U
     */
    static createForM3U(config = {}) {
        const m3uConfig = {
            ...config,
            sources: { type: 'm3u', ...config.sources },
            validation: { enableStreamValidation: true, ...config.validation },
            plugins: ['deduplication', 'validation', 'genreDetection']
        };
        
        return this.createDefault().configure(m3uConfig);
    }

    /**
     * Crea un procesador para modo híbrido (CSV + M3U)
     * @param {Object} config - Configuración base
     * @returns {IPTVProcessor} Procesador híbrido
     */
    static createHybrid(config = {}) {
        const hybridConfig = {
            ...config,
            sources: { type: 'hybrid', ...config.sources },
            validation: { enableStreamValidation: true, ...config.validation },
            plugins: ['deduplication', 'validation', 'genreDetection', 'logoGeneration']
        };
        
        return this.createDefault().configure(hybridConfig);
    }
}