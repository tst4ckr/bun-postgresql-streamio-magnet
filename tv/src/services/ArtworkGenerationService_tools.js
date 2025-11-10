/**
 * Herramientas auxiliares para ArtworkGenerationService
 *
 * Responsable de convertir SVG a imágenes raster (PNG/JPG) en tamaños
 * adecuados para Stremio según su manifiesto:
 * - Logo: PNG 256x256, monocromo
 * - Background: PNG/JPG con al menos 1024x786 (usamos 1280x786 por defecto)
 * - Poster: PNG con proporción 1:0.675 (ej. 512x346) o cuadrado 1:1 (ej. 512x512)
 *   y tamaño de archivo recomendado < 50KB, máximo < 100KB
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

class ArtworkGenerationTools {
  /**
   * Convierte un SVG en una imagen raster con dimensiones y formato dados.
   * @param {string|Buffer} svgInput - Ruta del SVG o contenido SVG en Buffer/String
   * @param {Object} options
   * @param {number} options.width - Ancho destino
   * @param {number} options.height - Alto destino
   * @param {('png'|'jpg'|'jpeg'|'webp')} options.format - Formato de salida
   * @param {string} [options.outputPath] - Ruta de salida (si no se indica, devuelve Buffer)
   * @param {Object} [options.png] - Opciones de compresión PNG
   * @param {Object} [options.jpeg] - Opciones de compresión JPEG
   * @returns {Promise<string|Buffer>} Ruta del archivo generado o Buffer
   */
  async rasterizeSVG(svgInput, { width, height, format, outputPath, png = {}, jpeg = {} }) {
    const svgBuffer = typeof svgInput === 'string' && svgInput.trim().endsWith('</svg>')
      ? Buffer.from(svgInput)
      : (typeof svgInput === 'string' ? await fs.readFile(svgInput) : svgInput);

    let pipeline = sharp(svgBuffer).resize(width, height, { fit: 'cover' });

    switch ((format || 'png').toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: jpeg.quality ?? 82, mozjpeg: true });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality: 82 });
        break;
      default: // png
        pipeline = pipeline.png({ compressionLevel: png.compressionLevel ?? 8, palette: png.palette ?? true });
    }

    if (outputPath) {
      await pipeline.toFile(outputPath);
      return outputPath;
    }
    return pipeline.toBuffer();
  }

  /**
   * Valida un background: dimensiones mínimas y formato permitido
   * @param {string} filePath
   * @returns {Promise<{isValid: boolean, warnings: string[], width?: number, height?: number, size?: number, format?: string}>>}
   */
  async validateBackground(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const meta = await sharp(filePath).metadata();
      const warnings = [];
      const minW = 1024, minH = 786;
      if ((meta.width ?? 0) < minW || (meta.height ?? 0) < minH) {
        warnings.push(`Dimensiones pequeñas: ${meta.width}x${meta.height} (mínimo ${minW}x${minH})`);
      }
      const fmt = String(meta.format || '').toLowerCase();
      if (!['png', 'jpeg', 'jpg'].includes(fmt)) {
        warnings.push(`Formato no recomendado para background: ${fmt}`);
      }
      return { isValid: warnings.length === 0, warnings, width: meta.width, height: meta.height, size: stats.size, format: meta.format };
    } catch (err) {
      return { isValid: false, warnings: [err.message] };
    }
  }

  /**
   * Valida un poster: formato PNG, tamaño de archivo < 100KB y proporción aceptada
   * @param {string} filePath
   * @returns {Promise<{isValid: boolean, warnings: string[], width?: number, height?: number, size?: number, format?: string}>>}
   */
  async validatePoster(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const meta = await sharp(filePath).metadata();
      const warnings = [];

      const fmt = String(meta.format || '').toLowerCase();
      if (fmt !== 'png') warnings.push(`Formato de poster debe ser PNG (actual: ${fmt})`);

      // Tamaño recomendado <50KB, máximo <100KB
      const sizeKB = Math.round((stats.size || 0) / 1024);
      if (sizeKB > 100) warnings.push(`Poster grande: ${sizeKB}KB (recomendado <50KB, máximo <100KB)`);

      // Proporción aceptada: 1:0.675 (poster) o 1:1 (square). Permitimos tolerancia ±2%
      const w = meta.width || 0, h = meta.height || 0;
      const ratio = w && h ? (h / w) : 0;
      const isSquare = Math.abs(ratio - 1) <= 0.02;
      const isPoster = Math.abs(ratio - 0.675) <= 0.02;
      if (!isSquare && !isPoster) warnings.push(`Proporción no recomendada (h/w=${ratio.toFixed(3)}). Debe ser 1.000 o 0.675`);

      return { isValid: warnings.length === 0, warnings, width: w, height: h, size: stats.size, format: meta.format };
    } catch (err) {
      return { isValid: false, warnings: [err.message] };
    }
  }
}

export default ArtworkGenerationTools;