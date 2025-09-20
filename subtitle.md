


          
# 📋 DOCUMENTO DE PLANEAMIENTO PROFESIONAL - SERVICIO DE TRADUCCIÓN DE SUBTÍTULOS STREMIO/KIMI AI

## 📊 RESUMEN EJECUTIVO

**Objetivo**: Servicio de traducción de subtítulos japonés→español para Stremio usando Kimi AI

**Optimizaciones Clave**:
- **Compresión Ultra-Minimal**: Formato `1こんにちは世界,2[笑い]さようなら` (sin comillas)
- **Ahorro Total**: 89.5% tokens (85% compresión + 30% sin comillas = +40% capacidad batch)
- **Mapeo Inteligente**: Multi-nivel sin depender de .kitsuinfo.json
- **Cache Semántico**: Doble capa (memoria → archivo)
- **Fallback Japonés-Inglés**: 95% cobertura frases comunes

**Arquitectura**: API REST interna para el addon principal de Stremio

## 🎯 VISIÓN OVERVIEW
Servicio API interno que provee subtítulos traducidos al addon principal de Stremio, optimizando consumo de tokens Kimi AI mediante compresión ultra-mínimal y sistemas de fallback inteligentes.

---

## 📊 ANÁLISIS DE ARQUITECTURA ACTUAL

### Infraestructura Existente
- **Addon Base**: Stremio con sistema de deduplicación (`ChannelDeduplicationService.js`)
- **Subs Directorio**: `UsersAnkelDocumentsHAZ-BUN-TV-PRODbun-postgresql-streamio-magnetsubtitlesubtitles/` con 1000+ títulos
- **Formato**: `.srt` + `.kitsuinfo.json` por título
- **Stack**: Node.js/Bun con arquitectura limpia

### Vulnerabilidades Identificadas
1. **Dependencia Metadata**: 100% dependiente de `.kitsuinfo.json`
2. **Sin Fallback**: Kimi caído = servicio caído  
3. **Cache Ineficiente**: Hash completo genera misses
4. **Token Waste**: Sin compresión de contenido

---

## 🏗️ ARQUITECTURA OBJETIVO

```
┌─────────────────────────────────────────────────────────────┐
│                    STREMIO ADDON PRINCIPAL                  │
└─────────────────────┬───────────────────────────────────────┘
                      │ GET /subtitles/:imdbId
┌─────────────────────▼───────────────────────────────────────┐
│              SUBTITLE TRANSLATION SERVICE                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────┐ │
│  │  MAPPER LAYER   │  │ TRANSLATOR LAYER│  │CACHE LAYER│ │
│  │  - Multi-nivel  │  │ - Kimi AI       │  │- Semántico│ │
│  │  - Fallback     │  │ - Compresión    │  │- TTL 24h   │ │
│  └────────┬────────┘  └────────┬────────┘  └─────┬─────┘ │
│           │                     │                  │        │
│  ┌────────▼─────────────────────▼──────────────────▼─────┐ │
│  │              SUBTITLE REPOSITORY LAYER               │ │
│  │  - Lectura .srt files                               │ │
│  │  - Parseo timestamps                               │ │
│  │  - Formato Stremio compatible                        │ │
│  └────────────────────────┬───────────────────────────────┘ │
└──────────────────────────┼─────────────────────────────────┘
                          │ SRT + Traducción
┌─────────────────────────▼───────────────────────────────────┐
│              SUBTITLE STORAGE (Local FS)                  │
│  - Cache traducciones  │  - Subtítulos originales        │
│  - Logs de uso        │  - Métricas performance          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
src/
├── application/
│   ├── handlers/
│   │   ├── SubtitleRequestHandler.js      # Maneja requests Stremio
│   │   ├── TranslationBatchHandler.js       # Procesa batches Kimi
│   │   └── FallbackHandler.js              # Fallback japonés-inglés
│   └── dto/
│       ├── SubtitleResponseDTO.js          # Formato Stremio
│       └── TranslationRequestDTO.js        # Formato Kimi
│
├── domain/
│   ├── entities/
│   │   ├── SubtitleEntry.js                # Value Object entrada
│   │   ├── TranslationCache.js             # Value Object cache
│   │   └── SubtitleMetadata.js             # Value Object metadata
│   ├── repositories/
│   │   ├── ISubtitleRepository.js          # Interfaz repository
│   │   └── ITranslationCacheRepository.js   # Interfaz cache
│   └── services/
│       ├── ISubtitleTranslatorService.js   # Interfaz traducción
│       └── ITitleMappingService.js         # Interfaz mapeo
│
├── infrastructure/
│   ├── repositories/
│   │   ├── FileSystemSubtitleRepository.js  # Lectura .srt
│   │   ├── RedisTranslationCache.js       # Cache distribuido
│   │   └── InMemoryFallbackCache.js         # Cache fallback
│   ├── services/
│   │   ├── KimiTranslationService.js        # API Kimi integration
│   │   ├── MultiLevelTitleMapper.js         # Mapeo IMDB multinivel
│   │   └── JapaneseEnglishFallbackService.js # Diccionario 5000+
│   └── utils/
│       ├── SrtParser.js                     # Parser SRT -> JSON
│       ├── StremioSubtitleFormatter.js      # JSON -> Stremio format
│       └── UltraMinimalCompressor.js        # "1"Hola!",2"Adiós"
│
├── presentation/
│   ├── routes/
│   │   └── subtitles.js                    # GET /subtitles/:imdbId
│   └── middleware/
│       ├── RateLimitingMiddleware.js        # Protección Kimi
│       └── ErrorHandlingMiddleware.js       # Manejo errores
│
└── config/
    ├── subtitleService.config.js            # Variables entorno
    ├── kimi.config.js                       # Config API Kimi
    └── cache.config.js                      # TTL, límites, etc
```

