/**
 * Verifica el invariante "la ultima lectura no se pierde" del terminal de conteo.
 *
 * Por que existe: las sesiones se persisten con escritura *debounced* de 300ms para
 * no congelar la UI durante el pistoleo. En una PDA el caso comun no es el borde:
 * el operario pistolea y cambia de app / apaga la pantalla de inmediato. Sin el
 * volcado inmediato en `pagehide`/`visibilitychange`, la ultima lectura se pierde en
 * esa ventana. Ya ocurrio una vez (fix de6cacc) y ninguna prueba lo cubria.
 *
 * La sonda es determinista, no una carrera contra el timer: en un mismo bloque
 * sincrono se lee el almacen, se dispara `pagehide` y se vuelve a leer. Un timer no
 * puede dispararse dentro de la misma tarea, asi que:
 *   - con el flush:    antes = 1 lectura, despues = 2  -> la lectura se salvo
 *   - sin el flush:    antes = 1 lectura, despues = 1  -> se perdio
 * El caso 1 fija que la via normal (debounce) tambien persiste, para no confundir
 * "el flush salva la lectura" con "la persistencia no funciona en absoluto".
 *
 * Uso: node countcheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9710 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];

const SESSION_ID = 'sess_e2e';
const KEY = 'app_stock_count_sessions_v1';
const SKU_A = 'SKU-E2E-A';
const SKU_B = 'SKU-E2E-B';

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/count-' + port, 'about:blank',
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  // Sesion de conteo sembrada SIN campana: asi el terminal arranca en la vista
  // "Muebles & Pasillos" (LIST) y se llega a COUNTING con un clic, sin rodeos.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify([{
        id: ${JSON.stringify(SESSION_ID)}, nombre: 'Conteo E2E', modo: 'DOCUMENT',
        requiereVencimiento: false, hojaOrigen: 'main', estado: 'IN_PROGRESS',
        fechaInicio: new Date().toISOString(), conteos: [], deviceId: 'e2e'
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
  push('el boton "Conteo" del nav abre el terminal', abierto === true, abierto);
  if (!abierto) { console.log(JSON.stringify({ resultados: results }, null, 2)); console.log('RESULTADO: FALLO'); return die(1); }
  await sleep(800);

  // Abrir la sesion sembrada desde la vista de sesiones por mueble.
  const abrioSesion = await ev2(`(() => {
    const card = [...document.querySelectorAll('div.cursor-pointer')].find(d => (d.textContent || '').includes('Conteo E2E'));
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
  push('la sesion sembrada abre el terminal de conteo', abrioSesion === true && enConteo === true, { abrioSesion, enConteo });
  if (!enConteo) { console.log(JSON.stringify({ resultados: results }, null, 2)); console.log('RESULTADO: FALLO'); return die(1); }

  // Registra una lectura en el formulario real (input + submit), sin instrumentar la app.
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

  const lecturasPersistidas = () => ev2(`(() => {
    try {
      const a = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '[]');
      const s = a.find(x => x.id === ${JSON.stringify(SESSION_ID)});
      return s ? s.conteos.length : -1;
    } catch (e) { return -2; }
  })()`);

  // Caso 1 - via normal: el debounce (300ms) persiste la lectura sin ayuda.
  const r1 = await registrar(SKU_A);
  push('se pudo registrar la lectura 1', r1 && r1.ok === true, r1);
  await sleep(600);
  const trasDebounce = await lecturasPersistidas();
  push('la via normal (debounce 300ms) persiste la lectura', trasDebounce === 1, trasDebounce);

  // Caso 2 - invariante bajo descarte de pagina.
  //
  // Se espera a que el commit de React ocurra (senal observable: la UI ya anuncia
  // "2 lecturas"), porque el efecto que agenda el debounce corre despues del commit.
  // Un `pagehide` real siempre llega en una tarea posterior a ese punto; sondear
  // antes seria medir un estado que el navegador nunca produce. Con el commit hecho,
  // la sonda lee -> dispara pagehide -> lee dentro de la MISMA tarea sincrona: el
  // timer de 300ms no puede dispararse ahi, asi que "antes" no incluye la lectura
  // nueva salvo por el volcado inmediato.
  const r2 = await registrar(SKU_B);
  push('se pudo registrar la lectura 2', r2 && r2.ok === true, r2);

  let commit = false;
  for (let i = 0; i < 12; i++) {
    commit = await ev2(`[...document.querySelectorAll('span,div')].some(x =>
      x.offsetParent !== null && /\\b2 lecturas\\b/.test(x.textContent || '') && (x.textContent || '').length < 80
    )`);
    if (commit) break;
    await sleep(25);
  }
  push('la UI confirma el commit de la lectura 2', commit === true, commit);
  await sleep(40); // margen para el efecto pasivo; sigue muy por debajo de los 300ms

  const probe = await ev2(`(() => {
    const key = ${JSON.stringify(KEY)};
    const read = () => {
      try {
        const a = JSON.parse(localStorage.getItem(key) || '[]');
        const s = a.find(x => x.id === ${JSON.stringify(SESSION_ID)});
        return s ? s.conteos.length : -1;
      } catch (e) { return -2; }
    };
    const antes = read();
    window.dispatchEvent(new Event('pagehide'));
    const despues = read();
    return { antes, despues };
  })()`);

  // Autocontrol de la sonda: si el timer ya hubiera escrito, "antes" seria 2 y el
  // caso no probaria el flush. Debe seguir pendiente (1) justo antes del pagehide.
  push('la lectura 2 seguia pendiente dentro de la ventana de debounce',
    probe && probe.antes === 1, probe);
  push('pagehide vuelca la lectura pendiente (no se pierde la ultima lectura)',
    probe && probe.despues === 2, probe);

  const relevantErrors = consoleErrors.filter(e => !/favicon|Download the React DevTools|deprecat|127\.0\.0\.1:1/i.test(e));
  push('sin errores de consola durante el conteo', relevantErrors.length === 0, relevantErrors.slice(0, 3));

  console.log(JSON.stringify({ montada: true, resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  const passed = results.every(r => r.ok);
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
