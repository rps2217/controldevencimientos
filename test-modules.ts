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
import { createMetricsAccumulator } from './src/utils/pureCalculations';

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
import { Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  BARCODE_SUPPORTED_FORMATS,
  pickRearCamera
} from './src/utils/barcodeScannerConfig';
import {
  buildAuditRowValues,
  consolidateAuditRows,
  dedupeAuditRows
} from './src/utils/auditConsolidation';
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
  computeSliceCounts,
  detectTableCapabilities 
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
,
  readStorage,
  readStorageValidated,
  writeStorage,
  preferencesObjectSchema,
  stringArrayMapSchema,
  moduleStatesSchema,
  stringArraySchema,
  sheetConfigShapeSchema,
  tableDensitySchema,
  readRawStorage,
  writeRawStorage,
  objectArraySchema,
  booleanMapSchema,
  cachedSheetSchema,
  isDemoMode
} from './src/utils/appStorage';

import {
  saveStockCountSessionsToStorageDebounced,
  flushStockCountSessionsToStorage,
  generateCuVc,
  calculateLastDayOfMonthDateString,
  reconcileStockCountSession,
  buildVencimientosRowFromCount
} from './src/utils/stockCountUtils';
import {
  groupSkuEntries,
  getLastScannedItem,
  filterGroupedEntries,
  filterChronoEntries,
  getReconciliationProviders,
  filterReconciliation,
  computeReconciliationMetrics,
  getPendingItems
} from './src/utils/countAggregation';
import {
  computeCampaignConsolidationMatrix,
  markSkuAsClosedInCampaign,
  buildAuditRowsFromCampaignMatrix
} from './src/utils/campaignUtils';
import {
  resolveActiveCampaign,
  collectAllAuditRows,
  getAuditProviders,
  filterAuditRows
} from './src/utils/campaignAggregation';
import { InventoryCampaign, StockCountSession, CampaignSnapshotItem, StockCountEntry, StockCountReconciliationItem, InventoryItem } from './src/types';
import { createMimeMessage, escapeHtml } from './src/lib/gmailService';


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

  const deref = dereferenceMasterProduct(foundExact!, SAMPLE_HEADERS);
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
  const mainSlices = getSlicesForTable('main', [], undefined, SAMPLE_HEADERS);
  assert(mainSlices.length > 0, 'getSlicesForTable retorna slices nativos de main');

  const counts = computeSliceCounts(SAMPLE_ITEMS, mainSlices, SAMPLE_HEADERS);
  assert(typeof counts[mainSlices[0].id] === 'number', 'computeSliceCounts calcula conteo numérico de filas');

  // Los nativos se eligen por capacidad de la hoja, no por el nombre del modulo: una
  // hoja no canonica con columnas de vencimiento los recibe igual.
  const bodegaAjena = ['Codigo', 'Producto', 'Cant', 'Fecha Vto', 'Lote'];
  const ajenosVenc = getSlicesForTable('Bodega Sur', [], undefined, bodegaAjena);
  assert(ajenosVenc.length === mainSlices.length, 'hoja no canonica con fecha de vencimiento recibe los slices de vencimiento');
  assert(ajenosVenc.every(s => s.requiredCapability === 'vencimiento'), 'solo entran slices de la capacidad detectada');

  const bitacora = ['ID', 'Tipo Evento', 'Detalle', 'Fecha'];
  const ajenosEv = getSlicesForTable('Bitacora', [], undefined, bitacora);
  assert(ajenosEv.length > 0 && ajenosEv.every(s => s.requiredCapability === 'incidencia'), 'hoja con columna de evento recibe los slices de incidencia');

  // Una hoja sin semantica de dominio no debe heredar nada: antes mostraba
  // "Inventario en Regla" para un cliente (falso positivo silencioso).
  const clientes = ['Razon Social', 'Contacto', 'Telefono', 'Email', 'Ciudad'];
  assert(getSlicesForTable('Clientes', [], undefined, clientes).length === 0, 'hoja sin columnas de dominio no recibe slices nativos');

  // Sin headers (llamada heredada) tampoco revienta ni inventa slices.
  assert(getSlicesForTable('main').length === 0, 'getSlicesForTable sin headers degrada a cero slices, sin excepcion');

  // Un alias definido por el usuario en Ajustes debe contar como capacidad: la hoja
  // no trae "fecha_vc" reconocible, pero el usuario ya le dijo al sistema cual es.
  const conAlias = ['Articulo', 'MiFechaRara', 'Cant'];
  assert(getSlicesForTable('Bodega Alias', [], undefined, conAlias).length === 0, 'sin alias declarado la hoja no detecta capacidad');
  const aliasCfg = { fecha_vc: ['MiFechaRara'] };
  assert(getSlicesForTable('Bodega Alias', [], undefined, conAlias, aliasCfg).length === mainSlices.length, 'un alias de fecha_vc declarado por el usuario habilita los slices de vencimiento');

  // Capacidad de conteo fisico: gobierna la UI de Conteo/Pistoleo. Exige las dos
  // columnas que el terminal necesita para reconciliar (SKU + cantidad); una hoja
  // generica (Clientes) no la tiene y por tanto no debe ofrecer el terminal.
  const capsMain = detectTableCapabilities(SAMPLE_HEADERS);
  assert(capsMain.has('conteo'), 'una hoja con SKU y cantidad tiene la capacidad de conteo');
  assert(capsMain.has('vencimiento'), 'la hoja canonica mantiene ademas la capacidad de vencimiento');

  assert(detectTableCapabilities(clientes).size === 0, 'una hoja de Clientes no tiene ninguna capacidad de dominio');
  assert(!detectTableCapabilities(clientes).has('conteo'), 'sin SKU+cantidad no hay capacidad de conteo');

  // Solo SKU (sin cantidad) o solo cantidad (sin SKU) no alcanza para contar.
  assert(!detectTableCapabilities(['SKU', 'DESCRIPCION', 'PROVEEDOR']).has('conteo'), 'SKU sin cantidad no habilita el conteo');
  assert(!detectTableCapabilities(['PRODUCTO', 'CANTIDAD', 'LOTE']).has('conteo'), 'cantidad sin SKU no habilita el conteo');

  // El conteo convive con la incidencia (una bitacora con SKU+cantidad+evento).
  const capsEventos = detectTableCapabilities(SAMPLE_EVENTS_HEADERS);
  assert(capsEventos.has('conteo') && capsEventos.has('incidencia'), 'una bitacora FRC tiene conteo e incidencia');

  // Sin headers no inventa capacidades.
  assert(detectTableCapabilities([]).size === 0, 'sin headers no se detecta ninguna capacidad');
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

  // Modo demo: sin SCRIPT_URL no hay backend. Los tres bordes que importan:
  // clave ausente, cadena vacía (lo que deja un input limpiado) y espacios.
  store.clear();
  assert(isDemoMode() === true, 'appStorage: sin SCRIPT_URL la app está en modo demo');
  store.set(STORAGE_KEYS.SCRIPT_URL, '');
  assert(isDemoMode() === true, 'appStorage: SCRIPT_URL vacío sigue siendo modo demo');
  store.set(STORAGE_KEYS.SCRIPT_URL, '   ');
  assert(isDemoMode() === true, 'appStorage: SCRIPT_URL con solo espacios sigue siendo modo demo');
  store.set(STORAGE_KEYS.SCRIPT_URL, 'https://script.google.com/macros/s/abc/exec');
  assert(isDemoMode() === false, 'appStorage: con SCRIPT_URL real no hay modo demo');

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

  // --- Puerta única de lectura validada ---
  // El fallo real: JSON.parse suelto acepta basura con la forma equivocada y el
  // error aparece mucho después, al indexar en profundidad o dentro de un render.
  store.clear();
  store.set(STORAGE_KEYS.COL_WIDTHS, JSON.stringify({ 'Hoja 1': 'texto-en-vez-de-objeto' }));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.COL_WIDTHS, preferencesObjectSchema, {})) === '{}',
    'readStorage: descarta un mapa de anchos con forma inválida (valor string)'
  );

  store.set(STORAGE_KEYS.COL_WIDTHS, 'esto no es JSON {{{');
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.COL_WIDTHS, preferencesObjectSchema, {})) === '{}',
    'readStorage: descarta JSON malformado sin lanzar'
  );

  store.set(STORAGE_KEYS.COL_WIDTHS, JSON.stringify({ 'Hoja 1': { SKU: 120 } }));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.COL_WIDTHS, preferencesObjectSchema, {})) === '{"Hoja 1":{"SKU":120}}',
    'readStorage: conserva un mapa de anchos válido'
  );

  store.delete(STORAGE_KEYS.COL_WIDTHS);
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.COL_WIDTHS, preferencesObjectSchema, { fallback: true })) === '{"fallback":true}',
    'readStorage: clave ausente devuelve el fallback'
  );

  // readStorageValidated distingue "ausente" de "corrupto": es lo que permite
  // alertar o limpiar sin confundir un primer arranque con un dato dañado.
  store.set(STORAGE_KEYS.COL_ORDERS, JSON.stringify(['no', 'es', 'un', 'mapa']));
  const corrupted = readStorageValidated(STORAGE_KEYS.COL_ORDERS, stringArrayMapSchema, {});
  assert(corrupted.valid === false,
    'readStorageValidated: marca como corrupto un estado con forma inválida');
  store.delete(STORAGE_KEYS.COL_ORDERS);
  const missing = readStorageValidated(STORAGE_KEYS.COL_ORDERS, stringArrayMapSchema, {});
  assert(missing.valid === true,
    'readStorageValidated: una clave ausente NO se considera corrupta');

  store.set(STORAGE_KEYS.MODULE_STATES, JSON.stringify({ main: 'texto' }));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.MODULE_STATES, moduleStatesSchema, {})) === '{}',
    'readStorage: descarta un estado de módulo cuyo valor no es objeto (esparcirlo metería índices como campos)'
  );

  // SHEET_CONFIG: el fallo real era `JSON.parse("null")` devolviendo null, que
  // reventaba al primer acceso a sheetConfig.schema durante el arranque.
  store.set(STORAGE_KEYS.SHEET_CONFIG, 'null');
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.SHEET_CONFIG, sheetConfigShapeSchema, {})) === '{}',
    'readStorage: descarta un SheetConfig null en vez de devolverlo como configuración'
  );
  store.set(STORAGE_KEYS.SHEET_CONFIG, JSON.stringify(['Hoja 1']));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.SHEET_CONFIG, sheetConfigShapeSchema, {})) === '{}',
    'readStorage: descarta un SheetConfig con forma de array'
  );
  // Un SheetConfig legítimo trae campos anidados que no se validan a propósito:
  // exigirlos descartaría configuración válida de versiones anteriores.
  store.set(STORAGE_KEYS.SHEET_CONFIG, JSON.stringify({ main: 'VENCIMIENTOS', schema: { main: { SKU: { type: 'text' } } }, campoFuturo: 1 }));
  const cfgRead = readStorage<Record<string, unknown>>(STORAGE_KEYS.SHEET_CONFIG, sheetConfigShapeSchema, {});
  assert(
    cfgRead.main === 'VENCIMIENTOS' && cfgRead.campoFuturo === 1,
    'readStorage: conserva un SheetConfig válido, incluidos campos desconocidos'
  );

  // HIDDEN_SLICE_IDS: un string suelto se desparramaba en caracteres sueltos
  // como IDs ocultos al hacer `[...localHidden]`.
  store.set(STORAGE_KEYS.HIDDEN_SLICE_IDS, JSON.stringify('vencidos'));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.HIDDEN_SLICE_IDS, stringArraySchema, [])) === '[]',
    'readStorage: descarta IDs de slice oculto que no son array de cadenas'
  );
  store.set(STORAGE_KEYS.HIDDEN_SLICE_IDS, JSON.stringify(['vencidos', 'criticos']));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.HIDDEN_SLICE_IDS, stringArraySchema, [])) === '["vencidos","criticos"]',
    'readStorage: conserva una lista válida de IDs de slice ocultos'
  );

  // TABLE_DENSITY: se guarda como cadena cruda (no JSON), así que se valida
  // contra los valores admitidos en lugar de parsearse.
  store.set(STORAGE_KEYS.TABLE_DENSITY, 'ultra');
  assert(tableDensitySchema.safeParse(store.get(STORAGE_KEYS.TABLE_DENSITY)).data === 'ultra',
    'tableDensitySchema: acepta un valor admitido');
  store.set(STORAGE_KEYS.TABLE_DENSITY, 'gigante');
  assert(tableDensitySchema.safeParse(store.get(STORAGE_KEYS.TABLE_DENSITY)).success === false,
    'tableDensitySchema: rechaza un valor no admitido');

  // readRawStorage debe leer el formato crudo que quedó en disco. Si se leyera
  // con JSON.parse ("ultra" no es JSON válido), la preferencia ya elegida se
  // perdería silenciosamente en cada arranque.
  store.set(STORAGE_KEYS.TABLE_DENSITY, 'ultra');
  assert(readRawStorage<'comfortable' | 'compact' | 'ultra'>(STORAGE_KEYS.TABLE_DENSITY, tableDensitySchema, 'compact') === 'ultra',
    'readRawStorage: recupera la densidad cruda existente, sin reinterpretarla como JSON');
  store.set(STORAGE_KEYS.TABLE_DENSITY, 'gigante');
  assert(readRawStorage<'comfortable' | 'compact' | 'ultra'>(STORAGE_KEYS.TABLE_DENSITY, tableDensitySchema, 'compact') === 'compact',
    'readRawStorage: un valor corrupto cae en el fallback');
  store.delete(STORAGE_KEYS.TABLE_DENSITY);
  assert(readRawStorage<'comfortable' | 'compact' | 'ultra'>(STORAGE_KEYS.TABLE_DENSITY, tableDensitySchema, 'compact') === 'compact',
    'readRawStorage: clave ausente devuelve el fallback');
  writeRawStorage(STORAGE_KEYS.TABLE_DENSITY, 'comfortable');
  assert(store.get(STORAGE_KEYS.TABLE_DENSITY) === 'comfortable',
    'writeRawStorage: escribe la cadena cruda, sin comillas de JSON');

  // objectArraySchema: listas de objetos operativos (cola offline, bitacora,
  // campanas, sesiones, items demo). Un null o un objeto suelto se devolvia como
  // lista y reventaba en el primer `.map`/`.filter` del consumidor.
  store.set(STORAGE_KEYS.OFFLINE_QUEUE, 'null');
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.OFFLINE_QUEUE, objectArraySchema, [])) === '[]',
    'readStorage: descarta una cola offline null'
  );
  store.set(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify({ id: 'm1' }));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.OFFLINE_QUEUE, objectArraySchema, [])) === '[]',
    'readStorage: descarta una cola offline que es objeto suelto, no lista'
  );
  store.set(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify([1, 2, 3]));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.OFFLINE_QUEUE, objectArraySchema, [])) === '[]',
    'readStorage: descarta una lista de escalares donde se esperan mutaciones'
  );
  store.set(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify([{ id: 'm1', action: 'update' }]));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.OFFLINE_QUEUE, objectArraySchema, [])) === '[{"id":"m1","action":"update"}]',
    'readStorage: conserva una cola offline valida, aunque falten campos del DTO'
  );

  // booleanMapSchema: campos ocultos del panel de detalle.
  store.set(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, JSON.stringify({ SKU: 'si' }));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, booleanMapSchema, {})) === '{}',
    'readStorage: descarta un mapa de ocultos con valores no booleanos'
  );
  store.set(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, JSON.stringify({ SKU: true }));
  assert(
    JSON.stringify(readStorage(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, booleanMapSchema, {})) === '{"SKU":true}',
    'readStorage: conserva un mapa de ocultos valido'
  );

  // cachedSheetSchema: cache L1 de hoja (fallback offline). Tenia JSON.parse crudo
  // y devolvia forma mentida; el consumidor hace rows.map y reventaba en el
  // arranque sin red (medido: "headers.find is not a function").
  const cacheKey = sheetCacheKey('Vencimientos_Inventario');
  store.set(cacheKey, JSON.stringify({ rows: 1, timestamp: 't' }));
  assert(
    readStorage(cacheKey, cachedSheetSchema.nullable(), null) === null,
    'cachedSheetSchema: descarta un cache con rows no-lista'
  );
  store.set(cacheKey, JSON.stringify({ rows: [1, 2, 3], timestamp: 't' }));
  assert(
    readStorage(cacheKey, cachedSheetSchema.nullable(), null) === null,
    'cachedSheetSchema: descarta un cache con filas que no son listas de celdas'
  );
  store.set(cacheKey, '{roto');
  assert(
    readStorage(cacheKey, cachedSheetSchema.nullable(), null) === null,
    'cachedSheetSchema: descarta un cache con JSON malformado'
  );
  store.set(cacheKey, JSON.stringify({ rows: [['SKU'], ['A1']] }));
  assert(
    JSON.stringify(readStorage(cacheKey, cachedSheetSchema.nullable(), null)) === '{"rows":[["SKU"],["A1"]]}',
    'cachedSheetSchema: conserva un cache valido aunque falte timestamp (entrada de version anterior)'
  );

  store.clear();
  writeStorage(STORAGE_KEYS.COL_ORDERS, { 'Hoja 1': ['SKU'] });
  assert(store.get(STORAGE_KEYS.COL_ORDERS) === '{"Hoja 1":["SKU"]}',
    'writeStorage: serializa el valor en la clave indicada');
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

console.log('\n--- 13. Pruebas de auditConsolidation.ts (cuadratura de actas) ---');
{
  const HEADERS = ['ID_CAMPANA', 'SKU', 'STOCK_ERP', 'STOCK_FISICO', 'ULTIMA_ACTUALIZACION'];
  const NOW = '2026-09-19T00:00:00.000Z';

  // La marca de tiempo se inyecta siempre, y el resto se toma del encabezado exacto
  const built = buildAuditRowValues(HEADERS, { ID_CAMPANA: 'C1', SKU: 'S1', STOCK_ERP: 10 }, NOW);
  assert(built.join('|') === `C1|S1|10||${NOW}`,
    'buildAuditRowValues respeta el orden de encabezados y sella la actualización');

  // Claves en minúscula (payloads internos) se resuelven igual
  const builtLower = buildAuditRowValues(HEADERS, { id_campana: 'C1', sku: 'S1', stock_erp: 7 }, NOW);
  assert(builtLower.join('|') === `C1|S1|7||${NOW}`,
    'buildAuditRowValues acepta claves en minúscula');

  // Regresión: filas repetidas de la MISMA campaña + SKU en un lote no deben duplicarse.
  // Antes, el fallback fila a fila insertaba una fila por cada entrada del lote.
  const duplicated = dedupeAuditRows([
    { ID_CAMPANA: 'C1', SKU: 'S1', STOCK_ERP: 10 },
    { ID_CAMPANA: 'C1', SKU: 'S1', STOCK_ERP: 20 },
  ], HEADERS, NOW);
  assert(duplicated.length === 1,
    'dedupeAuditRows colapsa filas repetidas de campaña + SKU');
  assert(duplicated[0][2] === '20',
    'dedupeAuditRows conserva la ÚLTIMA lectura del lote');

  // Consolidación: sobrescribe la fila existente de la misma campaña + SKU (no agrega)
  const existing = [HEADERS, ['C1', 'S1', '5', '5', 'previo'], ['C1', 'S2', '3', '3', 'previo']];
  const merged = consolidateAuditRows(existing, [{ ID_CAMPANA: 'C1', SKU: 'S1', STOCK_ERP: 99 }], HEADERS, NOW);
  assert(merged.length === 3, // 1 encabezado + 2 filas (S1 sobrescrita, S2 intacta)
    'consolidateAuditRows no agrega filas cuando la clave ya existe');
  assert(merged[1][2] === '99', 'consolidateAuditRows sobrescribe los valores de la clave existente');
  assert(merged[2][2] === '3', 'consolidateAuditRows preserva las filas de otras claves');

  // Una clave nueva sí se agrega
  const mergedNew = consolidateAuditRows(existing, [{ ID_CAMPANA: 'C1', SKU: 'S3', STOCK_ERP: 1 }], HEADERS, NOW);
  assert(mergedNew.length === 4, 'consolidateAuditRows agrega una fila para una clave nueva');

  // Filas de encabezado siempre en la primera posición
  assert(mergedNew[0].join('|') === HEADERS.join('|'),
    'consolidateAuditRows mantiene los encabezados como primera fila');

  // Detección tolerante de columnas: encabezados con nombres alternativos
  const altHeaders = ['CAMPANA', 'CODIGO', 'STOCK_ERP'];
  const mergedAlt = consolidateAuditRows(
    [altHeaders, ['C9', 'SKU9', '1']],
    [{ ID_CAMPANA: 'C9', SKU: 'SKU9', STOCK_ERP: 42 }],
    altHeaders, NOW
  );
  assert(mergedAlt.length === 2 && mergedAlt[1][2] === '42',
    'consolidateAuditRows reconoce columnas CAMPANA/CODIGO alternativas');
}

