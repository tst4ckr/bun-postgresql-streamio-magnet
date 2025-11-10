/**
 * @fileoverview Herramientas auxiliares PURAS para EnhancedLoggerService
 * 
 * RESPONSABILIDAD: Contiene SOLO funciones puras y simples (sin lógica compleja)
 * 
 * Principios:
 * - Funciones puras: sin efectos secundarios ni estado
 * - Simples: una responsabilidad por función
 * - Reutilizables: pueden usarse en otros contextos
 * - Deterministas: mismo input = mismo output
 */

/**
 * Niveles de logging disponibles con sus valores numéricos
 * @constant {Object}
 */
export const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Configuración por defecto del logger
 * @constant {Object}
 */
export const DEFAULT_CONFIG = {
  logLevel: 'info',
  enableRequestLogging: false,
  enablePerformanceMetrics: false,
  logFilePath: 'logs/addon.log'
};

/**
 * FUNCIÓN PURA: Extrae información del archivo fuente desde stack trace
 * @param {string} stack - Stack trace completo
 * @param {string} excludeFileName - Archivo a excluir del análisis
 * @returns {Object} Información del archivo fuente
 */
export function extractSourceInfo(stack, excludeFileName = 'EnhancedLoggerService.js') {
  if (!stack || typeof stack !== 'string') {
    return {
      fileName: 'unknown',
      lineNumber: 0,
      fullPath: 'unknown'
    };
  }

  const stackLines = stack.split('\n');
  
  // Buscar la línea que no sea del logger
  for (let i = 3; i < stackLines.length; i++) {
    const line = stackLines[i];
    if (line && !line.includes(excludeFileName)) {
      const match = line.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) || 
                   line.match(/at\s+(.*):(.*):(\d+)/);
      
      if (match) {
        const filePath = match[2] || match[1];
        const lineNumber = match[3] || match[2];
        const fileName = filePath ? filePath.split(/[\\/]/).pop() : 'unknown';
        
        return {
          fileName,
          lineNumber: parseInt(lineNumber) || 0,
          fullPath: filePath || 'unknown'
        };
      }
    }
  }
  
  return {
    fileName: 'unknown',
    lineNumber: 0,
    fullPath: 'unknown'
  };
}

/**
 * FUNCIÓN PURA: Formatea mensaje con timestamp y fuente
 * @param {string} level - Nivel del log
 * @param {string} message - Mensaje original
 * @param {Object} sourceInfo - Información del archivo fuente
 * @param {Date} timestamp - Timestamp del mensaje
 * @returns {string} Mensaje formateado
 */
export function formatLogMessage(level, message, sourceInfo, timestamp = new Date()) {
  if (!level || !message || !sourceInfo) {
    throw new Error('formatLogMessage requiere level, message y sourceInfo');
  }

  const isoTimestamp = timestamp.toISOString();
  const source = `${sourceInfo.fileName}:${sourceInfo.lineNumber}`;
  return `[${level}] ${isoTimestamp} [${source}] - ${message}`;
}

/**
 * FUNCIÓN PURA: Verifica si un nivel de log está habilitado
 * @param {string} messageLevel - Nivel del mensaje
 * @param {string} currentLogLevel - Nivel configurado
 * @returns {boolean} True si está habilitado
 */
export function isLogLevelEnabled(messageLevel, currentLogLevel) {
  if (!messageLevel || !currentLogLevel) {
    return false;
  }

  const currentLevel = LOG_LEVELS[currentLogLevel] ?? LOG_LEVELS.info;
  const checkLevel = LOG_LEVELS[messageLevel] ?? LOG_LEVELS.info;
  
  return checkLevel >= currentLevel;
}

/**
 * FUNCIÓN PURA: Valida configuración del logger
 * @param {Object} config - Configuración a validar
 * @returns {Object} Configuración validada
 */
export function validateLoggerConfig(config = {}) {
  const validatedConfig = { ...DEFAULT_CONFIG };

  // Validar logLevel
  if (config.logLevel && LOG_LEVELS.hasOwnProperty(config.logLevel)) {
    validatedConfig.logLevel = config.logLevel;
  }

  // Validar flags booleanos
  if (typeof config.enableRequestLogging === 'boolean') {
    validatedConfig.enableRequestLogging = config.enableRequestLogging;
  }

  if (typeof config.enablePerformanceMetrics === 'boolean') {
    validatedConfig.enablePerformanceMetrics = config.enablePerformanceMetrics;
  }

  // Validar logFilePath
  if (config.logFilePath && typeof config.logFilePath === 'string') {
    validatedConfig.logFilePath = config.logFilePath;
  }

  return validatedConfig;
}

/**
 * FUNCIÓN PURA: Crea mensaje de performance
 * @param {string} operation - Nombre de la operación
 * @param {number} duration - Duración en milisegundos
 * @returns {string} Mensaje formateado
 */
export function createPerformanceMessage(operation, duration) {
  if (!operation || typeof duration !== 'number') {
    throw new Error('createPerformanceMessage requiere operation y duration válidos');
  }

  return `Performance: ${operation} completed in ${duration}ms`;
}

/**
 * FUNCIÓN PURA: Crea mensaje de request HTTP
 * @param {string} method - Método HTTP
 * @param {string} url - URL del request
 * @param {number} statusCode - Código de estado
 * @param {number} duration - Duración en milisegundos
 * @returns {string} Mensaje formateado
 */
export function createRequestMessage(method, url, statusCode, duration) {
  if (!method || !url || typeof statusCode !== 'number' || typeof duration !== 'number') {
    throw new Error('createRequestMessage requiere todos los parámetros válidos');
  }

  return `${method} ${url} ${statusCode} - ${duration}ms`;
}

/**
 * FUNCIÓN PURA: Actualiza configuración de forma inmutable
 * @param {Object} currentConfig - Configuración actual
 * @param {Object} newConfig - Nueva configuración
 * @returns {Object} Configuración actualizada
 */
export function mergeLoggerConfig(currentConfig, newConfig) {
  if (!currentConfig || !newConfig) {
    return currentConfig || {};
  }

  const updatedConfig = { ...currentConfig };

  if (newConfig.logLevel && LOG_LEVELS.hasOwnProperty(newConfig.logLevel)) {
    updatedConfig.logLevel = newConfig.logLevel;
  }

  if (typeof newConfig.enableRequestLogging === 'boolean') {
    updatedConfig.enableRequestLogging = newConfig.enableRequestLogging;
  }

  if (typeof newConfig.enablePerformanceMetrics === 'boolean') {
    updatedConfig.enablePerformanceMetrics = newConfig.enablePerformanceMetrics;
  }

  if (newConfig.logFilePath && typeof newConfig.logFilePath === 'string') {
    updatedConfig.logFilePath = newConfig.logFilePath;
  }

  return updatedConfig;
}

/**
 * FUNCIÓN PURA: Crea métodos de logger hijo con contexto
 * @param {string} context - Contexto del logger hijo
 * @param {Function} logFunction - Función de logging padre
 * @returns {Function} Función de logging con contexto
 */
export function createContextualLogFunction(context, logFunction) {
  if (!context || !logFunction) {
    throw new Error('createContextualLogFunction requiere context y logFunction');
  }

  return (message, ...args) => logFunction(`[${context}] ${message}`, ...args);
}