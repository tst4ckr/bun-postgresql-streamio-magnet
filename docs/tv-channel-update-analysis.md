# Análisis de la Lógica de Actualización y Renombrado de Canales de TV

## Problema Identificado: "sundefinedeundefined"

### Descripción del Problema
Los canales de TV se están renombrando como "sundefinedeundefined", lo que sugiere que hay un template string que está intentando usar variables `season` y `episode` que no están definidas en el contexto de canales de TV.

### Importante: Separación de Proyectos
- `tv/` es un proyecto separado que investiga canales de TV y genera datos en `data/tvs`
- El código en `src/` solo lee y procesa esos datos, NO los genera
- El problema probablemente está en el proyecto `tv/` que genera los archivos CSV/M3U en `data/tvs`

### Análisis de la Lógica de Actualización

#### 1. Flujo de Carga de Canales

**Repositorios de TV:**
- `CsvTvRepository`: Carga canales desde archivos CSV locales
- `RemoteCsvTvRepository`: Carga canales desde URLs CSV remotas
- `M3UTvRepository`: Carga canales desde archivos M3U (locales o remotos)
- `DynamicTvRepository`: Repositorio dinámico que combina múltiples fuentes según la IP del cliente

**Ubicación del código:**
- `src/infrastructure/repositories/CsvTvRepository.js`
- `src/infrastructure/repositories/M3UTvRepository.js`
- `src/infrastructure/repositories/DynamicTvRepository.js`

#### 2. Proceso de Actualización

**Hot-Reload (Recarga en Caliente):**
- Implementado en `src/index.js` método `#setupTvHotReload()`
- Para archivos CSV locales: usa `fs.watch` con debounce de 2 segundos
- Para URLs remotas: usa intervalos configurables que fuerzan recarga periódica
- Cuando detecta cambios, reconstruye el `DynamicTvRepository` y el `TvHandler`

**Refresh Manual:**
- `M3UTvRepository.refreshTvs()`: Fuerza recarga desde la fuente M3U
- Limpia el cache y vuelve a cargar todos los canales

#### 3. Construcción de Nombres de Canales

**Entidad Tv (`src/domain/entities/Tv.js`):**
- El nombre del canal se establece en el constructor desde `tvData.name`
- No se modifica el nombre después de la creación (entidad inmutable)
- `toStremioMeta()` usa `this.#name` directamente sin modificaciones
- `toStremioStream()` usa `this.#name` directamente

**Parser M3U (`src/infrastructure/utils/M3UParser.js`):**
- Extrae el nombre desde la línea EXTINF después de la última coma
- Si no hay nombre, usa `tvg-name` como fallback
- El nombre se pasa directamente al constructor de `Tv`

**Repositorio CSV (`src/infrastructure/repositories/CsvTvRepository.js`):**
- Lee el nombre directamente desde la columna `name` del CSV
- No aplica transformaciones al nombre

#### 4. Análisis del Código de TV en `src/`

**Revisión completa realizada:**
- `Tv.js`: El nombre se toma directamente de `tvData.name` sin modificaciones
- `TvHandler.js`: No modifica nombres, solo los usa para filtrar y mostrar
- `CsvTvRepository.js`: Lee el nombre directamente de `data.name` del CSV
- `M3UParser.js`: Extrae el nombre directamente de la línea EXTINF
- `M3UTvRepository.js`: Usa el parser sin modificaciones adicionales

**Conclusión:** El código en `src/` NO modifica los nombres de los canales. Los nombres se toman directamente de los datos fuente.

#### 5. Posible Causa del Problema

El problema "sundefinedeundefined" probablemente viene de:

1. **Proyecto `tv/` que genera los datos:**
   - El proyecto `tv/` genera los archivos CSV/M3U en `data/tvs`
   - Si hay un template string en `tv/` que usa `s${season}e${episode}` con variables no definidas
   - El resultado se guarda en los archivos CSV/M3U
   - El código en `src/` solo lee esos datos tal cual están

2. **Datos fuente corruptos:**
   - Los archivos CSV/M3U en `data/tvs` ya contienen nombres con "sundefinedeundefined"
   - El código en `src/` los lee y los usa sin modificaciones
   - El problema está en la generación de datos, no en el procesamiento

3. **Recomendación:**
   - Investigar el código en `tv/` que genera los archivos CSV/M3U
   - Buscar template strings con `s${season}e${episode}` en el proyecto `tv/`
   - Verificar servicios de limpieza/deduplicación en `tv/` que puedan modificar nombres

### Lógica de Actualización de Canales

#### Flujo Completo:

1. **Inicialización:**
   ```
   MagnetAddon.initialize()
   → #setupHandlers()
   → Crea repositorios (CSV/M3U)
   → Crea TvHandler con repositorio
   → Configura hot-reload
   ```

