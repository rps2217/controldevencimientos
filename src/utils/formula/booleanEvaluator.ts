import { FormulaEvaluationContext, parseFunctionArguments } from './types';
import { parseLocaleNumber } from '../pureCalculations';

export type SingleTokenEvaluator = (expr: string, context: FormulaEvaluationContext) => { value: any; stringValue: string; success: boolean };

/**
 * Evaluates boolean conditions (e.g. for Show_If, Valid_If, or IF())
 */
export function evaluateBooleanCondition(
  expression: string | undefined,
  context: FormulaEvaluationContext,
  evaluateToken: SingleTokenEvaluator
): boolean {
  if (!expression || !expression.trim()) return true;

  const expr = expression.trim();
  const upperExpr = expr.toUpperCase();
  if (upperExpr === 'TRUE' || upperExpr === '1') return true;
  if (upperExpr === 'FALSE' || upperExpr === '0') return false;

  // 1. ISBLANK / ISNOTBLANK
  if (/^ISBLANK\s*\(/i.test(expr)) {
    return Boolean(evaluateToken(expr, context).value);
  }
  if (/^ISNOTBLANK\s*\(/i.test(expr)) {
    return Boolean(evaluateToken(expr, context).value);
  }

  // 2. AND(cond1, cond2)
  const andMatch = expr.match(/^AND\s*\((.*)\)$/i);
  if (andMatch) {
    const subConds = parseFunctionArguments(andMatch[1]);
    return subConds.every(c => evaluateBooleanCondition(c, context, evaluateToken));
  }

  // 3. OR(cond1, cond2)
  const orMatch = expr.match(/^OR\s*\((.*)\)$/i);
  if (orMatch) {
    const subConds = parseFunctionArguments(orMatch[1]);
    return subConds.some(c => evaluateBooleanCondition(c, context, evaluateToken));
  }

  // 4. NOT(cond)
  const notMatch = expr.match(/^NOT\s*\((.*)\)$/i);
  if (notMatch) {
    return !evaluateBooleanCondition(notMatch[1], context, evaluateToken);
  }

  // 5. Binary comparison: left [op] right
  const compMatch = expr.match(/^(.*?)\s*(=|!=|<>|>=|<=|>|<)\s*(.*?)$/);
  if (compMatch) {
    const leftToken = compMatch[1].trim();
    const op = compMatch[2];
    const rightToken = compMatch[3].trim();

    const leftRes = evaluateToken(leftToken, context);
    const rightRes = evaluateToken(rightToken, context);

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
  const single = evaluateToken(expr, context);
  return Boolean(single.value);
}
