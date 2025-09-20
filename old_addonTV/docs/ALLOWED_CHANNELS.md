# Configuración de Canales Permitidos

## Descripción

El sistema de canales permitidos permite controlar qué canales de TV serán incluidos en el catálogo de la aplicación. Esta funcionalidad se configura completamente desde variables de entorno, eliminando la necesidad de modificar código fuente.

## Configuración

### Variable de Entorno

```bash
# En el archivo .env
ALLOWED_CHANNELS=HBO,ESPN,Discovery Channel,CNN,National Geographic
```

### Formato

- **Separador**: Comas (`,`)
- **Espacios**: Se permiten espacios en los nombres de canales
- **Sensibilidad**: El sistema usa similitud de 90% para coincidencias flexibles
- **Normalización**: Los nombres se normalizan automáticamente (sin acentos, minúsculas)

## Características

### 🔍 Coincidencia Inteligente

El sistema utiliza un algoritmo de similitud que permite coincidencias flexibles:

```javascript
// Ejemplos de coincidencias exitosas:
'HBO Max' → 'HBO' (80.7% similitud)
'ESPN Deportes' → 'ESPN' (77.7% similitud)
'Fox Sports Premium' → 'FOX Sports' (83.9% similitud)
'CNN Internacional' → 'CNN' (74.4% similitud)
```

### 🔄 Sistema de Fallback

Si la variable `ALLOWED_CHANNELS` no está configurada o está vacía, el sistema utiliza una lista predeterminada de 42 canales populares:

- HBO, HBO Plus, HBO Family, HBO Signature
- ESPN, ESPN 2, ESPN 3, ESPN 4
- FOX Sports, FOX Sports 2, FOX Sports 3
- CNN, CNN en Español
- Discovery Channel, Discovery H&H, Discovery Science
- National Geographic, Nat Geo Wild
- History Channel, History 2
- Y muchos más...

### ⚡ Configuración Dinámica

La configuración se puede cambiar en tiempo real:

1. Edita el archivo `.env`
2. Modifica la variable `ALLOWED_CHANNELS`
3. Reinicia el servidor
4. Los cambios se aplican inmediatamente

## Ejemplos de Uso

### Configuración Básica

```bash
# Solo canales de noticias
ALLOWED_CHANNELS=CNN,BBC News,Fox News,MSNBC
```

### Configuración de Entretenimiento

```bash
# Canales de entretenimiento y deportes
ALLOWED_CHANNELS=HBO,Netflix,Disney,ESPN,FOX Sports,Discovery Channel
```

### Configuración Completa

```bash
# Lista extensa de canales
ALLOWED_CHANNELS=HBO,HBO Plus,ESPN,ESPN 2,Discovery Channel,CNN,National Geographic,History Channel,MTV,Comedy Central,Warner Channel,Sony Channel,TNT,Universal Channel,Disney
```

## API de Programación

### Funciones Disponibles

```javascript
import { 
  ALLOWED_CHANNELS,
  isChannelAllowed,
  getAllowedChannels,
  normalizeChannelName,
  calculateStringSimilarity 
} from './src/config/allowed-channels.js';

// Verificar si un canal está permitido
const allowed = isChannelAllowed('HBO Max'); // true

// Obtener lista completa de canales permitidos
const channels = getAllowedChannels(); // Array de strings

// Normalizar nombre de canal
const normalized = normalizeChannelName('HBO Máx'); // 'hbo max'

// Calcular similitud entre strings
const similarity = calculateStringSimilarity('HBO', 'HBO Max'); // 0.807
```

### Integración en Filtros

```javascript
// Filtrar lista de canales
const filteredChannels = allChannels.filter(channel => 
  isChannelAllowed(channel.name)
);

// Verificar canal específico
if (isChannelAllowed(channelName)) {
  // Procesar canal permitido
  processChannel(channel);
}
```

## Pruebas

### Script de Prueba

Ejecuta el script de prueba para verificar la configuración:

```bash
node test-allowed-channels-env.js
```

Este script verifica:
- ✅ Carga correcta desde variables de entorno
- ✅ Funcionamiento del sistema de fallback
- ✅ Coincidencias inteligentes con similitud
- ✅ Configuración personalizada dinámica

### Casos de Prueba

