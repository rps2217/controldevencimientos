import { SheetRecord } from '../../types';

/**
 * Context for evaluating AppSheet formulas and rules
 */
export interface FormulaEvaluationContext {
  row: Record<string, any>;
  headers?: string[];
  tableName?: string;
  products?: SheetRecord[];
  policies?: SheetRecord[];
  allSheetsData?: Record<string, SheetRecord[]>;
  customAliases?: Record<string, string[]>;
  // Pre-computed index maps for O(1) lookups across large datasets
  _indexes?: {
    productsBySku?: Map<string, SheetRecord>;
    policiesByProvider?: Map<string, SheetRecord>;
    sheetsByTableAndColVal?: Map<string, SheetRecord>;
  };
}

export interface FormulaResult {
  value: any;
  stringValue: string;
  success: boolean;
  error?: string;
}

export type FormulaFunctionHandler = (
  rawArgs: string[],
  context: FormulaEvaluationContext
) => FormulaResult;

export const FUNCTION_REGISTRY = new Map<string, FormulaFunctionHandler>();

export function registerFormulaFunction(name: string, handler: FormulaFunctionHandler) {
  FUNCTION_REGISTRY.set(name.toUpperCase(), handler);
}

/**
 * Normalizes a header or column name for case-insensitive and accent-insensitive matching
 */
