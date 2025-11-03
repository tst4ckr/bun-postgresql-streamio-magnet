/**
 * @fileoverview Tests unitarios para patrón ConfigurationCommand
 * Valida implementación de Command Pattern con Memento para configuración temporal
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConfigurationMemento,
  ConfigurationCommand,
  LanguageConfigurationCommand,
  ConfigurationInvoker,
  ConfigurationCommandFactory
} from '../../../../src/infrastructure/patterns/ConfigurationCommand.js';
import { CONSTANTS } from '../../../../src/config/constants.js';

describe('ConfigurationCommand Pattern', () => {
  let mockLogger;
  let mockTarget;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockTarget = {
      getProviderConfig: vi.fn(),
      setProviderConfig: vi.fn()
    };

    vi.clearAllMocks();
  });

  describe('ConfigurationMemento', () => {
    it('should create memento with frozen state', () => {
      const state = { language: 'es', providers: ['torrentio'] };
      const memento = new ConfigurationMemento(state);

      expect(memento.getState()).toEqual(state);
      expect(Object.isFrozen(memento.getState())).toBe(true);
    });

    it('should create deep copy of state', () => {
      const originalState = { 
        language: 'es', 
        nested: { providers: ['torrentio'] } 
      };
      const memento = new ConfigurationMemento(originalState);

      // Modify original state
      originalState.language = 'en';
      originalState.nested.providers.push('jackett');

      // Memento should be unchanged
      expect(memento.getState().language).toBe('es');
      expect(memento.getState().nested.providers).toEqual(['torrentio']);
    });

    it('should store timestamp on creation', () => {
      const beforeCreation = Date.now();
      const memento = new ConfigurationMemento({ test: 'data' });
      const afterCreation = Date.now();

      const timestamp = memento.getTimestamp();
      expect(timestamp).toBeGreaterThanOrEqual(beforeCreation);
      expect(timestamp).toBeLessThanOrEqual(afterCreation);
    });

    it('should check expiration correctly', () => {
      const memento = new ConfigurationMemento({ test: 'data' });

      // Should not be expired immediately
      expect(memento.isExpired(1000)).toBe(false);

      // Mock old timestamp
      memento.timestamp = Date.now() - 2000;
      expect(memento.isExpired(1000)).toBe(true);
    });

    it('should use default expiry from constants', () => {
      const memento = new ConfigurationMemento({ test: 'data' });
      
      // Mock old timestamp beyond default expiry
      memento.timestamp = Date.now() - (CONSTANTS.CACHE.UNIFIED_ID_CACHE_EXPIRY + 1000);
      
      expect(memento.isExpired()).toBe(true);
    });

    it('should handle null and undefined state', () => {
      const nullMemento = new ConfigurationMemento(null);
      const undefinedMemento = new ConfigurationMemento(undefined);

      expect(nullMemento.getState()).toBe(null);
      expect(undefinedMemento.getState()).toBe(undefined);
    });

    it('should handle complex nested objects', () => {
      const complexState = {
        providers: {
          torrentio: { enabled: true, priority: 1 },
          jackett: { enabled: false, priority: 2 }
        },
        languages: ['es', 'en'],
        metadata: {
          created: new Date(),
          version: '1.0.0'
        }
      };

      const memento = new ConfigurationMemento(complexState);
      const retrievedState = memento.getState();

      expect(retrievedState).toEqual(complexState);
      expect(retrievedState).not.toBe(complexState); // Different reference
    });
  });

  describe('ConfigurationCommand (Base Class)', () => {
    let command;

    beforeEach(() => {
      command = new ConfigurationCommand(mockTarget, mockLogger);
    });

    it('should initialize with target and logger', () => {
      expect(command.target).toBe(mockTarget);
      expect(command.logger).toBe(mockLogger);
      expect(command.executed).toBe(false);
      expect(command.memento).toBe(null);
    });

    it('should use console as default logger', () => {
      const commandWithDefaultLogger = new ConfigurationCommand(mockTarget);
      expect(commandWithDefaultLogger.logger).toBe(console);
    });

    it('should throw error when execute is not implemented', () => {
      expect(() => command.execute()).toThrow('El método execute debe ser implementado por las subclases');
    });

    it('should throw error when _restoreState is not implemented', () => {
      expect(() => command._restoreState({})).toThrow('El método _restoreState debe ser implementado por las subclases');
    });

    it('should not undo when not executed', () => {
      const result = command.undo();

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('No se puede deshacer: comando no ejecutado o sin memento');
    });

    it('should not undo when no memento exists', () => {
      command.executed = true;

      const result = command.undo();

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('No se puede deshacer: comando no ejecutado o sin memento');
    });

    it('should save state correctly', () => {
      const state = { test: 'data' };
      command._saveState(state);

      expect(command.memento).toBeInstanceOf(ConfigurationMemento);
      expect(command.memento.getState()).toEqual(state);
    });

    it('should return execution status', () => {
      expect(command.isExecuted()).toBe(false);

      command.executed = true;
      expect(command.isExecuted()).toBe(true);
    });

    it('should return memento', () => {
      expect(command.getMemento()).toBe(null);

      const state = { test: 'data' };
      command._saveState(state);
      expect(command.getMemento()).toBeInstanceOf(ConfigurationMemento);
    });
  });

  describe('LanguageConfigurationCommand', () => {
    let command;
    const type = 'torrentio';
    const languageConfig = {
      providers: ['torrentio-es', 'torrentio-en'],
      priorityLanguage: 'es'
    };

    beforeEach(() => {
      command = new LanguageConfigurationCommand(mockTarget, type, languageConfig, mockLogger);
    });

    it('should initialize with type and language config', () => {
      expect(command.type).toBe(type);
      expect(command.languageConfig).toBe(languageConfig);
    });

    it('should execute successfully', () => {
      const currentConfig = {
        providers: ['torrentio-en'],
        priorityLanguage: 'en'
      };

      mockTarget.getProviderConfig.mockReturnValue(currentConfig);

      const result = command.execute();

      expect(result).toBe(true);
      expect(command.executed).toBe(true);
      expect(mockTarget.getProviderConfig).toHaveBeenCalledWith(type);
      expect(mockTarget.setProviderConfig).toHaveBeenCalledWith(type, languageConfig);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Configuración de idioma aplicada para ${type}:`,
        languageConfig
      );
    });

    it('should not execute twice', () => {
      mockTarget.getProviderConfig.mockReturnValue({});
      
      command.execute();
      const result = command.execute();

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Comando ya ejecutado');
    });

    it('should handle execution errors', () => {
      mockTarget.getProviderConfig.mockImplementation(() => {
        throw new Error('Provider config error');
      });

      const result = command.execute();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error al aplicar configuración de idioma:',
        expect.any(Error)
      );
    });

    it('should save current state before execution', () => {
      const currentConfig = {
        providers: ['torrentio-en'],
        priorityLanguage: 'en'
      };

      mockTarget.getProviderConfig.mockReturnValue(currentConfig);

      command.execute();

      expect(command.memento).toBeInstanceOf(ConfigurationMemento);
      expect(command.memento.getState()).toEqual(currentConfig);
    });

    it('should restore state correctly', () => {
      const originalConfig = {
        providers: ['torrentio-en'],
        priorityLanguage: 'en'
      };

      mockTarget.getProviderConfig.mockReturnValue(originalConfig);
      command.execute();

      const result = command.undo();

      expect(result).toBe(true);
      expect(mockTarget.setProviderConfig).toHaveBeenCalledWith(type, originalConfig);
      expect(command.executed).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Configuración restaurada exitosamente');
    });

    it('should handle undo errors', () => {
      const originalConfig = {
        providers: ['torrentio-en'],
        priorityLanguage: 'en'
      };

      mockTarget.getProviderConfig.mockReturnValue(originalConfig);
      command.execute();

      mockTarget.setProviderConfig.mockImplementation(() => {
        throw new Error('Restore error');
      });

      const result = command.undo();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error al restaurar configuración:',
        expect.any(Error)
      );
    });

    it('should handle null provider config', () => {
      mockTarget.getProviderConfig.mockReturnValue(null);

      const result = command.execute();

      expect(result).toBe(true);
      expect(command.memento.getState()).toEqual({
        providers: undefined,
        priorityLanguage: undefined
      });
    });

    it('should handle undefined provider config', () => {
      mockTarget.getProviderConfig.mockReturnValue(undefined);

      const result = command.execute();

      expect(result).toBe(true);
      expect(command.memento.getState()).toEqual({
        providers: undefined,
        priorityLanguage: undefined
      });
    });
  });

  describe('ConfigurationInvoker', () => {
    let invoker;
    let mockCommand;

    beforeEach(() => {
      invoker = new ConfigurationInvoker(mockLogger);
      
      mockCommand = {
        execute: vi.fn(),
        undo: vi.fn()
      };
      Object.setPrototypeOf(mockCommand, ConfigurationCommand.prototype);
    });

    it('should initialize with logger and empty stack', () => {
      expect(invoker.logger).toBe(mockLogger);
      expect(invoker.commandStack).toEqual([]);
      expect(invoker.maxStackSize).toBe(CONSTANTS.LIMIT.MAX_COMMAND_STACK || 10);
    });

    it('should use console as default logger', () => {
      const invokerWithDefaultLogger = new ConfigurationInvoker();
      expect(invokerWithDefaultLogger.logger).toBe(console);
    });

    it('should execute command successfully', () => {
      mockCommand.execute.mockReturnValue(true);

      const result = invoker.executeCommand(mockCommand);

      expect(result).toBe(true);
      expect(mockCommand.execute).toHaveBeenCalled();
      expect(invoker.commandStack).toContain(mockCommand);
      expect(mockLogger.debug).toHaveBeenCalledWith('Comando ejecutado y agregado al stack');
    });

    it('should not add failed commands to stack', () => {
      mockCommand.execute.mockReturnValue(false);

      const result = invoker.executeCommand(mockCommand);

      expect(result).toBe(false);
      expect(invoker.commandStack).not.toContain(mockCommand);
    });

    it('should throw error for invalid command type', () => {
      const invalidCommand = { execute: vi.fn() };

      expect(() => invoker.executeCommand(invalidCommand)).toThrow(
        'El comando debe ser una instancia de ConfigurationCommand'
      );
    });

    it('should undo last command successfully', () => {
      mockCommand.execute.mockReturnValue(true);
      mockCommand.undo.mockReturnValue(true);

      invoker.executeCommand(mockCommand);
      const result = invoker.undoLastCommand();

      expect(result).toBe(true);
      expect(mockCommand.undo).toHaveBeenCalled();
      expect(invoker.commandStack).toHaveLength(0);
      expect(mockLogger.debug).toHaveBeenCalledWith('Último comando deshecho exitosamente');
    });

    it('should handle undo when stack is empty', () => {
      const result = invoker.undoLastCommand();

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('No hay comandos para deshacer');
    });

    it('should handle failed undo operations', () => {
      mockCommand.execute.mockReturnValue(true);
      mockCommand.undo.mockReturnValue(false);

      invoker.executeCommand(mockCommand);
      const result = invoker.undoLastCommand();

      expect(result).toBe(false);
      expect(invoker.commandStack).toHaveLength(0); // Command still removed from stack
    });

    it('should undo all commands', () => {
      const command1 = { ...mockCommand, execute: vi.fn().mockReturnValue(true), undo: vi.fn().mockReturnValue(true) };
      const command2 = { ...mockCommand, execute: vi.fn().mockReturnValue(true), undo: vi.fn().mockReturnValue(true) };
      Object.setPrototypeOf(command1, ConfigurationCommand.prototype);
      Object.setPrototypeOf(command2, ConfigurationCommand.prototype);

      invoker.executeCommand(command1);
      invoker.executeCommand(command2);

      const result = invoker.undoAllCommands();

      expect(result).toBe(true);
      expect(command1.undo).toHaveBeenCalled();
      expect(command2.undo).toHaveBeenCalled();
      expect(invoker.commandStack).toHaveLength(0);
    });

    it('should return false if any undo fails in undoAllCommands', () => {
      const command1 = { ...mockCommand, execute: vi.fn().mockReturnValue(true), undo: vi.fn().mockReturnValue(true) };
      const command2 = { ...mockCommand, execute: vi.fn().mockReturnValue(true), undo: vi.fn().mockReturnValue(false) };
      Object.setPrototypeOf(command1, ConfigurationCommand.prototype);
      Object.setPrototypeOf(command2, ConfigurationCommand.prototype);

      invoker.executeCommand(command1);
      invoker.executeCommand(command2);

      const result = invoker.undoAllCommands();

      expect(result).toBe(false);
      expect(invoker.commandStack).toHaveLength(0);
    });

    it('should return correct command count', () => {
      expect(invoker.getCommandCount()).toBe(0);

      mockCommand.execute.mockReturnValue(true);
      invoker.executeCommand(mockCommand);

      expect(invoker.getCommandCount()).toBe(1);
    });

    it('should clear command stack', () => {
      mockCommand.execute.mockReturnValue(true);
      invoker.executeCommand(mockCommand);

      invoker.clearStack();

      expect(invoker.commandStack).toHaveLength(0);
      expect(mockLogger.debug).toHaveBeenCalledWith('Stack de comandos limpiado');
    });

    it('should trim stack when exceeding max size', () => {
      invoker.maxStackSize = 2;

      const commands = Array.from({ length: 3 }, (_, i) => {
        const cmd = { execute: vi.fn().mockReturnValue(true), undo: vi.fn() };
        Object.setPrototypeOf(cmd, ConfigurationCommand.prototype);
        return cmd;
      });

      commands.forEach(cmd => invoker.executeCommand(cmd));

      expect(invoker.commandStack).toHaveLength(2);
      expect(invoker.commandStack).not.toContain(commands[0]); // First command should be removed
      expect(invoker.commandStack).toContain(commands[1]);
      expect(invoker.commandStack).toContain(commands[2]);
    });

    it('should handle concurrent command execution', async () => {
      const commands = Array.from({ length: 5 }, (_, i) => {
        const cmd = { execute: vi.fn().mockReturnValue(true), undo: vi.fn() };
        Object.setPrototypeOf(cmd, ConfigurationCommand.prototype);
        return cmd;
      });

      const promises = commands.map(cmd => 
        Promise.resolve().then(() => invoker.executeCommand(cmd))
      );

      const results = await Promise.all(promises);

      expect(results.every(result => result === true)).toBe(true);
      expect(invoker.commandStack).toHaveLength(5);
    });
  });

  describe('ConfigurationCommandFactory', () => {
    it('should create language command', () => {
      const type = 'torrentio';
      const languageConfig = { providers: ['test'], priorityLanguage: 'es' };

      const command = ConfigurationCommandFactory.createLanguageCommand(
        mockTarget, 
        type, 
        languageConfig, 
        mockLogger
      );

      expect(command).toBeInstanceOf(LanguageConfigurationCommand);
      expect(command.target).toBe(mockTarget);
      expect(command.type).toBe(type);
      expect(command.languageConfig).toBe(languageConfig);
      expect(command.logger).toBe(mockLogger);
    });

    it('should create language command with default logger', () => {
      const command = ConfigurationCommandFactory.createLanguageCommand(
        mockTarget, 
        'torrentio', 
        { providers: ['test'], priorityLanguage: 'es' }
      );

      expect(command.logger).toBe(console);
    });

    it('should create invoker', () => {
      const invoker = ConfigurationCommandFactory.createInvoker(mockLogger);

      expect(invoker).toBeInstanceOf(ConfigurationInvoker);
      expect(invoker.logger).toBe(mockLogger);
    });

    it('should create invoker with default logger', () => {
      const invoker = ConfigurationCommandFactory.createInvoker();

      expect(invoker.logger).toBe(console);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow with factory', () => {
      const type = 'torrentio';
      const languageConfig = {
        providers: ['torrentio-es'],
        priorityLanguage: 'es'
      };
      const originalConfig = {
        providers: ['torrentio-en'],
        priorityLanguage: 'en'
      };

      mockTarget.getProviderConfig.mockReturnValue(originalConfig);

      // Create command and invoker using factory
      const command = ConfigurationCommandFactory.createLanguageCommand(
        mockTarget, 
        type, 
        languageConfig, 
        mockLogger
      );
      const invoker = ConfigurationCommandFactory.createInvoker(mockLogger);

      // Execute command
      const executeResult = invoker.executeCommand(command);
      expect(executeResult).toBe(true);
      expect(mockTarget.setProviderConfig).toHaveBeenCalledWith(type, languageConfig);

      // Undo command
      const undoResult = invoker.undoLastCommand();
      expect(undoResult).toBe(true);
      expect(mockTarget.setProviderConfig).toHaveBeenCalledWith(type, originalConfig);
    });

    it('should handle multiple commands with different configurations', () => {
      const invoker = ConfigurationCommandFactory.createInvoker(mockLogger);

      const command1 = ConfigurationCommandFactory.createLanguageCommand(
        mockTarget, 
        'torrentio', 
        { providers: ['torrentio-es'], priorityLanguage: 'es' }, 
        mockLogger
      );

      const command2 = ConfigurationCommandFactory.createLanguageCommand(
        mockTarget, 
        'jackett', 
        { providers: ['jackett-en'], priorityLanguage: 'en' }, 
        mockLogger
      );

      mockTarget.getProviderConfig.mockReturnValue({ providers: [], priorityLanguage: 'en' });

      // Execute both commands
      expect(invoker.executeCommand(command1)).toBe(true);
      expect(invoker.executeCommand(command2)).toBe(true);
      expect(invoker.getCommandCount()).toBe(2);

      // Undo all
      expect(invoker.undoAllCommands()).toBe(true);
      expect(invoker.getCommandCount()).toBe(0);
    });

    it('should handle error recovery in complex scenarios', () => {
      const invoker = ConfigurationCommandFactory.createInvoker(mockLogger);
      const command = ConfigurationCommandFactory.createLanguageCommand(
        mockTarget, 
        'torrentio', 
        { providers: ['torrentio-es'], priorityLanguage: 'es' }, 
        mockLogger
      );

      // First execution succeeds
      mockTarget.getProviderConfig.mockReturnValue({ providers: [], priorityLanguage: 'en' });
      expect(invoker.executeCommand(command)).toBe(true);

      // Undo fails due to target error
      mockTarget.setProviderConfig.mockImplementation(() => {
        throw new Error('Target error');
      });

      expect(invoker.undoLastCommand()).toBe(false);
      expect(invoker.getCommandCount()).toBe(0); // Command removed even if undo failed
    });

    it('should maintain memento integrity across operations', () => {
      const originalConfig = {
        providers: ['torrentio-en'],
        priorityLanguage: 'en'
      };

      mockTarget.getProviderConfig.mockReturnValue(originalConfig);

      const command = ConfigurationCommandFactory.createLanguageCommand(
        mockTarget, 
        'torrentio', 
        { providers: ['torrentio-es'], priorityLanguage: 'es' }, 
        mockLogger
      );

      command.execute();

      // Verify memento is created and immutable
      const memento = command.getMemento();
      expect(memento).toBeInstanceOf(ConfigurationMemento);
      expect(memento.getState()).toEqual(originalConfig);
      expect(Object.isFrozen(memento.getState())).toBe(true);

      // Modify original config - memento should be unchanged
      originalConfig.providers.push('new-provider');
      expect(memento.getState().providers).toEqual(['torrentio-en']);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null target gracefully', () => {
      const command = new LanguageConfigurationCommand(
        null, 
        'torrentio', 
        { providers: [], priorityLanguage: 'es' }, 
        mockLogger
      );

      expect(() => command.execute()).toThrow();
    });

    it('should handle circular references in state', () => {
      const circularState = { name: 'test' };
      circularState.self = circularState;

      mockTarget.getProviderConfig.mockReturnValue(circularState);

      const command = ConfigurationCommandFactory.createLanguageCommand(
        mockTarget, 
        'torrentio', 
        { providers: [], priorityLanguage: 'es' }, 
        mockLogger
      );

      // Should handle circular reference in JSON.parse/stringify
      expect(() => command.execute()).not.toThrow();
    });

    it('should handle very large command stacks', () => {
      const invoker = ConfigurationCommandFactory.createInvoker(mockLogger);
      invoker.maxStackSize = 1000;

      const commands = Array.from({ length: 1500 }, () => {
        const cmd = { execute: vi.fn().mockReturnValue(true), undo: vi.fn() };
        Object.setPrototypeOf(cmd, ConfigurationCommand.prototype);
        return cmd;
      });

      commands.forEach(cmd => invoker.executeCommand(cmd));

      expect(invoker.getCommandCount()).toBe(1000);
    });

    it('should handle memento expiration', () => {
      const state = { test: 'data' };
      const memento = new ConfigurationMemento(state);

      // Mock old timestamp
      memento.timestamp = Date.now() - (CONSTANTS.CACHE.UNIFIED_ID_CACHE_EXPIRY + 1000);

      expect(memento.isExpired()).toBe(true);
    });
  });
});