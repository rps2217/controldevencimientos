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
}

export interface FormulaResult {
  value: any;
  stringValue: string;
  success: boolean;
  error?: string;
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
  const { row, products = [], policies = [], allSheetsData = {}, customAliases } = context;
  const refVal = String(resolveRowValue(row, refColName) || '').trim();
  if (!refVal) return '';

  const cleanRef = normalizeToken(refColName);
  const cleanProp = normalizeToken(targetPropName);

  // 1. Is refCol referring to SKU / Product?
  if (cleanRef.includes('sku') || cleanRef.includes('codigo') || cleanRef.includes('producto')) {
    const normRefVal = normalizeToken(refVal);
    const prod = products.find(p => {
      const pSku = String(p['SKU'] || p['sku'] || p['CODIGO'] || p['codigo'] || '').trim();
      return normalizeToken(pSku) === normRefVal;
    });

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
    const pol = policies.find(p => {
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
  for (const [tableName, records] of Object.entries(allSheetsData)) {
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
 * Evaluates an AppSheet formula expression string
 */
export function evaluateAppSheetFormula(
  rawFormula: string | undefined,
  context: FormulaEvaluationContext
): FormulaResult {
  if (!rawFormula || !rawFormula.trim()) {
    return { value: '', stringValue: '', success: true };
  }

  let formula = rawFormula.trim();
  // Strip leading '=' if entered like Excel
  if (formula.startsWith('=')) {
    formula = formula.slice(1).trim();
  }

  try {
    // 1. Literal Concatenations using '&' operator
    // E.g.: [SKU] & [YYYY] & [MM] or [SKU] & "-" & [LOTE]
    if (formula.includes('&') && !/^(AND|OR|IF|LOOKUP|CONCATENATE)\s*\(/i.test(formula)) {
      const parts = splitConcatenationParts(formula);
      const evaluatedParts = parts.map(p => {
        const evalRes = evaluateSingleTokenOrExpression(p.trim(), context);
        return evalRes.stringValue;
      });
      const resultStr = evaluatedParts.join('');
      return { value: resultStr, stringValue: resultStr, success: true };
    }

    // 2. Evaluate Single Token or Function Call
    return evaluateSingleTokenOrExpression(formula, context);
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
 * Splits formula by '&' respecting quotes
 */
function splitConcatenationParts(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let inBracket = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    else if (ch === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    else if (ch === '[' && !inDoubleQuote && !inSingleQuote) inBracket = true;
    else if (ch === ']' && !inDoubleQuote && !inSingleQuote) inBracket = false;

    if (ch === '&' && !inDoubleQuote && !inSingleQuote && !inBracket) {
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

  // D. De-referencing: [COL].[PROP] or [_THISROW].[COL].[PROP]
  const derefMatch = trimmed.match(/^\[(?:_THISROW\.)?([^\]]+)\]\.\[?([^\]\s]+)\]?$/i);
  if (derefMatch) {
    const refCol = derefMatch[1].trim();
    const propCol = derefMatch[2].trim();
    const val = resolveDereference(refCol, propCol, context);
    return { value: val, stringValue: val, success: true };
  }

  // E. Column Reference: [COL] or [_THISROW].[COL]
  const colMatch = trimmed.match(/^\[(?:_THISROW\.)?([^\]]+)\]$/i);
  if (colMatch) {
    const colName = colMatch[1].trim();
    const val = resolveRowValue(context.row, colName);
    const strVal = val !== undefined && val !== null ? String(val) : '';
    return { value: val, stringValue: strVal, success: true };
  }

  // F. LOOKUP function: LOOKUP(needle, table, searchCol, returnCol)
  const lookupMatch = trimmed.match(/^LOOKUP\s*\((.*)\)$/i);
  if (lookupMatch) {
    const args = parseFunctionArguments(lookupMatch[1]);
    if (args.length >= 4) {
      const needle = evaluateSingleTokenOrExpression(args[0], context).stringValue;
      const table = stripQuotes(args[1]);
      const searchCol = stripQuotes(args[2]);
      const returnCol = stripQuotes(args[3]);
      const val = executeLookup(needle, table, searchCol, returnCol, context);
      return { value: val, stringValue: val, success: true };
    }
  }

  // G. CONCATENATE(a, b, c, ...)
  const concatMatch = trimmed.match(/^CONCATENATE\s*\((.*)\)$/i);
  if (concatMatch) {
    const args = parseFunctionArguments(concatMatch[1]);
    const str = args.map(a => evaluateSingleTokenOrExpression(a, context).stringValue).join('');
    return { value: str, stringValue: str, success: true };
  }

  // H. TODAY() and NOW()
  if (/^TODAY\s*\(\s*\)$/i.test(trimmed)) {
    const today = new Date();
    const formatted = formatInputDate(today);
    return { value: today, stringValue: formatted, success: true };
  }
  if (/^NOW\s*\(\s*\)$/i.test(trimmed)) {
    const now = new Date();
    const formatted = formatInputDateTime(now);
    return { value: now, stringValue: formatted, success: true };
  }

  // I. EOMONTH(date, offsetMonths)
  const eomonthMatch = trimmed.match(/^EOMONTH\s*\((.*)\)$/i);
  if (eomonthMatch) {
    const args = parseFunctionArguments(eomonthMatch[1]);
    if (args.length >= 1) {
      const dateVal = evaluateSingleTokenOrExpression(args[0], context).value;
      const parsedDate = parseAnyDate(dateVal);
      const offset = args[1] ? parseInt(evaluateSingleTokenOrExpression(args[1], context).stringValue, 10) || 0 : 0;
      if (parsedDate) {
        const lastDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth() + 1 + offset, 0);
        const formatted = formatInputDate(lastDay);
        return { value: lastDay, stringValue: formatted, success: true };
      }
    }
    return { value: '', stringValue: '', success: false, error: 'Fecha inválida en EOMONTH' };
  }

  // J. DATE(year, month, day)
  const dateMatch = trimmed.match(/^DATE\s*\((.*)\)$/i);
  if (dateMatch) {
    const args = parseFunctionArguments(dateMatch[1]);
    if (args.length === 3) {
      const y = parseInt(evaluateSingleTokenOrExpression(args[0], context).stringValue, 10);
      const m = parseInt(evaluateSingleTokenOrExpression(args[1], context).stringValue, 10);
      const d = parseInt(evaluateSingleTokenOrExpression(args[2], context).stringValue, 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        const dateObj = new Date(y, m - 1, d);
        const formatted = formatInputDate(dateObj);
        return { value: dateObj, stringValue: formatted, success: true };
      }
    }
  }

  // K. Date Arithmetic: [FECHA_VC] - [DIAS_RETIRO] or [FECHA] + 15
  const dateArithMatch = trimmed.match(/^(\[[^\]]+\]|\w+\(.*?\))\s*([+-])\s*(\[[^\]]+\]|\d+|\w+\(.*?\))$/);
  if (dateArithMatch) {
    const leftRes = evaluateSingleTokenOrExpression(dateArithMatch[1], context);
    const op = dateArithMatch[2];
    const rightRes = evaluateSingleTokenOrExpression(dateArithMatch[3], context);

    const leftDate = parseAnyDate(leftRes.value);
    const rightNum = parseLocaleNumber(rightRes.value, NaN);

    if (leftDate && !isNaN(rightNum)) {
      const days = op === '-' ? -rightNum : rightNum;
      const targetTime = leftDate.getTime() + days * 86400 * 1000;
      const resDate = new Date(targetTime);
      const formatted = formatInputDate(resDate);
      return { value: resDate, stringValue: formatted, success: true };
    }

    // Standard numeric arithmetic
    const leftNum = parseLocaleNumber(leftRes.value, NaN);
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      const resNum = op === '+' ? leftNum + rightNum : leftNum - rightNum;
      return { value: resNum, stringValue: String(resNum), success: true };
    }
  }

  // L. IF(condition, trueVal, falseVal)
  const ifMatch = trimmed.match(/^IF\s*\((.*)\)$/i);
  if (ifMatch) {
    const args = parseFunctionArguments(ifMatch[1]);
    if (args.length >= 2) {
      const condRes = evaluateBooleanCondition(args[0], context);
      if (condRes) {
        return evaluateSingleTokenOrExpression(args[1], context);
      } else if (args[2]) {
        return evaluateSingleTokenOrExpression(args[2], context);
      } else {
        return { value: '', stringValue: '', success: true };
      }
    }
  }

  // M. ISBLANK(val) and ISNOTBLANK(val)
  const isBlankMatch = trimmed.match(/^ISBLANK\s*\((.*)\)$/i);
  if (isBlankMatch) {
    const inner = evaluateSingleTokenOrExpression(isBlankMatch[1], context);
    const isBlank = !inner.stringValue || inner.stringValue.trim() === '';
    return { value: isBlank, stringValue: isBlank ? 'true' : 'false', success: true };
  }
  const isNotBlankMatch = trimmed.match(/^ISNOTBLANK\s*\((.*)\)$/i);
  if (isNotBlankMatch) {
    const inner = evaluateSingleTokenOrExpression(isNotBlankMatch[1], context);
    const isNotBlank = Boolean(inner.stringValue && inner.stringValue.trim() !== '');
    return { value: isNotBlank, stringValue: isNotBlank ? 'true' : 'false', success: true };
  }

  // N. Text functions: UPPER, LOWER, TRIM
  const upperMatch = trimmed.match(/^UPPER\s*\((.*)\)$/i);
  if (upperMatch) {
    const inner = evaluateSingleTokenOrExpression(upperMatch[1], context).stringValue;
    return { value: inner.toUpperCase(), stringValue: inner.toUpperCase(), success: true };
  }
  const lowerMatch = trimmed.match(/^LOWER\s*\((.*)\)$/i);
  if (lowerMatch) {
    const inner = evaluateSingleTokenOrExpression(lowerMatch[1], context).stringValue;
    return { value: inner.toLowerCase(), stringValue: inner.toLowerCase(), success: true };
  }
  const trimMatch = trimmed.match(/^TRIM\s*\((.*)\)$/i);
  if (trimMatch) {
    const inner = evaluateSingleTokenOrExpression(trimMatch[1], context).stringValue;
    return { value: inner.trim(), stringValue: inner.trim(), success: true };
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
 * Applies all configured formulas in table schema to a record
 */
export function applyTableSchemaFormulas(
  row: Record<string, any>,
  headers: string[],
  tableSchema: Record<string, ColumnSchema> | undefined,
  context: Omit<FormulaEvaluationContext, 'row'>
): Record<string, any> {
  if (!tableSchema) return row;

  const updated = { ...row };
  const evalContext: FormulaEvaluationContext = {
    ...context,
    row: updated,
    headers
  };

  for (const header of headers) {
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
