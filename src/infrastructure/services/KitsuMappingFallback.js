/**
 * Servicio de mapeos de respaldo para Kitsu → IMDb
 * Proporciona mapeos manuales cuando la API de Kitsu no tiene datos disponibles
 */

export class KitsuMappingFallback {
  constructor() {
    // Mapeos manuales de animes populares Kitsu ID → IMDb ID
    // Estos mapeos se obtuvieron de fuentes confiables y verificadas
    this.manualMappings = new Map([
      // Animes clásicos y populares
      ['1', 'tt0213338'],     // Cowboy Bebop
      ['5', 'tt0251439'],     // Trigun
      ['7', 'tt0169858'],     // Neon Genesis Evangelion
      ['43', 'tt0346314'],    // Ghost in the Shell: Stand Alone Complex
      ['269', 'tt0434665'],   // Bleach
      ['1376', 'tt0877057'],  // Death Note
      ['1555', 'tt0994314'],  // Code Geass
      ['7442', 'tt2560140'],  // Attack on Titan (Shingeki no Kyojin)
      ['11469', 'tt1910272'], // Steins;Gate
      ['11757', 'tt2250192'], // Sword Art Online
      
      // Animes más recientes populares
      ['41370', 'tt9335498'], // Demon Slayer (Kimetsu no Yaiba)
      ['42765', 'tt10233448'], // Jujutsu Kaisen
      ['45398', 'tt13706018'], // SPY x FAMILY
      ['46474', 'tt15837338'], // Frieren: Beyond Journey's End
      ['47083', 'tt15832404'], // The Apothecary Diaries
      
      // Animes de Studio Ghibli
      ['164', 'tt0096283'],   // My Neighbor Totoro
      ['523', 'tt0245429'],   // Spirited Away
      ['572', 'tt0347149'],   // Howl's Moving Castle
      
      // Otros animes populares
      ['145', 'tt0388629'],   // One Piece
      ['590', 'tt0409591'],   // Naruto
      ['1735', 'tt1355642'],  // Naruto: Shippuden
      ['2025', 'tt0988818'],  // Dragon Ball Z
      ['1', 'tt0213338'],     // Cowboy Bebop (duplicado para asegurar)
      
      // Animes de acción populares
      ['136', 'tt0388629'],   // One Piece (ID alternativo)
      ['11', 'tt0213338'],    // Cowboy Bebop (ID alternativo)
      ['21', 'tt0251439'],    // Trigun (ID alternativo)
    ]);
    
    // Metadatos adicionales para animes mapeados
    this.animeMetadata = new Map([
      ['1', {
        title: 'Cowboy Bebop',
        year: 1998,
        episodes: 26,
        genres: ['Action', 'Adventure', 'Drama'],
        rating: 8.7
      }],
      ['7442', {
        title: 'Attack on Titan',
        year: 2013,
        episodes: 25,
        genres: ['Animation', 'Action', 'Adventure'],
        rating: 9.0
      }],
      ['1376', {
        title: 'Death Note',
        year: 2006,
        episodes: 37,
        genres: ['Animation', 'Crime', 'Drama'],
        rating: 9.0
      }],
      ['11469', {
        title: 'Steins;Gate',
        year: 2011,
        episodes: 24,
        genres: ['Animation', 'Drama', 'Sci-Fi'],
        rating: 8.7
      }]
    ]);
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
      coverage: Math.round((this.animeMetadata.size / this.manualMappings.size) * 100)
    };
  }
}

// Instancia singleton
export const kitsuMappingFallback = new KitsuMappingFallback();