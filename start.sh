#!/bin/sh
set -e

# Iniciar Tor como el usuario debian-tor en segundo plano
/usr/bin/tor -f /etc/tor/torrc --runasdaemon 1 --user debian-tor

# Esperar a que Tor se inicialice
sleep 5

# Ejecutar la aplicación bun como appuser
exec gosu appuser bun run start:prod