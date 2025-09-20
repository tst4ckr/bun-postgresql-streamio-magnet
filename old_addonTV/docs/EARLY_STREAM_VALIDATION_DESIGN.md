# Diseño de Validación Temprana de Streams

## Resumen Ejecutivo

Este documento describe el diseño de un nuevo flujo de procesamiento que implementa validación de streams con conversión HTTPS→HTTP **antes** de la eliminación de duplicados en el `HybridChannelRepository`.

## Problema Actual

El flujo actual del `HybridChannelRepository` sigue este orden:
1. Cargar canales desde CSV local (prioridad absoluta)
2. Cargar canales desde fuentes M3U remotas/locales
3. **Eliminar duplicados inmediatamente** (CSV tiene prioridad)
4. Aplicar validación HTTPS→HTTP solo en `getAllChannels()` (tardío)
5. Aplicar filtros de contenido

**Limitaciones identificadas:**
- Los duplicados se eliminan sin validar si funcionan
- Un canal CSV no funcional puede tener prioridad sobre un M3U funcional
- La validación tardía desperdicia recursos en canales que no funcionan
- No hay optimización de calidad de streams antes de deduplicación

## Solución Propuesta

### Nuevo Flujo de Procesamiento

```
1. Cargar canales desde todas las fuentes (CSV + M3U)
2. ✨ VALIDACIÓN TEMPRANA: Verificar funcionamiento de todos los canales
3. ✨ CONVERSIÓN HTTPS→HTTP: Aplicar conversión y validar
4. ✨ FILTRADO POR CALIDAD: Mantener solo canales funcionales
5. Eliminar duplicados (priorizando canales funcionales)
6. Aplicar filtros de contenido
```

### Componentes del Diseño

#### 1. StreamValidationService

**Responsabilidad:** Validar streams antes de deduplicación

```javascript
class StreamValidationService {
  // Validar un lote de canales con concurrencia controlada
  async validateChannelsBatch(channels, options = {})
  
  // Validar canal individual con conversión HTTPS→HTTP
  async validateChannel(channel)
  
  // Obtener estadísticas de validación
  getValidationStats()
}
```

**Características:**
- Validación concurrente con límites configurables
- Integración con `HttpsToHttpConversionService`
- Timeouts optimizados para validación rápida
- Métricas detalladas de rendimiento
- Soporte para validación por lotes

#### 2. Modificaciones al HybridChannelRepository

**Cambios en el método `initialize()`:**

```javascript
async initialize() {
  // 1. Cargar todas las fuentes sin deduplicación
  const allChannels = await this.#loadAllSourcesRaw();
  
  // 2. ✨ NUEVA FASE: Validación temprana
  const validatedChannels = await this.#validateChannelsEarly(allChannels);
  
  // 3. Deduplicación inteligente (prioriza funcionales)
  const deduplicatedChannels = await this.#deduplicateWithQuality(validatedChannels);
  
  // 4. Finalizar inicialización
  this.#channels = deduplicatedChannels;
  this.#buildChannelMap();
}
```

**Nuevo método de deduplicación inteligente:**

```javascript
#deduplicateWithQuality(channels) {
  const channelGroups = new Map(); // id -> [channels]
  
  // Agrupar por ID
  channels.forEach(channel => {
    if (!channelGroups.has(channel.id)) {
      channelGroups.set(channel.id, []);
    }
    channelGroups.get(channel.id).push(channel);
  });
  
  // Seleccionar mejor canal por grupo
  return Array.from(channelGroups.values()).map(group => {
    return this.#selectBestChannel(group);
  });
}

#selectBestChannel(channels) {
  // Prioridad: CSV funcional > M3U funcional > CSV no funcional > M3U no funcional
  const csvFunctional = channels.filter(ch => ch.source === 'csv' && ch.isValidated);
  const m3uFunctional = channels.filter(ch => ch.source !== 'csv' && ch.isValidated);
  const csvNonFunctional = channels.filter(ch => ch.source === 'csv' && !ch.isValidated);
  const m3uNonFunctional = channels.filter(ch => ch.source !== 'csv' && !ch.isValidated);
  
  if (csvFunctional.length > 0) return csvFunctional[0];
  if (m3uFunctional.length > 0) return m3uFunctional[0];
  if (csvNonFunctional.length > 0) return csvNonFunctional[0];
  return m3uNonFunctional[0];
}
```

#### 3. Configuración Optimizada

**Nuevas variables de entorno:**

```bash
# Validación temprana
EARLY_VALIDATION_ENABLED=true
EARLY_VALIDATION_CONCURRENCY=15
EARLY_VALIDATION_TIMEOUT=5000
EARLY_VALIDATION_BATCH_SIZE=100

# Estrategia de deduplicación
DEDUPLICATION_STRATEGY=quality_priority  # quality_priority | csv_priority
PRIORITIZE_FUNCTIONAL_STREAMS=true

# Optimizaciones de rendimiento
VALIDATION_QUICK_CHECK=true  # Solo HEAD request
VALIDATION_SKIP_HTTPS_IF_HTTP_WORKS=true
```

#### 4. Optimizaciones de Rendimiento

**Validación rápida con HEAD requests:**
- Usar HEAD en lugar de GET para validación inicial
- Timeout reducido (5s) para detección rápida
- Validación completa solo para canales críticos

**Procesamiento por lotes:**
- Procesar canales en lotes de 100
- Concurrencia controlada (15 workers)
- Pausa entre lotes para evitar sobrecarga

**Cache de validación:**
- Cache de resultados de validación por 1 hora
- Evitar re-validar URLs ya verificadas
- Persistencia opcional en Redis

### Beneficios Esperados

1. **Mejor calidad de streams:** Solo canales funcionales llegan al usuario final
2. **Deduplicación inteligente:** Prioriza canales que realmente funcionan
3. **Rendimiento optimizado:** Elimina canales no funcionales temprano
4. **Experiencia de usuario mejorada:** Menos errores de reproducción
5. **Recursos optimizados:** No procesa canales que no funcionan

### Métricas y Monitoreo

**Estadísticas de validación:**
```javascript
{
  totalChannels: 1500,
  validatedChannels: 1200,
  failedValidation: 300,
  httpsConverted: 800,
  httpWorking: 750,
  validationTime: 45000, // ms
  duplicatesRemoved: 150,
  qualityImprovement: {
    csvReplaced: 25,    // CSV no funcional reemplazado por M3U funcional
    m3uSelected: 125    // M3U funcional seleccionado sobre CSV no funcional
  }
}
```

### Compatibilidad y Migración

**Activación gradual:**
- Flag de configuración para habilitar/deshabilitar
- Modo de compatibilidad con flujo anterior
- Logs detallados para monitoreo de transición

**Fallback automático:**
- Si la validación temprana falla, usar flujo tradicional
- Timeouts configurables para evitar bloqueos
- Modo degradado con validación reducida

### Implementación por Fases

**Fase 1:** StreamValidationService básico
**Fase 2:** Integración con HybridChannelRepository
**Fase 3:** Deduplicación inteligente
**Fase 4:** Optimizaciones de rendimiento
**Fase 5:** Métricas y monitoreo avanzado

---

*Este diseño mantiene la compatibilidad con la arquitectura existente mientras introduce mejoras significativas en la calidad y rendimiento del procesamiento de canales.*