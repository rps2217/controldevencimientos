/**
 * Fase 7 paso 4 — arnes DISCRIMINANTE de la correccion manual de capacidades.
 *
 * El paso 3 logro que una hoja sin semantica de dominio (aqui "Clientes") cargue sin
 * arrastrar slices ni UI de vencimientos. El paso 4 cierra el caso ambiguo: la
 * deteccion automatica puede equivocarse (una columna "Fecha" generica, o una hoja de
 * vencimientos con encabezados sucios) y el usuario necesita corregirla sin tocar
 * columnas.
 *
 * El arnes mide el par completo, porque una sola mitad pasaria con un gate roto:
 *
 *   - Sin forzar:   Clientes NO muestra el modulo de vencimientos.
 *   - Forzado:      Clientes SI lo muestra (el usuario manda sobre la deteccion).
 *   - Restablecido: Clientes vuelve a NO mostrarlo (Auto es reversible).
 *
 * Uso: node capabilitycheck.cjs <url> <puerto-backend-falso>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

const port = 9400 + Math.floor(Math.random() * 60);
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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/capab-' + port, 'about:blank',
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

  // Señales del modulo de vencimientos, por texto visible (el chip de slice basta
  // como observable: si el modulo entra, sus slices nativos entran con el).
  const VENC = `{
    retiro: /Retiro Inmediato/i.test(document.body.innerText || ''),
    canje: /Canje Proveedor/i.test(document.body.innerText || '')
  }`;

  // 1. Ir a la hoja generica (sin semantica de dominio).
  const clientes = boton('Clientes');
  const enOtras = await ev2(`!!(${clientes})`);
  push('"Clientes" aparece en Otras Pestanas', enOtras === true, enOtras);
  await ev2(`(() => { const b = ${clientes}; if (b) b.click(); })()`);
  await sleep(3500);

  const base = await ev2(`(${VENC})`);
  push('sin forzar, "Clientes" NO muestra el modulo de vencimientos',
    !!base && !base.retiro && !base.canje, base);

  // 2. Abrir la configuracion y entrar a la pestana de modulos.
  const abrirConfig = boton('Configuración');
  const hayConfig = await ev2(`!!(${abrirConfig})`);
  await ev2(`(() => { const b = ${abrirConfig}; if (b) b.click(); })()`);
  await sleep(1200);

  const pestana = boton('Módulos de la Hoja');
  const hayPestana = await ev2(`!!(${pestana})`);
  await ev2(`(() => { const b = ${pestana}; if (b) b.click(); })()`);
  await sleep(800);

  // El panel debe declarar que la hoja no tiene semantica de dominio: es la
  // explicacion que ve el usuario de por que no hay modulos.
  const panel = await ev2(`(() => {
    const txt = document.body.innerText || '';
    return { sinSemantica: /Sin semántica de dominio/i.test(txt), tabla: /Clientes/.test(txt) };
  })()`);
  push('el panel reporta "Sin semántica de dominio" para la hoja generica',
    hayConfig === true && hayPestana === true && !!panel && panel.sinSemantica, panel);

  // 3. Forzar "Vencimientos y Retiro" (Incluir) y aplicar.
  //    Se localiza la tarjeta por su etiqueta, no por indice, para no depender del orden.
  const forzarVenc = `(() => {
    const label = [...document.querySelectorAll('span')].find(s => (s.textContent || '').trim() === 'Vencimientos y Retiro');
    if (!label) return false;
    let p = label;
    for (let i = 0; i < 8; i++) {
      p = p.parentElement;
      if (!p) break;
      const b = [...p.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Incluir');
      if (b) { b.click(); return true; }
    }
    return false;
  })()`;
  const forzado = await ev2(forzarVenc);
  push('se puede forzar la capacidad de vencimiento desde el panel', forzado === true, forzado);
  await sleep(600);

  const aplicar = boton('Aplicar y Recargar');
  await ev2(`(() => { const b = ${aplicar}; if (b) b.click(); })()`);
  await sleep(3500);

  const trasForzar = await ev2(`(${VENC})`);
  push('forzada la capacidad, "Clientes" SI muestra el modulo de vencimientos',
    !!trasForzar && trasForzar.retiro, trasForzar);

  // 4. La correccion debe persistir en la config (no ser solo estado de UI).
  const persistido = await ev2(`(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('appsheet_clone_config') || '{}');
      const setting = (cfg.tableCapabilities || {})['Clientes'] || {};
      return { enabled: (setting.enabled || []).includes('vencimiento') };
    } catch (e) { return { enabled: false, error: String(e) }; }
  })()`);
  push('la correccion se persiste en la configuracion de la tabla',
    !!persistido && persistido.enabled === true, persistido);

  // 5. Reversible: Restablecer a Auto devuelve la hoja a deteccion automatica.
  await ev2(`(() => { const b = ${abrirConfig}; if (b) b.click(); })()`);
  await sleep(1200);
  await ev2(`(() => { const b = ${pestana}; if (b) b.click(); })()`);
  await sleep(800);
  const reset = boton('Restablecer a Auto');
  const hayReset = await ev2(`!!(${reset})`);
  await ev2(`(() => { const b = ${reset}; if (b) b.click(); })()`);
  await sleep(600);
  await ev2(`(() => { const b = ${aplicar}; if (b) b.click(); })()`);
  await sleep(3500);

  const trasReset = await ev2(`(${VENC})`);
  push('Restablecer a Auto vuelve a ocultar el modulo en la hoja generica',
    hayReset === true && !!trasReset && !trasReset.retiro && !trasReset.canje, { hayReset, trasReset });

  const passed = results.every(r => r.ok);
  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
