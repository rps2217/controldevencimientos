/**
 * Verifica que el terminal avisa cuando el operario pistolea fuera del alcance de su sesion.
 *
 * Por que existe: una sesion de conteo por proveedor nace con `skuScope` (los SKUs
 * pendientes de ese laboratorio). La conciliacion recorta el universo teorico a ese
 * conjunto, asi que una lectura ajena NO llega a la matriz ni a VENCIMIENTOS; pero se
 * guarda igual en `conteos` y, antes de esta guarda, el operario recibia un
 * "Registrado: SKU (+1)" en verde. El esfuerzo se perdia en silencio: el aviso existe
 * para que no siga contando mercaderia ajena.
 *
 * Observables (DOM real, sin instrumentar la app):
 *   1. La sesion acotada abre el terminal de conteo.
 *   2. Un SKU dentro del alcance se registra con el aviso normal (verde).
 *   3. Un SKU ajeno, catalogado o no, se guarda pero se avisa "Fuera del alcance".
 *   4. El caso 3 usa un SKU ajeno que SI esta en el catalogo maestro: sin la guarda
 *      saldria "Registrado" en verde, asi que es el discriminante de que el aviso no se
 *      debe a "no catalogado".
 *
 * La sonda no es vacia: quitando la rama `fueraDeAlcance` de `commitCountEntry` (o
 * forzando el helper a devolver `false`), el paso 3 falla.
 *
 * Uso: node scopeguardcheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9750 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2] || 'http://127.0.0.1:4173/';

const SESSION_ID = 'sess_scope_e2e';
const KEY = 'app_stock_count_sessions_v1';
const SKU_EN_ALCANCE = 'SKU-1001'; // existe en SAMPLE_PRODUCTS: recorre la rama "Registrado" normal
const SKU_AJENO = 'SKU-SCOPE-OUT'; // ajeno al alcance y ausente del catálogo: prueba la precedencia
const SKU_AJENO_CAT = 'SKU-1002';  // ajeno al alcance pero SÍ catalogado: sin la guarda saldría verde

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/scope-' + port, 'about:blank',
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  // Sesion acotada al laboratorio, sin campana: asi el terminal arranca en "Muebles &
  // Pasillos" y se llega a COUNTING con un clic, sin rodeos.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify([{
        id: ${JSON.stringify(SESSION_ID)}, nombre: 'Conteo Proveedor E2E', modo: 'DOCUMENT',
        requiereVencimiento: false, hojaOrigen: 'main', estado: 'IN_PROGRESS',
        fechaInicio: new Date().toISOString(), conteos: [], deviceId: 'e2e',
        skuScope: [${JSON.stringify(SKU_EN_ALCANCE)}]
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
  let abierto = false;
  for (let i = 0; i < 40; i++) {
    abierto = await ev2(`[...document.querySelectorAll('h2')].some(h => h.textContent.includes('Conteo de Existencias'))`);
    if (abierto) break;
    await sleep(250);
  }
  await sleep(800);

  const abrioSesion = await ev2(`(() => {
    const card = [...document.querySelectorAll('div.cursor-pointer')].find(d => (d.textContent || '').includes('Conteo Proveedor E2E'));
    if (!card) return false;
    card.click();
    return true;
  })()`);
  let enConteo = false;
  for (let i = 0; i < 40; i++) {
    enConteo = await ev2(`!!([...document.querySelectorAll('input')].find(i => i.offsetParent !== null && i.placeholder === 'Escanear o buscar SKU...'))`);
    if (enConteo) break;
    await sleep(250);
  }
  push('la sesion acotada abre el terminal de conteo', abrioSesion === true && enConteo === true, { abrioSesion, enConteo });
  if (!enConteo) { console.log(JSON.stringify({ resultados: results }, null, 2)); console.log('RESULTADO: FALLO'); return die(1); }

  const registrar = sku => ev2(`(() => {
    const input = [...document.querySelectorAll('input')].find(i => i.offsetParent !== null && i.placeholder === 'Escanear o buscar SKU...');
    if (!input) return { error: 'sin input' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(sku)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const form = input.closest('form');
    if (!form) return { error: 'sin form' };
    form.requestSubmit();
    return { ok: true };
  })()`);

  const leerLecturas = () => ev2(`(() => {
    try {
      const a = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '[]');
      const s = a.find(x => x.id === ${JSON.stringify(SESSION_ID)});
      return s ? s.conteos.length : -1;
    } catch (e) { return -2; }
  })()`);

  // Texto de los toasts visibles (el contenedor los renderiza como <p>).
  const leerToasts = () => ev2(`[...document.querySelectorAll('p')]
    .filter(p => p.offsetParent !== null)
    .map(p => p.textContent || '')
    .filter(t => /Registrado|alcance|no catalogado|catalogado/.test(t))`);

  // --- Caso 1: SKU dentro del alcance -> aviso normal (verde) ---
  const r1 = await registrar(SKU_EN_ALCANCE);
  push('se pudo registrar el SKU dentro del alcance', r1 && r1.ok === true, r1);
  await sleep(900);
  const toasts1 = await leerToasts();
  push('un SKU dentro del alcance se registra con el aviso normal',
    Array.isArray(toasts1) && toasts1.some(t => new RegExp('Registrado.*' + SKU_EN_ALCANCE).test(t)) && !toasts1.some(t => /alcance/.test(t)),
    toasts1);
  const trasEnAlcance = await leerLecturas();
  push('la lectura dentro del alcance se persiste', trasEnAlcance === 1, trasEnAlcance);

  // Esperar a que el toast previo desaparezca para no confundir la sonda siguiente.
  await sleep(4200);

  // --- Caso 2: SKU ajeno al alcance -> aviso, NO un exito en verde ---
  //
  // La lectura se guarda igual (puede ser un hallazgo legitimo), pero el operario debe
  // enterarse de que no entrara en la conciliacion. Sin la guarda, este paso falla:
  // aparece "Registrado: SKU-SCOPE-OUT (+1)" y nada advierte del alcance.
  const r2 = await registrar(SKU_AJENO);
  push('se pudo registrar el SKU ajeno al alcance', r2 && r2.ok === true, r2);
  await sleep(900);
  const toasts2 = await leerToasts();
  push('un SKU ajeno avisa que queda fuera del alcance',
    Array.isArray(toasts2) && toasts2.some(t => new RegExp('Fuera del alcance de esta sesi\u00f3n.*' + SKU_AJENO).test(t)),
    toasts2);
  // Este SKU ajeno SÍ está catalogado: sin la guarda, el flujo normal lo registra en verde.
  // Es el caso discriminante de que el aviso no se debe a "no catalogado".
  const r3 = await registrar(SKU_AJENO_CAT);
  push('se pudo registrar el SKU ajeno pero catalogado', r3 && r3.ok === true, r3);
  await sleep(900);
  const toasts3 = await leerToasts();
  push('un SKU ajeno catalogado tampoco recibe el aviso verde',
    Array.isArray(toasts3) && toasts3.some(t => new RegExp('Fuera del alcance de esta sesi\u00f3n.*' + SKU_AJENO_CAT).test(t)) && !toasts3.some(t => new RegExp('Registrado:\\s*' + SKU_AJENO_CAT).test(t)),
    toasts3);
  const trasAjeno = await leerLecturas();
  push('la lectura ajena se conserva (no se descarta en silencio)', trasAjeno === 3, trasAjeno);

  const relevantErrors = consoleErrors.filter(e => !/favicon|Download the React DevTools|deprecat|127\.0\.0\.1:1/i.test(e));
  push('sin errores de consola durante el conteo acotado', relevantErrors.length === 0, relevantErrors.slice(0, 3));

  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  const passed = results.every(r => r.ok);
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  die(passed ? 0 : 1);
})();
