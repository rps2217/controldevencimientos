/**
 * Verificacion funcional de las acciones masivas (edicion en lote y eliminacion
 * en lote), la ruta que `useInventoryBulkActions` extrae del dashboard.
 * Requiere la app servida.
 *
 * Division por vista, por como funciona el modo demostracion:
 *  - Edicion masiva: se prueba en "Incidencias & FRC", la unica vista donde el
 *    registro de acciones masivas la habilita por defecto.
 *  - Eliminacion masiva: se prueba en la vista principal, porque ahi el modo demo
 *    persiste las filas en localStorage y `fetchData` las relee; en la vista de
 *    eventos la demo siempre vuelve al dataset de ejemplo y no se podria observar
 *    el decremento real.
 *
 * Senales elegidas a proposito:
 *  - El modal de edicion se cierra SOLO despues de que `await onApply(...)` resuelve,
 *    asi que su cierre prueba que el handler completo sin lanzar.
 *  - La eliminacion se valida por el decremento real del numero de filas.
 *  - No se asertan toasts: se autodesvanecen antes de una lectura fiable.
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const port = 9800 + Math.floor(Math.random() * 90);
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
  const chrome = spawn('/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+port,'--user-data-dir='+os.tmpdir()+'/bc-'+port,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch(e){} process.exit(c); };
  let ok=false; for(let i=0;i<60;i++){ try{ await httpReq('GET','/json/version'); ok=true; break;}catch(e){await sleep(250);} }
  if(!ok) return die(1);
  const target = JSON.parse(await httpReq('PUT','/json/new?about:blank'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0; const pend=new Map(); const diag=[];
  ws.onmessage=ev2=>{
    const m=JSON.parse(ev2.data);
    if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error') diag.push(m.params.args.map(a=>a.value||a.description).join(' '));
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}
  };
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value;};

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname,'seed.js'),'utf8') });
  await send('Page.navigate',{url:process.argv[2]});
  for(let i=0;i<100;i++){ if(await ev(`!!document.querySelector('input[placeholder*="Buscar"]') && document.querySelectorAll('[data-index]').length > 0`)) break; await sleep(250); }
  await sleep(500);

  const clickText = re => `(() => {
    const b = [...document.querySelectorAll('button')].find(x => new RegExp(${JSON.stringify(re)}, 'i').test((x.textContent || '') + ' ' + (x.getAttribute('title') || '')));
    if (!b) return false; b.click(); return true;
  })()`;
  const ROWS = `document.querySelectorAll('[data-index]').length`;
  const barVisible = `[...document.querySelectorAll('button')].some(b => /Eliminar \\(\\d+\\)/i.test(b.textContent || ''))`;
  const selectFirstRow = `(() => {
    const cb = document.querySelector('[data-index] input[type="checkbox"]');
    if (!cb) return false; cb.click(); return true;
  })()`;
  // La seleccion puede tardar en reflejarse en la barra; reintenta hasta que aparezca.
  const selectUntilBar = async () => {
    for (let i = 0; i < 6; i++) {
      await ev(selectFirstRow);
      await sleep(500);
      if (await ev(barVisible)) return true;
    }
    return false;
  };
  const setInputByLabel = (labelRe, value) => `(() => {
    const lab = [...document.querySelectorAll('label')].find(l => new RegExp(${JSON.stringify(labelRe)}, 'i').test(l.textContent || ''));
    if (!lab) return false;
    const field = lab.parentElement.querySelector('input, select');
    if (!field) return false;
    const proto = field.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;

  const out = [];

  // ---------- EDICION MASIVA (vista Incidencias & FRC) ----------
  const navEvents = await ev(clickText('Incidencias & FRC'));
  await sleep(1200);
  const rowsInEvents = await ev(ROWS);
  const selectedForEdit = await selectUntilBar();
  const editOpened = await ev(clickText('Edición Masiva FRC'));
  await sleep(700);
  const editFormOpen = await ev(`!!document.querySelector('form') && document.body.innerText.includes('Aplicar a')`);
  const filed = await ev(setInputByLabel('N_TRASPASO', 'TR-E2E-BULK'));
  await sleep(200);
  const applied = await ev(clickText('Aplicar a'));
  await sleep(2500);
  const editModalClosed = await ev(`!document.body.innerText.includes('Aplicar a')`);
  const rowsAfterEdit = await ev(ROWS);
  out.push({
    paso: 'edicion masiva (Incidencias & FRC)',
    nav: navEvents, filas: rowsInEvents, seleccion: selectedForEdit,
    modalAbierto: editOpened && editFormOpen, campo: filed, aplicar: applied,
    modalCerrado: editModalClosed, filasTrasEditar: rowsAfterEdit,
    ok: navEvents && rowsInEvents > 0 && selectedForEdit && editOpened && editFormOpen && filed && applied && editModalClosed && rowsAfterEdit === rowsInEvents
  });

  // ---------- ELIMINACION MASIVA (vista principal, donde la demo persiste) ----------
  const navMain = await ev(clickText('Vencimientos & Radar'));
  await sleep(1500);
  const rowsInMain = await ev(ROWS);
  out.push({ paso: 'cambiar a vista principal', nav: navMain, filas: rowsInMain, ok: navMain && rowsInMain > 0 });

  const selectedForDelete = await selectUntilBar();
  const storedBefore = await ev(`(JSON.parse(localStorage.getItem('app_demo_items_main') || '[]') || []).length`);
  const delClicked = await ev(clickText('Eliminar \\(\\d+\\)'));
  await sleep(500);
  const dialogVisible = await ev(`document.body.innerText.includes('Eliminación masiva')`);
  const confirmed = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^\\s*Eliminar \\d+/i.test(x.textContent || ''));
    if (!b) return false; b.click(); return true;
  })()`);
  await sleep(2500);
  // La tabla esta virtualizada (solo ~23 filas en el DOM de 400), asi que el
  // conteo de nodos no sirve de senal; se verifica el almacen persistido.
  const storedAfter = await ev(`(JSON.parse(localStorage.getItem('app_demo_items_main') || '[]') || []).length`);
  const rowsAfterDelete = await ev(ROWS);
  out.push({
    paso: 'eliminacion masiva (vista principal)',
    seleccion: selectedForDelete, boton: delClicked, dialogo: dialogVisible, confirmado: confirmed,
    almacenAntes: storedBefore, almacenDespues: storedAfter, filasDom: rowsAfterDelete,
    ok: selectedForDelete && delClicked && dialogVisible && confirmed && storedAfter === storedBefore - 1
  });

  console.log(JSON.stringify(out, null, 2));
  if (diag.length) console.log('ERRORES CONSOLA:', JSON.stringify(diag.slice(0,5)));
  const okAll = out.every(o => o.ok);
  console.log(okAll ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try{ws.close();}catch(e){}
  die(okAll?0:1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
