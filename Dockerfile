FROM oven/bun:1

WORKDIR /app

# Instalar dependencias primero (aprovecha la caché de capas)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copiar el resto del proyecto
COPY . .

# Variables de entorno por defecto seguras para contenedores
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# El addon expone por defecto el puerto 7000 (usará $PORT si está definido en el entorno)
EXPOSE 7000

# Comando de arranque en producción
CMD ["bun", "run", "start:prod"]


