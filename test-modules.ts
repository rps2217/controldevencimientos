/**
 * Test Suite para verificación modular y funcional según el protocolo Ponytail
 * Ejecuta pruebas unitarias e integrales sobre cada utilidad, servicio y módulo
 */
import type { TableSlice } from './src/types';
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
import { backendMirrorService } from './src/services/backendMirrorService';
import { getDefaultTicketTitle } from './src/utils/ticketUtils';
import {
  planMirrorDispatch,
  mirrorRetryDelayMs,
  isMirrorRetryable,
  clampMirrorIntervalSec,
  MIRROR_RETRY_BASE_MS,
  MIRROR_RETRY_MAX_MS,
  MIRROR_MAX_ATTEMPTS
} from './src/utils/mirrorSyncPolicy';
import {
  enqueueMirrorRetry,
  removeMirrorRetry,
  selectMirrorReady,
  readMirrorRetryQueue,
  writeMirrorRetryQueue,
  MIRROR_RETRY_QUEUE_KEY,
  MIRROR_RETRY_QUEUE_MAX
} from './src/utils/mirrorRetryQueue';

import {
  findColumnBySemantic,
  FIELD_PATTERNS,
  SEMANTIC_FIELD_OPTIONS
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
  DOTS_PER_MM,
  findRoll,
  moduleCount,
  evaluateFit,
  fitQuality,
  toMediaDescriptor,
  ROLLOS
} from './src/utils/labelMediaProfile';
import { generateBarcodeSvgString } from './src/utils/barcodeGenerator';
import {
  labelSizeDots,
  moduleWidthDots,
  rasterizeBarcode
} from './src/utils/labelRasterizer';
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
  itemMatchesSlice,
  detectTableCapabilities,
  resolveTableCapabilities,
  getCapabilityOverrideStatus,
  setTableCapabilityOverride,
  resetTableCapabilitiesToAuto
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
  isDemoMode,
  hasDemoEntry,
  setDemoEntry
} from './src/utils/appStorage';

import {
  saveStockCountSessionsToStorageDebounced,
  flushStockCountSessionsToStorage,
  generateCuVc,
  calculateLastDayOfMonthDateString,
  reconcileStockCountSession,
  buildVencimientosRowFromCount,
  buildAuditRowsFromSession,
  mergeCampaignsAndSessions
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
  filterAuditRows,
  computeProviderProgress,
  getProviderPendingSkus
} from './src/utils/campaignAggregation';
import { InventoryCampaign, StockCountSession, CampaignSnapshotItem, StockCountEntry, StockCountReconciliationItem, InventoryItem, SheetConfig } from './src/types';
import { mergeCloudConfigs, redactSecretsForCloudSheet } from './src/utils/dashboardConfigUtils';
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

  // Corrección manual: el automático manda salvo que el usuario lo corrija. Una hoja
  // ambigua (columna "Fecha" genérica) no detecta vencimiento; el usuario sí puede forzarlo.
  const ambigua = ['Articulo', 'Fecha', 'Cantidad'];
  const sinForzar = resolveTableCapabilities(ambigua);
  assert(!sinForzar.has('vencimiento'), 'una columna "Fecha" genérica no detecta vencimiento sola');
  assert(
    resolveTableCapabilities(ambigua, undefined, { enabled: ['vencimiento'] }).has('vencimiento'),
    'el usuario puede forzar la capacidad de vencimiento en una hoja ambigua'
  );

  // El override también puede quitar una capacidad que la detección sí encontró: una hoja
  // con fechas de vencimiento usada como bitácora de otra cosa.
  assert(
    !resolveTableCapabilities(SAMPLE_HEADERS, undefined, { disabled: ['vencimiento'] }).has('vencimiento'),
    'el usuario puede excluir una capacidad aunque las columnas la detecten'
  );
  assert(
    resolveTableCapabilities(SAMPLE_HEADERS, undefined, { disabled: ['vencimiento'] }).has('conteo'),
    'excluir una capacidad no toca las demás'
  );

  // Excluir y habilitar a la vez: la exclusión gana (el usuario quitó ruido, no lo añadió).
  assert(
    !resolveTableCapabilities(clientes, undefined, { enabled: ['vencimiento'], disabled: ['vencimiento'] }).has('vencimiento'),
    'si una capacidad esta habilitada y excluida a la vez, gana la exclusion'
  );

  // Los helpers de UI mueven el tri-estado y vuelven a Auto.
  const baseCfg = {} as SheetConfig;
  const forzado = setTableCapabilityOverride(baseCfg, 'Hoja X', 'conteo', 'enabled');
  assert(getCapabilityOverrideStatus('conteo', 'Hoja X', forzado) === 'enabled', 'setTableCapabilityOverride marca Forzado');
  assert(getCapabilityOverrideStatus('vencimiento', 'Hoja X', forzado) === 'auto', 'las demas capacidades siguen en Auto');
  const excluido = setTableCapabilityOverride(forzado, 'Hoja X', 'conteo', 'disabled');
  assert(getCapabilityOverrideStatus('conteo', 'Hoja X', excluido) === 'disabled', 'cambiar a Excluir retira el Forzado previo');
  assert(getCapabilityOverrideStatus('conteo', 'Hoja X', resetTableCapabilitiesToAuto(excluido, 'Hoja X')) === 'auto', 'reset devuelve la tabla a Auto');
  assert(
    Object.keys(resetTableCapabilitiesToAuto(excluido, 'Hoja X').tableCapabilities || {}).length === 0,
    'reset no deja entradas vacias en la config'
  );

  // El override llega a los slices: forzar vencimiento en una hoja ambigua habilita sus nativos.
  const slicesForzados = getSlicesForTable('Hoja X', [], undefined, ambigua, undefined, { enabled: ['vencimiento'] });
  assert(slicesForzados.length > 0 && slicesForzados.every(s => s.requiredCapability === 'vencimiento'), 'forzar la capacidad habilita los slices nativos correspondientes');
  assert(getSlicesForTable('Hoja X', [], undefined, ambigua).length === 0, 'sin forzar, la hoja ambigua no recibe slices nativos');
}

