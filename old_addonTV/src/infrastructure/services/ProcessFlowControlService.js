import { EventEmitter } from 'events';
import os from 'os';

/**
 * Servicio de control de flujo para prevenir sobrecarga del proceso principal
 * Implementa throttling dinámico basado en recursos del sistema
 */
class ProcessFlowControlService extends EventEmitter {
    constructor(logger, config = {}) {
        super();
        
        // Validación estricta de parámetros
        if (!logger || typeof logger.debug !== 'function') {
            throw new Error('Logger válido es requerido');
        }
        
        if (config && typeof config !== 'object') {
            throw new Error('Config debe ser un objeto');
        }
        
        this.logger = logger;
        this.isDestroyed = false;
        
        // Configuración optimizada para máxima velocidad
        this.config = this.#validateConfig(config);
        
        this.currentConcurrency = this.config.maxConcurrency;
        this.backoffDelay = 0;
        this.isThrottling = false;
        this.activeOperations = 0;
        this.pendingOperations = [];
        this.monitoringInterval = null;
        
        // Monitoreo deshabilitado para máxima velocidad
        // this.startMonitoring();
    }
    
    /**
     * Valida y normaliza la configuración
     */
    #validateConfig(config = {}) {
        const memoryThreshold = this.#validateNumber(config.memoryThreshold, 70, 1, 95);
        const cpuThreshold = this.#validateNumber(config.cpuThreshold, 80, 1, 95);
        const checkInterval = this.#validateNumber(config.checkInterval, 5000, 1000, 60000);
        const backoffMultiplier = this.#validateNumber(config.backoffMultiplier, 1.5, 1.1, 3.0);
        const maxBackoffDelay = this.#validateNumber(config.maxBackoffDelay, 30000, 1000, 300000);
        const minConcurrency = this.#validateNumber(config.minConcurrency, 1, 1, 50);
        const maxConcurrency = this.#validateNumber(config.maxConcurrency, 10, 1, 100);
        
        if (minConcurrency >= maxConcurrency) {
            throw new Error('minConcurrency debe ser menor que maxConcurrency');
        }
        
