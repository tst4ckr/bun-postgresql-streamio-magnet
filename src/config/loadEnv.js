/**
 * loadEnv - Inicializa variables de entorno desde .env exactamente una vez.
 * Evita múltiples cargas que pueden provocar efectos secundarios o bucles.
 */
import dotenv from 'dotenv';

// Usar una marca global para evitar múltiples ejecuciones en entornos con recarga
const GLOBAL_FLAG = '__addon_env_initialized__';

// @ts-ignore
if (!globalThis[GLOBAL_FLAG]) {
  dotenv.config();
  // @ts-ignore
  globalThis[GLOBAL_FLAG] = true;
}

export const envInitialized = true;