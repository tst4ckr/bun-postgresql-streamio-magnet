/**
 * @fileoverview addonConfig - Configuración centralizada para el addon de magnets.
 * Carga la configuración desde variables de entorno y define el manifiesto del addon.
 */

import dotenv from 'dotenv';

dotenv.config();

const config = {
  addon: {
    id: process.env.ADDON_ID || 'org.stremio.torrent.search',
    version: process.env.ADDON_VERSION || '1.2.0',
    name: process.env.ADDON_NAME || 'Torrent Search Pro',
    description: process.env.ADDON_DESCRIPTION || 'Advanced torrent search addon with multiple providers (MejorTorrent, Wolfmax4k, Cinecalidad) for movies and series with high-quality streams.',
    logo: process.env.ADDON_LOGO || 'https://via.placeholder.com/256x256/1a1a1a/ffffff?text=TS',
    background: process.env.ADDON_BACKGROUND || 'https://via.placeholder.com/1920x1080/1a1a1a/ffffff?text=Torrent+Search',
    resources: [
      {
        name: 'stream',
        types: ['movie', 'series'],
        idPrefixes: ['tt']
      }
    ],
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
    csvSource: process.env.CSV_SOURCE || process.env.CSV_FILE_PATH || './data/magnets.csv',
    timeout: parseInt(process.env.CSV_TIMEOUT) || 30000
  }
};

/**
 * Genera el manifiesto del addon a partir de la configuración.
 * @returns {Object} Manifiesto de Stremio optimizado.
 */
function generateManifest() {
  return {
    id: config.addon.id,
    version: config.addon.version,
    name: config.addon.name,
    description: config.addon.description,
    logo: config.addon.logo,
    background: config.addon.background,
    resources: config.addon.resources,
    types: config.addon.types,
    catalogs: config.addon.catalogs,
    idPrefixes: config.addon.idPrefixes,
    behaviorHints: {
      configurable: false,
      configurationRequired: false,
      adult: false,
      p2p: true
    }
  };
}

export const addonConfig = Object.freeze(config);
export const manifest = Object.freeze(generateManifest());