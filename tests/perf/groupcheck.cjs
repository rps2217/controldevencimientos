/**
 * Verifica de punta a punta la agrupacion de filas por columna ("Vistas y Ajustes").
 *
 * Es la prueba de la promesa del bug de agrupacion: la accion del usuario en el
 * drawer debe llegar al dashboard (no caer en un no-op silencioso) y la tabla debe
 * *mostrar* la agrupacion resultante. Las pruebas unitarias montan el drawer con un
 * contexto simulado; esta sonda usa la app real, sin instrumentarla.
 *
 * Observables (todos visibles en el DOM real):
 *   1. El pie de la tabla muestra "Agrupado en N grupos (COLUMNA)".
 *   2. Aparecen cabeceras de grupo con el rotulo "COLUMNA:".
 *   3. Alternar la direccion cambia el orden de los grupos.
 *
 * Uso: node groupcheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9650 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];
const COLUMNA = 'PROVEEDOR';

function req(method, p) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}

(async () => {
  const chrome = spawn('/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--window-size=1600,1000',
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/group-' + port, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch (e) {} process.exit(c); };

  let ok = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); ok = true; break; } catch (e) { await sleep(250); } }
  if (!ok) return die(1);

  const t = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  const consoleErrors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params?.exceptionDetails?.exception?.description?.slice(0, 200) || 'excepcion');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200));
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev2 = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  await send('Page.navigate', { url: URL_APP });

  const TRIGGER = `document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`;
  let mounted = false;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!${TRIGGER}`)) { mounted = true; break; } await sleep(250); }
  if (!mounted) return die(1);
  await sleep(2500);

  const results = [];
  const push = (paso, ok, detalle) => results.push({ paso, ok, detalle });

  // Abrir el drawer "Vistas & Ajustes".
  await ev2(`(() => { const b = [...document.querySelectorAll('button')].find(x => new RegExp('Vistas & Ajustes').test(x.textContent || '')); if (b) b.click(); })()`);
  await sleep(600);

  // Localizar el select de agrupacion por la opcion "Sin agrupar".
  const SEL = `(() => {
    return [...document.querySelectorAll('select')].find(s =>
      [...s.options].some(o => /Sin agrupar/i.test(o.textContent))
    ) || null;
  })()`;

  const selectExiste = await ev2(`!!${SEL}`);
  push('el selector de agrupacion existe en el drawer', selectExiste === true, selectExiste);

  // Estado inicial: sin agrupar -> no debe haber pie de agrupacion.
  const grupoInicial = await ev2(`(() => {
    const sel = ${SEL};
    return sel ? sel.value : null;
  })()`);
  push('el selector arranca en "none"', grupoInicial === 'none', grupoInicial);

  const opciones = await ev2(`(() => { const s = ${SEL}; return s ? [...s.options].map(o => o.value) : []; })()`);
  push(`la columna ${COLUMNA} es elegible`, Array.isArray(opciones) && opciones.includes(COLUMNA), opciones?.slice(0, 8));

  // Elegir la columna. Se usa el setter nativo para que React vea el cambio.
  const eligio = await ev2(`(() => {
    const sel = ${SEL};
    if (!sel) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, ${JSON.stringify(COLUMNA)});
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  push('se pudo elegir la columna', eligio === true, eligio);
  await sleep(900);

  // Observable 1: pie de tabla con "Agrupado en N grupos (COLUMNA)".
  const pie = await ev2(`(() => {
    const el = [...document.querySelectorAll('div,span')].find(x =>
      x.offsetParent !== null && /Agrupado en \\d+ grupos/i.test(x.textContent || '') && (x.textContent || '').length < 120
    );
    return el ? el.textContent.trim() : null;
  })()`);
  push('el pie de tabla anuncia los grupos creados', !!pie && pie.includes(COLUMNA), pie);

  // Observable 2: cabeceras de grupo con el rotulo "COLUMNA:".
  const cabeceras = await ev2(`(() => {
    const rotulo = [...document.querySelectorAll('span')].filter(x =>
      x.offsetParent !== null && (x.textContent || '').trim() === ${JSON.stringify(COLUMNA + ':')}
    ).length;
    return rotulo;
  })()`);
  push('se renderizan cabeceras de grupo con el rotulo de la columna', cabeceras > 0, cabeceras);

  // La tabla esta virtualizada: solo monta la cabecera del grupo visible. El valor
  // debe leerse DENTRO de la cabecera (junto al rotulo "COLUMNA:"), no de una celda
  // suelta de una fila plana: si no, la aserción pasa aunque la agrupacion este off.
  const valores = await ev2(`(() => {
    const rotulo = [...document.querySelectorAll('span')].find(x =>
      x.offsetParent !== null && (x.textContent || '').trim() === ${JSON.stringify(COLUMNA + ':')}
    );
    if (!rotulo) return null;
    const cont = rotulo.parentElement;
    const valores = [...cont.querySelectorAll('span')].map(s => (s.textContent || '').trim())
      .filter(t => t && t !== ${JSON.stringify(COLUMNA + ':')});
    return valores;
  })()`);
  const cabeceraReal = Array.isArray(valores) && valores.some(v => /^Proveedor \d$/.test(v));
  push('la cabecera de grupo muestra un valor real de la columna', cabeceraReal, valores);

  // Observable 3: alternar direccion reordena los grupos (no es un no-op).
  const antes = JSON.stringify(valores);
  const toggle = await ev2(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Orden de grupo|Orden de grupos/i.test(x.getAttribute('title') || ''));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(900);
  const despues = await ev2(`(() => {
    return [...document.querySelectorAll('span')].filter(x =>
      x.offsetParent !== null && /^Proveedor \\d$/.test((x.textContent || '').trim())
    ).map(x => x.textContent.trim()).slice(0, 10);
  })()`);
  push('el boton de orden existe (agrupacion activa)', toggle === true, toggle);
  push('alternar la direccion reordena los grupos',
    toggle === true && JSON.stringify(despues) !== antes, { antes, despues });

  // Regresion del no-op: elegir "none" debe desactivar la agrupacion.
  await ev2(`(() => {
    const sel = ${SEL};
    if (!sel) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'none');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(900);
  const volvio = await ev2(`(() => {
    const el = [...document.querySelectorAll('div,span')].find(x =>
      x.offsetParent !== null && /Agrupado en \\d+ grupos/i.test(x.textContent || '')
    );
    return el ? el.textContent.trim() : null;
  })()`);
  push('volver a "Sin agrupar" desactiva la agrupacion', volvio === null, volvio);

  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  try { ws.close(); } catch (e) {}
  die(0);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });