/**
 * CustomTVConfig - Configuración personalizada para procesamiento de canales TV
 * Proporciona funciones para crear y gestionar configuraciones específicas del usuario
 */

import { ConfigurationManager } from './ConfigurationManager.js';

/**
 * Configuración personalizada por defecto
 */
const customTVConfig = {
    // Configuración de deduplicación
    deduplication: {
        enabled: true,
        strategy: 'name_and_url', // 'name_only', 'url_only', 'name_and_url'
        caseSensitive: false,
        normalizeNames: true
    },
    
    // Configuración de conversión HTTPS a HTTP
    httpsToHttp: {
        enabled: true,
        validateUrls: true,
        timeout: 5000,
        retries: 2
    },
    
    // Configuración de validación
    validation: {
        enabled: true,
        strictMode: false,
        requiredFields: ['name', 'url'],
        validateUrls: false, // Validación de URLs puede ser costosa
        timeout: 3000
    },
    
    // Configuración de archivos de salida
    output: {
        csv: {
            enabled: true,
            filename: 'channels.csv',
            encoding: 'utf8',
            delimiter: ',',
            includeHeaders: true
        },
        m3u: {
            enabled: true,
            filename: 'playlist.m3u',
            encoding: 'utf8',
            includeLogos: true,
            includeGroups: true
        }
    },
    
    // Configuración de procesamiento
    processing: {
        chunkSize: 100,
        parallelProcessing: true,
        maxConcurrency: 5,
        enableLogging: true
    }
};

/**
 * Obtiene la configuración personalizada actual
 * @returns {Object} Configuración personalizada
 */
function getCustomTVConfig() {
    return { ...customTVConfig };
}

/**
 * Crea una nueva configuración personalizada basada en parámetros específicos
 * @param {Object} overrides - Configuraciones a sobrescribir
 * @returns {Object} Nueva configuración personalizada
 */
function createCustomTVConfig(overrides = {}) {
    const baseConfig = getCustomTVConfig();
    
    // Merge profundo de configuraciones
    const mergedConfig = mergeDeep(baseConfig, overrides);
    
    // Validar configuración resultante
    validateCustomConfig(mergedConfig);
    
    return mergedConfig;
}

/**
 * Realiza un merge profundo de objetos
 * @param {Object} target - Objeto objetivo
 * @param {Object} source - Objeto fuente
 * @returns {Object} Objeto combinado
 */
function mergeDeep(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = mergeDeep(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    
    return result;
}

/**
 * Valida la configuración personalizada
 * @param {Object} config - Configuración a validar
 * @throws {Error} Si la configuración es inválida
 */
function validateCustomConfig(config) {
    // Validar estructura básica
    const requiredSections = ['deduplication', 'httpsToHttp', 'validation', 'output', 'processing'];
    
    for (const section of requiredSections) {
        if (!config[section]) {
            throw new Error(`Sección requerida '${section}' no encontrada en la configuración`);
        }
    }
    
    // Validar configuración de salida
    if (!config.output.csv.enabled && !config.output.m3u.enabled) {
        throw new Error('Al menos un formato de salida (CSV o M3U) debe estar habilitado');
    }
    
    // Validar configuración de procesamiento
    if (config.processing.chunkSize <= 0) {
        throw new Error('El tamaño de chunk debe ser mayor a 0');
    }
    
    if (config.processing.maxConcurrency <= 0) {
        throw new Error('La concurrencia máxima debe ser mayor a 0');
    }
}

/**
 * Convierte la configuración personalizada al formato esperado por ConfigurationManager
 * @param {Object} customConfig - Configuración personalizada
 * @returns {Object} Configuración compatible con ConfigurationManager
 */
function convertToManagerConfig(customConfig) {
    return {
        deduplication: {
            enabled: customConfig.deduplication.enabled,
            strategy: customConfig.deduplication.strategy,
            caseSensitive: customConfig.deduplication.caseSensitive,
            normalizeNames: customConfig.deduplication.normalizeNames
        },
        httpsToHttp: {
            enabled: customConfig.httpsToHttp.enabled,
            validateUrls: customConfig.httpsToHttp.validateUrls,
            timeout: customConfig.httpsToHttp.timeout,
            retries: customConfig.httpsToHttp.retries
        },
        validation: {
            enabled: customConfig.validation.enabled,
            strictMode: customConfig.validation.strictMode,
            requiredFields: customConfig.validation.requiredFields,
            validateUrls: customConfig.validation.validateUrls,
            timeout: customConfig.validation.timeout
        },
        output: {
            csv: customConfig.output.csv,
            m3u: customConfig.output.m3u
        },
        processing: customConfig.processing
    };
}

export {
    customTVConfig,
    getCustomTVConfig,
    createCustomTVConfig,
    convertToManagerConfig
};