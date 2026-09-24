/**
 * Sonda temporal: master-detail estilo AppSheet en ItemDetailDrawer.
 *
 * Verifica en la app REAL (sin instrumentar el código):
 *   1. Escritorio: al abrir el detalle, la tabla sigue interactiva (no hay backdrop
 *      que cubra la pantalla) y sigue en el flujo (no es fixed).
 *   2. Escritorio: al hacer clic en OTRA fila con el panel abierto, el panel NO se
 *      cierra y actualiza su contenido al nuevo registro.
 *   3. Escritorio: el panel divide la pantalla (ocupa ancho propio junto a la tabla).
 *   4. Movil: conserva el overlay con backdrop (no divide, no cabe).
 *
 * Uso: node detailcheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9850 + Math.floor(Math.random() * 60);
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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/detail-' + port, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch (e) {} process.exit(c); };

  let ok = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); ok = true; break; } catch (e) { await sleep(250); } }
  if (!ok) return die(1);

  const t = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pend = new Map();
  const consoleErrors = [];
  ws.onmessage = m => {
    const msg = JSON.parse(m.data);
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params?.exceptionDetails?.exception?.description?.slice(0, 200) || 'excepcion');
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push((msg.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200));
    if (msg.id && pend.has(msg.id)) { const { res, rej } = pend.get(msg.id); pend.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev2 = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  await send('Page.navigate', { url: URL_APP });

  const READY = `document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`;
  let mounted = false;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!${READY}`)) { mounted = true; break; } await sleep(250); }
  if (!mounted) return die(1);
  await sleep(2500);

  const results = [];
  const push = (paso, ok, detalle) => { results.push({ paso, ok, detalle }); console.log(`${ok ? 'OK   ' : 'FALLO'} ${paso}${detalle !== undefined ? '  -> ' + JSON.stringify(detalle) : ''}`); };

  // Localizar filas de datos de la tabla principal.
  const filaSelector = `tbody tr[class*="group"], tbody tr`;
  const nFilas = await ev2(`document.querySelectorAll('${filaSelector}').length`);
  push('la tabla tiene filas', nFilas > 2, nFilas);

  // Clic en la primera fila -> abre el detalle.
  await ev2(`(() => { const r = document.querySelectorAll('${filaSelector}')[1]; if (r) r.click(); })()`);
  await sleep(700);

  // El panel de detalle: contiene el rotulo "SKU:" y boton "Ticket Barra".
  // El panel se localiza por su estructura y el rotulo SKU, no por el texto de un boton
  // (los botones del header pasaron a icono para ganar espacio vertical).
  const panelSel = `[...document.querySelectorAll('div')].find(d => d.className && /shadow-2xl|flex-col/.test(d.className) && /SKU:/.test(d.textContent || '') && [...d.querySelectorAll('button')].some(b => /c[oó]digo de barras/i.test(b.title || '')))`;
  // El nodo raiz del drawer: el ancestro con overlay/clase inset-0 que contiene el panel.
  const rootSel = `[...document.querySelectorAll('div[class*="inset-0"]')].find(d => /SKU:/.test(d.textContent || '') && [...d.querySelectorAll('button')].some(b => /c[oó]digo de barras/i.test(b.title || '')))`;
  const abrio = await ev2(`!!${panelSel}`);
  push('1. el detalle se abre al hacer clic en la fila', abrio === true, abrio);
  if (!abrio) return die(1);

  // 1. Escritorio: el panel no es fixed y no hay backdrop bloqueante.
  const estiloPanel = await ev2(`(() => {
    const raiz = ${rootSel};
    const cs = getComputedStyle(raiz);
    return { position: cs.position, backdrop: cs.backdropFilter, ancho: Math.round(raiz.getBoundingClientRect().width) };
  })()`);
  push('2. en escritorio el panel esta en flujo (no fixed)', estiloPanel.position === 'static', estiloPanel);
  push('3. en escritorio el panel tiene ancho propio junto a la tabla', estiloPanel.ancho > 200 && estiloPanel.ancho < 900, estiloPanel.ancho);

  // 1b. La tabla sigue interactiva: se puede hacer clic en otra fila y el evento llega.
  const skuAntes = await ev2(`(() => { const p = ${panelSel}; const m = (p.textContent||'').match(/SKU:\\s*([^\\s]+)/); return m ? m[1] : null; })()`);

  // Clic en OTRA fila (la 3a) SIN cerrar el panel.
  const otra = await ev2(`(() => {
    const filas = document.querySelectorAll('${filaSelector}');
    const r = filas[3];
    if (!r) return null;
    const txt = (r.textContent || '').match(/SKU-[0-9]+/);
    r.click();
    return txt ? txt[0] : 'clic';
  })()`);
  await sleep(700);

  const sigueAbierto = await ev2(`!!${panelSel}`);
  push('4. el panel sigue abierto tras clicar otra fila (tabla viva)', sigueAbierto === true, sigueAbierto);

  const skuDespues = await ev2(`(() => { const p = ${panelSel}; const m = (p.textContent||'').match(/SKU:\\s*([^\\s]+)/); return m ? m[1] : null; })()`);
  push('5. el detalle se actualiza al nuevo registro sin cerrarse', !!skuDespues && skuDespues !== skuAntes, { antes: skuAntes, despues: skuDespues, clic: otra });

  // 5. La fila activa se resalta para saber que registro alimenta el panel (escritorio).
  const resaltada = await ev2(`(() => {
    const filas = [...document.querySelectorAll('${filaSelector}')];
    return filas.filter(f => /ring-1/.test(f.className || '')).length;
  })()`);
  push('6. la fila activa se resalta (exactamente 1)', resaltada === 1, resaltada);

  // 4. Movil: overlay con backdrop.
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  const estiloMovil = await ev2(`(() => {
    const raiz = ${rootSel};
    const cs = getComputedStyle(raiz);
    return { position: cs.position, backdrop: cs.backdropFilter };
  })()`);
  push('7. en movil conserva el overlay (fixed + backdrop)', estiloMovil.position === 'fixed' && estiloMovil.backdrop !== 'none', estiloMovil);

  // 9-12. Organizacion interna del detalle: lo operativo primero, referencia plegada,
  // etiquetas legibles y sin acciones duplicadas. Se abre todo para medirlo.
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await ev2(`[...document.querySelectorAll('button')].forEach(b => { if (/Datos del Registro|C[oó]digo de Barras|Ref: Cat/.test(b.textContent || '')) b.click(); })`);
  await sleep(600);

  const orden = await ev2(`(() => {
    const body = [...document.querySelectorAll('[class*="overflow-y-auto"]')].find(b => /Datos del Registro|Vencimientos|Incidencias/.test(b.textContent || ''));
    if (!body) return null;
    const texto = (body.textContent || '');
    return { venc: texto.indexOf('Vencimientos ('), incid: texto.indexOf('Incidencias & FRC ('), datos: texto.indexOf('Datos del Registro (') };
  })()`);
  push('9. lo operativo (vencimientos/incidencias) precede a los datos del registro',
    !!orden && orden.venc > -1 && orden.incid > -1 && orden.datos > -1 && orden.venc < orden.datos && orden.incid < orden.datos, orden);

  const etiquetas = await ev2(`(() => {
    const body = [...document.querySelectorAll('[class*="overflow-y-auto"]')].find(b => /Datos del Registro/.test(b.textContent || ''));
    if (!body) return null;
    const spans = [...body.querySelectorAll('span')].filter(s => (s.className || '').includes('uppercase') && (s.className || '').includes('text-[10px]'));
    return [...new Set(spans.map(s => (s.textContent || '').trim()))].filter(Boolean);
  })()`);
  const crudas = (etiquetas || []).filter(t => /^[A-Z0-9_]+$/.test(t) && t.length > 3);
  push('10. los campos se muestran con etiqueta legible, no con la clave cruda',
    Array.isArray(etiquetas) && etiquetas.includes('Fecha Vencimiento') && crudas.length === 0, { etiquetas, crudas });

  const duplicados = await ev2(`(() => {
    const raiz = ${rootSel};
    if (!raiz) return null;
    const etiquetas = [...raiz.querySelectorAll('button')].map(b => (b.textContent || '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
    return etiquetas.filter((b, i) => etiquetas.indexOf(b) !== i);
  })()`);
  push('11. no hay acciones duplicadas en el panel', Array.isArray(duplicados) && duplicados.length === 0, duplicados);

  const monetario = await ev2(`(() => {
    const raiz = ${rootSel};
    if (!raiz) return null;
    const texto = raiz.textContent || '';
    return /precio|costo|margen|valorizado|utilidad|\\$\\s*[0-9]/i.test(texto);
  })()`);
  push('12. sin metricas monetarias en el panel', monetario === false, monetario);

  push('8. sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3));

  const fallaron = results.filter(r => !r.ok).length;
  console.log(`\nRESULTADO: ${results.length - fallaron}/${results.length} OK`);
  return die(fallaron === 0 ? 0 : 1);
})();
