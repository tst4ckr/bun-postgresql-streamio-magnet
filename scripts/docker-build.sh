#!/bin/bash

# Script de build optimizado para Docker
# Maneja correctamente el lockfile de Bun

set -e

echo "🔧 Preparando build de Docker..."

# Regenerar lockfile si es necesario
echo "📦 Actualizando dependencias..."
bun install

# Build de la imagen Docker
echo "🐳 Construyendo imagen Docker..."
docker build -t stremio-magnet-addon .

echo "✅ Build completado exitosamente"
echo "🚀 Para ejecutar: docker run -p 7000:7000 stremio-magnet-addon"