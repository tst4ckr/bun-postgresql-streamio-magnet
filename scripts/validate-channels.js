#!/usr/bin/env bun

/**
 * @fileoverview Script de validación de canales
 * Valida que todos los streams estén funcionando y genera un reporte
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { CSVChannelRepository } from '../src/infrastructure/repositories/CSVChannelRepository.js';

/**
 * Validador de canales
 */
class ChannelValidator {
  constructor() {
    this.config = TVAddonConfig.getInstance();
    this.repository = new CSVChannelRepository(
      this.config.dataSources.channelsFile,
      this.config,
      console
    );
    this.results = {
      total: 0,
      valid: 0,
      invalid: 0,
      errors: [],
      details: []
    };
  }

  /**
   * Ejecuta la validación completa
   */
  async run() {
    console.log('🔍 Iniciando validación de canales...\n');

    try {
      await this.repository.initialize();
      const channels = await this.repository.getAllChannels();
      
      console.log(`📊 Total de canales a validar: ${channels.length}\n`);
      
      this.results.total = channels.length;

      for (const channel of channels) {
        await this.validateChannel(channel);
      }

      this.generateReport();

    } catch (error) {
      console.error('❌ Error durante la validación:', error);
      process.exit(1);
    }
  }

  /**
   * Valida un canal individual
   */
  async validateChannel(channel) {
    const result = {
      id: channel.id,
      name: channel.name,
      url: channel.streamUrl,
      genre: channel.genre,
      country: channel.country,
      isValid: false,
      error: null,
      responseTime: null
    };

    try {
      console.log(`🔄 Validando: ${channel.name}...`);
      
      const startTime = Date.now();
      const isValid = await this.checkStreamUrl(channel.streamUrl);
      const endTime = Date.now();
      
      result.responseTime = endTime - startTime;
      result.isValid = isValid;

      if (isValid) {
        console.log(`✅ ${channel.name} - OK (${result.responseTime}ms)`);
        this.results.valid++;
      } else {
        console.log(`❌ ${channel.name} - FALLÓ`);
        this.results.invalid++;
      }

    } catch (error) {
      console.log(`❌ ${channel.name} - ERROR: ${error.message}`);
      result.error = error.message;
      this.results.invalid++;
      this.results.errors.push({
        channel: channel.name,
        error: error.message
      });
    }

    this.results.details.push(result);
  }

