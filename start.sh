#!/bin/sh
set -e

# Iniciar Tor como el usuario debian-tor en segundo plano
gosu debian-tor /usr/bin/tor -f /etc/tor/torrc &

# Esperar a que Tor se inicialice
sleep 5

# Ejecutar la aplicación bun como root para evitar problemas de permisos en montajes de Windows
exec bun run start