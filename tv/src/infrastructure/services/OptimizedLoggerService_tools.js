/**
 * @fileoverview Herramientas auxiliares PURAS para OptimizedLoggerService
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
  SILENT: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};

/**
 * Nombres de los niveles de logging
 * @constant {Object}
 */
export const LEVEL_NAMES = {
  0: 'SILENT',
  1: 'ERROR', 
  2: 'WARN',
  3: 'INFO',
  4: 'DEBUG'
};

/**
 * Configuración por defecto del logger optimizado
 * @constant {Object}
 */
export const DEFAULT_OPTIMIZED_CONFIG = {
  level: LOG_LEVELS.INFO,
  enableBatching: true,
  batchSize: 10,
  batchTimeout: 100,
  enableThrottling: true,
  throttleWindow: 1000,
  maxLogsPerWindow: 50,
  enablePerformanceMetrics: false
};

/**
 * FUNCIÓN PURA: Determina el nivel de logging basado en el entorno
 * @param {string} nodeEnv - Entorno de Node.js
 * @param {string} logLevel - Nivel de log desde variables de entorno
 * @returns {number} Nivel numérico de logging
 */
export function getEnvironmentLevel(nodeEnv = process.env.NODE_ENV, logLevel = process.env.LOG_LEVEL) {
  const env = nodeEnv?.toLowerCase();
  const level = logLevel?.toUpperCase();
  
  if (level && LOG_LEVELS[level] !== undefined) {
    return LOG_LEVELS[level];
  }

  // Niveles por defecto según entorno
  switch (env) {
    case 'production':
      return LOG_LEVELS.WARN;
    case 'test':
      return LOG_LEVELS.SILENT;
    case 'development':
    default:
      return LOG_LEVELS.INFO;
  }
}

/**
 * FUNCIÓN PURA: Verifica si un nivel de log debe ser procesado
 * @param {number} messageLevel - Nivel del mensaje
 * @param {number} currentLevel - Nivel actual del logger
 * @returns {boolean} True si debe procesarse el log
 */
export function shouldLog(messageLevel, currentLevel) {
  return messageLevel <= currentLevel;
}

/**
 * FUNCIÓN PURA: Genera una clave única para throttling
 * @param {number} level - Nivel del log
 * @param {string} message - Mensaje del log
 * @returns {string} Clave de throttling
 */
export function getThrottleKey(level, message) {
  const messageHash = simpleHash(message);
  return `${level}:${messageHash}`;
}

/**
 * FUNCIÓN PURA: Hash simple para agrupar mensajes similares
 * @param {string} str - String a hashear
 * @returns {string} Hash en base 36
 */
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 50); i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * FUNCIÓN PURA: Verifica si un log debe ser throttled
 * @param {Array} timestamps - Array de timestamps recientes
 * @param {number} windowStart - Inicio de la ventana de tiempo
 * @param {number} maxLogsPerWindow - Máximo de logs por ventana
 * @returns {boolean} True si debe ser throttled
 */
export function shouldThrottle(timestamps, windowStart, maxLogsPerWindow) {
  const recentLogs = timestamps.filter(t => t > windowStart);
  return recentLogs.length >= maxLogsPerWindow;
}

/**
 * FUNCIÓN PURA: Filtra timestamps antiguos
 * @param {Array} timestamps - Array de timestamps
 * @param {number} windowStart - Inicio de la ventana válida
 * @returns {Array} Timestamps filtrados
 */
export function filterValidTimestamps(timestamps, windowStart) {
  return timestamps.filter(t => t > windowStart);
}

/**
 * FUNCIÓN PURA: Formatea el mensaje de log
 * @param {number} level - Nivel del log
 * @param {string} message - Mensaje base
 * @param {Array} args - Argumentos adicionales
 * @param {Date} timestamp - Timestamp del log
 * @returns {string} Mensaje formateado
 */
export function formatLogMessage(level, message, args = [], timestamp = new Date()) {
  const timeStr = timestamp.toISOString().substring(11, 23); // HH:mm:ss.SSS
  const levelName = LEVEL_NAMES[level];
  
  let formattedMessage = message;
  if (args.length > 0) {
    formattedMessage = formatArgs(message, args);
  }

  return `[${timeStr}] ${levelName}: ${formattedMessage}`;
}

/**
 * FUNCIÓN PURA: Formateo eficiente de argumentos
 * @param {string} message - Mensaje base
 * @param {Array} args - Argumentos a formatear
 * @returns {string} Mensaje con argumentos formateados
 */
export function formatArgs(message, args) {
  try {
    // Si el mensaje tiene placeholders %s, %d, etc., usar formateo simple
    if (message.includes('%')) {
      const argsCopy = [...args];
      return message.replace(/%[sdj%]/g, (match) => {
        if (argsCopy.length === 0) return match;
        const arg = argsCopy.shift();
        switch (match) {
          case '%s': return String(arg);
          case '%d': return Number(arg);
          case '%j': return JSON.stringify(arg);
          case '%%': return '%';
          default: return match;
        }
      });
    }
    
    // Concatenación simple para mejor rendimiento
    return args.length > 0 ? `${message} ${args.join(' ')}` : message;
  } catch (error) {
    return `${message} [Error formatting args: ${error.message}]`;
  }
}

