# Integración de configuración (.env, start.sh, tv/config/app.conf)

Este documento describe cómo se enlazan y validan los archivos de configuración del sistema:

- `./.env`: Configuración del addon principal (rutas, cachés, proveedores, TV CSV/M3U si son personalizados).
- `./start.sh`: Script de inicio que orquesta la generación de TV CSV/M3U y el arranque del addon.
- `./tv/config/app.conf`: Configuración interna de la librería IPTV (fuentes de canales y salidas por defecto en `tv/data`).

## Flujo de carga de configuración

1. `start.sh` carga `./.env` (si existe) y exporta las variables a su entorno de ejecución.
2. `start.sh` define rutas de salida por defecto para la librería IPTV, respetando la estructura interna:
   - `OUTPUT_CSV_PATH = tv/data/tv.csv`
   - `OUTPUT_M3U_PATH = tv/data/channels.m3u`
   - `CHANNELS_FILE = tv/data/channels.csv`
   - `PER_CHANNEL_M3U8_DIR = tv/data/m3u8`
3. Si no se define `M3U_URL` en `.env`, `start.sh` lo establece al M3U generado internamente (`OUTPUT_M3U_PATH`).
4. Si no se define `TV_CSV_PATH_DEFAULT` en `.env`, `start.sh` lo sincroniza con `OUTPUT_CSV_PATH`.
5. La librería IPTV se inicia en segundo plano (`bun run start` dentro de `tv/`), usando `app.conf` y las variables de entorno anteriores.
6. El addon principal se inicia después (otro `bun run start` en raíz). En runtime, el addon carga `.env` vía `src/config/loadEnv.js`.

## Compatibilidad entre `.env` y `app.conf`

La librería TV resuelve la ruta del CSV validado siguiendo esta prioridad:

1. `app.conf`: `VALIDATED_CHANNELS_CSV` (por defecto `data/tv.csv`)
2. Entorno: `OUTPUT_CSV_PATH`
3. Entorno: `VALIDATED_CHANNELS_CSV`
4. Default: `tv/data/tv.csv`

Por ello, si defines un `OUTPUT_CSV_PATH` distinto, la librería lo usará por encima de `VALIDATED_CHANNELS_CSV` de `app.conf`.

Asimismo, si no defines `M3U_URL` en `.env`, el addon usará el `OUTPUT_M3U_PATH` generado por la librería.

## Validaciones en `start.sh`

El script realiza comprobaciones antes de arrancar el addon:

- Carga `.env` si está presente y avisa si faltan variables críticas (`NODE_ENV`, `PORT`, `BASE_URL`, `DATA_TVS_DIR`, `DATA_TORRENTS_DIR`).
- Asegura la existencia de directorios para las salidas (CSV, M3U, M3U8).
- Compara valores de `app.conf` (`VALIDATED_CHANNELS_CSV`, `CHANNELS_FILE`, `PER_CHANNEL_M3U8_DIR`) con las variables de entorno derivadas y avisa si no coinciden (se priorizan las del entorno).
- Espera de forma robusta a que se generen `tv/data/tv.csv` y `tv/data/channels.m3u` (no vacíos) antes de arrancar el addon.

## Relación entre los archivos

- `.env` controla la configuración del addon y puede opcionalmente definir rutas de entrada/salida para TV.
- `start.sh` coordina la ejecución: 
  - Carga `.env` para que su entorno y la librería IPTV reciban las variables.
  - Inicia la librería IPTV y espera a sus salidas (`tv.csv`, `channels.m3u`).
  - Inicia el addon principal, que volverá a cargar `.env` en su propio proceso.
- `tv/config/app.conf` dicta los defaults para la librería TV. Las variables en el entorno (por ejemplo `OUTPUT_CSV_PATH`) pueden sobrescribir su comportamiento.

## Recomendaciones

- En desarrollo Windows, usa rutas relativas en `.env` (se resuelven correctamente por el addon y por `start.sh`).
- En contenedor, evita rutas de Windows. Usa defaults o define rutas POSIX bajo `/app`.
- Si deseas ubicar las salidas fuera de `tv/data`, define `OUTPUT_CSV_PATH`, `OUTPUT_M3U_PATH` y `PER_CHANNEL_M3U8_DIR` en `.env` y verifica los logs de compatibilidad que emite `start.sh`.