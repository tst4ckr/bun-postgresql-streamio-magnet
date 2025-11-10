/**
 * Servicio de Addon para Stremio
 * 
 * Integra los canales de TV con géneros dinámicos en un addon funcional de Stremio,
 * proporcionando catálogos filtrados por género y metadatos completos.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ChannelGenreProcessor from './ChannelGenreProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class StremioAddonService {
    constructor() {
        this.processor = new ChannelGenreProcessor();
        this.dataPath = path.join(__dirname, '../../data');
        this.addonId = 'org.veoveo.tv.channels';
        this.addonName = 'VeoVeo TV Channels';
        this.addonVersion = '1.0.0';
        this.channels = [];
        this.genres = [];
    }

    /**
     * Inicializa el servicio cargando canales y géneros
     */
    async initialize() {
        try {
            console.log('🚀 Inicializando Stremio Addon Service...');
            
            // Cargar canales procesados
            this.channels = await this.processor.readChannelsFromCSV();
            console.log(`📺 Cargados ${this.channels.length} canales`);
            
            // Extraer géneros únicos
            this.extractUniqueGenres();
            console.log(`🏷️  Detectados ${this.genres.length} géneros únicos`);
            
            console.log('✅ Servicio inicializado correctamente');
            return true;
            
        } catch (error) {
            console.error('❌ Error inicializando servicio:', error.message);
            return false;
        }
    }

    /**
     * Extrae géneros únicos de todos los canales
     */
    extractUniqueGenres() {
        const genreSet = new Set();
        
        this.channels.forEach(channel => {
            if (channel.genre) {
                const channelGenres = channel.genre.split(',').map(g => g.trim());
                channelGenres.forEach(genre => genreSet.add(genre));
            }
        });
        
        this.genres = Array.from(genreSet).sort();
    }

    /**
     * Genera el manifiesto del addon para Stremio
     * @returns {Object} Manifiesto del addon
     */
    generateManifest() {
        return {
            id: this.addonId,
            name: this.addonName,
            version: this.addonVersion,
            description: 'Addon de canales de TV con géneros dinámicos y filtrado avanzado',
            logo: 'https://via.placeholder.com/256x256/1a1a1a/ffffff?text=VeoVeo',
            background: 'https://via.placeholder.com/1920x1080/1a1a1a/ffffff?text=VeoVeo+TV',
            
            // Tipos de contenido soportados
            types: ['tv'],
            
            // Recursos disponibles
            resources: [
                'catalog',
                'meta',
                'stream'
            ],
            
            // Catálogos disponibles
            catalogs: [
                {
                    id: 'tv_all',
                    type: 'tv',
                    name: 'Todos los Canales',
                    extra: [
                        {
                            name: 'genre',
                            options: this.genres,
                            isRequired: false
                        },
                        {
                            name: 'search',
                            isRequired: false
                        }
                    ]
                },
                {
                    id: 'tv_local',
                    type: 'tv',
                    name: 'Canales Locales',
                    extra: [
                        {
                            name: 'genre',
                            options: this.genres.filter(g => 
                                ['Local', 'Peruvian', 'Argentine', 'Colombian', 'Mexican'].includes(g)
                            ),
                            isRequired: false
                        }
                    ]
                },
                {
                    id: 'tv_international',
                    type: 'tv',
                    name: 'Canales Internacionales',
                    extra: [
                        {
                            name: 'genre',
                            options: this.genres.filter(g => 
                                ['International', 'Spanish Language', 'Entertainment'].includes(g)
                            ),
                            isRequired: false
                        }
                    ]
                },
                {
                    id: 'tv_hd',
                    type: 'tv',
                    name: 'Canales HD',
                    extra: [
                        {
                            name: 'genre',
                            options: this.genres,
                            isRequired: false
                        }
                    ]
                }
            ],
            
            // Configuración adicional
            behaviorHints: {
                adult: false,
                p2p: false,
                configurable: true,
                configurationRequired: false
            },
            
            // Metadatos del addon
            contactEmail: 'support@veoveo.tv',
            idPrefixes: ['tv_'],
            
            // Géneros soportados
            genres: this.genres
        };
    }

    /**
     * Genera catálogo de canales con filtros aplicados
     * @param {string} catalogId - ID del catálogo
     * @param {Object} extra - Parámetros de filtrado
     * @returns {Object} Catálogo de canales
     */
    generateCatalog(catalogId, extra = {}) {
        let filteredChannels = [...this.channels];
        
        // Aplicar filtros según el catálogo
        switch (catalogId) {
            case 'tv_local':
                filteredChannels = filteredChannels.filter(ch => 
                    ch.genre && (
                        ch.genre.includes('Local') ||
                        ch.genre.includes('Peruvian') ||
                        ch.genre.includes('Argentine') ||
                        ch.genre.includes('Colombian') ||
                        ch.genre.includes('Mexican')
                    )
                );
                break;
                
            case 'tv_international':
                filteredChannels = filteredChannels.filter(ch => 
                    ch.genre && ch.genre.includes('International')
                );
                break;
                
            case 'tv_premium':
                filteredChannels = filteredChannels.filter(ch => 
                    ch.genre && ch.genre.includes('Premium')
                );
                break;
        }
        
        // Aplicar filtro de género si se especifica
        if (extra.genre) {
            filteredChannels = filteredChannels.filter(ch => 
                ch.genre && ch.genre.includes(extra.genre)
            );
        }
        
        // Aplicar búsqueda si se especifica
        if (extra.search) {
            const searchTerm = extra.search.toLowerCase();
            filteredChannels = filteredChannels.filter(ch => 
                ch.name && ch.name.toLowerCase().includes(searchTerm)
            );
        }
        
        // Convertir canales a formato Stremio
        const metas = filteredChannels.map(channel => this.channelToMeta(channel));
        
        return {
            metas: metas.slice(0, 100), // Limitar a 100 resultados por página
            cacheMaxAge: 3600 // Cache por 1 hora
        };
    }

    /**
     * Convierte un canal a formato Meta de Stremio
     * @param {Object} channel - Canal de TV
     * @returns {Object} Meta object para Stremio
     */
    channelToMeta(channel) {
        const genres = channel.genre ? channel.genre.split(',').map(g => g.trim()) : [];
        
        return {
            id: channel.id,
            type: 'tv',
            name: channel.name,
            poster: channel.logo ? `https://your-domain.com/${channel.logo}` : null,
            background: channel.logo ? `https://your-domain.com/${channel.logo}` : null,
            logo: channel.logo ? `https://your-domain.com/${channel.logo}` : null,
            description: this.generateChannelDescription(channel),
            genres: genres,
            country: channel.country || 'Unknown',
            language: channel.language || 'es',
            year: new Date().getFullYear(),
            imdbRating: null,
            
            // Metadatos adicionales específicos de TV
            tvdb_id: null,
            imdb_id: null,
            
            // Información del canal
            channelInfo: {
                quality: channel.quality || 'Auto',
                type: channel.type || 'tv',
                isActive: channel.is_active === 'true',
                streamUrl: channel.stream_url
            }
        };
    }

    /**
     * Genera descripción del canal basada en sus metadatos
     * @param {Object} channel - Canal de TV
     * @returns {string} Descripción del canal
     */
    generateChannelDescription(channel) {
        const parts = [];
        
        if (channel.genre) {
            const genres = channel.genre.split(',').map(g => g.trim());
            parts.push(`Géneros: ${genres.join(', ')}`);
        }
        
        if (channel.country && channel.country !== 'Unknown') {
            parts.push(`País: ${channel.country}`);
        }
        
        if (channel.language) {
            parts.push(`Idioma: ${channel.language}`);
        }
        
        if (channel.quality && channel.quality !== 'Auto') {
            parts.push(`Calidad: ${channel.quality}`);
        }
        
        return parts.join(' • ');
    }

    /**
     * Obtiene metadatos detallados de un canal específico
     * @param {string} channelId - ID del canal
     * @returns {Object} Metadatos completos del canal
     */
    getChannelMeta(channelId) {
        const channel = this.channels.find(ch => ch.id === channelId);
        
        if (!channel) {
            return null;
        }
        
        const meta = this.channelToMeta(channel);
        
        // Agregar información adicional para vista detallada
        meta.videos = [{
            id: `${channelId}_live`,
            title: 'En Vivo',
            season: 1,
            episode: 1,
            overview: 'Transmisión en vivo del canal',
            thumbnail: meta.poster,
            streams: [{
                url: channel.stream_url,
                title: `${channel.name} - En Vivo`,
                quality: channel.quality || 'Auto'
            }]
        }];
        
        return {
            meta,
            cacheMaxAge: 3600
        };
    }

    /**
     * Obtiene streams disponibles para un canal
     * @param {string} channelId - ID del canal
     * @returns {Object} Streams disponibles
     */
    getChannelStreams(channelId) {
        const channel = this.channels.find(ch => ch.id === channelId);
        
        if (!channel || !channel.stream_url) {
            return { streams: [] };
        }
        
        return {
            streams: [{
                url: channel.stream_url,
                title: `${channel.name} - En Vivo`,
                quality: channel.quality || 'Auto',
                
                // Metadatos del stream
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: `tv_${channel.country || 'international'}`,
                    countryWhitelist: channel.country ? [channel.country] : null
                }
            }],
            cacheMaxAge: 300 // Cache por 5 minutos
        };
    }

    /**
     * Genera estadísticas del addon
     * @returns {Object} Estadísticas completas
     */
    generateAddonStats() {
        const stats = {
            totalChannels: this.channels.length,
            totalGenres: this.genres.length,
            channelsByCountry: {},
            channelsByGenre: {},
            channelsByQuality: {},
            activeChannels: 0
        };
        
        this.channels.forEach(channel => {
            // Por país
            const country = channel.country || 'Unknown';
            stats.channelsByCountry[country] = (stats.channelsByCountry[country] || 0) + 1;
            
            // Por calidad
            const quality = channel.quality || 'Auto';
            stats.channelsByQuality[quality] = (stats.channelsByQuality[quality] || 0) + 1;
            
            // Canales activos
            if (channel.is_active === 'true') {
                stats.activeChannels++;
            }
            
            // Por género
            if (channel.genre) {
                const genres = channel.genre.split(',').map(g => g.trim());
                genres.forEach(genre => {
                    stats.channelsByGenre[genre] = (stats.channelsByGenre[genre] || 0) + 1;
                });
            }
        });
        
        return stats;
    }

    /**
     * Guarda la configuración completa del addon
     */
    async saveAddonConfiguration() {
        try {
            const manifest = this.generateManifest();
            const stats = this.generateAddonStats();
            
            const config = {
                manifest,
                stats,
                generatedAt: new Date().toISOString(),
                channels: this.channels.length,
                genres: this.genres
            };
            
            const configPath = path.join(this.dataPath, 'stremio_addon_config.json');
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            
            console.log(`⚙️  Configuración del addon guardada en: ${configPath}`);
            return config;
            
        } catch (error) {
            console.error('❌ Error guardando configuración del addon:', error.message);
            throw error;
        }
    }

    /**
     * Valida la configuración del addon
     * @returns {Object} Resultado de la validación
     */
    validateAddonConfiguration() {
        const validation = {
            valid: true,
            errors: [],
            warnings: []
        };
        
        // Validar canales
        if (this.channels.length === 0) {
            validation.errors.push('No hay canales cargados');
            validation.valid = false;
        }
        
        // Validar géneros
        if (this.genres.length === 0) {
            validation.warnings.push('No se detectaron géneros');
        }
        
        // Validar URLs de stream
        const channelsWithoutStream = this.channels.filter(ch => !ch.stream_url);
        if (channelsWithoutStream.length > 0) {
            validation.warnings.push(`${channelsWithoutStream.length} canales sin URL de stream`);
        }
        
        // Validar logos
        const channelsWithoutLogo = this.channels.filter(ch => !ch.logo);
        if (channelsWithoutLogo.length > 0) {
            validation.warnings.push(`${channelsWithoutLogo.length} canales sin logo`);
        }
        
        return validation;
    }
}

// Función principal para pruebas
async function main() {
    const addonService = new StremioAddonService();
    
    console.log('🧪 PRUEBA DEL SERVICIO DE ADDON STREMIO');
    console.log('═'.repeat(50));
    
    // Inicializar servicio
    const initialized = await addonService.initialize();
    if (!initialized) {
        console.error('❌ Error inicializando servicio');
        return;
    }
    
    // Generar y mostrar manifiesto
    console.log('\n📋 MANIFIESTO DEL ADDON:');
    const manifest = addonService.generateManifest();
    console.log(`ID: ${manifest.id}`);
    console.log(`Nombre: ${manifest.name}`);
    console.log(`Versión: ${manifest.version}`);
    console.log(`Catálogos: ${manifest.catalogs.length}`);
    console.log(`Géneros soportados: ${manifest.genres.length}`);
    
    // Probar catálogos
    console.log('\n📺 PRUEBA DE CATÁLOGOS:');
    const catalogIds = ['tv_all', 'tv_local', 'tv_international', 'tv_hd'];
    
    for (const catalogId of catalogIds) {
        const catalog = addonService.generateCatalog(catalogId);
        console.log(`${catalogId}: ${catalog.metas.length} canales`);
    }
    
    // Probar filtros de género
    console.log('\n🏷️  PRUEBA DE FILTROS POR GÉNERO:');
    const testGenres = ['Sports', 'News', 'Kids', 'Music'];
    
    for (const genre of testGenres) {
        const catalog = addonService.generateCatalog('tv_all', { genre });
        console.log(`${genre}: ${catalog.metas.length} canales`);
    }
    
    // Validar configuración
    console.log('\n✅ VALIDACIÓN:');
    const validation = addonService.validateAddonConfiguration();
    console.log(`Estado: ${validation.valid ? '✅ Válido' : '❌ Con errores'}`);
    console.log(`Errores: ${validation.errors.length}`);
    console.log(`Advertencias: ${validation.warnings.length}`);
    
    if (validation.errors.length > 0) {
        validation.errors.forEach(error => console.log(`  ❌ ${error}`));
    }
    
    if (validation.warnings.length > 0) {
        validation.warnings.slice(0, 3).forEach(warning => console.log(`  ⚠️  ${warning}`));
    }
    
    // Guardar configuración
    await addonService.saveAddonConfiguration();
    
    console.log('\n✅ Prueba completada exitosamente!');
}

// Ejecutar si es llamado directamente
if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
    main().catch(console.error);
}