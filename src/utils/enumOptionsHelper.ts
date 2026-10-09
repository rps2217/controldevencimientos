import { SheetConfig, ColumnSchema, InventoryItem } from '../types';
import { parseEnumOptions } from './enumColorHelper';
import { findColumnBySemantic } from './columnAliases';

/**
 * Get all available enum values for any column, checking schema first,
 * then falling back to semantic defaults (e.g., FRC_EVEN), months, years, or unique data values.
 */
export function getColumnEnumValues(
  header: string,
  sheetConfig?: SheetConfig | null,
  activeSheetTitle?: string,
  customAliases?: Record<string, string[]>,
  existingItems?: InventoryItem[]
): string[] {
  if (!header) return [];
  const normalizedHeader = header.trim();
  
  const currentTable = activeSheetTitle || Object.keys(sheetConfig?.schema || {})[0] || 'VENCIMIENTOS';
  const tableSchema = sheetConfig?.schema?.[currentTable] || sheetConfig?.schema?.['VENCIMIENTOS'];
  
  let colSchema: ColumnSchema | undefined = tableSchema?.[normalizedHeader];
  if (!colSchema && tableSchema) {
    const foundKey = Object.keys(tableSchema).find(k => k.toLowerCase() === normalizedHeader.toLowerCase());
    if (foundKey) colSchema = tableSchema[foundKey];
  }
  
  const schemaOptions = colSchema?.options ? parseEnumOptions(colSchema.options).map(o => o.value) : [];
  if (schemaOptions.length > 0) {
    return schemaOptions;
  }
  
  // Semantic fallbacks for FRC_EVEN / tipo_evento
  const isEventCol = /^(frc(_|\s)?even|tipo(_|\s)?evento)$/i.test(normalizedHeader) || 
    Boolean(findColumnBySemantic([normalizedHeader], 'tipo_evento', customAliases));
    
  if (isEventCol) {
    return [
      'DIF. PED',
      'DET. PED',
      'VENC. CERC.',
      'CAL. INTER',
      'CAL. EXT.',
      'CANJES',
      'SOBRANTE INVENT.',
      'FALTANTE INVENT.',
      'MERMAS',
      'TRANSPORTE',
      'VENCIMIENTO'
    ];
  }
  
  const isMonth = Boolean(findColumnBySemantic([normalizedHeader], 'mes', customAliases)) || /^(mm|mes)$/i.test(normalizedHeader);
  if (isMonth) {
    return ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  }
  
  const isYear = Boolean(findColumnBySemantic([normalizedHeader], 'anio', customAliases)) || /^(yyyy|año|anio|year)$/i.test(normalizedHeader);
  if (isYear) {
    const currentYr = new Date().getFullYear();
    const years: string[] = [];
    for (let y = currentYr - 1; y <= currentYr + 7; y++) {
      years.push(String(y));
    }
    return years;
  }
  
  if (existingItems && existingItems.length > 0) {
    const uniqueValues = new Set<string>();
    existingItems.forEach(item => {
      const val = item[normalizedHeader];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        String(val).split(',').map(s => s.trim()).filter(Boolean).forEach(p => uniqueValues.add(p));
      }
    });
    if (uniqueValues.size > 0 && uniqueValues.size <= 50) {
      return Array.from(uniqueValues).sort();
    }
  }
  
  return [];
}

export function getColumnEnumOptionItems(
  header: string,
  sheetConfig?: SheetConfig | null,
  activeSheetTitle?: string,
  customAliases?: Record<string, string[]>,
  existingItems?: InventoryItem[]
): { label: string; value: string }[] {
  const values = getColumnEnumValues(header, sheetConfig, activeSheetTitle, customAliases, existingItems);
  return values.map(v => ({ label: v, value: v }));
}
