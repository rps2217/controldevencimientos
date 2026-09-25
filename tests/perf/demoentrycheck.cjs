/**
 * Puerta de entrada a la demostracion desde el onboarding.
 *
 * Antes, la unica forma de ver la app sin backend era escribir una URL con la forma
 * de Apps Script; el modo demostracion existia pero era inalcanzable desde la UI.
 * Este arnes recorre el camino real del usuario, sin sembrar SCRIPT_URL:
 *
 *   1. Sin backend ni eleccion previa: se ve el onboarding (no el dashboard).
 *   2. Existe el boton "Explorar con datos de demostracion" con nombre accesible.
 *   3. Al pulsarlo, monta el dashboard con datos de ejemplo.
 *   4. Al recargar, NO vuelve a pedir la URL (la eleccion se recuerda).
 *   5. El boton "URL de Apps Script" sigue siendo la salida hacia la configuracion.
 *
 * Uso: node demoentrycheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');

const port = 9420 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2] || 'http://127.0.0.1:4173/';

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/demoentry-' + port, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch (e) {} process.exit(c); };

  let up = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); up = true; break; } catch (e) { await sleep(250); } }
  if (!up) return die(1);

  const t = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev2 = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
    return r.result?.value;
  };

  const steps = [];
  const check = (paso, ok, detail) => steps.push({ paso, ok: !!ok, detail });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  // Sin sembrar SCRIPT_URL ni ninguna bandera: es el arranque limpio de un usuario nuevo.
  const URL_DEMO = `[...document.querySelectorAll('button')].find(b => /Explorar con datos de demostraci/i.test(b.textContent || ''))`;
  const EN_ONBOARDING = `!!document.body.innerText.match(/Conectar Google Sheets/)`;
  const EN_DASHBOARD = `!!document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`;

  await send('Page.navigate', { url: URL_APP });
  for (let i = 0; i < 120; i++) { if (await ev2(EN_ONBOARDING)) break; await sleep(250); }

  check('sin backend, el arranque limpio muestra el onboarding', await ev2(EN_ONBOARDING));
  check('el dashboard NO se muestra antes de elegir', !(await ev2(EN_DASHBOARD)));

  // Nombre accesible del boton nuevo (invariante a11y del proyecto: nada solo-icono mudo).
  const nombreBoton = await ev2(`(() => {
    const b = ${URL_DEMO};
    if (!b) return null;
    const texto = (b.textContent || '').trim();
    return texto || b.getAttribute('aria-label') || b.getAttribute('title') || '';
  })()`);
  check('existe el boton de demostracion con nombre accesible', !!nombreBoton && /Explorar con datos de demostraci/i.test(nombreBoton), nombreBoton);

  // Pulsar el boton debe entrar al dashboard con datos de ejemplo.
  await ev2(`(() => { const b = ${URL_DEMO}; if (b) b.click(); })()`);
  let filas = 0;
  for (let i = 0; i < 120; i++) {
    filas = await ev2(`document.querySelectorAll('tbody tr').length`).catch(() => 0);
    if (filas > 0) break;
    await sleep(250);
  }
  check('pulsar el boton monta el dashboard con datos', filas > 0, { filas });

  // La eleccion debe recordarse: recargar no puede devolver al muro de la URL.
  await send('Page.navigate', { url: URL_APP });
  for (let i = 0; i < 120; i++) { if (await ev2(EN_DASHBOARD)) break; await sleep(250); }
  check('al recargar no vuelve a pedir la URL', await ev2(EN_DASHBOARD));
  check('al recargar el onboarding queda cerrado', !(await ev2(EN_ONBOARDING)));

  // Salida hacia la configuracion real: el boton del encabezado sigue disponible.
  const btnUrl = `[...document.querySelectorAll('button')].find(b => /URL de Apps Script/i.test((b.textContent || '') + (b.getAttribute('title') || '')))`;
  check('desde demo existe la salida a configurar la URL', await ev2(`!!(${btnUrl})`));

  const passed = steps.every(s => s.ok);
  console.log(JSON.stringify({ resultados: steps }, null, 2));
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
