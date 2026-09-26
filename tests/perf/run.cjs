#!/usr/bin/env node
/**
 * Puerta E2E: arranca el build de produccion y ejecuta los arneses que cubren las
 * rutas de integridad de datos (resiliencia a corrupcion, importacion, mutaciones,
 * acciones masivas y agrupacion). Devuelve codigo distinto de cero si alguno falla.
 *
 * Existe porque esos arneses vivian como utilidades manuales: ninguno corria en CI,
 * asi que las regresiones de la invariante "no perder datos" no se atrapaban solas.
 *
 * Sin dependencias nuevas: usa el mismo protocolo CDP que los arneses y el Chrome ya
 * instalado (o CHROME_BIN). Requiere `npm run build` previo, o lo ejecuta con --build.
 */
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.E2E_PORT || 4173);
const BASE = `http://127.0.0.1:${PORT}/`;
const HARNESSES = [
  'corruptcheck.cjs',
  'startupcorruption.cjs',
  'offlinecheck.cjs',
  'mutcheck.cjs',
  'writecheck.cjs',
  'importcheck.cjs',
  'groupcheck.cjs',
  'searchcheck.cjs',
  'bulkcheck.cjs',
  'sidebarcheck.cjs',
  'scannercheck.cjs',
  'countcheck.cjs',
  'blindcheck.cjs',
  'campaigncheck.cjs',
  'printcheck.cjs',
  'titlecheck.cjs',
  'detailcheck.cjs',
  'genericcheck.cjs',
  'bodegacheck.cjs',
  'capabilitycheck.cjs',
  'genericpersonalitycheck.cjs',
  'catalogpersonalitycheck.cjs',
  'democheck.cjs',
  'demoentrycheck.cjs',
  'domaincheck.cjs',
  'racecheck.cjs',
  'rowidentity.cjs',
];
// Arneses que necesitan el backend falso (hojas no canonicas): el runner lo levanta
// y le pasa el puerto como segundo argumento.
const NEED_FAKE_BACKEND = new Set(['genericcheck.cjs', 'bodegacheck.cjs', 'capabilitycheck.cjs', 'genericpersonalitycheck.cjs', 'catalogpersonalitycheck.cjs', 'titlecheck.cjs', 'writecheck.cjs', 'racecheck.cjs', 'rowidentity.cjs']);
// Fuera de la banda de puertos CDP de los arneses (9300-9989): un backend falso dentro
// de ese rango puede caerle a un arnés que sortea ese puerto, y entonces su Chrome no
// escucha, `/json/new` lo responde el backend falso y el arnés muere con `Invalid URL`.
const FAKE_BACKEND_PORT = Number(process.env.E2E_FAKE_PORT || 9100);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean);
  return candidates.find(c => fs.existsSync(c)) || null;
}

function get(url) {
  return new Promise((res, rej) => {
    const r = http.get(url, resp => { resp.resume(); res(resp.statusCode); });
    r.on('error', rej);
  });
}

