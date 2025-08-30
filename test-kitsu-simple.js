#!/usr/bin/env bun

/**
 * Script simplificado para probar el flujo de Kitsu
 * Verifica: Kitsu API -> IMDb conversion -> búsqueda básica
 */

import { UnifiedIdService } from './src/infrastructure/services/UnifiedIdService.js';
import { KitsuApiService } from './src/infrastructure/services/KitsuApiService.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';

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
        console.log('📦 Inicializando servicios...');
        
        const idService = new UnifiedIdService();
        const kitsuService = new KitsuApiService();
        const torrentioService = new TorrentioApiService();
        
        console.log('✅ Servicios inicializados');
        
        // Probar cada Kitsu ID
        for (const kitsuId of KITSU_TEST_IDS) {
            console.log(`\n🔍 Procesando ${kitsuId}...`);
            
            try {
                // Paso 1: Convertir Kitsu ID a IMDb
                console.log(`   ↳ Obteniendo IMDb ID para ${kitsuId}...`);
                const imdbId = await idService.getImdbId(kitsuId);
                
                if (!imdbId) {
                    console.log(`   ❌ No se pudo obtener IMDb ID para ${kitsuId}`);
                    
                    // Verificar directamente con Kitsu API
                    const kitsuNumId = kitsuId.replace('kitsu:', '');
                    const directImdb = await kitsuService.getImdbId(kitsuNumId);
                    console.log(`   📞 Kitsu API directo: ${directImdb || 'No encontrado'}`);
                    continue;
                }
                
                console.log(`   ✅ IMDb ID encontrado: ${imdbId}`);
                
                // Paso 2: Buscar magnets con Torrentio
                console.log(`   ↳ Buscando magnets para ${imdbId}...`);
                const magnets = await torrentioService.searchMagnets(imdbId);
                
                if (magnets && magnets.length > 0) {
                    console.log(`   ✅ Encontrados ${magnets.length} magnets:`);
                    magnets.slice(0, 2).forEach((magnet, index) => {
                        console.log(`      ${index + 1}. ${magnet.name} (${magnet.quality}) - ${magnet.seeders} seeds`);
                    });
                    
                    if (magnets.length > 2) {
                        console.log(`      ... y ${magnets.length - 2} más`);
                    }
                } else {
                    console.log(`   ⚠️ No se encontraron magnets para ${imdbId}`);
                }
                
                // Paso 3: Verificar caché
                const kitsuNumId = kitsuId.replace('kitsu:', '');
                const cachedImdb = await kitsuService.getImdbId(kitsuNumId);
                console.log(`   ℹ️ Caché Kitsu-IMDb: ${cachedImdb || 'No en caché'}`);
                
            } catch (error) {
                console.log(`   ❌ Error procesando ${kitsuId}: ${error.message}`);
            }
            
            // Pequeña pausa para no saturar APIs
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
    } catch (error) {
        console.error('❌ Error general:', error);
    }
}

// Ejecutar prueba
console.log('🚀 Iniciando prueba de flujo Kitsu...\n');
testKitsuFlow().then(() => {
    console.log('\n✅ Prueba completada');
}).catch(error => {
    console.error('\n❌ Error en prueba:', error);
});