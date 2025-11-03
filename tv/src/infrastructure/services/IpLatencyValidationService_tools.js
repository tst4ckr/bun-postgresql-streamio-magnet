/**
 * @fileoverview IpLatencyValidationService Tools - Herramientas auxiliares para validación de latencia
 * 
 * Este módulo contiene funciones puras y utilitarias que implementan la lógica de ping
 * y validación de latencia de IPs, separadas de la lógica principal del servicio para
 * promover reutilización y facilitar testing.
 * 
 * @author Sistema de Validación de Latencia IP
 * @version 1.0.0
 */

import { spawn } from 'child_process';
import { promisify } from 'util';

/**
 * Configuración por defecto para validación de latencia
 */
export const DEFAULT_LATENCY_CONFIG = {
  maxLatencyMs: 50,           // Latencia máxima permitida en ms
  timeoutMs: 3000,            // Timeout para ping en ms
  retries: 2,                 // Número de reintentos
  concurrency: 10,            // Pings concurrentes
  pingCount: 3,               // Número de pings por IP
  platform: process.platform  // Plataforma del sistema
};

/**
 * HERRAMIENTA PURA: Crea comando de ping según la plataforma
 * @param {string} ip - IP a hacer ping
 * @param {Object} config - Configuración de ping
 * @returns {Object} Comando y argumentos para ping
 */
export function createPingCommand(ip, config = DEFAULT_LATENCY_CONFIG) {
  const isWindows = config.platform === 'win32';
  
  if (isWindows) {
    return {
      command: 'ping',
      args: [
        '-n', config.pingCount.toString(),  // Número de pings
        '-w', config.timeoutMs.toString(),  // Timeout en ms
        ip
      ]
    };
  } else {
    // Linux/macOS
    return {
      command: 'ping',
      args: [
        '-c', config.pingCount.toString(),           // Número de pings
        '-W', Math.ceil(config.timeoutMs / 1000).toString(), // Timeout en segundos
        ip
      ]
    };
  }
}

/**
 * HERRAMIENTA PURA: Parsea la salida del ping para extraer latencia
 * @param {string} pingOutput - Salida del comando ping
 * @param {string} platform - Plataforma del sistema
 * @returns {Object} Resultado del parsing
 */
export function parsePingOutput(pingOutput, platform = process.platform) {
  if (!pingOutput || typeof pingOutput !== 'string') {
    return {
      success: false,
      latency: null,
      error: 'Salida de ping vacía o inválida'
    };
  }

  try {
    const isWindows = platform === 'win32';
    let latencies = [];

    if (isWindows) {
      // Patrón para Windows: "tiempo=XXXms" o "time=XXXms"
      const windowsPattern = /(?:tiempo|time)=(\d+)ms/gi;
      let match;
      
      while ((match = windowsPattern.exec(pingOutput)) !== null) {
        latencies.push(parseInt(match[1], 10));
      }
    } else {
      // Patrón para Linux/macOS: "time=XX.X ms"
      const unixPattern = /time=(\d+(?:\.\d+)?) ms/gi;
      let match;
      
      while ((match = unixPattern.exec(pingOutput)) !== null) {
        latencies.push(Math.round(parseFloat(match[1])));
      }
    }

    if (latencies.length === 0) {
      return {
        success: false,
        latency: null,
        error: 'No se pudieron extraer latencias del ping'
      };
    }

    // Calcular latencia promedio
    const avgLatency = Math.round(latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length);

    return {
      success: true,
      latency: avgLatency,
      latencies: latencies,
      minLatency: Math.min(...latencies),
      maxLatency: Math.max(...latencies)
    };

  } catch (error) {
    return {
      success: false,
      latency: null,
      error: `Error parseando ping: ${error.message}`
    };
  }
}

/**
 * HERRAMIENTA PURA: Ejecuta ping a una IP específica
 * @param {string} ip - IP a hacer ping
 * @param {Object} config - Configuración de ping
 * @returns {Promise<Object>} Resultado del ping
 */
export function executePing(ip, config = DEFAULT_LATENCY_CONFIG) {
  return new Promise((resolve) => {
    const { command, args } = createPingCommand(ip, config);
    
    const pingProcess = spawn(command, args);
    let output = '';
    let errorOutput = '';

    // Timeout para el proceso completo
    const timeout = setTimeout(() => {
      pingProcess.kill();
      resolve({
        success: false,
        ip,
        latency: null,
        error: 'Timeout en ping'
      });
    }, config.timeoutMs + 1000); // +1s de margen

    pingProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pingProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pingProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code === 0) {
        const parseResult = parsePingOutput(output, config.platform);
        resolve({
          success: parseResult.success,
          ip,
          latency: parseResult.latency,
          latencies: parseResult.latencies,
          minLatency: parseResult.minLatency,
          maxLatency: parseResult.maxLatency,
          error: parseResult.error
        });
      } else {
        resolve({
          success: false,
          ip,
          latency: null,
          error: `Ping falló con código ${code}: ${errorOutput}`
        });
      }
    });

    pingProcess.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        ip,
        latency: null,
        error: `Error ejecutando ping: ${error.message}`
      });
    });
  });
}

