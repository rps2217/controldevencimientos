/**
 * Mide cuantos de los ~201 miembros del value del contexto cambian por accion.
 * Si un useMemo no puede estabilizar el value en acciones de UI, memoizar el
 * value (Fase 1.2) no puede rendir por si solo.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const URL_APP = process.argv[2];
const PORT = 9700 + Math.floor(Math.random() * 150);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function req(method, urlPath) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}
(async () => {
  const chrome = spawn('/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+PORT,'--user-data-dir='+require('os').tmpdir()+'/ctxdiff-'+PORT,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch(e){} process.exit(c); };
  let ok=false; for (let i=0;i<60;i++){ try{ await req('GET','/json/version'); ok=true; break;}catch(e){await sleep(250);} }
  if(!ok) return die(1);
  const target = JSON.parse(await req('PUT','/json/new?about:blank'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0; const pend=new Map();
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}};
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value;};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:fs.readFileSync(path.join(__dirname,'hook.js'),'utf8')});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:fs.readFileSync(path.join(__dirname,'seed.js'),'utf8')});
  await send('Page.navigate',{url:URL_APP});
  for(let i=0;i<80;i++){ if(await ev('document.readyState')==='complete') break; await sleep(250);}
  const MOUNTED=`!!document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`;
  for(let i=0;i<120;i++){ if(await ev(MOUNTED)) break; await sleep(250);}
  let last=-1,stable=0; for(let i=0;i<160&&stable<6;i++){ await sleep(250); const c=await ev('window.__probe?window.__probe.snapshot().commits:-1'); stable=(c===last&&c>=0)?stable+1:0; last=c; }

  const reset = () => ev('window.__ctxChangedLog=[]; window.__ctxRenders=0; window.__ctxChangedTotal=0; 1');
  const read = async () => JSON.parse(await ev('JSON.stringify({renders: window.__ctxRenders, total: window.__ctxChangedTotal, log: window.__ctxChangedLog})'));
  async function typeSearch(text){
    const box = await ev(`(()=>{const i=[...document.querySelectorAll('input')].find(x=>/buscar|search/i.test(x.placeholder||'')); if(!i)return null; i.focus(); const r=i.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    if(!box) return false;
    for(const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
    for(const ch of text) await send('Input.dispatchKeyEvent',{type:'char',text:ch});
    return true;
  }
  async function clickTitle(re){
    const box = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>${re}.test(x.getAttribute('title')||'')); if(!b)return null; b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    if(!box) return false;
    for(const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
    return true;
  }
  const report = { members: await ev('window.__ctxPrev?Object.keys(window.__ctxPrev).length:0'), actions: [] };
  async function run(name, fn){
    await reset(); const acted = await fn(); await sleep(600);
    const r = await read();
    report.actions.push({ name, acted, renders:r.renders, changedTotal:r.total, changed: r.log.length?r.log[r.log.length-1]:[] });
  }
  await run('abrir Vistas&Ajustes', ()=>clickTitle(/Abrir Panel Lateral de Control/));
  await run('cerrar Vistas&Ajustes', ()=>clickTitle(/Cerrar panel lateral/));
  await run('escribir busqueda PARA', ()=>typeSearch('PARA'));
  await run('limpiar busqueda', ()=>clickTitle(/Limpiar busca/));
  console.log(JSON.stringify(report, null, 2));
  try{ws.close();}catch(e){} die(0);
})();