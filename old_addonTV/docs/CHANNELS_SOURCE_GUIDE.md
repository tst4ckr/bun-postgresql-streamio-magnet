# 📋 Guía Completa de CHANNELS_SOURCE

## 🎯 Descripción General

La variable `CHANNELS_SOURCE` determina **de dónde** obtiene el sistema los canales de televisión. Cada opción tiene un comportamiento específico y casos de uso diferentes.

---

## 📊 Opciones Disponibles

### 1. 📄 `csv` - Solo Archivo Local

**¿Qué hace?**
- Lee **únicamente** el archivo CSV local especificado en `CHANNELS_FILE`
- **NO** descarga ni usa ninguna lista M3U remota
- Control total sobre los canales disponibles

**Configuración:**
```bash
CHANNELS_SOURCE=csv
CHANNELS_FILE=data/channels.csv
# M3U_URL y BACKUP_M3U_URL se IGNORAN
```

**Cuándo usar:**
- ✅ Quieres control total sobre cada canal
- ✅ Tienes una lista curada de canales verificados
- ✅ No dependes de fuentes externas
- ✅ Necesitas máxima estabilidad

**Ejemplo de flujo:**
```
1. Sistema inicia
2. Lee data/channels.csv
3. Carga solo esos canales
4. FIN - No busca más canales
```

---

### 2. 📁 `m3u` - Archivo M3U Local

**¿Qué hace?**
- Lee un archivo M3U/M3U8 que está **guardado localmente** en tu servidor
- **NO** descarga desde internet
- Útil si tienes un archivo M3U descargado manualmente

**Configuración:**
```bash
CHANNELS_SOURCE=m3u
CHANNELS_FILE=data/mi_lista.m3u8  # Archivo M3U local
# M3U_URL y BACKUP_M3U_URL se IGNORAN
```

**Cuándo usar:**
- ✅ Tienes un archivo M3U descargado
- ✅ Quieres usar formato M3U pero sin dependencia de internet
- ✅ El archivo M3U está en tu servidor local

**Ejemplo de flujo:**
```
1. Sistema inicia
2. Lee data/mi_lista.m3u8 (archivo local)
3. Parsea el formato M3U
4. Carga esos canales
5. FIN - No busca más canales
```

---

### 3. 🌐 `remote_m3u` - URL M3U Remota

**¿Qué hace?**
- Descarga una lista M3U desde una **URL de internet**

- Usa `BACKUP_M3U_URL` si la principal falla

**Configuración:**
```bash
CHANNELS_SOURCE=remote_m3u
M3U_URL=https://iptv-org.github.io/iptv/countries/mx.m3u8
BACKUP_M3U_URL=https://iptv-org.github.io/iptv/countries/pe.m3u8
# CHANNELS_FILE se IGNORA
```

**Cuándo usar:**
- ✅ Quieres canales siempre actualizados
- ✅ Usas listas públicas como IPTV-ORG
- ✅ No quieres mantener manualmente los canales
- ✅ Necesitas variedad de canales internacionales

**Ejemplo de flujo:**
```
1. Sistema inicia
2. Descarga desde M3U_URL
3. Si falla, intenta BACKUP_M3U_URL
4. Parsea y carga canales
5. Cada X horas repite el proceso
```

---

### 4. 🔄 `hybrid` - Combinación Inteligente

**¿Qué hace?**
- **PRIMERO**: Carga canales del CSV local (prioridad máxima)
- **SEGUNDO**: Agrega canales de M3U_URL (sin duplicar)
- **TERCERO**: Agrega canales de BACKUP_M3U_URL (sin duplicar)
- Elimina automáticamente duplicados basándose en el ID del canal

**Configuración:**
```bash
CHANNELS_SOURCE=hybrid
CHANNELS_FILE=data/channels.csv                    # Canales prioritarios
M3U_URL=https://iptv-org.github.io/iptv/countries/mx.m3u8
BACKUP_M3U_URL=https://iptv-org.github.io/iptv/countries/pe.m3u8
```

**Cuándo usar:**
- ✅ Quieres lo mejor de ambos mundos
- ✅ Tienes canales premium/verificados en CSV
- ✅ Quieres ampliar con canales públicos
- ✅ Necesitas máxima variedad sin duplicados

**Ejemplo de flujo:**
```
1. Sistema inicia
2. Carga data/channels.csv (24 canales) ← PRIORIDAD
3. Descarga M3U_URL (300 canales)
4. Agrega solo canales nuevos (sin duplicar)
5. Descarga BACKUP_M3U_URL (200 canales)
6. Agrega solo canales nuevos (sin duplicar)
7. Resultado: 450 canales únicos
```

---

## 🔍 Comparación Detallada

| Característica | `csv` | `m3u` | `remote_m3u` | `hybrid` |
|---|---|---|---|---|
| **Fuente de datos** | Solo CSV local | Solo M3U local | Solo M3U remoto | CSV + M3U remotos |
| **Control total** | ✅ Máximo | ✅ Alto | ❌ Limitado | ✅ Parcial |
| **Actualización automática** | ❌ No | ❌ No | ✅ Sí | ✅ Sí |
| **Dependencia de internet** | ❌ No | ❌ No | ✅ Sí | ✅ Parcial |
| **Variedad de canales** | ⚠️ Limitada | ⚠️ Limitada | ✅ Alta | ✅ Máxima |
| **Eliminación de duplicados** | N/A | N/A | N/A | ✅ Automática |
| **Failover/Respaldo** | ❌ No | ❌ No | ✅ Sí | ✅ Sí |
| **Canales prioritarios** | ✅ Todos | ✅ Todos | ❌ No | ✅ CSV primero |