/**
 * HERRAMIENTA PURA: Verifica si una latencia es válida según el umbral
 * @param {number} latency - Latencia en ms
 * @param {number} maxLatency - Latencia máxima permitida
 * @returns {boolean} True si la latencia es válida
 */
export function isLatencyValid(latency, maxLatency = DEFAULT_LATENCY_CONFIG.maxLatencyMs) {
  return typeof latency === 'number' && latency > 0 && latency <= maxLatency;
}

/**
 * HERRAMIENTA PURA: Crea estadísticas de validación de latencia
 * @param {Array} results - Resultados de ping
 * @param {Object} config - Configuración utilizada
 * @returns {Object} Estadísticas detalladas
 */
export function createLatencyStats(results, config = DEFAULT_LATENCY_CONFIG) {
  if (!Array.isArray(results)) {
    return {
      totalIps: 0,
      validIps: 0,
      invalidIps: 0,
      errorIps: 0,
      validationRate: '0.0',
      avgLatency: 0,
      minLatency: 0,
      maxLatency: 0
    };
  }

  const validResults = results.filter(r => r.success && isLatencyValid(r.latency, config.maxLatencyMs));
  const invalidResults = results.filter(r => r.success && !isLatencyValid(r.latency, config.maxLatencyMs));
  const errorResults = results.filter(r => !r.success);

  const validLatencies = validResults.map(r => r.latency).filter(l => l !== null);

  return {
    totalIps: results.length,
    validIps: validResults.length,
    invalidIps: invalidResults.length,
    errorIps: errorResults.length,
    validationRate: results.length > 0 ? ((validResults.length / results.length) * 100).toFixed(1) : '0.0',
    avgLatency: validLatencies.length > 0 ? Math.round(validLatencies.reduce((sum, lat) => sum + lat, 0) / validLatencies.length) : 0,
    minLatency: validLatencies.length > 0 ? Math.min(...validLatencies) : 0,
    maxLatency: validLatencies.length > 0 ? Math.max(...validLatencies) : 0,
    maxAllowedLatency: config.maxLatencyMs
  };
}

/**
 * HERRAMIENTA PURA: Valida configuración de latencia
 * @param {Object} config - Configuración a validar
 * @returns {Object} Configuración validada
 */
export function validateLatencyConfig(config = {}) {
  const validated = {
    ...DEFAULT_LATENCY_CONFIG,
    ...config
  };

  // Validaciones específicas
  if (validated.maxLatencyMs <= 0) {
    validated.maxLatencyMs = DEFAULT_LATENCY_CONFIG.maxLatencyMs;
  }

  if (validated.timeoutMs <= 0) {
    validated.timeoutMs = DEFAULT_LATENCY_CONFIG.timeoutMs;
  }

  if (validated.concurrency <= 0) {
    validated.concurrency = DEFAULT_LATENCY_CONFIG.concurrency;
  }

  if (validated.pingCount <= 0) {
    validated.pingCount = DEFAULT_LATENCY_CONFIG.pingCount;
  }

  if (validated.retries < 0) {
    validated.retries = DEFAULT_LATENCY_CONFIG.retries;
  }

  return validated;
}

/**
 * HERRAMIENTA PURA: Crea mensaje de log para validación de latencia
 * @param {string} ip - IP procesada
 * @param {Object} result - Resultado del ping
 * @returns {string} Mensaje de log formateado
 */
export function createLatencyLogMessage(ip, result) {
  const timestamp = new Date().toISOString();
  
  if (result.success) {
    return `[${timestamp}] IP ${ip}: ${result.latency}ms (${result.minLatency}-${result.maxLatency}ms)`;
  } else {
    return `[${timestamp}] IP ${ip}: ERROR - ${result.error}`;
  }
}

/**
 * HERRAMIENTA PURA: Agrupa IPs en lotes para procesamiento concurrente
 * @param {Array} ips - Lista de IPs
 * @param {number} batchSize - Tamaño del lote
 * @returns {Array} Array de lotes de IPs
 */
export function createIpBatches(ips, batchSize = DEFAULT_LATENCY_CONFIG.concurrency) {
  if (!Array.isArray(ips) || batchSize <= 0) {
    return [];
  }

  const batches = [];
  for (let i = 0; i < ips.length; i += batchSize) {
    batches.push(ips.slice(i, i + batchSize));
  }

  return batches;
}