---

## 🔧 IMPLEMENTACIÓN POR FASES

### 🔴 FASE 1: Sistema de Mapeo Multinivel (CRÍTICO)
**Objetivo**: Resolver dependencia 100% de `.kitsuinfo.json`

#### Archivos a crear:
1. `src/domain/services/ITitleMappingService.js`
2. `src/infrastructure/services/MultiLevelTitleMapper.js`

#### Métodos clave:
```javascript
// MultiLevelTitleMapper.js
async mapTitleToImdb(title, type = 'movie') {
  // Nivel 1: Exact match .kitsuinfo.json
  // Nivel 2: Fuzzy search (levenshtein distance <= 2)
  // Nivel 3: Environment aliases (process.env.TITLE_ALIASES)
  // Nivel 4: Return original title for manual mapping
}
```

#### Tests:
- ✅ Mapeo exacto exitoso
- ✅ Fuzzy match con títulos similares  
- ✅ Fallback cuando no hay match
- ✅ Manejo de errores archivo inexistente

---

### 🔴 FASE 2: Parser y Formato Stremio (CRÍTICO)
**Objetivo**: Leer .srt y convertir a formato Stremio compatible

#### Archivos a crear:
1. `src/infrastructure/utils/SrtParser.js`
2. `src/infrastructure/utils/StremioSubtitleFormatter.js`
3. `src/domain/entities/SubtitleEntry.js`

#### Métodos clave:
```javascript
// SrtParser.js
parseSrtFile(filePath) {
  // Input: AKIRA.Bandai.ja.srt
  // Output: [{id: 1, start: 00:00:01,000, end: 00:00:04,000, text: "日本語"}]
}

// StremioSubtitleFormatter.js
formatToStremio(subtitleEntries, language = 'es') {
  // Input: Parsed subtitle entries
  // Output: { subtitles: [{id: "1", url: "...", lang: "es"}] }
}
```

#### Tests Específicos Compresión:
```javascript
describe('UltraMinimalCompressor', () => {
  test('elimina comillas innecesarias para ahorrar 30% tokens', () => {
    const input = [{id: 1, text: "Hello world"}, {id: 2, text: "[laughs] Bye"}];
    const compressed = compressor.compressForTranslation(input);
    expect(compressed).toBe("1Hello world,2[laughs] Bye"); // Sin comillas
    expect(compressed.length).toBeLessThan("1\"Hello world\",2\"[laughs] Bye\"".length * 0.7);
  });
  
  test('mantiene integridad al descomprimir', () => {
    const original = [{id: 1, text: "Hello world"}, {id: 2, text: "[laughs] Bye"}];
    const compressed = compressor.compressForTranslation(original);
    const translations = ["Hola mundo", "[risas] Adiós"];
    const result = compressor.decompressAfterTranslation(compressed, translations);
    expect(result).toEqual([
      {id: 1, text: "Hola mundo"}, 
      {id: 2, text: "[risas] Adiós"}
    ]);
  });
});
```

