/**
 * @fileoverview ErrorHandler - Sistema centralizado de manejo de errores
 * Implementa estrategias de recuperación, logging estructurado y respuestas consistentes
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';

/**
 * Tipos de errores clasificados por severidad y estrategia de recuperación
 */
export const ERROR_TYPES = {
  VALIDATION: 'VALIDATION_ERROR',
  NETWORK: 'NETWORK_ERROR',
  REPOSITORY: 'REPOSITORY_ERROR',
  CACHE: 'CACHE_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_ERROR',
  AUTHENTICATION: 'AUTH_ERROR',
  CONFIGURATION: 'CONFIG_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

/**
 * Estrategias de recuperación para diferentes tipos de errores
 */
export const RECOVERY_STRATEGIES = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  CACHE_FALLBACK: 'cache_fallback',
  GRACEFUL_DEGRADATION: 'graceful_degradation',
  FAIL_FAST: 'fail_fast'
};

/**
 * Error personalizado con contexto enriquecido
 */
export class EnhancedError extends Error {
  constructor(message, type = ERROR_TYPES.UNKNOWN, context = {}, originalError = null) {
    super(message);
    this.name = 'EnhancedError';
    this.type = type;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
    this.recoverable = this.#determineRecoverability(type);
    this.strategy = this.#determineStrategy(type);
    
    // Preservar stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EnhancedError);
    }
  }

  /**
   * Determina si el error es recuperable
   * @private
   */
  #determineRecoverability(type) {
    const recoverableTypes = [
      ERROR_TYPES.NETWORK,
      ERROR_TYPES.TIMEOUT,
      ERROR_TYPES.RATE_LIMIT,
      ERROR_TYPES.CACHE
    ];
    return recoverableTypes.includes(type);
  }

  /**
   * Determina la estrategia de recuperación
   * @private
   */
  #determineStrategy(type) {
    const strategyMap = {
      [ERROR_TYPES.NETWORK]: RECOVERY_STRATEGIES.RETRY,
      [ERROR_TYPES.TIMEOUT]: RECOVERY_STRATEGIES.RETRY,
      [ERROR_TYPES.RATE_LIMIT]: RECOVERY_STRATEGIES.RETRY,
      [ERROR_TYPES.REPOSITORY]: RECOVERY_STRATEGIES.FALLBACK,
      [ERROR_TYPES.CACHE]: RECOVERY_STRATEGIES.GRACEFUL_DEGRADATION,
      [ERROR_TYPES.VALIDATION]: RECOVERY_STRATEGIES.FAIL_FAST,
      [ERROR_TYPES.AUTHENTICATION]: RECOVERY_STRATEGIES.FAIL_FAST,
      [ERROR_TYPES.CONFIGURATION]: RECOVERY_STRATEGIES.FAIL_FAST
    };
    return strategyMap[type] || RECOVERY_STRATEGIES.GRACEFUL_DEGRADATION;
  }

  /**
   * Serializa el error para logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      context: this.context,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      strategy: this.strategy,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : null
    };
  }
}

/**
 * Manejador centralizado de errores con estrategias de recuperación
 */
export class ErrorHandler {
  #logger;
  #retryConfig;
  #circuitBreaker;

