/**
 * @fileoverview CustomTVConfig - Configuración personalizada para la librería TVChannelProcessor
 * Configuración independiente del archivo .env del proyecto principal
 */

/**
 * Configuración personalizada para el procesamiento de canales de TV
 * Esta configuración refleja exactamente los valores activos del archivo .env
 */
export const customTVConfig = {
  // ===================================
  // CONFIGURACIÓN DE FUENTE DE DATOS
  // ===================================
  enableBackup: false,
  channelsSource: 'hybrid',
  autoM3uUrl: 'https://iptv-org.github.io/iptv/languages/spa.m3u',
  channelsFile: 'data/tv.csv',
  backupM3uUrl: '',
  
  // URLs M3U remotas
  m3uUrl: 'http://201.230.121.186:8000/playlist.m3u8',
  m3uUrl1: 'http://190.102.246.93:9005/playlist.m3u8',
  m3uUrl2: 'http://181.189.244.253:8000/playlist.m3u8',
  m3uUrl3: 'http://181.189.244.252:8000/playlist.m3u8',
  m3uUrl4: 'http://38.183.182.166:8000/playlist.m3u8',
  m3uUrl5: 'http://181.119.108.27:8000/playlist.m3u8',
  
  // Archivos M3U locales
  localM3uLatam1: '',
  localM3uLatam2: '',
  localM3uLatam3: '',
  localM3uLatam4: '',
  localM3uIndex: '',
  
  // Archivo CSV local adicional
  localChannelsCsv: '',
  
  // Archivo CSV de canales validados
  validatedChannelsCsv: 'data/tv.csv',
  
  // ===================================
  // CONFIGURACIÓN DE TV EN VIVO
  // ===================================
  defaultQuality: 'HD',
  cacheChannelsHours: 6,
  streamTimeoutSeconds: 30,
  enableAdultChannels: false,
  maxConcurrentStreams: 100,
  
  // ===================================
  // CONFIGURACIÓN DE CANALES PRIORITARIOS
  // ===================================
  priorityChannels: 'AMAZONICA TV IQUITOS,KARIBEÑA,LATINA,AMERICA,PANAMERICANA,ATV,Disney Channel,Negocios TV,LIGA1-MAX,ESPN Premium',
  categoryOrder: 'Deportes,TV Premium,Infantil,TV Local,Noticias,Entretenimiento,Películas,Música',
  
  // ===================================
  // CONFIGURACIÓN DE DEDUPLICACIÓN
  // ===================================
  enableIntelligentDeduplication: true,
  deduplicationStrategy: 'prioritize_working',
  deduplicationIgnoreFiles: 'data/channels.csv',
  
  // ===================================
  // CONFIGURACIÓN DE CACHE
  // ===================================
  streamCacheMaxAge: 86400,
  metaCacheMaxAge: 86400,
  manifestCacheMaxAge: 86400,
  streamStaleRevalidate: 300,
  streamStaleError: 900,
  
  // ===================================
  // CONFIGURACIÓN DE LOGOS Y ASSETS
  // ===================================
  logoCdnUrl: 'https://cdn.example.com/logos/',
  fallbackLogo: 'https://via.placeholder.com/512x512?text=TV',
  logoCacheHours: 24,
  autoFetchLogos: true,
  
  // ===================================
  // FILTROS GEOGRÁFICOS Y DE CONTENIDO
  // ===================================
  allowedCountries: '',
  blockedCountries: '',
  defaultLanguage: 'ES',
  supportedLanguages: '',
  
  // Sistema de filtros de contenido
  filterReligiousContent: true,
  filterAdultContent: true,
  filterPoliticalContent: true,
  
  // Keywords para filtros
  religiousKeywords: 'jesus,cristo,dios,iglesia,cristian,catolica,evangelica,santo,santa,san,church,christian,catholic,evangelical,bible,faith,priest,pastor,gospel,fe,cristo,biblia,pastor,evangelio,misa,oracion,bendicion',
  adultKeywords: 'xxx,porn,adult,sexy,hot,erotic,nude,+18,adulto,erotico,sexual,porno,caliente,desnudo,sensual',
  politicalKeywords: 'politica,political,gobierno,president,congreso,senado,elecciones,diputado,ministro,alcalde,gobernador,partido,campaign,election,congress,senate,mayor,governor',
  
  // ===================================
  // CONFIGURACIÓN DE VALIDACIÓN DE STREAMS
  // ===================================
  validateStreamsOnStartup: true,
  removeInvalidStreams: true,
  streamValidationTimeout: 45,
  streamValidationMaxRetries: 0,
  streamValidationRetryDelay: 2000,
  validationBatchSize: 25,
  maxValidationConcurrency: 1,
  
  // Configuración de conversión HTTPS a HTTP
  convertHttpsToHttp: false,
  validateHttpConversion: false,
  httpConversionTimeout: 20,
  httpConversionMaxRetries: 1,
  
  // Configuración de validación temprana
  enableEarlyValidation: true,
  earlyValidationTimeout: 40,
  earlyValidationConcurrency: 10,
  earlyValidationBatchSize: 35,
  earlyValidationCacheSize: 1000,
  earlyValidationCacheTtl: 3600,
  
  // Configuración de validación de filtros
  validateBeforeFiltering: true,
  validateFilteredChannels: true,
  validateAfterFiltering: true,
  
  // Configuración de deduplicación
  nameSimilarityThreshold: 0.95,
  urlSimilarityThreshold: 0.98,
  enableHdUpgrade: true,
  preserveSourcePriority: true,
  enableDeduplicationMetrics: true,
  
  // Timeout para descarga de playlists
  playlistFetchTimeout: 180000,
  
  // ===================================
  // CONFIGURACIÓN AVANZADA
  // ===================================
  enableFailover: false,
  maxRetryAttempts: 3,
  retryDelayMs: 1000,
  
  // ===================================
  // CONFIGURACIÓN DE LOGS Y MONITOREO
  // ===================================
  enableRequestLogging: true,
  enablePerformanceMetrics: true,
  logLevel: 'debug',
  logFilePath: 'logs/addon.log',
  
  // ===================================
  // FILTROS DE IPS Y URLS
  // ===================================
  bannedIps: '181.188.216.5,38.180.133.31,116.90.120.149,213.57.91.138,185.236.229.62,190.123.76.22,176.65.146.237,200.125.170.122',
  bannedUrls: 'http://181.188.216.5:18000/play/a0hq/index.m3u8,http://181.189.244.252:8000/play/a085/index.m3u8,amagi.tv',
  allowedIps: '',
  allowedChannels: '',
  validSources: 'csv,m3u,remote_m3u,hybrid,automatic',
  bannedIpRanges: '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128,fe80::/10',
  bannedChannels: 'amagi,amagi.tv,willax,suran,ELIM,ABN,Diputados,Nuevo,TRADEM,PINDIN,CAMPO,CONNEC,TRANDEN,IMAX,URBANO,TIGO,SALSATV,MEDIATV,IPTV,FAST,HUNDER,METRO,REDMAX,TRAMDEN,ncm,suyai,pluto,supaya,duna,aliento,cnbc,certv,enlace,rhema,12,13,supaya,coral,cielo,chile,hch,rtv,karavana,caf,dtv,qhubo,cci,c9n,capital,ecuavisa,tc,pxtv,chv,vtv,une,tnh,ucv,VENUS,XHTVM,fight,trece,hei,zapp,tro,rtu,rcn,surtv,oriente,montecristi,ecuador,Colombia,Bethel,tele,npy,telecadena,cristo,canal,isdbt,repretel,rd,ewtn,gua,supaya,sembrador,polsat,dunya,rubix,gtv,ulica,gnnhd,gem,lahore,alaan,abu,masr,majd,yas,onyx,MIFA,ADULT,XXX,PORN,SEX,EROTIC,PLAYBOY,HUSTLER,VIVID,BRAZZERS,NAUGHTY,- Rs,Al,Saudi,Sama,Asharq,Arryadia,Bahrain,Dubai,Ad,Rotana,ksa,libya,tunisia,ien,EXTREME,VIOLENCE,GORE,HORROR,TERROR',
  
  // ===================================
  // HABILITACIÓN DE FILTROS DE CANALES
  // ===================================
  enableChannelFiltering: true,
  enableAllowedChannels: false,
  enableBannedChannels: true,
  bannedChannelsIgnoreFiles: 'data/channels.csv',
  ignoreIpsForFiltering: '181.188.216.5',
  ignoreUrlsForFiltering: '',
  ignoreChannelNamesForFiltering: '',
  
  // ===================================
  // CONFIGURACIÓN DE VALIDACIÓN DE LATENCIA
  // ===================================
  enableLatencyValidation: false,
  maxLatencyMs: 50,
  pingTimeoutMs: 5000,
  pingRetries: 2,
  pingConcurrency: 10,
  pingCount: 3
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