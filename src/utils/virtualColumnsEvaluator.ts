import { InventoryItem, SheetConfig, SheetRecord, ColumnSchema } from '../types';
import { evaluateAppSheetFormula, FormulaEvaluationContext } from './appSheetFormulaEngine';
import { VIRTUAL_COLUMNS } from './virtualColumns';

export interface EvaluateVirtualColumnsOptions {
  items: InventoryItem[];
  headers: string[];
  sheetTitle?: string;
  sheetConfig: SheetConfig;
  products?: SheetRecord[];
  policies?: SheetRecord[];
  allSheetsData?: Record<string, SheetRecord[]>;
}

/**
 * Returns a list of all virtual columns defined for a given table in SheetConfig.schema
 */
export function getSchemaVirtualColumns(
  sheetTitle: string | undefined,
  sheetConfig: SheetConfig
): { colKey: string; schema: ColumnSchema }[] {
  if (!sheetTitle) return [];
  const tableSchema = sheetConfig.schema?.[sheetTitle];
  if (!tableSchema) return [];

  const list: { colKey: string; schema: ColumnSchema }[] = [];
  Object.entries(tableSchema).forEach(([colKey, colDef]) => {
    if (colDef.isVirtual || colDef.type === 'calculated') {
      list.push({ colKey, schema: colDef });
    }
  });
  return list;
}

/**
 * Evaluates all virtual columns (both custom formula-based from AppSheet schema
 * and active system virtual columns) for a single item.
 */
export function evaluateItemVirtualColumns(
  item: InventoryItem,
  headers: string[],
  sheetTitle: string | undefined,
  sheetConfig: SheetConfig,
  products: SheetRecord[] = [],
  policies: SheetRecord[] = [],
  allSheetsData?: Record<string, SheetRecord[]>
): Record<string, any> {
  const computedValues: Record<string, any> = {};
  const schemaVirtualCols = getSchemaVirtualColumns(sheetTitle, sheetConfig);

  // 1. Evaluate custom schema virtual columns with AppSheet formulas
  if (schemaVirtualCols.length > 0) {
    const evalCtx: FormulaEvaluationContext = {
      row: item,
      headers,
      tableName: sheetTitle,
      products,
      policies,
      allSheetsData,
      customAliases: sheetConfig.customAliases
    };

    schemaVirtualCols.forEach(({ colKey, schema }) => {
      if (schema.formula && schema.formula.trim()) {
        const res = evaluateAppSheetFormula(schema.formula, evalCtx);
        computedValues[colKey] = res.value !== undefined ? res.value : '';
      } else {
        computedValues[colKey] = '';
      }
    });
  }

  // 2. Evaluate active legacy system virtual columns
  const activeVCs = sheetConfig.activeVirtualColumns || [];
  if (activeVCs.length > 0) {
    const legacyVCs = VIRTUAL_COLUMNS.filter(col => activeVCs.includes(col.id));
    legacyVCs.forEach(col => {
      computedValues[col.id] = col.calculate(item, headers, { products, policies });
    });
  }

  return computedValues;
}

/**
 * Augments an array of items with all calculated virtual column values in a single high-performance pass.
 */
export function augmentItemsWithVirtualColumns(
  options: EvaluateVirtualColumnsOptions
): InventoryItem[] {
  const { items, headers, sheetTitle, sheetConfig, products = [], policies = [], allSheetsData } = options;
  if (!items || items.length === 0) return [];

  const schemaVirtualCols = getSchemaVirtualColumns(sheetTitle, sheetConfig);
  const activeVCs = sheetConfig.activeVirtualColumns || [];
  const legacyVCs = activeVCs.length > 0
    ? VIRTUAL_COLUMNS.filter(col => activeVCs.includes(col.id))
    : [];

  // If no virtual columns are defined at all, return original items immediately
  if (schemaVirtualCols.length === 0 && legacyVCs.length === 0) {
    return items;
  }

  return items.map(item => {
    const computedValues: Record<string, any> = {};

    // 1. Evaluate custom schema virtual columns with AppSheet formulas
    if (schemaVirtualCols.length > 0) {
      const evalCtx: FormulaEvaluationContext = {
        row: item,
        headers,
        tableName: sheetTitle,
        products,
        policies,
        allSheetsData,
        customAliases: sheetConfig.customAliases
      };

      for (let i = 0; i < schemaVirtualCols.length; i++) {
        const { colKey, schema } = schemaVirtualCols[i];
        if (schema.formula && schema.formula.trim()) {
          const res = evaluateAppSheetFormula(schema.formula, evalCtx);
          computedValues[colKey] = res.value !== undefined ? res.value : '';
        } else {
          computedValues[colKey] = '';
        }
      }
    }

    // 2. Evaluate active legacy system virtual columns
    if (legacyVCs.length > 0) {
      for (let i = 0; i < legacyVCs.length; i++) {
        const col = legacyVCs[i];
        computedValues[col.id] = col.calculate(item, headers, { products, policies });
      }
    }

    return {
      ...item,
      ...computedValues
    };
  });
}
