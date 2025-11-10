#!/bin/sh
set -e

# ===============================
# 0) Cargar variables desde .env (solo en desarrollo Windows)
# ===============================
PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$PROJECT_DIR/.env"
if [ -n "$WINDOWS_DEV" ]; then
  if [ -f "$ENV_FILE" ]; then
    echo "Cargando variables desde .env (WINDOWS_DEV=1): $ENV_FILE"
    # Exportar automáticamente las variables definidas en .env
    set -a
    . "$ENV_FILE"
    set +a
  else
    echo "Aviso: no se encontró .env en $ENV_FILE (WINDOWS_DEV=1). Se continuarán con variables de entorno actuales."
  fi
else
  echo "Modo contenedor/producción: se omite carga de .env desde start.sh para priorizar variables del contenedor y runtime."
fi

# Archivo de configuración de la librería TV
CONFIG_FILE="${CONFIG_FILE:-tv/config/app.conf}"
if [ -f "$CONFIG_FILE" ]; then
  echo "Usando app.conf: $CONFIG_FILE"
else
  echo "Aviso: no se encontró app.conf en $CONFIG_FILE"
fi

# Validación mínima de variables críticas del addon
REQUIRED_ENV_VARS="NODE_ENV PORT BASE_URL DATA_TVS_DIR DATA_TORRENTS_DIR"
MISSING_VARS=""
for v in $REQUIRED_ENV_VARS; do
  eval "val=\${$v}"
  if [ -z "$val" ]; then
    MISSING_VARS="$MISSING_VARS $v"
  fi
done
if [ -n "$MISSING_VARS" ]; then
  echo "Aviso: faltan variables críticas en .env o entorno:$MISSING_VARS"
fi

# ===============================
# 1) Iniciar Tor (solo en contenedor y si TOR_ENABLED=true)
# ===============================
if [ -z "$WINDOWS_DEV" ]; then
  # En contenedor, marcar flag para configuración del addon
  export CONTAINER_ENV=true
  export TOR_ENABLED=true
  echo "Iniciando Tor (forzado en contenedor)..."
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
  echo "Modo desarrollo Windows (WINDOWS_DEV=1): se omite inicio de Tor."
fi

# ===============================
# 2) Resolver rutas de salida/entrada para la librería TV
# ===============================
if [ -z "$WINDOWS_DEV" ]; then
  # Entorno de producción/contendor: rutas bajo /app (respetando estructura interna de tv/)
  TV_DIR="/app/tv"
  # Guardar salidas dentro de /app/data para que el addon las publique
  OUTPUT_CSV_PATH="${OUTPUT_CSV_PATH:-/app/data/tvs/tv.csv}"
  OUTPUT_M3U_PATH="${OUTPUT_M3U_PATH:-/app/data/tvs/channels.m3u}"
  CHANNELS_FILE="${CHANNELS_FILE:-/app/data/tvs/channels.csv}"
  PER_CHANNEL_M3U8_DIR="${PER_CHANNEL_M3U8_DIR:-/app/data/m3u8}"
else
  # Desarrollo local en Windows: rutas ABSOLUTAS derivadas del directorio del proyecto (respetando tv/data)
  SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
  TV_DIR="$SCRIPT_DIR/tv"
  # Guardar salidas dentro de ./data para que el addon las publique
  OUTPUT_CSV_PATH="${OUTPUT_CSV_PATH:-$SCRIPT_DIR/data/tvs/tv.csv}"
  OUTPUT_M3U_PATH="${OUTPUT_M3U_PATH:-$SCRIPT_DIR/data/tvs/channels.m3u}"
  CHANNELS_FILE="${CHANNELS_FILE:-$SCRIPT_DIR/data/tvs/channels.csv}"
  PER_CHANNEL_M3U8_DIR="${PER_CHANNEL_M3U8_DIR:-$SCRIPT_DIR/data/m3u8}"
fi
export OUTPUT_CSV_PATH OUTPUT_M3U_PATH CHANNELS_FILE PER_CHANNEL_M3U8_DIR

