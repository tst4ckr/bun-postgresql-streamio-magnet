/**
 * Procesador de Géneros para Canales de TV
 * 
 * Este servicio integra la detección dinámica de géneros con el sistema existente,
 * procesando archivos CSV y actualizando los datos de canales con géneros múltiples.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import GenreDetectionService from './GenreDetectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class ChannelGenreProcessor {
    constructor() {
        this.genreDetector = new GenreDetectionService();
        this.dataPath = path.join(__dirname, '../../data');
        this.csvPath = path.join(this.dataPath, 'tv.csv');
        this.backupPath = path.join(this.dataPath, 'tv_backup.csv');
    }

    /**
     * Lee el archivo CSV de canales
     * @returns {Array} Array de objetos de canales
     */
    async readChannelsFromCSV() {
        try {
            const csvContent = fs.readFileSync(this.csvPath, 'utf-8');
            const lines = csvContent.trim().split('\n');
            const headers = lines[0].split(',');
            
            const channels = lines.slice(1).map(line => {
                const values = this.parseCSVLine(line);
                const channel = {};
                
                headers.forEach((header, index) => {
                    channel[header.trim()] = values[index]?.trim() || '';
                });
                
                return channel;
            });

            console.log(`✅ Leídos ${channels.length} canales desde ${this.csvPath}`);
            return channels;
        } catch (error) {
            console.error('❌ Error leyendo archivo CSV:', error.message);
            throw error;
        }
    }

    /**
     * Parsea una línea CSV manejando comas dentro de comillas
     * @param {string} line - Línea CSV
     * @returns {Array} Array de valores
     */
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current);
        return values;
    }

    /**
     * Escribe canales al archivo CSV
     * @param {Array} channels - Array de canales
     * @param {string} filePath - Ruta del archivo (opcional)
     */
    async writeChannelsToCSV(channels, filePath = null) {
        const outputPath = filePath || this.csvPath;
        
        try {
            // Crear backup del archivo original
            if (fs.existsSync(this.csvPath) && outputPath === this.csvPath) {
                fs.copyFileSync(this.csvPath, this.backupPath);
                console.log(`📋 Backup creado en ${this.backupPath}`);
            }

            // Generar headers (incluyendo nuevos campos de imágenes)
            const headers = ['id', 'name', 'stream_url', 'logo', 'poster', 'background', 'genre', 'country', 'language', 'quality', 'type', 'is_active'];
            
            // Generar contenido CSV
            const csvLines = [headers.join(',')];
            
            channels.forEach(channel => {
                const values = headers.map(header => {
                    // Soportar obtener poster/background desde metadatos si no están en el objeto principal
                    let value = channel[header] || channel?.metadata?.[header] || channel?.metadata?.originalData?.[header] || '';
                    // Escapar comillas y envolver en comillas si contiene comas
                    if (value.includes(',') || value.includes('"')) {
                        value = `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                });
                csvLines.push(values.join(','));
            });

            fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');
            console.log(`✅ Archivo CSV actualizado: ${outputPath}`);
            console.log(`📊 Total de canales procesados: ${channels.length}`);
            
        } catch (error) {
            console.error('❌ Error escribiendo archivo CSV:', error.message);
            throw error;
        }
    }

    /**
     * Procesa todos los canales y asigna géneros dinámicamente
     * @returns {Object} Resultado del procesamiento
     */
    async processAllChannels() {
        console.log('🚀 Iniciando procesamiento de géneros para canales...\n');
        
        try {
            // 1. Leer canales existentes
            const channels = await this.readChannelsFromCSV();
            
            // 2. Procesar géneros
            console.log('🔍 Detectando géneros automáticamente...');
            const processedChannels = this.genreDetector.processChannels(channels);
            
            // 3. Generar estadísticas
            const stats = this.genreDetector.getGenreStatistics(processedChannels);
            
            // 4. Mostrar estadísticas
            this.displayStatistics(stats);
            
            // 5. Guardar canales actualizados
            await this.writeChannelsToCSV(processedChannels);
            
            // 6. Generar configuración Stremio
            const stremioConfig = this.genreDetector.generateStremioConfig(processedChannels);
            await this.saveStremioConfig(stremioConfig);
            
            console.log('\n✅ Procesamiento completado exitosamente!');
            
            return {
                success: true,
                processedChannels: processedChannels.length,
                statistics: stats,
                stremioConfig
            };
            
        } catch (error) {
            console.error('\n❌ Error en el procesamiento:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Muestra estadísticas del procesamiento
     * @param {Object} stats - Estadísticas generadas
     */
    displayStatistics(stats) {
        console.log('\n📊 ESTADÍSTICAS DE GÉNEROS');
        console.log('═'.repeat(50));
        console.log(`Total de canales: ${stats.totalChannels}`);
        console.log(`Géneros únicos detectados: ${stats.uniqueGenres}`);
        console.log(`Promedio de géneros por canal: ${stats.averageGenresPerChannel.toFixed(2)}`);
        
        console.log('\n🏷️  TOP GÉNEROS:');
        Object.entries(stats.genreCount).slice(0, 10).forEach(([genre, count]) => {
            const percentage = ((count / stats.totalChannels) * 100).toFixed(1);
            console.log(`  ${genre}: ${count} canales (${percentage}%)`);
        });
        
        if (Object.keys(stats.genreCombinations).length > 0) {
            console.log('\n🔗 TOP COMBINACIONES DE GÉNEROS:');
            Object.entries(stats.genreCombinations).slice(0, 5).forEach(([combo, count]) => {
                console.log(`  ${combo}: ${count} canales`);
            });
        }
    }

    /**
     * Guarda la configuración de Stremio
     * @param {Object} config - Configuración de Stremio
     */
    async saveStremioConfig(config) {
        try {
            const configPath = path.join(this.dataPath, 'stremio_config.json');
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            console.log(`\n⚙️  Configuración Stremio guardada en: ${configPath}`);
        } catch (error) {
            console.error('❌ Error guardando configuración Stremio:', error.message);
        }
    }

    /**
     * Procesa canales específicos por filtro
     * @param {Function} filterFn - Función de filtro
     * @returns {Array} Canales filtrados y procesados
     */
    async processChannelsByFilter(filterFn) {
        const channels = await this.readChannelsFromCSV();
        const filteredChannels = channels.filter(filterFn);
        return this.genreDetector.processChannels(filteredChannels);
    }

    /**
     * Obtiene canales por género específico
     * @param {string} targetGenre - Género objetivo
     * @returns {Array} Canales que contienen el género
     */
    async getChannelsByGenre(targetGenre) {
        const channels = await this.readChannelsFromCSV();
        const processedChannels = this.genreDetector.processChannels(channels);
        
        return processedChannels.filter(channel => 
            channel.genres && channel.genres.includes(targetGenre)
        );
    }

    /**
     * Valida la integridad de los datos procesados
     * @param {Array} channels - Canales a validar
     * @returns {Object} Resultado de la validación
     */
    validateChannelData(channels) {
        const validation = {
            valid: true,
            errors: [],
            warnings: []
        };

        channels.forEach((channel, index) => {
            // Validar campos requeridos
            const requiredFields = ['id', 'name', 'stream_url'];
            requiredFields.forEach(field => {
                if (!channel[field] || channel[field].trim() === '') {
                    validation.errors.push(`Canal ${index + 1}: Campo requerido '${field}' está vacío`);
                    validation.valid = false;
                }
            });

            // Validar géneros
            if (!channel.genres || channel.genres.length === 0) {
                validation.warnings.push(`Canal ${index + 1} (${channel.name}): No se detectaron géneros`);
            }

            // Validar URL de stream
            if (channel.stream_url && !channel.stream_url.startsWith('http')) {
                validation.warnings.push(`Canal ${index + 1} (${channel.name}): URL de stream puede ser inválida`);
            }
        });

        return validation;
    }

    /**
     * Genera reporte detallado del procesamiento
     * @param {Array} channels - Canales procesados
     * @returns {string} Reporte en formato texto
     */
    generateDetailedReport(channels) {
        const stats = this.genreDetector.getGenreStatistics(channels);
        const validation = this.validateChannelData(channels);
        
        let report = '📋 REPORTE DETALLADO DE PROCESAMIENTO DE GÉNEROS\n';
        report += '═'.repeat(60) + '\n\n';
        
        report += `📅 Fecha: ${new Date().toLocaleString()}\n`;
        report += `📊 Total de canales procesados: ${channels.length}\n`;
        report += `🏷️  Géneros únicos detectados: ${stats.uniqueGenres}\n`;
        report += `📈 Promedio de géneros por canal: ${stats.averageGenresPerChannel.toFixed(2)}\n\n`;
        
        report += '🏷️  DISTRIBUCIÓN DE GÉNEROS:\n';
        report += '-'.repeat(30) + '\n';
        Object.entries(stats.genreCount).forEach(([genre, count]) => {
            const percentage = ((count / channels.length) * 100).toFixed(1);
            report += `${genre.padEnd(20)} ${count.toString().padStart(4)} (${percentage}%)\n`;
        });
        
        if (Object.keys(stats.genreCombinations).length > 0) {
            report += '\n🔗 COMBINACIONES DE GÉNEROS:\n';
            report += '-'.repeat(30) + '\n';
            Object.entries(stats.genreCombinations).slice(0, 10).forEach(([combo, count]) => {
                report += `${combo}: ${count} canales\n`;
            });
        }
        
        report += '\n✅ VALIDACIÓN:\n';
        report += '-'.repeat(15) + '\n';
        report += `Estado: ${validation.valid ? '✅ Válido' : '❌ Con errores'}\n`;
        report += `Errores: ${validation.errors.length}\n`;
        report += `Advertencias: ${validation.warnings.length}\n`;
        
        if (validation.errors.length > 0) {
            report += '\n❌ ERRORES:\n';
            validation.errors.forEach(error => report += `  • ${error}\n`);
        }
        
        if (validation.warnings.length > 0) {
            report += '\n⚠️  ADVERTENCIAS:\n';
            validation.warnings.slice(0, 10).forEach(warning => report += `  • ${warning}\n`);
            if (validation.warnings.length > 10) {
                report += `  ... y ${validation.warnings.length - 10} advertencias más\n`;
            }
        }
        
        return report;
    }
}

// Función principal para ejecutar desde línea de comandos
async function main() {
    const processor = new ChannelGenreProcessor();
    const result = await processor.processAllChannels();
    
    if (result.success) {
        // Generar y guardar reporte detallado
        const channels = await processor.readChannelsFromCSV();
        const report = processor.generateDetailedReport(channels);
        
        const reportPath = path.join(processor.dataPath, 'genre_processing_report.txt');
        fs.writeFileSync(reportPath, report, 'utf-8');
        console.log(`\n📋 Reporte detallado guardado en: ${reportPath}`);
    }
}

// Ejecutar si es llamado directamente
if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
    main().catch(console.error);
}