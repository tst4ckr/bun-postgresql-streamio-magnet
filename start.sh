#!/bin/sh
set -e

# Asegurar que el directorio de datos de Tor existe y tiene permisos correctos
mkdir -p /var/lib/tor
chown -R debian-tor:debian-tor /var/lib/tor
chmod 700 /var/lib/tor

# Iniciar Tor como el usuario debian-tor en segundo plano
gosu debian-tor /usr/bin/tor -f /etc/tor/torrc &
TOR_PID=$!

# Esperar a que Tor se inicialice
sleep 5

# Verificar que Tor está corriendo
if ! kill -0 $TOR_PID 2>/dev/null; then
    echo "Error: Tor no se pudo iniciar correctamente"
    exit 1
fi

# Asegurar permisos del directorio data
mkdir -p /app/data
chown -R appuser:appuser /app/data
chmod -R 775 /app/data

# Verificar permisos de escritura
if ! gosu appuser test -w /app/data; then
    echo "Error: appuser no puede escribir en /app/data"
    exit 1
fi

# Verificar si se ejecuta en entorno de nube (sin problemas de bind mount)
if [ -z "$WINDOWS_DEV" ]; then
    # Producción/Nube: Ejecutar como appuser por seguridad
    echo "Iniciando aplicación como appuser..."
    exec gosu appuser bun run start
else
    # Desarrollo en Windows: Ejecutar como root para manejar permisos de bind mount
    echo "Iniciando aplicación como root (modo desarrollo)..."
    exec bun run start
fi