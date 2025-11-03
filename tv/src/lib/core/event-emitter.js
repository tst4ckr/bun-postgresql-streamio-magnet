/**
 * Sistema de eventos para comunicación entre componentes
 * 
 * Implementa un EventEmitter personalizado que facilita la comunicación
 * desacoplada entre servicios y componentes del sistema IPTV.
 */

/**
 * EventEmitter personalizado con funcionalidades extendidas
 * Permite comunicación asíncrona entre componentes del sistema
 */
export class EventEmitter {
    constructor() {
        this.events = new Map();
        this.wildcardListeners = new Set();
        this.maxListeners = 100;
        this.errorHandler = null;
    }

    /**
     * Registra un listener para un evento específico
     * @param {string} eventName - Nombre del evento
     * @param {Function} listener - Función listener
     * @param {Object} options - Opciones del listener
     */
    on(eventName, listener, options = {}) {
        this.validateListener(listener);
        
        if (eventName === '*') {
            this.wildcardListeners.add({ listener, options });
            return this;
        }

        if (!this.events.has(eventName)) {
            this.events.set(eventName, new Set());
        }

        const listeners = this.events.get(eventName);
        
        // Verificar límite de listeners
        if (listeners.size >= this.maxListeners) {
            console.warn(`Max listeners (${this.maxListeners}) exceeded for event: ${eventName}`);
        }

        listeners.add({ listener, options });
        return this;
    }

    /**
     * Registra un listener que se ejecuta solo una vez
     * @param {string} eventName - Nombre del evento
     * @param {Function} listener - Función listener
     * @param {Object} options - Opciones del listener
     */
    once(eventName, listener, options = {}) {
        const onceWrapper = (...args) => {
            this.off(eventName, onceWrapper);
            return listener(...args);
        };

        return this.on(eventName, onceWrapper, { ...options, once: true });
    }

    /**
     * Remueve un listener específico
     * @param {string} eventName - Nombre del evento
     * @param {Function} listener - Función listener a remover
     */
    off(eventName, listener) {
        if (eventName === '*') {
            for (const item of this.wildcardListeners) {
                if (item.listener === listener) {
                    this.wildcardListeners.delete(item);
                    break;
                }
            }
            return this;
        }

        const listeners = this.events.get(eventName);
        if (!listeners) return this;

        for (const item of listeners) {
            if (item.listener === listener) {
                listeners.delete(item);
                break;
            }
        }

        // Limpiar el Set si está vacío
        if (listeners.size === 0) {
            this.events.delete(eventName);
        }

        return this;
    }

    /**
     * Remueve todos los listeners de un evento
     * @param {string} eventName - Nombre del evento (opcional)
     */
    removeAllListeners(eventName) {
        if (eventName) {
            this.events.delete(eventName);
        } else {
            this.events.clear();
            this.wildcardListeners.clear();
        }
        return this;
    }

    /**
     * Emite un evento a todos los listeners registrados
     * @param {string} eventName - Nombre del evento
     * @param {...any} args - Argumentos a pasar a los listeners
     */
    emit(eventName, ...args) {
        const results = [];

        try {
            // Emitir a listeners específicos
            const listeners = this.events.get(eventName);
            if (listeners) {
                for (const { listener, options } of listeners) {
                    try {
                        const result = this.executeListener(listener, args, options);
                        results.push(result);
                    } catch (error) {
                        this.handleListenerError(error, eventName, listener);
                    }
                }
            }

            // Emitir a wildcard listeners
            for (const { listener, options } of this.wildcardListeners) {
                try {
                    const result = this.executeListener(listener, [eventName, ...args], options);
                    results.push(result);
                } catch (error) {
                    this.handleListenerError(error, '*', listener);
                }
            }

            return results;
        } catch (error) {
            this.handleEmitError(error, eventName, args);
            return [];
        }
    }

    /**
     * Emite un evento de forma asíncrona
     * @param {string} eventName - Nombre del evento
     * @param {...any} args - Argumentos a pasar a los listeners
     */
    async emitAsync(eventName, ...args) {
        const promises = [];

        // Emitir a listeners específicos
        const listeners = this.events.get(eventName);
        if (listeners) {
            for (const { listener, options } of listeners) {
                promises.push(
                    this.executeListenerAsync(listener, args, options)
                        .catch(error => this.handleListenerError(error, eventName, listener))
                );
            }
        }

        // Emitir a wildcard listeners
        for (const { listener, options } of this.wildcardListeners) {
            promises.push(
                this.executeListenerAsync(listener, [eventName, ...args], options)
                    .catch(error => this.handleListenerError(error, '*', listener))
            );
        }

        try {
            return await Promise.all(promises);
        } catch (error) {
            this.handleEmitError(error, eventName, args);
            return [];
        }
    }

