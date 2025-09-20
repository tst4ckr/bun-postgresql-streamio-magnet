# Sistema Inteligente de Filtrado de Canales

## Descripción

Este módulo implementa un sistema avanzado de filtrado de canales basado en similitud de 90% y detección inteligente de patrones, inspirado en el `ChannelDeduplicationService`. Reemplaza el sistema anterior de lista estricta por uno más flexible y preciso.

## Características

- **Similitud inteligente**: Usa algoritmo de Levenshtein para detectar variaciones con 90% de precisión
- **Detección por patrones**: Detecta canales que contengan palabras clave o patrones similares
- **Umbral configurable**: Puedes ajustar el umbral de similitud (0-1)
- **Regex inteligente**: Implementa patrones regex para coincidencias avanzadas
- **Compatibilidad hacia atrás**: Mantiene compatibilidad con código existente

## Uso

### Funciones Principales

#### `isChannelAllowed(channelName, threshold = 0.9)`
Verifica si un canal está permitido usando similitud inteligente.

```javascript
import { isChannelAllowed } from './allowed-channels.js';

// Con umbral estándar de 90%
const isAllowed = isChannelAllowed('HBO HD'); // true si "HBO" está en la lista
const isNotAllowed = isChannelAllowed('Canal XYZ'); // false

// Con umbral personalizado
const isStrict = isChannelAllowed('HBO HD', 0.95); // Más estricto
const isFlexible = isChannelAllowed('HBO HD', 0.85); // Más flexible
```

#### `filterAllowedChannels(channels, threshold = 0.9)`
Filtra una lista manteniendo solo los canales permitidos con detección inteligente.

```javascript
import { filterAllowedChannels } from './allowed-channels.js';

const filteredChannels = filterAllowedChannels(channelsArray);
const filteredStrict = filterAllowedChannels(channelsArray, 0.95);
```

#### `getAllowedChannels()`
Obtiene la lista completa de patrones de canales permitidos.

```javascript
import { getAllowedChannels } from './allowed-channels.js';

const allowedPatterns = getAllowedChannels();
```

#### Gestión Dinámica

##### Agregar patrón de canal permitido
```javascript
import { addAllowedChannel } from './allowed-channels.js';

// Agregar canal exacto
addAllowedChannel('HBO');

// Agregar patrón regex
addAllowedChannel('/HBO.*HD/'); // Detectará HBO HD, HBO Full HD, etc.
```

##### Remover patrón de canal permitido
```javascript
import { removeAllowedChannel } from './allowed-channels.js';

removeAllowedChannel('HBO');
```

## Configuración de Canales

Para modificar los patrones de canales permitidos, edite el array `ALLOWED_CHANNELS` en `allowed-channels.js`:

```javascript
const ALLOWED_CHANNELS = [
  'HBO',                    // Detectará: HBO, HBO HD, HBO Plus, HBO2, etc.
  'ESPN',                   // Detectará: ESPN, ESPN 2, ESPN HD, ESPN Sports
  'Discovery',              // Detectará: Discovery, Discovery Channel, Discovery HD
  '/CNN.*[News|International]/', // Regex para CNN News, CNN International
  'FOX',                    // Detectará: FOX, FOX News, FOX Sports, FOX Life
  // ... agregar más patrones aquí
];
```

## Algoritmo de Similitud

El sistema utiliza una combinación de:

1. **Distancia de Levenshtein**: Calcula diferencias entre strings con 90% de precisión
2. **Detección de subcadenas**: Identifica cuando una cadena contiene al patrón
3. **Normalización inteligente**: Limpia nombres (sin espacios, minúsculas, sin caracteres especiales)
4. **Patrones regex**: Permite definir expresiones regulares para coincidencias complejas

### Ejemplos de Detección Inteligente

```javascript
// Con "HBO" en la lista:
isChannelAllowed('HBO');                    // true (exacto)
isChannelAllowed('HBO HD');                // true (contiene HBO)
isChannelAllowed('HBO Plus');              // true (contiene HBO)
isChannelAllowed('HBO2');                   // true (90% similitud)
isChannelAllowed('HBO Signature');          // true (contiene HBO)
isChannelAllowed('H B O');                 // false (similitud < 90%)
isChannelAllowed('HBOo');                   // false (similitud < 90%)

// Con patrón regex /HBO.*HD/:
isChannelAllowed('HBO HD');                // true
isChannelAllowed('HBO Full HD');           // true
isChannelAllowed('HBO Plus HD');             // true
isChannelAllowed('HBO');                   // false (no coincide con regex)
```

## Configuración de Umbral

### Ajustar similitud global
```javascript
import { setGlobalSimilarityThreshold } from './allowed-channels.js';

// Umbral estricto (95%)
setGlobalSimilarityThreshold(0.95);

// Umbral moderado (85%)
setGlobalSimilarityThreshold(0.85);

// Umbral flexible (75%)
setGlobalSimilarityThreshold(0.75);
```

### Umbral por función
```javascript
// Filtrado con diferentes umbrales
const strict = filterAllowedChannels(channels, 0.95);
const moderate = filterAllowedChannels(channels, 0.85);
const flexible = filterAllowedChannels(channels, 0.75);
```

## Migración desde Sistema Anterior

1. El archivo original `banned-channels.js` ha sido renombrado a `banned-channels.js.bak`
2. Los patrones en `ALLOWED_CHANNELS` ahora actúan como base para detección inteligente
3. Las funciones existentes (`isChannelAllowed`, `filterAllowedChannels`) ahora usan 90% de similitud por defecto
4. No se requieren cambios en el código existente

## Notas Importantes

- **Detección inteligente**: No necesitas listar todas las variaciones de un canal
- **Regex poderoso**: Usa patrones regex para coincidencias complejas
- **Logging detallado**: Los canales rechazados se registran con su score de similitud
- **Performance optimizada**: Caché interno para cálculos repetidos
- **Debug mode**: Activable para ver detalles de las comparaciones

## Ejemplo Completo

```javascript
import { 
  ALLOWED_CHANNELS, 
  addAllowedChannel, 
  filterAllowedChannels,
  setGlobalSimilarityThreshold 
} from './allowed-channels.js';

// Configurar canales base con patrones
ALLOWED_CHANNELS.push('HBO', 'ESPN', 'CNN', '/FOX.*/');

// Agregar más patrones
addAllowedChannel('Discovery');
addAllowedChannel('/Netflix.*[4K|UHD]/'); // Netflix 4K, Netflix UHD

// Configurar umbral global
setGlobalSimilarityThreshold(0.9);

// Filtrar canales de una lista completa
const allChannels = [
  { name: 'HBO HD' },
  { name: 'HBO Plus' },
  { name: 'ESPN 2' },
  { name: 'ESPN Sports' },
  { name: 'CNN International' },
  { name: 'FOX News' },
  { name: 'FOX Sports' },
  { name: 'Discovery Channel HD' },
  { name: 'Netflix 4K' },
  { name: 'Random Channel' }
];

const allowedChannels = filterAllowedChannels(allChannels);
// Resultado: todos excepto 'Random Channel'

console.log(`Canales permitidos: ${allowedChannels.length}/${allChannels.length}`);
```