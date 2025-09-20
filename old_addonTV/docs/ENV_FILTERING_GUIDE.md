# Guía de Filtrado Configurable desde Variables de Entorno

## Descripción General

El sistema de filtrado de canales ahora es completamente configurable desde el archivo `.env`, permitiendo a los administradores definir reglas de filtrado sin necesidad de modificar código fuente.

## Variables de Entorno Disponibles

### 📍 BANNED_IPS
**Descripción:** Lista de direcciones IP específicas que serán bloqueadas.
**Formato:** Direcciones IP separadas por comas
**Ejemplo:**
```env
BANNED_IPS=203.0.113.1,198.51.100.50,192.0.2.100
```

### 🌐 BANNED_IP_RANGES
**Descripción:** Lista de rangos CIDR que serán bloqueados.
**Formato:** Rangos CIDR separados por comas
**Ejemplo:**
```env
BANNED_IP_RANGES=203.0.113.0/24,198.51.100.0/24,10.0.0.0/8
```

### 🔗 BANNED_URLS
**Descripción:** Lista de URLs específicas que serán bloqueadas.
**Formato:** URLs completas separadas por comas
**Ejemplo:**
```env
BANNED_URLS=http://malicious-server.com,https://spam-iptv.net,http://blocked-site.org
```

### 🏠 BANNED_DOMAINS
**Descripción:** Lista de dominios que serán bloqueados (incluyendo subdominios).
**Formato:** Nombres de dominio separados por comas
**Ejemplo:**
```env
BANNED_DOMAINS=malicious-domain.com,spam-iptv.net,blocked-server.org
```

### 📝 CUSTOM_BANNED_TERMS
**Descripción:** Lista de términos personalizados que serán bloqueados en nombres de canales.
**Formato:** Términos separados por comas (no sensible a mayúsculas/minúsculas)
**Ejemplo:**
```env
CUSTOM_BANNED_TERMS=test,demo,sample,trial,prueba
```

### 🔍 BANNED_PATTERNS
**Descripción:** Lista de patrones de expresiones regulares para filtrado avanzado.
**Formato:** Patrones regex separados por comas
**Ejemplo:**
```env
BANNED_PATTERNS=.*test.*,.*demo.*,.*sample.*,.*\\btrial\\b.*
```

## Configuración en .env

### Ejemplo Completo
```env
# ===================================
# CONFIGURACIÓN DE FILTRADO
# ===================================

# IPs específicas prohibidas
BANNED_IPS=203.0.113.1,198.51.100.50,192.0.2.100

# Rangos CIDR prohibidos
BANNED_IP_RANGES=203.0.113.0/24,198.51.100.0/24,10.0.0.0/8

# URLs específicas prohibidas
BANNED_URLS=http://malicious-server.com,https://spam-iptv.net

# Dominios prohibidos
BANNED_DOMAINS=malicious-domain.com,spam-iptv.net,blocked-server.org

# Términos personalizados prohibidos
CUSTOM_BANNED_TERMS=test,demo,sample,trial,prueba

# Patrones regex prohibidos
BANNED_PATTERNS=.*test.*,.*demo.*,.*sample.*
```

## Cómo Funciona el Filtrado

El sistema aplica múltiples capas de filtrado en el siguiente orden:

1. **Filtrado por Términos Predefinidos:** Canales con términos como "ADULT", "XXX", etc.
2. **Filtrado por Términos Personalizados:** Canales que contengan términos definidos en `CUSTOM_BANNED_TERMS`
3. **Filtrado por Patrones Regex:** Canales que coincidan con patrones en `BANNED_PATTERNS`
4. **Filtrado por URLs:** Canales con URLs que coincidan exactamente con `BANNED_URLS`
5. **Filtrado por Dominios:** Canales con dominios que coincidan con `BANNED_DOMAINS`
6. **Filtrado por IPs:** Canales con IPs que estén en `BANNED_IPS` o `BANNED_IP_RANGES`

## Ejemplos de Uso

### Caso 1: Bloquear Canales de Prueba
```env
CUSTOM_BANNED_TERMS=test,demo,sample,trial
BANNED_PATTERNS=.*prueba.*,.*testing.*,.*demo.*
```

