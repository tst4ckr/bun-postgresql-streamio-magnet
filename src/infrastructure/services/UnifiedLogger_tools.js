/**
 * @fileoverview UnifiedLogger_tools - Herramientas puras y utilidades para UnifiedLogger
 * 
 * RESPONSABILIDAD PRINCIPAL: Proporcionar funciones puras y constantes para el logger unificado
 * 
 * Funciones:
 * - Constantes y validación de logging
 * - Formateo de mensajes
 * - Extracción de información de fuente
 * - Cálculo de métricas
 * - Contexto y child loggers
 */

// Constantes de logging
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

export const LEVEL_NAMES = {
  0: 'ERROR',
  1: 'WARN',
  2: 'INFO',
  3: 'DEBUG'
};

// Colores para consola
const COLORS = {
  ERROR: '\x1b[31m', // Rojo
  WARN: '\x1b[33m',  // Amarillo
  INFO: '\x1b[36m',  // Cian
  DEBUG: '\x1b[35m', // Magenta
  RESET: '\x1b[0m'
};

/**
 * Obtiene el nivel de logging desde el entorno
 */
export function getEnvironmentLevel() {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
    return LOG_LEVELS[envLevel];
  }
  return LOG_LEVELS.INFO;
}

/**
 * Determina si se debe loggear según el nivel
 */
export function shouldLog(level, configLevel) {
  return level <= configLevel;
}

/**
 * Obtiene el método de console correspondiente
 */
export function getConsoleMethod(level) {
  switch (level) {
    case LOG_LEVELS.ERROR: return 'error';
    case LOG_LEVELS.WARN: return 'warn';
    case LOG_LEVELS.INFO: return 'log';
    case LOG_LEVELS.DEBUG: return 'debug';
    default: return 'log';
  }
}

/**
 * Formatea el mensaje de log con timestamp y nivel
 */
export function formatLogMessage(level, message, args) {
  const timestamp = new Date().toISOString();
  const levelName = LEVEL_NAMES[level];
  const color = COLORS[levelName];
  
  let formattedMessage = `${color}[${timestamp}] [${levelName}]${COLORS.RESET} ${message}`;
  
  if (args.length > 0) {
    const argsStr = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    formattedMessage += ` ${argsStr}`;
  }
  
  return formattedMessage;
}

/**
 * Extrae información de la pila de llamadas
 */
export function extractSourceInfo(stack) {
  if (!stack) return null;

  // Saltar las líneas del propio logger
  const lines = stack.split('\n');
  let callerLine = null;
  
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('UnifiedLogger') || line.includes('at Object.')) {
      continue;
    }
    callerLine = line;
    break;
  }

  if (!callerLine) return null;

  // Parsear la línea del stack
  const match = callerLine.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
  if (!match) return null;

  const [, functionName, fileName, lineNumber, columnNumber] = match;
  const shortPath = fileName.split('/').slice(-2).join('/');

  return {
    fileName,
    shortPath,
    lineNumber,
    columnNumber,
    functionName
  };
}

/**
 * Crea mensaje estructurado
 */
export function createStructuredMessage(message, args) {
  if (args.length === 0) return message;

  const context = args[0];
  if (typeof context === 'object' && context !== null) {
    try {
      return `${message} ${JSON.stringify(context)}`;
    } catch {
      return `${message} ${String(context)}`;
    }
  }

  return formatLogMessage(LOG_LEVELS.INFO, message, args);
}

/**
 * Valida la configuración del logger
 */
export function validateLoggerConfig(config) {
  const validated = { ...config };

  // Validar nivel
  if (typeof config.level === 'string') {
    validated.level = LOG_LEVELS[config.level.toUpperCase()] || LOG_LEVELS.INFO;
  } else if (typeof config.level !== 'number') {
    validated.level = LOG_LEVELS.INFO;
  }

  // Validar memoria
  if (typeof config.maxMemoryMB !== 'number' || config.maxMemoryMB <= 0) {
    validated.maxMemoryMB = 5;
  }

  return validated;
}

/**
 * Crea métricas iniciales
 */
export function createInitialMetrics() {
  return {
    totalLogs: 0,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    debugCount: 0,
    cacheHits: 0,
    cacheMisses: 0
  };
}

/**
 * Crea evaluador lazy
 */
export function createLazyEvaluator(config) {
  const cache = new Map();
  
  const evaluator = {
    evaluate(level, message, args) {
      // Evaluar funciones en el mensaje
      let evaluatedMessage = message;
      if (typeof message === 'function') {
        try {
          evaluatedMessage = message();
        } catch (error) {
          evaluatedMessage = `[Error evaluating message: ${error.message}]`;
        }
      }

      // Evaluar funciones en los argumentos
      const evaluatedArgs = args.map(arg => {
        if (typeof arg === 'function') {
          try {
            return arg();
          } catch (error) {
            return `[Error evaluating arg: ${error.message}]`;
          }
        }
        return arg;
      });

      return {
        shouldLog: true,
        message: evaluatedMessage,
        args: evaluatedArgs
      };
    },

    cleanup() {
      cache.clear();
    }
  };

  return evaluator;
}

/**
 * Crea logger hijo con contexto
 */
export function createChildLogger(parentLogger, context, parentConfig) {
  const config = { ...parentConfig };
  
  return {
    error(message, ...args) {
      const contextualizedMessage = `[${context}] ${message}`;
      parentLogger.error(contextualizedMessage, ...args);
    },

    warn(message, ...args) {
      const contextualizedMessage = `[${context}] ${message}`;
      parentLogger.warn(contextualizedMessage, ...args);
    },

    info(message, ...args) {
      const contextualizedMessage = `[${context}] ${message}`;
      parentLogger.info(contextualizedMessage, ...args);
    },

    debug(message, ...args) {
      const contextualizedMessage = `[${context}] ${message}`;
      parentLogger.debug(contextualizedMessage, ...args);
    },

    child(newContext) {
      return createChildLogger(parentLogger, `${context}.${newContext}`, config);
    }
  };
}