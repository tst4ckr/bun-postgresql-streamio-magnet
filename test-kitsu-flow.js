#!/usr/bin/env bun

/**
 * Script para probar el flujo completo de Kitsu ID
 * Verifica: Kitsu API -> IMDb conversion -> búsqueda en cascada -> almacenamiento
 */

import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { UnifiedIdService } from './src/infrastructure/services/UnifiedIdService.js';
import { KitsuApiService } from './src/infrastructure/services/KitsuApiService.js';
import { addonConfig } from './src/config/addonConfig.js';

console.log('🎯 Iniciando prueba de flujo Kitsu...\n');

// Kitsu IDs conocidos para prueba
const KITSU_TEST_IDS = [
    'kitsu:1',      // Cowboy Bebop
    'kitsu:5',      // Naruto
    'kitsu:11',     // Attack on Titan
    'kitsu:12',     // Death Note
    'kitsu:21'      // One Piece
];

async function testKitsuFlow() {
    try {
        // 1. Inicializar servicios
        console.log('📦 Inicializando servicios...');
        
        const repository = new CascadingMagnetRepository(
            addonConfig.repository.primaryCsvPath,
            addonConfig.repository.secondaryCsvPath,
            addonConfig.repository.animeCsvPath,
            addonConfig.repository.torrentioApiUrl,
            addonConfig.repository.timeout
        );
        
        await repository.initialize();
        console.log('✅ Repositorio en cascada inicializado');
        
        const idService = new UnifiedIdService();
        const kitsuService = new KitsuApiService();
        
        // 2. Probar cada Kitsu ID
        for (const kitsuId of KITSU_TEST_IDS) {
            console.log(`\n🔍 Procesando ${kitsuId}...`);
            
            try {
                // Paso 1: Convertir Kitsu ID a IMDb
                console.log(`   ↳ Obteniendo IMDb ID para ${kitsuId}...`);
                const imdbId = await idService.getImdbId(kitsuId);
                
                if (!imdbId) {
                    console.log(`   ❌ No se pudo obtener IMDb ID para ${kitsuId}`);
                    continue;
                }
                
                console.log(`   ✅ IMDb ID encontrado: ${imdbId}`);
                
                // Paso 2: Buscar magnets en cascada
                console.log(`   ↳ Buscando magnets en cascada...`);
                const magnets = await repository.getMagnetsByImdbId(imdbId);
                
                if (magnets && magnets.length > 0) {
                    console.log(`   ✅ Encontrados ${magnets.length} magnets:`);
                    magnets.slice(0, 3).forEach((magnet, index) => {
                        console.log(`      ${index + 1}. ${magnet.name} (${magnet.quality})`);
                    });
                } else {
                    console.log(`   ⚠️ No se encontraron magnets para ${imdbId}`);
                }
                
                // Paso 3: Verificar caché de Kitsu
                console.log(`   ↳ Verificando caché de Kitsu...`);
                const cachedImdb = await kitsuService.getImdbId(kitsuId.replace('kitsu:', ''));
                console.log(`   ℹ️ Caché Kitsu-IMDb: ${cachedImdb || 'No en caché'}`);
                
            } catch (error) {
                console.log(`   ❌ Error procesando ${kitsuId}: ${error.message}`);
            }
        }
        
        // 3. Resumen de repositorios
        console.log('\n📊 Resumen de repositorios:');
        console.log(`   📁 magnets.csv: ${repository.repositories.primary?.getStats?.()?.totalEntries || 0} entradas`);
        console.log(`   📁 torrentio.csv: ${repository.repositories.secondary?.getStats?.()?.totalEntries || 0} entradas`);
        console.log(`   📁 anime.csv: ${repository.repositories.anime?.getStats?.()?.totalEntries || 0} entradas`);
        
    } catch (error) {
        console.error('❌ Error en la prueba:', error);
    }
}

// Ejecutar prueba
console.log('🚀 Iniciando prueba de flujo Kitsu...\n');
testKitsuFlow().then(() => {
    console.log('\n✅ Prueba completada');
}).catch(error => {
    console.error('\n❌ Error en prueba:', error);
});