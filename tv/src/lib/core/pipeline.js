/**
 * Pipeline principal de procesamiento IPTV
 * 
 * Extrae y modulariza la lógica principal de main.js para crear
 * un pipeline reutilizable y configurable.
 */

import { ProcessingResultTypes, SystemEvents } from './interfaces.js';

/**
 * Procesador principal IPTV que implementa el pipeline de procesamiento
 * Basado en la lógica extraída de main.js
 */
export class IPTVProcessor {
    constructor(config, container, eventEmitter) {
        this.config = config;
        this.container = container;
        this.eventEmitter = eventEmitter;
        this.isInitialized = false;
        this.processingState = {
            phase: 'idle',
            progress: 0,
            startTime: null,
            errors: []
        };
    }

    /**
     * Inicializa el procesador y sus servicios
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            this.eventEmitter.emit(SystemEvents.PROCESSOR_INITIALIZING);
            
            // Validar configuración
            await this.validateConfiguration();
            
            // Inicializar servicios core
            await this.initializeCoreServices();
            
            // Configurar pipeline de procesamiento
            this.setupProcessingPipeline();
            
            this.isInitialized = true;
            this.eventEmitter.emit(SystemEvents.PROCESSOR_INITIALIZED);
            
        } catch (error) {
            this.eventEmitter.emit(SystemEvents.PROCESSOR_ERROR, { error, phase: 'initialization' });
            throw error;
        }
    }

    /**
     * Ejecuta el pipeline completo de procesamiento
     * Basado en la secuencia de main.js
     */
    async process() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        this.processingState.startTime = Date.now();
        this.eventEmitter.emit(SystemEvents.PROCESSING_STARTED);

