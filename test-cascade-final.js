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

// Casos de prueba con diferentes tipos de contenido e identificadores
const TEST_CASES = [
    // Películas
    { id: 'tt0111161', type: 'movie', title: 'The Shawshank Redemption', category: 'Película' },
    { id: 'tt0468569', type: 'movie', title: 'The Dark Knight', category: 'Película' },
    
    // Series de TV
    { id: 'tt0903747', type: 'series', title: 'Breaking Bad', category: 'Serie TV' },
    { id: 'tt0944947', type: 'series', title: 'Game of Thrones', category: 'Serie TV' },
    { id: 'tt2356777', type: 'series', title: 'True Detective', category: 'Serie TV' },
    
    // Anime con IDs de Kitsu
    { id: 'kitsu:1', type: 'anime', title: 'Cowboy Bebop', category: 'Anime' },
    { id: 'kitsu:46752', type: 'anime', title: 'Jujutsu Kaisen', category: 'Anime' },
    { id: 'kitsu:7442', type: 'anime', title: 'Attack on Titan', category: 'Anime' },
    { id: 'kitsu:11469', type: 'anime', title: 'Demon Slayer', category: 'Anime' },
    
    // Anime con IDs de IMDb
    { id: 'tt0112178', type: 'anime', title: 'Cowboy Bebop (IMDb)', category: 'Anime' },
    { id: 'tt2560140', type: 'anime', title: 'Attack on Titan (IMDb)', category: 'Anime' },
    
    // ID de prueba para API
    { id: 'tt1234567', type: 'movie', title: 'Test Movie', category: 'Prueba API' }
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
        
        // 2. Probar cada caso de prueba
        for (const testCase of TEST_CASES) {
            console.log(`🔍 Procesando: ${testCase.id} (${testCase.category})`);
            console.log(`   📺 Título: ${testCase.title}`);
            console.log(`   🎯 Tipo: ${testCase.type}`);
            
            try {
                const startTime = Date.now();
                const magnets = await repository.getMagnetsByContentId(testCase.id, testCase.type);
                const endTime = Date.now();
                
                if (magnets && magnets.length > 0) {
                    console.log(`   ✅ Encontrados ${magnets.length} magnets en ${endTime - startTime}ms`);
                    console.log(`   📋 Fuente: ${magnets[0].source || 'desconocida'}`);
                    
                    // Mostrar información detallada del primer magnet
                    const firstMagnet = magnets[0];
                    console.log(`   🎬 Primer resultado:`);
                    console.log(`      📝 Nombre: ${firstMagnet.name}`);
                    console.log(`      🎥 Calidad: ${firstMagnet.quality || 'No especificada'}`);
                    console.log(`      📦 Tamaño: ${firstMagnet.size || 'No especificado'}`);
                    console.log(`      🌱 Seeders: ${firstMagnet.seeders || 'No especificado'}`);
                    
                    // Para series y anime, mostrar información de episodios
                    if (testCase.type === 'series' || testCase.type === 'anime') {
                        const episodes = magnets.filter(m => m.name && (m.name.includes('S0') || m.name.includes('E0') || m.name.includes('Episode') || m.name.includes('Ep')));
                        if (episodes.length > 0) {
                            console.log(`   📺 Episodios encontrados: ${episodes.length}`);
                            episodes.slice(0, 3).forEach((ep, index) => {
                                console.log(`      ${index + 1}. ${ep.name.substring(0, 60)}${ep.name.length > 60 ? '...' : ''}`);
                            });
                            if (episodes.length > 3) {
                                console.log(`      ... y ${episodes.length - 3} episodios más`);
                            }
                        }
                    }
                    
                    // Mostrar resumen por calidad
                    const qualityGroups = {};
                    magnets.forEach(m => {
                        const quality = m.quality || 'Desconocida';
                        qualityGroups[quality] = (qualityGroups[quality] || 0) + 1;
                    });
                    
                    console.log(`   📊 Distribución por calidad:`);
                    Object.entries(qualityGroups).forEach(([quality, count]) => {
                        console.log(`      ${quality}: ${count} magnets`);
                    });
                    
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