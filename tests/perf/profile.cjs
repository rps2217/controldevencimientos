/**
 * Perfila la app en Chromium real via CDP, sin Playwright ni Puppeteer.
 *
 * Uso: node profile.cjs <url> <out.json> [repeticiones]
 *
 * - Inyecta el hook de DevTools y el sembrado de localStorage antes del primer
 *   script de la pagina.
 * - Espera a que no haya commits durante 1.5s (estado ocioso) antes de medir,
 *   para no contaminar las acciones con la carga inicial.
 * - Los clics se despachan como eventos de raton reales sobre el rect del
 *   elemento, no con .click(): asi se comporta como un usuario y se evitan
 *   referencias a nodos ya reemplazados por React.
 * - Reporta commitSpanMs (tiempo entre el primer y el ultimo commit de la
 *   accion), que es trabajo real de render y no incluye la espera del script.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const URL_APP = process.argv[2];
const OUT = process.argv[3] || path.join(require('os').tmpdir(), 'perf-out.json');
const REPS = Number(process.argv[4] || 3);
const PORT = 9800 + Math.floor(Math.random() * 150);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function req(method, urlPath) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.consoleErrors = []; }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') {
        c.consoleErrors.push('EXCEPTION: ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 200));
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        c.consoleErrors.push('CONSOLE: ' + (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
    return r.result?.value;
  }
  async clickButton(re) {
    const box = await this.eval(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => ${re}.test(x.textContent || ''));
      if (!b) return null;
      b.scrollIntoView({block:'center'});
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) return false;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    }
    return true;
  }
}

(async () => {
  const chrome = spawn('/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--disable-extensions', '--window-size=1600,1000',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + require('os').tmpdir() + '/perf-profile-' + PORT, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = async code => { try { chrome.kill('SIGKILL'); } catch (e) {} process.exit(code); };

  let ok = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); ok = true; break; } catch (e) { await sleep(250); } }
  if (!ok) { console.error('Chromium no respondio'); return die(1); }

  const target = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const cdp = await CDP.connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'hook.js'), 'utf8') });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  await cdp.send('Page.navigate', { url: URL_APP });

  for (let i = 0; i < 80; i++) { if (await cdp.eval('document.readyState') === 'complete') break; await sleep(250); }

  // Esperar a que el dashboard monte de verdad. Sin esto, "ocioso" se cumple
  // antes del primer render (commits=0 ya parece estable) y se mide en vacio.
  const MOUNTED = `!!document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`;
  for (let i = 0; i < 120; i++) { if (await cdp.eval(MOUNTED)) break; await sleep(250); }

  // Esperar estado ocioso: sin commits nuevos durante 1.5s.
  let last = -1, stable = 0, idleIter = 0;
  for (let i = 0; i < 160 && stable < 6; i++) {
    await sleep(250);
    idleIter = i;
    const c = await cdp.eval('window.__probe ? window.__probe.snapshot().commits : -1');
    stable = c === last && c >= 0 ? stable + 1 : 0;
    last = c;
  }

  const report = {
    url: URL_APP,
    reactHookInstalled: await cdp.eval('!!window.__probe && window.__probe.hasReact()'),
    tableRendered: await cdp.eval(`!!document.querySelector('table, [data-index]')`),
    visibleRows: await cdp.eval(`document.querySelectorAll('[data-index]').length || document.querySelectorAll('tbody tr').length`),
    idleAfterMs: idleIter * 250,
    actions: [],
    consoleErrors: [],
  };

  const isDrawerOpen = () => cdp.eval(`!!document.querySelector('[title="Cerrar panel lateral"]')`);
  async function clickSel(sel) {
    const box = await cdp.eval(`(() => {
      const b = document.querySelector(${JSON.stringify(sel)});
      if (!b) return null;
      b.scrollIntoView({block:'center'});
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    })()`);
    if (!box) return false;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    }
    return true;
  }
  // Cambia el estado del panel y confirma que efectivamente cambio.
  async function setDrawer(open) {
    const before = await isDrawerOpen();
    if (before === open) return { changed: false, clicked: false };
    const clicked = open ? await cdp.clickButton(/Vistas & Ajustes/) : await clickSel('[title="Cerrar panel lateral"]');
    await sleep(350);
    const after = await isDrawerOpen();
    return { changed: after !== before, clicked, before, after };
  }

  async function measure(name, clickExpr) {
    await cdp.eval('window.__probe.reset(); window.__tblRenders=0; window.__rowRenders=0;');
    const interacted = await clickExpr();
    await sleep(600);
    const s = JSON.parse(await cdp.eval('JSON.stringify(window.__probe.snapshot())'));
    const tc = parseInt(await cdp.eval('String(window.__tblRenders)'), 10);
    const rc = parseInt(await cdp.eval('String(window.__rowRenders)'), 10);
    const cells = s.byName.filter(x => /^(tr|td|div|button)$/.test(x.name)).reduce((a, x) => a + x.renders, 0);
    report.actions.push({
      name, interacted,
      commits: s.commits,
      renderedFibers: s.renderedFibers,
      commitSpanMs: s.commitSpanMs,
      domRenders: cells,
      top: s.byName.slice(0, 10),
      all: s.byName,
      commitDetail: s.commitsDetail,
      tableRenders: tc,
      rowRenders: rc,
    });
  }

  // Accion pura de UI: abrir y cerrar "Vistas & Ajustes". No toca datos, asi que
  // cualquier re-render de filas aqui delata memoizacion rota. Se verifica que el
  // estado del panel realmente cambie; si no, la medicion se descarta.
  for (let i = 0; i < REPS; i++) {
    const open = i % 2 === 0;
    let st = null;
    await measure(`${open ? 'abrir' : 'cerrar'} Vistas&Ajustes #${i + 1}`, async () => { st = await setDrawer(open); return st.changed; });
    report.actions[report.actions.length - 1].drawer = st;
    await sleep(250);
  }

  // Escenario de tecleo: caso opuesto al anterior. Abrir un panel NO cambia el
  // value (0 renders tras Fase 1.1); escribir SI cambia datos y filtros. Mide el
  // coste percibido real de cada tecla y si memoizar el value lo bajaria.
  async function typeSearch(text) {
    const focused = await cdp.eval(`(() => {
      const i = [...document.querySelectorAll('input')].find(x => /buscar|search/i.test(x.placeholder || ''));
      if (!i) return false;
      i.focus();
      return true;
    })()`);
    if (!focused) return false;
    for (const ch of text) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: ch });
      await sleep(80);
    }
    return true;
  }
  for (let i = 0; i < REPS; i++) {
    const before = await cdp.eval(`document.querySelectorAll('[data-index]').length`);
    let typed = false;
    await measure(`teclear busqueda #${i + 1}`, async () => { typed = await typeSearch('PARA'); return typed; });
    report.actions[report.actions.length - 1].rowsBefore = before;
    report.actions[report.actions.length - 1].rowsAfter = await cdp.eval(`document.querySelectorAll('[data-index]').length`);
    // Limpiar para dejar el estado como estaba y no contaminar la vuelta siguiente.
    await cdp.eval(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Limpiar b/.test(x.getAttribute('title') || '')); if (b) b.click(); })()`);
    await sleep(300);
  }

  report.consoleErrors = cdp.consoleErrors.slice(0, 20);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('Resultado escrito en ' + OUT);
  await die(0);
})().catch(e => { console.error('Fallo el perfilado:', e.message); process.exit(1); });