import React from 'react';
import { 
  Flame, 
  AlertTriangle, 
  Truck, 
  Ban, 
  Clock, 
  CheckCircle, 
  ShieldAlert, 
  Tag, 
  Sparkles,
  Info,
  Package,
  Layers,
  ArrowRight,
  TrendingDown
} from 'lucide-react';
import { InventoryItem, FormatRule, FormatRuleCondition, FormatRuleOperator, SheetConfig } from '../types';
import { findColumnBySemantic } from './columnAliases';
import { getItemStatus, parseAnyDate } from './dateCalculations';
import { STORAGE_KEYS, readStorage, writeStorage } from './appStorage';
import { z } from 'zod';

export const AVAILABLE_FORMAT_RULE_ICONS = [
  { id: 'Flame', label: 'Fuego (Crítico)', Icon: Flame },
  { id: 'AlertTriangle', label: 'Alerta (Atención)', Icon: AlertTriangle },
  { id: 'Truck', label: 'Camión (Canje / Transporte)', Icon: Truck },
  { id: 'Ban', label: 'Bloqueo / Merma', Icon: Ban },
  { id: 'Clock', label: 'Reloj (Pendiente)', Icon: Clock },
  { id: 'CheckCircle', label: 'Completado / En Regla', Icon: CheckCircle },
  { id: 'ShieldAlert', label: 'Seguridad / Cuarentena', Icon: ShieldAlert },
  { id: 'Tag', label: 'Etiqueta / SKU', Icon: Tag },
  { id: 'TrendingDown', label: 'Baja / Descuento', Icon: TrendingDown },
  { id: 'Sparkles', label: 'Destacado Especial', Icon: Sparkles }
] as const;

export const DEFAULT_BUILT_IN_FORMAT_RULES: FormatRule[] = [
  {
    id: 'rule_builtin_expired',
    name: '⚠️ Vencido (Días ≤ 0)',
    enabled: true,
    tableKey: '*',
    columns: ['_row'],
    condition: {
      column: 'DIAS_PARA_VENCER',
      operator: 'less_equal',
      value: '0'
    },
    textColor: '#ef4444',
    bold: true,
    icon: 'AlertTriangle',
    badge: true,
    priority: 1
  },
  {
    id: 'rule_builtin_critical_15',
    name: '🔥 Vencimiento Crítico (Días ≤ 15)',
    enabled: true,
    tableKey: '*',
    columns: ['_row'],
    condition: {
      column: 'DIAS_PARA_VENCER',
      operator: 'less_equal',
      value: '15'
    },
    textColor: '#f59e0b',
    bold: true,
    icon: 'Flame',
    badge: true,
    priority: 2
  },
  {
    id: 'rule_builtin_canje',
    name: '🔄 Política de Canje con Proveedor',
    enabled: true,
    tableKey: '*',
    columns: ['POLITICA'],
    condition: {
      column: 'POLITICA',
      operator: 'contains',
      value: 'Canje'
    },
    textColor: '#3b82f6',
    bold: false,
    icon: 'Truck',
    badge: false,
    priority: 3
  },
  {
    id: 'rule_builtin_merma',
    name: '🗑️ Merma Directa (Sin Canje)',
    enabled: true,
    tableKey: '*',
    columns: ['POLITICA'],
    condition: {
      column: 'POLITICA',
      operator: 'contains',
      value: 'Merma'
    },
    textColor: '#ef4444',
    bold: false,
    icon: 'Ban',
    badge: false,
    priority: 4
  },
  {
    id: 'rule_builtin_pending_event',
    name: '⏳ Incidencia Pendiente de Gestión',
    enabled: true,
    tableKey: 'events',
    columns: ['ESTADO'],
    condition: {
      column: 'ESTADO',
      operator: 'contains',
      value: 'Pendiente'
    },
    textColor: '#f59e0b',
    bold: false,
    icon: 'Clock',
    badge: false,
    priority: 5
  }
];

const formatRulesSchema = z.array(z.any());

/**
 * Carga las reglas de formato persistidas, fusionando con SheetConfig y fallback a defaults.
 */
