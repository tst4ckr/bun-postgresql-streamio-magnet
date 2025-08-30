/**
 * Servicio de mapeos de respaldo para Kitsu → IMDb
 * Proporciona mapeos manuales cuando la API de Kitsu no tiene datos disponibles
 */

export class KitsuMappingFallback {
  constructor() {
    // Mapeos dinámicos de Kitsu ID → IMDb ID
    // Se cargan dinámicamente desde fuentes externas o se agregan en tiempo de ejecución
    this.manualMappings = new Map();
    
    // Configuración para carga dinámica de mapeos
    this.mappingConfig = {
      autoLoadFromApi: true,
      fallbackToManual: true,
      cacheExpiry: 24 * 60 * 60 * 1000, // 24 horas
      maxMappings: 10000
    };
    
    // Cache de mapeos con timestamp
    this.mappingCache = new Map();
    
    // Inicializar mapeos base si es necesario
    this.#initializeBaseMappings();
    
    // Metadatos dinámicos para animes mapeados
    this.animeMetadata = new Map();
  }

  /**
   * Inicializa mapeos base críticos de forma dinámica
   * Solo incluye mapeos esenciales para el funcionamiento
   * @private
   */
  #initializeBaseMappings() {
    // Solo mapeos críticos para funcionalidad básica
    // Estos se pueden cargar desde configuración externa
    const criticalMappings = this.#loadCriticalMappingsFromConfig();
    
    for (const [kitsuId, imdbId] of criticalMappings) {
      this.addMapping(kitsuId, imdbId);
    }
  }

  /**
   * Carga mapeos críticos desde configuración
   * @private
   * @returns {Array} Array de tuplas [kitsuId, imdbId]
   */
  #loadCriticalMappingsFromConfig() {
    // En una implementación real, esto cargaría desde:
    // - Variables de entorno
    // - Archivo de configuración
    // - Base de datos
    // - API externa
    
    // Por ahora, solo mapeos mínimos necesarios para el funcionamiento
    return [
      // Solo mapeos que son absolutamente necesarios para el funcionamiento actual
      ['48671', 'tt21209876'] // Solo Leveling - requerido por funcionalidad actual
    ];
  }

  /**
   * Agrega un mapeo de forma dinámica
   * @param {string} kitsuId - ID de Kitsu
   * @param {string} imdbId - ID de IMDb
   * @param {Object} metadata - Metadatos opcionales
   */
  addMapping(kitsuId, imdbId, metadata = null) {
    const numericId = kitsuId.toString();
    this.manualMappings.set(numericId, imdbId);
    
    if (metadata) {
      this.animeMetadata.set(numericId, {
        ...metadata,
        addedAt: new Date().toISOString(),
        source: 'dynamic'
      });
    }
    
    console.info(`✅ Mapeo agregado dinámicamente: kitsu:${numericId} → ${imdbId}`);
  }

  /**
   * Remueve un mapeo
   * @param {string} kitsuId - ID de Kitsu a remover
   */
  removeMapping(kitsuId) {
    const numericId = kitsuId.toString();
    const removed = this.manualMappings.delete(numericId);
    this.animeMetadata.delete(numericId);
    
    if (removed) {
      console.info(`🗑️ Mapeo removido: kitsu:${numericId}`);
    }
    
    return removed;
  }

  /**
   * Obtiene mapeo IMDb desde Kitsu ID usando mapeos manuales
   * @param {string} kitsuId - ID numérico de Kitsu (sin prefijo 'kitsu:')
   * @returns {string|null} IMDb ID o null si no se encuentra
   */
  getImdbIdFromKitsu(kitsuId) {
    const numericId = kitsuId.toString();
    const imdbId = this.manualMappings.get(numericId);
    
    if (imdbId) {
      console.info(`🎯 Mapeo manual encontrado: kitsu:${numericId} → ${imdbId}`);
      return imdbId;
    }
    
    return null;
  }

  /**
   * Obtiene metadatos de anime desde mapeos manuales
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {Object|null} Metadatos del anime o null
   */
  getAnimeMetadata(kitsuId) {
    const numericId = kitsuId.toString();
    return this.animeMetadata.get(numericId) || null;
  }

  /**
   * Verifica si existe mapeo manual para un Kitsu ID
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {boolean} True si existe mapeo manual
   */
  hasMapping(kitsuId) {
    const numericId = kitsuId.toString();
    return this.manualMappings.has(numericId);
  }

  /**
   * Obtiene todos los mapeos disponibles
   * @returns {Array} Array de objetos con kitsuId, imdbId y metadata
   */
  getAllMappings() {
    const mappings = [];
    
    for (const [kitsuId, imdbId] of this.manualMappings.entries()) {
      const metadata = this.animeMetadata.get(kitsuId);
      mappings.push({
        kitsuId: `kitsu:${kitsuId}`,
        imdbId,
        title: metadata?.title || 'Título desconocido',
        year: metadata?.year,
        episodes: metadata?.episodes,
        rating: metadata?.rating
      });
    }
    
    return mappings.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Busca mapeos por título (búsqueda parcial)
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
   * Obtiene estadísticas de mapeos disponibles
   * @returns {Object} Estadísticas de mapeos
   */
  getStats() {
    return {
      totalMappings: this.manualMappings.size,
      withMetadata: this.animeMetadata.size,
      coverage: this.manualMappings.size > 0 ? Math.round((this.animeMetadata.size / this.manualMappings.size) * 100) : 0,
      cacheSize: this.mappingCache.size,
      config: this.mappingConfig,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Carga mapeos desde una fuente externa
   * @param {Array|Object} mappings - Mapeos a cargar
   * @param {string} source - Fuente de los mapeos
   */
  loadMappingsFromSource(mappings, source = 'external') {
    let loaded = 0;
    
    try {
      const mappingArray = Array.isArray(mappings) ? mappings : Object.entries(mappings);
      
      for (const [kitsuId, data] of mappingArray) {
        if (typeof data === 'string') {
          // Mapeo simple: kitsuId -> imdbId
          this.addMapping(kitsuId, data);
          loaded++;
        } else if (data && data.imdbId) {
          // Mapeo con metadatos
          this.addMapping(kitsuId, data.imdbId, {
            ...data,
            source
          });
          loaded++;
        }
      }
      
      console.info(`📥 Cargados ${loaded} mapeos desde ${source}`);
      return { success: true, loaded, source };
      
    } catch (error) {
      console.error(`❌ Error cargando mapeos desde ${source}:`, error);
      return { success: false, loaded, error: error.message, source };
    }
  }

  /**
   * Limpia mapeos expirados del cache
   */
  cleanExpiredMappings() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.mappingCache.entries()) {
      if (now - value.timestamp > this.mappingConfig.cacheExpiry) {
        this.mappingCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.info(`🧹 Limpiados ${cleaned} mapeos expirados del cache`);
    }
    
    return cleaned;
  }

  /**
   * Exporta todos los mapeos actuales
   * @returns {Object} Mapeos exportados con metadatos
   */
  exportMappings() {
    const exported = {};
    
    for (const [kitsuId, imdbId] of this.manualMappings.entries()) {
      const metadata = this.animeMetadata.get(kitsuId);
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