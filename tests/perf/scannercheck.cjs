/**
 * Verifica el ciclo de vida del lector de cámara tras unificarlo en useBarcodeScanner.
 *
 * Antes del corte la ruta de cámara no tenía ninguna guardia: los E2E no podían
 * abrir un dispositivo. Aquí se lanza Chrome con un dispositivo falso
 * (--use-fake-device-for-media-stream), así que la cámara arranca de verdad y el
 * hook recorre su secuencia real: elegir cámara trasera, iniciar con los formatos
 * de bodega, quedar en RUNNING y liberar al cerrar.
 *
 * Observables (DOM real, sin instrumentar):
 *   1. El botón de escaneo abre el modal.
 *   2. Con cámara disponible, el video arranca (estado RUNNING, sin overlay de carga).
 *   3. Cerrar y volver a abrir reinicia la cámara (prueba stop -> start, sin fuga).
 *   4. No se registra ningún error de consola durante el ciclo.
 *
 * Uso: node scannercheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9810 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2] || 'http://127.0.0.1:4173/';

function req(method, p) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}

(async () => {
  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--window-size=1600,1000',
    // Cámara falsa: sin esto no hay dispositivo y el ciclo nunca arranca.
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/scanner-' + port, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch (e) {} process.exit(c); };

  let up = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); up = true; break; } catch (e) { await sleep(250); } }
  if (!up) return die(1);

  const t = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  const consoleErrors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push((m.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
    }
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev2 = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };

  const steps = [];
  const check = (paso, ok, detail) => steps.push({ paso, ok: !!ok, detail });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Browser.grantPermissions', { permissions: ['videoCapture'] }).catch(() => {});
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  await send('Page.navigate', { url: URL_APP });

  const openBtn = `[...document.querySelectorAll('button')].find(b=>b.getAttribute('title')==='Escanear c\\u00f3digo de barras o QR con la c\\u00e1mara')`;
  let mounted = false;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!(${openBtn})`)) { mounted = true; break; } await sleep(250); }
  if (!mounted) return die(1);
  await sleep(1500);

  const opened = await ev2(`(() => { const b=${openBtn}; b.click(); return true; })()`);
  await sleep(800);
  const modalVisible = await ev2(`[...document.querySelectorAll('h3')].some(h=>h.textContent.includes('Esc\u00e1ner de C\u00f3digo de Barras'))`);
  check('el botón de escaneo abre el modal', opened && modalVisible, { opened, modalVisible });

  // RUNNING: hay un <video> y ya no está el overlay "Iniciando cámara..."
  let running = null;
  for (let i = 0; i < 40; i++) {
    running = await ev2(`(() => {
      const vid=document.querySelector('#reader-container video');
      const loading=[...document.querySelectorAll('span')].some(s=>s.textContent.includes('Iniciando c\u00e1mara'));
      return { video: !!vid, loading };
    })()`);
    if (running.video && !running.loading) break;
    await sleep(300);
  }
  check('la cámara arranca (RUNNING) sin overlay de carga', running && running.video && !running.loading, running);

  // Cerrar y reabrir: prueba stop -> start del hook, sin cámara colgada.
  await ev2(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Cerrar Esc\u00e1ner'); if(b) b.click(); return true; })()`);
  await sleep(700);
  const closed = await ev2(`![...document.querySelectorAll('h3')].some(h=>h.textContent.includes('Esc\u00e1ner de C\u00f3digo de Barras'))`);
  check('cerrar el modal lo desmonta', closed, { closed });

  await ev2(`(() => { const b=${openBtn}; b.click(); return true; })()`);
  let reopened = null;
  for (let i = 0; i < 40; i++) {
    reopened = await ev2(`(() => {
      const vid=document.querySelector('#reader-container video');
      const loading=[...document.querySelectorAll('span')].some(s=>s.textContent.includes('Iniciando c\u00e1mara'));
      return { video: !!vid, loading };
    })()`);
    if (reopened.video && !reopened.loading) break;
    await sleep(300);
  }
  check('reabrir reinicia la cámara (stop -> start sin fuga)', reopened && reopened.video && !reopened.loading, reopened);

  const relevantErrors = consoleErrors.filter(e => !/favicon|Download the React DevTools|deprecat/i.test(e));
  check('sin errores de consola durante el ciclo', relevantErrors.length === 0, relevantErrors.slice(0, 3));

  ws.close();
  console.log(JSON.stringify(steps, null, 2));
  const failed = steps.filter(s => !s.ok);
  console.log(failed.length ? `RESULTADO: FALLAN ${failed.length}` : 'RESULTADO: OK');
  die(failed.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