  /**
   * Verifica si una URL de stream está disponible
   */
  async checkStreamUrl(url) {
    const timeoutMs = this.config.validation.streamValidationTimeout * 1000;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Stremio-TV-IPTV-Addon/1.0.0'
        }
      });

      clearTimeout(timeoutId);

      // Consideramos válido si la respuesta es 200-299 o 302-308 (redirects)
      return (response.status >= 200 && response.status < 300) || 
             (response.status >= 302 && response.status < 309);

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Timeout después de ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Genera el reporte final
   */
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📈 REPORTE DE VALIDACIÓN');
    console.log('='.repeat(60));
    
    console.log(`📊 Total de canales: ${this.results.total}`);
    console.log(`✅ Canales válidos: ${this.results.valid}`);
    console.log(`❌ Canales inválidos: ${this.results.invalid}`);
    console.log(`📈 Porcentaje de éxito: ${((this.results.valid / this.results.total) * 100).toFixed(2)}%`);

    // Estadísticas por género
    console.log('\n📺 ESTADÍSTICAS POR GÉNERO:');
    const genreStats = this.calculateGenreStats();
    Object.entries(genreStats).forEach(([genre, stats]) => {
      const successRate = ((stats.valid / stats.total) * 100).toFixed(1);
      console.log(`  ${genre}: ${stats.valid}/${stats.total} (${successRate}%)`);
    });

    // Estadísticas por país
    console.log('\n🌍 ESTADÍSTICAS POR PAÍS:');
    const countryStats = this.calculateCountryStats();
    Object.entries(countryStats).forEach(([country, stats]) => {
      const successRate = ((stats.valid / stats.total) * 100).toFixed(1);
      console.log(`  ${country}: ${stats.valid}/${stats.total} (${successRate}%)`);
    });

    // Tiempo de respuesta promedio
    const avgResponseTime = this.calculateAverageResponseTime();
    console.log(`\n⏱️  Tiempo de respuesta promedio: ${avgResponseTime}ms`);

    // Canales más rápidos
    console.log('\n🚀 CANALES MÁS RÁPIDOS:');
    const fastestChannels = this.getFastestChannels(5);
    fastestChannels.forEach((channel, index) => {
      console.log(`  ${index + 1}. ${channel.name} - ${channel.responseTime}ms`);
    });

    // Errores más comunes
    if (this.results.errors.length > 0) {
      console.log('\n🐛 ERRORES MÁS COMUNES:');
      const errorCounts = this.getErrorCounts();
      Object.entries(errorCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([error, count]) => {
          console.log(`  ${error}: ${count} ocurrencias`);
        });
    }

    // Recomendaciones
    this.generateRecommendations();

    // Guardar reporte detallado
    this.saveDetailedReport();
  }

  /**
   * Calcula estadísticas por género
   */
  calculateGenreStats() {
    const stats = {};
    
    this.results.details.forEach(channel => {
      if (!stats[channel.genre]) {
        stats[channel.genre] = { total: 0, valid: 0, invalid: 0 };
      }
      
      stats[channel.genre].total++;
      if (channel.isValid) {
        stats[channel.genre].valid++;
      } else {
        stats[channel.genre].invalid++;
      }
    });

    return stats;
  }

  /**
   * Calcula estadísticas por país
   */
  calculateCountryStats() {
    const stats = {};
    
    this.results.details.forEach(channel => {
      if (!stats[channel.country]) {
        stats[channel.country] = { total: 0, valid: 0, invalid: 0 };
      }
      
      stats[channel.country].total++;
      if (channel.isValid) {
        stats[channel.country].valid++;
      } else {
        stats[channel.country].invalid++;
      }
    });

    return stats;
  }

  /**
   * Calcula el tiempo de respuesta promedio
   */
  calculateAverageResponseTime() {
    const validChannels = this.results.details.filter(ch => ch.isValid && ch.responseTime);
    if (validChannels.length === 0) return 0;
    
    const totalTime = validChannels.reduce((sum, ch) => sum + ch.responseTime, 0);
    return Math.round(totalTime / validChannels.length);
  }

  /**
   * Obtiene los canales más rápidos
   */
  getFastestChannels(limit = 5) {
    return this.results.details
      .filter(ch => ch.isValid && ch.responseTime)
      .sort((a, b) => a.responseTime - b.responseTime)
      .slice(0, limit);
  }

  /**
   * Cuenta los errores más comunes
   */
  getErrorCounts() {
    const errorCounts = {};
    
    this.results.errors.forEach(({ error }) => {
      // Normalizar errores similares
      let normalizedError = error;
      if (error.includes('timeout') || error.includes('Timeout')) {
        normalizedError = 'Timeout de conexión';
      } else if (error.includes('ENOTFOUND') || error.includes('DNS')) {
        normalizedError = 'Error de DNS';
      } else if (error.includes('ECONNREFUSED')) {
        normalizedError = 'Conexión rechazada';
      } else if (error.includes('404')) {
        normalizedError = 'Recurso no encontrado (404)';
      } else if (error.includes('403')) {
        normalizedError = 'Acceso prohibido (403)';
      }
      
      errorCounts[normalizedError] = (errorCounts[normalizedError] || 0) + 1;
    });

    return errorCounts;
  }

  /**
   * Genera recomendaciones basadas en los resultados
   */
  generateRecommendations() {
    console.log('\n💡 RECOMENDACIONES:');
    
    const successRate = (this.results.valid / this.results.total) * 100;
    
    if (successRate < 70) {
      console.log('  ⚠️  Tasa de éxito baja. Considera revisar las fuentes de canales.');
    }
    
    if (successRate > 90) {
      console.log('  🎉 ¡Excelente! La mayoría de canales están funcionando correctamente.');
    }

    const avgResponseTime = this.calculateAverageResponseTime();
    if (avgResponseTime > 5000) {
      console.log('  🐌 Tiempo de respuesta alto. Considera optimizar el timeout de validación.');
    }

    const errorCounts = this.getErrorCounts();
    const timeoutErrors = errorCounts['Timeout de conexión'] || 0;
    if (timeoutErrors > this.results.total * 0.2) {
      console.log('  ⏱️  Muchos timeouts. Considera aumentar STREAM_VALIDATION_TIMEOUT.');
    }

    const dnsErrors = errorCounts['Error de DNS'] || 0;
    if (dnsErrors > 0) {
      console.log('  🌐 Errores de DNS detectados. Verifica la conectividad de red.');
    }
  }

  /**
   * Guarda un reporte detallado en JSON
   */
  async saveDetailedReport() {
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.total,
        valid: this.results.valid,
        invalid: this.results.invalid,
        successRate: ((this.results.valid / this.results.total) * 100).toFixed(2)
      },
      statistics: {
        byGenre: this.calculateGenreStats(),
        byCountry: this.calculateCountryStats(),
        averageResponseTime: this.calculateAverageResponseTime()
      },
      details: this.results.details,
      errors: this.results.errors
    };

    try {
      const reportPath = `logs/validation-report-${Date.now()}.json`;
      await Bun.write(reportPath, JSON.stringify(reportData, null, 2));
      console.log(`\n💾 Reporte detallado guardado en: ${reportPath}`);
    } catch (error) {
      console.warn('\n⚠️  No se pudo guardar el reporte detallado:', error.message);
    }
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('📺 Stremio TV IPTV Addon - Validador de Canales');
  console.log('='.repeat(50) + '\n');

  const validator = new ChannelValidator();
  await validator.run();

  console.log('\n✨ Validación completada!');
}

// Ejecutar si es llamado directamente
if (import.meta.main) {
  main().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
}

export { ChannelValidator };
export default main;
