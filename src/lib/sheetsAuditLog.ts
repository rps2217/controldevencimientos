import { consolidateAuditRows, dedupeAuditRows } from '../utils/auditConsolidation';
import {
  SPREADSHEET_ID,
  CellValue,
  SheetMatrix,
  AUDIT_SHEET_DEFAULT_HEADERS
} from './sheetsTypes';
import {
  fetchFromScript,
  getSheetData,
  appendRow,
  clearSheetsCache
} from './sheetsClient';

/**
 * Guarda las filas consolidadas de auditoría física en una pestaña DEDICADA de Google Sheets
 * (por defecto "_AUDITORIA_INVENTARIO" o "AUDITORIA_CAMPANAS").
 * PRESERVA la pestaña VENCIMIENTOS intacta y sin mezclar.
 */
export async function saveAuditRowsToDedicatedSheet(
  sheetName: string = '_AUDITORIA_INVENTARIO',
  rows: Record<string, CellValue>[]
): Promise<{ success: boolean; count: number; sheetName: string }> {
  if (!rows || rows.length === 0) {
    return { success: true, count: 0, sheetName };
  }

  clearSheetsCache(sheetName);
  let existingData: SheetMatrix = [];
  try {
    existingData = await getSheetData(sheetName, true);
  } catch (err) {
    console.warn(`[Sheets] La hoja ${sheetName} no existe aún o está vacía, se creará al insertar datos.`, err);
    existingData = [];
  }

  const headerList: string[] = existingData[0] && existingData[0].length > 0 
    ? existingData[0].map(h => String(h).trim().toUpperCase()) 
    : AUDIT_SHEET_DEFAULT_HEADERS;

  const nowIso = new Date().toISOString();

  // Encabezados + filas consolidadas por campaña + SKU (sin duplicar)
  const fullMatrix: SheetMatrix = consolidateAuditRows(existingData, rows, headerList, nowIso);
  // Conteo honesto: filas realmente distintas escritas para este lote
  const consolidatedCount = dedupeAuditRows(rows, headerList, nowIso).length;

  // 1. Intentar volcado en lote ultra-rápido en una sola petición HTTP (setSheetData)
  try {
    const batchRes = await fetchFromScript({
      action: 'setSheetData',
      sheetName,
      values: fullMatrix,
      rows: fullMatrix,
      spreadsheetId: SPREADSHEET_ID
    });

    if (batchRes && batchRes.success) {
      clearSheetsCache(sheetName);
      return {
        success: true,
        count: consolidatedCount,
        sheetName
      };
    }
  } catch (batchErr) {
    console.warn('[Sheets] Volcado setSheetData no soportado por versión antigua de Apps Script, aplicando fallback fila a fila:', batchErr);
  }

  // 2. Fallback resiliente para implementaciones anteriores de Apps Script.
  const rowsToAppend = dedupeAuditRows(rows, headerList, nowIso);

  if (!existingData || existingData.length === 0) {
    await appendRow(sheetName, headerList);
  }

  let successCount = 0;
  for (const values of rowsToAppend) {
    try {
      await appendRow(sheetName, values);
      successCount++;
    } catch (e) {
      console.error('[Sheets] Error insertando fila en hoja de auditoría:', e);
    }
  }

  return { 
    success: true, 
    count: successCount, 
    sheetName 
  };
}
