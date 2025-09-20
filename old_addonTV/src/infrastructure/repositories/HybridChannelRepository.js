/**
 * @fileoverview HybridChannelRepository - Implementación híbrida para múltiples fuentes
 * Combina canales de CSV local con URLs M3U remotas, priorizando CSV local
 */

import { ChannelRepository, RepositoryError, ChannelNotFoundError } from '../../domain/repositories/ChannelRepository.js';
import { CSVChannelRepository } from './CSVChannelRepository.js';
import { RemoteM3UChannelRepository } from './RemoteM3UChannelRepository.js';
import { LocalM3UChannelRepository } from './LocalM3UChannelRepository.js';
import { M3UParserService } from '../parsers/M3UParserService.js';
import ContentFilterService from '../../domain/services/ContentFilterService.js';
import { HttpsToHttpConversionService } from '../services/HttpsToHttpConversionService.js';
import { StreamHealthService } from '../services/StreamHealthService.js';
import { StreamValidationService } from '../services/StreamValidationService.js';
import { ChannelDeduplicationService, DeduplicationConfig } from '../../domain/services/ChannelDeduplicationService.js';
import { filterAllowedChannels } from '../../config/allowed-channels.js';
import { filterBannedChannels } from '../../config/banned-channels.js';
import { isPublicIP, generatePlaylistUrls, removeDuplicateChannels, filterChannelsByPlayAndPublicIP, processPlaylistUrls, resetPlaylistErrorStats, trackPlaylistError, logPlaylistErrorStats } from './HybridChannelRepository_tools.js';
import fetch from 'node-fetch';
import { URL } from 'url';

/**
 * Repositorio híbrido que combina múltiples fuentes de canales
 * Responsabilidad: gestionar canales desde CSV local + URLs M3U remotas
 * 
 * PRIORIZACIÓN ESTRICTA:
 * 1. CSV local tiene prioridad ABSOLUTA sobre todas las demás fuentes
 * 2. Canales M3U remotos/locales solo se agregan si NO existen en CSV
 * 3. Duplicados de fuentes M3U se omiten automáticamente
 * 4. Durante refrescos, la prioridad CSV se mantiene intacta
 * 
 * Orden de carga: CSV local → M3U remotas → M3U locales
 * Deduplicación: Por ID de canal, CSV siempre gana
 */
export class HybridChannelRepository extends ChannelRepository {
  #csvRepository;
  #additionalCsvRepositories = [];
  #m3uRepositories = [];
  #config;
  #logger;
  #channels = [];
  #channelMap = new Map();
  #isInitialized = false;
  #isInitializing = false;
  #lastLoadTime = null;
  #deactivatedChannels = new Set();
  #validatedChannels = new Map(); // channelId -> timestamp
  #contentFilter; // Servicio de filtrado de contenido
  #httpsToHttpService; // Servicio de conversión HTTPS a HTTP
  #streamValidationService; // Servicio de validación temprana de streams
  #deduplicationService; // Servicio de deduplicación de canales
  #m3uParser; // Parser para modo automático
  #playlistErrorStats; // Estadísticas de errores de playlist

