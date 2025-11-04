/**
 * Patrón Command para manejo de configuración temporal
 * Permite aplicar y revertir cambios de configuración de forma segura
 * Implementa principios de Clean Code y responsabilidad única
 */

import { CONSTANTS } from '../../config/constants.js';

/**
 * Memento para almacenar estado de configuración
 */
export class ConfigurationMemento {
  constructor(state) {
    this.state = Object.freeze(JSON.parse(JSON.stringify(state)));
    this.timestamp = Date.now();
  }

  getState() {
    return this.state;
  }

  getTimestamp() {
    return this.timestamp;
  }

  isExpired(maxAge = CONSTANTS.CACHE.UNIFIED_ID_CACHE_EXPIRY) {
    return Date.now() - this.timestamp > maxAge;
  }
}

/**
 * Comando base para operaciones de configuración
 */
export class ConfigurationCommand {
  constructor(target, logger = console) {
    this.target = target;
    this.logger = logger;
    this.memento = null;
    this.executed = false;
  }

  execute() {
    throw new Error('El método execute debe ser implementado por las subclases');
  }

  undo() {
    if (!this.executed || !this.memento) {
      this.logger.warn('No se puede deshacer: comando no ejecutado o sin memento');
      return false;
    }

    try {
      this._restoreState(this.memento.getState());
      this.executed = false;
      this.logger.debug('Configuración restaurada exitosamente');
      return true;
    } catch (error) {
      this.logger.error('Error al restaurar configuración:', error);
      return false;
    }
  }

  _saveState(state) {
    this.memento = new ConfigurationMemento(state);
  }

  _restoreState(state) {
    throw new Error('El método _restoreState debe ser implementado por las subclases');
  }

  isExecuted() {
    return this.executed;
  }

  getMemento() {
    return this.memento;
  }
}

/**
 * Comando para cambio temporal de configuración de idioma
 */
export class LanguageConfigurationCommand extends ConfigurationCommand {
  constructor(target, type, languageConfig, logger = console) {
    super(target, logger);
    this.type = type;
    this.languageConfig = languageConfig;
  }

  execute() {
    if (this.executed) {
      this.logger.warn('Comando ya ejecutado');
      return false;
    }

    try {
      // Guardar estado actual
      const currentState = {
        providers: this.target.getProviderConfig(this.type)?.providers,
        priorityLanguage: this.target.getProviderConfig(this.type)?.priorityLanguage
      };
      this._saveState(currentState);

      // Aplicar nueva configuración
      this.target.setProviderConfig(this.type, {
        providers: this.languageConfig.providers,
        priorityLanguage: this.languageConfig.priorityLanguage
      });

      this.executed = true;
      this.logger.debug(`Configuración de idioma aplicada para ${this.type}:`, this.languageConfig);
      return true;
    } catch (error) {
      this.logger.error('Error al aplicar configuración de idioma:', error);
      return false;
    }
  }

  _restoreState(state) {
    this.target.setProviderConfig(this.type, {
      providers: state.providers,
      priorityLanguage: state.priorityLanguage
    });
  }
}



/**
 * Invoker para gestionar comandos de configuración
 */
export class ConfigurationInvoker {
  constructor(logger = console) {
    this.logger = logger;
    this.commandStack = [];
    this.maxStackSize = CONSTANTS.LIMIT.MAX_COMMAND_STACK || 10;
  }

  executeCommand(command) {
    if (!(command instanceof ConfigurationCommand)) {
      throw new Error('El comando debe ser una instancia de ConfigurationCommand');
    }

    const success = command.execute();
    if (success) {
      this.commandStack.push(command);
      this._trimStack();
      this.logger.debug('Comando ejecutado y agregado al stack');
    }
    return success;
  }

  undoLastCommand() {
    if (this.commandStack.length === 0) {
      this.logger.warn('No hay comandos para deshacer');
      return false;
    }

    const command = this.commandStack.pop();
    const success = command.undo();
    if (success) {
      this.logger.debug('Último comando deshecho exitosamente');
    }
    return success;
  }

  undoAllCommands() {
    let success = true;
    while (this.commandStack.length > 0) {
      if (!this.undoLastCommand()) {
        success = false;
      }
    }
    return success;
  }

  getCommandCount() {
    return this.commandStack.length;
  }

  clearStack() {
    this.commandStack = [];
    this.logger.debug('Stack de comandos limpiado');
  }

  _trimStack() {
    while (this.commandStack.length > this.maxStackSize) {
      this.commandStack.shift();
    }
  }
}

/**
 * Factory para crear comandos de configuración
 */
export class ConfigurationCommandFactory {
  static createLanguageCommand(target, type, languageConfig, logger = console) {
    return new LanguageConfigurationCommand(target, type, languageConfig, logger);
  }



  static createInvoker(logger = console) {
    return new ConfigurationInvoker(logger);
  }
}