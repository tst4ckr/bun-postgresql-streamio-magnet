# Análisis de Compatibilidad de Anime en Stremio

## Resumen Ejecutivo

Los servicios `IdDetectorService.js`, `UnifiedIdService.js` y `KitsuMappingFallback.js` implementan un sistema de compatibilidad de anime para Stremio mediante un enfoque de arquitectura limpia que sigue principios SOLID. El sistema permite la visualización de anime desde múltiples fuentes (Kitsu, MyAnimeList, AniList, AniDB) en Stremio al convertir dinámicamente IDs entre diferentes servicios.

## Funcionamiento Interno del Sistema

### 1. IdDetectorService - Detección Autónoma de IDs

**Propósito:** Detecta automáticamente el tipo y formato de cualquier ID de anime proporcionado.

**Mecanismo de Detección:**
- **Patrones Configurables:** Utiliza un Map de patrones regex para identificar tipos de ID
- **Validación Dinámica:** Cada tipo tiene su propio validador específico
- **Normalización:** Extrae IDs limpios sin prefijos para procesamiento interno

**Tipos de IDs Soportados:**
- **IMDb:** `tt25622312` (prefijo tt + 7+ dígitos)
- **Kitsu:** `kitsu:48671` o `48671` (prefijo opcional)
- **MyAnimeList:** `mal:5114` o `5114`
- **AniList:** `anilist:5114` o `5114`
- **AniDB:** `anidb:5114` o `5114`

### 2. UnifiedIdService - Conversión Unificada

**Propósito:** Convierte cualquier ID de anime al formato requerido por Stremio (IMDb).

**Flujo de Conversión:**
```
ID de entrada → Detección → Conversión → ID IMDb → Stremio
```

**Estrategias de Conversión:**
1. **Cache:** Almacena conversiones previas por 24 horas
2. **Mapeo Directo:** Usa `KitsuMappingFallback` para conversiones conocidas
3. **Conversión Cruzada:** Convierte entre servicios de anime usando Kitsu como intermediario

### 3. KitsuMappingFallback - Mapeos de Respaldo

**Propósito:** Proporciona mapeos manuales confiables cuando las APIs no están disponibles.

**Características:**
- **Mapeos Completos:** Incluye conversiones para todos los servicios principales
- **Carga Dinámica:** Permite agregar nuevos mapeos en tiempo de ejecución
- **Búsqueda Inteligente:** Encuentra mapeos incluso con formatos de entrada variables

**Formato de Mapeos:**
```javascript
// Ejemplos de mapeos incluidos
'kitsu:48671' → 'tt21209876'  // Solo Leveling
'mal:5114' → 'tt25622312'    // Attack on Titan
'anilist:5114' → 'tt25622312' // Attack on Titan
'anidb:4563' → 'tt25622312'   // Attack on Titan
```

## Integración con Stremio

### Protocolo de Stremio

Según la documentación del Stremio Addon SDK, el sistema se alinea con los siguientes requisitos:

**Estructura de Respuesta Stremio:**
```json
{
  "streams": [
    {
      "title": "Attack on Titan",
      "url": "magnet:?xt=urn:btih:...",
      "behaviorHints": {
        "bingeGroup": "anime-attack-on-titan"
      }
    }
  ]
}
```

**Manifest del Addon:**
```json
{
  "id": "anime-unified-addon",
  "version": "1.0.0",
  "catalogs": [
    {
      "type": "series",
      "id": "anime",
      "name": "Anime Series"
    }
  ],
  "resources": ["stream", "catalog", "meta"],
  "types": ["anime", "movie", "series"],
  "idPrefixes": ["tt", "kitsu:", "mal:", "anilist:", "anidb:"]
}
```

### Mecanismo de Compatibilidad

**1. Recepción de Petición:**
Stremio envía peticiones con IDs en cualquier formato soportado:
- `/stream/series/kitsu:48671.json`
- `/stream/series/mal:5114.json`
- `/stream/series/tt25622312.json`

**2. Procesamiento:**
```javascript
// Ejemplo de uso en handler de Stremio
const unifiedService = new UnifiedIdService(...);
const result = await unifiedService.processContentId(id, 'imdb');

if (result.success) {
  // Buscar streams usando el IMDb ID convertido
  const streams = await findStreamsByImdbId(result.processedId);
  return { streams };
}
```

**3. Respuesta:**
El sistema retorna streams compatibles con Stremio usando el ID IMDb convertido.

## Ventajas Competitivas Implementadas

### 1. Soporte Multi-Plataforma
- **Universalidad:** Acepta IDs de cualquier servicio de anime popular
- **Flexibilidad:** No requiere que los usuarios conozcan el formato específico
- **Compatibilidad:** Funciona con todos los tipos de contenido (series, películas, OVAs)

### 2. Rendimiento Optimizado
- **Cache Inteligente:** Reduce llamadas a APIs externas
- **Conversión Rápida:** Mapeos pre-cargados para contenido popular
- **Fallos Graciosos:** Continúa funcionando incluso si APIs están caídas

### 3. Mantenibilidad
- **Arquitectura Limpia:** Separación clara de responsabilidades
- **Extensibilidad:** Fácil agregar nuevos servicios de anime
- **Configuración Dinámica:** Mapeos pueden actualizarse sin reiniciar el servicio

## Ejemplos de Uso

### Conversión Directa
```javascript
// Convierte Kitsu ID a IMDb
const result = await unifiedIdService.convertKitsuToImdb('48671');
// Resultado: { success: true, convertedId: 'tt21209876', method: 'manual_mapping' }

// Convierte MyAnimeList ID a IMDb
const result = await unifiedIdService.convertAnimeIdToImdb('5114', 'mal');
// Resultado: { success: true, convertedId: 'tt25622312', method: 'unified_mapping' }
```

### Detección Automática
```javascript
// Detecta tipo de ID automáticamente
const detection = idDetectorService.detectIdType('mal:5114');
// Resultado: { type: 'mal', id: '5114', isValid: true }
```

### Mapeos de Respaldo
```javascript
// Busca mapeo para cualquier formato
const imdbId = kitsuMappingFallback.getImdbIdFromAny('anilist:5114');
// Resultado: 'tt25622312'
```

## Monitoreo y Diagnóstico

El sistema incluye capacidades de monitoreo:
- **Estadísticas:** Muestra uso de cache y mapeos disponibles
- **Logs Detallados:** Registra cada conversión realizada
- **Validación:** Verifica integridad de mapeos antes de usarlos

## Conclusión

Los tres servicios trabajan sinérgicamente para proporcionar una experiencia de visualización de anime fluida en Stremio, superando las limitaciones de formatos de ID específicos y creando un puente universal entre servicios de anime y el ecosistema Stremio.