  /**
   * @param {string} csvPath - Ruta al archivo CSV local
   * @param {string[]} m3uSources - URLs remotas y rutas de archivos M3U locales
   * @param {TVAddonConfig} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(csvPath, m3uSources, config, logger) {
    super();
    this.#config = config;
    this.#logger = logger;
    
    // Inicializar servicio de filtrado de contenido
    this.#contentFilter = new ContentFilterService(config.filters);
    
    // Inicializar servicio de salud de streams
    const streamHealthService = new StreamHealthService(config, logger);
    
    // Inicializar servicio de conversión HTTPS a HTTP
    this.#httpsToHttpService = new HttpsToHttpConversionService(config, streamHealthService, logger);
    
    // Inicializar servicio de validación temprana de streams
    this.#streamValidationService = new StreamValidationService(config, logger);
    
    // Inicializar servicio de deduplicación con configuración completa
    const deduplicationConfig = new DeduplicationConfig({
      enableIntelligentDeduplication: config.enableIntelligentDeduplication,
      strategy: config.deduplicationStrategy,
      ignoreFiles: config.deduplicationIgnoreFiles || [],
      nameSimilarityThreshold: config.nameSimilarityThreshold || 0.95,
      urlSimilarityThreshold: config.urlSimilarityThreshold || 0.98,
      enableHdUpgrade: config.enableHdUpgrade !== false,
      preserveSourcePriority: config.preserveSourcePriority !== false,
      enableMetrics: config.enableMetrics !== false
    });
    this.#deduplicationService = new ChannelDeduplicationService(deduplicationConfig);
    
    // Inicializar parser para modo automático
    this.#m3uParser = new M3UParserService(config.filters);
    
    // Inicializar estadísticas de errores de playlist
    this.#playlistErrorStats = resetPlaylistErrorStats();
    
    // Crear repositorio CSV principal
    this.#csvRepository = new CSVChannelRepository(csvPath, config, logger);
    
    // Crear repositorios CSV adicionales si están configurados
    this.#additionalCsvRepositories = [];
    if (config.dataSources.localChannelsCsv) {
      this.#additionalCsvRepositories.push(
        new CSVChannelRepository(config.dataSources.localChannelsCsv, config, logger)
      );
      this.#logger.info(`CSV adicional creado: ${config.dataSources.localChannelsCsv}`);
    }
    
    // Separar URLs remotas de archivos M3U locales y crear repositorios apropiados
    const m3uParser = new M3UParserService(config.filters);
    this.#m3uRepositories = [];
    
    let remoteCount = 0;
    let localCount = 0;
    
    m3uSources.filter(source => source).forEach(source => {
      // Verificar si es archivo CSV (no debe procesarse como M3U)
      if (source.toLowerCase().endsWith('.csv')) {
        this.#logger.warn(`CSV en fuentes M3U, omitiendo: ${source}`);
        return;
      }
      
      if (this.#isRemoteUrl(source)) {
        // URL remota - usar RemoteM3UChannelRepository
        this.#m3uRepositories.push(
          new RemoteM3UChannelRepository(source, m3uParser, config, logger)
        );
        remoteCount++;
      } else {
        // Archivo local M3U - usar LocalM3UChannelRepository
        this.#m3uRepositories.push(
          new LocalM3UChannelRepository(source, m3uParser, config, logger)
        );
        localCount++;
      }
    });
    
    this.#logger.info(`HybridChannelRepository creado: CSV principal + ${this.#additionalCsvRepositories.length} CSV adicionales + ${remoteCount} URLs remotas + ${localCount} archivos M3U locales`);
  }

  /**
   * Determina si una fuente es una URL remota o un archivo local
   * @private
   * @param {string} source - Fuente a evaluar
   * @returns {boolean} true si es URL remota, false si es archivo local
   */
  #isRemoteUrl(source) {
    return source.startsWith('http://') || source.startsWith('https://');
  }

  /**
   * Procesa la URL de AUTO_M3U_URL en modo automático
   * Reutiliza la lógica del modo automatic dentro del hybrid
   * @private
   * @returns {Promise<Array<Channel>>} Canales procesados desde AUTO_M3U_URL
   */
  async #processAutomaticSource() {
    const { autoM3uUrl } = this.#config.dataSources;
    
    if (!autoM3uUrl) {
      return [];
    }

    this.#logger.info(`Procesando fuente automática: ${autoM3uUrl}`);
    
    try {
      // 1. Descargar contenido M3U principal
      const response = await fetch(autoM3uUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'TV-IPTV-Addon/1.0.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
      }

      const m3uContent = await response.text();
      this.#logger.info(`M3U descargado: ${m3uContent.length} chars`);

      // 2. Parsear contenido M3U
      const parsedChannels = await this.#m3uParser.parseM3U(m3uContent);
      this.#logger.info(`Canales parseados: ${parsedChannels.length}`);

      // 3. Filtrar URLs válidas para procesamiento
      const filteredChannels = filterChannelsByPlayAndPublicIP(parsedChannels, this.#logger);
      this.#logger.info(`Canales filtrados (URL válidas): ${filteredChannels.length}`);

      // 4. Extraer URLs únicas de playlist
      const playlistUrls = generatePlaylistUrls(filteredChannels, this.#logger);
      this.#logger.info(`URLs de playlist generadas: ${playlistUrls.length}`);

      // 5. Procesar cada URL de playlist como fuente M3U independiente
      const allChannels = await processPlaylistUrls(playlistUrls, this.#config, this.#logger, this.#m3uParser, this.#playlistErrorStats, () => { this.#playlistErrorStats = resetPlaylistErrorStats(); }, (index, url, errorMessage) => trackPlaylistError(this.#playlistErrorStats, index, url, errorMessage, this.#logger), () => logPlaylistErrorStats(this.#playlistErrorStats, this.#logger));
      this.#logger.info(`Total canales de playlists: ${allChannels.length}`);

      // 6. Eliminar duplicados (lógica del modo automático)
      const uniqueChannels = removeDuplicateChannels(allChannels, this.#logger);
      this.#logger.info(`Canales únicos (deduplicados): ${uniqueChannels.length}`);

      return uniqueChannels;
      
    } catch (error) {
      this.#logger.error(`Error en fuente automática: ${error.message}`);
      return [];
    }
  }

  /**
   * Registra las estadísticas de errores de playlist
   * @private
   */


  /**
   * Inicializa el repositorio híbrido
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      this.#logger.warn('Repositorio híbrido ya inicializado.');
      return;
    }

    if (this.#isInitializing) {
      this.#logger.info('Inicialización en curso, esperando...');
      // Esperar hasta que termine la inicialización
      while (this.#isInitializing && !this.#isInitialized) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    try {
      this.#isInitializing = true;
      this.#logger.info('Inicializando repositorio híbrido...');
      
      // 1. Cargar canales del CSV principal primero
      await this.#csvRepository.initialize();
      const csvChannels = await this.#csvRepository.getAllChannelsUnfiltered();
      this.#logger.info(`Cargados ${csvChannels.length} canales de CSV principal`);
      
      // 2. Cargar canales de CSVs adicionales
      const additionalCsvChannels = [];
      for (let i = 0; i < this.#additionalCsvRepositories.length; i++) {
        const additionalCsvRepo = this.#additionalCsvRepositories[i];
        try {
          await additionalCsvRepo.initialize();
          const channels = await additionalCsvRepo.getAllChannelsUnfiltered();
          additionalCsvChannels.push(...channels);
          this.#logger.info(`CSV adicional ${i + 1}: ${channels.length} canales`);
        } catch (error) {
          this.#logger.error(`Error en CSV adicional ${i + 1}: ${error.message}`);
          // Continuar con los siguientes archivos aunque uno falle
        }
      }
      
      // 3. Combinar todos los canales CSV (principal + adicionales)
      const allCsvChannels = [...csvChannels, ...additionalCsvChannels];
      this.#logger.info(`Procesando ${allCsvChannels.length} canales CSV (principales y adicionales)`);
      
      // 4. Inicializar mapa con canales CSV (prioridad absoluta)
      this.#channels = [...allCsvChannels];
      this.#channelMap.clear();
      allCsvChannels.forEach(channel => this.#channelMap.set(channel.id, channel));
      
      // 5. Procesar AUTO_M3U_URL en modo automático si está configurado
      const { autoM3uUrl } = this.#config.dataSources;
      let automaticChannels = [];
      if (autoM3uUrl) {
        this.#logger.info('Procesando fuente automática (AUTO_M3U_URL)...');
        try {
          automaticChannels = await this.#processAutomaticSource();
          this.#logger.info(`Canales de fuente automática: ${automaticChannels.length}`);
        } catch (error) {
          this.#logger.error(`Error en fuente automática: ${error.message}`);
        }
      }

      // 6. Cargar canales de URLs M3U remotas tradicionales (sin deduplicación aún)
      const allM3uChannels = [...automaticChannels];
      for (let i = 0; i < this.#m3uRepositories.length; i++) {
        const m3uRepo = this.#m3uRepositories[i];
        const m3uUrl = m3uRepo.url;
        
        // Saltar si es la misma URL que AUTO_M3U_URL ya procesada
        if (autoM3uUrl && m3uUrl === autoM3uUrl) {
          this.#logger.debug(`M3U ${i + 1}: Saltando URL duplicada (AUTO_M3U_URL)`);
          continue;
        }
        
        try {
          await m3uRepo.initialize();
          const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
          allM3uChannels.push(...m3uChannels);
          this.#logger.info(`M3U ${i + 1}: ${m3uChannels.length} canales`);
        } catch (error) {
          this.#logger.error(`Error en M3U ${i + 1}: ${error.message}`);
          // Continuar con las siguientes fuentes aunque una falle
        }
      }
      
      // 4. Aplicar conversión HTTPS→HTTP a todos los canales M3U ANTES de deduplicación
      let processedM3uChannels = allM3uChannels;
      
      if (this.#httpsToHttpService.isEnabled() && allM3uChannels.length > 0) {
        this.#logger.info(`Iniciando conversión HTTPS→HTTP para ${allM3uChannels.length} canales M3U...`);
        
        try {
          const conversionResult = await this.#httpsToHttpService.processChannels(allM3uChannels, {
            concurrency: this.#config.validation?.maxValidationConcurrency || 5, // Optimizado para alta latencia
            showProgress: true,
            onlyWorkingHttp: true
          });
          
          processedM3uChannels = conversionResult.processed;
          
          this.#logger.info(
            `Conversión HTTPS→HTTP: ${conversionResult.stats.total} procesados, ${conversionResult.stats.httpWorking} funcionales`
          );
          
          if (conversionResult.stats.failed > 0) {
            this.#logger.warn(`${conversionResult.stats.failed} canales fallaron conversión`);
          }
          
        } catch (error) {
          this.#logger.error(`Error en conversión HTTPS→HTTP: ${error.message}`);
          // En caso de error, continuar con canales originales
          processedM3uChannels = allM3uChannels;
        }
      } else {
        this.#logger.info('Conversión HTTPS→HTTP deshabilitada.');
      }
      
      // 5. Validación temprana de streams M3U procesados (CSV tiene prioridad absoluta)
      let validatedM3uChannels = processedM3uChannels;
      
      if (this.#streamValidationService.isEnabled()) {
        this.#logger.info(`Iniciando validación temprana de ${processedM3uChannels.length} canales M3U...`);
        
        const validationResult = await this.#streamValidationService.validateChannelsBatch(
          processedM3uChannels,
          {
            concurrency: this.#config.validation?.earlyValidationConcurrency || 15,
            showProgress: true
          }
        );
        
        // Filtrar solo canales M3U válidos
        const validM3uChannels = validationResult.validChannels;
        const invalidM3uChannels = validationResult.invalidChannels;
        
        this.#logger.info(
          `Validación M3U: ${validM3uChannels.length} válidos, ${invalidM3uChannels.length} inválidos`
        );
        this.#logger.info(
          `Canales CSV preservados: ${allCsvChannels.length} (prioridad absoluta)`
        );
        
        validatedM3uChannels = validM3uChannels;
        
        // Marcar solo canales M3U inválidos como desactivados
        invalidM3uChannels.forEach(channel => {
          this.#deactivatedChannels.add(channel.id);
        });
        
      } else {
        this.#logger.info('Validación temprana deshabilitada.');
      }
      
      // 5. Deduplicación inteligente con prioridad CSV absoluta
      this.#channels = [];
      this.#channelMap.clear();
      
      // Combinar todos los canales para deduplicación centralizada
      const allChannels = [...allCsvChannels, ...validatedM3uChannels];
      
      // Aplicar deduplicación centralizada
      const deduplicationResult = await this.#deduplicationService.deduplicateChannels(allChannels);
      
      // Aplicar filtro inteligente de canales permitidos
      const beforeAllowedCount = deduplicationResult.channels.length;
      const allowedFilteredChannels = filterAllowedChannels(deduplicationResult.channels);
      const afterAllowedCount = allowedFilteredChannels.length;
      const allowedRemovedCount = beforeAllowedCount - afterAllowedCount;
      
      // Aplicar filtro de canales prohibidos
      const beforeBannedCount = allowedFilteredChannels.length;
      const finalFilteredChannels = filterBannedChannels(allowedFilteredChannels);
      const afterBannedCount = finalFilteredChannels.length;
      const bannedRemovedCount = beforeBannedCount - afterBannedCount;
      
      // Actualizar canales y mapa con resultados filtrados
      this.#channels = finalFilteredChannels;
      this.#channels.forEach(channel => {
        this.#channelMap.set(channel.id, channel);
      });
      
      // Extraer métricas para logging
      const metrics = deduplicationResult.metrics;
      const m3uAdded = this.#channels.length - allCsvChannels.length;
      const m3uDuplicates = metrics.duplicatesRemoved;
      const hdUpgrades = metrics.hdUpgrades;
      
      this.#logger.info(
        `📊 Deduplicación completada: ${allCsvChannels.length} CSV (preservados) + ${m3uAdded} M3U (validados) = ${this.#channels.length} canales (${m3uDuplicates} duplicados omitidos, ${hdUpgrades} actualizados a HD${allowedRemovedCount > 0 ? `, ${allowedRemovedCount} canales no permitidos removidos` : ''}${bannedRemovedCount > 0 ? `, ${bannedRemovedCount} canales prohibidos removidos` : ''})`
      );
      
      this.#lastLoadTime = new Date();
      this.#isInitialized = true;
      this.#logger.info(`🎯 Repositorio híbrido inicializado: ${this.#channels.length} canales válidos y únicos`);
      
    } catch (error) {
      throw new RepositoryError(`Error inicializando repositorio híbrido: ${error.message}`, error);
    } finally {
      this.#isInitializing = false;
    }
  }

  /**
   * Refresca los datos desde todas las fuentes
   * @private
   * @returns {Promise<void>}
   */
  async #refreshAllSources() {
    try {
      this.#logger.info('Refrescando todas las fuentes...');
      
      // 1. Refrescar CSV principal
      await this.#csvRepository.refreshFromRemote();
      const csvChannels = await this.#csvRepository.getAllChannelsUnfiltered();
      this.#logger.info(`CSV principal refrescado: ${csvChannels.length} canales`);
      
      // 2. Refrescar CSVs adicionales
      const additionalCsvChannels = [];
      for (let i = 0; i < this.#additionalCsvRepositories.length; i++) {
        const additionalCsvRepo = this.#additionalCsvRepositories[i];
        try {
          await additionalCsvRepo.refreshFromRemote();
          const channels = await additionalCsvRepo.getAllChannelsUnfiltered();
          additionalCsvChannels.push(...channels);
          this.#logger.info(`CSV adicional ${i + 1} refrescado: ${channels.length} canales`);
        } catch (error) {
          this.#logger.error(`Error refrescando CSV adicional ${i + 1}:`, error);
        }
      }
      
      // 3. Combinar canales CSV
      const allCsvChannels = [...csvChannels, ...additionalCsvChannels];
      this.#logger.info(`Procesando ${allCsvChannels.length} canales CSV refrescados`);
      
      // 4. Reinicializar con canales CSV
      this.#channels = [...allCsvChannels];
      this.#channelMap.clear();
      allCsvChannels.forEach(channel => this.#channelMap.set(channel.id, channel));
      
      // 5. Procesar fuente automática
      const { autoM3uUrl } = this.#config.dataSources;
      let automaticChannels = [];
      if (autoM3uUrl) {
        this.#logger.info('Refrescando fuente automática...');
        try {
          automaticChannels = await this.#processAutomaticSource();
          this.#logger.info(`Fuente automática refrescada: ${automaticChannels.length} canales`);
        } catch (error) {
          this.#logger.error(`Error refrescando fuente automática: ${error.message}`);
        }
      }

      // 6. Cargar canales M3U
      const allM3uChannels = [...automaticChannels];
      for (let i = 0; i < this.#m3uRepositories.length; i++) {
        const m3uRepo = this.#m3uRepositories[i];
        const m3uUrl = m3uRepo.url;
        
        if (autoM3uUrl && m3uUrl === autoM3uUrl) {
          this.#logger.debug(`Refresco M3U ${i + 1}: Saltando URL duplicada (automática)`);
          continue;
        }
        
        try {
          await m3uRepo.refreshFromRemote();
          const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
          allM3uChannels.push(...m3uChannels);
          this.#logger.debug(`Refresco M3U ${i + 1}: ${m3uChannels.length} canales`);
        } catch (error) {
          this.#logger.error(`Error refrescando M3U ${i + 1}:`, error);
        }
      }
      
      // 7. Aplicar conversión HTTPS→HTTP
      let processedM3uChannels = allM3uChannels;
      
      if (this.#httpsToHttpService.isEnabled() && allM3uChannels.length > 0) {
        this.#logger.info(`Conversión HTTPS→HTTP en refresco para ${allM3uChannels.length} canales M3U`);
        
        try {
          const conversionResult = await this.#httpsToHttpService.processChannels(allM3uChannels, {
            concurrency: this.#config.validation?.maxValidationConcurrency || 5,
            showProgress: false,
            onlyWorkingHttp: true
          });
          
          processedM3uChannels = conversionResult.processed;
          
          this.#logger.info(
            `Conversión en refresco: ${conversionResult.stats.total} procesados, ${conversionResult.stats.httpWorking} (${(conversionResult.stats.httpWorking/conversionResult.stats.total*100).toFixed(1)}%) funcionales`
          );
          
        } catch (error) {
          this.#logger.error('Error en conversión HTTPS→HTTP durante refresco:', error);
          processedM3uChannels = allM3uChannels;
        }
      }
      
      // 8. Validación temprana M3U
      let validatedM3uChannels = processedM3uChannels;
      
      if (this.#streamValidationService.isEnabled()) {
        this.#logger.info(`Validación temprana en refresco para ${processedM3uChannels.length} canales M3U`);
        
        const validationResult = await this.#streamValidationService.validateChannelsBatch(
          processedM3uChannels,
          {
            concurrency: this.#config.validation?.earlyValidationConcurrency || 15,
            showProgress: false
          }
        );
        
        const validM3uChannels = validationResult.validChannels;
        const invalidM3uChannels = validationResult.invalidChannels;
        
        this.#logger.info(
          `Refresco M3U validado: ${validM3uChannels.length} válidos, ${invalidM3uChannels.length} inválidos`
        );
        this.#logger.info(
          `Canales CSV preservados en refresco: ${allCsvChannels.length}`
        );
        
        validatedM3uChannels = validM3uChannels;
        
        const csvChannelIds = new Set(allCsvChannels.map(ch => ch.id));
        const currentDeactivated = Array.from(this.#deactivatedChannels)
          .filter(id => csvChannelIds.has(id));
        
        this.#deactivatedChannels.clear();
        currentDeactivated.forEach(id => this.#deactivatedChannels.add(id));
        
        invalidM3uChannels.forEach(channel => {
          this.#deactivatedChannels.add(channel.id);
        });
      }
      
      // 9. Deduplicación y filtrado
      this.#channels = [];
      this.#channelMap.clear();
      
      const allChannels = [...allCsvChannels, ...validatedM3uChannels];
      
      const deduplicationResult = await this.#deduplicationService.deduplicateChannels(allChannels);
      
      const beforeAllowedCount = deduplicationResult.channels.length;
      const allowedFilteredChannels = filterAllowedChannels(deduplicationResult.channels);
      const afterAllowedCount = allowedFilteredChannels.length;
      const allowedRemovedCount = beforeAllowedCount - afterAllowedCount;
      
      const beforeBannedCount = allowedFilteredChannels.length;
      const finalFilteredChannels = filterBannedChannels(allowedFilteredChannels);
      const afterBannedCount = finalFilteredChannels.length;
      const bannedRemovedCount = beforeBannedCount - afterBannedCount;
      
      this.#channels = finalFilteredChannels;
      this.#channels.forEach(channel => {
        this.#channelMap.set(channel.id, channel);
      });
      
      const metrics = deduplicationResult.metrics;
      const m3uAdded = this.#channels.length - allCsvChannels.length;
      const m3uDuplicates = metrics.duplicatesRemoved;
      const hdUpgrades = metrics.hdUpgrades;
      
      this.#logger.info(
        `Refresco y deduplicación: ${allCsvChannels.length} CSV + ${m3uAdded} M3U = ${this.#channels.length} canales (${m3uDuplicates} duplicados, ${hdUpgrades} HD actualizados${allowedRemovedCount > 0 ? `, ${allowedRemovedCount} no permitidos` : ''}${bannedRemovedCount > 0 ? `, ${bannedRemovedCount} prohibidos` : ''})`
      );
      
      this.#lastLoadTime = new Date();
      this.#logger.info(`Refresco completado: ${this.#channels.length} canales`);
      
    } catch (error) {
      this.#logger.error('Error refrescando fuentes:', error);
      throw new RepositoryError(`Error refrescando repositorio híbrido: ${error.message}`, error);
    }
  }



  /**
   * Verifica si necesita refresco
   * @private
   * @returns {boolean}
   */
  #needsRefresh() {
    if (!this.#lastLoadTime) return true;
    
    const { cacheChannelsHours } = this.#config.streaming;
    const cacheAgeMs = cacheChannelsHours * 60 * 60 * 1000;
    
    return (new Date() - this.#lastLoadTime) > cacheAgeMs;
  }

  /**
   * Refresca si es necesario
   * @private
   * @returns {Promise<void>}
   */
  async #refreshIfNeeded() {
    // No refrescar si está inicializando
    if (this.#isInitializing) {
      return;
    }
    
    if (!this.#isInitialized) {
      if (this.#isInitializing) {
        // Si está inicializando, esperar a que termine
        while (this.#isInitializing && !this.#isInitialized) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else {
        await this.initialize();
      }
      return;
    }
    
    if (this.#needsRefresh()) {
      await this.#refreshAllSources();
    }
  }

  /**
   * Filtra canales activos según configuración
   * @private
   * @param {Array<Channel>} channels
   * @returns {Array<Channel>}
   */
  #filterActiveChannels(channels) {
    if (!this.#config.validation.removeInvalidStreams) {
      return channels;
    }
    
    return channels.filter(channel => !this.#deactivatedChannels.has(channel.id));
  }

  // Implementación de métodos del contrato ChannelRepository

  async getAllChannels() {
    await this.#refreshIfNeeded();
    let activeChannels = this.#filterActiveChannels([...this.#channels]);
    
    if (this.#httpsToHttpService.isEnabled()) {
      this.#logger.info('Aplicando conversión HTTPS a HTTP y validación...');
      
      try {
        const csvChannelIds = new Set((await this.#csvRepository.getAllChannelsUnfiltered()).map(ch => ch.id));
        const csvChannels = activeChannels.filter(ch => csvChannelIds.has(ch.id));
        const m3uChannels = activeChannels.filter(ch => !csvChannelIds.has(ch.id));
        
        this.#logger.info(`Procesando ${m3uChannels.length} canales M3U (${csvChannels.length} CSV preservados)`);
        
        const conversionResult = await this.#httpsToHttpService.processChannels(m3uChannels, {
          concurrency: this.#config.validation?.maxValidationConcurrency || 5,
          showProgress: true,
          onlyWorkingHttp: true
        });
        
        this.#logger.info(`Conversión HTTPS a HTTP: ${conversionResult.stats.total} procesados, ${conversionResult.stats.converted} convertidos, ${conversionResult.stats.httpWorking} validados`);
        
        if (conversionResult.stats.failed > 0) {
          this.#logger.warn(`${conversionResult.stats.failed} canales M3U fallaron conversión/validación`);
        }
        
        activeChannels = [...csvChannels, ...conversionResult.processed];
        this.#logger.info(`Resultado: ${csvChannels.length} CSV + ${conversionResult.processed.length} M3U validados = ${activeChannels.length} canales`);
        
      } catch (error) {
        this.#logger.error('Error en conversión HTTPS a HTTP:', error);
      }
    }
    
    if (this.#contentFilter.hasActiveFilters()) {
      const filteredChannels = this.#contentFilter.filterChannels(activeChannels);
      
      const stats = this.#contentFilter.getFilterStats(activeChannels, filteredChannels);
      this.#logger.info(`Filtros de contenido: ${stats.removedChannels} removidos (${stats.removalPercentage}%)`);
      
      if (stats.removedChannels > 0) {
        this.#logger.debug(`Removidos por categoría: religioso=${stats.removedByCategory.religious}, adulto=${stats.removedByCategory.adult}, político=${stats.removedByCategory.political}`);
      }
      
      activeChannels = filteredChannels;
    }
    
    const beforeBannedCount = activeChannels.length;
    const finalChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = finalChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.info(`Filtros de canales prohibidos: ${bannedRemovedCount} removidos de ${beforeBannedCount}`);
    }
    
    return finalChannels;
  }

  async getAllChannelsUnfiltered() {
    await this.#refreshIfNeeded();
    return [...this.#channels];
  }

  async getChannelById(id) {
    await this.#refreshIfNeeded();
    const channel = this.#channelMap.get(id);
    if (!channel || (this.#config.validation.removeInvalidStreams && this.#deactivatedChannels.has(id))) {
      throw new ChannelNotFoundError(id);
    }
    return channel;
  }

  async getChannelsByGenre(genre) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.genre.toLowerCase() === genre.toLowerCase());
    let activeChannels = this.#filterActiveChannels(channels);
    
    // Aplicar conversión HTTPS a HTTP si está habilitada (consistencia con otros métodos)
    if (this.#httpsToHttpService.isEnabled()) {
      try {
        const csvChannelIds = new Set((await this.#csvRepository.getAllChannelsUnfiltered()).map(ch => ch.id));
        const csvChannels = activeChannels.filter(ch => csvChannelIds.has(ch.id));
        const m3uChannels = activeChannels.filter(ch => !csvChannelIds.has(ch.id));
        
        const conversionResult = await this.#httpsToHttpService.processChannels(m3uChannels, {
          concurrency: this.#config.validation?.maxValidationConcurrency || 5,
          showProgress: false,
          onlyWorkingHttp: true
        });
        
        activeChannels = [...csvChannels, ...conversionResult.processed];
      } catch (error) {
        this.#logger.error('Error durante conversión HTTPS a HTTP en filtro por género:', error);
      }
    }
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = activeChannels.length;
    activeChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = activeChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.debug(`Filtros de canales prohibidos aplicados en género: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return activeChannels;
  }

  async getChannelsByCountry(country) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.country.toLowerCase().includes(country.toLowerCase()));
    let activeChannels = this.#filterActiveChannels(channels);
    
    // Aplicar conversión HTTPS a HTTP si está habilitada (consistencia con otros métodos)
    if (this.#httpsToHttpService.isEnabled()) {
      try {
        const csvChannelIds = new Set((await this.#csvRepository.getAllChannelsUnfiltered()).map(ch => ch.id));
        const csvChannels = activeChannels.filter(ch => csvChannelIds.has(ch.id));
        const m3uChannels = activeChannels.filter(ch => !csvChannelIds.has(ch.id));
        
        const conversionResult = await this.#httpsToHttpService.processChannels(m3uChannels, {
          concurrency: this.#config.validation?.maxValidationConcurrency || 5,
          showProgress: false,
          onlyWorkingHttp: true
        });
        
        activeChannels = [...csvChannels, ...conversionResult.processed];
      } catch (error) {
        this.#logger.error('Error durante conversión HTTPS a HTTP en filtro por país:', error);
      }
    }
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = activeChannels.length;
    activeChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = activeChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.debug(`Filtros de canales prohibidos aplicados en país: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return activeChannels;
  }

  async getChannelsByLanguage(language) {
    await this.#refreshIfNeeded();
    const channels = this.#channels.filter(ch => ch.language.toLowerCase() === language.toLowerCase());
    let activeChannels = this.#filterActiveChannels(channels);
    
    // Aplicar conversión HTTPS a HTTP si está habilitada (consistencia con otros métodos)
    if (this.#httpsToHttpService.isEnabled()) {
      try {
        const csvChannelIds = new Set((await this.#csvRepository.getAllChannelsUnfiltered()).map(ch => ch.id));
        const csvChannels = activeChannels.filter(ch => csvChannelIds.has(ch.id));
        const m3uChannels = activeChannels.filter(ch => !csvChannelIds.has(ch.id));
        
        const conversionResult = await this.#httpsToHttpService.processChannels(m3uChannels, {
          concurrency: this.#config.validation?.maxValidationConcurrency || 5,
          showProgress: false,
          onlyWorkingHttp: true
        });
        
        activeChannels = [...csvChannels, ...conversionResult.processed];
      } catch (error) {
        this.#logger.error('Error durante conversión HTTPS a HTTP en filtro por idioma:', error);
      }
    }
    
    // Aplicar filtros de contenido si están activos
    const filteredChannels = this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
    
    // Aplicar filtrado de canales prohibidos
    const finalChannels = filterBannedChannels(filteredChannels);
    
    return finalChannels;
  }

  async searchChannels(searchTerm) {
    await this.#refreshIfNeeded();
    const term = searchTerm.toLowerCase();
    const channels = this.#channels.filter(ch => 
      ch.name.toLowerCase().includes(term) || 
      ch.genre.toLowerCase().includes(term)
    );
    let activeChannels = this.#filterActiveChannels(channels);
    
    // Aplicar conversión HTTPS a HTTP si está habilitada (consistencia con otros métodos)
    if (this.#httpsToHttpService.isEnabled()) {
      try {
        const csvChannelIds = new Set((await this.#csvRepository.getAllChannelsUnfiltered()).map(ch => ch.id));
        const csvChannels = activeChannels.filter(ch => csvChannelIds.has(ch.id));
        const m3uChannels = activeChannels.filter(ch => !csvChannelIds.has(ch.id));
        
        const conversionResult = await this.#httpsToHttpService.processChannels(m3uChannels, {
          concurrency: this.#config.validation?.maxValidationConcurrency || 5,
          showProgress: false,
          onlyWorkingHttp: true
        });
        
        activeChannels = [...csvChannels, ...conversionResult.processed];
      } catch (error) {
        this.#logger.error('Error durante conversión HTTPS a HTTP en búsqueda:', error);
      }
    }
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      activeChannels = this.#contentFilter.filterChannels(activeChannels);
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = activeChannels.length;
    activeChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = activeChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.debug(`Filtros de canales prohibidos aplicados en búsqueda: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return activeChannels;
  }

  async getChannelsByFilter(filter) {
    await this.#refreshIfNeeded();
    let channels = [...this.#channels];

    if (filter.genre) {
      channels = channels.filter(ch => ch.genre.toLowerCase() === filter.genre.toLowerCase());
    }
    if (filter.country) {
      channels = channels.filter(ch => ch.country.toLowerCase().includes(filter.country.toLowerCase()));
    }
    if (filter.language) {
      channels = channels.filter(ch => ch.language.toLowerCase() === filter.language.toLowerCase());
    }
    if (filter.quality) {
      channels = channels.filter(ch => ch.quality === filter.quality);
    }

    const activeChannels = this.#filterActiveChannels(channels);
    return this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
  }

  async getChannelsPaginated(skip = 0, limit = 50) {
    await this.#refreshIfNeeded();
    let activeChannels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar conversión HTTPS a HTTP si está habilitada (igual que getAllChannels)
    if (this.#httpsToHttpService.isEnabled()) {
      try {
        // Separar canales CSV de canales M3U para preservar CSV
        const csvChannelIds = new Set((await this.#csvRepository.getAllChannelsUnfiltered()).map(ch => ch.id));
        const csvChannels = activeChannels.filter(ch => csvChannelIds.has(ch.id));
        const m3uChannels = activeChannels.filter(ch => !csvChannelIds.has(ch.id));
        
        // Procesar solo canales M3U con validación HTTP
        const conversionResult = await this.#httpsToHttpService.processChannels(m3uChannels, {
          concurrency: this.#config.validation?.maxValidationConcurrency || 5,
          showProgress: false, // No mostrar progreso en paginación
          onlyWorkingHttp: true
        });
        
        // Combinar canales CSV preservados + canales M3U validados
        activeChannels = [...csvChannels, ...conversionResult.processed];
        
      } catch (error) {
        this.#logger.error('Error durante conversión HTTPS a HTTP en paginación:', error);
        // En caso de error, continuar con canales originales
      }
    }
    
    // Aplicar filtros de contenido si están activos
    if (this.#contentFilter.hasActiveFilters()) {
      const filteredChannels = this.#contentFilter.filterChannels(activeChannels);
      activeChannels = filteredChannels;
    }
    
    // Aplicar filtrado de canales prohibidos
    const beforeBannedCount = activeChannels.length;
    activeChannels = filterBannedChannels(activeChannels);
    const afterBannedCount = activeChannels.length;
    const bannedRemovedCount = beforeBannedCount - afterBannedCount;
    
    if (bannedRemovedCount > 0) {
      this.#logger.debug(`Filtros de canales prohibidos aplicados en paginación: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
    }
    
    return activeChannels.slice(skip, skip + limit);
  }

  async getChannelsPaginatedUnfiltered(skip = 0, limit = 50) {
    await this.#refreshIfNeeded();
    return this.#channels.slice(skip, skip + limit);
  }

  async getChannelsCount() {
    await this.#refreshIfNeeded();
    let activeChannels = this.#filterActiveChannels([...this.#channels]);
    
    // Aplicar conversión HTTPS a HTTP si está habilitada (igual que getAllChannels y getChannelsPaginated)
    if (this.#httpsToHttpService.isEnabled()) {
      try {
        // Separar canales CSV de canales M3U para preservar CSV
        const csvChannelIds = new Set((await this.#csvRepository.getAllChannelsUnfiltered()).map(ch => ch.id));
        const csvChannels = activeChannels.filter(ch => csvChannelIds.has(ch.id));
        const m3uChannels = activeChannels.filter(ch => !csvChannelIds.has(ch.id));
        
        // Procesar solo canales M3U con validación HTTP
        const conversionResult = await this.#httpsToHttpService.processChannels(m3uChannels, {
          concurrency: this.#config.validation?.maxValidationConcurrency || 5,
          showProgress: false, // No mostrar progreso en conteo
          onlyWorkingHttp: true
        });
        
        // Combinar canales CSV preservados + canales M3U validados
        activeChannels = [...csvChannels, ...conversionResult.processed];
        
      } catch (error) {
        this.#logger.error('Error durante conversión HTTPS a HTTP en conteo:', error);
        // En caso de error, continuar con canales originales
      }
    }
    
    // Aplicar filtros de contenido si están activos
    const filteredChannels = this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
    
    // Aplicar filtrado de canales prohibidos
    const finalChannels = filterBannedChannels(filteredChannels);
    
    return finalChannels.length;
  }

  async refreshFromRemote() {
    this.#logger.info('Forzando refresco de repositorio híbrido...');
    await this.#refreshAllSources();
  }

  async getChannelsNeedingValidation(hoursThreshold = 6) {
    await this.#refreshIfNeeded();
    
    const sampleSize = Math.min(30, this.#channels.length);
    const shuffled = [...this.#channels].sort(() => 0.5 - Math.random());
    
    return shuffled.slice(0, sampleSize);
  }

  async getRepositoryStats() {
    await this.#refreshIfNeeded();
    
    const csvChannels = await this.#csvRepository.getAllChannelsUnfiltered();
    let remoteM3uChannelsTotal = 0;
    let localM3uChannelsTotal = 0;
    let remoteSourcesCount = 0;
    let localSourcesCount = 0;
    let totalM3uChannelsBeforeDedup = 0;
    
    for (const m3uRepo of this.#m3uRepositories) {
      try {
        const m3uChannels = await m3uRepo.getAllChannelsUnfiltered();
        totalM3uChannelsBeforeDedup += m3uChannels.length;
        
        // Determinar si es repositorio remoto o local
        if (m3uRepo instanceof RemoteM3UChannelRepository) {
          remoteM3uChannelsTotal += m3uChannels.length;
          remoteSourcesCount++;
        } else if (m3uRepo instanceof LocalM3UChannelRepository) {
          localM3uChannelsTotal += m3uChannels.length;
          localSourcesCount++;
        }
      } catch (error) {
        this.#logger.error('Error obteniendo stats de M3U:', error);
      }
    }
    
    const totalM3uChannels = remoteM3uChannelsTotal + localM3uChannelsTotal;
    const csvPriorityDuplicates = (csvChannels.length + totalM3uChannels) - this.#channels.length;
    const m3uChannelsAdded = this.#channels.length - csvChannels.length;
    const activeChannels = this.#filterActiveChannels([...this.#channels]);
    const filteredChannels = this.#contentFilter.hasActiveFilters() ? this.#contentFilter.filterChannels(activeChannels) : activeChannels;
    
    // Obtener estadísticas de filtrado de contenido
    const contentFilterStats = this.#contentFilter.hasActiveFilters() 
      ? this.#contentFilter.getFilterStats(activeChannels, filteredChannels)
      : null;
    
    const stats = {
      totalChannels: this.#channels.length,
      activeChannels: activeChannels.length,
      filteredChannels: filteredChannels.length,
      deactivatedChannels: this.#deactivatedChannels.size,
      csvChannels: csvChannels.length,
      remoteM3uChannels: remoteM3uChannelsTotal,
      localM3uChannels: localM3uChannelsTotal,
      m3uChannelsTotal: totalM3uChannels,
      duplicatesOmitted: csvPriorityDuplicates,
      m3uChannelsAdded: m3uChannelsAdded,
      csvPriorityApplied: csvPriorityDuplicates > 0,
      sources: {
        csv: 1,
        remoteM3u: remoteSourcesCount,
        localM3u: localSourcesCount,
        totalM3u: this.#m3uRepositories.length
      },
      lastRefresh: this.#lastLoadTime
    };
    
    // Agregar estadísticas de filtrado de contenido si están activas
    if (contentFilterStats) {
      stats.contentFiltering = {
        enabled: true,
        removedChannels: contentFilterStats.removedChannels,
        removalPercentage: contentFilterStats.removalPercentage,
        removedByCategory: contentFilterStats.removedByCategory,
        filtersActive: contentFilterStats.filtersActive,
        filterConfiguration: this.#contentFilter.getFilterConfiguration()
      };
    } else {
      stats.contentFiltering = {
        enabled: false,
        filterConfiguration: this.#contentFilter.getFilterConfiguration()
      };
    }
    
    return stats;
  }

  // Métodos de gestión de canales inválidos

  async markChannelAsValidated(channelId) {
    this.#validatedChannels.set(channelId, new Date());
    this.#deactivatedChannels.delete(channelId);
    this.#logger.debug(`Canal híbrido ${channelId} marcado como validado`);
  }

  async deactivateChannel(channelId, reason) {
    this.#deactivatedChannels.add(channelId);
    this.#logger.info(`Canal híbrido ${channelId} desactivado: ${reason}`);
  }

  async getDeactivationStats() {
    return {
      deactivatedCount: this.#deactivatedChannels.size,
      validatedCount: this.#validatedChannels.size,
      deactivatedChannels: Array.from(this.#deactivatedChannels),
      lastValidationTimes: Object.fromEntries(this.#validatedChannels)
    };
  }

  // Métodos no aplicables para repositorio híbrido
  async updateChannel(channel) {
    throw new RepositoryError('El repositorio híbrido es de solo lectura.');
  }
}

export default HybridChannelRepository;