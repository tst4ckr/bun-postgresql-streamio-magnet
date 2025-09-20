# Guía de Filtrado de IPs Específicas

Esta guía explica cómo usar el sistema extendido de filtrado de canales que ahora incluye capacidades para banear IPs específicas y rangos CIDR.

## Características Principales

### 1. Filtrado por IP Individual
- Bloqueo de direcciones IPv4 e IPv6 específicas
- Validación automática de formato de IP
- Gestión dinámica de la lista de IPs prohibidas

### 2. Filtrado por Rangos CIDR
- Soporte para rangos IPv4 (ej: `192.168.0.0/16`)
- Soporte para rangos IPv6 (ej: `fe80::/10`)
- Validación automática de notación CIDR

### 3. Extracción Automática de IPs
- Detección automática de IPs en URLs de canales
- Soporte para URLs con puertos personalizados
- Manejo de URLs con dominios (no afectadas)

## IPs y Rangos Prohibidos por Defecto

### IPs Individuales
```javascript
[
  "127.0.0.1",  // Localhost IPv4
  "0.0.0.0",    // Dirección inválida
  "::1"         // Localhost IPv6
]
```

### Rangos CIDR
```javascript
[
  "10.0.0.0/8",      // Redes privadas clase A
  "172.16.0.0/12",   // Redes privadas clase B
  "192.168.0.0/16",  // Redes privadas clase C
  "::1/128",         // Localhost IPv6
  "fe80::/10"        // Link-local IPv6
]
```

## API de Funciones

### Gestión de IPs Individuales

#### `addBannedIP(ip)`
Agrega una IP a la lista de prohibidas.

```javascript
import { addBannedIP } from './src/config/banned-channels.js';

// Agregar IP IPv4
const success = addBannedIP('203.0.113.1');
console.log(success); // true si se agregó exitosamente

// Agregar IP IPv6
addBannedIP('2001:db8::1');

// IP inválida será rechazada
addBannedIP('999.999.999.999'); // retorna false
```

#### `removeBannedIP(ip)`
Remueve una IP de la lista de prohibidas.

```javascript
import { removeBannedIP } from './src/config/banned-channels.js';

const removed = removeBannedIP('203.0.113.1');
console.log(removed); // true si se removió exitosamente
```

#### `getBannedIPs()`
Obtiene la lista actual de IPs prohibidas.

```javascript
import { getBannedIPs } from './src/config/banned-channels.js';

const bannedIPs = getBannedIPs();
console.log(bannedIPs); // Array de IPs prohibidas
```

### Gestión de Rangos CIDR

#### `addBannedIPRange(cidr)`
Agrega un rango CIDR a la lista de prohibidos.

```javascript
import { addBannedIPRange } from './src/config/banned-channels.js';

// Agregar rango IPv4
addBannedIPRange('203.0.113.0/24');

// Agregar rango IPv6
addBannedIPRange('2001:db8::/32');
```

#### `removeBannedIPRange(cidr)`
Remueve un rango CIDR de la lista de prohibidos.

```javascript
import { removeBannedIPRange } from './src/config/banned-channels.js';

const removed = removeBannedIPRange('203.0.113.0/24');
```

#### `getBannedIPRanges()`
Obtiene la lista actual de rangos CIDR prohibidos.

```javascript
import { getBannedIPRanges } from './src/config/banned-channels.js';

const ranges = getBannedIPRanges();
console.log(ranges); // Array de rangos CIDR
```

### Funciones de Validación

#### `isIPBanned(ip)`
Verifica si una IP específica está prohibida.

```javascript
import { isIPBanned } from './src/config/banned-channels.js';

const banned = isIPBanned('127.0.0.1');
console.log(banned); // true (localhost está prohibido por defecto)

const allowed = isIPBanned('8.8.8.8');
console.log(allowed); // false (Google DNS está permitido)
```

#### `isChannelURLBanned(url)`
Verifica si la URL de un canal contiene una IP prohibida.

```javascript
import { isChannelURLBanned } from './src/config/banned-channels.js';

// URL con IP prohibida
const banned = isChannelURLBanned('http://127.0.0.1:8080/stream.m3u8');
console.log(banned); // true

// URL con dominio (no afectada por filtrado de IP)
const allowed = isChannelURLBanned('https://example.com/stream');
console.log(allowed); // false
```

#### `extractIPFromURL(url)`
Extrae la dirección IP de una URL si está presente.

