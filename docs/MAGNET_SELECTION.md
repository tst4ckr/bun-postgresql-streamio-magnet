# Configuración de Selección de Magnets

Este documento describe las opciones de configuración disponibles para personalizar el algoritmo de selección de magnets mediante variables de entorno.

## Variables de Entorno

### MAGNET_SELECTION_STRATEGY

**Descripción**: Define la estrategia principal para seleccionar el mejor magnet entre los resultados disponibles.

**Valores permitidos**:
- `seeders` (default): Prioriza únicamente el número de seeders
- `quality`: Prioriza únicamente la calidad del video
- `balanced`: Combina calidad y seeders según pesos configurados

**Ejemplo**:
```bash
MAGNET_SELECTION_STRATEGY=seeders
```

### MAGNET_SEEDERS_WEIGHT

**Descripción**: Peso de los seeders en la estrategia 'balanced' (0-100).

**Valor por defecto**: `70`

**Ejemplo**:
```bash
MAGNET_SEEDERS_WEIGHT=70
```

### MAGNET_QUALITY_WEIGHT

**Descripción**: Peso de la calidad en la estrategia 'balanced' (0-100).

**Valor por defecto**: `30`

**Nota**: Se recomienda que la suma de `MAGNET_SEEDERS_WEIGHT` + `MAGNET_QUALITY_WEIGHT` sea 100.

**Ejemplo**:
```bash
MAGNET_QUALITY_WEIGHT=30
```

### MAGNET_MIN_SEEDERS

**Descripción**: Número mínimo de seeders requerido para considerar un magnet válido.

**Valor por defecto**: `0`

**Ejemplo**:
```bash
MAGNET_MIN_SEEDERS=5
```

### MAGNET_QUALITY_PRIORITY

**Descripción**: Lista de calidades preferidas en orden de prioridad, separadas por comas.

**Valor por defecto**: `4K,2160p,1080p,720p,480p`

**Ejemplo**:
```bash
MAGNET_QUALITY_PRIORITY=1080p,720p,4K,2160p,480p
```

### MAGNET_SELECTION_LOGGING

**Descripción**: Habilita logging detallado del proceso de selección de magnets.

**Valores permitidos**: `true`, `false`

**Valor por defecto**: `false`

**Ejemplo**:
```bash
MAGNET_SELECTION_LOGGING=true
```

## Estrategias de Selección

### Estrategia "seeders"

Selecciona el magnet con el mayor número de seeders, ignorando la calidad del video.

**Ventajas**:
- Mayor velocidad de descarga
- Mejor disponibilidad del contenido
- Algoritmo simple y predecible

**Desventajas**:
- Puede seleccionar contenido de baja calidad
- No considera las preferencias de calidad del usuario

### Estrategia "quality"

Selecciona el magnet con la mejor calidad según el orden definido en `MAGNET_QUALITY_PRIORITY`.

**Ventajas**:
- Garantiza la mejor calidad disponible
- Respeta las preferencias de calidad del usuario

**Desventajas**:
- Puede seleccionar magnets con pocos seeders
- Velocidad de descarga potencialmente más lenta

### Estrategia "balanced"

Combina calidad y seeders usando un sistema de puntuación ponderada.

**Fórmula**:
```
Score = (Quality Score × MAGNET_QUALITY_WEIGHT) + (Seeders × MAGNET_SEEDERS_WEIGHT)
```

**Ventajas**:
- Balance entre calidad y velocidad
- Altamente configurable
- Adaptable a diferentes necesidades

**Desventajas**:
- Configuración más compleja
- Requiere ajuste fino de pesos

## Ejemplos de Configuración

### Configuración para máxima velocidad
```bash
MAGNET_SELECTION_STRATEGY=seeders
MAGNET_MIN_SEEDERS=10
MAGNET_SELECTION_LOGGING=false
```

### Configuración para máxima calidad
```bash
MAGNET_SELECTION_STRATEGY=quality
MAGNET_QUALITY_PRIORITY=4K,2160p,1080p,720p,480p
MAGNET_MIN_SEEDERS=5
MAGNET_SELECTION_LOGGING=false
```

### Configuración balanceada
```bash
MAGNET_SELECTION_STRATEGY=balanced
MAGNET_SEEDERS_WEIGHT=60
MAGNET_QUALITY_WEIGHT=40
MAGNET_MIN_SEEDERS=3
MAGNET_QUALITY_PRIORITY=1080p,720p,4K,2160p,480p
MAGNET_SELECTION_LOGGING=true
```

### Configuración para debugging
```bash
MAGNET_SELECTION_STRATEGY=balanced
MAGNET_SEEDERS_WEIGHT=70
MAGNET_QUALITY_WEIGHT=30
MAGNET_MIN_SEEDERS=0
MAGNET_SELECTION_LOGGING=true
```

## Notas Importantes

1. **Reinicio requerido**: Los cambios en las variables de entorno requieren reiniciar el servidor para tomar efecto.

2. **Validación**: El sistema valida automáticamente los valores de configuración y usa valores por defecto para configuraciones inválidas.

3. **Rendimiento**: Habilitar `MAGNET_SELECTION_LOGGING=true` puede impactar el rendimiento en entornos de alta carga.

4. **Compatibilidad**: Todas las estrategias son compatibles con los proveedores existentes (Torrentio, CSV, etc.).

5. **Fallback**: Si no se encuentran magnets que cumplan los criterios mínimos, el sistema intentará relajar las restricciones automáticamente.