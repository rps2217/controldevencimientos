/**
 * Mide la latencia percibida por tecla al escribir en el buscador.
 *
 * La metrica honesta no es "trabajo total del perfilador" (que incluye el
 * debounce y los renders posteriores), sino cuanto bloquea el hilo principal
 * cada pulsacion. Se mide el tiempo desde el keydown hasta que el navegador
 * vuelve a pintar. Ese es el numero que el usuario siente.
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const port = 9800 + Math.floor(Math.random() * 150);
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
  const chrome = spawn('/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+port,'--user-data-dir='+os.tmpdir()+'/lat-'+port,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch(e){} process.exit(c); };
  let ok=false; for(let i=0;i<60;i++){ try{ await httpReq('GET','/json/version'); ok=true; break;}catch(e){await sleep(250);} }
  if(!ok) return die(1);
  const target = JSON.parse(await httpReq('PUT','/json/new?about:blank'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0; const pend=new Map();
  ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}};
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value;};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname,'seed.js'),'utf8') });
  await send('Page.navigate',{url:process.argv[2]});
  for(let i=0;i<100;i++){ if(await ev(`document.querySelectorAll('[data-index]').length > 0`)) break; await sleep(250); }
  await sleep(600);

  // Instalar medidor: por cada tecla, tiempo hasta que el navegador vuelve a pintar.
  await ev(`(() => {
    window.__lat = [];
    const i = [...document.querySelectorAll('input')].find(x => /buscar|search/i.test(x.placeholder || ''));
    i.focus();
    window.__latInput = i;
    return true;
  })()`);

  const WORD = 'SKU-1001';
  const samples = [];
  for (const ch of WORD) {
    const t = await ev(`(async () => {
      const t0 = performance.now();
      const i = window.__latInput;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, i.value + ${JSON.stringify(ch)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t0;
    })()`);
    samples.push(t);
    await sleep(60);
  }

  const sorted = [...samples].sort((a,b)=>a-b);
  const med = sorted[Math.floor(sorted.length/2)];
  const p95 = sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*0.95)-1)];
  const max = sorted[sorted.length-1];
  console.log(JSON.stringify({
    palabra: WORD,
    muestras: samples.map(x=>Math.round(x)),
    medianaMs: Math.round(med),
    p95Ms: Math.round(p95),
    maxMs: Math.round(max)
  }, null, 2));
  try{ws.close();}catch(e){} die(0);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });