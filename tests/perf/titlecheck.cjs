/**
 * Fase 7 (Hallazgo 1) — arnes DISCRIMINANTE del TITULO del ticket termico.
 *
 * Antes de este corte, el titulo del ticket se decidia por `activeView` en tres
 * sitios con reglas divergentes. El defecto observable: una hoja NO canonica con
 * columnas de catalogo (`Maestro_Farmacia`) imprimia "REPORTE - MAESTRO_FARMACIA"
 * en vez del titulo de catalogo, aunque el resto de la app ya la trataba como
 * catalogo por columnas.
 *
 * El corte mueve la decision a las COLUMNAS (capacidad), con el nombre de la vista
 * canonica solo como ultimo recurso para hojas sin semantica detectable.
 *
 * Pares discriminantes (backend falso, hojas no canonicas):
 *
 *   - Maestro_Farmacia (SKU+DESCRIPCION+PROVEEDOR+CATEGORIA): DEBE imprimir
 *     "CATALOGO DE PRODUCTOS" por columnas. Antes imprimia "REPORTE - MAESTRO_FARMACIA".
 *   - Bodega_Sur (con FECHA VTO): DEBE imprimir "REPORTE VENCIMIENTOS" por columnas.
 *   - Clientes (RUT/RAZON_SOCIAL/TELEFONO/EMAIL): sin dominio -> respaldo por nombre.
 *   - Vencimientos_Inventario (canonica): conserva su titulo (sin regresion).
 *
 * El observable es el `h2` DENTRO de `#thermal-ticket-root`, capturado en el
 * instante de `window.print()` y no despues: el ticket solo vive en el DOM durante
 * la impresion.
 *
 * Uso: node titlecheck.cjs <url> <puerto-backend-falso>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

const port = 9570 + Math.floor(Math.random() * 40);
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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/title-' + port, 'about:blank',
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
  // Capturar el titulo EN EL INSTANTE de window.print(): el ticket solo vive en el
  // DOM mientras dura la impresion, asi que leerlo despues daria null.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__printTitles = [];
    window.print = () => {
      const el = document.getElementById('thermal-ticket-root');
      const h2 = el ? el.querySelector('h2') : null;
      window.__printTitles.push(h2 ? (h2.textContent || '').trim() : null);
    };
  `});
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
    const hay = await ev2(`!!(${boton(nombre)})`);
    await ev2(`(() => { const x = ${boton(nombre)}; if (x) x.click(); })()`);
    await sleep(3000);
    return hay;
  };

  // Selecciona la primera fila y dispara "Imprimir Ticket"; devuelve el titulo visto.
  const imprimirYLeerTitulo = async () => {
    await ev2(`window.__printTitles = []`);
    const sel = await ev2(`(() => {
      const cb = document.querySelector('tbody tr input[type=checkbox]');
      if (!cb) return false;
      cb.click();
      return true;
    })()`);
    await sleep(700);
    const hayBoton = await ev2(`!!${boton('Imprimir Ticket')} && ![...document.querySelectorAll('button')].find(x => (x.textContent||'').trim()==='Imprimir Ticket').disabled`);
    await ev2(`(() => { const b = ${boton('Imprimir Ticket')}; if (b) b.click(); })()`);
    await sleep(600);
    const titulos = await ev2(`JSON.stringify(window.__printTitles)`);
    return { sel, hayBoton, titulos: JSON.parse(titulos || '[]') };
  };

  // 1. Canonica: conserva su titulo (control de no regresion).
  const main = await imprimirYLeerTitulo();
  push('la hoja canonica conserva "REPORTE VENCIMIENTOS" (sin regresion)',
    main.titulos[0] === 'REPORTE VENCIMIENTOS', main.titulos);

  // 2. Hoja NO canonica de catalogo: el titulo debe salir de las COLUMNAS.
  //    Antes del corte: "REPORTE - MAESTRO_FARMACIA". Es el defecto medido.
  const hayMaestro = await irA('Maestro_Farmacia');
  const maestro = await imprimirYLeerTitulo();
  push('"Maestro_Farmacia" (no canonica) aparece y se abre', hayMaestro === true, hayMaestro);
  push('el TITULO sale de las COLUMNAS: "Maestro_Farmacia" imprime "CATÁLOGO DE PRODUCTOS"',
    maestro.titulos[0] === 'CATÁLOGO DE PRODUCTOS', maestro.titulos);
  push('"Maestro_Farmacia" ya NO imprime el nombre de la pestana como titulo',
    !!maestro.titulos[0] && !/MAESTRO_FARMACIA/i.test(maestro.titulos[0]), maestro.titulos[0]);

  // 3. Hoja NO canonica con vencimiento: titulo por columnas, no por nombre.
  const hayBodega = await irA('Bodega_Sur');
  const bodega = await imprimirYLeerTitulo();
  push('"Bodega_Sur" (no canonica) aparece y se abre', hayBodega === true, hayBodega);
  push('"Bodega_Sur" imprime "REPORTE VENCIMIENTOS" por sus columnas de vencimiento',
    bodega.titulos[0] === 'REPORTE VENCIMIENTOS', bodega.titulos);

  // 4. Control: hoja sin semantica de dominio cae al respaldo por nombre.
  const hayClientes = await irA('Clientes');
  const clientes = await imprimirYLeerTitulo();
  push('"Clientes" (sin dominio) aparece y se abre', hayClientes === true, hayClientes);
  push('"Clientes" sin dominio imprime un titulo por respaldo, no uno de dominio',
    clientes.titulos[0] === 'REPORTE - CLIENTES', clientes.titulos);

  const passed = results.every(r => r.ok);
  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
