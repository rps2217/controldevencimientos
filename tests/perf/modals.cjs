/**
 * Mide el coste de abrir un modal de UI pura en Chromium real (CDP), sin
 * instrumentar el codigo de la app.
 *
 * Uso: node modals.cjs <url>
 *
 * Contexto (Fase 1.3): los flags de modales vivian en el value del contexto del
 * dashboard. Abrir "Configuracion global" costaba 2 renders del cuerpo del
 * dashboard (2.270 lineas), 2 de InventoryTable y una long task de ~54 ms,
 * medidos con contadores temporales dentro de los componentes. Tras sacar los
 * flags a ModalsContext, el mismo gesto no produce long tasks y el dashboard no
 * re-renderiza.
 *
 * El hook por fibra atribuye mal los bailouts (ver ROADMAP), asi que este script
 * solo reporta senales honestas: commits (reales) y long tasks (trabajo de hilo
 * principal). Ademas confirma que el modal efectivamente se abre leyendo su
 * encabezado visible, para no medir un gesto que no hizo nada.
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9600 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/modal-' + port, 'about:blank',
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
  const ev2 = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'hook.js'), 'utf8') });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  await send('Page.navigate', { url: URL_APP });
  for (let i = 0; i < 120; i++) { if (await ev2(`!!document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`)) break; await sleep(250); }
  await sleep(2500);

  async function clickButton(re) {
    const box = await ev2(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => new RegExp(${JSON.stringify(re)}).test((x.getAttribute('title') || '') + ' ' + (x.textContent || '')));
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) return false;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    }
    return true;
  }

  async function measure(name, clickExpr) {
    await ev2(`window.__probe && window.__probe.reset();
      window.__lt = []; window.__ltObs && window.__ltObs.disconnect();
      try { window.__ltObs = new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(e.duration); }); window.__ltObs.observe({ entryTypes: ['longtask'] }); } catch (e) {}`);
    const interacted = await clickExpr();
    await sleep(600);
    const snap = JSON.parse(await ev2(`window.__probe ? JSON.stringify(window.__probe.snapshot()) : '{}'`));
    const longtasks = JSON.parse(await ev2('JSON.stringify(window.__lt || [])'));
    const heading = await ev2(`[...document.querySelectorAll('h2,h3')].filter(x => x.offsetParent !== null).map(x => (x.textContent || '').trim())[0] || ''`);
    return { name, interacted, commits: snap.commits, commitSpanMs: snap.commitSpanMs, longtasksMs: longtasks, heading };
  }

  const results = [
    await measure('abrir Configuracion global', () => clickButton('Configuraci')),
  ];
  await ev2(`(() => { const b = [...document.querySelectorAll('button')].find(x => /cerrar|close/i.test((x.getAttribute('title') || '') + ' ' + (x.getAttribute('aria-label') || ''))); if (b) b.click(); })()`);
  await sleep(400);

  // "Accion PM" vive en la barra flotante, que solo se monta con filas
  // seleccionadas. Se marca "Seleccionar todos" para hacerla aparecer. Se usa
  // .click() directo: el checkbox vive bajo el encabezado sticky y el clic por
  // coordenadas no siempre aterriza en el.
  const selected = await ev2(`(() => {
    const c = [...document.querySelectorAll('input[type=checkbox]')].find(x => /Seleccionar todos/i.test(x.getAttribute('title') || ''));
    if (!c) return false;
    c.click();
    return true;
  })()`);
  await sleep(800);
  results.push(await measure('abrir Accion PM (seleccion=' + selected + ')', () => ev2(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Acción PM/.test((x.getAttribute('title') || '') + ' ' + (x.textContent || '')));
    if (!b) return false;
    b.click();
    return true;
  })()`)));

  // Cerrar el modal PM para no medir sobre una pila de modales.
  await ev2(`(() => { const b = [...document.querySelectorAll('button')].find(x => /cerrar|close/i.test((x.getAttribute('title') || '') + ' ' + (x.getAttribute('aria-label') || ''))); if (b) b.click(); })()`);
  await sleep(500);

  // Fase 1.3 (segundo corte): el gestor de Slices es UI pura; sus flags vivian
  // en useTableSlices (dentro del cuerpo del dashboard), asi que abrirlo
  // re-renderiza el dashboard entero.
  results.push(await measure('abrir Gestor de Slices', () => ev2(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Administrar vistas guardadas/i.test(x.getAttribute('title') || ''));
    if (!b) return false;
    b.click();
    return true;
  })()`)));
  // Confirmar que el gestor efectivamente monto, no solo que el clic ocurrio.
  const sliceVisible = await ev2(`(() => {
    const h = [...document.querySelectorAll('h2,h3')].map(x => (x.textContent || '').trim());
    return JSON.stringify(h.filter(Boolean));
  })()`);
  console.log('Encabezados visibles tras abrir gestor de Slices:', sliceVisible);

  console.log(JSON.stringify({ url: URL_APP, results }, null, 2));
  try { ws.close(); } catch (e) {}
  die(0);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });