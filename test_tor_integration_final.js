#!/usr/bin/env node

/**
 * Script de prueba para verificar la implementación de Tor en TorrentioApiService
 * Prueba el endpoint específico que estaba fallando con UnsupportedProxyProtocol
 */

import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';
import { EnhancedLogger } from './src/infrastructure/utils/EnhancedLogger.js';
import { addonConfig } from './src/config/addonConfig.js';

const logger = new EnhancedLogger('debug', true);

async function testTorImplementation() {
  console.log('🔧 Iniciando prueba de implementación de Tor...');
  console.log('=' .repeat(60));
  
  // Configuración de Tor desde addonConfig
  const torConfig = addonConfig.tor;
  console.log('📋 Configuración de Tor:', torConfig);
  
  // Crear instancia de TorrentioApiService con configuración de Tor
  const torrentioService = new TorrentioApiService(
    addonConfig.repository.torrentioApiUrl,
    addonConfig.repository.secondaryCsvPath,
    logger,
    addonConfig.repository.timeout,
    torConfig // Pasar configuración de Tor
  );
  
  // URL problemática del error original
  const problematicUrl = 'https://torrentio.strem.fun/providers=mejortorrent,wolfmax4k,cinecalidad%7Csort=seeders%7Cqualityfilter=scr,cam,unknown%7Climit=10%7Clang=spanish/stream/movie/tt0848228.json';
  
  console.log('\n🎯 Probando endpoint problemático:');
  console.log('URL:', problematicUrl);
  console.log('');
  
  try {
    // Verificar disponibilidad de Tor
    console.log('🔍 Verificando disponibilidad de Tor...');
    const torAvailable = await torrentioService.checkTorAvailability();
    console.log(`Tor disponible: ${torAvailable ? '✅ SÍ' : '❌ NO'}`);
    
    if (!torAvailable) {
      console.log('⚠️  Tor no está disponible. Asegúrate de que Tor esté ejecutándose en el puerto 9050.');
      console.log('💡 Puedes iniciar Tor con: tor --SocksPort 9050');
      return;
    }
    
    console.log('\n🚀 Realizando petición a través de Tor...');
    const startTime = Date.now();
    
    // Buscar magnets para The Avengers (tt0848228)
    const results = await torrentioService.searchMagnetsById('tt0848228', 'movie');
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`\n✅ Petición exitosa en ${duration}ms`);
    console.log(`📊 Resultados encontrados: ${results.length}`);
    
    if (results.length > 0) {
      console.log('\n🎬 Primeros 3 resultados:');
      results.slice(0, 3).forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.title || 'Sin título'}`);
        console.log(`   Hash: ${result.infoHash}`);
        console.log(`   Tamaño: ${result.size || 'No especificado'}`);
        console.log(`   Calidad: ${result.quality || 'No especificada'}`);
      });
    }
    
    console.log('\n🎉 ¡Implementación de Tor funcionando correctamente!');
    
  } catch (error) {
    console.error('\n❌ Error en la prueba:');
    console.error('Tipo:', error.constructor.name);
    console.error('Mensaje:', error.message);
    console.error('Código:', error.code || 'N/A');
    
    if (error.message.includes('UnsupportedProxyProtocol')) {
      console.log('\n🔧 Diagnóstico del error UnsupportedProxyProtocol:');
      console.log('- Este error indica que la configuración de proxy no se está aplicando correctamente');
      console.log('- Verifica que las variables de entorno TOR_* estén configuradas');
      console.log('- Asegúrate de que Tor esté ejecutándose en el puerto especificado');
    }
    
    console.log('\n📋 Información de depuración:');
    console.log('- Configuración de Tor:', torConfig);
    console.log('- URL de Torrentio:', addonConfig.repository.torrentioApiUrl);
    console.log('- Timeout:', addonConfig.repository.timeout);
  }
}

// Función para verificar el estado de Tor
async function checkTorStatus() {
  console.log('\n🔍 Verificando estado de Tor...');
  
  try {
    const net = await import('net');
    
    return new Promise((resolve) => {
      const socket = new net.default.Socket();
      const timeout = 3000;
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        console.log('✅ Tor está ejecutándose en 127.0.0.1:9050');
        socket.destroy();
        resolve(true);
      });
      
      socket.on('timeout', () => {
        console.log('⏰ Timeout conectando a Tor');
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', (err) => {
        console.log('❌ Error conectando a Tor:', err.message);
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(9050, '127.0.0.1');
    });
  } catch (error) {
    console.error('Error verificando Tor:', error.message);
    return false;
  }
}

// Ejecutar pruebas
async function main() {
  console.log('🧪 PRUEBA DE INTEGRACIÓN DE TOR');
  console.log('================================\n');
  
  // Verificar estado de Tor primero
  const torRunning = await checkTorStatus();
  
  if (!torRunning) {
    console.log('\n⚠️  Tor no está ejecutándose. Iniciando prueba de todas formas...');
  }
  
  // Ejecutar prueba principal
  await testTorImplementation();
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 Prueba completada');
}

// Ejecutar si es el archivo principal
if (import.meta.main) {
  main().catch(console.error);
}

export { testTorImplementation, checkTorStatus };