  constructor(logger = null, retryConfig = {}) {
    this.#logger = logger || new EnhancedLogger('error', true);
    this.#retryConfig = {
      maxRetries: retryConfig.maxRetries || 3,
      baseDelay: retryConfig.baseDelay || 1000,
      maxDelay: retryConfig.maxDelay || 10000,
      backoffMultiplier: retryConfig.backoffMultiplier || 2
    };
    this.#circuitBreaker = new Map(); // Simple circuit breaker por operación
  }

  /**
   * Maneja un error con estrategia de recuperación automática
   * @param {Error|EnhancedError} error - Error a manejar
   * @param {Object} context - Contexto adicional
   * @param {Function} operation - Operación a reintentar (opcional)
   * @returns {Promise<any>} Resultado de la recuperación o error final
   */
  async handleError(error, context = {}, operation = null) {
    const enhancedError = this.#enhanceError(error, context);
    
    // Log del error
    this.#logError(enhancedError);
    
    // Aplicar estrategia de recuperación
    return await this.#applyRecoveryStrategy(enhancedError, operation, context);
  }

  /**
   * Convierte un error estándar en EnhancedError
   * @private
   */
  #enhanceError(error, context) {
    if (error instanceof EnhancedError) {
      return error;
    }

    const errorType = this.#classifyError(error);
    return new EnhancedError(
      error.message,
      errorType,
      { ...context, originalName: error.name, originalCode: error.code },
      error
    );
  }

  /**
   * Clasifica el error según su tipo
   * @private
   */
  #classifyError(error) {
    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';
    const code = error.code || '';

    // Errores de red
    if (name.includes('fetch') || message.includes('network') || 
        message.includes('econnrefused') || message.includes('enotfound') ||
        code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
      return ERROR_TYPES.NETWORK;
    }

    // Errores de timeout
    if (message.includes('timeout') || name.includes('timeout') || 
        code === 'ETIMEDOUT' || error.name === 'AbortError') {
      return ERROR_TYPES.TIMEOUT;
    }

    // Errores de validación
    if (message.includes('validation') || message.includes('invalid') ||
        name.includes('validation')) {
      return ERROR_TYPES.VALIDATION;
    }

    // Errores de repositorio
    if (message.includes('repository') || message.includes('not found') ||
        name.includes('repository') || name.includes('notfound')) {
      return ERROR_TYPES.REPOSITORY;
    }

    // Errores de cache
    if (message.includes('cache') || name.includes('cache')) {
      return ERROR_TYPES.CACHE;
    }

    // Errores de rate limiting
    if (message.includes('rate limit') || message.includes('too many requests') ||
        code === '429') {
      return ERROR_TYPES.RATE_LIMIT;
    }

    // Errores de autenticación
    if (message.includes('unauthorized') || message.includes('forbidden') ||
        code === '401' || code === '403') {
      return ERROR_TYPES.AUTHENTICATION;
    }

    return ERROR_TYPES.UNKNOWN;
  }

  /**
   * Aplica la estrategia de recuperación apropiada
   * @private
   */
  async #applyRecoveryStrategy(error, operation, context = {}) {
    const operationKey = operation?.name || 'unknown';
    
    switch (error.strategy) {
      case RECOVERY_STRATEGIES.RETRY:
        if (operation && this.#shouldRetry(operationKey)) {
          return await this.#retryWithBackoff(operation, error.context);
        }
        break;
        
      case RECOVERY_STRATEGIES.FALLBACK:
      case RECOVERY_STRATEGIES.CACHE_FALLBACK:
      case RECOVERY_STRATEGIES.GRACEFUL_DEGRADATION:
        return this.#applyFallbackStrategy(error, error.strategy, context);
        
      case RECOVERY_STRATEGIES.FAIL_FAST:
      default:
        throw error;
    }
    
    throw error;
  }

  /**
   * Implementa retry con backoff exponencial
   * @private
   */
  async #retryWithBackoff(operation, context = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.#retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Reset circuit breaker en caso de éxito
        this.#circuitBreaker.delete(operation.name);
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt === this.#retryConfig.maxRetries) {
          break;
        }
        
        const delay = Math.min(
          this.#retryConfig.baseDelay * Math.pow(this.#retryConfig.backoffMultiplier, attempt - 1),
          this.#retryConfig.maxDelay
        );
        
        this.#logger.warn(`Reintento ${attempt}/${this.#retryConfig.maxRetries} en ${delay}ms`, {
          operation: operation.name,
          error: error.message,
          context
        });
        
        await this.#sleep(delay);
      }
    }
    
    // Marcar operación como fallida en circuit breaker
    this.#circuitBreaker.set(operation.name, Date.now());
    
    throw new EnhancedError(
      `Operación falló después de ${this.#retryConfig.maxRetries} intentos`,
      ERROR_TYPES.UNKNOWN,
      { originalError: lastError.message, operation: operation.name },
      lastError
    );
  }

  /**
   * Verifica si se debe reintentar una operación (circuit breaker simple)
   * @private
   */
  #shouldRetry(operationKey) {
    const failureTime = this.#circuitBreaker.get(operationKey);
    if (!failureTime) return true;
    
    // Permitir reintentos después de 5 minutos
    const cooldownPeriod = 5 * 60 * 1000; // 5 minutos
    return (Date.now() - failureTime) > cooldownPeriod;
  }

  /**
   * Implementa estrategias de fallback unificadas
   * @private
   */
  #applyFallbackStrategy(error, strategy, context = {}) {
    const fallbackConfigs = {
      [RECOVERY_STRATEGIES.FALLBACK]: {
        logLevel: 'warn',
        message: 'Aplicando fallback graceful',
        response: {
          streams: [],
          cacheMaxAge: 300,
          error: 'Servicio temporalmente no disponible'
        }
      },
      [RECOVERY_STRATEGIES.CACHE_FALLBACK]: {
        logLevel: 'warn',
        message: 'Aplicando fallback a cache',
        response: {
          streams: [],
          cacheMaxAge: 60,
          fromCache: true,
          warning: 'Datos desde cache debido a error temporal'
        }
      },
      [RECOVERY_STRATEGIES.GRACEFUL_DEGRADATION]: {
        logLevel: 'info',
        message: 'Aplicando degradación graceful',
        response: {
          streams: [],
          cacheMaxAge: 60,
          degraded: true,
          message: 'Servicio funcionando con capacidad reducida'
        }
      }
    };

    const config = fallbackConfigs[strategy];
    if (!config) {
      throw new Error(`Estrategia de fallback no soportada: ${strategy}`);
    }

    this.#logger[config.logLevel](config.message, { error: error.message });
    // Si existe un fallbackResponse específico en el contexto, usarlo para respetar la forma esperada del recurso (meta/catalog/stream)
    if (context && context.fallbackResponse) {
      return context.fallbackResponse;
    }
    return config.response;
  }

  /**
   * Log estructurado del error
   * @private
   */
  #logError(error) {
    const logData = {
      errorType: error.type,
      recoverable: error.recoverable,
      strategy: error.strategy,
      context: error.context,
      timestamp: error.timestamp
    };

    if (error.recoverable) {
      this.#logger.warn(`Error recuperable: ${error.message}`, logData);
    } else {
      this.#logger.error(`Error crítico: ${error.message}`, logData);
    }
  }

  /**
   * Utilidad para sleep
   * @private
   */
  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtiene estadísticas del manejador de errores
   * @returns {Object} Estadísticas de errores y circuit breaker
   */
  getStats() {
    return {
      circuitBreakerEntries: this.#circuitBreaker.size,
      retryConfig: this.#retryConfig,
      failedOperations: Array.from(this.#circuitBreaker.keys())
    };
  }

  /**
   * Resetea el circuit breaker para una operación específica
   * @param {string} operationKey - Clave de la operación
   */
  resetCircuitBreaker(operationKey) {
    this.#circuitBreaker.delete(operationKey);
    this.#logger.info(`Circuit breaker reseteado para: ${operationKey}`);
  }

  /**
   * Resetea todos los circuit breakers
   */
  resetAllCircuitBreakers() {
    this.#circuitBreaker.clear();
    this.#logger.info('Todos los circuit breakers han sido reseteados');
  }
}

