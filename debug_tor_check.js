import net from 'net';

console.log('=== Debug Tor Availability Check ===\n');

// Simular exactamente lo que hace el código
function checkTorAvailability(host = '127.0.0.1', port = 9050) {
  return new Promise((resolve) => {
    console.log(`Intentando conectar a ${host}:${port}...`);
    const socket = new net.Socket();
    
    const timeout = setTimeout(() => {
      console.log('❌ Timeout alcanzado (3 segundos)');
      socket.destroy();
      resolve(false);
    }, 3000);
    
    socket.connect(port, host, () => {
      console.log('✅ Conexión TCP exitosa');
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', (err) => {
      console.log('❌ Error de conexión:', err.message);
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

// Test con diferentes configuraciones
async function runTests() {
  console.log('Test 1: 127.0.0.1:9050');
  const result1 = await checkTorAvailability('127.0.0.1', 9050);
  console.log('Resultado:', result1);
  
  console.log('\nTest 2: localhost:9050');
  const result2 = await checkTorAvailability('localhost', 9050);
  console.log('Resultado:', result2);
  
  console.log('\nTest 3: Verificar con netstat');
  console.log('Ejecuta: netstat -an | findstr :9050');
}

runTests().catch(console.error);