console.log('\n--- 7b. Particion de dominio: VENC. CERC. es incidencia, no vencimiento ---');
{
  // `VENC. CERC.` significa "llego con poca vida util": es un evento FRC, no una
  // categoria de vencimiento. El radar de vencimientos y el registro FRC deben ser
  // una particion estricta: ninguna fila puede contarse en ambos ni desaparecer.
  const headersVc = ['SKU', 'DESCRIPCION', 'FECHA_VENCIMIENTO', 'CANTIDAD', 'TIPO_EVENTO'];
  const filaVenc = { _rowIndex: 2, SKU: 'A', FECHA_VENCIMIENTO: '2027-01-01', TIPO_EVENTO: '' };
  const filaCercano = { _rowIndex: 3, SKU: 'B', FECHA_VENCIMIENTO: '2026-09-01', TIPO_EVENTO: 'VENC. CERC.' };
  const filaTransporte = { _rowIndex: 4, SKU: 'C', FECHA_VENCIMIENTO: '2027-05-01', TIPO_EVENTO: 'DET. PED' };

  // El gate por item de los slices nativos. Se usa un slice sintetico (solo con la
  // capacidad) para aislar la particion de dominio: los nativos reales añaden ademas
  // filtros de estado PM, que no son el objeto de esta prueba.
  const sliceVc: TableSlice = { id: 'test_vc', name: 'vc', tableKey: 'main', requiredCapability: 'vencimiento', isBuiltIn: false, filterConfig: {} };
  const sliceInc: TableSlice = { id: 'test_inc', name: 'inc', tableKey: 'events', requiredCapability: 'incidencia', isBuiltIn: false, filterConfig: {} };
  const tieneCapacidad = (s: TableSlice) => BUILT_IN_SLICES.some(b => b.requiredCapability === s.requiredCapability);
  assert(tieneCapacidad(sliceVc) && tieneCapacidad(sliceInc), 'existen slices nativos de ambos dominios');
  assert(itemMatchesSlice(filaVenc, sliceVc, headersVc), 'slice de vencimiento acepta un VENCIMIENTO puro');
  assert(!itemMatchesSlice(filaCercano, sliceVc, headersVc), 'slice de vencimiento RECHAZA VENC. CERC. (es FRC)');
  assert(!itemMatchesSlice(filaTransporte, sliceVc, headersVc), 'slice de vencimiento rechaza transporte');
  assert(itemMatchesSlice(filaCercano, sliceInc, headersVc), 'slice de incidencia acepta VENC. CERC.');

  // El conteo de la pildora «Todas» en el radar no puede incluir filas FRC.
  const counts = computeSliceCounts([filaVenc, filaCercano, filaTransporte], [sliceVc], headersVc);
  assert(counts[sliceVc.id] === 1, 'el radar de vencimientos cuenta solo la fila de vencimiento puro');

  // Particion estricta medida con el acumulador compartido (worker + fallback): cada
  // fila cae en exactamente uno de los dos dominios.
  const acc = createMetricsAccumulator(3);
  const catOf = getEventCategory;
  [filaVenc, filaCercano, filaTransporte].forEach(f => acc.addEventCategory(catOf(f, headersVc), 'NORMAL', 'SIN_ACCION'));
  const m = acc.finish();
  assert(m.eventMetrics.vencimientos === 1, 'metricas: solo la fila de vencimiento puro cuenta como vencimiento');
  assert(m.eventMetrics.vencimientoCercano === 1, 'metricas: VENC. CERC. cuenta en su propia categoria de incidencia');
  assert(m.eventMetrics.vencimientos + m.eventMetrics.vencimientoCercano + m.eventMetrics.transporte === 3,
    'metricas: la particion cubre las 3 filas sin solaparse ni perder ninguna');
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

  // Puerta de demostración del onboarding. La bandera es independiente de SCRIPT_URL:
  // entrar a demo NO debe escribir una URL falsa (haría que la app creyera tener backend
  // y encolara mutaciones contra un endpoint inexistente).
  store.clear();
  assert(hasDemoEntry() === false, 'appStorage: sin elección previa no hay entrada a demo');
  assert(store.has(STORAGE_KEYS.SCRIPT_URL) === false, 'appStorage: entrar a demo no escribe SCRIPT_URL');
  setDemoEntry(true);
  assert(hasDemoEntry() === true, 'appStorage: setDemoEntry(true) recuerda la elección');
  assert(isDemoMode() === true, 'appStorage: entrar a demo sigue siendo modo demo (sin SCRIPT_URL)');
  setDemoEntry(false);
  assert(hasDemoEntry() === false, 'appStorage: setDemoEntry(false) deshace la elección');
  // Un valor corrupto no debe abrir la puerta: sólo '1' significa "elegido".
  store.set(STORAGE_KEYS.DEMO_ENTRY, 'si');
  assert(hasDemoEntry() === false, 'appStorage: un valor distinto de 1 no abre la puerta de demo');

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

  // Vocabulario único de ESTADO_AUDITORIA entre las dos vías de guardado.
  //
  // La hoja `_AUDITORIA_INVENTARIO` es una sola y no tiene columna de origen: la sesión
  // (individual) y la campaña (consolidada) escriben en la MISMA columna. Con dos
  // vocabularios, un SKU cuadrado quedaba `CUADRADO` o `CUADRADO_OK` según por dónde
  // entró, y un pendiente `NUNCA_PISTOLEADO` o `NO_CATALOGADO`; cualquier filtro o
  // tabla dinámica sobre esa columna se parte en dos.
  const sesionVocab = buildAuditRowsFromSession(
    makeSession('SKU_A', 100),
    reconcileStockCountSession(makeSession('SKU_A', 100), [], ['SKU', 'CANTIDAD']),
    campOk
  );
  const vocabCampana = new Set(auditRows.map(r => r.ESTADO_AUDITORIA));
  const vocabSesion = new Set(sesionVocab.map(r => r.ESTADO_AUDITORIA));
  const vocabularioCanonico = new Set([
    'CUADRADO_OK', 'FALTANTE', 'SOBRANTE', 'NUNCA_PISTOLEADO', 'HALLAZGO_NO_ERP', 'VALIDADO_CERRADO'
  ]);
  assert([...vocabCampana, ...vocabSesion].every(v => vocabularioCanonico.has(v as string)),
    `ESTADO_AUDITORIA usa un solo vocabulario: campaña=${[...vocabCampana]} sesión=${[...vocabSesion]}`);
  assert([...vocabSesion].every(v => v !== 'NO_CATALOGADO'),
    'la vía de sesión no emite NO_CATALOGADO (el canon de la hoja es HALLAZGO_NO_ERP)');

  // --- 2da vuelta: REEMPLAZA, no suma (inventario general con stock en movimiento) ---
  //
  // Este es el invariante central del inventario general. La 2da vuelta existe para
  // CORREGIR un conteo, así que re-cuenta la misma mercadería; sumarla inflaba el
  // físico con unidades contadas dos veces (98 + 98 = 196 en vez de 98) y la matriz
  // reportaba un sobrante inexistente.

  const segundaVuelta = (sku: string, cantidad: number, overrides: Partial<StockCountSession> = {}) =>
    makeSession(sku, cantidad, {
      id: `seg-${sku}`,
      nombre: '2da Vuelta - Discrepancias',
      ubicacion: 'Auditoría 2da Vuelta',
      esSegundaVuelta: true,
      fechaInicio: '2026-09-11T00:00:00.000Z',
      ...overrides
    });

  // La vuelta confirma el mismo valor: el físico no se duplica.
  const mRecountSame = computeCampaignConsolidationMatrix(campOk, [
    makeSession('SKU_A', 98),
    segundaVuelta('SKU_A', 98)
  ]);
  assert(mRecountSame.discrepancias[0].stockFisicoTotal === 98,
    'la 2da vuelta con el mismo valor NO duplica el físico (98, no 196)',
    mRecountSame.discrepancias[0].stockFisicoTotal);
  assert(mRecountSame.discrepancias[0].diferenciaNeta === -2,
    'el faltante real es -2 y no un sobrante falso de +96',
    mRecountSame.discrepancias[0].diferenciaNeta);

  // La vuelta corrige la física: manda el valor de la vuelta.
  const mRecountFix = computeCampaignConsolidationMatrix(campOk, [
    makeSession('SKU_A', 90),
    segundaVuelta('SKU_A', 100)
  ]);
  assert(mRecountFix.cuadradosCount === 1 && mRecountFix.cuadrados[0].stockFisicoTotal === 100,
    'la 2da vuelta reemplaza el conteo anterior y puede dejar el SKU cuadrado');

  // Gana la vuelta MÁS RECIENTE cuando hay más de una.
  const mRecountDos = computeCampaignConsolidationMatrix(campOk, [
    makeSession('SKU_A', 90),
    segundaVuelta('SKU_A', 95),
    segundaVuelta('SKU_A', 100, { id: 'seg2', fechaInicio: '2026-09-12T00:00:00.000Z' })
  ]);
  assert(mRecountDos.cuadrados[0].stockFisicoTotal === 100,
    'entre varias 2das vueltas gana la más reciente');

  // Los SKUs que la vuelta NO re-cuenta conservan el conteo normal.
  const mRecountParcial = computeCampaignConsolidationMatrix(
    makeCampaign({
      snapshotTeoricoActual: {
        SKU_A: snapshotItem('SKU_A', 100),
        SKU_B: snapshotItem('SKU_B', 50)
      }
    }),
    [makeSession('SKU_A', 100), makeSession('SKU_B', 50), segundaVuelta('SKU_A', 100)]
  );
  const bParcial = [...mRecountParcial.cuadrados, ...mRecountParcial.discrepancias].find(r => r.sku === 'SKU_B')!;
  assert(bParcial && bParcial.stockFisicoTotal === 50,
    'un SKU que la 2da vuelta no toca conserva su conteo normal',
    bParcial?.stockFisicoTotal);

  // Dos muebles distintos del mismo SKU SÍ se suman: son mercadería distinta.
  const mDosMuebles = computeCampaignConsolidationMatrix(campOk, [
    makeSession('SKU_A', 50),
    makeSession('SKU_A', 50, { id: 'ses-mueble4', ubicacion: 'Mueble 4' })
  ]);
  assert(mDosMuebles.cuadrados[0].stockFisicoTotal === 100,
    'dos muebles distintos del mismo SKU se suman (50 + 50), no se reemplazan');

  // El resumen por ubicación no debe inventar un mueble "Auditoría 2da Vuelta".
  assert(!mRecountFix.resumenPorUbicacion.some(u => /2da Vuelta/i.test(u.ubicacion)),
    'la 2da vuelta se atribuye al mueble de su conteo, no crea un mueble fantasma',
    mRecountFix.resumenPorUbicacion.map(u => u.ubicacion).join(', '));

  // --- Orden cronológico: la vuelta corrige lo ANTERIOR, no lo posterior ---
  //
  // Las sesiones se agregan en orden de fecha, no agrupadas por bandera. Un conteo
  // normal posterior a una vuelta es una ubicación nueva (o stock que llegó después)
  // y debe SUMAR: la vuelta sólo reemplaza lo contado antes de ella. Agrupar por
  // bandera perdía esas unidades, y el operario veía un faltante que no existía.
  const normalEn = (id: string, cantidad: number, fecha: string) =>
    makeSession('SKU_A', cantidad, { id, fechaInicio: fecha });

  const normalAntes = normalEn('a', 30, '2026-09-10T00:00:00.000Z');
  const vueltaMedio = segundaVuelta('SKU_A', 50, { id: 'v', fechaInicio: '2026-09-11T00:00:00.000Z' });
  const normalDespues = normalEn('b', 20, '2026-09-12T00:00:00.000Z');

  const mCrono = computeCampaignConsolidationMatrix(campOk, [normalAntes, vueltaMedio, normalDespues]);
  const rCrono = [...mCrono.cuadrados, ...mCrono.discrepancias][0];
  assert(rCrono.stockFisicoTotal === 70,
    'un conteo normal POSTERIOR a la 2da vuelta suma sus unidades (50 + 20 = 70)',
    rCrono.stockFisicoTotal);

  // El mismo caso sin el conteo posterior: la vuelta reemplaza lo anterior.
  const mSoloVuelta = computeCampaignConsolidationMatrix(campOk, [normalAntes, vueltaMedio]);
  const rSoloVuelta = [...mSoloVuelta.cuadrados, ...mSoloVuelta.discrepancias][0];
  assert(rSoloVuelta.stockFisicoTotal === 50,
    'la 2da vuelta reemplaza el conteo normal anterior (50, no 80)',
    rSoloVuelta.stockFisicoTotal);

  // Un conteo normal anterior a la vuelta SÍ queda reemplazado.
  const mNormalAntes = computeCampaignConsolidationMatrix(campOk, [normalEn('a', 30, '2026-09-10T00:00:00.000Z'), vueltaMedio]);
  const rNormalAntes = [...mNormalAntes.cuadrados, ...mNormalAntes.discrepancias][0];
  assert(rNormalAntes.stockFisicoTotal === 50,
    'un conteo normal anterior a la vuelta queda corregido por ella',
    rNormalAntes.stockFisicoTotal);

  // El resultado no depende del orden de entrada: las sesiones pueden cargarse en
  // cualquier orden desde localStorage o desde la fusión multi-dispositivo.
  const mOrdenInverso = computeCampaignConsolidationMatrix(campOk, [normalDespues, vueltaMedio, normalAntes]);
  assert(mOrdenInverso.totalFisicoContado === mCrono.totalFisicoContado,
    'el resultado no depende del orden del arreglo de sesiones (orden cronológico estable)',
    `${mCrono.totalFisicoContado} vs ${mOrdenInverso.totalFisicoContado}`);

  // --- Corte documental: separa el movimiento del faltante real ---
  //
  // El snapshot congela el stock en un instante (`fechaCarga`). Un conteo posterior
  // mide mercadería que pudo venderse desde el corte, así que su diferencia no es
  // atribuible a una pérdida. La matriz lo expone para no perseguir faltantes falsos.
  const campCorte = makeCampaign({
    snapshotTeoricoActual: {
      SKU_A: snapshotItem('SKU_A', 100),
      SKU_B: snapshotItem('SKU_B', 50)
    },
    historialSnapshots: [{
      id: 'snap-1',
      nombreArchivo: 'snapshot_erp.xlsx',
      fechaCarga: '2026-09-10T09:00:00.000Z',
      totalSkus: 2,
      totalStockTeorico: 150,
      totalVentasRegistradas: 0
    }]
  });

  const mCorte = computeCampaignConsolidationMatrix(campCorte, [
    makeSession('SKU_A', 90, { fechaInicio: '2026-09-10T12:00:00.000Z', conteos: [{ id: 'c1', sku: 'SKU_A', descripcion: 'A', cantidad: 90, timestamp: '2026-09-10T12:00:00.000Z' }] })
  ]);
  assert(mCorte.corte.fechaCorte === '2026-09-10T09:00:00.000Z',
    'el corte usa la fecha del último snapshot del ERP (historialSnapshots)',
    mCorte.corte.fechaCorte);
  assert(mCorte.corte.skusConLecturaPosterior.includes('SKU_A'),
    'un SKU contado DESPUÉS del corte se marca como susceptible a movimiento');
  assert(!mCorte.corte.skusConLecturaPosterior.includes('SKU_B'),
    'un SKU sin lecturas no se marca como conteo posterior');
  assert(mCorte.corte.skusPendientesDeConteo.includes('SKU_B') &&
    !mCorte.corte.skusPendientesDeConteo.includes('SKU_A'),
    'los SKUs teóricos con stock y sin lecturas quedan pendientes de conteo');

  // Un conteo ANTERIOR al corte no es movimiento: mide contra el stock congelado.
  const mCorteAntes = computeCampaignConsolidationMatrix(campCorte, [
    makeSession('SKU_A', 90, { fechaInicio: '2026-09-10T06:00:00.000Z', conteos: [{ id: 'c1', sku: 'SKU_A', descripcion: 'A', cantidad: 90, timestamp: '2026-09-10T06:00:00.000Z' }] })
  ]);
  assert(!mCorteAntes.corte.skusConLecturaPosterior.includes('SKU_A'),
    'un conteo anterior al corte NO se marca como movimiento posterior');

  // Sin historial de snapshots, el corte cae a la fecha del propio ítem teórico: no se
  // pierde la capacidad de detectar movimiento por no haber subido un archivo nuevo.
  const campSinSnap = makeCampaign({ snapshotTeoricoActual: { SKU_A: snapshotItem('SKU_A', 100) } });
  const mSinCorte = computeCampaignConsolidationMatrix(campSinSnap, [makeSession('SKU_A', 100)]);
  assert(mSinCorte.corte.fechaCorte === '2026-09-01T00:00:00.000Z',
    'sin historial, el corte cae a la fecha del ítem teórico',
    mSinCorte.corte.fechaCorte);
  assert(mSinCorte.corte.skusConLecturaPosterior.includes('SKU_A'),
    'el fallback al ítem teórico sigue detectando un conteo posterior al corte');

  // Sin ninguna fecha utilizable no hay corte: las listas quedan vacías en vez de marcar
  // todo como movimiento (una marca masiva sería peor que no marcar nada).
  const campSinFecha = makeCampaign({
    snapshotTeoricoActual: { SKU_A: { ...snapshotItem('SKU_A', 100), fechaCarga: '' } }
  });
  const mSinFecha = computeCampaignConsolidationMatrix(campSinFecha, [makeSession('SKU_A', 100)]);
  assert(mSinFecha.corte.fechaCorte === null && mSinFecha.corte.skusConLecturaPosterior.length === 0,
    'sin fecha de corte utilizable no se marca ningún conteo como posterior');

  // La marca llega a la FILA, que es lo que la UI pinta con el badge POST-CORTE.
  const filaPostCorte = [...mCorte.cuadrados, ...mCorte.discrepancias].find(r => r.sku === 'SKU_A');
  assert(filaPostCorte?.conteoPosteriorAlCorte === true,
    'la fila del SKU contado después del corte lleva conteoPosteriorAlCorte');
  const filaPreCorte = [...mCorteAntes.cuadrados, ...mCorteAntes.discrepancias].find(r => r.sku === 'SKU_A');
  assert(filaPreCorte?.conteoPosteriorAlCorte === false,
    'la fila de un conteo anterior al corte NO lleva la marca');




  // --- Totales del encabezado coherentes con las filas ---
  //
  // El encabezado debe usar el teórico EFECTIVO (con ajuste de ventas del turno). Si
  // usara el del snapshot, diría "faltan 10" mientras todas las filas dicen "cuadrado".

  const campDosSkus = makeCampaign({
    snapshotTeoricoActual: {
      SKU_A: snapshotItem('SKU_A', 100),
      SKU_B: snapshotItem('SKU_B', 50)
    },
    ajustesVentaManual: { SKU_A: 10 }
  });
  const mTotales = computeCampaignConsolidationMatrix(campDosSkus, [
    makeSession('SKU_A', 90),
    makeSession('SKU_B', 50, { id: 'ses-b' })
  ]);
  const sumaDiferencias = [
    ...mTotales.cuadrados, ...mTotales.discrepancias,
    ...mTotales.nuncaPistoleados, ...mTotales.hallazgos
  ].reduce((acc, r) => acc + r.diferenciaNeta, 0);
  assert(mTotales.diferenciaNetaTotal === sumaDiferencias,
    'la diferencia neta del encabezado coincide con la suma de las filas',
    `${mTotales.diferenciaNetaTotal} vs ${sumaDiferencias}`);
  assert(mTotales.diferenciaNetaTotal === 0,
    'con el ajuste de venta aplicado, el total del encabezado cuadra en cero');
  assert(mTotales.totalTeoricoEsperado === 140,
    'el total teórico del encabezado usa el teórico efectivo (100-10 + 50 = 140)',
    mTotales.totalTeoricoEsperado);
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

  // --- Alcance por proveedor: una sesion acotada solo ve los SKUs de su laboratorio ---

  // Control positivo: sin skuScope la sesion ve todo el universo teorico, asi que los
  // dos SKUs aparecen. Es el par discriminante del alcance: mismo dato, misma sesion,
  // unica diferencia es el skuScope.
  const sinAlcance = reconcileStockCountSession(
    session({ conteos: [] }),
    [sheetRow('SKU_A', '100'), sheetRow('SKU_B', '50')], HEADERS);
  assert(sinAlcance.length === 2,
    'sin skuScope la sesion ve todo el universo teorico de la hoja (control positivo del alcance)');

  const conAlcance = reconcileStockCountSession(
    session({ skuScope: ['SKU_B'], conteos: [] }),
    [sheetRow('SKU_A', '100'), sheetRow('SKU_B', '50')], HEADERS);
  assert(conAlcance.length === 1 && conAlcance[0]?.sku === 'SKU_B',
    'skuScope acota el checklist de pendientes a los SKUs del proveedor');
  assert(conAlcance[0]?.teorico === 50,
    'skuScope conserva el teorico del SKU dentro del alcance (no lo vacia)');

  // Una lectura fisica fuera del alcance no debe colarse en la cuadratura acotada.
  const alcanceConLecturaAjena = reconcileStockCountSession(
    session({ skuScope: ['SKU_B'], conteos: [entry('SKU_A', 100), entry('SKU_B', 50)] }),
    [sheetRow('SKU_A', '100'), sheetRow('SKU_B', '50')], HEADERS);
  assert(alcanceConLecturaAjena.every(r => r.sku === 'SKU_B'),
    'skuScope no deja entrar lecturas de SKUs fuera del alcance del proveedor');

  // Un skuScope vacio equivale a no acotar: no debe vaciar la sesion por accidente.
  const alcanceVacio = reconcileStockCountSession(
    session({ skuScope: [], conteos: [] }),
    [sheetRow('SKU_A', '100')], HEADERS);
  assert(alcanceVacio.length === 1,
    'skuScope vacio no acota nada (no vacia la sesion por accidente)');

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

  // --- computeProviderProgress ---
  // Avance por proveedor: el operario va por laboratorio, no por mueble.
  assert(computeProviderProgress(null).length === 0,
    'avance por proveedor: sin matriz devuelve lista vacia');

  const provCamp = makeCampaign({
    snapshotTeoricoActual: {
      A1: snapshotItem('A1', 100, { proveedor: 'Lab Norte' }),
      A2: snapshotItem('A2', 50, { proveedor: 'Lab Norte' }),
      B1: snapshotItem('B1', 80, { proveedor: 'Lab Sur' }),
      C1: snapshotItem('C1', 30, { proveedor: 'Lab Centro' }),
      // SKU sin stock: el ERP lo lista y queda NUNCA_PISTOLEADO, pero no está en la
      // gondola. No debe engrosar la carga de conteo ni la cobertura del panel, que es
      // justo lo que el checklist del terminal omite (`getPendingItems`: teorico > 0).
      C0: snapshotItem('C0', 0, { proveedor: 'Lab Centro' })
    }
  });
  const provMatriz = computeCampaignConsolidationMatrix(provCamp, [
    makeSession('A1', 100),   // Norte: cuadrado
    makeSession('A2', 40),    // Norte: discrepancia (-10)
    makeSession('B1', 80)     // Sur: cuadrado
    // C1 nunca pistoleado
  ]);
  const avance = computeProviderProgress(provMatriz);

  assert(avance.length === 3,
    'avance por proveedor: agrupa todos los proveedores presentes');

  const norte = avance.find(p => p.proveedor === 'Lab Norte')!;
  assert(norte.totalSkus === 2 && norte.contados === 2 && norte.porContar === 0,
    'avance por proveedor: suma los SKUs de cada proveedor y no deja carga de conteo');
  assert(norte.cuadrados === 1 && norte.discrepancias === 1,
    'avance por proveedor: separa cuadrados de descuadres');
  assert(norte.cobertura === 100,
    'avance por proveedor: con todo contado la cobertura es 100%, aunque haya descuadres');

  const centro = avance.find(p => p.proveedor === 'Lab Centro')!;
  assert(centro.porContar === 1 && centro.contados === 0 && centro.cobertura === 0,
    'avance por proveedor: un proveedor sin lecturas queda 0% y con carga de conteo');
  assert(centro.totalTeorico === 30 && centro.totalFisico === 0,
    'avance por proveedor: el teorico por contar cuenta en unidades, no solo en SKUs');
  // El SKU con stock 0 (C0) no debe inflar la carga de conteo ni la cobertura: si se
  // contara, `centro.totalSkus` seria 2 y `centro.porContar` tambien 2, y el panel
  // ofreceria contar un SKU que el checklist del terminal nunca muestra.
  assert(centro.totalSkus === 1 && centro.porContar === 1,
    'avance por proveedor: un SKU sin stock no es carga de conteo ni diluye la cobertura');

  // El orden pone primero lo que falta por contar.
  assert(avance[0].proveedor === 'Lab Centro',
    'avance por proveedor: ordena primero el que tiene pendientes');

  // Cobertura por SKUs, no por unidades: Sur tiene 1 SKU contado de 1 (100%),
  // aunque las unidades sean 80; si midiera unidades el resultado seria otro.
  const sur = avance.find(p => p.proveedor === 'Lab Sur')!;
  assert(sur.cobertura === 100 && sur.totalFisico === 80,
    'avance por proveedor: la cobertura mide SKUs cubiertos, no unidades contadas');

  // Hallazgo sin proveedor cae al bucket explicito, no se pierde.
  const hallazgoCamp = makeCampaign({ snapshotTeoricoActual: {} });
  const hallazgoMatriz = computeCampaignConsolidationMatrix(hallazgoCamp, [makeSession('X1', 5)]);
  const avanceHallazgo = computeProviderProgress(hallazgoMatriz);
  assert(avanceHallazgo.length === 1 && avanceHallazgo[0].proveedor === 'Sin Proveedor'
    && avanceHallazgo[0].hallazgos === 1,
    'avance por proveedor: un hallazgo sin proveedor cae a "Sin Proveedor" y no se pierde');

  // --- getProviderPendingSkus: que SKUs debe recorrer el conteo de un proveedor ---
  assert(getProviderPendingSkus(null, 'Lab Norte').length === 0,
    'pendientes de proveedor: sin matriz no hay nada que contar');

  // Solo los nunca pistoleados del proveedor, no los ya contados ni los de otros.
  const pendientesCentro = getProviderPendingSkus(provMatriz, 'Lab Centro');
  assert(pendientesCentro.length === 1 && pendientesCentro[0] === 'C1',
    'pendientes de proveedor: devuelve solo los SKUs sin lecturas');
  // El SKU sin stock (C0) no se ofrece para contar: no esta en la gondola. Este es el
  // par discriminante contra el desajuste panel/checklist: sin el filtro `esPorContar`,
  // el boton "Contar" prometeria 2 SKUs y el terminal mostraria 1.
  assert(!pendientesCentro.includes('C0'),
    'pendientes de proveedor: excluye los SKUs sin stock (coincide con el checklist)');
  assert(getProviderPendingSkus(provMatriz, 'Lab Norte').length === 0,
    'pendientes de proveedor: un proveedor ya contado no tiene pendientes');
  assert(getProviderPendingSkus(provMatriz, 'Inexistente').length === 0,
    'pendientes de proveedor: un proveedor ausente no inventa SKUs');

  // El conteo de proveedor debe SUMAR a la matriz, no reemplazar como la 2da vuelta.
  // El par discriminante compara las dos marcas con las mismas lecturas: si el conteo
  // por proveedor se marcara esSegundaVuelta, el fisico se reemplazaria y el resultado
  // seria distinto (aqui no hay vuelta previa que reemplazar, asi que ademas se prueba
  // que la marca ausente no rompe la suma).
  const sumaCamp = makeCampaign({
    snapshotTeoricoActual: { P1: snapshotItem('P1', 100, { proveedor: 'Lab Centro' }) }
  });
  const matrizSuma = computeCampaignConsolidationMatrix(sumaCamp, [
    makeSession('P1', 30)   // conteo por proveedor: suma fisico nuevo sobre teorico 100
  ]);
  const filaSuma = matrizSuma.cuadrados.concat(matrizSuma.discrepancias)[0];
  assert(filaSuma?.stockFisicoTotal === 30 && filaSuma?.stockTeoricoEfectivo === 100,
    'conteo por proveedor: el fisico nuevo se suma sobre el teorico (no reemplaza la fila)');

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
    assert(r.eventMetrics.vencimientos === 4,
      'acumulador: vencimientos EXCLUYE vencimiento cercano (es evento FRC, no vencimiento)');
    assert(r.eventMetrics.vencimientoCercano === 1,
      'acumulador: vencimiento cercano se cuenta como incidencia, no dentro de vencimientos');
    assert(r.eventMetrics.drainagePm === 1 && r.eventMetrics.upcoming === 1
      && r.eventMetrics.retireNow === 1,
      'acumulador: reparte estados de vencimiento entre los 3 VENCIMIENTO puros');
    assert(r.pmMetrics.canjeProveedor === 0 && r.pmMetrics.mermaDirecta === 1,
      'acumulador: el radar PM no absorbe eventos FRC (cercano ya no aporta canje)');
    assert(r.pmMetrics.enRegla === 1,
      'acumulador: enRegla descuenta drenaje, proximos y retiro');
    assert(r.eventResolutionMetrics.pending === 1 && r.eventResolutionMetrics.completed === 1,
      'acumulador: resume resolucion pendiente/realizada');
    assert(r.pmMetrics.total === r.eventMetrics.vencimientos,
      'acumulador: total PM espeja vencimientos');
  }

}

