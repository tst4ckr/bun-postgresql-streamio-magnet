/**
 * DynamicTvRepository - selecciona el repositorio de TV en función de la IP del cliente.
 * Implementa la misma interfaz que CsvTvRepository/M3UTvRepository.
 */
import { RequestContext } from '../utils/RequestContext.js';

export class DynamicTvRepository {
  #whitelistRepo;
  #defaultRepo;
  #m3uRepo;
  #m3uBackupRepo;
  #ipRoutingService;
  #logger;
  #assignmentCache; // Map<ip|null, { repoName: string, expires: number }>
  #assignmentTtlMs;

  constructor(options, ipRoutingService, logger) {
    const {
      whitelistRepo = null,
      defaultRepo = null,
      m3uRepo = null,
      m3uBackupRepo = null,
      assignmentCacheTtlSeconds = 60
    } = options || {};

    this.#whitelistRepo = whitelistRepo;
    this.#defaultRepo = defaultRepo;
    this.#m3uRepo = m3uRepo;
    this.#m3uBackupRepo = m3uBackupRepo;
    this.#ipRoutingService = ipRoutingService;
    this.#logger = logger;
    this.#assignmentCache = new Map();
    this.#assignmentTtlMs = Math.max(1, Number(assignmentCacheTtlSeconds)) * 1000;
  }

  /** Selecciona el repositorio apropiado según la IP actual */
  #selectRepoForCurrentRequest() {
    const ip = RequestContext.getIp();
    const now = Date.now();

    // Cachear selección por IP para evitar logs excesivos
    const cached = this.#assignmentCache.get(ip || 'unknown');
    if (cached && cached.expires > now) {
      return this.#resolveRepoByName(cached.repoName);
    }

    let repo = null;
    let repoName = 'none';
    const allowed = this.#ipRoutingService?.isWhitelisted(ip);

    if (allowed && this.#whitelistRepo) {
      repo = this.#whitelistRepo;
      repoName = 'csv_whitelist';
    } else if (this.#defaultRepo) {
      repo = this.#defaultRepo;
      repoName = 'csv_default';
    } else if (this.#m3uRepo) {
      repo = this.#m3uRepo;
      repoName = 'm3u_primary';
    } else if (this.#m3uBackupRepo) {
      repo = this.#m3uBackupRepo;
      repoName = 'm3u_backup';
    }

    // Auditar asignación
    const ipLabel = ip || 'unknown';
    this.#logger?.info(`[IP Routing] Asignación repo='${repoName}' para IP='${ipLabel}'`, {
      ip: ipLabel,
      repo: repoName,
      allowed
    });

    // Cachear resultado de asignación
    this.#assignmentCache.set(ip || 'unknown', { repoName, expires: now + this.#assignmentTtlMs });
    return repo;
  }

  #resolveRepoByName(name) {
    switch (name) {
      case 'csv_whitelist': return this.#whitelistRepo;
      case 'csv_default': return this.#defaultRepo;
      case 'm3u_primary': return this.#m3uRepo;
      case 'm3u_backup': return this.#m3uBackupRepo;
      default: return null;
    }
  }

  async getAllTvs() {
    const repo = this.#selectRepoForCurrentRequest();
    if (!repo) return [];
    return repo.getAllTvs();
  }

  async getTvById(id) {
    const repo = this.#selectRepoForCurrentRequest();
    if (!repo) return null;
    return repo.getTvById(id);
  }
}