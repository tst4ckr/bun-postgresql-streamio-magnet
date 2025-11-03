# 🧪 Test Suite - VeoVeo Search Addon

## 📁 Estructura de Tests

Esta estructura sigue los principios de **Clean Architecture** y **Domain-Driven Design (DDD)**:

```
tests/
├── unit/                    # Tests unitarios por capa
│   ├── domain/             # Tests de la capa de dominio
│   │   ├── entities/       # Tests de entidades
│   │   ├── value-objects/  # Tests de value objects
│   │   └── services/       # Tests de servicios de dominio
│   ├── application/        # Tests de la capa de aplicación
│   │   ├── services/       # Tests de servicios de aplicación
│   │   └── use-cases/      # Tests de casos de uso
│   └── infrastructure/     # Tests de la capa de infraestructura
│       ├── repositories/   # Tests de repositorios
│       ├── services/       # Tests de servicios de infraestructura
│       └── adapters/       # Tests de adaptadores
├── integration/            # Tests de integración
├── e2e/                   # Tests end-to-end
├── fixtures/              # Datos de prueba
├── mocks/                 # Mocks reutilizables
└── helpers/               # Utilidades de testing
```

## 🎯 Principios de Testing

### 1. **Separación por Capas**
- **Domain**: Tests puros sin dependencias externas
- **Application**: Tests de orquestación y casos de uso
- **Infrastructure**: Tests con mocks de dependencias externas

### 2. **Nomenclatura**
- Archivos: `*.test.js` o `*.spec.js`
- Describe blocks: Nombre de la clase/función
- Test cases: Comportamiento esperado

### 3. **Estructura de Test**
```javascript
// Arrange - Act - Assert (AAA Pattern)
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should return expected result when valid input provided', () => {
      // Arrange
      const input = 'valid-input';
      const expected = 'expected-result';
      
      // Act
      const result = service.methodName(input);
      
      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

## 🚀 Comandos de Testing

```bash
# Ejecutar todos los tests
npm run test

# Tests unitarios
npm run test:unit

# Tests por capa
npm run test:domain
npm run test:application
npm run test:infrastructure

# Tests con cobertura
npm run test:coverage

# Tests en modo watch
npm run test:watch

# UI de tests
npm run test:ui
```

## 📊 Métricas de Calidad

- **Cobertura mínima**: 80%
- **Complejidad ciclomática**: < 8
- **Tests por función**: Al menos 1 happy path + edge cases
- **Tiempo de ejecución**: < 5 segundos para suite completa

## 🔧 Configuración

La configuración se encuentra en:
- `vitest.config.js` - Configuración principal
- `tests/helpers/setup.js` - Setup global
- `tests/mocks/` - Mocks compartidos