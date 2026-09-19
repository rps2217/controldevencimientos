import { findColumnBySemantic, KnownFieldSemantic } from './columnAliases';

export interface ParsedSpreadsheetResult {
  headers: string[];
  rows: Record<string, any>[];
  totalRows: number;
  delimiterDetected?: string;
  sourceType: 'excel' | 'csv' | 'tsv' | 'clipboard';
  warnings: string[];
}

/**
 * Universal CSV delimiter detector.
 * Tests multiple delimiters and picks the one that produces consistent column counts across lines.
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r\n|\n/).filter(l => l.trim().length > 0).slice(0, 15);
  if (lines.length === 0) return ',';

  const delimiters = [',', ';', '\t', '|'];
  let bestDelimiter = ',';
  let maxConsistentCols = 0;

  for (const delim of delimiters) {
    const counts = lines.map(line => {
      // Basic split respecting quoted strings
      let inQuotes = false;
      let count = 1;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        else if (line[i] === delim && !inQuotes) count++;
      }
      return count;
    });

    const firstCount = counts[0];
    const isConsistent = counts.every(c => c === firstCount && c > 1);
    if (isConsistent && firstCount > maxConsistentCols) {
      maxConsistentCols = firstCount;
      bestDelimiter = delim;
    }
  }

  // If no consistent delimiter with >1 column found, check first line occurrence
  if (maxConsistentCols <= 1) {
    const firstLine = lines[0];
    if (firstLine.includes('\t')) return '\t';
    if (firstLine.includes(';')) return ';';
    if (firstLine.includes(',')) return ',';
    if (firstLine.includes('|')) return '|';
  }

  return bestDelimiter;
}

/**
 * Clean & normalize column headers (strips BOM, special symbols, multiple spaces, duplicates)
 */
export function sanitizeHeader(header: string, index: number, existingHeaders: Set<string>): string {
  let cleaned = String(header || '')
    .replace(/^\uFEFF/, '') // Strip BOM
    .replace(/[▼▲▶◀•▪🔹]/gu, '') // Strip sort icons / bullet marks
    .replace(/[\r\n]+/g, ' ') // Strip newlines
    .trim();

  if (!cleaned) {
    cleaned = `COLUMNA_${index + 1}`;
  }

  let finalHeader = cleaned;
  let counter = 2;
  while (existingHeaders.has(finalHeader.toUpperCase())) {
    finalHeader = `${cleaned}_${counter}`;
    counter++;
  }
  existingHeaders.add(finalHeader.toUpperCase());
  return finalHeader;
}

/**
 * Universal CSV / TSV / Delimited text parser with full RFC 4180 quote support
 */