console.log('\n--- 21. Titulo del ticket por columnas (Fase 7 / Hallazgo 1) ---');
{
  const titulo = (headers: string[], activeView: string) =>
    getDefaultTicketTitle({ headers, activeView });

  // Canonicas: sin regresion (es el contrato que ya existia).
  assert(titulo(SAMPLE_HEADERS, 'main') === 'REPORTE VENCIMIENTOS',
    'titulo: hoja canonica de vencimientos conserva su titulo');
  assert(titulo(SAMPLE_EVENTS_HEADERS, 'events') === 'REGISTRO DE INCIDENCIAS',
    'titulo: hoja canonica de incidencias conserva su titulo');
  assert(titulo(Object.keys(SAMPLE_PRODUCTS[0] || {}), 'products') === 'CATÁLOGO DE PRODUCTOS',
    'titulo: hoja canonica de catalogo conserva su titulo');
  assert(titulo(Object.keys(SAMPLE_POLICIES[0] || {}), 'policies') === 'POLÍTICAS DE RETIRO',
    'titulo: hoja de politicas sin capacidad detectable conserva su titulo por respaldo');

  // Hojas NO canonicas: el titulo debe salir de las COLUMNAS, no del nombre.
  assert(titulo(['SKU', 'DESCRIPCION', 'PROVEEDOR', 'CATEGORIA'], 'Maestro_Farmacia') === 'CATÁLOGO DE PRODUCTOS',
    'titulo: hoja no canonica de catalogo obtiene su titulo por columnas');
  assert(titulo(['SKU', 'DESCRIPCION', 'CANTIDAD', 'FECHA VTO', 'PROVEEDOR', 'LOTE'], 'Bodega_Sur') === 'REPORTE VENCIMIENTOS',
    'titulo: hoja no canonica con FECHA VTO obtiene el titulo de vencimientos');
  assert(titulo(['RUT', 'RAZON_SOCIAL', 'TELEFONO', 'EMAIL'], 'Clientes') === 'REPORTE - CLIENTES',
    'titulo: hoja sin dominio cae al respaldo por nombre de vista');

  // El defecto medido: una hoja de catalogo no debe imprimir su nombre de pestana.
  assert(!/MAESTRO_FARMACIA/i.test(titulo(['SKU', 'DESCRIPCION', 'PROVEEDOR', 'CATEGORIA'], 'Maestro_Farmacia')),
    'titulo: no se filtra el nombre de la pestana en hojas con dominio detectable');
}

