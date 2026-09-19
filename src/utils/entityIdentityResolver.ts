import { findColumnBySemantic } from './columnAliases';

/**
 * Robust Primary Key & Identity Resolver
 * Resolves a reliable entity identity (or composite key) for sheet records,
 * allowing safe offline mutation queues and local cache synchronizations
 * even if rows in Google Sheets are re-ordered or filtered.
 */

export interface EntityKeyInfo {
  keyColumn: string | null;
  keyValue: string;
  isSynthetic: boolean;
  rowIndex: number;
}

/**
 * Resolves the primary identifier of a row.
 * Priority:
 * 1. Schema-defined isKey column
 * 2. Dedicated CU_VC / CU / ID_VC / ID / Folio natural column
 * 3. Composite business key: SKU + Expiry Date (YYYYMM or ISO) [or Lote if present]
 * 4. Fallback: Synthetic row index marker
 */
export function resolveItemIdentity(
  item: Record<string, any>,
  headers: string[],
  sheetTitle?: string,
  schemaKeys?: string[]
): EntityKeyInfo {
  const rowIndex = typeof item._rowIndex === 'number' ? item._rowIndex : 0;

  // 1. Check if schema defined an explicit primary key column
  if (schemaKeys && schemaKeys.length > 0) {
    for (const k of schemaKeys) {
      if (item[k] !== undefined && String(item[k]).trim() !== '') {
        return {
          keyColumn: k,
          keyValue: String(item[k]).trim(),
          isSynthetic: false,
          rowIndex
        };
      }
    }
  }

  // 2. Check for explicit CU_VC or direct single-column unique key
  const cuHeader = headers.find(h => /^cu(_|\s)?(vc|calculado)?$/i.test(h.trim()) || /^codigo(_|\s)?unico$/i.test(h.trim()));
  if (cuHeader && item[cuHeader] !== undefined && String(item[cuHeader]).trim() !== '') {
    return {
      keyColumn: cuHeader,
      keyValue: String(item[cuHeader]).trim(),
      isSynthetic: false,
      rowIndex
    };
  }

  // Check for semantic ID / Folio / ID_VC / ID_EVENTO
  const idCol = findColumnBySemantic(headers, 'id');
  if (idCol && item[idCol] !== undefined && String(item[idCol]).trim() !== '') {
    return {
      keyColumn: idCol,
      keyValue: String(item[idCol]).trim(),
      isSynthetic: false,
      rowIndex
    };
  }

  // Check specific ID headers by regex if not caught
  const directIdHeader = headers.find(h => /^id(_vc|_evento|_fila|_reg)?$/i.test(h.trim()) || /^folio$/i.test(h.trim()));
  if (directIdHeader && item[directIdHeader] !== undefined && String(item[directIdHeader]).trim() !== '') {
    return {
      keyColumn: directIdHeader,
      keyValue: String(item[directIdHeader]).trim(),
      isSynthetic: false,
      rowIndex
    };
  }

  // 3. Check for composite business key: SKU + Vencimiento (YYYYMM or Date)
  const skuCol = findColumnBySemantic(headers, 'sku');
  const yCol = findColumnBySemantic(headers, 'anio');
  const mCol = findColumnBySemantic(headers, 'mes');
  const fechaCol = findColumnBySemantic(headers, 'fecha_vc') || findColumnBySemantic(headers, 'fecha_retiro');
  const loteCol = findColumnBySemantic(headers, 'lote');

  if (skuCol && item[skuCol]) {
    const skuVal = String(item[skuCol]).trim();

    // 3a. If we have Year and Month columns (e.g. YYYY: 2027, MM: 12 -> SKU202712)
    if (yCol && mCol && item[yCol] !== undefined && item[mCol] !== undefined) {
      const yVal = String(item[yCol]).trim();
      const mVal = String(item[mCol]).trim().padStart(2, '0');
      if (yVal && mVal) {
        const cuConstructed = `${skuVal}${yVal}${mVal}`;
        return {
          keyColumn: `${skuCol}+${yCol}+${mCol}`,
          keyValue: cuConstructed,
          isSynthetic: false,
          rowIndex
        };
      }
    }

    // 3b. If we have a single FECHA_VC column
    const fechaVal = fechaCol && item[fechaCol] ? String(item[fechaCol]).trim() : '';
    if (fechaVal) {
      const compositeVal = `${skuVal}::${fechaVal}`;
      return {
        keyColumn: `${skuCol}+${fechaCol}`,
        keyValue: compositeVal,
        isSynthetic: false,
        rowIndex
      };
    }

    // 3c. If lote exists as fallback
    const loteVal = loteCol && item[loteCol] ? String(item[loteCol]).trim() : '';
    if (loteVal) {
      const compositeVal = `${skuVal}::${loteVal}`;
      return {
        keyColumn: `${skuCol}+${loteCol}`,
        keyValue: compositeVal,
        isSynthetic: false,
        rowIndex
      };
    }
  }

  // 4. Fallback: Synthetic identifier based on sheetTitle and rowIndex
  return {
    keyColumn: '_rowIndex',
    keyValue: `${sheetTitle || 'sheet'}_row_${rowIndex}`,
    isSynthetic: true,
    rowIndex
  };
}

