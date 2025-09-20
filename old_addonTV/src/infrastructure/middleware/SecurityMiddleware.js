/**
 * @fileoverview Middleware de seguridad para el addon de Stremio
 * Implementa configuración centralizada de Helmet, CORS y Rate Limiting
 * Maneja toda la configuración de seguridad del servidor según el SDK de Stremio
 */

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';

/**
 * Clase responsable de configurar y gestionar middleware de seguridad
 * Aplica principio de responsabilidad única y Clean Architecture
 */
export class SecurityMiddleware {
  #config;
  #logger;

  constructor(config, logger) {
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Configura y retorna todos los middlewares de seguridad
   * @returns {Array} Array de middlewares configurados
   */
  getMiddlewares() {
    const middlewares = [];

    if (this.#config.server.enableHelmet) {
      middlewares.push(this.#createHelmetMiddleware());
      this.#logger.info('Helmet con políticas de seguridad avanzadas activado');
    }

    if (this.#config.server.enableCors) {
      middlewares.push(this.#createCorsMiddleware());
      this.#logger.info('CORS con políticas de origen seguras activado');
    }

    if (this.#config.server.rateLimitRequestsPerMinute > 0) {
      middlewares.push(this.#createRateLimitMiddleware());
      this.#logger.info(`Rate limiting activado: ${this.#config.server.rateLimitRequestsPerMinute} req/min`);
    }

    return middlewares;
  }

  /**
   * Configura las opciones del servidor según el SDK de Stremio
   * @returns {Object} Opciones del servidor configuradas
   */
  configureServerOptions() {
    const middlewares = this.getMiddlewares();
    
    const serverOptions = {
      port: this.#config.server.port,
      cacheMaxAge: this.#config.cache.catalogCacheMaxAge
    };

    // Configurar directorio static solo si existe
    const staticDir = path.join(process.cwd(), 'static');
    if (fs.existsSync(staticDir)) {
      serverOptions.static = '/static';
      this.#logger.info('Directorio static para archivos estáticos configurado');
    } else {
      this.#logger.info('Directorio static no encontrado, omitiendo configuración');
    }

    // Aplicar middleware si existe
    if (middlewares.length > 0) {
      serverOptions.middleware = middlewares;
    }

    this.#logger.info(`Opciones de servidor configuradas para puerto ${serverOptions.port}`);
    return serverOptions;
  }

  /**
   * Crea middleware de Helmet con configuración de seguridad avanzada
   * @private
   * @returns {Function} Middleware de Helmet
   */
  #createHelmetMiddleware() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:"],
          fontSrc: ["'self'", "https:", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", "https:", "http:"],
          frameSrc: ["'none'"]
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      xssFilter: true
    });
  }

  /**
   * Crea middleware de CORS con configuración segura
   * @private
   * @returns {Function} Middleware de CORS
   */
  #createCorsMiddleware() {
    return cors({
      origin: this.#createOriginValidator(),
      methods: ['GET', 'HEAD', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: false,
      maxAge: 86400 // Cache preflight por 24 horas
    });
  }

  /**
   * Crea validador de origen para CORS
   * @private
   * @returns {Function} Función validadora de origen
   */
  #createOriginValidator() {
    return (origin, callback) => {
      // Permitir requests sin origin (aplicaciones móviles, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // Permitir dominios de Stremio
      const allowedOrigins = [
        'https://app.strem.io',
        'https://web.strem.io',
        'https://staging.strem.io'
      ];
      
      // Agregar origen personalizado si está configurado
      if (this.#config.server.corsOrigin && this.#config.server.corsOrigin !== '*') {
        allowedOrigins.push(this.#config.server.corsOrigin);
      }
      
      // En desarrollo, permitir localhost
      if (this.#config.isDevelopment()) {
        allowedOrigins.push(/^http:\/\/localhost(:\d+)?$/);
        allowedOrigins.push(/^http:\/\/127\.0\.0\.1(:\d+)?$/);
      }
      
      // Verificar si el origen está permitido
      const isAllowed = allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') return allowed === origin;
        if (allowed instanceof RegExp) return allowed.test(origin);
        return false;
      });
      
      callback(null, isAllowed || this.#config.server.corsOrigin === '*');
    };
  }

  /**
   * Crea middleware de rate limiting
   * @private
   * @returns {Function} Middleware de rate limiting
   */
  #createRateLimitMiddleware() {
    return rateLimit({
      windowMs: 60 * 1000, // 1 minuto
      max: this.#config.server.rateLimitRequestsPerMinute,
      message: {
        error: 'Demasiadas solicitudes, intenta de nuevo en un minuto.',
        retryAfter: 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      // Permitir más requests para endpoints de manifest
      skip: (req) => {
        return req.path === '/manifest.json' || req.path.endsWith('/manifest.json');
      },
      // Headers personalizados para debugging
      keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress || 'unknown';
      }
    });
  }
}