console.log('\n--- 22. Diccionario semantico: fuente unica y auto-mapeo (Ponytail) ---');
{
  // Guardian de sincronia: el motor de auto-mapeo deriva de FIELD_PATTERNS y el
  // editor de alias de SEMANTIC_FIELD_OPTIONS. Si alguien vuelve a escribir una
  // lista paralela, esto cae.
  const dict = Object.keys(FIELD_PATTERNS) as import('./src/utils/columnAliases').KnownFieldSemantic[];
  const editor = SEMANTIC_FIELD_OPTIONS.map(o => o.key);
  assert(editor.length === dict.length && dict.every(s => editor.includes(s)),
    'diccionario: el editor de alias expone TODAS las semanticas, sin lista paralela');

  // El defecto medido: 8 semanticas de inventario/ERP no se auto-mapeaban porque el
  // motor llevaba una lista hardcodeada de 23 de 31.
  const farmTarget = ['LOCAL', 'CODIGO_SKU', 'VENTA', 'INGRESO', 'EGRESO', 'INV_INICIAL', 'STOCK_MIN', 'STOCK_MAX', 'STOCK_CRITICO'];
  const farmSource = ['Sucursal', 'C\u00f3d. Art\u00edculo', 'Ventas del Periodo', 'Recepci\u00f3n', 'Salidas', 'Inventario Inicial', 'M\u00ednimo', 'M\u00e1ximo', 'Cr\u00edtico'];
  const farmMap = generateSmartColumnMappings(farmTarget, farmSource);
  assert(farmMap.every(m => m.sourceHeader !== null),
    'auto-mapeo: las 8 semanticas de inventario/ERP se reconocen por diccionario (antes 0/9)');
  assert(farmMap.find(m => m.targetHeader === 'LOCAL')?.sourceHeader === 'Sucursal',
    'auto-mapeo: LOCAL reconoce el sinonimo Sucursal');
  assert(farmMap.find(m => m.targetHeader === 'INV_INICIAL')?.sourceHeader === 'Inventario Inicial',
    'auto-mapeo: INV_INICIAL reconoce Inventario Inicial');

  // Cabeceras canonicas con separador: la app debe reconocer lo que ella misma escribe.
  assert(findColumnBySemantic(['INV_INICIAL'], 'inv_inicial') === 'INV_INICIAL',
    'diccionario: INV_INICIAL (guion bajo) se reconoce a si misma');
  assert(findColumnBySemantic(['Inv. Inicial'], 'inv_inicial') === 'Inv. Inicial',
    'diccionario: "Inv. Inicial" con punto se reconoce');
  assert(findColumnBySemantic(['F. Vto'], 'fecha_vc') === 'F. Vto',
    'diccionario: "F. Vto" se reconoce');
  assert(findColumnBySemantic(['C\u00f3d. Art\u00edculo'], 'sku') === 'C\u00f3d. Art\u00edculo',
    'diccionario: "Cod. Articulo" se reconoce');
  assert(findColumnBySemantic(['Fecha de Vencimiento'], 'fecha_vc') === 'Fecha de Vencimiento',
    'diccionario: "Fecha de Vencimiento" (con "de") se reconoce');
  assert(findColumnBySemantic(['N\u00b0 Lote'], 'lote') === 'N\u00b0 Lote',
    'diccionario: "N Lote" (ordinal) se reconoce');

  // No-regreso: una hoja de catalogo no debe contaminar el dominio de incidencias.
  assert(!findColumnBySemantic(['CATEGORIA'], 'tipo_evento'),
    'no-regreso: CATEGORIA no se clasifica como tipo_evento');
  assert(findColumnBySemantic(['CATEGORIA'], 'categoria') === 'CATEGORIA',
    'no-regreso: CATEGORIA si se clasifica como categoria');
}

