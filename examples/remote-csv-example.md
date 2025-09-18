# 🌐 Ejemplo de Uso con URL Remota

Este ejemplo muestra cómo configurar el addon para cargar magnets desde una URL remota.

## 📋 Configuración

### 1. Actualizar variables de entorno

Edita tu archivo `.env` para usar una URL remota:

```bash
# Cambiar de archivo local a URL remota
CSV_SOURCE=https://raw.githubusercontent.com/tu-usuario/magnets-db/main/magnets.csv

# Configurar timeout (opcional, por defecto 30 segundos)
CSV_TIMEOUT=45000

# Otras configuraciones
PORT=3000
LOG_LEVEL=info
```

### 2. Formato del CSV remoto

El archivo CSV remoto debe tener el siguiente formato:

```csv
imdb_id,title,year,quality,magnet_link,size,seeders,leechers
tt1234567,"Película Ejemplo",2023,1080p,"magnet:?xt=urn:btih:...","2.5GB",150,10
tt7654321,"Serie Ejemplo S01E01",2023,720p,"magnet:?xt=urn:btih:...","1.2GB",89,5
```

### 3. Reiniciar el addon

```bash
# Detener el addon actual
# Ctrl+C en la terminal donde está corriendo

# Iniciar con la nueva configuración
bun run src/index.js
```

## 🔍 Verificación

Cuando el addon se inicie, verás logs similares a:

```
[INFO] Creando repositorio remoto para URL: https://raw.githubusercontent.com/...
[INFO] Descargando CSV desde URL remota...
[INFO] Repositorio de magnets inicializado.
[INFO] Addon builder creado: Magnet Search v1.0.0
```

## ⚠️ Consideraciones

1. **Conectividad**: Asegúrate de tener conexión a internet
2. **Timeout**: URLs lentas pueden necesitar un timeout mayor
3. **Formato**: El CSV remoto debe seguir exactamente el formato esperado
4. **CORS**: Si usas el addon desde un navegador, la URL debe permitir CORS
5. **Actualización**: El addon carga los datos al iniciar, reinicia para obtener datos actualizados

## 🚀 Ventajas de URLs Remotas

- ✅ **Centralización**: Un solo archivo CSV para múltiples instancias
- ✅ **Actualización**: Cambios automáticos al reiniciar el addon
- ✅ **Colaboración**: Múltiples usuarios pueden mantener la misma base de datos
- ✅ **Backup**: Los datos están en la nube
- ✅ **Escalabilidad**: Fácil distribución de contenido

## 🔄 Volver a Archivo Local

Para volver a usar un archivo local:

```bash
# En .env
CSV_SOURCE=./data/torrents/magnets.csv
```

Y reinicia el addon.