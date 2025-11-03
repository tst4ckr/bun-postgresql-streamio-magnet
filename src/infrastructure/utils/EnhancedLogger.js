/**
 * @fileoverview EnhancedLogger - Sistema de logging optimizado con lazy evaluation y structured logging.
 * Proporciona trazabilidad completa con mínimo overhead de rendimiento.
 */

/**
 * Logger optimizado con lazy evaluation, structured logging y minimal overhead
 * Implementa mejores prácticas de rendimiento para aplicaciones de alta concurrencia
 */
export class EnhancedLogger {
  #logLevel;
  #enableSourceTracking;
  #logger;
  #logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
  #isProduction = process.env.NODE_ENV === 'production';
  #sourceLocationCache = new Map();
  #minimalOutput = false;
  #errorOnly = false;
  #batchBuffer = [];
  #batchSize = 10;
  #batchTimeout = null;
  #batchDelay = 100; // ms
  #enableBatching = false;
  // Métricas de rendimiento
  #performanceMetrics = {
    logCounts: { error: 0, warn: 0, info: 0, debug: 0 },
    totalLogs: 0,
    startTime: Date.now(),
    lastReset: Date.now(),
    batchProcessed: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  /**
   * @param {string} logLevel - Nivel de logging (debug, info, warn, error)
   * @param {boolean} enableSourceTracking - Habilitar seguimiento de archivos fuente
   */
  constructor(logLevel = 'info', enableSourceTracking = true, productionConfig = {}) {
    this.#logLevel = logLevel;
    this.#logger = console; // Inicializar con console por defecto
    
    // Aplicar configuración específica de producción
    if (this.#isProduction) {
      this.#enableSourceTracking = productionConfig.disableSourceTracking ? false : enableSourceTracking;
      this.#minimalOutput = productionConfig.minimalOutput || false;
      this.#errorOnly = productionConfig.errorOnly || false;
      this.#enableBatching = productionConfig.enableBatching || false;
      this.#batchSize = productionConfig.batchSize || 10;
      this.#batchDelay = productionConfig.batchDelay || 100;
    } else {
      this.#enableSourceTracking = enableSourceTracking;
      this.#minimalOutput = false;
      this.#errorOnly = false;
      this.#enableBatching = false;
    }
  }

