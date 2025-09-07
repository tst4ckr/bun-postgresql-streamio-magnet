#!/bin/sh
set -e

# Iniciar Tor como el usuario debian-tor en segundo plano
gosu debian-tor /usr/bin/tor -f /etc/tor/torrc &

# Esperar a que Tor se inicialice
sleep 5

# Asegurar permisos del directorio data
mkdir -p /app/data
chown -R appuser:appuser /app/data 2>/dev/null || true
chmod -R 775 /app/data 2>/dev/null || true

# Verificar si se ejecuta en entorno de nube (sin problemas de bind mount)
if [ -z "$WINDOWS_DEV" ]; then
    # Producción/Nube: Ejecutar como appuser por seguridad
    exec gosu appuser bun run start
else
    # Desarrollo en Windows: Ejecutar como root para manejar permisos de bind mount
    exec bun run start
fi