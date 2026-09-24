/**
 * Bug latente de la Fase 7 paso 3b — `headers`/`activeSheet` obsoletos en modo demo.
 *
 * Contexto medido: en modo demo/offline (sin SCRIPT_URL, o con la red caida) el
 * `catch` de `useInventoryData.fetchData` hace `return` temprano si ya hay items
 * (`hasRenderedCache || items.length > 0`) y NO refresca `headers` ni `activeSheet`.
 * Al cambiar de vista, los items de la vista anterior siguen ahi y el gate de
 * capacidad derivado de `headers` queda desincronizado de `activeView`. Esto obligo
 * a meter un respaldo por identidad de vista en `resolveTableCapabilities`; esta
 * sonda mide si la causa raiz sigue presente.
 *
 * Observable exigido (una sola invariante, la del bug): tras navegar de la hoja de
 * vencimientos a la de incidencias en modo demo, la UI debe corresponder a
 * INCIDENCIAS (editor de evento), no a vencimientos. Si `headers`/`activeSheet`
 * quedaron obsoletos, el gate de capacidad sigue diciendo "vencimiento".
 *
 * No instrumenta codigo de produccion: navega la app real sin SCRIPT_URL (modo demo)
 * y mide senales de UI. Uso: node democheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

const port = 9900 + Math.floor(Math.random() * 60);
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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/demo-' + port, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch (e) {} process.exit(c); };

  let ok = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); ok = true; break; } catch (e) { await sleep(250); } }
  if (!ok) { console.error('CDP no respondio en puerto ' + port); return die(1); }

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

  // El modo demo se alcanza con un SCRIPT_URL configurado que no responde (el fetch
  // lanza y el catch cae a los 4 ejemplos). Sin SCRIPT_URL la app muestra la pantalla
  // de conexion, no el dashboard.
  const seed = `(function () {
    try {
      localStorage.setItem('appsheet_clone_scriptUrl', 'http://127.0.0.1:9/exec');
      localStorage.setItem('appsheet_clone_securityToken', '');
      localStorage.setItem('appsheet_clone_config', JSON.stringify({}));
    } catch (e) {}
  })();`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: seed });
  await send('Page.navigate', { url: URL_APP });

  const TRIGGER = `document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`;
  let mounted = false;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!${TRIGGER}`)) { mounted = true; break; } await sleep(250); }
  if (!mounted) {
    const diag = await ev2(`({ title: document.title, body: (document.body.innerText || '').slice(0, 400), html: document.body.innerHTML.slice(0, 200) })`).catch(e => ({ err: String(e) }));
    console.error('La app no monto. URL_APP=' + URL_APP + ' diag=' + JSON.stringify(diag));
    return die(1);
  }
  await sleep(2500);

  const results = [];
  const push = (paso, ok, detalle) => results.push({ paso, ok, detalle });

  // Arranque en modo demo: debe mostrar datos de vencimientos.
  let inicio = { demo: false, filas: 0 };
  for (let i = 0; i < 30; i++) {
    inicio = await ev2(`(() => {
      const txt = document.body.innerText || '';
      return { demo: /Vencimientos_Inventario|Vencimientos/.test(txt), filas: document.querySelectorAll('tbody tr').length };
    })()`);
    if (inicio && inicio.filas > 0) break;
    await sleep(400);
  }
  push('en modo demo la hoja de vencimientos carga', !!inicio && inicio.filas > 0, inicio);

  // Navegar a Incidencias (la 2da hoja canonica).
  const irIncidencias = `[...document.querySelectorAll('button')].find(x => /Incidencias/.test((x.textContent||'') + (x.getAttribute('title')||'')))`;
  const hayBoton = await ev2(`!!(${irIncidencias})`);
  push('existe el acceso a Incidencias', hayBoton === true, hayBoton);
  if (!hayBoton) {
    console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
    console.log('RESULTADO: FALLO'); try { ws.close(); } catch (e) {} return die(1);
  }
  await ev2(`(() => { const b = ${irIncidencias}; if (b) b.click(); })()`);
  // En modo demo el fetch al SCRIPT_URL muerto agota su timeout (~6s) antes de caer
  // al fallback. Se sondea hasta que los encabezados de la vista destino aparezcan
  // (o se estabilicen), en vez de un sleep fijo que mediria el residuo de la previa.
  const headersNow = `[...document.querySelectorAll('thead th')].map(th => (th.textContent || '').trim())`;
  let tableHeaders = [];
  for (let i = 0; i < 30; i++) {
    tableHeaders = await ev2(`(${headersNow})`);
    if (/FRC_N/i.test((tableHeaders || []).join(' '))) break;
    await sleep(400);
  }

  // INVARIANTE DEL BUG: `headers` gobierna las columnas de la tabla. Si quedaron
  // obsoletos tras navegar, la tabla seguira mostrando encabezados de VENCIMIENTOS
  // (FECHA_VENCIMIENTO/CANTIDAD) en vez de los de INCIDENCIAS (FRC_N/TIPO_EVENTO...).
  const headersTexto = (tableHeaders || []).join(' | ').toUpperCase();
  const esVencimiento = /FECHA_VENCIMIENTO|FECHA VENC|FECHA VTO/.test(headersTexto);
  const esIncidencia = /FRC_N|FRC N|TIPO_EVENTO|TIPO DE EVENTO|EVENTO/.test(headersTexto);
  push('tras navegar a Incidencias, los encabezados ya no son de vencimientos',
    esIncidencia && !esVencimiento, { headers: tableHeaders });

  const passed = results.every(r => r.ok);
  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
