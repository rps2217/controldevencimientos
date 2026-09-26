/**
 * Mide el coste de render de la lista de lecturas con volumen real de farmacia.
 *
 * Por que existe: el algoritmo de cuadratura ya se midio lineal (8.000 SKUs en
 * ~15 ms, count-scale.ts), asi que el sospechoso es el render. La lista de
 * lecturas se pinta con `.map()` sin virtualizar: si con cientos de SKUs el
 * pistoleo se siente lento, es aqui. Esta prueba mide el pintado real por lectura
 * para decidir con datos si hace falta virtualizar, en vez de reescribir por gusto.
 *
 * Uso: node count-render-cost.cjs <url> [skus]
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9760 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];
const SKUS = Number(process.argv[3] || 400);
const KEY = 'app_stock_count_sessions_v1';

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/crender-' + port, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch (e) {} process.exit(c); };

  let ok = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); ok = true; break; } catch (e) { await sleep(250); } }
  if (!ok) return die(1);

  const t = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev2 = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  // Sesion ya con SKUS lecturas: la lista se pinta completa al abrir el terminal.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      var conteos = [];
      for (var i = 0; i < ${SKUS}; i++) {
        conteos.push({
          id: 'e-' + i, sku: 'SKU-' + (2000 + i), descripcion: 'Producto conteo ' + i,
          cantidad: 1 + (i % 5), ubicacion: 'MUEBLE-' + (i % 20),
          timestamp: new Date(Date.now() - i * 1000).toISOString()
        });
      }
      localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify([{
        id: 'sess_render', nombre: 'Conteo Render', modo: 'DOCUMENT',
        requiereVencimiento: false, hojaOrigen: 'main', estado: 'IN_PROGRESS',
        fechaInicio: new Date().toISOString(), conteos: conteos, deviceId: 'render'
      }]));
    } catch (e) {}
  ` });
  await send('Page.navigate', { url: URL_APP });

  const NAV = `[...document.querySelectorAll('button')].find(b => b.getAttribute('title') === 'M\\u00f3dulo de conteo masivo de existencias f\\u00edsicas')`;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!(${NAV})`)) break; await sleep(250); }
  await sleep(1500);
  await ev2(`(() => { const b = ${NAV}; if (b) b.click(); })()`);
  for (let i = 0; i < 40; i++) { if (await ev2(`[...document.querySelectorAll('h2')].some(h => h.textContent.includes('Conteo de Existencias'))`)) break; await sleep(250); }
  await sleep(800);

  const abrioSesion = await ev2(`(() => {
    const card = [...document.querySelectorAll('div.cursor-pointer')].find(d => (d.textContent || '').includes('Conteo Render'));
    if (!card) return false; card.click(); return true;
  })()`);
  let enConteo = false;
  for (let i = 0; i < 40; i++) {
    enConteo = await ev2(`!!([...document.querySelectorAll('input')].find(i => i.offsetParent !== null && i.placeholder === 'Escanear o buscar SKU...'))`);
    if (enConteo) break;
    await sleep(250);
  }
  if (!abrioSesion || !enConteo) { console.log(JSON.stringify({ error: 'no se abrio el terminal', abrioSesion, enConteo })); return die(1); }
  await sleep(1200);

  // Cuenta los nodos de la lista de lecturas: evidencia directa de si se pinta todo.
  const nodos = await ev2(`document.querySelectorAll('div.overflow-y-auto div[class*="rounded-xl"]').length`);

  // Piso de instrumentacion DENTRO de esta pagina: dos rAF sin trabajo asociado.
  // Sin esto no se puede atribuir el coste al render: en headless el propio rAF
  // ya cuesta decenas de ms, y comparar contra cero exagera cualquier resultado.
  const pisoMuestras = [];
  for (let i = 0; i < 8; i++) {
    pisoMuestras.push(await ev2(`(async () => {
      const t0 = performance.now();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t0;
    })()`));
  }
  const pisoSorted = [...pisoMuestras].sort((a, b) => a - b);
  const pisoMediana = pisoSorted[Math.floor(pisoSorted.length / 2)];

  // Mide el pintado al registrar una lectura nueva: es la accion repetida del operario.
  const medirLectura = sku => ev2(`(async () => {
    const input = [...document.querySelectorAll('input')].find(i => i.offsetParent !== null && i.placeholder === 'Escanear o buscar SKU...');
    if (!input) return -1;
    const t0 = performance.now();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify('SKU-NUEVO')});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const form = input.closest('form');
    if (form) form.requestSubmit();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t0;
  })()`);

  const muestras = [];
  for (let i = 0; i < 12; i++) {
    const ms = await medirLectura('SKU-NUEVO-' + i);
    if (ms > 0) muestras.push(ms);
    await sleep(120);
  }

  const sorted = [...muestras].sort((a, b) => a - b);
  const mediana = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  const max = sorted[sorted.length - 1];

  console.log(JSON.stringify({
    skusEnSesion: SKUS,
    nodosLista: nodos,
    pisoDosRAF_ms: Math.round(pisoMediana),
    muestrasMs: muestras.map(x => Math.round(x)),
    medianaMs: Math.round(mediana),
    p95Ms: Math.round(p95),
    maxMs: Math.round(max),
    costoAtribuibleMs: Math.round(mediana - pisoMediana),
  }, null, 2));

  // El coste atribuible al render es lo que excede el piso de instrumentacion.
  // Comparar contra cero atribuiria al render el coste del propio rAF en headless.
  const costo = mediana - pisoMediana;
  const duele = costo > 100;
  console.log(`COSTO ATRIBUIBLE AL RENDER: ${Math.round(costo)} ms (mediana ${Math.round(mediana)} - piso ${Math.round(pisoMediana)})`);
  console.log(duele
    ? 'VEREDICTO: DUEL E - el render de la lista es el cuello de botella, virtualizar se justifica'
    : 'VEREDICTO: NO DUELE - el render esta por debajo del umbral percibido, no virtualizar por ahora');
  try { ws.close(); } catch (e) {}
  die(duele ? 1 : 0);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
