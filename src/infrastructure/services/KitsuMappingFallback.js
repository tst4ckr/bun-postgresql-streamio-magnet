/**
 * Servicio de mapeos dinámico para conversión de IDs de anime
 * Elimina dependencia de mapeos estáticos, usa API dinámica y solo fallback manual para casos críticos
 */

export class KitsuMappingFallback {
  constructor() {
    // Mapeos críticos de respaldo (solo casos extremos)
    this.criticalMappings = new Map();
    
    // Metadatos para mapeos críticos
    this.criticalMetadata = new Map();
    
    // Configuración para manejo dinámico
    this.config = {
      enableDynamicLookup: true,
      enableCriticalFallback: true,
      cacheExpiry: 24 * 60 * 60 * 1000, // 24 horas
      maxCriticalMappings: 10 // Limitar mapeos críticos a 5-10 animes
    };
    
    // Cache para mapeos críticos
    this.criticalCache = new Map();
    
    // Inicializar solo mapeos críticos de respaldo
    this.#initializeCriticalMappings();
  }

  /**
   * Inicializa solo mapeos críticos de respaldo (casos extremos)
   * @private
   */
  #initializeCriticalMappings() {
    // Solo animes extremadamente populares o problemáticos (máximo 5-10)
    const criticalMappings = [
      // Casos críticos donde la API puede fallar
      { serviceId: '1', imdbId: 'tt0112718', title: 'Cowboy Bebop', year: 1998, type: 'TV' },
      { serviceId: '9253', imdbId: 'tt0877057', title: 'Death Note', year: 2006, type: 'TV' },
      { serviceId: '12', imdbId: 'tt0388629', title: 'Naruto', year: 2002, type: 'TV' }
    ];
    
    for (const mapping of criticalMappings) {
      this.addCriticalMapping(mapping.serviceId, mapping.imdbId, {
        title: mapping.title,
        type: mapping.type,
        year: mapping.year,
        source: 'critical_fallback'
      });
    }
  }

  /**
   * Agrega un mapeo crítico de respaldo (solo casos extremos)
   * @param {string} serviceId - ID del servicio
   * @param {string} imdbId - ID de IMDb
   * @param {Object} metadata - Metadatos opcionales
   */
  addCriticalMapping(serviceId, imdbId, metadata = null) {
    const numericId = serviceId.toString();
    this.criticalMappings.set(numericId, imdbId);
    
    if (metadata) {
      this.criticalMetadata.set(numericId, {
        ...metadata,
        addedAt: new Date().toISOString(),
        source: 'critical_fallback'
      });
    }
    
    console.info(`✅ Mapeo crítico agregado: ${serviceId} → ${imdbId}`);
  }

  /**
   * Remueve un mapeo crítico
   * @param {string} serviceId - ID del servicio a remover
   */
  removeCriticalMapping(serviceId) {
    const numericId = serviceId.toString();
    const removed = this.criticalMappings.delete(numericId);
    this.criticalMetadata.delete(numericId);
    
    if (removed) {
      console.info(`🗑️ Mapeo crítico removido: ${serviceId}`);
    }
    
    return removed;
  }

  /**
   * Servicio de fallback dinámico - delega a la API primero
   * @param {string} animeId - ID de anime con prefijo (mal:5114, kitsu:48671, etc.)
   * @returns {string|null} IMDb ID o null si no se encuentra
   */
  getImdbIdFromAny(animeId) {
    if (!animeId) return null;
    
    const normalizedId = animeId.toString().trim();
    
    // Si es IMDb directo, retornar tal cual
    if (normalizedId.startsWith('tt')) {
      return normalizedId;
    }
    
    // Extraer ID numérico para búsqueda
    let numericId = normalizedId;
    let serviceType = 'kitsu';
    
    if (normalizedId.includes(':')) {
      const parts = normalizedId.split(':');
      serviceType = parts[0];
      numericId = parts[1];
    }
    
    // Buscar solo en mapeos críticos como último recurso
    const criticalImdbId = this.criticalMappings.get(numericId);
    if (criticalImdbId) {
      console.info(`🎯 Mapeo crítico encontrado: ${serviceType}:${numericId} → ${criticalImdbId}`);
      return criticalImdbId;
    }
    
    // No usar mapeos estáticos - delegar a servicios dinámicos
    console.debug(`🔄 Delegando a servicio dinámico para: ${serviceType}:${numericId}`);
    return null; // Indicar que debe usar servicio dinámico
  }

  /**
   * Método optimizado para servicio de fallback
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {string|null} IMDb ID o null si no se encuentra en mapeos críticos
   */
  getImdbIdFromKitsu(kitsuId) {
    if (!kitsuId) return null;
    
    const numericId = kitsuId.toString();
    const criticalImdbId = this.criticalMappings.get(numericId);
    
    if (criticalImdbId) {
      console.info(`🎯 Mapeo crítico Kitsu: ${numericId} → ${criticalImdbId}`);
      return criticalImdbId;
    }
    
    return null; // Delegar a servicio dinámico
  }

  /**
   * Obtiene metadatos de anime desde mapeos críticos
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {Object|null} Metadatos del anime o null
   */
  getAnimeMetadata(kitsuId) {
    const numericId = kitsuId.toString();
    return this.criticalMetadata.get(numericId) || null;
  }

  /**
   * Verifica si existe mapeo crítico para un Kitsu ID
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {boolean} True si existe mapeo crítico
   */
  hasMapping(kitsuId) {
    const numericId = kitsuId.toString();
    return this.criticalMappings.has(numericId);
  }

  /**
   * Obtiene todos los mapeos críticos disponibles
   * @returns {Array} Array de objetos con kitsuId, imdbId y metadata
   */
  getAllMappings() {
    const mappings = [];
    
    for (const [kitsuId, imdbId] of this.criticalMappings.entries()) {
      const metadata = this.criticalMetadata.get(kitsuId);
      mappings.push({
        kitsuId: `kitsu:${kitsuId}`,
        imdbId,
        title: metadata?.title || 'Título desconocido',
        year: metadata?.year,
        type: metadata?.type,
        source: metadata?.source
      });
    }
    
    return mappings.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Busca mapeos críticos por título (búsqueda parcial)
   * @param {string} searchTerm - Término de búsqueda
   * @returns {Array} Array de mapeos que coinciden
   */
  searchByTitle(searchTerm) {
    const term = searchTerm.toLowerCase();
    return this.getAllMappings().filter(mapping => 
      mapping.title.toLowerCase().includes(term)
    );
  }

  /**
   * Obtiene estadísticas de mapeos críticos disponibles
   * @returns {Object} Estadísticas de mapeos críticos
   */
  getStats() {
    return {
      totalCriticalMappings: this.criticalMappings.size,
      withMetadata: this.criticalMetadata.size,
      coverage: this.criticalMappings.size > 0 ? Math.round((this.criticalMetadata.size / this.criticalMappings.size) * 100) : 0,
      cacheSize: this.criticalCache.size,
      config: this.config,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Carga mapeos críticos desde una fuente externa (solo casos extremos)
   * @param {Array|Object} mappings - Mapeos críticos a cargar
   * @param {string} source - Fuente de los mapeos
   */
  loadMappingsFromSource(mappings, source = 'external') {
    let loaded = 0;
    
    try {
      const mappingArray = Array.isArray(mappings) ? mappings : Object.entries(mappings);
      
      for (const [kitsuId, data] of mappingArray) {
        if (typeof data === 'string') {
          // Mapeo simple: kitsuId -> imdbId
          this.addCriticalMapping(kitsuId, data);
          loaded++;
        } else if (data && data.imdbId) {
          // Mapeo con metadatos
          this.addCriticalMapping(kitsuId, data.imdbId, {
            ...data,
            source
          });
          loaded++;
        }
      }
      
      console.info(`📥 Cargados ${loaded} mapeos críticos desde ${source}`);
      return { success: true, loaded, source };
      
    } catch (error) {
      console.error(`❌ Error cargando mapeos críticos desde ${source}:`, error);
      return { success: false, loaded, error: error.message, source };
    }
  }

  /**
   * Limpia mapeos expirados del cache crítico
   */
  cleanExpiredMappings() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.criticalCache.entries()) {
      if (now - value.timestamp > this.config.cacheExpiry) {
        this.criticalCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.info(`🧹 Limpiados ${cleaned} mapeos expirados del cache crítico`);
    }
    
    return cleaned;
  }

  /**
   * Exporta todos los mapeos críticos actuales
   * @returns {Object} Mapeos críticos exportados con metadatos
   */
  exportMappings() {
    const exported = {};
    
    for (const [kitsuId, imdbId] of this.criticalMappings.entries()) {
      const metadata = this.criticalMetadata.get(kitsuId);
      exported[kitsuId] = {
        imdbId,
        metadata: metadata || null,
        exportedAt: new Date().toISOString()
      };
    }
    
    return {
      mappings: exported,
      stats: this.getStats(),
      exportedAt: new Date().toISOString()
    };
  }
}

// Instancia singleton
export const kitsuMappingFallback = new KitsuMappingFallback();