/**
 * Script de validación con 5 películas para niños
 * Verifica el sistema completo de búsqueda en cascada
 */

import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { CSVMagnetRepository } from './src/infrastructure/repositories/CSVMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { existsSync, readFileSync } from 'fs';

// Configuración
const CONFIG = {
  torrentioUrl: 'https://torrentio.strem.fun/providers=mejortorrent,wolfmax4k,cinecalidad%7Csort=seeders%7Cqualityfilter=scr,cam,unknown%7Climit=2%7Csizefilter=12GB',
  magnetsPath: 'c:\\Users\\Ankel\\Documents\\HAZ-BUN-TV-PROD\\bun-postgresql-streamio-magnet\\data\\magnets.csv',
  torrentioPath: 'c:\\Users\\Ankel\\Documents\\HAZ-BUN-TV-PROD\\bun-postgresql-streamio-magnet\\data\\torrentio.csv'
};

// Logger
const logger = {
  info: (msg, ...args) => console.log(`✅ [INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`⚠️ [WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.log(`❌ [ERROR] ${msg}`, ...args),
  success: (msg, ...args) => console.log(`🎉 [SUCCESS] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`🔍 [DEBUG] ${msg}`, ...args)
};

// Películas para niños con sus IMDb IDs
const PELICULAS_NINOS = [
  {
    id: 'tt0317219',
    titulo: 'Shrek 2',
    año: 2004,
    descripcion: 'Secuela de la popular película de animación'
  },
  {
    id: 'tt0892769',
    titulo: 'How to Train Your Dragon',
    año: 2010,
    descripcion: 'Aventura de un vikingo y su dragón'
  },
  {
    id: 'tt0382932',
    titulo: 'Ratatouille',
    año: 2007,
    descripcion: 'Rata que sueña con ser chef'
  },
  {
    id: 'tt0910970',
    titulo: 'WALL-E',
    año: 2008,
    descripcion: 'Robot que limpia la Tierra abandonada'
  },
  {
    id: 'tt2294629',
    titulo: 'Frozen',
    año: 2013,
    descripcion: 'Princesas de Arendelle y poderes de hielo'
  }
];

/**
 * Valida el formato de un archivo CSV
 */
function validateCsvFormat(filePath, expectedColumns = 6) {
  if (!existsSync(filePath)) {
    logger.error(`Archivo no encontrado: ${filePath}`);
    return false;
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  
  if (lines.length === 0) {
    logger.error(`Archivo vacío: ${filePath}`);
    return false;
  }

  // Verificar header
  const header = lines[0];
  const headerColumns = header.split(',').length;
  
  if (headerColumns !== expectedColumns) {
    logger.error(`Header incorrecto en ${filePath}: esperadas ${expectedColumns} columnas, encontradas ${headerColumns}`);
    return false;
  }

  // Contar líneas válidas
  let validLines = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line !== '') validLines++;
  }

  logger.info(`${filePath}: ${validLines} líneas de datos válidas`);
  return true;
}

/**
 * Función principal de validación
 */
async function validarSistemaConPeliculasNinos() {
  console.log('🎬 VALIDACIÓN DEL SISTEMA CON 5 PELÍCULAS PARA NIÑOS');
  console.log('='.repeat(60));

  // 1. Validar formato de archivos CSV
  console.log('\n📄 PASO 1: Validando formato de archivos CSV');
  console.log('-'.repeat(50));
  
  const magnetsValid = validateCsvFormat(CONFIG.magnetsPath, 6);
  const torrentioValid = validateCsvFormat(CONFIG.torrentioPath, 6);
  
  if (!magnetsValid || !torrentioValid) {
    logger.error('Formato de CSV inválido. Abortando validación.');
    return;
  }
  
  logger.success('Formato de archivos CSV válido');

  // 2. Inicializar repositorio en cascada
  console.log('\n🔄 PASO 2: Inicializando repositorio en cascada');
  console.log('-'.repeat(50));
  
  let cascadingRepo;
  try {
    cascadingRepo = new CascadingMagnetRepository(
      CONFIG.magnetsPath,
      CONFIG.torrentioPath,
      CONFIG.torrentioUrl,
      logger
    );
    
    await cascadingRepo.initialize();
    logger.success('Repositorio en cascada inicializado correctamente');
    
  } catch (error) {
    logger.error('Error inicializando repositorio en cascada:', error.message);
    return;
  }

  // 3. Probar búsqueda para cada película
  console.log('\n🎭 PASO 3: Probando búsqueda para películas infantiles');
  console.log('-'.repeat(50));
  
  const resultados = [];
  
  for (const pelicula of PELICULAS_NINOS) {
    try {
      console.log(`\n🎬 Buscando: ${pelicula.titulo} (${pelicula.año}) - ID: ${pelicula.id}`);
      console.log(`   📝 ${pelicula.descripcion}`);
      
      const startTime = Date.now();
      const magnets = await cascadingRepo.getMagnetsByImdbId(pelicula.id);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const resultado = {
        pelicula: pelicula,
        magnetsEncontrados: magnets.length,
        tiempoBusqueda: duration,
        magnets: magnets.slice(0, 3) // Solo los primeros 3 para no saturar
      };
      
      resultados.push(resultado);
      
      if (magnets.length > 0) {
        logger.success(`✅ ${magnets.length} magnets encontrados en ${duration}ms`);
        
        // Mostrar detalles del primer magnet
        const primerMagnet = magnets[0];
        logger.info(`   🎯 Mejor resultado: ${primerMagnet.name}`);
        logger.info(`   📊 Calidad: ${primerMagnet.quality} | Tamaño: ${primerMagnet.size}`);
        logger.info(`   🔗 Fuente: ${primerMagnet.source || 'N/A'}`);
        
        // Mostrar otros resultados si existen
        if (magnets.length > 1) {
          logger.info(`   📋 Otros ${magnets.length - 1} resultados disponibles`);
        }
      } else {
        logger.warn(`⚠️ No se encontraron magnets para ${pelicula.titulo}`);
      }
      
    } catch (error) {
      logger.error(`❌ Error buscando ${pelicula.titulo}:`, error.message);
      resultados.push({
        pelicula: pelicula,
        magnetsEncontrados: 0,
        tiempoBusqueda: 0,
        error: error.message
      });
    }
  }

  // 4. Resumen de resultados
  console.log('\n📊 PASO 4: Resumen de resultados');
  console.log('-'.repeat(50));
  
  const totalMagnets = resultados.reduce((sum, r) => sum + r.magnetsEncontrados, 0);
  const peliculasConResultados = resultados.filter(r => r.magnetsEncontrados > 0).length;
  const tiempoPromedio = resultados.reduce((sum, r) => sum + r.tiempoBusqueda, 0) / resultados.length;
  
  logger.info(`🎬 Películas probadas: ${PELICULAS_NINOS.length}`);
  logger.info(`✅ Películas con resultados: ${peliculasConResultados}`);
  logger.info(`🧲 Total de magnets encontrados: ${totalMagnets}`);
  logger.info(`⏱️ Tiempo promedio de búsqueda: ${Math.round(tiempoPromedio)}ms`);
  
  // Tabla de resultados detallada
  console.log('\n📋 TABLA DE RESULTADOS DETALLADA');
  console.log('-'.repeat(50));
  
  resultados.forEach((resultado, index) => {
    const { pelicula, magnetsEncontrados, tiempoBusqueda, error } = resultado;
    const status = error ? '❌' : magnetsEncontrados > 0 ? '✅' : '⚠️';
    
    console.log(`${status} ${index + 1}. ${pelicula.titulo} (${pelicula.año})`);
    console.log(`   📊 Resultados: ${magnetsEncontrados} | Tiempo: ${tiempoBusqueda}ms`);
    
    if (error) {
      console.log(`   ❌ Error: ${error}`);
    } else if (magnetsEncontrados > 0) {
      const fuentes = [...new Set(resultado.magnets.map(m => m.source || 'N/A'))];
      console.log(`   🔗 Fuentes: ${fuentes.join(', ')}`);
    }
    console.log('');
  });

  // 5. Conclusiones
  console.log('\n🎯 CONCLUSIONES FINALES');
  console.log('-'.repeat(50));
  
  if (peliculasConResultados >= 3) {
    logger.success('✅ Sistema funcionando correctamente');
    logger.info('🔄 Búsqueda en cascada operativa');
    logger.info('📝 Formato de 6 columnas validado');
    logger.info('🎬 Contenido infantil disponible en el sistema');
  } else {
    logger.warn('⚠️ Pocos resultados encontrados');
    logger.info('💡 Considerar agregar más fuentes o verificar conectividad');
  }
  
  logger.info('\n📋 Configuración del sistema:');
  logger.info(`   - magnets.csv: ${CONFIG.magnetsPath}`);
  logger.info(`   - torrentio.csv: ${CONFIG.torrentioPath}`);
  logger.info(`   - API Torrentio: ${CONFIG.torrentioUrl}`);
  logger.info('   - Formato: imdb_id,name,magnet,quality,size,source');
  
  console.log('\n' + '='.repeat(60));
  logger.success('🎉 VALIDACIÓN COMPLETADA');
}

// Ejecutar validación
validarSistemaConPeliculasNinos().catch(error => {
  logger.error('Error en validación del sistema:', error);
  process.exit(1);
});