import { addonConfig } from './src/config/addonConfig.js';
import { CascadingMagnetRepository } from './src/infrastructure/repositories/CascadingMagnetRepository.js';
import { TorrentioApiService } from './src/infrastructure/services/TorrentioApiService.js';

// Casos de prueba para diferentes tipos de IDs
const TEST_CASES = [
    // IDs de IMDb
    { id: 'tt0111161', type: 'movie', description: 'IMDb Movie ID' },
    { id: 'tt0944947', type: 'series', description: 'IMDb Series ID' },
    
    // IDs de TMDB
    { id: 'tmdb:550', type: 'movie', description: 'TMDB Movie ID with prefix' },
    { id: '550', type: 'movie', description: 'TMDB Movie ID without prefix' },
    
    // IDs de Kitsu
    { id: 'kitsu:1', type: 'anime', description: 'Kitsu ID with prefix' },
    { id: 'kitsu:1:1:1', type: 'anime', description: 'Kitsu ID with season/episode' },
    { id: '1', type: 'anime', description: 'Numeric ID (could be Kitsu)' },
    
    // IDs de AniList
    { id: 'anilist:21', type: 'anime', description: 'AniList ID with prefix' },
    { id: '21', type: 'anime', description: 'Numeric ID (could be AniList)' },
    
    // IDs de MAL
    { id: 'mal:1', type: 'anime', description: 'MAL ID with prefix' },
    
    // IDs de TVDB
    { id: 'tvdb:121361', type: 'series', description: 'TVDB ID with prefix' },
    { id: '121361', type: 'series', description: 'Numeric ID (could be TVDB)' }
];

async function testContentIdCompatibility() {
    console.log('🧪 Probando compatibilidad de content_id con diferentes tipos de IDs\n');
    
    try {
        // Inicializar servicios
        const repository = new CascadingMagnetRepository(
            addonConfig.repository.primaryCsvPath,
            addonConfig.repository.secondaryCsvPath,
            addonConfig.repository.animeCsvPath,
            addonConfig.repository.torrentioApiUrl,
            console, // logger
            addonConfig.repository.timeout,
            undefined, // idService (usar por defecto)
            { enabled: false }, // torConfig
            addonConfig.repository.englishCsvPath
        );
        
        await repository.initialize();
        console.log('✅ Repositorio inicializado\n');
        
        const torrentioService = new TorrentioApiService(
            addonConfig.repository.torrentioApiUrl,
            addonConfig.repository.secondaryCsvPath,
            console,
            addonConfig.repository.timeout,
            { enabled: false }, // Deshabilitar Tor para pruebas
            addonConfig.repository.englishCsvPath
        );
        
        // Probar cada caso
        for (const testCase of TEST_CASES) {
            console.log(`🔍 Probando: ${testCase.description} (${testCase.id})`);
            
            try {
                // 1. Probar búsqueda en repositorio local
                console.log(`   📁 Buscando en repositorio local...`);
                const localResults = await repository.getMagnetsByContentId(testCase.id, testCase.type);
                console.log(`   ✅ Encontrados ${localResults.length} resultados locales`);
                
                if (localResults.length > 0) {
                    const firstResult = localResults[0];
                    console.log(`   📋 Primer resultado:`);
                    console.log(`      - content_id: ${firstResult.content_id}`);
                    console.log(`      - id_type: ${firstResult.id_type || 'no definido'}`);
                    console.log(`      - imdb_id: ${firstResult.imdb_id || 'no definido'}`);
                }
                
            } catch (error) {
                if (error.message.includes('not found')) {
                    console.log(`   ℹ️  No encontrado en repositorio local`);
                } else {
                    console.log(`   ❌ Error en repositorio local: ${error.message}`);
                }
            }
            
            try {
                // 2. Probar procesamiento de ID en TorrentioApiService
                console.log(`   🔧 Probando procesamiento de ID...`);
                
                // Usar método privado a través de una búsqueda simulada
                const apiResults = await torrentioService.searchMagnetsById(testCase.id, testCase.type);
                console.log(`   ✅ API procesó correctamente el ID`);
                
                if (apiResults.length > 0) {
                    const firstApiResult = apiResults[0];
                    console.log(`   📋 Resultado de API:`);
                    console.log(`      - content_id: ${firstApiResult.content_id}`);
                    console.log(`      - id_type: ${firstApiResult.id_type || 'no definido'}`);
                    console.log(`      - imdb_id: ${firstApiResult.imdb_id || 'no definido'}`);
                }
                
            } catch (error) {
                console.log(`   ⚠️  Error en API: ${error.message}`);
            }
            
            console.log(''); // Línea en blanco
        }
        
        // Verificar contenido actual de CSV
        console.log('📊 Verificando contenido actual de archivos CSV...');
        
        const csvFiles = [
            { name: 'torrentio.csv', path: addonConfig.repository.secondaryCsvPath },
            { name: 'anime.csv', path: addonConfig.repository.animeCsvPath },
            { name: 'magnets.csv', path: addonConfig.repository.primaryCsvPath }
        ];
        
        for (const csvFile of csvFiles) {
            try {
                const csvRepo = new (await import('./src/infrastructure/repositories/CSVMagnetRepository.js')).CSVMagnetRepository(csvFile.path);
                await csvRepo.initialize();
                const totalEntries = await csvRepo.getTotalEntries();
                console.log(`   📄 ${csvFile.name}: ${totalEntries} entradas`);
            } catch (error) {
                console.log(`   ❌ Error leyendo ${csvFile.name}: ${error.message}`);
            }
        }
        
        console.log('\n✅ Prueba de compatibilidad completada');
        
    } catch (error) {
        console.error('❌ Error en la prueba:', error);
    }
}

// Ejecutar la prueba
testContentIdCompatibility().catch(console.error);