export function parseDelimitedText(text: string, customDelimiter?: string): { headers: string[]; rows: string[][] } {
  const cleanText = text.replace(/^\uFEFF/, '');
  const delimiter = customDelimiter || detectDelimiter(cleanText);

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < cleanText.length) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i += 2;
      } else if (char === '"') {
        inQuotes = false;
        i++;
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some(c => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i += 2;
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField.trim());
        if (currentRow.some(c => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = rows[0];
  const existingSet = new Set<string>();
  const headers = rawHeaders.map((h, idx) => sanitizeHeader(h, idx, existingSet));
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

/**
 * Universal Excel / Binary Spreadsheet parser using XLSX
 */
export async function parseExcelBuffer(buffer: ArrayBuffer): Promise<ParsedSpreadsheetResult> {
  const XLSX = await import('xlsx');
  const uint8 = new Uint8Array(buffer);
  const workbook = XLSX.read(uint8, { type: 'array', cellDates: true, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('El archivo de Excel no contiene hojas de cálculo legibles.');
  }

  const worksheet = workbook.Sheets[sheetName];
  // Parse with header: 1 to get raw 2D array
  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1, 
    raw: false,
    dateNF: 'yyyy-mm-dd'
  });

  if (!rawData || rawData.length === 0) {
    throw new Error('La hoja seleccionada está vacía.');
  }

  // Find first non-empty row as header
  let headerRowIndex = 0;
  while (headerRowIndex < rawData.length && (!rawData[headerRowIndex] || rawData[headerRowIndex].filter((c: any) => String(c || '').trim().length > 0).length === 0)) {
    headerRowIndex++;
  }

  if (headerRowIndex >= rawData.length) {
    throw new Error('No se encontraron encabezados de columna en el archivo.');
  }

  const rawHeaders: string[] = rawData[headerRowIndex].map((c: any) => String(c || '').trim());
  const existingSet = new Set<string>();
  const headers = rawHeaders.map((h, idx) => sanitizeHeader(h, idx, existingSet));

  const dataRows = rawData.slice(headerRowIndex + 1);
  const rows: Record<string, any>[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowCells = dataRows[i];
    if (!rowCells || !rowCells.some((c: any) => String(c || '').trim() !== '')) continue;
    const rowObj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = rowCells[idx] !== undefined && rowCells[idx] !== null ? String(rowCells[idx]).trim() : '';
    });
    rows.push(rowObj);
    if (i > 0 && i % 500 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
    sourceType: 'excel',
    warnings: []
  };
}

/**
 * Smart Auto-Mapping suggestions between source columns and target sheet headers
 */
export interface ColumnMappingSuggestion {
  targetHeader: string;
  sourceHeader: string | null;
  confidence: number; // 0 to 1
  semanticMatch: KnownFieldSemantic | null;
}

export function generateSmartColumnMappings(
  targetHeaders: string[],
  sourceHeaders: string[],
  customAliases?: Record<string, string[]>
): ColumnMappingSuggestion[] {
  const suggestions: ColumnMappingSuggestion[] = [];
  const assignedSource = new Set<string>();

  const allSemantics: KnownFieldSemantic[] = [
    'id', 'sku', 'descripcion', 'fecha_vc', 'fecha_retiro', 'mes', 'anio',
    'cantidad', 'lote', 'politica', 'tipo_evento', 'frc_bod',
    'observacion', 'proveedor', 'dias_anticipacion', 'dias_retiro',
    'n_traspaso', 'telefono', 'email', 'categoria', 'mundo', 'pm', 'ubicacion'
  ];

  for (const target of targetHeaders) {
    const cleanTarget = target.trim().toUpperCase();

    // 1. Exact match (case-insensitive & trimmed)
    const exactMatch = sourceHeaders.find(s => s.trim().toUpperCase() === cleanTarget);
    if (exactMatch && !assignedSource.has(exactMatch)) {
      suggestions.push({
        targetHeader: target,
        sourceHeader: exactMatch,
        confidence: 1.0,
        semanticMatch: null
      });
      assignedSource.add(exactMatch);
      continue;
    }

    // 2. Normalized match (ignores accents, symbols, spaces and underscores)
    const normTarget = target.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-_]+/g, '_').toLowerCase();
    const normalizedMatch = sourceHeaders.find(s => {
      if (assignedSource.has(s)) return false;
      const normSource = s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-_]+/g, '_').toLowerCase();
      return normSource === normTarget;
    });

    if (normalizedMatch) {
      suggestions.push({
        targetHeader: target,
        sourceHeader: normalizedMatch,
        confidence: 0.95,
        semanticMatch: null
      });
      assignedSource.add(normalizedMatch);
      continue;
    }

    // 3. Mature Synonyms Dictionary Match via findColumnBySemantic & customAliases
    let matchedSource: string | null = null;
    let matchConfidence = 0;
    let matchSemantic: KnownFieldSemantic | null = null;

    for (const sem of allSemantics) {
      const targetMatchesSem = findColumnBySemantic([target], sem, customAliases);
      if (targetMatchesSem) {
        const availableSources = sourceHeaders.filter(s => !assignedSource.has(s));
        const foundSource = findColumnBySemantic(availableSources, sem, customAliases);
        if (foundSource) {
          matchedSource = foundSource;
          matchConfidence = 0.90;
          matchSemantic = sem;
          break;
        }
      }
    }

    if (matchedSource) {
      suggestions.push({
        targetHeader: target,
        sourceHeader: matchedSource,
        confidence: matchConfidence,
        semanticMatch: matchSemantic
      });
      assignedSource.add(matchedSource);
    } else {
      suggestions.push({
        targetHeader: target,
        sourceHeader: null,
        confidence: 0,
        semanticMatch: null
      });
    }
  }

  return suggestions;
}
