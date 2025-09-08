# Implementación de Búsqueda con Fallback de Idioma

## Resumen

Se ha implementado un sistema de búsqueda en cascada que prioriza contenido en español antes de recurrir a una búsqueda más amplia que incluye trackers en inglés. Esta mejora optimiza la relevancia de los resultados para usuarios de habla hispana.

## Cambios Realizados

### 1. Configuración de Proveedores por Idioma (`src/config/addonConfig.js`)

Se añadieron configuraciones específicas para cada tipo de contenido:

```javascript
languageConfigs: {
  spanish: {
    providers: 'mejortorrent,wolfmax4k,cinecalidad',
    priorityLanguage: 'spanish'
  },
  combined: {
    providers: 'mejortorrent,wolfmax4k,cinecalidad,yts,eztv,rarbg,1337x,thepiratebay',
    priorityLanguage: 'spanish'
  }
}
```

**Variables de entorno soportadas:**
- `TORRENTIO_MOVIE_PROVIDERS_ES`: Proveedores en español para películas
- `TORRENTIO_MOVIE_PROVIDERS_COMBINED`: Proveedores combinados para películas
- `TORRENTIO_SERIES_PROVIDERS_ES`: Proveedores en español para series
- `TORRENTIO_SERIES_PROVIDERS_COMBINED`: Proveedores combinados para series
- `TORRENTIO_ANIME_PROVIDERS_ES`: Proveedores en español para anime
- `TORRENTIO_ANIME_PROVIDERS_COMBINED`: Proveedores combinados para anime

### 2. Servicio de API con Fallback (`src/infrastructure/services/TorrentioApiService.js`)

#### Nuevo Método: `searchMagnetsWithLanguageFallback`

Implementa la lógica de búsqueda en dos pasos:

1. **Primera búsqueda**: Solo trackers en español
2. **Segunda búsqueda**: Trackers combinados (español + inglés)

```javascript
async searchMagnetsWithLanguageFallback(contentId, type = 'auto', season = null, episode = null)
```

#### Método Auxiliar: `#searchWithLanguageConfig`

Maneja la aplicación temporal de configuraciones de idioma específicas sin afectar la configuración global del servicio.

### 3. Repositorio en Cascada (`src/infrastructure/repositories/CascadingMagnetRepository.js`)

Se modificó el método `#fallbackSearch` para usar el nuevo flujo:

```javascript
// Antes
const apiResults = await this.#torrentioApiService.searchMagnetsById(contentId, type);

// Después
const apiResults = await this.#torrentioApiService.searchMagnetsWithLanguageFallback(contentId, type);
```

## Flujo de Búsqueda Actualizado

```
1. Búsqueda en archivos CSV locales
   ├── magnets.csv
   ├── torrentio.csv
   └── anime.csv (solo para anime)

2. Si no hay resultados → API Torrentio con fallback de idioma
   ├── Primera búsqueda: Trackers en español
   │   ├── mejortorrent
   │   ├── wolfmax4k
   │   └── cinecalidad
   │
   └── Si no hay resultados → Segunda búsqueda: Trackers combinados
       ├── Trackers en español (mejortorrent, wolfmax4k, cinecalidad)
       └── Trackers en inglés (yts, eztv, rarbg, 1337x, thepiratebay, etc.)

3. Guardar resultados en CSV correspondiente
```

## Configuraciones por Tipo de Contenido

### Películas
- **Español**: `mejortorrent,wolfmax4k,cinecalidad`
- **Combinado**: `mejortorrent,wolfmax4k,cinecalidad,yts,eztv,rarbg,1337x,thepiratebay`

### Series
- **Español**: `mejortorrent,wolfmax4k,cinecalidad`
- **Combinado**: `mejortorrent,wolfmax4k,cinecalidad,eztv,rarbg,1337x,thepiratebay,horriblesubs,nyaasi`

### Anime
- **Español**: `mejortorrent,wolfmax4k,cinecalidad`
- **Combinado**: `horriblesubs,nyaasi,tokyotosho,anidex,subsplease,erai-raws,mejortorrent,wolfmax4k,cinecalidad`

## Beneficios

1. **Priorización de contenido en español**: Los usuarios obtienen primero resultados en su idioma preferido
2. **Fallback robusto**: Si no hay contenido en español, se amplía la búsqueda automáticamente
3. **Configuración flexible**: Cada tipo de contenido puede tener diferentes proveedores
4. **Variables de entorno**: Fácil personalización sin modificar código
5. **Compatibilidad**: Mantiene toda la funcionalidad existente

## Logging y Monitoreo

El sistema registra cada paso del proceso:

```
[INFO] Iniciando búsqueda con fallback de idioma para tt1234567
[INFO] Primera búsqueda: trackers en español para tt1234567
[INFO] Encontrados 5 resultados en trackers españoles
```

O en caso de fallback:

```
[INFO] Primera búsqueda: trackers en español para tt1234567
[INFO] Segunda búsqueda: trackers combinados para tt1234567
[INFO] Encontrados 12 resultados en trackers combinados
```

## Pruebas

Se incluyen scripts de prueba:

- `test/simple-config-test.js`: Verificación de configuraciones
- `test/language-fallback-test.js`: Pruebas completas del flujo

## Compatibilidad

- ✅ Mantiene compatibilidad con métodos existentes
- ✅ No afecta configuraciones actuales
- ✅ Funciona con todos los tipos de contenido (movie, series, anime)
- ✅ Preserva funcionalidad de cache y logging

## Configuración Recomendada

Para optimizar resultados, se recomienda configurar las siguientes variables en `.env`:

```env
# Proveedores en español
TORRENTIO_MOVIE_PROVIDERS_ES=mejortorrent,wolfmax4k,cinecalidad
TORRENTIO_SERIES_PROVIDERS_ES=mejortorrent,wolfmax4k,cinecalidad
TORRENTIO_ANIME_PROVIDERS_ES=mejortorrent,wolfmax4k,cinecalidad

# Proveedores combinados (español + inglés)
TORRENTIO_MOVIE_PROVIDERS_COMBINED=mejortorrent,wolfmax4k,cinecalidad,yts,eztv,rarbg,1337x
TORRENTIO_SERIES_PROVIDERS_COMBINED=mejortorrent,wolfmax4k,cinecalidad,eztv,rarbg,1337x,horriblesubs,nyaasi
TORRENTIO_ANIME_PROVIDERS_COMBINED=horriblesubs,nyaasi,tokyotosho,anidex,subsplease,erai-raws,mejortorrent,wolfmax4k,cinecalidad
```