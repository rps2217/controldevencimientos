/**
 * Arnés E2E del Flujo Completo de Conteo, Reconciliación y Auditoría.
 *
 * Prueba la integración de punta a punta:
 *   1. Creación de Campaña y Sesión de Conteo con alcance de Proveedor (skuScope).
 *   2. Registro de lecturas físicas (captura de SKU y cantidad).
 *   3. Reconciliación de sesión contra stock teórico.
 *   4. Generación unificada de filas de auditoría (buildAuditRowsFromSession).
 *   5. Consolidación de matriz de campaña (computeCampaignConsolidationMatrix).
 *   6. Generación de auditoría consolidada (buildAuditRowsFromCampaignMatrix).
 *   7. Deduplicación y consolidación en _AUDITORIA_INVENTARIO (consolidateAuditRows).
 *
 * Ejecución: npx tsx tests/perf/e2e-count-flow.ts
 */
import {
  buildAuditRowsFromSession,
  buildAuditRowsFromCampaignMatrix,
  consolidateAuditRows,
  AUDIT_SHEET_CANONICAL_HEADERS
} from '../../src/utils/auditConsolidation';
import { reconcileStockCountSession } from '../../src/utils/stockCountUtils';
import { computeCampaignConsolidationMatrix } from '../../src/utils/campaignUtils';
import type { StockCountSession, InventoryCampaign, InventoryItem } from '../../src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('=== Arnés E2E: Flujo Completo de Conteo, Reconciliación y Auditoría ===\n');

// 1. Datos iniciales
const nowIso = new Date().toISOString();

const mockCampaign: InventoryCampaign = {
  id: 'CAMP_E2E_2026',
  nombre: 'Auditoría Anual Farmacia Central',
  local: 'Sucursal_01',
  fechaInicio: nowIso,
  fechaActualizacion: nowIso,
  estado: 'ACTIVA',
  snapshotTeoricoActual: {
    'SKU-101': { sku: 'SKU-101', descripcion: 'Paracetamol 500mg', stockTeorico: 50, fechaCarga: nowIso },
    'SKU-102': { sku: 'SKU-102', descripcion: 'Ibuprofeno 400mg', stockTeorico: 30, fechaCarga: nowIso },
    'SKU-103': { sku: 'SKU-103', descripcion: 'Amoxicilina 500mg', stockTeorico: 10, fechaCarga: nowIso }
  },
  historialSnapshots: [],
  sessionIds: ['SESS-001'],
  itemsValidadosCerrados: {},
  ajustesVentaManual: {
    'SKU-101': 2
  }
};

const mockSession: StockCountSession = {
  id: 'SESS-001',
  nombre: 'Pasillo 1 - Medicamentos',
  modo: 'DOCUMENT',
  requiereVencimiento: false,
  hojaOrigen: 'main',
  estado: 'IN_PROGRESS',
  fechaInicio: nowIso,
  ubicacion: 'Pasillo 1 - Mueble A',
  skuScope: ['SKU-101', 'SKU-102'],
  conteos: [
    {
      id: 'READ-1',
      sku: 'SKU-101',
      descripcion: 'Paracetamol 500mg 16 Comprimidos',
      cantidad: 48,
      timestamp: nowIso,
      mm: '12',
      yyyy: '2027',
      rutProveedor: '76123456-7'
    },
    {
      id: 'READ-2',
      sku: 'SKU-102',
      descripcion: 'Ibuprofeno 400mg 20 Comprimidos',
      cantidad: 35,
      timestamp: nowIso,
      mm: '06',
      yyyy: '2026',
      cu_vc: 'SKU-102202606',
      rutProveedor: '76123456-7'
    },
    {
      id: 'READ-3',
      sku: 'SKU-999',
      descripcion: 'Hallazgo No Catalogado',
      cantidad: 5,
      timestamp: nowIso,
      rutProveedor: 'Desconocido'
    }
  ]
};

// 2. Reconciliación de Sesión de Conteo
const inventoryActiveRows: InventoryItem[] = [
  { _rowIndex: 2, SKU: 'SKU-101', DESCRIPCION: 'Paracetamol 500mg', CANTIDAD: '50', PROVEEDOR: '76123456-7' },
  { _rowIndex: 3, SKU: 'SKU-102', DESCRIPCION: 'Ibuprofeno 400mg', CANTIDAD: '30', PROVEEDOR: '76123456-7' },
  { _rowIndex: 4, SKU: 'SKU-103', DESCRIPCION: 'Amoxicilina 500mg', CANTIDAD: '10', PROVEEDOR: '76123456-7' }
];

const mockHeaders = ['SKU', 'DESCRIPCION', 'CANTIDAD', 'PROVEEDOR'];
const reconciliation = reconcileStockCountSession(mockSession, inventoryActiveRows, mockHeaders);

assert(reconciliation.length > 0, 'La reconciliación de la sesión produce elementos');
const rec101 = reconciliation.find(r => r.sku === 'SKU-101');
assert(rec101 !== undefined && rec101.contado === 48, 'SKU-101 registra 48 unidades contadas');
assert(rec101?.teorico === 50, 'SKU-101 registra 50 unidades teóricas');
assert(rec101?.diferencia === -2, 'SKU-101 calcula diferencia neta de -2');

// 3. Generar Filas de Auditoría desde la Sesión
const sessionAuditRows = buildAuditRowsFromSession(mockSession, reconciliation, mockCampaign);
assert(sessionAuditRows.length === reconciliation.length, 'Genera una fila de auditoría por cada ítem reconciliado');
const auditRow101 = sessionAuditRows.find(r => r.SKU === 'SKU-101');
assert(auditRow101?.ID_CAMPANA === 'CAMP_E2E_2026', 'Asigna ID de campaña correctamente');
assert(auditRow101?.ESTADO_AUDITORIA === 'FALTANTE', 'Asigna estado FALTANTE a SKU con diferencia negativa');

// 4. Consolidación de Matriz de Campaña
const matrix = computeCampaignConsolidationMatrix(mockCampaign, [mockSession]);
assert(matrix.cuadrados.length + matrix.discrepancias.length + matrix.hallazgos.length + matrix.nuncaPistoleados.length > 0, 'La matriz de campaña consolida los datos');

// 5. Generar Filas de Auditoría desde la Matriz de Campaña
const campaignAuditRows = buildAuditRowsFromCampaignMatrix(matrix, mockCampaign);
assert(campaignAuditRows.length > 0, 'Genera filas de auditoría consolidadas de campaña');

// 6. Probar Consolidación en _AUDITORIA_INVENTARIO
const initialSheetData: string[][] = [
  AUDIT_SHEET_CANONICAL_HEADERS,
  [
    'CAMP_E2E_2026', '27/09/2026', 'Sucursal_01', 'SKU-101',
    'Paracetamol 500mg', '76123456-7', '50', '50', '0', '0',
    'CUADRADO_OK', 'Pasillo 1', 'Operario', nowIso
  ]
];

const consolidatedMatrix = consolidateAuditRows(
  initialSheetData,
  campaignAuditRows,
  AUDIT_SHEET_CANONICAL_HEADERS,
  nowIso
);

assert(consolidatedMatrix.length > 1, 'La matriz de auditoría consolidada contiene cabecera y filas');
const sku101FinalRow = consolidatedMatrix.find(r => r[3] === 'SKU-101');
assert(sku101FinalRow !== undefined, 'SKU-101 se consolida correctamente por clave (campaña + SKU)');

console.log(`\n========================================`);
console.log(`RESULTADOS ARNES E2E: ${passed} PASADAS, ${failed} FALLADAS`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
