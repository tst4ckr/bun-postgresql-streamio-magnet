#!/bin/sh
set -e

# Iniciar Tor como el usuario debian-tor en segundo plano
gosu debian-tor /usr/bin/tor -f /etc/tor/torrc &

# Esperar a que Tor se inicialice
sleep 5

# Ejecutar la aplicación bun como appuser
exec gosu appuser bun run start:prod