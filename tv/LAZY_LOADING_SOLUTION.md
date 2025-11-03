# Solución de Carga Perezosa (Lazy Loading) para Variables de Entorno

## Problema Identificado

El sistema tenía un problema de **carga automática de variables de entorno** que ocurría al importar cualquier módulo de la librería, incluso cuando se quería usar una configuración personalizada sin depender del archivo `.env`.

### Causa Raíz

La carga automática se producía por:

1. **Inicialización directa de constantes** en los módulos de configuración:
   - `banned-channels.js`: Las constantes `BANNED_CHANNELS`, `BANNED_URLS`, `BANNED_DOMAINS`, `CUSTOM_BANNED_TERMS`, y `BANNED_PATTERNS` se inicializaban directamente al importar el módulo
   - `allowed-channels.js`: La constante `ALLOWED_CHANNELS` se inicializaba directamente al importar el módulo

2. **Cadena de importaciones** que provocaba la ejecución automática:
   ```
   index.js → TVChannelProcessor.js → ConfigurationManager.js → ChannelRepositoryFactory.js → CSVChannelRepository.js → banned-channels.js
   ```

3. **Llamadas automáticas a `EnvLoader.getInstance()`** dentro de las funciones de carga que se ejecutaban al inicializar las constantes.

## Solución Implementada

### 1. Patrón de Carga Perezosa (Lazy Loading)

Se implementó un patrón de carga perezosa que retrasa la inicialización de las variables hasta que realmente se necesiten:

#### En `banned-channels.js`:

```javascript
// ANTES (carga automática):
const BANNED_CHANNELS = loadBannedChannelsFromEnv();
const BANNED_URLS = parseEnvArray(process.env.BANNED_URLS);
// ... etc

// DESPUÉS (carga perezosa):
let BANNED_CHANNELS = null;
let BANNED_URLS = null;
// ... etc

function getBannedChannelsLazy() {
  if (BANNED_CHANNELS === null) {
    BANNED_CHANNELS = loadBannedChannelsFromEnv();
  }
  return BANNED_CHANNELS;
}

function getBannedURLsLazy() {
  if (BANNED_URLS === null) {
    BANNED_URLS = parseEnvArray(process.env.BANNED_URLS);
  }
  return BANNED_URLS;
}
// ... funciones similares para cada constante
```

#### En `allowed-channels.js`:

```javascript
// ANTES (carga automática):
const ALLOWED_CHANNELS = loadAllowedChannelsFromEnv();

// DESPUÉS (carga perezosa):
let ALLOWED_CHANNELS = null;

function getAllowedChannelsLazy() {
  if (ALLOWED_CHANNELS === null) {
    ALLOWED_CHANNELS = loadAllowedChannelsFromEnv();
  }
  return ALLOWED_CHANNELS;
}
```

### 2. Carga Condicional de Variables de Entorno

Se modificaron las funciones de carga para que solo ejecuten `EnvLoader.getInstance()` cuando sea estrictamente necesario:

```javascript
function loadBannedChannelsFromEnv() {
  // Solo cargar variables de entorno si no están ya disponibles
  if (typeof process.env.BANNED_CHANNELS === 'undefined' && 
      typeof process.env.CHANNELS_SOURCE === 'undefined' && 
      typeof process.env.M3U_URL === 'undefined') {
    try {
      EnvLoader.getInstance();
    } catch (error) {
      console.warn('[BANNED_CHANNELS] No se pudieron cargar variables de entorno:', error.message);
    }
  }
  // ... resto de la lógica
}
```

### 3. Actualización de Referencias

Se actualizaron todas las funciones que usaban las constantes directamente para usar las versiones lazy:

```javascript
// ANTES:
const exactMatch = BANNED_CHANNELS.some(bannedTerm => {
  // lógica...
});

// DESPUÉS:
const exactMatch = getBannedChannelsLazy().some(bannedTerm => {
  // lógica...
});
```

### 4. Compatibilidad de Exportaciones

Se mantuvieron las exportaciones originales usando alias para preservar la compatibilidad:

```javascript
export {
  getAllowedChannelsLazy as ALLOWED_CHANNELS,
  // ... otras exportaciones
};
```

## Beneficios de la Solución

1. **Eliminación de carga automática**: Ya no se cargan variables de entorno al importar los módulos
2. **Configuración personalizada**: Permite usar configuraciones completamente independientes del archivo `.env`
3. **Compatibilidad hacia atrás**: Las APIs existentes siguen funcionando sin cambios
4. **Rendimiento mejorado**: Solo se cargan las configuraciones cuando realmente se necesitan
5. **Flexibilidad**: Permite diferentes estrategias de configuración según el contexto de uso

## Verificación

La solución se verificó ejecutando el script `test-custom-config.js`, que ahora:

- ✅ No muestra logs de `dotenv`
- ✅ No muestra logs de `EnvLoader`
- ✅ Permite configuración personalizada completa
- ✅ Mantiene toda la funcionalidad existente

## Archivos Modificados

1. `src/config/banned-channels.js` - Implementación de carga perezosa para todas las constantes
2. `src/config/allowed-channels.js` - Implementación de carga perezosa para ALLOWED_CHANNELS

## Patrón Recomendado

Para futuras implementaciones, se recomienda seguir este patrón:

1. **Nunca inicializar constantes directamente** con funciones que puedan tener efectos secundarios
2. **Usar variables `let` inicializadas en `null`** para datos que requieren carga
3. **Implementar funciones lazy** que verifiquen si los datos ya están cargados
4. **Actualizar todas las referencias** para usar las versiones lazy
5. **Mantener compatibilidad** mediante alias en las exportaciones

Este patrón asegura que los módulos sean verdaderamente modulares y no tengan efectos secundarios no deseados al ser importados.