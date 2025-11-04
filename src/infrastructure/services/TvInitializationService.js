/**
 * @fileoverview Servicio de inicialización para TV - Verifica y genera archivos de canales IPTV
 * @description Implementa verificación atómica de archivos y generación condicional de canales TV
 */

import { spawn } from 'child_process';
import { join } from 'path';
import {
    checkFilesAtomic,
    buildTvFilePaths,
    getProjectRoot,
    ensureTvOutputDirectory,
    buildSpawnConfig,
    parseTvProcessOutput,
    buildLogMessage,
    validateGenerationResult,
    calculateRetryStats,
    getRetryStrategy
} from './TvInitializationService_tools.js';

/**
 * Servicio de inicialización para archivos de TV
 * Verifica existencia de archivos y genera canales cuando sea necesario
 */
export class TvInitializationService {
    #logger;
    #config;
    #tvOutputPath;
    #channelsM3uPath;
    #tvCsvPath;
    #isInitialized;
    #generationAttempts;

    /**
     * @param {Object} config - Configuración del addon
     * @param {Object} logger - Logger del sistema
     */
    constructor(config, logger) {
        this.#logger = logger;
        this.#config = config;
        this.#isInitialized = false;
        this.#generationAttempts = 0;
        
        // Resolver rutas de archivos TV usando herramientas
        const projectRoot = getProjectRoot(import.meta.url);
        const tvPaths = buildTvFilePaths(projectRoot);
        
        this.#tvOutputPath = tvPaths.tvOutputPath;
        this.#channelsM3uPath = tvPaths.channelsM3uPath;
        this.#tvCsvPath = tvPaths.tvCsvPath;
        
        // Asegurar que el directorio de salida exista
        ensureTvOutputDirectory(this.#tvOutputPath);
    }

    /**
     * Inicializa el servicio de TV verificando archivos y generando si es necesario
     * @returns {Promise<Object>} Resultado de la inicialización
     */
    async initialize() {
        this.#logger.info('📺 Iniciando servicio de inicialización TV...');
        
        try {
            // Verificar existencia de archivos de forma atómica usando herramientas
            const filesCheck = checkFilesAtomic([this.#channelsM3uPath, this.#tvCsvPath]);
            
            if (filesCheck.allExist) {
                const logMsg = buildLogMessage('info', '✅ Todos los archivos TV existen, omitiendo generación', {
                    files: filesCheck.results
                });
                this.#logger.info(logMsg.message);
                this.#logger.debug('Detalles de archivos:', logMsg.context);
                
                this.#isInitialized = true;
                return {
                    success: true,
                    filesGenerated: false,
                    files: filesCheck.results,
                    message: 'Archivos TV existentes, no se requiere generación'
                };
            }
            
            const missingFiles = filesCheck.missingFiles.map(path => path.split('\\').pop());
            this.#logger.info(`⚠️ Faltan archivos TV: ${missingFiles.join(', ')}`);
            
            // Generar archivos faltantes
            const generationResult = await this.#generateTvFiles();
            
            if (generationResult.success) {
                this.#logger.info('✅ Archivos TV generados exitosamente');
                this.#isInitialized = true;
            } else {
                this.#logger.error('❌ Falló generación de archivos TV');
            }
            
            return generationResult;
            
        } catch (error) {
            const errorLog = buildLogMessage('error', '💥 Error en inicialización TV', {
                error: error.message,
                stack: error.stack
            });
            this.#logger.error(errorLog.message, errorLog.context);
            
            return {
                success: false,
                filesGenerated: false,
                error: error.message,
                message: 'Error crítico en inicialización TV'
            };
        }
    }



    /**
     * Genera archivos TV ejecutando el proceso de generación con reintentos inteligentes
     * @private
     * @returns {Promise<Object>} Resultado de la generación
     */
    async #generateTvFiles() {
        this.#logger.info('🔄 Iniciando generación de archivos TV...');
        
        const maxAttempts = 3;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            this.#generationAttempts = attempt;
            const retryStats = calculateRetryStats(attempt, maxAttempts);
            
            this.#logger.info(`🚀 Intento ${attempt} de ${maxAttempts} de generación TV`, {
                retryStats,
                strategy: getRetryStrategy(attempt).strategy
            });
            
            try {
                const result = await this.#executeTvGeneration();
                
                // Validar resultado usando herramientas
                const validation = validateGenerationResult(result);
                
                if (validation.isValid) {
                    this.#logger.info(`✅ Generación exitosa en intento ${attempt}`);
                    return result;
                }
                
                if (attempt < maxAttempts) {
                    const strategy = getRetryStrategy(attempt);
                    this.#logger.warn(`⚠️ Intento ${attempt} fallido: ${validation.issues.join(', ')}`);
                    this.#logger.info(`⏱️ Reintentando en ${strategy.delay}ms...`);
                    await this.#delay(strategy.delay);
                }
                
            } catch (error) {
                const errorLog = buildLogMessage('error', `❌ Error en intento ${attempt}`, {
                    error: error.message,
                    attempt,
                    maxAttempts
                });
                this.#logger.error(errorLog.message, errorLog.context);
                
                if (attempt < maxAttempts) {
                    const strategy = getRetryStrategy(attempt);
                    await this.#delay(strategy.delay);
                }
            }
        }
        