    /**
     * Ejecuta un listener con manejo de opciones
     * @param {Function} listener - Función listener
     * @param {Array} args - Argumentos
     * @param {Object} options - Opciones del listener
     */
    executeListener(listener, args, options) {
        if (options.async) {
            // Ejecutar de forma asíncrona sin esperar
            setImmediate(() => {
                try {
                    listener(...args);
                } catch (error) {
                    this.handleListenerError(error, 'async', listener);
                }
            });
            return undefined;
        }

        return listener(...args);
    }

    /**
     * Ejecuta un listener de forma asíncrona
     * @param {Function} listener - Función listener
     * @param {Array} args - Argumentos
     * @param {Object} options - Opciones del listener
     */
    async executeListenerAsync(listener, args, options) {
        if (options.timeout) {
            return Promise.race([
                Promise.resolve(listener(...args)),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Listener timeout')), options.timeout)
                )
            ]);
        }

        return Promise.resolve(listener(...args));
    }

    /**
     * Maneja errores en listeners
     * @param {Error} error - Error ocurrido
     * @param {string} eventName - Nombre del evento
     * @param {Function} listener - Listener que causó el error
     */
    handleListenerError(error, eventName, listener) {
        if (this.errorHandler) {
            try {
                this.errorHandler(error, eventName, listener);
            } catch (handlerError) {
                console.error('Error in error handler:', handlerError);
            }
        } else {
            console.error(`Error in event listener for '${eventName}':`, error);
        }

        // Emitir evento de error si no es el mismo evento para evitar loops
        if (eventName !== 'error') {
            this.emit('error', { error, eventName, listener });
        }
    }

    /**
     * Maneja errores durante la emisión
     * @param {Error} error - Error ocurrido
     * @param {string} eventName - Nombre del evento
     * @param {Array} args - Argumentos del evento
     */
    handleEmitError(error, eventName, args) {
        console.error(`Error emitting event '${eventName}':`, error);
        
        if (eventName !== 'error') {
            this.emit('error', { error, eventName, args });
        }
    }

    /**
     * Valida que el listener sea una función
     * @param {Function} listener - Listener a validar
     */
    validateListener(listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Listener must be a function');
        }
    }

    /**
     * Obtiene la lista de eventos registrados
     * @returns {string[]} Lista de nombres de eventos
     */
    eventNames() {
        return Array.from(this.events.keys());
    }

    /**
     * Obtiene el número de listeners para un evento
     * @param {string} eventName - Nombre del evento
     * @returns {number} Número de listeners
     */
    listenerCount(eventName) {
        if (eventName === '*') {
            return this.wildcardListeners.size;
        }

        const listeners = this.events.get(eventName);
        return listeners ? listeners.size : 0;
    }

    /**
     * Obtiene los listeners de un evento
     * @param {string} eventName - Nombre del evento
     * @returns {Function[]} Array de listeners
     */
    listeners(eventName) {
        if (eventName === '*') {
            return Array.from(this.wildcardListeners).map(item => item.listener);
        }

        const listeners = this.events.get(eventName);
        return listeners ? Array.from(listeners).map(item => item.listener) : [];
    }

    /**
     * Establece el número máximo de listeners por evento
     * @param {number} max - Número máximo de listeners
     */
    setMaxListeners(max) {
        if (typeof max !== 'number' || max < 0) {
            throw new TypeError('Max listeners must be a non-negative number');
        }
        this.maxListeners = max;
        return this;
    }

    /**
     * Establece un manejador de errores personalizado
     * @param {Function} handler - Función manejadora de errores
     */
    setErrorHandler(handler) {
        if (handler !== null && typeof handler !== 'function') {
            throw new TypeError('Error handler must be a function or null');
        }
        this.errorHandler = handler;
        return this;
    }

    /**
     * Crea un namespace para eventos
     * @param {string} namespace - Nombre del namespace
     * @returns {Object} Objeto con métodos del namespace
     */
    namespace(namespace) {
        const prefixEvent = (eventName) => `${namespace}:${eventName}`;

        return {
            on: (eventName, listener, options) => 
                this.on(prefixEvent(eventName), listener, options),
            
            once: (eventName, listener, options) => 
                this.once(prefixEvent(eventName), listener, options),
            
            off: (eventName, listener) => 
                this.off(prefixEvent(eventName), listener),
            
            emit: (eventName, ...args) => 
                this.emit(prefixEvent(eventName), ...args),
            
            emitAsync: (eventName, ...args) => 
                this.emitAsync(prefixEvent(eventName), ...args)
        };
    }

    /**
     * Obtiene estadísticas del EventEmitter
     * @returns {Object} Estadísticas
     */
    getStats() {
        const totalListeners = Array.from(this.events.values())
            .reduce((sum, listeners) => sum + listeners.size, 0) + this.wildcardListeners.size;

        return {
            totalEvents: this.events.size,
            totalListeners,
            wildcardListeners: this.wildcardListeners.size,
            maxListeners: this.maxListeners,
            eventNames: this.eventNames()
        };
    }

    /**
     * Limpia todos los eventos y listeners
     */
    destroy() {
        this.removeAllListeners();
        this.errorHandler = null;
    }
}