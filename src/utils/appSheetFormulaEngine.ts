import { SheetRecord, ColumnSchema } from '../types';
import { parseAnyDate, formatInputDate, formatInputDateTime, parseLocaleNumber } from './pureCalculations';
import { findColumnBySemantic } from './columnAliases';

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
      // Find property in master product
      for (const [pk, pv] of Object.entries(prod)) {
        if (normalizeToken(pk) === cleanProp) {
          return String(pv || '').trim();
        }
      }
      // Semantic fallback for common properties
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

  // 3. General search across all loaded sheets (if relation is between tables)
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

/**
 * LRU Formula AST / Structure Cache
 */
interface FormulaCacheEntry {
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

/**
 * Evaluates an AppSheet formula expression string
 */
export function evaluateAppSheetFormula(
  rawFormula: string | undefined,
  context: FormulaEvaluationContext
): FormulaResult {
  if (!rawFormula || !rawFormula.trim()) {
    return { value: '', stringValue: '', success: true };
  }

  try {
    const cached = getOrParseFormula(rawFormula);

    // 1. Literal Concatenations using '&' operator at top level
    if (cached.concatenationParts.length > 1) {
      const evaluatedParts = cached.concatenationParts.map(p => {
        const evalRes = evaluateAppSheetFormula(p.trim(), context);
        return evalRes.stringValue;
      });
      const resultStr = evaluatedParts.join('');
      return { value: resultStr, stringValue: resultStr, success: true };
    }

    // 2. Evaluate Single Token, Binary Expression, or Function Call
    const cleanFormula = rawFormula.trim().startsWith('=') ? rawFormula.trim().slice(1).trim() : rawFormula.trim();
    return evaluateSingleTokenOrExpression(cleanFormula, context);
  } catch (err: any) {
    return {
      value: '',
      stringValue: '',
      success: false,
      error: err?.message || 'Error al evaluar fórmula'
    };
  }
}

/**
 * Splits formula by '&' respecting quotes and parentheses
 */
function splitConcatenationParts(str: string): string[] {
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
function findTopLevelBinaryOperator(expr: string, ops: string[]): { index: number; op: string } | null {
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
          // Check that it's binary, not a leading unary sign at start of string or right after an operator
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
 * Safely evaluates arithmetic expressions with +, -, *, /, unary -, parentheses,
 * numbers, function calls, and column references [COL_NAME] without using dangerous eval().
 */
export function evaluateArithmeticExpression(
  exprStr: string,
  context: FormulaEvaluationContext
): number | null {
  if (!exprStr || !exprStr.trim()) return null;

  const trimmed = exprStr.trim();

  // If it's a date or text function (e.g. TODAY(), NOW(), DATE(...)), don't treat as pure math unless it's a numeric conversion
  if (/^(TODAY|NOW|DATE|EOMONTH|LOOKUP|CONCATENATE|IF|ISBLANK|ISNOTBLANK|UPPER|LOWER|TEXT|SELECT|FILTER)\s*\(/i.test(trimmed)) {
    return null;
  }

  // 1. Substitute function calls like NUMBER(...), DECIMAL(...), INT(...), ROUND(...), ABS(...) with their evaluated values
  const substitutedFunctions = trimmed.replace(/\b(NUMBER|DECIMAL|INT|ROUND|ABS|SUM|MAX|MIN|AVG|AVERAGE|COUNT)\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi, (funcExpr) => {
    const res = evaluateSingleTokenOrExpression(funcExpr, context);
    const num = parseLocaleNumber(res.value, NaN);
    return isNaN(num) ? '0' : String(num);
  });

  // 2. Substitute all [COL_NAME] or [_THISROW].[COL_NAME] references with their numeric values
  const substituted = substitutedFunctions.replace(/(?:\[_THISROW\]\.|_THISROW\.)?\[([^\]]+)\]/gi, (_, colName) => {
    const val = resolveRowValue(context.row, colName.trim());
    const num = parseLocaleNumber(val, NaN);
    return isNaN(num) ? '0' : String(num);
  });

  // 3. Tokenize: numbers, +, -, *, /, (, )
  const tokens: string[] = [];
  let i = 0;
  while (i < substituted.length) {
    const ch = substituted[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[+\-*/()]/.test(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }
    if (/[\d.]/.test(ch)) {
      let numStr = '';
      while (i < substituted.length && /[\d.]/.test(substituted[i])) {
        numStr += substituted[i];
        i++;
      }
      tokens.push(numStr);
      continue;
    }
    let word = '';
    while (i < substituted.length && /[a-zA-Z0-9_]/.test(substituted[i])) {
      word += substituted[i];
      i++;
    }
    if (word) {
      const val = resolveRowValue(context.row, word);
      const num = parseLocaleNumber(val, NaN);
      tokens.push(isNaN(num) ? '0' : String(num));
    } else {
      i++;
    }
  }

  if (tokens.length === 0) return null;

  // 4. Recursive Descent Parser for safe arithmetic
  let pos = 0;

  function parseExpression(): number {
    let result = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const term = parseTerm();
      result = op === '+' ? result + term : result - term;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++];
      const factor = parseFactor();
      result = op === '*' ? result * factor : (factor !== 0 ? result / factor : 0);
    }
    return result;
  }

  function parseFactor(): number {
    if (pos >= tokens.length) return 0;
    const token = tokens[pos];

    // Unary minus
    if (token === '-') {
      pos++;
      return -parseFactor();
    }
    // Unary plus
    if (token === '+') {
      pos++;
      return parseFactor();
    }

    // Parentheses
    if (token === '(') {
      pos++; // consume '('
      const result = parseExpression();
      if (pos < tokens.length && tokens[pos] === ')') {
        pos++; // consume ')'
      }
      return result;
    }

    // Number
    pos++;
    const n = parseFloat(token);
    return isNaN(n) ? 0 : n;
  }

  try {
    const finalVal = parseExpression();
    return isNaN(finalVal) ? null : finalVal;
  } catch {
    return null;
  }
}

/**
 * Evaluates a single token, dereference, math, or function call
 */
function evaluateSingleTokenOrExpression(
  expr: string,
  context: FormulaEvaluationContext
): FormulaResult {
  const trimmed = expr.trim();
  if (!trimmed) return { value: '', stringValue: '', success: true };

  // A. String Literals ("hello" or 'hello')
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const unquoted = trimmed.slice(1, -1);
    return { value: unquoted, stringValue: unquoted, success: true };
  }

  // B. Numbers (123 or 45.67)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = parseFloat(trimmed);
    return { value: num, stringValue: String(num), success: true };
  }

