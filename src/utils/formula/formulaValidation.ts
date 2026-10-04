import { ColumnSchema } from '../../types';
import {
  FormulaEvaluationContext,
  DetailedFormulaValidation,
  ColumnVerification,
  normalizeToken,
  buildFormulaIndexes
} from './formulaTypes';
import { evaluateAppSheetFormula } from './formulaParser';
import './formulaFunctions';

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
