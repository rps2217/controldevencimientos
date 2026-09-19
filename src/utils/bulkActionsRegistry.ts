import { 
  Printer, 
  Barcode,
  Mail, 
  MessageSquare, 
  Download, 
  Flame, 
  Edit2, 
  Trash2,
  LucideIcon 
} from 'lucide-react';
import { SheetConfig } from '../types';
import { findPhoneColumn, findEmailColumn, findColumnBySemantic } from './columnAliases';

export type BulkActionId = 
  | 'ticket' 
  | 'barcode_ticket'
  | 'gmail' 
  | 'whatsapp' 
  | 'excel' 
  | 'pm_report' 
  | 'bulk_edit' 
  | 'delete' 
  | string;

export type BulkActionCategory = 'communication' | 'export' | 'operations' | 'general' | 'danger';

export interface BulkActionContext {
  activeView: string;
  activeSheetTitle: string;
  tableKey: string;
  headers: string[];
  hasPhoneColumn: boolean;
  hasEmailColumn: boolean;
  hasDateColumn: boolean;
}

export interface BulkActionDefinition {
  id: BulkActionId;
  label: string;
  shortLabel: string;
  description: string;
  category: BulkActionCategory;
  icon: LucideIcon;
  buttonClass: string;
  iconClass: string;
  defaultEnabled: boolean | ((ctx: BulkActionContext) => boolean);
  getContextualReason: (ctx: BulkActionContext) => string;
}

/**
 * Central registry of all bulk actions in the application.
 * New bulk actions can be registered here to automatically gain
 * contextual scoping and per-table customization.
 */
export const ALL_BULK_ACTIONS: BulkActionDefinition[] = [
  {
    id: 'ticket',
    label: 'Imprimir Ticket',
    shortLabel: 'Ticket',
    description: 'Impresión térmica para rotulado de inventario y lotes',
    category: 'general',
    icon: Printer,
    buttonClass: 'text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5',
    iconClass: 'w-3.5 h-3.5 text-indigo-400',
    defaultEnabled: true,
    getContextualReason: () => 'Impresión de etiquetas térmicas de inventario'
  },
  {
    id: 'barcode_ticket',
    label: 'Imprimir Códigos de Barras',
    shortLabel: 'Código Barras',
    description: 'Imprime el SKU como código de barras 1D (Code128) en formato ticket térmico',
    category: 'operations',
    icon: Barcode,
    buttonClass: 'text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 shadow-sm',
    iconClass: 'w-3.5 h-3.5 text-indigo-300',
    defaultEnabled: (ctx) => {
      // Enabled by default if SKU or code column is detected, or for main/products/events views
      const hasSku = ctx.headers.some(h => findColumnBySemantic([h], 'sku') !== undefined);
      return hasSku || ['main', 'products', 'events'].includes(ctx.activeView);
    },
    getContextualReason: (ctx) => {
      const hasSku = ctx.headers.some(h => findColumnBySemantic([h], 'sku') !== undefined);
      if (hasSku) return 'Detectada columna de SKU/Código en la tabla para generar código de barras';
      return 'Generador de etiquetas térmicas con código de barras 1D (Code128)';
    }
  },
  {
    id: 'gmail',
    label: 'Borrador Gmail',
    shortLabel: 'Gmail',
    description: 'Crea un borrador en Gmail con la tabla formateada en HTML',
    category: 'communication',
    icon: Mail,
    buttonClass: 'text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 bg-red-600/40 text-red-200 border border-red-500/40 shadow-sm',
    iconClass: 'w-3.5 h-3.5 text-red-400',
    defaultEnabled: true,
    getContextualReason: (ctx) => ctx.hasEmailColumn ? 'Detectada columna de email en la tabla' : 'Generador de comunicación formal vía correo'
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Web',
    shortLabel: 'WhatsApp',
    description: 'Envía mensajes vía WhatsApp Web a los teléfonos de la tabla',
    category: 'communication',
    icon: MessageSquare,
    buttonClass: 'text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 bg-emerald-600/40 text-emerald-200 border border-emerald-500/40 shadow-sm',
    iconClass: 'w-3.5 h-3.5 text-emerald-400',
    // Smart Contextual Rule: only active if table has phone columns or is explicitly a contacts table
    defaultEnabled: (ctx) => {
      if (ctx.hasPhoneColumn) return true;
      const t = ctx.tableKey.toLowerCase();
      return /contacto|cliente|proveedor|personal|directorio|telefono|fono|wsp|whatsapp/i.test(t);
    },
    getContextualReason: (ctx) => {
      if (ctx.hasPhoneColumn) return 'Detectada columna telefónica válida en la tabla';
      const t = ctx.tableKey.toLowerCase();
      if (/contacto|cliente|proveedor/i.test(t)) return 'Tabla identificada como directorio de contactos';
      return 'Sin columna telefónica detectada (oculta para evitar ruido visual)';
    }
  },
  {
    id: 'excel',
    label: 'Exportar a Excel',
    shortLabel: 'Excel',
    description: 'Descarga un archivo .xlsx con columnas visibles y virtuales',
    category: 'export',
    icon: Download,
    buttonClass: 'text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5',
    iconClass: 'w-3.5 h-3.5 text-blue-400',
    defaultEnabled: true,
    getContextualReason: () => 'Exportación general de datos a planilla Excel'
  },
  {
    id: 'pm_report',
    label: 'Acción PM',
    shortLabel: 'Acción PM',
    description: 'Radar de vencimientos y drenaje para jefaturas de producto',
    category: 'operations',
    icon: Flame,
    buttonClass: 'text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 bg-orange-600/30 text-orange-200 border border-orange-500/30',
    iconClass: 'w-3.5 h-3.5 text-orange-400',
    defaultEnabled: (ctx) => {
      if (ctx.activeView === 'main') return true;
      const t = ctx.tableKey.toLowerCase();
      return /vencimiento|caducidad|radar|drenaje/i.test(t);
    },
    getContextualReason: (ctx) => {
      if (ctx.activeView === 'main' || /vencimiento/i.test(ctx.tableKey)) {
        return 'Tabla principal de vencimientos y productos en drenaje';
      }
      return 'Solo aplica a tablas con fechas de caducidad y políticas de retiro';
    }
  },
  {
    id: 'bulk_edit',
    label: 'Edición Masiva FRC',
    shortLabel: 'Edición FRC',
    description: 'Actualización en lote de resoluciones y números de traspaso',
    category: 'operations',
    icon: Edit2,
    buttonClass: 'text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 bg-blue-600/40 text-blue-200 border border-blue-500/40',
    iconClass: 'w-3.5 h-3.5 text-blue-400',
    defaultEnabled: (ctx) => {
      if (ctx.activeView === 'events') return true;
      const t = ctx.tableKey.toLowerCase();
      return /evento|incidencia|frc|averia|merma|diferencia|transporte/i.test(t);
    },
    getContextualReason: (ctx) => {
      if (ctx.activeView === 'events' || /evento|frc/i.test(ctx.tableKey)) {
        return 'Gestión de incidencias y estado de resolución de traspasos';
      }
      return 'Solo aplica a tablas de eventos o incidencias FRC';
    }
  },
  {
    id: 'delete',
    label: 'Eliminar',
    shortLabel: 'Eliminar',
    description: 'Elimina de forma permanente las filas seleccionadas',
    category: 'danger',
    icon: Trash2,
    buttonClass: 'text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 bg-rose-600/40 text-rose-200 border border-rose-500/40 hover:bg-rose-600/60',
    iconClass: 'w-3.5 h-3.5 text-rose-400',
    defaultEnabled: true,
    getContextualReason: () => 'Eliminación permanente de filas'
  }
];

