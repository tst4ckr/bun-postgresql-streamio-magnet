#!/bin/sh
set -e

# Iniciar Tor en segundo plano como el usuario debian-tor
echo "Iniciando Tor..."
gosu debian-tor /usr/bin/tor -f /etc/tor/torrc &
TOR_PID=$!

# Esperar a que Tor se inicialice y verificar que esté corriendo
echo "Esperando a que Tor se inicie..."
sleep 5
if ! kill -0 $TOR_PID 2>/dev/null; then
    echo "Error: Tor no se pudo iniciar correctamente" >&2
    exit 1
fi
echo "Tor iniciado correctamente."

# Determinar el usuario para ejecutar la aplicación
if [ -z "$WINDOWS_DEV" ]; then
    # Producción/Nube: Ejecutar como appuser por seguridad
    echo "Iniciando aplicación como appuser..."
    exec gosu appuser bun run start
else
    # Desarrollo en Windows: Ejecutar como root para manejar permisos
    echo "Iniciando aplicación como root (modo desarrollo)..."
    exec bun run start
fi