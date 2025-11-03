/**
 * @fileoverview ConfigurationManager - Gestor de configuración para la librería
 * Reemplaza el sistema de .env con configuración basada en archivos JSON/JS
 */

import { promises as fs } from 'fs';
import path from 'path';
import TVAddonConfig from '../infrastructure/config/TVAddonConfig.js';

/**
 * Gestor de configuración centralizado
 * Maneja la carga y validación de configuración desde múltiples fuentes
 */
export class ConfigurationManager {
    #defaultConfig;

    constructor() {
        this.#defaultConfig = this.#getDefaultConfiguration();
    }

    /**
     * Carga la configuración desde diferentes fuentes
     * @param {Object|string|null} configSource - Fuente de configuración
     * @returns {Object} Configuración cargada y validada
     */
    loadConfiguration(configSource = null) {
        let config = { ...this.#defaultConfig };

        if (configSource === null) {
            // Usar configuración por defecto
            return config;
        }

        if (typeof configSource === 'string') {
            // Cargar desde archivo
            config = this.#loadFromFile(configSource, config);
        } else if (typeof configSource === 'object') {
            // Usar configuración pasada como objeto
            config = this.#mergeConfigurations(config, configSource);
        } else {
            throw new Error('Fuente de configuración no válida. Debe ser un objeto, string (ruta de archivo) o null');
        }

        // Validar configuración final
        this.#validateConfiguration(config);
        
        return config;
    }

    /**
     * Carga configuración desde archivo
     * @private
     * @param {string} filePath - Ruta del archivo de configuración
     * @param {Object} baseConfig - Configuración base
     * @returns {Object} Configuración cargada
     */
    #loadFromFile(filePath, baseConfig) {
        try {
            const absolutePath = path.resolve(filePath);
            const fileContent = require(absolutePath);
            
            // Si es un módulo ES6, obtener el default export
            const config = fileContent.default || fileContent;
            
            return this.#mergeConfigurations(baseConfig, config);
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND' || error.code === 'ENOENT') {
                throw new Error(`Archivo de configuración no encontrado: ${filePath}`);
            }
            throw new Error(`Error al cargar configuración desde ${filePath}: ${error.message}`);
        }
    }

    /**
     * Combina configuraciones de forma profunda
     * @private
     * @param {Object} base - Configuración base
     * @param {Object} override - Configuración a sobrescribir
     * @returns {Object} Configuración combinada
     */
    #mergeConfigurations(base, override) {
        const result = { ...base };
        
        for (const [key, value] of Object.entries(override)) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this.#mergeConfigurations(result[key] || {}, value);
            } else {
                result[key] = value;
            }
        }
        
        return result;
    }

    /**
     * Obtiene la configuración por defecto
     * @private
     * @returns {Object} Configuración por defecto
     */
    #getDefaultConfiguration() {
        // Obtener configuración base de TVAddonConfig
        const addonConfig = TVAddonConfig.getInstance().getAll();
        
        return {
            // Configuración del servidor
            server: {
                port: 3000,
                host: 'localhost',
                name: 'StreamIO TV Machine',
                version: '1.0.0',
                description: 'Generador de listas M3U para canales de TV'
            },

            // Fuentes de datos
            dataSources: {
                channelsSource: 'csv',
                m3uUrl: null,
                localM3uFile: null,
                localCsvFile: 'data/channels.csv',
                enableRemoteSource: false,
                enableLocalFiles: true
            },

            // Configuración de filtros
            filters: {
                enableCountryFilter: true,
                allowedCountries: ['CO', 'Colombia', 'COLOMBIA'],
                enableCategoryFilter: false,
                allowedCategories: [],
                enableLanguageFilter: false,
                allowedLanguages: ['es', 'spa', 'spanish'],
                customFilters: []
            },

            // Configuración de archivos y persistencia (desde TVAddonConfig)
            files: addonConfig.files || { enableBackup: true },

            // Configuración de deduplicación
            deduplication: {
                enableDeduplication: true,
                strategy: 'advanced', // 'simple', 'advanced', 'strict'
                compareFields: ['name', 'url'],
                caseSensitive: false,
                normalizeNames: true
            },

            // Configuración de conversión HTTPS->HTTP
            conversion: {
                enableHttpsToHttp: true,
                forceConversion: false,
                preserveOriginalUrls: false
            },

            // Configuración de validación
            validation: {
                enableStreamValidation: true,
                timeout: 10000,
                maxRetries: 2,
                concurrency: 15,
                maxBatchSize: 30,
                skipValidationPatterns: [],
                requiredResponseCodes: [200, 206, 302, 301]
            },

            // Configuración de archivos CSV
            csv: {
                outputDirectory: 'data',
                filename: 'tv.csv',
                encoding: 'utf8',
                delimiter: ',',
                includeHeaders: true,
                customFields: []
            },

            // Configuración de archivos M3U
            m3u: {
                outputDirectory: 'data',
                filename: 'channels.m3u',
                encoding: 'utf8',
                includeExtinf: true,
                includeGroupTitle: true,
                includeTvgLogo: true,
                customAttributes: []
            },

            // Configuración de streaming
            streaming: {
                defaultQuality: 'HD',
                enableAdultChannels: false,
                cacheChannelsHours: 6,
                streamTimeoutSeconds: 30,
                maxConcurrentStreams: 100
            },

            // Configuración de logging
            logging: {
                level: 'info', // 'debug', 'info', 'warn', 'error', 'fatal'
                enableConsole: true,
                enableFile: false,
                logFile: 'logs/tv-processor.log',
                maxFileSize: '10MB',
                maxFiles: 5
            },

            // Configuración de cache
            cache: {
                enableCache: true,
                ttl: 3600, // 1 hora en segundos
                directory: '.cache',
                maxSize: '100MB'
            },

            // Configuración de performance
            performance: {
                enableParallelProcessing: true,
                maxConcurrency: 10,
                batchSize: 100,
                enableProgressReporting: true
            }
        };
    }

    /**
     * Valida la configuración cargada
     * @private
     * @param {Object} config - Configuración a validar
     */
    #validateConfiguration(config) {
        // Validaciones críticas
        if (!config.dataSources) {
            throw new Error('Configuración de fuentes de datos es requerida');
        }

        if (!config.dataSources.enableRemoteSource && !config.dataSources.enableLocalFiles) {
            throw new Error('Debe habilitar al menos una fuente de datos (remota o local)');
        }

        if (config.dataSources.enableRemoteSource && !config.dataSources.channelsSource) {
            throw new Error('URL de fuente de canales es requerida cuando enableRemoteSource está habilitado');
        }

        if (config.dataSources.enableLocalFiles && !config.dataSources.localM3uFile && !config.dataSources.localCsvFile) {
            throw new Error('Archivo local M3U o CSV es requerido cuando enableLocalFiles está habilitado');
        }

        // Validar timeouts
        if (config.validation?.timeout && config.validation.timeout < 1000) {
            throw new Error('Timeout de validación debe ser al menos 1000ms');
        }

        // Validar concurrencia
        if (config.validation?.concurrency && config.validation.concurrency < 1) {
            throw new Error('Concurrencia de validación debe ser al menos 1');
        }

        if (config.performance?.maxConcurrency && config.performance.maxConcurrency < 1) {
            throw new Error('Concurrencia máxima debe ser al menos 1');
        }
    }

    /**
     * Genera un archivo de configuración de ejemplo
     * @param {string} outputPath - Ruta donde guardar el archivo
     * @returns {Promise<void>}
     */
    async generateExampleConfig(outputPath = './tv-config.example.js') {
        const exampleConfig = {
            // Configuración básica del servidor
            server: {
                port: 3000,
                host: 'localhost',
                name: 'Mi StreamIO TV'
            },

            // Fuentes de datos - PERSONALIZAR SEGÚN TUS NECESIDADES
            dataSources: {
                // URL principal de canales M3U
                channelsSource: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_colombia.m3u8',
                
                // Habilitar fuente remota
                enableRemoteSource: true,
                
                // Archivos locales (opcional)
                enableLocalFiles: false,
                localM3uFile: null, // './data/channels.m3u'
                localCsvFile: null  // './data/channels.csv'
            },

            // Filtros de canales
            filters: {
                enableCountryFilter: true,
                allowedCountries: ['CO', 'Colombia'],
                
                enableCategoryFilter: false,
                allowedCategories: ['News', 'Sports', 'Entertainment'],
                
                enableLanguageFilter: false,
                allowedLanguages: ['es', 'spanish']
            },

            // Configuración de procesamiento
            deduplication: {
                enableDeduplication: true,
                strategy: 'advanced'
            },

            conversion: {
                enableHttpsToHttp: true
            },

            validation: {
                enableStreamValidation: true,
                timeout: 10000,
                concurrency: 15
            },

            // Archivos de salida
            csv: {
                outputDirectory: 'data',
                filename: 'tv.csv'
            },

            m3u: {
                outputDirectory: 'data',
                filename: 'channels.m3u'
            }
        };

        const content = `/**
 * Configuración de ejemplo para TVChannelProcessor
 * Copia este archivo y personalízalo según tus necesidades
 */

export default ${JSON.stringify(exampleConfig, null, 2)};

// También puedes usar module.exports para CommonJS:
// module.exports = ${JSON.stringify(exampleConfig, null, 2)};
`;

        await fs.writeFile(outputPath, content, 'utf8');
        console.log(`Archivo de configuración de ejemplo creado en: ${outputPath}`);
    }

    /**
     * Obtiene la configuración por defecto
     * @returns {Object} Configuración por defecto
     */
    getDefaultConfiguration() {
        return { ...this.#defaultConfig };
    }
}