import { findColumnBySemantic, KnownFieldSemantic, normalizeHeaderString, FIELD_PATTERNS } from './columnAliases';
import { rowToObject } from './pureCalculations';
import { SheetRecord } from '../types';

export const DICCIONARIO_SINONIMOS_FRC: Record<string, string[]> = {
  "FRC_N": ["FOLIO", "FRC_N", "N° FRC", "Folio Único", "NUMERO FRC", "FRC"],
  "FRC_SKU": ["FRC_SKU", "EVSKU_EV", "SKU", "CÓDIGO", "CODIGO", "ITEM"],
  "FRC_DESC": ["FRC_DESC", "PRODUCTO_EV", "PRODUCTO", "DESCRIPCIÓN", "DESCRIPCION", "NOMBRE"],
  "FRC_LOTE": ["FRC_LOTE", "LOTE", "N° LOTE", "LOT"],
  "FRC_VENCE": ["FRC_VENCE", "FECHAINGRESO_EV", "VENCIMIENTO", "VENCE", "FECHA_VENCE", "F. VENCE"],
  "FRC_RESOLUCION": ["Resolución (AB)", "ESTADO", "OBSERVACION", "OBSERVACIÓN", "RESOLUCION", "RESOLUCIÓN"],
  "N_TRASPASO": ["N_TRASPASO", "TRASPASO", "N° TRASPASO", "NUMERO TRASPASO"],
  "FRC_CANT": ["FRC_CANT", "UNIDADES", "CANTIDAD", "CANT", "DIFERENCIA", "Guía dice", "Dif."],
  "FRC_BOD": ["FRC_BOD", "DESTINOTRASPASO", "DESTINO", "BODEGA", "BOD"],
  "FRC_EVEN": ["FRC_EVEN", "EVENTO_TIPO", "TIPO EVENTO"],
  "ID_FRC": [] // Autogenerado al guardar con crypto.randomUUID()
};

export const COLUMNAS_OBJETIVO_FRC = [
  "FRC_N", "FRC_SKU", "FRC_DESC", "FRC_LOTE", "FRC_VENCE", 
  "FRC_RESOLUCION", "N_TRASPASO", "FRC_CANT", "FRC_BOD", "FRC_EVEN", "ID_FRC"
];

/**
 * Limpieza estricta de cadenas de texto (remueve indicadores visuales de Looker Studio, acentos y mayúsculas)
 */
