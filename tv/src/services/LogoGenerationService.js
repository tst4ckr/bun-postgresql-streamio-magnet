/**
 * Servicio de Generación de Logos para Stremio
 * 
 * Genera logos PNG con fondo gris oscuro basados en el nombre del canal,
 * siguiendo los estándares de Stremio para logos (256x256, monocromo).
 * 
 * Estándares de Stremio para logos:
 * - Formato: PNG (requerido)
 * - Tamaño: 256x256 píxeles
 * - Estilo: Monocromo
 * - URL en manifest: logo (opcional)
 */

import fs from 'fs/promises';
import path from 'path';
import LogoGenerationTools from './LogoGenerationService_tools.js';
// Flag a nivel de módulo para evitar limpiar directorio de logos múltiples veces
let LOGO_DIR_INITIALIZED = false;

class LogoGenerationService {
    constructor() {
        // Permitir configurar el directorio de salida de logos vía variable de entorno
        // Si no se establece, usar el directorio local "logo" por defecto
        const envLogoDir = process.env.LOGO_OUTPUT_DIR;
        if (envLogoDir && envLogoDir.trim()) {
            // Usar tal cual si es absoluta; si es relativa, resolver desde cwd
            this.logoDirectory = path.isAbsolute(envLogoDir)
                ? envLogoDir
                : path.resolve(process.cwd(), envLogoDir);
        } else {
            this.logoDirectory = path.join(process.cwd(), 'logo');
        }
        this.defaultBackgroundColor = '#2d2d2d'; // Gris oscuro
        this.defaultTextColor = '#ffffff'; // Blanco para contraste
        this.logoSize = 256;
        this.tools = new LogoGenerationTools();

        // Control de limpieza previa del directorio de logos
        // Por defecto: limpiar antes de generar para evitar duplicados/acumulación
        this.shouldCleanOutputDir = String(process.env.CLEAN_OUTPUT_DIRS || 'true').toLowerCase() !== 'false';
        // La inicialización se gestiona a nivel de módulo para evitar limpiezas concurrentes
    }

    /**
     * Genera un logo PNG para un canal específico
     * @param {string} channelName - Nombre del canal
     * @param {string} channelId - ID único del canal para el nombre del archivo
     * @returns {Promise<string>} - Ruta del archivo PNG generado
     */
    async generateChannelLogo(channelName, channelId) {
        try {
            // Asegurar directorio de salida por seguridad
            await this.ensureLogoDirectory();
            // Limpiar y preparar el texto del logo
            const logoText = this.prepareLogoText(channelName);
            
            // Generar el contenido SVG
            const svgContent = this.createSVGContent(logoText);
            
            // Crear nombre de archivo seguro
            const fileName = this.createSafeFileName(channelId, channelName);
            const svgPath = path.join(this.logoDirectory, `${fileName}.svg`);
            const pngPath = path.join(this.logoDirectory, `${fileName}.png`);
            
            // Escribir el archivo SVG temporal
            await fs.writeFile(svgPath, svgContent, 'utf8');
            
            // Convertir SVG a PNG usando sharp
            await this.tools.convertSVGtoPNG(svgPath, pngPath);
            
            // Eliminar el SVG temporal (solo necesitamos el PNG)
            await fs.unlink(svgPath);
            
            console.log(`✓ Logo PNG generado: ${fileName}.png`);
            return pngPath;
            
        } catch (error) {
            console.error(`✗ Error generando logo para ${channelName}:`, error.message);
            throw error;
        }
    }

