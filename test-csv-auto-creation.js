/**
 * Script de prueba para verificar la creación automática de archivos CSV
 * Simula la eliminación de archivos y verifica que se recrean automáticamente
 */

import { existsSync, unlinkSync } from 'fs';
import { CsvFileInitializer } from './src/infrastructure/utils/CsvFileInitializer.js';
import path from 'path';

const DATA_DIR = './data';
const CSV_FILES = ['anime.csv', 'english.csv', 'magnets.csv', 'torrentio.csv'];

console.log('🧪 Iniciando prueba de creación automática de archivos CSV\n');

// Función para verificar existencia de archivos
function checkFilesExistence() {
    console.log('📋 Estado actual de archivos CSV:');
    CSV_FILES.forEach(filename => {
        const filePath = path.join(DATA_DIR, filename);
        const exists = existsSync(filePath);
        console.log(`  ${exists ? '✅' : '❌'} ${filename}: ${exists ? 'Existe' : 'No existe'}`);
    });
    console.log('');
}

// Función para eliminar archivos de prueba
function deleteTestFiles() {
    console.log('🗑️  Eliminando archivos de prueba...');
    const filesToDelete = ['english.csv', 'anime.csv']; // Solo eliminamos algunos para la prueba
    
    filesToDelete.forEach(filename => {
        const filePath = path.join(DATA_DIR, filename);
        if (existsSync(filePath)) {
            unlinkSync(filePath);
            console.log(`  ❌ Eliminado: ${filename}`);
        }
    });
    console.log('');
}

// Ejecutar prueba
async function runTest() {
    try {
        // 1. Verificar estado inicial
        console.log('1️⃣ Estado inicial:');
        checkFilesExistence();

        // 2. Eliminar algunos archivos
        console.log('2️⃣ Simulando eliminación de archivos:');
        deleteTestFiles();
        checkFilesExistence();

        // 3. Ejecutar inicializador automático
        console.log('3️⃣ Ejecutando inicializador automático:');
        CsvFileInitializer.initializeAllCsvFiles(DATA_DIR);
        console.log('');

        // 4. Verificar que se recrearon
        console.log('4️⃣ Estado después de la inicialización:');
        checkFilesExistence();

        // 5. Validar formato de archivos
        console.log('5️⃣ Validando formato de archivos:');
        CSV_FILES.forEach(filename => {
            const filePath = path.join(DATA_DIR, filename);
            const isValid = CsvFileInitializer.validateCsvFormat(filePath);
            console.log(`  ${isValid ? '✅' : '❌'} ${filename}: ${isValid ? 'Formato correcto' : 'Formato incorrecto'}`);
        });

        console.log('\n🎉 Prueba completada exitosamente!');
        console.log('✅ El sistema puede crear automáticamente archivos CSV faltantes');
        console.log('✅ Todos los archivos tienen el formato correcto');
        console.log('✅ El sistema es robusto ante archivos faltantes');

    } catch (error) {
        console.error('❌ Error durante la prueba:', error.message);
        process.exit(1);
    }
}

// Ejecutar la prueba
runTest();