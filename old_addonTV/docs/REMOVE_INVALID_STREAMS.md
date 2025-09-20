# Funcionalidad REMOVE_INVALID_STREAMS

## Descripción General

La funcionalidad `REMOVE_INVALID_STREAMS` permite la desactivación automática de canales con streams inválidos durante el proceso de validación manual. Esta característica mejora la calidad del servicio al filtrar automáticamente contenido no funcional.

**NOTA IMPORTANTE**: La validación periódica automática ha sido removida del sistema por solicitud del usuario. Solo está disponible la validación manual al inicio del sistema.

## Repositorio Híbrido (Nuevo)

### Descripción
El repositorio híbrido combina múltiples fuentes de canales en una sola implementación, priorizando canales locales y agregando canales remotos sin duplicados.

### Configuración
```bash
# Configurar repositorio híbrido
CHANNELS_SOURCE=hybrid
CHANNELS_FILE=data/channels.csv
M3U_URL=https://iptv-org.github.io/iptv/countries/mx.m3u
BACKUP_M3U_URL=https://iptv-org.github.io/iptv/countries/pe.m3u
```

### Características
- **Prioridad de fuentes**: Carga primero canales del CSV local, luego agrega canales de URLs M3U remotas
- **Eliminación de duplicados**: Evita automáticamente canales duplicados basándose en el ID del canal
- **Validación completa**: Permite validar canales de todas las fuentes de forma unificada
- **Failover automático**: Si una fuente M3U falla, continúa con las demás fuentes disponibles
- **Estadísticas detalladas**: Proporciona métricas de cada fuente y duplicados omitidos

### Ventajas
1. **Flexibilidad**: Combina canales curados localmente con listas remotas actualizadas
2. **Calidad**: Los canales del CSV local tienen prioridad sobre los remotos
3. **Escalabilidad**: Puede agregar múltiples fuentes M3U sin conflictos
4. **Mantenimiento**: Facilita la gestión de canales desde múltiples fuentes
5. **Validación integral**: Valida todos los canales independientemente de su fuente

## Configuración

### Variable de Entorno
```bash
REMOVE_INVALID_STREAMS=true
```

### Configuración en TVAddonConfig.js
```javascript
validation: {
  removeInvalidStreams: process.env.REMOVE_INVALID_STREAMS === 'true',
  validateStreamsOnStartup: process.env.VALIDATE_STREAMS_ON_STARTUP === 'true'
  // Nota: validateStreamsIntervalMinutes removido - sin validación periódica
}
```

## Arquitectura de la Implementación

### Componentes Principales

#### 1. InvalidChannelManagementService
**Ubicación**: `src/application/services/InvalidChannelManagementService.js`

**Responsabilidades**:
- Centralizar la lógica de gestión de canales inválidos
- Procesar resultados de validación masiva
- Desactivar canales inválidos de forma controlada
- Marcar canales válidos como verificados
- Emitir eventos de gestión de canales
- Proporcionar estadísticas de procesamiento

**Métodos principales**:
```javascript
// Procesar resultados de validación masiva
async processValidationResults(validationResults)

// Desactivar canal específico
async deactivateChannel(channelId, reason)

// Marcar canal como validado
async markChannelAsValidated(channelId)

// Verificar si está habilitado
isEnabled()

// Obtener estadísticas
async getDeactivationStats()
```

#### 2. Repositorios Actualizados

**CSVChannelRepository** y **RemoteM3UChannelRepository** implementan:

```javascript
// Marcar canal como validado
async markChannelAsValidated(channelId)

// Desactivar canal
async deactivateChannel(channelId, reason)

// Filtrar canales activos (método privado)
#filterActiveChannels(channels)

// Obtener todos los canales sin filtrar (incluye desactivados)
async getAllChannelsUnfiltered()

// Obtener canales paginados sin filtrar (incluye desactivados)
async getChannelsPaginatedUnfiltered(skip, limit)
```

**Nota importante**: Los métodos `getAllChannelsUnfiltered()` y `getChannelsPaginatedUnfiltered()` se utilizan específicamente para validación, ya que permiten acceder a la lista completa original de canales (incluidos los desactivados). Esto asegura que:

- La validación siempre se realiza contra los 199+ canales originales del archivo M3U
- Los canales que se reactiven automáticamente pueden ser incluidos
- Los canales que dejen de funcionar pueden ser excluidos del conteo
- Se mantiene la integridad de la lista original para futuras validaciones

#### 3. Integración en Validación Manual

**NOTA**: La validación periódica automática ha sido removida. La validación solo se ejecuta:
- Al inicio del sistema (si `VALIDATE_STREAMS_ON_STARTUP=true`)
- Manualmente a través de endpoints de la API

```javascript
// Código de validación periódica REMOVIDO
// Solo queda disponible la validación manual y al inicio del sistema
```

## Flujo de Funcionamiento

### 1. Validación Manual
1. La validación se ejecuta solo al inicio del sistema (si está habilitada) o manualmente
2. Se obtiene una muestra de canales o todos los canales según configuración
3. `StreamHealthService` valida cada canal concurrentemente
4. Se generan resultados con estado `ok: true/false`

### 2. Procesamiento de Resultados
1. `InvalidChannelManagementService.processValidationResults()` recibe los resultados
2. Verifica si `removeInvalidStreams` está habilitado
3. Para cada resultado:
   - Si `result.ok === true`: marca como validado
   - Si `result.ok === false`: desactiva el canal
4. Registra estadísticas y emite eventos

### 3. Gestión de Estado en Repositorios
1. **Canales Desactivados**: Se mantienen en `#deactivatedChannels` (Set)
2. **Canales Validados**: Se mantienen en `#validatedChannels` (Set)
3. **Filtrado Automático**: Los métodos de consulta filtran canales desactivados

