/**
 * @fileoverview MemoryOptimizationService - Servicio de optimización de memoria
 * 
 * RESPONSABILIDAD PRINCIPAL: Reducir duplicación de datos y optimizar uso de memoria
 * UTILIZA: Funciones auxiliares de MemoryOptimizationService_tools.js
 * 
 * Arquitectura de Optimización:
 * - Pool de objetos reutilizables
 * - Weak references para objetos temporales
 * - Lazy loading de propiedades pesadas
 * - Compresión de strings repetidos
 * 
 * Flujo de optimización:
 * 1. Análisis de duplicación → Memory Analysis
 * 2. Pool de objetos → Object Reuse
 * 3. Weak references → Garbage Collection
 * 4. String interning → Memory Compression
 * 
 * @author Sistema de Optimización de Memoria
 * @version 1.0.0
 */

import {
  validateChannelsForOptimization,
  optimizeChannelStrings,
  createSharedReferences,
  applyLazyLoading,
  getMemoryUsage,
  clearMemoryPools,
  createOptimizedMemoryStats,
  resetMemoryStats,
  isOptimizationEnabled
} from './MemoryOptimizationService_tools.js';

/**
 * Servicio de optimización de memoria para reducir duplicación de datos
 */
export class MemoryOptimizationService {
  #logger;
  #config;
  #stringPool = new Map();           // Pool de strings reutilizables
  #objectPool = new Map();           // Pool de objetos reutilizables
  #weakRefs = new WeakMap();         // Referencias débiles para cleanup
  #stats = {
    stringPoolHits: 0,
    stringPoolMisses: 0,
    objectPoolHits: 0,
    objectPoolMisses: 0,
    memoryFreed: 0,
    duplicatesReduced: 0
  };

  constructor(config = {}, logger = console) {
    this.#config = {
      enableStringPooling: config.enableStringPooling !== false,
      enableObjectPooling: config.enableObjectPooling !== false,
      maxStringPoolSize: config.maxStringPoolSize || 10000,
      maxObjectPoolSize: config.maxObjectPoolSize || 5000,
      enableWeakRefs: config.enableWeakRefs !== false,
      enableLazyLoading: config.enableLazyLoading !== false,
      ...config
    };
    this.#logger = logger;
  }

  /**
   * Optimiza un array de canales reduciendo duplicación de memoria
   * @param {Array<Channel>} channels - Canales a optimizar
   * @returns {Array<Channel>} Canales optimizados
   */
  optimizeChannels(channels) {
    if (!validateChannelsForOptimization(channels)) {
      return channels;
    }

    const startTime = Date.now();
    const initialMemory = getMemoryUsage();

    this.#logger.debug(`[MemoryOptimization] Optimizando ${channels.length} canales...`);

    // 1. Optimizar strings duplicados (URLs, nombres, géneros)
    const optimizedChannels = optimizeChannelStrings(channels, this.#stringPool, this.#stats, this.#config);

    // 2. Crear referencias compartidas para objetos similares
    const sharedOptimizedChannels = createSharedReferences(optimizedChannels, this.#stats, this.#config);

    // 3. Aplicar lazy loading para propiedades pesadas
    const lazyOptimizedChannels = applyLazyLoading(sharedOptimizedChannels, this.#config);

    const endTime = Date.now();
    const finalMemory = getMemoryUsage();
    const memoryReduced = Math.max(0, initialMemory - finalMemory);

    this.#stats.memoryFreed += memoryReduced;
    this.#stats.duplicatesReduced += channels.length - lazyOptimizedChannels.length;

    this.#logger.info(`[MemoryOptimization] Optimización completada en ${endTime - startTime}ms`);
    this.#logger.info(`[MemoryOptimization] Memoria liberada: ${(memoryReduced / 1024 / 1024).toFixed(2)}MB`);

    return lazyOptimizedChannels;
  }

  /**
   * Limpia el pool de strings y objetos
   */
  clearPools() {
    clearMemoryPools(this.#stringPool, this.#objectPool, this.#logger);
  }

  /**
   * Obtiene estadísticas de optimización de memoria
   * @returns {Object} Estadísticas detalladas
   */
  getStats() {
    return createOptimizedMemoryStats(this.#stats, this.#stringPool, this.#objectPool);
  }

  /**
   * Resetea las estadísticas
   */
  resetStats() {
    this.#stats = resetMemoryStats();
  }

  /**
   * Verifica si la optimización está habilitada
   * @returns {boolean}
   */
  isEnabled() {
    return isOptimizationEnabled(this.#config);
  }
}

export default MemoryOptimizationService;