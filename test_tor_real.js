import torRequest from 'tor-request';

console.log('=== Test Real de Tor con Torrentio ===\n');

// Test 1: Verificar IP actual
console.log('1. Verificando IP actual...');
torRequest.request({
  url: 'https://httpbin.org/ip',
  timeout: 10000
}, (err, res, body) => {
  if (err) {
    console.error('❌ Error obteniendo IP:', err.message);
    return;
  }
  
  console.log('✅ IP vía Tor:', JSON.parse(body).origin);
  
  // Test 2: Probar Torrentio directamente
  console.log('\n2. Probando Torrentio vía Tor...');
  const torrentioUrl = 'https://torrentio.strem.fun/providers=mejortorrent,wolfmax4k,cinecalidad|sort=seeders|qualityfilter=scr,cam,unknown|limit=10|lang=spanish/stream/movie/tt0111161.json';
  
  torRequest.request({
    url: torrentioUrl,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:102.0) Gecko/20100101 Firefox/102.0',
      'Accept': 'application/json'
    },
    timeout: 15000
  }, (err, res, body) => {
    if (err) {
      console.error('❌ Error con Torrentio:', err.message);
      return;
    }
    
    console.log(`✅ Torrentio respondió: ${res.statusCode}`);
    
    if (res.statusCode === 200) {
      try {
        const data = JSON.parse(body);
        console.log(`✅ Streams encontrados: ${data.streams ? data.streams.length : 0}`);
      } catch (parseErr) {
        console.log('✅ Respuesta recibida pero no es JSON válido');
      }
    } else {
      console.log(`⚠️ Status code: ${res.statusCode}`);
      console.log('Respuesta:', body.substring(0, 200));
    }
  });
});