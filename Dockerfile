# Usar la imagen oficial de Bun basada en Debian
FROM oven/bun:debian

# Instalar Tor y dependencias
RUN apt-get update && \
    apt-get install -y tor && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Crear directorio para configuración de Tor
RUN mkdir -p /etc/tor

# Crear archivo de configuración de Tor
RUN echo "SocksPort 0.0.0.0:9050" > /etc/tor/torrc && \
    echo "ControlPort 0.0.0.0:9051" >> /etc/tor/torrc && \
    echo "DataDirectory /var/lib/tor" >> /etc/tor/torrc && \
    echo "Log notice stdout" >> /etc/tor/torrc && \
    echo "RunAsDaemon 1" >> /etc/tor/torrc && \
    echo "MaxCircuitDirtiness 300" >> /etc/tor/torrc && \
    echo "NewCircuitPeriod 300" >> /etc/tor/torrc && \
    echo "CircuitBuildTimeout 60" >> /etc/tor/torrc

# Crear directorio de datos para Tor
RUN mkdir -p /var/lib/tor && \
    chown -R debian-tor:debian-tor /var/lib/tor && \
    chmod 700 /var/lib/tor

WORKDIR /app

# Copiar archivos de la aplicación
COPY package.json bun.lock ./
RUN bun install
COPY . .

# Dar permisos de ejecución al script de inicio
RUN chmod +x start.sh

# Variables de entorno
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV CONTAINER_ENV=true

# Exponer puertos
EXPOSE 7000 9050

# Comando de arranque
CMD ["./start.sh"]

# Healthcheck para verificar que Tor está funcionando
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD nc -z localhost 9050 || exit 1


