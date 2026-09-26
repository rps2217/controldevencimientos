/**
 * Verificacion del ida y vuelta ONLINE de las rutas de mutacion: crear, editar
 * y eliminar contra un backend vivo, y relectura tras recargar.
 *
 * Por que existe: `mutcheck.cjs` prueba las mismas tres operaciones con el
 * backend INALCANZABLE, asi que solo ejercita el camino de encolado offline.
 * El backend falso respondia `success: true` a cualquier escritura, de modo que
 * un `appendRow`/`updateRow`/`deleteRow` roto (o perdido) no se distinguia de
 * uno correcto. Aqui el backend persiste en memoria y se RECARGA la pagina: si
 * el dato sobrevive, la escritura llego de verdad al backend y volvio a leerse.
 *
 * Casos:
 *   1. Crear:  el SKU nuevo se guarda y sigue ahi tras recargar.
 *   2. Editar: la descripcion cambia y el cambio sobrevive a la recarga.
 *   3. Eliminar: la fila desaparece y no vuelve tras recargar.
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const port = 9300 + Math.floor(Math.random() * 90);
const FAKE_PORT = Number(process.argv[3] || 9100);
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
  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+port,'--user-data-dir='+os.tmpdir()+'/wc-'+port,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch(e){} process.exit(c); };
  let ok=false; for(let i=0;i<60;i++){ try{ await httpReq('GET','/json/version'); ok=true; break;}catch(e){await sleep(250);} }
  if(!ok) return die(1);
  const target = JSON.parse(await httpReq('PUT','/json/new?about:blank'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0; const pend=new Map(); const diag=[];
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error') diag.push(m.params.args.map(a=>a.value||a.description).join(' ').slice(0,160));
    if(m.method==='Runtime.exceptionThrown') diag.push('EXC:'+(m.params?.exceptionDetails?.exception?.description||'').slice(0,160));
    if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}
  };
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value;};

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  // Backend vivo: la app NO cae a modo demo, asi que cada mutacion viaja al
  // servidor y la relectura tras recargar prueba que se persistio alli.
  const seed = `(function () {
    try {
      localStorage.setItem('appsheet_clone_scriptUrl', 'http://127.0.0.1:${FAKE_PORT}/exec');
      localStorage.setItem('appsheet_clone_securityToken', '');
      localStorage.setItem('appsheet_clone_config', JSON.stringify({ main: 'Vencimientos_Inventario' }));
    } catch (e) {}
  })();`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: seed });

  const SEARCH = v => `(() => {
    const i = [...document.querySelectorAll('input')].find(x => /buscar|search/i.test(x.placeholder || ''));
    if (!i) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(i, ${JSON.stringify(v)});
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return i.value;
  })()`;
  const ROWS = `document.querySelectorAll('[data-index]').length`;
  const ROW_TEXTS = `[...document.querySelectorAll('[data-index]')].map(r => r.innerText).join('\\n')`;
  const setField = (name, value) => `(() => {
    const el = document.querySelector('input[name=' + JSON.stringify(${JSON.stringify(name)}) + '], textarea[name=' + JSON.stringify(${JSON.stringify(name)}) + ']');
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`;
  const clickText = re => `(() => {
    const b = [...document.querySelectorAll('button')].find(x => new RegExp(${JSON.stringify(re)}, 'i').test((x.textContent || '') + ' ' + (x.getAttribute('title') || '')));
    if (!b) return false; b.click(); return true;
  })()`;
  const clickConfirm = () => `(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.autofocus === true || x.getAttribute('autofocus') !== null)
      || [...document.querySelectorAll('button')].reverse().find(x => (x.textContent || '').trim() === 'Eliminar');
    if (!b) return false; b.click(); return true;
  })()`;
  const READY = `!!document.querySelector('input[placeholder*="Buscar"]') && document.querySelectorAll('[data-index]').length > 0`;

  async function mount() {
    await send('Page.navigate',{url:process.argv[2]});
    for(let i=0;i<140;i++){ if(await ev(READY)) break; await sleep(250); }
    await sleep(1000);
  }

  await mount();
  const out = [];
  const SKU = 'SKU-WRITE-1';

  // ---------- CREAR ----------
  const opened = await ev(clickText('Nuevo Vencimiento|Nuevo Registro'));
  await sleep(700);
  await ev(setField('SKU', SKU));
  await ev(setField('DESCRIPCION', 'Creado contra backend vivo'));
  await ev(setField('CANTIDAD', '7'));
  await sleep(200);
  const submitted = await ev(clickText('Guardar en Sheet|Actualizar Fila'));
  await sleep(2000);
  await ev(SEARCH(SKU)); await sleep(1000);
  const creadoVisible = await ev(ROWS);
  out.push({ paso:'CREATE (llega al backend)', botonNuevo:opened, submit:submitted, filas:creadoVisible,
             ok: opened && submitted && creadoVisible === 1 });

  // ---------- RECARGA: persistio en el backend ----------
  await mount();
  await ev(SEARCH(SKU)); await sleep(1400);
  const creadoTrasRecarga = await ev(ROWS);
  out.push({ paso:'CREATE (persiste tras recargar)', filas:creadoTrasRecarga, ok: creadoTrasRecarga === 1 });

  // ---------- EDITAR ----------
  const rowOpened = await ev(`(() => { const r = document.querySelector('[data-index]'); if (!r) return false; r.click(); return true; })()`);
  await sleep(900);
  const editClicked = await ev(clickText('Editar registro'));
  await sleep(900);
  const NEW_DESC = 'EDITADO CONTRA BACKEND VIVO';
  await ev(setField('DESCRIPCION', NEW_DESC));
  await sleep(200);
  const submitEdit = await ev(clickText('Actualizar Fila|Guardar en Sheet'));
  await sleep(2000);
  await ev(SEARCH(SKU)); await sleep(1000);
  const trasEdit = await ev(ROW_TEXTS);
  out.push({ paso:'UPDATE (llega al backend)', botonEditar:editClicked, submit:submitEdit, ok: rowOpened && editClicked && submitEdit && trasEdit.includes(NEW_DESC) });

  // ---------- RECARGA: persistio la edicion ----------
  await mount();
  await ev(SEARCH(SKU)); await sleep(1400);
  const editTrasRecarga = await ev(ROW_TEXTS);
  out.push({ paso:'UPDATE (persiste tras recargar)', ok: editTrasRecarga.includes(NEW_DESC),
             vista: editTrasRecarga.replace(/\s+/g,' ').slice(0,110) });

  // ---------- ELIMINAR ----------
  const rowOpened2 = await ev(`(() => { const r = document.querySelector('[data-index]'); if (!r) return false; r.click(); return true; })()`);
  await sleep(900);
  const delClicked = await ev(clickText('^Eliminar$|Eliminar registro'));
  await sleep(600);
  const confirmVisible = await ev(`document.body.innerText.includes('Eliminar fila')`);
  const confirmed = await ev(clickConfirm());
  await sleep(2200);
  await ev(SEARCH(SKU)); await sleep(1000);
  const trasDelete = await ev(ROWS);
  out.push({ paso:'DELETE (llega al backend)', botonEliminar:delClicked, dialogo:confirmVisible, confirmado:confirmed,
             filas:trasDelete, ok: rowOpened2 && delClicked && confirmVisible && confirmed && trasDelete === 0 });

  // ---------- RECARGA: persistio el borrado ----------
  await mount();
  await ev(SEARCH(SKU)); await sleep(1400);
  const trasDeleteRecarga = await ev(ROWS);
  out.push({ paso:'DELETE (persiste tras recargar)', filas:trasDeleteRecarga, ok: trasDeleteRecarga === 0 });

  console.log(JSON.stringify(out, null, 2));
  if (diag.length) console.log('ERRORES CONSOLA:', JSON.stringify([...new Set(diag)].slice(0,6)));
  const allOk = out.every(o=>o.ok);
  console.log(allOk ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try{ws.close();}catch(e){}
  die(allOk?0:1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
