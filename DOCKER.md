# 🐳 Guía de Docker para Stremio Magnet Addon

## 🚀 Build y Ejecución Rápida

### Usando npm scripts (Recomendado)
```bash
# Build de la imagen Docker
bun run docker:build

# Ejecutar el contenedor
bun run docker:run
```

### Comandos manuales
```bash
# 1. Actualizar dependencias
bun install

# 2. Build de la imagen
docker build -t stremio-magnet-addon .

# 3. Ejecutar el contenedor
docker run -p 7000:7000 stremio-magnet-addon
```

## 🔧 Solución de Problemas

### Error: "lockfile had changes, but lockfile is frozen"

**Causa:** El lockfile de Bun ha cambiado pero Docker intenta usar `--frozen-lockfile`.

**Solución:**
1. Ejecuta `bun install` localmente para actualizar el lockfile
2. El Dockerfile ya está configurado para manejar esto automáticamente
3. Si persiste el error, elimina `bun.lock` y ejecuta `bun install` nuevamente

### Error: "COPY failed: file not found"

**Causa:** Archivos faltantes o rutas incorrectas.

**Solución:**
1. Verifica que `package.json` y `bun.lock` existan en el directorio raíz
2. Ejecuta `bun install` para generar el lockfile si no existe

### Error de permisos en scripts

**En Linux/macOS:**
```bash
chmod +x scripts/docker-build.sh
./scripts/docker-build.sh
```

**En Windows:**
```powershell
.\scripts\docker-build.ps1
```

## 📦 Configuración del Contenedor

### Variables de Entorno

```bash
# Ejecutar con variables personalizadas
docker run -p 7000:7000 \
  -e NODE_ENV=production \
  -e PORT=7000 \
  -e LOG_LEVEL=info \
  stremio-magnet-addon
```

### Volúmenes para Datos Persistentes

```bash
# Montar directorio de datos
docker run -p 7000:7000 \
  -v $(pwd)/data:/app/data \
  stremio-magnet-addon
```

## 🏗️ Arquitectura del Build

1. **Base Image:** `oven/bun:1` - Imagen oficial de Bun
2. **Dependencias:** Se instalan primero para aprovechar la caché de Docker
3. **Código:** Se copia después para optimizar rebuilds
4. **Puerto:** Expone el puerto 7000 por defecto
5. **Comando:** Ejecuta `bun run start:prod` en producción

## 🔍 Verificación

Una vez ejecutando, verifica que el addon funcione:

```bash
# Verificar el manifest
curl http://localhost:7000/manifest.json

# Verificar salud del servicio
curl http://localhost:7000/health
```

## 📝 Logs

```bash
# Ver logs del contenedor
docker logs <container_id>

# Seguir logs en tiempo real
docker logs -f <container_id>
```

## 🛠️ Desarrollo

Para desarrollo, es recomendable usar el servidor local:

```bash
# Desarrollo con hot reload
bun run dev

# Producción local
bun run start:prod
```

Docker se recomienda principalmente para despliegue en producción.