console.log('\n--- 14. Pruebas de barcodeScannerConfig.ts (lectores de cámara) ---');
{
  // Regresión: el pistoleo móvil no incluía ITF, así que un código ITF (cajas y
  // pallets) escaneaba en el terminal de conteo pero NO en el móvil, dejando un
  // conteo incompleto. Todos los lectores comparten ahora esta lista.
  assert(BARCODE_SUPPORTED_FORMATS.includes(Html5QrcodeSupportedFormats.ITF),
    'la lista canónica incluye ITF (intercalado 2 de 5)');
  assert(BARCODE_SUPPORTED_FORMATS.length === 8,
    'la lista canónica cubre los 8 formatos de bodega sin duplicados');
  assert(new Set(BARCODE_SUPPORTED_FORMATS).size === BARCODE_SUPPORTED_FORMATS.length,
    'la lista canónica no tiene formatos repetidos');
  for (const required of [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.QR_CODE,
  ]) {
    assert(BARCODE_SUPPORTED_FORMATS.includes(required),
      `la lista canónica incluye el formato ${Html5QrcodeSupportedFormats[required]}`);
  }

  // Selección de cámara trasera
  const cams = [
    { id: 'front', label: 'Front Camera' },
    { id: 'back', label: 'Back Camera' },
  ];
  assert(pickRearCamera(cams)?.id === 'back',
    'pickRearCamera elige la cámara trasera según la etiqueta');
  assert(pickRearCamera([{ id: 'environ', label: 'camera2 0, facing back' }])?.id === 'environ',
    'pickRearCamera reconoce etiquetas genéricas de cámara trasera');

  // Sin etiqueta identificable cae a la última cámara (suele ser la trasera)
  assert(pickRearCamera([{ id: 'a', label: '' }, { id: 'b', label: '' }])?.id === 'b',
    'pickRearCamera cae a la última cámara cuando no hay etiqueta reconocible');
  assert(pickRearCamera([]) === null,
    'pickRearCamera devuelve null cuando no hay cámaras');
}

