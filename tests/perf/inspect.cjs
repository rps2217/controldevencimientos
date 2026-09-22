/**
 * Vuelca el estado visible de la app (botones, encabezados y un extracto de
 * texto) para saber que pantalla se esta renderizando antes de perfilar.
 * Uso: node inspect.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');

const URL_APP = process.argv[2];
const PORT = 9600 + Math.floor(Math.random() * 200);
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
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(u) {
    const ws = new WebSocket(u);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result?.value;
  }
}

(async () => {
  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--no-first-run', '--window-size=1600,1000',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/cdp/inspect-profile-' + PORT, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore'] });

  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); break; } catch (e) { await sleep(250); } }
  const t = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const cdp = await CDP.connect(t.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const fs = require('fs');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(__dirname + '/seed.js', 'utf8') });
  await cdp.send('Page.navigate', { url: URL_APP });
  await sleep(5000);

  const info = await cdp.eval(`JSON.stringify({
    title: document.title,
    bodyLen: document.body.innerText.length,
    buttons: [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim().slice(0,40)).filter(Boolean).slice(0,40),
    headings: [...document.querySelectorAll('h1,h2,h3')].map(h => (h.textContent||'').trim().slice(0,60)).slice(0,15),
    text: document.body.innerText.replace(/\\s+/g,' ').slice(0, 700),
    tables: document.querySelectorAll('table').length,
    roleRows: document.querySelectorAll('[role="row"]').length,
    dataIndex: document.querySelectorAll('[data-index]').length
  })`);
  const d = JSON.parse(info);
  console.log('Titulo:', d.title, '| bodyLen:', d.bodyLen);
  console.log('Tablas:', d.tables, '| role=row:', d.roleRows, '| data-index:', d.dataIndex);
  console.log('\nEncabezados:', d.headings.join(' | '));
  console.log('\nBotones:');
  d.buttons.forEach(b => console.log('  -', b));
  console.log('\nTexto visible:\n', d.text);
  chrome.kill('SIGKILL');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });