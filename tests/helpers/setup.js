/**
 * @fileoverview Setup global para tests - Configuración inicial del entorno de testing
 * Siguiendo principios de Clean Architecture y DDD
 */

import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import dotenv from 'dotenv';

// ================================
// 🔧 Configuración del Entorno
// ================================

// Cargar variables de entorno para testing
dotenv.config({ path: '.env.test' });

// Configurar variables de entorno por defecto para tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.CACHE_ENABLED = 'false';
process.env.TOR_ENABLED = 'false';

// ================================
// 🧪 Configuración Global de Tests
// ================================

beforeAll(async () => {
  // Configuración global antes de todos los tests
  console.log('🧪 Iniciando suite de tests...');
  
  // Configurar timezone para tests consistentes
  process.env.TZ = 'UTC';
  
  // Configurar timeouts globales
  vi.setConfig({
    testTimeout: 10000,
    hookTimeout: 10000
  });
});

afterAll(async () => {
  // Limpieza global después de todos los tests
  console.log('✅ Suite de tests completada');
  
  // Limpiar timers y mocks
  vi.clearAllTimers();
  vi.clearAllMocks();
});

beforeEach(() => {
  // Setup antes de cada test
  vi.clearAllMocks();
  vi.clearAllTimers();
  
  // Reset de console para evitar spam en tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Limpieza después de cada test
  vi.restoreAllMocks();
  vi.clearAllTimers();
});

// ================================
// 🔧 Utilidades Globales para Tests
// ================================

/**
 * Crea un mock de logger para tests
 * @returns {Object} Mock del logger
 */
global.createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  log: vi.fn()
});

/**
 * Crea un mock de configuración para tests
 * @param {Object} overrides - Configuraciones a sobrescribir
 * @returns {Object} Mock de configuración
 */
global.createMockConfig = (overrides = {}) => ({
  server: {
    port: 7000,
    host: '0.0.0.0'
  },
  cache: {
    stream: { ttl: 3600 },
    anime: { ttl: 7200 },
    metadata: { ttl: 86400 }
  },
  logging: {
    level: 'error',
    format: 'json'
  },
  torrentio: {
    movies: {
      providers: 'yts,eztv,rarbg',
      sort: 'qualitysize',
      qualityFilter: '480p,720p,1080p'
    }
  },
  ...overrides
});

/**
 * Crea datos de prueba consistentes
 * @param {string} type - Tipo de datos (stream, metadata, etc.)
 * @param {Object} overrides - Datos a sobrescribir
 * @returns {Object} Datos de prueba
 */
global.createTestData = (type, overrides = {}) => {
  const testData = {
    stream: {
      name: 'Test Stream',
      infoHash: 'a1b2c3d4e5f6789012345678901234567890abcd',
      fileIdx: 0,
      sources: ['test-source'],
      title: 'Test Movie 2024 1080p',
      size: 1073741824, // 1GB
      seeders: 100,
      ...overrides
    },
    metadata: {
      id: 'tt1234567',
      type: 'movie',
      name: 'Test Movie',
      year: 2024,
      genres: ['Action', 'Drama'],
      ...overrides
    },
    error: {
      message: 'Test error',
      code: 'TEST_ERROR',
      stack: 'Error stack trace',
      ...overrides
    }
  };
  
  return testData[type] || {};
};

/**
 * Simula delay asíncrono para tests
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise} Promise que se resuelve después del delay
 */
global.delay = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Matcher personalizado para verificar estructura de objetos
 * @param {Object} received - Objeto recibido
 * @param {Object} expected - Estructura esperada
 * @returns {Object} Resultado del matcher
 */
expect.extend({
  toHaveStructure(received, expected) {
    const pass = Object.keys(expected).every(key => 
      received.hasOwnProperty(key) && 
      typeof received[key] === typeof expected[key]
    );
    
    return {
      pass,
      message: () => pass 
        ? `Expected object not to have structure ${JSON.stringify(expected)}`
        : `Expected object to have structure ${JSON.stringify(expected)}, but received ${JSON.stringify(received)}`
    };
  }
});

// ================================
// 🚨 Configuración de Error Handling
// ================================

// Capturar errores no manejados en tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

console.log('✅ Setup de tests configurado correctamente');