/**
 * IpRoutingService - gestiona whitelist de IPs y caché de verificación.
 */
export class IpRoutingService {
  #whitelist;
  #cacheTtlMs;
  #cache; // Map<ip, { allowed: boolean, expires: number }>
  #logger;

  constructor(whitelist = [], cacheTtlSeconds = 300, logger) {
    this.#whitelist = new Set(whitelist.map(s => s.trim()).filter(Boolean));
    this.#cacheTtlMs = Math.max(1, Number(cacheTtlSeconds)) * 1000;
    this.#cache = new Map();
    this.#logger = logger;
  }

  isWhitelisted(ip) {
    if (!ip) return false;
    const now = Date.now();
    const hit = this.#cache.get(ip);
    if (hit && hit.expires > now) return hit.allowed;

    const allowed = this.#whitelist.has(ip);
    this.#cache.set(ip, { allowed, expires: now + this.#cacheTtlMs });
    return allowed;
  }

  addToWhitelist(ip) {
    if (!ip) return;
    this.#whitelist.add(ip.trim());
    // invalidar caché para esa IP
    this.#cache.delete(ip.trim());
  }

  removeFromWhitelist(ip) {
    if (!ip) return;
    this.#whitelist.delete(ip.trim());
    this.#cache.delete(ip.trim());
  }
}