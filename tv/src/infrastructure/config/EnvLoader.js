/**
 * @fileoverview EnvLoader - Cargador centralizado de variables de entorno
 * Sustituye la carga desde .env por lectura de archivo .conf a través de ConfLoader.
 * Implementa patrón Singleton optimizado con protecciones adicionales.
 */

import ConfLoader from './ConfLoader.js';

/**
 * Singleton para cargar variables de entorno una sola vez
 */
class EnvLoader {
  static #instance = null;
  static #isLoaded = false;
  static #loadingPromise = null;

  /**
   * Constructor privado para implementar Singleton
   * @private
   */
  constructor() {
    if (EnvLoader.#instance) {
      return EnvLoader.#instance;
    }
    
    // Prevenir múltiples instanciaciones concurrentes
    if (EnvLoader.#loadingPromise) {
      throw new Error('[EnvLoader] Environment loading already in progress. Use getInstance() instead.');
    }
    
    this.#loadEnvironment();
    EnvLoader.#instance = this;
  }

  /**
   * Carga las variables de entorno una sola vez de forma thread-safe
   * @private
   */
  #loadEnvironment() {
    if (EnvLoader.#isLoaded) {
      return;
    }

    // Marcar como en proceso de carga para prevenir cargas concurrentes
    EnvLoader.#loadingPromise = Promise.resolve();

    try {
      // Cargar configuración desde archivo .conf y poblar process.env
      const loader = ConfLoader.getInstance();
      // Carga síncrona para asegurar que process.env esté listo antes de continuar
      loader.loadSync();
      
      EnvLoader.#isLoaded = true;
      EnvLoader.#loadingPromise = null;
    } catch (error) {
      EnvLoader.#loadingPromise = null;
      console.error('[EnvLoader] Error loading environment variables from .conf:', error.message);
      throw error;
    }
  }

  /**
   * Obtiene la instancia única del cargador de entorno
   * @static
   * @returns {EnvLoader}
   */
  static getInstance() {
    if (!EnvLoader.#instance) {
      // Verificar si ya está en proceso de carga
      if (EnvLoader.#loadingPromise) {
        throw new Error('[EnvLoader] Environment loading already in progress. Cannot create new instance.');
      }
      EnvLoader.#instance = new EnvLoader();
    }
    return EnvLoader.#instance;
  }

  /**
   * Verifica si las variables de entorno ya fueron cargadas
   * @static
   * @returns {boolean}
   */
  static isLoaded() {
    return EnvLoader.#isLoaded;
  }

  /**
   * Verifica si está en proceso de carga
   * @static
   * @returns {boolean}
   */
  static isLoading() {
    return EnvLoader.#loadingPromise !== null;
  }

  /**
   * Fuerza la recarga de variables de entorno (usar con precaución)
   * @static
   */
  static forceReload() {
    if (EnvLoader.#loadingPromise) {
      throw new Error('[EnvLoader] Cannot force reload while loading is in progress.');
    }
    
    console.warn('[EnvLoader] Force reloading environment variables...');
    EnvLoader.#isLoaded = false;
    EnvLoader.#instance = null;
    EnvLoader.#loadingPromise = null;
    return EnvLoader.getInstance();
  }
}

export { EnvLoader };
export default EnvLoader;