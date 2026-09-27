import type { CellValue, SheetRow, SheetMatrix } from '../lib/sheets';
import type { StockCountReconciliationItem } from '../types';

/**
 * Vocabulario canónico de la columna `ESTADO_AUDITORIA` de la pestaña
 * `_AUDITORIA_INVENTARIO`.
 *
 * La hoja es una sola y no registra de qué vía entró cada fila, así que la sesión
 * individual y la campaña consolidada deben escribir el MISMO valor. Con dos
 * vocabularios, un SKU cuadrado quedaba `CUADRADO` o `CUADRADO_OK` según el origen y
 * cualquier filtro o tabla dinámica sobre esa columna se partía en dos.
 */
export type AuditSheetStatus =
  | 'CUADRADO_OK'
  | 'FALTANTE'
  | 'SOBRANTE'
  | 'NUNCA_PISTOLEADO'
  | 'HALLAZGO_NO_ERP'
  | 'VALIDADO_CERRADO';

/**
 * Traduce el estado de cuadratura de una sesión al vocabulario de la hoja. El estado
 * interno (`CUADRADO`, `NO_CATALOGADO`) es el que ve el operario en la UI de cuadratura
 * y no se renombra: la traducción vive solo en la frontera de escritura.
 */
export function toAuditSheetStatus(
  estado: StockCountReconciliationItem['estado']
): AuditSheetStatus {
  if (estado === 'CUADRADO') return 'CUADRADO_OK';
  if (estado === 'NO_CATALOGADO') return 'HALLAZGO_NO_ERP';
  return estado;
}

/** Construye los valores de una fila de auditoría según el orden de `headerList`. */
export function buildAuditRowValues(
  headerList: string[],
  row: Record<string, CellValue>,
  nowIso: string
): SheetRow {
  return headerList.map(header => {
    if (header === 'ULTIMA_ACTUALIZACION') return nowIso;
    if (row[header] !== undefined) return String(row[header]);
    const lowerKey = header.toLowerCase();
    if (row[lowerKey] !== undefined) return String(row[lowerKey]);
    return '';
  });
}

/** Clave de conciliación de una fila de auditoría: campaña + SKU. */
function auditRowKey(row: Record<string, CellValue>): string {
  const campId = String(row.ID_CAMPANA || row.id_campana || '').trim();
  const sku = String(row.SKU || row.sku || '').trim();
  return `${campId}_${sku}`;
}

/**
 * Consolida las filas de auditoría entrantes sobre las ya existentes, resolviendo
 * colisiones por campaña + SKU en vez de duplicarlas. Devuelve la matriz completa
 * (encabezados + filas). Función pura: no toca red ni caché.
 */
export function consolidateAuditRows(
  existingData: SheetMatrix,
  incomingRows: Record<string, CellValue>[],
  headerList: string[],
  nowIso: string
): SheetMatrix {
  const existingRowsMap = new Map<string, SheetRow>();
  const campaignColIdx = headerList.findIndex(h => /ID_CAMPANA|CAMPANA/i.test(h));
  const skuColIdx = headerList.findIndex(h => /^SKU$|CODIGO/i.test(h));

  for (let r = 1; r < existingData.length; r++) {
    const row = existingData[r];
    const campVal = campaignColIdx >= 0 ? String(row[campaignColIdx] || '').trim() : '';
    const skuVal = skuColIdx >= 0 ? String(row[skuColIdx] || '').trim() : '';
    if (skuVal) {
      existingRowsMap.set(`${campVal}_${skuVal}`, row);
    }
  }

  for (const row of incomingRows) {
    existingRowsMap.set(auditRowKey(row), buildAuditRowValues(headerList, row, nowIso));
  }

  return [headerList, ...Array.from(existingRowsMap.values())];
}

/** Filas entrantes deduplicadas por campaña + SKU, para el fallback de inserción fila a fila. */
export function dedupeAuditRows(
  incomingRows: Record<string, CellValue>[],
  headerList: string[],
  nowIso: string
): SheetRow[] {
  const map = new Map<string, SheetRow>();
  for (const row of incomingRows) {
    map.set(auditRowKey(row), buildAuditRowValues(headerList, row, nowIso));
  }
  return Array.from(map.values());
}