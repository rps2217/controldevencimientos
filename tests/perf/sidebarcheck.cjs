/**
 * Verifica de punta a punta la Fase 2 en el Sidebar: los datos vienen del
 * contexto (fuente unica) y las props solo describen comportamiento.
 *
 * Observables (DOM real, sin instrumentar):
 *   1. Escritorio: existe el boton de colapso y la etiqueta "Modulos".
 *   2. Colapsar la oculta y el boton pasa a "Expandir".
 *   3. Navegar por el sidebar resalta la vista activa.
 *   4. Movil: el drawer abre forzado expandido y sin boton de colapso.
 *   5. Navegar desde el drawer lo cierra (onNavigate).
 *
 * Uso: node sidebarcheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = 9750 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2] || 'http://127.0.0.1:4173/';

function req(method, p) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}

(async () => {
  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--window-size=1600,1000',
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/sidebar-' + port, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch (e) {} process.exit(c); };

  let up = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); up = true; break; } catch (e) { await sleep(250); } }
  if (!up) return die(1);

  const t = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev2 = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };

  const steps = [];
  const check = (paso, ok, detail) => steps.push({ paso, ok: !!ok, detail });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  await send('Page.navigate', { url: URL_APP });

  // El dashboard exige montar: se espera a que aparezca el sidebar (lg:flex).
  const TRIGGER = `[...document.querySelectorAll('button')].some(b=>/Colapsar men\u00fa|Expandir men\u00fa/.test(b.getAttribute('title')||''))`;
  let mounted = false;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!(${TRIGGER})`)) { mounted = true; break; } await sleep(250); }
  if (!mounted) return die(1);
  await sleep(2000);

    const desktop = await ev2(`(() => {
      const b=[...document.querySelectorAll('button')].find(x=>/Colapsar men\u00fa|Expandir men\u00fa/.test(x.getAttribute('title')||''));
      return { collapseBtn: !!b, title: b && b.getAttribute('title') };
    })()`);
    check('escritorio: existe el boton de colapso/expansion', desktop.collapseBtn, desktop);

    // Se fuerza el estado expandido y se comprueba que muestra la etiqueta.
    await ev2(`(() => {
      const btn=()=>[...document.querySelectorAll('button')].find(x=>/Colapsar men\u00fa|Expandir men\u00fa/.test(x.getAttribute('title')||''));
      if(btn() && btn().getAttribute('title')==='Expandir men\u00fa') btn().click();
      return true;
    })()`);
    await sleep(600);
    const expanded = await ev2(`(() => {
      const b=[...document.querySelectorAll('button')].find(x=>/Colapsar men\u00fa|Expandir men\u00fa/.test(x.getAttribute('title')||''));
      return { still: !!b, title: b && b.getAttribute('title'), label: [...document.querySelectorAll('p')].some(p=>p.textContent.trim()==='M\u00f3dulos') };
    })()`);
    check('escritorio: expandir muestra la etiqueta Modulos y el boton sigue',
      expanded.still && expanded.title === 'Colapsar men\u00fa' && expanded.label, expanded);

    await ev2(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Colapsar men\u00fa/.test(x.getAttribute('title')||'')); b.click(); return true; })()`);
    await sleep(600);
    const collapsed = await ev2(`(() => {
      const b=[...document.querySelectorAll('button')].find(x=>/Colapsar men\u00fa|Expandir men\u00fa/.test(x.getAttribute('title')||''));
      return { still: !!b, title: b && b.getAttribute('title'), label: [...document.querySelectorAll('p')].some(p=>p.textContent.trim()==='M\u00f3dulos') };
    })()`);
    check('escritorio: colapsar oculta la etiqueta y el boton pasa a Expandir',
      collapsed.still && collapsed.title === 'Expandir men\u00fa' && !collapsed.label, collapsed);

  await ev2(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Expandir men\u00fa/.test(x.getAttribute('title')||'')); if(b) b.click(); return true; })()`);
  await ev2(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Expandir men\u00fa/.test(x.getAttribute('title')||'')); if(b) b.click(); return true; })()`);
  await sleep(600);
  const nav = await ev2(`(() => { const b=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null).find(x=>x.textContent.includes('Incidencias & FRC')); if(!b) return false; b.click(); return true; })()`);
  await sleep(1500);
  const view = await ev2(`!![...document.querySelectorAll('button')].find(x=>x.className.includes('bg-blue-600')&&x.textContent.trim().includes('Incidencias'))`);
  check('escritorio: navegar resalta la vista activa', nav && view, { nav, view });

  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL_APP });
  let mMounted = false;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!document.querySelector('[title="Abrir men\u00fa de navegaci\u00f3n"]')`)) { mMounted = true; break; } await sleep(250); }
  if (!mMounted) return die(1);
  await sleep(1500);

  const hamburger = await ev2(`(() => { const b=document.querySelector('[title="Abrir men\u00fa de navegaci\u00f3n"]'); if(!b) return false; b.click(); return true; })()`);
  await sleep(1000);
  const drawer = await ev2(`(() => {
    const open=[...document.querySelectorAll('span')].some(s=>s.offsetParent!==null && s.textContent.includes('Men\u00fa de Navegaci\u00f3n'));
    const collapse=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).find(b=>/Colapsar men\u00fa|Expandir men\u00fa/.test(b.getAttribute('title')||''));
    return { open, collapseHidden: !collapse };
  })()`);
  check('movil: drawer abre expandido y sin boton de colapso', hamburger && drawer.open && drawer.collapseHidden, { hamburger, ...drawer });

  const mnav = await ev2(`(() => { const b=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null).find(x=>x.textContent.includes('Incidencias & FRC')); if(!b) return false; b.click(); return true; })()`);
  await sleep(1200);
  const closed = await ev2(`![...document.querySelectorAll('span')].some(s=>s.offsetParent!==null && s.textContent.includes('Men\u00fa de Navegaci\u00f3n'))`);
  check('movil: navegar desde el drawer lo cierra (onNavigate)', mnav && closed, { mnav, closed });

  ws.close();
  console.log(JSON.stringify(steps, null, 2));
  const failed = steps.filter(s => !s.ok);
  console.log(failed.length ? `RESULTADO: FALLAN ${failed.length}` : 'RESULTADO: OK');
  die(failed.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