/**
 * Builds an index Map from entity key strings to 1-based row indices in O(N).
 * Enables O(1) lookups when processing batches of mutations.
 */
export function buildRowIdentityIndex(
  refreshedRows: any[][],
  headers: string[],
  schemaKeys?: string[]
): Map<string, number> {
  const indexMap = new Map<string, number>();
  if (!refreshedRows || refreshedRows.length <= 1) return indexMap;

  // Pre-find relevant column indices
  let keyColIdx = -1;
  if (schemaKeys && schemaKeys.length > 0) {
    for (const k of schemaKeys) {
      const idx = headers.indexOf(k);
      if (idx >= 0) {
        keyColIdx = idx;
        break;
      }
    }
  }

  const cuIdx = headers.findIndex(h => /^cu(_|\s)?(vc|calculado)?$/i.test(h.trim()) || /^codigo(_|\s)?unico$/i.test(h.trim()));
  const idCol = findColumnBySemantic(headers, 'id');
  const idIdx = idCol ? headers.indexOf(idCol) : -1;

  const skuCol = findColumnBySemantic(headers, 'sku');
  const yCol = findColumnBySemantic(headers, 'anio');
  const mCol = findColumnBySemantic(headers, 'mes');
  const fechaCol = findColumnBySemantic(headers, 'fecha_vc') || findColumnBySemantic(headers, 'fecha_retiro');
  const loteCol = findColumnBySemantic(headers, 'lote');

  const skuIdx = skuCol ? headers.indexOf(skuCol) : -1;
  const yIdx = yCol ? headers.indexOf(yCol) : -1;
  const mIdx = mCol ? headers.indexOf(mCol) : -1;
  const fechaIdx = fechaCol ? headers.indexOf(fechaCol) : -1;
  const loteIdx = loteCol ? headers.indexOf(loteCol) : -1;

  for (let r = 1; r < refreshedRows.length; r++) {
    const row = refreshedRows[r];
    const sheetRowIndex = r + 1;

    // Direct key column
    if (keyColIdx >= 0) {
      const val = String(row[keyColIdx] || '').trim();
      if (val) indexMap.set(val, sheetRowIndex);
    }
    if (cuIdx >= 0) {
      const val = String(row[cuIdx] || '').trim();
      if (val) indexMap.set(val, sheetRowIndex);
    }
    if (idIdx >= 0) {
      const val = String(row[idIdx] || '').trim();
      if (val) indexMap.set(val, sheetRowIndex);
    }

    // Composite keys
    if (skuIdx >= 0) {
      const skuVal = String(row[skuIdx] || '').trim();
      if (skuVal) {
        if (yIdx >= 0 && mIdx >= 0) {
          const yVal = String(row[yIdx] || '').trim();
          const mVal = String(row[mIdx] || '').trim().padStart(2, '0');
          if (yVal && mVal) {
            indexMap.set(`${skuVal}${yVal}${mVal}`, sheetRowIndex);
          }
        }
        if (fechaIdx >= 0) {
          const fVal = String(row[fechaIdx] || '').trim();
          if (fVal) {
            indexMap.set(`${skuVal}::${fVal}`, sheetRowIndex);
          }
        }
        if (loteIdx >= 0) {
          const lVal = String(row[loteIdx] || '').trim();
          if (lVal) {
            indexMap.set(`${skuVal}::${lVal}`, sheetRowIndex);
          }
        }
      }
    }
  }

  return indexMap;
}

