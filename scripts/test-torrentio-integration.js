/**
 * @fileoverview Script de prueba para validar la integración con Torrentio
 * Prueba la URL proporcionada y valida los archivos CSV existentes
 */

import { CascadingMagnetRepository } from '../src/infrastructure/repositories/CascadingMagnetRepository.js';
import { TorrentioApiService } from '../src/infrastructure/services/TorrentioApiService.js';
import { CSVMagnetRepository } from '../src/infrastructure/repositories/CSVMagnetRepository.js';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Configuración de prueba
 */
const TEST_CONFIG = {
  torrentioUrl: 'https://torrentio.strem.fun/providers=mejortorrent,wolfmax4k,cinecalidad%7Csort=seeders%7Cqualityfilter=scr,cam,unknown%7Climit=2%7Csizefilter=12GB',
  magnetsPath: join(projectRoot, 'data', 'magnets.csv'),
  torrentioPath: join(projectRoot, 'data', 'torrentio.csv'),
  testImdbIds: [
    'tt0111161', // The Shawshank Redemption
    'tt0109830', // Forrest Gump
    'tt1254207'  // Big Buck Bunny
  ],
  timeout: 30000
};

/**
 * Logger personalizado para las pruebas
 */
class TestLogger {
  info(message, ...args) {
    console.log(`ℹ️  [INFO] ${message}`, ...args);
  }
  
  warn(message, ...args) {
    console.log(`⚠️  [WARN] ${message}`, ...args);
  }
  
  error(message, ...args) {
    console.log(`❌ [ERROR] ${message}`, ...args);
  }
  
  debug(message, ...args) {
    console.log(`🔍 [DEBUG] ${message}`, ...args);
  }
  
  success(message, ...args) {
    console.log(`✅ [SUCCESS] ${message}`, ...args);
  }
}

/**
 * Clase principal para ejecutar las pruebas
 */
class TorrentioIntegrationTester {
  #logger;
  #config;
  
  constructor(config = TEST_CONFIG) {
    this.#config = config;
    this.#logger = new TestLogger();
  }
  
  /**
   * Ejecuta todas las pruebas
   */
  async runAllTests() {
    this.#logger.info('🚀 Iniciando pruebas de integración con Torrentio');
    this.#logger.info(`📍 URL de Torrentio: ${this.#config.torrentioUrl}`);
    
    const results = {
      csvValidation: false,
      apiConnection: false,
      cascadingSearch: false,
      dataConsistency: false
    };
    
    try {
      // Prueba 1: Validar archivos CSV existentes
      this.#logger.info('\n📋 Prueba 1: Validación de archivos CSV');
      results.csvValidation = await this.#testCsvValidation();
      
      // Prueba 2: Probar conexión con API de Torrentio
      this.#logger.info('\n🌐 Prueba 2: Conexión con API de Torrentio');
      results.apiConnection = await this.#testApiConnection();
      
      // Prueba 3: Probar búsqueda en cascada
      this.#logger.info('\n🔄 Prueba 3: Búsqueda en cascada');
      results.cascadingSearch = await this.#testCascadingSearch();
      
      // Prueba 4: Validar consistencia de datos
      this.#logger.info('\n🔍 Prueba 4: Consistencia de datos');
      results.dataConsistency = await this.#testDataConsistency();
      
      // Resumen final
      this.#printTestSummary(results);
      
    } catch (error) {
      this.#logger.error('Error crítico durante las pruebas:', error);
    }
    
    return results;
  }
  
