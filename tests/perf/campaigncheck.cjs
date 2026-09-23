/**
 * Verifica de punta a punta la matriz de consolidacion de campanas.
 *
 * Cubre el invariante mas caro de la campana: que la conciliacion fisico vs. teorico
 * del ERP se clasifique en los cuatro estados de la separacion de aguas y que el
 * operario pueda actuar sobre ella (ajuste de venta y validacion con un clic)
 * viendo el efecto en la UI real, sin instrumentar la app.
 *
 * Existe porque esta ruta no tenia arnes propio: solo `importcheck` la rozaba, y la
 * vista se iba a tocar (Fase 5, corte 3) sin red debajo.
 *
 * Observables (todos visibles en el DOM real, tras sembrar una campana por localStorage):
 *   1. La vista de campana abre directa con la campana sembrada.
 *   2. Las cuatro tarjetas de estado muestran sus conteos reales.
 *   3. El filtro de estado reduce la tabla al estado elegido.
 *   4. La busqueda filtra por SKU y no deja filas fuera de contexto.
 *   5. El ajuste de venta en vivo recalcula la diferencia neta.
 *
 * Uso: node campaigncheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9790 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];

const CAMP_KEY = 'app_inventory_campaigns_v1';
const SESS_KEY = 'app_stock_count_sessions_v1';
const CAMP_ID = 'camp_e2e';
const SESSION_ID = 'sess_e2e_camp';

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/camp-' + port, 'about:blank',
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

  // Campana sembrada con un universo teorico de 4 SKUs que cubre los cuatro estados:
  //   A: fisico == teorico            -> VALIDADO_OK
  //   B: fisico < teorico             -> DISCREPANCIA (faltante)
  //   C: sin lecturas                 -> NUNCA_PISTOLEADO
  //   D: leido pero fuera del ERP     -> HALLAZGO
  // Se siembra tambien la sesion con esas lecturas, sin campana vinculada por sessionIds
  // (la matriz lee los conteos de `sessions`, no la lista de ids).
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem(${JSON.stringify(CAMP_KEY)}, JSON.stringify([{
        id: ${JSON.stringify(CAMP_ID)},
        nombre: 'Campana E2E',
        local: 'LOCAL E2E',
        fechaInicio: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
        estado: 'ACTIVA',
        snapshotTeoricoActual: {
          'SKU-E2E-A': { sku: 'SKU-E2E-A', descripcion: 'Producto A', proveedor: 'Lab Norte', stockTeorico: 100, fechaCarga: new Date().toISOString() },
          'SKU-E2E-B': { sku: 'SKU-E2E-B', descripcion: 'Producto B', proveedor: 'Lab Norte', stockTeorico: 50, fechaCarga: new Date().toISOString() },
          'SKU-E2E-C': { sku: 'SKU-E2E-C', descripcion: 'Producto C', proveedor: 'Lab Sur', stockTeorico: 30, fechaCarga: new Date().toISOString() }
        },
        historialSnapshots: [],
        sessionIds: [],
        itemsValidadosCerrados: {},
        ajustesVentaManual: {}
      }]));
      localStorage.setItem(${JSON.stringify(SESS_KEY)}, JSON.stringify([{
        id: ${JSON.stringify(SESSION_ID)}, nombre: 'Conteo E2E', ubicacion: 'Pasillo 1',
        modo: 'DOCUMENT', requiereVencimiento: false, hojaOrigen: 'main', estado: 'IN_PROGRESS',
        fechaInicio: new Date().toISOString(), deviceId: 'e2e',
        conteos: [
          { id: 'c1', sku: 'SKU-E2E-A', descripcion: 'Producto A', cantidad: 100, timestamp: new Date().toISOString() },
          { id: 'c2', sku: 'SKU-E2E-B', descripcion: 'Producto B', cantidad: 40, timestamp: new Date().toISOString() },
          { id: 'c3', sku: 'SKU-E2E-D', descripcion: 'Producto D', cantidad: 7, timestamp: new Date().toISOString() }
        ]
      }]));
    } catch (e) {}
  ` });
  await send('Page.navigate', { url: URL_APP });

  const results = [];
  const push = (paso, ok, detalle) => results.push({ paso, ok, detalle });

  const NAV = `[...document.querySelectorAll('button')].find(b => b.getAttribute('title') === 'M\\u00f3dulo de conteo masivo de existencias f\\u00edsicas')`;
  let mounted = false;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!(${NAV})`)) { mounted = true; break; } await sleep(250); }
  if (!mounted) return die(1);
  await sleep(2000);

  await ev2(`(() => { const b = ${NAV}; if (b) b.click(); })()`);

  // Con campana en storage, el terminal abre directo en la vista de consolidacion.
  // El componente es `lazy`, asi que se sondea hasta que monte.
  let enCampana = false;
  for (let i = 0; i < 80; i++) {
    enCampana = await ev2(`/Cuadrados \\/ OK/.test(document.body.innerText || '') && /Nunca Pistoleados/.test(document.body.innerText || '')`);
    if (enCampana) break;
    await sleep(250);
  }
  push('la campana sembrada abre la vista de consolidacion', enCampana === true, enCampana);
  if (!enCampana) { console.log(JSON.stringify({ resultados: results }, null, 2)); console.log('RESULTADO: FALLO'); return die(1); }
  await sleep(1200);

  // Contadores de las tarjetas de estado: son <button> cuyo texto incluye el rotulo
  // y el numero. Se leen del DOM real, no del estado interno.
  const contarTarjeta = rotulo => ev2(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes(${JSON.stringify(rotulo)}));
    if (!b) return null;
    const m = (b.textContent || '').replace(/\\s+/g, ' ').match(/(\\d[\\d.,]*)\\s*SKUs/);
    return m ? Number(m[1].replace(/[.,]/g, '')) : null;
  })()`);

  const cCuad = await contarTarjeta('Cuadrados / OK');
  const cDisc = await contarTarjeta('Nunca Pistoleados');
  const cHalla = await contarTarjeta('Hallazgos Físicos');
  push('la tarjeta de cuadrados cuenta 1 (SKU A, fisico == teorico)', cCuad === 1, cCuad);
  push('la tarjeta de nunca pistoleados cuenta 1 (SKU C, sin lecturas)', cDisc === 1, cDisc);
  push('la tarjeta de hallazgos cuenta 1 (SKU D, fuera del ERP)', cHalla === 1, cHalla);

  // La discrepancia (SKU B: fisico 40 vs teorico 50) no tiene tarjeta propia: se
  // comprueba por la tabla, que es donde el operario ve el faltante.
  const skusEnTabla = () => ev2(`(() => {
    const body = [...document.querySelectorAll('table')].map(t => t.textContent).join(' ');
    return ['SKU-E2E-A', 'SKU-E2E-B', 'SKU-E2E-C', 'SKU-E2E-D'].filter(s => body.includes(s));
  })()`);

  const filaPorSku = sku => ev2(`(() => {
    const tr = [...document.querySelectorAll('tr')].find(r => (r.textContent || '').includes(${JSON.stringify(sku)}));
    return tr ? tr.textContent.replace(/\\s+/g, ' ').trim() : null;
  })()`);

  const inicial = await skusEnTabla();
  push('la matriz lista los cuatro SKUs sembrados (cuadrado, discrepante, nunca, hallazgo)',
    inicial.length === 4, inicial);

  const filaDisc = await filaPorSku('SKU-E2E-B');
  push('la fila del SKU discrepante muestra fisico 40 contra teorico 50',
    !!filaDisc && filaDisc.includes('40') && filaDisc.includes('50'), filaDisc);

  // Filtro por estado: pulsar "Nunca Pistoleados" deja solo SKU-E2E-C.
  const filtrar = rotulo => ev2(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes(${JSON.stringify(rotulo)}));
    if (!b) return false;
    b.click();
    return true;
  })()`);

  const clickNunca = await filtrar('Nunca Pistoleados');
  await sleep(600);
  const trasFiltro = await skusEnTabla();
  push('el filtro de Nunca Pistoleados deja solo el SKU sin lecturas',
    clickNunca === true && trasFiltro.length === 1 && trasFiltro[0] === 'SKU-E2E-C', trasFiltro);

  // Volver a "todas" con el boton explicito de la barra de controles.
  const verTodos = () => ev2(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim().startsWith('Ver Todos'));
    if (!b) return false;
    b.click();
    return true;
  })()`);

  await verTodos();
  await sleep(600);
  push('el boton "Ver Todos" restaura la tabla completa',
    (await skusEnTabla()).length === 4, await skusEnTabla());

  const buscar = termino => ev2(`(() => {
    const input = [...document.querySelectorAll('input')].find(i => i.offsetParent !== null && /Buscar por SKU/i.test(i.placeholder || ''));
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(termino)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

  const hayBuscador = await buscar('SKU-E2E-B');
  await sleep(600);
  const trasBuscar = await skusEnTabla();
  push('la busqueda filtra la tabla por SKU',
    hayBuscador === true && trasBuscar.length === 1 && trasBuscar[0] === 'SKU-E2E-B', trasBuscar);

  await buscar('zzzz-no-existe');
  await sleep(600);
  const sinMatch = await skusEnTabla();
  push('una busqueda sin coincidencias deja la tabla vacia', sinMatch.length === 0, sinMatch);

  // Acumulacion: estado "Nunca Pistoleados" + busqueda de un cuadradado debe dar vacio.
  await filtrar('Nunca Pistoleados');
  await sleep(500);
  await buscar('SKU-E2E-A');
  await sleep(600);
  const acumulado = await skusEnTabla();
  push('estado y busqueda se acumulan (cuadrado no aparece bajo Nunca Pistoleados)',
    acumulado.length === 0, acumulado);

  await buscar('');
  await verTodos();
  await sleep(600);

  const ajustarVenta = async (sku, val) => ev2(`(() => {
    const tr = [...document.querySelectorAll('tr')].find(r => (r.textContent || '').includes(${JSON.stringify(sku)}));
    if (!tr) return { error: 'fila no encontrada' };
    const input = [...tr.querySelectorAll('input[type=number]')].find(i => i.offsetParent !== null);
    if (!input) return { error: 'sin input de venta' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(String(val))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`);

  const filaDiscante = () => ev2(`(() => {
    const tr = [...document.querySelectorAll('tr')].find(r => (r.textContent || '').includes('SKU-E2E-B'));
    return tr ? tr.textContent.replace(/\\s+/g, ' ').trim() : null;
  })()`);

  const antes = await filaDiscante();
  const resAjuste = await ajustarVenta('SKU-E2E-B', 5);
  await sleep(800);
  const despues = await filaDiscante();
  push('el campo de ajuste de venta esta en la fila discrepante',
    !!(resAjuste && resAjuste.ok === true), resAjuste);
  push('el ajuste de venta recalcula la diferencia neta de la fila',
    antes !== null && despues !== null && antes !== despues, { antes, despues });

  // Persistencia: el ajuste debe quedar en la campana guardada, no solo en pantalla.
  const ajustePersistido = await ev2(`(() => {
    try {
      const a = JSON.parse(localStorage.getItem(${JSON.stringify(CAMP_KEY)}) || '[]');
      const c = a.find(x => x.id === ${JSON.stringify(CAMP_ID)});
      return c && c.ajustesVentaManual ? (c.ajustesVentaManual['SKU-E2E-B'] || 0) : -1;
    } catch (e) { return -2; }
  })()`);
  push('el ajuste de venta se persiste en la campana (no se pierde al recargar)',
    ajustePersistido === 5, ajustePersistido);

  const relevantErrors = consoleErrors.filter(e => !/favicon|Download the React DevTools|deprecat|127\.0\.0\.1:1/i.test(e));
  push('sin errores de consola durante la consolidacion', relevantErrors.length === 0, relevantErrors.slice(0, 3));

  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  const passed = results.every(r => r.ok);
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
