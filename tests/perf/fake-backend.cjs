/**
 * Backend falso (Web App de Apps Script) para verificar la Fase 7 paso 3: una hoja
 * con datos que NO son de vencimientos ni incidencias (una "Clientes").
 *
 * El modo demostracion solo sirve las 4 hojas canonicas, asi que no permite medir
 * el modo generico. Este servidor responde el contrato real que consume
 * src/lib/sheets.ts (getMetadata / getAppProperties / getAllSheetsData) para poder
 * abrir una hoja generica de punta a punta sin tocar el codigo de produccion.
 *
 * Uso: node tests/perf/fake-backend.cjs <puerto>
 */
const http = require('http');

const HOJAS = {
  Vencimientos_Inventario: [
    ['SKU', 'DESCRIPCION', 'FECHA_VENCIMIENTO', 'CANTIDAD', 'PROVEEDOR', 'LOTE'],
    ['SKU-1000', 'Producto canonico', '2026-05-01', '10', 'Proveedor A', 'L-1'],
    ['SKU-1001', 'Producto canonico 2', '2026-06-01', '20', 'Proveedor B', 'L-2'],
  ],
  // Hoja generica: NO tiene fecha de vencimiento ni tipo de evento. Solo andamiaje.
  Clientes: [
    ['RUT', 'RAZON_SOCIAL', 'TELEFONO', 'EMAIL'],
    ['11.111.111-1', 'Cliente Uno SpA', '+56911111111', 'uno@example.com'],
    ['22.222.222-2', 'Cliente Dos Ltda', '+56922222222', 'dos@example.com'],
    ['33.333.333-3', 'Cliente Tres SpA', '+56933333333', 'tres@example.com'],
  ],
  // Hoja NO canonica pero CON dominio de vencimiento (Fase 7 paso 3b): el objetivo
  // de la fase es que una hoja ajena con estas columnas reciba el modulo completo
  // (slices ya lo hacen por capacidad), no solo el andamiaje.
  Bodega_Sur: [
    ['SKU', 'DESCRIPCION', 'CANTIDAD', 'FECHA VTO', 'PROVEEDOR', 'LOTE'],
    ['S-2000', 'Producto bodega sur', '15', '2026-04-01', 'Proveedor A', 'B-1'],
    ['S-2001', 'Producto bodega sur 2', '8', '2026-05-15', 'Proveedor B', 'B-2'],
  ],
  // Hoja NO canonica de CATALOGO (Fase 7 paso 6): SKU + descripcion + proveedor,
  // sin fechas ni evento. Debe recibir la personalidad de catalogo por columnas.
  Maestro_Farmacia: [
    ['SKU', 'DESCRIPCION', 'PROVEEDOR', 'CATEGORIA'],
    ['M-3000', 'Ibuprofeno 400mg', 'Lab Norte', 'Analgesicos'],
    ['M-3001', 'Paracetamol 500mg', 'Lab Sur', 'Analgesicos'],
    ['M-3002', 'Vitamina C 1g', 'Lab Norte', 'Vitaminas'],
  ],
};

const SHEETS = Object.keys(HOJAS);
const metadata = {
  spreadsheetId: 'fake',
  sheets: SHEETS.map((title, i) => ({
    properties: { sheetId: i + 1, title, hidden: false, gridProperties: { rowCount: 50, columnCount: 12 } },
  })),
};

/** Latencia artificial de lectura, configurable por `setReadDelay` (0 = sin retardo). */
let READ_DELAY_MS = 0;

/** Si es true, el backend finge ser un Web App con una version anterior del script. */
let LEGACY_SCRIPT = false;

