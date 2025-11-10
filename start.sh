#!/bin/sh
set -e

# ===============================
# 1) Iniciar Tor (solo en contenedor y si TOR_ENABLED=true)
# ===============================
if [ -z "$WINDOWS_DEV" ]; then
  # En contenedor, marcar flag para configuración del addon
  export CONTAINER_ENV=true
  if [ "${TOR_ENABLED:-false}" = "true" ]; then
    echo "Iniciando Tor..."
    gosu debian-tor /usr/bin/tor -f /etc/tor/torrc &
    TOR_PID=$!

    echo "Esperando a que Tor se inicie..."
    sleep 5
    if ! kill -0 "$TOR_PID" 2>/dev/null; then
      echo "Error: Tor no se pudo iniciar correctamente" >&2
      exit 1
    fi
    echo "Tor iniciado correctamente."
  else
    echo "TOR_ENABLED!=true, se omite inicio de Tor."
  fi
else
  echo "Modo desarrollo Windows (WINDOWS_DEV=1): se omite inicio de Tor."
fi

# ===============================
# 2) Resolver rutas de salida/entrada para la librería TV
# ===============================
if [ -z "$WINDOWS_DEV" ]; then
  # Entorno de producción/contendor: rutas bajo /app (respetando estructura interna de tv/)
  OUTPUT_CSV_PATH="${OUTPUT_CSV_PATH:-/app/tv/data/tv.csv}"
  OUTPUT_M3U_PATH="${OUTPUT_M3U_PATH:-/app/tv/data/channels.m3u}"
  CHANNELS_FILE="${CHANNELS_FILE:-/app/tv/data/channels.csv}"
  PER_CHANNEL_M3U8_DIR="${PER_CHANNEL_M3U8_DIR:-/app/tv/data/m3u8}"
else
  # Desarrollo local en Windows: rutas ABSOLUTAS derivadas del directorio del proyecto (respetando tv/data)
  SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
  OUTPUT_CSV_PATH="${OUTPUT_CSV_PATH:-$SCRIPT_DIR/tv/data/tv.csv}"
  OUTPUT_M3U_PATH="${OUTPUT_M3U_PATH:-$SCRIPT_DIR/tv/data/channels.m3u}"
  CHANNELS_FILE="${CHANNELS_FILE:-$SCRIPT_DIR/tv/data/channels.csv}"
  PER_CHANNEL_M3U8_DIR="${PER_CHANNEL_M3U8_DIR:-$SCRIPT_DIR/tv/data/m3u8}"
fi
export OUTPUT_CSV_PATH OUTPUT_M3U_PATH CHANNELS_FILE PER_CHANNEL_M3U8_DIR

# Asegurar directorios de salida existen
mkdir -p "$(dirname "$OUTPUT_CSV_PATH")" || true
mkdir -p "$(dirname "$OUTPUT_M3U_PATH")" || true
mkdir -p "$PER_CHANNEL_M3U8_DIR" || true

# Si no se define M3U_URL, usar el M3U generado internamente
export M3U_URL="${M3U_URL:-$OUTPUT_M3U_PATH}"

# Sincronizar ruta de CSV para el addon principal (usa TV_CSV_PATH_DEFAULT) respetando si ya viene definido
export TV_CSV_PATH_DEFAULT="${TV_CSV_PATH_DEFAULT:-$OUTPUT_CSV_PATH}"

echo "Rutas:"
echo "  OUTPUT_CSV_PATH=$OUTPUT_CSV_PATH"
echo "  OUTPUT_M3U_PATH=$OUTPUT_M3U_PATH"
echo "  CHANNELS_FILE=$CHANNELS_FILE"
echo "  PER_CHANNEL_M3U8_DIR=$PER_CHANNEL_M3U8_DIR"
echo "  TV_CSV_PATH_DEFAULT=$TV_CSV_PATH_DEFAULT"
echo "  M3U_URL=$M3U_URL"

