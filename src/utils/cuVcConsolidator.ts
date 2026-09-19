import { InventoryItem } from '../types';
import { findColumnBySemantic } from './columnAliases';
import { parseLocaleNumber, parseAnyDate } from './pureCalculations';

export interface CuVcExtraction {
  cuVc: string;
  sku: string;
  yyyy: string;
  mm: string;
  isValidComposite: boolean;
}

/**
 * Extracts or derives the unique business code CU_VC (SKU + YYYY + MM) from an item or row object.
 * Returns both the computed CU_VC and its individual components.
 */
export function extractCuVcFromRow(
  row: Record<string, any>,
  headers?: string[],
  customAliases?: Record<string, string[]>
): CuVcExtraction {
  if (!row) {
    return { cuVc: '', sku: '', yyyy: '', mm: '', isValidComposite: false };
  }

  const searchHeaders = headers && headers.length > 0 ? headers : Object.keys(row);

  // 1. Direct explicit CU_VC or CU column
  const cuCol = searchHeaders.find(h => /^cu(_|\s)?(vc|calculado)?$/i.test(h.trim()) || /^codigo(_|\s)?unico$/i.test(h.trim()));
  const directCu = cuCol && row[cuCol] ? String(row[cuCol]).trim() : (row.CU_VC ? String(row.CU_VC).trim() : '');

  // 2. Extract SKU
  const skuCol = findColumnBySemantic(searchHeaders, 'sku', customAliases) || searchHeaders.find(h => /^sku/i.test(h.trim()));
  let skuVal = skuCol && row[skuCol] !== undefined ? String(row[skuCol]).trim() : (row.SKU || row.sku || '');
  skuVal = skuVal.replace(/\s+/g, '');

  // 3. Extract Year and Month
  let yyyyVal = '';
  let mmVal = '';

  const yCol = findColumnBySemantic(searchHeaders, 'anio', customAliases) || searchHeaders.find(h => /^(a[nñ]o|yyyy|year)$/i.test(h.trim()));
  const mCol = findColumnBySemantic(searchHeaders, 'mes', customAliases) || searchHeaders.find(h => /^(mes|mm|month)$/i.test(h.trim()));

  if (yCol && mCol && row[yCol] !== undefined && row[mCol] !== undefined) {
    const rawY = String(row[yCol]).trim();
    const rawM = String(row[mCol]).trim();
    if (/^\d{4}$/.test(rawY)) yyyyVal = rawY;
    if (/^\d{1,2}$/.test(rawM)) mmVal = rawM.padStart(2, '0');
  }

  // If YYYY or MM not found directly, derive from FECHA_VC / FECHA / VENCIMIENTO
  if (!yyyyVal || !mmVal) {
    const fechaCol = findColumnBySemantic(searchHeaders, 'fecha_vc', customAliases) || 
                     searchHeaders.find(h => /venc|f_vc|fecha/i.test(h.trim()));
    const rawFecha = fechaCol && row[fechaCol] ? row[fechaCol] : (row.FECHA_VC || row.fecha_vc || row.FECHA || '');
    if (rawFecha) {
      const parsedDate = parseAnyDate(rawFecha);
      if (parsedDate) {
        yyyyVal = String(parsedDate.getFullYear());
        mmVal = String(parsedDate.getMonth() + 1).padStart(2, '0');
      }
    }
  }

  // If we found directCu and it looks like a valid composite, unpack SKU and YYYYMM if needed
  if (directCu && directCu.length >= 7) {
    const matchYm = directCu.match(/(\d{4})(0[1-9]|1[0-2])$/);
    if (matchYm) {
      const derivedSku = directCu.slice(0, matchYm.index).replace(/\s+/g, '');
      return {
        cuVc: directCu,
        sku: skuVal || derivedSku,
        yyyy: yyyyVal || matchYm[1],
        mm: mmVal || matchYm[2],
        isValidComposite: true
      };
    }
  }

  // If we have both SKU and valid YYYY + MM, generate the standard composite CU_VC
  if (skuVal && /^\d{4}$/.test(yyyyVal) && /^(0[1-9]|1[0-2])$/.test(mmVal)) {
    const generatedCu = `${skuVal}${yyyyVal}${mmVal}`;
    return {
      cuVc: generatedCu,
      sku: skuVal,
      yyyy: yyyyVal,
      mm: mmVal,
      isValidComposite: true
    };
  }

  return {
    cuVc: directCu || skuVal,
    sku: skuVal,
    yyyy: yyyyVal,
    mm: mmVal,
    isValidComposite: false
  };
}

