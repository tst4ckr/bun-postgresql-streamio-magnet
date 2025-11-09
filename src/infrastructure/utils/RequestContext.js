/**
 * RequestContext - almacena información por solicitud (IP, headers, etc.) usando AsyncLocalStorage.
 * Permite acceder al contexto dentro de los handlers del addon donde no tenemos acceso directo a req.
 */
import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage();

export const RequestContext = {
  run(req, fn) {
    const ip = extractClientIp(req);
    const ctx = { ip, headers: req.headers };
    return storage.run(ctx, fn);
  },
  get() {
    return storage.getStore() || null;
  },
  getIp() {
    const s = storage.getStore();
    return s?.ip || null;
  }
};

/**
 * Extrae la IP del cliente de forma robusta.
 */
export function extractClientIp(req) {
  try {
    // Respetar X-Forwarded-For (puede contener múltiples IPs)
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const parts = String(xff).split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length) return parts[0];
    }
    // Express genera req.ip si trust proxy está habilitado
    if (req.ip) return req.ip;
    // Fallback a la dirección remota del socket
    const ra = req.socket?.remoteAddress || req.connection?.remoteAddress;
    if (ra) return ra;
  } catch (_) {}
  return null;
}