# Inicialización Automática de Archivos CSV

## Descripción General

El sistema implementa una funcionalidad robusta de inicialización automática de archivos CSV que garantiza que todos los archivos necesarios existan antes de que el sistema inicie, evitando errores de "archivo no encontrado" tanto en desarrollo como en producción.

## Archivos Gestionados

El sistema gestiona automáticamente los siguientes archivos CSV:

- **anime.csv** - Repositorio de contenido anime
- **english.csv** - Repositorio de contenido en inglés
- **magnets.csv** - Repositorio principal de magnets
- **torrentio.csv** - Repositorio de datos de Torrentio

## Formato Estándar

Todos los archivos CSV utilizan el mismo formato de cabeceras:

```csv
content_id,name,magnet,quality,size,source,fileIdx,filename,provider,seeders,peers,season,episode,imdb_id,id_type
```

## Implementación

### CsvFileInitializer

La clase `CsvFileInitializer` proporciona las siguientes funcionalidades:

#### Métodos Principales

- **`initializeAllCsvFiles(dataDirectory)`** - Inicializa todos los archivos CSV necesarios
- **`ensureCsvFileExists(filePath, filename)`** - Verifica/crea un archivo específico
- **`validateCsvFormat(filePath)`** - Valida el formato de cabeceras
- **`repairCsvFormat(filePath, filename)`** - Repara archivos con formato incorrecto

#### Características

- ✅ **Creación automática** de directorios padre
- ✅ **Verificación de existencia** antes de crear
- ✅ **Validación de formato** de cabeceras
- ✅ **Logging detallado** de todas las operaciones
- ✅ **Manejo de errores** robusto

### Integración con CascadingMagnetRepository

La inicialización se ejecuta automáticamente durante el proceso de inicialización del repositorio:

```javascript
// En el método initialize()
const dataDirectory = dirname(this.#secondaryCsvPath);
CsvFileInitializer.initializeAllCsvFiles(dataDirectory);
```

## Flujo de Inicialización

1. **Detección del directorio de datos** basado en la ruta de archivos CSV
2. **Creación del directorio** si no existe
3. **Verificación de cada archivo CSV**:
   - Si existe: Log de verificación
   - Si no existe: Creación con cabeceras estándar
4. **Inicialización de repositorios** una vez garantizada la existencia de archivos

## Beneficios

### Robustez
- ❌ **Elimina errores** de "archivo no encontrado"
- 🔄 **Recuperación automática** de archivos faltantes
- 🛡️ **Funcionamiento garantizado** en cualquier entorno

### Compatibilidad
- 🐳 **Docker**: Funciona en contenedores
- 💻 **Desarrollo local**: Funciona en entornos de desarrollo
- 🚀 **Producción**: Funciona en despliegues

### Mantenimiento
- 📝 **Logging detallado** de todas las operaciones
- 🔍 **Validación de formato** automática
- 🔧 **Reparación automática** de formatos incorrectos

## Casos de Uso

### Primer Inicio
Cuando el sistema se ejecuta por primera vez en un entorno limpio:
```
[CsvFileInitializer] Directorio creado: ./data
[CsvFileInitializer] Archivo creado: anime.csv
[CsvFileInitializer] Archivo creado: english.csv
[CsvFileInitializer] Archivo creado: magnets.csv
[CsvFileInitializer] Archivo creado: torrentio.csv
```

### Archivos Faltantes
Cuando algunos archivos han sido eliminados accidentalmente:
```
[CsvFileInitializer] Archivo creado: english.csv
[CsvFileInitializer] Archivo verificado: anime.csv
[CsvFileInitializer] Archivo verificado: magnets.csv
[CsvFileInitializer] Archivo verificado: torrentio.csv
```

### Sistema Estable
Cuando todos los archivos ya existen:
```
[CsvFileInitializer] Archivo verificado: anime.csv
[CsvFileInitializer] Archivo verificado: english.csv
[CsvFileInitializer] Archivo verificado: magnets.csv
[CsvFileInitializer] Archivo verificado: torrentio.csv
```

## Pruebas

El sistema incluye un script de prueba completo:

```bash
bun run test-csv-auto-creation.js
```

Este script:
1. Verifica el estado inicial
2. Simula la eliminación de archivos
3. Ejecuta la inicialización automática
4. Valida la recreación y formato

## Configuración

No se requiere configuración adicional. El sistema:
- Detecta automáticamente el directorio de datos
- Utiliza rutas relativas para máxima compatibilidad
- Se integra transparentemente con la arquitectura existente

## Consideraciones de Rendimiento

- **Operaciones de E/S mínimas**: Solo verifica existencia y crea si es necesario
- **Ejecución única**: Se ejecuta solo durante la inicialización
- **Paralelización**: Compatible con la inicialización paralela de repositorios
- **Sin impacto en runtime**: No afecta el rendimiento durante la operación normal

## Mantenimiento y Extensión

Para agregar nuevos archivos CSV al sistema:

1. Añadir el nombre del archivo al array `csvFiles` en `CsvFileInitializer`
2. El sistema automáticamente gestionará el nuevo archivo
3. No se requieren cambios adicionales en el código

Esta implementación garantiza un sistema robusto, autónomo y adaptable que funciona consistentemente en todos los entornos.