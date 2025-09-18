/**
 * Utilidad para inicializar archivos CSV con el formato correcto
 * Garantiza que todos los archivos necesarios existan antes de la inicialización del sistema
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export class CsvFileInitializer {
    /**
     * Formato estándar de cabeceras para todos los archivos CSV
     */
    static CSV_HEADER = 'content_id,name,magnet,quality,size,source,fileIdx,filename,provider,seeders,peers,season,episode,imdb_id,id_type';
    
    /**
     * Logger estático para la clase
     */
    static #logger = new EnhancedLogger();

    /**
     * Inicializa todos los archivos CSV necesarios para el sistema
     * @param {string} dataDirectory - Directorio donde se almacenan los archivos CSV
     */
    static initializeAllCsvFiles(dataDirectory) {
        const csvFiles = [
            'anime.csv',
            'english.csv', 
            'magnets.csv',
            'torrentio.csv'
        ];

        // Crear directorio si no existe
        if (!existsSync(dataDirectory)) {
            mkdirSync(dataDirectory, { recursive: true });
            CsvFileInitializer.this.#logger.info(`[CsvFileInitializer] Directorio creado: ${dataDirectory}`);
        }

        csvFiles.forEach(filename => {
            const filePath = `${dataDirectory}/${filename}`;
            this.ensureCsvFileExists(filePath, filename);
        });

        CsvFileInitializer.this.#logger.info('[CsvFileInitializer] Todos los archivos CSV han sido verificados/creados');
    }

    /**
     * Verifica que un archivo CSV específico exista, lo crea si no existe
     * @param {string} filePath - Ruta completa del archivo
     * @param {string} filename - Nombre del archivo para logging
     */
    static ensureCsvFileExists(filePath, filename) {
        if (!existsSync(filePath)) {
            // Crear directorio padre si no existe
            const dir = dirname(filePath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            // Crear archivo con cabeceras
            writeFileSync(filePath, this.CSV_HEADER + '\n', 'utf8');
            CsvFileInitializer.this.#logger.info(`[CsvFileInitializer] Archivo creado: ${filename}`);
        } else {
            CsvFileInitializer.this.#logger.info(`[CsvFileInitializer] Archivo verificado: ${filename}`);
        }
    }

    /**
     * Verifica que un archivo CSV tenga el formato de cabeceras correcto
     * @param {string} filePath - Ruta del archivo a verificar
     * @returns {boolean} - true si el formato es correcto
     */
    static validateCsvFormat(filePath) {
        if (!existsSync(filePath)) {
            return false;
        }

        try {
            const fs = require('fs');
            const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0].trim();
            return firstLine === this.CSV_HEADER;
        } catch (error) {
            CsvFileInitializer.this.#logger.error(`[CsvFileInitializer] Error validando formato de ${filePath}:`, error.message);
            return false;
        }
    }

    /**
     * Repara un archivo CSV con formato incorrecto
     * @param {string} filePath - Ruta del archivo a reparar
     * @param {string} filename - Nombre del archivo para logging
     */
    static repairCsvFormat(filePath, filename) {
        try {
            const fs = require('fs');
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            // Si la primera línea no es la cabecera correcta, reemplazarla
            if (lines[0].trim() !== this.CSV_HEADER) {
                lines[0] = this.CSV_HEADER;
                fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
                CsvFileInitializer.this.#logger.info(`[CsvFileInitializer] Formato reparado: ${filename}`);
            }
        } catch (error) {
            CsvFileInitializer.this.#logger.error(`[CsvFileInitializer] Error reparando ${filename}:`, error.message);
        }
    }
}