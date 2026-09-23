/**
 * Pruebas de importación/exportación de hojas de cálculo.
 *
 * Cubren el camino de dato no confiable (leer .xlsx de terceros) con fixtures
 * generados por openpyxl, no por la propia librería, y verifican que la
 * integración con el dominio de campañas no pierda filas.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

import { parseExcelBuffer, parseDelimitedText, parseSpreadsheetFile } from '../src/utils/universalImporter';
import { importPharmacySnapshotToCampaign } from '../src/utils/campaignUtils';
import { parseAnyDate } from '../src/utils/pureCalculations';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): ArrayBuffer {
  const buf = readFileSync(join(HERE, 'fixtures', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function main() {
  console.log('\n--- Fixtures de hoja de cálculo (.xlsx) ---');

  // 1) Lectura de un snapshot de ERP realista
  const erp = await parseExcelBuffer(fixture('erp_snapshot.xlsx'));
  assert(erp.headers.length === 12, 'parseExcelBuffer: reconoce las 12 columnas del ERP');
  assert(erp.rows.length === 3, 'parseExcelBuffer: devuelve las 3 filas de datos');
  assert(erp.sourceType === 'excel', 'parseExcelBuffer: marca el origen como excel');

  const numericSkuRow = erp.rows[2];
  assert(String(numericSkuRow['Código SKU']).replace(/\.0$/, '') === '1234567890123',
    'parseExcelBuffer: conserva un SKU exportado como número grande, sin notación científica');
  assert(String(numericSkuRow['Stock']) === '7.5',
    'parseExcelBuffer: conserva un stock decimal');

  // 2) Fechas: el serial de Excel debe llegar al parser universal de fechas
  const dates = await parseExcelBuffer(fixture('date_serial.xlsx'));
  const serialValue = dates.rows[0]['Fecha Vencimiento'];
  const resolved = parseAnyDate(serialValue);
  assert(
    resolved !== null && resolved.toISOString().slice(0, 10) === '2024-01-30',
    `parseExcelBuffer + parseAnyDate: resuelven el serial 45321 a 2024-01-30 (obtenido: ${resolved && resolved.toISOString().slice(0, 10)})`
  );

  // Fecha nativa: con `raw: true` la celda llega como Date y debe normalizarse a
  // ISO local, no a "Mon Jun 30 2025 …" (String(Date)), que rompería el parser.
  const nativeDate = dates.rows[1]['Fecha Vencimiento'];
  assert(nativeDate === '2025-06-30',
    `parseExcelBuffer: una fecha nativa se normaliza a ISO local (obtenido: "${nativeDate}")`);

  // 3) Integración con el dominio: las filas leídas deben llegar a la campaña
  const campaign: any = {
    id: 'c1',
    local: '',
    snapshotTeoricoActual: {},
    movimientos: {},
    historialSnapshots: [],
  };
  const recordRows = erp.rows;
  const recImport = importPharmacySnapshotToCampaign({ ...campaign }, recordRows, erp.headers, 'erp_snapshot.xlsx');
  assert(recImport.totalImported === 3,
    `importPharmacySnapshotToCampaign: importa las 3 filas leídas del .xlsx (obtenido: ${recImport.totalImported})`);

  // 4) Regresión: los llamadores entregaban matrices 2D y se perdían TODAS las
  // filas en silencio (totalImported = 0). El importador debe aceptar ambas formas.
  const csv = 'Local,Código SKU,Descripción,Proveedor,Stock\nL-01,7804671180800,Paracetamol,Lab Andes,45\nL-01,2000210218569,Ibuprofeno,Lab Sur,12';
  const csvParsed = parseDelimitedText(csv);
  const matrixImport = importPharmacySnapshotToCampaign({ ...campaign }, csvParsed.rows as any, csvParsed.headers, 'erp.csv');
  assert(matrixImport.totalImported === 2,
    `importPharmacySnapshotToCampaign: acepta filas en matriz 2D sin perderlas (obtenido: ${matrixImport.totalImported})`);

  // 5) Contrato del escritor: el export usa aoa_to_sheet + writeFile. Se verifica
  // que el round-trip con nuestros tipos reales (fechas formateadas, números,
  // celdas vacías y encabezados con acentos) sobreviva a la escritura.
  const worksheetData = [
    ['Código SKU', 'Descripción', 'Vencimiento', 'Stock'],
    ['7804671180800', 'Paracetamol 500mg', '31/01/2024', 45],
    ['2000210218569', 'Ibuprofeno 400mg', '', 12.5],
  ];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
  const written = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const roundTrip = XLSX.read(written, { type: 'buffer' });
  const readBack: any[][] = XLSX.utils.sheet_to_json(roundTrip.Sheets['Inventario'], { header: 1, defval: '', raw: false });
  assert(readBack[0][0] === 'Código SKU', 'export/import: conserva encabezados con acentos');
  assert(String(readBack[1][0]) === '7804671180800', 'export/import: conserva un SKU numérico como texto sin perder dígitos');
  assert(readBack[2][2] === '', 'export/import: conserva celdas vacías como cadena vacía');
  assert(roundTrip.SheetNames[0] === 'Inventario', 'export/import: conserva el nombre de la hoja');

  // 6) El writer no debe romperse con una celda de fecha formateada como texto
  // latino, que es exactamente lo que produce exportToExcel.
  assert(String(readBack[1][2]) === '31/01/2024',
    'export/import: una fecha ya formateada en latino se escribe y relee como texto');

  // 7) Punto de entrada único: la vista móvil sube .xlsx y .csv por la misma
  // función. Ambos formatos deben producir registros listos para el dominio.
  const xlsxFile = new File([fixture('erp_snapshot.xlsx')], 'snapshot.xlsx');
  const viaXlsx = await parseSpreadsheetFile(xlsxFile);
  assert(viaXlsx.rows.length === 3 && String(viaXlsx.rows[2]['Código SKU']).replace(/\.0$/, '') === '1234567890123',
    'parseSpreadsheetFile: enruta un .xlsx por el lector binario y conserva el SKU');

  const csvFile = new File([csv], 'snapshot.csv', { type: 'text/csv' });
  const viaCsv = await parseSpreadsheetFile(csvFile);
  assert(viaCsv.rows.length === 2 && viaCsv.rows[0]['Código SKU'] === '7804671180800',
    'parseSpreadsheetFile: enruta un .csv por el lector de texto y devuelve registros');
  assert(viaCsv.sourceType === 'csv', 'parseSpreadsheetFile: marca el origen csv');

  // 8) Regresión de integración: el archivo de la vista móvil debe importarse.
  const mobileImport = importPharmacySnapshotToCampaign({ ...campaign }, viaXlsx.rows, viaXlsx.headers, 'snapshot.xlsx');
  assert(mobileImport.totalImported === 3,
    `import del flujo móvil: importa las 3 filas del .xlsx subido (obtenido: ${mobileImport.totalImported})`);

  console.log(`\n========================================`);
  console.log(`RESULTADOS DE HOJA DE CÁLCULO: ${passed} PASADAS, ${failed} FALLADAS`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Error inesperado en las pruebas de hoja de cálculo:', err);
  process.exit(1);
});