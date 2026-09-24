/**
 * Verificacion funcional del flujo de ingesta por portapapeles/Excel.
 *
 * Cubre la ruta que `useInventoryIngestion` extrae del dashboard: abrir el modal
 * de importacion, analizar un texto TSV, mapear columnas y confirmar. Es la ruta
 * con mas riesgo de perdida de datos del refactor (consolida por CU_VC y encola
 * mutaciones), asi que la prueba es conductual: exige que el flujo llegue a
 * confirmar y que el modal se cierre, no que aparezcan N filas concretas (la
 * consolidacion depende del dataset demo).
 *
 * Requiere la app servida (Vite) en la URL de argv[2].
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const port = 9900 + Math.floor(Math.random() * 90);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpReq(method, urlPath) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: urlPath, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}

(async () => {
  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+port,'--user-data-dir='+os.tmpdir()+'/ic-'+port,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch(e){} process.exit(c); };
  let ok=false; for(let i=0;i<60;i++){ try{ await httpReq('GET','/json/version'); ok=true; break;}catch(e){await sleep(250);} }
  if(!ok) return die(1);
  const target = JSON.parse(await httpReq('PUT','/json/new?about:blank'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0; const pend=new Map(); const diag=[];
  ws.onmessage=ev2=>{
    const m=JSON.parse(ev2.data);
    if(m.method==='Runtime.consoleAPICalled') diag.push(m.params.type+': '+m.params.args.map(a=>a.value||a.description).join(' '));
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}
  };
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value;};

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: require('fs').readFileSync(require('path').join(__dirname,'seed.js'),'utf8') });
  await send('Page.navigate',{url:process.argv[2]});
  for(let i=0;i<100;i++){ if(await ev(`!!document.querySelector('input[placeholder*="Buscar"]') && document.querySelectorAll('[data-index]').length > 0`)) break; await sleep(250); }
  await sleep(500);

  const clickText = re => `(() => {
    const b = [...document.querySelectorAll('button')].find(x => new RegExp(${JSON.stringify(re)}, 'i').test((x.textContent || '') + ' ' + (x.getAttribute('title') || '')));
    if (!b) return false; b.click(); return true;
  })()`;
  const setTextarea = value => `(() => {
    const t = document.querySelector('textarea');
    if (!t) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(t, ${JSON.stringify(value)});
    t.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;

  const out = [];

  // ---------- CAMBIO A VISTA EVENTOS (donde vive la ingesta FRC) ----------
  const navOk = await ev(clickText('Incidencias & FRC'));
  // En modo demo (sin SCRIPT_URL) el fetch agota su timeout (~6s) antes de caer al
  // dataset de la vista. La ingesta usa `activeSheet`, que solo pasa a FRC cuando
  // la vista asienta; importar antes escribiria en la hoja equivocada.
  let inEvents = false;
  for (let i = 0; i < 40; i++) {
    inEvents = await ev(`[...document.querySelectorAll('thead th')].some(t => /FRC_N/i.test(t.textContent || ''))`);
    if (inEvents) break;
    await sleep(400);
  }
  await sleep(400);
  out.push({ paso: 'cambiar a vista Incidencias & FRC', nav: navOk, vistaEventos: inEvents, ok: navOk && inEvents });

  // ---------- ABRIR MODAL DE IMPORTACION ----------
  const opened = await ev(clickText('Importar FRC|Importar masivamente'));
  await sleep(800);
  const modalOpen = await ev(`document.body.innerText.includes('Copiar y Pegar') && !!document.querySelector('textarea')`);
  out.push({ paso: 'abrir modal de importacion', boton: opened, modalAbierto: modalOpen, ok: opened && modalOpen });

  // ---------- ANALIZAR TEXTO TSV ----------
  const TSV = 'FRC_N\tSKU\tDESCRIPCION\tCANTIDAD\tFRC_EVEN\tN_TRASPASO\tPROVEEDOR\n'
             + 'FRC-E2E-01\tSKU-E2E-IMP\tPRODUCTO IMPORTADO E2E\t5\tTRANSPORTE\tTR-77777\tPROVEEDOR E2E\n'
             + 'FRC-E2E-02\tSKU-E2E-IMP\tPRODUCTO IMPORTADO E2E\t3\tDIFERENCIAS\tTR-77778\tPROVEEDOR E2E';
  const typed = await ev(setTextarea(TSV));
  await sleep(200);
  const analyzed = await ev(clickText('Analizar y Mapear Columnas'));
  await sleep(1500);
  const mapped = await ev(`document.body.innerText.includes('Total Filas') || document.body.innerText.includes('Columnas Origen')`);
  out.push({ paso: 'analizar y mapear columnas', pegado: typed, analizado: analyzed, mapeado: mapped, ok: typed && analyzed && mapped });

  // ---------- CONFIRMAR E INGESTAR ----------
  const confirmBtn = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Ingestar\\b/i.test(x.textContent || ''));
    if (!b) return false; b.click(); return true;
  })()`);
  // Sondeo sobre el DATO persistido, no sobre el aviso: los toasts se
  // autodesvanecen y su texto es fragil. La ingesta en modo demo guarda el
  // resultado con `saveStoredDemoItems('events', ...)`, asi que la prueba de que
  // la ruta extraida completo punta a punta es que el SKU importado quede en
  // `app_demo_items_events`.
  // Se sondea con holgura: sin backend el fetch agota reintentos con espera
  // (1.2s + 1.8s) antes de caer al almacen de demo, asi que la escritura puede
  // tardar ~6 s en aparecer.
  let ingested = false;
  for (let i = 0; i < 60; i++) {
    const stored = await ev(`(JSON.parse(localStorage.getItem('app_demo_items_events') || '[]') || []).some(it => String(it.SKU || '') === 'SKU-E2E-IMP')`);
    if (stored) { ingested = true; break; }
    await sleep(200);
  }
  await sleep(500);
  const modalClosed = await ev(`!(document.body.innerText.includes('Copiar y Pegar') && document.querySelector('textarea'))`);
  out.push({ paso: 'confirmar importacion', boton: confirmBtn, modalCerrado: modalClosed, ok: confirmBtn && modalClosed });

  // ---------- LA INGESTA DEBE COMPLETAR ----------
  // Dos senales solidas de que la ruta extraida funciono de punta a punta:
  //   1. las filas importadas quedaron persistidas en el almacen de la vista;
  //   2. el modal se cerro, y `onClose` solo corre tras resolver el `await
  //      onImportConfirmed`, luego el handler no lanzo.
  out.push({ paso: 'la ingesta completa y persiste las filas', filasPersistidas: ingested, modalCerrado: modalClosed, ok: ingested && modalClosed });

  console.log(JSON.stringify(out, null, 2));
  if (diag.length) console.log('ERRORES CONSOLA:', JSON.stringify(diag.filter(d=>!/^warning: \[AppsScript\]/.test(d)).slice(0,5)));
  const okAll = out.every(o => o.ok);
  console.log(okAll ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try{ws.close();}catch(e){}
  die(okAll?0:1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