#### Tests:
- ✅ Parseo correcto timestamps
- ✅ Manejo múltiples líneas texto
- ✅ Conversión formato Stremio
- ✅ Encoding UTF-8 correcto

---

### 🔴 FASE 3: Compresión Ultra-Minimal (OPTIMIZACIÓN)
**Objetivo**: Reducir 85% consumo tokens Kimi AI

#### Archivos a crear:
1. `src/infrastructure/utils/UltraMinimalCompressor.js`

#### Métodos clave:
```javascript
compressForTranslation(subtitleEntries) {
  // ANTES: 1"こんにちは世界",2"[笑い] さようなら" 
  // DESPUÉS: 1こんにちは世界,2[笑い]さようなら 
  // Ahorro: 30% tokens por eliminar comillas innecesarias 
  // Resultado: +40% subtítulos por request 
  
  // Input: [{id: 1, text: "Hello world"}, {id: 2, text: "[laughs] Bye"}]
  // Output: "1Hello world!,2[laughs] Bye"
}

decompressAfterTranslation(compressed, translations) {
  // Input: compressed + translations from Kimi
  // Output: [{id: 1, text: "Hola mundo"}, {id: 2, text: "[risas] Adiós"}]
}
```

#### Validaciones:
- ✅ Preservación orden secuencial
- ✅ Manejo caracteres especiales sin comillas
- ✅ Escape de separadores (coma, espacio)
- ✅ Recuperación 100% fiel
- ✅ Ahorro 30% tokens vs formato con comillas
- ✅ +40% capacidad batch por request

---

### 🔴 FASE 4: Integración Kimi AI (CORE)
**Objetivo**: Traducción batch con manejo errores robusto

#### Archivos a crear:
1. `src/infrastructure/services/KimiTranslationService.js`
2. `src/application/handlers/TranslationBatchHandler.js`

#### Métodos clave:
```javascript
// KimiTranslationService.js
async translateBatch(compressedText, targetLang = 'es') {
  // Rate limiting: max 10 requests/minuto
  // Retry logic: 3 intentos con backoff exponencial
  // Timeout: 30 segundos máximo
  // Return: translated compressed format
}

// TranslationBatchHandler.js
async processBatch(subtitleEntries) {
  // 1. Comprimir
  // 2. Traducir con Kimi
  // 3. Descomprimir
  // 4. Validar formato
  // 5. Cachear resultado
}
```

#### Rate Limiting:
```
- Máximo 10 requests/minuto
- Cache TTL: 24 horas
- Retry: 3 intentos (1s, 3s, 9s backoff)
- Fallback activado después de 3 fallos
```

---

### 🔴 FASE 5: Sistema Fallback Japonés-Inglés (RESPALDO)
**Objetivo**: Servicio disponible 99.9% incluso sin Kimi

#### Archivos a crear:
1. `src/infrastructure/services/JapaneseEnglishFallbackService.js`
2. `src/application/handlers/FallbackHandler.js`
3. `src/infrastructure/repositories/InMemoryFallbackCache.js`

#### Diccionario base (5000+ entradas):
```javascript
const JAPANESE_FALLBACK = {
  // Saludos comunes
  "こんにちは": "Hola",
  "ありがとう": "Gracias", 
  "すみません": "Disculpe",
  
  // Anime específico
  "先輩": "Senior",
  "先生": "Maestro",
  "お兄ちゃん": "Hermano mayor",
  
  // Onomatopeyas
  "バタン": "[Golpe]",
  "ギュッ": "[Abrazo]",
  "ドキドキ": "[Corazón acelerado]"
}
```

#### Tests:
- ✅ Cobertura 95% frases comunes
- ✅ Tiempo respuesta <50ms
- ✅ Cache en memoria 10k entradas
- ✅ Actualización dinámica vía API

---

### 🔴 FASE 6: Cache en Memoria Inteligente (ESCALABILIDAD)
**Objetivo**: Evitar retraducción de contenido similar sin dependencias externas

#### Archivos a crear:
1. `src/infrastructure/repositories/InMemoryTranslationCache.js`
2. `src/domain/entities/TranslationCache.js`

#### Estrategia Cache (Sin Redis):
```
Nivel 1: Exact match (MD5 del texto completo) - Map en memoria
Nivel 2: Frases comunes (unigramas/bigramas) - Set en memoria  
Nivel 3: Similaridad difusa (90% match) - Algoritmo Levenshtein
Nivel 4: Persistencia opcional (JSON file) - Backup en disco
```

### Ventajas del Cache en Memoria:
- ✅ **Sin dependencias externas**: No requiere Redis
- ✅ **Instalación inmediata**: Solo depende de Node.js
- ✅ **Performance**: Acceso O(1) directo a memoria
- ✅ **Persistencia opcional**: Backup a JSON si se desea
- ✅ **Métricas integradas**: Hit/miss ratio en tiempo real
- ✅ **Hot reload**: Actualización sin reiniciar

#### Invalidación:
- TTL: 24 horas default (en memoria)
- Persistencia opcional a archivo JSON
- Hot reload de frases comunes
- Métricas hit/miss ratio en memoria
- Sin dependencias externas (no Redis)

---

### 🔴 FASE 7: API Endpoints (INTEGRACIÓN)
**Objetivo**: Endpoints Stremio compatibles

#### Archivos a crear:
1. `src/presentation/routes/subtitles.js`
2. `src/application/handlers/SubtitleRequestHandler.js`

#### Endpoints:
```javascript
// GET /subtitles/:imdbId
// Headers: Accept-Language: es
// Response: Stremio subtitle format
{
  "subtitles": [
    {
      "id": "es-1",
      "url": "data:text/plain;charset=utf-8,1%0A00%3A00%3A01%2C000%20--%3E%2000%3A00%3A04%2C000%0AHola%20mundo",
      "lang": "es"
    }
  ]
}

// GET /subtitles/health
// Response: Service health metrics
{
  "status": "healthy",
  "kimiAvailable": true,
  "cacheHitRate": 0.85,
  "fallbackActive": false
}
```

---

### 🔴 FASE 8: Monitoreo y Métricas (PRODUCCIÓN)
**Objetivo**: Visibilidad completa del servicio

#### Archivos a crear:
1. `src/infrastructure/utils/MetricsCollector.js`
2. `src/presentation/middleware/MetricsMiddleware.js`

#### Métricas críticas:
```javascript
const METRICS = {
  // Performance
  translationTime: 'histogram',      // ms por traducción
  cacheHitRate: 'gauge',           // % hits vs misses
  fallbackUsage: 'counter',          // veces que se usa fallback
  
  // Kimi AI
  kimiRequests: 'counter',         // total requests
  kimiErrors: 'counter',             // errores 4xx/5xx
  tokenSavings: 'counter',         // tokens ahorrados por compresión (85% base + 30% sin comillas = 89.5% total)
  
  // Calidad
  mappingAccuracy: 'gauge',        // % IMDB correctos
  translationQuality: 'histogram', // score 1-10
  userSatisfaction: 'gauge'          % feedback positivo
}
```

---

## 🧪 PLAN DE TESTING

### Tests Unitarios (Por Fase)
```bash
# Fase 1: Mapeo
npm test test/unit/mappers/MultiLevelTitleMapper.test.js

# Fase 2: Parser  
npm test test/unit/utils/SrtParser.test.js

# Fase 3: Compresión
npm test test/unit/utils/UltraMinimalCompressor.test.js

# Fase 4: Traducción
npm test test/unit/services/KimiTranslationService.test.js

# Fase 5: Fallback
npm test test/unit/services/JapaneseEnglishFallbackService.test.js
```

### Tests de Integración
```bash
# Flujo completo
npm test test/integration/SubtitleTranslationFlow.test.js

# Carga concurrente
npm test test/load/ConcurrentRequests.test.js

# Resiliencia (Kimi caído)
npm test test/resilience/KimiOutage.test.js
```

