/**
 * Servicio de mapeos de respaldo para Kitsu → IMDb
 * Proporciona mapeos manuales cuando la API de Kitsu no tiene datos disponibles
 */

export class KitsuMappingFallback {
  constructor() {
    // Mapeos unificados de todos los servicios → IMDb ID
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
    
    // Inicializar mapeos base
    this.#initializeBaseMappings();
    
    // Metadatos dinámicos para animes mapeados
    this.animeMetadata = new Map();
  }

  /**
   * Inicializa mapeos base críticos de forma dinámica
   * Incluye mapeos para todos los servicios de anime
   * @private
   */
  #initializeBaseMappings() {
    // Mapeos completos de todos los servicios a IMDb
    const allMappings = this.#loadCompleteMappings();
    
    for (const [serviceId, imdbId] of allMappings) {
      this.addMapping(serviceId, imdbId);
    }
  }

  /**
   * Carga mapeos completos desde todos los servicios a IMDb
   * @private
   * @returns {Array} Array de tuplas [serviceId, imdbId]
   */
  #loadCompleteMappings() {
    // Mapeos completos de anime populares
    return [
      // Kitsu → IMDb
      ['48671', 'tt21209876'], // Solo Leveling
      ['44042', 'tt25622312'], // Attack on Titan
      ['11061', 'tt2098220'],  // Hunter x Hunter
      ['42929', 'tt9335498'],  // Demon Slayer
      ['39026', 'tt8176034'],  // Jujutsu Kaisen
      ['12', 'tt0388629'],     // One Piece
      ['21', 'tt0112123'],     // Dragon Ball Z
      ['9969', 'tt3398540'],   // My Hero Academia
      ['11319', 'tt11073666'], // Spy x Family
      ['11111', 'tt6741278'],  // Vinland Saga
      ['11419', 'tt9208876'],  // Chainsaw Man
      
      // MyAnimeList → IMDb
      ['mal:5114', 'tt25622312'], // Attack on Titan
      ['mal:38000', 'tt9335498'], // Demon Slayer
      ['mal:40748', 'tt8176034'], // Jujutsu Kaisen
      ['mal:21', 'tt0388629'],    // One Piece
      ['mal:19', 'tt0112123'],    // Dragon Ball Z
      ['mal:35062', 'tt9208876'], // Chainsaw Man
      ['mal:37510', 'tt21209876'],// Solo Leveling
      
      // AniList → IMDb
      ['anilist:5114', 'tt25622312'], // Attack on Titan
      ['anilist:101922', 'tt9335498'], // Demon Slayer
      ['anilist:113415', 'tt8176034'], // Jujutsu Kaisen
      ['anilist:108632', 'tt21209876'],// Solo Leveling
      
      // AniDB → IMDb
      ['anidb:4563', 'tt25622312'], // Attack on Titan
      ['anidb:13679', 'tt9335498'], // Demon Slayer
      ['anidb:15225', 'tt8176034'], // Jujutsu Kaisen
      
      // IMDb directo (sin prefijo)
      ['tt25622312', 'tt25622312'], // Attack on Titan
      ['tt9335498', 'tt9335498'],   // Demon Slayer
      ['tt8176034', 'tt8176034'],   // Jujutsu Kaisen
      ['tt21209876', 'tt21209876']  // Solo Leveling
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
   * Obtiene mapeo IMDb desde cualquier tipo de ID de anime
   * @param {string} animeId - ID de anime con prefijo (mal:5114, kitsu:48671, etc.)
   * @returns {string|null} IMDb ID o null si no se encuentra
   */
  getImdbIdFromAny(animeId) {
    if (!animeId) return null;
    
    const normalizedId = animeId.toString().trim();
    
    // Buscar directamente el ID completo (con prefijo)
    const directImdbId = this.manualMappings.get(normalizedId);
    if (directImdbId) {
      console.info(`🎯 Mapeo directo encontrado: ${normalizedId} → ${directImdbId}`);
      return directImdbId;
    }
    
    // Buscar sin prefijo kitsu: para IDs numéricos
    if (normalizedId.startsWith('kitsu:')) {
      const kitsuId = normalizedId.replace('kitsu:', '');
      const kitsuImdbId = this.manualMappings.get(kitsuId);
      if (kitsuImdbId) {
        console.info(`🎯 Mapeo kitsu encontrado: ${kitsuId} → ${kitsuImdbId}`);
        return kitsuImdbId;
      }
    }
    
    // Para IDs numéricos sin prefijo, asumir Kitsu
    if (/^\d+$/.test(normalizedId)) {
      const kitsuImdbId = this.manualMappings.get(normalizedId);
      if (kitsuImdbId) {
        console.info(`🎯 Mapeo kitsu numérico encontrado: ${normalizedId} → ${kitsuImdbId}`);
        return kitsuImdbId;
      }
    }
    
    // Si es tt... asumir que es IMDb directo
    if (normalizedId.startsWith('tt')) {
      return normalizedId;
    }
    
    console.warn(`⚠️ No se encontró mapeo para: ${normalizedId}`);
    return null;
  }

  /**
   * Método legacy - mantiene compatibilidad
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {string|null} IMDb ID o null si no se encuentra
   */
  getImdbIdFromKitsu(kitsuId) {
    return this.getImdbIdFromAny(kitsuId);
  }

  /**
   * Alias para getImdbIdFromKitsu - mantiene compatibilidad
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {string|null} IMDb ID o null si no se encuentra
   */
  getImdbId(kitsuId) {
    return this.getImdbIdFromKitsu(kitsuId);
  }

  /**
   * Método estático para compatibilidad con endpoints
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {string|null} IMDb ID o null si no se encuentra
   */
  static getImdbId(kitsuId) {
    const instance = new KitsuMappingFallback();
    return instance.getImdbIdFromKitsu(kitsuId);
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