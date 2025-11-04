/**
 * @fileoverview Herramientas auxiliares para TvInitializationService
 * @description Funciones puras y utilitarias para el servicio de inicialización TV
 */

import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Verifica la existencia de múltiples archivos de forma atómica
 * @param {Array<string>} filePaths - Rutas de archivos a verificar
 * @returns {Object} Estado de verificación con detalles por archivo
 */
export function checkFilesAtomic(filePaths) {
    const results = {};
    let allExist = true;
    const missingFiles = [];
    
    for (const filePath of filePaths) {
        const exists = existsSync(filePath);
        results[filePath] = { exists, basename: filePath.split('\\').pop() };
        
        if (!exists) {
            allExist = false;
            missingFiles.push(filePath);
        }
    }
    
    return {
        allExist,
        results,
        missingFiles,
        summary: {
            total: filePaths.length,
            existing: filePaths.length - missingFiles.length,
            missing: missingFiles.length
        }
    };
}

/**
 * Construye las rutas estándar de archivos TV basadas en el directorio raíz
 * @param {string} projectRoot - Ruta raíz del proyecto
 * @returns {Object} Objeto con rutas de archivos TV
 */
export function buildTvFilePaths(projectRoot) {
    const tvOutputPath = join(projectRoot, 'tv', 'output');
    
    return {
        tvOutputPath,
        channelsM3uPath: join(tvOutputPath, 'channels.m3u'),
        tvCsvPath: join(tvOutputPath, 'tv.csv'),
        requiredFiles: [
            join(tvOutputPath, 'channels.m3u'),
            join(tvOutputPath, 'tv.csv')
        ]
    };
}

/**
 * Obtiene el directorio raíz del proyecto basado en la ubicación del módulo
 * @param {string} currentModuleUrl - URL del módulo actual (import.meta.url)
 * @returns {string} Ruta raíz del proyecto
 */
export function getProjectRoot(currentModuleUrl) {
    const __filename = fileURLToPath(currentModuleUrl);
    const __dirname = dirname(__filename);
    // Asume que el proyecto tiene 4 niveles: src/infrastructure/services/
    return join(__dirname, '..', '..', '..', '..');
}

/**
 * Crea el directorio de salida TV si no existe
 * @param {string} tvOutputPath - Ruta del directorio TV output
 * @returns {boolean} True si el directorio existe o fue creado exitosamente
 */
export function ensureTvOutputDirectory(tvOutputPath) {
    try {
        if (!existsSync(tvOutputPath)) {
            mkdirSync(tvOutputPath, { recursive: true });
            return true;
        }
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Genera configuración de spawn para el proceso TV
 * @param {string} tvMainPath - Ruta al archivo main.js de TV
 * @param {string} tvWorkingDir - Directorio de trabajo para el proceso
 * @param {Object} envVars - Variables de entorno adicionales
 * @returns {Object} Configuración de spawn
 */
export function buildSpawnConfig(tvMainPath, tvWorkingDir, envVars = {}) {
    return {
        command: 'node',
        args: [tvMainPath],
        options: {
            cwd: tvWorkingDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || 'production',
                ...envVars
            }
        }
    };
}

/**
 * Analiza la salida del proceso TV para extraer información útil
 * @param {string} stdout - Salida estándar del proceso
 * @param {string} stderr - Salida de error del proceso
 * @param {number} exitCode - Código de salida del proceso
 * @returns {Object} Análisis de la salida
 */
export function parseTvProcessOutput(stdout, stderr, exitCode) {
    const lines = stdout.split('\n').filter(line => line.trim());
    const errors = stderr.split('\n').filter(line => line.trim());
    
    // Buscar patrones comunes en la salida
    const patterns = {
        channelsGenerated: /(\d+)\s*channels?\s*generated/i,
        processingComplete: /processing\s*complete/i,
        errorDetected: /error|fail|exception/i,
        warningDetected: /warning|warn/i
    };
    
    const analysis = {
        exitCode,
        lines: lines.length,
        errors: errors.length,
        hasErrors: errors.length > 0 || exitCode !== 0,
        channelsGenerated: null,
        processingComplete: false,
        warnings: [],
        errors: []
    };
    
    // Analizar líneas
    lines.forEach(line => {
        if (patterns.channelsGenerated.test(line)) {
            const match = line.match(/\d+/);
            if (match) analysis.channelsGenerated = parseInt(match[0]);
        }
        
        if (patterns.processingComplete.test(line)) {
            analysis.processingComplete = true;
        }
        
        if (patterns.warningDetected.test(line)) {
            analysis.warnings.push(line);
        }
    });
    
    // Analizar errores
    if (errors.length > 0) {
        analysis.errors = errors;
    }
    
    return analysis;
}

/**
 * Construye mensajes de log estructurados para el servicio TV
 * @param {string} level - Nivel de log (info, warn, error, debug)
 * @param {string} message - Mensaje principal
 * @param {Object} context - Contexto adicional
 * @returns {Object} Mensaje de log estructurado
 */
export function buildLogMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    
    return {
        timestamp,
        level: level.toUpperCase(),
        service: 'TvInitializationService',
        message,
        context: {
            ...context,
            pid: process.pid,
            nodeVersion: process.version
        }
    };
}