/**
 * Finds the latest row index for a given item identity in a refreshed rows dataset.
 * Helps prevent overwriting the wrong row if the spreadsheet was sorted or had rows inserted.
 */
export function matchRowIndexByIdentity(
  identity: EntityKeyInfo,
  refreshedRows: any[][],
  headers: string[],
  prebuiltIndex?: Map<string, number>
): number | null {
  if (!refreshedRows || refreshedRows.length <= 1) return null;

  if (identity.keyValue) {
    if (prebuiltIndex && prebuiltIndex.has(identity.keyValue)) {
      return prebuiltIndex.get(identity.keyValue)!;
    }
  }

  // If we have a concrete single key column (e.g., CU_VC, ID_VC, FOLIO)
  if (!identity.isSynthetic && identity.keyColumn && !identity.keyColumn.includes('+')) {
    const colIdx = headers.indexOf(identity.keyColumn);
    if (colIdx >= 0) {
      for (let r = 1; r < refreshedRows.length; r++) {
        const cellVal = String(refreshedRows[r][colIdx] || '').trim();
        if (cellVal === identity.keyValue) {
          return r + 1; // 1-based index in Google Sheets
        }
      }
    }
  }

  // If composite key: SKU + YYYY + MM
  if (!identity.isSynthetic && identity.keyColumn && identity.keyColumn.includes('+')) {
    const skuCol = findColumnBySemantic(headers, 'sku');
    const yCol = findColumnBySemantic(headers, 'anio');
    const mCol = findColumnBySemantic(headers, 'mes');
    const fechaCol = findColumnBySemantic(headers, 'fecha_vc') || findColumnBySemantic(headers, 'fecha_retiro');
    const loteCol = findColumnBySemantic(headers, 'lote');

    const skuIdx = skuCol ? headers.indexOf(skuCol) : -1;
    const yIdx = yCol ? headers.indexOf(yCol) : -1;
    const mIdx = mCol ? headers.indexOf(mCol) : -1;
    const fechaIdx = fechaCol ? headers.indexOf(fechaCol) : -1;
    const loteIdx = loteCol ? headers.indexOf(loteCol) : -1;

    if (skuIdx >= 0) {
      for (let r = 1; r < refreshedRows.length; r++) {
        const row = refreshedRows[r];
        const rowSku = String(row[skuIdx] || '').trim();

        // Check YYYY + MM match
        if (yIdx >= 0 && mIdx >= 0) {
          const rowY = String(row[yIdx] || '').trim();
          const rowM = String(row[mIdx] || '').trim().padStart(2, '0');
          if (`${rowSku}${rowY}${rowM}` === identity.keyValue) {
            return r + 1;
          }
        }

        // Check Fecha match
        if (fechaIdx >= 0) {
          const rowFecha = String(row[fechaIdx] || '').trim();
          if (`${rowSku}::${rowFecha}` === identity.keyValue) {
            return r + 1;
          }
        }

        // Check Lote match
        if (loteIdx >= 0) {
          const rowLote = String(row[loteIdx] || '').trim();
          if (`${rowSku}::${rowLote}` === identity.keyValue) {
            return r + 1;
          }
        }
      }
    }
  }

  // Fallback to original rowIndex if within bounds
  if (identity.rowIndex > 1 && identity.rowIndex <= refreshedRows.length) {
    return identity.rowIndex;
  }

  return null;
}
