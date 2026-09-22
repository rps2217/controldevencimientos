/**
 * Integridad del replay de la cola offline (`useOfflineSync`), la ruta mas critica
 * para la invariante "no perder datos".
 *
 * Levanta un backend Apps Script simulado en el mismo proceso (responde el
 * protocolo que habla `fetchFromScript`: getMetadata, getSheetData, appendRow...)
 * y apunta la app a el, para poder controlar el exito/fallo de las escrituras.
 *
 * Escenario, sobre dos invariantes concretas:
 *  1. Si el backend rechaza un append, la mutacion NO se pierde: queda en la cola
 *     marcada como fallida con intentos contados.
 *  2. Un reintento de conflictos, ya con el backend sano, drena la cola: la
 *     operacion se aplica y la mutacion sale de la cola.
 *
 * Senales robustas, no de UI volatil:
 *  - El estado de la cola se lee del respaldo persistido
 *    (`appsheet_clone_offline_queue`), que IndexedDB y localStorage mantienen.
 *  - El exito del replay se confirma por el numero de appendRow recibidos en el
 *    backend simulado, no por un toast.
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MOCK_PORT = 5600 + Math.floor(Math.random() * 90);
const CDP_PORT = 9800 + Math.floor(Math.random() * 90);
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/exec`;
const QUEUE_KEY = 'appsheet_clone_offline_queue';

// --- Backend Apps Script simulado -------------------------------------------
const mock = { appends: 0, failAppends: false, writes: [], requests: [] };

function startMockBackend() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': 'text/plain;charset=utf-8',
      };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch (e) {}
      const action = payload.action;
      mock.requests.push(action);
      const reply = obj => { res.writeHead(200, cors); res.end(JSON.stringify(obj)); };

      switch (action) {
        case 'getMetadata':
          return reply({
            spreadsheetId: 'e2e', title: 'E2E',
            sheets: [
              { sheetId: 1, title: 'Vencimientos_Inventario', properties: { sheetId: 1, title: 'Vencimientos_Inventario', gridProperties: { rowCount: 100, columnCount: 20 } } },
              { sheetId: 2, title: 'FRC', properties: { sheetId: 2, title: 'FRC', gridProperties: { rowCount: 100, columnCount: 20 } } },
            ],
          });
        case 'getAppProperties':
          return reply({ success: true, config: null, data: null });
        case 'getAllSheetsData': {
          const names = payload.sheetNames || [];
          const data = {};
          names.forEach(n => {
            data[n] = n === 'Vencimientos_Inventario'
              ? [['SKU', 'DESCRIPCION', 'FECHA_VENCIMIENTO', 'CANTIDAD'], ['SKU-E2E-1', 'Producto E2E', '2026-05-01', '10']]
              : [];
          });
          return reply({ success: true, data });
        }
        case 'getSheetData':
          return reply({ values: payload.sheetName === 'Vencimientos_Inventario'
            ? [['SKU', 'DESCRIPCION', 'FECHA_VENCIMIENTO', 'CANTIDAD'], ['SKU-E2E-1', 'Producto E2E', '2026-05-01', '10']]
            : [] });
        case 'appendRow':
          if (mock.failAppends) return reply({ error: 'Fallo simulado del backend (append rechazado)' });
          mock.appends++;
          mock.writes.push({ action, values: payload.values });
          return reply({ success: true });
        case 'updateRow':
        case 'deleteRow':
        case 'deleteRows':
          mock.writes.push({ action, rowIndex: payload.rowIndex });
          return reply({ success: true });
        case 'saveAppProperties':
          return reply({ success: true });
        default:
          return reply({ success: true });
      }
    });
  });
  return new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', () => resolve(server)));
}

// --- Plomeria CDP ------------------------------------------------------------
function mkHttpReq(port) {
  return (method, urlPath) => new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: urlPath, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}

(async () => {
  const mockServer = await startMockBackend();

  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+CDP_PORT,'--user-data-dir='+os.tmpdir()+'/ofc-'+CDP_PORT,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch(e){} try { mockServer.close(); } catch(e){} process.exit(c); };

  const httpReq = mkHttpReq(CDP_PORT);
  let up = false; for (let i=0;i<60;i++){ try{ await httpReq('GET','/json/version'); up=true; break; }catch(e){ await sleep(250); } }
  if(!up) return die(1);

  const target = JSON.parse(await httpReq('PUT','/json/new?about:blank'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0; const pend=new Map(); const consoleErrors=[];
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error') consoleErrors.push(m.params.args.map(a=>a.value||a.description).join(' '));
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}
  };
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value;};

  await send('Page.enable'); await send('Runtime.enable');

  // Apunta la app al backend simulado y siembra una mutacion pendiente en el
  // respaldo de la cola; IndexedDB la migra a si mismo al vaciarse.
  const pendingMutation = {
    id: 'mut_e2e_offline_1', type: 'append', sheetTitle: 'Vencimientos_Inventario',
    values: ['SKU-E2E-OFF', 'Creado offline', '2026-05-01', '7'],
    createdAt: new Date().toISOString(), status: 'pending', attempts: 0,
  };
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem('appsheet_clone_scriptUrl', ${JSON.stringify(MOCK_BASE)});
      localStorage.setItem('appsheet_clone_securityToken', '');
      localStorage.setItem(${JSON.stringify(QUEUE_KEY)}, ${JSON.stringify(JSON.stringify([pendingMutation]))});
    } catch (e) {}
  ` });

  await send('Page.navigate',{url:process.argv[2]});
  for(let i=0;i<120;i++){ if(await ev(`!!document.querySelector('input[placeholder*="Buscar"]')`)) break; await sleep(250); }
  await sleep(1500);

  const clickText = re => `(() => {
    const b = [...document.querySelectorAll('button')].find(x => new RegExp(${JSON.stringify(re)}, 'i').test((x.textContent || '') + ' ' + (x.getAttribute('title') || '')));
    if (!b) return false; b.click(); return true;
  })()`;
  const readQueue = `JSON.parse(localStorage.getItem(${JSON.stringify(QUEUE_KEY)}) || '[]')`;

  const out = [];

  // ---- 0. Estado inicial: la cola trae la mutacion y la UI ofrece sincronizar ----
  const syncButton = await ev(`[...document.querySelectorAll('button')].some(b => /Sync \\(1\\)/i.test(b.textContent || ''))`);
  const initialQueue = await ev(`(${readQueue}).length`);
  out.push({ paso: 'cola sembrada con 1 mutacion pendiente', botonSync: syncButton, enCola: initialQueue,
    ok: syncButton && initialQueue === 1 });

  // ---- 1. Falla de red: la mutacion no se pierde ----
  mock.failAppends = true;
  const clicked = await ev(clickText('Sync'));
  let failedEntry = null;
  for (let i = 0; i < 40; i++) {
    failedEntry = await ev(`(() => { const q = ${readQueue}; const m = q.find(x => x.id === 'mut_e2e_offline_1'); return m ? { status: m.status, attempts: m.attempts } : null; })()`);
    if (failedEntry && failedEntry.status === 'failed' && (failedEntry.attempts || 0) >= 1) break;
    await sleep(300);
  }
  const queueAfterFail = await ev(`(${readQueue}).length`);
  out.push({ paso: 'append rechazado -> mutacion conservada como fallida', clickSync: clicked,
    entrada: failedEntry, enCola: queueAfterFail,
    ok: clicked && !!failedEntry && failedEntry.status === 'failed' && (failedEntry.attempts || 0) >= 1 && queueAfterFail === 1 });

  // ---- 2. Reintento con backend sano: la cola se drena y se aplica la escritura ----
  mock.failAppends = false;
  const appendsBefore = mock.appends;
  const openedAudit = await ev(clickText('Conflicto'));
  await sleep(600);
  const retried = await ev(clickText('Reintentar Conflictos'));
  let finalQueue = -1;
  for (let i = 0; i < 40; i++) {
    finalQueue = await ev(`(${readQueue}).length`);
    if (finalQueue === 0) break;
    await sleep(300);
  }
  const appendsAfter = mock.appends;
  out.push({ paso: 'reintento de conflictos drena la cola y aplica el append',
    abrirAuditoria: openedAudit, reintentar: retried, enCola: finalQueue,
    appendsAntes: appendsBefore, appendsDespues: appendsAfter,
    ok: openedAudit && retried && finalQueue === 0 && appendsAfter === appendsBefore + 1 });

  console.log(JSON.stringify(out, null, 2));
  const relevantErrors = consoleErrors.filter(e =>
    !/favicon|ResizeObserver|DevTools|net::ERR/i.test(e) &&
    // El backend simulado rechaza el append a proposito en la fase 1; ese
    // console.error es el comportamiento esperado, no una regresion.
    !/Fallo simulado del backend/.test(e));
  if (relevantErrors.length) console.log('ERRORES CONSOLA:', JSON.stringify(relevantErrors.slice(0,5)));
  const passed = out.every(o => o.ok) && relevantErrors.length === 0;
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try{ws.close();}catch(e){}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
