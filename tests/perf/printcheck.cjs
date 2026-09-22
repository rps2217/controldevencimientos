/**
 * Verificacion funcional de la impresion: intercepta window.print() y comprueba
 * que el ticket esta montado con contenido en el momento del disparo. Gatear el
 * montaje de TicketPrintView no debe romper la impresion (el DOM debe existir
 * antes de window.print()).
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const URL_APP = process.argv[2];
const PORT = 9500 + Math.floor(Math.random() * 100);
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
  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+PORT,'--user-data-dir='+require('os').tmpdir()+'/printcheck-'+PORT,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch(e){} process.exit(c); };
  let ok=false; for(let i=0;i<60;i++){ try{ await req('GET','/json/version'); ok=true; break;}catch(e){await sleep(250);} }
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:fs.readFileSync(path.join(__dirname,'seed.js'),'utf8')});
  // Interceptar print y registrar el estado del ticket EN EL MOMENTO del disparo.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__printCalls = 0;
    window.__printProbe = null;
    const realPrint = window.print ? window.print.bind(window) : () => {};
    window.print = () => {
      window.__printCalls++;
      const el = document.getElementById('thermal-ticket-root');
      window.__printProbe = {
        exists: !!el,
        visibleText: el ? el.innerText.slice(0, 120) : null,
        rowCount: el ? el.querySelectorAll('[data-print-row], .break-inside-avoid').length : 0,
        display: el ? getComputedStyle(el).display : null,
      };
      // No abrir el dialogo real en headless.
    };
  `});
  await send('Page.navigate',{url:URL_APP});
  for(let i=0;i<80;i++){ if(await ev('document.readyState')==='complete') break; await sleep(250);}
  for(let i=0;i<120;i++){ if(await ev(`!!document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`)) break; await sleep(250);}
  await sleep(3000);

  const rows = await ev(`document.querySelectorAll('tbody tr').length`);
  console.log('filas en tabla:', rows);

  // Seleccionar la primera fila con su checkbox.
  const selected = await ev(`(() => {
    const cb = document.querySelector('tbody tr input[type=checkbox]');
    if (!cb) return false;
    cb.click();
    return true;
  })()`);
  await sleep(600);
  console.log('checkbox de fila pulsado:', selected, '| seleccionadas:', await ev(`[...document.querySelectorAll('tbody tr input[type=checkbox]')].filter(c=>c.checked).length`));

  // Buscar boton de imprimir en la barra flotante de acciones masivas.
  const printBtn = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /imprimir|ticket|print/i.test((x.getAttribute('title')||'') + ' ' + (x.textContent||'')));
    if (!b) return null;
    b.scrollIntoView({block:'center'});
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2, label: (b.getAttribute('title')||b.textContent||'').trim().slice(0,40) };
  })()`);
  console.log('boton imprimir:', printBtn ? printBtn.label : 'NO ENCONTRADO');

  if (printBtn) {
    for (const type of ['mousePressed','mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: printBtn.x, y: printBtn.y, button: 'left', clickCount: 1 });
    }
    await sleep(400);
    const probe = await ev('JSON.stringify({calls: window.__printCalls, probe: window.__printProbe})');
    console.log('resultado al disparar print:', probe);
  }
  try{ws.close();}catch(e){} die(0);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });