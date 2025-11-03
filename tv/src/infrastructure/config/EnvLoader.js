/**
 * @fileoverview EnvLoader - Cargador centralizado de variables de entorno
 * Evita múltiples cargas de dotenv que causan bucles infinitos
 */

import { config } from 'dotenv';

/**
 * Singleton para cargar variables de entorno una sola vez
 */
class EnvLoader {
  static #instance = null;
  static #isLoaded = false;

  /**
   * Constructor privado para implementar Singleton
   * @private
   */
  constructor() {
    if (EnvLoader.#instance) {
      return EnvLoader.#instance;
    }
    
    this.#loadEnvironment();
    EnvLoader.#instance = this;
  }

  /**
   * Carga las variables de entorno una sola vez
   * @private
   */
  #loadEnvironment() {
    if (EnvLoader.#isLoaded) {
      return;
    }

    try {
      const result = config({ path: '.env' });
      
      if (result.error) {
        console.warn('[EnvLoader] Warning: .env file not found or could not be parsed:', result.error.message);
      } else {
        console.log('[EnvLoader] Environment variables loaded successfully');
      }
      
      EnvLoader.#isLoaded = true;
    } catch (error) {
      console.error('[EnvLoader] Error loading environment variables:', error.message);
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
   * Fuerza la recarga de variables de entorno (usar con precaución)
   * @static
   */
  static forceReload() {
    EnvLoader.#isLoaded = false;
    EnvLoader.#instance = null;
    return EnvLoader.getInstance();
  }
}

export { EnvLoader };
export default EnvLoader;