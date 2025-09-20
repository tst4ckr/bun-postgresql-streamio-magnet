/**
 * Servicio de gestión de canales inválidos
 * Centraliza la lógica de desactivación y validación de canales
 * Implementa principios de Domain-Driven Design y Arquitectura Limpia
 */
export class InvalidChannelManagementService {
  #channelRepository;
  #config;
  #logger;
  #eventEmitter;

  /**
   * @param {Object} channelRepository - Repositorio de canales
   * @param {Object} config - Configuración del sistema
   * @param {Object} logger - Logger del sistema
   * @param {Object} eventEmitter - Emisor de eventos (opcional)
   */
  constructor(channelRepository, config, logger = console, eventEmitter = null) {
    this.#channelRepository = channelRepository;
    this.#config = config;
    this.#logger = logger;
    this.#eventEmitter = eventEmitter;
  }

  /**
   * Procesa resultados de validación masiva de canales
   * @param {Array} validationResults - Resultados de validación
   * @returns {Promise<{validated: number, deactivated: number, errors: Array}>}
   */
  async processValidationResults(validationResults) {
    if (!this.isEnabled()) {
      this.#logger.debug('Desactivación automática deshabilitada');
      return { validated: 0, deactivated: 0, errors: [] };
    }

    const stats = { validated: 0, deactivated: 0, errors: [] };

    const processingPromises = validationResults.map(async (result) => {
      try {
        if (result.ok) {
          await this.#markChannelAsValid(result);
          stats.validated++;
        } else {
          await this.#deactivateInvalidChannel(result);
          stats.deactivated++;
        }
      } catch (error) {
        stats.errors.push({
          channelId: result.id,
          channelName: result.name,
          error: error.message
        });
        this.#logger.error(`Error en canal ${result.id}:`, error);
      }
    });

    await Promise.all(processingPromises);
    this.#logProcessingResults(stats);
    this.#emitProcessingEvent(stats);

    return stats;
  }

  /**
   * Desactiva un canal específico
   * @param {string} channelId - ID del canal
   * @param {string} reason - Razón de la desactivación
   * @returns {Promise<boolean>}
   */
  async deactivateChannel(channelId, reason = 'Manual deactivation') {
    if (!this.isEnabled()) {
      this.#logger.warn(`No se puede desactivar ${channelId}: REMOVE_INVALID_STREAMS deshabilitado`);
      return false;
    }

    try {
      await this.#channelRepository.deactivateChannel(channelId, reason);
      this.#logger.info(`Canal ${channelId} desactivado: ${reason}`);
      
      this.#emitChannelEvent('channel.deactivated', {
        channelId,
        reason,
        timestamp: this.#getTimestamp()
      });
      
      return true;
    } catch (error) {
      this.#logger.error(`Error al desactivar ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Marca un canal como validado
   * @param {string} channelId - ID del canal
   * @returns {Promise<boolean>}
   */
  async markChannelAsValidated(channelId) {
    try {
      await this.#channelRepository.markChannelAsValidated(channelId);
      this.#logger.debug(`Canal ${channelId} validado`);
      
      this.#emitChannelEvent('channel.validated', {
        channelId,
        timestamp: this.#getTimestamp()
      });
      
      return true;
    } catch (error) {
      this.#logger.error(`Error al validar ${channelId}:`, error);
      throw error;
    }
  }



  /**
   * Verifica si la gestión de canales inválidos está habilitada
   * @returns {boolean}
   */
  isEnabled() {
    return this.#config.validation?.removeInvalidStreams === true;
  }

  // Métodos privados

  /**
   * Marca un canal como válido basado en resultado de validación
   * @param {Object} result - Resultado de validación
   * @private
   */
  async #markChannelAsValid(result) {
    await this.#channelRepository.markChannelAsValidated(result.id);
    this.#logger.debug(`Canal ${result.id} validado`);
  }

  /**
   * Desactiva un canal inválido basado en resultado de validación
   * @param {Object} result - Resultado de validación
   * @private
   */
  async #deactivateInvalidChannel(result) {
    const reason = this.#extractFailureReason(result);
    await this.#channelRepository.deactivateChannel(result.id, reason);
    this.#logger.info(`Canal ${result.id} desactivado: ${reason}`);
  }

  /**
   * Extrae la razón del fallo de validación
   * @param {Object} result - Resultado de validación
   * @returns {string}
   * @private
   */
  #extractFailureReason(result) {
    return result.meta?.reason || result.meta?.error || result.meta?.message || 'Stream validation failed';
  }

  /**
   * Registra los resultados del procesamiento
   * @param {Object} stats - Estadísticas del procesamiento
   * @private
   */
  #logProcessingResults(stats) {
    if (stats.validated > 0 || stats.deactivated > 0) {
      this.#logger.info(
        `Validación: ${stats.validated} OK, ${stats.deactivated} desactivados`
      );
    }

    if (stats.errors.length > 0) {
      this.#logger.warn(`${stats.errors.length} errores en procesamiento`);
    }
  }

  /**
   * Emite evento de procesamiento completado
   * @param {Object} stats - Estadísticas del procesamiento
   * @private
   */
  #emitProcessingEvent(stats) {
    this.#emitChannelEvent('channels.validation.processed', {
      ...stats,
      timestamp: this.#getTimestamp()
    });
  }

  /**
   * Emite un evento relacionado con canales
   * @param {string} eventName - Nombre del evento
   * @param {Object} data - Datos del evento
   * @private
   */
  #emitChannelEvent(eventName, data) {
    if (this.#eventEmitter?.emit) {
      this.#eventEmitter.emit(eventName, data);
    }
  }

  /**
   * Genera timestamp ISO consistente
   * @returns {string}
   * @private
   */
  #getTimestamp() {
    return new Date().toISOString();
  }
}

export default InvalidChannelManagementService;