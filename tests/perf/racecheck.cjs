/**
 * Reproduce la carrera de sincronizacion de campanas entre dos terminales.
 *
 * Por que existe: `syncCampaignsWithCloud` hace load -> merge -> save del blob
 * completo, y `saveCampaignsToCloud` no envia ninguna guardia de version. Si dos
 * terminales leen antes de que el otro escriba, el segundo guarda un estado
 * fusionado a partir de una lectura obsoleta y borra las lecturas del primero.
 * Con la latencia real de Apps Script (~2.500 ms) esa ventana es enorme.
 *
 * Usa el codigo REAL (src/lib/sheets.ts) en dos procesos separados, cada uno con
 * su propio cache de modulo, como dos tablets distintas.
 *
 * Casos:
 *   1. CONTROL: una terminal sola sincroniza y su lectura queda en la nube.
 *   2. CARRERA: dos terminales sincronizan a la vez; ambas lecturas deben quedar.
 *   3. SECUENCIAL: A luego B; ambas lecturas deben quedar (el merge funciona).
 *
 * El caso 3 existe para separar dos fallos distintos: si el 3 pasa y el 2 falla,
 * el merge esta bien y lo que falla es la concurrencia (no la fusion).
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

// Convencion del runner: argv[2] = BASE de la app (no se usa: este arnes no abre
// navegador, usa el codigo real de sheets.ts desde Node), argv[3] = puerto del backend.
const FAKE_PORT = Number(process.argv[3] || 9861);
const READ_DELAY_MS = Number(process.argv[4] || 800);
const TERMINAL = path.join(__dirname, 'campaign-sync-terminal.ts');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function post(payload) {
  return new Promise((res, rej) => {
    const body = JSON.stringify(payload);
    const r = http.request({
      host: '127.0.0.1', port: FAKE_PORT, path: '/exec', method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) }
    }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end(body);
  });
}

// Lee el estado de campanas tal como lo veria un tercer terminal.
async function leerNube() {
  const raw = await post({ action: 'getSheetData', sheetName: '_CONFIG_APP' });
  const rows = (JSON.parse(raw).values) || [];
  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const k = String(rows[i][0] || '').trim();
    if (k) map.set(k, String(rows[i][1] || ''));
  }
  let json = map.get('CAMPAIGNS_DATA');
  if (json && json.startsWith('[CHUNKED:')) {
    const n = parseInt(json.replace(/[^0-9]/g, ''), 10);
    let acc = '';
    for (let c = 0; c < n; c++) acc += map.get(`CAMPAIGNS_DATA_CHUNK_${c}`) || '';
    json = acc;
  }
  if (!json) return { sessions: [], campaigns: [] };
  try { return JSON.parse(json); } catch { return { sessions: [], campaigns: [] }; }
}

// Corre una terminal en su propio proceso y devuelve su salida.
// `startAt` es el instante absoluto del sync: coordina ambos procesos para que
// el solapamiento sea real y no dependa del jitter de arranque de tsx.
function correrTerminal(sessionId, entryId, label, startAt = 0) {
  return new Promise(resolve => {
    const p = spawn('npx', ['tsx', TERMINAL, String(FAKE_PORT), sessionId, entryId, label, String(startAt)], {
      cwd: '/workspace/project/controldevencimientos',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    p.stdout.on('data', c => out += c);
    p.stderr.on('data', c => err += c);
    p.on('close', () => {
      const line = out.trim().split('\n').find(l => l.trim().startsWith('{'));
      resolve(line ? JSON.parse(line) : { label, success: false, error: err.slice(0, 300) });
    });
  });
}

// Lanza dos terminales coordinadas: primero arrancan (import de tsx), luego
// ambas disparan su sync en el mismo instante absoluto.
async function correrCarrera(pares) {
  const startAt = Date.now() + 4000; // margen para que ambas terminen de arrancar
  return Promise.all(pares.map(([sid, eid, label]) => correrTerminal(sid, eid, label, startAt)));
}

// Extrae el conjunto de ids de lectura que quedaron persistidos en la nube.
function idsPersistidos(data) {
  const ids = new Set();
  for (const s of data.sessions || []) {
    for (const c of s.conteos || []) ids.add(c.id);
  }
  return ids;
}

(async () => {
  // Backend limpio + latencia de lectura que abre la ventana de carrera.
  await post({ action: 'setReadDelay', ms: READ_DELAY_MS });
  await post({ action: 'appendRow', sheetName: '_CONFIG_APP', values: ['CLAVE', 'VALOR_JSON', 'ULTIMA_ACTUALIZACION'] });

  const resultados = [];
  let salidasCarrera = [];

  // ---------- 1. CONTROL: una terminal sola ----------
  await correrTerminal('SES-A', 'E-A', 'TERMINAL-A');
  let ids = idsPersistidos(await leerNube());
  resultados.push({ caso: 'CONTROL (1 terminal sola)', lecturas: [...ids].sort(), ok: ids.has('E-A') });

  // ---------- 2. CARRERA: dos terminales a la vez ----------
  await post({ action: 'deleteRows', sheetName: '_CONFIG_APP', rowIndexes: [2, 3, 4, 5, 6, 7, 8] });
  await post({ action: 'appendRow', sheetName: '_CONFIG_APP', values: ['CLAVE', 'VALOR_JSON', 'ULTIMA_ACTUALIZACION'] });
  await sleep(200);

  await correrCarrera([
    ['SES-B', 'E-B', 'TERMINAL-B'],
    ['SES-C', 'E-C', 'TERMINAL-C'],
  ]).then(r => { salidasCarrera = r; });
  ids = idsPersistidos(await leerNube());
  const ambasCarrera = ids.has('E-B') && ids.has('E-C');
  resultados.push({
    caso: 'CARRERA (2 terminales simultaneas)',
    lecturas: [...ids].sort(),
    esperadas: ['E-B', 'E-C'],
    ok: ambasCarrera,
    perdidas: ['E-B', 'E-C'].filter(x => !ids.has(x)),
  });

  // ---------- 3. SECUENCIAL: A y luego B ----------
  await post({ action: 'deleteRows', sheetName: '_CONFIG_APP', rowIndexes: [2, 3, 4, 5, 6, 7, 8] });
  await post({ action: 'appendRow', sheetName: '_CONFIG_APP', values: ['CLAVE', 'VALOR_JSON', 'ULTIMA_ACTUALIZACION'] });
  await sleep(200);

  await correrTerminal('SES-D', 'E-D', 'TERMINAL-D');
  await correrTerminal('SES-E', 'E-E', 'TERMINAL-E');
  ids = idsPersistidos(await leerNube());
  resultados.push({
    caso: 'SECUENCIAL (A y luego B)',
    lecturas: [...ids].sort(),
    esperadas: ['E-D', 'E-E'],
    ok: ids.has('E-D') && ids.has('E-E'),
    perdidas: ['E-D', 'E-E'].filter(x => !ids.has(x)),
  });

  console.log(JSON.stringify(resultados, null, 2));
  console.log('DISPAROS DE LA CARRERA: ' + JSON.stringify(salidasCarrera.map(s => ({ label: s.label, disparo: s.disparo, duracionMs: s.duracionMs, ok: s.success }))));

  const control = resultados[0].ok;
  const carrera = resultados[1].ok;
  const secuencial = resultados[2].ok;

  // Diagnostico: distingue "el merge esta roto" de "hay carrera".
  let veredicto;
  if (!control) veredicto = 'INDETERMINADO: el caso de control falla, la reproduccion no es valida.';
  else if (!secuencial) veredicto = 'FALLO DE FUSION: incluso secuencial se pierden lecturas. El merge esta roto.';
  else if (!carrera) veredicto = 'CARRERA CONFIRMADA: secuencial funciona, simultaneo pierde lecturas (lost update).';
  else veredicto = 'SIN CARRERA: simultaneo conserva ambas lecturas (compare-and-swap activo).';
  console.log('DIAGNOSTICO: ' + veredicto);
  console.log(carrera ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  process.exit(carrera ? 0 : 1);
})().catch(e => { console.error('Fallo del arnes:', e.message); process.exit(1); });