---

## 🎯 Casos de Uso Recomendados

### 🏢 **Proveedor IPTV Profesional**
```bash
CHANNELS_SOURCE=hybrid
CHANNELS_FILE=data/premium_channels.csv  # Canales premium verificados
M3U_URL=https://fuente-publica-1.m3u8    # Canales gratuitos adicionales
BACKUP_M3U_URL=https://fuente-publica-2.m3u8
```
**Resultado**: Canales premium + variedad pública sin duplicados

### 🏠 **Uso Personal/Familiar**
```bash
CHANNELS_SOURCE=remote_m3u
M3U_URL=https://iptv-org.github.io/iptv/countries/mx.m3u8
BACKUP_M3U_URL=https://iptv-org.github.io/iptv/languages/spa.m3u8
```
**Resultado**: Canales mexicanos + españoles, siempre actualizados

### 🔧 **Desarrollo/Pruebas**
```bash
CHANNELS_SOURCE=csv
CHANNELS_FILE=data/test_channels.csv  # Solo 5-10 canales de prueba
```
**Resultado**: Entorno controlado para desarrollo

### 🌍 **Agregador de Contenido**
```bash
CHANNELS_SOURCE=hybrid
CHANNELS_FILE=data/local_verified.csv     # Canales locales verificados
M3U_URL=https://iptv-org.github.io/iptv/countries/mx.m3u8  # Nacionales
BACKUP_M3U_URL=https://iptv-org.github.io/iptv/regions/int.m3u8  # Internacionales
```
**Resultado**: Máxima variedad con calidad garantizada

---

## ⚙️ Configuración Paso a Paso

### Para `csv`:
1. Crea/edita `data/channels.csv`
2. Configura `CHANNELS_SOURCE=csv`
3. Especifica `CHANNELS_FILE=data/channels.csv`
4. ✅ Listo

### Para `remote_m3u`:
1. Encuentra una URL M3U válida
2. Configura `CHANNELS_SOURCE=remote_m3u`
3. Especifica `M3U_URL=tu-url-aqui`
4. Opcionalmente `BACKUP_M3U_URL=url-respaldo`
5. ✅ Listo

### Para `hybrid` (Recomendado):
1. Crea `data/channels.csv` con tus canales prioritarios
2. Configura `CHANNELS_SOURCE=hybrid`
3. Especifica `CHANNELS_FILE=data/channels.csv`
4. Especifica `M3U_URL=url-principal`
5. Especifica `BACKUP_M3U_URL=url-respaldo`
6. ✅ Listo - Tendrás lo mejor de todo

---

## 🚨 Errores Comunes

### ❌ **"No se cargan canales"**
- **Causa**: `CHANNELS_SOURCE` mal configurado
- **Solución**: Verifica que coincida exactamente: `csv`, `m3u`, `remote_m3u`, o `hybrid`

### ❌ **"Solo aparecen canales CSV en hybrid"**
- **Causa**: URLs M3U inválidas o sin conexión
- **Solución**: Verifica que `M3U_URL` y `BACKUP_M3U_URL` sean accesibles

### ❌ **"Muchos canales duplicados"**
- **Causa**: Solo ocurre en `hybrid`, es normal
- **Solución**: El sistema los elimina automáticamente, revisa logs

### ❌ **"Archivo CSV no encontrado"**
- **Causa**: Ruta incorrecta en `CHANNELS_FILE`
- **Solución**: Verifica que el archivo existe en la ruta especificada

---

## 🔧 Comandos de Diagnóstico

```bash
# Probar configuración actual
node scripts/test-hybrid-repository.js

# Ver estadísticas detalladas
echo "Configuración actual:"
grep CHANNELS_ .env

# Migrar a hybrid automáticamente
node scripts/migrate-to-hybrid.js

# Validar canales
node scripts/test-batch-validation.js
```

---

## 📚 Documentación Relacionada

- 📖 **Guía Completa Hybrid**: [docs/HYBRID_REPOSITORY.md](HYBRID_REPOSITORY.md)
- 🔧 **Configuración Avanzada**: [docs/REMOVE_INVALID_STREAMS.md](REMOVE_INVALID_STREAMS.md)
- ⚙️ **Variables de Entorno**: [.env.example](../.env.example)
- 📋 **README Principal**: [README.md](../README.md)

---

## 💡 Recomendación Final

**Para la mayoría de casos, recomendamos `CHANNELS_SOURCE=hybrid`** porque:

✅ Combina control total (CSV) con variedad (M3U)  
✅ Elimina duplicados automáticamente  
✅ Tiene failover integrado  
✅ Se actualiza automáticamente  
✅ Máxima flexibilidad  

**¿Necesitas ayuda decidiendo?** Ejecuta:
```bash
node scripts/migrate-to-hybrid.js
```
Este script analizará tu configuración actual y te dará recomendaciones personalizadas.