/**
 * @fileoverview UnifiedLoggerService_tools - Herramientas auxiliares para logging unificado
 * 
 * RESPONSABILIDAD PRINCIPAL: Funciones puras y utilidades para el servicio de logging
 * 
 * Funciones exportadas:
 * - Constantes de logging (niveles, nombres)
 * - Validación de configuración
 * - Formateo de mensajes
 * - Throttling y batching
 * - Extracción de información de fuente
 * - Cálculo de métricas
 * - Utilidades de contexto
 */

// Constantes
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

export const LEVEL_NAMES = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

// Configuración por defecto
const DEFAULT_CONFIG = {
  level: LOG_LEVELS.INFO,
  enableBatching: true,
  batchSize: 50,
  batchTimeout: 100,
  enableThrottling: true,
  throttleWindow: 1000,
  maxLogsPerWindow: 10,
  enableSourceTracking: true,
  enableRequestLogging: false,
  enablePerformanceMetrics: true,
  maxMemoryMB: 10
};

/**
 * Obtiene el nivel de logging desde el entorno
 */
export function getEnvironmentLevel() {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  return LOG_LEVELS[envLevel] ?? LOG_LEVELS.INFO;
}

/**
 * Determina si se debe loggear según el nivel
 */
export function shouldLog(level, configLevel) {
  return level <= configLevel;
}

/**
 * Obtiene clave para throttling
 */
export function getThrottleKey(message, args) {
  const messageHash = message.length > 100 ? 
    message.substring(0, 100) + '...' : 
    message;
  const argsStr = args.length > 0 ? JSON.stringify(args.slice(0, 3)) : '';
  return `${messageHash}|${argsStr}`;
}

/**
 * Determina si se debe aplicar throttling
 */
export function shouldThrottleWithMap(throttleMap, key, window, maxLogs) {
  const now = Date.now();
  const windowStart = now - window;
  
  // Limpiar entradas antiguas
  for (const [k, timestamps] of throttleMap.entries()) {
    const filtered = timestamps.filter(ts => ts > windowStart);
    if (filtered.length === 0) {
      throttleMap.delete(k);
    } else if (filtered.length !== timestamps.length) {
      throttleMap.set(k, filtered);
    }
  }
  
  // Verificar si debe throttle
  const timestamps = throttleMap.get(key) || [];
  const recentLogs = timestamps.filter(ts => ts > windowStart);
  
  if (recentLogs.length >= maxLogs) {
    return true;
  }
  
  // Agregar timestamp actual
  recentLogs.push(now);
  throttleMap.set(key, recentLogs);
  
  return false;
}

/**
 * Formatea mensaje de log
 */
export function formatLogMessage(level, message, args) {
  const levelName = LEVEL_NAMES[level];
  const timestamp = new Date().toISOString();
  
  let formattedMessage = `[${timestamp}] [${levelName}] ${message}`;
  
  if (args.length > 0) {
    const argsStr = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return '[Circular]';
        }
      }
      return String(arg);
    }).join(' ');
    
    formattedMessage += ` ${argsStr}`;
  }
  
  return formattedMessage;
}

/**
 * Obtiene método de consola correspondiente
 */
export function getConsoleMethod(level) {
  switch (level) {
    case LOG_LEVELS.ERROR: return 'error';
    case LOG_LEVELS.WARN: return 'warn';
    case LOG_LEVELS.INFO: return 'info';
    case LOG_LEVELS.DEBUG: return 'log';
    default: return 'log';
  }
}

/**
 * Crea estado inicial de métricas
 */
export function createInitialMetrics() {
  return {
    totalLogs: 0,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    debugCount: 0,
    batchedLogs: 0,
    throttledLogs: 0,
    batchesProcessed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: Date.now()
  };
}

/**
 * Calcula métricas finales
 */
export function calculateMetrics(metrics, throttleMap) {
  const runtime = Date.now() - metrics.startTime;
  
  return {
    ...metrics,
    runtimeMs: runtime,
    logsPerSecond: runtime > 0 ? (metrics.totalLogs / (runtime / 1000)).toFixed(2) : '0.00',
    throttleMapSize: throttleMap.size,
    cacheHitRate: metrics.cacheHits + metrics.cacheMisses > 0 ? 
      ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(1) : '0.0'
  };
}

/**
 * Valida configuración unificada
 */
export function validateUnifiedLoggerConfig(config) {
  const validated = { ...DEFAULT_CONFIG, ...config };
  
  // Validar nivel
  if (typeof validated.level === 'string') {
    validated.level = LOG_LEVELS[validated.level.toUpperCase()] ?? LOG_LEVELS.INFO;
  }
  
  // Validar rangos
  validated.batchSize = Math.max(1, Math.min(1000, validated.batchSize));
  validated.batchTimeout = Math.max(10, Math.min(5000, validated.batchTimeout));
  validated.throttleWindow = Math.max(100, Math.min(10000, validated.throttleWindow));
  validated.maxLogsPerWindow = Math.max(1, Math.min(100, validated.maxLogsPerWindow));
  validated.maxMemoryMB = Math.max(1, Math.min(100, validated.maxMemoryMB));
  
  return validated;
}

/**
 * Determina si se debe loggear un batch
 */
export function shouldLogBatch(configLevel, items) {
  return configLevel >= LOG_LEVELS.DEBUG && items && items.length > 0;
}

/**
 * Crea mensaje de batch
 */
export function createBatchMessage(message, items) {
  return `${message} (${items.length} items): ${JSON.stringify(items.slice(0, 5), null, 2)}`;
}

/**
 * Extrae información de fuente desde stack trace
 */
export function extractSourceInfo(stack) {
  if (!stack) return null;
  
  const lines = stack.split('\n');
  // Buscar línea relevante (saltar las primeras que son del logger mismo)
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('UnifiedLoggerService') && !line.includes('node:internal')) {
      const match = line.match(/at\s+.*\s+\(?(.*?):(\d+):(\d+)\)?$/);
      if (match) {
        const [, filePath, lineNumber, columnNumber] = match;
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
        
        return {
          fileName,
          filePath,
          lineNumber,
          columnNumber,
          shortPath: fileName.length > 50 ? '...' + fileName.slice(-47) : fileName
        };
      }
    }
  }
  
  return null;
}

/**
 * Crea mensaje de rendimiento
 */
export function createPerformanceMessage(operation, duration) {
  return `⏱️  ${operation} completado en ${duration}ms`;
}

/**
 * Crea mensaje de request HTTP
 */
export function createRequestMessage(method, url, statusCode, duration) {
  const statusEmoji = statusCode >= 200 && statusCode < 300 ? '✅' : 
                     statusCode >= 400 ? '❌' : '⚠️';
  return `${statusEmoji} ${method} ${url} - ${statusCode} (${duration}ms)`;
}

/**
 * Crea función de log contextual
 */
export function createContextualLogFunction(logger, context) {
  const contextStr = typeof context === 'string' ? context : JSON.stringify(context);
  
  return {
    error: (message, ...args) => logger.error(`[${contextStr}] ${message}`, ...args),
    warn: (message, ...args) => logger.warn(`[${contextStr}] ${message}`, ...args),
    info: (message, ...args) => logger.info(`[${contextStr}] ${message}`, ...args),
    debug: (message, ...args) => logger.debug(`[${contextStr}] ${message}`, ...args)
  };
}