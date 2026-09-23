/**
 * Verifica el invariante del conteo a ciegas: en modo BLIND el operario no debe ver
 * ningun dato teorico (AGENTS.md seccion M: "auditoria limpia, previniendo sesgos").
 *
 * Por que existe: el fix 8375865 ("modo BLIND real...") cambio 87 lineas del terminal
 * y no se cubrio con una sola prueba. El riesgo no es que BLIND se vea distinto, sino
 * que un refactor quite un `!isBlind` de mas y filtre el stock del ERP a la pantalla
 * durante la auditoria: el conteo deja de ser limpio y nadie lo nota.
 *
 * La sonda es un par discriminante, no una sola asercion:
 *   - DOCUMENT: el badge "ERP: <n> un" DEBE aparecer  (control positivo)
 *   - BLIND:    el badge NO debe aparecer             (invariante)
 * Hacen falta los dos. Si solo se probara "en BLIND no aparece", un gate roto que
 * ocultara el badge en *todos* los modos daria verde. El control positivo fija que el
 * badge existe y que la unica diferencia es el modo.
 *
 * Se siembra el catalogo maestro y una campana con snapshot, porque el badge solo se
 * renderiza si el SKU se resuelve contra el catalogo y existe en el snapshot del ERP.
 *
 * Uso: node blindcheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9770 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];

const KEY_SESSIONS = 'app_stock_count_sessions_v1';
const KEY_CAMPAIGNS = 'app_inventory_campaigns_v1';
const KEY_ACTIVE_CAMPAIGN = 'app_active_campaign_id_v1';
const KEY_PRODUCTS = 'app_demo_items_products';

const CAMPAIGN_ID = 'camp_e2e';
const SKU = 'SKU-1001';
const STOCK_TEORICO = 100;
const SESSION_BLIND = 'sess_blind';
const SESSION_DOC = 'sess_doc';
const NOMBRE_BLIND = 'Conteo Blind E2E';
const NOMBRE_DOC = 'Conteo Doc E2E';

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/blind-' + port, 'about:blank',
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

  // Catalogo maestro + campana con snapshot + una sesion por modo. El badge teorico
  // solo se renderiza si el SKU esta en el catalogo (para resolver la descripcion) y
  // en el snapshot del ERP (para tener stockTeorico): ambos se siembran a proposito.
  const iso = new Date().toISOString();
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem(${JSON.stringify(KEY_PRODUCTS)}, JSON.stringify([
        { _rowIndex: 2, SKU: ${JSON.stringify(SKU)}, DESCRIPCION: 'Leche Entera UHT 1L', PROVEEDOR: 'Lacteos del Sur S.A.', CATEGORIA: 'Lacteos' }
      ]));
      localStorage.setItem(${JSON.stringify(KEY_CAMPAIGNS)}, JSON.stringify([{
        id: ${JSON.stringify(CAMPAIGN_ID)}, nombre: 'Campana E2E', local: 'LOCAL 1',
        fechaInicio: ${JSON.stringify(iso)}, fechaActualizacion: ${JSON.stringify(iso)},
        estado: 'ACTIVA',
        snapshotTeoricoActual: { ${JSON.stringify(SKU)}: {
          sku: ${JSON.stringify(SKU)}, descripcion: 'Leche Entera UHT 1L', proveedor: 'Lacteos del Sur S.A.',
          stockTeorico: ${STOCK_TEORICO}, fechaCarga: ${JSON.stringify(iso)}
        } },
        historialSnapshots: [], sessionIds: [], itemsValidadosCerrados: {}, ajustesVentaManual: {}
      }]));
      localStorage.setItem(${JSON.stringify(KEY_ACTIVE_CAMPAIGN)}, ${JSON.stringify(CAMPAIGN_ID)});
      localStorage.setItem(${JSON.stringify(KEY_SESSIONS)}, JSON.stringify([
        { id: ${JSON.stringify(SESSION_BLIND)}, nombre: ${JSON.stringify(NOMBRE_BLIND)}, modo: 'BLIND',
          requiereVencimiento: false, hojaOrigen: 'main', estado: 'IN_PROGRESS',
          fechaInicio: ${JSON.stringify(iso)}, conteos: [], deviceId: 'e2e' },
        { id: ${JSON.stringify(SESSION_DOC)}, nombre: ${JSON.stringify(NOMBRE_DOC)}, modo: 'DOCUMENT',
          requiereVencimiento: false, hojaOrigen: 'main', estado: 'IN_PROGRESS',
          fechaInicio: ${JSON.stringify(iso)}, conteos: [], deviceId: 'e2e' }
      ]));
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
  push('el terminal de conteo abre', abierto === true, abierto);
  if (!abierto) { console.log(JSON.stringify({ resultados: results }, null, 2)); console.log('RESULTADO: FALLO'); return die(1); }
  await sleep(800);

  // Ir a la vista de sesiones por mueble.
  const irAList = async () => {
    await ev2(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('Muebles') && (x.textContent || '').includes('Pasillos'));
      if (b) b.click();
    })()`);
    for (let i = 0; i < 20; i++) {
      if (await ev2(`[...document.querySelectorAll('div.cursor-pointer')].some(d => (d.textContent||'').includes(${JSON.stringify(NOMBRE_BLIND)}))`)) return true;
      await sleep(150);
    }
    return false;
  };

  const abrirSesion = async nombre => {
    const click = await ev2(`(() => {
      const card = [...document.querySelectorAll('div.cursor-pointer')].find(d => (d.textContent || '').includes(${JSON.stringify(nombre)}));
      if (!card) return false;
      card.click();
      return true;
    })()`);
    for (let i = 0; i < 30; i++) {
      const listo = await ev2(`!!([...document.querySelectorAll('input')].find(i => i.offsetParent !== null && i.placeholder === 'Escanear o buscar SKU...'))`);
      if (listo) return click;
      await sleep(150);
    }
    return false;
  };

  // Escribe el SKU en el formulario real; el badge depende de que el catalogo lo resuelva.
  const escribirSku = async sku => ev2(`(() => {
    const input = [...document.querySelectorAll('input')].find(i => i.offsetParent !== null && i.placeholder === 'Escanear o buscar SKU...');
    if (!input) return { error: 'sin input' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(sku)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  })()`);

  // El badge de stock teorico: "ERP: <n> un" o, si el SKU no esta en el snapshot,
  // "Hallazgo". Se leen del DOM visible, que es lo que ve el operario.
  const leerBadges = () => ev2(`(() => {
    const visible = [...document.querySelectorAll('span')].filter(s => s.offsetParent !== null);
    const txt = visible.map(s => s.textContent || '');
    return {
      erp: txt.some(t => /^ERP:\\s*\\d+\\s*un$/.test(t.trim())),
      hallazgo: txt.some(t => t.trim() === 'Hallazgo'),
      descripcion: txt.some(t => t.includes('Leche Entera UHT 1L')),
      cuerpo: document.body.textContent || ''
    };
  })()`);

  // --- Sesion BLIND: el invariante ---
  push('la vista de sesiones por mueble lista las sesiones sembradas', await irAList(), true);
  push('la sesion BLIND abre el terminal de conteo', await abrirSesion(NOMBRE_BLIND), true);
  const e1 = await escribirSku(SKU);
  push('se pudo ingresar el SKU en modo BLIND', e1 && e1.ok === true, e1);
  await sleep(600);
  const blind = await leerBadges();
  push('BLIND resuelve la descripcion del catalogo (la pantalla esta viva)',
    blind && blind.descripcion === true, blind && blind.descripcion);
  push('BLIND no muestra el stock teorico del ERP',
    blind && blind.erp === false, blind && blind.erp);
  push('BLIND no revela si el SKU es un hallazgo fisico',
    blind && blind.hallazgo === false, blind && blind.hallazgo);

  // --- Sesion DOCUMENT: control positivo ---
  push('se vuelve a la vista de sesiones', await irAList(), true);
  push('la sesion DOCUMENT abre el terminal de conteo', await abrirSesion(NOMBRE_DOC), true);
  const e2 = await escribirSku(SKU);
  push('se pudo ingresar el SKU en modo DOCUMENT', e2 && e2.ok === true, e2);
  await sleep(600);
  const doc = await leerBadges();
  push('DOCUMENT SI muestra el stock teorico del ERP (control positivo)',
    doc && doc.erp === true, doc && doc.erp);

  const relevantErrors = consoleErrors.filter(e => !/favicon|Download the React DevTools|deprecat|127\.0\.0\.1:1/i.test(e));
  push('sin errores de consola durante el conteo', relevantErrors.length === 0, relevantErrors.slice(0, 3));

  console.log(JSON.stringify({ resultados: results, erroresConsola: [...consoleErrors] }, null, 2));
  const passed = results.every(r => r.ok);
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
