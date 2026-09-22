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
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.E2E_PORT || 4173);
const BASE = `http://127.0.0.1:${PORT}/`;
const HARNESSES = [
  'corruptcheck.cjs',
  'startupcorruption.cjs',
  'offlinecheck.cjs',
  'mutcheck.cjs',
  'importcheck.cjs',
  'groupcheck.cjs',
  'searchcheck.cjs',
  'bulkcheck.cjs',
];
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

  const preview = spawn('npm', ['run', 'preview', '--', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
  const killAll = code => { try { preview.kill('SIGKILL'); } catch (e) {} process.exit(code); };

  // Espera a que el preview acepte conexiones; si no, no tiene sentido seguir.
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { await get(BASE); up = true; break; } catch (e) { await sleep(500); }
  }
  if (!up) { console.error(`El preview no respondio en ${BASE}`); killAll(1); }

  const failed = [];
  for (const h of HARNESSES) {
    const t0 = Date.now();
    const out = spawnSync(process.execPath, [path.join(__dirname, h), BASE],
      { cwd: ROOT, stdio: 'inherit', timeout: 180000, env: process.env });
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
  killAll(failed.length === 0 ? 0 : 1);
})().catch(e => { console.error('Fallo del runner E2E:', e.message); process.exit(1); });