  /**
   * Procesa el buffer de logs en batch para mejor rendimiento
   * @private
   */
  #processBatch() {
    if (this.#batchBuffer.length === 0) return;
    
    const batch = [...this.#batchBuffer];
    this.#batchBuffer.length = 0; // Limpiar buffer
    this.#performanceMetrics.batchProcessed++;
    
    // Procesar todos los logs del batch de una vez
    batch.forEach(({ level, formattedMessage, args }) => {
      const logMethod = this.#logger[level] || this.#logger.info;
      logMethod.call(this.#logger, formattedMessage, ...args);
    });
  }

  /**
   * Programa el procesamiento del batch
   * @private
   */
  #scheduleBatchProcessing() {
    if (this.#batchTimeout) return;
    
    this.#batchTimeout = setTimeout(() => {
      this.#processBatch();
      this.#batchTimeout = null;
    }, this.#batchDelay);
  }

  /**
   * Agrega un log al batch o lo procesa inmediatamente
   * @private
   */
  #addToBatch(level, formattedMessage, args) {
    // Para errores críticos, procesar inmediatamente
    if (level === 'error') {
      const logMethod = this.#logger[level] || this.#logger.info;
      logMethod.call(this.#logger, formattedMessage, ...args);
      return;
    }
    
    this.#batchBuffer.push({ level, formattedMessage, args });
    
    // Si el buffer está lleno, procesar inmediatamente
    if (this.#batchBuffer.length >= this.#batchSize) {
      this.#processBatch();
      if (this.#batchTimeout) {
        clearTimeout(this.#batchTimeout);
        this.#batchTimeout = null;
      }
    } else {
      this.#scheduleBatchProcessing();
    }
  }

  /**
   * Obtiene información del archivo fuente y número de línea del llamador con cache optimizado
   * @returns {string} Información de ubicación del código fuente
   */
  #getSourceLocation() {
    if (!this.#enableSourceTracking) {
      return '';
    }

    // Usar Error.prepareStackTrace para mejor rendimiento en V8
    const originalPrepareStackTrace = Error.prepareStackTrace;
    let callSite;
    
    try {
      Error.prepareStackTrace = (_, stack) => stack;
      const stack = new Error().stack;
      
      // Encontrar el primer frame que no sea del logger
      for (let i = 2; i < stack.length; i++) {
        const frame = stack[i];
        const fileName = frame.getFileName();
        if (fileName && !fileName.includes('EnhancedLogger.js')) {
          callSite = frame;
          break;
        }
      }
    } finally {
      Error.prepareStackTrace = originalPrepareStackTrace;
    }

    if (!callSite) return '';

    const fileName = callSite.getFileName();
    const lineNumber = callSite.getLineNumber();
    const cacheKey = `${fileName}:${lineNumber}`;
    
    // Cache del formato de ubicación para evitar procesamiento repetido
    if (this.#sourceLocationCache.has(cacheKey)) {
      this.#performanceMetrics.cacheHits++;
      return this.#sourceLocationCache.get(cacheKey);
    }

    this.#performanceMetrics.cacheMisses++;
    const pathParts = fileName.replace(/\\/g, '/').split('/');
    const shortPath = pathParts.slice(-2).join('/');
    const location = `[${shortPath}:${lineNumber}]`;
    
    // Limitar cache a 100 entradas para evitar memory leaks
    if (this.#sourceLocationCache.size >= 100) {
      const firstKey = this.#sourceLocationCache.keys().next().value;
      this.#sourceLocationCache.delete(firstKey);
    }
    
    this.#sourceLocationCache.set(cacheKey, location);
    return location;
  }

  /**
   * Formatea el mensaje de log con lazy evaluation y structured logging
   * @param {string} level - Nivel del log
   * @param {string|Function} message - Mensaje principal o función que lo genera
   * @param {Array} args - Argumentos adicionales
   * @returns {Object} Mensaje formateado y argumentos
   */
  /**
   * Formatea el mensaje de log con optimizaciones de rendimiento
   * @private
   */
  #formatMessage(level, message, args) {
    // Lazy evaluation: solo evaluar el mensaje si es necesario
    let actualMessage;
    if (typeof message === 'function') {
      try {
        actualMessage = message();
      } catch (error) {
        // Manejar graciosamente errores en funciones de mensaje
        actualMessage = `[Error evaluating message function: ${error.message}]`;
      }
    } else {
      actualMessage = message;
    }
    
    // En producción con salida mínima, usar formato ultra-compacto
    if (this.#isProduction && this.#minimalOutput) {
      const levelTag = level.charAt(0).toUpperCase(); // Solo primera letra
      return {
        formattedMessage: `${levelTag}: ${actualMessage}`,
        args
      };
    }
    
    // En producción estándar, usar formato simple con timestamp optimizado
    if (this.#isProduction) {
      // Usar Date.now() es más rápido que new Date().toISOString()
      const timestamp = new Date(Date.now()).toISOString();
      const levelTag = `[${level.toUpperCase()}]`;
      return {
        formattedMessage: `${levelTag} ${timestamp} - ${actualMessage}`,
        args
      };
    }
    
    // En desarrollo, incluir información completa con source tracking condicional
    const timestamp = new Date(Date.now()).toISOString();
    const levelTag = `[${level.toUpperCase()}]`;
    
    let formattedMessage;
    if (this.#enableSourceTracking) {
      const sourceLocation = this.#getSourceLocation();
      formattedMessage = sourceLocation 
        ? `${levelTag} ${timestamp} ${sourceLocation} - ${actualMessage}`
        : `${levelTag} ${timestamp} - ${actualMessage}`;
    } else {
      formattedMessage = `${levelTag} ${timestamp} - ${actualMessage}`;
    }

    return { formattedMessage, args };
  }

