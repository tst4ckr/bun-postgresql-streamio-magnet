// Quick diagnostic script for Stremio addon endpoints (remote)
// Usage: bun run scripts/check-stremio-remote.mjs

const base = process.env.STREMIO_BASE_URL || 'https://services-t.hvjqlb.easypanel.host';

async function fetchJSON(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) {
    console.error(`Failed to parse JSON from ${url}:`, e.message);
    console.error(text.slice(0, 500));
    throw e;
  }
  return { json, res };
}

function logHeader(res, name) {
  const val = res.headers.get(name) || '(missing)';
  console.log(`${name}: ${val}`);
}

async function main() {
  console.log(`=== Base: ${base} ===`);

  // Manifest
  console.log('\n=== Manifest ===');
  const { json: manifest, res: manifestRes } = await fetchJSON('/manifest.json');
  console.log('types:', (manifest.types || []).join(', '));
  console.log('catalogs (tv/channel):');
  (manifest.catalogs || [])
    .filter(c => c.type === 'tv' || c.type === 'channel')
    .forEach(c => console.log(`- type=${c.type} id=${c.id} name=${c.name} extras=${(c.extra||[]).map(e=>e.name).join(',')}`));
  console.log('CORS headers:');
  logHeader(manifestRes, 'access-control-allow-origin');
  logHeader(manifestRes, 'access-control-allow-headers');
  logHeader(manifestRes, 'access-control-allow-methods');

  // Catalog tv
  console.log('\n=== Catalog tv ===');
  const { json: catTv } = await fetchJSON('/catalog/tv/tv_catalog.json?skip=0&limit=10');
  const tvMetas = catTv.metas || [];
  console.log('tv metas count:', tvMetas.length);
  tvMetas.slice(0, 3).forEach(m => console.log(`tv meta: ${m.id} | ${m.name} | type=${m.type} | poster=${m.poster}`));

  // Catalog channel
  console.log('\n=== Catalog channel ===');
  const { json: catChannel } = await fetchJSON('/catalog/channel/tv_catalog.json?skip=0&limit=10');
  const chMetas = catChannel.metas || [];
  console.log('channel metas count:', chMetas.length);
  chMetas.slice(0, 3).forEach(m => console.log(`channel meta: ${m.id} | ${m.name} | type=${m.type} | poster=${m.poster}`));

  // Test possible extraArgs path variant used by v5 UI
  console.log('\n=== Catalog channel (extra path: top) ===');
  try {
    const { json: catChannelTop } = await fetchJSON('/catalog/channel/tv_catalog/top.json');
    console.log('channel(top) metas count:', (catChannelTop.metas || []).length);
  } catch (e) {
    console.log('channel(top) path not supported or failed:', e.message);
  }

  // Meta & stream tv
  console.log('\n=== Meta & Stream tv (first item) ===');
  if (tvMetas.length > 0) {
    const id = tvMetas[0].id;
    const { json: metaTv } = await fetchJSON(`/meta/tv/${id}.json`);
    console.log('meta tv:', `type=${metaTv.meta?.type} name=${metaTv.meta?.name}`);
    const { json: streamTv } = await fetchJSON(`/stream/tv/${id}.json`);
    console.log('stream tv count:', (streamTv.streams || []).length);
    if ((streamTv.streams || []).length > 0) {
      console.log('first stream url:', streamTv.streams[0].url);
    }
  } else {
    console.log('no tv metas to test meta/stream');
  }

  // Meta & stream channel
  console.log('\n=== Meta & Stream channel (first item) ===');
  if (chMetas.length > 0) {
    const id = chMetas[0].id;
    const { json: metaCh } = await fetchJSON(`/meta/channel/${id}.json`);
    console.log('meta channel:', `type=${metaCh.meta?.type} name=${metaCh.meta?.name}`);
    const { json: streamCh } = await fetchJSON(`/stream/channel/${id}.json`);
    console.log('stream channel count:', (streamCh.streams || []).length);
    if ((streamCh.streams || []).length > 0) {
      console.log('first stream url:', streamCh.streams[0].url);
    }
  } else {
    console.log('no channel metas to test meta/stream');
  }
}

main().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});