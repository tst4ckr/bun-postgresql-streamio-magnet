/**
 * CSVDataCleaner - Utilidad para limpiar y corregir problemas de formato en datos CSV
 * 
 * Funcionalidades:
 * - Corrige problemas de comillas mal cerradas
 * - Estandariza categorías duplicadas
 * - Limpia campos mezclados entre genre y country
 * - Normaliza valores de países
 */

import fs from 'fs';
import path from 'path';

export default class CSVDataCleaner {
    constructor() {
        this.genreNormalizationMap = {
            '"Movies': 'Movies',
            'Movies': 'Movies',
            '"Kids': 'Kids', 
            'Kids': 'Kids',
            '"News': 'News',
            'News': 'News',
            '"Sports': 'Sports',
            'Sports': 'Sports',
            '"Documentary': 'Documentary',
            'Documentary': 'Documentary',
            '"Business': 'Business',
            'Business': 'Business',
            '"Music': 'Music',
            'Music': 'Music',
            '"Lifestyle': 'Lifestyle',
            'Lifestyle': 'Lifestyle',
            '"Series': 'Series',
            'Series': 'Series',
            '"Latin American': 'Latin American',
            'Latin American': 'Latin American'
        };

        this.countryNormalizationMap = {
            'Peru': 'Perú',
            'Perú': 'Perú',
            'Internacional': 'Internacional',
            'España': 'España',
            'Argentina': 'Argentina',
            'Colombia': 'Colombia',
            'México': 'México',
            'Chile': 'Chile'
        };

        // Patrones para detectar valores incorrectos en campo country
        this.invalidCountryPatterns = [
            /^"?Premium"?$/i,
            /^"?International"?$/i,
            /^"?Educational"?$/i,
            /^"?Religious"?$/i,
            /^"?Movies"?$/i,
            /^"?Music"?$/i,
            /^"?Documentary"?$/i,
            /^"?Argentine"?$/i,
            /^"?Peruvian"?$/i,
            /^"?Mexican"?$/i
        ];
    }

    /**
     * Limpia una línea CSV corrigiendo problemas de formato
     */
    cleanCSVLine(line) {
        if (!line || line.trim() === '') return line;
        
        // Dividir la línea respetando las comillas
        const fields = this.parseCSVLine(line);
        
        if (fields.length < 10) return line; // Línea malformada
        
        // Limpiar cada campo
        const cleanedFields = fields.map((field, index) => {
            switch (index) {
                case 4: // genre
                    return this.cleanGenreField(field);
                case 5: // country  
                    return this.cleanCountryField(field);
                default:
                    return this.cleanGeneralField(field);
            }
        });
        
        return this.buildCSVLine(cleanedFields);
    }

    /**
     * Parsea una línea CSV respetando comillas
     */
    parseCSVLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
            const char = line[i];
            
            if (char === '"') {
                // Contar comillas consecutivas
                let quoteCount = 0;
                let j = i;
                while (j < line.length && line[j] === '"') {
                    quoteCount++;
                    j++;
                }
                
                if (inQuotes) {
                    // Si estamos dentro de comillas, las comillas pares son escape
                    if (quoteCount % 2 === 0) {
                        // Comillas pares: agregar la mitad como contenido
                        current += '"'.repeat(quoteCount / 2);
                    } else {
                        // Comillas impares: agregar la mitad como contenido y salir de comillas
                        current += '"'.repeat(Math.floor(quoteCount / 2));
                        inQuotes = false;
                    }
                } else {
                    // Si no estamos en comillas, cualquier comilla inicia el modo comillas
                    if (quoteCount > 0) {
                        inQuotes = true;
                        // Agregar comillas extras como contenido si hay más de una
                        if (quoteCount > 1) {
                            current += '"'.repeat(quoteCount - 1);
                        }
                    }
                }
                
                i = j;
            } else if (char === ',' && !inQuotes) {
                // Separador de campo
                fields.push(current);
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }
        
        // Agregar último campo
        fields.push(current);
        
