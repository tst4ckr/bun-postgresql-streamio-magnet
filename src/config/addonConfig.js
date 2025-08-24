/**
 * @fileoverview addonConfig - Configuración centralizada para el addon de magnets.
 * Carga la configuración desde variables de entorno y define el manifiesto del addon.
 */

import dotenv from 'dotenv';

dotenv.config();

const config = {
  addon: {
    id: process.env.ADDON_ID || 'com.stremio.magnet.search',
    version: process.env.ADDON_VERSION || '1.0.0',
    name: process.env.ADDON_NAME || 'Magnet Search',
    description: process.env.ADDON_DESCRIPTION || 'Addon para buscar enlaces magnéticos de películas y series en un archivo CSV.',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
  },
  server: {
    port: process.env.PORT || 7000,
  },
  cache: {
    streamCacheMaxAge: process.env.CACHE_STREAM_MAX_AGE || 3600, // 1 hora
    streamStaleRevalidate: process.env.CACHE_STREAM_STALE_REVALIDATE || 3600,
    streamStaleError: process.env.CACHE_STREAM_STALE_ERROR || 86400, // 1 día
  },
  logging: {
    logLevel: process.env.LOG_LEVEL || 'info', // 'debug', 'info', 'warn', 'error'
  },
  repository: {
    csvFilePath: process.env.CSV_FILE_PATH || './data/magnets.csv'
  }
};

/**
 * Genera el manifiesto del addon a partir de la configuración.
 * @returns {Object} Manifiesto de Stremio.
 */
function generateManifest() {
  return {
    id: config.addon.id,
    version: config.addon.version,
    name: config.addon.name,
    description: config.addon.description,
    resources: config.addon.resources,
    types: config.addon.types,
    catalogs: config.addon.catalogs,
    idPrefixes: config.addon.idPrefixes,
    behaviorHints: {
      configurable: false,
      configurationRequired: false
    }
  };
}

export const addonConfig = Object.freeze(config);
export const manifest = Object.freeze(generateManifest());