  // C. Booleans
  if (/^true$/i.test(trimmed)) return { value: true, stringValue: 'true', success: true };
  if (/^false$/i.test(trimmed)) return { value: false, stringValue: 'false', success: true };

  // D. Parenthesized expressions ( ... )
  if (trimmed.startsWith(' me') || (trimmed.startsWith('(') && trimmed.endsWith(')'))) {
    let depth = 0;
    let isEnclosed = true;
    for (let i = 0; i < trimmed.length - 1; i++) {
      if (trimmed[i] === '(') depth++;
      if (trimmed[i] === ')') depth--;
      if (depth === 0) {
        isEnclosed = false;
        break;
      }
    }
    if (isEnclosed) {
      return evaluateSingleTokenOrExpression(trimmed.slice(1, -1), context);
    }
  }

  // E. Unary minus on sub-expressions/functions e.g. -NUMBER([DIAS]/30) or -([DIAS]/30)
  if (trimmed.startsWith('-') && trimmed.length > 1) {
    const rest = trimmed.slice(1).trim();
    if (/^[A-Za-z_]\w*\s*\(|^\[|^\(/.test(rest)) {
      const innerRes = evaluateSingleTokenOrExpression(rest, context);
      if (innerRes.success) {
        const n = parseLocaleNumber(innerRes.value, NaN);
        if (!isNaN(n)) {
          const negN = -n;
          return { value: negN, stringValue: String(negN), success: true };
        }
      }
    }
  }

  // F. De-referencing: [COL].[PROP] or [_THISROW].[COL].[PROP]
  const derefMatch = trimmed.match(/^\[(?:_THISROW\.)?([^\]]+)\]\.\[?([^\]\s]+)\]?$/i);
  if (derefMatch && derefMatch[1].trim().toUpperCase() !== '_THISROW') {
    const refCol = derefMatch[1].trim();
    const propCol = derefMatch[2].trim();
    const val = resolveDereference(refCol, propCol, context);
    return { value: val, stringValue: val, success: true };
  }

  // G. Column Reference: [COL], [_THISROW].[COL], or _THISROW.COL
  const colMatch = trimmed.match(/^\[_THISROW\]\.\[([^\]]+)\]$/i) || trimmed.match(/^(?:\[_THISROW\]\.|_THISROW\.)?\[([^\]]+)\]$/i) || trimmed.match(/^(?:\[_THISROW\]\.|_THISROW\.)([a-zA-Z0-9_]+)$/i);
  if (colMatch) {
    const colName = (colMatch[1] || '').trim();
    const val = resolveRowValue(context.row, colName);
    const strVal = val !== undefined && val !== null ? String(val) : '';
    return { value: val, stringValue: strVal, success: true };
  }

  // H. Top-level Pluggable Function Registry Lookup O(1)
  const funcCallMatch = trimmed.match(/^([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/);
  if (funcCallMatch) {
    const funcName = funcCallMatch[1].toUpperCase();
    const handler = FUNCTION_REGISTRY.get(funcName);
    if (handler) {
      const rawArgs = parseFunctionArguments(funcCallMatch[2]);
      return handler(rawArgs, context);
    }
  }

  // I. Top-Level Binary Operators (+, -)
  const addSubOp = findTopLevelBinaryOperator(trimmed, ['+', '-']);
  if (addSubOp) {
    const leftStr = trimmed.slice(0, addSubOp.index).trim();
    const rightStr = trimmed.slice(addSubOp.index + 1).trim();
    const leftRes = evaluateSingleTokenOrExpression(leftStr, context);
    const rightRes = evaluateSingleTokenOrExpression(rightStr, context);

    const leftDate = parseAnyDate(leftRes.value);
    const rightDate = parseAnyDate(rightRes.value);
    const leftNum = parseLocaleNumber(leftRes.value, NaN);
    const rightNum = parseLocaleNumber(rightRes.value, NaN);

    // Date + Days or Date - Days
    if (leftDate && !isNaN(rightNum)) {
      const days = addSubOp.op === '-' ? -rightNum : rightNum;
      const targetTime = leftDate.getTime() + days * 86400 * 1000;
      const resDate = new Date(targetTime);
      const formatted = formatInputDate(resDate);
      return { value: resDate, stringValue: formatted, success: true };
    }

    // Days + Date
    if (rightDate && !isNaN(leftNum) && addSubOp.op === '+') {
      const targetTime = rightDate.getTime() + leftNum * 86400 * 1000;
      const resDate = new Date(targetTime);
      const formatted = formatInputDate(resDate);
      return { value: resDate, stringValue: formatted, success: true };
    }

    // Date - Date (difference in days)
    if (leftDate && rightDate && addSubOp.op === '-') {
      const diffDays = Math.round((leftDate.getTime() - rightDate.getTime()) / (86400 * 1000));
      return { value: diffDays, stringValue: String(diffDays), success: true };
    }

    // Standard numeric addition / subtraction
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      const resNum = addSubOp.op === '+' ? leftNum + rightNum : leftNum - rightNum;
      return { value: resNum, stringValue: String(resNum), success: true };
    }
  }

  // I2. Top-Level Binary Operators (*, /)
  const mulDivOp = findTopLevelBinaryOperator(trimmed, ['*', '/']);
  if (mulDivOp) {
    const leftStr = trimmed.slice(0, mulDivOp.index).trim();
    const rightStr = trimmed.slice(mulDivOp.index + 1).trim();
    const leftRes = evaluateSingleTokenOrExpression(leftStr, context);
    const rightRes = evaluateSingleTokenOrExpression(rightStr, context);

    const leftNum = parseLocaleNumber(leftRes.value, NaN);
    const rightNum = parseLocaleNumber(rightRes.value, NaN);

    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      const resNum = mulDivOp.op === '*' ? leftNum * rightNum : (rightNum !== 0 ? leftNum / rightNum : 0);
      return { value: resNum, stringValue: String(resNum), success: true };
    }
  }

  // J. Arithmetic Expression Fallback: [DIAS RETIRO_VC]/30, -([DIAS]/30), [A] * [B], etc.
  if (/[+\-*/]/.test(trimmed)) {
    const mathVal = evaluateArithmeticExpression(trimmed, context);
    if (mathVal !== null && !isNaN(mathVal)) {
      return { value: mathVal, stringValue: String(mathVal), success: true };
    }
  }

  // Fallback: If it's a field name without brackets (e.g. SKU)
  const val = resolveRowValue(context.row, trimmed);
  if (val !== undefined && val !== null && val !== '') {
    return { value: val, stringValue: String(val), success: true };
  }

  return { value: trimmed, stringValue: trimmed, success: true };
}