console.log('\n--- 15. Pruebas de computeCampaignConsolidationMatrix (matriz de cuadratura) ---');
{
  const makeCampaign = (overrides: Partial<InventoryCampaign> = {}): InventoryCampaign => ({
    id: 'camp-1',
    nombre: 'Auditoría Local 121',
    local: 'LOCAL 121',
    fechaInicio: '2026-09-01T00:00:00.000Z',
    fechaActualizacion: '2026-09-01T00:00:00.000Z',
    estado: 'ACTIVA',
    snapshotTeoricoActual: {},
    historialSnapshots: [],
    sessionIds: [],
    itemsValidadosCerrados: {},
    ajustesVentaManual: {},
    ...overrides
  });

  const makeSession = (sku: string, cantidad: number, overrides: Partial<StockCountSession> = {}): StockCountSession => ({
    id: `ses-${sku}`,
    nombre: 'Conteo Pasillo 3',
    ubicacion: 'Pasillo 3',
    modo: 'DOCUMENT',
    requiereVencimiento: false,
    hojaOrigen: 'main',
    estado: 'IN_PROGRESS',
    fechaInicio: '2026-09-10T00:00:00.000Z',
    conteos: [{
      id: 'c1', sku, descripcion: `Producto ${sku}`, cantidad,
      timestamp: '2026-09-10T10:00:00.000Z'
    }],
    ...overrides
  });

  const snapshotItem = (sku: string, stockTeorico: number, extra: Partial<CampaignSnapshotItem> = {}) => ({
    sku, descripcion: `Producto ${sku}`, stockTeorico, fechaCarga: '2026-09-01T00:00:00.000Z', ...extra
  });

  // Cuadrado: físico == teórico
  const campOk = makeCampaign({
    snapshotTeoricoActual: { SKU_A: snapshotItem('SKU_A', 100) }
  });
  const mOk = computeCampaignConsolidationMatrix(campOk, [makeSession('SKU_A', 100)]);
  assert(mOk.cuadradosCount === 1 && mOk.discrepanciasCount === 0 &&
    mOk.nuncaPistoleadosCount === 0 && mOk.hallazgosCount === 0,
    'clasifica como VALIDADO_OK cuando el stock físico coincide con el teórico');
  assert(mOk.porcentajeCobertura === 100,
    'cobertura es 100% cuando se pistoleó todo el universo teórico');

  // Falta: físico < teórico
  const mShort = computeCampaignConsolidationMatrix(campOk, [makeSession('SKU_A', 85)]);
  assert(mShort.discrepanciasCount === 1 && mShort.discrepancias[0].diferenciaNeta === -15,
    'clasifica DISCREPANCIA por faltante con diferencia negativa (-15)');

  // Sobra: físico > teórico
  const mOver = computeCampaignConsolidationMatrix(campOk, [makeSession('SKU_A', 130)]);
  assert(mOver.discrepanciasCount === 1 && mOver.discrepancias[0].diferenciaNeta === 30,
    'clasifica DISCREPANCIA por sobrante con diferencia positiva (+30)');

  // Nunca pistoleado: teórico con stock pero cero lecturas
  const mNever = computeCampaignConsolidationMatrix(campOk, []);
  assert(mNever.nuncaPistoleadosCount === 1 && mNever.porcentajeCobertura === 0,
    'clasifica NUNCA_PISTOLEADO y cobertura 0% cuando no hay lecturas');

  // Hallazgo: pistoleado físico ausente del snapshot ERP
  const mFound = computeCampaignConsolidationMatrix(campOk, [makeSession('SKU_NUEVO', 12)]);
  assert(mFound.hallazgosCount === 1 && mFound.hallazgos[0].stockTeorico === 0 &&
    mFound.hallazgos[0].diferenciaNeta === 12,
    'clasifica HALLAZGO para un SKU físico ausente del ERP');

  // Ajuste de venta en caja: baja el teórico efectivo
  const campAdj = makeCampaign({
    snapshotTeoricoActual: { SKU_A: snapshotItem('SKU_A', 100) },
    ajustesVentaManual: { SKU_A: 10 }
  });
  const mAdj = computeCampaignConsolidationMatrix(campAdj, [makeSession('SKU_A', 90)]);
  assert(mAdj.cuadradosCount === 1 && mAdj.cuadrados[0].stockTeoricoEfectivo === 90,
    'el ajuste de venta en caja (10u) reduce el teórico efectivo y cuadra con 90');

  // Cierre manual manda sobre el cálculo
  const campClosed = markSkuAsClosedInCampaign(campOk, 'SKU_A', 100, 5);
  const mClosed = computeCampaignConsolidationMatrix(campClosed, [makeSession('SKU_A', 5)]);
  assert(mClosed.cuadradosCount === 1 && mClosed.discrepanciasCount === 0,
    'un SKU validado y cerrado permanece en VALIDADO_OK aunque su diferencia no sea cero');

  // Consolidación multi-sesión
  const mMulti = computeCampaignConsolidationMatrix(campOk, [
    makeSession('SKU_A', 60),
    makeSession('SKU_A', 40, { id: 'ses-2', ubicacion: 'Pasillo 4' })
  ]);
  assert(mMulti.cuadrados[0].stockFisicoTotal === 100 && mMulti.cuadrados[0].sesionesDondeAparece.length === 2,
    'acumula el conteo del mismo SKU repartido en dos sesiones (60 + 40)');

  // Filtro por campaña: sesiones ajenas no contaminan
  const campScoped = makeCampaign({
    snapshotTeoricoActual: { SKU_A: snapshotItem('SKU_A', 100) },
    sessionIds: ['ses-SKU_A']
  });
  const mScoped = computeCampaignConsolidationMatrix(campScoped, [
    makeSession('SKU_A', 100),
    makeSession('SKU_A', 999, { id: 'otra' })
  ]);
  assert(mScoped.cuadrados[0].stockFisicoTotal === 100,
    'ignora sesiones que no pertenecen a la campaña');

  // Decimales: el stock del ERP puede venir con coma (1.250,50 -> 1250.5)
  const campDec = makeCampaign({
    snapshotTeoricoActual: { SKU_D: snapshotItem('SKU_D', 1250.5) }
  });
  const mDec = computeCampaignConsolidationMatrix(campDec, [makeSession('SKU_D', 1250)]);
  assert(mDec.discrepanciasCount === 1 && mDec.discrepancias[0].diferenciaNeta === -0.5,
    'diferencia decimal de -0.5 se clasifica DISCREPANCIA (no se redondea a cero)');

  // Estado por defecto: un SKU sin lecturas queda fuera de cuadrados y discrepancias
  const mDefault = computeCampaignConsolidationMatrix(campOk, []);
  assert(mDefault.nuncaPistoleados[0].estadoGlobal === 'NUNCA_PISTOLEADO',
    'el estado global del no pistoleado se fija explícitamente');

  // Integridad de totales
  assert(mOk.totalFisicoContado === 100 && mOk.totalTeoricoEsperado === 100 &&
    mOk.diferenciaNetaTotal === 0,
    'los totales físico/teórico/diferencia son consistentes');

  // buildAuditRowsFromCampaignMatrix produce las filas canónicas
  const auditRows = buildAuditRowsFromCampaignMatrix(mOk, campOk);
  assert(auditRows.length === 1 && auditRows[0].SKU === 'SKU_A',
    'buildAuditRowsFromCampaignMatrix emite una fila por SKU con el SKU correcto');
  assert(auditRows[0].ID_CAMPANA === 'camp-1' && auditRows[0].LOCAL === 'LOCAL 121',
    'las filas de auditoría llevan el ID de campaña y el local');
  assert(auditRows[0].ESTADO_AUDITORIA === 'CUADRADO_OK',
    'un SKU cuadrado se etiqueta CUADRADO_OK en la planilla de auditoría');
}

