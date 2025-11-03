/**
 * Contenedor de servicios para Dependency Injection
 * 
 * Implementa el patrón Service Container para gestionar dependencias
 * y facilitar la inyección de servicios en toda la aplicación.
 */

/**
 * Contenedor de servicios principal
 * Gestiona el registro, resolución y ciclo de vida de servicios
 */
export class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
        this.factories = new Map();
        this.aliases = new Map();
        this.interceptors = new Map();
    }

    /**
     * Registra un servicio como singleton
     * @param {string} name - Nombre del servicio
     * @param {Function|Object} implementation - Implementación del servicio
     * @param {Object} options - Opciones de registro
     */
    singleton(name, implementation, options = {}) {
        this.services.set(name, {
            type: 'singleton',
            implementation,
            options,
            instance: null
        });
        
        return this;
    }

    /**
     * Registra un servicio como transient (nueva instancia cada vez)
     * @param {string} name - Nombre del servicio
     * @param {Function} implementation - Constructor del servicio
     * @param {Object} options - Opciones de registro
     */
    transient(name, implementation, options = {}) {
        this.services.set(name, {
            type: 'transient',
            implementation,
            options,
            instance: null
        });
        
        return this;
    }

    /**
     * Registra una factory para crear servicios
     * @param {string} name - Nombre del servicio
     * @param {Function} factory - Factory function
     * @param {Object} options - Opciones de registro
     */
    factory(name, factory, options = {}) {
        this.factories.set(name, { factory, options });
        return this;
    }

    /**
     * Registra un alias para un servicio existente
     * @param {string} alias - Nombre del alias
     * @param {string} serviceName - Nombre del servicio original
     */
    alias(alias, serviceName) {
        this.aliases.set(alias, serviceName);
        return this;
    }

    /**
     * Resuelve un servicio por su nombre
     * @param {string} name - Nombre del servicio
     * @returns {*} Instancia del servicio
     */
    resolve(name) {
        // Resolver alias si existe
        const actualName = this.aliases.get(name) || name;
        
        // Verificar si existe factory
        if (this.factories.has(actualName)) {
            return this.resolveFromFactory(actualName);
        }
        
        // Resolver servicio normal
        const serviceDefinition = this.services.get(actualName);
        if (!serviceDefinition) {
            throw new Error(`Service '${name}' not found in container`);
        }

        return this.resolveService(actualName, serviceDefinition);
    }

    /**
     * Resuelve un servicio desde una factory
     * @param {string} name - Nombre del servicio
     * @returns {*} Instancia creada por la factory
     */
    resolveFromFactory(name) {
        const factoryDefinition = this.factories.get(name);
        const instance = factoryDefinition.factory(this);
        
        // Aplicar interceptores si existen
        return this.applyInterceptors(name, instance);
    }

    /**
     * Resuelve un servicio registrado
     * @param {string} name - Nombre del servicio
     * @param {Object} definition - Definición del servicio
     * @returns {*} Instancia del servicio
     */
    resolveService(name, definition) {
        const { type, implementation, options } = definition;
        
        // Para singletons, reutilizar instancia existente
        if (type === 'singleton' && definition.instance) {
            return definition.instance;
        }
        
        let instance;
        
        // Crear instancia según el tipo
        if (typeof implementation === 'function') {
            // Resolver dependencias del constructor
            const dependencies = this.resolveDependencies(implementation, options.dependencies || []);
            instance = new implementation(...dependencies);
        } else {
            // Es un objeto ya instanciado
            instance = implementation;
        }
        
        // Guardar instancia para singletons
        if (type === 'singleton') {
            definition.instance = instance;
        }
        
        // Aplicar interceptores
        instance = this.applyInterceptors(name, instance);
        
        return instance;
    }

    /**
     * Resuelve las dependencias de un constructor
     * @param {Function} constructor - Constructor del servicio
     * @param {string[]} dependencies - Lista de dependencias
     * @returns {Array} Array de dependencias resueltas
     */
    resolveDependencies(constructor, dependencies) {
        return dependencies.map(dep => {
            if (typeof dep === 'string') {
                return this.resolve(dep);
            } else if (typeof dep === 'object' && dep.service) {
                return this.resolve(dep.service);
            } else {
                return dep; // Valor literal
            }
        });
    }

    /**
     * Aplica interceptores a una instancia de servicio
     * @param {string} name - Nombre del servicio
     * @param {*} instance - Instancia del servicio
     * @returns {*} Instancia con interceptores aplicados
     */
    applyInterceptors(name, instance) {
        const interceptors = this.interceptors.get(name) || [];
        
        return interceptors.reduce((currentInstance, interceptor) => {
            return interceptor(currentInstance, this);
        }, instance);
    }

    /**
     * Registra un interceptor para un servicio
     * @param {string} serviceName - Nombre del servicio
     * @param {Function} interceptor - Función interceptora
     */
    intercept(serviceName, interceptor) {
        if (!this.interceptors.has(serviceName)) {
            this.interceptors.set(serviceName, []);
        }
        
        this.interceptors.get(serviceName).push(interceptor);
        return this;
    }

    /**
     * Verifica si un servicio está registrado
     * @param {string} name - Nombre del servicio
     * @returns {boolean} True si el servicio existe
     */
    has(name) {
        const actualName = this.aliases.get(name) || name;
        return this.services.has(actualName) || this.factories.has(actualName);
    }

    /**
     * Obtiene todos los nombres de servicios registrados
     * @returns {string[]} Lista de nombres de servicios
     */
    getServiceNames() {
        return [
            ...this.services.keys(),
            ...this.factories.keys(),
            ...this.aliases.keys()
        ];
    }

    /**
     * Crea un contenedor hijo que hereda servicios del padre
     * @returns {ServiceContainer} Contenedor hijo
     */
    createChild() {
        const child = new ServiceContainer();
        child.parent = this;
        
        // Sobrescribir resolve para buscar en el padre si no encuentra
        const originalResolve = child.resolve.bind(child);
        child.resolve = (name) => {
            try {
                return originalResolve(name);
            } catch (error) {
                if (this.has(name)) {
                    return this.resolve(name);
                }
                throw error;
            }
        };
        
        return child;
    }

    /**
     * Limpia todas las instancias singleton (útil para testing)
     */
    clearSingletons() {
        for (const [name, definition] of this.services.entries()) {
            if (definition.type === 'singleton') {
                definition.instance = null;
            }
        }
    }

    /**
     * Registra múltiples servicios desde un objeto de configuración
     * @param {Object} services - Objeto con definiciones de servicios
     */
    registerBatch(services) {
        for (const [name, config] of Object.entries(services)) {
            const { type = 'singleton', implementation, dependencies = [], options = {} } = config;
            
            if (type === 'singleton') {
                this.singleton(name, implementation, { dependencies, ...options });
            } else if (type === 'transient') {
                this.transient(name, implementation, { dependencies, ...options });
            } else if (type === 'factory') {
                this.factory(name, implementation, options);
            }
        }
        
        return this;
    }

    /**
     * Obtiene información de diagnóstico del contenedor
     * @returns {Object} Información de diagnóstico
     */
    getDiagnostics() {
        return {
            services: this.services.size,
            factories: this.factories.size,
            aliases: this.aliases.size,
            interceptors: this.interceptors.size,
            singletonInstances: Array.from(this.services.values())
                .filter(def => def.type === 'singleton' && def.instance !== null).length
        };
    }
}