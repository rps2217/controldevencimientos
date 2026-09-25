/**
 * Fase 7 paso 5 — arnes DISCRIMINANTE de la "personalidad por columnas" del nucleo.
 *
 * El paso 2 hizo que los slices de dominio se elijan por capacidad (columnas) y no por
 * el nombre de la pestana. El paso 5 cierra el mismo hueco en el NUCLEO del dashboard:
 * tres gates que aun despachaban por identidad (`activeView === 'main'`):
 *
 *   1. `drainageReportItems` — de que tabla sale el informe PM.
 *   2. `quickChips`          — que chips de filtro rapido se ofrecen.
 *   3. consolidacion CU_VC   — si al guardar se busca colision SKU+MM/YYYY.
 *
 * El observable mas limpio y estable es `quickChips`: el chip "Lote:" solo se generaba
 * cuando `activeView === 'main'`. En una hoja NO canonica con columna de lote, el
 * comportamiento viejo no mostraba nada y el nuevo si. Es un par discriminante real:
 *
 *   - Vencimientos_Inventario (canonica, CON lote): debe mostrar chip "Lote:".
 *   - Bodega_Sur   (NO canonica, CON vencimiento y lote): debe mostrar chip "Lote:".
 *   - Clientes     (NO canonica, SIN vencimiento ni lote): NO debe mostrar chip "Lote:".
 *
 * Si el gate volviera a depender del nombre, Bodega_Sur dejaria de mostrar el chip y su
 * asercion cae; si se forzara para todas las hojas, Clientes mostraria el chip y cae la
 * suya. Las tres mitades son necesarias.
 *
 * Nota: el panel de chips (y el observable) solo se monta con las tarjetas KPI visibles
 * (`areFiltersVisible`), que arranca en false. El arnes las activa desde el panel lateral
 * antes de medir; sin eso el observable no existe y el arnes mediria un falso negativo.
 *
 * Uso: node genericpersonalitycheck.cjs <url> <puerto-backend-falso>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

const port = 9500 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];
const FAKE_PORT = Number(process.argv[3] || 9800);

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/personality-' + port, 'about:blank',
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

  // 0. Activar las tarjetas KPI desde el panel lateral: sin eso el observable (chips)
  //    no se monta y el arnes mediria un falso negativo.
  await ev2(`(() => { const b = ${TRIGGER}; if (b) b.click(); })()`);
  await sleep(1500);
  const activarKpi = `(() => {
    const label = [...document.querySelectorAll('span')].find(s => (s.textContent || '').trim() === 'Mostrar Tarjetas KPI');
    if (!label) return false;
    const p = label.parentElement;
    const b = p && p.querySelector('button');
    if (b) { b.click(); return true; }
    return false;
  })()`;
  const kpi = await ev2(activarKpi);
  push('se activan las tarjetas KPI (precondicion del observable)', kpi === true, kpi);
  // Cerrar el panel lateral para no tapar la tabla.
  await ev2(`(() => { const b = ${TRIGGER}; if (b) b.click(); })()`);
  await sleep(1200);

  // 1. Canonica (arranca en main): el chip "Lote:" debe seguir apareciendo.
  const main = await ev2(`(() => {
    const txt = document.body.innerText || '';
    return { chipLote: /Lote:\\s*\\S/.test(txt), cargaFilas: /Producto/.test(txt) };
  })()`);
  push('la hoja canonica muestra el chip "Lote:" (sin regresion)',
    !!main && main.cargaFilas && main.chipLote === true, main);

  // 2. Hoja NO canonica CON columnas de vencimiento y lote: el nucleo debe darle la
  //    personalidad por columnas, no por nombre.
  const hayBodega = await irA('Bodega_Sur');
  const bodega = await ev2(`(() => {
    const txt = document.body.innerText || '';
    return {
      cargaFilas: /Producto bodega sur/.test(txt),
      chipLote: /Lote:\\s*\\S/.test(txt),
      moduloVenci: /Retiro Inmediato/.test(txt) || /Canje Proveedor/.test(txt),
    };
  })()`);
  push('"Bodega_Sur" (no canonica) aparece y se abre', hayBodega === true, hayBodega);
  push('la hoja no canonica carga sus filas', !!bodega && bodega.cargaFilas, bodega);
  push('el nucleo le da personalidad de vencimiento por COLUMNAS, no por nombre (chip "Lote:")',
    !!bodega && bodega.chipLote === true, bodega);
  push('la hoja no canonica recibe el modulo de vencimientos (slices por capacidad)',
    !!bodega && bodega.moduloVenci === true, bodega);

  // 3. Control: hoja sin vencimiento ni lote no debe inventar el chip.
  const hayClientes = await irA('Clientes');
  const clientes = await ev2(`(() => {
    const txt = document.body.innerText || '';
    return { chipLote: /Lote:\\s*\\S/.test(txt), cargaFilas: /Cliente Uno SpA/.test(txt) };
  })()`);
  push('la hoja sin semantica de dominio NO inventa el chip "Lote:" (control)',
    hayClientes === true && !!clientes && clientes.chipLote === false, clientes);

  const passed = results.every(r => r.ok);
  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