console.log('\n--- 16. Pruebas de identidad CU_VC y fin de mes (stockCountUtils) ---');
{
  // CU_VC = SKU + YYYY + MM: unidad de vencimiento sin lotes
  assert(generateCuVc('200021', '2027', '12') === '200021202712',
    'generateCuVc compone SKU + YYYY + MM');
  assert(generateCuVc('200021', 2027, 1) === '200021202701',
    'generateCuVc rellena el mes con cero a la izquierda (1 -> 01)');
  assert(generateCuVc(' 200 021 ', '2027', '07') === '200021202707',
    'generateCuVc elimina espacios internos y extremos del SKU');
  assert(generateCuVc('200021') === '200021',
    'sin año y mes, generateCuVc degrada al SKU limpio');
  assert(generateCuVc('200021', '27', '12') === '200021',
    'un año de 2 dígitos no produce un CU_VC válido (degrada al SKU)');
  assert(generateCuVc('200021', '2027', '13') === '200021',
    'un mes fuera de rango (13) no produce un CU_VC válido');
  assert(generateCuVc('', '2027', '12') === '',
    'generateCuVc devuelve cadena vacía sin SKU');

  // Fin de mes: la fecha de vencimiento se fija al último día del mes
  assert(calculateLastDayOfMonthDateString('2027', '02') === '28/02/2027',
    'fin de mes de febrero de 2027 (no bisiesto) es el día 28');
  assert(calculateLastDayOfMonthDateString('2028', '02') === '29/02/2028',
    'fin de mes de febrero de 2028 (bisiesto) es el día 29');
  assert(calculateLastDayOfMonthDateString('2027', '04') === '30/04/2027',
    'fin de mes de abril es el día 30');
  assert(calculateLastDayOfMonthDateString('2027', '12') === '31/12/2027',
    'fin de mes de diciembre es el día 31');
  assert(calculateLastDayOfMonthDateString('2027', '13') === '',
    'un mes inválido no tiene fecha de fin de mes');
}

console.log('\n--- 17. Pruebas de seguridad de gmailService (inyección MIME y escape) ---');
{
  const decode = (raw: string) => {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString('utf8');
  };

  // Un salto de linea en el destinatario permitiria inyectar cabeceras extra
  const injected = createMimeMessage({
    to: 'proveedor@ok.cl\r\nBcc: atacante@mal.cl',
    subject: 'Reporte',
    bodyHtml: '<p>hola</p>'
  });
  const decoded = decode(injected);
  assert(!/^Bcc:/m.test(decoded),
    'la inyeccion de cabecera Bcc via CRLF en el destinatario queda neutralizada');
  assert(decoded.startsWith('To: proveedor@ok.cl Bcc: atacante@mal.cl'),
    'el CRLF del destinatario se colapsa a un espacio dentro de la misma cabecera To');
  assert((decoded.match(/^Bcc:/gm) || []).length === 0,
    'el mensaje no contiene ninguna cabecera Bcc');

  // El asunto se codifica en base64 (no puede inyectar cabeceras)
  const withSubject = createMimeMessage({
    to: 'a@b.cl', subject: 'Asunto\r\nX-Evil: 1', bodyHtml: '<p>x</p>'
  });
  assert(!/^X-Evil:/m.test(decode(withSubject)),
    'un salto de linea en el asunto no inyecta cabeceras (va codificado en base64)');

  // escapeHtml neutraliza HTML de valores de usuario en tablas de correo
  assert(escapeHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;',
    'escapeHtml neutraliza etiquetas script');
  assert(escapeHtml('a & b "c" \'d\'') === 'a &amp; b &quot;c&quot; &#39;d&#39;',
    'escapeHtml neutraliza ampersand, comillas dobles y simples');
  assert(escapeHtml(null) === '' && escapeHtml(undefined) === '',
    'escapeHtml devuelve cadena vacia para null y undefined');
}

console.log('\n--- 18. Pruebas de cuadratura y sincronizacion con VENCIMIENTOS ---');
{
  // Cabeceras canonicas de la hoja VENCIMIENTOS (las mismas que consume el terminal).
  const HEADERS = ['ID_VC', 'SKU_VC', 'PRODUCTO_VC', 'MM', 'YYYY', 'FECHA_VC',
    'RUT_PROVEEDOR_VC', 'POLITICA', 'DIAS RETIRO_VC', 'MUNDO', 'PM', 'timestamp',
    'CU_VC', 'TIPO_EVENTO', 'CANTIDAD'];

  const entry = (sku: string, cantidad: number, extra: Partial<StockCountEntry> = {}): StockCountEntry =>
    ({ id: `c-${sku}-${cantidad}`, sku, descripcion: `Producto ${sku}`, cantidad, timestamp: '2026-09-10T10:00:00.000Z', ...extra });

  const session = (over: Partial<StockCountSession> = {}): StockCountSession =>
    ({ id: 's1', nombre: 'Conteo Pasillo 3', modo: 'DOCUMENT', requiereVencimiento: false,
       hojaOrigen: 'main', estado: 'IN_PROGRESS', fechaInicio: '2026-09-10T00:00:00.000Z',
       conteos: [], ...over });

  const sheetRow = (sku: string, cantidad: string, extra: Partial<InventoryItem> = {}): InventoryItem =>
    ({ _rowIndex: 2, SKU_VC: sku, CANTIDAD: cantidad, ...extra });

  // --- Cuadratura: teoria vs. fisico ---

  // Par discriminante del modo: si el teorico se filtrara a la cuadratura BLIND,
  // el conteo dejaria de ser limpio. El control positivo fija que el mapeo existe
  // y que la unica diferencia es el modo (mismo dato, misma sesion, distinto modo).
  const enBlind = reconcileStockCountSession(
    session({ modo: 'BLIND', conteos: [entry('SKU_A', 5)] }),
    [sheetRow('SKU_A', '100')], HEADERS);
  const enDocument = reconcileStockCountSession(
    session({ conteos: [entry('SKU_A', 5)] }),
    [sheetRow('SKU_A', '100')], HEADERS);
  assert(enDocument[0]?.teorico === 100,
    'DOCUMENT mapea el stock teorico de la hoja (control positivo de la cuadratura)');
  assert(enBlind[0]?.teorico === 0,
    'BLIND no mapea el stock teorico: la cuadratura no revela el dato del ERP');
  assert(enBlind[0]?.contado === 5,
    'BLIND si conserva lo contado fisicamente');

  // Clasificacion de estados de cuadratura.
  const falto = reconcileStockCountSession(session({ conteos: [entry('SKU_A', 5)] }), [sheetRow('SKU_A', '100')], HEADERS);
  assert(falto[0]?.estado === 'FALTANTE' && falto[0]?.diferencia === -95,
    'fisico menor que el teorico se clasifica FALTANTE con la diferencia negativa');

  const sobro = reconcileStockCountSession(session({ conteos: [entry('SKU_A', 120)] }), [sheetRow('SKU_A', '100')], HEADERS);
  assert(sobro[0]?.estado === 'SOBRANTE' && sobro[0]?.diferencia === 20,
    'fisico mayor que el teorico se clasifica SOBRANTE con la diferencia positiva');

  const cuadrado = reconcileStockCountSession(session({ conteos: [entry('SKU_A', 100)] }), [sheetRow('SKU_A', '100')], HEADERS);
  assert(cuadrado[0]?.estado === 'CUADRADO' && cuadrado[0]?.diferencia === 0,
    'fisico igual al teorico se clasifica CUADRADO');

  // Un SKU con teorico y cero lecturas es FALTANTE, no "inexistente".
  const sinLecturas = reconcileStockCountSession(session({ conteos: [] }), [sheetRow('SKU_Z', '10')], HEADERS);
  assert(sinLecturas[0]?.estado === 'FALTANTE' && sinLecturas[0]?.contado === 0,
    'un SKU con teorico y cero lecturas queda como FALTANTE (nunca pistoleado)');

  // Hallazgo fisico: pistoleado pero ausente de la hoja.
  const hallazgo = reconcileStockCountSession(session({ conteos: [entry('SKU_NUEVO', 8)] }), [], HEADERS);
  assert(hallazgo[0]?.estado === 'NO_CATALOGADO' && hallazgo[0]?.teorico === 0,
    'un SKU pistoleado ausente de la hoja se clasifica NO_CATALOGADO (hallazgo fisico)');

  // --- Consolidacion por CU_VC: la unidad de vencimiento es SKU + MM/YYYY ---

  const dosLecturasMismoCuVc = reconcileStockCountSession(
    session({
      requiereVencimiento: true,
      conteos: [
        entry('SKU_A', 3, { cu_vc: 'SKU_A202712', mm: '12', yyyy: '2027' }),
        entry('SKU_A', 4, { cu_vc: 'SKU_A202712', mm: '12', yyyy: '2027' })
      ]
    }), [], HEADERS);
  assert(dosLecturasMismoCuVc.length === 1 && dosLecturasMismoCuVc[0]?.contado === 7,
    'dos lecturas del mismo CU_VC se consolidan en una sola fila con la cantidad sumada');

  // Mismo SKU con distinto mes son vencimientos distintos: no deben fusionarse.
  const dosMeses = reconcileStockCountSession(
    session({
      requiereVencimiento: true,
      conteos: [
        entry('SKU_A', 3, { cu_vc: 'SKU_A202711', mm: '11', yyyy: '2027' }),
        entry('SKU_A', 4, { cu_vc: 'SKU_A202712', mm: '12', yyyy: '2027' })
      ]
    }), [], HEADERS);
  assert(dosMeses.length === 2,
    'el mismo SKU en meses distintos produce dos vencimientos separados');

  // --- Fila canonica de sincronizacion a VENCIMIENTOS ---

  const item = dosLecturasMismoCuVc[0];
  const row = buildVencimientosRowFromCount(item, 7);
  assert(row.CU_VC === 'SKU_A202712',
    'la fila sincronizada lleva el CU_VC compuesto');
  assert(row._entityKey === 'SKU_A202712' && row._entityKeyCol === 'CU_VC',
    'la fila sincronizada fija su clave de entidad, para que la cola offline re-localice la fila');
  assert(row._rowIndex === 7,
    'la fila sincronizada conserva el rowIndex original del item');
  assert(row.FECHA_VC === '31/12/2027',
    'la fila sincronizada fija la fecha de vencimiento al ultimo dia del mes');
  assert(row.CANTIDAD === 7,
    'la fila sincronizada lleva la cantidad fisica consolidada');
  assert(row.SKU_VC === 'SKU_A' && row.MM === '12' && row.YYYY === '2027',
    'la fila sincronizada descompone SKU, MM y YYYY en sus columnas canonicas');

  // Sin fecha de vencimiento la fila degrada al SKU: el terminal descarta estas
  // lecturas antes de sincronizar (filtro contado > 0 && mm && yyyy), asi que la
  // fila nunca deberia construirse; si se construyera, no debe inventar un CU_VC.
  const sinFecha = buildVencimientosRowFromCount(entry('SKU_A', 4), undefined);
  assert(sinFecha.CU_VC === 'SKU_A' && sinFecha.FECHA_VC === '' && sinFecha.MM === '',
    'sin MM/YYYY la fila degrada al SKU limpio y no inventa fecha de vencimiento');

  // La fila debe cubrir exactamente las columnas canonicas mas los metadatos internos.
  const esperadas = HEADERS.filter(h => h !== 'TIPO_EVENTO');
  assert(esperadas.every(h => h in row),
    'la fila sincronizada cubre las columnas canonicas de VENCIMIENTOS');
}

