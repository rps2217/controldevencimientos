import { FormulaEvaluationContext, resolveRowValue } from './types';
import { parseLocaleNumber } from '../pureCalculations';

export type TokenEvaluator = (expr: string, context: FormulaEvaluationContext) => { value: any; stringValue: string; success: boolean };

/**
 * Safely evaluates arithmetic expressions with +, -, *, /, unary -, parentheses,
 * numbers, function calls, and column references [COL_NAME] without using dangerous eval().
 */
export function evaluateArithmeticExpression(
  exprStr: string,
  context: FormulaEvaluationContext,
  evaluateToken?: TokenEvaluator
): number | null {
  if (!exprStr || !exprStr.trim()) return null;

  const trimmed = exprStr.trim();

  // If it's a date or text function (e.g. TODAY(), NOW(), DATE(...)), don't treat as pure math unless it's a numeric conversion
  if (/^(TODAY|NOW|DATE|EOMONTH|LOOKUP|CONCATENATE|IF|ISBLANK|ISNOTBLANK|UPPER|LOWER|TEXT|SELECT|FILTER)\s*\(/i.test(trimmed)) {
    return null;
  }

  // 1. Substitute function calls like NUMBER(...), DECIMAL(...), INT(...), ROUND(...), ABS(...) with their evaluated values
  const substitutedFunctions = evaluateToken 
    ? trimmed.replace(/\b(NUMBER|DECIMAL|INT|ROUND|ABS|SUM|MAX|MIN|AVG|AVERAGE|COUNT)\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi, (funcExpr) => {
        const res = evaluateToken(funcExpr, context);
        const num = parseLocaleNumber(res.value, NaN);
        return isNaN(num) ? '0' : String(num);
      })
    : trimmed;

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