/**
 * Valida el resultado de generación de archivos TV
 * @param {Object} generationResult - Resultado de la generación
 * @returns {Object} Validación detallada
 */
export function validateGenerationResult(generationResult) {
    const validation = {
        isValid: false,
        checks: {},
        issues: []
    };
    
    // Verificar estructura básica
    validation.checks.hasResult = generationResult && typeof generationResult === 'object';
    if (!validation.checks.hasResult) {
        validation.issues.push('Resultado inválido o ausente');
        return validation;
    }
    
    // Verificar éxito
    validation.checks.success = generationResult.success === true;
    if (!validation.checks.success) {
        validation.issues.push('Generación marcada como fallida');
    }
    
    // Verificar archivos generados
    validation.checks.filesGenerated = generationResult.filesGenerated === true;
    if (!validation.checks.filesGenerated) {
        validation.issues.push('Archivos no marcados como generados');
    }
    
    // Verificar que existan archivos
    if (generationResult.files) {
        const files = Object.values(generationResult.files);
        validation.checks.allFilesExist = files.every(file => file.exists === true);
        
        if (!validation.checks.allFilesExist) {
            const missingFiles = files.filter(file => !file.exists).map(file => file.basename);
            validation.issues.push(`Archivos faltantes: ${missingFiles.join(', ')}`);
        }
    }
    
    // Verificar código de salida
    if (generationResult.exitCode !== undefined) {
        validation.checks.validExitCode = generationResult.exitCode === 0;
        if (!validation.checks.validExitCode) {
            validation.issues.push(`Código de salida inválido: ${generationResult.exitCode}`);
        }
    }
    
    // Determinar validez general
    validation.isValid = Object.values(validation.checks).every(check => check === true);
    
    return validation;
}

/**
 * Calcula estadísticas de reintentos
 * @param {number} attempts - Número de intentos realizados
 * @param {number} maxAttempts - Máximo de intentos permitidos
 * @returns {Object} Estadísticas de reintentos
 */
export function calculateRetryStats(attempts, maxAttempts) {
    return {
        attempts,
        maxAttempts,
        remaining: Math.max(0, maxAttempts - attempts),
        successRate: attempts > 0 ? Math.round(((attempts - 1) / attempts) * 100) : 0,
        exhausted: attempts >= maxAttempts
    };
}

/**
 * Genera estrategia de reintento basada en el número de intento
 * @param {number} attemptNumber - Número de intento actual
 * @returns {Object} Estrategia de reintento
 */
export function getRetryStrategy(attemptNumber) {
    const baseDelay = 5000; // 5 segundos base
    const multiplier = Math.pow(2, attemptNumber - 1); // Exponencial
    const jitter = Math.random() * 1000; // Anti-thundering herd
    
    return {
        delay: baseDelay * multiplier + jitter,
        maxDelay: 60000, // Máximo 1 minuto
        strategy: attemptNumber === 1 ? 'immediate' : 
                  attemptNumber <= 2 ? 'linear' : 'exponential'
    };
}

/**
 * Exporta funciones de utilidad para testing
 */
export const TvInitializationUtils = {
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
};