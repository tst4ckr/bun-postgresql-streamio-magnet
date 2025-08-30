# Script de build optimizado para Docker en PowerShell
# Maneja correctamente el lockfile de Bun

Write-Host "🔧 Preparando build de Docker..." -ForegroundColor Cyan

try {
    # Regenerar lockfile si es necesario
    Write-Host "📦 Actualizando dependencias..." -ForegroundColor Yellow
    bun install
    
    if ($LASTEXITCODE -ne 0) {
        throw "Error al instalar dependencias"
    }
    
    # Build de la imagen Docker
    Write-Host "🐳 Construyendo imagen Docker..." -ForegroundColor Blue
    docker build -t stremio-magnet-addon .
    
    if ($LASTEXITCODE -ne 0) {
        throw "Error al construir la imagen Docker"
    }
    
    Write-Host "✅ Build completado exitosamente" -ForegroundColor Green
    Write-Host "🚀 Para ejecutar: docker run -p 7000:7000 stremio-magnet-addon" -ForegroundColor Magenta
}
catch {
    Write-Host "❌ Error durante el build: $_" -ForegroundColor Red
    exit 1
}