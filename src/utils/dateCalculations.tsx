import React from 'react';
import { 
  Truck, FileSpreadsheet, PackageX, RotateCcw, Clock, AlertCircle, AlertTriangle, Clock3, Flame, CheckCircle2, Tag, ArrowLeftRight, Trash2
} from 'lucide-react';
import { InventoryItem, EventCategory, EventTypeDefinition, EventResolutionStatus } from '../types';
import { 
  getCategoryFromEventValue,
  parseAnyDate,
  formatInputDate,
  formatInputDateTime,
  formatDisplayDate,
  parseLocaleNumber,
  formatLocaleNumber,
  getEventCategory,
  getEndOfMonthDate,
  getExpiryDateFromYm,
  computeItemRawStatus,
  getItemResolutionStatus,
  calculateWithdrawalDate,
  getEventReason,
  detectPolicyActionType,
  createColumnsContext,
  CalculationColumnsContext,
  ItemStatusCode,
  ItemActionType
} from './pureCalculations';

// Re-export pure calculation functions to keep existing consumers intact
export {
  getCategoryFromEventValue,
  parseAnyDate,
  formatInputDate,
  formatInputDateTime,
  formatDisplayDate,
  parseLocaleNumber,
  formatLocaleNumber,
  getEventCategory,
  getEndOfMonthDate,
  getExpiryDateFromYm,
  computeItemRawStatus,
  getItemResolutionStatus,
  calculateWithdrawalDate,
  getEventReason,
  detectPolicyActionType,
  createColumnsContext
};
export type { CalculationColumnsContext };

export const EVENT_CATEGORIES: Record<EventCategory, EventTypeDefinition> = {
  VENCIMIENTO_CERCANO: {
    id: 'VENCIMIENTO_CERCANO',
    rawCode: 'VENC. CERC.',
    name: 'Vencimiento Cercano',
    shortLabel: 'Venc. Cercano',
    description: 'Control de lotes con vencimiento próximo para rotación',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/60',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    badgeBorder: 'border-indigo-200 dark:border-indigo-800',
    cardBorder: 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/30',
    cardBg: 'bg-indigo-600 text-white',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
  },
  TRANSPORTE: {
    id: 'TRANSPORTE',
    rawCode: 'DET. PED',
    name: 'Deterioro de Pedido',
    shortLabel: 'Det. Pedido',
    description: 'Embalaje dañado, golpe o deterioro físico durante transporte o recepción',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
    badgeText: 'text-amber-800 dark:text-amber-300',
    badgeBorder: 'border-amber-200 dark:border-amber-800',
    cardBorder: 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/50 dark:bg-amber-950/30',
    cardBg: 'bg-amber-600 text-white',
    iconBg: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
  },
  CAL_INTERNA: {
    id: 'CAL_INTERNA',
    rawCode: 'CAL. INTER',
    name: 'Calidad Interna',
    shortLabel: 'Cal. Interna',
    description: 'Incidencia o no conformidad detectada en control de calidad interno',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    badgeBorder: 'border-emerald-200 dark:border-emerald-800',
    cardBorder: 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/30',
    cardBg: 'bg-emerald-600 text-white',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
  },
  CAL_EXTERNA: {
    id: 'CAL_EXTERNA',
    rawCode: 'CAL. EXT.',
    name: 'Calidad Externa',
    shortLabel: 'Cal. Externa',
    description: 'Incidencia o no conformidad reportada por cliente o proveedor',
    badgeBg: 'bg-teal-50 dark:bg-teal-950/60',
    badgeText: 'text-teal-800 dark:text-teal-300',
    badgeBorder: 'border-teal-200 dark:border-teal-800',
    cardBorder: 'border-teal-500 ring-2 ring-teal-500/20 bg-teal-50/50 dark:bg-teal-950/30',
    cardBg: 'bg-teal-600 text-white',
    iconBg: 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300'
  },
  CANJES: {
    id: 'CANJES',
    rawCode: 'CANJES',
    name: 'Canjes',
    shortLabel: 'Canjes',
    description: 'Gestión y control de canjes comerciales de productos',
    badgeBg: 'bg-pink-50 dark:bg-pink-950/60',
    badgeText: 'text-pink-700 dark:text-pink-300',
    badgeBorder: 'border-pink-200 dark:border-pink-800',
    cardBorder: 'border-pink-500 ring-2 ring-pink-500/20 bg-pink-50/50 dark:bg-pink-950/30',
    cardBg: 'bg-pink-600 text-white',
    iconBg: 'bg-pink-100 dark:bg-pink-900/60 text-pink-700 dark:text-pink-300'
  },
  DIFERENCIA: {
    id: 'DIFERENCIA',
    rawCode: 'DIF. PED',
    name: 'Diferencia de Pedido',
    shortLabel: 'Dif. Pedido',
    description: 'Inconsistencia de unidades recibidas vs factura o guía (faltante / sobrante / trocado)',
    badgeBg: 'bg-purple-50 dark:bg-purple-950/60',
    badgeText: 'text-purple-800 dark:text-purple-300',
    badgeBorder: 'border-purple-200 dark:border-purple-800',
    cardBorder: 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/50 dark:bg-purple-950/30',
    cardBg: 'bg-purple-600 text-white',
    iconBg: 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300'
  },
  VENCIMIENTO: {
    id: 'VENCIMIENTO',
    rawCode: 'VENCIMIENTO',
    name: 'Vencimiento Regular',
    shortLabel: 'Vencimiento',
    description: 'Control de caducidad, fecha de retiro preventivo y radar comercial para PM',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/60',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'border-blue-200 dark:border-blue-800',
    cardBorder: 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/50 dark:bg-blue-950/30',
    cardBg: 'bg-blue-600 text-white',
    iconBg: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
  },
  AVERIA: {
    id: 'AVERIA',
    rawCode: 'AVERIA',
    name: 'Avería / Merma Almacén',
    shortLabel: 'Avería Almacén',
    description: 'Derrame, caída accidental o rotura interna de producto en bodega',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/60',
    badgeText: 'text-rose-800 dark:text-rose-300',
    badgeBorder: 'border-rose-200 dark:border-rose-800',
    cardBorder: 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/50 dark:bg-rose-950/30',
    cardBg: 'bg-rose-600 text-white',
    iconBg: 'bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300'
  },
  DEVOLUCION: {
    id: 'DEVOLUCION',
    rawCode: 'DEVOLUCION',
    name: 'Reclamo / Devolución',
    shortLabel: 'Devolución Proveedor',
    description: 'Producto no conforme retenido para gestión de canje o nota de crédito',
    badgeBg: 'bg-teal-50 dark:bg-teal-950/60',
    badgeText: 'text-teal-800 dark:text-teal-300',
    badgeBorder: 'border-teal-200 dark:border-teal-800',
    cardBorder: 'border-teal-500 ring-2 ring-teal-500/20 bg-teal-50/50 dark:bg-teal-950/30',
    cardBg: 'bg-teal-600 text-white',
    iconBg: 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300'
  }
};