/**
 * Parses arguments of a function call respecting nested parentheses and quotes
 */
function parseFunctionArguments(argsStr: string): string[] {
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

function stripQuotes(str: string): string {
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
 * Evaluates boolean conditions (e.g. for Show_If, Valid_If, or IF())
 */
export function evaluateBooleanCondition(
  expression: string | undefined,
  context: FormulaEvaluationContext
): boolean {
  if (!expression || !expression.trim()) return true;

  const expr = expression.trim();
  const upperExpr = expr.toUpperCase();
  if (upperExpr === 'TRUE' || upperExpr === '1') return true;
  if (upperExpr === 'FALSE' || upperExpr === '0') return false;

  // 1. ISBLANK / ISNOTBLANK
  if (/^ISBLANK\s*\(/i.test(expr)) {
    return Boolean(evaluateSingleTokenOrExpression(expr, context).value);
  }
  if (/^ISNOTBLANK\s*\(/i.test(expr)) {
    return Boolean(evaluateSingleTokenOrExpression(expr, context).value);
  }

  // 2. AND(cond1, cond2)
  const andMatch = expr.match(/^AND\s*\((.*)\)$/i);
  if (andMatch) {
    const subConds = parseFunctionArguments(andMatch[1]);
    return subConds.every(c => evaluateBooleanCondition(c, context));
  }

  // 3. OR(cond1, cond2)
  const orMatch = expr.match(/^OR\s*\((.*)\)$/i);
  if (orMatch) {
    const subConds = parseFunctionArguments(orMatch[1]);
    return subConds.some(c => evaluateBooleanCondition(c, context));
  }

  // 4. NOT(cond)
  const notMatch = expr.match(/^NOT\s*\((.*)\)$/i);
  if (notMatch) {
    return !evaluateBooleanCondition(notMatch[1], context);
  }

  // 5. Binary comparison: left [op] right
  const compMatch = expr.match(/^(.*?)\s*(=|!=|<>|>=|<=|>|<)\s*(.*?)$/);
  if (compMatch) {
    const leftToken = compMatch[1].trim();
    const op = compMatch[2];
    const rightToken = compMatch[3].trim();

    const leftRes = evaluateSingleTokenOrExpression(leftToken, context);
    const rightRes = evaluateSingleTokenOrExpression(rightToken, context);

    const leftVal = leftRes.stringValue.trim();
    const rightVal = rightRes.stringValue.trim();

    // Check if both are numeric
    const leftNum = parseLocaleNumber(leftVal, NaN);
    const rightNum = parseLocaleNumber(rightVal, NaN);
    const bothNumeric = !isNaN(leftNum) && !isNaN(rightNum);

    switch (op) {
      case '=':
        return bothNumeric ? leftNum === rightNum : leftVal.toUpperCase() === rightVal.toUpperCase();
      case '!=':
      case '<>':
        return bothNumeric ? leftNum !== rightNum : leftVal.toUpperCase() !== rightVal.toUpperCase();
      case '>':
        return bothNumeric ? leftNum > rightNum : leftVal > rightVal;
      case '>=':
        return bothNumeric ? leftNum >= rightNum : leftVal >= rightVal;
      case '<':
        return bothNumeric ? leftNum < rightNum : leftVal < rightVal;
      case '<=':
        return bothNumeric ? leftNum <= rightNum : leftVal <= rightVal;
    }
  }

  // Default evaluation
  const single = evaluateSingleTokenOrExpression(expr, context);
  return Boolean(single.value);
}

/* ========================================================================= */
/* INITIALIZATION OF PLUGGABLE FORMULA FUNCTION REGISTRY                     */
/* ========================================================================= */

// --- Numeric Functions ---
registerFormulaFunction('NUMBER', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const strVal = String(inner.stringValue ?? '').trim();
    if (strVal === '' || inner.value === null || inner.value === undefined) {
      return { value: '', stringValue: '', success: true };
    }
    const num = parseLocaleNumber(strVal, NaN);
    if (isNaN(num)) return { value: 0, stringValue: '0', success: true };
    const intVal = Math.trunc(num);
    return { value: intVal, stringValue: String(intVal), success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('DECIMAL', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const strVal = String(inner.stringValue ?? '').trim();
    if (strVal === '' || inner.value === null || inner.value === undefined) {
      return { value: '', stringValue: '', success: true };
    }
    const num = parseLocaleNumber(strVal, NaN);
    if (isNaN(num)) return { value: 0, stringValue: '0', success: true };
    return { value: num, stringValue: String(num), success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('INT', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const strVal = String(inner.stringValue ?? '').trim();
    if (strVal === '' || inner.value === null || inner.value === undefined) {
      return { value: '', stringValue: '', success: true };
    }
    const num = parseLocaleNumber(strVal, NaN);
    if (isNaN(num)) return { value: 0, stringValue: '0', success: true };
    const intVal = Math.floor(num);
    return { value: intVal, stringValue: String(intVal), success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('ROUND', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const digits = rawArgs[1] ? Math.max(0, parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 0) : 0;
    const num = parseLocaleNumber(inner.value, NaN);
    if (isNaN(num)) return { value: 0, stringValue: '0', success: true };
    const factor = Math.pow(10, digits);
    const rounded = Math.round(num * factor) / factor;
    return { value: rounded, stringValue: String(rounded), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('ABS', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const num = parseLocaleNumber(inner.value, NaN);
    const absVal = isNaN(num) ? 0 : Math.abs(num);
    return { value: absVal, stringValue: String(absVal), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('MAX', (rawArgs, context) => {
  const nums: number[] = [];
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      res.value.forEach(v => {
        const n = parseLocaleNumber(v, NaN);
        if (!isNaN(n)) nums.push(n);
      });
    } else {
      const n = parseLocaleNumber(res.value, NaN);
      if (!isNaN(n)) nums.push(n);
    }
  });
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return { value: max, stringValue: String(max), success: true };
});

registerFormulaFunction('MIN', (rawArgs, context) => {
  const nums: number[] = [];
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      res.value.forEach(v => {
        const n = parseLocaleNumber(v, NaN);
        if (!isNaN(n)) nums.push(n);
      });
    } else {
      const n = parseLocaleNumber(res.value, NaN);
      if (!isNaN(n)) nums.push(n);
    }
  });
  const min = nums.length > 0 ? Math.min(...nums) : 0;
  return { value: min, stringValue: String(min), success: true };
});

registerFormulaFunction('SUM', (rawArgs, context) => {
  const nums: number[] = [];
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      res.value.forEach(v => {
        const n = parseLocaleNumber(v, NaN);
        if (!isNaN(n)) nums.push(n);
      });
    } else {
      const n = parseLocaleNumber(res.value, NaN);
      if (!isNaN(n)) nums.push(n);
    }
  });
  const sum = nums.reduce((a, b) => a + b, 0);
  return { value: sum, stringValue: String(sum), success: true };
});

registerFormulaFunction('AVG', (rawArgs, context) => {
  return FUNCTION_REGISTRY.get('AVERAGE')!(rawArgs, context);
});

registerFormulaFunction('AVERAGE', (rawArgs, context) => {
  const nums: number[] = [];
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      res.value.forEach(v => {
        const n = parseLocaleNumber(v, NaN);
        if (!isNaN(n)) nums.push(n);
      });
    } else {
      const n = parseLocaleNumber(res.value, NaN);
      if (!isNaN(n)) nums.push(n);
    }
  });
  const avg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  return { value: avg, stringValue: String(avg), success: true };
});

registerFormulaFunction('COUNT', (rawArgs, context) => {
  let count = 0;
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      count += res.value.filter(v => v !== undefined && v !== null && String(v).trim() !== '').length;
    } else if (res.stringValue && res.stringValue.trim() !== '') {
      count += 1;
    }
  });
  return { value: count, stringValue: String(count), success: true };
});

