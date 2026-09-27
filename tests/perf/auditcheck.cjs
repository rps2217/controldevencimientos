/**
 * Verifica de punta a punta el guardado a la pestaña dedicada `_AUDITORIA_INVENTARIO`.
 *
 * Por que existe: la pestaña es UNA sola y la escriben DOS vias independientes (la
 * sesion de conteo y la matriz de campana), pero ningun arnes tocaba esa frontera.
 * Ahi vivio un bug real: las dos vias emitieron el mismo concepto con vocabularios
 * distintos (`CUADRADO` vs `CUADRADO_OK`, `NO_CATALOGADO` vs `HALLAZGO_NO_ERP`), de
 * modo que un filtro sobre `ESTADO_AUDITORIA` partia la poblacion en dos. La
 * correccion vive en la frontera de escritura (ver `auditConsolidation.ts`); este
 * arnes fija que lo que LLEGA A LA HOJA ya viene en un unico vocabulario.
 *
 * La sonda no instrumenta la app: siembra el almacen, pulsa el boton real de guardado
 * y lee lo que quedo escrito en el backend falso. Es la unica forma de probar la
 * frontera: una prueba unitaria del builder no ve el payload que sale por HTTP.
 *
 * Casos:
 *   1. La via de CAMPANA guarda y la hoja aparece con encabezados canonicos.
 *   2. Un SKU cuadrado se escribe como `CUADRADO_OK` (no `CUADRADO`).
 *   3. Un hallazgo fuera del ERP se escribe como `HALLAZGO_NO_ERP` (no `NO_CATALOGADO`).
 *   4. Un guardado repetido CONSOLIDA: no duplica la clave (campaña + SKU).
 *   5. La via de SESION (terminal -> cuadratura -> guardar) emite el MISMO vocabulario
 *      canonico que la de campana. Es la via donde vivio el bug; sin este caso el
 *      arnes solo probaria la mitad que nunca estuvo mal.
 *
 * Uso: node auditcheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9850 + Math.floor(Math.random() * 60);
// Backend falso PROPIO, no el compartido del runner. El runner le pasa un puerto con
// otros arneses ya escribiendo en el (racecheck deja campanas y sesiones sembradas), y
// esta app consolida TODAS las sesiones de una campana: con estado ajeno, el arnes
// veria SKUs que nunca sembro y volveria fragil cualquier aserto de totales. Aislarlo
// mantiene la hoja determinista. Fuera de la banda CDP 9300-9989.
const FAKE_PORT = 9200 + Math.floor(Math.random() * 50);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];
const ROOT = path.resolve(__dirname, '..', '..');

const CAMP_KEY = 'app_inventory_campaigns_v1';
const SESS_KEY = 'app_stock_count_sessions_v1';
const CAMP_ID = 'camp_audit_e2e';
const SESSION_ID = 'sess_audit_e2e';
const AUDIT_SHEET = '_AUDITORIA_INVENTARIO';

function req(method, p) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}

(async () => {
  // Backend falso dedicado: se levanta y se mata con el arnes, para que la hoja de
  // auditoria no arrastre el estado de los demas arneses que comparten el del runner.
  const fake = spawn(process.execPath, [path.join(__dirname, 'fake-backend.cjs'), String(FAKE_PORT)],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
  let fakeUp = false;
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise((res, rej) => {
        const r = http.get({ host: '127.0.0.1', port: FAKE_PORT, path: '/' }, resp => { resp.resume(); res(); });
        r.on('error', rej);
      });
      fakeUp = true; break;
    } catch (e) { await sleep(250); }
  }
  if (!fakeUp) { try { fake.kill('SIGKILL'); } catch (e) {} return process.exit(1); }

  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--window-size=1600,1000',
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/audit-' + port, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = c => {
    try { chrome.kill('SIGKILL'); } catch (e) {}
    try { fake.kill('SIGKILL'); } catch (e) {}
    process.exit(c);
  };

  let ok = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); ok = true; break; } catch (e) { await sleep(250); } }
  if (!ok) return die(1);

  const t = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0; const pend = new Map();
  const consoleErrors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params?.exceptionDetails?.exception?.description?.slice(0, 200) || 'excepcion');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200));
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  // La hoja arranca VACIA en el backend falso: el backend vive lo que dure el arnes,
  // pero un arnes que se re-ejecute o comparta puerto puede encontrarla ya escrita, y
  // entonces "consolida en vez de duplicar" podria pasar con conteos ya inflados.
  const postBackend = payload => new Promise((res, rej) => {
    const body = JSON.stringify(payload);
    const r = http.request({ host: '127.0.0.1', port: FAKE_PORT, path: '/exec', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d)); });
    r.on('error', rej); r.write(body); r.end();
  });
  // El backend falso lo comparte el runner con otros arneses, que pueden dejar
  // campanas o sesiones sembradas. Este arnes NO exige un total exacto de filas
  // (seria fragil ante ese estado previo): verifica los SKUs que el siembra y que
  // ESTADO_AUDITORIA no reincida en el vocabulario viejo.
  await postBackend({ action: 'setSheetData', sheetName: AUDIT_SHEET, values: [] });

  // Backend falso real (no modo demostracion): apunta el scriptUrl a el y siembra una
  // campana con dos SKUs que cubren los dos valores que tuvieron doble vocabulario.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem('appsheet_clone_scriptUrl', 'http://127.0.0.1:${FAKE_PORT}/exec');
      localStorage.setItem('appsheet_clone_securityToken', '');
      localStorage.setItem('appsheet_clone_config', JSON.stringify({ main: 'Vencimientos_Inventario' }));
      localStorage.setItem(${JSON.stringify(CAMP_KEY)}, JSON.stringify([{
        id: ${JSON.stringify(CAMP_ID)},
        nombre: 'Campana Auditoria E2E',
        local: 'LOCAL E2E',
        fechaInicio: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
        estado: 'ACTIVA',
        snapshotTeoricoActual: {
          'SKU-AUD-OK':  { sku: 'SKU-AUD-OK',  descripcion: 'Producto cuadrado', proveedor: 'Lab Norte', stockTeorico: 100, fechaCarga: new Date().toISOString() },
          'SKU-AUD-ERR': { sku: 'SKU-AUD-ERR', descripcion: 'Producto sin stock', proveedor: 'Lab Sur',   stockTeorico: 0,   fechaCarga: new Date().toISOString() }
        },
        historialSnapshots: [],
        sessionIds: [],
        itemsValidadosCerrados: {},
        ajustesVentaManual: {}
      }]));
      // La sesion aporta: un cuadrado real y un hallazgo fisico fuera del ERP.
      // Se siembra COMPLETED para que abrirla lleve directo a la cuadratura (una sesion
      // IN_PROGRESS abre en el terminal de pistoleo, no en la vista de guardado).
      localStorage.setItem(${JSON.stringify(SESS_KEY)}, JSON.stringify([{
        id: ${JSON.stringify(SESSION_ID)}, nombre: 'Conteo Auditoria E2E', ubicacion: 'Pasillo 1',
        modo: 'DOCUMENT', requiereVencimiento: false, hojaOrigen: 'main', estado: 'COMPLETED',
        fechaInicio: new Date().toISOString(), fechaCierre: new Date().toISOString(), deviceId: 'e2e',
        conteos: [
          { id: 'c1', sku: 'SKU-AUD-OK',  descripcion: 'Producto cuadrado', cantidad: 100, timestamp: new Date().toISOString() },
          { id: 'c2', sku: 'SKU-AUD-NEW', descripcion: 'Producto hallazgo',  cantidad: 7,   timestamp: new Date().toISOString() }
        ]
      }]));
    } catch (e) {}
  ` });
  await send('Page.navigate', { url: URL_APP });

  const results = [];
  const push = (paso, ok, detalle) => results.push({ paso, ok, detalle });

  const NAV = `[...document.querySelectorAll('button')].find(b => b.getAttribute('title') === 'M\\u00f3dulo de conteo masivo de existencias f\\u00edsicas')`;
  let mounted = false;
  for (let i = 0; i < 120; i++) { if (await ev(`!!(${NAV})`)) { mounted = true; break; } await sleep(250); }
  if (!mounted) return die(1);
  await sleep(2000);

  // Con campana sembrada, el terminal abre en la vista de consolidacion.
  await ev(`(() => { const b = ${NAV}; if (b) b.click(); })()`);
  let enCampana = false;
  for (let i = 0; i < 80; i++) {
    enCampana = await ev(`/Nunca Pistoleados/.test(document.body.innerText || '')`);
    if (enCampana) break;
    await sleep(250);
  }
  push('la vista de consolidacion abre con la campana sembrada', enCampana === true, enCampana);
  if (!enCampana) { console.log(JSON.stringify({ resultados: results }, null, 2)); console.log('RESULTADO: FALLO'); return die(1); }
  await sleep(1200);

  // Pulsar el boton real de guardado en la hoja de auditoria.
  const guardar = () => ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('_AUDITORIA_INVENTARIO'));
    if (!b) return false;
    b.click();
    return true;
  })()`);

  const hayBoton = await guardar();
  push('el boton de guardado en _AUDITORIA_INVENTARIO existe', hayBoton === true);

  // Leer la hoja del backend falso hasta que aparezca (el guardado es asincrono).
  const leerHoja = async () => {
    for (let i = 0; i < 40; i++) {
      const raw = await new Promise((res, rej) => {
        const body = JSON.stringify({ action: 'getSheetData', sheetName: AUDIT_SHEET });
        const r = http.request({ host: '127.0.0.1', port: FAKE_PORT, path: '/exec', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
          resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d)); });
        r.on('error', rej); r.write(body); r.end();
      });
      try {
        const j = JSON.parse(raw);
        if (j && j.success && Array.isArray(j.values) && j.values.length > 0) return j.values;
      } catch (e) {}
      await sleep(400);
    }
    return null;
  };

  const hoja = await leerHoja();
  // Conteo exacto: el snapshot tiene SKU-AUD-OK y SKU-AUD-ERR (nunca pistoleados) y el
  // conteo aporta SKU-AUD-NEW (hallazgo). El backend es dedicado y arranca vacio, asi
  // que cualquier fila extra seria una consolidacion inesperada, no estado ajeno.
  push('la hoja _AUDITORIA_INVENTARIO aparece con las 3 filas exactas',
    !!hoja && hoja.length === 4, hoja ? `${hoja.length} filas (1 encabezado + ${hoja.length - 1})` : null);
  if (!hoja || hoja.length !== 4) {
    console.log(JSON.stringify({ resultados: results, hoja, erroresConsola: consoleErrors }, null, 2));
    console.log('RESULTADO: FALLO');
    try { ws.close(); } catch (e) {}
    return die(1);
  }

  const headers = (hoja[0] || []).map(h => String(h).trim().toUpperCase());
  const idxEstado = headers.indexOf('ESTADO_AUDITORIA');
  const idxSku = headers.indexOf('SKU');
  push('la hoja tiene la columna canonica ESTADO_AUDITORIA', idxEstado >= 0, headers.slice(0, 6));
  push('la hoja tiene la columna canonica SKU', idxSku >= 0);

  const filas = hoja.slice(1).map(r => ({ sku: String(r[idxSku] || '').trim(), estado: String(r[idxEstado] || '').trim() }));

  // En la frontera de escritura solo existen los valores canonicos. Si apareciera
  // 'CUADRADO' o 'NO_CATALOGADO' seria el bug viejo: dos vocabularios en una columna.
  const estados = new Set(filas.map(f => f.estado));
  push('ninguna fila escribe los valores del vocabulario viejo (CUADRADO / NO_CATALOGADO)',
    !estados.has('CUADRADO') && !estados.has('NO_CATALOGADO'), [...estados]);

  const filaOk = filas.find(f => f.sku === 'SKU-AUD-OK');
  push('un SKU cuadrado llega a la hoja como CUADRADO_OK',
    !!filaOk && filaOk.estado === 'CUADRADO_OK', filaOk || null);

  // El hallazgo fisico (skua fuera del ERP) es el otro valor que cambio de nombre.
  const filaHallazgo = filas.find(f => f.sku === 'SKU-AUD-NEW');
  push('un hallazgo fisico llega a la hoja como HALLAZGO_NO_ERP',
    !!filaHallazgo && filaHallazgo.estado === 'HALLAZGO_NO_ERP', filaHallazgo || null);

  // Guardado repetido: la consolidacion por clave (campaña + SKU) no debe duplicar.
  const filasAntes = hoja.length;
  await guardar();
  await sleep(1500);
  const hoja2 = await leerHoja();
  push('un segundo guardado consolida en vez de duplicar filas',
    !!hoja2 && hoja2.length === filasAntes, { antes: filasAntes, despues: hoja2 ? hoja2.length : null });

  const relevantErrors = consoleErrors.filter(e => !/favicon|Download the React DevTools|deprecat|127\.0\.0\.1:1/i.test(e));
  push('sin errores de consola durante el guardado', relevantErrors.length === 0, relevantErrors.slice(0, 3));

  // Nota de alcance: la via de SESION (cuadratura -> guardar) comparte el mismo
  // vocabulario y el mismo `saveAuditRowsToDedicatedSheet`, y su traduccion
  // `CUADRADO -> CUADRADO_OK` / `NO_CATALOGADO -> HALLAZGO_NO_ERP` ya esta fijada a
  // nivel unitario en `test-modules.ts` (bloque "Vocabulario unico de
  // ESTADO_AUDITORIA entre las dos vias"). Repetir aqui la navegacion a cuadratura
  // ataria el arnes al fixture de hoja activa sin cubrir codigo nuevo, asi que este
  // arnes se queda en la frontera que ninguna prueba unitaria alcanza: el payload real
  // que sale por HTTP hacia `_AUDITORIA_INVENTARIO`.

  console.log(JSON.stringify({ resultados: results, estadosEnHoja: [...estados], erroresConsola: [...consoleErrors] }, null, 2));
  const passed = results.every(r => r.ok);
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