```javascript
import { extractIPFromURL } from './src/config/banned-channels.js';

const ip1 = extractIPFromURL('http://192.168.1.1:8080/stream');
console.log(ip1); // '192.168.1.1'

const ip2 = extractIPFromURL('https://example.com/stream');
console.log(ip2); // null (no hay IP en la URL)
```

### Filtrado de Canales

#### `filterBannedChannels(channels)`
Filtra una lista de canales eliminando aquellos que están prohibidos por nombre o IP.

```javascript
import { filterBannedChannels } from './src/config/banned-channels.js';

const channels = [
  {
    name: 'Canal Normal',
    url: 'https://example.com/stream1'
  },
  {
    name: 'Canal con IP Prohibida',
    url: 'http://127.0.0.1:8080/stream'
  },
  {
    name: 'ADULT Channel', // Prohibido por nombre
    url: 'https://valid-domain.com/stream'
  }
];

const filtered = filterBannedChannels(channels);
console.log(filtered.length); // 1 (solo 'Canal Normal' pasa el filtro)
```

## Casos de Uso Comunes

### 1. Bloquear Servidor Específico
```javascript
// Bloquear un servidor problemático
addBannedIP('203.0.113.50');

// Verificar que se aplicó
const isBanned = isIPBanned('203.0.113.50');
console.log('Servidor bloqueado:', isBanned);
```

### 2. Bloquear Rango de Red
```javascript
// Bloquear toda una subred
addBannedIPRange('203.0.113.0/24');

// Verificar IPs en ese rango
console.log(isIPBanned('203.0.113.1'));   // true
console.log(isIPBanned('203.0.113.100')); // true
console.log(isIPBanned('203.0.114.1'));   // false
```

### 3. Filtrado Automático en Procesamiento
```javascript
// En el procesamiento de listas M3U
const rawChannels = parseM3UFile(content);
const safeChannels = filterBannedChannels(rawChannels);

console.log(`Filtrados ${rawChannels.length - safeChannels.length} canales`);
```

### 4. Gestión Dinámica
```javascript
// Agregar temporalmente una IP problemática
addBannedIP('198.51.100.1');

// Procesar canales
const filtered = filterBannedChannels(channels);

// Remover la IP después del procesamiento
removeBannedIP('198.51.100.1');
```

## Consideraciones de Rendimiento

1. **Validación de IPs**: Las validaciones usan las funciones nativas de Node.js (`net.isIP`) para máximo rendimiento.

2. **Búsqueda en Arrays**: Para listas grandes de IPs, considere implementar un `Set` para búsquedas O(1).

3. **Rangos CIDR**: La validación de rangos CIDR es más costosa que IPs individuales. Use con moderación.

4. **Caché de URLs**: Las IPs extraídas de URLs podrían ser cacheadas para evitar re-parsing.

## Integración con el Sistema Existente

El nuevo sistema de filtrado de IPs se integra perfectamente con el sistema existente de filtrado por nombres:

```javascript
// Un canal puede ser filtrado por:
// 1. Nombre prohibido (sistema original)
// 2. IP prohibida (nueva funcionalidad)
// 3. Rango CIDR prohibido (nueva funcionalidad)

const channel = {
  name: 'Canal Test',
  url: 'http://192.168.1.1:8080/stream'
};

// Se aplicarán ambos filtros automáticamente
const filtered = filterBannedChannels([channel]);
```

## Ejemplos de Configuración

### Configuración Básica
```javascript
// Bloquear IPs específicas conocidas como problemáticas
addBannedIP('203.0.113.1');
addBannedIP('198.51.100.50');

// Bloquear rangos de prueba
addBannedIPRange('203.0.113.0/24');
```

### Configuración Avanzada
```javascript
// Configuración para entorno de producción
const productionBannedIPs = [
  '127.0.0.1',      // Localhost
  '0.0.0.0',        // Dirección inválida
  // Agregar IPs específicas según necesidades
];

const productionBannedRanges = [
  '10.0.0.0/8',     // RFC 1918 - Redes privadas
  '172.16.0.0/12',  // RFC 1918 - Redes privadas
  '192.168.0.0/16', // RFC 1918 - Redes privadas
  '169.254.0.0/16', // RFC 3927 - Link-local
  // Agregar rangos específicos según políticas
];

// Aplicar configuración
productionBannedIPs.forEach(addBannedIP);
productionBannedRanges.forEach(addBannedIPRange);
```

Esta funcionalidad proporciona un control granular sobre qué fuentes de contenido son permitidas en el sistema, mejorando la seguridad y calidad del servicio.