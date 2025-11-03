/**
 * @fileoverview ServiceContainer - Contenedor de servicios con inyección de dependencias
 * 
 * RESPONSABILIDAD PRINCIPAL: Gestionar la instanciación y resolución de dependencias de servicios
 * 
 * Arquitectura de Inversión de Control:
 * - Registro de servicios con sus dependencias
 * - Resolución automática de dependencias
 * - Prevención de dependencias circulares
 * - Gestión de ciclo de vida (singleton/transient)
 * 
 * Flujo de datos:
 * 1. Registro de servicios → Container Registry
 * 2. Solicitud de servicio → Dependency Resolution
 * 3. Instanciación controlada → Service Instance
 * 4. Cache de instancias → Singleton Management
 * 
 * @author Sistema de Inyección de Dependencias
 * @version 1.0.0
 */

/**
 * Contenedor de servicios con inyección de dependencias
 * Implementa el patrón IoC (Inversion of Control) para eliminar dependencias circulares
 */
export class ServiceContainer {
  #services = new Map();           // Registro de definiciones de servicios
  #instances = new Map();          // Cache de instancias singleton
  #resolving = new Set();          // Control de dependencias circulares
  #logger;

  constructor(logger = console) {
    this.#logger = logger;
  }

  /**
   * Registra un servicio en el contenedor
   * @param {string} name - Nombre único del servicio
   * @param {Function} factory - Función factory para crear el servicio
   * @param {Object} options - Opciones de configuración
   * @param {string[]} options.dependencies - Lista de dependencias requeridas
   * @param {boolean} options.singleton - Si debe ser singleton (default: true)
   * @param {Object} options.config - Configuración específica del servicio
   */
  register(name, factory, options = {}) {
    const {
      dependencies = [],
      singleton = true,
      config = {}
    } = options;

    // Validar que no se registre el mismo servicio dos veces
    if (this.#services.has(name)) {
      throw new Error(`Servicio '${name}' ya está registrado`);
    }

    // Validar que la factory sea una función
    if (typeof factory !== 'function') {
      throw new Error(`Factory para servicio '${name}' debe ser una función`);
    }

    this.#services.set(name, {
      factory,
      dependencies,
      singleton,
      config
    });

    this.#logger.debug(`[ServiceContainer] Servicio registrado: ${name}`, {
      dependencies,
      singleton,
      configKeys: Object.keys(config)
    });
  }

  /**
   * Resuelve y obtiene una instancia del servicio
   * @param {string} name - Nombre del servicio
   * @param {Object} overrideConfig - Configuración adicional para override
   * @returns {Object} Instancia del servicio
   */
  resolve(name, overrideConfig = {}) {
    // Verificar si el servicio está registrado
    if (!this.#services.has(name)) {
      throw new Error(`Servicio '${name}' no está registrado`);
    }

    const serviceDefinition = this.#services.get(name);

    // Si es singleton y ya existe una instancia, devolverla
    if (serviceDefinition.singleton && this.#instances.has(name)) {
      return this.#instances.get(name);
    }

    // Detectar dependencias circulares
    if (this.#resolving.has(name)) {
      const resolvingArray = Array.from(this.#resolving);
      throw new Error(`Dependencia circular detectada: ${resolvingArray.join(' → ')} → ${name}`);
    }

    try {
      // Marcar como en resolución
      this.#resolving.add(name);

      // Resolver dependencias recursivamente
      const resolvedDependencies = this.#resolveDependencies(serviceDefinition.dependencies);

      // Crear configuración final combinando config base y override
      const finalConfig = {
        ...serviceDefinition.config,
        ...overrideConfig
      };

      // Crear instancia del servicio
      const instance = serviceDefinition.factory(resolvedDependencies, finalConfig, this.#logger);

      // Si es singleton, cachear la instancia
      if (serviceDefinition.singleton) {
        this.#instances.set(name, instance);
      }

      this.#logger.debug(`[ServiceContainer] Servicio resuelto: ${name}`, {
        singleton: serviceDefinition.singleton,
        dependenciesCount: serviceDefinition.dependencies.length
      });

      return instance;

    } finally {
      // Limpiar marca de resolución
      this.#resolving.delete(name);
    }
  }

  /**
   * Resuelve múltiples dependencias
   * @private
   * @param {string[]} dependencies - Lista de nombres de dependencias
   * @returns {Object} Objeto con dependencias resueltas
   */
  #resolveDependencies(dependencies) {
    const resolved = {};

    for (const dependency of dependencies) {
      resolved[dependency] = this.resolve(dependency);
    }

    return resolved;
  }

  /**
   * Verifica si un servicio está registrado
   * @param {string} name - Nombre del servicio
   * @returns {boolean}
   */
  has(name) {
    return this.#services.has(name);
  }

  /**
   * Obtiene información de un servicio registrado
   * @param {string} name - Nombre del servicio
   * @returns {Object|null} Información del servicio o null si no existe
   */
  getServiceInfo(name) {
    if (!this.#services.has(name)) {
      return null;
    }

    const service = this.#services.get(name);
    return {
      name,
      dependencies: [...service.dependencies],
      singleton: service.singleton,
      isInstantiated: this.#instances.has(name)
    };
  }

  /**
   * Lista todos los servicios registrados
   * @returns {string[]} Array con nombres de servicios
   */
  listServices() {
    return Array.from(this.#services.keys());
  }

  /**
   * Obtiene estadísticas del contenedor
   * @returns {Object} Estadísticas de uso
   */
  getStats() {
    return {
      totalServices: this.#services.size,
      instantiatedServices: this.#instances.size,
      currentlyResolving: this.#resolving.size,
      services: this.listServices().map(name => this.getServiceInfo(name))
    };
  }

  /**
   * Limpia todas las instancias singleton (útil para testing)
   */
  clearInstances() {
    this.#instances.clear();
    this.#logger.debug('[ServiceContainer] Instancias singleton limpiadas');
  }

  /**
   * Limpia todo el contenedor
   */
  clear() {
    this.#services.clear();
    this.#instances.clear();
    this.#resolving.clear();
    this.#logger.debug('[ServiceContainer] Contenedor completamente limpiado');
  }

  /**
   * Valida que no existan dependencias circulares en el registro
   * @throws {Error} Si se detectan dependencias circulares
   */
  validateDependencies() {
    const visited = new Set();
    const visiting = new Set();

    const visit = (serviceName, path = []) => {
      if (visiting.has(serviceName)) {
        throw new Error(`Dependencia circular detectada en registro: ${path.join(' → ')} → ${serviceName}`);
      }

      if (visited.has(serviceName)) {
        return;
      }

      if (!this.#services.has(serviceName)) {
        throw new Error(`Dependencia no registrada: ${serviceName} (requerida por ${path[path.length - 1] || 'root'})`);
      }

      visiting.add(serviceName);
      const service = this.#services.get(serviceName);

      for (const dependency of service.dependencies) {
        visit(dependency, [...path, serviceName]);
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
    };

    // Validar todos los servicios registrados
    for (const serviceName of this.#services.keys()) {
      if (!visited.has(serviceName)) {
        visit(serviceName);
      }
    }

    this.#logger.info('[ServiceContainer] Validación de dependencias completada - No se encontraron ciclos');
  }
}

export default ServiceContainer;