export function limpiarTexto(texto: any): string {
  if (texto === undefined || texto === null) return "";
  return texto
    .toString()
    .replace(/[▼▲▶◀•▪🔹]/g, "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Busca el índice de columna correspondiente a una llave objetivo según el diccionario de sinónimos FRC
 */
export function encontrarColumnaPorSinonimo(columnaDestino: string, cabecerasOrigen: string[]): number {
  const aliasPermitidos = DICCIONARIO_SINONIMOS_FRC[columnaDestino] || [columnaDestino];
  const aliasLimpios = aliasPermitidos.map(limpiarTexto);
  const cabecerasLimpias = cabecerasOrigen.map(limpiarTexto);

  for (let i = 0; i < cabecerasLimpias.length; i++) {
    if (aliasLimpios.length > 0 && aliasLimpios.includes(cabecerasLimpias[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Procesa datos del portapapeles FRC soportando tanto formato Horizontal (Tabular) como Vertical (Looker Studio lineal)
 */
export function parseFrcPasteData(texto: string): { mappedRows: SheetRecord[]; originalHeaders: string[]; error?: string } {
  const lineasOriginales = texto.split(/\r\n|\n/).map(l => l.trim());
  const lineas = lineasOriginales.filter(l => l !== "" && l !== "▼" && l !== "▲" && l !== "▶" && l !== "◀");

  if (lineas.length < 2) {
    return { mappedRows: [], originalHeaders: [], error: "El texto pegado no contiene suficientes filas válidas." };
  }

  let cabecerasOrigen: string[] = [];
  let filasDatos: string[][] = [];

  // DETECCIÓN DE FORMATO HORIZONTAL O VERTICAL
  if (lineasOriginales[0].includes('\t')) {
    // Caso Horizontal (Estructura Tabular)
    cabecerasOrigen = lineasOriginales[0].split('\t').map(c => c.replace(/[▼▲▶◀]/g, "").trim());
    for (let i = 1; i < lineasOriginales.length; i++) {
      if (lineasOriginales[i].trim() !== "") {
        filasDatos.push(lineasOriginales[i].split('\t').map(c => c.trim()));
      }
    }
  } else {
    // Caso Vertical (Looker Studio Lineal)
    const todosLosAlias = Object.values(DICCIONARIO_SINONIMOS_FRC).flat().map(limpiarTexto);
    let indicePrimerDato = -1;

    for (let k = 0; k < lineas.length; k++) {
      const lineaLimpia = limpiarTexto(lineas[k]);
      if (!todosLosAlias.includes(lineaLimpia)) {
        indicePrimerDato = k;
        break;
      }
    }

    if (indicePrimerDato > 0) {
      cabecerasOrigen = lineas.slice(0, indicePrimerDato);
      const datosPuros = lineas.slice(indicePrimerDato);
      const anchoTabla = cabecerasOrigen.length;

      for (let f = 0; f < datosPuros.length; f += anchoTabla) {
        const subFila = datosPuros.slice(f, f + anchoTabla);
        if (subFila.length === anchoTabla) {
          filasDatos.push(subFila);
        }
      }
    } else {
      return { mappedRows: [], originalHeaders: [], error: "No se pudieron identificar las columnas en los datos verticales. Verifica tus sinónimos." };
    }
  }

  // MAPEO HACIA LAS COLUMNAS OBJETIVO FRC
  const datosMapeados: SheetRecord[] = [];

  filasDatos.forEach(celdas => {
    const filaObjeto: SheetRecord = {};

    COLUMNAS_OBJETIVO_FRC.forEach(colDestino => {
      if (colDestino === "ID_FRC") {
        filaObjeto[colDestino] = "(Autogenerado)";
      } else {
        const indexOrigen = encontrarColumnaPorSinonimo(colDestino, cabecerasOrigen);
        if (indexOrigen > -1 && celdas[indexOrigen] !== undefined) {
          filaObjeto[colDestino] = celdas[indexOrigen].trim();
        } else {
          filaObjeto[colDestino] = "";
        }
      }
    });

    datosMapeados.push(filaObjeto);
  });

  return { mappedRows: datosMapeados, originalHeaders: cabecerasOrigen };
}

export interface ParsedSpreadsheetResult {
  headers: string[];
  rows: SheetRecord[];
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
 * Normaliza una celda a texto sin perder su valor.
 *
 * Con `raw: true` las celdas tipadas llegan como `Date` o `number`. Convertir un
 * `Date` con `String()` produciría "Mon Jun 30 2025 …"; se emite ISO local
 * (`YYYY-MM-DD`) para que `parseAnyDate` lo lea sin ambigüedad y sin desplazar
 * el día por zona horaria.
 */
function toCellString(cell: unknown): string {
  if (cell === undefined || cell === null) return '';
  if (cell instanceof Date) {
    const y = cell.getFullYear();
    const m = String(cell.getMonth() + 1).padStart(2, '0');
    const d = String(cell.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(cell).trim();
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
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1, 
    raw: true,
  });

  if (!rawData || rawData.length === 0) {
    throw new Error('La hoja seleccionada está vacía.');
  }

  // Find first non-empty row as header
  let headerRowIndex = 0;
  while (headerRowIndex < rawData.length && (!rawData[headerRowIndex] || rawData[headerRowIndex].filter((c: unknown) => String(c || '').trim().length > 0).length === 0)) {
    headerRowIndex++;
  }

  if (headerRowIndex >= rawData.length) {
    throw new Error('No se encontraron encabezados de columna en el archivo.');
  }

  const rawHeaders: string[] = rawData[headerRowIndex].map((c: unknown) => String(c || '').trim());
  const existingSet = new Set<string>();
  const headers = rawHeaders.map((h, idx) => sanitizeHeader(h, idx, existingSet));

  const dataRows = rawData.slice(headerRowIndex + 1);
  const rows: SheetRecord[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowCells = dataRows[i];
    if (!rowCells || !rowCells.some((c: unknown) => String(c || '').trim() !== '')) continue;
    const rowObj: SheetRecord = {};
    headers.forEach((h, idx) => {
      rowObj[h] = toCellString(rowCells[idx]);
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
 * Punto de entrada único para leer un archivo subido, sea binario o de texto.
 *
 * Evita que cada pantalla reimplemente la detección de formato y repita los
 * errores del parser (p. ej. leer números formateados en notación científica).
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheetResult> {
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

  if (isExcel) return parseExcelBuffer(await file.arrayBuffer());

  const parsed = parseDelimitedText(await file.text());
  return {
    headers: parsed.headers,
    // Las filas se entregan como registros para que los llamadores no tengan que
    // conocer el formato; `importPharmacySnapshotToCampaign` acepta ambos.
    rows: parsed.rows.map(cells => rowToObject(parsed.headers, cells)),
    totalRows: parsed.rows.length,
    sourceType: name.endsWith('.tsv') ? 'tsv' : 'csv',
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

  // Los semanticos se derivan del diccionario (`FIELD_PATTERNS`), que es la fuente
  // unica: antes habia aqui una lista paralela que se quedo en 23 de 31 y el
  // auto-mapeo dejaba sin reconocer las 8 de inventario/ERP (`local`, `venta`,
  // `ingreso`, `egreso`, `inv_inicial`, `stock_min/max/critico`).
  // El orden importa: el motor es first-match-wins y agrupa por familia para que
  // las semantica mas especifica gane a la generica (p. ej. `inv_inicial` antes
  // de `cantidad`, que ya captura `Stock`, o `stock_min` antes que `cantidad`).
  const SEMANTIC_ORDER: KnownFieldSemantic[] = [
    'id', 'sku', 'descripcion', 'fecha_vc', 'fecha_retiro', 'mes', 'anio',
    'lote', 'politica', 'tipo_evento', 'frc_bod', 'n_traspaso',
    'observacion', 'proveedor', 'telefono', 'email',
    'categoria', 'mundo', 'pm', 'ubicacion', 'local',
    'inv_inicial', 'stock_min', 'stock_max', 'stock_critico',
    'venta', 'ingreso', 'egreso', 'cantidad', 'dias_anticipacion', 'dias_retiro',
  ];
  const allSemantics = Object.keys(FIELD_PATTERNS) as KnownFieldSemantic[];
  const orderedSemantics = [
    ...SEMANTIC_ORDER.filter(s => allSemantics.includes(s)),
    ...allSemantics.filter(s => !SEMANTIC_ORDER.includes(s)),
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
    const normTarget = normalizeHeaderString(target);
    const normalizedMatch = sourceHeaders.find(s => {
      if (assignedSource.has(s)) return false;
      return normalizeHeaderString(s) === normTarget;
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

    for (const sem of orderedSemantics) {
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