El script incluye casos de prueba para:

1. **Coincidencias exactas**: `HBO` → `HBO` (100%)
2. **Coincidencias parciales**: `HBO Max` → `HBO` (80.7%)
3. **Variaciones de idioma**: `ESPN Deportes` → `ESPN` (77.7%)
4. **Canales no permitidos**: `Canal Inexistente` → ❌
5. **Configuración personalizada**: Netflix, Amazon Prime, etc.

## Configuración en Producción

### Variables de Entorno

```bash
# Producción - Lista curada de canales premium
ALLOWED_CHANNELS=HBO,HBO Plus,ESPN,ESPN 2,Discovery Channel,CNN,National Geographic,History Channel,MTV,Comedy Central,Warner Channel,Sony Channel,TNT,Universal Channel,Disney

# Desarrollo - Lista más amplia para pruebas
ALLOWED_CHANNELS=HBO,ESPN,Discovery,CNN,Fox,MTV,Disney,Netflix,Amazon Prime

# Testing - Lista mínima
ALLOWED_CHANNELS=HBO,ESPN,CNN
```

### Consideraciones de Rendimiento

- ✅ **Carga única**: Los canales se cargan una sola vez al iniciar
- ✅ **Caché en memoria**: Las verificaciones son instantáneas
- ✅ **Algoritmo eficiente**: Similitud calculada solo cuando es necesario
- ✅ **Normalización optimizada**: Strings normalizados se cachean

## Migración desde Código Hardcodeado

### Antes (Hardcodeado)

```javascript
// ❌ Valores fijos en código
const ALLOWED_CHANNELS = [
  'HBO', 'ESPN', 'Discovery Channel'
];
```

### Después (Configurable)

```javascript
// ✅ Valores desde variables de entorno
const ALLOWED_CHANNELS = loadAllowedChannelsFromEnv();
```

### Beneficios de la Migración

1. **🔧 Configuración sin código**: Cambios sin recompilación
2. **🌍 Entornos específicos**: Diferentes listas por entorno
3. **⚡ Despliegue rápido**: Cambios instantáneos
4. **🛡️ Seguridad**: No exponer listas en código fuente
5. **📊 Flexibilidad**: Adaptación a diferentes mercados

## Troubleshooting

### Problemas Comunes

#### Canal no se encuentra a pesar de estar en la lista

```bash
# Verificar normalización
node -e "console.log(require('./src/config/allowed-channels.js').normalizeChannelName('Tu Canal'))"
```

#### Variable de entorno no se carga

```bash
# Verificar archivo .env
cat .env | grep ALLOWED_CHANNELS

# Verificar carga de dotenv
node -e "require('dotenv').config(); console.log(process.env.ALLOWED_CHANNELS)"
```

#### Similitud muy baja

```bash
# Ajustar umbral de similitud en el código (actualmente 90%)
# O usar nombres más específicos en ALLOWED_CHANNELS
```

### Logs de Depuración

```javascript
// Habilitar logs detallados
process.env.DEBUG_CHANNELS = 'true';

// Verificar coincidencias
console.log('Canal normalizado:', normalizeChannelName(channelName));
console.log('Similitud máxima:', Math.max(...ALLOWED_CHANNELS.map(c => 
  calculateStringSimilarity(normalizeChannelName(channelName), normalizeChannelName(c))
)));
```

## Roadmap

### Funcionalidades Futuras

- [ ] **Patrones regex**: Soporte para expresiones regulares
- [ ] **Categorías**: Agrupación de canales por categorías
- [ ] **Geolocalización**: Canales específicos por región
- [ ] **Horarios**: Canales permitidos por franjas horarias
- [ ] **API REST**: Endpoint para gestión dinámica
- [ ] **Dashboard**: Interfaz web para configuración

### Mejoras de Rendimiento

- [ ] **Índices**: Búsqueda indexada para listas grandes
- [ ] **Caché distribuido**: Redis para entornos multi-instancia
- [ ] **Lazy loading**: Carga bajo demanda de configuraciones
- [ ] **Compresión**: Almacenamiento comprimido de listas grandes

---

**Documentación actualizada**: $(date)
**Versión**: 1.0.0
**Mantenedor**: Sistema de Configuración Dinámica