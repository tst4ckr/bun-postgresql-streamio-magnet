/**
 * @fileoverview addonConfig - Configuración centralizada para el addon de magnets.
 * Carga la configuración desde variables de entorno y define el manifiesto del addon.
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Detectar si estamos en un contenedor
const isContainer = process.env.NODE_ENV === 'production' && process.env.CONTAINER_ENV === 'true';

// Obtener directorio del proyecto
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Función para resolver rutas según el entorno
function resolvePath(relativePath) {
  if (isContainer) {
    // En contenedor, usar rutas relativas desde /app
    return join('/app', relativePath);
  }
  // En desarrollo local, usar rutas relativas desde el proyecto
  return join(projectRoot, relativePath);
}

const config = {
  addon: {
    id: process.env.ADDON_ID || 'org.stremio.torrent.search',
    version: process.env.ADDON_VERSION || '1.2.0',
    name: process.env.ADDON_NAME || 'Torrent Search Pro',
    description: process.env.ADDON_DESCRIPTION || 'Advanced torrent search addon with multiple providers for movies, series and anime with high-quality streams. Full anime support with specialized providers.',
    logo: process.env.ADDON_LOGO || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgdmlld0JveD0iMCAwIDI1NiAyNTYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2IiBmaWxsPSIjMWExYTFhIi8+Cjx0ZXh0IHg9IjEyOCIgeT0iMTQwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNzIiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5UUzwvdGV4dD4KPC9zdmc+',
    background: process.env.ADDON_BACKGROUND || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiB2aWV3Qm94PSIwIDAgMTkyMCAxMDgwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTkyMCIgaGVpZ2h0PSIxMDgwIiBmaWxsPSIjMWExYTFhIi8+Cjx0ZXh0IHg9Ijk2MCIgeT0iNTgwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iODAiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5Ub3JyZW50IFNlYXJjaDwvdGV4dD4KPC9zdmc+',
    resources: [
      {
        name: 'stream',
        types: ['movie', 'series', 'anime'],
        idPrefixes: ['tt', 'kitsu:']
      }
    ],
    types: ['movie', 'series', 'anime'],
    catalogs: [],
    idPrefixes: ['tt', 'kitsu:']
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
    primaryCsvPath: process.env.PRIMARY_CSV_PATH || resolvePath('data/magnets.csv'),
    secondaryCsvPath: process.env.SECONDARY_CSV_PATH || resolvePath('data/torrentio.csv'),
    torrentioApiUrl: process.env.TORRENTIO_API_URL || 'https://torrentio.strem.fun/',
    timeout: parseInt(process.env.CSV_TIMEOUT) || 30000
  }
};

// Cache para el manifest generado
let manifestCache = null;
let manifestCacheTimestamp = null;
const MANIFEST_CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutos

/**
 * Genera el manifiesto del addon a partir de la configuración con cache.
 * @returns {Object} Manifiesto de Stremio optimizado.
 */
function generateManifest() {
  // Verificar cache
  const now = Date.now();
  if (manifestCache && manifestCacheTimestamp && (now - manifestCacheTimestamp) < MANIFEST_CACHE_EXPIRY) {
    return manifestCache;
  }

  // Generar manifest fresco
  const manifest = {
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

  // Actualizar cache
  manifestCache = manifest;
  manifestCacheTimestamp = now;

  return manifest;
}

/**
 * Limpia el cache del manifest (útil para testing o actualizaciones).
 */
function clearManifestCache() {
  manifestCache = null;
  manifestCacheTimestamp = null;
}

export const addonConfig = Object.freeze(config);
export const manifest = Object.freeze(generateManifest());
export { clearManifestCache };