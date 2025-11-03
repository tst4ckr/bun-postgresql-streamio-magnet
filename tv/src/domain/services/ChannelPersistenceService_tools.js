/**
 * @fileoverview ChannelPersistenceService Tools - Herramientas auxiliares para persistencia de canales
 * Responsabilidad única: funciones puras y utilidades reutilizables
 */

import { createObjectCsvWriter } from 'csv-writer';
import { RepositoryError } from '../repositories/ChannelRepository.js';

/**
 * Configuración estándar para el escritor CSV de canales
 * @constant {Array<Object>}
 */
export const CSV_HEADER_CONFIG = [
  { id: 'id', title: 'id' },
  { id: 'name', title: 'name' },
  { id: 'stream_url', title: 'stream_url' },
  { id: 'logo', title: 'logo' },
  { id: 'genre', title: 'genre' },
  { id: 'country', title: 'country' },
  { id: 'language', title: 'language' },
  { id: 'quality', title: 'quality' },
  { id: 'type', title: 'type' },
  { id: 'is_active', title: 'is_active' }
];

/**
 * Valores por defecto para campos de canal
 * @constant {Object}
 */
export const CHANNEL_DEFAULTS = {
  genre: 'General',
  country: 'Internacional',
  language: 'es',
  quality: 'AUTO',
  type: 'TV'
};

/**
 * Crea un escritor CSV configurado para canales
 * @param {string} filePath - Ruta del archivo CSV
 * @param {string} encoding - Codificación del archivo (default: 'utf8')
 * @returns {Object} - Escritor CSV configurado
 */
export function createChannelCSVWriter(filePath, encoding = 'utf8') {
  return createObjectCsvWriter({
    path: filePath,
    header: CSV_HEADER_CONFIG,
    encoding
  });
}

/**
 * Convierte un canal al formato de registro CSV
 * Función pura sin efectos secundarios
 * @param {Object} channel - Canal a convertir
 * @returns {Object} - Registro CSV
 */
export function channelToCSVRecord(channel) {
  return {
    id: channel.id || '',
    name: channel.name || '',
    stream_url: channel.streamUrl || '',
    logo: channel.logo || '',
    genre: channel.genre || CHANNEL_DEFAULTS.genre,
    country: channel.country || CHANNEL_DEFAULTS.country,
    language: channel.language || CHANNEL_DEFAULTS.language,
    quality: channel.quality || CHANNEL_DEFAULTS.quality,
    type: channel.type || CHANNEL_DEFAULTS.type,
    is_active: channel.isActive !== false ? 'true' : 'false'
  };
}

/**
 * Convierte múltiples canales al formato CSV
 * Función pura que procesa arrays de canales
 * @param {Array<Object>} channels - Canales a convertir
 * @returns {Array<Object>} - Registros CSV
 */
export function channelsToCSVRecords(channels) {
  return channels.map(channel => channelToCSVRecord(channel));
}

/**
 * Valida que un canal tenga los campos mínimos requeridos
 * Función pura de validación
 * @param {Object} channel - Canal a validar
 * @returns {boolean} - True si el canal es válido
 */
export function isValidChannel(channel) {
  return !!(channel.name && channel.streamUrl);
}

/**
 * Filtra canales válidos y separa los inválidos con sus razones
 * Función pura que no modifica los datos originales
 * @param {Array<Object>} channels - Canales a validar
 * @returns {Object} - {validChannels, invalidChannels}
 */
export function separateValidChannels(channels) {
  const validChannels = [];
  const invalidChannels = [];

  channels.forEach((channel, index) => {
    if (isValidChannel(channel)) {
      validChannels.push(channel);
    } else {
      invalidChannels.push({
        index,
        channel,
        reason: 'Faltan campos requeridos (name, streamUrl)'
      });
    }
  });

  return { validChannels, invalidChannels };
}