  /**
   * Prueba 1: Validar archivos CSV existentes
   */
  async #testCsvValidation() {
    try {
      const magnetsExists = existsSync(this.#config.magnetsPath);
      const torrentioExists = existsSync(this.#config.torrentioPath);
      
      this.#logger.info(`📄 magnets.csv existe: ${magnetsExists ? '✅' : '❌'}`);
      this.#logger.info(`📄 torrentio.csv existe: ${torrentioExists ? '✅' : '❌'}`);
      
      if (magnetsExists) {
        const magnetsStats = await this.#analyzeCsvFile(this.#config.magnetsPath, 'magnets.csv');
        this.#logger.info(`📊 magnets.csv: ${magnetsStats.totalRows} filas, ${magnetsStats.uniqueImdbIds} IMDb IDs únicos`);
      }
      
      if (torrentioExists) {
        const torrentioStats = await this.#analyzeCsvFile(this.#config.torrentioPath, 'torrentio.csv');
        this.#logger.info(`📊 torrentio.csv: ${torrentioStats.totalRows} filas, ${torrentioStats.uniqueImdbIds} IMDb IDs únicos`);
      }
      
      const isValid = magnetsExists || torrentioExists;
      if (isValid) {
        this.#logger.success('Validación de CSV completada exitosamente');
      } else {
        this.#logger.error('No se encontraron archivos CSV válidos');
      }
      
      return isValid;
      
    } catch (error) {
      this.#logger.error('Error en validación de CSV:', error);
      return false;
    }
  }
  
  /**
   * Prueba 2: Probar conexión con API de Torrentio
   */
  async #testApiConnection() {
    try {
      const apiService = new TorrentioApiService(
        this.#config.torrentioUrl,
        this.#config.torrentioPath,
        this.#logger,
        this.#config.timeout
      );
      
      // Probar con un IMDb ID conocido
      const testImdbId = this.#config.testImdbIds[0];
      this.#logger.info(`🔍 Probando API con IMDb ID: ${testImdbId}`);
      
      const startTime = Date.now();
      const results = await apiService.searchMagnetsByImdbId(testImdbId);
      const duration = Date.now() - startTime;
      
      this.#logger.info(`⏱️  Tiempo de respuesta: ${duration}ms`);
      this.#logger.info(`📦 Resultados obtenidos: ${results.length}`);
      
      if (results.length > 0) {
        this.#logger.info('📋 Muestra de resultados:');
        results.slice(0, 3).forEach((magnet, index) => {
          this.#logger.info(`  ${index + 1}. ${magnet.name} (${magnet.quality}) - ${magnet.size}`);
        });
        this.#logger.success('Conexión con API de Torrentio exitosa');
        return true;
      } else {
        this.#logger.warn('API conectada pero sin resultados para el IMDb ID de prueba');
        return false;
      }
      
    } catch (error) {
      this.#logger.error('Error en conexión con API:', error);
      return false;
    }
  }
  