console.log('\n--- 19. Pruebas de agregacion y filtrado del conteo (countAggregation) ---');
{
  // Estas ocho funciones vivian como useMemo dentro del terminal y no tenian
  // cobertura. Como logica pura, se prueban aqui sin montar el DOM.
  const entry = (sku: string, cantidad: number, extra: Partial<StockCountEntry> = {}): StockCountEntry => ({
    id: `${sku}-${Math.random()}`,
    sku,
    descripcion: `Producto ${sku}`,
    cantidad,
    timestamp: '2026-09-19T10:00:00Z',
    ...extra
  });
  const session = (conteos: StockCountEntry[]): StockCountSession => ({
    id: 's1',
    nombre: 'Mueble 1',
    modo: 'DOCUMENT',
    requiereVencimiento: true,
    hojaOrigen: 'main',
    estado: 'IN_PROGRESS',
    fechaInicio: '2026-09-19T09:00:00Z',
    conteos,
    rangoAnos: { desde: 2026, hasta: 2028 }
  });
  const recon = (over: Partial<StockCountReconciliationItem>): StockCountReconciliationItem => ({
    itemKey: over.sku || 'SKU', sku: 'SKU', descripcion: 'P',
    teorico: 0, contado: 0, diferencia: 0, estado: 'CUADRADO', ajusteMovimiento: 0,
    ...over
  });

  // Agrupacion: suma por SKU, recolecta ubicaciones sin duplicar y conserva el
  // primer MM/YYYY visto. Es el invariante del que depende la cuadratura por CU_VC.
  const grouped = groupSkuEntries(session([
    entry('A', 3, { ubicacion: 'Pasillo 1', mm: '12', yyyy: '2027' }),
    entry('A', 2, { ubicacion: 'Pasillo 1' }),
    entry('A', 1, { ubicacion: 'Pasillo 2' }),
    entry('B', 5)
  ]));
  const grupoA = grouped.find(g => g.sku === 'A')!;
  assert(grupoA.totalCantidad === 6, 'agregacion: suma las cantidades del mismo SKU (3+2+1)');
  assert(grupoA.readingsCount === 3, 'agregacion: cuenta las lecturas del mismo SKU');
  assert(grupoA.ubicaciones.length === 2, 'agregacion: deduplica ubicaciones repetidas');
  assert(grupoA.mm === '12' && grupoA.yyyy === '2027',
    'agregacion: conserva el primer MM/YYYY del SKU');
  assert(grouped.length === 2, 'agregacion: un grupo por SKU distinto');
  assert(groupSkuEntries(null).length === 0, 'agregacion: sin sesion no hay grupos');

  // La lista de lecturas agrupa por SKU, no por CU_VC: dos meses del mismo SKU
  // se ven como un solo grupo con el acumulado. Es distinto del motor de
  // cuadratura, que si separa por CU_VC (SKU + MM/YYYY). Se fija aqui para que
  // cambiar la clave de agrupacion sin querer no pase inadvertido.
  const dosMeses = groupSkuEntries(session([
    entry('A', 3, { cu_vc: 'A202712', mm: '12', yyyy: '2027' }),
    entry('A', 2, { cu_vc: 'A202801', mm: '01', yyyy: '2028' })
  ]));
  assert(dosMeses.length === 1 && dosMeses[0].totalCantidad === 5,
    'agregacion: agrupa por SKU aunque los CU_VC sean de meses distintos');

  // Ultima lectura: el terminal inserta al frente, asi que conteos[0] es la mas
  // reciente y el acumulado debe sumar todas las lecturas de ese SKU.
  const last = getLastScannedItem(session([entry('A', 4), entry('A', 2), entry('B', 9)]))!;
  assert(last.sku === 'A' && last.totalAcumulado === 6 && last.scanCount === 2,
    'ultima lectura: acumula solo las lecturas de su SKU');
  assert(getLastScannedItem(session([])) === null, 'ultima lectura: sesion vacia devuelve null');

  // Filtros de lecturas: buscan en SKU, descripcion y ubicacion.
  const entries = [entry('ABC', 1, { ubicacion: 'Rack Norte' }), entry('XYZ', 2, { descripcion: 'Jabon' })];
  assert(filterGroupedEntries(grouped, '').length === grouped.length,
    'filtro lecturas: busqueda vacia devuelve todo');
  assert(filterChronoEntries(session(entries), '').length === 2,
    'filtro lecturas: busqueda vacia devuelve todo lo cronologico');
  assert(filterChronoEntries(session(entries), 'rack').length === 1,
    'filtro lecturas: encuentra por ubicacion');
  assert(filterChronoEntries(session(entries), 'jabon').length === 1,
    'filtro lecturas: encuentra por descripcion');
  assert(filterChronoEntries(session(entries), 'nada').length === 0,
    'filtro lecturas: sin coincidencias devuelve vacio');
  assert(filterChronoEntries(null, 'x').length === 0, 'filtro lecturas: sin sesion devuelve vacio');

  // KPIs: la diferencia neta es contado - (teorico + ajusteMovimiento), y el
  // ajuste por movimiento (ventas del turno) tiene que entrar en el calculo.
  const metrics = computeReconciliationMetrics([
    recon({ sku: 'A', teorico: 10, contado: 10, ajusteMovimiento: 0, estado: 'CUADRADO' }),
    recon({ sku: 'B', teorico: 8, contado: 5, ajusteMovimiento: 0, estado: 'FALTANTE' }),
    recon({ sku: 'C', teorico: 2, contado: 4, ajusteMovimiento: 0, estado: 'SOBRANTE' }),
    recon({ sku: 'D', teorico: 0, contado: 3, ajusteMovimiento: 0, estado: 'NO_CATALOGADO' }),
    recon({ sku: 'E', teorico: 5, contado: 4, ajusteMovimiento: 1, estado: 'CUADRADO' })
  ]);
  assert(metrics.totalContado === 26, 'kpis: suma el total contado');
  assert(metrics.totalTeorico === 26, 'kpis: el teorico incluye el ajuste por movimiento');
  assert(metrics.diferenciaNeta === 0, 'kpis: la diferencia neta cruza contado contra teorico ajustado');
  assert(metrics.cuadrados === 2 && metrics.faltantes === 1 && metrics.sobrantes === 1 && metrics.noCatalogados === 1,
    'kpis: clasifica cada estado en su propio contador');
  assert(metrics.conDiferencia === 3,
    'kpis: conDiferencia agrupa faltantes, sobrantes y no catalogados');
  assert(metrics.cobertura === 100,
    'kpis: la cobertura es el porcentaje de lineas con lectura (las 5 tienen lectura)');

  // Division por cero: una cuadratura vacia debe dar 0%, no NaN.
  const vacio = computeReconciliationMetrics([]);
  assert(vacio.cobertura === 0 && !Number.isNaN(vacio.cobertura),
    'kpis: cuadratura vacia da 0% de cobertura y no NaN');

  // Filtros de cuadratura: 'DIF' es "todo lo que no esta cuadrado", no solo faltantes.
  // D (FALTANTE de 111) existe para que el cruce estado+proveedor discrimine:
  // filtrar por 111 debe devolver 2 filas, y por 111+DIF solo 1.
  const lista = [
    recon({ sku: 'A', estado: 'CUADRADO', rutProveedor: '111' }),
    recon({ sku: 'B', estado: 'FALTANTE', rutProveedor: '222' }),
    recon({ sku: 'C', estado: 'NO_CATALOGADO', rutProveedor: '222' }),
    recon({ sku: 'D', estado: 'FALTANTE', rutProveedor: '111' })
  ];
  assert(filterReconciliation(lista, 'ALL', 'ALL').length === 4,
    'filtro cuadratura: ALL devuelve todo');
  assert(filterReconciliation(lista, 'DIF', 'ALL').length === 3,
    'filtro cuadratura: DIF incluye faltantes y no catalogados');
  assert(filterReconciliation(lista, 'CUADRADO', 'ALL').length === 1,
    'filtro cuadratura: filtra por un estado concreto');
  assert(filterReconciliation(lista, 'ALL', '111').length === 2,
    'filtro cuadratura: filtra por proveedor');
  assert(filterReconciliation(lista, 'DIF', '111').length === 1,
    'filtro cuadratura: combina estado y proveedor (111 tiene un cuadrado y un faltante)');

  assert(getReconciliationProviders(lista).join(',') === '111,222',
    'proveedores: lista los distintos y los ordena');
  assert(getReconciliationProviders([]).length === 0,
    'proveedores: sin datos devuelve lista vacia');

  // Checklist pendiente: SKUs con teorico y cero lecturas; un SKU no catalogado
  // (teorico 0) no es pendiente porque no se esperaba nada de el.
  const pend = getPendingItems(session([]), [
    recon({ sku: 'A', teorico: 5, contado: 0 }),
    recon({ sku: 'B', teorico: 5, contado: 5 }),
    recon({ sku: 'C', teorico: 0, contado: 0 })
  ], '');
  assert(pend.length === 1 && pend[0].sku === 'A',
    'pendientes: solo los SKUs con teorico y cero lecturas');
  assert(getPendingItems(session([]), pend, 'a').length === 1,
    'pendientes: filtra por SKU');
  assert(getPendingItems(null, pend, '').length === 0,
    'pendientes: sin sesion no hay checklist');
}

