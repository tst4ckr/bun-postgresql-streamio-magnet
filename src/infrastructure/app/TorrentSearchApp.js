import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createTorrentRoutes, addParameterValidation } from '../http/routes/torrentRoutes.js';
import { TorrentSearchService } from '../../application/services/TorrentSearchService.js';
import { MejorTorrentSearchRepository } from '../repositories/MejorTorrentSearchRepository.js';
import { Wolfmax4kSearchRepository } from '../repositories/Wolfmax4kSearchRepository.js';
import { CinecalidadSearchRepository } from '../repositories/CinecalidadSearchRepository.js';
import { LightweightCacheService } from '../services/LightweightCacheService.js';
import { getConfig } from '../config/TorrentSearchConfig.js';
import axios from 'axios';
import { JSDOM } from 'jsdom';

/**
 * @fileoverview TorrentSearchApp - Aplicación principal del sistema de búsqueda de torrents
 * Integra todos los componentes y configura el servidor Express
 */

export class TorrentSearchApp {
  constructor() {
    this.config = getConfig();
    this.app = express();
    this.server = null;
    this.services = {};
    this.repositories = {};
    this.isInitialized = false;
  }

  /**
   * Inicializa la aplicación
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      throw new Error('La aplicación ya está inicializada');
    }

    try {
      console.log('🚀 Inicializando Torrent Search App...');
      
      // Validar configuración
      await this.validateConfiguration();
      
      // Inicializar servicios
      await this.initializeServices();
      
      // Inicializar repositorios
      await this.initializeRepositories();
      
      // Configurar Express
      await this.configureExpress();
      
      // Configurar rutas
      await this.configureRoutes();
      
      // Configurar manejo de errores
      this.configureErrorHandling();
      
      this.isInitialized = true;
      console.log('✅ Aplicación inicializada correctamente');
    } catch (error) {
      console.error('❌ Error inicializando aplicación:', error);
      throw error;
    }
  }

  /**
   * Inicia el servidor
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const port = this.config.get('server.port');
      const host = this.config.get('server.host');
      
      this.server = this.app.listen(port, host, (error) => {
        if (error) {
          console.error('❌ Error iniciando servidor:', error);
          reject(error);
          return;
        }
        
        console.log(`🌐 Servidor iniciado en http://${host}:${port}`);
        console.log(`📋 Manifiesto disponible en: http://${host}:${port}/manifest.json`);
        console.log(`🔍 API de búsqueda en: http://${host}:${port}/api/search`);
        console.log(`❤️  Health check en: http://${host}:${port}/api/health`);
        
        this.logConfigurationSummary();
        resolve();
      });
      
      // Configurar manejo de señales
      this.setupGracefulShutdown();
    });
  }

  /**
   * Detiene el servidor
   * @returns {Promise<void>}
   */
  async stop() {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      
      console.log('🛑 Deteniendo servidor...');
      
      this.server.close(async () => {
        // Limpiar servicios
        await this.cleanup();
        console.log('✅ Servidor detenido correctamente');
        resolve();
      });
    });
  }

  /**
   * Obtiene la instancia de Express
   * @returns {Express}
   */
  getExpressApp() {
    return this.app;
  }

  /**
   * Obtiene el servicio de búsqueda
   * @returns {TorrentSearchService}
   */
  getTorrentSearchService() {
    return this.services.torrentSearch;
  }

  /**
   * Obtiene estadísticas de la aplicación
   * @returns {Object}
   */
  async getStats() {
    const stats = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      config: this.config.getSummary(),
      cache: this.services.cache ? this.services.cache.getStats() : null,
      providers: await this.services.torrentSearch.getProviderStats()
    };
    
    return stats;
  }

  // Métodos privados

  /**
   * Valida la configuración
   * @returns {Promise<void>}
   */
  async validateConfiguration() {
    console.log('🔧 Validando configuración...');
    
    const validation = this.config.validate();
    
    if (!validation.valid) {
      console.error('❌ Errores de configuración:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      throw new Error('Configuración inválida');
    }
    
    if (validation.warnings.length > 0) {
      console.warn('⚠️  Advertencias de configuración:');
      validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    console.log('✅ Configuración validada');
  }

  /**
   * Inicializa los servicios
   * @returns {Promise<void>}
   */
  async initializeServices() {
    console.log('🔧 Inicializando servicios...');
    
    // Servicio de cache
    if (this.config.get('cache.enabled')) {
      this.services.cache = new LightweightCacheService({
        maxMemoryMB: this.config.get('cache.maxMemoryMB'),
        defaultTtl: this.config.get('cache.defaultTtl'),
        cleanupInterval: this.config.get('cache.cleanupInterval'),
        maxEntries: this.config.get('cache.maxEntries')
      });
      console.log('✅ Servicio de cache inicializado');
    }
    
    // Cliente HTTP
    this.services.httpClient = axios.create({
      timeout: this.config.get('http.timeout'),
      maxRedirects: this.config.get('http.maxRedirects'),
      headers: this.config.get('http.headers')
    });
    
    // Configurar interceptores para retry
    this.configureHttpRetry();
    
    console.log('✅ Cliente HTTP configurado');
  }

  /**
   * Inicializa los repositorios
   * @returns {Promise<void>}
   */
  async initializeRepositories() {
    console.log('🔧 Inicializando repositorios...');
    
    const repositories = [];
    
    // MejorTorrent
    if (this.config.isProviderEnabled('mejortorrent')) {
      this.repositories.mejortorrent = new MejorTorrentSearchRepository(
        this.services.httpClient,
        this.services.cache,
        this.config
      );
      repositories.push(this.repositories.mejortorrent);
      console.log('✅ Repositorio MejorTorrent inicializado');
    }
    
    // Wolfmax4k
    if (this.config.isProviderEnabled('wolfmax4k')) {
      this.repositories.wolfmax4k = new Wolfmax4kSearchRepository(
        this.services.httpClient,
        this.services.cache,
        this.config
      );
      repositories.push(this.repositories.wolfmax4k);
      console.log('✅ Repositorio Wolfmax4k inicializado');
    }
    
    // Cinecalidad
    if (this.config.isProviderEnabled('cinecalidad')) {
      this.repositories.cinecalidad = new CinecalidadSearchRepository(
        this.services.httpClient,
        this.services.cache,
        this.config
      );
      repositories.push(this.repositories.cinecalidad);
      console.log('✅ Repositorio Cinecalidad inicializado');
    }
    
    // Servicio de búsqueda principal
    this.services.torrentSearch = new TorrentSearchService(
      [],
      this.services.cache,
      this.config
    );
    
    // Registrar repositorios de forma asíncrona
    await this.services.torrentSearch.initializeRepositories(repositories);
    
    console.log(`✅ Servicio de búsqueda inicializado con ${repositories.length} proveedores`);
  }

  /**
   * Configura Express
   * @returns {Promise<void>}
   */
  async configureExpress() {
    console.log('🔧 Configurando Express...');
    
    // Middleware de seguridad
    this.app.use(helmet({
      contentSecurityPolicy: false, // Deshabilitado para compatibilidad con Stremio
      crossOriginEmbedderPolicy: false
    }));
    
    // Compresión
    this.app.use(compression());
    
    // CORS
    if (this.config.get('security.enableCors')) {
      this.app.use(cors({
        origin: this.config.get('security.corsOrigins'),
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false
      }));
    }
    
    // Rate limiting
    if (this.config.get('security.enableRateLimit')) {
      const limiter = rateLimit({
        windowMs: this.config.get('security.rateLimitWindow'),
        max: this.config.get('security.rateLimitMax'),
        message: {
          error: 'Demasiadas peticiones',
          message: 'Has excedido el límite de peticiones. Intenta de nuevo más tarde.'
        },
        standardHeaders: true,
        legacyHeaders: false
      });
      this.app.use('/api/', limiter);
    }
    
    // Trust proxy si está configurado
    if (this.config.get('security.trustProxy')) {
      this.app.set('trust proxy', 1);
    }
    
    // Parsing de JSON
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    
    // Timeout de requests
    this.app.use((req, res, next) => {
      req.setTimeout(this.config.get('server.timeout'));
      res.setTimeout(this.config.get('server.timeout'));
      next();
    });
    
    console.log('✅ Express configurado');
  }

  /**
   * Configura las rutas
   * @returns {Promise<void>}
   */
  async configureRoutes() {
    console.log('🔧 Configurando rutas...');
    
    // Ruta raíz directa en Express (antes del router)
    this.app.get('/', (req, res) => {
      res.redirect('/manifest.json');
    });
    
    // Crear rutas de torrents
    const torrentRoutes = createTorrentRoutes(
      this.services.torrentSearch,
      console // Logger
    );
    
    // Montar rutas (sin validación global de parámetros)
    this.app.use('/', torrentRoutes);
    
    console.log('✅ Rutas configuradas');
  }

  /**
   * Configura el manejo de errores
   */
  configureErrorHandling() {
    // Manejo de errores no capturados
    process.on('uncaughtException', (error) => {
      console.error('❌ Excepción no capturada:', error);
      this.gracefulShutdown('SIGTERM');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Promesa rechazada no manejada:', reason);
      console.error('En promesa:', promise);
    });
  }

  /**
   * Configura retry para HTTP client
   */
  configureHttpRetry() {
    const retryAttempts = this.config.get('http.retryAttempts');
    const retryDelay = this.config.get('http.retryDelay');
    
    this.services.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        
        if (!config || !config.retry) {
          config.retry = 0;
        }
        
        if (config.retry < retryAttempts && this.shouldRetry(error)) {
          config.retry++;
          
          await new Promise(resolve => 
            setTimeout(resolve, retryDelay * config.retry)
          );
          
          return this.services.httpClient(config);
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Determina si se debe reintentar una petición
   * @param {Error} error - Error de la petición
   * @returns {boolean}
   */
  shouldRetry(error) {
    return (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNABORTED' ||
      (error.response && error.response.status >= 500)
    );
  }

  /**
   * Configura el cierre graceful
   */
  setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        console.log(`\n🛑 Señal ${signal} recibida`);
        this.gracefulShutdown(signal);
      });
    });
  }

  /**
   * Realiza un cierre graceful
   * @param {string} signal - Señal recibida
   */
  async gracefulShutdown(signal) {
    console.log(`🛑 Iniciando cierre graceful por ${signal}...`);
    
    try {
      await this.stop();
      process.exit(0);
    } catch (error) {
      console.error('❌ Error durante cierre graceful:', error);
      process.exit(1);
    }
  }

  /**
   * Limpia recursos
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log('🧹 Limpiando recursos...');
    
    // Limpiar cache
    if (this.services.cache) {
      this.services.cache.destroy();
    }
    
    // Limpiar otros recursos si es necesario
    
    console.log('✅ Recursos limpiados');
  }

  /**
   * Muestra resumen de configuración
   */
  logConfigurationSummary() {
    const summary = this.config.getSummary();
    
    console.log('\n📊 Resumen de configuración:');
    console.log(`   🌐 Servidor: ${summary.server.host}:${summary.server.port}`);
    console.log(`   💾 Cache: ${summary.cache.enabled ? 'Habilitado' : 'Deshabilitado'} (${summary.cache.maxMemoryMB}MB)`);
    console.log(`   🔍 Proveedores: ${summary.providers.enabled.join(', ')} (${summary.providers.total} total)`);
    console.log(`   📋 Resultados máximos: ${summary.search.maxResults}`);
    console.log(`   🌍 Idioma por defecto: ${summary.search.defaultLanguage}`);
    console.log(`   🏗️  Entorno: ${summary.environment}`);
    console.log('');
  }
}

export default TorrentSearchApp;