  /**
   * Verifica si el nivel de log debe ser mostrado (optimizado)
   * @param {string} level - Nivel a verificar
   * @returns {boolean} True si debe mostrarse
   */
  #shouldLog(level) {
    return this.#logLevels[level] <= this.#logLevels[this.#logLevel];
  }

  /**
   * Método genérico de logging con lazy evaluation y batching optimizado
   * @private
   */
  #logGeneric(level, message, ...args) {
    // Aplicar filtros de producción (early return para máximo rendimiento)
    if (this.#isProduction) {
      if (level === 'debug') return;
      if (this.#errorOnly && ['info', 'warn'].includes(level)) return;
    }
    
    // Verificación rápida de nivel
    if (!this.#shouldLog(level)) return;
    
    // Actualizar métricas de rendimiento
    this.#performanceMetrics.logCounts[level]++;
    this.#performanceMetrics.totalLogs++;
    
    const { formattedMessage, args: formattedArgs } = this.#formatMessage(level, message, args);
    
    // Usar batching en producción para mejor rendimiento
    if (this.#isProduction && this.#enableBatching) {
      this.#addToBatch(level, formattedMessage, formattedArgs);
    } else {
      // Procesamiento inmediato en desarrollo o cuando batching está deshabilitado
      const logMethod = this.#logger[level] || this.#logger.info;
      logMethod.call(this.#logger, formattedMessage, ...formattedArgs);
    }
  }

  /**
   * Log de información con lazy evaluation
   * @param {string|Function} message - Mensaje a loggear o función que lo genera
   * @param {...any} args - Argumentos adicionales
   */
  info(message, ...args) {
    this.#logGeneric('info', message, ...args);
  }

  /**
   * Log de advertencia con lazy evaluation
   * @param {string|Function} message - Mensaje a loggear o función que lo genera
   * @param {...any} args - Argumentos adicionales
   */
  warn(message, ...args) {
    this.#logGeneric('warn', message, ...args);
  }

  /**
   * Log de error con lazy evaluation
   * @param {string|Function} message - Mensaje a loggear o función que lo genera
   * @param {...any} args - Argumentos adicionales
   */
  error(message, ...args) {
    this.#logGeneric('error', message, ...args);
  }

  /**
   * Log de debug con lazy evaluation
   * @param {string|Function} message - Mensaje a loggear o función que lo genera
   * @param {...any} args - Argumentos adicionales
   */
  debug(message, ...args) {
    this.#logGeneric('debug', message, ...args);
  }

  /**
   * Cambia el nivel de logging
   * @param {string} level - Nuevo nivel de logging
   */
  setLogLevel(level) {
    // Validar que el nivel sea válido, si no, usar 'info' por defecto
    if (this.#logLevels.hasOwnProperty(level)) {
      this.#logLevel = level;
    } else {
      this.#logLevel = 'info'; // Fallback a nivel seguro
    }
  }

  /**
   * Obtiene el nivel de logging actual
   * @returns {string} Nivel actual
   */
  getLogLevel() {
    return this.#logLevel;
  }

  /**
   * Habilita o deshabilita el seguimiento de archivos fuente
   * @param {boolean} enabled - True para habilitar
   */
  setSourceTracking(enabled) {
    this.#enableSourceTracking = enabled;
  }

  /**
   * Crea un logger hijo con el mismo contexto pero prefijo personalizado
   * @param {string} prefix - Prefijo para el logger hijo
   * @returns {EnhancedLogger} Nueva instancia con prefijo
   */
  createChild(prefix) {
    const childLogger = new EnhancedLogger(this.#logLevel, this.#enableSourceTracking);
    
    // Sobrescribir métodos de logging para incluir prefijo
    const originalInfo = childLogger.info.bind(childLogger);
    const originalWarn = childLogger.warn.bind(childLogger);
    const originalError = childLogger.error.bind(childLogger);
    const originalDebug = childLogger.debug.bind(childLogger);
    
    childLogger.info = (message, ...args) => {
      const prefixedMessage = typeof message === 'function' 
        ? () => `[${prefix}] ${message()}`
        : `[${prefix}] ${message}`;
      return originalInfo(prefixedMessage, ...args);
    };
    
    childLogger.warn = (message, ...args) => {
      const prefixedMessage = typeof message === 'function' 
        ? () => `[${prefix}] ${message()}`
        : `[${prefix}] ${message}`;
      return originalWarn(prefixedMessage, ...args);
    };
    
    childLogger.error = (message, ...args) => {
      const prefixedMessage = typeof message === 'function' 
        ? () => `[${prefix}] ${message()}`
        : `[${prefix}] ${message}`;
      return originalError(prefixedMessage, ...args);
    };
    
    childLogger.debug = (message, ...args) => {
      const prefixedMessage = typeof message === 'function' 
        ? () => `[${prefix}] ${message()}`
        : `[${prefix}] ${message}`;
      return originalDebug(prefixedMessage, ...args);
    };
    
    return childLogger;
  }

  /**
   * Log estructurado con metadatos adicionales
   * @param {string} level - Nivel del log
   * @param {string|Function} message - Mensaje principal
   * @param {Object} metadata - Metadatos estructurados
   */
  structured(level, message, metadata = {}) {
    if (this.#shouldLog(level)) {
      const { formattedMessage, args: formattedArgs } = this.#formatMessage(level, message, []);
      const structuredData = {
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        message: typeof message === 'function' ? message() : message,
        ...metadata
      };
      
      if (this.#isProduction) {
        // En producción, usar JSON compacto
        this.#logger.info(JSON.stringify(structuredData));
      } else {
        // En desarrollo, usar formato compacto en una línea
        const metadataStr = Object.entries(metadata)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(' ');
        this.#logger.info(`${formattedMessage} | ${metadataStr}`);
      }
    }
  }

  /**
   * Log con transaction ID para correlación de requests
   * @param {string} level - Nivel del log
   * @param {string} transactionId - ID de transacción
   * @param {string|Function} message - Mensaje principal
   * @param {...any} args - Argumentos adicionales
   */
  withTransaction(level, transactionId, message, ...args) {
    if (this.#shouldLog(level)) {
      const prefixedMessage = typeof message === 'function' 
        ? () => `[TXN:${transactionId}] ${message()}`
        : `[TXN:${transactionId}] ${message}`;
      
      const { formattedMessage, args: formattedArgs } = this.#formatMessage(level, prefixedMessage, args);
      this.#logger[level] ? this.#logger[level](formattedMessage, ...formattedArgs) : 
                           this.#logger.info(formattedMessage, ...formattedArgs);
    }
  }

  /**
   * Método universal de logging con componente y datos opcionales
   * Reemplaza los métodos #logger personalizados de los servicios
   * @param {string} level - Nivel del log
   * @param {string|Function} message - Mensaje principal
   * @param {Object} options - Opciones adicionales
   * @param {string} options.component - Componente que genera el log
   * @param {Object} options.data - Datos adicionales para contexto estructurado
   * @param {string} options.transactionId - ID de transacción para correlación
   * @param {...any} args - Argumentos adicionales
   */
  log(level, message, options = {}, ...args) {
    const { component, data, transactionId } = options;
    
    // Si hay transactionId, usar withTransaction
    if (transactionId) {
      return this.withTransaction(level, transactionId, message, ...args);
    }
    
    // Si hay datos estructurados, usar structured
    if (data && Object.keys(data).length > 0) {
      const metadata = component ? { component, ...data } : data;
      return this.structured(level, message, metadata);
    }
    
    // Si hay componente, crear mensaje con prefijo
    if (component) {
      const componentMessage = typeof message === 'function'
        ? () => `[${component}] ${message()}`
        : `[${component}] ${message}`;
      
      if (this.#shouldLog(level)) {
        const { formattedMessage, args: formattedArgs } = this.#formatMessage(level, componentMessage, args);
        this.#logger[level] ? this.#logger[level](formattedMessage, ...formattedArgs) : 
                             this.#logger.info(formattedMessage, ...formattedArgs);
      }
      return;
    }
    
    // Logging estándar por nivel
    this[level](message, ...args);
  }

  /**
   * Método de conveniencia para logging con componente
   * @param {string} component - Componente que genera el log
   * @param {string} level - Nivel del log
   * @param {string|Function} message - Mensaje principal
   * @param {Object} data - Datos adicionales opcionales
   * @param {...any} args - Argumentos adicionales
   */
  logWithComponent(component, level, message, data = null, ...args) {
    this.log(level, message, { component, data }, ...args);
  }

  /**
   * Log de operación completada con métricas
   * @param {string} operation - Nombre de la operación
   * @param {number} duration - Duración en milisegundos
   * @param {Object} metrics - Métricas adicionales
   */
  operationComplete(operation, duration, metrics = {}) {
    this.info(`${operation} completada en ${duration}ms`, metrics);
  }

  /**
   * Log de validación fallida
   * @param {string} entity - Entidad que falló la validación
   * @param {string} reason - Razón de la falla
   * @param {Object} context - Contexto adicional
   */
  validationFailed(entity, reason, context = {}) {
    this.warn(`Validación falló para ${entity}: ${reason}`, context);
  }

  /**
   * Log de recurso no encontrado
   * @param {string} resourceType - Tipo de recurso
   * @param {string} identifier - Identificador del recurso
   * @param {Object} context - Contexto adicional
   */
  resourceNotFound(resourceType, identifier, context = {}) {
    this.warn(`No se encontró ${resourceType}: ${identifier}`, context);
  }

  /**
   * Log de configuración aplicada
   * @param {string} configType - Tipo de configuración
   * @param {string|Object} value - Valor de la configuración
   */
  configurationApplied(configType, value) {
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
    this.info(`${configType} configurado a: ${valueStr}`);
  }

  /**
   * Log de resultado de búsqueda
   * @param {string} searchType - Tipo de búsqueda
   * @param {string} query - Consulta de búsqueda
   * @param {number} resultCount - Número de resultados
   * @param {Object} details - Detalles adicionales
   */
  searchResults(searchType, query, resultCount, details = {}) {
    this.info(`Encontrados ${resultCount} resultados ${searchType} para ${query}`, details);
  }

  /**
   * Log de recurso descartado
   * @param {string} resourceType - Tipo de recurso
   * @param {string} reason - Razón del descarte
   * @param {Object} details - Detalles del recurso
   */
  resourceDiscarded(resourceType, reason, details = {}) {
    this.debug(`${resourceType} descartado: ${reason}`, details);
  }

  /**
   * Log de error en procesamiento
   * @param {string} operation - Operación que falló
   * @param {Error} error - Error ocurrido
   * @param {Object} context - Contexto adicional
   */
  processingError(operation, error, context = {}) {
    this.error(`Error en ${operation}:`, error, context);
  }

  /**
   * Log de selección realizada
   * @param {string} selectionType - Tipo de selección
   * @param {string} selectedItem - Item seleccionado
   * @param {Object} criteria - Criterios de selección
   */
  selectionMade(selectionType, selectedItem, criteria = {}) {
    this.info(`${selectionType} seleccionado: ${selectedItem}`, criteria);
  }

  /**
   * Log de advertencia por condición no óptima
   * @param {string} condition - Condición detectada
   * @param {string} impact - Impacto de la condición
   * @param {Object} details - Detalles adicionales
   */
  nonOptimalCondition(condition, impact, details = {}) {
    this.warn(`Condición no óptima - ${condition}: ${impact}`, details);
  }

  /**
   * Log de recurso creado o modificado
   * @param {string} resourceType - Tipo de recurso
   * @param {string} action - Acción realizada (creado, modificado, etc)
   * @param {Object} details - Detalles del recurso
   */
  resourceChanged(resourceType, action, details = {}) {
    this.info(`${resourceType} ${action}`, details);
  }

  /**
   * Log de estado de configuración
   * @param {string} configType - Tipo de configuración
   * @param {boolean} isValid - Si la configuración es válida
   * @param {Object} details - Detalles de validación
   */
  configurationStatus(configType, isValid, details = {}) {
    const status = isValid ? 'válida' : 'inválida';
    const level = isValid ? 'info' : 'warn';
    this[level](`${configType} ${status}`, details);
  }

  /**
   * Fuerza el procesamiento inmediato del batch pendiente
   * Útil para asegurar que todos los logs se escriban antes del cierre
   */
  flush() {
    if (this.#batchBuffer.length > 0) {
      this.#processBatch();
    }
    if (this.#batchTimeout) {
      clearTimeout(this.#batchTimeout);
      this.#batchTimeout = null;
    }
  }

  /**
   * Limpia recursos y procesa logs pendientes
   * Debe llamarse al finalizar la aplicación
   */
  destroy() {
    this.flush();
    this.#sourceLocationCache.clear();
    this.#batchBuffer = [];
    if (this.#batchTimeout) {
      clearTimeout(this.#batchTimeout);
      this.#batchTimeout = null;
    }
  }

  /**
   * Obtiene métricas de rendimiento del logger
   * @returns {Object} Métricas de rendimiento
   */
  getPerformanceMetrics() {
    const now = Date.now();
    const uptime = now - this.#performanceMetrics.startTime;
    const timeSinceReset = now - this.#performanceMetrics.lastReset;
    
    return {
      ...this.#performanceMetrics,
      uptime,
      timeSinceReset,
      logsPerSecond: this.#performanceMetrics.totalLogs / (uptime / 1000),
      cacheHitRate: this.#performanceMetrics.cacheHits / 
        (this.#performanceMetrics.cacheHits + this.#performanceMetrics.cacheMisses) || 0,
      averageBatchSize: this.#performanceMetrics.batchProcessed > 0 
        ? this.#performanceMetrics.totalLogs / this.#performanceMetrics.batchProcessed 
        : 0
    };
  }

  /**
   * Resetea las métricas de rendimiento
   */
  resetPerformanceMetrics() {
    this.#performanceMetrics = {
      logCounts: { error: 0, warn: 0, info: 0, debug: 0 },
      totalLogs: 0,
      startTime: Date.now(),
      lastReset: Date.now(),
      batchProcessed: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

}

export default EnhancedLogger;