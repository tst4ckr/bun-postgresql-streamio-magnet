#!/usr/bin/env bun

/**
 * Script final para probar el flujo de búsqueda en cascada
 * Usa CascadingMagnetRepository directamente con configuración correcta
 */

import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración de rutas
const CONFIG = {
    primaryCsvPath: join(__dirname, 'data', 'magnets.csv'),
    secondaryCsvPath: join(__dirname, 'data', 'torrentio.csv'),
    animeCsvPath: join(__dirname, 'data', 'anime.csv'),
    torrentioApiUrl: 'https://torrentio.strem.fun/',
    timeout: 30000
};

// IMDb IDs de prueba (algunos conocidos, algunos de anime)
const TEST_IDS = [
    'tt0111161',    // The Shawshank Redemption (debería estar en magnets.csv)
    'tt0112178',    // Cowboy Bebop (anime)
    'tt0903747',    // Breaking Bad (serie)
    'tt2560140',    // Attack on Titan (anime)
    'tt0944947',    // Game of Thrones (serie)
    'tt1234567'     // ID inventado para probar API
];

async function testCascadingFlow() {
    console.log('🎯 Iniciando prueba de flujo en cascada...\n');
    
    try {
        // 1. Inicializar repositorio en cascada
        console.log('📦 Configuración:');
        console.log(`   📁 magnets.csv: ${CONFIG.primaryCsvPath}`);
        console.log(`   📁 torrentio.csv: ${CONFIG.secondaryCsvPath}`);
        console.log(`   📁 anime.csv: ${CONFIG.animeCsvPath}`);
        console.log(`   🌐 Torrentio API: ${CONFIG.torrentioApiUrl}\n`);
        
        const repository = new CascadingMagnetRepository(
            CONFIG.primaryCsvPath,
            CONFIG.secondaryCsvPath,
            CONFIG.animeCsvPath,
            CONFIG.torrentioApiUrl,
            CONFIG.timeout
        );
        
        console.log('🔧 Inicializando repositorio...');
        await repository.initialize();
        console.log('✅ Repositorio inicializado\n');
        
        // 2. Probar cada ID
        for (const imdbId of TEST_IDS) {
            console.log(`🔍 Procesando: ${imdbId}`);
            
            try {
                const startTime = Date.now();
                const magnets = await repository.getMagnetsByImdbId(imdbId);
                const endTime = Date.now();
                
                if (magnets && magnets.length > 0) {
                    console.log(`   ✅ Encontrados ${magnets.length} magnets en ${endTime - startTime}ms`);
                    console.log(`   📋 Fuente: ${magnets[0].source || 'desconocida'}`);
                    console.log(`   🎬 Primero: ${magnets[0].name} (${magnets[0].quality})`);
                } else {
                    console.log(`   ⚠️ No se encontraron magnets (${endTime - startTime}ms)`);
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            console.log(''); // Línea en blanco
        }
        
        // 3. Resumen
        console.log('📊 Resumen de repositorios:');
        try {
            const primaryCount = await repository.repositories.primary?.getTotalEntries?.() || 0;
            const secondaryCount = await repository.repositories.secondary?.getTotalEntries?.() || 0;
            const animeCount = await repository.repositories.anime?.getTotalEntries?.() || 0;
            
            console.log(`   📁 magnets.csv: ${primaryCount} entradas`);
            console.log(`   📁 torrentio.csv: ${secondaryCount} entradas`);
            console.log(`   📁 anime.csv: ${animeCount} entradas`);
            
        } catch (error) {
            console.log('   ℹ️ No se pudieron obtener estadísticas detalladas');
        }
        
    } catch (error) {
        console.error('❌ Error general:', error);
    }
}

// Ejecutar prueba
console.log('🚀 Iniciando prueba de flujo en cascada...\n');
testCascadingFlow().then(() => {
    console.log('\n✅ Prueba completada');
}).catch(error => {
    console.error('\n❌ Error en prueba:', error);
});