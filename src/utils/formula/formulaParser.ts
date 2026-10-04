import { parseAnyDate, formatInputDate, parseLocaleNumber } from '../pureCalculations';
import {
  FormulaEvaluationContext,
  FormulaResult,
  FUNCTION_REGISTRY,
  resolveRowValue,
  resolveDereference
} from './formulaTypes';

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
export function evaluateSingleTokenOrExpression(
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
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
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