console.log('\n--- 23. Sinonimos manuales: acentos y no-desborde (Ponytail) ---');
{
  // Acentos: el alias se normaliza igual que la cabecera (antes se compilaba crudo).
  assert(findColumnBySemantic(['CODIGO INTERNO'], 'sku', { sku: ['C\u00f3digo Interno'] }) === 'CODIGO INTERNO',
    'alias: un alias con acento encuentra la cabecera sin acento');
  assert(findColumnBySemantic(['C\u00f3digo Interno'], 'sku', { sku: ['CODIGO INTERNO'] }) === 'C\u00f3digo Interno',
    'alias: un alias sin acento encuentra la cabecera con acento');

  // Uso util que debe seguir funcionando: sinonimo alineado a token.
  assert(findColumnBySemantic(['NOMBRE_PRODUCTO'], 'descripcion', { descripcion: ['PRODUCTO'] }) === 'NOMBRE_PRODUCTO',
    'alias: un token del sinonimo encuentra la cabecera que lo contiene');
  assert(findColumnBySemantic(['COD ART INTERNO'], 'sku', { sku: ['COD ART'] }) === 'COD ART INTERNO',
    'alias: un sinonimo de varios tokens encuentra la cabecera');

  // El defecto medido: un alias corto capturaba cabeceras ajenas por substring crudo.
  assert(findColumnBySemantic(['ZCODIFICADO'], 'sku', { sku: ['COD'] }) === undefined,
    'alias: "COD" ya no desborda a "ZCODIFICADO"');
  assert(findColumnBySemantic(['CODIFICADO_RARO'], 'sku', { sku: ['COD'] }) === undefined,
    'alias: "COD" ya no desborda a "CODIFICADO_RARO"');

  // El exacto sigue ganando.
  assert(findColumnBySemantic(['COD'], 'sku', { sku: ['COD'] }) === 'COD',
    'alias: la coincidencia exacta del sinonimo se conserva');
}

console.log('\n--- 24. Seguridad: la apiKey no viaja a la hoja compartida (Ponytail) ---');
{
  const configConClave: SheetConfig = {
    main: 'VENCIMIENTOS',
    updatedAt: '2026-09-26T00:00:00.000Z',
    backendMirror: {
      enabled: true,
      endpointUrl: 'https://espejo.ejemplo.cl',
      apiKey: 'clave-secreta-123',
      syncMode: 'dual_write',
      conflictStrategy: 'last_write_wins'
    }
  };

  // 1. El chokepoint: la config que se persiste en la hoja no lleva el secreto.
  const redactada = redactSecretsForCloudSheet(configConClave);
  assert(redactada.backendMirror?.apiKey === undefined,
    'redaccion: la apiKey no se incluye en la config de la hoja');
  assert(!JSON.stringify(redactada).includes('clave-secreta-123'),
    'redaccion: el secreto no aparece en el JSON serializado');
  // Lo demas del espejo sobrevive: no se pierde configuracion util.
  assert(redactada.backendMirror?.endpointUrl === 'https://espejo.ejemplo.cl'
    && redactada.backendMirror?.enabled === true
    && redactada.backendMirror?.syncMode === 'dual_write',
    'redaccion: el resto de la config del espejo se conserva');
  assert(configConClave.backendMirror?.apiKey === 'clave-secreta-123',
    'redaccion: la config original no se muta (la clave local sigue viva)');

  // Sin secreto no hay copia nueva: se devuelve la misma referencia.
  const sinClave: SheetConfig = { main: 'FRC' };
  assert(redactSecretsForCloudSheet(sinClave) === sinClave,
    'redaccion: sin apiKey no se crea una copia innecesaria');

  // 2. El merge: la nube (sin clave) no debe borrar la clave local en silencio.
  const local: SheetConfig = {
    main: 'VENCIMIENTOS',
    updatedAt: '2026-09-26T00:00:00.000Z',
    backendMirror: {
      enabled: true,
      endpointUrl: 'https://espejo.ejemplo.cl',
      apiKey: 'clave-secreta-123',
      syncMode: 'dual_write',
      conflictStrategy: 'last_write_wins'
    }
  };
  const remotoMasNuevo: SheetConfig = {
    main: 'VENCIMIENTOS',
    updatedAt: '2026-09-27T00:00:00.000Z',
    backendMirror: {
      enabled: true,
      endpointUrl: 'https://espejo.ejemplo.cl',
      syncMode: 'mirror_first',
      conflictStrategy: 'last_write_wins'
    }
  };
  const fusion = mergeCloudConfigs(local, remotoMasNuevo);
  assert(fusion.backendMirror?.apiKey === 'clave-secreta-123',
    'merge: la clave local sobrevive a un remoto mas nuevo sin clave');
  assert(fusion.backendMirror?.syncMode === 'mirror_first',
    'merge: el remoto mas nuevo sigue mandando en el resto del espejo');

  // Si el remoto trae su propia clave (Script Properties si la conserva), esa manda.
  const remotoConClave: SheetConfig = {
    ...remotoMasNuevo,
    backendMirror: { ...remotoMasNuevo.backendMirror!, apiKey: 'clave-remota-999' }
  };
  assert(mergeCloudConfigs(local, remotoConClave).backendMirror?.apiKey === 'clave-remota-999',
    'merge: una clave remota explicita tiene prioridad sobre la local');
}