function handler(req, res) {
  // La app corre en otro origen (el preview): sin CORS el fetch falla y cae a demo.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    let payload = {};
    try { payload = JSON.parse(body || '{}'); } catch {}
    const action = payload.action;

    if (action === 'getMetadata') {
      return res.end(JSON.stringify({ success: true, ...metadata, sheets: metadata.sheets }));
    }
    if (action === 'getAppProperties') {
      // Sin configuracion en la nube: la app usa la local (y detecta capacidades).
      return res.end(JSON.stringify({ success: false }));
    }
    if (action === 'getAllSheetsData') {
      const data = {};
      (payload.sheetNames || []).forEach(n => { data[n] = HOJAS[n] || []; });
      return res.end(JSON.stringify({ success: true, data }));
    }
    if (action === 'getSheetData') {
      const enviar = () => res.end(JSON.stringify({ success: true, values: HOJAS[payload.sheetName] || [] }));
      // Latencia de lectura configurable: es lo que abre la ventana de carrera entre
      // el load y el save de dos terminales. En Apps Script real son ~2.500 ms.
      if (READ_DELAY_MS > 0) return setTimeout(enviar, READ_DELAY_MS);
      return enviar();
    }

    // Control de la latencia de lectura (para reproducir la carrera de sincronizacion).
    if (action === 'setReadDelay') {
      READ_DELAY_MS = Number(payload.ms) || 0;
      return res.end(JSON.stringify({ success: true, readDelayMs: READ_DELAY_MS }));
    }

    // Simula un Web App desplegado con una version anterior del script: no conoce
    // las acciones nuevas y responde como el template real ante una desconocida.
    if (action === 'setLegacyScript') {
      LEGACY_SCRIPT = !!payload.enabled;
      return res.end(JSON.stringify({ success: true, legacyScript: LEGACY_SCRIPT }));
    }

    // Capacidades del script desplegado (solo lectura). Un script anterior responde
    // "Accion no soportada", que es lo que el cliente usa para avisar.
    if (action === 'getScriptCapabilities') {
      if (LEGACY_SCRIPT) return res.end(JSON.stringify({ error: 'Acción no soportada: getScriptCapabilities' }));
      return res.end(JSON.stringify({ success: true, capabilities: { atomicCampaignSave: true } }));
    }

    if (LEGACY_SCRIPT && (action === 'saveCampaignsAtomic')) {
      return res.end(JSON.stringify({ error: 'Acción no soportada: ' + action }));
    }

    // Escrituras en memoria. Antes se respondia `success: true` a ciegas, asi que
    // ningun arnes podia distinguir una escritura real de una perdida: el ida y
    // vuelta online (append/update/delete y su relectura) quedaba sin cubrir.
    // La fila 1 es el encabezado, por eso `_rowIndex` 2 es `filas[1]`.
    const filas = () => (HOJAS[payload.sheetName] || (HOJAS[payload.sheetName] = []));
    // Localiza la fila que contiene la clave (misma semantica que findRowByKey del
    // template de Apps Script): busca solo en la columna de la clave si se conoce, y
    // exige coincidencia unica para no reubicar por una celda ajena. Devuelve fila
    // 1-based o -1.
    const findRowByKey = (rows, key, keyColumnName) => {
      let colIdx = -1;
      if (keyColumnName && rows[0]) {
        const wanted = String(keyColumnName).trim().toUpperCase();
        colIdx = rows[0].findIndex(h => String(h).trim().toUpperCase() === wanted);
      }
      const encontradas = [];
      for (let r = 1; r < rows.length; r++) {
        if (colIdx >= 0) {
          if (String(rows[r][colIdx]).trim().toUpperCase() === key) encontradas.push(r + 1);
        } else {
          for (const cell of (rows[r] || [])) {
            if (String(cell).trim().toUpperCase() === key) { encontradas.push(r + 1); break; }
          }
        }
      }
      return encontradas.length === 1 ? encontradas[0] : -1;
    };
    // Reemplaza el contenido completo de una hoja (sembrado determinista de arneses).
    if (action === 'setSheetData') {
      HOJAS[payload.sheetName] = (payload.values || []).map(r => (r || []).map(String));
      return res.end(JSON.stringify({ success: true }));
    }
    if (action === 'appendRow') {
      filas().push((payload.values || []).map(String));
      return res.end(JSON.stringify({ success: true }));
    }
    if (action === 'updateRow') {
      const f = filas();
      let idx = Number(payload.rowIndex);
      // Misma semantica que el template: la clave verificable en celdas manda
      // sobre un indice que pudo quedar obsoleto.
      const key = String(payload.entityKey || payload.keyValue || '').trim().toUpperCase();
      if (key && key.indexOf('::') === -1 && key.indexOf('_ROW_') === -1) {
        const found = findRowByKey(f, key, payload.entityKeyCol || payload.keyColumn);
        if (found > 1) idx = found;
      }
      if (idx >= 1 && idx <= f.length) f[idx - 1] = (payload.values || []).map(String);
      return res.end(JSON.stringify({ success: true }));
    }
    if (action === 'deleteRow' || action === 'deleteRows') {
      const f = filas();
      let idxs = action === 'deleteRows' ? (payload.rowIndexes || []) : [payload.rowIndex];
      if (action === 'deleteRow') {
        const key = String(payload.entityKey || payload.keyValue || '').trim().toUpperCase();
        if (key && key.indexOf('::') === -1 && key.indexOf('_ROW_') === -1) {
          const found = findRowByKey(f, key, payload.entityKeyCol || payload.keyColumn);
          if (found > 1) idxs = [found];
          else return res.end(JSON.stringify({ error: 'clave no encontrada (indice posiblemente obsoleto)' }));
        }
      }
      // Descendente: borrar de arriba hacia abajo desplazaria los indices restantes.
      idxs.map(Number).filter(n => Number.isFinite(n) && n >= 1 && n <= f.length)
        .sort((a, b) => b - a)
        .forEach(n => f.splice(n - 1, 1));
      return res.end(JSON.stringify({ success: true }));
    }

    // Compare-and-swap del estado de campanas: misma semantica que el template de
    // Apps Script. Se relee la version AQUI (no del payload) y se rechaza si no
    // coincide con la que el cliente dice haber leido.
    if (action === 'deleteSheet') {
      delete HOJAS[payload.sheetName];
      return res.end(JSON.stringify({ success: true }));
    }

    if (action === 'saveCampaignsAtomic') {
      // Igual que Apps Script: la hoja se crea si no existe (libro nuevo).
      if (!HOJAS[payload.sheetName]) HOJAS[payload.sheetName] = [['CLAVE', 'VALOR_JSON', 'ULTIMA_ACTUALIZACION']];
      const f = filas();
      const keyRow = {};
      for (let i = 0; i < f.length; i++) {
        const k = String(f[i][0] || '').trim();
        if (k && k !== 'CLAVE') keyRow[k] = i;
      }
      const currentVersion = keyRow['CAMPAIGNS_VERSION'] !== undefined ? String(f[keyRow['CAMPAIGNS_VERSION']][1] || '') : '';
      const expected = payload.expectedVersion === undefined ? null : payload.expectedVersion;

      if (expected !== null && expected !== currentVersion) {
        let current = null;
        const raw = keyRow['CAMPAIGNS_DATA'] !== undefined ? String(f[keyRow['CAMPAIGNS_DATA']][1] || '') : '';
        if (raw && !raw.startsWith('[CHUNKED:')) { try { current = JSON.parse(raw); } catch {} }
        return res.end(JSON.stringify({ success: false, conflict: true, current, version: currentVersion }));
      }

      const str = typeof payload.config === 'string' ? payload.config : JSON.stringify(payload.config);
      const nowIso = new Date().toISOString();
      const newVersion = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);

      const writeKey = (key, value) => {
        if (keyRow[key] !== undefined) f[keyRow[key]] = [key, value, nowIso];
        else { f.push([key, value, nowIso]); keyRow[key] = f.length - 1; }
      };

      const CHUNK = 30000;
      const chunks = [];
      for (let i = 0; i < str.length; i += CHUNK) chunks.push(str.slice(i, i + CHUNK));
      const prevChunks = keyRow['CAMPAIGNS_DATA_CHUNKS'] !== undefined ? parseInt(String(f[keyRow['CAMPAIGNS_DATA_CHUNKS']][1] || '0'), 10) : 0;

      writeKey('CAMPAIGNS_DATA_CHUNKS', String(chunks.length));
      for (let c = 0; c < chunks.length; c++) writeKey('CAMPAIGNS_DATA_CHUNK_' + c, chunks[c]);
      for (let c = chunks.length; c < prevChunks; c++) writeKey('CAMPAIGNS_DATA_CHUNK_' + c, '');
      writeKey('CAMPAIGNS_DATA', str.length < 40000 ? str : '[CHUNKED:' + chunks.length + ']');
      writeKey('CAMPAIGNS_VERSION', newVersion);

      return res.end(JSON.stringify({ success: true, version: newVersion }));
    }

    return res.end(JSON.stringify({ success: true }));
  });
}

const port = Number(process.argv[2] || 9800);
http.createServer(handler).listen(port, '127.0.0.1', () => {
  console.log('fake-backend escuchando en ' + port);
});
