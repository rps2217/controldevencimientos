/**
 * Verifica que el buscador sigue filtrando tras hacer el input no controlado.
 *
 * El riesgo del cambio es real: al desacoplar el input del estado del contexto,
 * un error tipico es que el texto se vea pero el filtro nunca se aplique (o al
 * reves). Esta prueba escribe en el input y exige que la tabla cambie. No usa
 * el perfilador: comprueba comportamiento, no milisegundos.
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const port = 9600 + Math.floor(Math.random() * 200);
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
  const chrome = spawn('/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+port,'--user-data-dir='+os.tmpdir()+'/fc-'+port,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: require('fs').readFileSync(require('path').join(__dirname,'seed.js'),'utf8') });
  await send('Page.navigate',{url:process.argv[2]});
  // Esperar a que la tabla este realmente renderizada: medir antes daria un
  // baseline falso (0 filas) y la comparacion seria invalida.
  for(let i=0;i<100;i++){ if(await ev(`!!document.querySelector('input[placeholder*="Buscar"]') && document.querySelectorAll('[data-index]').length > 0`)) break; await sleep(250); }
  await sleep(400);

  const FIND = `(() => {
    const i = [...document.querySelectorAll('input')].find(x => /buscar|search/i.test(x.placeholder || ''));
    i.focus();
    return i.value;
  })()`;
  const SET = v => `(() => {
    const i = [...document.querySelectorAll('input')].find(x => /buscar|search/i.test(x.placeholder || ''));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(i, ${JSON.stringify(v)});
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return i.value;
  })()`;
  const ROWS = `document.querySelectorAll('[data-index]').length`;

  const out = [];
  const initial = await ev(ROWS);
  out.push({ paso: 'filas iniciales', filas: initial });

  // 1. Escribir un SKU existente: la tabla debe reducirse.
  await ev(FIND);
  await ev(SET('SKU-1001'));
  await sleep(900);
  const filtered = await ev(ROWS);
  out.push({ paso: 'tras buscar "SKU-1001"', filas: filtered, filtroAplicado: filtered < initial });

  // 2. El input refleja lo tecleado (no se queda vacio).
  const shown = await ev(FIND);
  out.push({ paso: 'texto visible en el input', valor: shown });

  // 3. Reinicio programatico (equivalente a "Limpiar filtros" o cambio de modulo):
  //    el input debe vaciarse y la tabla volver.
  await ev(SET(''));
  await sleep(900);
  const restored = await ev(ROWS);
  out.push({ paso: 'tras limpiar', filas: restored, restored: restored === initial });

  // 4. Caso de mas riesgo del input no controlado: el boton global "Limpiar todos
  //    los filtros" (que vive en el dashboard y llama setSearchTerm('')) debe
  //    vaciar el input. Si la sincronizacion externa no funcionara, el texto se
  //    quedaria en pantalla mientras la tabla ya no filtra: incoherencia visible.
  await ev(FIND);
  await ev(SET('SKU-1001'));
  await sleep(900);
  const beforeClearBtn = await ev(ROWS);
  const clicked = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.title === 'Limpiar todos los filtros aplicados');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(900);
  const afterClearBtn = await ev(ROWS);
  const inputValue = await ev(FIND);
  out.push({
    paso: 'boton Limpiar todos los filtros',
    botonEncontrado: clicked,
    filasAntes: beforeClearBtn,
    filasDespues: afterClearBtn,
    inputVacio: inputValue === '',
    coherente: clicked && afterClearBtn === initial && inputValue === ''
  });

  console.log(JSON.stringify(out, null, 2));
  const okAll = filtered < initial && shown === 'SKU-1001' && restored === initial
    && clicked && afterClearBtn === initial && inputValue === '';
  console.log(okAll ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try{ws.close();}catch(e){} die(okAll?0:1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });