/**
 * Servicio de Logging Optimizado
 * 
 * Características:
 * - Niveles de logging configurables (SILENT, ERROR, WARN, INFO, DEBUG)
 * - Throttling automático para evitar spam de logs
 * - Batching de logs para reducir I/O
 * - Formateo eficiente con lazy evaluation
 * - Control de rendimiento con métricas
 */

export class OptimizedLoggerService {
    // Niveles de logging (menor número = mayor prioridad)
    static LEVELS = {
        SILENT: 0,
        ERROR: 1,
        WARN: 2,
        INFO: 3,
        DEBUG: 4
    };

    static LEVEL_NAMES = {
        0: 'SILENT',
        1: 'ERROR', 
        2: 'WARN',
        3: 'INFO',
        4: 'DEBUG'
    };

    constructor(config = {}) {
        // Configuración del logger
        this.#config = {
            level: config.level || this.#getEnvironmentLevel(),
            enableBatching: config.enableBatching ?? true,
            batchSize: config.batchSize || 10,
            batchTimeout: config.batchTimeout || 100, // ms
            enableThrottling: config.enableThrottling ?? true,
            throttleWindow: config.throttleWindow || 1000, // ms
            maxLogsPerWindow: config.maxLogsPerWindow || 50,
            enablePerformanceMetrics: config.enablePerformanceMetrics ?? false,
            ...config
        };

