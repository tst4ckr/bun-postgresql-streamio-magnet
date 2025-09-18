/**
 * Optimizador de estrategias de caché con machine learning y análisis predictivo
 * Implementa algoritmos de optimización dinámica y adaptación basada en patrones de uso
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { cacheService } from './CacheService.js';

export class CacheOptimizer {
  constructor() {
    this.logger = new EnhancedLogger('CacheOptimizer');
    this.patterns = new Map();
    this.performanceMetrics = new Map();
    this.accessHistory = new Map();
    this.optimizationRules = new Map();
    
    this.config = {
      enableAdaptiveTTL: true,
      enablePatternRecognition: true,
      enablePredictiveEviction: true,
      maxPatternHistory: 1000,
      minPatternConfidence: 0.7,
      adaptationInterval: 300000, // 5 minutos
      performanceWindow: 24 * 60 * 60 * 1000 // 24 horas
    };
    
    this.#initializeOptimizationEngine();
    this.logger.info('CacheOptimizer inicializado');
  }

  /**
   * Calcula TTL adaptativo basado en patrones de acceso y métricas de rendimiento
   * @param {string} contentType - Tipo de contenido (movie, series, anime)
   * @param {number} resultCount - Número de resultados
   * @param {string} contentId - ID del contenido (opcional)
   * @param {Object} metadata - Metadatos adicionales
   * @returns {number} TTL en milisegundos
   */
  calculateAdaptiveTTL(contentType, resultCount, contentId = null, metadata = {}) {
    try {
      let baseTTL = this.#getBaseTTL(contentType, resultCount, metadata);
      
      if (this.config.enableAdaptiveTTL && contentId) {
        const patternMultiplier = this.#getPatternMultiplier(contentId, contentType);
        const performanceMultiplier = this.#getPerformanceMultiplier(contentType);
        const accessFrequencyMultiplier = this.#getAccessFrequencyMultiplier(contentId);
        
        baseTTL *= patternMultiplier * performanceMultiplier * accessFrequencyMultiplier;
        
        this.logger.debug(`TTL adaptativo calculado: ${baseTTL}ms para ${contentId}`, {
          contentType,
          resultCount,
          patternMultiplier,
          performanceMultiplier,
          accessFrequencyMultiplier
        });
      }
      
      return Math.max(300000, Math.min(baseTTL, 86400000)); // Entre 5 min y 24 horas
    } catch (error) {
      this.logger.error('Error calculando TTL adaptativo:', error.message);
      return this.#getDefaultTTL(contentType, resultCount);
    }
  }

  /**
   * Optimiza la estrategia de evicción basándose en patrones de acceso
   * @param {string} cacheKey - Clave de caché
   * @param {Object} entry - Entrada de caché
   * @returns {boolean} true si debe ser evictado
   */
  shouldEvict(cacheKey, entry) {
    if (!this.config.enablePredictiveEviction) {
      return this.#defaultEvictionStrategy(entry);
    }
    
    try {
      const accessPattern = this.#analyzeAccessPattern(cacheKey, entry);
      const predictedValue = this.#predictFutureAccess(cacheKey, accessPattern);
      const evictionScore = this.#calculateEvictionScore(entry, predictedValue);
      
      this.logger.debug(`Análisis de evicción para ${cacheKey}: score=${evictionScore}`, {
        accessCount: entry.accessCount,
        lastAccessed: entry.lastAccessed,
        predictedValue,
        evictionScore
      });
      
      return evictionScore > 0.8; // Umbral de evicción
    } catch (error) {
      this.logger.error('Error en estrategia de evicción predictiva:', error.message);
      return this.#defaultEvictionStrategy(entry);
    }
  }

  /**
   * Registra acceso para análisis de patrones
   * @param {string} cacheKey - Clave de caché
   * @param {string} contentType - Tipo de contenido
   * @param {Object} metadata - Metadatos adicionales
   */
  recordAccess(cacheKey, contentType, metadata = {}) {
    if (!this.config.enablePatternRecognition) return;
    
    try {
      const timestamp = Date.now();
      const accessRecord = {
        timestamp,
        contentType,
        metadata,
        hour: new Date(timestamp).getHours(),
        dayOfWeek: new Date(timestamp).getDay()
      };
      
      if (!this.accessHistory.has(cacheKey)) {
        this.accessHistory.set(cacheKey, []);
      }
      
      const history = this.accessHistory.get(cacheKey);
      history.push(accessRecord);
      
      // Mantener historial limitado
      if (history.length > this.config.maxPatternHistory) {
        history.shift();
      }
      
      // Actualizar patrones periódicamente
      if (history.length % 10 === 0) {
        this.#updatePatterns(cacheKey, history);
      }
      
      this.logger.debug(`Acceso registrado para ${cacheKey}`, accessRecord);
    } catch (error) {
      this.logger.error('Error registrando acceso:', error.message);
    }
  }

  /**
   * Obtiene métricas de optimización actuales
   * @returns {Object} Métricas de rendimiento
   */
  getOptimizationMetrics() {
    const metrics = {
      patterns: this.patterns.size,
      performanceMetrics: this.performanceMetrics.size,
      accessHistory: this.accessHistory.size,
      optimizationRules: this.optimizationRules.size,
      timestamp: Date.now()
    };
    
    // Calcular hit rate promedio por tipo de contenido
    const contentTypeStats = new Map();
    for (const [key, history] of this.accessHistory) {
      const contentType = history[0]?.contentType || 'unknown';
      if (!contentTypeStats.has(contentType)) {
        contentTypeStats.set(contentType, { accesses: 0, patterns: 0 });
      }
      const stats = contentTypeStats.get(contentType);
      stats.accesses += history.length;
      stats.patterns++;
    }
    
    metrics.contentTypeStats = Object.fromEntries(contentTypeStats);
    return metrics;
  }

  /**
   * Reinicia el motor de optimización
   */
  reset() {
    this.patterns.clear();
    this.performanceMetrics.clear();
    this.accessHistory.clear();
    this.optimizationRules.clear();
    this.#initializeOptimizationEngine();
    this.logger.info('Motor de optimización reiniciado');
  }

  /**
   * Obtiene TTL base según tipo de contenido y resultados
   * @private
   */
  #getBaseTTL(contentType, resultCount, metadata) {
    const baseTTLs = {
      movie: 2700000,  // 45 minutos
      series: 1800000, // 30 minutos
      anime: 3600000   // 1 hora
    };
    
    let baseTTL = baseTTLs[contentType] || 1800000;
    
    // Ajustar por cantidad de resultados
    if (resultCount > 10) {
      baseTTL *= 1.5;
    } else if (resultCount < 3) {
      baseTTL *= 0.5;
    }
    
    // Ajustar por popularidad si está disponible
    if (metadata.popularity) {
      if (metadata.popularity > 0.8) baseTTL *= 1.3;
      else if (metadata.popularity < 0.3) baseTTL *= 0.7;
    }
    
    return baseTTL;
  }

  /**
   * Obtiene multiplicador basado en patrones históricos
   * @private
   */
  #getPatternMultiplier(contentId, contentType) {
    const pattern = this.patterns.get(contentId) || this.patterns.get(contentType);
    if (!pattern) return 1.0;
    
    const confidence = pattern.confidence || 0.5;
    const trend = pattern.trend || 0;
    
    // Ajustar TTL basado en tendencia y confianza
    if (trend > 0.5 && confidence > this.config.minPatternConfidence) {
      return 1.2 + (trend * 0.3); // Aumentar TTL para contenido en tendencia
    } else if (trend < -0.3 && confidence > this.config.minPatternConfidence) {
      return 0.8 + (trend * 0.2); // Reducir TTL para contenido en declive
    }
    
    return 1.0;
  }

  /**
   * Obtiene multiplicador basado en métricas de rendimiento
   * @private
   */
  #getPerformanceMultiplier(contentType) {
    const metrics = this.performanceMetrics.get(contentType);
    if (!metrics) return 1.0;
    
    const hitRate = metrics.hitRate || 0.5;
    const avgResponseTime = metrics.avgResponseTime || 1000;
    
    // Ajustar TTL para mejorar hit rate sin comprometer frescura
    if (hitRate < 0.3) return 1.2; // Aumentar TTL si hit rate es muy bajo
    if (hitRate > 0.8) return 0.9; // Reducir ligeramente si hit rate es alto
    if (avgResponseTime > 2000) return 1.1; // Aumentar si respuesta es lenta
    
    return 1.0;
  }

  /**
   * Obtiene multiplicador basado en frecuencia de acceso
   * @private
   */
  #getAccessFrequencyMultiplier(contentId) {
    const history = this.accessHistory.get(contentId);
    if (!history || history.length < 5) return 1.0;
    
    const recentAccesses = history.slice(-10);
    const timeSpan = recentAccesses[recentAccesses.length - 1].timestamp - recentAccesses[0].timestamp;
    const frequency = recentAccesses.length / (timeSpan / 3600000); // accesos por hora
    
    if (frequency > 10) return 1.5; // Contenido muy frecuente
    if (frequency > 5) return 1.3;  // Contenido frecuente
    if (frequency < 0.1) return 0.7; // Contenido raro
    
    return 1.0;
  }

  /**
   * Analiza patrones de acceso para una clave
   * @private
   */
  #analyzeAccessPattern(cacheKey, entry) {
    const history = this.accessHistory.get(cacheKey) || [];
    
    return {
      accessCount: entry.accessCount || 0,
      lastAccessed: entry.lastAccessed || 0,
      accessFrequency: this.#calculateAccessFrequency(history),
      temporalPattern: this.#detectTemporalPattern(history),
      popularity: this.#calculatePopularityScore(history)
    };
  }

  /**
   * Predice acceso futuro basándose en patrones
   * @private
   */
  #predictFutureAccess(cacheKey, pattern) {
    // Implementación simple de predicción basada en tendencias
    const recentTrend = pattern.temporalPattern?.trend || 0;
    const seasonality = pattern.temporalPattern?.seasonality || 0;
    const popularity = pattern.popularity || 0;
    
    return (recentTrend * 0.4) + (seasonality * 0.3) + (popularity * 0.3);
  }

  /**
   * Calcula score de evicción
   * @private
   */
  #calculateEvictionScore(entry, predictedValue) {
    const ageScore = (Date.now() - entry.createdAt) / entry.ttl;
    const accessScore = 1 - (entry.accessCount / 100); // Normalizado a 100 accesos
    const predictionScore = 1 - predictedValue;
    
    return (ageScore * 0.3) + (accessScore * 0.4) + (predictionScore * 0.3);
  }

  /**
   * Estrategia de evicción por defecto
   * @private
   */
  #defaultEvictionStrategy(entry) {
    const age = Date.now() - entry.lastAccessed;
    const ttlRatio = age / entry.ttl;
    return ttlRatio > 0.8; // Evict si ha pasado más del 80% del TTL sin acceso
  }

  /**
   * Actualiza patrones basándose en historial
   * @private
   */
  #updatePatterns(cacheKey, history) {
    try {
      const temporalPattern = this.#detectTemporalPattern(history);
      const popularity = this.#calculatePopularityScore(history);
      const trend = this.#calculateTrend(history);
      
      this.patterns.set(cacheKey, {
        temporalPattern,
        popularity,
        trend,
        confidence: this.#calculateConfidence(history),
        lastUpdated: Date.now()
      });
      
      this.logger.debug(`Patrones actualizados para ${cacheKey}`, {
        temporalPattern,
        popularity,
        trend,
        confidence: this.patterns.get(cacheKey).confidence
      });
    } catch (error) {
      this.logger.error('Error actualizando patrones:', error.message);
    }
  }

  /**
   * Detecta patrones temporales en el historial
   * @private
   */
  #detectTemporalPattern(history) {
    if (history.length < 10) return null;
    
    const hours = history.map(h => new Date(h.timestamp).getHours());
    const days = history.map(h => new Date(h.timestamp).getDay());
    
    // Detectar patrones horarios
    const hourDistribution = this.#calculateDistribution(hours);
    const dayDistribution = this.#calculateDistribution(days);
    
    return {
      peakHours: this.#findPeaks(hourDistribution),
      peakDays: this.#findPeaks(dayDistribution),
      seasonality: this.#calculateSeasonality(history),
      trend: this.#calculateTrend(history)
    };
  }

  /**
   * Calcula frecuencia de acceso
   * @private
   */
  #calculateAccessFrequency(history) {
    if (history.length < 2) return 0;
    
    const timeSpan = history[history.length - 1].timestamp - history[0].timestamp;
    return history.length / (timeSpan / 3600000); // accesos por hora
  }

  /**
   * Calcula puntuación de popularidad
   * @private
   */
  #calculatePopularityScore(history) {
    if (history.length === 0) return 0;
    
    const recentAccesses = history.slice(-20);
    const frequency = this.#calculateAccessFrequency(recentAccesses);
    const recency = this.#calculateRecencyScore(recentAccesses);
    
    return Math.min(1, (frequency * 0.6) + (recency * 0.4));
  }

  /**
   * Calcula tendencia
   * @private
   */
  #calculateTrend(history) {
    if (history.length < 5) return 0;
    
    const recent = history.slice(-10);
    const older = history.slice(0, Math.min(10, history.length - 10));
    
    if (older.length === 0) return 0;
    
    const recentFreq = this.#calculateAccessFrequency(recent);
    const olderFreq = this.#calculateAccessFrequency(older);
    
    return olderFreq === 0 ? 1 : (recentFreq - olderFreq) / olderFreq;
  }

  /**
   * Calcula distribución de valores
   * @private
   */
  #calculateDistribution(values) {
    const distribution = {};
    values.forEach(value => {
      distribution[value] = (distribution[value] || 0) + 1;
    });
    return distribution;
  }

  /**
   * Encuentra picos en distribución
   * @private
   */
  #findPeaks(distribution) {
    const entries = Object.entries(distribution);
    if (entries.length === 0) return [];
    
    const avg = entries.reduce((sum, [, count]) => sum + count, 0) / entries.length;
    return entries
      .filter(([, count]) => count > avg * 1.5)
      .map(([value]) => parseInt(value))
      .sort((a, b) => distribution[b] - distribution[a]);
  }

  /**
   * Calcula estacionalidad
   * @private
   */
  #calculateSeasonality(history) {
    if (history.length < 20) return 0;
    
    const weeklyPattern = {};
    history.forEach(record => {
      const week = this.#getWeekOfYear(record.timestamp);
      weeklyPattern[week] = (weeklyPattern[week] || 0) + 1;
    });
    
    const values = Object.values(weeklyPattern);
    const variance = this.#calculateVariance(values);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    return mean === 0 ? 0 : variance / mean;
  }

  /**
   * Calcula puntuación de recencia
   * @private
   */
  #calculateRecencyScore(history) {
    if (history.length === 0) return 0;
    
    const now = Date.now();
    const recentWeight = 2;
    const totalWeight = history.reduce((sum, record) => {
      const age = now - record.timestamp;
      const weight = Math.exp(-age / (24 * 3600000)); // Decaimiento exponencial de 24h
      return sum + weight;
    }, 0);
    
    const maxPossibleWeight = history.length * recentWeight;
    return totalWeight / maxPossibleWeight;
  }

  /**
   * Calcula confianza en patrones
   * @private
   */
  #calculateConfidence(history) {
    if (history.length < 5) return 0.1;
    if (history.length > 50) return 0.9;
    
    return Math.min(0.9, history.length / 50);
  }

  /**
   * Calcula varianza
   * @private
   */
  #calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Obtiene semana del año
   * @private
   */
  #getWeekOfYear(timestamp) {
    const date = new Date(timestamp);
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Obtiene TTL por defecto
   * @private
   */
  #getDefaultTTL(contentType, resultCount) {
    const defaults = {
      movie: 2700000,  // 45 minutos
      series: 1800000, // 30 minutos
      anime: 3600000   // 1 hora
    };
    
    return defaults[contentType] || 1800000;
  }

  /**
   * Inicializa el motor de optimización
   * @private
   */
  #initializeOptimizationEngine() {
    if (this.config.adaptationInterval > 0) {
      setInterval(() => {
        this.#adaptOptimizationRules();
      }, this.config.adaptationInterval);
      
      this.logger.debug('Motor de optimización iniciado');
    }
  }

  /**
   * Adapta reglas de optimización basándose en métricas
   * @private
   */
  #adaptOptimizationRules() {
    try {
      const cacheStats = cacheService.getStats();
      const hitRate = parseFloat(cacheStats.hitRate) / 100;
      
      // Ajustar umbrales basándose en rendimiento
      if (hitRate < 0.3) {
        this.config.minPatternConfidence = Math.max(0.5, this.config.minPatternConfidence - 0.05);
      } else if (hitRate > 0.8) {
        this.config.minPatternConfidence = Math.min(0.9, this.config.minPatternConfidence + 0.02);
      }
      
      this.logger.debug('Reglas de optimización adaptadas', {
        hitRate,
        newConfidenceThreshold: this.config.minPatternConfidence
      });
    } catch (error) {
      this.logger.error('Error adaptando reglas de optimización:', error.message);
    }
  }
}

// Crear instancia singleton
const cacheOptimizer = new CacheOptimizer();

export { cacheOptimizer };