export interface ExistingCuVcMatch {
  exists: boolean;
  existingItem: InventoryItem | null;
  rowIndex: number | null;
  currentQuantity: number;
  quantityHeader: string | null;
  cuVc: string;
}

/**
 * Checks if a candidate item or draft record already exists in the sheet items by matching CU_VC
 */
export function findExistingItemByCuVc(
  candidateRow: Record<string, any>,
  existingItems: InventoryItem[],
  headers: string[],
  customAliases?: Record<string, string[]>
): ExistingCuVcMatch {
  const candidate = extractCuVcFromRow(candidateRow, headers, customAliases);
  if (!candidate.cuVc || !candidate.isValidComposite) {
    return {
      exists: false,
      existingItem: null,
      rowIndex: null,
      currentQuantity: 0,
      quantityHeader: null,
      cuVc: ''
    };
  }

  const cantHeader = findColumnBySemantic(headers, 'cantidad', customAliases) || 
                     headers.find(h => /^(cant|cantidad|stock|unidades)$/i.test(h.trim())) || null;

  for (const item of existingItems) {
    const existingExtract = extractCuVcFromRow(item, headers, customAliases);
    
    // Direct CU_VC match or matching SKU + YYYY + MM
    const isDirectMatch = existingExtract.cuVc && existingExtract.cuVc.toUpperCase() === candidate.cuVc.toUpperCase();
    const isCompositeMatch = candidate.sku && existingExtract.sku &&
                             candidate.sku.toUpperCase() === existingExtract.sku.toUpperCase() &&
                             candidate.yyyy === existingExtract.yyyy &&
                             candidate.mm === existingExtract.mm;

    if (isDirectMatch || isCompositeMatch) {
      const currentQty = cantHeader && item[cantHeader] !== undefined 
        ? parseLocaleNumber(item[cantHeader]) 
        : 0;

      return {
        exists: true,
        existingItem: item,
        rowIndex: typeof item._rowIndex === 'number' ? item._rowIndex : null,
        currentQuantity: currentQty,
        quantityHeader: cantHeader,
        cuVc: candidate.cuVc
      };
    }
  }

  return {
    exists: false,
    existingItem: null,
    rowIndex: null,
    currentQuantity: 0,
    quantityHeader: cantHeader,
    cuVc: candidate.cuVc
  };
}

/**
 * Consolidates rows within an imported batch:
 * If multiple rows in the same spreadsheet/clipboard import have the same SKU + MM/YYYY (CU_VC),
 * their quantities are aggregated and merged into a single clean row, eliminating internal duplicates.
 */
export function consolidateBatchByCuVc(
  rows: Record<string, any>[],
  headers: string[],
  customAliases?: Record<string, string[]>
): {
  consolidatedRows: Record<string, any>[];
  deduplicatedCount: number;
  totalOriginalCount: number;
} {
  if (!rows || rows.length === 0) {
    return { consolidatedRows: [], deduplicatedCount: 0, totalOriginalCount: 0 };
  }

  const cantHeader = findColumnBySemantic(headers, 'cantidad', customAliases) || 
                     headers.find(h => /^(cant|cantidad|stock|unidades)$/i.test(h.trim()));

  const map = new Map<string, { row: Record<string, any>; qty: number; count: number }>();
  const nonCompositeRows: Record<string, any>[] = [];

  for (const r of rows) {
    const extract = extractCuVcFromRow(r, headers, customAliases);
    const rowQty = cantHeader && r[cantHeader] !== undefined ? parseLocaleNumber(r[cantHeader]) : 0;

    if (extract.isValidComposite && extract.cuVc) {
      const key = extract.cuVc.toUpperCase();
      if (map.has(key)) {
        const entry = map.get(key)!;
        entry.qty += rowQty;
        entry.count += 1;
        // Merge any non-empty fields from subsequent rows
        Object.entries(r).forEach(([k, v]) => {
          if (k !== cantHeader && v && !entry.row[k]) {
            entry.row[k] = v;
          }
        });
      } else {
        const cloned = { ...r };
        // Ensure standard CU_VC is set
        if (!cloned.CU_VC) cloned.CU_VC = extract.cuVc;
        map.set(key, { row: cloned, qty: rowQty, count: 1 });
      }
    } else {
      nonCompositeRows.push(r);
    }
  }

  const consolidatedComposite: Record<string, any>[] = [];
  let deduplicatedCount = 0;

  for (const { row, qty, count } of map.values()) {
    if (count > 1) {
      deduplicatedCount += (count - 1);
    }
    if (cantHeader) {
      row[cantHeader] = qty > 0 ? String(qty) : row[cantHeader];
    }
    consolidatedComposite.push(row);
  }

  return {
    consolidatedRows: [...consolidatedComposite, ...nonCompositeRows],
    deduplicatedCount,
    totalOriginalCount: rows.length
  };
}