2. **Hot-Reload (Archivos Locales):**
   ```
   fs.watch detecta cambio
   → Debounce (2 segundos)
   → Reconstruye repositorio CSV
   → Reconstruye DynamicTvRepository
   → Reconstruye TvHandler
   ```

3. **Hot-Reload (URLs Remotas):**
   ```
   Intervalo periódico (configurable)
   → Descarga CSV/M3U remoto
   → Reconstruye repositorio
   → Reconstruye DynamicTvRepository
   → Reconstruye TvHandler
   ```

4. **Procesamiento de Canales:**
   ```
   Repositorio carga datos (CSV/M3U)
   → Parser extrae información
   → Crea instancias de Tv
   → TvHandler procesa solicitudes
   → toStremioMeta() genera metadatos
   ```

### Coherencia en el Proyecto

#### Arquitectura:
- **Separación de responsabilidades:** Repositorios, Handlers, Entidades
- **Inmutabilidad:** Las entidades Tv son inmutables después de la creación
- **Cache:** Los repositorios implementan cache para evitar recargas innecesarias
- **Hot-Reload:** Sistema robusto para actualizar canales sin reiniciar el servidor

#### Flujo de Datos:
1. Fuente (CSV/M3U) → Repositorio → Entidad Tv → Handler → Stremio

#### Validaciones:
- Los nombres de canales se validan en el constructor de `Tv`
- Los datos se validan al parsear M3U/CSV
- Los errores se manejan con `ErrorHandler` y `safeExecute`

### Solución Implementada

Se ha agregado validación y sanitización en el código de TV para:

1. **Detectar nombres inválidos:**
   - `Tv.js`: Método `#sanitizeChannelName()` que detecta y elimina patrones "undefined"
   - `CsvTvRepository.js`: Logging cuando se detectan nombres sospechosos
   - `M3UParser.js`: Logging cuando se detectan nombres sospechosos

2. **Sanitizar nombres:**
   - Elimina patrones como "sundefinedeundefined"
   - Elimina cualquier ocurrencia de "undefined" en nombres
   - Usa "Canal sin nombre" como fallback si el nombre queda vacío después de la limpieza

3. **Logging:**
   - Registra advertencias cuando se detectan nombres sospechosos
   - Incluye información del contexto (ruta CSV, línea M3U) para facilitar el debugging

### Recomendaciones para Resolver el Problema en el Origen

1. **Investigar el proyecto `tv/`:**
   - Buscar template strings con `s${season}e${episode}` en `tv/`
   - Revisar servicios de limpieza/deduplicación en `tv/src/domain/services/`
   - Verificar cualquier lugar donde se generen o modifiquen nombres de canales

2. **Verificar datos fuente:**
   - Revisar los archivos en `data/tvs/` para ver si contienen nombres con "sundefinedeundefined"
   - Verificar si el problema está en la generación de datos por `tv/`

3. **Prevenir en el origen:**
   - Corregir el código en `tv/` que genera los nombres incorrectos
   - Asegurar que las variables `season` y `episode` no se usen en contexto de TV

### Archivos Clave para Investigar

1. `src/domain/entities/Tv.js` - Entidad principal
2. `src/application/handlers/TvHandler.js` - Handler de TV
3. `src/infrastructure/repositories/*TvRepository.js` - Repositorios
4. `src/infrastructure/utils/M3UParser.js` - Parser M3U
5. `tv/src/domain/services/ChannelNameCleaningService.js` - Servicio de limpieza (directorio tv/)
6. `tv/src/domain/services/ChannelDeduplicationService.js` - Servicio de deduplicación (directorio tv/)

### Conclusión

**Análisis del código en `src/`:**
- El código de TV en `src/` es limpio y no modifica nombres
- Los nombres se toman directamente de los datos fuente (CSV/M3U)
- La lógica de actualización es robusta con hot-reload

**Origen del problema:**
- El problema "sundefinedeundefined" probablemente viene del proyecto `tv/` que genera los datos
- Los archivos CSV/M3U en `data/tvs` ya contienen nombres con este patrón
- El código en `src/` solo lee esos datos tal cual están

**Solución implementada:**
- Se agregó sanitización en `Tv.js` para limpiar nombres inválidos
- Se agregó logging en repositorios para detectar nombres sospechosos
- Esto previene que los nombres inválidos se propaguen, pero el problema debe corregirse en el origen (`tv/`)

**Próximos pasos:**
- Investigar el código en `tv/` que genera los archivos CSV/M3U
- Buscar template strings con `s${season}e${episode}` en el proyecto `tv/`
- Corregir la generación de datos en `tv/` para evitar nombres inválidos