console.log('\n--- 20. Pruebas de derivacion y filtrado de campanas (campaignAggregation) ---');
{
  const makeCampaign = (overrides: Partial<InventoryCampaign> = {}): InventoryCampaign => ({
    id: 'camp-1',
    nombre: 'Auditoría Local 121',
    local: 'LOCAL 121',
    fechaInicio: '2026-09-01T00:00:00.000Z',
    fechaActualizacion: '2026-09-01T00:00:00.000Z',
    estado: 'ACTIVA',
    snapshotTeoricoActual: {},
    historialSnapshots: [],
    sessionIds: [],
    itemsValidadosCerrados: {},
    ajustesVentaManual: {},
    ...overrides
  });

  const makeSession = (sku: string, cantidad: number): StockCountSession => ({
    id: `ses-${sku}`,
    nombre: 'Conteo Pasillo 3',
    ubicacion: 'Pasillo 3',
    modo: 'DOCUMENT',
    requiereVencimiento: false,
    hojaOrigen: 'main',
    estado: 'IN_PROGRESS',
    fechaInicio: '2026-09-10T00:00:00.000Z',
    conteos: [{
      id: 'c1', sku, descripcion: `Producto ${sku}`, cantidad,
      timestamp: '2026-09-10T10:00:00.000Z'
    }]
  });

  const snapshotItem = (sku: string, stockTeorico: number, extra: Partial<CampaignSnapshotItem> = {}) => ({
    sku, descripcion: `Producto ${sku}`, stockTeorico, fechaCarga: '2026-09-01T00:00:00.000Z', ...extra
  });

  // --- resolveActiveCampaign ---
  assert(resolveActiveCampaign([], null) === null,
    'campana activa: sin campanas devuelve null');

  const c1 = makeCampaign({ id: 'camp-1' });
  const c2 = makeCampaign({ id: 'camp-2' });
  assert(resolveActiveCampaign([c1, c2], null)?.id === 'camp-1',
    'campana activa: sin id seleccionado cae a la primera (evita el estado "sin campana" con datos)');
  assert(resolveActiveCampaign([c1, c2], 'camp-2')?.id === 'camp-2',
    'campana activa: con id seleccionado devuelve la que corresponde');
  assert(resolveActiveCampaign([c1, c2], 'no-existe') === null,
    'campana activa: id desconocido devuelve null');

  // --- collectAllAuditRows ---
  assert(collectAllAuditRows(null).length === 0,
    'filas de auditoria: sin matriz no hay filas');

  const camp = makeCampaign({
    snapshotTeoricoActual: {
      SKU_OK: snapshotItem('SKU_OK', 100),
      SKU_DIF: snapshotItem('SKU_DIF', 100),
      SKU_NUNCA: snapshotItem('SKU_NUNCA', 50)
    }
  });
  const matriz = computeCampaignConsolidationMatrix(camp, [
    makeSession('SKU_OK', 100),
    makeSession('SKU_DIF', 80),
    makeSession('SKU_NUEVO', 7)
  ]);

  const allRows = collectAllAuditRows(matriz);
  assert(allRows.length === 4,
    'filas de auditoria: agrega los 4 estados (cuadrados + discrepancias + nunca + hallazgos)');
  const estados = new Set(allRows.map(r => r.estadoGlobal));
  assert(estados.has('VALIDADO_OK') && estados.has('DISCREPANCIA') &&
    estados.has('NUNCA_PISTOLEADO') && estados.has('HALLAZGO'),
    'filas de auditoria: incluye los cuatro estados de la separacion de aguas');

  // --- getAuditProviders ---
  assert(getAuditProviders([]).length === 0,
    'proveedores: sin filas devuelve lista vacia');

  const conProv = [
    { ...allRows[0], proveedor: 'Lab Norte' },
    { ...allRows[0], proveedor: 'Lab Sur' },
    { ...allRows[0], proveedor: 'Lab Norte' },
    { ...allRows[0], proveedor: '' }
  ];
  const provs = getAuditProviders(conProv as typeof allRows);
  assert(provs.length === 2 && provs[0] === 'Lab Norte' && provs[1] === 'Lab Sur',
    'proveedores: deduplica, descarta vacios y ordena alfabeticamente');

  // --- filterAuditRows ---
  assert(filterAuditRows(null, 'ALL', 'ALL', '').length === 0,
    'filtro de matriz: sin matriz devuelve vacio');

  assert(filterAuditRows(matriz, 'DISCREPANCIA', 'ALL', '').length === 1,
    'filtro de matriz: DISCREPANCIA muestra solo discrepancias');
  assert(filterAuditRows(matriz, 'NUNCA_PISTOLEADO', 'ALL', '').length === 1,
    'filtro de matriz: NUNCA_PISTOLEADO muestra solo los no pistoleados');
  assert(filterAuditRows(matriz, 'HALLAZGO', 'ALL', '').length === 1,
    'filtro de matriz: HALLAZGO muestra solo hallazgos fisicos');
  assert(filterAuditRows(matriz, 'VALIDADO_OK', 'ALL', '').length === 1,
    'filtro de matriz: VALIDADO_OK muestra solo cuadrados');
  assert(filterAuditRows(matriz, 'ALL', 'ALL', '').length === 4,
    'filtro de matriz: ALL agrega los cuatro estados');

  // Orden con ALL: lo que exige accion primero.
  const ordenAll = filterAuditRows(matriz, 'ALL', 'ALL', '');
  assert(ordenAll[0].estadoGlobal === 'DISCREPANCIA',
    'filtro de matriz: con ALL las discrepancias van primero (lo accionable arriba)');
  assert(ordenAll[ordenAll.length - 1].estadoGlobal === 'HALLAZGO',
    'filtro de matriz: con ALL los hallazgos van al final');

  // Filtro por proveedor.
  const conProveedor = makeCampaign({
    snapshotTeoricoActual: {
      SKU_P1: snapshotItem('SKU_P1', 100, { proveedor: 'Lab Norte' }),
      SKU_P2: snapshotItem('SKU_P2', 100, { proveedor: 'Lab Sur' })
    }
  });
  const matrizProv = computeCampaignConsolidationMatrix(conProveedor, [
    makeSession('SKU_P1', 90),
    makeSession('SKU_P2', 90)
  ]);
  assert(filterAuditRows(matrizProv, 'ALL', 'ALL', '').length === 2,
    'filtro de matriz: sin proveedor seleccionado muestra las dos discrepancias');
  assert(filterAuditRows(matrizProv, 'ALL', 'Lab Norte', '').length === 1,
    'filtro de matriz: filtra por proveedor seleccionado');

  // Busqueda: SKU, descripcion y proveedor.
  assert(filterAuditRows(matrizProv, 'ALL', 'ALL', 'SKU_P1').length === 1,
    'filtro de matriz: busca por SKU');
  assert(filterAuditRows(matrizProv, 'ALL', 'ALL', 'producto sku_p2').length === 1,
    'filtro de matriz: busca por descripcion sin distinguir mayusculas');
  assert(filterAuditRows(matrizProv, 'ALL', 'ALL', 'lab sur').length === 1,
    'filtro de matriz: busca por proveedor');
  assert(filterAuditRows(matrizProv, 'ALL', 'ALL', 'zzz').length === 0,
    'filtro de matriz: busqueda sin coincidencias devuelve vacio');
  assert(filterAuditRows(matrizProv, 'ALL', 'ALL', '   ').length === 2,
    'filtro de matriz: busqueda con solo espacios no filtra (equivale a vacio)');

  // Acumulativo: estado + proveedor + busqueda.
  assert(filterAuditRows(matrizProv, 'DISCREPANCIA', 'Lab Sur', 'sku_p2').length === 1,
    'filtro de matriz: estado, proveedor y busqueda se acumulan');
  assert(filterAuditRows(matrizProv, 'VALIDADO_OK', 'Lab Sur', '').length === 0,
    'filtro de matriz: acumular un estado sin filas da vacio');

  // Las filas devueltas siguen siendo las mismas entidades de la matriz.
  const soloDiscrepancia = filterAuditRows(matriz, 'DISCREPANCIA', 'ALL', '');
  assert(soloDiscrepancia[0] === matriz.discrepancias[0],
    'filtro de matriz: devuelve las mismas referencias, sin clonar');

  // Mutacion: quitando el trim interno de q, ' SKU_DIF ' deja de coincidir.
  // (Cuidado: quitar el trim de la guarda NO cambia nada, porque q se recorta igual.)
  assert(filterAuditRows(matriz, 'DISCREPANCIA', 'ALL', ' SKU_DIF ').length === 1,
    'filtro de matriz: recorta espacios alrededor del termino de busqueda');

  // createMetricsAccumulator: ruta compartida por el worker y el fallback sincronico.
  {
    const acc = createMetricsAccumulator(5);
    acc.addEventCategory('TRANSPORTE', 'NORMAL', 'SIN_ACCION');
    acc.addEventCategory('DIFERENCIA', 'NORMAL', 'SIN_ACCION');
    acc.addEventCategory('CAL_INTERNA', 'NORMAL', 'SIN_ACCION');
    acc.addEventCategory('CAL_EXTERNA', 'NORMAL', 'SIN_ACCION');
    acc.addEventCategory('CANJES', 'NORMAL', 'SIN_ACCION');
    acc.addEventCategory('AVERIA', 'NORMAL', 'SIN_ACCION');
    acc.addEventCategory('DEVOLUCION', 'NORMAL', 'SIN_ACCION');
    acc.addEventCategory('VENCIMIENTO_CERCANO', 'EXPIRED', 'CANJE_PROVEEDOR');
    acc.addEventCategory('VENCIMIENTO', 'DRAINAGE_PM', 'MERMA_DIRECTA');
    acc.addEventCategory('VENCIMIENTO', 'UPCOMING', 'VENTA_DRENAJE');
    acc.addEventCategory('VENCIMIENTO', 'RETIRE_NOW', 'SIN_ACCION');
    acc.addEventCategory('VENCIMIENTO', 'NORMAL', 'SIN_ACCION');
    acc.addResolution(true);
    acc.addResolution(false);
    const r = acc.finish();
    assert(r.eventMetrics.total === 5, 'acumulador: conserva el total de filas');
    assert(r.eventMetrics.transporte === 1 && r.eventMetrics.diferencia === 1,
      'acumulador: cuenta incidencias por categoria');
    assert(r.eventMetrics.vencimientos === 5,
      'acumulador: vencimientos agrupa cercano + los cuatro de vencimiento');
    assert(r.eventMetrics.vencimientoCercano === 1,
      'acumulador: vencimiento cercano se cuenta dentro de vencimientos');
    assert(r.eventMetrics.drainagePm === 1 && r.eventMetrics.upcoming === 1
      && r.eventMetrics.retireNow === 2,
      'acumulador: reparte estados de vencimiento (EXPIRED y RETIRE_NOW juntos)');
    assert(r.pmMetrics.canjeProveedor === 1 && r.pmMetrics.mermaDirecta === 1,
      'acumulador: separa canje proveedor de merma directa');
    assert(r.pmMetrics.enRegla === 1,
      'acumulador: enRegla descuenta drenaje, proximos y retiro');
    assert(r.eventResolutionMetrics.pending === 1 && r.eventResolutionMetrics.completed === 1,
      'acumulador: resume resolucion pendiente/realizada');
    assert(r.pmMetrics.total === r.eventMetrics.vencimientos,
      'acumulador: total PM espeja vencimientos');
  }

}

console.log(`\n========================================`);
console.log(`RESULTADOS DE PRUEBAS: ${passed} PASADAS, ${failed} FALLADAS`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
