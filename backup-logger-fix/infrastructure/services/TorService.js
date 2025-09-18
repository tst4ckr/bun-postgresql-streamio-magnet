/**
 * @fileoverview TorService - Servicio dedicado para gestión de Tor.
 * Maneja configuración, conexión, rotación de sesiones y verificación de disponibilidad.
 */

import net from 'net';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { CONSTANTS } from '../../config/constants.js';
import { EnhancedLogger } from '../utils/EnhancedLogger.js';

/**
 * Servicio para gestión completa de Tor.
 * Implementa el patrón Service con responsabilidad única para operaciones Tor.
 */
export class TorService {
  #enabled;
  #host;
  #port;
  #controlHost;
  #controlPort;
  #maxRetries;
  #retryDelay;
  #timeout;
  #logger;
  #rotationInterval;
  #agent;

  /**
   * @param {Object} config - Configuración de Tor
   * @param {boolean} config.enabled - Si Tor está habilitado
   * @param {string} config.host - Host de Tor
   * @param {number} config.port - Puerto de Tor
   * @param {string} config.controlHost - Host de control de Tor
   * @param {number} config.controlPort - Puerto de control de Tor
   * @param {number} config.maxRetries - Máximo número de reintentos
   * @param {number} config.retryDelay - Delay entre reintentos
   * @param {number} config.timeout - Timeout para peticiones
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config = {}, logger = null) {
    this.#enabled = config.enabled ?? true;
    this.#host = config.host ?? CONSTANTS.NETWORK.TOR_DEFAULT_HOST;
    this.#port = config.port ?? CONSTANTS.NETWORK.TOR_DEFAULT_PORT;
    this.#controlHost = config.controlHost ?? CONSTANTS.NETWORK.TOR_CONTROL_DEFAULT_HOST;
    this.#controlPort = config.controlPort ?? CONSTANTS.NETWORK.TOR_CONTROL_DEFAULT_PORT;
    this.#maxRetries = config.maxRetries ?? CONSTANTS.NETWORK.MAX_RETRIES;
    this.#retryDelay = config.retryDelay ?? CONSTANTS.TIME.TOR_RETRY_DELAY;
    this.#timeout = config.timeout ?? CONSTANTS.TIME.DEFAULT_TIMEOUT;
    this.#logger = logger || new EnhancedLogger('TorService');
    this.#rotationInterval = null;
    this.#agent = null;

    this.#initializeAgent();
    this.#startAutoRotation();

    if (this.#enabled) {
      this.#logger.log('info', `Tor configurado en ${this.#host}:${this.#port}`, { component: 'TorService' });
    }
  }

  /**
   * Inicializa el agente SOCKS para Tor
   * @private
   */
  #initializeAgent() {
    if (this.#enabled) {
      this.#agent = new SocksProxyAgent(`socks5h://${this.#host}:${this.#port}`);
    }
  }

  /**
   * Verifica si Tor está disponible y ejecutándose
   * @returns {Promise<boolean>} - true si Tor está disponible
   */
  async isAvailable() {
    if (!this.#enabled) {
      return false;
    }

    return new Promise((resolve) => {
      this.#logger.log('debug', `Verificando disponibilidad de Tor en ${this.#host}:${this.#port}`, { component: 'TorService' });
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        this.#logger.log('warn', 'Timeout al verificar Tor - considerando no disponible', { component: 'TorService' });
        socket.destroy();
        resolve(false);
      }, CONSTANTS.NETWORK.TOR_CHECK_TIMEOUT);
      
      socket.connect(this.#port, this.#host, () => {
        this.#logger.log('info', 'Tor detectado y disponible', { component: 'TorService' });
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', (err) => {
        this.#logger.log('warn', `Error al conectar con Tor: ${err.message}`, { component: 'TorService' });
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Realiza una petición HTTP a través de Tor
   * @param {string} url - URL a consultar
   * @param {number} attempt - Número de intento actual
   * @returns {Promise<Response>} - Respuesta de la petición
   */
  async fetch(url, attempt = 1) {
    if (!this.#enabled) {
      throw new Error('Tor no está habilitado');
    }

    // Verificar disponibilidad en el primer intento
    if (attempt === 1) {
      const available = await this.isAvailable();
      if (!available) {
        throw new Error('Tor no está disponible');
      }
    }

    try {
      this.#logger.log('info', `Intento ${attempt}/${this.#maxRetries} - Consultando vía Tor: ${url}`, { component: 'TorService' });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.#timeout);

      const response = await fetch(url, {
        agent: this.#agent,
        signal: controller.signal,
        headers: {
          'User-Agent': CONSTANTS.NETWORK.FIREFOX_USER_AGENT,
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.#logger.log('info', `Respuesta exitosa vía Tor (${response.status}) en intento ${attempt}`, { component: 'TorService' });
        return response;
      }

      // Manejar error 502 con rotación de sesión
      if (response.status === 502 && attempt < this.#maxRetries) {
        this.#logger.log('warn', `Error 502 detectado, rotando sesión Tor e intentando nuevamente (${attempt}/${this.#maxRetries})`, { component: 'TorService' });
        await this.rotateSession();
        await this.#delay(this.#retryDelay);
        return this.fetch(url, attempt + 1);
      }

      this.#logger.log('warn', `Respuesta no exitosa vía Tor: ${response.status} en intento ${attempt}`, { component: 'TorService' });
      return response;

    } catch (error) {
      if (error.name === 'AbortError') {
        error = new Error(`Timeout de ${this.#timeout}ms excedido para: ${url}`);
      }

      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Tor no está ejecutándose en ${this.#host}:${this.#port}`);
      }
      
      if (attempt < this.#maxRetries && (error.code === 'ETIMEDOUT' || error.message.includes('Timeout'))) {
        this.#logger.log('warn', `Error de conexión, rotando sesión Tor e intentando nuevamente (${attempt}/${this.#maxRetries}): ${error.message}`, { component: 'TorService' });
        await this.rotateSession();
        await this.#delay(this.#retryDelay);
        return this.fetch(url, attempt + 1);
      }

      this.#logger.log('error', `Error en petición Tor después de ${attempt} intentos: ${error.message}`, { component: 'TorService' });
      throw error;
    }
  }

  /**
   * Rota la sesión de Tor para obtener nueva IP
   * @returns {Promise<void>}
   */
  async rotateSession() {
    if (!this.#controlPort || !this.#controlHost) {
      this.#logger.log('warn', 'Control de Tor no configurado correctamente - saltando rotación', { component: 'TorService' });
      return;
    }

    return new Promise((resolve) => {
      const socket = net.createConnection({ 
        port: this.#controlPort, 
        host: this.#controlHost 
      }, () => {
        socket.write('AUTHENTICATE ""\r\n');
        socket.write('SIGNAL NEWNYM\r\n');
        socket.write('QUIT\r\n');
      });

      socket.on('data', (data) => {
        const response = data.toString();
        if (response.includes('250 OK')) {
          this.#logger.log('info', 'Sesión Tor rotada exitosamente - nueva IP obtenida', { component: 'TorService' });
          // Reinicializar agente con nueva sesión
          this.#initializeAgent();
        }
      });

      socket.on('end', () => {
        resolve();
      });

      socket.on('error', (err) => {
        this.#logger.log('warn', `No se pudo rotar sesión Tor: ${err.message}`, { component: 'TorService' });
        resolve(); // Resolve anyway to not block the process
      });
    });
  }

  /**
   * Inicia la rotación automática de circuitos Tor
   * @private
   */
  #startAutoRotation() {
    if (!this.#enabled) {
      this.#logger.log('debug', 'Tor no está habilitado, omitiendo rotación automática', { component: 'TorService' });
      return;
    }

    // Rotar circuitos cada 5 minutos (300000 ms)
    this.#rotationInterval = setInterval(async () => {
      try {
        await this.rotateSession();
        this.#logger.log('info', 'Rotación automática de circuitos Tor completada', { component: 'TorService' });
      } catch (error) {
        this.#logger.log('error', 'Error en rotación automática de Tor:', error, { component: 'TorService' });
      }
    }, 300000);

    this.#logger.log('info', 'Rotación automática de circuitos Tor iniciada (cada 5 minutos)', { component: 'TorService' });
  }

  /**
   * Detiene la rotación automática de circuitos Tor
   */
  stopAutoRotation() {
    if (this.#rotationInterval) {
      clearInterval(this.#rotationInterval);
      this.#rotationInterval = null;
      this.#logger.log('info', 'Rotación automática de circuitos Tor detenida', { component: 'TorService' });
    }
  }

  /**
   * Obtiene el agente SOCKS configurado
   * @returns {SocksProxyAgent|null} - Agente SOCKS o null si Tor está deshabilitado
   */
  getAgent() {
    return this.#agent;
  }

  /**
   * Verifica si Tor está habilitado
   * @returns {boolean} - true si Tor está habilitado
   */
  isEnabled() {
    return this.#enabled;
  }

  /**
   * Obtiene la configuración actual de Tor
   * @returns {Object} - Configuración de Tor
   */
  getConfig() {
    return {
      enabled: this.#enabled,
      host: this.#host,
      port: this.#port,
      controlHost: this.#controlHost,
      controlPort: this.#controlPort,
      maxRetries: this.#maxRetries,
      retryDelay: this.#retryDelay,
      timeout: this.#timeout
    };
  }

  /**
   * Delay helper para reintentos
   * @private
   * @param {number} ms - Milisegundos a esperar
   */
  async #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Destructor para limpiar recursos
   */
  destroy() {
    this.stopAutoRotation();
    this.#agent = null;
    this.#logger.log('info', 'TorService destruido y recursos liberados', { component: 'TorService' });
  }
}

export default TorService;