# Asegurar directorios de salida existen
mkdir -p "$(dirname "$OUTPUT_CSV_PATH")" || true
mkdir -p "$(dirname "$OUTPUT_M3U_PATH")" || true
mkdir -p "$PER_CHANNEL_M3U8_DIR" || true
mkdir -p "$(dirname "$CHANNELS_FILE")" || true

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
# 2.1) Validación de compatibilidad .env <-> app.conf
# ===============================
if [ -f "$CONFIG_FILE" ]; then
  # Sincronizar app.conf con las rutas de salida deseadas para publicación web
  # (si existe una clave, la actualizamos para evitar que la librería use defaults internos)
  update_conf_line() {
    KEY="$1"; VAL="$2"
    if [ -n "$VAL" ]; then
      ESC_VAL=$(printf '%s' "$VAL" | sed 's/[\\\/&]/\\&/g')
      if grep -q "^${KEY}=" "$CONFIG_FILE"; then
        sed -i "s|^${KEY}=.*|${KEY}=${ESC_VAL}|" "$CONFIG_FILE" || true
      else
        # Si la clave no existe, la añadimos al final
        printf "\n%s=%s\n" "$KEY" "$VAL" >> "$CONFIG_FILE"
      fi
    fi
  }
  update_conf_line "VALIDATED_CHANNELS_CSV" "$OUTPUT_CSV_PATH"
  update_conf_line "PER_CHANNEL_M3U8_DIR" "$PER_CHANNEL_M3U8_DIR"
  update_conf_line "CHANNELS_FILE" "$CHANNELS_FILE"

  # Extraer valores clave desde app.conf
  APP_VALIDATED_CSV=$(grep -E '^VALIDATED_CHANNELS_CSV=' "$CONFIG_FILE" | tail -n1 | cut -d'=' -f2)
  APP_CHANNELS_FILE=$(grep -E '^CHANNELS_FILE=' "$CONFIG_FILE" | tail -n1 | cut -d'=' -f2)
  APP_M3U8_DIR=$(grep -E '^PER_CHANNEL_M3U8_DIR=' "$CONFIG_FILE" | tail -n1 | cut -d'=' -f2)
  # Resolver rutas relativas de app.conf respecto a TV_DIR
  case "$APP_VALIDATED_CSV" in
    http*|file://*|/*|[A-Za-z]:\\*) RESOLVED_APP_VALIDATED="$APP_VALIDATED_CSV" ;;
    *) RESOLVED_APP_VALIDATED="$TV_DIR/${APP_VALIDATED_CSV}" ;;
  esac
  case "$APP_CHANNELS_FILE" in
    http*|file://*|/*|[A-Za-z]:\\*) RESOLVED_APP_CHANNELS="$APP_CHANNELS_FILE" ;;
    *) RESOLVED_APP_CHANNELS="$TV_DIR/${APP_CHANNELS_FILE}" ;;
  esac
  case "$APP_M3U8_DIR" in
    http*|file://*|/*|[A-Za-z]:\\*) RESOLVED_APP_M3U8_DIR="$APP_M3U8_DIR" ;;
    *) RESOLVED_APP_M3U8_DIR="$TV_DIR/${APP_M3U8_DIR}" ;;
  esac

  echo "Compatibilidad .env/app.conf:"
  echo "  app.conf VALIDATED_CHANNELS_CSV=$APP_VALIDATED_CSV -> $RESOLVED_APP_VALIDATED"
  echo "  app.conf CHANNELS_FILE=$APP_CHANNELS_FILE -> $RESOLVED_APP_CHANNELS"
  echo "  app.conf PER_CHANNEL_M3U8_DIR=$APP_M3U8_DIR -> $RESOLVED_APP_M3U8_DIR"
  # Comprobar alineación
  if [ "$RESOLVED_APP_VALIDATED" != "$OUTPUT_CSV_PATH" ]; then
    echo "Aviso: OUTPUT_CSV_PATH ($OUTPUT_CSV_PATH) no coincide con VALIDATED_CHANNELS_CSV de app.conf ($RESOLVED_APP_VALIDATED). Se usará OUTPUT_CSV_PATH para generación."
  fi
  if [ "$RESOLVED_APP_CHANNELS" != "$CHANNELS_FILE" ]; then
    echo "Aviso: CHANNELS_FILE ($CHANNELS_FILE) no coincide con app.conf ($RESOLVED_APP_CHANNELS). Se usará CHANNELS_FILE del entorno."
  fi
  if [ "$RESOLVED_APP_M3U8_DIR" != "$PER_CHANNEL_M3U8_DIR" ]; then
    echo "Aviso: PER_CHANNEL_M3U8_DIR ($PER_CHANNEL_M3U8_DIR) no coincide con app.conf ($RESOLVED_APP_M3U8_DIR). Se usará PER_CHANNEL_M3U8_DIR del entorno."
  fi
fi

# ===============================
# 2.2) Semilla de CHANNELS_FILE si falta (copiar desde tv/data/channels.csv)
# ===============================
if [ ! -f "$CHANNELS_FILE" ] && [ -f "$TV_DIR/data/channels.csv" ]; then
  echo "Sembrando CHANNELS_FILE en $CHANNELS_FILE desde $TV_DIR/data/channels.csv"
  cp "$TV_DIR/data/channels.csv" "$CHANNELS_FILE" || true
fi

# ===============================
# 3) Iniciar librería IPTV para generar CSV/M3U
# ===============================
echo "Iniciando librería IPTV (generación de CSV/M3U) en segundo plano..."
# Verificar que Bun esté disponible
if ! command -v bun >/dev/null 2>&1; then
  echo "Error: Bun no está instalado o no está en PATH. Instálalo y vuelve a intentar (https://bun.sh)." >&2
  exit 1
fi

TV_LOG_FILE="${TV_LOG_FILE:-$PROJECT_DIR/data/tvs/tv-generator.log}"
mkdir -p "$(dirname "$TV_LOG_FILE")" || true
echo "Logs de la librería IPTV: $TV_LOG_FILE"
if [ -z "$WINDOWS_DEV" ]; then
  gosu appuser sh -lc 'cd tv && bun run start 2>&1 | tee -a ../data/tvs/tv-generator.log' &
else
  sh -lc 'cd tv && bun run start 2>&1 | tee -a "$PROJECT_DIR/data/tvs/tv-generator.log"' &
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
    echo "Últimas líneas de log de la librería IPTV:"
    tail -n 50 "$TV_LOG_FILE" 2>/dev/null || true
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
      echo "Últimas líneas de log de la librería IPTV:"
      tail -n 50 "$TV_LOG_FILE" 2>/dev/null || true
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