    /**
     * Prepara el texto del logo basado en el nombre del canal
     * @param {string} channelName - Nombre del canal
     * @returns {string} - Texto optimizado para el logo
     */
    prepareLogoText(channelName) {
        if (!channelName || typeof channelName !== 'string') {
            return 'TV';
        }

        // Limpiar el nombre del canal
        let cleanName = channelName.trim();
        
        // Casos especiales: no procesar si HD/SD están al inicio o son parte integral del nombre
        const upperName = cleanName.toUpperCase();
        const specialCases = ['HD CHANNEL', 'HD TV', 'SD CHANNEL', 'SD TV'];
        const isSpecialCase = specialCases.some(special => upperName === special || upperName.startsWith(special + ' '));
        
        if (!isSpecialCase) {
            // Remover sufijos de calidad al final, pero solo si hay contenido sustancial antes
            const words = cleanName.split(/\s+/);
            if (words.length >= 2) {
                // Verificar sufijos de múltiples palabras primero
                if (/\s+(ultra\s+hd|full\s+hd)\s*$/i.test(cleanName)) {
                    cleanName = cleanName.replace(/\s+(ultra\s+hd|full\s+hd)\s*$/i, '');
                }
                // Luego verificar sufijos de una palabra
                else if (/\s+(hd|sd|4k|uhd|fhd)\s*$/i.test(cleanName)) {
                    const withoutSuffix = cleanName.replace(/\s+(hd|sd|4k|uhd|fhd)\s*$/i, '');
                    const withoutSuffixUpper = withoutSuffix.trim().toUpperCase();
                    
                    // Lista de palabras comunes que no deberían quedar solas
                    const commonWords = ['TV', 'CANAL', 'CHANNEL'];
                    const isOnlyCommonWord = commonWords.includes(withoutSuffixUpper);
                    
                    // Caso especial: "Canal" puede quedar solo si no es la única palabra
                    const isCanal = withoutSuffixUpper === 'CANAL';
                    const originalWords = cleanName.split(/\s+/);
                    
                    // Solo remover el sufijo si NO quedaría solo una palabra común (excepto Canal que sí puede quedar)
                    if (!isOnlyCommonWord || isCanal) {
                        cleanName = withoutSuffix;
                    }
                }
            }
        }
        
        // NO remover prefijos comunes duplicados al final para preservar nombres como "Discovery Channel"
        // Solo remover si realmente son duplicados obvios
        
        // Aplicar capitalización inteligente
        return this.applySmartCapitalization(cleanName);
    }

    /**
     * Aplica capitalización en mayúsculas a todo el texto
     * @param {string} text - Texto a capitalizar
     * @returns {string} - Texto completamente en mayúsculas
     */
    applySmartCapitalization(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        // Convertir todo el texto a mayúsculas
        return text.toUpperCase();
    }

    /**
     * Genera iniciales del nombre del canal
     * @param {string} channelName - Nombre del canal
     * @returns {string} - Iniciales del canal
     */
    generateInitials(channelName) {
        const words = channelName.split(/\s+/).filter(word => word.length > 0);
        
        if (words.length === 1) {
            // Si es una sola palabra, tomar las primeras 2-3 letras
            return words[0].substring(0, 3).toUpperCase();
        }
        
        // Si son múltiples palabras, tomar la primera letra de cada una (máximo 4)
        return words
            .slice(0, 4)
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase();
    }