export function getStoredFormatRules(sheetConfigRules?: FormatRule[]): FormatRule[] {
  let loadedRules: FormatRule[] | null = null;
  if (sheetConfigRules && Array.isArray(sheetConfigRules) && sheetConfigRules.length > 0) {
    loadedRules = sheetConfigRules;
  } else {
    const fromStorage = readStorage<FormatRule[]>(STORAGE_KEYS.FORMAT_RULES, formatRulesSchema, null as any);
    if (fromStorage && Array.isArray(fromStorage) && fromStorage.length > 0) {
      loadedRules = fromStorage;
    }
  }

  const baseRules = (loadedRules && loadedRules.length > 0) ? loadedRules : DEFAULT_BUILT_IN_FORMAT_RULES;

  // Sanitizar reglas existentes para que no tengan background en _row que rompa los temas oscuros
  return baseRules.map(r => {
    if (r.id === 'rule_builtin_canje' && (r.columns?.includes('_row') || r.backgroundColor)) {
      return { ...r, columns: ['POLITICA'], backgroundColor: undefined };
    }
    if (r.id === 'rule_builtin_merma' && (r.columns?.includes('_row') || r.backgroundColor)) {
      return { ...r, columns: ['POLITICA'], backgroundColor: undefined };
    }
    if (r.id === 'rule_builtin_pending_event' && (r.columns?.includes('_row') || r.backgroundColor)) {
      return { ...r, columns: ['ESTADO'], backgroundColor: undefined };
    }
    if ((r.id === 'rule_builtin_expired' || r.id === 'rule_builtin_critical_15') && r.backgroundColor) {
      return { ...r, backgroundColor: undefined };
    }
    return r;
  });
}

/**
 * Persiste las reglas en localStorage.
 */
export function saveStoredFormatRules(rules: FormatRule[]): void {
  writeStorage(STORAGE_KEYS.FORMAT_RULES, rules);
}

/**
 * Renderiza el icono Lucide correspondiente al id de la regla de formato.
 */
export function renderFormatRuleIcon(iconId?: string, className = 'w-3.5 h-3.5'): React.ReactNode {
  if (!iconId) return null;
  const match = AVAILABLE_FORMAT_RULE_ICONS.find(i => i.id === iconId);
  if (!match) return null;
  const IconComponent = match.Icon;
  return React.createElement(IconComponent, { className });
}

/**
 * Evalúa si una fila cumple con la condición declarativa de una regla.
 */
