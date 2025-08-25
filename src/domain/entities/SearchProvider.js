import { z } from 'zod';

/**
 * @fileoverview SearchProvider Entity - Representa un proveedor de búsqueda de torrents
 * Implementa principios DDD con configuración y capacidades del proveedor
 */

const SearchProviderSchema = z.object({
  id: z.string().min(1, 'El ID no puede estar vacío'),
  name: z.string().min(1, 'El nombre no puede estar vacío'),
  baseUrl: z.string().url('URL base inválida'),
  language: z.enum(['es', 'en', 'multi']).default('es'),
  priority: z.number().int().min(1).max(10).default(5),
  enabled: z.boolean().default(true),
  rateLimit: z.object({
    requestsPerMinute: z.number().int().min(1).default(30),
    requestsPerHour: z.number().int().min(1).default(1000)
  }).default({ requestsPerMinute: 30, requestsPerHour: 1000 }),
  capabilities: z.object({
    supportsMovies: z.boolean().default(true),
    supportsSeries: z.boolean().default(true),
    supportsQualityFilter: z.boolean().default(false),
    supportsYearFilter: z.boolean().default(false),
    supportsImdbSearch: z.boolean().default(false),
    requiresCloudflareBypass: z.boolean().default(false)
  }).default({}),
  selectors: z.object({
    searchUrl: z.string().min(1, 'URL de búsqueda requerida'),
    resultContainer: z.string().min(1, 'Selector de contenedor requerido'),
    titleSelector: z.string().min(1, 'Selector de título requerido'),
    magnetSelector: z.string().min(1, 'Selector de magnet requerido'),
    sizeSelector: z.string().optional(),
    seedersSelector: z.string().optional(),
    leechersSelector: z.string().optional(),
    qualitySelector: z.string().optional(),
    dateSelector: z.string().optional()
  }),
  headers: z.record(z.string()).default({}),
  timeout: z.number().int().min(1000).max(30000).default(10000)
});

export class SearchProvider {
  constructor(data) {
    const validated = SearchProviderSchema.parse(data);
    Object.assign(this, validated);
    Object.freeze(this);
  }

  // Todos los métodos de creación de proveedores han sido eliminados

  /**
   * Construye la URL de búsqueda con el término proporcionado
   * @param {string} searchTerm - Término de búsqueda
   * @returns {string} URL completa de búsqueda
   */
  buildSearchUrl(searchTerm) {
    const encodedTerm = encodeURIComponent(searchTerm);
    const searchPath = this.selectors.searchUrl.replace('{term}', encodedTerm);
    return `${this.baseUrl}${searchPath}`;
  }

  /**
   * Verifica si el proveedor soporta el tipo de contenido
   * @param {string} contentType - Tipo de contenido ('movie' o 'series')
   * @returns {boolean}
   */
  supportsContentType(contentType) {
    if (contentType === 'movie') {
      return this.capabilities.supportsMovies;
    }
    if (contentType === 'series') {
      return this.capabilities.supportsSeries;
    }
    return false;
  }

  /**
   * Verifica si el proveedor está disponible para usar
   * @returns {boolean}
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * Obtiene la configuración de headers para las requests
   * @returns {Object}
   */
  getRequestHeaders() {
    return { ...this.headers };
  }

  /**
   * Obtiene la configuración de rate limiting
   * @returns {Object}
   */
  getRateLimitConfig() {
    return { ...this.rateLimit };
  }

  /**
   * Verifica si requiere bypass de Cloudflare
   * @returns {boolean}
   */
  requiresCloudflareBypass() {
    return this.capabilities.requiresCloudflareBypass;
  }

  /**
   * Obtiene la prioridad del proveedor (menor número = mayor prioridad)
   * @returns {number}
   */
  getPriority() {
    return this.priority;
  }

  /**
   * Compara proveedores por prioridad
   * @param {SearchProvider} other - Otro proveedor
   * @returns {number} -1 si este tiene mayor prioridad, 1 si menor, 0 si igual
   */
  comparePriority(other) {
    return this.priority - other.priority;
  }
}