        try {
            // Fase 1: Configuración y preparación
            await this.executePhase('configuration', () => this.configurationPhase());
            
            // Fase 2: Inicialización de servicios
            await this.executePhase('service_initialization', () => this.serviceInitializationPhase());
            
            // Fase 3: Carga de datos
            const rawData = await this.executePhase('data_loading', () => this.dataLoadingPhase());
            
            // Fase 4: Filtrado inicial
            const filteredData = await this.executePhase('filtering', () => this.filteringPhase(rawData));
            
            // Fase 5: Preparación de datos
            const preparedData = await this.executePhase('data_preparation', () => this.dataPreparationPhase(filteredData));
            
            // Fase 6: Procesamiento paralelo core
            const processedData = await this.executePhase('core_processing', () => this.coreProcessingPhase(preparedData));
            
            // Fase 7: Procesamiento por chunks
            const chunkedResults = await this.executePhase('chunk_processing', () => this.chunkProcessingPhase(processedData));
            
            // Fase 8: Generación de salidas
            const outputs = await this.executePhase('output_generation', () => this.outputGenerationPhase(chunkedResults));

            const result = {
                type: ProcessingResultTypes.SUCCESS,
                data: outputs,
                processingTime: Date.now() - this.processingState.startTime,
                statistics: this.generateStatistics(outputs)
            };

            this.eventEmitter.emit(SystemEvents.PROCESSING_COMPLETED, result);
            return result;

        } catch (error) {
            const errorResult = {
                type: ProcessingResultTypes.ERROR,
                error,
                phase: this.processingState.phase,
                processingTime: Date.now() - this.processingState.startTime
            };

            this.eventEmitter.emit(SystemEvents.PROCESSING_ERROR, errorResult);
            throw error;
        }
    }

    /**
     * Ejecuta una fase del pipeline con manejo de errores y eventos
     */
    async executePhase(phaseName, phaseFunction) {
        this.processingState.phase = phaseName;
        this.eventEmitter.emit(SystemEvents.PHASE_STARTED, { phase: phaseName });

        try {
            const result = await phaseFunction();
            this.eventEmitter.emit(SystemEvents.PHASE_COMPLETED, { phase: phaseName, result });
            return result;
        } catch (error) {
            this.processingState.errors.push({ phase: phaseName, error });
            this.eventEmitter.emit(SystemEvents.PHASE_ERROR, { phase: phaseName, error });
            throw error;
        }
    }

    /**
     * Fase 1: Configuración del sistema
     */
    async configurationPhase() {
        const configService = this.container.resolve('configurationService');
        return await configService.loadAndValidate(this.config);
    }

    /**
     * Fase 2: Inicialización de servicios específicos
     */
    async serviceInitializationPhase() {
        const services = [
            'dataLoaderService',
            'filterService', 
            'deduplicationService',
            'validationService',
            'conversionService'
        ];

        const initializedServices = {};
        for (const serviceName of services) {
            if (this.container.has(serviceName)) {
                const service = this.container.resolve(serviceName);
                if (typeof service.initialize === 'function') {
                    await service.initialize();
                }
                initializedServices[serviceName] = service;
            }
        }

        return initializedServices;
    }

    /**
     * Fase 3: Carga de datos desde fuentes configuradas
     */
    async dataLoadingPhase() {
        const dataLoader = this.container.resolve('dataLoaderService');
        const sources = this.config.sources || {};
        
        const loadedData = {};
        
        // Cargar datos según configuración de fuentes
        if (sources.csv) {
            loadedData.csv = await dataLoader.loadCSV(sources.csv);
        }
        
        if (sources.m3u) {
            loadedData.m3u = await dataLoader.loadM3U(sources.m3u);
        }
        
        if (sources.api) {
            loadedData.api = await dataLoader.loadFromAPI(sources.api);
        }

        return loadedData;
    }

    /**
     * Fase 4: Filtrado inicial de datos
     */
    async filteringPhase(rawData) {
        const filterService = this.container.resolve('filterService');
        const filterConfig = this.config.filtering || {};
        
        const filteredData = {};
        
        for (const [sourceType, data] of Object.entries(rawData)) {
            if (Array.isArray(data)) {
                filteredData[sourceType] = await filterService.applyFilters(data, filterConfig);
            }
        }
        
        return filteredData;
    }

    /**
     * Fase 5: Preparación y normalización de datos
     */
    async dataPreparationPhase(filteredData) {
        const preparationService = this.container.resolve('dataPreparationService');
        
        // Normalizar estructura de datos de diferentes fuentes
        const normalizedData = await preparationService.normalizeData(filteredData);
        
        // Combinar datos de múltiples fuentes si es necesario
        const combinedData = await preparationService.combineData(normalizedData);
        
        return combinedData;
    }

    /**
     * Fase 6: Procesamiento paralelo core (deduplicación, conversión, validación)
     */
    async coreProcessingPhase(preparedData) {
        const coreServices = {
            deduplication: this.container.resolve('deduplicationService'),
            conversion: this.container.resolve('conversionService'),
            validation: this.container.resolve('validationService')
        };

        // Ejecutar servicios core en paralelo cuando sea posible
        const processingTasks = [];
        
        // Deduplicación (debe ejecutarse primero)
        const deduplicatedData = await coreServices.deduplication.process(preparedData);
        
        // Conversión y validación en paralelo
        processingTasks.push(
            coreServices.conversion.process(deduplicatedData),
            coreServices.validation.process(deduplicatedData)
        );
        
        const [convertedData, validationResults] = await Promise.all(processingTasks);
        
        return {
            data: convertedData,
            validation: validationResults,
            statistics: {
                originalCount: preparedData.length,
                deduplicatedCount: deduplicatedData.length,
                validCount: validationResults.valid.length,
                invalidCount: validationResults.invalid.length
            }
        };
    }

    /**
     * Fase 7: Procesamiento por chunks para optimizar memoria
     */
    async chunkProcessingPhase(processedData) {
        const chunkService = this.container.resolve('chunkProcessingService');
        const chunkSize = this.config.processing?.chunkSize || 1000;
        
        return await chunkService.processInChunks(
            processedData.data,
            chunkSize,
            (chunk) => this.processChunk(chunk)
        );
    }

    /**
     * Procesa un chunk individual de datos
     */
    async processChunk(chunk) {
        // Aplicar procesamiento específico por chunk
        const chunkProcessors = this.container.resolve('chunkProcessors');
        
        let processedChunk = chunk;
        for (const processor of chunkProcessors) {
            processedChunk = await processor.process(processedChunk);
        }
        
        return processedChunk;
    }

    /**
     * Fase 8: Generación de archivos de salida (CSV, M3U)
     */
    async outputGenerationPhase(chunkedResults) {
        const outputService = this.container.resolve('outputService');
        const outputConfig = this.config.output || {};
        
        const outputs = {};
        
        // Generar CSV si está configurado
        if (outputConfig.csv) {
            outputs.csv = await outputService.generateCSV(chunkedResults, outputConfig.csv);
        }
        
        // Generar M3U si está configurado
        if (outputConfig.m3u) {
            outputs.m3u = await outputService.generateM3U(chunkedResults, outputConfig.m3u);
        }
        
        // Generar otros formatos según configuración
        if (outputConfig.json) {
            outputs.json = await outputService.generateJSON(chunkedResults, outputConfig.json);
        }
        
        return outputs;
    }

    /**
     * Valida la configuración del procesador
     */
    async validateConfiguration() {
        const validator = this.container.resolve('configurationValidator');
        const validationResult = await validator.validate(this.config);
        
        if (!validationResult.isValid) {
            throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
        }
    }

    /**
     * Inicializa los servicios core necesarios
     */
    async initializeCoreServices() {
        const coreServices = [
            'configurationService',
            'dataLoaderService',
            'filterService',
            'outputService'
        ];
        
        for (const serviceName of coreServices) {
            if (!this.container.has(serviceName)) {
                throw new Error(`Required service '${serviceName}' not found`);
            }
        }
    }

    /**
     * Configura el pipeline de procesamiento
     */
    setupProcessingPipeline() {
        // Configurar hooks y middleware del pipeline
        this.eventEmitter.on(SystemEvents.PHASE_STARTED, (data) => {
            console.log(`Starting phase: ${data.phase}`);
        });
        
        this.eventEmitter.on(SystemEvents.PHASE_COMPLETED, (data) => {
            console.log(`Completed phase: ${data.phase}`);
        });
    }

    /**
     * Genera estadísticas del procesamiento
     */
    generateStatistics(outputs) {
        return {
            totalProcessingTime: Date.now() - this.processingState.startTime,
            phases: this.processingState.errors.length === 0 ? 'all_successful' : 'with_errors',
            outputsGenerated: Object.keys(outputs).length,
            errors: this.processingState.errors
        };
    }

    /**
     * Obtiene el estado actual del procesamiento
     */
    getProcessingState() {
        return { ...this.processingState };
    }

    /**
     * Configura el procesador con nueva configuración
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.isInitialized = false; // Requiere reinicialización
        return this;
    }
}