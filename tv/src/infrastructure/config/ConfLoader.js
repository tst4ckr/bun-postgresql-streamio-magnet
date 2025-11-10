/**
 * @fileoverview ConfLoader - Cargador de configuración basada en archivo .conf
 * Lee pares clave=valor y los coloca en process.env una sola vez.
 * Soporta comentarios (#, //, ;) y valores entrecomillados.
 * Implementa patrón Singleton para evitar múltiples cargas.
 */

import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';

class ConfLoader {
  static #instance = null;
  static #isLoaded = false;
  static #loadingPromise = null;

  constructor(confPath = null, options = {}) {
    if (ConfLoader.#instance) {
      return ConfLoader.#instance;
    }

    this.confPath = confPath || this.#resolveDefaultPath();
    this.options = {
      // No sobreescribir variables existentes por defecto
      overrideExisting: options.overrideExisting === true,
    };

    ConfLoader.#instance = this;
  }

  #resolveDefaultPath() {
    // Permitir configurar la ruta vía variable de entorno CONFIG_FILE
    const envPath = process.env.CONFIG_FILE;
    if (envPath && envPath.trim()) {
      return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
    }
    // Por defecto usar config/app.conf en el directorio del proyecto
    return path.resolve(process.cwd(), 'config', 'app.conf');
  }

  static getInstance(confPath = null, options = {}) {
    if (!ConfLoader.#instance) {
      ConfLoader.#instance = new ConfLoader(confPath, options);
    }
    return ConfLoader.#instance;
  }

  static isLoaded() {
    return ConfLoader.#isLoaded;
  }

  static isLoading() {
    return ConfLoader.#loadingPromise !== null;
  }

  async load() {
    if (ConfLoader.#isLoaded) return true;
    if (ConfLoader.#loadingPromise) return ConfLoader.#loadingPromise;

    ConfLoader.#loadingPromise = (async () => {
      try {
        const exists = await this.#fileExists(this.confPath);
        if (!exists) {
          console.warn(`[ConfLoader] Archivo de configuración no encontrado: ${this.confPath}`);
          ConfLoader.#isLoaded = true; // marcar como cargado para evitar intentos repetidos
          ConfLoader.#loadingPromise = null;
          return false;
        }

        const content = await fsp.readFile(this.confPath, 'utf8');
        const entries = this.#parseConf(content);
        let applied = 0;
        for (const [key, value] of entries) {
          if (this.options.overrideExisting || process.env[key] === undefined) {
            process.env[key] = value;
            applied++;
          }
        }
        console.log(`[ConfLoader] Configuración cargada desde ${this.confPath} (${applied} variables aplicadas)`);
        ConfLoader.#isLoaded = true;
        ConfLoader.#loadingPromise = null;
        return true;
      } catch (error) {
        ConfLoader.#loadingPromise = null;
        console.error('[ConfLoader] Error cargando configuración:', error.message);
        throw error;
      }
    })();

    return ConfLoader.#loadingPromise;
  }

  loadSync() {
    if (ConfLoader.#isLoaded) return true;
    if (ConfLoader.#loadingPromise) {
      // Si hay una carga async en progreso, no iniciar sync paralela
      return false;
    }
    try {
      // Uso de fs (sync) para garantizar disponibilidad inmediata
      if (!fs.existsSync(this.confPath)) {
        console.warn(`[ConfLoader] Archivo de configuración no encontrado: ${this.confPath}`);
        ConfLoader.#isLoaded = true;
        return false;
      }
      const content = fs.readFileSync(this.confPath, 'utf8');
      const entries = this.#parseConf(content);
      let applied = 0;
      for (const [key, value] of entries) {
        if (this.options.overrideExisting || process.env[key] === undefined) {
          process.env[key] = value;
          applied++;
        }
      }
      console.log(`[ConfLoader] Configuración cargada (sync) desde ${this.confPath} (${applied} variables aplicadas)`);
      ConfLoader.#isLoaded = true;
      return true;
    } catch (error) {
      console.error('[ConfLoader] Error (sync) cargando configuración:', error.message);
      throw error;
    }
  }

  #parseConf(content) {
    const lines = content.split(/\r?\n/);
    const entries = [];
    for (let raw of lines) {
      let line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith(';')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();
      // Remover comillas envolventes si existen
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      entries.push([key, value]);
    }
    return entries;
  }

  async #fileExists(filePath) {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export { ConfLoader };
export default ConfLoader;