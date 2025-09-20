# Migración de BANNED_CHANNELS a Variables de Entorno

## Resumen

Este documento describe la migración del sistema de canales prohibidos desde una configuración hardcodeada a un sistema basado en variables de entorno, proporcionando mayor flexibilidad y facilidad de configuración.

## Cambios Implementados

### 1. Migración de Configuración

**Antes:**
```javascript
// Configuración hardcodeada en banned-channels.js
const BANNED_CHANNELS = [
  'ADULT', 'XXX', 'PORN', 'SEX', 'EROTIC',
  // ... más términos hardcodeados
];
```

**Después:**
```javascript
// Configuración desde variable de entorno
function loadBannedChannelsFromEnv() {
  const envValue = process.env.BANNED_CHANNELS;
  if (!envValue) {
    console.log('[BANNED_CHANNELS] Variable de entorno no encontrada, usando lista por defecto');
    return getDefaultBannedChannels();
  }
  // Parseo y validación de la variable de entorno
}
```

### 2. Configuración en .env

```bash
# Lista de canales prohibidos (separados por comas)
# Sistema inteligente de filtrado de canales con coincidencia por similitud
# - Coincidencia exacta: nombres idénticos
# - Similitud del 90%: usando algoritmo Levenshtein
# - Contención: si un término está contenido en el nombre del canal
# Incluye términos para filtrar contenido adulto, violento y regional específico
BANNED_CHANNELS=Rs,Al,Saudi,Sama,Asharq,Arryadia,Bahrain,Dubai,Ad,Rotana,ksa,libya,tunisia,ien
```

### 3. Mejoras en el Algoritmo de Similitud

Se implementó un sistema de coincidencia por similitud mejorado, similar al usado en `allowed-channels.js`:

- **Coincidencia exacta**: Nombres idénticos después de normalización
- **Similitud del 90%**: Usando algoritmo de distancia de Levenshtein
- **Contención inteligente**: Para términos cortos (≤3 caracteres) con límites de palabra
- **Normalización avanzada**: Eliminación de acentos, espacios y caracteres especiales

### 4. Integración en Repositorios

Todos los repositorios principales ahora integran el filtrado de BANNED_CHANNELS:

- `RemoteM3UChannelRepository.js`
- `HybridChannelRepository.js`
- `AutomaticM3UChannelRepository.js`
- `LocalM3UChannelRepository.js`
- `CSVChannelRepository.js`

**Ejemplo de integración:**
```javascript
import { filterBannedChannels } from '../../config/banned-channels.js';

// En el método getAllChannels()
const beforeBannedCount = channels.length;
channels = filterBannedChannels(channels);
const afterBannedCount = channels.length;
const bannedRemovedCount = beforeBannedCount - afterBannedCount;

if (bannedRemovedCount > 0) {
  this.#logger.info(`Filtros de canales prohibidos aplicados: ${bannedRemovedCount} canales removidos de ${beforeBannedCount}`);
}
```

## Funciones Principales

### `loadBannedChannelsFromEnv()`
- Carga la configuración desde `process.env.BANNED_CHANNELS`
- Fallback automático a lista por defecto si no está configurada
- Manejo de errores con logging detallado

### `isChannelBanned(channelName, threshold = 0.9)`
- Verifica si un canal está prohibido usando múltiples métodos
- Coincidencia exacta, similitud y contención
- Threshold configurable para similitud

### `filterBannedChannels(channels)`
- Filtra una lista completa de canales
- Aplica todas las reglas de prohibición
- Retorna solo canales permitidos

### `isChannelBannedByAnyReason(channel)`
- Verificación integral que incluye:
  - Nombre del canal
  - URL del canal
  - Dominio
  - IP del servidor
  - Términos personalizados
  - Patrones regex

## Script de Pruebas

Se creó `test-banned-channels-filtering.js` para verificar el funcionamiento:

```bash
node test-banned-channels-filtering.js
```

**Resultados esperados:**
- ✅ Canales con términos prohibidos son filtrados
- ✅ Canales normales pasan el filtro
- ✅ Logging detallado del proceso
- ✅ Verificación de conteos correctos

## Configuración Recomendada

### Para Contenido General
```bash
BANNED_CHANNELS=ADULT,XXX,PORN,SEX,EROTIC,PLAYBOY,EXTREME,VIOLENCE
```

### Para Filtrado Regional (Árabe)
```bash
BANNED_CHANNELS=Rs,Al,Saudi,Sama,Asharq,Arryadia,Bahrain,Dubai,Ad,Rotana,ksa,libya,tunisia,ien
```

### Configuración Combinada
```bash
BANNED_CHANNELS=ADULT,XXX,PORN,SEX,EROTIC,PLAYBOY,EXTREME,VIOLENCE,Rs,Al,Saudi,Sama,Asharq,Arryadia,Bahrain,Dubai,Ad,Rotana,ksa,libya,tunisia,ien
```

## Beneficios de la Migración

1. **Flexibilidad**: Configuración sin necesidad de modificar código
2. **Mantenibilidad**: Fácil actualización de términos prohibidos
3. **Portabilidad**: Diferentes configuraciones por entorno
4. **Logging**: Visibilidad completa del proceso de filtrado
5. **Fallback**: Sistema robusto con configuración por defecto
6. **Precisión**: Algoritmo mejorado de similitud

## Compatibilidad

- ✅ Mantiene compatibilidad con código existente
- ✅ Fallback automático si no hay configuración
- ✅ Logging detallado para debugging
- ✅ Validación de entrada robusta

## Troubleshooting

### Variable no cargada
```
[BANNED_CHANNELS] Variable de entorno no encontrada, usando lista por defecto
```
**Solución**: Verificar que el archivo `.env` contenga `BANNED_CHANNELS=...`

### Filtrado excesivo
**Síntoma**: Demasiados canales filtrados
**Solución**: Revisar términos en `BANNED_CHANNELS`, usar términos más específicos

### Filtrado insuficiente
**Síntoma**: Canales no deseados pasan el filtro
**Solución**: Agregar términos más amplios o usar patrones regex en `BANNED_PATTERNS`

## Archivos Modificados

- `src/config/banned-channels.js` - Lógica principal actualizada
- `.env` - Nueva variable `BANNED_CHANNELS`
- `.env.example` - Documentación de la variable
- `test-banned-channels-filtering.js` - Script de pruebas
- Todos los repositorios de canales - Integración del filtrado

## Próximos Pasos

1. Monitorear logs para verificar efectividad del filtrado
2. Ajustar términos según necesidades específicas
3. Considerar implementar interfaz web para gestión de términos
4. Evaluar métricas de precisión del filtrado

---

**Fecha de migración**: Enero 2025  
**Versión**: 1.0  
**Estado**: Completado ✅