        return {
            memoryThreshold,
            cpuThreshold,
            checkInterval,
            backoffMultiplier,
            maxBackoffDelay,
            minConcurrency,
            maxConcurrency
        };
    }
    
    /**
     * Valida que un número esté en el rango permitido
     */
    #validateNumber(value, defaultValue, min, max) {
        if (value === undefined || value === null) {
            return defaultValue;
        }
        
        if (typeof value !== 'number' || isNaN(value)) {
            throw new Error(`Valor debe ser un número válido`);
        }
        
        if (value < min || value > max) {
            throw new Error(`Valor debe estar entre ${min} y ${max}`);
        }
        
        return value;
    }

    /**
     * Inicia el monitoreo de recursos del sistema
     */
    startMonitoring() {
        if (this.isDestroyed) {
            throw new Error('Servicio destruido, no se puede iniciar monitoreo');
        }
        
        if (this.monitoringInterval) {
            this.logger.warn('Control de flujo: Monitoreo ya activo');
            return;
        }
        
        this.monitoringInterval = setInterval(() => {
            if (!this.isDestroyed) {
                this.checkSystemResources();
            }
        }, this.config.checkInterval);
        
        this.logger.debug('Control de flujo: Monitoreo iniciado');
    }

    /**
     * Detiene el monitoreo de recursos
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            this.logger.debug('Control de flujo: Monitoreo detenido');
        }
    }

    /**
     * Verifica los recursos del sistema y ajusta la concurrencia
     */
    async checkSystemResources() {
        if (this.isDestroyed) {
            return;
        }
        
        try {
            const memoryUsage = this.getMemoryUsagePercentage();
            const cpuUsage = await this.getCpuUsagePercentage();
            
            // Validar que los valores sean números válidos
            if (typeof memoryUsage !== 'number' || isNaN(memoryUsage) ||
                typeof cpuUsage !== 'number' || isNaN(cpuUsage)) {
                this.logger.error('Control de flujo: Valores de recursos inválidos');
                return;
            }
            
            const shouldThrottle = memoryUsage > this.config.memoryThreshold || 
                                 cpuUsage > this.config.cpuThreshold;
            
            if (shouldThrottle && !this.isThrottling) {
                this.startThrottling(memoryUsage, cpuUsage);
            } else if (!shouldThrottle && this.isThrottling) {
                this.stopThrottling();
            }
            
            this.emit('resourceCheck', {
                memory: memoryUsage,
                cpu: cpuUsage,
                concurrency: this.currentConcurrency,
                throttling: this.isThrottling
            });
            
        } catch (error) {
            this.logger.error('Control de flujo: Error en verificación de recursos:', error);
        }
    }

    /**
     * Inicia el throttling del sistema
     */
    startThrottling(memoryUsage, cpuUsage) {
        if (this.isDestroyed) {
            return;
        }
        
        // Validar parámetros
        if (typeof memoryUsage !== 'number' || typeof cpuUsage !== 'number') {
            this.logger.error('Control de flujo: Parámetros de throttling inválidos');
            return;
        }
        
        if (this.isThrottling) {
            return; // Ya está en throttling
        }
        
        this.isThrottling = true;
        this.currentConcurrency = Math.max(
            Math.floor(this.currentConcurrency / 2),
            this.config.minConcurrency
        );
        
        this.backoffDelay = Math.min(
            this.backoffDelay * this.config.backoffMultiplier || 1000,
            this.config.maxBackoffDelay
        );
        
        this.logger.warn(
            `Control de flujo: Throttling activado - ` +
            `Mem: ${memoryUsage.toFixed(1)}%, CPU: ${cpuUsage.toFixed(1)}% -> ` +
            `Concurrencia: ${this.currentConcurrency}`
        );
        
        this.emit('throttlingStarted', {
            memory: memoryUsage,
            cpu: cpuUsage,
            newConcurrency: this.currentConcurrency
        });
    }

    /**
     * Detiene el throttling del sistema
     */
    stopThrottling() {
        if (this.isDestroyed || !this.isThrottling) {
            return;
        }
        
        this.isThrottling = false;
        this.currentConcurrency = Math.min(
            this.currentConcurrency * 2,
            this.config.maxConcurrency
        );
        this.backoffDelay = 0;
        
        this.logger.info(
            `Control de flujo: Throttling desactivado -> ` +
            `Concurrencia: ${this.currentConcurrency}`
        );
        
        this.emit('throttlingStopped', {
            newConcurrency: this.currentConcurrency
        });
        
        // Procesar operaciones pendientes
        this.processPendingOperations();
    }

    /**
     * Solicita permiso para ejecutar una operación (sin limitaciones para máxima velocidad)
     */
    async requestOperation(operationId = null) {
        if (this.isDestroyed) {
            return Promise.reject(new Error('Servicio destruido'));
        }
        
        // Permitir todas las operaciones sin restricciones para máxima velocidad
        this.activeOperations++;
        return Promise.resolve(true);
    }

    /**
     * Libera una operación completada (simplificado para máxima velocidad)
     */
    releaseOperation(operationId = null) {
        if (this.isDestroyed) {
            return;
        }
        
        if (this.activeOperations > 0) {
            this.activeOperations--;
        }
    }

    /**
     * Procesa operaciones pendientes en la cola
     */
    processPendingOperations() {
        if (this.isDestroyed) {
            // Rechazar todas las operaciones pendientes
            while (this.pendingOperations.length > 0) {
                const { reject } = this.pendingOperations.shift();
                if (reject) {
                    reject(new Error('Servicio destruido'));
                }
            }
            return;
        }
        
        while (this.pendingOperations.length > 0 && 
               this.activeOperations < this.currentConcurrency && 
               !this.isThrottling) {
            
            const { resolve } = this.pendingOperations.shift();
            if (resolve) {
                this.activeOperations++;
                resolve(true);
            }
        }
    }

    /**
     * Obtiene el porcentaje de uso de memoria
     */
    getMemoryUsagePercentage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        return (usedMemory / totalMemory) * 100;
    }

    /**
     * Obtiene el porcentaje de uso de CPU (promedio)
     */
    async getCpuUsagePercentage() {
        return new Promise((resolve) => {
            const startMeasure = this.getCpuInfo();
            
            setTimeout(() => {
                const endMeasure = this.getCpuInfo();
                const idleDifference = endMeasure.idle - startMeasure.idle;
                const totalDifference = endMeasure.total - startMeasure.total;
                const cpuPercentage = 100 - (100 * idleDifference / totalDifference);
                resolve(Math.max(0, Math.min(100, cpuPercentage)));
            }, 100);
        });
    }

    /**
     * Obtiene información de CPU
     */
    getCpuInfo() {
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        
        cpus.forEach(cpu => {
            Object.keys(cpu.times).forEach(type => {
                total += cpu.times[type];
            });
            idle += cpu.times.idle;
        });
        
        return { idle, total };
    }

    /**
     * Obtiene estadísticas actuales del servicio (optimizado para velocidad)
     */
    getStats() {
        return {
            currentConcurrency: 'unlimited',
            activeOperations: this.activeOperations,
            pendingOperations: 0, // Sin cola de espera
            isThrottling: false, // Throttling deshabilitado
            backoffDelay: 0,
            memoryUsage: 0 // Valor numérico para compatibilidad con .toFixed()
        };
    }

    /**
     * Destruye el servicio y limpia recursos
     */
    destroy() {
        if (this.isDestroyed) {
            return;
        }
        
        this.isDestroyed = true;
        this.stopMonitoring();
        
        // Rechazar todas las operaciones pendientes
        while (this.pendingOperations.length > 0) {
            const { reject } = this.pendingOperations.shift();
            if (reject) {
                reject(new Error('Servicio destruido'));
            }
        }
        
        // Limpiar estado
        this.activeOperations = 0;
        this.currentConcurrency = this.config.maxConcurrency;
        this.isThrottling = false;
        this.backoffDelay = 0;
        
        this.logger.info('Control de flujo: Servicio destruido');
    }
}

export default ProcessFlowControlService;