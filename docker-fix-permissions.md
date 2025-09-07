# Solución de Permisos Docker - Torrentio CSV

## Problema Identificado
Error EACCES al intentar escribir el archivo `torrentio.csv` dentro del contenedor Docker.
Error adicional: "operation not permitted" al cambiar usuarios con gosu.

## Cambios Realizados

### 1. Dockerfile
```dockerfile
# Asegurar permisos de escritura en el directorio data después de copiar archivos
RUN mkdir -p /app/data && \
    chown -R appuser:appuser /app/data && \
    chmod -R 775 /app/data

# Asegurar que appuser tenga permisos completos sobre toda la aplicación
RUN chown -R appuser:appuser /app

# Comando de arranque (ejecutar como root para permitir gosu)
CMD ["./start.sh"]
```

**Cambio clave**: Removido `USER appuser` para permitir que el script start.sh se ejecute como root y use gosu correctamente.

### 2. start.sh
```bash
#!/bin/sh
set -e

# Asegurar que el directorio de datos de Tor existe y tiene permisos correctos
mkdir -p /var/lib/tor
chown -R debian-tor:debian-tor /var/lib/tor
chmod 700 /var/lib/tor

# Iniciar Tor como el usuario debian-tor en segundo plano
gosu debian-tor /usr/bin/tor -f /etc/tor/torrc &
TOR_PID=$!

# Esperar a que Tor se inicialice
sleep 5

# Verificar que Tor está corriendo
if ! kill -0 $TOR_PID 2>/dev/null; then
    echo "Error: Tor no se pudo iniciar correctamente"
    exit 1
fi

# Asegurar permisos del directorio data
mkdir -p /app/data
chown -R appuser:appuser /app/data
chmod -R 775 /app/data

# Verificar permisos de escritura
if ! gosu appuser test -w /app/data; then
    echo "Error: appuser no puede escribir en /app/data"
    exit 1
fi

# Verificar si se ejecuta en entorno de nube (sin problemas de bind mount)
if [ -z "$WINDOWS_DEV" ]; then
    # Producción/Nube: Ejecutar como appuser por seguridad
    echo "Iniciando aplicación como appuser..."
    exec gosu appuser bun run start
else
    # Desarrollo en Windows: Ejecutar como root para manejar permisos de bind mount
    echo "Iniciando aplicación como root (modo desarrollo)..."
    exec bun run start
fi
```

**Mejoras**:
- Verificación de que Tor se inicia correctamente
- Validación de permisos de escritura antes de ejecutar la aplicación
- Mejor manejo de errores y logging
- Eliminación de `2>/dev/null || true` para detectar errores reales

## Aplicar Cambios
```bash
# Asegurar que Docker Desktop está ejecutándose
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Verificación
```bash
# Verificar logs del contenedor
docker-compose logs -f

# Probar endpoint
curl "http://localhost:7000/stream/series/tt31938062:1:8.json"

# Verificar que el archivo se crea correctamente
docker-compose exec app ls -la /app/data/
```

## Estado Actual
- ✅ **Entorno Local**: Funcionando correctamente, archivo se escribe sin errores
- ✅ **Correcciones Docker**: Aplicadas (Dockerfile y start.sh actualizados)
- ⏳ **Entorno Docker**: Pendiente de prueba (requiere Docker Desktop ejecutándose)

## Notas Técnicas
- El método `#saveMagnetsToFile` ya maneja errores EACCES apropiadamente
- Los permisos 775 permiten lectura/escritura al usuario y grupo
- El usuario `appuser` tiene ownership completo del directorio `/app/data`
- El contenedor ahora se ejecuta como root inicialmente para permitir gosu
- La aplicación se ejecuta como `appuser` por seguridad una vez iniciada