# Sistema de Deduplicación de Canales

## Descripción General

El sistema de deduplicación de canales es una implementación robusta y configurable que identifica y elimina canales duplicados basándose en múltiples criterios. Está diseñado siguiendo principios SOLID y arquitectura limpia para garantizar mantenibilidad y extensibilidad.

## Arquitectura

### Componentes Principales

#### 1. ChannelDeduplicationService
**Ubicación:** `src/domain/services/ChannelDeduplicationService.js`

**Responsabilidades:**
- Coordinar el proceso de deduplicación
- Aplicar criterios de detección de duplicados
- Resolver conflictos entre canales duplicados
- Generar métricas y estadísticas

#### 2. DeduplicationConfig
**Ubicación:** `src/domain/services/ChannelDeduplicationService.js`

**Responsabilidades:**
- Configurar criterios de deduplicación
- Definir umbrales de similitud
- Establecer estrategias de resolución de conflictos

#### 3. DeduplicationMetrics
**Ubicación:** `src/domain/services/ChannelDeduplicationService.js`

**Responsabilidades:**
- Recopilar estadísticas del proceso
- Calcular tasas de deduplicación
- Medir tiempos de procesamiento

## Criterios de Deduplicación

### 1. ID Exacto (`id_exact`)
Compara los IDs de los canales de forma exacta.

```javascript
config.criteria = 'id_exact';
```

### 2. Similitud de Nombres (`name_similarity`)
Utiliza el algoritmo de distancia de Levenshtein para comparar nombres de canales.

```javascript
config.criteria = 'name_similarity';
config.nameSimilarityThreshold = 0.85; // 85% de similitud
```

### 3. Similitud de URLs (`url_similarity`)
Compara las URLs de los streams utilizando normalización y cálculo de similitud.

```javascript
config.criteria = 'url_similarity';
config.urlSimilarityThreshold = 0.90; // 90% de similitud
```

### 4. Combinado (`combined`)
Aplica múltiples criterios de forma inteligente.

```javascript
config.criteria = 'combined';
config.nameSimilarityThreshold = 0.85;
config.urlSimilarityThreshold = 0.90;
```

## Estrategias de Resolución de Conflictos

### 1. Priorizar Fuente (`prioritize_source`)
Mantiene el canal de la fuente con mayor prioridad.

```javascript
config.strategy = 'prioritize_source';
config.sourcePriority = ['csv', 'm3u']; // CSV tiene prioridad sobre M3U
```

### 2. Priorizar HD (`prioritize_hd`)
Mantiene el canal con mejor calidad (HD sobre SD).

```javascript
config.strategy = 'prioritize_hd';
config.enableHdUpgrade = true;
```

### 3. Lógica Personalizada (`custom`)
Aplica reglas de negocio específicas.

```javascript
config.strategy = 'custom';
// Implementa lógica personalizada en el servicio
```

## Configuración Recomendada

Basándose en el análisis de optimización, la configuración recomendada es:

```bash
# Variables de entorno
DEDUPLICATION_CRITERIA=combined
DEDUPLICATION_STRATEGY=prioritize_source
NAME_SIMILARITY_THRESHOLD=0.95
URL_SIMILARITY_THRESHOLD=0.98
ENABLE_INTELLIGENT_DEDUPLICATION=true
ENABLE_HD_UPGRADE=true
```

### Justificación
- **Criterio Combinado:** Detecta duplicados por múltiples vías
- **Umbrales Altos:** Evita falsos positivos (0.95 nombres, 0.98 URLs)
- **Prioridad de Fuente:** Mantiene consistencia con fuentes confiables
- **Upgrade HD:** Mejora automáticamente la calidad cuando es posible

## Métricas y Monitoreo

### Métricas Disponibles

```javascript
const metrics = deduplicationService.getMetrics();

console.log({
  channelsProcessed: metrics.channelsProcessed,
  duplicatesFound: metrics.duplicatesFound,
  duplicatesRemoved: metrics.duplicatesRemoved,
  hdUpgrades: metrics.hdUpgrades,
  sourceConflicts: metrics.sourceConflicts,
  deduplicationRate: metrics.deduplicationRate,
  processingTimeMs: metrics.processingTimeMs
});
```

### Logging Detallado

El sistema proporciona logging detallado en diferentes niveles:

- **INFO:** Estadísticas generales y resultados
- **DEBUG:** Detalles de duplicados por fuente
- **WARN:** Canales duplicados ignorados
- **ERROR:** Errores durante el procesamiento

## Scripts de Utilidad

### 1. Debug de Configuración
**Archivo:** `scripts/debug-deduplication-config.js`

```bash
bun run scripts/debug-deduplication-config.js
```

**Propósito:** Diagnosticar la configuración actual y mostrar estadísticas detalladas.

