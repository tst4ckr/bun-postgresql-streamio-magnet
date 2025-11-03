/**
 * @fileoverview Utilidades de testing reutilizables
 * Siguiendo principios de Clean Architecture y DDD
 */

import { vi } from 'vitest';

/**
 * Utilidades para testing asíncrono
 */
export const AsyncTestUtils = {
  /**
   * Espera hasta que una condición se cumpla
   * @param {Function} condition - Función que retorna boolean
   * @param {number} timeout - Timeout en ms (default: 5000)
   * @param {number} interval - Intervalo de verificación en ms (default: 100)
   * @returns {Promise<void>}
   */
  async waitFor(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.delay(interval);
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  },
  
  /**
   * Simula delay asíncrono
   * @param {number} ms - Milisegundos a esperar
   * @returns {Promise<void>}
   */
  delay(ms = 100) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * Ejecuta una función con timeout
   * @param {Function} fn - Función a ejecutar
   * @param {number} timeout - Timeout en ms
   * @returns {Promise<*>} Resultado de la función
   */
  async withTimeout(fn, timeout = 5000) {
    return Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }
};

/**
 * Utilidades para testing de errores
 */
export const ErrorTestUtils = {
  /**
   * Verifica que una función lance un error específico
   * @param {Function} fn - Función a probar
   * @param {string|RegExp|Function} expected - Error esperado
   * @returns {Promise<Error>} Error capturado
   */
  async expectToThrow(fn, expected) {
    let error;
    
    try {
      await fn();
    } catch (e) {
      error = e;
    }
    
    if (!error) {
      throw new Error('Expected function to throw an error');
    }
    
    if (typeof expected === 'string') {
      if (!error.message.includes(expected)) {
        throw new Error(`Expected error message to contain "${expected}", got "${error.message}"`);
      }
    } else if (expected instanceof RegExp) {
      if (!expected.test(error.message)) {
        throw new Error(`Expected error message to match ${expected}, got "${error.message}"`);
      }
    } else if (typeof expected === 'function') {
      if (!(error instanceof expected)) {
        throw new Error(`Expected error to be instance of ${expected.name}, got ${error.constructor.name}`);
      }
    }
    
    return error;
  },
  
  /**
   * Verifica que una función no lance errores
   * @param {Function} fn - Función a probar
   * @returns {Promise<*>} Resultado de la función
   */
  async expectNotToThrow(fn) {
    try {
      return await fn();
    } catch (error) {
      throw new Error(`Expected function not to throw, but got: ${error.message}`);
    }
  }
};

/**
 * Utilidades para testing de mocks
 */
export const MockTestUtils = {
  /**
   * Verifica que un mock haya sido llamado con argumentos específicos
   * @param {Function} mockFn - Función mock
   * @param {Array} expectedArgs - Argumentos esperados
   * @param {number} callIndex - Índice de la llamada (default: 0)
   */
  expectCalledWith(mockFn, expectedArgs, callIndex = 0) {
    if (!vi.isMockFunction(mockFn)) {
      throw new Error('Expected a mock function');
    }
    
    const calls = mockFn.mock.calls;
    if (calls.length <= callIndex) {
      throw new Error(`Expected mock to be called at least ${callIndex + 1} times, but was called ${calls.length} times`);
    }
    
    const actualArgs = calls[callIndex];
    if (JSON.stringify(actualArgs) !== JSON.stringify(expectedArgs)) {
      throw new Error(`Expected call ${callIndex} to have args ${JSON.stringify(expectedArgs)}, but got ${JSON.stringify(actualArgs)}`);
    }
  },
  
  /**
   * Verifica que un mock haya sido llamado un número específico de veces
   * @param {Function} mockFn - Función mock
   * @param {number} expectedCalls - Número de llamadas esperadas
   */
  expectCalledTimes(mockFn, expectedCalls) {
    if (!vi.isMockFunction(mockFn)) {
      throw new Error('Expected a mock function');
    }
    
    const actualCalls = mockFn.mock.calls.length;
    if (actualCalls !== expectedCalls) {
      throw new Error(`Expected mock to be called ${expectedCalls} times, but was called ${actualCalls} times`);
    }
  },
  
  /**
   * Crea un mock que resuelve con un valor específico
   * @param {*} value - Valor a resolver
   * @returns {Function} Mock function
   */
  createResolvedMock(value) {
    return vi.fn().mockResolvedValue(value);
  },
  
  /**
   * Crea un mock que rechaza con un error específico
   * @param {Error|string} error - Error a rechazar
   * @returns {Function} Mock function
   */
  createRejectedMock(error) {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    return vi.fn().mockRejectedValue(errorObj);
  }
};

/**
 * Utilidades para testing de objetos
 */