        // Estado interno
        this.#logBatch = [];
        this.#batchTimer = null;
        this.#throttleMap = new Map(); // Para tracking de throttling
        this.#metrics = {
            totalLogs: 0,
            throttledLogs: 0,
            batchedLogs: 0,
            startTime: Date.now()
        };

        // Bind methods para uso como callbacks
        this.error = this.error.bind(this);
        this.warn = this.warn.bind(this);
        this.info = this.info.bind(this);
        this.debug = this.debug.bind(this);
    }

    #config;
    #logBatch;
    #batchTimer;
    #throttleMap;
    #metrics;

    /**
     * Determina el nivel de logging basado en el entorno
     */
    #getEnvironmentLevel() {
        const env = process.env.NODE_ENV?.toLowerCase();
        const logLevel = process.env.LOG_LEVEL?.toUpperCase();
        
        if (logLevel && OptimizedLoggerService.LEVELS[logLevel] !== undefined) {
            return OptimizedLoggerService.LEVELS[logLevel];
        }

        // Niveles por defecto según entorno
        switch (env) {
            case 'production':
                return OptimizedLoggerService.LEVELS.WARN;
            case 'test':
                return OptimizedLoggerService.LEVELS.SILENT;
            case 'development':
            default:
                return OptimizedLoggerService.LEVELS.INFO;
        }
    }

    /**
     * Verifica si un nivel de log debe ser procesado
     */
    #shouldLog(level) {
        return level <= this.#config.level;
    }

    /**
     * Genera una clave única para throttling
     */
    #getThrottleKey(level, message) {
        // Usar hash simple del mensaje para agrupar logs similares
        const messageHash = this.#simpleHash(message);
        return `${level}:${messageHash}`;
    }

    /**
     * Hash simple para agrupar mensajes similares
     */
    #simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < Math.min(str.length, 50); i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Verifica throttling para evitar spam de logs
     */
    #checkThrottle(throttleKey) {
        if (!this.#config.enableThrottling) {
            return false;
        }

        const now = Date.now();
        const windowStart = now - this.#config.throttleWindow;
        
        // Limpiar entradas antiguas
        for (const [key, timestamps] of this.#throttleMap.entries()) {
            const validTimestamps = timestamps.filter(t => t > windowStart);
            if (validTimestamps.length === 0) {
                this.#throttleMap.delete(key);
            } else {
                this.#throttleMap.set(key, validTimestamps);
            }
        }

        // Verificar límite para esta clave
        const timestamps = this.#throttleMap.get(throttleKey) || [];
        const recentLogs = timestamps.filter(t => t > windowStart);
        
        if (recentLogs.length >= this.#config.maxLogsPerWindow) {
            this.#metrics.throttledLogs++;
            return true; // Throttled
        }

        // Agregar timestamp actual
        recentLogs.push(now);
        this.#throttleMap.set(throttleKey, recentLogs);
        return false;
    }

    /**
     * Formatea el mensaje de log de manera eficiente
     */
    #formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
        const levelName = OptimizedLoggerService.LEVEL_NAMES[level];
        
        // Formateo lazy - solo si realmente se va a loggear
        let formattedMessage = message;
        if (args.length > 0) {
            // Formateo eficiente de argumentos
            formattedMessage = this.#formatArgs(message, args);
        }

        return `[${timestamp}] ${levelName}: ${formattedMessage}`;
    }

    /**
     * Formateo eficiente de argumentos
     */
    #formatArgs(message, args) {
        try {
            // Si el mensaje tiene placeholders %s, %d, etc., usar formateo simple
            if (message.includes('%')) {
                return message.replace(/%[sdj%]/g, (match) => {
                    if (args.length === 0) return match;
                    const arg = args.shift();
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
     * Procesa un log (con batching opcional)
     */
    #processLog(level, formattedMessage) {
        this.#metrics.totalLogs++;

        if (this.#config.enableBatching) {
            this.#addToBatch(level, formattedMessage);
        } else {
            this.#writeLog(level, formattedMessage);
        }
    }

    /**
     * Agrega log al batch
     */
    #addToBatch(level, formattedMessage) {
        this.#logBatch.push({ level, message: formattedMessage });
        this.#metrics.batchedLogs++;

        // Flush si el batch está lleno
        if (this.#logBatch.length >= this.#config.batchSize) {
            this.#flushBatch();
        } else if (!this.#batchTimer) {
            // Configurar timer para flush automático
            this.#batchTimer = setTimeout(() => {
                this.#flushBatch();
            }, this.#config.batchTimeout);
        }
    }

    /**
     * Flush del batch de logs
     */
    #flushBatch() {
        if (this.#logBatch.length === 0) return;

        const batch = [...this.#logBatch];
        this.#logBatch = [];
        
        if (this.#batchTimer) {
            clearTimeout(this.#batchTimer);
            this.#batchTimer = null;
        }

        // Escribir todos los logs del batch
        for (const { level, message } of batch) {
            this.#writeLog(level, message);
        }
    }

    /**
     * Escribe el log a la consola
     */
    #writeLog(level, formattedMessage) {
        switch (level) {
            case OptimizedLoggerService.LEVELS.ERROR:
                console.error(formattedMessage);
                break;
            case OptimizedLoggerService.LEVELS.WARN:
                console.warn(formattedMessage);
                break;
            case OptimizedLoggerService.LEVELS.INFO:
            case OptimizedLoggerService.LEVELS.DEBUG:
            default:
                console.log(formattedMessage);
                break;
        }
    }

    /**
     * Método principal de logging
     */
    #log(level, message, ...args) {
        // Verificar si debe loggear este nivel
        if (!this.#shouldLog(level)) {
            return;
        }

        // Convertir argumentos a string de manera eficiente
        const messageStr = typeof message === 'string' ? message : String(message);
        
        // Verificar throttling
        const throttleKey = this.#getThrottleKey(level, messageStr);
        if (this.#checkThrottle(throttleKey)) {
            return; // Log throttled
        }

        // Formatear y procesar
        const formattedMessage = this.#formatMessage(level, messageStr, ...args);
        this.#processLog(level, formattedMessage);
    }

    // Métodos públicos de logging
    error(message, ...args) {
        this.#log(OptimizedLoggerService.LEVELS.ERROR, message, ...args);
    }

    warn(message, ...args) {
        this.#log(OptimizedLoggerService.LEVELS.WARN, message, ...args);
    }

    info(message, ...args) {
        this.#log(OptimizedLoggerService.LEVELS.INFO, message, ...args);
    }

    debug(message, ...args) {
        this.#log(OptimizedLoggerService.LEVELS.DEBUG, message, ...args);
    }

    /**
     * Logging condicional para bucles masivos
     */
    debugBatch(message, currentIndex, totalItems, batchSize = 50) {
        // Solo loggear cada N elementos para evitar spam
        if (currentIndex % batchSize === 0 || currentIndex === totalItems - 1) {
            this.debug(`${message} (${currentIndex + 1}/${totalItems})`);
        }
    }

    /**
     * Logging de progreso optimizado
     */
    progress(message, current, total, stepSize = 10) {
        const percentage = Math.floor((current / total) * 100);
        if (percentage % stepSize === 0 || current === total) {
            this.info(`${message}: ${percentage}% (${current}/${total})`);
        }
    }

    /**
     * Flush manual del batch
     */
    flush() {
        this.#flushBatch();
    }

    /**
     * Obtener métricas de rendimiento
     */
    getMetrics() {
        const runtime = Date.now() - this.#metrics.startTime;
        return {
            ...this.#metrics,
            runtime,
            logsPerSecond: this.#metrics.totalLogs / (runtime / 1000),
            throttleRate: (this.#metrics.throttledLogs / this.#metrics.totalLogs) * 100,
            currentLevel: OptimizedLoggerService.LEVEL_NAMES[this.#config.level]
        };
    }

    /**
     * Cambiar nivel de logging dinámicamente
     */
    setLevel(level) {
        if (typeof level === 'string') {
            level = OptimizedLoggerService.LEVELS[level.toUpperCase()];
        }
        if (level !== undefined) {
            this.#config.level = level;
            this.info(`Nivel de logging cambiado a: ${OptimizedLoggerService.LEVEL_NAMES[level]}`);
        }
    }

    /**
     * Crear logger hijo con contexto
     */
    child(context) {
        const childLogger = new OptimizedLoggerService(this.#config);
        const contextStr = typeof context === 'string' ? context : JSON.stringify(context);
        
        // Override métodos para incluir contexto
        const originalMethods = ['error', 'warn', 'info', 'debug'];
        originalMethods.forEach(method => {
            const originalMethod = childLogger[method];
            childLogger[method] = (message, ...args) => {
                originalMethod.call(childLogger, `[${contextStr}] ${message}`, ...args);
            };
        });

        return childLogger;
    }

    /**
     * Cleanup al destruir el logger
     */
    destroy() {
        this.#flushBatch();
        if (this.#batchTimer) {
            clearTimeout(this.#batchTimer);
        }
        this.#throttleMap.clear();
    }
}

export default OptimizedLoggerService;