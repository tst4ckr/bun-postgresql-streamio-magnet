import net from 'net';
import torRequest from 'tor-request';

console.log('=== Diagnóstico de Conexión Tor ===\n');

// Test 1: Verificar conectividad TCP al puerto SOCKS
console.log('1. Probando conectividad TCP a 127.0.0.1:9050...');
const socket = new net.Socket();

const timeout = setTimeout(() => {
  socket.destroy();
  console.log('❌ Timeout: No se pudo conectar al puerto 9050');
  testTorRequest();
}, 5000);

socket.connect(9050, '127.0.0.1', () => {
  clearTimeout(timeout);
  console.log('✅ Conexión TCP exitosa al puerto 9050');
  socket.destroy();
  testTorRequest();
});

socket.on('error', (err) => {
  clearTimeout(timeout);
  console.log(`❌ Error de conexión TCP: ${err.message}`);
  testTorRequest();
});

// Test 2: Probar tor-request directamente
function testTorRequest() {
  console.log('\n2. Probando tor-request directamente...');
  console.log('Métodos disponibles en torRequest:', Object.keys(torRequest));
  
  const startTime = Date.now();
  
  // Usar la sintaxis correcta para tor-request
  const options = {
    url: 'https://httpbin.org/ip',
    method: 'GET'
  };
  
  torRequest.request(options, (err, res, body) => {
    const duration = Date.now() - startTime;
    
    if (err) {
      console.log(`❌ Error en tor-request (${duration}ms): ${err.message}`);
      testFallback();
      return;
    }
    
    console.log(`✅ tor-request exitoso (${duration}ms)`);
    console.log(`Status: ${res?.statusCode}`);
    console.log(`Respuesta: ${body}`);
    
    try {
      const ipData = JSON.parse(body);
      console.log(`IP detectada vía Tor: ${ipData.origin}`);
    } catch (e) {
      console.log('Respuesta recibida pero no es JSON válido');
    }
    
    testFallback();
  });
}

// Test 3: Comparar con conexión directa
function testFallback() {
  console.log('\n3. Probando conexión directa (sin Tor)...');
  
  import('https').then(https => {
    const startTime = Date.now();
    
    const req = https.get('https://httpbin.org/ip', (res) => {
      const duration = Date.now() - startTime;
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`✅ Conexión directa exitosa (${duration}ms)`);
        
        try {
          const ipData = JSON.parse(data);
          console.log(`IP detectada sin Tor: ${ipData.origin}`);
        } catch (e) {
          console.log('Respuesta recibida pero no es JSON válido');
        }
        
        console.log('\n=== Diagnóstico Completado ===');
      });
    });
    
    req.on('error', (err) => {
      const duration = Date.now() - startTime;
      console.log(`❌ Error en conexión directa (${duration}ms): ${err.message}`);
      console.log('\n=== Diagnóstico Completado ===');
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      console.log('❌ Timeout en conexión directa');
      console.log('\n=== Diagnóstico Completado ===');
    });
  });
}