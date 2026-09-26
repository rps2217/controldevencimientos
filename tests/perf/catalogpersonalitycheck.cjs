/**
 * Fase 7 paso 6 — arnes DISCRIMINANTE de la personalidad de CATALOGO por columnas.
 *
 * El paso 5 cerro los tres gates del nucleo que aun miraban `activeView === 'main'`.
 * Quedaba una rama por identidad en `quickChips`: `activeView === 'products'`. El paso 6
 * la migra a una capacidad nueva, `catalogo`, que se detecta por columnas: una hoja que
 * describe productos (SKU + descripcion) sin fechas ni columna de evento.
 *
 * El par discriminante usa una hoja NO canonica de catalogo (`Maestro_Farmacia`):
 *
 *   - Maestro_Farmacia (SKU+DESCRIPCION+PROVEEDOR+CATEGORIA): DEBE ofrecer chips de
 *     proveedor/categoria en la barra "Filtros Rapidos:".
 *   - Clientes (RUT/RAZON_SOCIAL/TELEFONO/EMAIL): NO DEBE ofrecer ninguno (control).
 *   - Vencimientos_Inventario (canonica): conserva su chip "Lote:" (sin regresion), y
 *     NO debe recibir los chips de catalogo (su capacidad es vencimiento, no catalogo).
 *
 * El observable es la barra de chips, no el texto de la tabla: los valores del catalogo
 * ("Lab Norte") tambien aparecen en las celdas, asi que medir sobre `innerText` daria un
 * falso positivo. Se leen solo los botones dentro del contenedor de "Filtros Rapidos:".
 *
 * Nota: la barra de chips solo se monta con las tarjetas KPI visibles (`areFiltersVisible`,
 * que arranca en false). El arnes las activa desde el panel lateral antes de medir.
 *
 * Uso: node catalogpersonalitycheck.cjs <url> <puerto-backend-falso>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

const port = 9560 + Math.floor(Math.random() * 40);
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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/catalog-' + port, 'about:blank',
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

  const irA = async (nombre) => {
    const b = boton(nombre);
    const hay = await ev2(`!!(${b})`);
    await ev2(`(() => { const x = ${b}; if (x) x.click(); })()`);
    await sleep(3500);
    return hay;
  };

  // Lee SOLO los chips de la barra "Filtros Rapidos:", no el texto de las celdas.
  const CHIPS = `(() => {
    const label = [...document.querySelectorAll('span')].find(s => /Filtros R/.test(s.textContent || ''));
    if (!label) return { montada: false, chips: [] };
    const bar = label.parentElement;
    const chips = [...bar.querySelectorAll('button')]
      .map(b => (b.textContent || '').trim())
      .filter(t => t && !/Limpiar filtro/i.test(t));
    return { montada: true, chips };
  })()`;

  // 0. Activar las tarjetas KPI: sin eso la barra de chips no se monta.
  await ev2(`(() => { const b = ${TRIGGER}; if (b) b.click(); })()`);
  await sleep(1500);
  const kpi = await ev2(`(() => {
    const label = [...document.querySelectorAll('span')].find(s => (s.textContent || '').trim() === 'Mostrar Tarjetas KPI');
    if (!label) return false;
    const p = label.parentElement;
    const b = p && p.querySelector('button');
    if (b) { b.click(); return true; }
    return false;
  })()`);
  push('se activan las tarjetas KPI (precondicion del observable)', kpi === true, kpi);
  await ev2(`(() => { const b = ${TRIGGER}; if (b) b.click(); })()`);
  await sleep(1200);

  // 1. Canonica: conserva su chip "Lote:" y NO recibe chips de catalogo.
  const main = await ev2(`(${CHIPS})`);
  const mainTieneLote = !!main && main.chips.some(c => /^Lote:/i.test(c));
  push('la hoja canonica conserva el chip "Lote:" (sin regresion)',
    !!main && main.montada && mainTieneLote, main);
  push('la hoja canonica NO recibe los chips de catalogo (su capacidad es vencimiento)',
    !!main && !main.chips.some(c => /Proveedor A/i.test(c)), main);

  // 2. Hoja NO canonica de catalogo: el nucleo debe darle la personalidad por columnas.
  const hayMaestro = await irA('Maestro_Farmacia');
  const maestro = await ev2(`(${CHIPS})`);
  const maestroProveedor = !!maestro && maestro.chips.some(c => /Lab Norte/i.test(c));
  const maestroCategoria = !!maestro && maestro.chips.some(c => /Analgesicos|Vitaminas/i.test(c));
  push('"Maestro_Farmacia" (no canonica) aparece y se abre', hayMaestro === true, hayMaestro);
  push('el nucleo le da personalidad de CATALOGO por COLUMNAS (chips de proveedor)',
    maestroProveedor, maestro);
  push('la hoja de catalogo tambien ofrece chips de categoria', maestroCategoria, maestro);
  push('la hoja de catalogo NO recibe el chip de lote (no tiene capacidad de vencimiento)',
    !!maestro && !maestro.chips.some(c => /^Lote:/i.test(c)), maestro);

  // 3. Control: hoja sin semantica de dominio no debe inventar chips.
  const hayClientes = await irA('Clientes');
  const clientes = await ev2(`(${CHIPS})`);
  push('la hoja sin semantica de dominio NO inventa chips (control)',
    hayClientes === true && !!clientes && clientes.chips.length === 0, clientes);

  const passed = results.every(r => r.ok);
  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