        return fields;
    }

    /**
     * Limpia el campo de género
     */
    cleanGenreField(genre) {
        if (!genre) return 'General';
        
        // Remover múltiples comillas al inicio y final
        let cleaned = genre.replace(/^"+/, '').replace(/"+$/, '');
        
        // Si contiene múltiples géneros separados por comas
        if (cleaned.includes(',')) {
            const genres = cleaned.split(',').map(g => {
                const trimmed = g.trim().replace(/^"+/, '').replace(/"+$/, '');
                return this.genreNormalizationMap[trimmed] || trimmed;
            });
            return `"${genres.join(', ')}"`;
        }
        
        // Normalizar género único
        const normalized = this.genreNormalizationMap[cleaned] || cleaned;
        
        // Si el género normalizado contiene espacios o caracteres especiales, usar comillas
        if (normalized.includes(' ') || normalized.includes(',')) {
            return `"${normalized}"`;
        }
        
        return normalized;
    }

    /**
     * Limpia el campo de país
     */
    cleanCountryField(country) {
        if (!country) return 'Internacional';
        
        // Remover comillas mal cerradas
        let cleaned = country.replace(/^"/, '').replace(/"$/, '');
        
        // Verificar si es un valor inválido (género en campo country)
        for (const pattern of this.invalidCountryPatterns) {
            if (pattern.test(cleaned)) {
                return 'Internacional'; // Valor por defecto
            }
        }
        
        // Normalizar país
        return this.countryNormalizationMap[cleaned] || cleaned;
    }

    /**
     * Limpia campos generales
     */
    cleanGeneralField(field) {
        if (!field) return field;
        
        // Remover comillas mal cerradas al inicio/final
        return field.replace(/^"([^"]*)"?$/, '$1').replace(/^([^"]*)"$/, '$1');
    }

    /**
     * Construye una línea CSV desde campos limpios
     */
    buildCSVLine(fields) {
        return fields.map(field => {
            // Si el campo contiene comas, comillas o saltos de línea, debe ir entre comillas
            if (field.includes(',') || field.includes('"') || field.includes('\n')) {
                // Escapar comillas internas
                const escaped = field.replace(/"/g, '""');
                return `"${escaped}"`;
            }
            return field;
        }).join(',');
    }

    /**
     * Procesa un archivo CSV completo
     */
    async cleanCSVFile(inputPath, outputPath = null) {
        try {
            // Validar que el archivo exista
            if (!fs.existsSync(inputPath)) {
                throw new Error(`Archivo no encontrado: ${inputPath}`);
            }
            
            const content = fs.readFileSync(inputPath, 'utf8');
            
            // Validar que el contenido no esté vacío
            if (!content || !content.trim()) {
                console.warn(`[WARN] Archivo CSV vacío: ${inputPath}`);
                return {
                    success: false,
                    error: 'Archivo CSV vacío',
                    inputPath,
                    outputPath: null,
                    linesProcessed: 0
                };
            }
            
            const lines = content.split('\n');
            
            // Validar que haya al menos una línea
            if (lines.length === 0) {
                console.warn(`[WARN] Archivo CSV sin líneas: ${inputPath}`);
                return {
                    success: false,
                    error: 'Archivo CSV sin líneas',
                    inputPath,
                    outputPath: null,
                    linesProcessed: 0
                };
            }
            
            console.log(`[INFO] Procesando ${lines.length} líneas del CSV...`);
            
            const cleanedLines = lines.map((line, index) => {
                if (index === 0) return line; // Mantener header
                return this.cleanCSVLine(line);
            });
            
            const cleanedContent = cleanedLines.join('\n');
            
            // Crear backup del archivo original
            if (!outputPath) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = inputPath.replace('.csv', `.backup-${timestamp}.csv`);
                
                // Validar que el directorio del backup exista
                const backupDir = require('path').dirname(backupPath);
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir, { recursive: true });
                }
                
                fs.copyFileSync(inputPath, backupPath);
                console.log(`[INFO] Backup creado: ${backupPath}`);
                outputPath = inputPath;
            }
            
            // Validar que el directorio de salida exista
            const outputDir = require('path').dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            fs.writeFileSync(outputPath, cleanedContent, 'utf8');
            console.log(`[INFO] ✅ Archivo CSV limpiado guardado en: ${outputPath}`);
            
            return {
                success: true,
                inputPath,
                outputPath,
                linesProcessed: Math.max(0, lines.length - 1) // Asegurar que no sea negativo
            };
            
        } catch (error) {
            console.error(`[ERROR] Error procesando CSV: ${error.message}`);
            return {
                success: false,
                error: error.message,
                inputPath,
                outputPath: null,
                linesProcessed: 0
            };
        }
    }

    /**
     * Genera estadísticas de limpieza
     */
    generateCleaningStats(inputPath) {
        try {
            const content = fs.readFileSync(inputPath, 'utf8');
            const lines = content.split('\n').slice(1); // Sin header
            
            let genreIssues = 0;
            let countryIssues = 0;
            let quotingIssues = 0;
            
            lines.forEach(line => {
                if (!line.trim()) return;
                
                const fields = this.parseCSVLine(line);
                if (fields.length < 10) return;
                
                const genre = fields[4];
                const country = fields[5];
                
                // Detectar problemas de género
                if (genre && (genre.startsWith('"') !== genre.endsWith('"'))) {
                    quotingIssues++;
                }
                if (genre && this.genreNormalizationMap[genre]) {
                    genreIssues++;
                }
                
                // Detectar problemas de país
                if (country) {
                    for (const pattern of this.invalidCountryPatterns) {
                        if (pattern.test(country)) {
                            countryIssues++;
                            break;
                        }
                    }
                }
            });
            
            return {
                totalLines: lines.length,
                genreIssues,
                countryIssues,
                quotingIssues
            };
            
        } catch (error) {
            console.error(`[ERROR] Error generando estadísticas: ${error.message}`);
            return null;
        }
    }
}