export function matchFormatRuleCondition(
  item: InventoryItem,
  headers: string[],
  condition: FormatRuleCondition,
  customAliases?: Record<string, string[]>
): boolean {
  if (!condition || !condition.column) return false;

  const targetCol = condition.column.trim().toUpperCase();
  let resolvedVal: any = undefined;

  // 1. Detección semántica de columnas calculadas o dinámicas
  if (targetCol === 'DIAS_PARA_VENCER' || targetCol === 'DIAS_VENCIMIENTO') {
    const status = getItemStatus(item, headers);
    resolvedVal = status.daysToExpiry ?? status.daysToRetire ?? 999;
  } else if (targetCol === 'ESTADO' || targetCol === 'STATUS') {
    const status = getItemStatus(item, headers);
    resolvedVal = status.label;
  } else if (targetCol === 'POLITICA' || targetCol === 'POLICY') {
    const polCol = findColumnBySemantic(headers, 'politica', customAliases);
    resolvedVal = polCol && item[polCol] ? item[polCol] : (item.POLITICA || item.politica || '');
  } else if (targetCol === 'CANTIDAD' || targetCol === 'STOCK') {
    const qtyCol = findColumnBySemantic(headers, 'cantidad', customAliases);
    resolvedVal = qtyCol && item[qtyCol] !== undefined ? item[qtyCol] : (item.CANTIDAD || item.cantidad || 0);
  } else {
    // 2. Columna literal o alias
    if (item[condition.column] !== undefined) {
      resolvedVal = item[condition.column];
    } else {
      const matchHeader = headers.find(h => h.trim().toLowerCase() === condition.column.trim().toLowerCase());
      if (matchHeader && item[matchHeader] !== undefined) {
        resolvedVal = item[matchHeader];
      }
    }
  }

  const rawExpected = (condition.value ?? '').trim();
  const operator: FormatRuleOperator = condition.operator || 'equals';

  // Manejo de valores vacíos
  if (operator === 'is_empty') {
    return resolvedVal === undefined || resolvedVal === null || String(resolvedVal).trim() === '';
  }
  if (operator === 'is_not_empty') {
    return resolvedVal !== undefined && resolvedVal !== null && String(resolvedVal).trim() !== '';
  }

  if (resolvedVal === undefined || resolvedVal === null) {
    return false;
  }

  // Comparaciones numéricas si ambos lados son convertibles
  const numActual = typeof resolvedVal === 'number' ? resolvedVal : parseFloat(String(resolvedVal).replace(/,/g, '.'));
  const numExpected = parseFloat(rawExpected.replace(/,/g, '.'));
  const isNumericComp = !isNaN(numActual) && !isNaN(numExpected);

  switch (operator) {
    case 'equals':
      if (isNumericComp) return numActual === numExpected;
      return String(resolvedVal).trim().toLowerCase() === rawExpected.toLowerCase();

    case 'not_equals':
      if (isNumericComp) return numActual !== numExpected;
      return String(resolvedVal).trim().toLowerCase() !== rawExpected.toLowerCase();

    case 'contains':
      return String(resolvedVal).toLowerCase().includes(rawExpected.toLowerCase());

    case 'not_contains':
      return !String(resolvedVal).toLowerCase().includes(rawExpected.toLowerCase());

    case 'greater_than':
      if (isNumericComp) return numActual > numExpected;
      return String(resolvedVal).localeCompare(rawExpected) > 0;

    case 'greater_equal':
      if (isNumericComp) return numActual >= numExpected;
      return String(resolvedVal).localeCompare(rawExpected) >= 0;

    case 'less_than':
      if (isNumericComp) return numActual < numExpected;
      return String(resolvedVal).localeCompare(rawExpected) < 0;

    case 'less_equal':
      if (isNumericComp) return numActual <= numExpected;
      return String(resolvedVal).localeCompare(rawExpected) <= 0;

    default:
      return false;
  }
}

export interface AppliedFormatStyle {
  textColor?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  icon?: string;
  badge?: boolean;
  ruleName?: string;
}

export interface EvaluatedFormatResult {
  hasMatches: boolean;
  matchingRules: FormatRule[];
  rowStyle?: AppliedFormatStyle;
  columnStyles: Record<string, AppliedFormatStyle>;
}

/**
 * Evalúa todas las reglas activas sobre un ítem en una sola pasada.
 */
export function evaluateItemFormatRules(
  item: InventoryItem,
  headers: string[],
  rules: FormatRule[],
  currentTableKey: string,
  customAliases?: Record<string, string[]>
): EvaluatedFormatResult {
  const result: EvaluatedFormatResult = {
    hasMatches: false,
    matchingRules: [],
    columnStyles: {}
  };

  if (!rules || rules.length === 0 || !item) {
    return result;
  }

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Verificar ámbito de tabla
    if (rule.tableKey && rule.tableKey !== '*' && rule.tableKey !== currentTableKey) {
      continue;
    }

    const matches = matchFormatRuleCondition(item, headers, rule.condition, customAliases);
    if (!matches) continue;

    result.hasMatches = true;
    result.matchingRules.push(rule);

    const style: AppliedFormatStyle = {
      textColor: rule.textColor,
      backgroundColor: rule.backgroundColor,
      bold: rule.bold,
      italic: rule.italic,
      icon: rule.icon,
      badge: rule.badge,
      ruleName: rule.name
    };

    // Si aplica a toda la fila o columns incluye '_row'
    if (!rule.columns || rule.columns.length === 0 || rule.columns.includes('_row')) {
      if (!result.rowStyle) {
        result.rowStyle = style;
      }
    }

    // Si aplica a columnas específicas
    if (rule.columns && rule.columns.length > 0) {
      for (const col of rule.columns) {
        if (col !== '_row' && !result.columnStyles[col]) {
          result.columnStyles[col] = style;
        }
      }
    }
  }

  return result;
}
