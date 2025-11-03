# 🏗️ Template Generator - Base Arquitectónica Reutilizable

## Generador de Proyectos Empresariales

Este documento define la estructura y herramientas para generar proyectos basados en la arquitectura Streamio Veoveo, optimizada para reutilización empresarial.

## 🎯 Objetivo

Crear un **template generator** que permita generar nuevos proyectos con:
- ✅ Arquitectura Clean Architecture preconfigurada
- ✅ Patrones de diseño empresariales
- ✅ Configuración validada con Zod
- ✅ Sistema de logging estructurado
- ✅ Inyección de dependencias
- ✅ Suite de testing completa
- ✅ CI/CD pipeline configurado

## 📁 Estructura del Template

```bash
streamio-template/
├── 📂 template/                    # Template base
│   ├── 📂 src/
│   │   ├── 📂 config/             # Configuración validada
│   │   │   ├── base.js
│   │   │   ├── development.js
│   │   │   ├── production.js
│   │   │   └── ConfigValidator.js
│   │   ├── 📂 domain/             # Capa de dominio
│   │   │   ├── 📂 entities/
│   │   │   ├── 📂 repositories/
│   │   │   └── 📂 errors/
│   │   ├── 📂 application/        # Capa de aplicación
│   │   │   ├── 📂 handlers/
│   │   │   ├── 📂 services/
│   │   │   └── 📂 cqrs/
│   │   └── 📂 infrastructure/     # Capa de infraestructura
│   │       ├── 📂 di/            # Dependency Injection
│   │       ├── 📂 cache/
│   │       ├── 📂 logging/
│   │       ├── 📂 monitoring/
│   │       ├── 📂 events/
│   │       └── 📂 health/
│   ├── 📂 tests/                  # Suite de testing
│   │   ├── 📂 unit/
│   │   ├── 📂 integration/
│   │   └── 📂 e2e/
│   ├── 📂 docs/                   # Documentación
│   └── 📂 scripts/               # Scripts de utilidad
├── 📂 generators/                 # Generadores de código
│   ├── entity-generator.js
│   ├── repository-generator.js
│   ├── service-generator.js
│   └── handler-generator.js
├── 📂 cli/                       # CLI para generación
│   └── streamio-cli.js
└── 📄 package.json
```

## 🛠️ Generadores de Código

### 1. Entity Generator

```javascript
// generators/entity-generator.js
const generateEntity = (entityName, fields) => {
  return `
import { z } from 'zod';

/**
 * ${entityName} Entity Schema
 */
export const ${entityName}Schema = z.object({
${fields.map(field => `  ${field.name}: z.${field.type}()${field.optional ? '.optional()' : ''},`).join('\n')}
});

/**
 * ${entityName} Entity
 */
export class ${entityName} {
  constructor(data) {
    const validated = ${entityName}Schema.parse(data);
    Object.assign(this, validated);
    Object.freeze(this);
  }

  static create(data) {
    return new ${entityName}(data);
  }

  toJSON() {
    return { ...this };
  }
}
`;
};
```

### 2. Repository Generator

```javascript
// generators/repository-generator.js
const generateRepository = (entityName) => {
  const lowerEntityName = entityName.toLowerCase();
  
  return `
import { RepositoryError } from '../errors/RepositoryError.js';

/**
 * Abstract ${entityName} Repository
 */
export class ${entityName}Repository {
  /**
   * Find ${lowerEntityName} by ID
   * @param {string} id - ${entityName} ID
   * @returns {Promise<${entityName}|null>}
   */
  async findById(id) {
    throw new Error('Method must be implemented');
  }

  /**
   * Find all ${lowerEntityName}s
   * @param {Object} filters - Search filters
   * @returns {Promise<${entityName}[]>}
   */
  async findAll(filters = {}) {
    throw new Error('Method must be implemented');
  }

  /**
   * Save ${lowerEntityName}
   * @param {${entityName}} ${lowerEntityName} - ${entityName} to save
   * @returns {Promise<${entityName}>}
   */
  async save(${lowerEntityName}) {
    throw new Error('Method must be implemented');
  }

  /**
   * Delete ${lowerEntityName}
   * @param {string} id - ${entityName} ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    throw new Error('Method must be implemented');
  }
}
`;
};
```

### 3. Service Generator

```javascript
// generators/service-generator.js
const generateService = (serviceName, dependencies) => {
  return `
/**
 * ${serviceName} Service
 */
export class ${serviceName} {
  constructor(${dependencies.map(dep => dep.name).join(', ')}) {
${dependencies.map(dep => `    this.${dep.name} = ${dep.name};`).join('\n')}
  }

  /**
   * Initialize service
   */
  async initialize() {
    // Service initialization logic
  }