export function normalizeToken(col: string): string {
  return String(col || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
}

/**
 * Builds O(1) index maps for products, policies, and sheets data to accelerate
 * formula evaluation over large datasets.
 */
export function buildFormulaIndexes(
  context: Omit<FormulaEvaluationContext, 'row'>
): NonNullable<FormulaEvaluationContext['_indexes']> {
  const productsBySku = new Map<string, SheetRecord>();
  if (context.products) {
    for (const p of context.products) {
      const pSku = String(p['SKU'] || p['sku'] || p['CODIGO'] || p['codigo'] || '').trim();
      if (pSku) {
        productsBySku.set(normalizeToken(pSku), p);
      }
    }
  }

  const policiesByProvider = new Map<string, SheetRecord>();
  if (context.policies) {
    for (const p of context.policies) {
      for (const [k, v] of Object.entries(p)) {
        const nk = normalizeToken(k);
        if (
          nk.includes('prov') ||
          nk.includes('rut') ||
          nk.includes('laboratorio') ||
          nk.includes('fam') ||
          nk.includes('nombre')
        ) {
          const valStr = String(v || '').trim();
          if (valStr) {
            policiesByProvider.set(normalizeToken(valStr), p);
          }
        }
      }
    }
  }

  const sheetsByTableAndColVal = new Map<string, SheetRecord>();
  if (context.allSheetsData) {
    for (const [tableName, records] of Object.entries(context.allSheetsData)) {
      const normT = normalizeToken(tableName);
      for (const rec of records) {
        for (const [k, v] of Object.entries(rec)) {
          const valStr = String(v || '').trim();
          if (valStr) {
            const key = `${normT}:${normalizeToken(k)}:${normalizeToken(valStr)}`;
            if (!sheetsByTableAndColVal.has(key)) {
              sheetsByTableAndColVal.set(key, rec);
            }
          }
        }
      }
    }
  }

  return { productsBySku, policiesByProvider, sheetsByTableAndColVal };
}

/**
 * Resolves a column value from the current row
 */
export function resolveRowValue(row: Record<string, any>, colName: string): any {
  if (!row || !colName) return '';

  // Direct match
  if (row[colName] !== undefined && row[colName] !== null) {
    return row[colName];
  }

  // Trimmed or clean match
  const cleanTarget = normalizeToken(colName);
  for (const k of Object.keys(row)) {
    if (normalizeToken(k) === cleanTarget) {
      return row[k];
    }
  }

  return '';
}

/**
 * Resolves de-referencing: [REF_COL].[PROPERTY]
 * E.g., [RUT_PROVEEDOR].[POLITICA], [SKU].[DESCRIPCION], [PROVEEDOR].[DIAS_RETIRO]
 */
export function resolveDereference(
  refColName: string,
  targetPropName: string,
  context: FormulaEvaluationContext
): string {
  const { row, products = [], policies = [], allSheetsData = {} } = context;
  const refVal = String(resolveRowValue(row, refColName) || '').trim();
  if (!refVal) return '';

  const cleanRef = normalizeToken(refColName);
  const cleanProp = normalizeToken(targetPropName);

  // 1. Is refCol referring to SKU / Product?
  if (cleanRef.includes('sku') || cleanRef.includes('codigo') || cleanRef.includes('producto')) {
    const normRefVal = normalizeToken(refVal);
    let prod: SheetRecord | undefined;
    if (context._indexes?.productsBySku) {
      prod = context._indexes.productsBySku.get(normRefVal);
    } else {
      prod = products.find(p => {
        const pSku = String(p['SKU'] || p['sku'] || p['CODIGO'] || p['codigo'] || '').trim();
        return normalizeToken(pSku) === normRefVal;
      });
    }

    if (prod) {
      for (const [pk, pv] of Object.entries(prod)) {
        if (normalizeToken(pk) === cleanProp) {
          return String(pv || '').trim();
        }
      }
      if (cleanProp.includes('desc') || cleanProp.includes('nombre')) {
        const val = prod['DESCRIPCION'] || prod['NOMBRE'] || prod['PRODUCTO'];
        if (val) return String(val).trim();
      }
      if (cleanProp.includes('prov') || cleanProp.includes('laboratorio')) {
        const val = prod['PROVEEDOR'] || prod['LABORATORIO'] || prod['RUT_PROVEEDOR'];
        if (val) return String(val).trim();
      }
      if (cleanProp.includes('pol') || cleanProp.includes('canje')) {
        const val = prod['POLITICA'] || prod['CANJE'];
        if (val) return String(val).trim();
      }
      if (cleanProp.includes('dias')) {
        const val = prod['DIAS_RETIRO'] || prod['DIAS_ANTICIPACION'];
        if (val) return String(val).trim();
      }
    }
  }

  // 2. Is refCol referring to Provider / Policy?
  if (cleanRef.includes('prov') || cleanRef.includes('rut') || cleanRef.includes('laboratorio') || cleanRef.includes('pol') || cleanRef.includes('canje')) {
    const normRefVal = normalizeToken(refVal);
    let pol: SheetRecord | undefined;
    if (context._indexes?.policiesByProvider) {
      pol = context._indexes.policiesByProvider.get(normRefVal);
    } else {
      pol = policies.find(p => {
        for (const [k, v] of Object.entries(p)) {
          const nk = normalizeToken(k);
          if (nk.includes('prov') || nk.includes('rut') || nk.includes('laboratorio') || nk.includes('fam') || nk.includes('nombre')) {
            if (normalizeToken(String(v || '')) === normRefVal || String(v || '').toLowerCase().includes(refVal.toLowerCase())) {
              return true;
            }
          }
        }
        return false;
      });
    }

    if (pol) {
      for (const [pk, pv] of Object.entries(pol)) {
        if (normalizeToken(pk) === cleanProp) {
          return String(pv || '').trim();
        }
      }
      if (cleanProp.includes('pol') || cleanProp.includes('canje') || cleanProp.includes('accion')) {
        const val = pol['POLITICA'] || pol['ACCION'] || pol['CANJE'] || pol['CONDICION'];
        if (val) return String(val).trim();
      }
      if (cleanProp.includes('dias')) {
        const val = pol['DIAS_RETIRO'] || pol['DIAS_ANTICIPACION'] || pol['DIAS'];
        if (val) return String(val).trim();
      }
    }
  }

  // 3. General search across all loaded sheets
  for (const [_, records] of Object.entries(allSheetsData)) {
    const match = records.find(rec => {
      for (const v of Object.values(rec)) {
        if (String(v || '').trim() === refVal) return true;
      }
      return false;
    });
    if (match) {
      for (const [k, v] of Object.entries(match)) {
        if (normalizeToken(k) === cleanProp) {
          return String(v || '').trim();
        }
      }
    }
  }

  return '';
}

/**
 * LOOKUP function implementation
 * LOOKUP(needle, tableName, lookupCol, resultCol)
 */
export function executeLookup(
  needle: string,
  tableName: string,
  lookupCol: string,
  resultCol: string,
  context: FormulaEvaluationContext
): string {
  const normNeedle = normalizeToken(needle);
  const normTable = normalizeToken(tableName);
  const normLookup = normalizeToken(lookupCol);
  const normResult = normalizeToken(resultCol);

  // O(1) Index Match
  if (context._indexes?.sheetsByTableAndColVal) {
    const indexKey = `${normTable}:${normLookup}:${normNeedle}`;
    const indexedMatch = context._indexes.sheetsByTableAndColVal.get(indexKey);
    if (indexedMatch) {
      for (const [k, v] of Object.entries(indexedMatch)) {
        if (normalizeToken(k) === normResult) {
          return String(v || '').trim();
        }
      }
    }
  }

  let targetRecords: SheetRecord[] = [];

  if (normTable.includes('catalogo') || normTable.includes('product') || normTable.includes('maestro')) {
    targetRecords = context.products || [];
  } else if (normTable.includes('politic') || normTable.includes('canje')) {
    targetRecords = context.policies || [];
  } else if (context.allSheetsData && context.allSheetsData[tableName]) {
    targetRecords = context.allSheetsData[tableName];
  } else if (context.allSheetsData) {
    const foundKey = Object.keys(context.allSheetsData).find(k => normalizeToken(k) === normTable);
    if (foundKey) {
      targetRecords = context.allSheetsData[foundKey];
    }
  }

  if (!targetRecords || targetRecords.length === 0) return '';

  const match = targetRecords.find(row => {
    for (const [k, v] of Object.entries(row)) {
      if (normalizeToken(k) === normLookup) {
        return normalizeToken(String(v || '')) === normNeedle;
      }
    }
    return false;
  });

  if (!match) return '';

  for (const [k, v] of Object.entries(match)) {
    if (normalizeToken(k) === normResult) {
      return String(v || '').trim();
    }
  }

  return '';
}

export function stripQuotes(str: string): string {
  const t = str.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  if (t.startsWith('[') && t.endsWith(']')) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parses arguments of a function call respecting nested parentheses and quotes
 */
export function parseFunctionArguments(argsStr: string): string[] {
  const args: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '(' && !inDouble && !inSingle) parenDepth++;
    else if (ch === ')' && !inDouble && !inSingle) parenDepth--;
    else if (ch === '[' && !inDouble && !inSingle) bracketDepth++;
    else if (ch === ']' && !inDouble && !inSingle) bracketDepth--;

    if (ch === ',' && !inDouble && !inSingle && parenDepth === 0 && bracketDepth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    args.push(current.trim());
  }
  return args;
}

/**
 * Splits formula by '&' respecting quotes and parentheses
 */
export function splitConcatenationParts(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let inBracket = false;
  let parenDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    else if (ch === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    else if (ch === '[' && !inDoubleQuote && !inSingleQuote) inBracket = true;
    else if (ch === ']' && !inDoubleQuote && !inSingleQuote) inBracket = false;
    else if (ch === '(' && !inDoubleQuote && !inSingleQuote) parenDepth++;
    else if (ch === ')' && !inDoubleQuote && !inSingleQuote && parenDepth > 0) parenDepth--;

    if (ch === '&' && !inDoubleQuote && !inSingleQuote && !inBracket && parenDepth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Finds the index of the rightmost top-level binary operator among candidates at depth 0
 */
export function findTopLevelBinaryOperator(expr: string, ops: string[]): { index: number; op: string } | null {
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let inBracket = false;
  let parenDepth = 0;

  for (let i = expr.length - 1; i >= 0; i--) {
    const ch = expr[i];
    if (ch === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    else if (ch === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    else if (ch === ']' && !inDoubleQuote && !inSingleQuote) inBracket = true;
    else if (ch === '[' && !inDoubleQuote && !inSingleQuote) inBracket = false;
    else if (ch === ')' && !inDoubleQuote && !inSingleQuote) parenDepth++;
    else if (ch === '(' && !inDoubleQuote && !inSingleQuote && parenDepth > 0) parenDepth--;

    if (!inDoubleQuote && !inSingleQuote && !inBracket && parenDepth === 0) {
      for (const op of ops) {
        if (expr.slice(i, i + op.length) === op) {
          const before = expr.slice(0, i).trim();
          if (before.length > 0 && !/[+\-*/,(]$/.test(before)) {
            return { index: i, op };
          }
        }
      }
    }
  }
  return null;
}

/**
 * LRU Formula AST / Structure Cache
 */
export interface FormulaCacheEntry {
  rawFormula: string;
  concatenationParts: string[];
  topLevelFunc?: { name: string; argsStr: string };
}

const FORMULA_CACHE_LIMIT = 1000;
const formulaCache = new Map<string, FormulaCacheEntry>();

export function getOrParseFormula(rawFormula: string): FormulaCacheEntry {
  let cached = formulaCache.get(rawFormula);
  if (cached) return cached;

  let formula = rawFormula.trim();
  if (formula.startsWith('=')) {
    formula = formula.slice(1).trim();
  }

  const parts = splitConcatenationParts(formula);
  let topLevelFunc: { name: string; argsStr: string } | undefined;
  const funcMatch = formula.match(/^([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/);
  if (funcMatch) {
    topLevelFunc = {
      name: funcMatch[1].toUpperCase(),
      argsStr: funcMatch[2]
    };
  }

  cached = {
    rawFormula,
    concatenationParts: parts,
    topLevelFunc
  };

  if (formulaCache.size >= FORMULA_CACHE_LIMIT) {
    const firstKey = formulaCache.keys().next().value;
    if (firstKey) formulaCache.delete(firstKey);
  }
  formulaCache.set(rawFormula, cached);

  return cached;
}
