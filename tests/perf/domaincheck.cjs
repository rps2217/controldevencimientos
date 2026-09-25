/**
 * Invariante de separacion de dominios: el radar de Vencimientos y el registro de
 * Incidencias & FRC son una particion estricta del inventario, y `VENC. CERC.` es un
 * evento FRC (mercaderia recibida con poca vida util), no una categoria de vencimiento.
 *
 * Antes, la pildora «Todas» del radar contaba filas crudas de la hoja (`items.length`)
 * mientras la tabla si filtraba por dominio: se veia "Mostrando 2 de 5" con las 3
 * filas ausentes, y las 2 visibles eran justamente incidencias FRC (`VENC. CERC.`).
 *
 * Lo que este arnes exige, en la app real y en modo demostracion:
 *   1. En Vencimientos: ninguna fila del DOM es un codigo FRC y la pildora «Todas»
 *      coincide con las filas visibles (no puede volver a mentir).
 *   2. En Incidencias & FRC: `VENC. CERC.` SI aparece (se movio de dominio, no se
 *      perdio), y la pildora «Todas» coincide con sus filas visibles.
 *
 * Uso: node domaincheck.cjs <url>
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

const port = 9750 + Math.floor(Math.random() * 50);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_APP = process.argv[2];

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
    '--remote-debugging-port=' + port, '--user-data-dir=' + os.tmpdir() + '/domain-' + port, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const die = c => { try { chrome.kill('SIGKILL'); } catch (e) {} process.exit(c); };

  let up = false;
  for (let i = 0; i < 60; i++) { try { await req('GET', '/json/version'); up = true; break; } catch (e) { await sleep(250); } }
  if (!up) return die(1);

  const t = JSON.parse(await req('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  const consoleErrors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params?.exceptionDetails?.exception?.description?.slice(0, 200) || 'excepcion');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push((m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200));
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev2 = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  // Modo demostracion + hoja mixta: un SCRIPT_URL que no responde fuerza el fallback y
  // se siembra la hoja de vencimientos con filas de vencimiento PURO y filas con codigo
  // FRC. Esa mezcla es justamente lo que el gate debe separar; con solo filas puras el
  // arnes no distinguiria un gate correcto de uno revertido.
  const seed = `(function () {
    try {
      localStorage.setItem('appsheet_clone_scriptUrl', 'http://127.0.0.1:9/exec');
      localStorage.setItem('appsheet_clone_securityToken', '');
      localStorage.setItem('appsheet_clone_config', JSON.stringify({}));
      var mesclada = [
        { _rowIndex: 2, SKU: 'SKU-V1', DESCRIPCION: 'Vencimiento puro 1', LOTE: 'L-1', FECHA_VENCIMIENTO: '2027-01-10', CANTIDAD: '10', PROVEEDOR: 'P1', FRC_EVEN: '', N_TRASPASO: '', OBSERVACION: 'ok' },
        { _rowIndex: 3, SKU: 'SKU-V2', DESCRIPCION: 'Vencimiento puro 2', LOTE: 'L-2', FECHA_VENCIMIENTO: '2027-02-10', CANTIDAD: '20', PROVEEDOR: 'P2', FRC_EVEN: '', N_TRASPASO: '', OBSERVACION: 'ok' },
        { _rowIndex: 4, SKU: 'SKU-V3', DESCRIPCION: 'Vencimiento puro 3', LOTE: 'L-3', FECHA_VENCIMIENTO: '2027-03-10', CANTIDAD: '30', PROVEEDOR: 'P3', FRC_EVEN: '', N_TRASPASO: '', OBSERVACION: 'ok' },
        { _rowIndex: 5, SKU: 'SKU-F1', DESCRIPCION: 'Incidencia FRC 1', LOTE: 'L-4', FECHA_VENCIMIENTO: '2026-08-01', CANTIDAD: '5', PROVEEDOR: 'P4', FRC_EVEN: 'VENC. CERC.', N_TRASPASO: '', OBSERVACION: 'llego con poca vida util' },
        { _rowIndex: 6, SKU: 'SKU-F2', DESCRIPCION: 'Incidencia FRC 2', LOTE: 'L-5', FECHA_VENCIMIENTO: '2026-08-02', CANTIDAD: '6', PROVEEDOR: 'P5', FRC_EVEN: 'DET. PED', N_TRASPASO: '', OBSERVACION: 'transporte' }
      ];
      localStorage.setItem('app_demo_items_main', JSON.stringify(mesclada));
    } catch (e) {}
  })();`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: seed });
  await send('Page.navigate', { url: URL_APP });

  const TRIGGER = `document.querySelector('[title="Abrir Panel Lateral de Control, Densidad y Vistas"]')`;
  let mounted = false;
  for (let i = 0; i < 120; i++) { if (await ev2(`!!${TRIGGER}`)) { mounted = true; break; } await sleep(250); }
  if (!mounted) { console.error('La app no monto. URL=' + URL_APP); return die(1); }

  // Condicion de carrera: en modo demo el fetch al SCRIPT_URL muerto agota su timeout
  // (~6s) antes de caer a los ejemplos. Se sondea hasta que la tabla tenga filas.
  const measure = `(() => {
    const btns = [...document.querySelectorAll('button')];
    const pill = btns.find(b => /^Todas\\s*\\d+$/.test((b.textContent||'').replace(/\\s+/g,' ').trim()));
    const pillN = pill ? parseInt((pill.textContent.replace(/\\s+/g,'').match(/(\\d+)/)||[,'0'])[1], 10) : null;
    const rows = [...document.querySelectorAll('tbody tr')];
    const texto = rows.map(r => (r.textContent||'')).join(' ');
    const FRC_CODES = /VENC\\. CERC\\.|DET\\. PED|DIF\\. PED|CAL\\. INTER|CAL\\. EXT|CANJES|AVERIA|DEVOLUCION/;
    return { pillN, rows: rows.length, tieneCodigoFrc: FRC_CODES.test(texto), tieneVencCerc: /VENC\\. CERC\\./.test(texto) };
  })()`;

  // Ancla de preparacion: `tbody tr` incluye la fila de estado vacio, asi que "rows > 0"
  // NO prueba que cargaron datos. En un runner lento se medía la tabla vacia (pildora 0 /
  // 1 fila) antes de renderizar el demo, como paso en CI. Se espera a que los SKU
  // sembrados esten en el DOM: en el radar solo se ven los de vencimiento puro (los FRC
  // estan filtrados fuera), por eso el ancla no puede exigir los FRC aqui.
  for (let i = 0; i < 80; i++) {
    const listo = await ev2(`(() => {
      const t = document.body.innerText || '';
      return t.includes('SKU-V1') && t.includes('SKU-V2') && t.includes('SKU-V3');
    })()`);
    if (listo) break;
    await sleep(500);
  }

  let main = { rows: 0 };
  for (let i = 0; i < 60; i++) {
    main = await ev2(measure);
    if (main && main.rows > 0 && main.pillN > 0) break;
    await sleep(500);
  }

  const results = [];
  const push = (paso, ok, detalle) => results.push({ paso, ok: !!ok, detalle });

  // 1. El radar de vencimientos no puede alojar incidencias FRC. Se exige pildora > 0 para
  //    que una tabla aun no cargada (pildora 0) no pase la asercion por vacio.
  push('en Vencimientos, ninguna fila es un codigo de incidencia FRC',
    main.pillN > 0 && !main.tieneCodigoFrc, main);

  // 2. La pildora «Todas» del radar cuenta el dominio, no la hoja cruda. Sin filtros de
  //    usuario, debe coincidir exactamente con las filas visibles.
  push('en Vencimientos, la pildora «Todas» coincide con las filas visibles',
    main.pillN !== null && main.pillN === main.rows, { pildora: main.pillN, filas: main.rows });

  // 3. VENC. CERC. se movio al dominio FRC: debe seguir existiendo alli (no se perdio).
  const irIncidencias = `[...document.querySelectorAll('button')].find(x => /Incidencias/.test((x.textContent||'') + (x.getAttribute('title')||'')))`;
  const hayBoton = await ev2(`!!(${irIncidencias})`);
  push('existe el acceso a Incidencias & FRC', hayBoton === true, hayBoton);
  if (hayBoton) {
    await ev2(`(() => { const b = ${irIncidencias}; if (b) b.click(); })()`);
    let ev = { rows: 0 };
    for (let i = 0; i < 40; i++) { ev = await ev2(measure); if (ev && ev.rows > 0 && ev.tieneVencCerc) break; await sleep(400); }
    push('en FRC, VENC. CERC. aparece (se movio de dominio, no se perdio)',
      ev.rows > 0 && ev.tieneVencCerc, ev);
    push('en FRC, la pildora «Todas» coincide con las filas visibles',
      ev.pillN !== null && ev.pillN === ev.rows, { pildora: ev.pillN, filas: ev.rows });
  }

  push('sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3));

  const passed = results.every(r => r.ok);
  console.log(JSON.stringify({ resultados: results }, null, 2));
  console.log(passed ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
  try { ws.close(); } catch (e) {}
  die(passed ? 0 : 1);
})().catch(e => { console.error('Fallo:', e.message); process.exit(1); });
