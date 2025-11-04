# Sistema de TV - Guía de Debugging y Arquitectura

## 🎯 Objetivo
Documentar el funcionamiento completo del sistema de TV para resolver el problema de canales no cargando en producción (`https://services-t.hvjqlb.easypanel.host/`).

## 📋 Arquitectura del Sistema de TV

### Flujo de Datos Completo
```
1. Configuración (.env) → M3U_URL
   ↓
2. M3UTvRepository → Carga M3U desde URL
   ↓  
3. M3UParser → Parsea contenido M3U a objetos TV
   ↓
4. TvHandler → Procesa peticiones Stremio
   ↓
5. Respuesta JSON → Stremio Client
```

### Componentes Principales

#### 1. M3UTvRepository (`src/infrastructure/repositories/M3UTvRepository.js`)
**Responsabilidad**: Gestión de datos M3U con caché
```javascript
// Constructor
constructor(m3uUrl, config, logger)

// Métodos clave
- getAllTvs() → Promise<Tv[]>
- getTvById(channelId) → Promise<Tv|null>
- #loadTvsFromSource() → Carga desde URL
- #isCacheValid() → Valida expiración
```

**Headers HTTP configurables**:
```javascript
const headers = {
  'User-Agent': process.env.M3U_REQUEST_USER_AGENT || 'Stremio-Addon/1.0',
  'Accept': process.env.M3U_REQUEST_ACCEPT || 'application/x-mpegURL, text/plain, */*',
  'Referer': process.env.M3U_REQUEST_REFERER || new URL(m3uUrl).origin
};
```

#### 2. TvHandler (`src/application/handlers/TvHandler.js`)
**Responsabilidad**: Manejar peticiones Stremio
```javascript
// Handlers Stremio
- createCatalogHandler() → Filtra por género
- createMetaHandler() → Metadatos de canal  
- createStreamHandler() → URLs de stream con headers
```

#### 3. M3UParser (`src/infrastructure/utils/M3UParser.js`)
**Responsabilidad**: Parsear contenido M3U
```javascript
// Validación
- isValidM3U(content) → boolean

// Parseo
- parse(m3uContent) → Tv[]
```

## 🔍 Diagnóstico de Problemas

### Paso 1: Verificar Configuración
```bash
# Variables críticas a revisar
M3U_URL=https://www.tdtchannels.com/lists/tv.m3u
M3U_REQUEST_TIMEOUT=10000
M3U_REQUEST_USER_AGENT=Stremio-Addon/1.0
M3U_REQUEST_REFERER=
M3U_REQUEST_ACCEPT=application/x-mpegURL, text/plain, */*
```

### Paso 2: Logs de Diagnóstico
El sistema tiene logging detallado en `OptimizedLoggerService`:
```javascript
// Niveles de log disponibles
LOG_LEVEL=debug  // Para máximo detalle
LOG_LEVEL=info   // Para producción
LOG_LEVEL=error  // Solo errores
```

### Paso 3: Validación de M3U
El parser valida el formato M3U:
```javascript
if (!M3UParser.isValidM3U(m3uContent)) {
  const preview = m3uContent.substring(0, 200).replace(/\n/g, '\\n');
  logger.warn('Invalid M3U format received. First bytes preview:', preview);
  throw new Error('Invalid M3U format received');
}
```

## 🚨 Problemas Comunes y Soluciones

### 1. M3U_URL No Accesible
**Síntomas**: "No TV channels found", "HTTP error"
**Diagnóstico**:
```bash
# Test manual de la URL
curl -I "https://www.tdtchannels.com/lists/tv.m3u"

# Verificar timeout
M3U_REQUEST_TIMEOUT=30000  # Aumentar a 30s
```

### 2. Headers Bloqueados
**Síntomas**: "HTTP 403 Forbidden"
**Solución**: Configurar headers específicos:
```bash
M3U_REQUEST_USER_AGENT=Mozilla/5.0 (compatible; Stremio-Addon)
M3U_REQUEST_REFERER=https://www.tdtchannels.com
```

### 3. Caché Corrupto
**Síntomas**: Canales antiguos o incompletos
**Solución**: Forzar refresh
```javascript
// El repositorio tiene método para forzar refresh
await tvRepository.refreshTvs();
```

### 4. Entorno de Producción
**Problema**: Diferencias entre desarrollo y producción
**Verificar**:
```bash
# En producción
NODE_ENV=production
LOG_LEVEL=info  # No debug

# Firewall/Proxy en hosting
# Algunos hosts bloquean salidas HTTP
```

