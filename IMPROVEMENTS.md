# Mejoras de Estabilidad y Calidad de Código

Este documento detalla una lista de posibles mejoras técnicas para fortalecer la estabilidad, mantenibilidad y robustez del proyecto `stremio-magnet-search-addon`, basado en el análisis del código fuente actual.


## 🛡️ Robustez y Manejo de Errores

- [x] **Actualización Atómica en `M3UTvRepository`**:
    - *Problema*: Actualmente `refreshTvs()` limpia el mapa `#tvs` antes de cargar los nuevos datos. Si la carga falla, el repositorio se queda vacío.
    - *Solución*: Cargar los datos en una variable temporal y solo reemplazar el mapa principal si la carga es exitosa.

- [x] **Mejora en Watchers de Archivos (`src/index.js`)**:
    - *Problema*: `fs.watch` nativo puede ser inestable (duplicación de eventos, inconsistencias entre OS).
    - *Solución*: Implementar un mecanismo de *debounce* más robusto o evaluar el uso de una librería probada como `chokidar` para la recarga en caliente de CSVs.

- [ ] **Validación de Configuración al Inicio**:
    - *Problema*: Las variables de entorno se leen en múltiples lugares y pueden fallar silenciosamente o causar errores en tiempo de ejecución.
    - *Solución*: Centralizar y validar estrictamente todas las variables de entorno al inicio (ej. usando `zod` en `addonConfig.js`) para asegurar un "Fail Fast".

## ⚡ Concurrencia y Rendimiento

- [ ] **Manejo de Reinicialización en `CascadingMagnetRepository`**:
    - *Problema*: `reinitializeSecondaryRepository` reemplaza la instancia del repositorio. Si hay búsquedas en curso usando la referencia anterior, podría haber inconsistencias.
    - *Solución*: Implementar un método `updateData()` dentro de los repositorios CSV que actualice sus datos internos sin destruir la instancia del repositorio.

- [ ] **Optimización de `M3UParser`**:
    - *Problema*: Carga todo el contenido del archivo M3U en memoria como string antes de parsear.
    - *Solución*: Si se esperan listas M3U muy grandes, evaluar el uso de streams para procesar el archivo línea por línea y reducir el consumo de memoria.

## 🧹 Calidad de Código y Refactorización

- [ ] **Refactorización de `CascadingMagnetRepository`**:
    - *Problema*: Los métodos `getMagnetsByImdbId` y `getMagnetsByContentId` son excesivamente largos y complejos (complejidad ciclomática alta).
    - *Solución*: Extraer la lógica de priorización y la lógica de búsqueda por fuente a métodos privados más pequeños o usar el patrón *Strategy* para las diferentes fuentes.

- [ ] **Inyección de Dependencias**:
    - *Problema*: Algunos servicios (`unifiedIdService`, `cacheService`) se importan directamente como singletons en los repositorios.
    - *Solución*: Pasar estas dependencias explícitamente en el constructor para facilitar el testing unitario y desacoplar componentes.

- [ ] **Tipado y JSDoc**:
    - *Problema*: Aunque es JavaScript, algunas firmas de métodos complejos podrían beneficiarse de JSDoc más estricto o validación de tipos en tiempo de ejecución para argumentos críticos.
    - *Solución*: Completar la documentación JSDoc en los métodos privados críticos.

## 🔍 Observabilidad

- [ ] **Contexto en Logs de Error**:
    - *Problema*: Algunos `catch` loggean el error pero podrían perder contexto de la solicitud original (ID, IP, etc.) si no se pasa explícitamente.
    - *Solución*: Asegurar que todos los logs de error críticos incluyan metadatos de la solicitud (RequestId) para facilitar la depuración.
