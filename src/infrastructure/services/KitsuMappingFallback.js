/**
 * Servicio vacío de fallback - completamente eliminado
 * No mantiene ningún mapeo crítico, depende 100% de la API dinámica
 */
export class KitsuMappingFallback {
  constructor() {
    // Constructor vacío - sin inicialización de mapeos
  }

  /**
   * Servicio de fallback dinámico - delega siempre a la API
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
    
    // Siempre delegar a servicio dinámico
    console.debug(`🔄 Delegando a servicio dinámico para: ${normalizedId}`);
    return null;
  }

  /**
   * Método optimizado para servicio de fallback
   * @param {string} kitsuId - ID numérico de Kitsu
   * @returns {string|null} IMDb ID o null siempre
   */
  getImdbIdFromKitsu(kitsuId) {
    if (!kitsuId) return null;
    
    // Siempre delegar a servicio dinámico
    console.debug(`🔄 Delegando a servicio dinámico para Kitsu: ${kitsuId}`);
    return null;
  }

  /**
   * Métodos legacy - retornan null o vacío
   */
  getAnimeMetadata() { return null; }
  hasMapping() { return false; }
  getAllMappings() { return []; }
  searchByTitle() { return []; }
  getStats() { return { totalCriticalMappings: 0, withMetadata: 0, coverage: 0, cacheSize: 0, lastUpdated: new Date().toISOString() }; }
  loadMappingsFromSource() { return { success: false, loaded: 0, error: 'Servicio eliminado', source: 'none' }; }
  cleanExpiredMappings() { return 0; }
  exportMappings() { return { mappings: {}, stats: this.getStats(), exportedAt: new Date().toISOString() }; }
}

// Instancia singleton vacía
export const kitsuMappingFallback = new KitsuMappingFallback();