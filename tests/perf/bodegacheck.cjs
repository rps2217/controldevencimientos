/**
 * Fase 7 paso 3b — arnes DISCRIMINANTE del modulo de vencimientos por capacidad.
 *
 * El paso 2 logro que una hoja no canonica CON columnas de vencimiento (aqui
 * "Bodega_Sur") reciba los slices de vencimiento. Pero el resto del modulo de
 * dominio (columna de estado, tarjetas del Radar PM, formulario de retiro) seguia
 * cableado a `activeView === 'main'`: la hoja contaba "Vencidos" pero no dejaba
 * verlos ni filtrarlos. Este arnes separa los dos casos:
 *
 *   - Bodega_Sur (con FECHA VTO): DEBE ofrecer el modulo de vencimientos.
 *   - Clientes   (sin dominio):    NO DEBE ofrecerlo.
 *
 * Si solo se midiera uno, un gate "siempre visible" o "siempre oculto" pasaria.
 * El par es lo que lo hace discriminante.
 *
 * Uso: node bodegacheck.cjs <url> <puerto-backend-falso>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

const port = 9600 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];
const FAKE_PORT = Number(process.argv[3] || 9100);

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/bodega-' + port, 'about:blank',
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
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params?.exceptionDetails?.exception?.description?.slice(0, 200) || 'excepcion');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200));
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev2 = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  const seed = `(function () {
    try {
      localStorage.setItem('appsheet_clone_scriptUrl', 'http://127.0.0.1:${FAKE_PORT}/exec');
      localStorage.setItem('appsheet_clone_securityToken', '');
      localStorage.setItem('appsheet_clone_config', JSON.stringify({ main: 'Vencimientos_Inventario' }));
    } catch (e) {}
  })();`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: seed });
  await send('Page.navigate', { url: URL_APP });

  const TRIGGER = `document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`;
  let mounted = false;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!${TRIGGER}`)) { mounted = true; break; } await sleep(250); }
  if (!mounted) return die(1);
  await sleep(2500);

  const results = [];
  const push = (paso, ok, detalle) => results.push({ paso, ok, detalle });
  const boton = nombre => `[...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(nombre)} || (x.getAttribute('title') || '') === ${JSON.stringify(nombre)})`;

  // Señales del modulo de dominio de vencimientos que antes solo salian en `main`.
  // La columna se mide como texto visible (el CSS la muestra en MAYUSCULAS, de ahi
  // el flag `i`). Las tarjetas del Radar PM NO se miden por su titulo textual: el
  // chip de slice "Radar PM (Drenaje)" contiene esa cadena y daria un falso positivo
  // en cualquier hoja. Se cuentan los botones-filtro reales del radar.
  const SENALES = `{
    colEstado: /Estado \\/ Radar PM/i.test(document.body.innerText || ''),
    radarPM: document.querySelectorAll('button[title^="Clic: Filtrar"]').length >= 5,
    chipCanje: /Canje Proveedor/i.test(document.body.innerText || '')
  }`;

  // El panel de tarjetas/filtros arranca OCULTO (areFiltersVisible=false). Sin abrirlo
  // el Radar PM nunca se monta y cualquier asercion mediria un falso positivo.
  const abrirPanelFiltros = async () => {
    await ev2(`(() => { const t = document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]'); if (t) t.click(); })()`);
    await sleep(1200);
    await ev2(`(() => { const s = [...document.querySelectorAll('span')].find(x => (x.textContent || '').trim() === 'Mostrar Tarjetas KPI'); if (s) { const b = (s.closest('div') || {}).querySelector && s.closest('div').querySelector('button'); if (b) b.click(); } })()`);
    await sleep(1500);
  };

  // 1. Bodega_Sur: hoja no canonica CON columnas de vencimiento.
  const bodega = boton('Bodega_Sur');
  const enOtras = await ev2(`!!(${bodega})`);
  push('"Bodega_Sur" aparece en Otras Pestanas', enOtras === true, enOtras);
  await ev2(`(() => { const b = ${bodega}; if (b) b.click(); })()`);
  await sleep(3500);
  await abrirPanelFiltros();

  const cargaBodega = await ev2(`(() => { const t = document.body.innerText || ''; return { tieneFila: /Producto bodega sur/.test(t), sku: /S-2000/.test(t) }; })()`);
  push('"Bodega_Sur" carga sus filas', !!cargaBodega && cargaBodega.tieneFila && cargaBodega.sku, cargaBodega);

  const sensBodega = await ev2(`(${SENALES})`);
  push('"Bodega_Sur" muestra la columna de estado del Radar PM',
    !!sensBodega && sensBodega.colEstado, sensBodega);
  push('"Bodega_Sur" muestra las tarjetas del Radar PM (Drenaje)',
    !!sensBodega && sensBodega.radarPM, sensBodega);
  push('"Bodega_Sur" muestra el slice de Canje Proveedor',
    !!sensBodega && sensBodega.chipCanje, sensBodega);

  // 1b. El filtro del Radar PM debe estar CABLEADO, no solo visible. En Bodega_Sur
  // "Canje Proveedor" cuenta 0, asi que pulsarlo debe vaciar la tabla; si el hook
  // siguiera gateado por `activeView === 'main'`, la tarjeta quedaria muerta y las
  // filas seguirian ahi.
  const tarjetaCanje = `[...document.querySelectorAll('button')].find(x => (x.getAttribute('title') || '').startsWith('Clic: Filtrar Canje Proveedor'))`;
  const hayTarjetaCanje = await ev2(`!!(${tarjetaCanje})`);
  await ev2(`(() => { const b = ${tarjetaCanje}; if (b) b.click(); })()`);
  await sleep(1500);
  const trasFiltro = await ev2(`(() => { const t = document.body.innerText || ''; return { filas: /Producto bodega sur/.test(t), sKuVacias: /S-2000/.test(t) }; })()`);
  push('"Bodega_Sur" filtra de verdad al pulsar el Radar PM (Canje=0 vacia la tabla)',
    hayTarjetaCanje === true && !!trasFiltro && !trasFiltro.filas && !trasFiltro.sKuVacias,
    { hayTarjetaCanje, trasFiltro });

  // 2. Clientes: hoja SIN dominio. Nada de lo anterior debe aparecer.
  const clientes = boton('Clientes');
  await ev2(`(() => { const b = ${clientes}; if (b) b.click(); })()`);
  await sleep(3500);
  const sensClientes = await ev2(`(${SENALES})`);
  push('"Clientes" NO muestra el modulo de vencimientos (par discriminante)',
    !!sensClientes && !sensClientes.colEstado && !sensClientes.radarPM && !sensClientes.chipCanje, sensClientes);

  const passed = results.every(r => r.ok);
  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