        // Todos los intentos fallaron
        const finalStats = calculateRetryStats(this.#generationAttempts, maxAttempts);
        const failureLog = buildLogMessage('error', '💥 Todos los intentos de generación fallaron', {
            finalStats,
            maxAttemptsReached: true
        });
        
        this.#logger.error(failureLog.message, failureLog.context);
        
        return {
            success: false,
            filesGenerated: false,
            error: 'Todos los intentos de generación fallaron',
            message: 'No se pudieron generar los archivos TV después de 3 intentos',
            attempts: this.#generationAttempts
        };
    }

    /**
     * Ejecuta el proceso de generación TV con configuración optimizada
     * @private
     * @returns {Promise<Object>} Resultado de la ejecución
     */
    async #executeTvGeneration() {
        return new Promise((resolve, reject) => {
            const tvMainPath = join(this.#config.basePath || process.cwd(), 'tv', 'src', 'main.js');
            const tvWorkingDir = join(this.#config.basePath || process.cwd(), 'tv');
            
            // Construir configuración de spawn usando herramientas
            const spawnConfig = buildSpawnConfig(tvMainPath, tvWorkingDir, {
                TV_GENERATION_MODE: 'complete',
                TV_OUTPUT_PATH: this.#tvOutputPath
            });
            
            const logMsg = buildLogMessage('info', '📡 Ejecutando generador TV', {
                tvMainPath,
                tvWorkingDir,
                attempt: this.#generationAttempts
            });
            this.#logger.info(logMsg.message, logMsg.context);
            
            const child = spawn(spawnConfig.command, spawnConfig.args, spawnConfig.options);
            
            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                this.#logger.debug(`TV stdout: ${output.trim()}`);
            });
            
            child.stderr.on('data', (data) => {
                const error = data.toString();
                stderr += error;
                this.#logger.warn(`TV stderr: ${error.trim()}`);
            });
            
            child.on('close', (exitCode) => {
                const closeLog = buildLogMessage('info', '📺 Proceso TV finalizado', {
                    exitCode,
                    stdoutLength: stdout.length,
                    stderrLength: stderr.length,
                    attempt: this.#generationAttempts
                });
                this.#logger.info(closeLog.message, closeLog.context);
                
                // Analizar salida del proceso usando herramientas
                const outputAnalysis = parseTvProcessOutput(stdout, stderr, exitCode);
                
                // Verificar que los archivos se generaron
                const filesCheck = this.#checkGeneratedFiles();
                
                const result = {
                    success: exitCode === 0 && filesCheck.allGenerated,
                    filesGenerated: filesCheck.allGenerated,
                    files: filesCheck.files,
                    exitCode,
                    stdout,
                    stderr,
                    outputAnalysis,
                    message: exitCode === 0 ? 'Archivos TV generados exitosamente' : 'Falló la generación de archivos TV'
                };
                
                if (exitCode !== 0) {
                    result.error = 'Proceso terminó con error';
                } else if (!filesCheck.allGenerated) {
                    result.error = 'Archivos no generados';
                }
                
                resolve(result);
            });
            
            child.on('error', (error) => {
                const errorLog = buildLogMessage('error', '💥 Error ejecutando proceso TV', {
                    error: error.message,
                    tvMainPath,
                    attempt: this.#generationAttempts
                });
                this.#logger.error(errorLog.message, errorLog.context);
                reject(error);
            });
            
            // Timeout de 2 minutos con logging
            const timeoutMs = 120000;
            setTimeout(() => {
                const timeoutLog = buildLogMessage('error', '⏰ Timeout: Proceso TV excedió tiempo límite', {
                    timeoutMs,
                    attempt: this.#generationAttempts
                });
                this.#logger.error(timeoutLog.message, timeoutLog.context);
                
                child.kill('SIGTERM');
                reject(new Error(`Timeout: Proceso TV excedió ${timeoutMs}ms`));
            }, timeoutMs);
        });
    }

    /**
     * Verifica que los archivos se hayan generado correctamente
     * @private
     * @returns {Object} Estado de los archivos generados
     */
    #checkGeneratedFiles() {
        const files = {
            'channels.m3u': { path: this.#channelsM3uPath, exists: existsSync(this.#channelsM3uPath) },
            'tv.csv': { path: this.#tvCsvPath, exists: existsSync(this.#tvCsvPath) }
        };
        
        const allGenerated = Object.values(files).every(file => file.exists);
        
        return { allGenerated, files };
    }

    /**
     * Retardo utilitario
     * @private
     * @param {number} ms - Milisegundos a esperar
     * @returns {Promise<void>}
     */
    #delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Verifica si el servicio está inicializado
     * @returns {boolean} Estado de inicialización
     */
    isInitialized() {
        return this.#isInitialized;
    }

    /**
     * Obtiene información del servicio
     * @returns {Object} Información del servicio
     */
    getInfo() {
        return {
            initialized: this.#isInitialized,
            outputPath: this.#tvOutputPath,
            channelsM3uPath: this.#channelsM3uPath,
            tvCsvPath: this.#tvCsvPath,
            generationAttempts: this.#generationAttempts
        };
    }
}