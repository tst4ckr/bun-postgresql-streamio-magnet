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
  # Entorno de producción/contendor: rutas bajo /app
  OUTPUT_CSV_PATH="${OUTPUT_CSV_PATH:-/app/data/tvs/tv.csv}"
  OUTPUT_M3U_PATH="${OUTPUT_M3U_PATH:-/app/data/tvs/channels.m3u}"
  CHANNELS_FILE="${CHANNELS_FILE:-/app/tv/data/channels.csv}"
  PER_CHANNEL_M3U8_DIR="${PER_CHANNEL_M3U8_DIR:-/app/data/m3u8}"
else
  # Desarrollo local en Windows: rutas ABSOLUTAS derivadas del directorio del proyecto
  SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
  OUTPUT_CSV_PATH="${OUTPUT_CSV_PATH:-$SCRIPT_DIR/data/tvs/tv.csv}"
  OUTPUT_M3U_PATH="${OUTPUT_M3U_PATH:-$SCRIPT_DIR/data/tvs/channels.m3u}"
  CHANNELS_FILE="${CHANNELS_FILE:-$SCRIPT_DIR/tv/data/channels.csv}"
  PER_CHANNEL_M3U8_DIR="${PER_CHANNEL_M3U8_DIR:-$SCRIPT_DIR/data/m3u8}"
fi
export OUTPUT_CSV_PATH OUTPUT_M3U_PATH CHANNELS_FILE PER_CHANNEL_M3U8_DIR

# Sincronizar ruta de CSV para el addon principal (usa TV_CSV_PATH_DEFAULT)
export TV_CSV_PATH_DEFAULT="$OUTPUT_CSV_PATH"

echo "Rutas:"
echo "  OUTPUT_CSV_PATH=$OUTPUT_CSV_PATH"
echo "  OUTPUT_M3U_PATH=$OUTPUT_M3U_PATH"
echo "  CHANNELS_FILE=$CHANNELS_FILE"
echo "  PER_CHANNEL_M3U8_DIR=$PER_CHANNEL_M3U8_DIR"
echo "  TV_CSV_PATH_DEFAULT=$TV_CSV_PATH_DEFAULT"

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
WAIT_FOR_TV_SECONDS="${WAIT_FOR_TV_SECONDS:-90}"
COUNT=0
until [ -f "$OUTPUT_CSV_PATH" ] || [ "$COUNT" -ge "$WAIT_FOR_TV_SECONDS" ]; do
  COUNT=$((COUNT + 1))
  sleep 1
done

if [ -f "$OUTPUT_CSV_PATH" ]; then
  echo "CSV de TV generado: $OUTPUT_CSV_PATH"
else
  echo "Aviso: no se generó CSV dentro de ${WAIT_FOR_TV_SECONDS}s (se continuará igualmente)."
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