export function renderEventIcon(category: EventCategory, className = 'w-4 h-4') {
  switch (category) {
    case 'TRANSPORTE':
      return <Truck className={className} />;
    case 'DIFERENCIA':
      return <FileSpreadsheet className={className} />;
    case 'CAL_INTERNA':
    case 'CAL_EXTERNA':
      return <CheckCircle2 className={className} />;
    case 'AVERIA':
      return <PackageX className={className} />;
    case 'DEVOLUCION':
      return <RotateCcw className={className} />;
    case 'VENCIMIENTO_CERCANO':
      return <Clock3 className={className} />;
    case 'CANJES':
      return <Tag className={className} />;
    case 'VENCIMIENTO':
    default:
      return <Clock className={className} />;
  }
}

export interface ItemStatusResult {
  code: ItemStatusCode;
  actionType: ItemActionType;
  label: string;
  actionLabel: string;
  actionColor: string;
  color: string;
  icon: React.ReactNode;
  actionIcon: React.ReactNode;
  daysToRetire: number | null;
  daysToExpiry: number | null;
}

// Helper to compute expiration, retirement and drainage status for an item with React UI components
export function getItemStatus(item: InventoryItem, headers: string[], colContext?: CalculationColumnsContext): ItemStatusResult {
  const { code, actionType, daysToRetire, daysToExpiry } = computeItemRawStatus(item, headers, colContext);

  let label = 'En Tiempo';
  let color = 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  let icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;

  let actionLabel = 'En Regla';
  let actionColor = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  let actionIcon = <CheckCircle2 className="w-3 h-3 text-emerald-600" />;

  if (actionType === 'CANJE_PROVEEDOR') {
    actionLabel = 'Canje Proveedor';
    actionColor = 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 font-bold';
    actionIcon = <ArrowLeftRight className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />;
  } else if (actionType === 'MERMA_DIRECTA') {
    actionLabel = 'Merma Directa';
    actionColor = 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 font-bold';
    actionIcon = <Trash2 className="w-3 h-3 text-rose-600 dark:text-rose-400" />;
  } else if (actionType === 'VENTA_DRENAJE') {
    actionLabel = 'Drenaje PM';
    actionColor = 'bg-orange-50 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800 font-bold';
    actionIcon = <Flame className="w-3 h-3 text-orange-600 dark:text-orange-400" />;
  }

  if (code === 'EXPIRED') {
    label = actionType === 'CANJE_PROVEEDOR' ? 'Vencido (Canje)' : 'Vencido (Merma)';
    color = actionType === 'CANJE_PROVEEDOR'
      ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-800 font-bold'
      : 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/80 font-bold';
    icon = actionType === 'CANJE_PROVEEDOR'
      ? <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
      : <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
  } else if (code === 'RETIRE_NOW') {
    label = actionType === 'CANJE_PROVEEDOR' ? 'Retiro Canje Hoy' : 'Retiro Inmediato';
    color = actionType === 'CANJE_PROVEEDOR'
      ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-800 font-bold'
      : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800 font-bold';
    icon = actionType === 'CANJE_PROVEEDOR'
      ? <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
      : <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
  } else if (code === 'UPCOMING') {
    label = actionType === 'CANJE_PROVEEDOR' ? `Próx. Canje (${daysToRetire}d)` : `Próx. Retiro (${daysToRetire}d)`;
    color = 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800/80 font-semibold';
    icon = <Clock3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
  } else if (code === 'DRAINAGE_PM') {
    label = `Alerta Drenaje PM (${daysToRetire}d)`;
    color = 'bg-orange-100 dark:bg-orange-950/70 text-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-800/80 font-semibold';
    icon = <Flame className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />;
  }

  return { 
    code, 
    actionType, 
    label, 
    actionLabel, 
    actionColor, 
    color, 
    icon, 
    actionIcon, 
    daysToRetire, 
    daysToExpiry 
  };
}
