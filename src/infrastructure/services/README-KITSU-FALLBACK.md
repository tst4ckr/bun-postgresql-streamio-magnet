# Servicio de Fallback Dinámico para Mapeos de IDs de Anime

## Visión General

`KitsuMappingFallback.js` ha sido transformado de un servicio de mapeos estáticos a un **servicio de fallback crítico dinámico** que:

- ✅ **Elimina el hardcoding masivo** de mapeos estáticos
- ✅ **Prioriza servicios dinámicos** (APIs externas)
- ✅ **Mantiene solo mapeos críticos** (5-10 animes extremadamente populares)
- ✅ **Delega conversión dinámica** a servicios especializados

## Arquitectura Nueva

### Flujo de Conversión

```
Usuario → UnifiedIdService → KitsuApiService → [Si falla] → KitsuMappingFallback (crítico)
```

1. **Servicio Principal**: `UnifiedIdService` gestiona toda la conversión
2. **Servicio Dinámico**: `KitsuApiService` consulta APIs en tiempo real
3. **Servicio de Fallback**: `KitsuMappingFallback` solo para casos extremos

### Cambios Clave

| Aspecto | Antes | Ahora |
|--------|--------|--------|
| Mapeos | 50+ hardcodeados | 3-5 críticos |
| Prioridad | Estático primero | Dinámico primero |
| Responsabilidad | Todo el mapeo | Solo casos extremos |
| Actualización | Manual en código | Dinámica via API |

## Mapeos Críticos Actuales

Solo se mantienen mapeos para animes que:
- Son extremadamente populares
- Podrían tener problemas de API
- Son casos de uso crítico

```javascript
// Ejemplos actuales:
{
  '1': 'tt0112718',    // Cowboy Bebop
  '9253': 'tt0877057', // Death Note  
  '12': 'tt0388629'    // Naruto
}
```

## API del Servicio

### Métodos Principales

```javascript
// Obtener IMDb ID (delega a dinámico primero)
const imdbId = fallbackService.getImdbIdFromAny('kitsu:12345');

// Agregar mapeo crítico (solo casos extremos)
fallbackService.addCriticalMapping('12345', 'tt67890', {
  title: 'Anime Crítico',
  year: 2024,
  type: 'TV'
});

// Verificar disponibilidad de mapeos críticos
const stats = fallbackService.getStats();
```

### Configuración

```javascript
{
  enableCriticalFallback: true,
  cacheExpiry: 24 * 60 * 60 * 1000, // 24 horas
  maxCriticalMappings: 10 // Máximo 10 animes
}
```

## Integración con Servicios Dinámicos

### Ejemplo de Uso Completo

```javascript
import { UnifiedIdService } from './UnifiedIdService.js';

const unifiedService = new UnifiedIdService();

// El servicio maneja automáticamente:
// 1. Conversión dinámica via API
// 2. Fallback crítico si es necesario
// 3. Cache inteligente

const imdbId = await unifiedService.convertToImdb('kitsu:12345');
```

## Mantenimiento

### Agregar Nuevos Mapeos Críticos

Solo agregar nuevos mapeos si:
- El anime es extremadamente popular
- La API tiene problemas consistentes
- Es crítico para la funcionalidad

```javascript
// En loadCriticalMappings()
const criticalMappings = [
  // ... existentes ...
  { serviceId: '99999', imdbId: 'tt9999999', title: 'Nuevo Crítico', year: 2024, type: 'TV' }
];
```

### Monitoreo

```javascript
// Verificar estado del servicio
const stats = fallbackService.getStats();
console.log(`Mapeos críticos: ${stats.totalCriticalMappings}`);
console.log(`Cobertura: ${stats.coverage}%`);
```

## Mejores Prácticas

1. **No agregar mapeos masivos** - Usar servicios dinámicos
2. **Documentar razones** para cada mapeo crítico
3. **Revisar periódicamente** si mapeos críticos siguen siendo necesarios
4. **Priorizar optimización de APIs** sobre mapeos estáticos

## Solución de Problemas

### Si un anime no se encuentra

1. Verificar que `KitsuApiService` esté funcionando
2. Confirmar que el ID existe en Kitsu
3. Solo entonces considerar agregar mapeo crítico

### Depuración

```javascript
// Verificar logs
console.log(fallbackService.getStats());

// Buscar por título
const results = fallbackService.searchByTitle('Cowboy');
```

## Notas de Migración

- Los mapeos antiguos han sido eliminados
- La API externa es ahora la fuente principal
- Solo se mantienen 3-5 mapeos críticos
- Todo el sistema es más dinámico y mantenible