// Instancia singleton
export const errorHandler = new ErrorHandler();

/**
 * Decorador para manejo automático de errores en métodos
 * @param {Object} options - Opciones de configuración
 * @returns {Function} Decorador
 */
export function withErrorHandling(options = {}) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const context = {
          className: target.constructor.name,
          methodName: propertyKey,
          arguments: options.logArgs ? args : '[hidden]'
        };
        
        return await errorHandler.handleError(error, context, {
          name: `${target.constructor.name}.${propertyKey}`,
          operation: () => originalMethod.apply(this, args)
        });
      }
    };
    
    return descriptor;
  };
}

/**
 * Función helper para crear errores tipados
 * @param {string} message - Mensaje del error
 * @param {string} type - Tipo del error
 * @param {Object} context - Contexto adicional
 * @returns {EnhancedError}
 */
export function createError(message, type = ERROR_TYPES.UNKNOWN, context = {}) {
  return new EnhancedError(message, type, context);
}

/**
 * Función helper para manejo de errores en operaciones async
 * @param {Function} operation - Operación a ejecutar
 * @param {Object} context - Contexto del error
 * @returns {Promise<any>}
 */
export async function safeExecute(operation, context = {}) {
  try {
    return await operation();
  } catch (error) {
    try {
      return await errorHandler.handleError(error, context, operation);
    } catch (finalError) {
      // En caso de estrategia FAIL_FAST u otra que lance, devolver fallbackResponse si fue proporcionado para mantener estabilidad del addon.
      if (context && context.fallbackResponse) {
        return context.fallbackResponse;
      }
      throw finalError;
    }
  }
}