### Caso 2: Bloquear Servidores Específicos
```env
BANNED_DOMAINS=unreliable-server.com,spam-iptv.net
BANNED_URLS=http://malicious-server.com/playlist.m3u
```

### Caso 3: Bloquear Rangos de IP
```env
BANNED_IP_RANGES=203.0.113.0/24,198.51.100.0/24
BANNED_IPS=192.0.2.100,192.0.2.200
```

## Gestión Dinámica

Además de la configuración estática desde `.env`, el sistema permite gestión dinámica en tiempo de ejecución:

### Funciones Disponibles

```javascript
import {
  // Agregar elementos
  addBannedIP,
  addBannedURL,
  addBannedDomain,
  addCustomBannedTerm,
  addBannedPattern,
  
  // Remover elementos
  removeBannedIP,
  removeBannedURL,
  removeBannedDomain,
  removeCustomBannedTerm,
  removeBannedPattern,
  
  // Consultar configuración
  getBannedIPs,
  getBannedURLs,
  getBannedDomains,
  getCustomBannedTerms,
  getBannedPatterns
} from './src/config/banned-channels.js';

// Ejemplo: Agregar IP dinámicamente
addBannedIP('192.168.1.100');

// Ejemplo: Agregar dominio dinámicamente
addBannedDomain('new-spam-server.com');
```

## Validación y Pruebas

### Script de Prueba
Ejecuta el script de prueba para verificar tu configuración:
```bash
bun run test-env-complete.js
```

### Verificación Manual
```javascript
import { isChannelBannedByAnyReason } from './src/config/banned-channels.js';

const channel = {
  name: 'Canal Test',
  url: 'http://203.0.113.1:8080/stream'
};

const isBanned = isChannelBannedByAnyReason(channel);
console.log(`Canal prohibido: ${isBanned}`);
```

## Mejores Prácticas

### 1. Configuración Gradual
- Comienza con configuraciones básicas
- Agrega reglas específicas según necesidades
- Prueba cada configuración antes de aplicar en producción

### 2. Patrones Regex Eficientes
- Usa patrones específicos para evitar falsos positivos
- Evita patrones demasiado amplios como `.*`
- Prueba patrones con datos reales

### 3. Gestión de IPs
- Prefiere rangos CIDR sobre IPs individuales cuando sea apropiado
- Documenta la razón de cada IP/rango bloqueado
- Revisa periódicamente la lista de IPs bloqueadas

### 4. Monitoreo
- Registra canales filtrados para análisis
- Revisa regularmente la efectividad del filtrado
- Ajusta configuraciones según patrones observados

## Solución de Problemas

### Problema: Configuración No Se Carga
**Solución:** Verifica que:
- El archivo `.env` existe en la raíz del proyecto
- Las variables están correctamente formateadas
- No hay espacios extra alrededor de los valores
- La aplicación se reinició después de cambios en `.env`

### Problema: Patrones Regex No Funcionan
**Solución:** Verifica que:
- Los patrones usan sintaxis JavaScript válida
- Los caracteres especiales están correctamente escapados
- Los patrones se prueban con datos reales

### Problema: IPs No Se Bloquean
**Solución:** Verifica que:
- Las IPs están en formato válido
- Los rangos CIDR usan notación correcta
- Las URLs de los canales contienen las IPs especificadas

## Integración con el Sistema

El sistema de filtrado se integra automáticamente con:

- **AutomaticChannelRepository:** Filtra canales automáticamente
- **HybridChannelRepository:** Aplica filtros en fuentes híbridas
- **StreamValidationService:** Valida canales antes del filtrado

## Rendimiento

- **Carga Inicial:** Las configuraciones se cargan una vez al inicio
- **Filtrado:** O(n) para la mayoría de operaciones
- **Regex:** Patrones compilados una vez y reutilizados
- **Memoria:** Uso mínimo de memoria adicional

## Seguridad

- **Validación:** Todas las entradas se validan antes del procesamiento
- **Sanitización:** URLs e IPs se normalizan automáticamente
- **Aislamiento:** El filtrado no afecta otras funcionalidades del sistema

---

**Nota:** Después de modificar el archivo `.env`, reinicia la aplicación para que los cambios surtan efecto. Para cambios dinámicos en tiempo de ejecución, usa las funciones de gestión proporcionadas.