  /**
   * Process operation
   * @param {Object} params - Operation parameters
   * @returns {Promise<Object>}
   */
  async process(params) {
    try {
      // Service logic here
      return { success: true, data: params };
    } catch (error) {
      this.logger?.error('Service operation failed', { error: error.message });
      throw error;
    }
  }
}
`;
};
```

## 🎮 CLI Generator

```javascript
// cli/streamio-cli.js
#!/usr/bin/env node

import { Command } from 'commander';
import { generateEntity } from '../generators/entity-generator.js';
import { generateRepository } from '../generators/repository-generator.js';
import { generateService } from '../generators/service-generator.js';
import fs from 'fs/promises';
import path from 'path';

const program = new Command();

program
  .name('streamio-cli')
  .description('Streamio Template Generator CLI')
  .version('1.0.0');

// Generate new project
program
  .command('new <projectName>')
  .description('Generate new project from template')
  .option('-t, --template <type>', 'Template type', 'default')
  .action(async (projectName, options) => {
    console.log(`🚀 Generating project: ${projectName}`);
    await generateProject(projectName, options.template);
    console.log('✅ Project generated successfully!');
  });

// Generate entity
program
  .command('generate:entity <entityName>')
  .description('Generate new entity')
  .option('-f, --fields <fields>', 'Entity fields (JSON format)')
  .action(async (entityName, options) => {
    const fields = options.fields ? JSON.parse(options.fields) : [];
    const entityCode = generateEntity(entityName, fields);
    
    const entityPath = path.join('src', 'domain', 'entities', `${entityName}.js`);
    await fs.writeFile(entityPath, entityCode);
    
    console.log(`✅ Entity ${entityName} generated at ${entityPath}`);
  });

// Generate repository
program
  .command('generate:repository <entityName>')
  .description('Generate repository for entity')
  .action(async (entityName) => {
    const repositoryCode = generateRepository(entityName);
    
    const repositoryPath = path.join('src', 'domain', 'repositories', `${entityName}Repository.js`);
    await fs.writeFile(repositoryPath, repositoryCode);
    
    console.log(`✅ Repository for ${entityName} generated at ${repositoryPath}`);
  });

// Generate service
program
  .command('generate:service <serviceName>')
  .description('Generate new service')
  .option('-d, --dependencies <deps>', 'Service dependencies (JSON format)')
  .action(async (serviceName, options) => {
    const dependencies = options.dependencies ? JSON.parse(options.dependencies) : [];
    const serviceCode = generateService(serviceName, dependencies);
    
    const servicePath = path.join('src', 'application', 'services', `${serviceName}.js`);
    await fs.writeFile(servicePath, serviceCode);
    
    console.log(`✅ Service ${serviceName} generated at ${servicePath}`);
  });

program.parse();
```

## 📋 Configuración del Template

### package.json Template

```json
{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0",
  "description": "{{PROJECT_DESCRIPTION}}",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "build": "npm run lint && npm run test",
    "docker:build": "docker build -t {{PROJECT_NAME}} .",
    "docker:run": "docker run -p 3000:3000 {{PROJECT_NAME}}"
  },
  "dependencies": {
    "zod": "^3.22.4",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "compression": "^1.7.4",
    "winston": "^3.11.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.0.2",
    "eslint": "^8.56.0",
    "supertest": "^6.3.3"
  }
}
```

### Dockerfile Template

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S streamio -u 1001

# Change ownership
RUN chown -R streamio:nodejs /app
USER streamio

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "src/index.js"]
```

## 🚀 Uso del Template Generator

### Instalación

```bash
npm install -g @streamio/template-generator
```

### Generar Nuevo Proyecto

```bash
# Crear nuevo proyecto
streamio-cli new my-awesome-project

# Navegar al proyecto
cd my-awesome-project

# Instalar dependencias
npm install

# Generar entidad
streamio-cli generate:entity User --fields '[{"name":"id","type":"string"},{"name":"email","type":"string"},{"name":"name","type":"string","optional":true}]'

# Generar repositorio
streamio-cli generate:repository User

# Generar servicio
streamio-cli generate:service UserService --dependencies '[{"name":"userRepository"},{"name":"logger"}]'

# Ejecutar tests
npm test

# Iniciar desarrollo
npm run dev
```

## 📊 Métricas de Generación

### Tiempo de Setup
- **Proyecto nuevo**: < 2 minutos
- **Entidad completa**: < 30 segundos
- **Servicio con tests**: < 1 minuto
- **Deploy ready**: < 5 minutos

### Cobertura Automática
- ✅ Configuración validada
- ✅ Logging estructurado
- ✅ Error handling
- ✅ Tests unitarios básicos
- ✅ Documentación JSDoc
- ✅ Dockerfile optimizado
- ✅ CI/CD pipeline

## 🎯 Próximos Pasos

1. **Implementar CLI básico** (Semana 1)
2. **Crear generadores de entidades** (Semana 2)
3. **Agregar generadores de servicios** (Semana 3)
4. **Implementar tests automáticos** (Semana 4)
5. **Crear documentación interactiva** (Semana 5)

---

*Template Generator v1.0*  
*Basado en Streamio Veoveo Architecture*  
*Optimizado para Desarrollo Empresarial*