/**
 * FUNCIÓN PURA: Determina el método de consola apropiado para el nivel
 * @param {number} level - Nivel del log
 * @returns {string} Nombre del método de consola
 */
export function getConsoleMethod(level) {
  switch (level) {
    case LOG_LEVELS.ERROR:
      return 'error';
    case LOG_LEVELS.WARN:
      return 'warn';
    case LOG_LEVELS.INFO:
    case LOG_LEVELS.DEBUG:
    default:
      return 'log';
  }
}

/**
 * FUNCIÓN PURA: Calcula métricas de rendimiento
 * @param {Object} metrics - Métricas base
 * @param {number} startTime - Tiempo de inicio
 * @param {number} currentLevel - Nivel actual
 * @returns {Object} Métricas calculadas
 */
export function calculateMetrics(metrics, startTime, currentLevel) {
  const runtime = Date.now() - startTime;
  return {
    ...metrics,
    runtime,
    logsPerSecond: metrics.totalLogs / (runtime / 1000),
    throttleRate: metrics.totalLogs > 0 ? (metrics.throttledLogs / metrics.totalLogs) * 100 : 0,
    currentLevel: LEVEL_NAMES[currentLevel]
  };
}

/**
 * FUNCIÓN PURA: Valida configuración del logger optimizado
 * @param {Object} config - Configuración a validar
 * @returns {Object} Configuración validada
 */
export function validateOptimizedLoggerConfig(config = {}) {
  const validated = { ...DEFAULT_OPTIMIZED_CONFIG };

  // Validar nivel
  if (typeof config.level === 'string') {
    const levelNum = LOG_LEVELS[config.level.toUpperCase()];
    if (levelNum !== undefined) {
      validated.level = levelNum;
    }
  } else if (typeof config.level === 'number' && config.level >= 0 && config.level <= 4) {
    validated.level = config.level;
  }

  // Validar configuraciones booleanas
  if (typeof config.enableBatching === 'boolean') {
    validated.enableBatching = config.enableBatching;
  }
  if (typeof config.enableThrottling === 'boolean') {
    validated.enableThrottling = config.enableThrottling;
  }
  if (typeof config.enablePerformanceMetrics === 'boolean') {
    validated.enablePerformanceMetrics = config.enablePerformanceMetrics;
  }

  // Validar números positivos
  if (typeof config.batchSize === 'number' && config.batchSize > 0) {
    validated.batchSize = Math.floor(config.batchSize);
  }
  if (typeof config.batchTimeout === 'number' && config.batchTimeout > 0) {
    validated.batchTimeout = Math.floor(config.batchTimeout);
  }
  if (typeof config.throttleWindow === 'number' && config.throttleWindow > 0) {
    validated.throttleWindow = Math.floor(config.throttleWindow);
  }
  if (typeof config.maxLogsPerWindow === 'number' && config.maxLogsPerWindow > 0) {
    validated.maxLogsPerWindow = Math.floor(config.maxLogsPerWindow);
  }

  return validated;
}

/**
 * FUNCIÓN PURA: Crea métricas iniciales
 * @returns {Object} Objeto de métricas inicial
 */
export function createInitialMetrics() {
  return {
    totalLogs: 0,
    throttledLogs: 0,
    batchedLogs: 0,
    startTime: Date.now()
  };
}

/**
 * FUNCIÓN PURA: Determina si debe loggear en batch
 * @param {number} currentIndex - Índice actual
 * @param {number} totalItems - Total de elementos
 * @param {number} batchSize - Tamaño del batch
 * @returns {boolean} True si debe loggear
 */
export function shouldLogBatch(currentIndex, totalItems, batchSize = 50) {
  return currentIndex % batchSize === 0 || currentIndex === totalItems - 1;
}

/**
 * FUNCIÓN PURA: Determina si debe loggear progreso
 * @param {number} current - Valor actual
 * @param {number} total - Valor total
 * @param {number} stepSize - Tamaño del paso
 * @returns {boolean} True si debe loggear
 */
export function shouldLogProgress(current, total, stepSize = 10) {
  const percentage = Math.floor((current / total) * 100);
  return percentage % stepSize === 0 || current === total;
}

/**
 * FUNCIÓN PURA: Crea mensaje de progreso
 * @param {string} message - Mensaje base
 * @param {number} current - Valor actual
 * @param {number} total - Valor total
 * @returns {string} Mensaje de progreso formateado
 */
export function createProgressMessage(message, current, total) {
  const percentage = Math.floor((current / total) * 100);
  return `${message}: ${percentage}% (${current}/${total})`;
}

/**
 * FUNCIÓN PURA: Crea mensaje de batch
 * @param {string} message - Mensaje base
 * @param {number} currentIndex - Índice actual
 * @param {number} totalItems - Total de elementos
 * @returns {string} Mensaje de batch formateado
 */
export function createBatchMessage(message, currentIndex, totalItems) {
  return `${message} (${currentIndex + 1}/${totalItems})`;
}