console.log('\n--- Perfiles de medios para etiquetas térmicas (ROADMAP §31) ---');
{
  // La geometría es aritmética entera: 203 dpi = 8 dots/mm. Si alguien cambia
  // DOTS_PER_MM o el catálogo, estas pruebas fallan y avisan.
  assert(DOTS_PER_MM === 8, 'perfiles: 203 dpi equivalen a 8 dots/mm');

  const r22 = findRoll('12x22');
  const r40 = findRoll('12x40');
  const r50 = findRoll('15x50');
  assert(!!r22 && !!r40 && !!r50, 'perfiles: los rollos 12x22, 12x40 y 15x50 estan catalogados');
  assert(findRoll('99x99') === undefined, 'perfiles: un rollo no catalogado devuelve undefined');

  // SKU real del fixture (13 digitos): es el codigo que la app debe imprimir.
  const sku = '2000210218569';
  const modulos = moduleCount(sku);
  assert(modulos === 143, 'perfiles: un SKU de 13 digitos ocupa 143 modulos con quiet zone', modulos);

  // Hallazgo central: horizontal NO cabe en 12 mm (96 dots / 143 mod < 1 dot/mod).
  const horizontal = evaluateFit(sku, r22!, 0);
  assert(!horizontal.cabe, 'perfiles: en 12x22 SIN rotar el SKU no cabe (menos de 1 dot/modulo)');
  assert(horizontal.dotsPerModule < 1, 'perfiles: el modulo horizontal seria sub-punto', horizontal.dotsPerModule);

  // Rotado 90 el largo de avance (22 mm = 176 dots) da 1.23 dots/mod: cabe, pero justo.
  const rotado22 = evaluateFit(sku, r22!, 90);
  assert(rotado22.cabe, 'perfiles: en 12x22 ROTADO 90 el SKU si cabe');
  assert(Math.abs(rotado22.dotsPerModule - 176 / 143) < 0.01,
    'perfiles: el modulo rotado en 12x22 es 176/143 = 1.23 dots', rotado22.dotsPerModule);
  assert(rotado22.justo, 'perfiles: en 12x22 el SKU queda en el limite (menos de 1.5 dots/modulo)');

  // 12x40 rotado da 2.24 dots/mod: el margen comodo.
  const rotado40 = evaluateFit(sku, r40!, 90);
  assert(rotado40.cabe && !rotado40.justo,
    'perfiles: en 12x40 el SKU tiene margen comodo (2.24 dots/modulo)', rotado40.dotsPerModule);

  // El CU_VC de 19 digitos es mas largo y por eso exige un rollo mas grande.
  const cuVc = '2000210218569202712';
  assert(moduleCount(cuVc) === 176, 'perfiles: el CU_VC de 19 digitos ocupa 176 modulos');
  const cuVcEn22 = evaluateFit(cuVc, r22!, 90);
  assert(cuVcEn22.cabe && cuVcEn22.justo,
    'perfiles: el CU_VC en 12x22 queda exactamente en el limite de 1 dot/modulo', cuVcEn22.dotsPerModule);
  const cuVcEn50 = evaluateFit(cuVc, r50!, 90);
  assert(cuVcEn50.cabe && !cuVcEn50.justo,
    'perfiles: en 15x50 el CU_VC tiene margen comodo', cuVcEn50.dotsPerModule);

  // Un codigo muy corto (2 caracteres = 77 modulos) si cabe horizontal: el limite
  // es del codigo, no del rollo. El umbral medido son 96 modulos (12 mm = 96 dots).
  assert(evaluateFit('A1', r22!, 0).cabe,
    'perfiles: un codigo de 2 caracteres si cabe horizontal en 12x22');

  // Un SKU de 8 digitos ya no cabe horizontal (99 modulos > 96 dots): refuerza que
  // la rotacion no es una preferencia, es un requisito para SKUs reales.
  assert(!evaluateFit('12345678', r22!, 0).cabe,
    'perfiles: un SKU de 8 digitos ya NO cabe horizontal en 12x22');

  // El descriptor evita acoplarse al driver: solo cambia la forma, no los valores.
  const descriptor = toMediaDescriptor(r22!);
  assert(descriptor.type === 'die-cut' && descriptor.widthMm === 12 && descriptor.heightMm === 22,
    'perfiles: el descriptor de medio conserva las medidas en mm');

  // --- Catalogo completo seleccionable en la UI ---

  // Todos los rollos comerciales de la familia P12/P15 deben estar ofrecidos.
  const idsEsperados = ['12x22', '12x30', '12x40', '14x30', '14x40', '15x30', '15x50'];
  assert(idsEsperados.every(id => ROLLOS.some(r => r.id === id)),
    'perfiles: el catalogo ofrece todos los rollos comerciales P12/P15');
  assert(ROLLOS.length === idsEsperados.length,
    'perfiles: no hay rollos duplicados en el catalogo', ROLLOS.length);

  // El catalogo debe ofrecer rollos: si no, "Rollo continuo" seria el unico
  // estado alcanzable y el selector quedaria muerto.
  assert(ROLLOS.length > 0 && findRoll(ROLLOS[0].id) !== undefined,
    'perfiles: el catalogo ofrece rollos seleccionables');

  // La calidad debe corresponder a la medicion: 12x40 es comodo y 12x22 es justo.
  assert(fitQuality(evaluateFit(sku, r40!, 90)) === 'optimo',
    'perfiles: 12x40 rotado se clasifica como optimo');
  assert(fitQuality(evaluateFit(sku, r22!, 90)) === 'justo',
    'perfiles: 12x22 rotado se clasifica como justo (al limite)');
  assert(fitQuality(evaluateFit(sku, r22!, 0)) === 'no-cabe',
    'perfiles: 12x22 sin rotar se clasifica como no-cabe');

  // --- Rotacion 90 en el SVG generado: es lo que hace viable la etiqueta ---

  const svgHorizontal = generateBarcodeSvgString(sku, { rotate: 0, width: 2, height: 40, background: '#ffffff' });
  const svgRotado = generateBarcodeSvgString(sku, { rotate: 90, width: 2, height: 40, background: '#ffffff' });
  const anchoDe = (svg: string) => Number(svg.match(/width="([\d.]+)"/)?.[1] ?? 0);
  const altoDe = (svg: string) => Number(svg.match(/height="([\d.]+)"/)?.[1] ?? 0);

  // Rotar intercambia los ejes: el ancho rotado debe ser el alto original y viceversa.
  assert(Math.abs(anchoDe(svgRotado) - altoDe(svgHorizontal)) < 0.01,
    'barcode: al rotar 90 el ancho pasa a ser el alto original',
    `${anchoDe(svgRotado)} vs ${altoDe(svgHorizontal)}`);
  assert(Math.abs(altoDe(svgRotado) - anchoDe(svgHorizontal)) < 0.01,
    'barcode: al rotar 90 el alto pasa a ser el ancho original');
  assert(svgRotado.includes('rotate(90)'),
    'barcode: el SVG rotado aplica la transformacion de rotacion');
  assert(!svgHorizontal.includes('rotate(90)'),
    'barcode: sin rotar el SVG no lleva transformacion (no cambia el ticket actual)');
  assert(svgRotado.includes('<rect') && svgRotado.includes('</svg>'),
    'barcode: el SVG rotado sigue siendo valido y conserva las barras');
  // El color de fondo debe sobrevivir a la rotacion (la etiqueta es blanca).
  assert(svgRotado.includes('background:#ffffff'),
    'barcode: el SVG rotado conserva el fondo de la etiqueta');

  // --- Paso 2: rasterizador a RGBA (sin canvas ni DOM) ---

  const r40raster = findRoll('12x40')!;
  const tamano = labelSizeDots(r40raster);
  assert(tamano.width === 96 && tamano.height === 320,
    'raster: 12x40 mm son 96x320 puntos a 203 dpi', `${tamano.width}x${tamano.height}`);
  assert(labelSizeDots(findRoll('15x50')!).width === 120,
    'raster: 15 mm de ancho son 120 puntos');

  // El ancho de modulo debe ser entero: el cabezal no imprime medios puntos.
  const anchoModulo40 = moduleWidthDots(sku, r40raster, 90);
  assert(Number.isInteger(anchoModulo40) && anchoModulo40 === Math.floor(320 / 143),
    'raster: el ancho de modulo se trunca a entero', anchoModulo40);
  assert(moduleWidthDots(sku, findRoll('12x22')!, 0) === 0,
    'raster: sin rotar en 12x22 el ancho de modulo es 0 (no cabe)');

  const img = rasterizeBarcode(sku, r40raster, 90);
  assert(!!img, 'raster: el SKU se rasteriza en 12x40 rotado');
  assert(img!.data.length === img!.width * img!.height * 4,
    'raster: el buffer tiene 4 bytes por pixel', img!.data.length);

  // Debe haber tinta y fondo: un bitmap todo blanco es una etiqueta vacia y un
  // bitmap todo negro es una mancha. Ninguno de los dos sirve.
  let pixelesNegros = 0;
  for (let i = 0; i < img!.data.length; i += 4) {
    if (img!.data[i] === 0) pixelesNegros++;
  }
  assert(pixelesNegros > 0, 'raster: el bitmap contiene barras impresas', pixelesNegros);
  assert(pixelesNegros < img!.width * img!.height,
    'raster: el bitmap no es una mancha de tinta');

  // Es 1 bit util: cada pixel es negro puro o blanco puro, sin grises.
  let hayGris = false;
  for (let i = 0; i < img!.data.length; i += 4) {
    const canal = img!.data[i];
    if (canal !== 0 && canal !== 255) { hayGris = true; break; }
  }
  assert(!hayGris, 'raster: la salida es 1 bit (sin tonos intermedios)');

  // Rotado: las barras son filas completas, así que el eje de lectura es vertical.
  // Debe haber al menos una fila totalmente negra (una barra que cruza el ancho).
  const ancho40 = img!.width;
  let filasConBarraCompleta = 0;
  for (let fila = 0; fila < img!.height; fila++) {
    const base = fila * ancho40 * 4;
    let todaNegra = true;
    for (let x = 0; x < ancho40; x++) {
      if (img!.data[base + x * 4] !== 0) { todaNegra = false; break; }
    }
    if (todaNegra) filasConBarraCompleta++;
  }
  assert(filasConBarraCompleta > 0,
    'raster: rotado 90 las barras cruzan el ancho completo (filas negras)', filasConBarraCompleta);

  // Sin rotar, un código CORTO usa columnas: los ejes se invierten. Un SKU real no
  // cabe horizontal ni en 15 mm (120 puntos < 143 módulos), así que aquí se usa
  // "1234" (77 módulos) para poder ejercitar la rama horizontal.
  assert(moduleWidthDots('1234', findRoll('15x50')!, 0) === 1,
    'raster: un codigo corto si cabe horizontal en 15 mm con modulo de 1 punto');
  const imgAncho = rasterizeBarcode('1234', findRoll('15x50')!, 0);
  assert(!!imgAncho, 'raster: un codigo corto se rasteriza sin rotar en 15x50');
  // En horizontal ninguna fila es una barra completa: las barras son columnas.
  let filasCompletasHorizontal = 0;
  for (let fila = 0; fila < imgAncho!.height; fila++) {
    const base = fila * imgAncho!.width * 4;
    let todaNegra = true;
    for (let x = 0; x < imgAncho!.width; x++) {
      if (imgAncho!.data[base + x * 4] !== 0) { todaNegra = false; break; }
    }
    if (todaNegra) filasCompletasHorizontal++;
  }
  assert(filasCompletasHorizontal === 0,
    'raster: sin rotar ninguna fila es una barra horizontal completa', filasCompletasHorizontal);

  // Y confirma el hallazgo del ROADMAP: un SKU real NO cabe horizontal en ninguno
  // de los rollos estrechos (el mas ancho, 15 mm = 120 puntos, no llega a 143).
  assert(ROLLOS.every(r => rasterizeBarcode(sku, r, 0) === null),
    'raster: un SKU real no cabe horizontal en ningun rollo P12/P15 (justifica la rotacion)');

  // Texto vacio o codigo que no cabe: null explicito, sin etiqueta a medias.
  assert(rasterizeBarcode('', r40raster, 90) === null, 'raster: texto vacio devuelve null');
  assert(rasterizeBarcode(sku, findRoll('12x22')!, 0) === null,
    'raster: un codigo que no cabe devuelve null en vez de recortarse');
  // --- Fusión multi-dispositivo: el local `undefined` no debe pisar el valor remoto ---
  //
  // `{...remoto, ...local}` copia las claves presentes en el local aunque valgan
  // `undefined`. Una sesión normal se crea con `skuScope: config.skuScope`, así que esa
  // clave existe y vale `undefined`: al fusionar, borraría el alcance que la nube sí
  // tiene, y el operario perdería el conteo acotado al sincronizar desde otra terminal.
  const sesionBase = {
    id: 'S-SCOPE', nombre: 'Conteo proveedor', modo: 'DOCUMENT' as const,
    requiereVencimiento: false, hojaOrigen: 'main', estado: 'IN_PROGRESS' as const,
    fechaInicio: '2026-09-19T00:00:00Z', conteos: [], deviceId: 'devA'
  };
  const sesionRemota = { ...sesionBase, skuScope: ['A', 'B'] };

  const mergeConUndefined = mergeCampaignsAndSessions(
    { campaigns: [], sessions: [{ ...sesionBase, skuScope: undefined }] },
    { campaigns: [], sessions: [sesionRemota] }
  );
  assert(JSON.stringify(mergeConUndefined.mergedSessions[0].skuScope) === '["A","B"]',
    'fusión: un skuScope local undefined no pisa el alcance que trae la nube',
    mergeConUndefined.mergedSessions[0].skuScope);

  const mergeSinClave = mergeCampaignsAndSessions(
    { campaigns: [], sessions: [sesionBase] },
    { campaigns: [], sessions: [sesionRemota] }
  );
  assert(JSON.stringify(mergeSinClave.mergedSessions[0].skuScope) === '["A","B"]',
    'fusión: si el local omite la clave, el alcance remoto se conserva',
    mergeSinClave.mergedSessions[0].skuScope);

  const mergeConValor = mergeCampaignsAndSessions(
    { campaigns: [], sessions: [{ ...sesionBase, skuScope: ['Z'] }] },
    { campaigns: [], sessions: [sesionRemota] }
  );
  assert(JSON.stringify(mergeConValor.mergedSessions[0].skuScope) === '["Z"]',
    'fusión: un skuScope local con valor sigue teniendo prioridad sobre el remoto',
    mergeConValor.mergedSessions[0].skuScope);

  // El arreglo no debe romper la unión idempotente de lecturas (la razón de ser del merge).
  const mergeConteos = mergeCampaignsAndSessions(
    {
      campaigns: [],
      sessions: [{ ...sesionBase, conteos: [{ id: 'e1', sku: 'A', descripcion: 'A', cantidad: 5, timestamp: '2026-09-19T01:00:00Z' }] }]
    },
    {
      campaigns: [],
      sessions: [{
        ...sesionRemota,
        conteos: [
          { id: 'e1', sku: 'A', descripcion: 'A', cantidad: 5, timestamp: '2026-09-19T01:00:00Z' },
          { id: 'e2', sku: 'B', descripcion: 'B', cantidad: 3, timestamp: '2026-09-19T02:00:00Z' }
        ]
      }]
    }
  );
  assert(mergeConteos.mergedSessions[0].conteos.length === 2,
    'fusión: las lecturas se unen sin duplicar la entrada compartida',
    mergeConteos.mergedSessions[0].conteos.length);

  // Mismo defecto de clase en campañas: un campo opcional local undefined no debe borrar el remoto.
  const campanaBase = {
    id: 'C-SCOPE', nombre: 'Inventario', fechaInicio: '2026-09-19T00:00:00Z',
    fechaActualizacion: '2026-09-19T00:00:00Z', estado: 'ACTIVA' as const,
    snapshotTeoricoActual: {}, historialSnapshots: [], sessionIds: [],
    itemsValidadosCerrados: {}, ajustesVentaManual: {}
  };
  const mergeCampana = mergeCampaignsAndSessions(
    { campaigns: [{ ...campanaBase, notasCierre: undefined }], sessions: [] },
    { campaigns: [{ ...campanaBase, notasCierre: 'Cierre acordado con jefatura' }], sessions: [] }
  );
  assert(mergeCampana.mergedCampaigns[0].notasCierre === 'Cierre acordado con jefatura',
    'fusión: un campo opcional de campaña en undefined no borra el valor remoto',
    mergeCampana.mergedCampaigns[0].notasCierre);

}