// --- Text Functions ---
registerFormulaFunction('CONCATENATE', (rawArgs, context) => {
  const str = rawArgs.map(a => evaluateSingleTokenOrExpression(a, context).stringValue).join('');
  return { value: str, stringValue: str, success: true };
});

registerFormulaFunction('TEXT', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    return { value: inner.stringValue, stringValue: inner.stringValue, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('UPPER', (rawArgs, context) => {
  const str = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue : '';
  return { value: str.toUpperCase(), stringValue: str.toUpperCase(), success: true };
});

registerFormulaFunction('LOWER', (rawArgs, context) => {
  const str = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue : '';
  return { value: str.toLowerCase(), stringValue: str.toLowerCase(), success: true };
});

registerFormulaFunction('TRIM', (rawArgs, context) => {
  const str = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue : '';
  return { value: str.trim(), stringValue: str.trim(), success: true };
});

registerFormulaFunction('LEFT', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const str = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
  const count = rawArgs[1] ? parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 0 : 1;
  const res = str.slice(0, count);
  return { value: res, stringValue: res, success: true };
});

registerFormulaFunction('RIGHT', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const str = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
  const count = rawArgs[1] ? parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 0 : 1;
  const res = str.slice(Math.max(0, str.length - count));
  return { value: res, stringValue: res, success: true };
});

registerFormulaFunction('MID', (rawArgs, context) => {
  if (rawArgs.length < 2) return { value: '', stringValue: '', success: true };
  const str = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
  const start = Math.max(1, parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 1) - 1;
  const len = rawArgs[2] ? parseInt(evaluateSingleTokenOrExpression(rawArgs[2], context).stringValue, 10) || 0 : str.length;
  const res = str.slice(start, start + len);
  return { value: res, stringValue: res, success: true };
});

