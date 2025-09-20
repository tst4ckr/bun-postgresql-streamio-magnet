# Sistema de Filtrado de Canales - Documentación Completa

## Visión General

El sistema de filtrado de canales implementa un enfoque de dos etapas que combina:

1. **Filtro de Canales Permitidos (Whitelist)**: Filtra basándose en similitud inteligente (90% por defecto)
2. **Filtro de Canales Prohibidos (Blacklist)**: Remueve canales con contenido no deseado

## Arquitectura del Sistema

```
Canales Originales
    ↓
[Allowed Channels Filter] → Canales Permitidos
    ↓
[Banned Channels Filter] → Canales Finales
    ↓
Canales Procesados
```

## Componentes

### 1. allowed-channels.js
- **Propósito**: Define canales permitidos mediante similitud inteligente
- **Algoritmo**: Distancia de Levenshtein con 90% de similitud por defecto
- **Características**:
  - Detección de subcadenas
  - Normalización de nombres
  - Umbral configurable

### 2. banned-channels.js
- **Propósito**: Define canales prohibidos mediante lista negra
- **Criterios**:
  - Contenido adulto
  - Canales de prueba/debug
  - Contenido ilegal
  - Redes sociales
  - Plataformas premium
  - Términos genéricos

### 3. Implementación en Repositorios
- **Enfoque**: Cada repositorio implementa el filtrado en dos pasos
- **Secuencia**: `filterAllowedChannels` → `filterBannedChannels`
- **Ventaja**: Control granular y logs detallados por etapa

## Uso en Repositorios

### Repositorios Actualizados

1. **RemoteM3UChannelRepository.js**
2. **AutomaticChannelRepository.js**
3. **HybridChannelRepository.js**

### Ejemplo de Implementación

```javascript
import { applyTwoStageFiltering } from '../../config/banned-channels.js';

// En lugar de usar filtros individuales:
// const allowed = filterAllowedChannels(channels);
// const banned = filterBannedChannels(allowed);

// Usar el filtrado integrado:
const filteredChannels = applyTwoStageFiltering(channels);
```

## Configuración Personalizada

### Ajustar Umbral de Similitud

```javascript
// En allowed-channels.js
setSimilarityThreshold(0.95); // Más estricto
setSimilarityThreshold(0.85); // Más flexible
```

### Modificar Lista Prohibida

```javascript
// En banned-channels.js
addBannedTerm('NEW_BANNED_TERM');
removeBannedTerm('OLD_TERM');
```

## API de Configuración

### banned-channels.js

- `isChannelBanned(channelName)`: Verifica si un canal está prohibido
- `filterBannedChannels(channels)`: Filtra canales prohibidos
- `applyTwoStageFiltering(channels)`: Aplica ambos filtros
- `getBannedTerms()`: Obtiene lista de términos prohibidos
- `addBannedTerm(term)`: Agrega nuevo término
- `removeBannedTerm(term)`: Remueve término

### allowed-channels.js

- `isChannelAllowed(channelName, threshold)`: Verifica canal permitido
- `filterAllowedChannels(channels, threshold)`: Filtra por similitud
- `setSimilarityThreshold(threshold)`: Ajusta umbral
- `getAllowedChannels()`: Obtiene canales base
- `addAllowedChannel(channel)`: Agrega canal permitido

## Ejemplos de Uso

### Filtrado Básico

```javascript
import { applyTwoStageFiltering } from './config/banned-channels.js';

const channels = [
  { name: 'HBO HD' },
  { name: 'XXX ADULT' },
  { name: 'CNN International' },
  { name: 'TEST CHANNEL' }
];

const filtered = applyTwoStageFiltering(channels);
// Resultado: ['HBO HD', 'CNN International']
// Removidos: 'XXX ADULT' (banned), 'TEST CHANNEL' (banned)
```

### Filtrado con Umbral Personalizado

```javascript
import { filterAllowedChannels } from './config/allowed-channels.js';
import { filterBannedChannels } from './config/banned-channels.js';

// Filtrado personalizado
const allowed = filterAllowedChannels(channels, 0.95); // 95% similitud
const final = filterBannedChannels(allowed);
```

## Términos Prohibidos por Categoría

### Contenido Adulto
- ADULT, XXX, PORN, SEX, EROTIC
- PLAYBOY, HUSTLER, BRAZZERS

### Debug/Test
- TEST, DEMO, SAMPLE, DEBUG
- TEMP, EXAMPLE, STAGING

### Plataformas
- NETFLIX, AMAZON, HULU, DISNEY+
- HBO MAX, YOUTUBE, FACEBOOK

### Genéricos
- UNKNOWN, NO NAME, CHANNEL
- STREAM, LINK, URL, FEED

## Monitoreo y Logs

Los repositorios generan logs indicando:
- Número de canales procesados
- Canales removidos por cada filtro
- Razones de filtrado (cuando sea posible)

### Ejemplo de Log

```
[RemoteM3URepository] Filtrados 45 canales en total (allowed + banned)
[AutomaticRepository] Filtro inteligente aplicado: 12 canales removidos
[HybridRepository] Filtrado completo: 23 canales excluidos
```

## Migración desde Sistema Anterior

### Cambios Realizados

1. **Archivos Renombrados**:
   - `banned-channels.js` → `banned-channels.js.bak` (backup)

2. **Importaciones Actualizadas**:
   - Todos los repositorios ahora importan desde `banned-channels.js`
   - Usan `applyTwoStageFiltering` en lugar de filtros individuales

3. **Funcionalidad Mejorada**:
   - Sistema más robusto con filtrado en dos etapas
   - Mejor documentación y configuración
   - Algoritmos inteligentes de similitud

### Verificación Post-Migración

Para verificar el sistema:

```bash
# Ejecutar aplicación y verificar logs
bun run src/index.js

# Verificar canales procesados
node scripts/test-hybrid-repository.js
```

## Solución de Problemas

### Canales Legítimos Filtrados

1. **Verificar similitud**: Ajustar umbral en `allowed-channels.js`
2. **Revisar términos prohibidos**: Verificar `banned-channels.js`
3. **Logs detallados**: Habilitar modo debug en repositorios

### Rendimiento

- El filtrado se ejecuta una sola vez por lote de canales
- Complejidad: O(n*m) donde n=canales, m=términos permitidos/prohibidos
- Optimizado con normalización y caché de resultados

## Mantenimiento

### Actualización Regular

1. **Revisar términos prohibidos** mensualmente
2. **Ajustar umbrales** según feedback de usuarios
3. **Agregar nuevos canales permitidos** según requisitos
4. **Monitorear logs** para patrones de filtrado

### Testing

```javascript
// Test unitario básico
import { applyTwoStageFiltering } from './config/banned-channels.js';

const testChannels = [
  { name: 'HBO' },
  { name: 'ADULT CHANNEL' },
  { name: 'CNN' },
  { name: 'TEST' }
];

const result = applyTwoStageFiltering(testChannels);
console.assert(result.length === 2, 'Deben quedar 2 canales');
```