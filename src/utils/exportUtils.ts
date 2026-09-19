import { formatDisplayDate } from './pureCalculations';
import { calculateVirtualColumnValue } from './virtualColumns';

/**
 * Universal, clean Excel exporter with automatic column width calculation
 * and sanitized formatting for dates and numbers.
 */
export async function exportToExcel(
  filename: string, 
  headers: string[], 
  items: any[], 
  sheetName = 'Inventario',
  virtualColumns?: any[],
  allData?: any,
  columnLabelsMap?: Record<string, string>
) {
  if (!items || !items.length) return;

  const XLSX = await import('xlsx');

  // Enhance items with virtual column data (store under both id and label)
  const enhancedItems = items.map(item => {
    const newItem = { ...item };
    if (virtualColumns) {
      virtualColumns.forEach(vc => {
        const val = calculateVirtualColumnValue(vc, item, headers, allData);
        if (vc.id) newItem[vc.id] = val;
        if (vc.label) newItem[vc.label] = val;
      });
    }
    return newItem;
  });

  // Build final headers list: keep exact order of passed headers (visibleHeaders),
  // and append any virtual column only if not already present.
  const exportHeaders = [...headers];
  if (virtualColumns && virtualColumns.length > 0) {
    virtualColumns.forEach(vc => {
      const isIncluded = exportHeaders.some(h => h === vc.id || h === vc.label);
      if (!isIncluded) {
        exportHeaders.push(vc.id || vc.label);
      }
    });
  }

  // Display labels for Excel header row (Row 1)
  const displayHeaderNames = exportHeaders.map(colId => {
    if (columnLabelsMap && columnLabelsMap[colId]) {
      return columnLabelsMap[colId];
    }
    return colId;
  });

  // Format headers and rows according to exact visible column order
  const worksheetData = [
    displayHeaderNames,
    ...enhancedItems.map(item => exportHeaders.map(colId => {
      let val = item[colId];
      if ((val === undefined || val === null) && columnLabelsMap && columnLabelsMap[colId]) {
        val = item[columnLabelsMap[colId]];
      }
      if (val === null || val === undefined) return '';
      if (val instanceof Date) return formatDisplayDate(val);
      return val;
    }))
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Auto-calculate column widths
  const colWidths = displayHeaderNames.map((headerLabel, colIndex) => {
    let maxLen = String(headerLabel || '').length;
    for (let rowIndex = 1; rowIndex < worksheetData.length; rowIndex++) {
      const cellVal = String(worksheetData[rowIndex][colIndex] || '');
      if (cellVal.length > maxLen) {
        maxLen = cellVal.length;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 60) };
  });

  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, cleanFilename);
}

/**
 * Export array of items to tab-separated TSV clipboard string
 */
export function copyItemsToClipboardTSV(headers: string[], items: any[], columnLabelsMap?: Record<string, string>): boolean {
  if (!items || !items.length) return false;

  const displayHeaders = headers.map(h => (columnLabelsMap && columnLabelsMap[h]) ? columnLabelsMap[h] : h);
  const headerRow = displayHeaders.join('\t');
  const dataRows = items.map(item =>
    headers.map(h => {
      let val = item[h];
      if ((val === undefined || val === null) && columnLabelsMap && columnLabelsMap[h]) {
        val = item[columnLabelsMap[h]];
      }
      if (val === null || val === undefined) return '';
      return String(val).replace(/\t/g, ' ').replace(/\n/g, ' ');
    }).join('\t')
  );

  const fullText = [headerRow, ...dataRows].join('\n');
  return copyTextToClipboard(fullText);
}

/**
 * Clean, native Blob download utility (Paso 4 Ponytail: Native Web API)
 */
export function downloadBlob(content: BlobPart, filename: string, mimeType = 'text/plain;charset=utf-8;'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Universal safe clipboard copy with fallback
 */
export function copyTextToClipboard(text: string): boolean {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch {}
      document.body.removeChild(textarea);
    });
    return true;
  }
  return false;
}