console.log('\n--- 25. Política de modos del Espejo de Backend (syncMode) ---');
{
  // El defecto: `syncMode` se elegía en la UI y no se leía. Los tres modos
  // replicaban igual. Estas aserciones fijan la decisión de cada uno.
  const dual = planMirrorDispatch('dual_write');
  assert(dual.mirror === true && dual.awaitBeforeSheets === false,
    'espejo: dual_write replica en paralelo sin bloquear', dual);

  // El invariante caro: mirror_first DEBE esperar. Si se adelanta Sheets, deja de
  // ser mirror-first y la latencia sub-150ms prometida no existe.
  const first = planMirrorDispatch('mirror_first');
  assert(first.mirror === true && first.awaitBeforeSheets === true,
    'espejo: mirror_first espera al espejo antes de Sheets', first);

  const backup = planMirrorDispatch('backup_only');
  assert(backup.mirror === false && backup.awaitBeforeSheets === false,
    'espejo: backup_only no escribe en el espejo (es pasivo)', backup);

  // Config vieja o corrupta no debe dejar la mutación sin replicar en silencio.
  const indefinido = planMirrorDispatch(undefined);
  assert(indefinido.mirror === true,
    'espejo: un modo ausente cae a dual_write (replica, no se apaga)', indefinido);

  // Backoff: la PRIMERA espera es la base, no el doble. Si se indexara desde 1,
  // se perdería casi la mitad del margen de reintentos.
  assert(mirrorRetryDelayMs(1) === MIRROR_RETRY_BASE_MS,
    'espejo: el primer reintento espera la base', mirrorRetryDelayMs(1));
  assert(mirrorRetryDelayMs(3) === MIRROR_RETRY_BASE_MS * 4,
    'espejo: el backoff duplica por intento', mirrorRetryDelayMs(3));
  assert(mirrorRetryDelayMs(50) === MIRROR_RETRY_MAX_MS,
    'espejo: el backoff tiene techo (no crece sin límite)', mirrorRetryDelayMs(50));
  assert(mirrorRetryDelayMs(0) === MIRROR_RETRY_BASE_MS,
    'espejo: un contador en 0 no produce espera negativa', mirrorRetryDelayMs(0));

  assert(isMirrorRetryable(MIRROR_MAX_ATTEMPTS - 1) === true
    && isMirrorRetryable(MIRROR_MAX_ATTEMPTS) === false,
    'espejo: se deja de reintentar al agotar los intentos');

  // El intervalo muerto: autoSyncIntervalSec no lo leía nadie. Su acotado evita
  // que un valor ausente o absurdo apague el drenado.
  assert(clampMirrorIntervalSec(undefined) === 60, 'espejo: intervalo ausente cae a 60s');
  assert(clampMirrorIntervalSec(0) === 15, 'espejo: intervalo 0 se acota al mínimo');
  assert(clampMirrorIntervalSec(99999) === 3600, 'espejo: intervalo absurdo se acota al máximo');
  assert(clampMirrorIntervalSec(30) === 30, 'espejo: un intervalo razonable se respeta');
}

console.log('\n--- 26. Buzón de reintento del espejo (sin pérdida silenciosa) ---');
{
  const store = new Map<string, string>();
  const previo = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };

  const mut = (id: string): OfflineMutation => ({
    id, type: 'update', sheetTitle: 'VENCIMIENTOS', createdAt: '2026-09-19T10:00:00Z',
    status: 'pending', attempts: 0,
  });

  // El fallo del espejo antes se perdía: no lanza, devuelve {success:false}, así
  // que el .catch() del fire-and-forget nunca se disparaba.
  let cola = enqueueMirrorRetry([], mut('m1'), 'HTTP 503', '2026-09-19T10:00:00Z');
  assert(cola.length === 1 && cola[0].attempts === 1,
    'buzón: un fallo del espejo queda encolado con su intento', cola);

  // Reintentar la misma mutación no debe duplicar la entrada: duplicar
  // replicaría dos veces el mismo cambio al volver el espejo.
  cola = enqueueMirrorRetry(cola, mut('m1'), 'HTTP 503', '2026-09-19T10:05:00Z');
  assert(cola.length === 1 && cola[0].attempts === 2,
    'buzón: reintentar la misma mutación incrementa, no duplica', cola);

  cola = removeMirrorRetry(cola, 'm1');
  assert(cola.length === 0, 'buzón: al replicar con éxito se retira el pendiente');

  // El tope protege cuota y memoria: el buzón es recuperación, no archivo.
  let grande: ReturnType<typeof enqueueMirrorRetry> = [];
  for (let i = 0; i < MIRROR_RETRY_QUEUE_MAX + 25; i++) {
    grande = enqueueMirrorRetry(grande, mut(`m${i}`), 'HTTP 503', '2026-09-19T10:00:00Z');
  }
  assert(grande.length === MIRROR_RETRY_QUEUE_MAX,
    'buzón: la cola se acota al máximo', grande.length);
  assert(grande[grande.length - 1].mutationId === `m${MIRROR_RETRY_QUEUE_MAX + 24}`,
    'buzón: el tope descarta los más antiguos, conserva los recientes');

  // Backoff: un pendiente recién fallado NO debe reintentarse en el acto.
  const nuevo = enqueueMirrorRetry([], mut('m9'), 'HTTP 503', new Date().toISOString());
  assert(selectMirrorReady(nuevo, Date.now()).length === 0,
    'buzón: un fallo reciente respeta la espera del backoff');
  assert(selectMirrorReady(nuevo, Date.now() + MIRROR_RETRY_BASE_MS + 1).length === 1,
    'buzón: pasado el backoff el pendiente entra al drenado');

  // Agotados los intentos deja de reintentarse solo (queda visible en el panel).
  const agotado = enqueueMirrorRetry([], mut('m10'), 'HTTP 503', '2026-09-19T10:00:00Z');
  agotado[0].attempts = MIRROR_MAX_ATTEMPTS;
  assert(selectMirrorReady(agotado, Date.now() + 10_000_000).length === 0,
    'buzón: agotados los intentos no se reintenta automáticamente');

  // Persistencia tolerante: la cola sobrevive el ciclo de escritura/lectura y un
  // dato corrupto no revienta (se descarta y se sigue).
  writeMirrorRetryQueue(cola.length ? cola : enqueueMirrorRetry([], mut('m7'), 'x', '2026-09-19T10:00:00Z'));
  assert(readMirrorRetryQueue().length === 1, 'buzón: sobrevive el ciclo persistir/leer');
  store.set(MIRROR_RETRY_QUEUE_KEY, '{no-es-json');
  assert(readMirrorRetryQueue().length === 0, 'buzón: un dato corrupto no revienta el arranque');

  (globalThis as any).localStorage = previo;
}

console.log('\n--- 27. Servicio del espejo: fallo persistido y drenado (ruta real) ---');
{
  const store = new Map<string, string>();
  const previoLs = (globalThis as any).localStorage;
  const previoFetch = (globalThis as any).fetch;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };

  const config = {
    enabled: true, endpointUrl: 'https://espejo.ejemplo.cl/rest',
    syncMode: 'dual_write' as const, conflictStrategy: 'last_write_wins' as const,
  };
  const mut: OfflineMutation = {
    id: 'mut-1', type: 'update', sheetTitle: 'VENCIMIENTOS',
    createdAt: '2026-09-19T10:00:00Z', status: 'pending', attempts: 0,
  };

  // Se stubea `fetch` (el límite de red), no el servicio: la ruta de decisión que
  // se prueba es código de producción real.
  (globalThis as any).fetch = async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' });

  const fallo = await backendMirrorService.replicate(config, mut);
  assert(fallo.success === false, 'espejo: un POST fallido se reporta como fallo');
  assert(backendMirrorService.getPendingRetries().length === 1,
    'espejo: el fallo queda persistido (antes se perdía en un console.warn)');

  // El backoff impide que el drenado inmediato lo reintente: sin esto, un
  // servidor caído recibiría una andanada en cada tick.
  const recien = await backendMirrorService.drainRetries(config);
  assert(recien === 0 && backendMirrorService.getPendingRetries().length === 1,
    'espejo: el drenado respeta el backoff y no reintenta un fallo reciente');

  // Con el espejo ya en pie, el pendiente se replica y sale del buzón.
  (globalThis as any).fetch = async () => ({ ok: true, status: 200, statusText: 'OK' });
  const reposicionado = readMirrorRetryQueue();
  reposicionado[0].lastAttemptAt = new Date(Date.now() - 60_000).toISOString();
  writeMirrorRetryQueue(reposicionado);

  const drenado = await backendMirrorService.drainRetries(config);
  assert(drenado === 1 && backendMirrorService.getPendingRetries().length === 0,
    'espejo: al recuperarse el servidor el pendiente se replica y sale del buzón');

  // Sin espejo habilitado no se replica nada, aunque haya pendientes.
  await backendMirrorService.replicate(config, { ...mut, id: 'mut-2' });
  const apagado = await backendMirrorService.drainRetries({ ...config, enabled: false });
  assert(apagado === 0, 'espejo: deshabilitado no drena pendientes');

  (globalThis as any).fetch = previoFetch;
  (globalThis as any).localStorage = previoLs;
}

