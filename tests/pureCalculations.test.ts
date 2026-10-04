/**
 * Suite de pruebas unitarias para funciones puras de cálculo y parsing.
 *
 * Valida:
 * 1. parseAnyDate (Excel serials, ISO, latino, mes/año, compactos, valores nulos).
 * 2. parseLocaleNumber / formatLocaleNumber (separadores miles/decimales, formatos US/Latino).
 * 3. getCategoryFromEventValue (mapeo histórico y valores definidos por el usuario).
 * 4. Predicados unificados SSOT de filtrado (partición de dominio, radar PM, resolución, columnas, búsqueda).
 * 5. computeItemRawStatus (clasificación de estados de vencimiento y cálculo de días).
 */

import {
  parseAnyDate,
  parseLocaleNumber,
  formatLocaleNumber,
  getCategoryFromEventValue,
  isExpiryDomainItem,
  isIncidenceDomainItem,
  matchesPmRadarFilter,
  matchesEventResolutionFilter,
  matchesMonthOffsetFilter,
  matchesColumnFilters,
  matchesSearchTerm,
  computeItemRawStatus
} from '../src/utils/pureCalculations';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FALLÓ: ${name}`);
  }
}

function toLocalIso(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function runTests() {
  console.log('\n========================================');
  console.log('PRUEBAS UNITARIAS: pureCalculations.ts');
  console.log('========================================');

  // --- 1. parseAnyDate ---
  console.log('\n--- 1. parseAnyDate (Fechas universales) ---');
  
  // Serial de Excel numérico
  const dateSerial = parseAnyDate(45321);
  assert(toLocalIso(dateSerial) === '2024-01-30', 'parseAnyDate: resuelve serial numérico 45321 a 2024-01-30');

  // Serial de Excel como cadena
  const dateSerialStr = parseAnyDate('45321');
  assert(toLocalIso(dateSerialStr) === '2024-01-30', 'parseAnyDate: resuelve serial en string "45321" a 2024-01-30');

  // Formato ISO
  const dateIso = parseAnyDate('2026-10-04');
  assert(toLocalIso(dateIso) === '2026-10-04', 'parseAnyDate: reconoce formato ISO YYYY-MM-DD');

  const dateIsoSlash = parseAnyDate('2026/10/04');
  assert(toLocalIso(dateIsoSlash) === '2026-10-04', 'parseAnyDate: reconoce formato ISO con barras YYYY/MM/DD');

  // Formato Latino (DD/MM/YYYY)
  const dateLatin = parseAnyDate('04/10/2026');
  assert(toLocalIso(dateLatin) === '2026-10-04', 'parseAnyDate: reconoce formato latino DD/MM/YYYY');

  const dateLatinDash = parseAnyDate('04-10-2026');
  assert(toLocalIso(dateLatinDash) === '2026-10-04', 'parseAnyDate: reconoce formato latino DD-MM-YYYY');

  const dateLatinDot = parseAnyDate('04.10.2026');
  assert(toLocalIso(dateLatinDot) === '2026-10-04', 'parseAnyDate: reconoce formato latino DD.MM.YYYY');

  // Formato Compacto (YYYYMMDD)
  const dateCompact = parseAnyDate('20261004');
  assert(toLocalIso(dateCompact) === '2026-10-04', 'parseAnyDate: reconoce formato numérico compacto YYYYMMDD');

  // Formato Mes/Año (MM/YYYY) -> fin de mes
  const dateMonthYear = parseAnyDate('10/2026');
  assert(toLocalIso(dateMonthYear) === '2026-10-31', 'parseAnyDate: reconoce MM/YYYY y ajusta al último día del mes (31 de octubre)');

  const dateFebLeap = parseAnyDate('02/2024');
  assert(toLocalIso(dateFebLeap) === '2024-02-29', 'parseAnyDate: calcula correctamente año bisiesto para 02/2024 (29 de febrero)');

  // Casos de borde / valores inválidos
  assert(parseAnyDate(null) === null, 'parseAnyDate: null devuelve null');
  assert(parseAnyDate(undefined) === null, 'parseAnyDate: undefined devuelve null');
  assert(parseAnyDate('') === null, 'parseAnyDate: string vacío devuelve null');
  assert(parseAnyDate('-') === null, 'parseAnyDate: "-" devuelve null');
  assert(parseAnyDate('N/A') === null, 'parseAnyDate: "N/A" devuelve null');
  assert(parseAnyDate('invalido') === null, 'parseAnyDate: texto no fecha devuelve null');


  // --- 2. parseLocaleNumber & formatLocaleNumber ---
  console.log('\n--- 2. parseLocaleNumber & formatLocaleNumber ---');

  assert(parseLocaleNumber(100) === 100, 'parseLocaleNumber: número entero directo');
  assert(parseLocaleNumber('100') === 100, 'parseLocaleNumber: string numérico "100"');
  assert(parseLocaleNumber('1.234,56') === 1234.56, 'parseLocaleNumber: formato latino "1.234,56"');
  assert(parseLocaleNumber('1,234.56') === 1234.56, 'parseLocaleNumber: formato US "1,234.56"');
  assert(parseLocaleNumber('1 234,50') === 1234.5, 'parseLocaleNumber: separador de miles con espacio "1 234,50"');
  assert(parseLocaleNumber('-45.5') === -45.5, 'parseLocaleNumber: número negativo con signo "-45.5"');
  assert(parseLocaleNumber('(100)') === -100, 'parseLocaleNumber: formato contable en paréntesis "(100)"');
  assert(parseLocaleNumber('texto') === 0, 'parseLocaleNumber: texto no numérico devuelve 0 (fallback por defecto seguro)');
  assert(isNaN(parseLocaleNumber('texto', NaN)), 'parseLocaleNumber: texto no numérico con fallback NaN devuelve NaN');
  assert(parseLocaleNumber('') === 0, 'parseLocaleNumber: string vacío devuelve 0');
  assert(formatLocaleNumber(12345.5, 1).includes('12.345') || formatLocaleNumber(12345.5, 1).includes('12,345') || formatLocaleNumber(12345.5, 1).includes('12345,5'), 
    'formatLocaleNumber: formatea miles y decimales correctamente');


  // --- 3. getCategoryFromEventValue ---
  console.log('\n--- 3. getCategoryFromEventValue (Categorización FRC) ---');

  assert(getCategoryFromEventValue('VENC. CERC.') === 'VENCIMIENTO_CERCANO', 'getCategoryFromEventValue: "VENC. CERC." -> VENCIMIENTO_CERCANO');
  assert(getCategoryFromEventValue('DET. PED') === 'TRANSPORTE', 'getCategoryFromEventValue: "DET. PED" -> TRANSPORTE');
  assert(getCategoryFromEventValue('CAL. INTER') === 'CAL_INTERNA', 'getCategoryFromEventValue: "CAL. INTER" -> CAL_INTERNA');
  assert(getCategoryFromEventValue('CAL. EXT') === 'CAL_EXTERNA', 'getCategoryFromEventValue: "CAL. EXT" -> CAL_EXTERNA');
  assert(getCategoryFromEventValue('DIF. PED') === 'DIFERENCIA', 'getCategoryFromEventValue: "DIF. PED" -> DIFERENCIA');
  assert(getCategoryFromEventValue('SOBRANTE INVENT.') === 'AVERIA', 'getCategoryFromEventValue: "SOBRANTE INVENT." -> AVERIA');
  assert(getCategoryFromEventValue('FALTANTE INVENT.') === 'DEVOLUCION', 'getCategoryFromEventValue: "FALTANTE INVENT." -> DEVOLUCION');
  assert((getCategoryFromEventValue('ROTURA_SALA') as string) === 'ROTURA_SALA', 'getCategoryFromEventValue: enum definido por usuario se preserva intacto');
  assert(getCategoryFromEventValue(null) === null, 'getCategoryFromEventValue: null devuelve null');
  assert(getCategoryFromEventValue('-') === null, 'getCategoryFromEventValue: "-" devuelve null');


  // --- 4. Predicados Unificados de Dominio (SSOT) ---
  console.log('\n--- 4. Predicados Unificados de Filtrado SSOT ---');

  // Partición de dominios
  assert(isExpiryDomainItem('VENCIMIENTO') === true, 'isExpiryDomainItem: "VENCIMIENTO" es del dominio vencimientos');
  assert(isExpiryDomainItem('TRANSPORTE') === false, 'isExpiryDomainItem: "TRANSPORTE" NO es del dominio vencimientos');
  assert(isExpiryDomainItem('VENCIMIENTO_CERCANO') === false, 'isExpiryDomainItem: "VENCIMIENTO_CERCANO" NO es del dominio vencimientos (es FRC)');

  assert(isIncidenceDomainItem('TRANSPORTE') === true, 'isIncidenceDomainItem: "TRANSPORTE" pertenece a incidencias');
  assert(isIncidenceDomainItem('VENCIMIENTO_CERCANO') === true, 'isIncidenceDomainItem: "VENCIMIENTO_CERCANO" pertenece a incidencias');
  assert(isIncidenceDomainItem('VENCIMIENTO') === false, 'isIncidenceDomainItem: "VENCIMIENTO" NO pertenece a incidencias');

  // Radar PM
  assert(matchesPmRadarFilter({ code: 'RETIRE_NOW' }, ['retire_now']) === true, 'matchesPmRadarFilter: retire_now coincide con RETIRE_NOW');
  assert(matchesPmRadarFilter({ code: 'EXPIRED' }, ['retire_now']) === true, 'matchesPmRadarFilter: retire_now coincide con EXPIRED');
  assert(matchesPmRadarFilter({ code: 'DRAINAGE_PM' }, ['drainage']) === true, 'matchesPmRadarFilter: drainage coincide con DRAINAGE_PM');
  assert(matchesPmRadarFilter({ code: 'UPCOMING' }, ['upcoming']) === true, 'matchesPmRadarFilter: upcoming coincide con UPCOMING');
  assert(matchesPmRadarFilter({ code: 'NORMAL' }, ['en_regla']) === true, 'matchesPmRadarFilter: en_regla coincide con NORMAL');
  assert(matchesPmRadarFilter({ actionType: 'CANJE_PROVEEDOR' }, ['canje_proveedor']) === true, 'matchesPmRadarFilter: canje_proveedor coincide con actionType');
  assert(matchesPmRadarFilter({ isOrphan: true }, ['orphan_catalog']) === true, 'matchesPmRadarFilter: orphan_catalog coincide cuando isOrphan=true');
  assert(matchesPmRadarFilter({ isOrphan: false }, ['orphan_catalog']) === false, 'matchesPmRadarFilter: orphan_catalog no coincide cuando isOrphan=false');
  assert(matchesPmRadarFilter({ code: 'NORMAL' }, ['retire_now']) === false, 'matchesPmRadarFilter: NORMAL no coincide con retire_now');

  // Resolución de incidencias
  assert(matchesEventResolutionFilter(true, '', ['completed']) === true, 'matchesEventResolutionFilter: resuelto coincide con "completed"');
  assert(matchesEventResolutionFilter(false, '', ['pending']) === true, 'matchesEventResolutionFilter: no resuelto coincide con "pending"');
  assert(matchesEventResolutionFilter(false, 'TR-9988', ['TR-9988']) === true, 'matchesEventResolutionFilter: coincide con folio exacto de traspaso');

  // Offset de mes dinámico
  assert(matchesMonthOffsetFilter(2, { startOffset: 0, endOffset: 3 }) === true, 'matchesMonthOffsetFilter: offset 2 está en rango [0, 3]');
  assert(matchesMonthOffsetFilter(5, { startOffset: 0, endOffset: 3 }) === false, 'matchesMonthOffsetFilter: offset 5 fuera de rango [0, 3]');
  assert(matchesMonthOffsetFilter(1, null, [0, 1, 2]) === true, 'matchesMonthOffsetFilter: offset 1 está en lista [0, 1, 2]');

  // Filtros de columna
  const testRow = { SKU: '1001', Proveedor: 'Laboratorio Chile', Cantidad: '50' };
  assert(matchesColumnFilters(testRow, [['Proveedor', new Set(['Laboratorio Chile', 'Pfizer'])]]) === true,
    'matchesColumnFilters: coincide con valor de columna presente');
  assert(matchesColumnFilters(testRow, [['Proveedor', new Set(['Bayer'])]]) === false,
    'matchesColumnFilters: no coincide con valor no listado');
  assert(matchesColumnFilters(testRow, [['proveedor', new Set(['Laboratorio Chile'])]]) === true,
    'matchesColumnFilters: búsqueda tolerante a mayúsculas/minúsculas en el nombre de columna');

  // Búsqueda de texto
  assert(matchesSearchTerm(testRow, ['SKU', 'Proveedor'], 'chile') === true, 'matchesSearchTerm: encuentra subcadena "chile"');
  assert(matchesSearchTerm(testRow, ['SKU', 'Proveedor'], 'bayer') === false, 'matchesSearchTerm: rechaza término inexistente');


  // --- 5. computeItemRawStatus ---
  console.log('\n--- 5. computeItemRawStatus ---');

  const headers = ['SKU', 'DESCRIPCION', 'FECHA_VC', 'FECHA_RETIRO'];
  
  // Producto vencido hace 10 días
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 10);
  const expiredRow = {
    _rowIndex: 1,
    SKU: 'TEST-EXP',
    DESCRIPCION: 'Prod Vencido',
    FECHA_VC: toLocalIso(pastDate)
  };
  const statusExpired = computeItemRawStatus(expiredRow, headers);
  assert(statusExpired.code === 'EXPIRED', 'computeItemRawStatus: clasifica como EXPIRED cuando fecha_vc <= hoy');
  assert((statusExpired.daysToExpiry ?? 0) <= 0, 'computeItemRawStatus: daysToExpiry es negativo o 0');

  // Producto futuro normal (a 6 meses)
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 6);
  const futureRow = {
    _rowIndex: 2,
    SKU: 'TEST-FUT',
    DESCRIPCION: 'Prod Futuro',
    FECHA_VC: toLocalIso(futureDate)
  };
  const statusFuture = computeItemRawStatus(futureRow, headers);
  assert(statusFuture.code === 'NORMAL', 'computeItemRawStatus: clasifica como NORMAL cuando está holgado en fecha');
  assert((statusFuture.daysToExpiry ?? 0) > 100, 'computeItemRawStatus: calcula daysToExpiry positivo');

  console.log('\n========================================');
  console.log(`TOTAL PRUEBAS: ${passed + failed}`);
  console.log(`PASADAS: ${passed}`);
  console.log(`FALLADAS: ${failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Error fatal en pruebas:', err);
  process.exit(1);
});
