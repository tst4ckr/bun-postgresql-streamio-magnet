/**
 * Servicio de Detección de Géneros Inteligente para Canales de TV
 * Versión 4.0 - Preserva géneros multi-categoría y valida géneros existentes
 * Basado en patrones reales de canales y normalización inteligente
 */

class GenreDetectionService {
    constructor() {
        this.initializePatterns();
        this.initializeNormalization();
        this.initializeMetrics();
    }

    initializeMetrics() {
        this.metrics = {
            totalProcessed: 0,
            genreDistribution: new Map(),
            detectionMethods: new Map(),
            processingTime: 0
        };
    }

    initializePatterns() {
        // Reglas de marca específicas con géneros en ESPAÑOL (optimizado para Stremio)
        this.brandGenreRules = [
            { pattern: /cnn\b|bbc world|cgtn\b|dw\b|channel newsasia|quicktake|adn40|24h\b|24\s*horas|cope\b|dw espa(n|ñ)ol|atv sur\b/i, genres: ['Noticias'] },
            { pattern: /fox sports|morethansports|red bull tv|creo sport|realmadrid tv|win sports|gol play|golf channel|espn\b|espn\s*\d+|espn\s*plus|espn\s*deportes/i, genres: ['Deportes'] },
            
            // TV Local - PERÚ: Canales nacionales y regionales
            { pattern: /tv per[uú]|canal\s*\d+\s*(per[uú]|lima)|atv\b|panamericana|frecuencia latina|am[eé]rica tv per[uú]|willax|exitosa|canal n|rpp|tv patrol|global tv|latina tv|capital tv|best cable|ovaci[oó]n tv/i, genres: ['TV Local'] },
            
            // TV Local - CHILE: Canales nacionales y regionales  
            { pattern: /tv chile|canal\s*\d+\s*chile|tvn\b|chv\b|mega chile|la red chile|canal 13 chile|telecanal|tv\+|uctv|canal regional chile|tv regional chile|canal local chile|via x|etc tv/i, genres: ['TV Local'] },
            
            // TV Local - ARGENTINA: Canales nacionales y regionales
            { pattern: /tv argentina|canal\s*\d+\s*argentina|telefe|canal 13 argentina|am[eé]rica\s*(tv\s*)?argentina|tv p[uú]blica argentina|canal 9 argentina|canal 11 argentina|canal 26|c5n|tn\s*argentina|cronica tv|canal rural|canal provincial argentina|tv regional argentina|net tv|a24|ln\+/i, genres: ['TV Local'] },
            
            // TV Local - MÉXICO: Canales nacionales y regionales
            { pattern: /tv azteca|azteca uno|azteca 7|canal 5 m[eé]xico|las estrellas|imagen tv|multimedios|televisa|canal once|canal 22|tv unam|canal del congreso m[eé]xico|tv mexiquense|tv m[aá]s|adn40/i, genres: ['TV Local'] },
            
            // TV Local - COLOMBIA: Canales nacionales y regionales
            { pattern: /caracol tv|canal rcn|canal uno colombia|teleantioquia|telepac[ií]fico|tro|canal capital|canal trece colombia|zoom tv|telecaribe|tlt|canal tro|tv agro/i, genres: ['TV Local'] },
            
            // TV Local - VENEZUELA: Canales nacionales y regionales
            { pattern: /vtv venezuela|globovisi[oó]n|venevisi[oó]n|rctv|televen|meridiano tv|vale tv|tv fanb|avn|tves|vive tv venezuela|pdvsa tv/i, genres: ['TV Local'] },
            
            // TV Local - ECUADOR: Canales nacionales y regionales
            { pattern: /ecuavisa|teleamazonas|tc televisi[oó]n|gama tv|rts ecuador|canal uno ecuador|oromar tv|unsion tv|rtv ecuador|telerama/i, genres: ['TV Local'] },
            
            // TV Local - BOLIVIA: Canales nacionales y regionales
            { pattern: /bolivia tv|atb bolivia|unitel bolivia|red uno bolivia|pac tv|tv universitaria bolivia|canal 7 bolivia|red pat bolivia/i, genres: ['TV Local'] },
            
            // TV Local - URUGUAY: Canales nacionales y regionales
            { pattern: /canal 10 uruguay|canal 12 uruguay|teledoce|vtv uruguay|tv ciudad|canal 4 uruguay|tnu|monte carlo tv/i, genres: ['TV Local'] },
            
            // TV Local - PARAGUAY: Canales nacionales y regionales
            { pattern: /snt paraguay|telefuturo|red guarani|paravisión|latele|tv pública paraguay|canal 13 paraguay|unicanal/i, genres: ['TV Local'] },
            
            // TV Local - COSTA RICA: Canales nacionales y regionales
            { pattern: /teletica|repretel|canal 7 costa rica|sinart|canal 42|extra tv costa rica|tv sur costa rica/i, genres: ['TV Local'] },
            
            // TV Local - GUATEMALA: Canales nacionales y regionales
            { pattern: /canal 3 guatemala|canal 7 guatemala|canal 13 guatemala|tv azteca guatemala|guatevisi[oó]n|canal antigua/i, genres: ['TV Local'] },
            
            // TV Local - HONDURAS: Canales nacionales y regionales
            { pattern: /televicentro honduras|canal 11 honduras|canal 5 honduras|ten canal 10|vtv honduras|canal 6 honduras/i, genres: ['TV Local'] },
            
            // TV Local - EL SALVADOR: Canales nacionales y regionales
            { pattern: /canal 2 el salvador|canal 4 el salvador|canal 6 el salvador|canal 8 el salvador|canal 10 el salvador|tcs el salvador|agape tv/i, genres: ['TV Local'] },
            
            // TV Local - NICARAGUA: Canales nacionales y regionales
            { pattern: /canal 2 nicaragua|canal 4 nicaragua|canal 8 nicaragua|canal 10 nicaragua|viva nicaragua|tn8|canal 12 nicaragua/i, genres: ['TV Local'] },
            
            // TV Local - PANAMÁ: Canales nacionales y regionales
            { pattern: /rpc panam[aá]|tvm panam[aá]|telemetro|sertv|canal + panam[aá]|next tv panam[aá]|mall tv/i, genres: ['TV Local'] },
            
            // TV Local - REPÚBLICA DOMINICANA: Canales nacionales y regionales
            { pattern: /color visi[oó]n|antena latina|telesistema|cdn|telecentro|coral 39|digital 15|telemicro|certv/i, genres: ['TV Local'] },
            
            // ESPAÑA - Canales nacionales específicos por género
            { pattern: /^(la\s?sexta|6tv)$/i, genres: ['Noticias'] },
            { pattern: /^(neox|nova|fdf|energy|be\s?mad|divinity)$/i, genres: ['Entretenimiento'] },
            { pattern: /^(teledeporte|tdp)$/i, genres: ['Deportes'] },
            { pattern: /^(clan|boing)$/i, genres: ['Infantil'] },
            { pattern: /^(cuatro|telecinco|antena\s?3|la\s?1|la\s?2)$/i, genres: ['TV Local'] },
            { pattern: /^(24h|24\s?horas)$/i, genres: ['Noticias'] },
            { pattern: /^(paramount|mega)$/i, genres: ['Entretenimiento'] },
            
            // CANALES INTERNACIONALES CONOCIDOS - Reglas específicas para marcas globales
            { pattern: /^(cnn|cnne|cnn\s?en\s?español)$/i, genres: ['Noticias'] },
            { pattern: /^(univision|telemundo)$/i, genres: ['TV Local'] },
            { pattern: /^(nick|nickelodeon|teen\s?nick|nick\s?jr|nick\s?sim|nick\s?2)$/i, genres: ['Infantil'] },
            { pattern: /^(multicinema|cinemax|movie\s?channel)$/i, genres: ['Películas'] },
            
            // TV Premium - Canales de cable pago que requieren suscripción
            { pattern: /discovery\b|discovery channel|discovery kids|discovery family|discovery science|discovery turbo|discovery theater|discovery world|discovery home|discovery investigation|discovery civilization|animal planet|tlc\b|food network|hgtv|investigation discovery|id\b/i, genres: ['TV Premium'] },
            { pattern: /espn\b|espn 2|espn 3|espn plus|espn deportes|fox sports\b|fox sports 2|fox sports 3|fox sports premium|directv sports|win sports|tnt sports|espn extra|espn play/i, genres: ['TV Premium'] },
            { pattern: /hbo\b|hbo\s?2|hbo\s?hd|hbo family|hbo signature|hbo plus|hbo pop|hbo xtreme|hbo mundi|showtime|starz|cinemax|multipremier|golden\b|golden edge|golden plus|golden premier/i, genres: ['TV Premium'] },
            { pattern: /warner\b|warner channel|tnt\b|tbs\b|cartoon network|adult swim|boomerang|space\b|i\.sat|sony\b|sony channel|axn\b|universal\b|universal channel|syfy\b|e!\b|fx\b|fxx\b/i, genres: ['TV Premium'] },
            { pattern: /disney\b|disney channel|disney junior|disney xd|nickelodeon|nick jr|mtv\b|vh1\b|comedy central|paramount\b|paramount network|spike tv|bet\b/i, genres: ['TV Premium'] },
            { pattern: /cnn international|bbc world news|fox news|msnbc|cnbc\b|bloomberg tv|euronews|france 24|rt\b|al jazeera|dw\b|cgtn\b/i, genres: ['TV Premium'] },
            
            // INFANTIL - Reglas mejoradas basadas en análisis de canales "General"
            { pattern: /cartoon network|cartoonito|nick jr|pbs kids|babyfirst|kidz|kids|tom and jerry|moonbug|xtrema cartoons|creo kids|paka paka|baby shark|super simple songs|baby tv|baby first|tooncast|zoon|semillitas|zoomoo/i, genres: ['Infantil'] },
            { pattern: /^(disney\s?jr|disney\s?junior)$/i, genres: ['Infantil'] },
            { pattern: /kartoon\s?channel|akc\s?tv\s?dogs/i, genres: ['Infantil'] },
            
            // MÚSICA - Reglas expandidas para capturar canales musicales mal clasificados
            { pattern: /mezzo|stingray|qello|afrobeats|radio|hitlist|greatest hits|naturescape|power love|kronehit|littoral fm|tdi radio|karolina|vintage music|cool fm|hype visual radio|rumba tv|los40|kiss fm|melodia fm|europa fm|rock fm|radiolé|cadena 100|axs tv|now 90s00s|now 80s|number 1 tv|number 1 dance|number 1 ask|m2o tv|sam ibiza|rtl 102\.5|pmc royale|grupo\s?turbo\s?mix|turbo\s?mix|picosa\s?tv|culturamic|turbo\b|la\s?que\s?buena|dial\b|onda\s?cero|rne\b|ser\b|mx\s?fam|da\s?ing|video\s?rola|exa\s?tv|cumbia\s?tv\s?flex|dataonlinemiccumbia|folkortv|latinsalsa|mediaecowire|nativa|tvcarioca|cwpsalsa/i, genres: ['Música'] },
            { pattern: /now\s?80'?s|now\s?90'?s|now\s?00'?s/i, genres: ['Música'] },
            
            // MÚSICA ESPECIALIZADA - Canales de géneros musicales específicos
            { pattern: /^(canal\s?fiesta|campo\s?aster|campocef|campotvrd|campowow|conneccumbia|connectsalsa|cumbiagimax|cumbiaredmax|cumbiatvfast|cumbiatvthunder|cumbiatvtranden|iptvcumbiacol|salastvfast|salsagimax|salsatvcwp|salsatvfast|salsatvtranden|salsathunder|mediatvmic|karavana)$/i, genres: ['Música'] },
            { pattern: /cumbia|salsa|campo|connect|fiesta|karavana|gimax|redmax|fast|thunder|tranden|mediatvmic/i, genres: ['Música'] },
            
            // MÚSICA LATINA - Géneros específicos latinoamericanos (evitando conflicto con canales de TV)
            { pattern: /^(mimusica|cumbia\s?tv|salsa\s?tv|bachata\s?tv|reggaeton\s?tv|vallenato\s?tv|merengue\s?tv|tropical\s?tv)$/i, genres: ['Música'] },
            { pattern: /cumbia\s?ecowire|salsa\s?ecowire|latin\s?hits|música\s?latina|romantica\s?tv|mimusica\s?romantica/i, genres: ['Música'] },
            { pattern: /^(cumbia|salsa|bachata|reggaeton|vallenato|merengue|tropical)$/i, genres: ['Música'] },
            
            // NOTICIAS - Canales de noticias internacionales
            { pattern: /hispan\s?tv|press\s?tv|rt\s?news|france\s?24|dw\s?news|euronews|al\s?jazeera|ccn\b|russia\s?today|tn23|hitn|panico/i, genres: ['Noticias'] },
            
            // NOTICIAS Y EDUCACIÓN - Canales informativos y educativos
            { pattern: /^(ucv\s?tv|ucv|pxtv|rnn|tc\s?television|rtv|rtu|rpp)$/i, genres: ['Noticias'] },
            { pattern: /universidad|educativo|informativo|noticias\s?tv|news\s?channel/i, genres: ['Noticias'] },
            
            // DOCUMENTALES - Incluyendo A&E y canales culturales
            { pattern: /documentary|nat(ional)? geo|ondambiental|love nature|a&e|ae mundo|discovery|history channel|cultural|europa europa|disc\s?theather|h2\b/i, genres: ['Documentales'] },
            
            // CULTURA - Canales culturales y educativos específicos
            { pattern: /^(cultura|cultural|arte|museum|historia|history|tve|tvesever|culturaecowire|culturafast|culturagimax|culturathunder|iptvcolcultura)$/i, genres: ['Documentales'] },
            { pattern: /cultura\s?tv|arte\s?tv|historia\s?tv|cultural\s?channel|cwpcultura|ipe|tve\b/i, genres: ['Documentales'] },
            
            // PELÍCULAS
            { pattern: /movies|de pel[ií]cula|amc\b|tcm\b|sony movies|cine latino|golden premiere|pasiones|dhe\b|bemad/i, genres: ['Películas'] },
            
            // COMEDIA
            { pattern: /comedy central/i, genres: ['Comedia'] },
            
            // ESTILO DE VIDA - Reglas expandidas para gastronomía y lifestyle
            { pattern: /tastemade|h\&h|home\s*&\s*health|lifestyle|cosmo|divinity|gourmet|el gourmet|soy plancha|food network|cooking|cocina|chef|m[aæ]s\s?chic|mas\s?chic|fashion|moda|clover|caballo/i, genres: ['Estilo de Vida'] },
            
            // ENTRETENIMIENTO FEMENINO - Canales orientados a audiencia femenina
            { pattern: /^(lifetime|tlnovelas|novelas|star\s?channel|sun\s?channel|bemad|dkiss|ten\b|mega|activa\s?tv|vive\s?tv|mega\s?2|wuan|bitme|edge|bom|m&s)$/i, genres: ['Entretenimiento'] },
            { pattern: /lifetime\s?tv|women\s?channel|canal\s?mujer|star\s?tv|entertainment\s?channel/i, genres: ['Entretenimiento'] },
            
            // ENTRETENIMIENTO GENERAL - Canales de entretenimiento variado
            { pattern: /^(dmax|trece|rai|tru\s?tv|telefø|telenovelas|canal\s?test|telesur|tele\s?tuya|vtv|a\s?\+|cielo\s?tv|tv\s?12|teleantillas|13\s?c|3\s?abn\s?latino|a\+\s?gua|canal\s?azteca|telehit)$/i, genres: ['Entretenimiento'] },
            { pattern: /tru\s?tv|dmax\s?tv|rai\s?uno|rai\s?due|rai\s?tre|trece\s?tv|telefonica|telenovela\s?channel/i, genres: ['Entretenimiento'] },
            
            // RELIGIOSO - Canales religiosos y espirituales
            { pattern: /^(abn|3\s?abn|abn\s?latino|elim\s?tv|suran|bethel|ewtn|enlace|nuevotiempo|nuestra|canal\s?i|hei|la\s?tele|tbn)$/i, genres: ['Religioso'] },
            { pattern: /cristian|cristiano|gospel|iglesia|church|catholic|catolico|evangelico|evangelical|jesus|cristo|dios|god|faith|fe|bendicion|blessing|bethel|ewtn|enlace|nuevotiempo/i, genres: ['Religioso'] },
            
            // NEGOCIOS
            { pattern: /bloomberg|negocios|business/i, genres: ['Negocios'] },
            
            // EDUCATIVO
            { pattern: /educational|learning|university|school|pbs\b/i, genres: ['Educativo'] },
            
            // TV LOCAL - Reglas específicas para canales regionales identificados
            { pattern: /3cat info|betevé|m95 marbella|imás tv|imas tv|36 tv huacho|agro tv cusco|amazonica tv iquitos|chakra tv|hechicera tv|global tv|pride tv|local|regional|ciudad|bta\s?tv|aguate|karibeña|latina|la\s?red|nova\s?tv|ntv|unitel|usa\b|usmptv|c\.s\.r\.|r\.a\.i\.|la\s?1\s?u|aunar\s?tv|chv2|corporacion\s?tv|tec\s?tv|tvr\b|tevex|gamavisiðn|rts\b|extra\s?tv|az\s?click|azcorazon|az\s?corazon|nicarao\s?tv|td\+|tvm25|mega\s?tv|suyapa\s?tv|tv\s?diputados|viax|biobio\s?tv|trivu|a3s|juntos\s?tv|mx\s?classic|mx\s?prime|canal\s?\d+|telecadena|dtv|qhubo|hch|urbano|htv|vtv\s?canal|rpp/i, genres: ['TV Local'] },
            { pattern: /rcn|azteca\s?guate|azteca\s?guatemala/i, genres: ['TV Local'] },
            
            // ENTRETENIMIENTO - Para canales generalistas específicos
            { pattern: /america tv|caracol|antena 3|creo tv|creo latino|eurochannel|europa europa|pridetv latam|star\s?channel|sun\s?channel|global|hola\s?tv|like|rewind|taurus\s?tv|te\s?quiero\s?tv|universo/i, genres: ['Entretenimiento'] },
            { pattern: /^(e!|e\s?entertainment|e!\s?entertairment|euro\s?channel|europa\s?hd|europa|estrella\s?tv)$/i, genres: ['Entretenimiento'] },
            
            // DEPORTES - Canales deportivos específicos
            { pattern: /^(futv|fut\s?tv|futbol\s?tv|soccer\s?tv|futv\s?cr|futv\s?hd\s?cr|tyc\b|liga1\b)$/i, genres: ['Deportes'] },
            { pattern: /liga1[\s\-]?max|liga\s?1[\s\-]?max/i, genres: ['Deportes'] },
            
            // ESTILO DE VIDA - Fitness y bienestar
            { pattern: /fitmaxx|fit\s?max|fitness\s?tv|gym\s?tv/i, genres: ['Estilo de Vida'] },
            
            // ADULTO - Contenido para adultos
            { pattern: /sextreme|venus|playboy|xxx|adult|erotic|sexy/i, genres: ['Entretenimiento'] },
        ];

        // Orden canónico ESPAÑOL optimizado para Stremio (orden personalizado solicitado)
        this.genreOrder = [
            'TV Local',        // Canales regionales (Perú, Chile, Argentina) - PRIORIDAD 1
            'TV Premium',      // Canales de cable pago (Discovery, ESPN, etc.) - PRIORIDAD 2
            'Deportes',        // Muy popular - PRIORIDAD 3
            'Infantil',        // Categoría esencial - PRIORIDAD 4
            'Noticias',        // Importante para TV
            'Películas',       // Core de Stremio
            'Series',          // Core de Stremio
            'Documentales',    // Contenido educativo
            'Entretenimiento', // Catch-all para variedades
            'Música',          // Canales musicales
            'Comedia',         // Género específico
            'Estilo de Vida',  // Lifestyle/cooking
            'Negocios',        // Business/finance
            'Religioso',       // Contenido religioso
            'Educativo',       // Educational
            'General'          // Fallback final
        ];
    }

    initializeNormalization() {
        // Mapeo de normalización BILINGÜE (Español + Inglés → Español)
        this.genreNormalizationMap = {
            // === NOTICIAS ===
            'news': 'Noticias',
            'noticias': 'Noticias', 
            'informativo': 'Noticias',
            'informativos': 'Noticias',
            'current affairs': 'Noticias',
            'journalism': 'Noticias',
            'periodismo': 'Noticias',
            
            // === DEPORTES ===
            'sport': 'Deportes',
            'sports': 'Deportes',
            'deporte': 'Deportes',
            'deportes': 'Deportes',
            'futbol': 'Deportes',
            'fútbol': 'Deportes',
            'soccer': 'Deportes',
            'basketball': 'Deportes',
            'baloncesto': 'Deportes',
            
            // === INFANTIL ===
            'kid': 'Infantil',
            'kids': 'Infantil',
            'infantil': 'Infantil',
            'niñ': 'Infantil',
            'niños': 'Infantil',
            'children': 'Infantil',
            'family': 'Infantil',
            'familia': 'Infantil',
            'cartoon': 'Infantil',
            'dibujos': 'Infantil',
            
            // === MÚSICA ===
            'music': 'Música',
            'música': 'Música',
            'musical': 'Música',
            'radio': 'Música',
            'hits': 'Música',
            'fm': 'Música',
            
            // === DOCUMENTALES ===
            'documentar': 'Documentales',
            'documentary': 'Documentales',
            'documentales': 'Documentales',
            'nature': 'Documentales',
            'naturaleza': 'Documentales',
            'wildlife': 'Documentales',
            'vida salvaje': 'Documentales',
            'discovery': 'Documentales',
            'historia': 'Documentales',
            'history': 'Documentales',
            
            // === PELÍCULAS ===
            'movie': 'Películas',
            'movies': 'Películas',
            'film': 'Películas',
            'films': 'Películas',
            'cin': 'Películas',
            'cine': 'Películas',
            'película': 'Películas',
            'pelicula': 'Películas',
            'películas': 'Películas',
            'peliculas': 'Películas',
            
            // === SERIES ===
            'series': 'Series',
            'serie': 'Series',
            'drama': 'Series',
            'dramas': 'Series',
            'tv show': 'Series',
            'tv shows': 'Series',
            'show': 'Series',
            'shows': 'Series',
            
            // === ENTRETENIMIENTO ===
            'entertainment': 'Entretenimiento',
            'entretenimiento': 'Entretenimiento',
            'variety': 'Entretenimiento',
            'variedades': 'Entretenimiento',
            'talk show': 'Entretenimiento',
            'reality': 'Entretenimiento',
            'concurso': 'Entretenimiento',
            'concursos': 'Entretenimiento',
            
            // === COMEDIA ===
            'comedy': 'Comedia',
            'comedia': 'Comedia',
            'humor': 'Comedia',
            'funny': 'Comedia',
            'gracioso': 'Comedia',
            
            // === ESTILO DE VIDA ===
            'lifestyle': 'Estilo de Vida',
            'estilo de vida': 'Estilo de Vida',
            'home': 'Estilo de Vida',
            'hogar': 'Estilo de Vida',
            'health': 'Estilo de Vida',
            'salud': 'Estilo de Vida',
            'food': 'Estilo de Vida',
            'cocina': 'Estilo de Vida',
            'cooking': 'Estilo de Vida',
            'travel': 'Estilo de Vida',
            'viajes': 'Estilo de Vida',
            'fashion': 'Estilo de Vida',
            'moda': 'Estilo de Vida',
            
            // === TV LOCAL ===
            'local': 'TV Local',
            'tv local': 'TV Local',
            'regional': 'TV Local',
            'tv regional': 'TV Local',
            'nacional': 'TV Local',
            'tv nacional': 'TV Local',
            'nacional tv': 'TV Local',
            'peru': 'TV Local',
            'perú': 'TV Local',
            'peruano': 'TV Local',
            'chile': 'TV Local',
            'chileno': 'TV Local',
            'argentina': 'TV Local',
            'argentino': 'TV Local',
            'mexico': 'TV Local',
            'méxico': 'TV Local',
            'mexicano': 'TV Local',
            'colombia': 'TV Local',
            'colombiano': 'TV Local',
            'venezuela': 'TV Local',
            'venezolano': 'TV Local',
            'ecuador': 'TV Local',
            'ecuatoriano': 'TV Local',
            'bolivia': 'TV Local',
            'boliviano': 'TV Local',
            'uruguay': 'TV Local',
            'uruguayo': 'TV Local',
            'paraguay': 'TV Local',
            'paraguayo': 'TV Local',
            'costa rica': 'TV Local',
            'costarricense': 'TV Local',
            
            // === NUEVAS REGLAS ESPECÍFICAS BASADAS EN ANÁLISIS ===
            // Canales infantiles específicos
            'baby': 'Infantil',
            'simple': 'Infantil',
            'shark': 'Infantil',
            'first': 'Infantil',
            
            // Canales musicales específicos
            'dance': 'Música',
            'rtl': 'Música',
            'number 1': 'Música',
            'm2o': 'Música',
            'pmc': 'Música',
            'royale': 'Música',
            'best': 'Música',
            
            // Canales gastronómicos/estilo de vida específicos
            'gourmet': 'Estilo de Vida',
            'plancha': 'Estilo de Vida',
            'chef': 'Estilo de Vida',
            
            // Canales regionales específicos
            'marbella': 'TV Local',
            'huacho': 'TV Local',
            'cusco': 'TV Local',
            'iquitos': 'TV Local',
            'chakra': 'TV Local',
            'amazonica': 'TV Local',
            'hechicera': 'TV Local',
            'agro': 'TV Local',
            'imás': 'TV Local',
            '3cat': 'TV Local',
            
            // Canales de entretenimiento específicos
            'pride': 'Entretenimiento',
            'latam': 'Entretenimiento',
            
            // Canales documentales específicos
            'mundo': 'Documentales',
            'ae': 'Documentales',
            'guatemala': 'TV Local',
            'guatemalteco': 'TV Local',
            'honduras': 'TV Local',
            'hondureño': 'TV Local',
            'el salvador': 'TV Local',
            'salvadoreño': 'TV Local',
            'nicaragua': 'TV Local',
            'nicaragüense': 'TV Local',
            'panama': 'TV Local',
            'panamá': 'TV Local',
            'panameño': 'TV Local',
            'dominicana': 'TV Local',
            'dominicano': 'TV Local',
            'republica dominicana': 'TV Local',
            'república dominicana': 'TV Local',
            
            // === TV PREMIUM ===
            'premium': 'TV Premium',
            'tv premium': 'TV Premium',
            'cable': 'TV Premium',
            'tv cable': 'TV Premium',
            'pay tv': 'TV Premium',
            'tv pago': 'TV Premium',
            'suscripcion': 'TV Premium',
            'suscripción': 'TV Premium',
            'subscription': 'TV Premium',
            'hbo': 'TV Premium',
            'discovery': 'TV Premium',
            'warner': 'TV Premium',
            'disney': 'TV Premium',
            'espn': 'TV Premium',
            'fox': 'TV Premium',
            'paramount': 'TV Premium',
            'universal': 'TV Premium',
            'sony': 'TV Premium',
            'axn': 'TV Premium',
            'fx': 'TV Premium',
            'tnt': 'TV Premium',
            'cinemax': 'TV Premium',
            'starz': 'TV Premium',
            'showtime': 'TV Premium',
            'netflix': 'TV Premium',
            'amazon prime': 'TV Premium',
            'hulu': 'TV Premium',
            'directv': 'TV Premium',
            'sky': 'TV Premium',
            'claro': 'TV Premium',
            'movistar': 'TV Premium',
            
            // === NEGOCIOS ===
            'business': 'Negocios',
            'negocios': 'Negocios',
            'economy': 'Negocios',
            'economía': 'Negocios',
            'economia': 'Negocios',
            'finance': 'Negocios',
            'finanzas': 'Negocios',
            'financial': 'Negocios',
            'financiero': 'Negocios',
            
            // === RELIGIOSO ===
            'religio': 'Religioso',
            'religious': 'Religioso',
            'religioso': 'Religioso',
            'faith': 'Religioso',
            'fe': 'Religioso',
            'christian': 'Religioso',
            'cristiano': 'Religioso',
            'church': 'Religioso',
            'iglesia': 'Religioso',
            'catholic': 'Religioso',
            'católico': 'Religioso',
            'catolico': 'Religioso',
            
            // === EDUCATIVO ===
            'educat': 'Educativo',
            'educational': 'Educativo',
            'educativo': 'Educativo',
            'learning': 'Educativo',
            'aprendizaje': 'Educativo',
            'escuela': 'Educativo',
            'school': 'Educativo',
            'university': 'Educativo',
            'universidad': 'Educativo',
            'academic': 'Educativo',
            'académico': 'Educativo',
            'academico': 'Educativo',
            
            // === TRANSFORMACIONES ESPECIALES ===
            'international': 'General',
            'internacional': 'General',
            'general': 'General',
            'misc': 'General',
            'other': 'General',
            'otro': 'General',
            'otros': 'General'
        };
    }

    /**
     * Normaliza etiquetas de género usando el mapa inteligente
     */
    normalizeGenreLabel(label) {
        if (!label) return null;
        
        const lc = label.toLowerCase();
        
        // Buscar coincidencia exacta primero
        if (this.genreNormalizationMap[lc]) {
            return this.genreNormalizationMap[lc];
        }
        
        // Buscar coincidencias parciales
        for (const [key, value] of Object.entries(this.genreNormalizationMap)) {
            if (lc.includes(key)) {
                return value;
            }
        }
        
        return null;
    }

    /**
     * Normaliza un género a su forma estándar
     * @param {string} genre - Género a normalizar
     * @returns {string} - Género normalizado
     */
    normalizeGenre(genre) {
        if (!genre || typeof genre !== 'string') return 'General';
        
        const normalized = genre.toLowerCase().trim();
        
        // Buscar coincidencia exacta primero
        if (this.genreNormalizationMap[normalized]) {
            return this.genreNormalizationMap[normalized];
        }
        
        // Buscar coincidencias parciales para términos compuestos
        for (const [key, value] of Object.entries(this.genreNormalizationMap)) {
            if (normalized.includes(key) || key.includes(normalized)) {
                return value;
            }
        }
        
        // Si no se encuentra, capitalizar primera letra
        return genre.charAt(0).toUpperCase() + genre.slice(1).toLowerCase();
    }

    /**
     * Calcula la puntuación de especificidad de un género
     * @param {string} genre - Género a evaluar
     * @returns {number} - Puntuación de especificidad (mayor = más específico)
     */
    calculateGenreSpecificity(genre) {
        const specificityScores = {
            'General': 1,
            'Entretenimiento': 2,
            'TV Local': 3,
            'TV Premium': 3,
            'Noticias': 4,
            'Deportes': 4,
            'Música': 4,
            'Películas': 4,
            'Series': 4,
            'Documentales': 5,
            'Infantil': 5,
            'Comedia': 5,
            'Estilo de Vida': 5,
            'Negocios': 6,
            'Religioso': 6,
            'Educativo': 6
        };
        
        return specificityScores[genre] || 3;
    }

    /**
     * Verifica si dos géneros son compatibles para coexistir
     * @param {string} genre1 - Primer género
     * @param {string} genre2 - Segundo género
     * @returns {boolean} - True si son compatibles
     */
    areGenresCompatible(genre1, genre2) {
        if (genre1 === genre2) return false; // No duplicados
        
        // Incompatibilidades específicas
        const incompatiblePairs = [
            ['Infantil', 'Negocios'],
            ['Infantil', 'Religioso'],
            ['Deportes', 'Música'],
            ['Noticias', 'Comedia'],
            ['Documentales', 'Comedia'],
            ['Religioso', 'Comedia']
        ];
        
        return !incompatiblePairs.some(pair => 
            (pair[0] === genre1 && pair[1] === genre2) ||
            (pair[0] === genre2 && pair[1] === genre1)
        );
    }

    /**
     * Determina si un género es considerado "genérico"
     * @param {string} genre - Género a evaluar
     * @returns {boolean} - True si es genérico
     */
    isGenericGenre(genre) {
        const genericGenres = ['General', 'Entretenimiento', 'TV Local', 'TV Premium'];
        return genericGenres.includes(genre);
    }

    /**
     * Detecta géneros usando reglas de marca específicas
     */
    detectByBrand(name) {
        for (const rule of this.brandGenreRules) {
            if (rule.pattern.test(name)) {
                return rule.genres.slice();
            }
        }
        return null;
    }

    /**
     * Detecta géneros para un canal usando múltiples métodos
     */
    /**
     * Valida y preserva géneros existentes antes de reclasificar
     * @param {Object} channel - Canal con posibles géneros existentes
     * @returns {Array} - Géneros existentes válidos
     */
    validateExistingGenres(channel) {
        const existingGenres = [];
        
        // Verificar si el canal ya tiene géneros asignados
        if (channel.genre && typeof channel.genre === 'string') {
            const genres = channel.genre.split(',').map(g => g.trim()).filter(g => g);
            
            for (const genre of genres) {
                const normalized = this.normalizeGenre(genre);
                
                // Solo preservar géneros específicos (no genéricos)
                if (!this.isGenericGenre(normalized) && normalized !== 'General') {
                    existingGenres.push(normalized);
                }
            }
        }
        
        // También verificar en group/category si contiene géneros válidos
        if (channel.group || channel.category) {
            const groupText = (channel.group || channel.category || '').toLowerCase();
            
            // Solo preservar si el grupo no es genérico
            for (const [pattern, normalizedGenre] of Object.entries(this.genreNormalizationMap)) {
                if (groupText.includes(pattern) && !this.isGenericGenre(normalizedGenre)) {
                    existingGenres.push(normalizedGenre);
                }
            }
        }
        
        // Eliminar duplicados y mantener orden de especificidad
        const uniqueGenres = [...new Set(existingGenres)];
        return uniqueGenres.sort((a, b) => 
            this.calculateGenreSpecificity(b) - this.calculateGenreSpecificity(a)
        );
    }

    detectGenres(channel) {
        try {
            // PASO 1: Validar géneros existentes (preservar multi-categoría)
            const existingGenres = this.validateExistingGenres(channel);
            
            // PASO 2: Si hay géneros existentes válidos y específicos, usarlos como base
            if (existingGenres.length > 0 && !existingGenres.every(g => this.isGenericGenre(g))) {
                // Usar sistema de clasificación compuesta para mejorar géneros existentes
                const compositeGenres = this.generateCompositeClassification(channel);
                
                // Fusionar géneros existentes con composición inteligente
                const mergedGenres = this.mergeGenresAdvanced([existingGenres, compositeGenres]);
                
                this.updateMetrics(channel, mergedGenres);
                return mergedGenres.join(', ');
            }
            
            // PASO 3: Si no hay géneros existentes válidos, usar clasificación compuesta completa
            const compositeGenres = this.generateCompositeClassification(channel);
            
            // PASO 4: Aplicar fallback inteligente solo si es necesario
            const finalGenres = compositeGenres.length > 0 ? compositeGenres : ['General'];
            
            this.updateMetrics(channel, finalGenres);
            return finalGenres.join(', ');
            
        } catch (error) {
            console.error(`Error detectando géneros para canal ${channel.name}:`, error);
            return channel.genre || 'General';
        }
    }

    /**
     * Detecta géneros por nombre del canal con lógica refinada
     * Reduce clasificaciones erróneas como 'General'
     */
    detectByChannelName(channel) {
        const channelName = channel.name || '';
        const detectedGenres = [];
        const channelText = channelName.toLowerCase();
        
        // PASO 1: Buscar patrones específicos primero (más restrictivos)
        const specificMatches = [];
        const genericMatches = [];
        
        for (const [pattern, normalizedGenre] of Object.entries(this.genreNormalizationMap)) {
            const patternLower = pattern.toLowerCase();
            
            // Verificar coincidencia
            if (channelText.includes(patternLower)) {
                // Verificar que no sea una coincidencia parcial accidental
                const isValidMatch = this.isValidPatternMatch(channelText, patternLower);
                
                if (isValidMatch) {
                    if (this.isGenericGenre(normalizedGenre)) {
                        genericMatches.push(normalizedGenre);
                    } else {
                        specificMatches.push(normalizedGenre);
                    }
                }
            }
        }
        
        // PASO 2: Priorizar géneros específicos
        if (specificMatches.length > 0) {
            detectedGenres.push(...specificMatches);
        } else if (genericMatches.length > 0) {
            // Solo usar genéricos si no hay específicos
            detectedGenres.push(...genericMatches.slice(0, 1)); // Máximo 1 genérico
        }
        
        return [...new Set(detectedGenres)]; // Eliminar duplicados
    }

    /**
     * Valida si una coincidencia de patrón es legítima
     * Evita falsos positivos en nombres de canales
     */
    isValidPatternMatch(channelText, pattern) {
        // Patrones muy cortos requieren coincidencia exacta o como palabra completa
        if (pattern.length <= 3) {
            const wordBoundaryRegex = new RegExp(`\\b${pattern}\\b`, 'i');
            return wordBoundaryRegex.test(channelText);
        }
        
        // Patrones de longitud media requieren al menos 70% de coincidencia
        if (pattern.length <= 6) {
            const index = channelText.indexOf(pattern);
            if (index === -1) return false;
            
            // Verificar que no esté en medio de otra palabra
            const beforeChar = index > 0 ? channelText[index - 1] : ' ';
            const afterChar = index + pattern.length < channelText.length ? 
                channelText[index + pattern.length] : ' ';
            
            return /[\s\-_\.]/.test(beforeChar) || /[\s\-_\.]/.test(afterChar);
        }
        
        // Patrones largos pueden usar coincidencia simple
        return true;
    }

    detectByBrandRules(channel) {
        const channelName = channel.name || '';
        const detectedGenres = [];
        
        // Aplicar reglas de marca específicas con mayor precisión
        for (const rule of this.brandGenreRules) {
            if (rule.pattern.test(channelName)) {
                // Verificar que la regla sea relevante para el contexto
                const ruleGenres = rule.genres.filter(genre => {
                    const normalized = this.normalizeGenre(genre);
                    return !this.isGenericGenre(normalized) || detectedGenres.length === 0;
                });
                
                detectedGenres.push(...ruleGenres);
            }
        }
        
        return [...new Set(detectedGenres)]; // Eliminar duplicados
    }

    /**
     * Detecta géneros por grupo/categoría con validación mejorada
     */
    detectByGroup(channel) {
        const group = channel.group || channel.category || '';
        if (!group) return [];
        
        const detectedGenres = [];
        const groupText = group.toLowerCase();
        
        // Buscar patrones específicos en el grupo
        for (const [pattern, normalizedGenre] of Object.entries(this.genreNormalizationMap)) {
            const patternLower = pattern.toLowerCase();
            
            if (groupText.includes(patternLower)) {
                // Validar que la coincidencia sea significativa
                if (this.isValidPatternMatch(groupText, patternLower)) {
                    detectedGenres.push(normalizedGenre);
                }
            }
        }
        
        // Si no se encontraron géneros específicos, intentar patrones generales
        if (detectedGenres.length === 0) {
            const fallbackGenres = this.detectByGeneralPatterns(groupText);
            detectedGenres.push(...fallbackGenres.slice(0, 1)); // Máximo 1 fallback
        }
        
        return [...new Set(detectedGenres)]; // Eliminar duplicados
    }

    /**
     * Sistema de clasificación compuesta inteligente
     * Mantiene múltiples géneros apropiados basado en contexto y compatibilidad
     * @param {Object} channel - Canal a clasificar
     * @returns {Array} - Géneros compuestos apropiados
     */
    generateCompositeClassification(channel) {
        const compositeGenres = [];
        const channelContext = this.analyzeChannelContext(channel);
        
        // PASO 1: Géneros base detectados
        const baseGenres = this.detectBaseGenres(channel);
        
        // PASO 2: Géneros contextuales basados en análisis profundo
        const contextualGenres = this.detectContextualGenres(channel, channelContext);
        
        // PASO 3: Fusionar géneros base y contextuales
        const allCandidates = [...baseGenres, ...contextualGenres];
        
        // PASO 4: Aplicar reglas de composición inteligente
        const finalComposition = this.applyCompositionRules(allCandidates, channelContext);
        
        return finalComposition;
    }

    /**
     * Analiza el contexto completo del canal para clasificación inteligente
     * @param {Object} channel - Canal a analizar
     * @returns {Object} - Contexto analizado
     */
    analyzeChannelContext(channel) {
        const context = {
            hasCountryIndicator: false,
            hasLanguageIndicator: false,
            hasQualityIndicator: false,
            hasTimeIndicator: false,
            brandStrength: 0,
            contentHints: [],
            technicalHints: []
        };
        
        const fullText = `${channel.name || ''} ${channel.group || ''} ${channel.category || ''}`.toLowerCase();
        
        // Detectar indicadores de país/región
        const countryPatterns = ['peru', 'perú', 'chile', 'argentina', 'mexico', 'méxico', 'colombia', 'venezuela', 'ecuador', 'bolivia', 'uruguay', 'paraguay'];
        context.hasCountryIndicator = countryPatterns.some(country => fullText.includes(country));
        
        // Detectar indicadores de idioma
        const languagePatterns = ['español', 'spanish', 'english', 'ingles', 'inglés', 'latino', 'latin'];
        context.hasLanguageIndicator = languagePatterns.some(lang => fullText.includes(lang));
        
        // Detectar indicadores de calidad
        const qualityPatterns = ['hd', 'uhd', '4k', 'premium', 'plus', 'max'];
        context.hasQualityIndicator = qualityPatterns.some(quality => fullText.includes(quality));
        
        // Detectar indicadores temporales
        const timePatterns = ['24h', '24/7', 'live', 'en vivo', 'directo'];
        context.hasTimeIndicator = timePatterns.some(time => fullText.includes(time));
        
        // Calcular fuerza de marca
        const brandIndicators = ['tv', 'canal', 'channel', 'network', 'media', 'broadcasting'];
        context.brandStrength = brandIndicators.filter(brand => fullText.includes(brand)).length;
        
        // Detectar pistas de contenido
        const contentPatterns = {
            'news': ['noticias', 'news', 'informativo', 'actualidad'],
            'sports': ['deportes', 'sports', 'futbol', 'soccer', 'basketball'],
            'entertainment': ['entretenimiento', 'entertainment', 'show', 'espectaculo'],
            'kids': ['infantil', 'kids', 'niños', 'cartoon', 'dibujos'],
            'movies': ['cine', 'movies', 'peliculas', 'films'],
            'music': ['musica', 'music', 'radio', 'hits', 'fm']
        };
        
        for (const [category, patterns] of Object.entries(contentPatterns)) {
            if (patterns.some(pattern => fullText.includes(pattern))) {
                context.contentHints.push(category);
            }
        }
        
        return context;
    }

    /**
     * Detecta géneros base usando métodos tradicionales mejorados
     * @param {Object} channel - Canal a analizar
     * @returns {Array} - Géneros base detectados
     */
    detectBaseGenres(channel) {
        const baseGenres = [];
        
        // Usar métodos existentes mejorados
        const brandGenres = this.detectByBrandRules(channel);
        const nameGenres = this.detectByChannelName(channel);
        const groupGenres = this.detectByGroup(channel);
        
        // Combinar con priorización
        if (brandGenres.length > 0) baseGenres.push(...brandGenres);
        if (nameGenres.length > 0) baseGenres.push(...nameGenres);
        if (groupGenres.length > 0) baseGenres.push(...groupGenres);
        
        return [...new Set(baseGenres)];
    }

    /**
     * Detecta géneros contextuales basado en análisis profundo
     * @param {Object} channel - Canal a analizar
     * @param {Object} context - Contexto analizado
     * @returns {Array} - Géneros contextuales
     */
    detectContextualGenres(channel, context) {
        const contextualGenres = [];
        
        // Reglas contextuales inteligentes
        if (context.hasCountryIndicator && !context.contentHints.length) {
            contextualGenres.push('TV Local');
        }
        
        if (context.hasQualityIndicator && context.brandStrength > 0) {
            contextualGenres.push('TV Premium');
        }
        
        if (context.hasTimeIndicator && context.contentHints.includes('news')) {
            contextualGenres.push('Noticias');
        }
        
        if (context.contentHints.length > 1) {
            // Canal multi-contenido, mantener géneros específicos
            context.contentHints.forEach(hint => {
                const mappedGenre = this.mapContentHintToGenre(hint);
                if (mappedGenre) contextualGenres.push(mappedGenre);
            });
        }
        
        return [...new Set(contextualGenres)];
    }

    /**
     * Mapea pistas de contenido a géneros normalizados
     * @param {string} hint - Pista de contenido
     * @returns {string} - Género normalizado
     */
    mapContentHintToGenre(hint) {
        const mapping = {
            'news': 'Noticias',
            'sports': 'Deportes',
            'entertainment': 'Entretenimiento',
            'kids': 'Infantil',
            'movies': 'Películas',
            'music': 'Música'
        };
        
        return mapping[hint] || null;
    }

    /**
     * Aplica reglas de composición para géneros finales
     * @param {Array} candidates - Géneros candidatos
     * @param {Object} context - Contexto del canal
     * @returns {Array} - Composición final de géneros
     */
    applyCompositionRules(candidates, context) {
        if (!candidates.length) return ['General'];
        
        // Normalizar y filtrar candidatos
        const normalizedCandidates = candidates
            .map(genre => this.normalizeGenre(genre))
            .filter(genre => genre && genre !== 'General');
        
        if (!normalizedCandidates.length) return ['General'];
        
        // Aplicar reglas de compatibilidad
        const compatibleGenres = [];
        
        for (const candidate of normalizedCandidates) {
            const isCompatible = compatibleGenres.every(existing => 
                this.areGenresCompatible(candidate, existing)
            );
            
            if (isCompatible && !compatibleGenres.includes(candidate)) {
                compatibleGenres.push(candidate);
            }
        }
        
        // Limitar según contexto
        let maxGenres = 3; // Por defecto
        
        if (context.contentHints.length > 2) maxGenres = 4; // Canales multi-contenido
        if (context.brandStrength > 2) maxGenres = 2; // Canales de marca fuerte
        
        // Ordenar por especificidad y tomar los mejores
        const finalGenres = compatibleGenres
            .sort((a, b) => this.calculateGenreSpecificity(b) - this.calculateGenreSpecificity(a))
            .slice(0, maxGenres);
        
        return finalGenres.length > 0 ? finalGenres : ['General'];
    }
    updateMetrics(channel, detectedGenres) {
        if (!this.metrics) {
            this.metrics = {
                totalChannels: 0,
                genreDistribution: {},
                detectionMethods: {
                    brandRules: 0,
                    channelName: 0,
                    group: 0,
                    fallback: 0
                }
            };
        }
        
        this.metrics.totalChannels++;
        
        // Contar distribución de géneros
        detectedGenres.forEach(genre => {
            this.metrics.genreDistribution[genre] = (this.metrics.genreDistribution[genre] || 0) + 1;
        });
        
        // Determinar método de detección usado
        const brandGenres = this.detectByBrandRules(channel);
        const nameGenres = this.detectByChannelName(channel);
        const groupGenres = this.detectByGroup(channel);
        
        if (brandGenres.length > 0) {
            this.metrics.detectionMethods.brandRules++;
        } else if (nameGenres.length > 0) {
            this.metrics.detectionMethods.channelName++;
        } else if (groupGenres.length > 0) {
            this.metrics.detectionMethods.group++;
        } else {
            this.metrics.detectionMethods.fallback++;
        }
    }

    detectByGeneralPatterns(channelName) {
        const detectedGenres = new Set();
        const channelText = channelName.toLowerCase();
        
        // Patrones generales como fallback
        const generalPatterns = {
            'News': ['news', 'noticias', 'informativo'],
            'Sports': ['sport', 'deportes', 'futbol', 'soccer'],
            'Kids': ['kids', 'infantil', 'niños', 'cartoon'],
            'Music': ['music', 'radio', 'fm', 'hits'],
            'Movies': ['movie', 'cinema', 'film', 'cine'],
            'Series': ['series', 'drama'],
            'Documentary': ['discovery', 'documentary', 'nature'],
            'Religious': ['religious', 'church', 'christian'],
            'Educational': ['educational', 'learning', 'school'],
            'Lifestyle': ['lifestyle', 'cooking', 'food', 'travel'],
            'Business': ['business', 'finance', 'economy']
        };
        
        Object.entries(generalPatterns).forEach(([genre, keywords]) => {
            if (keywords.some(keyword => channelText.includes(keyword))) {
                detectedGenres.add(genre);
            }
        });
        
        return Array.from(detectedGenres);
    }

    applySpecialRules(channel, detected) {
        const channelText = (channel.name || '').toLowerCase();
        const genres = new Set(detected);
        
        // Regla: Canales internacionales
        if (channelText.includes(' en') && !genres.has('News') && !genres.has('Kids')) {
            genres.add('International');
        }
        
        // Regla: Si no se detectó nada específico, usar "General"
        if (genres.size === 0) {
            genres.add('General');
        }
        
        return Array.from(genres);
    }

    /**
     * Fusiona múltiples géneros de manera inteligente
     * Prioriza géneros específicos sobre "General" y mantiene orden canónico
     */
    /**
     * Fusiona arrays de géneros de manera inteligente y avanzada
     * Preserva multi-categorías y evita simplificaciones excesivas
     * @param {Array} genreArrays - Arrays de géneros detectados
     * @returns {Array} - Géneros fusionados de manera inteligente
     */
    mergeGenresAdvanced(genreArrays) {
        const allGenres = new Set();
        const genreScores = new Map();
        
        // Recopilar todos los géneros únicos con puntuación
        genreArrays.forEach(genres => {
            if (Array.isArray(genres)) {
                genres.forEach(genre => {
                    if (genre && typeof genre === 'string' && genre.trim()) {
                        const normalizedGenre = this.normalizeGenre(genre.trim());
                        allGenres.add(normalizedGenre);
                        
                        // Incrementar puntuación por cada aparición
                        const currentScore = genreScores.get(normalizedGenre) || 0;
                        genreScores.set(normalizedGenre, currentScore + 1);
                    }
                });
            }
        });

        // Convertir a array
        let mergedGenres = Array.from(allGenres);
        
        // REGLA 1: Filtrar géneros incompatibles
        const compatibleGenres = [];
        for (const genre of mergedGenres) {
            const isCompatible = compatibleGenres.every(existing => 
                this.areGenresCompatible(genre, existing)
            );
            
            if (isCompatible) {
                compatibleGenres.push(genre);
            }
        }
        
        mergedGenres = compatibleGenres;
        
        // REGLA 2: Priorizar géneros específicos sobre genéricos
        const specificGenres = mergedGenres.filter(g => !this.isGenericGenre(g));
        const genericGenres = mergedGenres.filter(g => this.isGenericGenre(g));
        
        // Si hay géneros específicos, usar solo esos (máximo 3)
        if (specificGenres.length > 0) {
            mergedGenres = specificGenres;
            
            // Permitir hasta 2 géneros genéricos si hay espacio y son relevantes
            if (mergedGenres.length < 4 && genericGenres.length > 0) {
                // Ordenar géneros genéricos por puntuación y tomar los mejores
                const sortedGenerics = genericGenres.sort((a, b) => 
                    (genreScores.get(b) || 0) - (genreScores.get(a) || 0)
                );
                
                // Agregar hasta 2 géneros genéricos
                const spacesAvailable = Math.min(4 - mergedGenres.length, 2);
                mergedGenres.push(...sortedGenerics.slice(0, spacesAvailable));
            }
        } else {
            // Solo géneros genéricos disponibles
            mergedGenres = genericGenres.slice(0, 2); // Máximo 2 genéricos
        }
        
        // REGLA 3: Ordenar por especificidad y puntuación
        mergedGenres.sort((a, b) => {
            const specificityDiff = this.calculateGenreSpecificity(b) - this.calculateGenreSpecificity(a);
            if (specificityDiff !== 0) return specificityDiff;
            
            // En caso de empate, usar puntuación
            return (genreScores.get(b) || 0) - (genreScores.get(a) || 0);
        });
        
        // REGLA 4: Aplicar orden canónico español para presentación
        const finalGenres = mergedGenres.sort((a, b) => {
            const indexA = this.genreOrder.indexOf(a);
            const indexB = this.genreOrder.indexOf(b);
            
            if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB;
            }
            
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            
            return a.localeCompare(b, 'es', { sensitivity: 'base' });
        });
        
        // Limitar a máximo 4 géneros (incrementado para preservar multi-categorías)
        return finalGenres.slice(0, 4);
    }

    /**
     * Método de compatibilidad - mantiene la interfaz original
     * @param {Array} genreArrays - Arrays de géneros
     * @returns {Array} - Géneros fusionados
     */
    mergeGenres(genreArrays) {
        return this.mergeGenresAdvanced(genreArrays);
    }

    /**
     * Función auxiliar para fusionar géneros existentes con detectados
     * Mantiene compatibilidad con el código existente
     */
    mergeWithExisting(existingGenre, detectedGenres) {
        const genreArrays = [];
        
        // Procesar géneros existentes
        if (existingGenre && typeof existingGenre === 'string') {
            const existing = existingGenre.split(',').map(g => g.trim()).filter(Boolean);
            if (existing.length > 0) {
                genreArrays.push(existing);
            }
        }
        
        // Procesar géneros detectados
        if (detectedGenres) {
            if (typeof detectedGenres === 'string') {
                const detected = detectedGenres.split(',').map(g => g.trim()).filter(Boolean);
                if (detected.length > 0) {
                    genreArrays.push(detected);
                }
            } else if (Array.isArray(detectedGenres)) {
                genreArrays.push(detectedGenres);
            }
        }
        
        // Si no hay géneros, retornar "General"
        if (genreArrays.length === 0) {
            return 'General';
        }
        
        // Usar la función principal de fusión
        const merged = this.mergeGenres(genreArrays);
        return merged.join(', ');
    }

