/**
 * Verifica que datos corruptos en localStorage no rompen el arranque.
 *
 * Es la prueba de la promesa de la Fase 4: antes, un valor con forma equivocada
 * pasaba el JSON.parse y reventaba despues (al indexar en profundidad o dentro de
 * un render). Ahora debe degradar a los valores por defecto.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const URL_APP = process.argv[2];
const PORT = 9300 + Math.floor(Math.random() * 100);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function req(method, urlPath) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}
const KEY_WIDTHS = 'appsheet_col_widths';
const KEY_COL_ORDERS = 'appsheet_clone_col_orders';
const KEY_MODULE_STATES = 'app_module_states';

(async () => {
  const chrome = spawn('/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+PORT,'--user-data-dir='+require('os').tmpdir()+'/corrupt-'+PORT,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch(e){} process.exit(c); };
  let ok=false; for(let i=0;i<60;i++){ try{ await req('GET','/json/version'); ok=true; break;}catch(e){await sleep(250);} }
  if(!ok) return die(1);
  const target = JSON.parse(await req('PUT','/json/new?about:blank'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0; const pend=new Map();
  const consoleErrors = [];
  ws.onmessage=ev=>{
    const m=JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params?.exceptionDetails?.exception?.description?.slice(0,200) || 'excepcion');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push((m.params.args||[]).map(a=>a.value||a.description||'').join(' ').slice(0,200));
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}
  };
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value;};
  await send('Page.enable'); await send('Runtime.enable');

  const MOUNTED = `!!document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`;

  async function loadWith(injectScript) {
    consoleErrors.length = 0;
    await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname,'seed.js'),'utf8') });
    if (injectScript) await send('Page.addScriptToEvaluateOnNewDocument', { source: injectScript });
    await send('Page.navigate',{url:URL_APP});
    for(let i=0;i<80;i++){ if(await ev('document.readyState')==='complete') break; await sleep(250);}
    let mounted=false;
    for(let i=0;i<100;i++){ if(await ev(MOUNTED)) { mounted=true; break;} await sleep(250);}
    return { mounted, errors: [...consoleErrors] };
  }

  const results = [];

  // 1. Arranque limpio (control)
  let r = await loadWith(null);
  results.push({ caso: 'arranque limpio (control)', montada: r.mounted, errores: r.errors.length });

  // 2. Anchors con forma invalida
  r = await loadWith(`localStorage.setItem('${KEY_WIDTHS}', JSON.stringify({ 'Hoja 1': 'no-es-objeto' }));`);
  results.push({ caso: 'anchos con forma invalida', montada: r.mounted, errores: r.errors.length, detalle: r.errors[0] });

  // 3. JSON malformado
  r = await loadWith(`localStorage.setItem('${KEY_WIDTHS}', '{roto');`);
  results.push({ caso: 'anchos con JSON malformado', montada: r.mounted, errores: r.errors.length, detalle: r.errors[0] });

  // 4. Orden de columnas como array en vez de mapa
  r = await loadWith(`localStorage.setItem('${KEY_COL_ORDERS}', JSON.stringify([1,2,3]));`);
  results.push({ caso: 'orden de columnas como array', montada: r.mounted, errores: r.errors.length, detalle: r.errors[0] });

  // 5. Estado de modulo con valor string (el caso que esparcia indices)
  r = await loadWith(`localStorage.setItem('${KEY_MODULE_STATES}', JSON.stringify({ main: 'texto', events: 42 }));`);
  results.push({ caso: 'estado de modulo con valor no-objeto', montada: r.mounted, errores: r.errors.length, detalle: r.errors[0] });

  // 6. Varias corruptas a la vez
  r = await loadWith(`
    localStorage.setItem('${KEY_WIDTHS}', '{{{');
    localStorage.setItem('${KEY_COL_ORDERS}', 'null');
    localStorage.setItem('${KEY_MODULE_STATES}', JSON.stringify({ main: [1,2] }));
  `);
  results.push({ caso: 'varias claves corruptas a la vez', montada: r.mounted, errores: r.errors.length, detalle: r.errors[0] });

  console.log(JSON.stringify(results, null, 2));
  try{ws.close();}catch(e){} die(0);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });