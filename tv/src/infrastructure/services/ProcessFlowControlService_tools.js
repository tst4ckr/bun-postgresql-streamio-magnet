/**
 * @fileoverview ProcessFlowControlService_tools - Herramientas auxiliares para ProcessFlowControlService
 * Contiene funciones utilitarias extraídas para mejorar la organización del código
 * y facilitar el testing y reutilización
 */

import os from 'os';

/**
 * Valida que un número esté en el rango permitido
 * @param {*} value - Valor a validar
 * @param {number} defaultValue - Valor por defecto si value es inválido
 * @param {number} min - Valor mínimo permitido
 * @param {number} max - Valor máximo permitido
 * @returns {number} Valor validado
 * @throws {Error} Si el valor está fuera del rango permitido
 */
export function validateNumber(value, defaultValue, min, max) {
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
 * Valida y normaliza la configuración del servicio de control de flujo
 * @param {Object} config - Configuración a validar
 * @returns {Object} Configuración validada y normalizada
 * @throws {Error} Si la configuración es inválida
 */
export function validateConfig(config = {}) {
    const memoryThreshold = validateNumber(config.memoryThreshold, 70, 1, 95);
    const cpuThreshold = validateNumber(config.cpuThreshold, 80, 1, 95);
    const checkInterval = validateNumber(config.checkInterval, 5000, 1000, 60000);
    const backoffMultiplier = validateNumber(config.backoffMultiplier, 1.5, 1.1, 3.0);
    const maxBackoffDelay = validateNumber(config.maxBackoffDelay, 30000, 1000, 300000);
    const minConcurrency = validateNumber(config.minConcurrency, 1, 1, 50);
    const maxConcurrency = validateNumber(config.maxConcurrency, 10, 1, 100);
    
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
 * Obtiene el porcentaje de uso de memoria del sistema
 * @returns {number} Porcentaje de uso de memoria (0-100)
 */
export function getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    return (usedMemory / totalMemory) * 100;
}

/**
 * Obtiene información detallada de CPU para cálculos de uso
 * @returns {Object} Objeto con propiedades idle y total
 */
export function getCpuInfo() {
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
 * Obtiene el porcentaje de uso de CPU (promedio)
 * @returns {Promise<number>} Promesa que resuelve con el porcentaje de uso de CPU (0-100)
 */
export function getCpuUsagePercentage() {
    return new Promise((resolve) => {
        const startMeasure = getCpuInfo();
        
        setTimeout(() => {
            const endMeasure = getCpuInfo();
            const idleDifference = endMeasure.idle - startMeasure.idle;
            const totalDifference = endMeasure.total - startMeasure.total;
            const cpuPercentage = 100 - (100 * idleDifference / totalDifference);
            resolve(Math.max(0, Math.min(100, cpuPercentage)));
        }, 100);
    });
}

/**
 * Calcula la nueva concurrencia durante el throttling
 * @param {number} currentConcurrency - Concurrencia actual
 * @param {number} minConcurrency - Concurrencia mínima permitida
 * @returns {number} Nueva concurrencia calculada
 */
export function calculateThrottledConcurrency(currentConcurrency, minConcurrency) {
    return Math.max(
        Math.floor(currentConcurrency / 2),
        minConcurrency
    );
}

/**
 * Calcula el nuevo delay de backoff
 * @param {number} currentDelay - Delay actual
 * @param {number} backoffMultiplier - Multiplicador de backoff
 * @param {number} maxBackoffDelay - Delay máximo permitido
 * @returns {number} Nuevo delay calculado
 */
export function calculateBackoffDelay(currentDelay, backoffMultiplier, maxBackoffDelay) {
    return Math.min(
        currentDelay * backoffMultiplier || 1000,
        maxBackoffDelay
    );
}

/**
 * Calcula la concurrencia restaurada después del throttling
 * @param {number} currentConcurrency - Concurrencia actual
 * @param {number} maxConcurrency - Concurrencia máxima permitida
 * @returns {number} Nueva concurrencia calculada
 */
export function calculateRestoredConcurrency(currentConcurrency, maxConcurrency) {
    return Math.min(
        currentConcurrency * 2,
        maxConcurrency
    );
}

/**
 * Determina si el sistema debe entrar en throttling basado en los recursos
 * @param {number} memoryUsage - Porcentaje de uso de memoria
 * @param {number} cpuUsage - Porcentaje de uso de CPU
 * @param {number} memoryThreshold - Umbral de memoria
 * @param {number} cpuThreshold - Umbral de CPU
 * @returns {boolean} True si debe activar throttling
 */
export function shouldThrottle(memoryUsage, cpuUsage, memoryThreshold, cpuThreshold) {
    return memoryUsage > memoryThreshold || cpuUsage > cpuThreshold;
}

/**
 * Valida que los valores de recursos del sistema sean números válidos
 * @param {number} memoryUsage - Uso de memoria
 * @param {number} cpuUsage - Uso de CPU
 * @returns {boolean} True si ambos valores son válidos
 */
export function areResourceValuesValid(memoryUsage, cpuUsage) {
    return typeof memoryUsage === 'number' && !isNaN(memoryUsage) &&
           typeof cpuUsage === 'number' && !isNaN(cpuUsage);
}

/**
 * Crea un objeto de estadísticas optimizado para velocidad
 * @param {number} activeOperations - Operaciones activas
 * @returns {Object} Objeto de estadísticas
 */
export function createOptimizedStats(activeOperations) {
    return {
        currentConcurrency: 'unlimited',
        activeOperations: activeOperations,
        pendingOperations: 0, // Sin cola de espera
        isThrottling: false, // Throttling deshabilitado
        backoffDelay: 0,
        memoryUsage: 0 // Valor numérico para compatibilidad con .toFixed()
    };
}

/**
 * Procesa y rechaza operaciones pendientes cuando el servicio es destruido
 * @param {Array} pendingOperations - Array de operaciones pendientes
 * @param {string} errorMessage - Mensaje de error a usar
 */
export function rejectPendingOperations(pendingOperations, errorMessage = 'Servicio destruido') {
    while (pendingOperations.length > 0) {
        const { reject } = pendingOperations.shift();
        if (reject) {
            reject(new Error(errorMessage));
        }
    }
}

/**
 * Procesa operaciones pendientes en la cola respetando límites de concurrencia
 * @param {Array} pendingOperations - Array de operaciones pendientes
 * @param {number} activeOperations - Número de operaciones activas
 * @param {number} currentConcurrency - Concurrencia actual permitida
 * @param {boolean} isThrottling - Si el sistema está en throttling
 * @returns {number} Nuevo número de operaciones activas
 */
export function processPendingOperationsQueue(pendingOperations, activeOperations, currentConcurrency, isThrottling) {
    let newActiveOperations = activeOperations;
    
    while (pendingOperations.length > 0 && 
           newActiveOperations < currentConcurrency && 
           !isThrottling) {
        
        const { resolve } = pendingOperations.shift();
        if (resolve) {
            newActiveOperations++;
            resolve(true);
        }
    }
    
    return newActiveOperations;
}