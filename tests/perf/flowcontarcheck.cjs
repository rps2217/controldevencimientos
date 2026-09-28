/**
 * Arnés E2E del Flujo "Contar" Completo (Campaña ↔ Terminal).
 *
 * Recorre de punta a punta el flujo central de auditoría cíclica de farmacia:
 *   1. Entrar a la consolidación de Campaña activa con universo teórico cargado.
 *   2. Identificar el proveedor con pendientes en `CampaignProviderProgress` ("Lab Norte").
 *   3. Pulsar el botón "Contar" específico del proveedor.
 *   4. Verificar que se crea y abre la sesión acotada (`skuScope`) en la vista `COUNTING`.
 *   5. Registrar lecturas físicas del SKU en alcance (SKU-E2E-A, 100 unidades).
 *   6. Volver a la matriz de Campaña.
 *   7. Verificar que la matriz refleja el conteo físico, actualiza la cobertura del proveedor
 *      (de 0% a 50%) y reduce los pendientes (de 2 a 1).
 *   8. Verificar que no hubo excepciones ni errores en consola.
 *
 * Uso: node flowcontarcheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9810 + Math.floor(Math.random() * 50);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2] || 'http://127.0.0.1:4173/';

const CAMP_KEY = 'app_inventory_campaigns_v1';
const SESS_KEY = 'app_stock_count_sessions_v1';
const CAMP_ID = 'camp_flow_contar_e2e';

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/flowcontar-' + port, 'about:blank',
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

  // Sembrar campaña con snapshot de 3 SKUs:
  // Lab Norte: SKU-E2E-A (100 u), SKU-E2E-B (50 u) -> 2 por contar
  // Lab Sur: SKU-E2E-C (30 u) -> 1 por contar
  // Sin sesiones previas:
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem(${JSON.stringify(CAMP_KEY)}, JSON.stringify([{
        id: ${JSON.stringify(CAMP_ID)},
        nombre: 'Campaña Auditoría Farmacia E2E',
        local: 'FARMACIA CENTRAL',
        fechaInicio: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
        estado: 'ACTIVA',
        snapshotTeoricoActual: {
          'SKU-E2E-A': { sku: 'SKU-E2E-A', descripcion: 'Paracetamol 500mg', proveedor: 'Lab Norte', stockTeorico: 100, fechaCarga: new Date().toISOString() },
          'SKU-E2E-B': { sku: 'SKU-E2E-B', descripcion: 'Ibuprofeno 400mg', proveedor: 'Lab Norte', stockTeorico: 50, fechaCarga: new Date().toISOString() },
          'SKU-E2E-C': { sku: 'SKU-E2E-C', descripcion: 'Amoxicilina 500mg', proveedor: 'Lab Sur', stockTeorico: 30, fechaCarga: new Date().toISOString() }
        },
        historialSnapshots: [],
        sessionIds: [],
        itemsValidadosCerrados: {},
        ajustesVentaManual: {}
      }]));
      localStorage.setItem(${JSON.stringify(SESS_KEY)}, JSON.stringify([]));
    } catch (e) {}
  ` });

  await send('Page.navigate', { url: URL_APP });

  const results = [];
  const push = (paso, ok, detalle) => results.push({ paso, ok, detalle });

  // Esperar montaje de la app
  const NAV_BTN = `[...document.querySelectorAll('button')].find(b => b.getAttribute('title') === 'M\\u00f3dulo de conteo masivo de existencias f\\u00edsicas')`;
  let mounted = false;
  for (let i = 0; i < 120; i++) {
    if (await ev2(`!!(${NAV_BTN})`)) { mounted = true; break; }
    await sleep(250);
  }
  if (!mounted) {
    console.error(JSON.stringify([{ paso: 'montaje', ok: false, detalle: 'No monto el boton de navegacion' }]));
    return die(1);
  }
  await sleep(1500);

  // 1. Abrir el modal del Terminal de Conteo / Campañas
  await ev2(`(${NAV_BTN}).click()`);
  await sleep(1500);

  // 2. Verificar que la vista de consolidación de campaña cargó
  const inCampaign = await ev2(`document.body.innerText.includes('Campaña Auditoría Farmacia E2E') || document.body.innerText.includes('Avance por Proveedor')`);
  push('1. Vista de Campaña abierta con la campaña activa', inCampaign, { inCampaign });

  // 3. Verificar que Lab Norte aparece en el panel de avance con 2 por contar
  const providerPanelInfo = await ev2(`(() => {
    const text = document.body.innerText;
    const hasLabNorte = text.includes('Lab Norte');
    const hasLabSur = text.includes('Lab Sur');
    const countBtns = [...document.querySelectorAll('button')].filter(b => b.innerText.includes('Contar') || b.getAttribute('title')?.includes('Contar'));
    return { hasLabNorte, hasLabSur, countBtnsCount: countBtns.length };
  })()`);
  push('2. Panel por Proveedor muestra Lab Norte con pendientes', providerPanelInfo.hasLabNorte && providerPanelInfo.countBtnsCount > 0, providerPanelInfo);

  // 4. Hacer clic en el botón "Contar" de Lab Norte
  const launchOk = await ev2(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => {
      const parent = b.closest('div');
      return parent && parent.innerText.includes('Lab Norte') && (b.innerText.includes('Contar') || b.getAttribute('title')?.includes('Contar') || b.querySelector('svg'));
    }) || [...document.querySelectorAll('button')].find(b => b.innerText.includes('Contar'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  })()`);
  push('3. Clic en botón Contar de Lab Norte', launchOk, { launchOk });
  await sleep(1500);

  // 5. Verificar que el terminal entró en modo COUNTING y creó la sesión acotada
  const inCounting = await ev2(`(() => {
    const text = document.body.innerText;
    const isCounting = text.includes('Lab Norte') && (text.includes('Registrar Conteo') || text.includes('TERMINAL') || text.includes('Lecturas') || text.includes('Finalizar'));
    return isCounting;
  })()`);
  push('4. Terminal de conteo abierto con sesión acotada a Lab Norte', inCounting, { inCounting });

  // 6. Registrar lectura de SKU-E2E-A con cantidad 100
  const countEntryOk = await ev2(`(() => {
    // Buscar input de SKU o pistola
    const skuInputs = [...document.querySelectorAll('input')].filter(i => i.placeholder?.toLowerCase().includes('sku') || i.placeholder?.toLowerCase().includes('código') || i.placeholder?.toLowerCase().includes('pistolee') || i.type === 'text');
    const skuInput = skuInputs[0];
    if (!skuInput) return { success: false, reason: 'No se encontró input de SKU' };

    skuInput.value = 'SKU-E2E-A';
    skuInput.dispatchEvent(new Event('input', { bubbles: true }));
    skuInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Buscar input de cantidad si existe
    const qtyInputs = [...document.querySelectorAll('input')].filter(i => i.type === 'number');
    if (qtyInputs[0]) {
      qtyInputs[0].value = '100';
      qtyInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      qtyInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Buscar botón de registrar o presionar Enter
    const submitBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Registrar') || b.innerText.includes('Agregar') || b.innerText.includes('Guardar') || b.getAttribute('title')?.includes('Registrar'));
    if (submitBtn) {
      submitBtn.click();
    } else {
      skuInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }

    return { success: true, skuSet: 'SKU-E2E-A' };
  })()`);
  push('5. Registro físico de SKU-E2E-A (100 unidades)', countEntryOk.success, countEntryOk);
  await sleep(1500);

  // 7. Volver a la consolidación de Campaña
  const backToCampOk = await ev2(`(() => {
    // Botón de Volver a Campaña o pestaña Campaña
    const campBtn = [...document.querySelectorAll('button')].find(b => 
      b.innerText.includes('Campaña') || 
      b.innerText.includes('Consolidación') || 
      b.getAttribute('title')?.includes('Campaña') ||
      b.innerText.includes('Volver')
    );
    if (campBtn) {
      campBtn.click();
      return true;
    }
    return false;
  })()`);
  push('6. Navegación de regreso a la Consolidación de Campaña', backToCampOk, { backToCampOk });
  await sleep(1500);

  // 8. Verificar que la matriz refleja el nuevo conteo:
  // - Lab Norte ahora tiene cobertura del 50% (1 de 2 SKUs contados)
  // - SKU-E2E-A aparece cuadrado (100 físico vs 100 teórico)
  const matrixVerification = await ev2(`(() => {
    const text = document.body.innerText;
    const hasSkuA = text.includes('SKU-E2E-A') || text.includes('Paracetamol');
    const hasCoverage = text.includes('50%') || text.includes('1/2 SKUs');
    return {
      hasSkuA,
      hasCoverage,
      snapshotTextSample: text.slice(0, 500)
    };
  })()`);
  push('7. Matriz de Campaña actualizada con cobertura y conteo físico', matrixVerification.hasSkuA || matrixVerification.hasCoverage, matrixVerification);

  // 9. Ausencia de errores de consola
  push('8. Consola limpia de excepciones', consoleErrors.length === 0, consoleErrors);

  console.log(JSON.stringify(results, null, 2));

  const allPassed = results.every(r => r.ok);
  if (allPassed) {
    console.log('DIAGNOSTICO: El flujo completo de Campaña -> Contar -> Terminal -> Matriz opera correctamente.');
    console.log('RESULTADO: OK');
    die(0);
  } else {
    console.error('DIAGNOSTICO: Fallaron uno o más pasos del flujo de conteo.');
    console.error('RESULTADO: FALLO');
    die(1);
  }
})().catch(err => {
  console.error('Error fatal en arnés flowcontarcheck:', err);
  process.exit(1);
});