/**
 * Detecta el protocolo de una URL de stream
 * Función pura para análisis de protocolos
 * @param {string} streamUrl - URL del stream
 * @returns {string} - Protocolo detectado ('http', 'https', 'other')
 */
export function detectStreamProtocol(streamUrl) {
  if (!streamUrl) return 'other';
  
  if (streamUrl.startsWith('http://')) return 'http';
  if (streamUrl.startsWith('https://')) return 'https';
  return 'other';
}

/**
 * Calcula estadísticas de canales
 * Función pura que analiza datos sin modificarlos
 * @param {Array<Object>} channels - Canales a analizar
 * @returns {Object} - Estadísticas calculadas
 */
export function calculateChannelStatistics(channels) {
  const stats = {
    total: channels.length,
    byProtocol: { http: 0, https: 0, other: 0 },
    byCountry: {},
    byGenre: {},
    active: 0,
    inactive: 0
  };

  channels.forEach(channel => {
    // Protocolo
    const protocol = detectStreamProtocol(channel.streamUrl);
    stats.byProtocol[protocol]++;

    // País
    const country = channel.country || 'Desconocido';
    stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;

    // Género
    const genre = channel.genre || CHANNEL_DEFAULTS.genre;
    stats.byGenre[genre] = (stats.byGenre[genre] || 0) + 1;

    // Estado
    if (channel.isActive !== false) {
      stats.active++;
    } else {
      stats.inactive++;
    }
  });

  return stats;
}

/**
 * Genera un timestamp para nombres de archivo de respaldo
 * Función pura para generación de timestamps
 * @param {Date} date - Fecha base (default: new Date())
 * @returns {string} - Timestamp formateado
 */
export function generateBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Genera la ruta de archivo de respaldo
 * Función pura para construcción de rutas
 * @param {string} originalPath - Ruta del archivo original
 * @param {string} timestamp - Timestamp para el respaldo
 * @returns {string} - Ruta del archivo de respaldo
 */
export function generateBackupPath(originalPath, timestamp) {
  return `${originalPath}.backup-${timestamp}`;
}

/**
 * Verifica si un archivo existe de forma asíncrona
 * Utilidad para verificación de archivos
 * @param {string} filePath - Ruta del archivo
 * @returns {Promise<boolean>} - True si el archivo existe
 */
export async function fileExists(filePath) {
  try {
    const fs = await import('fs');
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Copia un archivo de forma asíncrona
 * Utilidad para operaciones de archivo
 * @param {string} sourcePath - Ruta del archivo origen
 * @param {string} destinationPath - Ruta del archivo destino
 * @returns {Promise<void>}
 * @throws {Error} - Si hay error en la copia
 */
export async function copyFile(sourcePath, destinationPath) {
  const fs = await import('fs');
  await fs.promises.copyFile(sourcePath, destinationPath);
}

/**
 * Escribe registros CSV usando el escritor proporcionado
 * Utilidad para escritura de CSV
 * @param {Object} csvWriter - Escritor CSV configurado
 * @param {Array<Object>} records - Registros a escribir
 * @returns {Promise<void>}
 * @throws {Error} - Si hay error en la escritura
 */
export async function writeCSVRecords(csvWriter, records) {
  await csvWriter.writeRecords(records);
}

/**
 * Crea un error de repositorio con mensaje y causa
 * Utilidad para manejo de errores
 * @param {string} message - Mensaje del error
 * @param {Error} cause - Error original
 * @returns {RepositoryError} - Error de repositorio
 */
export function createRepositoryError(message, cause) {
  return new RepositoryError(message, cause);
}

export default {
  CSV_HEADER_CONFIG,
  CHANNEL_DEFAULTS,
  createChannelCSVWriter,
  channelToCSVRecord,
  channelsToCSVRecords,
  isValidChannel,
  separateValidChannels,
  detectStreamProtocol,
  calculateChannelStatistics,
  generateBackupTimestamp,
  generateBackupPath,
  fileExists,
  copyFile,
  writeCSVRecords,
  createRepositoryError
};