/**
 * Builds standard context for evaluating bulk actions
 */
export function buildBulkActionContext(
  headers: string[],
  activeView: string,
  activeSheetTitle?: string
): BulkActionContext {
  const tableKey = activeSheetTitle || activeView;
  const hasPhone = !!findPhoneColumn(headers);
  const hasEmail = !!findEmailColumn(headers);
  const hasDate = headers.some(h => /fecha|date|vto|venc|retiro/i.test(h));

  return {
    activeView,
    activeSheetTitle: activeSheetTitle || activeView,
    tableKey,
    headers,
    hasPhoneColumn: hasPhone,
    hasEmailColumn: hasEmail,
    hasDateColumn: hasDate
  };
}

/**
 * Evaluates whether a bulk action should be enabled for a given table
 */
export function isActionEnabledForTable(
  actionId: BulkActionId,
  context: BulkActionContext,
  sheetConfig?: SheetConfig
): boolean {
  const tableKey = context.tableKey;
  const tableSettings = sheetConfig?.tableBulkActions?.[tableKey];

  // 1. Explicit user exclusion takes highest precedence
  if (tableSettings?.disabled && tableSettings.disabled.includes(actionId)) {
    return false;
  }

  // 2. Explicit user inclusion takes second precedence
  if (tableSettings?.enabled && tableSettings.enabled.includes(actionId)) {
    return true;
  }

  // 3. Fallback to smart contextual default rule
  const actionDef = ALL_BULK_ACTIONS.find(a => a.id === actionId);
  if (!actionDef) return false;

  if (typeof actionDef.defaultEnabled === 'function') {
    return actionDef.defaultEnabled(context);
  }

  return Boolean(actionDef.defaultEnabled);
}

/**
 * Returns current override status for UI switches: 'auto' | 'enabled' | 'disabled'
 */
export function getActionOverrideStatus(
  actionId: BulkActionId,
  tableKey: string,
  sheetConfig?: SheetConfig
): 'auto' | 'enabled' | 'disabled' {
  const tableSettings = sheetConfig?.tableBulkActions?.[tableKey];
  if (tableSettings?.disabled?.includes(actionId)) return 'disabled';
  if (tableSettings?.enabled?.includes(actionId)) return 'enabled';
  return 'auto';
}

/**
 * Immutably updates the bulk actions configuration for a given table
 */
export function setTableActionOverride(
  currentConfig: SheetConfig,
  tableKey: string,
  actionId: BulkActionId,
  override: 'auto' | 'enabled' | 'disabled'
): SheetConfig {
  const currentTableBulk = currentConfig.tableBulkActions || {};
  const currentSetting = currentTableBulk[tableKey] || { enabled: [], disabled: [] };

  const currentEnabled = (currentSetting.enabled || []).filter(id => id !== actionId);
  const currentDisabled = (currentSetting.disabled || []).filter(id => id !== actionId);

  if (override === 'enabled') {
    currentEnabled.push(actionId);
  } else if (override === 'disabled') {
    currentDisabled.push(actionId);
  }

  const updatedTableBulk = {
    ...currentTableBulk,
    [tableKey]: {
      enabled: currentEnabled,
      disabled: currentDisabled
    }
  };

  return {
    ...currentConfig,
    tableBulkActions: updatedTableBulk
  };
}

/**
 * Resets table overrides to automatic defaults
 */
export function resetTableBulkActionsToAuto(
  currentConfig: SheetConfig,
  tableKey: string
): SheetConfig {
  const currentTableBulk = { ...(currentConfig.tableBulkActions || {}) };
  delete currentTableBulk[tableKey];

  return {
    ...currentConfig,
    tableBulkActions: currentTableBulk
  };
}
