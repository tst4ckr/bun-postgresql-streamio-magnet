/**
 * Servicio centralizado de deduplicación de canales
 * Implementa algoritmos avanzados de detección de duplicados
 * siguiendo principios SOLID y Domain-Driven Design
 */

import { StreamQuality } from '../value-objects/StreamQuality.js';
import {
  normalizeChannelName,
  normalizeChannelNameForQualityPatterns,
  normalizeChannelNameForHDPatterns,
  normalizeUrl,
  calculateStringSimilarity,
  levenshteinDistance,
  hasQualityPatterns,
  hasHDPatterns,
  isHighQuality,
  isLowQuality,
  getQualityPatternType,
  getHDPatternType,
  extractNumberFromHDPattern,
  extractNumberFromSDPattern,
  extractSDVariant,
  QUALITY_PATTERN_PRIORITY,
  SD_VARIANT_PRIORITY
} from './ChannelDeduplicationService_tools.js';
// Logger simple para el servicio
const createLogger = () => ({
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
});

/**
 * Criterios de comparación para deduplicación
 */
export const DeduplicationCriteria = {
  ID_EXACT: 'id_exact',
  NAME_SIMILARITY: 'name_similarity', 
  URL_SIMILARITY: 'url_similarity',
  COMBINED: 'combined'
};

/**
 * Estrategias de resolución de conflictos
 */
export const ConflictResolutionStrategy = {
  KEEP_FIRST: 'keep_first',           // Mantener el primer canal encontrado
  KEEP_LAST: 'keep_last',             // Mantener el último canal encontrado
  PRIORITIZE_HD: 'prioritize_hd',     // Priorizar versión HD
  PRIORITIZE_SOURCE: 'prioritize_source', // Priorizar por fuente (CSV > M3U)
  PRIORITIZE_WORKING: 'prioritize_working', // Priorizar streams activos/funcionales
  CUSTOM: 'custom'                    // Estrategia personalizada
};

/**
 * Configuración de deduplicación
 */
class DeduplicationConfig {
  constructor({
    criteria = DeduplicationCriteria.COMBINED,
    strategy = ConflictResolutionStrategy.PRIORITIZE_SOURCE,
    nameSimilarityThreshold = 0.85,
    urlSimilarityThreshold = 0.99,
    enableIntelligentDeduplication = true,
    preserveSourcePriority = true,
    sourcePriority = ['csv', 'm3u'],
    enableHdUpgrade = true,
    enableMetrics = true,
    ignoreFiles = []
  } = {}) {
    this.criteria = criteria;
    this.strategy = strategy;
    this.nameSimilarityThreshold = nameSimilarityThreshold;
    this.urlSimilarityThreshold = urlSimilarityThreshold;
    this.enableIntelligentDeduplication = enableIntelligentDeduplication;
    this.preserveSourcePriority = preserveSourcePriority;
    this.sourcePriority = sourcePriority;
    this.enableHdUpgrade = enableHdUpgrade;
    this.enableMetrics = enableMetrics;
    this.ignoreFiles = ignoreFiles;
  }

  /**
   * Crea configuración desde variables de entorno
   * @static
   * @returns {DeduplicationConfig}
   */
  static fromEnvironment() {
    const ignoreFiles = process.env.DEDUPLICATION_IGNORE_FILES 
      ? process.env.DEDUPLICATION_IGNORE_FILES.split(',').map(file => file.trim()).filter(file => file.length > 0)
      : [];
    
    return new DeduplicationConfig({
      enableIntelligentDeduplication: process.env.ENABLE_INTELLIGENT_DEDUPLICATION !== 'false',
      enableHdUpgrade: process.env.ENABLE_HD_UPGRADE !== 'false',
      nameSimilarityThreshold: parseFloat(process.env.NAME_SIMILARITY_THRESHOLD || '0.85'),
      urlSimilarityThreshold: parseFloat(process.env.URL_SIMILARITY_THRESHOLD || '0.90'),
      ignoreFiles: ignoreFiles,
      strategy: process.env.DEDUPLICATION_STRATEGY || ConflictResolutionStrategy.PRIORITIZE_SOURCE,
      preserveSourcePriority: process.env.PRESERVE_SOURCE_PRIORITY !== 'false'
    });
  }
}

