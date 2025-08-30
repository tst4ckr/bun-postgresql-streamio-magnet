#!/usr/bin/env bun

/**
 * Script para probar el flujo de búsqueda en cascada con IMDb IDs de anime conocidos
 * Verifica: búsqueda en CSV -> búsqueda en Torrentio -> almacenamiento
 */

import { addonConfig } from './src/config/addonConfig.js';
import { CSVMagnetRepository } from './src/infrastructure/repositories/CSVMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';

console.log('🎯 Iniciando prueba de flujo de búsqueda en cascada...\n');

// IMDb IDs de anime conocidos para prueba
const ANIME_IMDB_IDS = [
    'tt0112178',    // Cowboy Bebop
    'tt0988824',    // Naruto
    'tt2560140',    // Attack on Titan
    'tt0877057',    // Death Note
    'tt0388629'     // One Piece
];

async function testCascadingFlow() {
    try {
        // 1. Inicializar repositorios
        console.log('📦 Inicializando repositorios...');
        
        const primaryRepo = new CSVMagnetRepository(addonConfig.repository.primaryCsvPath);
        const secondaryRepo = new CSVMagnetRepository(addonConfig.repository.secondaryCsvPath);
        const animeRepo = new CSVMagnetRepository(addonConfig.repository.animeCsvPath);
        const torrentioService = new TorrentioApiService();
        
        await primaryRepo.initialize();
        await secondaryRepo.initialize();
        await animeRepo.initialize();
        
        console.log('✅ Repositorios inicializados');
        
        // 2. Verificar estadísticas
        console.log('\n📊 Estadísticas de repositorios:');
        console.log(`   📁 magnets.csv: ${await primaryRepo.getTotalEntries()} entradas`);
        console.log(`   📁 torrentio.csv: ${await secondaryRepo.getTotalEntries()} entradas`);
        console.log(`   📁 anime.csv: ${await animeRepo.getTotalEntries()} entradas`);
        
        // 3. Probar cada IMDb ID
        for (const imdbId of ANIME_IMDB_IDS) {
            console.log(`\n🔍 Procesando ${imdbId}...`);
            
            try {
                let magnets = [];
                let source = '';
                
                // Paso 1: Buscar en magnets.csv
                console.log(`   ↳ Buscando en magnets.csv...`);
                const primaryMagnets = await primaryRepo.findByImdbId(imdbId);
                if (primaryMagnets && primaryMagnets.length > 0) {
                    magnets = primaryMagnets;
                    source = 'magnets.csv';
                    console.log(`   ✅ Encontrados ${magnets.length} en ${source}`);
                }
                
                // Paso 2: Buscar en torrentio.csv
                if (magnets.length === 0) {
                    console.log(`   ↳ Buscando en torrentio.csv...`);
                    const secondaryMagnets = await secondaryRepo.findByImdbId(imdbId);
                    if (secondaryMagnets && secondaryMagnets.length > 0) {
                        magnets = secondaryMagnets;
                        source = 'torrentio.csv';
                        console.log(`   ✅ Encontrados ${magnets.length} en ${source}`);
                    }
                }
                
                // Paso 3: Buscar en anime.csv
                if (magnets.length === 0) {
                    console.log(`   ↳ Buscando en anime.csv...`);
                    const animeMagnets = await animeRepo.findByImdbId(imdbId);
                    if (animeMagnets && animeMagnets.length > 0) {
                        magnets = animeMagnets;
                        source = 'anime.csv';
                        console.log(`   ✅ Encontrados ${magnets.length} en ${source}`);
                    }
                }
                
                // Paso 4: Buscar en Torrentio API
                if (magnets.length === 0) {
                    console.log(`   ↳ Buscando en Torrentio API...`);
                    const apiMagnets = await torrentioService.searchMagnets(imdbId);
                    if (apiMagnets && apiMagnets.length > 0) {
                        magnets = apiMagnets;
                        source = 'Torrentio API';
                        console.log(`   ✅ Encontrados ${magnets.length} en ${source}`);
                        
                        // Mostrar cómo se guardarían
                        console.log(`   💾 Estos se guardarían en torrentio.csv`);
                    }
                }
                
                // Mostrar resultados
                if (magnets.length > 0) {
                    console.log(`   📋 Resultados (${source}):`);
                    magnets.slice(0, 2).forEach((magnet, index) => {
                        console.log(`      ${index + 1}. ${magnet.name} (${magnet.quality}) - ${magnet.seeders || 0} seeds`);
                    });
                } else {
                    console.log(`   ❌ No se encontraron magnets para ${imdbId}`);
                }
                
            } catch (error) {
                console.log(`   ❌ Error procesando ${imdbId}: ${error.message}`);
            }
            
            // Pequeña pausa
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
    } catch (error) {
        console.error('❌ Error en la prueba:', error);
    }
}

// Ejecutar prueba
console.log('🚀 Iniciando prueba de flujo en cascada...\n');
testCascadingFlow().then(() => {
    console.log('\n✅ Prueba completada');
}).catch(error => {
    console.error('\n❌ Error en prueba:', error);
});