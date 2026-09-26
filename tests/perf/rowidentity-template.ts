/**
 * Ejecuta el TEMPLATE REAL de Apps Script contra el bug de identidad de fila.
 *
 * Por que existe: `rowidentity.cjs` prueba el backend falso, que es un mock. El
 * codigo que de verdad corre en Google Sheets es `APPS_SCRIPT_TEMPLATE`, y una
 * divergencia entre ambos (el mock arreglado y el template sin arreglar) pasaria
 * desapercibida. Aqui se extrae el template y se ejecuta `doPost` con stubs de los
 * servicios de Apps Script, de modo que la prueba ejerce el codigo de produccion:
 * el mismo texto que el usuario copia y despliega.
 *
 * Uso: tsx tests/perf/rowidentity-template.ts
 */
import { APPS_SCRIPT_TEMPLATE } from '../../src/lib/sheets';

// ---------- Stubs minimos de los servicios de Google Apps Script ----------

class FakeRange {
  constructor(private sheet: FakeSheet, private row: number, private col: number, private numRows: number, private numCols: number) {}
  getValues(): any[][] {
    const out: any[][] = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowVals: any[] = [];
      for (let c = 0; c < this.numCols; c++) {
        rowVals.push(this.sheet.data[this.row - 1 + r]?.[this.col - 1 + c] ?? '');
      }
      out.push(rowVals);
    }
    return out;
  }
  setValues(values: any[][]): void {
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        this.sheet.ensure(this.row - 1 + r, this.col - 1 + c);
        this.sheet.data[this.row - 1 + r][this.col - 1 + c] = values[r][c];
      }
    }
  }
}

class FakeSheet {
  data: any[][] = [];
  constructor(public name: string, private id: number) {}
  ensure(r: number, c: number) {
    while (this.data.length <= r) this.data.push([]);
    while (this.data[r].length <= c) this.data[r].push('');
  }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  isSheetHidden() { return false; }
  getMaxRows() { return Math.max(this.data.length, 1); }
  getMaxColumns() { return Math.max(1, ...this.data.map(r => r.length)); }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(1, ...this.data.map(r => r.length)); }
  getDataRange() { return new FakeRange(this, 1, 1, this.getMaxRows(), this.getLastColumn()); }
  getRange(row: number, col: number, numRows = 1, numCols = 1) { return new FakeRange(this, row, col, numRows, numCols); }
  appendRow(values: any[]) {
    this.data.push(values.map(String));
  }
  deleteRow(rowIndex: number) {
    this.data.splice(rowIndex - 1, 1);
  }
  insertRowsAfter(after: number, count: number) {
    for (let i = 0; i < count; i++) this.data.splice(after + i, 0, []);
  }
  insertColumnsAfter(after: number, count: number) {
    for (const row of this.data) {
      while (row.length < after + count) row.push('');
    }
  }
}

class FakeSpreadsheet {
  sheets: FakeSheet[] = [];
  getSheets() { return this.sheets; }
  getSheetByName(name: string) { return this.sheets.find(s => s.name === name) || null; }
  insertSheet(name: string) { const s = new FakeSheet(name, this.sheets.length + 1); this.sheets.push(s); return s; }
}

const spreadsheet = new FakeSpreadsheet();

const stubs = {
  SpreadsheetApp: {
    openById: () => spreadsheet,
    getActiveSpreadsheet: () => spreadsheet,
  },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
  },
  LockService: {
    getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
  },
  ContentService: {
    createTextOutput: (t: string) => ({ text: t, setMimeType() { return this; }, getContent() { return this.text; } }),
    MimeType: { JSON: 'json' },
  },
};

