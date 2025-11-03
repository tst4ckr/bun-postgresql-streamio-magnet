/**
 * @fileoverview CustomTVConfig - Configuración personalizada para la librería TVChannelProcessor
 * Configuración independiente del archivo .env del proyecto principal
 */

/**
 * Configuración personalizada para el procesamiento de canales de TV
 * Esta configuración refleja exactamente los valores activos del archivo .env
 */
export const customTVConfig = {
  // Configuración del addon
  addon: {
    id: 'org.stremio.custom-tv-addon',
    name: 'Custom TV Addon',
    description: 'Addon personalizado de TV con configuración custom',
    version: '2.0.0',
    contactEmail: 'custom@example.com',
    enableUserConfig: false,
    enableDeepLinks: false
  },

  // ===================================
  // CONFIGURACIÓN DE FUENTE DE DATOS
  // ===================================
  ENABLE_BACKUP: false,
  CHANNELS_SOURCE: 'hybrid',
  AUTO_M3U_URL: 'https://iptv-org.github.io/iptv/languages/spa.m3u',
  CHANNELS_FILE: 'data/tv.csv',
  BACKUP_M3U_URL: '',
  
  // URLs M3U remotas
  M3U_URL: 'http://201.230.121.186:8000/playlist.m3u8',
  M3U_URL1: 'http://190.102.246.93:9005/playlist.m3u8',
  M3U_URL2: 'http://181.189.244.253:8000/playlist.m3u8',
  M3U_URL3: 'http://181.189.244.252:8000/playlist.m3u8',
  M3U_URL4: 'http://38.183.182.166:8000/playlist.m3u8',
  M3U_URL5: 'http://181.119.108.27:8000/playlist.m3u8',
  
  // Archivos M3U locales
  LOCAL_M3U_LATAM1: '',
  LOCAL_M3U_LATAM2: '',
  LOCAL_M3U_LATAM3: '',
  LOCAL_M3U_LATAM4: '',
  LOCAL_M3U_INDEX: '',
  
  // Archivo CSV local adicional
  LOCAL_CHANNELS_CSV: '',
  
  // Archivo CSV de canales validados
  VALIDATED_CHANNELS_CSV: 'data/tv.csv',
  
  // ===================================
  // CONFIGURACIÓN DE TV EN VIVO
  // ===================================
  DEFAULT_QUALITY: 'HD',
  CACHE_CHANNELS_HOURS: 6,
  STREAM_TIMEOUT_SECONDS: 30,
  ENABLE_ADULT_CHANNELS: false,
  MAX_CONCURRENT_STREAMS: 100,
  
  // ===================================
  // CONFIGURACIÓN DE CANALES PRIORITARIOS
  // ===================================
  PRIORITY_CHANNELS: 'AMAZONICA TV IQUITOS,KARIBEÑA,LATINA,AMERICA,PANAMERICANA,ATV,Disney Channel,Negocios TV,LIGA1-MAX,ESPN Premium',
  CATEGORY_ORDER: 'Deportes,TV Premium,Infantil,TV Local,Noticias,Entretenimiento,Películas,Música',
  
  // ===================================
  // CONFIGURACIÓN DE DEDUPLICACIÓN
  // ===================================
  ENABLE_INTELLIGENT_DEDUPLICATION: true,
  DEDUPLICATION_STRATEGY: 'prioritize_working',
  DEDUPLICATION_IGNORE_FILES: 'data/channels.csv',
  
  // ===================================
  // CONFIGURACIÓN DE CACHE
  // ===================================
  STREAM_CACHE_MAX_AGE: 86400,
  META_CACHE_MAX_AGE: 86400,
  MANIFEST_CACHE_MAX_AGE: 86400,
  STREAM_STALE_REVALIDATE: 300,
  STREAM_STALE_ERROR: 900,
  
  // ===================================
  // CONFIGURACIÓN DE LOGOS Y ASSETS
  // ===================================
  LOGO_CDN_URL: 'https://cdn.example.com/logos/',
  FALLBACK_LOGO: 'https://via.placeholder.com/512x512?text=TV',
  LOGO_CACHE_HOURS: 24,
  AUTO_FETCH_LOGOS: true,
  
  // ===================================
  // FILTROS GEOGRÁFICOS Y DE CONTENIDO
  // ===================================
  ALLOWED_COUNTRIES: '',
  BLOCKED_COUNTRIES: '',
  DEFAULT_LANGUAGE: 'ES',
  SUPPORTED_LANGUAGES: '',
  
  // Sistema de filtros de contenido
  FILTER_RELIGIOUS_CONTENT: true,
  FILTER_ADULT_CONTENT: true,
  FILTER_POLITICAL_CONTENT: true,
  
  // Keywords para filtros
  RELIGIOUS_KEYWORDS: 'jesus,cristo,dios,iglesia,cristian,catolica,evangelica,santo,santa,san,church,christian,catholic,evangelical,bible,faith,priest,pastor,gospel,fe,cristo,biblia,pastor,evangelio,misa,oracion,bendicion',
  ADULT_KEYWORDS: 'xxx,porn,adult,sexy,hot,erotic,nude,+18,adulto,erotico,sexual,porno,caliente,desnudo,sensual',
  POLITICAL_KEYWORDS: 'politica,political,gobierno,president,congreso,senado,elecciones,diputado,ministro,alcalde,gobernador,partido,campaign,election,congress,senate,mayor,governor',
  
  // ===================================
  // CONFIGURACIÓN DE VALIDACIÓN DE STREAMS
  // ===================================
  VALIDATE_STREAMS_ON_STARTUP: true,
  REMOVE_INVALID_STREAMS: true,
  STREAM_VALIDATION_TIMEOUT: 45,
  STREAM_VALIDATION_MAX_RETRIES: 0,
  STREAM_VALIDATION_RETRY_DELAY: 2000,
  VALIDATION_BATCH_SIZE: 25,
  MAX_VALIDATION_CONCURRENCY: 1,
  
  // Configuración de conversión HTTPS a HTTP
  CONVERT_HTTPS_TO_HTTP: false,
  VALIDATE_HTTP_CONVERSION: false,
  HTTP_CONVERSION_TIMEOUT: 20,
  HTTP_CONVERSION_MAX_RETRIES: 1,
  
  // Configuración de validación temprana
  ENABLE_EARLY_VALIDATION: true,
  EARLY_VALIDATION_TIMEOUT: 40,
  EARLY_VALIDATION_CONCURRENCY: 10,
  EARLY_VALIDATION_BATCH_SIZE: 35,
  EARLY_VALIDATION_CACHE_SIZE: 1000,
  EARLY_VALIDATION_CACHE_TTL: 3600,
  
  // Configuración de validación de filtros
  VALIDATE_BEFORE_FILTERING: true,
  VALIDATE_FILTERED_CHANNELS: true,
  VALIDATE_AFTER_FILTERING: true,
  
  // Configuración de deduplicación
  NAME_SIMILARITY_THRESHOLD: 0.95,
  URL_SIMILARITY_THRESHOLD: 0.98,
  ENABLE_HD_UPGRADE: true,
  PRESERVE_SOURCE_PRIORITY: true,
  ENABLE_DEDUPLICATION_METRICS: true,
  
  // Timeout para descarga de playlists
  PLAYLIST_FETCH_TIMEOUT: 180000,
  
  // ===================================
  // CONFIGURACIÓN AVANZADA
  // ===================================
  ENABLE_FAILOVER: false,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  
  // ===================================
  // CONFIGURACIÓN DE LOGS Y MONITOREO
  // ===================================
  ENABLE_REQUEST_LOGGING: true,
  ENABLE_PERFORMANCE_METRICS: true,
  LOG_LEVEL: 'debug',
  LOG_FILE_PATH: 'logs/addon.log',
  
  // ===================================
  // FILTROS DE IPS Y URLS
  // ===================================
  BANNED_IPS: '181.188.216.5,38.180.133.31,116.90.120.149,213.57.91.138,185.236.229.62,190.123.76.22,176.65.146.237,200.125.170.122',
  BANNED_URLS: 'http://181.188.216.5:18000/play/a0hq/index.m3u8,http://181.189.244.252:8000/play/a085/index.m3u8,amagi.tv',
  ALLOWED_IPS: '',
  ALLOWED_CHANNELS: '',
  VALID_SOURCES: 'csv,m3u,remote_m3u,hybrid,automatic',
  BANNED_IP_RANGES: '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128,fe80::/10',
  BANNED_CHANNELS: 'amagi,amagi.tv,willax,suran,ELIM,ABN,Diputados,Nuevo,TRADEM,PINDIN,CAMPO,CONNEC,TRANDEN,IMAX,URBANO,TIGO,SALSATV,MEDIATV,IPTV,FAST,HUNDER,METRO,REDMAX,TRAMDEN,ncm,suyai,pluto,supaya,duna,aliento,cnbc,certv,enlace,rhema,12,13,supaya,coral,cielo,chile,hch,rtv,karavana,caf,dtv,qhubo,cci,c9n,capital,ecuavisa,tc,pxtv,chv,vtv,une,tnh,ucv,VENUS,XHTVM,fight,trece,hei,zapp,tro,rtu,rcn,surtv,oriente,montecristi,ecuador,Colombia,Bethel,tele,npy,telecadena,cristo,canal,isdbt,repretel,rd,ewtn,gua,supaya,sembrador,polsat,dunya,rubix,gtv,ulica,gnnhd,gem,lahore,alaan,abu,masr,majd,yas,onyx,MIFA,ADULT,XXX,PORN,SEX,EROTIC,PLAYBOY,HUSTLER,VIVID,BRAZZERS,NAUGHTY,- Rs,Al,Saudi,Sama,Asharq,Arryadia,Bahrain,Dubai,Ad,Rotana,ksa,libya,tunisia,ien,EXTREME,VIOLENCE,GORE,HORROR,TERROR',
  
  // ===================================
  // HABILITACIÓN DE FILTROS DE CANALES
  // ===================================
  ENABLE_CHANNEL_FILTERING: true,
  ENABLE_ALLOWED_CHANNELS: false,
  ENABLE_BANNED_CHANNELS: true,
  BANNED_CHANNELS_IGNORE_FILES: 'data/channels.csv',
  IGNORE_IPS_FOR_FILTERING: '181.188.216.5',
  IGNORE_URLS_FOR_FILTERING: '',
  IGNORE_CHANNEL_NAMES_FOR_FILTERING: '',
  
  // ===================================
  // CONFIGURACIÓN DE VALIDACIÓN DE LATENCIA
  // ===================================
  ENABLE_LATENCY_VALIDATION: false,
  MAX_LATENCY_MS: 50,
  PING_TIMEOUT_MS: 5000,
  PING_RETRIES: 2,
  PING_CONCURRENCY: 10,
  PING_COUNT: 3
};

/**
 * Función para obtener la configuración personalizada
 * @returns {Object} Configuración personalizada
 */
export function getCustomTVConfig() {
    return { ...customTVConfig };
}

/**
 * Función para crear una configuración personalizada con overrides
 * @param {Object} overrides - Configuración a sobrescribir
 * @returns {Object} Configuración personalizada con overrides aplicados
 */
export function createCustomTVConfig(overrides = {}) {
    return mergeDeep({ ...customTVConfig }, overrides);
}

/**
 * Función auxiliar para hacer merge profundo de objetos
 * @private
 * @param {Object} target - Objeto destino
 * @param {Object} source - Objeto fuente
 * @returns {Object} Objeto con merge profundo
 */
function mergeDeep(target, source) {
    const output = { ...target };
    
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = mergeDeep(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    
    return output;
}

/**
 * Función auxiliar para verificar si un valor es un objeto
 * @private
 * @param {*} item - Valor a verificar
 * @returns {boolean} True si es un objeto
 */
function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

export default customTVConfig;