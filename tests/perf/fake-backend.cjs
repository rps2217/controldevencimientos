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
};

const SHEETS = Object.keys(HOJAS);
const metadata = {
  spreadsheetId: 'fake',
  sheets: SHEETS.map((title, i) => ({
    properties: { sheetId: i + 1, title, hidden: false, gridProperties: { rowCount: 50, columnCount: 12 } },
  })),
};

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
      return res.end(JSON.stringify({ success: true, values: HOJAS[payload.sheetName] || [] }));
    }
    // Escrituras: aceptadas en falso (no persisten entre recargas).
    return res.end(JSON.stringify({ success: true }));
  });
}

const port = Number(process.argv[2] || 9800);
http.createServer(handler).listen(port, '127.0.0.1', () => {
  console.log('fake-backend escuchando en ' + port);
});
