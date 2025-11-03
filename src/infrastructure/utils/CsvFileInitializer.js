/**
 * Utilidad para inicializar archivos CSV con el formato correcto
 * Garantiza que todos los archivos necesarios existan antes de la inicialización del sistema
 */

import { EnhancedLogger } from '../utils/EnhancedLogger.js';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
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
            CsvFileInitializer.#logger.info(`[CsvFileInitializer] Directorio creado: ${dataDirectory}`);
        }

        csvFiles.forEach(filename => {
            const filePath = `${dataDirectory}/${filename}`;
            CsvFileInitializer.ensureCsvFileExists(filePath, filename);
        });

        CsvFileInitializer.#logger.info('[CsvFileInitializer] Todos los archivos CSV han sido verificados/creados');
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
            writeFileSync(filePath, CsvFileInitializer.CSV_HEADER + '\n', 'utf8');
            CsvFileInitializer.#logger.info(`[CsvFileInitializer] Archivo creado: ${filename}`);
        } else {
            CsvFileInitializer.#logger.info(`[CsvFileInitializer] Archivo verificado: ${filename}`);
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
            const firstLine = readFileSync(filePath, 'utf8').split('\n')[0].trim();
            return firstLine === CsvFileInitializer.CSV_HEADER;
        } catch (error) {
            CsvFileInitializer.#logger.error(`[CsvFileInitializer] Error validando formato de ${filePath}:`, error.message);
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
            const content = readFileSync(filePath, 'utf8');
            
            // Encontrar la primera línea y preservar el resto del contenido exactamente como está
            const firstLineMatch = content.match(/^[^\r\n]*/);
            if (!firstLineMatch) return;
            
            const firstLine = firstLineMatch[0];
            const restOfContent = content.substring(firstLine.length);
            
            // Si la primera línea no es la cabecera correcta, reemplazarla
            if (firstLine.trim() !== CsvFileInitializer.CSV_HEADER) {
                const repairedContent = CsvFileInitializer.CSV_HEADER + restOfContent;
                writeFileSync(filePath, repairedContent, 'utf8');
                CsvFileInitializer.#logger.info(`[CsvFileInitializer] Formato reparado: ${filename}`);
            }
        } catch (error) {
            CsvFileInitializer.#logger.error(`[CsvFileInitializer] Error reparando ${filename}:`, error.message);
        }
    }
}