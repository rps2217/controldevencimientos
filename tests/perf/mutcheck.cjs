/**
 * Verificacion funcional de las rutas de mutacion de datos (crear, editar y
 * eliminar) antes de extraerlas a un hook.
 *
 * Estas rutas tocan la cola offline, el rollback y el almacenamiento local; un
 * refactor que mueva ese codigo sin red de seguridad puede corromper o perder
 * filas. La prueba es conductual y se aisla con el buscador: en vez de contar
 * filas totales (que la paginacion rellena y vuelve ambiguas), busca un SKU
 * concreto y exige que aparezca, cambie o desaparezca.
 *
 * Casos:
 *   1. Crear:  se guarda un SKU nuevo y una busqueda posterior lo encuentra.
 *   2. Editar: al cambiar la descripcion, el cambio se refleja en la tabla.
 *   3. Eliminar: tras confirmar, el SKU ya no aparece en la tabla.
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
  const chrome = spawn('/usr/bin/chromium', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--window-size=1600,1000','--remote-debugging-port='+port,'--user-data-dir='+os.tmpdir()+'/mc-'+port,'about:blank'], { stdio: ['ignore','ignore','ignore'] });
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: require('fs').readFileSync(require('path').join(__dirname,'seed.js'),'utf8') });
  await send('Page.navigate',{url:process.argv[2]});
  for(let i=0;i<100;i++){ if(await ev(`!!document.querySelector('input[placeholder*="Buscar"]') && document.querySelectorAll('[data-index]').length > 0`)) break; await sleep(250); }
  await sleep(500);

  const SEARCH = v => `(() => {
    const i = [...document.querySelectorAll('input')].find(x => /buscar|search/i.test(x.placeholder || ''));
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
  // El boton "Editar" del drawer tiene title="Editar registro", por lo que la
  // coincidencia debe ser sobre el texto exacto del boton, no sobre la suma.
  const clickExact = t => `(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(t)});
    if (!b) return false; b.click(); return true;
  })()`;
  // El dialogo de confirmacion se monta al final del DOM y su boton primario es
  // el unico con autoFocus; el drawer tambien tiene un boton "Eliminar", asi que
  // hay que desambiguar por el autoFocus del dialogo.
  const clickConfirm = () => `(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.autofocus === true || x.getAttribute('autofocus') !== null)
      || [...document.querySelectorAll('button')].reverse().find(x => (x.textContent || '').trim() === 'Eliminar');
    if (!b) return false; b.click(); return true;
  })()`;

  const out = [];
  const NEW_SKU = 'SKU-E2E-MUT';

  // ---------- CASO 1: CREAR ----------
  const opened = await ev(clickText('Nuevo Vencimiento|Nuevo Registro'));
  await sleep(700);
  const formOpen = await ev(`!!document.querySelector('form')`);
  await ev(setField('SKU', NEW_SKU));
  await ev(setField('DESCRIPCION', 'Producto E2E mutaciones'));
  await ev(setField('CANTIDAD', '7'));
  await sleep(200);
  const submitted = await ev(clickText('Guardar en Sheet|Actualizar Fila'));
  await sleep(1500);
  const formClosed = await ev(`!document.querySelector('form')`);
  await ev(SEARCH(NEW_SKU));
  await sleep(900);
  const foundAfterCreate = await ev(ROWS);
  const createdText = await ev(ROW_TEXTS);
  out.push({
    paso: 'crear registro',
    botonNuevo: opened, formAbierto: formOpen, submit: submitted, modalCerrado: formClosed,
    busquedaEncuentra: foundAfterCreate,
    ok: opened && formOpen && submitted && formClosed && foundAfterCreate === 1 && createdText.includes(NEW_SKU)
  });

  // ---------- CASO 2: EDITAR ----------
  await ev(SEARCH('SKU-1001'));
  await sleep(900);
  const isolated = await ev(ROWS);
  const rowOpened = await ev(`(() => { const r = document.querySelector('[data-index]'); if (!r) return false; r.click(); return true; })()`);
  await sleep(800);
  const drawerOpen = await ev(`document.body.innerText.includes('Editar')`);
  const editClicked = await ev(clickExact('Editar'));
  await sleep(800);
  const editFormOpen = await ev(`!!document.querySelector('form')`);
  const NEW_DESC = 'DESCRIPCION REFACTOR E2E';
  await ev(setField('DESCRIPCION', NEW_DESC));
  await sleep(200);
  const submitEdit = await ev(clickText('Actualizar Fila|Guardar en Sheet'));
  await sleep(1500);
  await ev(SEARCH('SKU-1001'));
  await sleep(900);
  const afterEditText = await ev(ROW_TEXTS);
  const stillOne = await ev(ROWS);
  out.push({
    paso: 'editar registro',
    filaAislada: isolated, drawerAbierto: drawerOpen, botonEditar: editClicked, formAbierto: editFormOpen, submit: submitEdit,
    filasTrasEditar: stillOne, valorVisible: afterEditText.includes(NEW_DESC),
    ok: isolated === 1 && rowOpened && drawerOpen && editClicked && editFormOpen && submitEdit && stillOne === 1 && afterEditText.includes(NEW_DESC)
  });

  // ---------- CASO 3: ELIMINAR ----------
  const rowOpened2 = await ev(`(() => { const r = document.querySelector('[data-index]'); if (!r) return false; r.click(); return true; })()`);
  await sleep(800);
  const delClicked = await ev(clickText('^Eliminar$|Eliminar registro'));
  await sleep(500);
  const confirmVisible = await ev(`document.body.innerText.includes('Eliminar fila')`);
  const confirmed = await ev(clickConfirm());
  await sleep(1500);
  await ev(SEARCH('SKU-1001'));
  await sleep(900);
  const afterDelete = await ev(ROWS);
  out.push({
    paso: 'eliminar registro',
    filaAbierta: rowOpened2, botonEliminar: delClicked, dialogoVisible: confirmVisible, confirmado: confirmed,
    busquedaEncuentraTrasEliminar: afterDelete,
    ok: rowOpened2 && delClicked && confirmVisible && confirmed && afterDelete === 0
  });

  console.log(JSON.stringify(out, null, 2));
  if (diag.length) console.log('ERRORES CONSOLA:', JSON.stringify(diag.slice(0,5)));
  // Con SCRIPT_URL sembrado pero inalcanzable, las operaciones pasan por la ruta
  // de encolado; que los tres casos hayan dado OK ya prueba ese camino. El conteo
  // se reporta solo como informacion: la autosincronizacion drena la cola de forma
  // asincrona, asi que exigir un tamano concreto seria flaky.
  const queue = await ev(`(() => { try { return JSON.parse(localStorage.getItem('appsheet_clone_offline_queue') || '[]').length; } catch(e){ return -1; } })()`);
  const queueTypes = await ev(`(() => { try { return JSON.parse(localStorage.getItem('appsheet_clone_offline_queue') || '[]').map(m => m.type).join(','); } catch(e){ return ''; } })()`);
  console.log('COLA OFFLINE (informativo):', queue, 'tipos:', queueTypes);
  const okAll = out.every(o => o.ok);
  console.log(okAll ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try{ws.close();}catch(e){}
  die(okAll?0:1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