    /**
     * Procesa todos los canales y genera estadísticas
     */
    processChannels(channels) {
        const results = [];
        const genreStats = new Map();
        
        channels.forEach(channel => {
            const detectedGenres = this.detectGenres(channel);
            
            // Mezclar con géneros existentes usando lógica sofisticada
            const finalGenre = this.mergeWithExisting(channel.genre, detectedGenres);
            
            // Actualizar canal con géneros mejorados
            const updatedChannel = {
                ...channel,
                genre: finalGenre
            };
            
            results.push(updatedChannel);
            
            // Actualizar estadísticas
            finalGenre.split(',').map(g => g.trim()).filter(Boolean).forEach(genre => {
                genreStats.set(genre, (genreStats.get(genre) || 0) + 1);
            });
        });
        
        return {
            channels: results,
            stats: this.generateStats(results, genreStats)
        };
    }

    generateStats(channels, genreStats) {
        const totalChannels = channels.length;
        const totalGenres = genreStats.size;
        const avgGenresPerChannel = channels.reduce((sum, ch) => 
            sum + ch.genre.split(',').map(g => g.trim()).filter(Boolean).length, 0) / totalChannels;
        
        // Top géneros ordenados por frecuencia
        const topGenres = Array.from(genreStats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15);
        
        return {
            totalChannels,
            totalGenres,
            avgGenresPerChannel: parseFloat(avgGenresPerChannel.toFixed(2)),
            topGenres,
            genreDistribution: Object.fromEntries(genreStats)
        };
    }

    /**
     * Obtiene métricas de procesamiento
     */
    getMetrics() {
        return {
            totalRules: this.brandGenreRules.length,
            supportedGenres: this.genreOrder.length,
            normalizationMappings: Object.keys(this.genreNormalizationMap).length
        };
    }

    /**
     * Genera configuración para Stremio con géneros específicos
     */
    generateStremioConfig(stats) {
        const supportedGenres = Object.keys(stats.genreDistribution)
            .sort((a, b) => this.genreOrder.indexOf(a) - this.genreOrder.indexOf(b));
        
        return {
            tv_channels: {
                type: 'tv',
                id: 'tv_channels',
                name: 'TV Channels',
                extra: [
                    {
                        name: 'genre',
                        isRequired: false,
                        options: supportedGenres
                    },
                    {
                        name: 'search',
                        isRequired: false
                    }
                ]
            },
            supportedGenres,
            genreStats: stats.genreDistribution
        };
    }
}

export default GenreDetectionService;