    /**
     * Crea el contenido SVG del logo
     * @param {string} text - Texto a mostrar en el logo
     * @returns {string} - Contenido SVG completo
     */
    createSVGContent(text) {
        // Calcular tamaño de fuente dinámicamente basado en la longitud del texto
        const fontSize = this.calculateFontSize(text);
        
        // Determinar si necesitamos dividir el texto en múltiples líneas
        const lines = this.splitTextIntoLines(text, fontSize);
        const lineHeight = fontSize * 1.2;
        const totalHeight = lines.length * lineHeight;
        const startY = (this.logoSize - totalHeight) / 2 + fontSize * 0.8;
        
        // Generar elementos de texto para cada línea
        const textElements = lines.map((line, index) => {
            const y = startY + (index * lineHeight);
            return `<text 
                x="${this.logoSize / 2}" 
                y="${y}" 
                font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif" 
                font-size="${fontSize}" 
                font-weight="700" 
                fill="${this.defaultTextColor}" 
                text-anchor="middle" 
                letter-spacing="0.1px"
                style="text-rendering: optimizeLegibility; font-feature-settings: 'kern' 1, 'liga' 1;">
                ${this.escapeXML(line)}
            </text>`;
        }).join('\n    ');
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${this.logoSize}" height="${this.logoSize}" viewBox="0 0 ${this.logoSize} ${this.logoSize}" xmlns="http://www.w3.org/2000/svg">
    <!-- Importar fuente Inter desde Google Fonts -->
    <defs>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&amp;display=swap');
        </style>
        <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.3"/>
        </filter>
    </defs>
    
    <!-- Fondo con gradiente sutil -->
    <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#353535;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#252525;stop-opacity:1" />
        </linearGradient>
    </defs>
    
    <rect width="${this.logoSize}" height="${this.logoSize}" fill="url(#bgGradient)" rx="12" ry="12"/>
    
    <!-- Texto del canal con sombra -->
    ${textElements}
    
    <!-- Borde con gradiente -->
    <rect 
        width="${this.logoSize - 2}" 
        height="${this.logoSize - 2}" 
        x="1" 
        y="1" 
        fill="none" 
        stroke="#505050" 
        stroke-width="1.5" 
        rx="11" 
        ry="11"/>
</svg>`;
    }

    /**
     * Divide el texto en múltiples líneas si es necesario
     * @param {string} text - Texto completo
     * @param {number} fontSize - Tamaño de fuente
     * @returns {Array<string>} - Array de líneas de texto
     */
    splitTextIntoLines(text, fontSize) {
        // Estimar caracteres por línea basado en el tamaño de fuente
        const maxCharsPerLine = Math.floor(220 / (fontSize * 0.6));
        
        if (text.length <= maxCharsPerLine) {
            return [text];
        }
        
        // Dividir por palabras para evitar cortar palabras
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            
            if (testLine.length <= maxCharsPerLine) {
                currentLine = testLine;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    // Palabra muy larga, dividirla
                    lines.push(word);
                }
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        // Limitar a máximo 3 líneas para mantener legibilidad
        return lines.slice(0, 3);
    }

    /**
     * Calcula el tamaño de fuente apropiado basado en normalización visual
     * Asegura que todos los logos tengan un área visual consistente
     * @param {string} text - Texto del logo
     * @returns {number} - Tamaño de fuente en píxeles
     */
    calculateFontSize(text) {
        // Área visual objetivo (constante para todos los logos)
        const TARGET_VISUAL_AREA = 12500; // Área normalizada para consistencia visual
        
        // Calcular ancho estimado del texto basado en características de la fuente Inter
        const baseCharWidth = 0.6; // Factor base para Inter Bold
        
        // Ajustar el factor de ancho basado en la longitud del texto
        let adjustedCharWidth = baseCharWidth;
        if (text.length > 15) {
            adjustedCharWidth = baseCharWidth * 0.9; // Reducir para textos largos
        } else if (text.length < 4) {
            adjustedCharWidth = baseCharWidth * 1.1; // Ajuste menor para textos cortos
        }
        
        // Calcular área efectiva considerando altura de línea
        const lineHeightFactor = 1.2;
        const effectiveArea = TARGET_VISUAL_AREA / lineHeightFactor;
        
        // Calcular tamaño de fuente basado en el área objetivo
        // Área efectiva = text.length * adjustedCharWidth * fontSize^2
        let fontSize = Math.sqrt(effectiveArea / (text.length * adjustedCharWidth));
        
        // Aplicar límites prácticos para legibilidad y estética
        const MIN_FONT_SIZE = 24;  // Mínimo para legibilidad
        const MAX_FONT_SIZE = 68;  // Máximo para textos muy cortos
        
        fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize));
        
        // Verificación de desbordamiento para palabras individuales largas
        const words = text.split(' ');
        const longestWord = words.reduce((longest, word) => 
            word.length > longest.length ? word : longest, '');
        
        // Asegurar que la palabra más larga quepa en el contenedor (220px de ancho útil)
        const maxCharsPerLine = Math.floor(220 / (fontSize * adjustedCharWidth));
        if (longestWord.length > maxCharsPerLine) {
            const requiredFontSize = Math.floor(220 / (longestWord.length * adjustedCharWidth));
            fontSize = Math.min(fontSize, Math.max(requiredFontSize, MIN_FONT_SIZE));
        }
        
        // Redondear a entero para consistencia
        return Math.round(fontSize);
    }

    /**
     * Escapa caracteres XML especiales
     * @param {string} text - Texto a escapar
     * @returns {string} - Texto escapado
     */
    escapeXML(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Crea un nombre de archivo seguro
     * @param {string} channelId - ID del canal
     * @param {string} channelName - Nombre del canal
     * @returns {string} - Nombre de archivo seguro
     */
    createSafeFileName(channelId, channelName) {
        // Usar el ID del canal si está disponible, sino limpiar el nombre
        if (channelId && channelId.trim()) {
            return channelId.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        }
        
        return channelName
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase()
            .substring(0, 50); // Limitar longitud
    }

    /**
     * Genera logos para múltiples canales con paralelización controlada
     * @param {Array} channels - Array de objetos con {id, name}
     * @param {Object} options - Opciones de configuración
     * @param {number} options.concurrency - Número máximo de logos a procesar simultáneamente (default: 5)
     * @param {boolean} options.validateOrder - Validar que el orden se preserve (default: true)
     * @param {boolean} options.enableMetrics - Habilitar métricas detalladas (default: true)
     * @returns {Promise<Array>} - Array de rutas de archivos generados
     */
    async generateMultipleLogos(channels, options = {}) {
        const {
            concurrency = 5,
            validateOrder = true,
            enableMetrics = true
        } = options;
        
        // Validaciones de entrada
        if (!Array.isArray(channels) || channels.length === 0) {
            throw new Error('Se requiere un array de canales no vacío');
        }
        
        if (concurrency < 1 || concurrency > 20) {
            throw new Error('La concurrencia debe estar entre 1 y 20');
        }
        
        const results = [];
        // Limpiar directorio de salida SOLO una vez por sesión a nivel de módulo
        if (this.shouldCleanOutputDir && !LOGO_DIR_INITIALIZED) {
            await this.resetLogoDirectory();
            LOGO_DIR_INITIALIZED = true;
        } else {
            await this.ensureLogoDirectory();
        }
        const startTime = Date.now();
        
        console.log(`\n🎨 Generando logos para ${channels.length} canales (concurrencia: ${concurrency})...`);
        
        // Procesar en lotes controlados para evitar sobrecarga del sistema
        for (let i = 0; i < channels.length; i += concurrency) {
            const batch = channels.slice(i, i + concurrency);
            const batchNumber = Math.floor(i / concurrency) + 1;
            const totalBatches = Math.ceil(channels.length / concurrency);
            
            console.log(`   📦 Procesando lote ${batchNumber}/${totalBatches} (${batch.length} canales)...`);
            
            // Procesar lote en paralelo manteniendo referencias de orden
            const batchPromises = batch.map(async (channel, batchIndex) => {
                const globalIndex = i + batchIndex;
                try {
                    const logoPath = await this.generateChannelLogo(
                        channel.name, 
                        channel.id || `channel_${globalIndex + 1}`
                    );
                    
                    return {
                        channelId: channel.id,
                        channelName: channel.name,
                        logoPath: logoPath,
                        success: true,
                        originalIndex: globalIndex,
                        batchNumber: batchNumber
                    };
                } catch (error) {
                    console.error(`   ✗ Error en canal ${globalIndex + 1} (${channel.name}): ${error.message}`);
                    return {
                        channelId: channel.id,
                        channelName: channel.name,
                        error: error.message,
                        success: false,
                        originalIndex: globalIndex,
                        batchNumber: batchNumber
                    };
                }
            });
            
            // Esperar a que termine el lote completo antes de continuar
            const batchResults = await Promise.all(batchPromises);
            
            // Validar y mantener orden específico usando originalIndex
            if (validateOrder) {
                batchResults.sort((a, b) => a.originalIndex - b.originalIndex);
                
                // Verificar que el orden se preservó correctamente
                const orderValid = batchResults.every((result, idx) => 
                    result.originalIndex === i + idx
                );
                
                if (!orderValid) {
                    console.warn(`   ⚠️  Advertencia: Orden no preservado en lote ${batchNumber}`);
                }
            }
            
            results.push(...batchResults);
            
            // Log de progreso del lote
            const batchSuccessful = batchResults.filter(r => r.success).length;
            console.log(`   ✅ Lote ${batchNumber} completado: ${batchSuccessful}/${batch.length} exitosos`);
            
            // Pequeña pausa entre lotes para evitar sobrecarga
            if (batchNumber < totalBatches) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        // Validación final del orden si está habilitada
        if (validateOrder) {
            const finalOrderValid = results.every((result, idx) => 
                result.originalIndex === idx
            );
            
            if (!finalOrderValid) {
                console.error('❌ Error crítico: El orden final de los resultados no se preservó');
                throw new Error('Fallo en preservación del orden específico');
            }
        }
        
        // Estadísticas finales y métricas
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        if (enableMetrics) {
            const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
            const avgTimePerLogo = (totalTime / channels.length).toFixed(3);
            const estimatedSyncTime = channels.length * 0.5; // Estimación conservadora
            const improvement = ((estimatedSyncTime - parseFloat(totalTime)) / estimatedSyncTime * 100).toFixed(1);
            
            console.log(`\n📊 Generación de logos completada:`);
            console.log(`   ✅ Exitosos: ${successful}/${channels.length} (${((successful/channels.length)*100).toFixed(1)}%)`);
            console.log(`   ❌ Fallidos: ${failed}`);
            console.log(`   ⏱️  Tiempo total: ${totalTime}s`);
            console.log(`   📈 Promedio por logo: ${avgTimePerLogo}s`);
            console.log(`   🚀 Mejora vs síncrono: ${improvement}%`);
            console.log(`   🔄 Concurrencia utilizada: ${concurrency}`);
            console.log(`   📋 Orden preservado: ${validateOrder ? '✅' : '❌'}`);
        }
        
        return results;
    }

    /**
     * Verifica si el directorio de logos existe, si no lo crea
     */
    async ensureLogoDirectory() {
        try {
            await fs.access(this.logoDirectory);
        } catch (error) {
            await fs.mkdir(this.logoDirectory, { recursive: true });
            console.log(`📁 Directorio de logos creado: ${this.logoDirectory}`);
        }
    }

    /**
     * Elimina por completo el contenido del directorio de logos y lo recrea.
     */
    async resetLogoDirectory() {
        try {
            await fs.rm(this.logoDirectory, { recursive: true, force: true });
        } catch {}
        await fs.mkdir(this.logoDirectory, { recursive: true });
        console.log(`🧹 Directorio de logos limpiado: ${this.logoDirectory}`);
    }
}

export default LogoGenerationService;