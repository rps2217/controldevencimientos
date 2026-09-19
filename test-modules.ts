/**
 * Test Suite para verificación modular y funcional según el protocolo Ponytail
 * Ejecuta pruebas unitarias e integrales sobre cada utilidad, servicio y módulo
 */
import { 
  parseAnyDate, 
  parseLocaleNumber, 
  formatLocaleNumber, 
  rowToObject,
  getErrorMessage,
  getItemStatus, 
  getEventCategory, 
  getCategoryFromEventValue,
  getItemResolutionStatus
} from './src/utils/dateCalculations';

import { 
  findColumnBySemantic, 
  FIELD_PATTERNS 
} from './src/utils/columnAliases';

import { 
  extractCuVcFromRow, 
  findExistingItemByCuVc, 
  reconcileImportWithInventory 
} from './src/utils/cuVcConsolidator';

import { OfflineMutation } from './src/db/indexedDbService';
import {
  isFailedMutation,
  sortQueueFifo
} from './src/utils/offlineQueueUtils';

import { 
  resolveItemIdentity, 
  matchRowIndexByIdentity,
  buildRowIdentityIndex
} from './src/utils/entityIdentityResolver';

import { 
  findMasterProduct, 
  dereferenceMasterProduct 
} from './src/utils/referenceResolver';

import { 
  buildBulkActionContext, 
  isActionEnabledForTable, 
  ALL_BULK_ACTIONS 
} from './src/utils/bulkActionsRegistry';

import { 
  BUILT_IN_SLICES, 
  getSlicesForTable, 
  computeSliceCounts 
} from './src/utils/sliceRegistry';

import { 
  detectDelimiter, 
  parseDelimitedText, 
  generateSmartColumnMappings 
} from './src/utils/universalImporter';

import {
  STORAGE_KEYS,
  sheetCacheKey,
  demoItemsKey,
  migrateLegacyStorageKeys
} from './src/utils/appStorage';

import {
  saveStockCountSessionsToStorageDebounced,
  flushStockCountSessionsToStorage
} from './src/utils/stockCountUtils';