### 4. Comportamiento de Filtrado

Cuando `REMOVE_INVALID_STREAMS=true`, los canales desactivados se excluyen de:
- `getAllChannels()`
- `getChannelById()` (lanza `ChannelNotFoundError`)
- `getChannelsByCategory()`
- `searchChannels()`
- `getChannelsByGenre()`
- `getChannelsByCountry()`
- `getChannelsByLanguage()`
- `getPaginatedChannels()`
- `getChannelsByFilter()`

## Configuraciones Relacionadas

### Variables de Entorno Relevantes
```bash
# Habilitar desactivación automática
REMOVE_INVALID_STREAMS=true

# Validación al inicio del sistema
VALIDATE_STREAMS_ON_STARTUP=true

# Configuración de validación de streams
STREAM_VALIDATION_TIMEOUT=15000
STREAM_VALIDATION_MAX_RETRIES=2
STREAM_VALIDATION_RETRY_DELAY=2000
VALIDATION_BATCH_SIZE=50
MAX_VALIDATION_CONCURRENCY=5
```

## Eventos Emitidos

El `InvalidChannelManagementService` emite eventos para integración con sistemas de monitoreo:

```javascript
// Canal desactivado
'channel.deactivated' {
  channelId: string,
  reason: string,
  timestamp: string
}

// Canal validado
'channel.validated' {
  channelId: string,
  timestamp: string
}

// Procesamiento completado
'channels.validation.processed' {
  validated: number,
  deactivated: number,
  errors: Array,
  timestamp: string
}
```

## Logging y Monitoreo

### Logs de Información
```
[INFO] Procesamiento de validación completado: 25 validados, 5 desactivados
[INFO] Canal ch_001 desactivado: Connection timeout
```

### Logs de Debug
```
[DEBUG] Canal ch_002 (Canal Ejemplo) marcado como válido
[DEBUG] Desactivación automática de canales inválidos está deshabilitada
```

### Logs de Error
```
[ERROR] Error procesando canal ch_003: Database connection failed
[WARN] 3 errores durante el procesamiento de canales
```

## Pruebas

### Script de Prueba
**Ubicación**: `scripts/test-remove-invalid-streams.js`

```bash
# Ejecutar prueba
node scripts/test-remove-invalid-streams.js

# Mostrar ayuda
node scripts/test-remove-invalid-streams.js --help
```

### Casos de Prueba Cubiertos
1. Inicialización de servicios
2. Validación de muestra de canales
3. Procesamiento automático de resultados
4. Desactivación manual de canales
5. Verificación de filtrado
6. Manejo de errores

## Consideraciones de Rendimiento

### Optimizaciones Implementadas
1. **Procesamiento Concurrente**: Validación paralela con límite de concurrencia
2. **Filtrado en Memoria**: Los canales desactivados se mantienen en Sets para acceso O(1)
3. **Muestreo**: Solo se valida una muestra de canales por ciclo (30 por defecto)
4. **Logging Eficiente**: Logs agrupados para evitar spam

### Impacto en Memoria
- `#deactivatedChannels`: Set con IDs de canales desactivados
- `#validatedChannels`: Set con IDs de canales validados
- Impacto mínimo: ~8 bytes por canal ID

## Migración y Compatibilidad

### Compatibilidad Hacia Atrás
- Si `REMOVE_INVALID_STREAMS=false`, la funcionalidad se desactiva completamente
- Los métodos de repositorio funcionan normalmente sin filtrado
- No hay cambios en la API pública

### Migración de Datos
- No se requiere migración de datos existentes
- Los canales desactivados se mantienen solo en memoria
- Al reiniciar el servicio, todos los canales vuelven a estar activos

## Mejores Prácticas

### Configuración Recomendada
```bash
# Producción
REMOVE_INVALID_STREAMS=true
VALIDATE_STREAMS_INTERVAL_HOURS=6

# Desarrollo
REMOVE_INVALID_STREAMS=false
VALIDATE_STREAMS_INTERVAL_HOURS=1
```

### Monitoreo Recomendado
1. Monitorear eventos de desactivación masiva
2. Alertar si el ratio de canales desactivados supera el 20%
3. Revisar logs de errores durante el procesamiento
4. Monitorear el rendimiento de la validación periódica

## Troubleshooting

### Problemas Comunes

#### Canales No Se Desactivan
**Causa**: `REMOVE_INVALID_STREAMS=false` o no configurado
**Solución**: Verificar variable de entorno y reiniciar servicio

#### Demasiados Canales Desactivados
**Causa**: Problemas de red o configuración de timeout muy baja
**Solución**: Ajustar `STREAM_VALIDATION_TIMEOUT` y revisar conectividad

#### Errores en Procesamiento
**Causa**: Problemas en repositorio o base de datos
**Solución**: Revisar logs de error y conectividad de datos

### Comandos de Diagnóstico
```bash
# Verificar configuración
echo $REMOVE_INVALID_STREAMS

# Ejecutar prueba
node scripts/test-remove-invalid-streams.js

# Revisar logs
tail -f logs/app.log | grep "procesamiento de validación"
```

## Roadmap Futuro

### Mejoras Planificadas
1. **Persistencia**: Guardar estado de canales desactivados en base de datos
2. **Dashboard**: Interfaz web para gestionar canales desactivados
3. **Métricas**: Integración con Prometheus/Grafana
4. **Reactivación Automática**: Intentar reactivar canales después de cierto tiempo
5. **Configuración Granular**: Diferentes criterios de desactivación por categoría

### API Futura
```javascript
// Obtener canales desactivados
GET /api/admin/deactivated-channels

// Reactivar canal
POST /api/admin/channels/{id}/reactivate

// Estadísticas de desactivación
GET /api/admin/deactivation-stats
```