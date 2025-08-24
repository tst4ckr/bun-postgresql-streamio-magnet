# Funcionalidad REMOVE_INVALID_STREAMS

## Descripción General

La funcionalidad `REMOVE_INVALID_STREAMS` permite la desactivación automática de canales con streams inválidos durante el proceso de validación periódica. Esta característica mejora la calidad del servicio al filtrar automáticamente contenido no funcional.

## Configuración

### Variable de Entorno
```bash
REMOVE_INVALID_STREAMS=true
```

### Configuración en TVAddonConfig.js
```javascript
validation: {
  removeInvalidStreams: process.env.REMOVE_INVALID_STREAMS === 'true',
  validateStreamsIntervalHours: parseInt(process.env.VALIDATE_STREAMS_INTERVAL_HOURS) || 24
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

#### 3. Integración en Validación Periódica

**Ubicación**: `src/index.js` - método `#scheduleMaintenanceTasks`

```javascript
if (validation.validateStreamsIntervalHours > 0) {
  setInterval(async () => {
    let report;
    
    if (validation.validateAllChannels) {
      // Validar todos los canales en lotes (incluye desactivados)
      const getChannelsFunction = (offset, limit) => 
        this.#channelRepository.getChannelsPaginatedUnfiltered ?
          this.#channelRepository.getChannelsPaginatedUnfiltered(offset, limit) :
          this.#channelRepository.getChannelsPaginated(offset, limit);
      
      report = await this.#healthService.validateAllChannelsBatched(
        getChannelsFunction,
        {
          batchSize: validation.validationBatchSize,
          concurrency: validation.maxValidationConcurrency,
          showProgress: true
        }
      );
    } else {
      // Validar muestra de la lista completa original (incluye desactivados)
      const sample = this.#channelRepository.getChannelsPaginatedUnfiltered ? 
        await this.#channelRepository.getChannelsPaginatedUnfiltered(0, 30) :
        await this.#channelRepository.getChannelsPaginated(0, 30);
      report = await this.#healthService.checkChannels(sample, 10, false);
    }
    
    // Procesar resultados automáticamente
    if (report.results) {
      await this.#invalidChannelService.processValidationResults(report.results);
    }
  }, intervalMs);
}
```

## Flujo de Funcionamiento

### 1. Validación Periódica
1. El sistema ejecuta validación cada `validateStreamsIntervalHours`
2. Se obtiene una muestra de canales (30 por defecto)
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

# Intervalo de validación (horas)
VALIDATE_STREAMS_INTERVAL_HOURS=24

# Configuración de validación de streams
STREAM_VALIDATION_TIMEOUT=10000
STREAM_VALIDATION_MAX_RETRIES=3
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