(async () => {
  const chrome = findChrome();
  if (!chrome) {
    console.error('No se encontro Chrome/Chromium. Define CHROME_BIN o instala chromium.');
    process.exit(1);
  }
  process.env.CHROME_BIN = chrome;

  if (process.argv.includes('--build')) {
    console.log('Compilando build de produccion...');
    const b = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
    if (b.status !== 0) process.exit(b.status || 1);
  }

  // Se fuerza host IPv4 explicito: el host por defecto de vite (`localhost`)
  // puede resolver a ::1 y dejar inalcanzable la sonda a 127.0.0.1.
  const preview = spawn('npm',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let previewLog = '';
  preview.stdout.on('data', d => { previewLog += d.toString(); });
  preview.stderr.on('data', d => { previewLog += d.toString(); });

  let exited = false;
  preview.on('exit', () => { exited = true; });

  // Cada arnés deriva su `--user-data-dir` del puerto CDP aleatorio, y los perfiles
  // nunca se borraban: al repetirse un puerto, Chrome reusaba un perfil con
  // `appsheet_clone_*` de una corrida anterior. Eso rompía justo los arneses que exigen
  // un arranque limpio (demoentrycheck) o un dataset recién sembrado (detailcheck), de
  // forma intermitente. Aislar TMPDIR por arnés le da un perfil nuevo sin tocar los 27
  // arneses: todos ya heredan `env: process.env`.
  const profileTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-profile-'));

  const killAll = code => {
    try { preview.kill('SIGKILL'); } catch (e) {}
    // Chrome puede seguir escribiendo en el perfil recién creado: el borrado es
    // best-effort y nunca debe cambiar el código de salida de la puerta.
    try { fs.rmSync(profileTmp, { recursive: true, force: true }); } catch (e) {}
    process.exit(code);
  };

  // Espera a que el preview acepte conexiones; si no, no tiene sentido seguir.
  let up = false;
  for (let i = 0; i < 90 && !exited; i++) {
    try { await get(BASE); up = true; break; } catch (e) { await sleep(500); }
  }
  if (!up) {
    console.error(`El preview no respondio en ${BASE}${exited ? ' (el proceso termino)' : ''}`);
    if (previewLog.trim()) console.error('--- salida del preview ---\n' + previewLog.trim());
    killAll(1);
  }

  const failed = [];
  // Backend falso para el arnes de modo generico: se levanta una sola vez aqui, no
  // dentro del arnes, para no acoplar cada prueba a su propio servidor.
  const fakeBackend = spawn(process.execPath, [path.join(__dirname, 'fake-backend.cjs'), String(FAKE_BACKEND_PORT)],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
  // Espera a que el backend falso acepte conexiones antes de correr los arneses.
  let fakeUp = false;
  for (let i = 0; i < 40; i++) {
    try { await get(`http://127.0.0.1:${FAKE_BACKEND_PORT}/`); fakeUp = true; break; } catch (e) { await sleep(250); }
  }
  // Si el puerto estaba ocupado, el backend falso no escucha y los arneses que lo
  // necesitan fallan de forma críptica. Mejor abortar aquí con la causa explícita.
  if (!fakeUp) {
    console.error(`El backend falso no respondio en http://127.0.0.1:${FAKE_BACKEND_PORT}/ (¿puerto ocupado?)`);
    try { fakeBackend.kill('SIGKILL'); } catch (e) {}
    killAll(1);
  }
  // Un arnés puede fallar de forma intermitente por un perfil de Chrome sucio (ver
  // abajo): un único reintento evita el falso rojo sin tapar un fallo real, que vuelve a
  // fallar. E2E_RETRIES=0 desactiva el reintento.
  const maxRetries = process.env.E2E_RETRIES === undefined ? 1 : Number(process.env.E2E_RETRIES);
  const runHarness = h => {
    const args = [path.join(__dirname, h), BASE];
    if (NEED_FAKE_BACKEND.has(h)) args.push(String(FAKE_BACKEND_PORT));
    return spawnSync(process.execPath, args,
      { cwd: ROOT, stdio: 'inherit', timeout: 180000, env: { ...process.env, TMPDIR: profileTmp } });
  };

  for (const h of HARNESSES) {
    const t0 = Date.now();
    let out = runHarness(h);
    if (out.status !== 0 && maxRetries > 0) {
      console.log(`     ${h} falló; reintentando tras liberar recursos...`);
      await sleep(3000);
      out = runHarness(h);
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const ok = out.status === 0;
    console.log(`${ok ? 'OK   ' : 'FALLO'} ${h} (${secs}s)`);
    if (!ok) failed.push(h);
  }

  console.log('\n========================================');
  console.log(failed.length === 0
    ? `E2E: ${HARNESSES.length} arneses OK`
    : `E2E: ${failed.length} FALLARON -> ${failed.join(', ')}`);
  console.log('========================================');
  try { fakeBackend.kill('SIGKILL'); } catch (e) {}
  killAll(failed.length === 0 ? 0 : 1);
})().catch(e => { console.error('Fallo del runner E2E:', e.message); process.exit(1); });