/** Ejecuta el template real y devuelve la respuesta de `doPost` ya parseada. */
function invokeDoPost(payload: any): any {
  const names = Object.keys(stubs);
  const values = names.map(n => (stubs as any)[n]);
  const body = APPS_SCRIPT_TEMPLATE.replace(/^\/\/[^\n]*\n/, '');
  const fn = new Function(...names, `${body}\nreturn doPost;`);
  const doPost = fn(...values);
  const res = doPost({ postData: { contents: JSON.stringify(payload) } });
  return JSON.parse(res.getContent());
}

// ---------- Escenario ----------

const HOJA = 'RowIdentityTemplate';
const resultados: { caso: string; ok: boolean; detalle: unknown }[] = [];
const push = (caso: string, ok: boolean, detalle: unknown) => resultados.push({ caso, ok, detalle });

function sembrar() {
  spreadsheet.sheets = [];
  const s = new FakeSheet(HOJA, 1);
  s.data = [
    ['SKU', 'DESCRIPCION', 'CANTIDAD'],
    ['SKU-A', 'Producto A', '10'],
    ['SKU-B', 'Producto B', '20'],
    ['SKU-C', 'Producto C', '30'],
    ['SKU-D', 'Producto D', '40'],
  ];
  spreadsheet.sheets.push(s);
}

const filas = () => spreadsheet.getSheetByName(HOJA)!.data;

// Caso 1: UPDATE con indice obsoleto y clave correcta.
sembrar();
invokeDoPost({ action: 'deleteRow', sheetName: HOJA, rowIndex: 2 }); // cae SKU-A
invokeDoPost({
  action: 'updateRow', sheetName: HOJA,
  rowIndex: 5,           // obsoleto: SKU-D ya no vive aqui
  entityKey: 'SKU-D',
  values: ['SKU-D', 'Producto D (editado)', '99'],
});
const idxD = filas().findIndex(f => f[0] === 'SKU-D');
push('template: UPDATE con indice obsoleto escribe en SKU-D, no en el vecino',
  idxD >= 0 && filas()[idxD][2] === '99',
  { fila: idxD, filas: filas().map(f => `${f[0]}:${f[2]}`) });

// Caso 2: DELETE con indice obsoleto y clave correcta.
sembrar();
invokeDoPost({ action: 'deleteRow', sheetName: HOJA, rowIndex: 2 }); // cae SKU-A
invokeDoPost({ action: 'deleteRow', sheetName: HOJA, rowIndex: 3, entityKey: 'SKU-B' });
const skus = filas().map(f => f[0]);
push('template: DELETE con indice obsoleto elimina SKU-B y conserva SKU-C',
  !skus.includes('SKU-B') && skus.includes('SKU-C'),
  skus);

// Caso 3: DELETE sin clave (compatibilidad) sigue funcionando por indice.
sembrar();
invokeDoPost({ action: 'deleteRow', sheetName: HOJA, rowIndex: 3 });
const skusSinClave = filas().map(f => f[0]);
push('template: DELETE sin clave conserva el comportamiento por indice',
  !skusSinClave.includes('SKU-B'),
  skusSinClave);

// Caso 4: DELETE con clave inexistente no destruye una fila ajena.
sembrar();
const resClaveFantasma = invokeDoPost({ action: 'deleteRow', sheetName: HOJA, rowIndex: 3, entityKey: 'SKU-QUE-NO-EXISTE' });
const skusFantasma = filas().map(f => f[0]);
push('template: DELETE con clave inexistente no borra ninguna fila',
  skusFantasma.length === 5 && !!resClaveFantasma.error,
  { skus: skusFantasma, error: resClaveFantasma.error });

// Caso 5: UPDATE con clave compuesta (SKU::FECHA) conserva el indice resuelto.
sembrar();
invokeDoPost({
  action: 'updateRow', sheetName: HOJA,
  rowIndex: 3,
  entityKey: 'SKU-B::31/12/2027',
  values: ['SKU-B', 'Producto B editado', '77'],
});
const idxB = filas().findIndex(f => f[0] === 'SKU-B');
push('template: clave compuesta usa el indice (no la busca como celda)',
  idxB >= 0 && filas()[idxB][2] === '77',
  { fila: idxB, filas: filas().map(f => `${f[0]}:${f[2]}`) });

