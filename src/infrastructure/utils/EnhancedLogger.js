/**
 * @fileoverview EnhancedLogger - Sistema de logging mejorado con seguimiento de archivos fuente y números de línea.
 * Proporciona trazabilidad completa de los registros para facilitar el debugging y mantenimiento.
 */

/**
 * Logger mejorado que incluye información del archivo fuente y número de línea
 * en todos los registros para mantener un control preciso y detallado.
 */
export class EnhancedLogger {
  #logLevel;
  #enableSourceTracking;

  /**
   * @param {string} logLevel - Nivel de logging (debug, info, warn, error)
   * @param {boolean} enableSourceTracking - Habilitar seguimiento de archivos fuente
   */
  constructor(logLevel = 'info', enableSourceTracking = true) {
    this.#logLevel = logLevel;
    this.#enableSourceTracking = enableSourceTracking;
  }

  /**
   * Obtiene información del archivo fuente y número de línea del llamador
   * @returns {string} Información de ubicación del código fuente
   */
  #getSourceLocation() {
    if (!this.#enableSourceTracking) {
      return '';
    }

    const stack = new Error().stack;
    if (!stack) {
      return '';
    }

    const lines = stack.split('\n');
    // Buscar la línea que no sea del logger (saltamos las primeras 3 líneas del stack)
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (line && !line.includes('EnhancedLogger.js')) {
        const match = line.match(/at\s+(?:.*\s+\()?([^\s]+):(\d+):(\d+)\)?/);
        if (match) {
          const [, filePath, lineNumber] = match;
          // Extraer solo el nombre del archivo y directorio padre para mayor legibilidad
          const pathParts = filePath.replace(/\\/g, '/').split('/');
          const fileName = pathParts.slice(-2).join('/');
          return `[${fileName}:${lineNumber}]`;
        }
      }
    }
    return '';
  }

  /**
   * Formatea el mensaje de log con timestamp y ubicación del código fuente
   * @param {string} level - Nivel del log
   * @param {string} message - Mensaje principal
   * @param {Array} args - Argumentos adicionales
   * @returns {Object} Mensaje formateado y argumentos
   */
  #formatMessage(level, message, args) {
    const timestamp = new Date().toISOString();
    const sourceLocation = this.#getSourceLocation();
    const levelTag = `[${level.toUpperCase()}]`;
    
    const formattedMessage = sourceLocation 
      ? `${levelTag} ${timestamp} ${sourceLocation} - ${message}`
      : `${levelTag} ${timestamp} - ${message}`;

    return { formattedMessage, args };
  }

  /**
   * Verifica si el nivel de log debe ser mostrado
   * @param {string} level - Nivel a verificar
   * @returns {boolean} True si debe mostrarse
   */
  #shouldLog(level) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    return levels[level] <= levels[this.#logLevel];
  }

  /**
   * Log de información
   * @param {string} message - Mensaje a loggear
   * @param {...any} args - Argumentos adicionales
   */
  info(message, ...args) {
    if (this.#shouldLog('info')) {
      const { formattedMessage, args: formattedArgs } = this.#formatMessage('info', message, args);
      console.log(formattedMessage, ...formattedArgs);
    }
  }

  /**
   * Log de advertencia
   * @param {string} message - Mensaje a loggear
   * @param {...any} args - Argumentos adicionales
   */
  warn(message, ...args) {
    if (this.#shouldLog('warn')) {
      const { formattedMessage, args: formattedArgs } = this.#formatMessage('warn', message, args);
      console.warn(formattedMessage, ...formattedArgs);
    }
  }

  /**
   * Log de error
   * @param {string} message - Mensaje a loggear
   * @param {...any} args - Argumentos adicionales
   */
  error(message, ...args) {
    if (this.#shouldLog('error')) {
      const { formattedMessage, args: formattedArgs } = this.#formatMessage('error', message, args);
      console.error(formattedMessage, ...formattedArgs);
    }
  }

  /**
   * Log de debug
   * @param {string} message - Mensaje a loggear
   * @param {...any} args - Argumentos adicionales
   */
  debug(message, ...args) {
    if (this.#shouldLog('debug')) {
      const { formattedMessage, args: formattedArgs } = this.#formatMessage('debug', message, args);
      console.log(formattedMessage, ...formattedArgs);
    }
  }

  /**
   * Cambia el nivel de logging
   * @param {string} level - Nuevo nivel de logging
   */
  setLogLevel(level) {
    this.#logLevel = level;
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
    const originalFormatMessage = childLogger._formatMessage;
    
    childLogger._formatMessage = (level, message, args) => {
      const prefixedMessage = `[${prefix}] ${message}`;
      return originalFormatMessage.call(childLogger, level, prefixedMessage, args);
    };
    
    return childLogger;
  }
}

export default EnhancedLogger;