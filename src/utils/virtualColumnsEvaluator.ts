import { InventoryItem, SheetConfig, SheetRecord, ColumnSchema } from '../types';
import { evaluateAppSheetFormula, FormulaEvaluationContext } from './appSheetFormulaEngine';

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
 * Standard Presets for AppSheet Virtual Columns
 */
export const STANDARD_VIRTUAL_PRESETS: Record<string, ColumnSchema> = {
  FECHA_RETIRO_CALC: {
    label: 'Fecha Retiro Sugerida',
    type: 'date',
    isVirtual: true,
    visible: true,
    searchable: true,
    behavior: 'none',
    formula: 'EOMONTH([FECHA_VC], -([DIAS_RETIRO]/30))',
    description: 'Fecha límite de retiro en góndola según política comercial'
  },
  CU_VC: {
    label: 'Código Único (CU_VC)',
    type: 'text',
    isVirtual: true,
    visible: true,
    searchable: true,
    behavior: 'none',
    formula: '[SKU] & [YYYY] & [MM]',
    description: 'Identificador compuesto unívoco de vencimiento'
  },
  PROVEEDOR_CATALOGO: {
    label: 'Proveedor (Catálogo)',
    type: 'text',
    isVirtual: true,
    visible: true,
    searchable: true,
    behavior: 'none',
    formula: '[SKU].[PROVEEDOR]',
    description: 'Nombre del laboratorio o proveedor en el Catálogo Maestro'
  },
  POLITICA_CANJE_RELAC: {
    label: 'Política de Canje',
    type: 'text',
    isVirtual: true,
    visible: true,
    searchable: true,
    behavior: 'none',
    formula: '[RUT_PROVEEDOR].[POLITICA]',
    description: 'Acuerdo comercial de retorno o destrucción'
  },
  DIAS_RETIRO_RELAC: {
    label: 'Días de Retiro',
    type: 'number',
    isVirtual: true,
    visible: true,
    searchable: true,
    behavior: 'none',
    formula: '[RUT_PROVEEDOR].[DIAS_RETIRO]',
    description: 'Días de antelación para el retiro'
  }
};

/**
 * Helper to locate the schema for a table using title, activeView or case-insensitive matching.
 */
export function findTableSchema(
  sheetTitle: string | undefined,
  sheetConfig: SheetConfig,
  activeView?: string
): Record<string, ColumnSchema> | undefined {
  if (!sheetConfig?.schema) return undefined;
  if (sheetTitle && sheetConfig.schema[sheetTitle]) {
    return sheetConfig.schema[sheetTitle];
  }
  if (activeView && sheetConfig.schema[activeView]) {
    return sheetConfig.schema[activeView];
  }
  if (sheetTitle) {
    const lower = sheetTitle.toLowerCase();
    const entry = Object.entries(sheetConfig.schema).find(([k]) => k.toLowerCase() === lower);
    if (entry) return entry[1];
  }
  if (activeView) {
    const lower = activeView.toLowerCase();
    const entry = Object.entries(sheetConfig.schema).find(([k]) => k.toLowerCase() === lower);
    if (entry) return entry[1];
  }
  return undefined;
}

/**
 * Returns a list of all virtual columns defined for a given table in SheetConfig.schema
 */
export function getSchemaVirtualColumns(
  sheetTitle: string | undefined,
  sheetConfig: SheetConfig,
  activeView?: string
): { colKey: string; schema: ColumnSchema }[] {
  const tableSchema = findTableSchema(sheetTitle, sheetConfig, activeView);
  if (!tableSchema) return [];

  const list: { colKey: string; schema: ColumnSchema }[] = [];
  Object.entries(tableSchema).forEach(([colKey, colDef]) => {
    if (colDef.isVirtual || colDef.type === 'calculated' || Boolean(colDef.formula)) {
      list.push({ colKey, schema: colDef });
    }
  });
  return list;
}

/**
 * Evaluates all virtual columns defined in the AppSheet schema for a single item.
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

  // If no virtual columns are defined in schema, return original items immediately
  if (schemaVirtualCols.length === 0) {
    return items;
  }

  // O(1) check: if items are already pre-enriched with all virtual columns (e.g. via applyTableSchemaFormulas in Dashboard), skip re-evaluation
  const firstItem = items[0];
  if (firstItem && schemaVirtualCols.every(({ colKey }) => firstItem[colKey] !== undefined)) {
    return items;
  }

  const evalCtx: FormulaEvaluationContext = {
    row: {},
    headers,
    tableName: sheetTitle,
    products,
    policies,
    allSheetsData,
    customAliases: sheetConfig.customAliases
  };

  return items.map(item => {
    const computedValues: Record<string, any> = {};
    evalCtx.row = item;

    for (let i = 0; i < schemaVirtualCols.length; i++) {
      const { colKey, schema } = schemaVirtualCols[i];
      if (schema.formula && schema.formula.trim()) {
        const res = evaluateAppSheetFormula(schema.formula, evalCtx);
        computedValues[colKey] = res.value !== undefined ? res.value : '';
      } else {
        computedValues[colKey] = '';
      }
    }

    return {
      ...item,
      ...computedValues
    };
  });
}