registerFormulaFunction('LEN', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: 0, stringValue: '0', success: true };
  const str = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
  return { value: str.length, stringValue: String(str.length), success: true };
});

registerFormulaFunction('CONTAINS', (rawArgs, context) => {
  if (rawArgs.length < 2) return { value: false, stringValue: 'false', success: true };
  const haystack = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue.toLowerCase();
  const needle = evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue.toLowerCase();
  const found = haystack.includes(needle);
  return { value: found, stringValue: String(found), success: true };
});

// --- Logical & Conditional Functions ---
registerFormulaFunction('SWITCH', (rawArgs, context) => {
  if (rawArgs.length >= 3) {
    const targetVal = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue.trim().toUpperCase();
    const hasDefault = (rawArgs.length - 1) % 2 === 1;
    const casesEnd = hasDefault ? rawArgs.length - 1 : rawArgs.length;
    
    for (let i = 1; i < casesEnd; i += 2) {
      const caseVal = evaluateSingleTokenOrExpression(rawArgs[i], context).stringValue.trim().toUpperCase();
      if (targetVal === caseVal) {
        return evaluateSingleTokenOrExpression(rawArgs[i + 1], context);
      }
    }
    if (hasDefault) {
      return evaluateSingleTokenOrExpression(rawArgs[rawArgs.length - 1], context);
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('IFS', (rawArgs, context) => {
  for (let i = 0; i < rawArgs.length; i += 2) {
    if (i + 1 < rawArgs.length) {
      const condStr = rawArgs[i].trim();
      const isTrue = evaluateBooleanCondition(condStr, context);
      if (isTrue) {
        return evaluateSingleTokenOrExpression(rawArgs[i + 1], context);
      }
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('IF', (rawArgs, context) => {
  if (rawArgs.length >= 2) {
    const condRes = evaluateBooleanCondition(rawArgs[0], context);
    if (condRes) {
      return evaluateSingleTokenOrExpression(rawArgs[1], context);
    } else if (rawArgs[2]) {
      return evaluateSingleTokenOrExpression(rawArgs[2], context);
    } else {
      return { value: '', stringValue: '', success: true };
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('ISBLANK', (rawArgs, context) => {
  const inner = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context) : { stringValue: '' };
  const isBlank = !inner.stringValue || inner.stringValue.trim() === '';
  return { value: isBlank, stringValue: isBlank ? 'true' : 'false', success: true };
});

registerFormulaFunction('ISNOTBLANK', (rawArgs, context) => {
  const inner = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context) : { stringValue: '' };
  const isNotBlank = Boolean(inner.stringValue && inner.stringValue.trim() !== '');
  return { value: isNotBlank, stringValue: isNotBlank ? 'true' : 'false', success: true };
});

// --- Date & Time Functions ---
registerFormulaFunction('TODAY', () => {
  const today = new Date();
  const formatted = formatInputDate(today);
  return { value: today, stringValue: formatted, success: true };
});

registerFormulaFunction('NOW', () => {
  const now = new Date();
  const formatted = formatInputDateTime(now);
  return { value: now, stringValue: formatted, success: true };
});

registerFormulaFunction('EOMONTH', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const dateRes = evaluateAppSheetFormula(rawArgs[0], context);
    const parsedDate = parseAnyDate(dateRes.value || dateRes.stringValue);
    let offset = 0;
    if (rawArgs[1]) {
      const offsetRes = evaluateAppSheetFormula(rawArgs[1], context);
      offset = Math.round(parseLocaleNumber(offsetRes.value || offsetRes.stringValue, 0));
    }
    if (parsedDate) {
      const lastDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth() + 1 + offset, 0);
      const formatted = formatInputDate(lastDay);
      return { value: lastDay, stringValue: formatted, success: true };
    }
  }
  return { value: '', stringValue: '', success: false, error: 'Fecha inválida en EOMONTH' };
});

registerFormulaFunction('DATE', (rawArgs, context) => {
  if (rawArgs.length === 3) {
    const y = parseInt(evaluateAppSheetFormula(rawArgs[0], context).stringValue, 10);
    const m = parseInt(evaluateAppSheetFormula(rawArgs[1], context).stringValue, 10);
    const d = parseInt(evaluateAppSheetFormula(rawArgs[2], context).stringValue, 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const dateObj = new Date(y, m - 1, d);
      const formatted = formatInputDate(dateObj);
      return { value: dateObj, stringValue: formatted, success: true };
    }
  } else if (rawArgs.length === 1) {
    const innerRes = evaluateAppSheetFormula(rawArgs[0], context);
    const parsedDate = parseAnyDate(innerRes.value || innerRes.stringValue);
    if (parsedDate) {
      const formatted = formatInputDate(parsedDate);
      return { value: parsedDate, stringValue: formatted, success: true };
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('YEAR', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const d = parseAnyDate(evaluateSingleTokenOrExpression(rawArgs[0], context).value);
  const val = d ? d.getFullYear() : '';
  return { value: val, stringValue: String(val), success: true };
});

registerFormulaFunction('MONTH', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const d = parseAnyDate(evaluateSingleTokenOrExpression(rawArgs[0], context).value);
  const val = d ? d.getMonth() + 1 : '';
  return { value: val, stringValue: String(val), success: true };
});

registerFormulaFunction('DAY', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const d = parseAnyDate(evaluateSingleTokenOrExpression(rawArgs[0], context).value);
  const val = d ? d.getDate() : '';
  return { value: val, stringValue: String(val), success: true };
});

// --- Relational & Collection Functions ---
registerFormulaFunction('LOOKUP', (rawArgs, context) => {
  if (rawArgs.length >= 4) {
    const needle = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
    const table = stripQuotes(rawArgs[1]);
    const searchCol = stripQuotes(rawArgs[2]);
    const returnCol = stripQuotes(rawArgs[3]);
    const val = executeLookup(needle, table, searchCol, returnCol, context);
    return { value: val, stringValue: val, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('SELECT', (rawArgs, context) => {
  if (rawArgs.length < 1) return { value: [], stringValue: '', success: true };
  const targetColExpr = rawArgs[0].trim();
  const filterCondExpr = rawArgs[1] ? rawArgs[1].trim() : '';

  let targetTable = context.tableName || '';
  let targetCol = targetColExpr;
  const tMatch = targetColExpr.match(/^([A-Za-z0-9_]+)\[([^\]]+)\]$/);
  if (tMatch) {
    targetTable = tMatch[1].trim();
    targetCol = tMatch[2].trim();
  } else if (targetColExpr.startsWith('[') && targetColExpr.endsWith(']')) {
    targetCol = targetColExpr.slice(1, -1).trim();
  }

  let records: SheetRecord[] = [];
  const normTable = normalizeToken(targetTable);
  if (normTable.includes('product') || normTable.includes('catalogo') || normTable.includes('maestro')) {
    records = context.products || [];
  } else if (normTable.includes('politic') || normTable.includes('canje')) {
    records = context.policies || [];
  } else if (context.allSheetsData && context.allSheetsData[targetTable]) {
    records = context.allSheetsData[targetTable];
  } else if (context.allSheetsData) {
    const foundKey = Object.keys(context.allSheetsData).find(k => normalizeToken(k) === normTable);
    if (foundKey) records = context.allSheetsData[foundKey];
  }

  if (records.length === 0 && context.row) {
    records = [context.row];
  }

  const results: any[] = [];
  records.forEach(rec => {
    let matches = true;
    if (filterCondExpr) {
      matches = evaluateBooleanCondition(filterCondExpr, {
        ...context,
        row: rec
      });
    }
    if (matches) {
      const val = resolveRowValue(rec, targetCol);
      if (val !== undefined && val !== null && val !== '') {
        results.push(val);
      }
    }
  });

  const joined = results.map(String).join(', ');
  return { value: results, stringValue: joined, success: true };
});

registerFormulaFunction('FILTER', (rawArgs, context) => {
  return FUNCTION_REGISTRY.get('SELECT')!(rawArgs, context);
});

registerFormulaFunction('ANY', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const res = evaluateSingleTokenOrExpression(rawArgs[0], context);
  if (Array.isArray(res.value)) {
    const first = res.value.length > 0 ? res.value[0] : '';
    return { value: first, stringValue: String(first ?? ''), success: true };
  }
  const str = res.stringValue || '';
  const firstElem = str.includes(',') ? str.split(',')[0].trim() : str;
  return { value: firstElem, stringValue: firstElem, success: true };
});

registerFormulaFunction('IN', (rawArgs, context) => {
  if (rawArgs.length < 2) return { value: false, stringValue: 'false', success: true };
  const needle = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue.trim().toUpperCase();
  const listRes = evaluateSingleTokenOrExpression(rawArgs[1], context);
  let isFound = false;
  if (Array.isArray(listRes.value)) {
    isFound = listRes.value.some(item => String(item ?? '').trim().toUpperCase() === needle);
  } else {
    const parts = (listRes.stringValue || '').split(',').map(s => s.trim().toUpperCase());
    isFound = parts.includes(needle);
  }
  return { value: isFound, stringValue: isFound ? 'true' : 'false', success: true };
});

registerFormulaFunction('INDEX', (rawArgs, context) => {
  if (rawArgs.length < 2) return { value: '', stringValue: '', success: true };
  const listRes = evaluateSingleTokenOrExpression(rawArgs[0], context);
  const idx = Math.max(1, parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 1) - 1;
  let val: any = '';
  if (Array.isArray(listRes.value)) {
    val = listRes.value[idx] ?? '';
  } else {
    const parts = (listRes.stringValue || '').split(',').map(s => s.trim());
    val = parts[idx] ?? '';
  }
  return { value: val, stringValue: String(val ?? ''), success: true };
});

registerFormulaFunction('CEILING', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const n = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const ceil = isNaN(n) ? 0 : Math.ceil(n);
    return { value: ceil, stringValue: String(ceil), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('FLOOR', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const n = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const flr = isNaN(n) ? 0 : Math.floor(n);
    return { value: flr, stringValue: String(flr), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('MOD', (rawArgs, context) => {
  if (rawArgs.length >= 2) {
    const n1 = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const n2 = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[1], context).value, NaN);
    if (!isNaN(n1) && !isNaN(n2) && n2 !== 0) {
      const mod = n1 % n2;
      return { value: mod, stringValue: String(mod), success: true };
    }
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('POWER', (rawArgs, context) => {
  if (rawArgs.length >= 2) {
    const base = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const exp = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[1], context).value, NaN);
    if (!isNaN(base) && !isNaN(exp)) {
      const pow = Math.pow(base, exp);
      return { value: pow, stringValue: String(pow), success: true };
    }
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('SQRT', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const n = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const sqrt = isNaN(n) || n < 0 ? 0 : Math.sqrt(n);
    return { value: sqrt, stringValue: String(sqrt), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('WORKDAY', (rawArgs, context) => {
  if (rawArgs.length >= 2) {
    const dateRes = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const daysRes = evaluateSingleTokenOrExpression(rawArgs[1], context);
    const d = parseAnyDate(dateRes.value || dateRes.stringValue);
    const numDays = Math.round(parseLocaleNumber(daysRes.value || daysRes.stringValue, 0));
    if (d && !isNaN(numDays)) {
      let cur = new Date(d.getTime());
      let added = 0;
      const step = numDays >= 0 ? 1 : -1;
      const target = Math.abs(numDays);
      while (added < target) {
        cur.setDate(cur.getDate() + step);
        const dayOfWeek = cur.getDay(); // 0 = Sun, 6 = Sat
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          added++;
        }
      }
      const formatted = formatInputDate(cur);
      return { value: cur, stringValue: formatted, success: true };
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('SUBSTITUTE', (rawArgs, context) => {
  if (rawArgs.length >= 3) {
    const text = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
    const oldStr = evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue;
    const newStr = evaluateSingleTokenOrExpression(rawArgs[2], context).stringValue;
    if (oldStr) {
      const replaced = text.split(oldStr).join(newStr);
      return { value: replaced, stringValue: replaced, success: true };
    }
    return { value: text, stringValue: text, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('REPLACE', (rawArgs, context) => {
  if (rawArgs.length >= 4) {
    const text = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
    const start = Math.max(1, parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 1) - 1;
    const len = Math.max(0, parseInt(evaluateSingleTokenOrExpression(rawArgs[2], context).stringValue, 10) || 0);
    const newText = evaluateSingleTokenOrExpression(rawArgs[3], context).stringValue;
    const replaced = text.slice(0, start) + newText + text.slice(start + len);
    return { value: replaced, stringValue: replaced, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('ENCODEURL', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const text = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
    const encoded = encodeURIComponent(text);
    return { value: encoded, stringValue: encoded, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

/**
 * Detailed column verification entry
 */
export interface ColumnVerification {
  name: string;
  isSpecial: boolean;
  exists: boolean;
  type?: string;
  table?: string;
}

/**
 * Result of detailed AppSheet formula semantic validation
 */
export interface DetailedFormulaValidation {
  isValid: boolean;
  status: 'valid' | 'invalid' | 'warning' | 'empty';
  message: string;
  referencedColumns: ColumnVerification[];
  evaluatedSample?: string;
  sampleSuccess?: boolean;
}

/**
 * Validates syntax of an AppSheet formula and checks column references
 */
export function validateFormulaSyntax(
  formula: string,
  availableHeaders: string[] = []
): { isValid: boolean; referencedColumns: string[]; error?: string } {
  if (!formula || !formula.trim()) {
    return { isValid: true, referencedColumns: [] };
  }

  const trimmed = formula.trim().startsWith('=') ? formula.trim().slice(1).trim() : formula.trim();

  // Parentheses balance check
  let paren = 0;
  for (const ch of trimmed) {
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (paren < 0) return { isValid: false, referencedColumns: [], error: 'Paréntesis de cierre desbalanceado' };
  }
  if (paren !== 0) return { isValid: false, referencedColumns: [], error: 'Paréntesis de apertura sin cerrar' };

  // Bracket balance check
  let bracket = 0;
  for (const ch of trimmed) {
    if (ch === '[') bracket++;
    if (ch === ']') bracket--;
    if (bracket < 0) return { isValid: false, referencedColumns: [], error: 'Corchete de cierre desbalanceado' };
  }
  if (bracket !== 0) return { isValid: false, referencedColumns: [], error: 'Corchete de apertura sin cerrar' };

  // Extract referenced columns
  const colMatches = trimmed.matchAll(/\[(?:_THISROW\.)?([^\]]+)\]/g);
  const referencedColumns: string[] = [];
  const normHeaders = availableHeaders.map(h => normalizeToken(h));

  for (const m of colMatches) {
    const colName = m[1].trim();
    if (!colName.includes('.')) {
      referencedColumns.push(colName);
      if (availableHeaders.length > 0 && !normHeaders.includes(normalizeToken(colName))) {
        // Warning: column not found in headers
        return {
          isValid: true,
          referencedColumns,
          error: `Nota: La columna [${colName}] no está presente en los encabezados actuales.`
        };
      }
    }
  }

  return { isValid: true, referencedColumns };
}

/**
 * Performs comprehensive semantic validation of AppSheet formula:
 * 1. Checks balanced parentheses and brackets
 * 2. Verifies that all referenced columns exist in the active table or related tables
 * 3. Checks function syntax and arguments
 * 4. Runs live evaluation on sample context row
 */
export function validateFormulaDetailed(
  formula: string,
  availableHeaders: string[] = [],
  context?: FormulaEvaluationContext
): DetailedFormulaValidation {
  if (!formula || !formula.trim()) {
    return {
      isValid: true,
      status: 'empty',
      message: 'Expresión vacía.',
      referencedColumns: []
    };
  }

  const raw = formula.trim();
  const trimmed = raw.startsWith('=') ? raw.slice(1).trim() : raw;

  // 1. Parentheses balance check
  let paren = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (paren < 0) {
      return {
        isValid: false,
        status: 'invalid',
        message: 'Error de sintaxis: Se encontró un paréntesis de cierre ")" sin su apertura "(" correspondiente.',
        referencedColumns: []
      };
    }
  }
  if (paren > 0) {
    return {
      isValid: false,
      status: 'invalid',
      message: `Error de sintaxis: Hay ${paren} paréntesis "(" sin cerrar.`,
      referencedColumns: []
    };
  }

  // 2. Bracket balance check
  let bracket = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '[') bracket++;
    if (ch === ']') bracket--;
    if (bracket < 0) {
      return {
        isValid: false,
        status: 'invalid',
        message: 'Error de sintaxis: Se encontró un corchete de cierre "]" sin su apertura "[".',
        referencedColumns: []
      };
    }
  }
  if (bracket > 0) {
    return {
      isValid: false,
      status: 'invalid',
      message: `Error de sintaxis: Hay ${bracket} corchete(s) "[" de nombre de columna sin cerrar.`,
      referencedColumns: []
    };
  }

  // 3. Extract and verify referenced columns
  const colMatches = trimmed.matchAll(/\[(?:_THISROW\.)?([^\]]+)\]/g);
  const referencedColumns: ColumnVerification[] = [];
  const normHeaders = availableHeaders.map(h => normalizeToken(h));
  const missingCols: string[] = [];

  for (const m of colMatches) {
    const rawColName = m[1].trim();
    if (rawColName.includes('.')) {
      // Dereferenced column: [REF].[PROP]
      const parts = rawColName.split('.');
      const refCol = parts[0].trim();
      const refExists = normHeaders.includes(normalizeToken(refCol)) || availableHeaders.some(h => normalizeToken(h) === normalizeToken(refCol));
      referencedColumns.push({
        name: rawColName,
        isSpecial: false,
        exists: refExists,
        table: refCol
      });
      if (!refExists && availableHeaders.length > 0) {
        missingCols.push(refCol);
      }
    } else {
      const isSpecial = /^(_RowNumber|_THISROW|_ROWNUM)$/i.test(rawColName);
      const exists = isSpecial || (availableHeaders.length === 0) || normHeaders.includes(normalizeToken(rawColName)) || availableHeaders.some(h => normalizeToken(h) === normalizeToken(rawColName));
      
      referencedColumns.push({
        name: rawColName,
        isSpecial,
        exists
      });

      if (!exists && !isSpecial && availableHeaders.length > 0) {
        missingCols.push(rawColName);
      }
    }
  }

  // If there are missing columns in the active table
  if (missingCols.length > 0) {
    return {
      isValid: false,
      status: 'invalid',
      message: `La columna [${missingCols.join(', ')}] no existe en la tabla "${context?.tableName || 'activa'}". Verifica el nombre de la variable o selecciónala desde el Explorador de Datos.`,
      referencedColumns
    };
  }

  // 4. Try live evaluation on context sample row if available
  if (context && context.row) {
    const testResult = evaluateAppSheetFormula(trimmed, context);
    if (!testResult.success && testResult.error) {
      return {
        isValid: false,
        status: 'invalid',
        message: testResult.error,
        referencedColumns,
        evaluatedSample: testResult.stringValue,
        sampleSuccess: false
      };
    }
    return {
      isValid: true,
      status: 'valid',
      message: 'Expresión válida y verificada.',
      referencedColumns,
      evaluatedSample: testResult.stringValue,
      sampleSuccess: true
    };
  }

  return {
    isValid: true,
    status: 'valid',
    message: 'Expresión sintácticamente válida.',
    referencedColumns
  };
}

/**
 * Sorts columns topologically based on formula dependencies so that columns
 * referenced by other formulas are computed first.
 */
export function sortColumnsByDependency(
  cols: string[],
  tableSchema: Record<string, ColumnSchema> | undefined
): string[] {
  if (!tableSchema) return cols;

  const adj = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  cols.forEach(col => {
    adj.set(col, new Set());
    inDegree.set(col, 0);
  });

  cols.forEach(col => {
    const colConfig = tableSchema[col];
    if (colConfig?.formula && colConfig.formula.trim()) {
      const matches = Array.from(colConfig.formula.matchAll(/\[(?:_THISROW\.)?([^\]]+)\]/gi));
      matches.forEach(m => {
        const rawDep = m[1].trim();
        // Ignore dereference subfields or special system fields
        const depCol = rawDep.split('.')[0].trim();
        const found = cols.find(c => normalizeToken(c) === normalizeToken(depCol));
        if (found && found !== col) {
          if (!adj.get(found)?.has(col)) {
            adj.get(found)?.add(col);
            inDegree.set(col, (inDegree.get(col) || 0) + 1);
          }
        }
      });
    }
  });

  const queue: string[] = [];
  cols.forEach(col => {
    if ((inDegree.get(col) || 0) === 0) {
      queue.push(col);
    }
  });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    sorted.push(curr);
    adj.get(curr)?.forEach(neighbor => {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    });
  }

  // If there are cycles, append remaining unvisited columns in original order
  if (sorted.length < cols.length) {
    cols.forEach(col => {
      if (!sorted.includes(col)) {
        sorted.push(col);
      }
    });
  }

  return sorted;
}

/**
 * Applies all configured formulas in table schema to a record in topological dependency order
 */
export function applyTableSchemaFormulas(
  row: Record<string, any>,
  headers: string[],
  tableSchema: Record<string, ColumnSchema> | undefined,
  context: Omit<FormulaEvaluationContext, 'row'>
): Record<string, any> {
  if (!tableSchema) return row;

  if (!context._indexes) {
    (context as any)._indexes = buildFormulaIndexes(context);
  }

  const updated = { ...row };
  const allCols = Array.from(new Set([...headers, ...Object.keys(tableSchema)]));
  const sortedCols = sortColumnsByDependency(allCols, tableSchema);

  const evalContext: FormulaEvaluationContext = {
    ...context,
    row: updated,
    headers: sortedCols
  };

  for (const header of sortedCols) {
    const colConfig = tableSchema[header];
    if (colConfig?.formula && colConfig.formula.trim()) {
      const res = evaluateAppSheetFormula(colConfig.formula, evalContext);
      if (res.success && res.stringValue !== undefined) {
        updated[header] = res.stringValue;
        evalContext.row[header] = res.stringValue;
      }
    }
  }

  return updated;
}
