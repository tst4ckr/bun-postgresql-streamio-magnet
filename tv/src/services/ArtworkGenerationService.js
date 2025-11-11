/**
 * Servicio de Generación de Artwork (Background y Poster) para Stremio
 *
 * Genera imágenes en base al nombre del canal respetando las guías del
 * manifiesto de Stremio:
 * - Background: PNG/JPG con al menos 1024x786 (usamos 1280x786 por defecto)
 * - Poster: PNG con proporción 1:0.675 (ej. 512x346) o cuadrado 1:1 (ej. 512x512)
 *   y tamaño de archivo recomendado < 50KB, máximo < 100KB
 *
 * Variables de entorno soportadas:
 * - BACKGROUND_OUTPUT_DIR: directorio destino para backgrounds (absoluto o relativo a cwd)
 * - POSTER_OUTPUT_DIR: directorio destino para posters (absoluto o relativo a cwd)
 */

import fs from 'fs/promises';
import path from 'path';
import ArtworkGenerationTools from './ArtworkGenerationService_tools.js';
import { EnvLoader } from '../infrastructure/config/EnvLoader.js';
// Flags a nivel de módulo para evitar limpiar directorios múltiples veces
// cuando se crean varias instancias del servicio en paralelo.
let BACKGROUND_DIR_INITIALIZED = false;
let POSTER_DIR_INITIALIZED = false;

class ArtworkGenerationService {
  constructor() {
    // Asegurar que las variables de entorno declaradas en config/app.conf
    // estén cargadas antes de leerlas. Esto garantiza resiliencia y estabilidad.
    try {
      EnvLoader.getInstance();
    } catch (e) {
      // No interrumpir si ya se cargó previamente en otra parte de la librería
      // o si el cargador está en proceso; solo registrar en modo debug.
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug('[ArtworkGenerationService] EnvLoader ya inicializado o en progreso.');
      }
    }

    const envBgDir = process.env.BACKGROUND_OUTPUT_DIR;
    const envPosterDir = process.env.POSTER_OUTPUT_DIR;

    // Por defecto, usar los directorios bajo /static para que coincidan con el servidor Express
    this.backgroundDirectory = envBgDir && envBgDir.trim()
      ? (path.isAbsolute(envBgDir) ? envBgDir : path.resolve(process.cwd(), envBgDir))
      : path.join(process.cwd(), 'static', 'background');

    this.posterDirectory = envPosterDir && envPosterDir.trim()
      ? (path.isAbsolute(envPosterDir) ? envPosterDir : path.resolve(process.cwd(), envPosterDir))
      : path.join(process.cwd(), 'static', 'poster');

    // Tamaños por defecto basados en guías de Stremio
    this.backgroundSize = { width: 1280, height: 786 }; // ≥ 1024x786, mantiene aspecto cercano al recomendado por Stremio
    this.posterSizes = {
      square: { width: 400, height: 400 }, // Reducido para optimizar
      poster: { width: 400, height: 270 } // Reducido para optimizar, ratio ~1:0.675
    };

    this.tools = new ArtworkGenerationTools();

    // Control de limpieza previa de directorios de salida
    // Por defecto: limpiar antes de generar para evitar duplicados/acumulación
    this.shouldCleanOutputDirs = String(process.env.CLEAN_OUTPUT_DIRS || 'true').toLowerCase() !== 'false';
    // Las banderas de inicialización se gestionan a nivel de módulo
  }

  /**
   * Genera un background para un canal.
   * Por defecto se usa JPG para un tamaño de archivo menor.
   * @param {string} channelName
   * @param {string} channelId
   * @returns {Promise<string>} Ruta del archivo generado
   */
  async generateChannelBackground(channelName, channelId) {
    const fileBase = this.createSafeFileName(channelId, channelName);
    const svgPath = path.join(this.backgroundDirectory, `${fileBase}.svg`);
    const outPath = path.join(this.backgroundDirectory, `${fileBase}.jpg`);

    try {
      // Cinturón y tirantes: asegurar el directorio antes de escribir
      await this.ensureBackgroundDirectory();
      const text = this.prepareText(channelName);
      const svg = this.createBackgroundSVG(text);
      await fs.writeFile(svgPath, svg, 'utf8');

      await this.tools.rasterizeSVG(svgPath, {
        width: this.backgroundSize.width,
        height: this.backgroundSize.height,
        format: 'jpeg',
        outputPath: outPath,
        jpeg: { quality: 84 }
      });

      await fs.unlink(svgPath).catch(() => {});

      const validation = await this.tools.validateBackground(outPath);
      if (!validation.isValid) {
        console.warn(`⚠️  Background con advertencias (${fileBase}.jpg):`, validation.warnings);
      }

      console.log(`✓ Background generado: ${path.basename(outPath)}`);
      return outPath;
    } catch (err) {
      console.error(`✗ Error generando background para ${channelName}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Genera un poster para un canal.
   * @param {string} channelName
   * @param {string} channelId
   * @param {{shape?: 'square'|'poster'}} options
   * @returns {Promise<string>} Ruta del archivo generado (PNG)
   */
  async generateChannelPoster(channelName, channelId, options = {}) {
    // Por defecto usamos el formato 'poster' 1:0.675, que suele producir archivos más pequeños
    const shape = options.shape === 'square' ? 'square' : 'poster';
    const size = this.posterSizes[shape];
    const suffix = shape === 'poster' ? '-poster' : '-square';
    const fileBase = this.createSafeFileName(channelId, channelName) + suffix;
    const svgPath = path.join(this.posterDirectory, `${fileBase}.svg`);
    const outPath = path.join(this.posterDirectory, `${fileBase}.png`);

    try {
      // Cinturón y tirantes: asegurar el directorio antes de escribir
      await this.ensurePosterDirectory();
      const text = this.prepareText(channelName);
      const svg = this.createPosterSVG(text, size.width, size.height);
      await fs.writeFile(svgPath, svg, 'utf8');

      await this.tools.rasterizeSVG(svgPath, {
        width: size.width,
        height: size.height,
        format: 'png',
        outputPath: outPath,
        png: { compressionLevel: 9, palette: true }
      });

      await fs.unlink(svgPath).catch(() => {});

      // Cumplimiento estricto MCP Context7 (Stremio): PNG y <100KB recomendado <50KB
      // Intentamos optimizar si excede los límites.
      await this.#ensurePosterUnderSize(outPath, { shape, initialWidth: size.width, initialHeight: size.height });

      const validation = await this.tools.validatePoster(outPath);
      if (!validation.isValid) {
        console.warn(`⚠️  Poster con advertencias (${path.basename(outPath)}):`, validation.warnings);
      }

      console.log(`✓ Poster generado: ${path.basename(outPath)}`);
      return outPath;
    } catch (err) {
      console.error(`✗ Error generando poster para ${channelName}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Genera backgrounds para múltiples canales (paralelo controlado)
   * @param {Array<{id: string, name: string}>} channels
   * @param {{concurrency?: number}} options
   */
  async generateMultipleBackgrounds(channels, options = {}) {
    const { concurrency = 4 } = options;
    // Limpiar el directorio SOLO una vez por sesión, a nivel de módulo,
    // para evitar condiciones de carrera entre múltiples instancias/chunks.
    if (this.shouldCleanOutputDirs && !BACKGROUND_DIR_INITIALIZED) {
      await this.resetBackgroundDirectory();
      BACKGROUND_DIR_INITIALIZED = true;
    } else {
      await this.ensureBackgroundDirectory();
    }
    const results = [];
    for (let i = 0; i < channels.length; i += concurrency) {
      const batch = channels.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(async (ch, idx) => {
        try {
          const bgPath = await this.generateChannelBackground(ch.name, ch.id || `channel_${i + idx + 1}`);
          return { channelId: ch.id, channelName: ch.name, backgroundPath: bgPath, success: true, originalIndex: i + idx };
        } catch (e) {
          return { channelId: ch.id, channelName: ch.name, error: e.message, success: false, originalIndex: i + idx };
        }
      }));
      batchResults.sort((a, b) => a.originalIndex - b.originalIndex);
      results.push(...batchResults);
      if (i + concurrency < channels.length) await new Promise(r => setTimeout(r, 50));
    }
    return results;
  }

  /**
   * Genera posters para múltiples canales (paralelo controlado)
   * @param {Array<{id: string, name: string}>} channels
   * @param {{concurrency?: number, shape?: 'square'|'poster'}} options
   */
  async generateMultiplePosters(channels, options = {}) {
    const { concurrency = 4, shape = 'square' } = options;
    // Limpiar el directorio SOLO una vez por sesión, a nivel de módulo,
    // para evitar condiciones de carrera entre múltiples instancias/chunks.
    if (this.shouldCleanOutputDirs && !POSTER_DIR_INITIALIZED) {
      await this.resetPosterDirectory();
      POSTER_DIR_INITIALIZED = true;
    } else {
      await this.ensurePosterDirectory();
    }
    const results = [];
    for (let i = 0; i < channels.length; i += concurrency) {
      const batch = channels.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(async (ch, idx) => {
        try {
          const posterPath = await this.generateChannelPoster(ch.name, ch.id || `channel_${i + idx + 1}`, { shape });
          return { channelId: ch.id, channelName: ch.name, posterPath, success: true, originalIndex: i + idx };
        } catch (e) {
          return { channelId: ch.id, channelName: ch.name, error: e.message, success: false, originalIndex: i + idx };
        }
      }));
      batchResults.sort((a, b) => a.originalIndex - b.originalIndex);
      results.push(...batchResults);
      if (i + concurrency < channels.length) await new Promise(r => setTimeout(r, 50));
    }
    return results;
  }

  // ======= SVG templates =======

  prepareText(channelName) {
    if (!channelName) return 'TV';
    return String(channelName).trim().toUpperCase();
  }

  createBackgroundSVG(text) {
    const { width, height } = this.backgroundSize;
    const initials = this.generateInitials(text);
    const watermarkSize = Math.floor(height * 0.48); // reducir para evitar saturación visual
    const labelWidth = Math.min(width - 48, 420);
    const safeLabelTextWidth = Math.max(24, labelWidth - 24);
    return `<?xml version="1.0" encoding="UTF-8"?>
 <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
   <defs>
     <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
       <stop offset="0%" stop-color="#333" />
       <stop offset="100%" stop-color="#1f1f1f" />
     </linearGradient>
   </defs>
   <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)"/>
   <!-- Marca de agua con iniciales -->
   <text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="${watermarkSize}" font-weight="800" fill="#ffffff" opacity="0.06" dy="0.35em">${this.escapeXML(initials)}</text>
   <!-- Etiqueta superior izquierda con nombre -->
   <rect x="24" y="22" rx="8" ry="8" width="${labelWidth}" height="48" fill="#00000055" />
   <text x="44" y="56" font-family="sans-serif" font-size="24" font-weight="600" fill="#ffffff" lengthAdjust="spacingAndGlyphs" textLength="${safeLabelTextWidth}">${this.escapeXML(text)}</text>
 </svg>`;
  }

  /**
   * Optimiza el poster para que cumpla con el tamaño máximo (<100KB, idealmente <50KB) y formato PNG
   * siguiendo las guías del manifiesto de Stremio (MCP Context7).
   * Estrategia:
   * 1) Re-encode con PNG palette + compressionLevel alto.
   * 2) Si sigue >100KB, reducir dimensiones gradualmente manteniendo proporción.
   * 3) Si aún supera, regenerar con fondo plano (sin gradiente) y volver a rasterizar.
   * @param {string} pngPath
   * @param {{shape: 'square'|'poster', initialWidth: number, initialHeight: number}} opts
   */
  async #ensurePosterUnderSize(pngPath, opts) {
    const MAX_BYTES = 100 * 1024; // 100KB límite duro
    const TARGET_BYTES = 50 * 1024; // objetivo recomendado
    const { shape, initialWidth, initialHeight } = opts;

    const getSize = async () => (await fs.stat(pngPath)).size;
    const size1 = await getSize().catch(() => 0);
    if (size1 <= MAX_BYTES) return; // ya cumple

    // 1) Re-encode con palette/compression alto
    try {
      const sharpMod = (await import('sharp')).default;
      await sharpMod(pngPath)
        .png({ compressionLevel: 9, palette: true })
        .toFile(pngPath + '.tmp');
      await fs.rename(pngPath + '.tmp', pngPath);
    } catch {}

    let sizeNow = await getSize().catch(() => 0);
    if (sizeNow <= MAX_BYTES) return;

    // 2) Reducir dimensiones: 512→448→400→360→320
    const widths = [512, 448, 400, 360, 320];
    const ratio = initialHeight / initialWidth;
    for (const w of widths) {
      const h = Math.round(w * (shape === 'square' ? 1 : ratio));
      try {
        const sharpMod = (await import('sharp')).default;
        await sharpMod(pngPath)
          .resize(w, h, { fit: 'cover' })
          .png({ compressionLevel: 9, palette: true })
          .toFile(pngPath + '.tmp');
        await fs.rename(pngPath + '.tmp', pngPath);
        sizeNow = await getSize().catch(() => 0);
        if (sizeNow <= MAX_BYTES) break;
      } catch {}
    }

    if (sizeNow <= MAX_BYTES) return;

    // 3) Fondo plano en lugar de gradiente para reducir paleta/entropía
    try {
      const fileBase = path.basename(pngPath, '.png');
      const baseText = fileBase.replace(/^(tv_|channel_)/i, '').replace(/[-_](square|poster)$/i, '');
      const text = this.prepareText(baseText);
      const w = Math.min(initialWidth, 400);
      const h = Math.round(w * (shape === 'square' ? 1 : (initialHeight / initialWidth)));
      const flatSvg = this.#createFlatPosterSVG(text, w, h);
      const tmpSvgPath = path.join(this.posterDirectory, `${fileBase}.re.svg`);
      await fs.writeFile(tmpSvgPath, flatSvg, 'utf8');
      await this.tools.rasterizeSVG(tmpSvgPath, {
        width: w,
        height: h,
        format: 'png',
        outputPath: pngPath,
        png: { compressionLevel: 9, palette: true }
      });
      await fs.unlink(tmpSvgPath).catch(() => {});
    } catch {}
  }

  /**
   * Variante de poster con fondo plano para reducir tamaño.
   */
  #createFlatPosterSVG(text, width, height) {
    const fontSize = Math.round(Math.min(width, height) * 0.16);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#262626" rx="12" ry="12" />
  <text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff" dy="0.35em">${this.escapeXML(text)}</text>
</svg>`;
  }

  createPosterSVG(text, width, height) {
    // Ajuste responsivo del texto para evitar desbordes
    const maxCharsPerLine = Math.max(8, Math.floor(width / 22));
    const lines = this.#splitTextForPoster(text, maxCharsPerLine);
    // Base: un poco más pequeño para mejorar legibilidad en tarjetas pequeñas
    const baseFactor = lines.length > 1 ? 0.13 : 0.16;
    let fontSize = Math.round(Math.min(width, height) * baseFactor);
    const lineSpacing = Math.round(fontSize * 1.25);
    // Si la línea más larga aún podría desbordar, reducir un poco más
    const longest = Math.max(...lines.map(l => l.length));
    if (longest > maxCharsPerLine) {
      fontSize = Math.round(fontSize * 0.9);
    }

    // Calcular posiciones Y para centrar verticalmente las líneas
    const totalHeight = lineSpacing * lines.length;
    const startY = Math.round((height - totalHeight) / 2 + fontSize * 0.9);

    const textEls = lines.map((line, i) => {
      const y = startY + i * lineSpacing;
      const content = this.escapeXML(line);
      // Usar textLength para ajustar a ancho disponible si fuera necesario
      const safeWidth = Math.max(24, width - 24);
      return `<text x="50%" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff" lengthAdjust="spacingAndGlyphs" textLength="${safeWidth}">${content}</text>`;
    }).join('\n   ');

    return `<?xml version="1.0" encoding="UTF-8"?>
 <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
   <defs>
     <linearGradient id="posterBg" x1="0%" y1="0%" x2="100%" y2="100%">
       <stop offset="0%" stop-color="#3b3b3b" />
       <stop offset="100%" stop-color="#202020" />
     </linearGradient>
   </defs>
   <rect x="0" y="0" width="${width}" height="${height}" fill="url(#posterBg)" rx="12" ry="12" />
   ${textEls}
   <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#585858" stroke-width="2" rx="10" ry="10" />
 </svg>`;
  }

  /**
   * Divide el texto en hasta 2 líneas buscando el espacio más cercano a la mitad.
   * Garantiza que cada línea tenga una longitud aceptable para evitar desbordes.
   * @param {string} text
   * @param {number} maxCharsPerLine
   * @returns {string[]}
   */
  #splitTextForPoster(text, maxCharsPerLine = 14) {
    const t = String(text || '').trim().replace(/\s+/g, ' ');
    if (t.length <= maxCharsPerLine) return [t];

    // Si no hay espacios, truncar inteligentemente con guión
    if (!/\s/.test(t)) {
      // cortar en dos segmentos con guión
      const mid = Math.floor(t.length / 2);
      return [t.slice(0, mid) + '-', t.slice(mid)];
    }

    // Buscar el espacio más cercano al medio para dividir en dos líneas
    const mid = Math.floor(t.length / 2);
    let splitIdx = t.indexOf(' ', mid);
    if (splitIdx === -1 || splitIdx > t.length - 5) {
      // probar hacia atrás si hacia adelante no funciona
      splitIdx = t.lastIndexOf(' ', mid);
    }
    if (splitIdx === -1) return [t];

    const left = t.slice(0, splitIdx).trim();
    const right = t.slice(splitIdx + 1).trim();
    const lines = [left, right];

    // Si alguna línea todavía es demasiado larga, hacer una segunda partición simple
    return lines.map(l => {
      if (l.length > maxCharsPerLine * 1.3) {
        const m = Math.floor(l.length / 2);
        const sIdx = l.indexOf(' ', m);
        if (sIdx > 0) {
          return l.slice(0, sIdx).trim();
        }
      }
      return l;
    });
  }

  generateInitials(text) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  }

  escapeXML(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  createSafeFileName(channelId, channelName) {
    if (channelId && channelId.trim()) return channelId.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    return String(channelName || 'canal')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .slice(0, 50);
  }

  async ensureBackgroundDirectory() {
    try { await fs.access(this.backgroundDirectory); }
    catch { await fs.mkdir(this.backgroundDirectory, { recursive: true }); console.log(`📁 Directorio de backgrounds creado: ${this.backgroundDirectory}`); }
  }

  async ensurePosterDirectory() {
    try { await fs.access(this.posterDirectory); }
    catch { await fs.mkdir(this.posterDirectory, { recursive: true }); console.log(`📁 Directorio de posters creado: ${this.posterDirectory}`); }
  }

  /**
   * Elimina por completo el contenido del directorio de backgrounds y lo recrea.
   */
  async resetBackgroundDirectory() {
    try {
      await fs.rm(this.backgroundDirectory, { recursive: true, force: true });
    } catch {}
    await fs.mkdir(this.backgroundDirectory, { recursive: true });
    console.log(`🧹 Directorio de backgrounds limpiado: ${this.backgroundDirectory}`);
  }

  /**
   * Elimina por completo el contenido del directorio de posters y lo recrea.
   */
  async resetPosterDirectory() {
    try {
      await fs.rm(this.posterDirectory, { recursive: true, force: true });
    } catch {}
    await fs.mkdir(this.posterDirectory, { recursive: true });
    console.log(`🧹 Directorio de posters limpiado: ${this.posterDirectory}`);
  }
}

export default ArtworkGenerationService;