import { 
  SAMPLE_HEADERS, 
  SAMPLE_ITEMS, 
  SAMPLE_EVENTS_HEADERS, 
  SAMPLE_EVENTS_ITEMS, 
  SAMPLE_PRODUCTS, 
  SAMPLE_POLICIES 
} from './src/data/sampleInventory';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${testName}`, detail !== undefined ? detail : '');
  }
}

console.log('\n--- 1. Pruebas de dateCalculations.tsx ---');
{
  // parseAnyDate
  const d1 = parseAnyDate('2026-12-31');
  assert(d1 !== null && d1.getFullYear() === 2026 && d1.getMonth() === 11 && d1.getDate() === 31, 'parseAnyDate ISO YYYY-MM-DD');

  const d2 = parseAnyDate('15/08/2026');
  assert(d2 !== null && d2.getFullYear() === 2026 && d2.getMonth() === 7 && d2.getDate() === 15, 'parseAnyDate Latino DD/MM/YYYY');

  const d3 = parseAnyDate('08/2026');
  assert(d3 !== null && d3.getFullYear() === 2026 && d3.getMonth() === 7 && d3.getDate() === 31, 'parseAnyDate Mes/Año MM/YYYY (fin de mes)');

  const d4 = parseAnyDate(45657); // Número de serie Excel
  assert(d4 !== null && d4 instanceof Date && !isNaN(d4.getTime()), 'parseAnyDate Excel Serial Number');

  const d5 = parseAnyDate('');
  assert(d5 === null, 'parseAnyDate cadena vacía retorna null');

  // parseLocaleNumber y formatLocaleNumber
  assert(parseLocaleNumber('1.250,50') === 1250.5, 'parseLocaleNumber formato chileno/europeo (1.250,50)');
  assert(parseLocaleNumber('1,250.50') === 1250.5, 'parseLocaleNumber formato americano (1,250.50)');
  assert(parseLocaleNumber('500') === 500, 'parseLocaleNumber entero');
  assert(parseLocaleNumber(null) === 0, 'parseLocaleNumber null retorna 0');

  // getItemStatus
  const itemGood = { _rowIndex: 2, [SAMPLE_HEADERS[0]]: '1001', 'FECHA_VC': '31/12/2029' };
  const statusGood = getItemStatus(itemGood, ['FECHA_VC']);
  assert(statusGood.code === 'NORMAL', 'getItemStatus detecta producto en buen estado (NORMAL)');

  // getEventCategory
  const sampleEvent = SAMPLE_EVENTS_ITEMS[0];
  const cat = getEventCategory(sampleEvent, SAMPLE_EVENTS_HEADERS);
  assert(typeof cat === 'string' && cat.length > 0, 'getEventCategory clasifica evento de muestra');
}

console.log('\n--- 2. Pruebas de columnAliases.ts ---');
{
  const testHeaders = ['CÓDIGO SKU', 'DESCRIPCIÓN DEL ARTÍCULO', 'FECHA VCTO', 'CANTIDAD DISP', 'RUT PROVEEDOR'];
  assert(findColumnBySemantic(testHeaders, 'sku') === 'CÓDIGO SKU', 'findColumnBySemantic detecta SKU con tildes');
  assert(findColumnBySemantic(testHeaders, 'descripcion') === 'DESCRIPCIÓN DEL ARTÍCULO', 'findColumnBySemantic detecta Descripción');
  assert(findColumnBySemantic(testHeaders, 'fecha_vc') === 'FECHA VCTO', 'findColumnBySemantic detecta Fecha Vto');
  assert(findColumnBySemantic(testHeaders, 'cantidad') === 'CANTIDAD DISP', 'findColumnBySemantic detecta Cantidad');
  assert(findColumnBySemantic(testHeaders, 'proveedor') === 'RUT PROVEEDOR', 'findColumnBySemantic detecta Proveedor');
  assert(findColumnBySemantic(testHeaders, 'n_traspaso') === undefined, 'findColumnBySemantic retorna undefined si no existe');
}

console.log('\n--- 3. Pruebas de cuVcConsolidator.ts ---');
{
  const rowWithComposite = {
    'SKU': '2000210',
    'MES_VC': '11',
    'ANIO_VC': '2026',
    'CANTIDAD': '15'
  };
  const headers = ['SKU', 'MES_VC', 'ANIO_VC', 'CANTIDAD'];
  const extracted = extractCuVcFromRow(rowWithComposite, headers);
  assert(extracted.isValidComposite === true, 'extractCuVcFromRow valida composite con mes y año');
  assert(extracted.cuVc === '2000210202611', 'extractCuVcFromRow construye CU_VC correctamente');

  const existing = [{ _rowIndex: 2, 'SKU': '2000210', 'MES_VC': '11', 'ANIO_VC': '2026', 'CANTIDAD': '20' }];
  const match = findExistingItemByCuVc(rowWithComposite, existing, headers);
  assert(match.exists === true && match.rowIndex === 2, 'findExistingItemByCuVc detecta ítem existente');

  // Reconciliación con suma
  const incoming = [{ 'SKU': '2000210', 'MES_VC': '11', 'ANIO_VC': '2026', 'CANTIDAD': '5' }];
  const recon = reconcileImportWithInventory(incoming, existing, headers, undefined, 'consolidate_sum');
  assert(recon.rowsToUpdate.length === 1 && recon.rowsToUpdate[0].newTotalQty === 25, 'reconcileImportWithInventory consolida suma correctamente (20 + 5 = 25)');
}

console.log('\n--- 4. Pruebas de entityIdentityResolver.ts ---');
{
  const item = { _rowIndex: 5, 'SKU': '3000555', 'MES_VC': '06', 'ANIO_VC': '2027' };
  const h = ['SKU', 'MES_VC', 'ANIO_VC'];
  const idRes = resolveItemIdentity(item, h, 'Vencimientos_Inventario');
  assert(idRes.keyValue.length > 0, 'resolveItemIdentity genera clave unívoca');

  const refreshed2DRows = [
    ['SKU', 'MES_VC', 'ANIO_VC'],
    ['1111', '01', '2026'],
    ['2222', '02', '2026'],
    ['3333', '03', '2026'],
    ['3000555', '06', '2027']
  ];
  const matchedRow = matchRowIndexByIdentity(idRes, refreshed2DRows, h);
  assert(matchedRow === 5, 'matchRowIndexByIdentity re-localiza fila con precisión (fila 5)');

  // Clave duplicada: el índice caliente y el recorrido en vivo deben coincidir SIEMPRE
  // en la misma fila, para no reescribir el registro equivocado.
  const dupeRows = [
    h,
    ['AAA', '12', '2027'], // fila 2 (SKU, MES_VC, ANIO_VC)
    ['BBB', '01', '2026'],
    ['AAA', '12', '2027'], // fila 4 -> clave duplicada
  ];
  const dupeIdentity = {
    keyColumn: 'SKU+ANIO+MES',
    keyValue: 'AAA202712',
    isSynthetic: false,
    rowIndex: 0,
  };
  const hotIndex = buildRowIdentityIndex(dupeRows, h);
  assert(hotIndex.get('AAA202712') === 2,
    'buildRowIdentityIndex conserva la PRIMERA fila de una clave duplicada');
  assert(matchRowIndexByIdentity(dupeIdentity, dupeRows, h, hotIndex) === 2,
    'matchRowIndexByIdentity con índice caliente resuelve de forma determinista (fila 2)');
  assert(matchRowIndexByIdentity(dupeIdentity, dupeRows, h) === 2,
    'matchRowIndexByIdentity sin índice resuelve la MISMA fila que con índice (sin divergencia)');

  // Regresión: columna clave ausente en la hoja debe caer al respaldo, no lanzar
  const missingColRes = matchRowIndexByIdentity(
    { keyColumn: 'COL_INEXISTENTE', keyValue: 'ZZZ', isSynthetic: false, rowIndex: 3 },
    dupeRows, h
  );
  assert(missingColRes === 3,
    'matchRowIndexByIdentity usa rowIndex de respaldo si la columna clave no existe en la hoja');
}

console.log('\n--- 5. Pruebas de referenceResolver.ts ---');
{
  const foundExact = findMasterProduct('SKU-1001', SAMPLE_PRODUCTS);
  assert(foundExact !== null && foundExact.SKU === 'SKU-1001', 'findMasterProduct busca por SKU exacto');

  const foundAlpha = findMasterProduct('1001', SAMPLE_PRODUCTS);
  assert(foundAlpha !== null && foundAlpha.SKU === 'SKU-1001', 'findMasterProduct busca por código numérico flexible');

  const deref = dereferenceMasterProduct(foundExact, SAMPLE_HEADERS);
  assert(Object.keys(deref).length > 0, 'dereferenceMasterProduct propaga campos maestros');
  assert(deref['DESCRIPCION'] === 'Leche Entera UHT 1L', 'dereferenceMasterProduct asigna descripción correcta');
}

console.log('\n--- 6. Pruebas de bulkActionsRegistry.ts ---');
{
  const ctx = buildBulkActionContext(SAMPLE_HEADERS, 'main', 'main');
  assert(ctx.tableKey === 'main', 'buildBulkActionContext inicializa contexto');
  assert(typeof ctx.hasPhoneColumn === 'boolean', 'buildBulkActionContext detecta columna de teléfono');

  const isEnabled = isActionEnabledForTable('excel', ctx);
  assert(isEnabled === true, 'isActionEnabledForTable habilita exportar a Excel');
}

console.log('\n--- 7. Pruebas de sliceRegistry.ts ---');
{
  const mainSlices = getSlicesForTable('main');
  assert(mainSlices.length > 0, 'getSlicesForTable retorna slices nativos de main');

  const counts = computeSliceCounts(SAMPLE_ITEMS, mainSlices, SAMPLE_HEADERS);
  assert(typeof counts[mainSlices[0].id] === 'number', 'computeSliceCounts calcula conteo numérico de filas');
}

console.log('\n--- 8. Pruebas de universalImporter.ts ---');
{
  const tsvText = "SKU\tDESCRIPCION\tCANTIDAD\n101\tParacetamol 500mg\t50\n102\tIbuprofeno 400mg\t30";
  const sep = detectDelimiter(tsvText);
  assert(sep === '\t', 'detectDelimiter detecta separador Tabulador');

  const parsed = parseDelimitedText(tsvText, '\t');
  assert(parsed.headers.length === 3 && parsed.rows.length === 2, 'parseDelimitedText parsea TSV correctamente');

  const mapping = generateSmartColumnMappings(['SKU', 'DESCRIPCION', 'CANTIDAD'], parsed.headers);
  assert(mapping.length === 3, 'generateSmartColumnMappings genera mapeos para todas las columnas');
  const skuMap = mapping.find(m => m.targetHeader === 'SKU');
  assert(skuMap?.sourceHeader === 'SKU', 'generateSmartColumnMappings asocia SKU automáticamente');
}

console.log('\n--- 9. Pruebas de rowToObject (pureCalculations.ts) ---');
{
  const obj = rowToObject(['SKU', 'DESCRIPCION', 'CANTIDAD'], ['SKU-1', 'Leche', '320']);
  assert(obj['SKU'] === 'SKU-1' && obj['CANTIDAD'] === '320', 'rowToObject mapea celdas por encabezado');

  const short = rowToObject(['A', 'B', 'C'], ['solo']);
  assert(short['B'] === '' && short['C'] === '', 'rowToObject rellena celdas faltantes con cadena vacía');

  const numeric = rowToObject([101, 'DESC'], [0, null]);
  assert(numeric['101'] === '0' && numeric['DESC'] === '', 'rowToObject normaliza encabezados y valores nulos');
}

console.log('\n--- 10. Pruebas de getErrorMessage (pureCalculations.ts) ---');
{
  assert(getErrorMessage(new Error('fallo de red')) === 'fallo de red', 'getErrorMessage extrae .message de Error');
  assert(getErrorMessage('texto plano') === 'texto plano', 'getErrorMessage convierte strings');
  assert(getErrorMessage(null) === 'null', 'getErrorMessage maneja valores no-Error');
}


console.log('\n--- 11. Pruebas de appStorage.ts ---');
{
  // Stub mínimo de localStorage para el entorno Node
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };

  assert(STORAGE_KEYS.SHEET_CONFIG === 'appsheet_clone_config', 'appStorage: SHEET_CONFIG es la clave canónica');
  assert(STORAGE_KEYS.TICKET_CONFIG === 'global_ticket_print_config', 'appStorage: TICKET_CONFIG conserva la clave histórica');
  assert(sheetCacheKey('Hoja 1') === 'appsheet_clone_cache_Hoja 1', 'appStorage: sheetCacheKey construye la clave por pestaña');
  assert(demoItemsKey('main') === 'app_demo_items_main', 'appStorage: demoItemsKey construye la clave por vista');

  // Migración: la canónica ausente se promueve desde la heredada
  store.clear();
  store.set('appsheet_config', JSON.stringify({ backendMirror: { enabled: true } }));
  migrateLegacyStorageKeys();
  assert(store.get(STORAGE_KEYS.SHEET_CONFIG) === JSON.stringify({ backendMirror: { enabled: true } }),
    'appStorage: migra appsheet_config hacia la clave canónica');
  assert(!store.has('appsheet_config'), 'appStorage: elimina la clave heredada tras migrar');

  // No debe pisar la canónica existente
  store.clear();
  store.set(STORAGE_KEYS.SHEET_CONFIG, 'CANONICA');
  store.set('appsheet_config', 'HEREDADA');
  migrateLegacyStorageKeys();
  assert(store.get(STORAGE_KEYS.SHEET_CONFIG) === 'CANONICA',
    'appStorage: la migración no sobreescribe la clave canónica existente');
}

console.log('\n--- 12. Pruebas de persistencia diferida de sesiones de conteo ---');
{
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };

  const sessions = [{ id: 's1', nombre: 'Lácteos', conteos: [] }] as any;

  // Escritura diferida: aún no debe haber tocado localStorage
  saveStockCountSessionsToStorageDebounced(sessions, 5000);
  assert(store.get(STORAGE_KEYS.STOCK_COUNT_SESSIONS) === undefined,
    'deferred: no escribe antes de cumplirse el retardo');

  // El flush debe persistir la lectura pendiente aunque el timer no haya corrido
  flushStockCountSessionsToStorage();
  assert(store.get(STORAGE_KEYS.STOCK_COUNT_SESSIONS) === JSON.stringify(sessions),
    'flush: persiste la lectura pendiente sin esperar el timer');

  // Flush sin pendientes no debe lanzar ni reescribir
  store.delete(STORAGE_KEYS.STOCK_COUNT_SESSIONS);
  flushStockCountSessionsToStorage();
  assert(store.get(STORAGE_KEYS.STOCK_COUNT_SESSIONS) === undefined,
    'flush: sin pendientes es una operación no-op segura');
}

console.log('\n--- 12. Pruebas de offlineQueueUtils.ts (orquestación de la cola) ---');
{
  const mk = (o: Partial<OfflineMutation> & { id: string }): OfflineMutation => ({
    type: 'update', sheetTitle: 'VENCIMIENTOS', createdAt: '2026-01-01T00:00:00.000Z',
    status: 'pending', attempts: 0, ...o,
  } as OfflineMutation);

  // Un fallo real: status failed o >= 3 intentos
  assert(isFailedMutation(mk({ id: 'a', status: 'failed' })) === true,
    'isFailedMutation detecta status failed');
  assert(isFailedMutation(mk({ id: 'b', attempts: 3 })) === true,
    'isFailedMutation detecta intentos agotados (3)');
  assert(isFailedMutation(mk({ id: 'c', attempts: 2 })) === false,
    'isFailedMutation no marca una mutación con intentos < 3');

  // Regresión: una mutación reintentada queda pending + attempts 0 pero CONSERVA lastError.
  // No debe clasificarse como fallida (antes el modal la ocultaba del filtro "pendientes"
  // y el descarte masivo podía borrarla).
  const retried = mk({ id: 'd', status: 'pending', attempts: 0, lastError: 'timeout previo' });
  assert(isFailedMutation(retried) === false,
    'isFailedMutation ignora lastError residual tras reintento');

  // Filtros del modal: complementarios y sin solape
  const queue = [
    mk({ id: 'p1', createdAt: '2026-01-01T00:00:00.000Z' }),
    mk({ id: 'f1', status: 'failed', createdAt: '2026-01-02T00:00:00.000Z' }),
    mk({ id: 'p2', createdAt: '2026-01-03T00:00:00.000Z', attempts: 3 }),
  ];
  assert(queue.filter(isFailedMutation).map(m => m.id).join(',') === 'f1,p2',
    'el filtro de conflictos devuelve exactamente las fallidas');
  assert(queue.filter(m => !isFailedMutation(m)).map(m => m.id).join(',') === 'p1',
    'el filtro de pendientes es el complementario exacto (sin solape)');

  // FIFO determinista y sin mutar el arreglo original
  const originalOrder = queue.map(m => m.id).join(',');
  const sorted = sortQueueFifo([queue[2], queue[0], queue[1]]);
  assert(sorted.map(m => m.id).join(',') === 'p1,f1,p2',
    'sortQueueFifo ordena estrictamente por createdAt (FIFO)');
  assert(queue.map(m => m.id).join(',') === originalOrder,
    'sortQueueFifo no muta el arreglo de entrada');
}

console.log(`\n========================================`);
console.log(`RESULTADOS DE PRUEBAS: ${passed} PASADAS, ${failed} FALLADAS`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
