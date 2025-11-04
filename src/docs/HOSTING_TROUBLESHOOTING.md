# 🚨 Solución para Hosting con Problemas de TV

## Problema: Canales no cargan en producción (`https://services-t.hvjqlb.easypanel.host/`)

## Diagnóstico Rápido

### 1. Ejecutar script de diagnóstico
```bash
node src/docs/diagnose-tv-prod.js
```

Este script verificará:
- ✅ Variables de entorno críticas
- ✅ Conectividad con M3U_URL
- ✅ Validez del contenido M3U
- ✅ Parseo de canales
- ✅ Test de streams

## 🔧 Soluciones Inmediatas

### Opción A: Configuración de Headers Específicos
Crea un archivo `.env.production` con headers que funcionan en hosting restrictivo:

```bash
# Headers que suelen funcionar en hosting compartido
M3U_REQUEST_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
M3U_REQUEST_REFERER=https://www.google.com
M3U_REQUEST_ACCEPT=text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
M3U_REQUEST_TIMEOUT=30000

# Logs para debugging
LOG_LEVEL=debug
LOG_TO_FILE=true
LOG_FILE_PATH=logs/production.log
```

### Opción B: M3U URLs Alternativas
Prueba estas URLs que suelen funcionar mejor en hosting:

```bash
# Opción 1: URL directa sin redirecciones
M3U_URL=https://raw.githubusercontent.com/HelmerLuzS/TDTChannels/master/TDTChannels.m3u

# Opción 2: URL con CORS habilitado
M3U_URL=https://iptv-org.github.io/iptv/index.m3u

# Opción 3: URL de GitHub (más confiable)
M3U_URL=https://raw.githubusercontent.com/iptv-org/iptv/master/streams/es.m3u
```

### Opción C: Implementar Caché Persistente

Crea `src/infrastructure/repositories/PersistentM3UTvRepository.js`:

```javascript
import { promises as fs } from 'fs';
import { join } from 'path';
import { M3UTvRepository } from './M3UTvRepository.js';

export class PersistentM3UTvRepository extends M3UTvRepository {
  constructor(m3uUrl, config, logger) {
    super(m3uUrl, config, logger);
    this.cacheFile = join(process.cwd(), 'data', 'm3u-cache.json');
    this.cacheTtl = config.repository?.m3uCacheTimeout || 3600000; // 1h
  }

  async #loadFromCache() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      const parsed = JSON.parse(data);
      
      if (Date.now() - parsed.timestamp < this.cacheTtl) {
        this.logger.info('Loaded M3U from persistent cache');
        return parsed.channels;
      }
    } catch (error) {
      this.logger.debug('No valid cache found');
    }
    return null;
  }

  async #saveToCache(channels) {
    try {
      await fs.mkdir(join(process.cwd(), 'data'), { recursive: true });
      await fs.writeFile(
        this.cacheFile, 
        JSON.stringify({ channels, timestamp: Date.now() })
      );
      this.logger.info('Saved M3U to persistent cache');
    } catch (error) {
      this.logger.error('Failed to save cache:', error.message);
    }
  }

  async #loadTvsFromSource() {
    // Intentar caché primero
    const cached = await this.#loadFromCache();
    if (cached) {
      this.tvs = cached;
      this.lastFetch = Date.now();
      return;
    }

    // Si no hay caché, cargar normal
    try {
      await super.#loadTvsFromSource();
      // Guardar en caché persistente
      await this.#saveToCache(this.tvs);
    } catch (error) {
      // Si falla la carga remota, intentar caché aunque esté expirado
      this.logger.warn('Remote load failed, trying expired cache');
      const expired = await this.#loadFromCache();
      if (expired) {
        this.tvs = expired;
        this.logger.info('Using expired cache as fallback');
      } else {
        throw error;
      }
    }
  }
}
```

## 🐛 Debugging en Producción

### 1. Habilitar Logs Detallados
```bash
# En tu panel de hosting, agrega estas variables:
LOG_LEVEL=debug
LOG_TO_FILE=true
LOG_FILE_PATH=logs/tv-debug.log

# Para ver logs en tiempo real (si tienes SSH):
tail -f logs/tv-debug.log
```

### 2. Verificar Restricciones del Hosting

**Contacta a tu proveedor y pregunta por:**
- ✅ Salidas HTTP permitidas
- ✅ Dominios bloqueados
- ✅ Límites de timeout
- ✅ Capacidad de escritura en disco
- ✅ Memoria disponible para Node.js

### 3. Test de Conectividad Manual
```bash
# Si tienes acceso SSH, prueba:
curl -I "https://www.tdtchannels.com/lists/tv.m3u"

# Con headers específicos:
curl -H "User-Agent: Mozilla/5.0" \
     -H "Referer: https://www.google.com" \
     "https://www.tdtchannels.com/lists/tv.m3u" | head -10
```

## 🚀 Solución Definitiva: Proxy Local

Si tu hosting bloquea URLs externas, implementa un proxy local:

### Paso 1: Crear endpoint proxy
```javascript
// src/application/routes/proxy.js
import { promises as fs } from 'fs';

export async function createProxyRoutes(router) {
  // Endpoint para servir M3U local
  router.get('/m3u/local', async (req, res) => {
    try {
      const m3uPath = join(process.cwd(), 'data', 'channels.m3u');
      const content = await fs.readFile(m3uPath, 'utf8');
      
      res.setHeader('Content-Type', 'application/x-mpegURL');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(content);
    } catch (error) {
      res.status(404).json({ error: 'M3U file not found' });
    }
  });

  // Endpoint para actualizar M3U
  router.post('/m3u/update', async (req, res) => {
    try {
      const response = await fetch(process.env.M3U_URL);
      const content = await response.text();
      
      await fs.mkdir(join(process.cwd(), 'data'), { recursive: true });
      await fs.writeFile(join(process.cwd(), 'data', 'channels.m3u'), content);
      
      res.json({ success: true, size: content.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
```

### Paso 2: Usar M3U local en producción
```bash
# .env.production
M3U_URL=http://localhost:PORT/m3u/local  # Puerto de tu app
```

### Paso 3: Actualización periódica
```bash
# Actualizar M3U manualmente
curl -X POST https://services-t.hvjqlb.easypanel.host/m3u/update
```

## 📋 Checklist de Solución

1. **Ejecuta el diagnóstico**:
   ```bash
   node src/docs/diagnose-tv-prod.js
   ```

2. **Prueba configuración alternativa**:
   ```bash
   # Copiar configuración de producción
   cp .env.production .env
   
   # Reiniciar aplicación
   npm restart  # o como reinicies en tu hosting
   ```

3. **Verifica logs**:
   ```bash
   # Busca errores específicos
grep -i "error\|warn\|m3u" logs/production.log
   ```

4. **Contacta soporte del hosting**:
   - Menciona que necesitas salidas HTTPS a dominios externos
   - Pregunta por timeout máximo permitido
   - Solicita aumento de memoria si es necesario

5. **Implementa solución definitiva**:
   - Si funciona con URL alternativa → usa esa
   - Si es problema de headers → configura headers específicos
   - Si bloquean URLs externas → implementa proxy local
   - Si timeout es muy corto → implementa caché persistente

## 🎯 Solución Rápida para Easypanel.io

Basado en problemas comunes con Easypanel:

```bash
# 1. Usa esta configuración específica para Easypanel
M3U_URL=https://raw.githubusercontent.com/iptv-org/iptv/master/streams/es.m3u
M3U_REQUEST_USER_AGENT=curl/7.68.0
M3U_REQUEST_TIMEOUT=45000
M3U_REQUEST_REFERER=
M3U_MAX_CHANNELS=500  # Límite bajo para hosting compartido

# 2. Logs para debugging
LOG_LEVEL=info
LOG_TO_FILE=true

# 3. Cache más agresivo
CACHE_TTL=7200000  # 2 horas
```

**¿Aún no funciona?** Contacta a Easypanel soporte y menciona:
> "Necesito que mi aplicación Node.js pueda hacer peticiones HTTPS a raw.githubusercontent.com para cargar listas de canales IPTV. ¿Podéis habilitar esto o hay restricciones?"

## 📞 Siguientes Pasos

1. **Ejecuta el diagnóstico** y envíame los resultados
2. **Prueba la configuración de Easypanel** arriba
3. **Si falla**, implementamos el proxy local
4. **Contacta soporte** con la información específica

¿Qué resultados obtienes al ejecutar el script de diagnóstico?