# ===============================
# 3) Iniciar librería IPTV para generar CSV/M3U
# ===============================
echo "Iniciando librería IPTV (generación de CSV/M3U) en segundo plano..."
if [ -z "$WINDOWS_DEV" ]; then
  gosu appuser sh -lc 'cd tv && bun run start' &
else
  sh -lc 'cd tv && bun run start' &
fi
TV_PID=$!

# ===============================
# 4) Esperar a que se genere el CSV (con timeout)
# ===============================
# Espera robusta: mayor timeout por defecto y verificar que el archivo no esté vacío
WAIT_FOR_TV_SECONDS="${WAIT_FOR_TV_SECONDS:-180}"
COUNT=0
echo "Esperando generación de CSV en: $OUTPUT_CSV_PATH (timeout=${WAIT_FOR_TV_SECONDS}s)..."
while [ ! -s "$OUTPUT_CSV_PATH" ] && [ "$COUNT" -lt "$WAIT_FOR_TV_SECONDS" ]; do
  COUNT=$((COUNT + 1))
  # Si el proceso de TV terminó y no hay archivo, avisar
  if ! kill -0 "$TV_PID" 2>/dev/null; then
    echo ""
    echo "Aviso: el proceso de la librería IPTV (PID $TV_PID) terminó antes de generar el CSV."
    break
  fi
  # Progreso simple
  if [ $((COUNT % 10)) -eq 0 ]; then
    echo "  ... ${COUNT}s"
  else
    printf "."
  fi
  sleep 1
done
echo ""

if [ -s "$OUTPUT_CSV_PATH" ]; then
  echo "CSV de TV generado y no vacío: $OUTPUT_CSV_PATH"
else
  if [ -f "$OUTPUT_CSV_PATH" ]; then
    echo "Aviso: el CSV existe pero está vacío: $OUTPUT_CSV_PATH"
  else
    echo "Aviso: no se generó CSV dentro de ${WAIT_FOR_TV_SECONDS}s (se continuará igualmente)."
  fi
fi

# Esperar también por M3U si se está generando localmente
WAIT_FOR_M3U_SECONDS="${WAIT_FOR_M3U_SECONDS:-$WAIT_FOR_TV_SECONDS}"
M3U_COUNT=0
if [ -n "$OUTPUT_M3U_PATH" ]; then
  echo "Esperando generación de M3U en: $OUTPUT_M3U_PATH (timeout=${WAIT_FOR_M3U_SECONDS}s)..."
  while [ ! -s "$OUTPUT_M3U_PATH" ] && [ "$M3U_COUNT" -lt "$WAIT_FOR_M3U_SECONDS" ]; do
    M3U_COUNT=$((M3U_COUNT + 1))
    if ! kill -0 "$TV_PID" 2>/dev/null; then
      echo ""
      echo "Aviso: el proceso de la librería IPTV (PID $TV_PID) terminó antes de generar el M3U."
      break
    fi
    if [ $((M3U_COUNT % 10)) -eq 0 ]; then
      echo "  ... ${M3U_COUNT}s"
    else
      printf "."
    fi
    sleep 1
  done
  echo ""
  if [ -s "$OUTPUT_M3U_PATH" ]; then
    echo "M3U generado y no vacío: $OUTPUT_M3U_PATH"
  else
    if [ -f "$OUTPUT_M3U_PATH" ]; then
      echo "Aviso: el M3U existe pero está vacío: $OUTPUT_M3U_PATH"
    else
      echo "Aviso: no se generó M3U dentro de ${WAIT_FOR_M3U_SECONDS}s (se continuará igualmente)."
    fi
  fi
fi

# ===============================
# 5) Iniciar la aplicación principal (addon)
# ===============================
if [ -z "$WINDOWS_DEV" ]; then
  echo "Iniciando aplicación (addon) como appuser..."
  exec gosu appuser bun run start
else
  echo "Iniciando aplicación (addon) como root (modo desarrollo)..."
  exec bun run start
fi