// Caso 6: DELETE con clave sintetica (deriva del indice) sigue borrando por indice.
sembrar();
invokeDoPost({ action: 'deleteRow', sheetName: HOJA, rowIndex: 3, entityKey: 'RowIdentityTemplate_row_3' });
const skusSintetica = filas().map(f => f[0]);
push('template: DELETE con clave sintetica no se bloquea y usa el indice',
  !skusSintetica.includes('SKU-B'),
  skusSintetica);

// Caso 7: UPDATE con clave sintetica no se bloquea ni anexa de mas.
sembrar();
invokeDoPost({
  action: 'updateRow', sheetName: HOJA,
  rowIndex: 3,
  entityKey: 'RowIdentityTemplate_row_3',
  values: ['SKU-B', 'Producto B editado', '55'],
});
const idxSint = filas().findIndex(f => f[0] === 'SKU-B');
push('template: UPDATE con clave sintetica escribe por indice sin anexar',
  filas().length === 5 && idxSint >= 0 && filas()[idxSint][2] === '55',
  { filas: filas().map(f => `${f[0]}:${f[2]}`) });

// Caso 8: falso positivo. Un SKU numerico corto puede coincidir con una celda que
// no es la clave (p. ej. CANTIDAD) en una fila anterior. Si eso ocurre, el arreglo
// cambiaria un fallo por otro: escribir en la fila equivocada en vez del vecino.
spreadsheet.sheets = [];
const sFp = new FakeSheet(HOJA, 1);
sFp.data = [
  ['SKU', 'DESCRIPCION', 'CANTIDAD'],
  ['SKU-A', 'Producto A', '100'],
  ['SKU-B', 'Producto B', '20'],
  ['100', 'Producto C', '30'],
];
spreadsheet.sheets.push(sFp);
invokeDoPost({
  action: 'updateRow', sheetName: HOJA,
  rowIndex: 4,
  entityKey: '100',
  entityKeyCol: 'SKU',
  values: ['100', 'Producto C editado', '99'],
});
const filaC = filas().findIndex(f => f[0] === '100');
push('template: con columna de clave, un SKU numerico no se confunde con otra celda',
  filaC === 3 && filas()[1][2] === '100' && filas()[filaC][2] === '99',
  { filas: filas().map(f => f.join(':')), cantidadSKU_A: filas()[1][2] });

// Caso 9: sin columna conocida, una coincidencia ambigua NO reubica (se conserva el
// indice). Preferir el indice a reubicar mal: el indice al menos lo calculo el cliente.
spreadsheet.sheets = [];
const sAmb = new FakeSheet(HOJA, 1);
sAmb.data = [
  ['SKU', 'DESCRIPCION', 'CANTIDAD'],
  ['SKU-A', 'Producto A', '100'],
  ['SKU-B', 'Producto B', '20'],
  ['100', 'Producto C', '30'],
];
spreadsheet.sheets.push(sAmb);
invokeDoPost({
  action: 'updateRow', sheetName: HOJA,
  rowIndex: 4,
  entityKey: '100',
  values: ['100', 'Producto C editado', '99'],
});
push('template: sin columna, una clave ambigua conserva el indice (no reubica mal)',
  filas()[3][2] === '99' && filas()[1][2] === '100',
  { filas: filas().map(f => f.join(':')) });

console.log(JSON.stringify(resultados, null, 2));
const todoOk = resultados.every(r => r.ok);
console.log(todoOk
  ? 'DIAGNOSTICO: el template real de Apps Script respeta la identidad de fila.'
  : 'DIAGNOSTICO: el template real NO protege la fila ajena.');
console.log(todoOk ? 'RESULTADO: OK' : 'RESULTADO: FALLO');
process.exit(todoOk ? 0 : 1);
