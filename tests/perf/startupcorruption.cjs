/**
 * Verificacion funcional de la puerta de arranque (Fase 4).
 *
 * Siembra localStorage con los valores corruptos que antes tumbaban o envenenaban
 * el arranque y comprueba que la tabla renderiza con datos validos:
 *   - SHEET_CONFIG = "null"  -> antes quedaba sheetConfig = null y reventaba.
 *   - TABLE_DENSITY = "gigante" -> antes se aceptaba y daba una densidad invalida.
 *   - HIDDEN_SLICE_IDS = "vencidos" (string) -> antes se desparramaba en caracteres.
 *   - ZEN_MODE = "null" -> antes isZenMode quedaba null.
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const port = 9500 + Math.floor(Math.random() * 90);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpReq(method, u) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: u, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}

(async () => {
  const chrome = spawn('/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+port,'--user-data-dir='+os.tmpdir()+'/sc-'+port,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch(e){} process.exit(c); };
  let ok = false;
  for (let i = 0; i < 60; i++) { try { await httpReq('GET','/json/version'); ok = true; break; } catch(e){ await sleep(250); } }
  if (!ok) return die(1);

  const target = JSON.parse(await httpReq('PUT','/json/new?about:blank'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const {res,rej}=pend.get(m.id); pend.delete(m.id); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); } };
  const send = (method, params={}) => new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej}); ws.send(JSON.stringify({id:i,method,params})); });
  const ev = async e => { const r = await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };

  await send('Page.enable'); await send('Runtime.enable');
  // Errores de consola / excepciones no capturadas cuentan como fallo de arranque.
  const errors = [];
  ws.addEventListener('message', raw => {
    const m = JSON.parse(raw.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || 'excepcion');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args||[]).map(a=>a.value||a.description).join(' '));
  });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname,'seed.js'),'utf8') });
  // Sembrar corrupcion ANTES de que arranque React, sobre el seed que ya trae datos.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem('appsheet_clone_config', 'null');
      localStorage.setItem('app_table_density', 'gigante');
      localStorage.setItem('appsheet_hidden_slice_ids', JSON.stringify('vencidos'));
      localStorage.setItem('app_zen_mode', 'null');
    } catch(e){}
  ` });
  await send('Page.navigate', { url: process.argv[2] });

  let rows = 0;
  for (let i = 0; i < 100; i++) {
    rows = await ev(`document.querySelectorAll('[data-index]').length`);
    if (rows > 0) break;
    await sleep(250);
  }
  await sleep(800);

  const finalRows = await ev(`document.querySelectorAll('[data-index]').length`);
  const relevantErrors = errors.filter(e => !/favicon|ResizeObserver|DevTools/i.test(e));
  const passed = finalRows > 0 && relevantErrors.length === 0;

  console.log(JSON.stringify({
    filasRenderizadas: finalRows,
    erroresDeArranque: relevantErrors,
    veredicto: passed
      ? 'OK: la app arranca y renderiza filas pese a localStorage corrupto en las claves validables.'
      : 'FALLO: el arranque no tolero la corrupcion.'
  }, null, 2));

  try { ws.close(); } catch(e){}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });