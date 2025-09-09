import { dynamicValidationService } from './src/infrastructure/services/DynamicValidationService.js';

const testId = 'mal:11061:1:1';

console.log('=== Debug Validación DynamicValidationService ===\n');

try {
  console.log(`Testing ID: ${testId}`);
  
  // Test directo del validador
  const result = await dynamicValidationService.validateContentId(
    testId, 
    'stream_request',
    { strictMode: false }
  );
  
  console.log('Resultado de validación:');
  console.log(JSON.stringify(result, null, 2));
  
} catch (error) {
  console.log(`Error en validación: ${error.message}`);
  console.log('Stack:', error.stack);
}

console.log('\n=== Debug completado ===');