export const ObjectTestUtils = {
  /**
   * Verifica que un objeto tenga la estructura esperada
   * @param {Object} obj - Objeto a verificar
   * @param {Object} structure - Estructura esperada
   * @returns {boolean} True si la estructura coincide
   */
  hasStructure(obj, structure) {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }
    
    return Object.keys(structure).every(key => {
      if (!obj.hasOwnProperty(key)) {
        return false;
      }
      
      const expectedType = typeof structure[key];
      const actualType = typeof obj[key];
      
      if (expectedType === 'object' && structure[key] !== null) {
        return this.hasStructure(obj[key], structure[key]);
      }
      
      return actualType === expectedType;
    });
  },
  
  /**
   * Verifica que un objeto contenga propiedades específicas
   * @param {Object} obj - Objeto a verificar
   * @param {Array<string>} properties - Propiedades requeridas
   * @returns {boolean} True si contiene todas las propiedades
   */
  hasProperties(obj, properties) {
    return properties.every(prop => obj.hasOwnProperty(prop));
  },
  
  /**
   * Crea una copia profunda de un objeto
   * @param {Object} obj - Objeto a copiar
   * @returns {Object} Copia del objeto
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};

/**
 * Utilidades para testing de performance
 */
export const PerformanceTestUtils = {
  /**
   * Mide el tiempo de ejecución de una función
   * @param {Function} fn - Función a medir
   * @returns {Promise<{result: *, duration: number}>} Resultado y duración
   */
  async measureExecutionTime(fn) {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    
    return {
      result,
      duration: endTime - startTime
    };
  },
  
  /**
   * Verifica que una función se ejecute dentro de un tiempo límite
   * @param {Function} fn - Función a probar
   * @param {number} maxDuration - Duración máxima en ms
   * @returns {Promise<*>} Resultado de la función
   */
  async expectExecutionTime(fn, maxDuration) {
    const { result, duration } = await this.measureExecutionTime(fn);
    
    if (duration > maxDuration) {
      throw new Error(`Expected execution time to be less than ${maxDuration}ms, but took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  }
};

/**
 * Utilidades para testing de streams
 */
export const StreamTestUtils = {
  /**
   * Valida la estructura de un stream
   * @param {Object} stream - Stream a validar
   * @returns {boolean} True si es válido
   */
  isValidStream(stream) {
    const requiredFields = ['name', 'infoHash', 'fileIdx'];
    return ObjectTestUtils.hasProperties(stream, requiredFields) &&
           typeof stream.name === 'string' &&
           typeof stream.infoHash === 'string' &&
           typeof stream.fileIdx === 'number' &&
           stream.infoHash.length === 40;
  },
  
  /**
   * Valida la estructura de metadata
   * @param {Object} metadata - Metadata a validar
   * @returns {boolean} True si es válido
   */
  isValidMetadata(metadata) {
    const requiredFields = ['id', 'type', 'name'];
    return ObjectTestUtils.hasProperties(metadata, requiredFields) &&
           typeof metadata.id === 'string' &&
           typeof metadata.type === 'string' &&
           typeof metadata.name === 'string';
  }
};

/**
 * Builder para crear tests de manera fluida
 */
export class TestBuilder {
  constructor(description) {
    this.description = description;
    this.setupFn = null;
    this.teardownFn = null;
    this.testFn = null;
    this.timeout = 5000;
  }
  
  /**
   * Configura la función de setup
   * @param {Function} fn - Función de setup
   * @returns {TestBuilder} Builder instance
   */
  setup(fn) {
    this.setupFn = fn;
    return this;
  }
  
  /**
   * Configura la función de teardown
   * @param {Function} fn - Función de teardown
   * @returns {TestBuilder} Builder instance
   */
  teardown(fn) {
    this.teardownFn = fn;
    return this;
  }
  
  /**
   * Configura el timeout del test
   * @param {number} ms - Timeout en milisegundos
   * @returns {TestBuilder} Builder instance
   */
  withTimeout(ms) {
    this.timeout = ms;
    return this;
  }
  
  /**
   * Ejecuta el test
   * @param {Function} testFn - Función del test
   * @returns {Function} Test function para vitest
   */
  run(testFn) {
    return async () => {
      let setupResult;
      
      try {
        if (this.setupFn) {
          setupResult = await this.setupFn();
        }
        
        await AsyncTestUtils.withTimeout(
          () => testFn(setupResult),
          this.timeout
        );
      } finally {
        if (this.teardownFn) {
          await this.teardownFn(setupResult);
        }
      }
    };
  }
}

/**
 * Crea un nuevo TestBuilder
 * @param {string} description - Descripción del test
 * @returns {TestBuilder} Nueva instancia del builder
 */
export const createTest = (description) => new TestBuilder(description);