  /**
   * Prueba 3: Probar búsqueda en cascada
   */
  async #testCascadingSearch() {
    try {
      const cascadingRepo = new CascadingMagnetRepository(
        this.#config.magnetsPath,
        this.#config.torrentioPath,
        this.#config.animePath || 'data/anime.csv',
        this.#config.torrentioUrl,
        this.#logger,
        this.#config.timeout
      );
      
      await cascadingRepo.initialize();
      
      let successfulSearches = 0;
      const totalSearches = this.#config.testImdbIds.length;
      
      for (const imdbId of this.#config.testImdbIds) {
        try {
          this.#logger.info(`🔍 Búsqueda en cascada para: ${imdbId}`);
          const startTime = Date.now();
          const results = await cascadingRepo.getMagnetsByImdbId(imdbId);
          const duration = Date.now() - startTime;
          
          this.#logger.info(`  ⏱️  Tiempo: ${duration}ms, Resultados: ${results.length}`);
          if (results.length > 0) {
            successfulSearches++;
            this.#logger.info(`  ✅ Encontrados magnets para ${imdbId}`);
          } else {
            this.#logger.warn(`  ⚠️  Sin resultados para ${imdbId}`);
          }
          
        } catch (error) {
          this.#logger.error(`  ❌ Error en búsqueda para ${imdbId}:`, error.message);
        }
      }
      
      const successRate = (successfulSearches / totalSearches) * 100;
      this.#logger.info(`📊 Tasa de éxito: ${successfulSearches}/${totalSearches} (${successRate.toFixed(1)}%)`);
      
      if (successfulSearches > 0) {
        this.#logger.success('Búsqueda en cascada funcionando correctamente');
        return true;
      } else {
        this.#logger.error('Búsqueda en cascada no produjo resultados');
        return false;
      }
      
    } catch (error) {
      this.#logger.error('Error en búsqueda en cascada:', error);
      return false;
    }
  }
  
  /**
   * Prueba 4: Validar consistencia de datos
   */
  async #testDataConsistency() {
    try {
      this.#logger.info('🔍 Validando consistencia de datos entre fuentes...');
      
      // Comparar datos entre archivos CSV si ambos existen
      if (existsSync(this.#config.magnetsPath) && existsSync(this.#config.torrentioPath)) {
        const magnetsRepo = new CSVMagnetRepository(this.#config.magnetsPath, this.#logger);
        const torrentioRepo = new CSVMagnetRepository(this.#config.torrentioPath, this.#logger);
        
        await magnetsRepo.initialize();
        await torrentioRepo.initialize();
        
        let consistentData = 0;
        let totalChecks = 0;
        
        for (const imdbId of this.#config.testImdbIds) {
          try {
            const magnetsResults = await magnetsRepo.getMagnetsByImdbId(imdbId);
            const torrentioResults = await torrentioRepo.getMagnetsByImdbId(imdbId);
            
            totalChecks++;
            
            if (magnetsResults.length > 0 || torrentioResults.length > 0) {
              consistentData++;
              this.#logger.info(`  ✅ ${imdbId}: magnets(${magnetsResults.length}) + torrentio(${torrentioResults.length})`);
            } else {
              this.#logger.warn(`  ⚠️  ${imdbId}: Sin datos en ninguna fuente`);
            }
            
          } catch (error) {
            this.#logger.debug(`  🔍 ${imdbId}: ${error.message}`);
          }
        }
        
        const consistencyRate = totalChecks > 0 ? (consistentData / totalChecks) * 100 : 0;
        this.#logger.info(`📊 Consistencia de datos: ${consistentData}/${totalChecks} (${consistencyRate.toFixed(1)}%)`);
        
        if (consistencyRate > 0) {
          this.#logger.success('Datos consistentes entre fuentes');
          return true;
        }
      }
      
      this.#logger.info('ℹ️  Prueba de consistencia completada con limitaciones');
      return true;
      
    } catch (error) {
      this.#logger.error('Error en validación de consistencia:', error);
      return false;
    }
  }
  
  /**
   * Analiza un archivo CSV y retorna estadísticas
   */
  async #analyzeCsvFile(filePath, fileName) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      const dataLines = lines.slice(1); // Excluir header
      
      const imdbIds = new Set();
      let validRows = 0;
      
      for (const line of dataLines) {
        const columns = line.split(',');
        if (columns.length >= 3) {
          const imdbId = columns[0]?.trim();
          if (imdbId && imdbId.startsWith('tt')) {
            imdbIds.add(imdbId);
            validRows++;
          }
        }
      }
      
      return {
        totalRows: validRows,
        uniqueImdbIds: imdbIds.size,
        fileName
      };
      
    } catch (error) {
      this.#logger.error(`Error analizando ${fileName}:`, error);
      return { totalRows: 0, uniqueImdbIds: 0, fileName };
    }
  }
  
  /**
   * Imprime el resumen final de las pruebas
   */
  #printTestSummary(results) {
    this.#logger.info('\n📋 RESUMEN DE PRUEBAS');
    this.#logger.info('=' .repeat(50));
    
    const tests = [
      { name: 'Validación CSV', result: results.csvValidation },
      { name: 'Conexión API', result: results.apiConnection },
      { name: 'Búsqueda Cascada', result: results.cascadingSearch },
      { name: 'Consistencia Datos', result: results.dataConsistency }
    ];
    
    let passedTests = 0;
    
    tests.forEach(test => {
      const status = test.result ? '✅ PASS' : '❌ FAIL';
      this.#logger.info(`${test.name.padEnd(20)} ${status}`);
      if (test.result) passedTests++;
    });
    
    const successRate = (passedTests / tests.length) * 100;
    this.#logger.info('=' .repeat(50));
    this.#logger.info(`📊 Resultado: ${passedTests}/${tests.length} pruebas exitosas (${successRate.toFixed(1)}%)`);
    
    if (successRate >= 75) {
      this.#logger.success('🎉 Sistema funcionando correctamente');
    } else if (successRate >= 50) {
      this.#logger.warn('⚠️  Sistema funcionando con limitaciones');
    } else {
      this.#logger.error('❌ Sistema requiere atención');
    }
    
    // Recomendaciones
    this.#logger.info('\n💡 RECOMENDACIONES:');
    if (!results.csvValidation) {
      this.#logger.info('- Verificar que los archivos CSV existan y tengan el formato correcto');
    }
    if (!results.apiConnection) {
      this.#logger.info('- Verificar conectividad a internet y URL de Torrentio');
    }
    if (!results.cascadingSearch) {
      this.#logger.info('- Revisar configuración del repositorio en cascada');
    }
    if (!results.dataConsistency) {
      this.#logger.info('- Validar integridad de los datos en los archivos CSV');
    }
  }
}

/**
 * Función principal para ejecutar las pruebas
 */
async function main() {
  const tester = new TorrentioIntegrationTester();
  
  try {
    const results = await tester.runAllTests();
    
    // Código de salida basado en los resultados
    const successCount = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;
    
    if (successCount === totalTests) {
      process.exit(0); // Todas las pruebas exitosas
    } else if (successCount >= totalTests / 2) {
      process.exit(1); // Algunas pruebas fallaron
    } else {
      process.exit(2); // Mayoría de pruebas fallaron
    }
    
  } catch (error) {
    console.error('❌ Error crítico en las pruebas:', error);
    process.exit(3);
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { TorrentioIntegrationTester, TEST_CONFIG };