# Usar la imagen oficial de Bun basada en Debian
FROM oven/bun:debian

# Instalar Tor, gosu y dependencias en una sola capa
RUN apt-get update && \
    apt-get install -y tor gosu netcat-openbsd && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Crear un usuario no-root para la aplicación
RUN useradd --system --no-create-home appuser

# Crear y configurar Tor de forma más limpia
RUN mkdir -p /etc/tor /var/lib/tor && \
    echo "SocksPort 127.0.0.1:9050" > /etc/tor/torrc && \
    echo "ControlPort 127.0.0.1:9051" >> /etc/tor/torrc && \
    echo "DataDirectory /var/lib/tor" >> /etc/tor/torrc && \
    echo "Log notice stdout" >> /etc/tor/torrc && \
    echo "CookieAuthentication 1" >> /etc/tor/torrc && \
    chown -R debian-tor:debian-tor /var/lib/tor && \
    chmod 700 /var/lib/tor

WORKDIR /app

# Copiar solo los archivos necesarios para instalar dependencias
COPY --chown=appuser:appuser package.json bun.lock ./
RUN bun install --production

# Copiar el resto de la aplicación
COPY --chown=appuser:appuser . .

# Asegurar permisos y dar permisos de ejecución al script de inicio
RUN chmod +x start.sh && chown -R appuser:appuser /app

# Variables de entorno
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV CONTAINER_ENV=true
# Alinear puerto de la app con el expuesto por el contenedor
ENV PORT=7000
ENV TOR_ENABLED=false

# Rutas efectivas dentro del contenedor (filesystem)
# Estas variables sobrescriben las de .env (dotenv no pisa variables ya definidas)
ENV STATIC_DIR=/app/static
ENV STATIC_MOUNT_PATH=/static
ENV DATA_TORRENTS_DIR=/app/data/torrents
ENV DATA_TVS_DIR=/app/data/tvs

# Exponer puertos
EXPOSE 7000

# Comando de arranque (ejecutar como root para permitir gosu)
CMD ["./start.sh"]

# Healthcheck condicional: solo si TOR_ENABLED=true
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD sh -c 'if [ "${TOR_ENABLED}" = "true" ]; then nc -z 127.0.0.1 9050 || exit 1; else exit 0; fi'