export type ImportConsolidationMode = 
  | 'consolidate_sum'       // Sum quantities into existing rows if found, append new
  | 'consolidate_overwrite' // Replace quantity in existing rows, append new
  | 'skip_existing'         // Only insert new records that don't already exist
  | 'append';               // Append all records as separate rows

export interface ReconcileResult {
  rowsToUpdate: {
    rowIndex: number;
    updatedItem: Record<string, any>;
    previousQty: number;
    addedQty: number;
    newTotalQty: number;
    cuVc: string;
    sku: string;
  }[];
  rowsToAppend: Record<string, any>[];
  skippedCount: number;
  matchedCount: number;
  internalDeduplicatedCount: number;
}

/**
 * Reconciles imported rows against existing sheet inventory using CU_VC logic
 */
export function reconcileImportWithInventory(
  importedRows: Record<string, any>[],
  existingItems: InventoryItem[],
  headers: string[],
  customAliases?: Record<string, string[]>,
  mode: ImportConsolidationMode = 'consolidate_sum'
): ReconcileResult {
  // Step 1: Consolidate internal duplicates within the imported file itself
  const { consolidatedRows, deduplicatedCount } = consolidateBatchByCuVc(importedRows, headers, customAliases);

  if (mode === 'append') {
    return {
      rowsToUpdate: [],
      rowsToAppend: consolidatedRows,
      skippedCount: 0,
      matchedCount: 0,
      internalDeduplicatedCount: deduplicatedCount
    };
  }

  const cantHeader = findColumnBySemantic(headers, 'cantidad', customAliases) || 
                     headers.find(h => /^(cant|cantidad|stock|unidades)$/i.test(h.trim()));

  const rowsToUpdate: ReconcileResult['rowsToUpdate'] = [];
  const rowsToAppend: Record<string, any>[] = [];
  let skippedCount = 0;
  let matchedCount = 0;

  // Track which existing rows have already been updated in this batch to support multiple increments
  const updatedExistingMap = new Map<number, { item: Record<string, any>; prevQty: number; addedQty: number; cuVc: string; sku: string }>();

  for (const row of consolidatedRows) {
    const match = findExistingItemByCuVc(row, existingItems, headers, customAliases);

    if (match.exists && match.rowIndex !== null) {
      matchedCount++;

      if (mode === 'skip_existing') {
        skippedCount++;
        continue;
      }

      const importedQty = cantHeader && row[cantHeader] !== undefined 
        ? parseLocaleNumber(row[cantHeader]) 
        : 0;

      const existingRowIndex = match.rowIndex;
      const alreadyUpdated = updatedExistingMap.get(existingRowIndex);

      const basePrevQty = alreadyUpdated ? alreadyUpdated.prevQty : match.currentQuantity;
      const accumulatedAdded = alreadyUpdated ? alreadyUpdated.addedQty + importedQty : importedQty;
      
      const newQty = mode === 'consolidate_sum' 
        ? (basePrevQty + accumulatedAdded)
        : importedQty;

      const updatedRowData = {
        ...(alreadyUpdated ? alreadyUpdated.item : match.existingItem),
        ...row,
        _rowIndex: existingRowIndex
      };

      if (cantHeader) {
        updatedRowData[cantHeader] = String(newQty);
      }

      updatedExistingMap.set(existingRowIndex, {
        item: updatedRowData,
        prevQty: basePrevQty,
        addedQty: accumulatedAdded,
        cuVc: match.cuVc,
        sku: match.existingItem?.SKU || row.SKU || ''
      });

    } else {
      // Record does not exist in the current sheet: Append it as a new row
      rowsToAppend.push(row);
    }
  }

  // Convert updatedExistingMap into rowsToUpdate list
  for (const [rowIndex, data] of updatedExistingMap.entries()) {
    const finalQty = cantHeader ? parseLocaleNumber(data.item[cantHeader]) : 0;
    rowsToUpdate.push({
      rowIndex,
      updatedItem: data.item,
      previousQty: data.prevQty,
      addedQty: data.addedQty,
      newTotalQty: finalQty,
      cuVc: data.cuVc,
      sku: data.sku
    });
  }

  return {
    rowsToUpdate,
    rowsToAppend,
    skippedCount,
    matchedCount,
    internalDeduplicatedCount: deduplicatedCount
  };
}
