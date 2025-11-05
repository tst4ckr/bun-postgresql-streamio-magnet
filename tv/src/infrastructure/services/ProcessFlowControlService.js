import { EventEmitter } from 'events';
import {
    validateConfig,
    getMemoryUsagePercentage,
    getCpuUsagePercentage,
    calculateThrottledConcurrency,
    calculateBackoffDelay,
    calculateRestoredConcurrency,
    shouldThrottle,
    areResourceValuesValid,
    createOptimizedStats,
    rejectPendingOperations,
    processPendingOperationsQueue
} from './ProcessFlowControlService_tools.js';

/**
 * Servicio de control de flujo para prevenir sobrecarga del proceso principal
 * Implementa throttling dinámico basado en recursos del sistema
 * La lógica principal se concentra en la orquestación del flujo de control,
 * mientras que las herramientas auxiliares están separadas en _tools.js
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
        
        // Configuración optimizada para máxima velocidad usando herramientas auxiliares
        this.config = validateConfig(config);
        
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
     * Utiliza herramientas auxiliares para obtener métricas del sistema
     */
    async checkSystemResources() {
        if (this.isDestroyed) {
            return;
        }
        
        try {
            const memoryUsage = getMemoryUsagePercentage();
            const cpuUsage = await getCpuUsagePercentage();
            
            // Validar que los valores sean números válidos usando herramientas auxiliares
            if (!areResourceValuesValid(memoryUsage, cpuUsage)) {
                this.logger.error('Control de flujo: Valores de recursos inválidos');
                return;
            }
            
            const shouldThrottleSystem = shouldThrottle(
                memoryUsage, 
                cpuUsage, 
                this.config.memoryThreshold, 
                this.config.cpuThreshold
            );
            
            if (shouldThrottleSystem && !this.isThrottling) {
                this.startThrottling(memoryUsage, cpuUsage);
            } else if (!shouldThrottleSystem && this.isThrottling) {
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
     * Inicia el throttling del sistema usando cálculos auxiliares
     */
    startThrottling(memoryUsage, cpuUsage) {
        if (this.isDestroyed) {
            return;
        }
        
        // Validar parámetros usando herramientas auxiliares
        if (!areResourceValuesValid(memoryUsage, cpuUsage)) {
            this.logger.error('Control de flujo: Parámetros de throttling inválidos');
            return;
        }
        
        if (this.isThrottling) {
            return; // Ya está en throttling
        }
        
        this.isThrottling = true;
        this.currentConcurrency = calculateThrottledConcurrency(
            this.currentConcurrency, 
            this.config.minConcurrency
        );
        
        this.backoffDelay = calculateBackoffDelay(
            this.backoffDelay, 
            this.config.backoffMultiplier, 
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
     * Detiene el throttling del sistema usando cálculos auxiliares
     */
    stopThrottling() {
        if (this.isDestroyed || !this.isThrottling) {
            return;
        }
        
        this.isThrottling = false;
        this.currentConcurrency = calculateRestoredConcurrency(
            this.currentConcurrency, 
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
     * Procesa operaciones pendientes en la cola usando herramientas auxiliares
     */
    processPendingOperations() {
        if (this.isDestroyed) {
            // Rechazar todas las operaciones pendientes usando herramientas auxiliares
            rejectPendingOperations(this.pendingOperations);
            return;
        }
        
        // Procesar operaciones pendientes usando herramientas auxiliares
        this.activeOperations = processPendingOperationsQueue(
            this.pendingOperations,
            this.activeOperations,
            this.currentConcurrency,
            this.isThrottling
        );
    }

    /**
     * Obtiene estadísticas actuales del servicio usando herramientas auxiliares
     */
    getStats() {
        return createOptimizedStats(this.activeOperations);
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