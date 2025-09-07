# Usar la imagen oficial de Bun basada en Debian
FROM oven/bun:debian

# Instalar Tor, gosu y dependencias
RUN apt-get update && \
    apt-get install -y tor gosu && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Crear un usuario no-root para la aplicación
RUN useradd --system --no-create-home appuser

# Crear directorio para configuración de Tor
RUN mkdir -p /etc/tor

# Crear archivo de configuración de Tor
RUN echo "SocksPort 127.0.0.1:9050" > /etc/tor/torrc && \
    echo "ControlPort 127.0.0.1:9051" >> /etc/tor/torrc && \
    echo "DataDirectory /var/lib/tor" >> /etc/tor/torrc && \
    echo "Log notice stdout" >> /etc/tor/torrc

# Crear y asegurar el directorio de datos de Tor
RUN mkdir -p /var/lib/tor && \
    chown -R debian-tor:debian-tor /var/lib/tor && \
    chmod 700 /var/lib/tor

WORKDIR /app

# Copiar archivos de la aplicación y establecer permisos
COPY --chown=appuser:appuser package.json bun.lock ./
RUN bun install
COPY --chown=appuser:appuser . .

# Asegurar permisos de escritura en el directorio data después de copiar archivos
RUN mkdir -p /app/data && \
    chown -R appuser:appuser /app/data && \
    chmod -R 775 /app/data

# Dar permisos de ejecución al script de inicio
RUN chmod +x start.sh

# Asegurar que appuser tenga permisos completos sobre toda la aplicación
RUN chown -R appuser:appuser /app

# Variables de entorno
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV CONTAINER_ENV=true

# Exponer puertos
EXPOSE 7000

# Cambiar al usuario no privilegiado
USER appuser

# Comando de arranque
CMD ["./start.sh"]

# Healthcheck para verificar que Tor está funcionando
# HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
#     CMD nc -z 127.0.0.1 9050 || exit 1