### 2. Optimización de Configuración
**Archivo:** `scripts/optimize-deduplication.js`

```bash
bun run scripts/optimize-deduplication.js
```

**Propósito:** Probar múltiples configuraciones y recomendar la óptima.

## Algoritmos Utilizados

### Distancia de Levenshtein
Utilizado para calcular similitud entre nombres de canales:

```javascript
#levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1).fill(null).map(() => 
    Array(str1.length + 1).fill(null)
  );
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // inserción
        matrix[j - 1][i] + 1,     // eliminación
        matrix[j - 1][i - 1] + cost // sustitución
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}
```

### Normalización de Nombres
Proceso de limpieza y estandarización:

```javascript
#normalizeChannelName(name) {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
    .replace(/\s+/g, ' ')        // Normalizar espacios
    .replace(/\b(hd|sd|4k)\b/g, '') // Remover indicadores de calidad
    .trim();
}
```

### Normalización de URLs
Estandarización de URLs de streams:

```javascript
#normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    return url.toLowerCase().trim();
  }
}
```

## Casos de Uso

### 1. Deduplicación Básica
```javascript
const config = new DeduplicationConfig({
  criteria: 'id_exact',
  strategy: 'prioritize_source'
});

const service = new ChannelDeduplicationService(config, logger);
const result = await service.deduplicateChannels(channels);
```

### 2. Deduplicación Avanzada
```javascript
const config = new DeduplicationConfig({
  criteria: 'combined',
  strategy: 'prioritize_source',
  nameSimilarityThreshold: 0.90,
  urlSimilarityThreshold: 0.95,
  enableIntelligentDeduplication: true,
  enableHdUpgrade: true,
  sourcePriority: ['csv', 'm3u']
});

const service = new ChannelDeduplicationService(config, logger);
const result = await service.deduplicateChannels(channels);
```

### 3. Actualización de Configuración
```javascript
const newConfig = {
  nameSimilarityThreshold: 0.95,
  enableHdUpgrade: false
};

service.updateConfig(newConfig);
```

## Consideraciones de Rendimiento

### Complejidad Temporal
- **ID Exacto:** O(n) - Lineal
- **Similitud de Nombres:** O(n²) - Cuadrática
- **Similitud de URLs:** O(n²) - Cuadrática
- **Combinado:** O(n²) - Cuadrática

### Optimizaciones Implementadas
- Uso de Maps para búsquedas O(1)
- Normalización previa de datos
- Corte temprano en comparaciones
- Procesamiento por lotes

### Recomendaciones
- Para datasets grandes (>1000 canales), usar criterios específicos
- Monitorear tiempos de procesamiento
- Ajustar umbrales según necesidades

## Troubleshooting

### Problema: Demasiados Duplicados Detectados
**Solución:** Aumentar umbrales de similitud
```bash
NAME_SIMILARITY_THRESHOLD=0.95
URL_SIMILARITY_THRESHOLD=0.98
```

### Problema: Pocos Duplicados Detectados
**Solución:** Disminuir umbrales o cambiar criterio
```bash
DEDUPLICATION_CRITERIA=combined
NAME_SIMILARITY_THRESHOLD=0.80
```

### Problema: Rendimiento Lento
**Solución:** Usar criterios más específicos
```bash
DEDUPLICATION_CRITERIA=id_exact
```

### Problema: Canales HD No Priorizados
**Solución:** Habilitar upgrade HD
```bash
ENABLE_HD_UPGRADE=true
DEDUPLICATION_STRATEGY=prioritize_hd
```

## Extensibilidad

### Agregar Nuevos Criterios
1. Extender enum `DeduplicationCriteria`
2. Implementar lógica en `#detectDuplicates`
3. Agregar tests correspondientes

### Agregar Nuevas Estrategias
1. Extender enum `ConflictResolutionStrategy`
2. Implementar lógica en `#resolveConflict`
3. Documentar comportamiento

### Agregar Nuevas Métricas
1. Extender clase `DeduplicationMetrics`
2. Actualizar recolección en servicio
3. Incluir en logging

## Testing

Los tests unitarios están ubicados en:
- `test/unit/services/ChannelDeduplicationService.test.js`

### Ejecutar Tests
```bash
bun test test/unit/services/ChannelDeduplicationService.test.js
```

### Cobertura de Tests
- ✅ Detección de duplicados por ID
- ✅ Detección por similitud de nombres
- ✅ Detección por similitud de URLs
- ✅ Resolución de conflictos
- ✅ Upgrade HD automático
- ✅ Métricas y estadísticas
- ✅ Configuración dinámica

## Conclusión

El sistema de deduplicación implementado proporciona una solución robusta, configurable y extensible para la gestión de canales duplicados. Su diseño modular permite adaptarse a diferentes necesidades y escenarios de uso, mientras que las métricas detalladas facilitan el monitoreo y optimización continua.