// --- 28. Plantillas puras de Reportes PM y Drenaje (Fase 1.3 / Ponytail) ---
{
  console.log('\n--- 28. Plantillas puras de Reportes PM y Drenaje (Zero-DOM) ---');
  const { buildReportData, computePmReportMetrics } = await import('./src/utils/pmReportTemplates');

  const testItems = [
    { SKU: '1001', DESCRIPCION: 'Paracetamol 500mg', FECHA_VC: '2026-10-31', CANTIDAD: '10', PROVEEDOR: 'Laboratorio Chile', POLITICA: 'Canje 60 días' },
    { SKU: '1002', DESCRIPCION: 'Ibuprofeno 400mg', FECHA_VC: '2026-10-15', CANTIDAD: '5', PROVEEDOR: 'Laboratorio Chile', POLITICA: 'Sin Canje' },
    { SKU: '1003', DESCRIPCION: 'Amoxicilina 500mg', FECHA_VC: '2026-11-30', CANTIDAD: '20', PROVEEDOR: 'Saval', POLITICA: 'Canje 90 días' }
  ];

  const metrics = computePmReportMetrics(testItems as any);
  assert(metrics.totalUnits === 35, 'pmReport: suma correctamente el total de unidades físicas (35)');
  assert(typeof metrics.criticalCount === 'number', 'pmReport: calcula contador de severidad crítica');

  const pmDraft = buildReportData({
    template: 'PM',
    items: testItems as any,
    selectedProvider: 'Laboratorio Chile',
    issuerName: 'Rolando Pizarro',
    customNote: 'Evaluar liquidación 50%'
  });
  assert(pmDraft.subject.includes('[ALERTA DRENAJE PM]'), 'pmReport: genera asunto correcto para plantilla PM');
  assert(pmDraft.body.includes('Paracetamol 500mg') && pmDraft.body.includes('Evaluar liquidación 50%'), 'pmReport: incluye SKUs y notas personalizadas en el cuerpo');

  const canjeDraft = buildReportData({
    template: 'PROVIDER_CANJE',
    items: testItems as any,
    selectedProvider: 'Laboratorio Chile',
    issuerName: 'Rolando Pizarro'
  });
  assert(canjeDraft.subject.includes('[SOLICITUD CANJE]'), 'pmReport: genera asunto correcto para Canje Proveedor');
  assert(canjeDraft.body.includes('SOLICITUD FORMAL DE RETIRO Y CANJE'), 'pmReport: cuerpo formal de Canje Proveedor');

  const transferDraft = buildReportData({
    template: 'LOGISTICS_TRANSFER',
    items: testItems as any,
    selectedProvider: 'ALL',
    issuerName: 'Bodega Central',
    transferFolio: 'TR-998877',
    driverName: 'Carlos Chofer'
  });
  assert(transferDraft.subject.includes('TR-998877'), 'pmReport: incluye folio de traspaso en el asunto');
  assert(transferDraft.body.includes('Carlos Chofer'), 'pmReport: incluye transportista en acta de traspaso');

  const qualityDraft = buildReportData({
    template: 'QUALITY_RECALL',
    items: testItems as any,
    selectedProvider: 'ALL',
    issuerName: 'Control Calidad'
  });
  assert(qualityDraft.subject.includes('[ALERTA CALIDAD]'), 'pmReport: genera asunto correcto para bloqueo de calidad');

  const execDraft = buildReportData({
    template: 'EXECUTIVE_SUMMARY',
    items: testItems as any,
    selectedProvider: 'ALL',
    issuerName: 'Gerencia Operaciones'
  });
  assert(execDraft.subject.includes('[RESUMEN EJECUTIVO]'), 'pmReport: genera asunto correcto para resumen ejecutivo');
}

// --- 29. [_THISROW] Expressions & Context Evaluation ---
{
  console.log('\n--- 29. [_THISROW] Expressions & Context Evaluation ---');
  const { evaluateAppSheetFormula } = await import('./src/utils/appSheetFormulaEngine');

  const contextRow = {
    SKU: '2000210',
    DESCRIPCION: 'Paracetamol 500mg',
    CANTIDAD: 50,
    PRECIO: 1000
  };

  const res1 = evaluateAppSheetFormula('[_THISROW].[SKU]', { row: contextRow });
  assert(res1.value === '2000210', '_THISROW: resuelve referencia explícita [_THISROW].[SKU]');

  const res2 = evaluateAppSheetFormula('[_THISROW].[CANTIDAD] * [_THISROW].[PRECIO]', { row: contextRow });
  assert(Number(res2.value) === 50000, '_THISROW: resuelve expresiones aritméticas con [_THISROW]');
}

// --- 30. SSOT Formula Engine Priority & Fast O(1) Augmentation ---
{
  console.log('\n--- 30. SSOT Formula Engine Priority & Fast O(1) Augmentation ---');
  const { autoCalculateItemFormData } = await import('./src/utils/referenceResolver');
  const { augmentItemsWithVirtualColumns } = await import('./src/utils/virtualColumnsEvaluator');

  const sampleConfig: any = {
    customAliases: {},
    schema: {
      'Inventario General': {
        PM: { formula: 'SWITCH([MUNDO], "ALI", "PAMELA VAZQUEZ", "MED", "FABIOLA INALAF", "DESCONOCIDO")', isVirtual: true },
        FECHA_DE_RETIRO: { formula: 'TODAY() + 10', isVirtual: true }
      }
    }
  };

  const headers = ['SKU', 'MUNDO', 'PM', 'FECHA_DE_RETIRO'];
  const inputForm = {
    SKU: '2000210',
    MUNDO: 'ALI',
    PM: '',
    FECHA_DE_RETIRO: ''
  };

  const calculated = autoCalculateItemFormData(inputForm, headers, [], [], sampleConfig, 'Inventario General');
  assert(calculated.PM === 'PAMELA VAZQUEZ', 'ssot: fórmula asigna PM según esquema de tabla activa');

  const items = [{ SKU: '2000210', MUNDO: 'ALI', PM: 'PAMELA VAZQUEZ', FECHA_DE_RETIRO: '2026-10-14' }] as any[];
  const augmented = augmentItemsWithVirtualColumns({
    items: items as any,
    headers,
    sheetTitle: 'Inventario General',
    sheetConfig: sampleConfig
  });
  assert((augmented as any) === items, 'ssot: la aumentación O(1) omite re-evaluaciones redundantes si los valores ya existen');
}

// --- 31. Formula Engine Expansion & O(1) Lookups ---
{
  console.log('\n--- 31. Formula Engine Expansion & O(1) Lookups ---');
  const { evaluateAppSheetFormula, buildFormulaIndexes, resolveDereference, executeLookup } = await import('./src/utils/appSheetFormulaEngine');

  // Test expanded functions
  assert(evaluateAppSheetFormula('ANY("A, B, C")', { row: {} }).stringValue === 'A', 'engine: ANY extrae el primer elemento');
  assert(evaluateAppSheetFormula('IN("ALI", "ALI, MED, FAR")', { row: {} }).stringValue === 'true', 'engine: IN detecta presencia en lista');
  assert(evaluateAppSheetFormula('IN("XYZ", "ALI, MED, FAR")', { row: {} }).stringValue === 'false', 'engine: IN detecta ausencia en lista');
  assert(evaluateAppSheetFormula('INDEX("A, B, C", 2)', { row: {} }).stringValue === 'B', 'engine: INDEX recupera la posicion dada');
  assert(evaluateAppSheetFormula('CEILING(12.3)', { row: {} }).stringValue === '13', 'engine: CEILING redondea hacia arriba');
  assert(evaluateAppSheetFormula('FLOOR(12.8)', { row: {} }).stringValue === '12', 'engine: FLOOR redondea hacia abajo');
  assert(evaluateAppSheetFormula('MOD(10, 3)', { row: {} }).stringValue === '1', 'engine: MOD calcula el residuo');
  assert(evaluateAppSheetFormula('POWER(2, 3)', { row: {} }).stringValue === '8', 'engine: POWER calcula la potencia');
  assert(evaluateAppSheetFormula('SQRT(16)', { row: {} }).stringValue === '4', 'engine: SQRT calcula la raiz cuadrada');
  assert(evaluateAppSheetFormula('SUBSTITUTE("Hola Mundo", "Mundo", "Chile")', { row: {} }).stringValue === 'Hola Chile', 'engine: SUBSTITUTE reemplaza subcadenas');
  assert(evaluateAppSheetFormula('REPLACE("ABCDE", 2, 2, "XX")', { row: {} }).stringValue === 'AXXDE', 'engine: REPLACE reemplaza rango');
  assert(evaluateAppSheetFormula('ENCODEURL("SKU 123")', { row: {} }).stringValue === 'SKU%20123', 'engine: ENCODEURL codifica URLs');

  // Test O(1) indexing
  const products = [{ SKU: '1001', DESCRIPCION: 'Ibuprofeno 400mg' }];
  const context = { products };
  const indexes = buildFormulaIndexes(context);
  assert(Boolean(indexes.productsBySku?.has('1001')), 'indexes: buildFormulaIndexes indexa productos por SKU');

  const indexedContext = { row: { SKU: '1001' }, products, _indexes: indexes };
  const derefRes = resolveDereference('SKU', 'DESCRIPCION', indexedContext);
  assert(derefRes === 'Ibuprofeno 400mg', 'indexes: resolveDereference resuelve de-referencia via indice O(1)');
}

console.log(`\n========================================`);
console.log(`RESULTADOS DE PRUEBAS: ${passed} PASADAS, ${failed} FALLADAS`);
console.log(`========================================\n`);
if (failed > 0) {
  process.exit(1);
}