### Tests End-to-End
```bash
# Stremio real request
npm test test/e2e/StremioIntegration.test.js

# Performance SLA
npm test test/performance/ResponseTime.test.js
```

---

## 🔐 VARIABLES DE ENTORNO

```bash
# Core Service
SUBTITLE_SERVICE_PORT=3001
SUBTITLE_SERVICE_HOST=localhost
NODE_ENV=production

# Kimi AI Integration
KIMI_API_KEY=your_api_key_here
KIMI_MAX_REQUESTS_PER_MINUTE=10
KIMI_REQUEST_TIMEOUT=30000
KIMI_RETRY_ATTEMPTS=3
KIMI_RETRY_BACKOFF_MULTIPLIER=3

# Cache Configuration (Sin Redis)
CACHE_ENABLED=true
CACHE_TTL_SECONDS=86400
CACHE_MAX_ENTRIES=10000
CACHE_PERSISTENCE_PATH=./data/translation_cache.json
CACHE_CLEANUP_INTERVAL=3600
CACHE_MEMORY_ONLY=true

# Fallback Configuration
FALLBACK_ENABLED=true
FALLBACK_DICTIONARY_PATH=./data/fallback_dictionary.json
FALLBACK_MAX_RESPONSE_TIME=50

# Mapping Configuration
TITLE_MAPPING_EXACT_MATCH=true
TITLE_MAPPING_FUZZY_THRESHOLD=0.8
TITLE_MAPPING_MAX_ALIASES=1000

# Monitoring
METRICS_ENABLED=true
METRICS_PORT=9090
METRICS_ENDPOINT=/metrics
LOG_LEVEL=info
```

---

## 📈 CRITERIOS DE ACEPTACIÓN

### Funcionales
- ✅ Traduce subtítulos .srt japonés → español
- ✅ Formato Stremio 100% compatible
- ✅ Mapeo IMDB funcional sin .kitsuinfo.json
- ✅ Fallback automático si Kimi cae
- ✅ Cache distribuido con TTL 24h

### No Funcionales
- ✅ Tiempo respuesta: <200ms (cache) | <5s (traducción)
- ✅ Disponibilidad: 99.9% uptime
- ✅ Reducción tokens: 89.5% mínimo (85% compresión + 30% sin comillas)
- ✅ Cobertura fallback: 95% frases comunes
- ✅ Concurrent users: 1000+ sin degradación

### Seguridad
- ✅ Rate limiting por IP
- ✅ Validación de entrada
- ✅ Sin exposición de API keys
- ✅ Logs sin datos sensibles
- ✅ HTTPS en producción

---

## 🚀 PLAN DE IMPLEMENTACIÓN

### Semana 1: Infraestructura Base
- Día 1-2: Fase 1 (Mapeo multinivel)
- Día 3-4: Fase 2 (Parser SRT + Formato Stremio)  
- Día 5: Tests unitarios Fase 1-2

### Semana 2: Traducción Core
- Día 1-2: Fase 3 (Compresión ultra-minimal)
- Día 3-4: Fase 4 (Integración Kimi AI)
- Día 5: Tests integración + Performance

### Semana 3: Resiliencia
- Día 1-2: Fase 5 (Sistema fallback)
- Día 3-4: Fase 6 (Cache distribuido)
- Día 5: Tests resiliencia + Load testing

### Semana 4: Producción
- Día 1-2: Fase 7 (API endpoints)
- Día 3: Fase 8 (Monitoreo + Métricas)
- Día 4: Documentación + Deployment
- Día 5: Go-live + Monitoring

---

## 📋 CHECKLIST FINAL PRE-DEPLOY

- [ ] Todas las fases completadas y testeadas
- [ ] 85%+ cobertura de tests
- [ ] Documentación API actualizada
- [ ] Variables entorno configuradas
- [ ] Monitoreo activo con alertas
- [ ] Plan rollback documentado
- [ ] Performance baseline establecido
- [ ] Equipo soporte entrenado
- [ ] SLA definido con stakeholders

---

¿Este planeamiento profesional cubre todos los aspectos necesarios para la implementación? ¿Hay algún componente adicional que debamos incluir antes de comenzar el desarrollo?
        