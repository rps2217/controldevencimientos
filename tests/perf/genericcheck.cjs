/**
 * Fase 7 paso 3 — verifica de punta a punta el "modo generico": apuntar la app a una
 * hoja con datos que NO son de vencimientos ni incidencias (una hoja de Clientes).
 *
 * El modo demostracion solo sirve las 4 hojas canonicas, por eso la sonda levanta el
 * backend falso (tests/perf/fake-backend.cjs) y apunta SCRIPT_URL ahi. Asi se mide la
 * app real contra datos genericos, sin instrumentar el codigo de produccion.
 *
 * Observables exigidos:
 *   1. La hoja generica aparece en "Otras Pestanas" y carga sus filas.
 *   2. NO muestra slices de dominio (vencimientos / canje) en una hoja sin esas columnas.
 *   3. Las acciones masivas por capacidad siguen activas (WhatsApp/Gmail por telefono/email).
 *   4. NO ofrece UI de dominio: "Nuevo Vencimiento", Accion PM, Edicion FRC ni el terminal
 *      de conteo/pistoleo.
 *
 * NO cubre editar+guardar una fila generica: el backend falso solo responde lecturas (sin
 * doPost). Esa ruta esta verificada por lectura de codigo, no por este arnes.
 *
 * Uso: node genericcheck.cjs <url> <puerto-backend-falso>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');

const port = 9700 + Math.floor(Math.random() * 60);
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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/generic-' + port, 'about:blank',
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

  // Semilla: backend falso + config que mapea la vista principal a la hoja canonica.
  const seed = `(function () {
    try {
      localStorage.setItem('appsheet_clone_scriptUrl', 'http://127.0.0.1:${FAKE_PORT}/exec');
      localStorage.setItem('appsheet_clone_securityToken', '');
      localStorage.setItem('appsheet_clone_config', JSON.stringify({
        main: 'Vencimientos_Inventario',
      }));
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

  // 1. La hoja generica debe aparecer en "Otras Pestanas".
  //    La sidebar puede estar colapsada: entonces el rotulo vive en `title`.
  const porNombre = `[...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Clientes' || (x.getAttribute('title') || '') === 'Clientes')`;
  const enOtras = await ev2(`!!(${porNombre})`);
  push('la hoja generica aparece en "Otras Pestanas"', enOtras === true, enOtras);

  // 2. Navegar a la hoja generica.
  await ev2(`(() => { const b = ${porNombre}; if (b) b.click(); })()`);
  await sleep(3500);

  const filas = await ev2(`(() => {
    const txt = document.body.innerText || '';
    return { tieneUno: /Cliente Uno SpA/.test(txt), tieneTres: /Cliente Tres SpA/.test(txt) };
  })()`);
  push('la hoja generica carga sus filas', !!filas && filas.tieneUno && filas.tieneTres, filas);

  // 3. Sin slices de dominio: una hoja sin fecha de vencimiento no debe mostrar
  //    "Retiro Inmediato" ni "Canje Proveedor".
  const slicesDominio = await ev2(`(() => {
    const txt = document.body.innerText || '';
    return {
      retiro: /Retiro Inmediato/.test(txt),
      canje: /Canje Proveedor/.test(txt),
      vencidos: /Vencidos/.test(txt),
    };
  })()`);
  push('la hoja generica NO muestra slices de vencimientos',
    !!slicesDominio && !slicesDominio.retiro && !slicesDominio.canje && !slicesDominio.vencidos, slicesDominio);

  // 4. La barra de acciones masivas solo aparece con filas seleccionadas; se marca
  //    la casilla de cabecera para abrirla y se mide la activacion por capacidad.
  await ev2(`(() => { const c = document.querySelector('thead input[type=checkbox]'); if (c) c.click(); })()`);
  await sleep(700);

  const bulk = await ev2(`(() => {
    const txt = document.body.innerText || '';
    return { whatsapp: /WhatsApp/i.test(txt), gmail: /Gmail/i.test(txt), excel: /Excel/i.test(txt) };
  })()`);
  push('detecta acciones por capacidad (telefono/email) en la hoja generica',
    !!bulk && bulk.whatsapp && bulk.gmail && bulk.excel, bulk);

  // 5. FUGA DE UI DE DOMINIO (el objetivo del paso 3): una hoja sin fecha de
  //    vencimiento no deberia ofrecer botones de vencimientos ni el terminal de conteo.
  await ev2(`(() => { const c = document.querySelector('thead input[type=checkbox]'); if (c) c.click(); })()`);
  await sleep(500);
  const fuga = await ev2(`(() => {
    const txt = document.body.innerText || '';
    return {
      nuevoVencimiento: /Nuevo Vencimiento/i.test(txt),
      conteo: /Pistoleo M|Conteo de Stock|Conteo/i.test(txt),
      accionPm: /Acci.n PM/i.test(txt),
      edicionFrc: /Edici.n FRC|Edici.n Masiva/i.test(txt),
    };
  })()`);
  push('la hoja generica NO ofrece UI de vencimientos ni conteo',
    !!fuga && !fuga.nuevoVencimiento && !fuga.conteo && !fuga.accionPm && !fuga.edicionFrc, fuga);

  const passed = results.every(r => r.ok);
  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
