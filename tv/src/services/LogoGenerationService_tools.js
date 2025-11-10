/**
 * Herramientas auxiliares para LogoGenerationService
 * 
 * Incluye funciones para conversión SVG a PNG y utilidades
 * para cumplir con los estándares de Stremio (256x256, monocromo).
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

/**
 * Herramientas para conversión y manipulación de logos
 */
class LogoGenerationTools {
    constructor() {
        this.targetSize = 256;
        // Permitir configurar el directorio de salida de logos vía variable de entorno
        const envLogoDir = process.env.LOGO_OUTPUT_DIR;
        if (envLogoDir && envLogoDir.trim()) {
            this.logoDirectory = path.isAbsolute(envLogoDir)
                ? envLogoDir
                : path.resolve(process.cwd(), envLogoDir);
        } else {
            this.logoDirectory = path.join(process.cwd(), 'logo');
        }
    }

    /**
     * Convierte SVG a PNG usando sharp para cumplir estándares Stremio
     * @param {string} svgPath - Ruta del archivo SVG
     * @param {string} outputPath - Ruta de salida PNG (opcional)
     * @returns {Promise<string>} - Ruta del archivo PNG generado
     */
    async convertSVGtoPNG(svgPath, outputPath = null) {
        try {
            const pngPath = outputPath || svgPath.replace('.svg', '.png');
            
            // Leer el contenido SVG
            const svgBuffer = await fs.readFile(svgPath);
            
            // Convertir SVG a PNG usando sharp
            // Stremio requiere: PNG, 256x256, monocromo
            await sharp(svgBuffer)
                .resize(256, 256, {
                    fit: 'contain',
                    background: { r: 45, g: 45, b: 45, alpha: 1 } // Fondo gris oscuro
                })
                .png({
                    quality: 90,
                    compressionLevel: 6
                })
                .toFile(pngPath);
            
            console.log(`✅ SVG→PNG: ${path.basename(svgPath)} → ${path.basename(pngPath)}`);
            
            // Validar el archivo generado
            const validation = await this.validatePNGFile(pngPath);
            if (!validation.isValid) {
                console.warn(`⚠️  PNG generado con advertencias:`, validation.warnings);
            }
            
            return pngPath;
            
        } catch (error) {
            console.error(`❌ Error convirtiendo ${path.basename(svgPath)} a PNG:`, error.message);
            throw error;
        }
    }

    /**
     * Crea un archivo placeholder PNG
     * @param {string} pngPath - Ruta donde crear el placeholder
     */
    async createPNGPlaceholder(pngPath) {
        const placeholderContent = `# PNG Placeholder
# Este archivo representa un logo PNG de 256x256 píxeles
# Archivo: ${path.basename(pngPath)}
# Generado: ${new Date().toISOString()}
# 
# Para implementación completa, instalar:
# npm install sharp
# o
# npm install canvas
`;
        
        await fs.writeFile(pngPath.replace('.png', '.png.txt'), placeholderContent, 'utf8');
    }

    /**
     * Valida específicamente un archivo PNG para cumplimiento Stremio
     * @param {string} pngPath - Ruta del archivo PNG
     * @returns {Promise<Object>} - Resultado de validación específica PNG
     */
    async validatePNGFile(pngPath) {
        try {
            const stats = await fs.stat(pngPath);
            const validation = {
                isValid: true,
                warnings: [],
                size: stats.size,
                path: pngPath
            };

            // Validar tamaño de archivo (PNG optimizado debe ser < 50KB)
            if (stats.size > 50 * 1024) {
                validation.warnings.push(`Archivo PNG grande: ${Math.round(stats.size / 1024)}KB`);
            }

            // Usar sharp para validar dimensiones
            try {
                const metadata = await sharp(pngPath).metadata();
                
                if (metadata.width !== 256 || metadata.height !== 256) {
                    validation.warnings.push(`Dimensiones incorrectas: ${metadata.width}x${metadata.height} (esperado: 256x256)`);
                }

                if (metadata.format !== 'png') {
                    validation.warnings.push(`Formato incorrecto: ${metadata.format} (esperado: png)`);
                }
                
            } catch (sharpError) {
                validation.warnings.push(`Error validando con sharp: ${sharpError.message}`);
            }

            validation.isValid = validation.warnings.length === 0;
            return validation;
            
        } catch (error) {
            return {
                isValid: false,
                warnings: [`Error accediendo archivo: ${error.message}`],
                path: pngPath
            };
        }
    }

    /**
     * Valida que un logo cumple con los estándares de Stremio
     * @param {string} logoPath - Ruta del logo a validar
     * @returns {Promise<Object>} - Resultado de la validación
     */
    async validateStremioLogo(logoPath) {
        try {
            const stats = await fs.stat(logoPath);
            const extension = path.extname(logoPath).toLowerCase();
            
            const validation = {
                exists: true,
                size: stats.size,
                extension: extension,
                isValidExtension: ['.png', '.svg'].includes(extension),
                path: logoPath,
                compliant: false,
                issues: []
            };

            // Validar extensión
            if (!validation.isValidExtension) {
                validation.issues.push(`Extensión no válida: ${extension}. Se requiere .png`);
            }

            // Para SVG, es válido como paso intermedio
            if (extension === '.svg') {
                validation.issues.push('SVG detectado - requiere conversión a PNG para Stremio');
            }

            // Validar tamaño de archivo (no debe ser excesivamente grande)
            if (stats.size > 100 * 1024) { // 100KB
                validation.issues.push(`Archivo muy grande: ${Math.round(stats.size / 1024)}KB`);
            }

            validation.compliant = validation.issues.length === 0;
            
            return validation;
            
        } catch (error) {
            return {
                exists: false,
                error: error.message,
                compliant: false,
                issues: ['Archivo no encontrado']
            };
        }
    }

    /**
     * Genera un reporte de logos generados
     * @param {Array} logoResults - Resultados de generación de logos
     * @returns {Object} - Reporte detallado
     */
    generateLogoReport(logoResults) {
        const successful = logoResults.filter(r => r.success);
        const failed = logoResults.filter(r => !r.success);
        
        const report = {
            total: logoResults.length,
            successful: successful.length,
            failed: failed.length,
            successRate: ((successful.length / logoResults.length) * 100).toFixed(2),
            generatedFiles: successful.map(r => path.basename(r.logoPath)),
            errors: failed.map(r => ({
                channel: r.channelName,
                error: r.error
            }))
        };

        return report;
    }

    /**
     * Limpia archivos de logo antiguos
     * @param {number} maxAge - Edad máxima en días (por defecto 7)
     * @returns {Promise<number>} - Número de archivos eliminados
     */
    async cleanOldLogos(maxAge = 7) {
        try {
            const files = await fs.readdir(this.logoDirectory);
            const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;
            const now = Date.now();
            let deletedCount = 0;

            for (const file of files) {
                const filePath = path.join(this.logoDirectory, file);
                const stats = await fs.stat(filePath);
                
                if (now - stats.mtime.getTime() > maxAgeMs) {
                    await fs.unlink(filePath);
                    deletedCount++;
                    console.log(`🗑️  Logo antiguo eliminado: ${file}`);
                }
            }

            return deletedCount;
            
        } catch (error) {
            console.error('Error limpiando logos antiguos:', error.message);
            return 0;
        }
    }

    /**
     * Obtiene estadísticas del directorio de logos
     * @returns {Promise<Object>} - Estadísticas del directorio
     */
    async getLogoDirectoryStats() {
        try {
            const files = await fs.readdir(this.logoDirectory);
            const svgFiles = files.filter(f => f.endsWith('.svg'));
            const pngFiles = files.filter(f => f.endsWith('.png'));
            const otherFiles = files.filter(f => !f.endsWith('.svg') && !f.endsWith('.png'));

            let totalSize = 0;
            for (const file of files) {
                const stats = await fs.stat(path.join(this.logoDirectory, file));
                totalSize += stats.size;
            }

            return {
                totalFiles: files.length,
                svgFiles: svgFiles.length,
                pngFiles: pngFiles.length,
                otherFiles: otherFiles.length,
                totalSizeKB: Math.round(totalSize / 1024),
                directory: this.logoDirectory
            };
            
        } catch (error) {
            return {
                error: error.message,
                directory: this.logoDirectory
            };
        }
    }

    /**
     * Crea un índice de logos generados
     * @returns {Promise<Object>} - Índice de logos disponibles
     */
    async createLogoIndex() {
        try {
            const files = await fs.readdir(this.logoDirectory);
            const logoFiles = files.filter(f => f.endsWith('.svg') || f.endsWith('.png'));
            
            const index = {
                generated: new Date().toISOString(),
                totalLogos: logoFiles.length,
                logos: []
            };

            for (const file of logoFiles) {
                const filePath = path.join(this.logoDirectory, file);
                const stats = await fs.stat(filePath);
                const validation = await this.validateStremioLogo(filePath);
                
                index.logos.push({
                    filename: file,
                    size: stats.size,
                    created: stats.birthtime.toISOString(),
                    modified: stats.mtime.toISOString(),
                    stremioCompliant: validation.compliant,
                    issues: validation.issues
                });
            }

            // Guardar índice
            const indexPath = path.join(this.logoDirectory, 'logo-index.json');
            await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
            
            return index;
            
        } catch (error) {
            console.error('Error creando índice de logos:', error.message);
            throw error;
        }
    }
}

export default LogoGenerationTools;