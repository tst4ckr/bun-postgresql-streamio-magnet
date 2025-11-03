/**
 * TVChannelProcessorFactory - Factory para crear instancias de TVChannelProcessor
 * Proporciona diferentes configuraciones predefinidas y personalización flexible
 */

import { TVChannelProcessor } from './TVChannelProcessor.js';

export class TVChannelProcessorFactory {
    
    /**
     * Crea una instancia estándar con configuración por defecto
     */
    static createDefault(options = {}) {
        const defaultOptions = {
            enableLogging: true,
            enableValidation: true,
            enableDeduplication: true,
            enableHttpsToHttp: true,
            enableGenreDetection: true,
            enableLogoGeneration: true,
            enableNameCleaning: true,
            outputDirectory: 'data',
            chunkSize: 15,
            maxConcurrency: 10,
            ...options
        };

        return new TVChannelProcessor(defaultOptions);
    }

    /**
     * Crea una instancia silenciosa (sin logging)
     */
    static createSilent(options = {}) {
        return this.createDefault({
            enableLogging: false,
            ...options
        });
    }

    /**
     * Crea una instancia rápida (sin validación ni procesamiento pesado)
     */
    static createFast(options = {}) {
        return this.createDefault({
            enableValidation: false,
            enableGenreDetection: false,
            enableLogoGeneration: false,
            chunkSize: 50,
            maxConcurrency: 20,
            ...options
        });
    }

    /**
     * Crea una instancia completa (todas las características habilitadas)
     */
    static createComplete(options = {}) {
        return this.createDefault({
            enableValidation: true,
            enableDeduplication: true,
            enableHttpsToHttp: true,
            enableGenreDetection: true,
            enableLogoGeneration: true,
            enableNameCleaning: true,
            enableLogging: true,
            ...options
        });
    }

    /**
     * Crea una instancia personalizada con configuración específica
     */
    static createCustom(customConfig, options = {}) {
        return new TVChannelProcessor({
            customConfig,
            ...options
        });
    }

    /**
     * Crea una instancia para testing (configuración mínima)
     */
    static createForTesting(options = {}) {
        return new TVChannelProcessor({
            enableLogging: false,
            enableValidation: false,
            enableDeduplication: false,
            enableHttpsToHttp: false,
            enableGenreDetection: false,
            enableLogoGeneration: false,
            enableNameCleaning: false,
            chunkSize: 5,
            maxConcurrency: 2,
            ...options
        });
    }

    /**
     * Crea una instancia con configuración desde variables de entorno
     */
    static createFromEnvironment(envOverrides = {}) {
        const envOptions = {
            enableLogging: process.env.TV_ENABLE_LOGGING !== 'false',
            enableValidation: process.env.TV_ENABLE_VALIDATION !== 'false',
            enableDeduplication: process.env.TV_ENABLE_DEDUPLICATION !== 'false',
            enableHttpsToHttp: process.env.TV_ENABLE_HTTPS_TO_HTTP !== 'false',
            enableGenreDetection: process.env.TV_ENABLE_GENRE_DETECTION !== 'false',
            enableLogoGeneration: process.env.TV_ENABLE_LOGO_GENERATION !== 'false',
            enableNameCleaning: process.env.TV_ENABLE_NAME_CLEANING !== 'false',
            outputDirectory: process.env.TV_OUTPUT_DIRECTORY || 'data',
            chunkSize: parseInt(process.env.TV_CHUNK_SIZE) || 15,
            maxConcurrency: parseInt(process.env.TV_MAX_CONCURRENCY) || 10,
            ...envOverrides
        };

        return new TVChannelProcessor(envOptions);
    }
}

export default TVChannelProcessorFactory;