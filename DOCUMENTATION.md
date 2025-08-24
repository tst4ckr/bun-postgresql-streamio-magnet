# 📺 TV IPTV Addon para Stremio - Documentación Técnica

## 📋 Índice

1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Flujo de Datos](#flujo-de-datos)
4. [Componentes Principales](#componentes-principales)
5. [Configuración](#configuración)
6. [Manejo de Errores](#manejo-de-errores)
7. [Seguridad](#seguridad)
8. [Despliegue](#despliegue)

## 🎯 Visión General

El **TV IPTV Addon** es una extensión para Stremio que proporciona acceso a canales de televisión en vivo desde fuentes IPTV (archivos M3U/M3U8 y CSV). Está diseñado siguiendo principios de Clean Architecture y Domain-Driven Design (DDD) para mantener una base de código escalable y mantenible.

### Características Principales
- ✅ Soporte para múltiples fuentes de datos (CSV, M3U local/remoto)
- ✅ Validación automática de streams
- ✅ Filtrado por país, idioma y género
- ✅ Cache optimizado para rendimiento
- ✅ Manejo robusto de errores
- ✅ Configuración centralizada via variables de entorno

## 🏗️ Arquitectura del Sistema

### Patrones de Diseño Implementados

```
┌─────────────────────────────────────────────┐
│              Capa de Presentación            │
│            (Handlers de Stremio)            │
├─────────────────────────────────────────────┤
│              Capa de Aplicación            │
│         (Servicios y Casos de Uso)         │
├─────────────────────────────────────────────┤
│              Capa de Dominio                 │
│        (Entidades y Value Objects)         │
├─────────────────────────────────────────────┤
│            Capa de Infraestructura          │
│   (Repositorios, Parsers, Configuración)    │
└─────────────────────────────────────────────┘
```

### Principios SOLID Aplicados
- **S**ingle Responsibility: Cada clase tiene una única responsabilidad
- **O**pen/Closed: Extensible sin modificar código existente
- **L**iskov Substitution: Interfaces bien definidas
- **I**nterface Segregation: Interfaces específicas y cohesivas
- **D**ependency Inversion: Dependencias en abstracciones, no concreciones

## 🔄 Flujo de Datos

### 1. Inicialización del Addon
```
index.js → TVAddonConfig → ChannelRepositoryFactory → Repositorio Activo
```

### 2. Petición de Catálogo
```
Stremio Client → Catalog Handler → ChannelService → Repositorio → Canales → Meta Preview
```

### 3. Petición de Stream
```
Stremio Client → Stream Handler → ChannelService → Stream Validation → Respuesta Stream
```

## 🧩 Componentes Principales

### 1. Entidades del Dominio (`/src/domain/`)

#### Channel Entity (`Channel.js`)
Representa un canal de televisión con:
- Identidad única (`tv_nombre-canal`)
- Propiedades inmutables (nombre, URL, país, idioma)
- Value Objects para calidad y tipo
- Métodos de conversión para Stremio

```javascript
const canal = new Channel({
  id: 'tv_televisa',
  name: 'Televisa',
  streamUrl: 'https://example.com/stream.m3u8',
  genre: 'Entertainment',
  country: 'México',
  language: 'es'
});
```

#### StreamQuality Value Object (`StreamQuality.js`)
- Encapsula la lógica de calidad de stream
- Valores válidos: Auto, SD, HD, Full HD, 4K
- Detección automática desde URLs
- Comparación y normalización

### 2. Repositorios (`/src/infrastructure/repositories/`)

#### ChannelRepository (Interfaz Abstracta)
Define el contrato para todas las implementaciones:
- `getAllChannels()` - Obtener todos los canales
- `getChannelById(id)` - Buscar por ID
- `searchChannels(term)` - Búsqueda por nombre
- `getChannelsByGenre/country/language()` - Filtrado

#### CSVChannelRepository
- Lee canales desde archivos CSV locales
- Cache con refresco automático
- Validación de filas CSV
- Filtros de configuración aplicados

#### RemoteM3UChannelRepository
- Descarga y parsea listas M3U remotas
- Manejo de errores y failover
- Actualización periódica
- Soporte para URLs de respaldo

### 3. Parsers (`/src/infrastructure/parsers/`)

#### M3UParserService
- Parsea archivos M3U/M3U8 con validación robusta
- Extrae metadatos (logo, grupo, país)
- Detección automática de calidad
- Normalización de géneros y países

### 4. Handlers de Stremio (`/src/application/handlers/`)

#### StreamHandler
Convierte canales al formato requerido por Stremio:
- Genera nombres descriptivos con calidad
- Añade behavior hints para streams especiales
- Maneja configuración de usuario

### 5. Servicios de Soporte

#### StreamHealthService
- Verifica disponibilidad de streams
- Validación no intrusiva (HEAD requests)
- Reportes de salud por lotes
- Timeout configurable

#### SecurityMiddleware
- Configura CORS para dominios de Stremio
- Rate limiting para protección DDoS
- Headers de seguridad con Helmet

#### ErrorHandler
- Manejo centralizado de errores
- Logging estructurado
- Respuestas seguras para Stremio
- Graceful shutdown

## ⚙️ Configuración

### Variables de Entorno Principales

```bash
# Fuente de datos
CHANNELS_SOURCE=remote_m3u          # csv, m3u, remote_m3u, hybrid
M3U_URL=https://iptv-org.github.io/iptv/countries/es.m3u
BACKUP_M3U_URL=https://iptv-org.github.io/iptv/countries/mx.m3u

# Filtros
ALLOWED_COUNTRIES=MX,ES,AR,CO,US
BLOCKED_COUNTRIES=
ENABLE_ADULT_CHANNELS=false

# Cache (segundos)
STREAM_CACHE_MAX_AGE=300
CATALOG_CACHE_MAX_AGE=1800

# Validación
VALIDATE_STREAMS_ON_STARTUP=true
VALIDATE_STREAMS_INTERVAL_HOURS=6
```

### Configuración por Usuario
El addon soporta configuración personalizada:
- URL M3U personalizada
- Calidad preferida (HD/SD/Auto)
- Idioma preferido

## 🔐 Seguridad

### Medidas Implementadas
- **CORS**: Solo permite dominios de Stremio y localhost
- **Rate Limiting**: 100 requests/minuto por IP
- **Helmet**: Headers de seguridad HTTP
- **Input Validation**: Validación de todas las entradas
- **Error Masking**: No expone detalles internos

### Ejemplo de Configuración CORS
```javascript
const allowedOrigins = [
  'https://app.strem.io',
  'https://web.strem.io',
  'http://localhost:3000'
];
```

## 🚨 Manejo de Errores

### Jerarquía de Errores
```
AddonError (base)
├── ConfigurationError
├── StreamError
├── ValidationError
└── RepositoryError
    ├── ChannelNotFoundError
    └── RepositoryValidationError
```

### Respuestas de Error para Stremio
- Catálogo vacío en lugar de errores 500
- Cache corto para errores (60s)
- Logging detallado en servidor

## 🚀 Despliegue

### Desarrollo Local
```bash
# Instalar dependencias
bun install

# Configurar variables de entorno
cp config.env.example .env
# Editar .env con tu configuración

# Ejecutar en desarrollo
bun run dev
```

### Producción
```bash
# Build optimizado
bun run build

# Ejecutar con PM2
pm2 start src/index.js --name tv-iptv-addon
```

### Docker
```bash
# Construir imagen
docker build -t tv-iptv-addon .

# Ejecutar
docker run -p 7000:7000 --env-file .env tv-iptv-addon
```

## 📊 Monitoreo y Debugging

### Logs
- Niveles: debug, info, warn, error
- Estructura: timestamp, nivel, mensaje, metadata
- Archivo: `logs/addon.log`

### Métricas
- Contador de canales por fuente
- Tasa de éxito de validación
- Tiempo de respuesta de handlers
- Errores por tipo

### Endpoints de Debug
- `GET /manifest.json` - Información del addon
- Logs incluyen URLs de instalación

## 🔧 Solución de Problemas

### Problemas Comunes

1. **No aparecen canales**
   - Verificar `CHANNELS_SOURCE` y URLs
   - Revisar logs de inicialización
   - Validar formato de archivo CSV/M3U

2. **Streams no funcionan**
   - Ejecutar validación manual
   - Verificar URLs en navegador
   - Revisar configuración de CORS

3. **Error de CORS**
   - Verificar `CORS_ORIGIN` en configuración
   - Asegurar HTTPS en producción

4. **Error: directory to serve does not exist**
   - El directorio `static/` debe existir para servir archivos estáticos
   - Solución: Crear directorio `static/` con archivo `.gitkeep`
   - El sistema ahora detecta automáticamente si el directorio existe

5. **Alto uso de memoria**
   - Ajustar `CACHE_CHANNELS_HOURS`
   - Limitar `MAX_CONCURRENT_STREAMS`
   - Revisar fuga de memoria en validaciones

### Comandos de Debug
```bash
# Validar configuración
bun run validate-config

# Verificar streams manualmente
bun run validate-channels

# Logs detallados
LOG_LEVEL=debug bun run dev
```

## 🔄 Flujo de Actualización de Datos

1. **Auto-actualización**: Repositorios remotos se actualizan cada `UPDATE_INTERVAL_HOURS`
2. **Validación periódica**: Streams se validan cada `VALIDATE_STREAMS_INTERVAL_HOURS`
3. **Cache refresh**: Datos se recargan según `CACHE_CHANNELS_HOURS`
4. **Failover automático**: Si falla M3U principal, usa backup

## 📋 Checklist de Despliegue

- [ ] Variables de entorno configuradas
- [ ] URLs de M3U válidas y accesibles
- [ ] Puerto disponible (por defecto 7000)
- [ ] HTTPS configurado en producción
- [ ] Logs configurados
- [ ] Monitoreo activado
- [ ] Rate limiting apropiado
- [ ] CORS configurado correctamente

## 📞 Soporte

Para reportar problemas o solicitar features:
1. Verificar logs en `logs/addon.log`
2. Revisar configuración en `.env`
3. Ejecutar validación manual
4. Consultar documentación de troubleshooting

---

*Documentación generada automáticamente basada en el código fuente del TV IPTV Addon*