/**
 * Métricas de deduplicación
 */
class DeduplicationMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalChannels = 0;
    this.duplicatesFound = 0;
    this.duplicatesRemoved = 0;
    this.hdUpgrades = 0;
    this.sourceConflicts = 0;
    this.processingTimeMs = 0;
    this.duplicatesBySource = new Map();
    this.duplicatesByType = new Map();
    this.conflictResolutions = new Map();
  }

  addDuplicate(source, type, resolution) {
    this.duplicatesFound++;
    
    // Contar por fuente
    const sourceCount = this.duplicatesBySource.get(source) || 0;
    this.duplicatesBySource.set(source, sourceCount + 1);
    
    // Contar por tipo
    const typeCount = this.duplicatesByType.get(type) || 0;
    this.duplicatesByType.set(type, typeCount + 1);
    
    // Contar resoluciones
    const resolutionCount = this.conflictResolutions.get(resolution) || 0;
    this.conflictResolutions.set(resolution, resolutionCount + 1);
  }

  addHdUpgrade() {
    this.hdUpgrades++;
  }

  addSourceConflict() {
    this.sourceConflicts++;
  }

  getStats() {
    return {
      totalChannels: this.totalChannels,
      duplicatesFound: this.duplicatesFound,
      duplicatesRemoved: this.duplicatesRemoved,
      hdUpgrades: this.hdUpgrades,
      sourceConflicts: this.sourceConflicts,
      processingTimeMs: this.processingTimeMs,
      deduplicationRate: this.totalChannels > 0 ? (this.duplicatesRemoved / this.totalChannels * 100).toFixed(2) : 0,
      duplicatesBySource: Object.fromEntries(this.duplicatesBySource),
      duplicatesByType: Object.fromEntries(this.duplicatesByType),
      conflictResolutions: Object.fromEntries(this.conflictResolutions)
    };
  }
}

/**
 * Servicio principal de deduplicación de canales
 */
export class ChannelDeduplicationService {
  #config;
  #metrics;
  #logger;

  constructor(config = new DeduplicationConfig(), logger = null) {
    this.#config = config;
    this.#metrics = new DeduplicationMetrics();
    this.#logger = logger || createLogger();
  }

  /**
   * Deduplica una lista de canales
   * @param {Array<Channel>} channels - Lista de canales a deduplicar
   * @returns {Promise<{channels: Array<Channel>, metrics: Object}>}
   */
  async deduplicateChannels(channels) {
    const startTime = Date.now();
    this.#metrics.reset();
    this.#metrics.totalChannels = channels.length;

    // Filtrar canales de archivos ignorados
    const filteredChannels = this.#filterIgnoredFiles(channels);
    const ignoredCount = channels.length - filteredChannels.length;
    
    if (ignoredCount > 0) {
      this.#logger.info(`Ignorando ${ignoredCount} canales en deduplicación`);
    }

    this.#logger.info(`Deduplicando ${filteredChannels.length} canales`);

    try {
      const deduplicatedChannels = await this.#performDeduplication(filteredChannels);
      
      this.#metrics.processingTimeMs = Math.max(1, Date.now() - startTime);
      // CORRECCIÓN: duplicatesRemoved debe ser igual a duplicatesFound
      // ya que cada duplicado encontrado resulta en la eliminación de un canal
      this.#metrics.duplicatesRemoved = this.#metrics.duplicatesFound;

      const stats = this.#metrics.getStats();
      this.#logger.info(`Deduplicación: ${deduplicatedChannels.length} únicos, ${stats.duplicatesRemoved} removidos`);
      
      if (this.#config.enableMetrics) {
        this.#logDetailedStats(stats);
      }

      return {
        channels: deduplicatedChannels,
        metrics: stats
      };
    } catch (error) {
      this.#logger.error('Error en deduplicación:', error);
      throw error;
    }
  }

  /**
   * Filtra canales de archivos que deben ser ignorados en la deduplicación
   * @private
   * @param {Array<Channel>} channels 
   * @returns {Array<Channel>}
   */
  #filterIgnoredFiles(channels) {
    if (!this.#config.ignoreFiles || this.#config.ignoreFiles.length === 0) {
      return channels;
    }

    return channels.filter(channel => {
      if (!channel.source) return true;
      
      // Normalizar rutas para comparación
      const channelSource = channel.source.replace(/\\/g, '/').toLowerCase();
      
      return !this.#config.ignoreFiles.some(ignoreFile => {
        const normalizedIgnoreFile = ignoreFile.replace(/\\/g, '/').toLowerCase();
        return channelSource.includes(normalizedIgnoreFile) || 
               channelSource.endsWith(normalizedIgnoreFile);
      });
    });
  }

  /**
   * Realiza la deduplicación según la configuración
   * @private
   * @param {Array<Channel>} channels 
   * @returns {Promise<Array<Channel>>}
   */
  async #performDeduplication(channels) {
    // Para criterios de similitud, necesitamos comparar todos los canales entre sí
    if (this.#config.criteria === DeduplicationCriteria.NAME_SIMILARITY || 
        this.#config.criteria === DeduplicationCriteria.URL_SIMILARITY ||
        this.#config.criteria === DeduplicationCriteria.COMBINED) {
      return await this.#performSimilarityBasedDeduplication(channels);
    }
    
    // Para ID exacto, usar el algoritmo original más eficiente
    return await this.#performExactKeyDeduplication(channels);
  }

  /**
   * Deduplicación basada en claves exactas (más eficiente)
   * @private
   * @param {Array<Channel>} channels
   * @returns {Promise<Array<Channel>>}
   */
  async #performExactKeyDeduplication(channels) {
    const channelMap = new Map();
    const processedIds = new Set();

    for (const channel of channels) {
      const duplicateKey = this.#generateDuplicateKey(channel);
      
      if (processedIds.has(duplicateKey)) {
        // Canal duplicado encontrado
        const existingChannel = channelMap.get(duplicateKey);
        const resolution = await this.#resolveConflict(existingChannel, channel);
        
        this.#metrics.addDuplicate(
          channel.metadata?.source || 'unknown',
          this.#config.criteria,
          resolution.strategy
        );

        if (resolution.shouldReplace) {
          channelMap.set(duplicateKey, resolution.selectedChannel);
          
          if (resolution.strategy === 'hd_upgrade' || 
              resolution.strategy === 'upgrade_sd_to_hd' || 
              resolution.strategy === 'upgrade_generic_to_hd' || 
              resolution.strategy === 'numbered_hd_upgrade' || 
              resolution.strategy === 'hd_upgrade_by_object') {
            this.#metrics.addHdUpgrade();
            this.#logger.info(`Canal actualizado a HD: ${channel.name} (${existingChannel.quality?.value || 'SD'} → ${channel.quality?.value || 'HD'})`);
          }
        }
      } else {
        // Canal único, agregar directamente
        channelMap.set(duplicateKey, channel);
        processedIds.add(duplicateKey);
      }
    }

    return Array.from(channelMap.values());
  }

  /**
   * Deduplicación basada en similitud optimizada (O(n) en lugar de O(n²))
   * Usa Map para búsquedas rápidas y agrupa canales por claves normalizadas
   * @private
   * @param {Array<Channel>} channels
   * @returns {Promise<Array<Channel>>}
   */
  async #performSimilarityBasedDeduplication(channels) {
    // Optimización: Usar Map para agrupación O(1) en lugar de comparación O(n²)
    const channelGroups = new Map(); // clave normalizada -> array de canales
    const urlGroups = new Map(); // URL normalizada -> array de canales
    
    // Fase 1: Agrupar canales por claves normalizadas O(n)
    for (const channel of channels) {
      // Agrupar por nombre normalizado
      const nameKey = this.#generateNormalizedKey(channel, 'name');
      if (!channelGroups.has(nameKey)) {
        channelGroups.set(nameKey, []);
      }
      channelGroups.get(nameKey).push(channel);
      
      // Agrupar por URL normalizada si está habilitado
      if (this.#config.criteria === DeduplicationCriteria.URL_SIMILARITY ||
          this.#config.criteria === DeduplicationCriteria.COMBINED) {
        const urlKey = this.#generateNormalizedKey(channel, 'url');
        if (!urlGroups.has(urlKey)) {
          urlGroups.set(urlKey, []);
        }
        urlGroups.get(urlKey).push(channel);
      }
    }
    
    const uniqueChannels = [];
    const processedChannels = new Set(); // Para evitar procesar el mismo canal múltiples veces
    
    // Fase 2: Procesar grupos de canales similares O(k) donde k es el tamaño promedio del grupo
    for (const [nameKey, nameGroup] of channelGroups) {
      if (nameGroup.length === 1) {
        // Canal único en este grupo de nombres
        const channel = nameGroup[0];
        if (!processedChannels.has(channel.id)) {
          uniqueChannels.push(channel);
          processedChannels.add(channel.id);
        }
        continue;
      }
      
      // Múltiples canales con nombres similares - resolver conflictos
      const resolvedChannel = await this.#resolveChannelGroup(nameGroup);
      if (!processedChannels.has(resolvedChannel.id)) {
        uniqueChannels.push(resolvedChannel);
        processedChannels.add(resolvedChannel.id);
        
        // Marcar todos los canales del grupo como procesados
        nameGroup.forEach(ch => processedChannels.add(ch.id));
      }
    }
    
    // Fase 3: Procesar grupos de URLs similares (solo si no fueron procesados por nombre)
    if (urlGroups.size > 0) {
      for (const [urlKey, urlGroup] of urlGroups) {
        // Filtrar canales ya procesados
        const unprocessedChannels = urlGroup.filter(ch => !processedChannels.has(ch.id));
        
        if (unprocessedChannels.length > 1) {
          // Múltiples canales con URLs similares - resolver conflictos
          const resolvedChannel = await this.#resolveChannelGroup(unprocessedChannels);
          if (!processedChannels.has(resolvedChannel.id)) {
            // Reemplazar canal existente si ya está en uniqueChannels
            const existingIndex = uniqueChannels.findIndex(ch => 
              unprocessedChannels.some(uch => uch.id === ch.id)
            );
            
            if (existingIndex >= 0) {
              uniqueChannels[existingIndex] = resolvedChannel;
            } else {
              uniqueChannels.push(resolvedChannel);
            }
            
            // Marcar todos los canales del grupo como procesados
            unprocessedChannels.forEach(ch => processedChannels.add(ch.id));
          }
        }
      }
    }
    
    return uniqueChannels;
  }

  /**
   * Genera clave normalizada para agrupación eficiente
   * @private
   * @param {Channel} channel
   * @param {string} type - 'name' o 'url'
   * @returns {string}
   */
  #generateNormalizedKey(channel, type) {
    switch (type) {
      case 'name':
        if (hasHDPatterns(channel.name)) {
          return normalizeChannelNameForHDPatterns(channel.name);
        }
        return normalizeChannelName(channel.name);
      
      case 'url':
        return normalizeUrl(channel.streamUrl);
      
      default:
        return channel.id;
    }
  }

  /**
   * Resuelve conflictos dentro de un grupo de canales similares
   * @private
   * @param {Array<Channel>} channelGroup
   * @returns {Promise<Channel>}
   */
  async #resolveChannelGroup(channelGroup) {
    if (channelGroup.length === 1) {
      return channelGroup[0];
    }
    
    // Usar el primer canal como base y resolver conflictos secuencialmente
    let resolvedChannel = channelGroup[0];
    
    for (let i = 1; i < channelGroup.length; i++) {
      const currentChannel = channelGroup[i];
      
      // Verificar si son realmente duplicados
      if (this.#areChannelsDuplicate(resolvedChannel, currentChannel)) {
        const resolution = await this.#resolveConflict(resolvedChannel, currentChannel);
        
        this.#metrics.addDuplicate(
          currentChannel.metadata?.source || 'unknown',
          this.#config.criteria,
          resolution.strategy
        );
        
        if (resolution.shouldReplace) {
          resolvedChannel = resolution.selectedChannel;
          
          if (resolution.strategy === 'hd_upgrade' || 
              resolution.strategy === 'upgrade_sd_to_hd' || 
              resolution.strategy === 'upgrade_generic_to_hd' || 
              resolution.strategy === 'numbered_hd_upgrade' || 
              resolution.strategy === 'hd_upgrade_by_object') {
            this.#metrics.addHdUpgrade();
            this.#logger.info(`Canal actualizado a HD: ${currentChannel.name} (${resolvedChannel.quality?.value || 'SD'} → ${currentChannel.quality?.value || 'HD'})`);
          }
        }
      }
    }
    
    return resolvedChannel;
  }

  /**
   * Genera clave única para detección de duplicados
   * @private
   * @param {Channel} channel
   * @returns {string}
   */
  #generateDuplicateKey(channel) {
    switch (this.#config.criteria) {
      case DeduplicationCriteria.ID_EXACT:
        return channel.id;
      
      case DeduplicationCriteria.NAME_SIMILARITY:
        // Si el canal tiene patrones HD, usar normalización específica
        if (hasHDPatterns(channel.name)) {
          return normalizeChannelNameForHDPatterns(channel.name);
        }
        return normalizeChannelName(channel.name);
      
      case DeduplicationCriteria.URL_SIMILARITY:
        return normalizeUrl(channel.streamUrl);
      
      case DeduplicationCriteria.COMBINED:
      default:
        // Usar ID como clave principal, pero permitir comparaciones adicionales
        return channel.id;
    }
  }

  /**
   * Resuelve conflictos entre canales duplicados
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Promise<{shouldReplace: boolean, selectedChannel: Channel, strategy: string}>}
   */
  async #resolveConflict(existingChannel, newChannel) {
    // Verificar si son realmente duplicados usando criterios adicionales
    if (!this.#areChannelsDuplicate(existingChannel, newChannel)) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'not_duplicate'
      };
    }

    switch (this.#config.strategy) {
      case ConflictResolutionStrategy.KEEP_FIRST:
        return {
          shouldReplace: false,
          selectedChannel: existingChannel,
          strategy: 'keep_first'
        };

      case ConflictResolutionStrategy.KEEP_LAST:
        return {
          shouldReplace: true,
          selectedChannel: newChannel,
          strategy: 'keep_last'
        };

      case ConflictResolutionStrategy.PRIORITIZE_HD:
        return this.#resolveByHdPriority(existingChannel, newChannel);

      case ConflictResolutionStrategy.PRIORITIZE_SOURCE:
        return this.#resolveBySourcePriority(existingChannel, newChannel);

      case ConflictResolutionStrategy.PRIORITIZE_WORKING:
        return this.#resolveByWorkingPriority(existingChannel, newChannel);

      case ConflictResolutionStrategy.CUSTOM:
      default:
        return this.#resolveByCustomLogic(existingChannel, newChannel);
    }
  }

  /**
   * Verifica si dos canales son realmente duplicados
   * Implementa estrategia de dos fases: primero URLs idénticas, luego nombres normalizados
   * @private
   * @param {Channel} channel1
   * @param {Channel} channel2
   * @returns {boolean}
   */
  #areChannelsDuplicate(channel1, channel2) {
    // Verificación por ID exacto
    if (channel1.id === channel2.id) {
      return true;
    }

    // FASE 1: Verificación por URL exacta (100% de igualdad) - PRIORIDAD MÁXIMA
    if (channel1.streamUrl && channel2.streamUrl && 
        channel1.streamUrl === channel2.streamUrl) {
      return true;
    }

    // FASE 2: Verificación por similitud de URL (si está habilitada)
    if (this.#config.criteria === DeduplicationCriteria.URL_SIMILARITY ||
        this.#config.criteria === DeduplicationCriteria.COMBINED) {
      if (channel1.streamUrl && channel2.streamUrl) {
        const urlSimilarity = calculateStringSimilarity(
          normalizeUrl(channel1.streamUrl),
          normalizeUrl(channel2.streamUrl)
        );
        if (urlSimilarity >= this.#config.urlSimilarityThreshold) {
          return true;
        }
      }
    }

    // FASE 3: Verificación por similitud de nombre normalizado
    if (this.#config.criteria === DeduplicationCriteria.NAME_SIMILARITY ||
        this.#config.criteria === DeduplicationCriteria.COMBINED) {
      let nameSimilarity;
      
      // Si ambos canales tienen patrones de calidad, usar normalización específica
      const channel1HasQuality = hasQualityPatterns(channel1.name);
      const channel2HasQuality = hasQualityPatterns(channel2.name);
      
      if (channel1HasQuality && channel2HasQuality) {
        // Usar normalización que remueve patrones de calidad para comparación
        nameSimilarity = calculateStringSimilarity(
          normalizeChannelNameForQualityPatterns(channel1.name),
          normalizeChannelNameForQualityPatterns(channel2.name)
        );
      } else {
        // Usar normalización estándar (remueve prefijos numéricos y normaliza)
        nameSimilarity = calculateStringSimilarity(
          normalizeChannelName(channel1.name),
          normalizeChannelName(channel2.name)
        );
      }

      return nameSimilarity >= this.#config.nameSimilarityThreshold;
    }

    return false;
  }

  /**
   * Resuelve conflicto priorizando streams activos/funcionales
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveByWorkingPriority(existingChannel, newChannel) {
    const existingActive = !!existingChannel.isActive;
    const newActive = !!newChannel.isActive;

    // Si uno está activo y el otro no, priorizar el activo
    if (existingActive && !newActive) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'working_keep_existing'
      };
    }

    if (!existingActive && newActive) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'working_replace_with_active'
      };
    }

    // Ambos activos: usar prioridad HD como siguiente criterio
    if (existingActive && newActive) {
      const hdResolution = this.#resolveByHdPriority(existingChannel, newChannel);
      return {
        ...hdResolution,
        strategy: hdResolution.strategy?.startsWith('hd_') || hdResolution.strategy?.includes('upgrade')
          ? `working_hd_fallback_${hdResolution.strategy}`
          : 'working_hd_fallback_keep_existing'
      };
    }

    // Ambos inactivos: recurrir a prioridad por fuente para decidir
    const sourceResolution = this.#resolveBySourcePriority(existingChannel, newChannel);
    return {
      ...sourceResolution,
      strategy: sourceResolution.strategy
        ? `working_both_inactive_${sourceResolution.strategy}`
        : 'working_both_inactive_keep_existing'
    };
  }

  /**
   * Resuelve conflicto priorizando versiones de mayor calidad
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveByHdPriority(existingChannel, newChannel) {
    if (!this.#config.enableHdUpgrade) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'hd_disabled'
      };
    }

    // Verificar calidad por nombre del canal
    const existingIsHighQuality = isHighQuality(existingChannel.name);
    const newIsHighQuality = isHighQuality(newChannel.name);
    const existingIsLowQuality = isLowQuality(existingChannel.name);
    const newIsLowQuality = isLowQuality(newChannel.name);
    
    // REGLA PRINCIPAL: Los canales HD nunca deben ser eliminados por canales SD
    if (existingIsHighQuality && newIsLowQuality) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'protect_hd_from_sd'
      };
    }
    
    // REGLA PRINCIPAL: Los canales SD deben ser reemplazados por canales HD
    if (existingIsLowQuality && newIsHighQuality) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'upgrade_sd_to_hd'
      };
    }
    
    // REGLA NUEVA: Canal sin patrones de calidad debe ser reemplazado por canal HD
    if (!existingIsHighQuality && !existingIsLowQuality && newIsHighQuality) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'upgrade_generic_to_hd'
      };
    }
    
    // REGLA NUEVA: Canal HD nunca debe ser reemplazado por canal sin patrones de calidad
    if (existingIsHighQuality && !newIsHighQuality && !newIsLowQuality) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'protect_hd_from_generic'
      };
    }
    
    // Si ambos tienen patrones de calidad, usar lógica avanzada
    if ((existingIsHighQuality || existingIsLowQuality) && (newIsHighQuality || newIsLowQuality)) {
      return this.#resolveQualityPatternConflict(existingChannel, newChannel);
    }

    // Verificar calidad por objeto quality (fallback)
    const existingQuality = existingChannel.quality?.value || 'SD';
    const newQuality = newChannel.quality?.value || 'SD';
    
    const existingIsHdByObject = existingQuality === 'HD' || existingQuality === 'FHD' || existingQuality === '4K';
    const newIsHdByObject = newQuality === 'HD' || newQuality === 'FHD' || newQuality === '4K';

    if (newIsHdByObject && !existingIsHdByObject) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'hd_upgrade_by_object'
      };
    }
    
    if (existingIsHdByObject && !newIsHdByObject) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'protect_hd_by_object'
      };
    }

    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'hd_keep_existing'
    };
  }

  /**
   * Resuelve conflictos específicos entre canales con patrones de calidad
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveQualityPatternConflict(existingChannel, newChannel) {
    const existingPattern = getQualityPatternType(existingChannel.name);
    const newPattern = getQualityPatternType(newChannel.name);
    
    // Usar prioridades de patrones desde el archivo tools
    const patternPriority = QUALITY_PATTERN_PRIORITY;
    
    const existingPriority = patternPriority[existingPattern] || 0;
    const newPriority = patternPriority[newPattern] || 0;
    
    // REGLA FUNDAMENTAL: Cualquier patrón HD (75+) tiene prioridad sobre cualquier patrón SD (25-)
    const existingIsHD = existingPriority >= 75;
    const newIsHD = newPriority >= 75;
    const existingIsSD = existingPriority > 0 && existingPriority <= 25;
    const newIsSD = newPriority > 0 && newPriority <= 25;
    
    // Proteger HD de SD
    if (existingIsHD && newIsSD) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'protect_hd_pattern_from_sd'
      };
    }
    
    // Actualizar SD a HD
    if (existingIsSD && newIsHD) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'upgrade_sd_pattern_to_hd'
      };
    }
    
    // Si el nuevo canal tiene mayor prioridad de patrón (dentro de la misma categoría)
    if (newPriority > existingPriority) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'quality_pattern_upgrade'
      };
    }
    
    // Si tienen la misma prioridad de patrón, usar criterios adicionales
    if (newPriority === existingPriority && newPriority > 0) {
      return this.#resolveQualityPatternTieBreaker(existingChannel, newChannel);
    }
    
    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'quality_pattern_keep_existing'
    };
  }

  /**
   * Resuelve empates entre canales con el mismo tipo de patrón de calidad
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveQualityPatternTieBreaker(existingChannel, newChannel) {
    const existingPattern = getQualityPatternType(existingChannel.name);
    const newPattern = getQualityPatternType(newChannel.name);
    
    // Para canales numbered_hd, priorizar números más altos (ESPN 7HD > ESPN 4HD)
    if (existingPattern === 'numbered_hd' && newPattern === 'numbered_hd') {
      const existingNumber = extractNumberFromHDPattern(existingChannel.name);
      const newNumber = extractNumberFromHDPattern(newChannel.name);
      
      if (newNumber > existingNumber) {
        return {
          shouldReplace: true,
          selectedChannel: newChannel,
          strategy: 'numbered_hd_upgrade'
        };
      }
    }
    
    // Para canales numbered_sd, priorizar números más altos también
    if (existingPattern === 'numbered_sd' && newPattern === 'numbered_sd') {
      const existingNumber = extractNumberFromSDPattern(existingChannel.name);
      const newNumber = extractNumberFromSDPattern(newChannel.name);
      
      if (newNumber > existingNumber) {
        return {
          shouldReplace: true,
          selectedChannel: newChannel,
          strategy: 'numbered_sd_upgrade'
        };
      }
    }
    
    // Para variantes SD (SD_IN, SD_OUT), priorizar por especificidad
    if (existingPattern === 'sd_variant' && newPattern === 'sd_variant') {
      // Usar prioridades de variantes SD desde el archivo tools
      const variantPriority = SD_VARIANT_PRIORITY;
      
      const existingVariant = extractSDVariant(existingChannel.name);
      const newVariant = extractSDVariant(newChannel.name);
      
      const existingVariantPriority = variantPriority[existingVariant] || 10;
      const newVariantPriority = variantPriority[newVariant] || 10;
      
      if (newVariantPriority > existingVariantPriority) {
        return {
          shouldReplace: true,
          selectedChannel: newChannel,
          strategy: 'sd_variant_upgrade'
        };
      }
    }
    
    // Criterios adicionales: longitud del nombre (más específico)
    const existingSpecificity = existingChannel.name.length;
    const newSpecificity = newChannel.name.length;
    
    if (newSpecificity > existingSpecificity) {
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'quality_specificity_upgrade'
      };
    }
    
    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'quality_pattern_tie_keep_existing'
    };
  }



  /**
   * Resuelve conflicto priorizando por fuente
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveBySourcePriority(existingChannel, newChannel) {
    if (!this.#config.preserveSourcePriority) {
      return this.#resolveByHdPriority(existingChannel, newChannel);
    }

    const existingSource = existingChannel.metadata?.source || 'unknown';
    const newSource = newChannel.metadata?.source || 'unknown';

    const existingPriority = this.#config.sourcePriority.indexOf(existingSource);
    const newPriority = this.#config.sourcePriority.indexOf(newSource);

    // Prioridad más baja = mayor importancia (índice 0 es más prioritario)
    if (existingPriority !== -1 && (newPriority === -1 || existingPriority < newPriority)) {
      return {
        shouldReplace: false,
        selectedChannel: existingChannel,
        strategy: 'source_priority'
      };
    }

    if (newPriority !== -1 && (existingPriority === -1 || newPriority < existingPriority)) {
      this.#metrics.addSourceConflict();
      return {
        shouldReplace: true,
        selectedChannel: newChannel,
        strategy: 'source_priority'
      };
    }

    // Si ambos tienen la misma prioridad de fuente, usar lógica HD
    return this.#resolveByHdPriority(existingChannel, newChannel);
  }

  /**
   * Resuelve conflicto usando lógica personalizada
   * @private
   * @param {Channel} existingChannel
   * @param {Channel} newChannel
   * @returns {Object}
   */
  #resolveByCustomLogic(existingChannel, newChannel) {
    // Combinar estrategias: fuente > HD > calidad > fecha
    const sourceResolution = this.#resolveBySourcePriority(existingChannel, newChannel);
    
    if (sourceResolution.strategy === 'source_priority') {
      return sourceResolution;
    }

    const hdResolution = this.#resolveByHdPriority(existingChannel, newChannel);
    
    if (hdResolution.strategy === 'hd_upgrade' || 
        hdResolution.strategy === 'upgrade_sd_to_hd' || 
        hdResolution.strategy === 'upgrade_generic_to_hd' || 
        hdResolution.strategy === 'numbered_hd_upgrade' || 
        hdResolution.strategy === 'hd_upgrade_by_object') {
      return hdResolution;
    }

    // Si no hay diferencia clara, mantener el existente
    return {
      shouldReplace: false,
      selectedChannel: existingChannel,
      strategy: 'custom_keep_existing'
    };
  }



  /**
   * Registra estadísticas detalladas
   * @private
   * @param {Object} stats
   */
  #logDetailedStats(stats) {
    this.#logger.info(`📊 Estadísticas de deduplicación:`);
    this.#logger.info(`   - Canales procesados: ${stats.totalChannels}`);
    this.#logger.info(`   - Duplicados encontrados: ${stats.duplicatesFound}`);
    this.#logger.info(`   - Duplicados removidos: ${stats.duplicatesRemoved}`);
    this.#logger.info(`   - Actualizaciones HD: ${stats.hdUpgrades}`);
    this.#logger.info(`   - Conflictos de fuente: ${stats.sourceConflicts}`);
    this.#logger.info(`   - Tasa de deduplicación: ${stats.deduplicationRate}%`);
    this.#logger.info(`   - Tiempo de procesamiento: ${stats.processingTimeMs}ms`);
    
    if (Object.keys(stats.duplicatesBySource).length > 0) {
      this.#logger.debug(`   - Duplicados por fuente:`, stats.duplicatesBySource);
    }
  }

  /**
   * Obtiene configuración actual
   * @returns {DeduplicationConfig}
   */
  getConfig() {
    return this.#config;
  }

  /**
   * Actualiza configuración
   * @param {DeduplicationConfig} newConfig
   */
  updateConfig(newConfig) {
    this.#config = newConfig;
    this.#logger.info('Configuración de deduplicación actualizada');
  }

  /**
   * Obtiene métricas actuales
   * @returns {Object}
   */
  getMetrics() {
    return this.#metrics.getStats();
  }
}

export { DeduplicationConfig, DeduplicationMetrics };