## 🔧 Configuración de Debug en Producción

### Habilitar Logs Detallados
```bash
# Temporalmente para diagnóstico
LOG_LEVEL=debug
LOG_TO_FILE=true
LOG_FILE_PATH=logs/tv-debug.log
```

### Test de Componentes
```javascript
// Test manual de M3UTvRepository
const repository = new M3UTvRepository(
  process.env.M3U_URL,
  { repository: { m3uCacheTimeout: 60000 } },
  logger
);

try {
  const stats = await repository.getStats();
  console.log('TV Stats:', stats);
  
  const channels = await repository.getAllTvs();
  console.log('Channels loaded:', channels.length);
} catch (error) {
  console.error('Repository error:', error.message);
}
```

## 📊 Métricas y Monitoreo

### Stats Disponibles
```javascript
// M3UTvRepository.getStats()
{
  total: 150,        // Total canales
  groups: 25,        // Grupos únicos  
  groupNames: ['Spain', 'News', 'Sports'],
  lastUpdated: '2024-01-15T10:30:00Z'
}
```

### OptimizedLoggerService Métricas
```javascript
// Métricas internas del logger
{
  totalLogs: 1250,
  throttledLogs: 5,    // Logs prevenidos por throttling
  batchedLogs: 800     // Logs procesados en batch
}
```

## 🌐 Problemas Específicos de Hosting

### Easypanel.io Consideraciones
1. **Network Policies**: Algunos hosts restringen salidas HTTP
2. **Container Limits**: Límites de memoria/CPU afectan caché
3. **File System**: Solo lectura en algunos directorios
4. **Environment Variables**: Requieren rebuild del contenedor

### Verificación en Contenedor
```bash
# Dentro del contenedor
docker exec -it <container> bash

# Test de conectividad
wget -O- "https://www.tdtchannels.com/lists/tv.m3u" | head -20

# Variables de entorno
env | grep M3U
```

## 🛠️ Scripts de Diagnóstico

### Test Completo del Sistema TV
```javascript
// test-tv-system.js
import { M3UTvRepository } from './src/infrastructure/repositories/M3UTvRepository.js';
import { OptimizedLoggerService } from './tv/src/infrastructure/services/OptimizedLoggerService.js';

const logger = new OptimizedLoggerService({ level: 'debug' });
const config = {
  repository: { 
    m3uCacheTimeout: 60000,
    maxTvChannels: 1000 
  }
};

async function diagnoseTvSystem() {
  console.log('🚀 Iniciando diagnóstico del sistema TV...\n');
  
  // 1. Verificar configuración
  console.log('1️⃣ Configuración:');
  console.log(`   M3U_URL: ${process.env.M3U_URL}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`   LOG_LEVEL: ${process.env.LOG_LEVEL}\n`);
  
  // 2. Test repositorio
  try {
    const repository = new M3UTvRepository(
      process.env.M3U_URL,
      config,
      logger
    );
    
    console.log('2️⃣ Test M3UTvRepository:');
    const stats = await repository.getStats();
    console.log('   ✓ Stats:', stats);
    
    const channels = await repository.getAllTvs();
    console.log(`   ✓ Channels loaded: ${channels.length}`);
    
    if (channels.length > 0) {
      console.log('   ✓ Sample channel:', {
        id: channels[0].id,
        name: channels[0].name,
        group: channels[0].group,
        logo: channels[0].logo
      });
    }
    
  } catch (error) {
    console.error('   ❌ Repository error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

diagnoseTvSystem();
```

## 📝 Checklist Final

Antes de deployar:
- [ ] Verificar `M3U_URL` es accesible desde el host
- [ ] Configurar `M3U_REQUEST_TIMEOUT` apropiado
- [ ] Establecer `LOG_LEVEL=info` para producción
- [ ] Testear con `NODE_ENV=production` localmente
- [ ] Verificar límites de memoria del contenedor
- [ ] Confirmar políticas de firewall/salida HTTP
- [ ] Habilitar logs en archivo para debugging remoto

## 🔗 Recursos

- **M3U Parser**: `src/infrastructure/utils/M3UParser.js`
- **TvHandler**: `src/application/handlers/TvHandler.js`  
- **M3UTvRepository**: `src/infrastructure/repositories/M3UTvRepository.js`
- **OptimizedLogger**: `tv/src/infrastructure/services/OptimizedLoggerService.js`