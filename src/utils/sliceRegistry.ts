import { TableSlice, InventoryItem, EventCategory } from '../types';
import { getItemStatus, getEventCategory, getItemResolutionStatus } from './dateCalculations';
import { findColumnBySemantic } from './columnAliases';

export const BUILT_IN_SLICES: TableSlice[] = [
  // 1. Radar de Vencimientos (main)
  {
    id: 'builtin_main_retire_now',
    name: 'Retiro Inmediato',
    description: 'Lotes vencidos o que requieren retiro urgente hoy según política',
    tableKey: 'main',
    icon: 'AlertTriangle',
    color: 'rose',
    isBuiltIn: true,
    filterConfig: {
      pmRadarFilter: ['retire_now']
    }
  },
  {
    id: 'builtin_main_canje_proveedor',
    name: 'Canje Proveedor',
    description: 'Lotes vencidos o próximos con política de cambio/devolución acordada',
    tableKey: 'main',
    icon: 'ArrowLeftRight',
    color: 'indigo',
    isBuiltIn: true,
    filterConfig: {
      pmRadarFilter: ['canje_proveedor']
    }
  },
  {
    id: 'builtin_main_merma_directa',
    name: 'Merma Directa',
    description: 'Lotes vencidos o sin política de canje que pasan a baja directa',
    tableKey: 'main',
    icon: 'Trash2',
    color: 'rose',
    isBuiltIn: true,
    filterConfig: {
      pmRadarFilter: ['merma_directa']
    }
  },
  {
    id: 'builtin_main_drainage_pm',
    name: 'Radar PM (Drenaje)',
    description: 'Lotes en ventana de acción comercial para jefatura de Producto',
    tableKey: 'main',
    icon: 'Flame',
    color: 'amber',
    isBuiltIn: true,
    filterConfig: {
      pmRadarFilter: ['drainage']
    }
  },
  {
    id: 'builtin_main_upcoming',
    name: 'Próximos a Vencer',
    description: 'Lotes dentro del margen de 30 días previos a la fecha de retiro',
    tableKey: 'main',
    icon: 'Clock',
    color: 'indigo',
    isBuiltIn: true,
    filterConfig: {
      pmRadarFilter: ['upcoming']
    }
  },
  {
    id: 'builtin_main_en_regla',
    name: 'Inventario en Regla',
    description: 'Lotes con vigencia óptima y sin riesgo de retiro inmediato',
    tableKey: 'main',
    icon: 'CheckCircle2',
    color: 'emerald',
    isBuiltIn: true,
    filterConfig: {
      pmRadarFilter: ['en_regla']
    }
  },

  // 2. Registro de Incidencias & FRC (events)
  {
    id: 'builtin_events_pendientes',
    name: 'Traspasos Pendientes',
    description: 'Incidencias registradas que aún no cuentan con folio TR generado',
    tableKey: 'events',
    icon: 'Clock',
    color: 'amber',
    isBuiltIn: true,
    filterConfig: {
      eventResolutionFilter: ['pending']
    }
  },
  {
    id: 'builtin_events_transporte',
    name: 'Transporte & Chofer',
    description: 'Averías, daños en estiba o novedades durante traslado',
    tableKey: 'events',
    icon: 'Truck',
    color: 'blue',
    isBuiltIn: true,
    filterConfig: {
      eventFilter: ['TRANSPORTE']
    }
  },
  {
    id: 'builtin_events_diferencias',
    name: 'Diferencias Stock',
    description: 'Faltantes y sobrantes de recepción contra factura física',
    tableKey: 'events',
    icon: 'Scale',
    color: 'purple',
    isBuiltIn: true,
    filterConfig: {
      eventFilter: ['DIFERENCIA']
    }
  },
  {
    id: 'builtin_events_averias',
    name: 'Mermas y Averías',
    description: 'Roturas, frascos quebrados o deterioros físicos en bodega',
    tableKey: 'events',
    icon: 'Flame',
    color: 'rose',
    isBuiltIn: true,
    filterConfig: {
      eventFilter: ['AVERIA']
    }
  },
  {
    id: 'builtin_events_canjes',
    name: 'Canjes y Devoluciones',
    description: 'Mercadería para devolución al proveedor o canje 1x1',
    tableKey: 'events',
    icon: 'RotateCcw',
    color: 'indigo',
    isBuiltIn: true,
    filterConfig: {
      eventFilter: ['CANJES', 'DEVOLUCION']
    }
  },
  {
    id: 'builtin_events_realizados',
    name: 'Regularizados',
    description: 'Incidencias con folio TR concluido o regularizadas en sistema',
    tableKey: 'events',
    icon: 'CheckCircle2',
    color: 'emerald',
    isBuiltIn: true,
    filterConfig: {
      eventResolutionFilter: ['completed']
    }
  }
];

const CUSTOM_SLICES_STORAGE_KEY = 'appsheet_custom_slices';
const HIDDEN_SLICES_STORAGE_KEY = 'appsheet_hidden_slice_ids';

export function loadCustomSlices(): TableSlice[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SLICES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Error loading custom slices from localStorage:', err);
    return [];
  }
}

export function saveCustomSlices(slices: TableSlice[]): void {
  try {
    localStorage.setItem(CUSTOM_SLICES_STORAGE_KEY, JSON.stringify(slices));
  } catch (err) {
    console.warn('Error saving custom slices to localStorage:', err);
  }
}

export function loadHiddenSliceIds(sheetConfigHidden?: string[]): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_SLICES_STORAGE_KEY);
    const localHidden: string[] = raw ? JSON.parse(raw) : [];
    const configHidden = Array.isArray(sheetConfigHidden) ? sheetConfigHidden : [];
    // Combine unique hidden IDs
    const combined = Array.from(new Set([...localHidden, ...configHidden]));
    return combined;
  } catch (err) {
    console.warn('Error loading hidden slice IDs:', err);
    return Array.isArray(sheetConfigHidden) ? sheetConfigHidden : [];
  }
}

export function saveHiddenSliceIds(hiddenIds: string[]): void {
  try {
    localStorage.setItem(HIDDEN_SLICES_STORAGE_KEY, JSON.stringify(hiddenIds));
  } catch (err) {
    console.warn('Error saving hidden slice IDs to localStorage:', err);
  }
}

export function getSlicesForTable(
  tableKey: string,
  customSlices: TableSlice[] = [],
  sheetConfigSlices?: TableSlice[]
): TableSlice[] {
  const builtIns = BUILT_IN_SLICES.filter(s => s.tableKey === tableKey);
  
  // Merge custom slices from localStorage and sheetConfig, avoiding duplicates by id
  const customMap = new Map<string, TableSlice>();
  
  if (Array.isArray(sheetConfigSlices)) {
    sheetConfigSlices.forEach(s => {
      if (s.tableKey === tableKey) customMap.set(s.id, s);
    });
  }

  customSlices.forEach(s => {
    if (s.tableKey === tableKey) customMap.set(s.id, s);
  });

  return [...builtIns, ...Array.from(customMap.values())];
}

export function getVisibleSlicesForTable(
  tableKey: string,
  customSlices: TableSlice[] = [],
  sheetConfigSlices?: TableSlice[],
  hiddenSliceIds: string[] = []
): TableSlice[] {
  const allSlices = getSlicesForTable(tableKey, customSlices, sheetConfigSlices);
  if (!hiddenSliceIds || hiddenSliceIds.length === 0) return allSlices;
  const hiddenSet = new Set(hiddenSliceIds);
  return allSlices.filter(slice => !hiddenSet.has(slice.id));
}

/**
 * Fast item evaluator: returns true if the given item matches all active filter criteria of a slice.
 */
export function itemMatchesSlice(
  item: InventoryItem,
  slice: TableSlice,
  headers: string[],
  frcBodCol?: string | null
): boolean {
  if (!slice || !item) return false;
  const filterConfig = slice.filterConfig || {};
  const tableKey = slice.tableKey;

  // View Category enforcement for 'main' and 'events'
  if (tableKey === 'main') {
    const cat = getEventCategory(item, headers);
    if (cat !== 'VENCIMIENTO' && cat !== 'VENCIMIENTO_CERCANO') {
      return false;
    }
  } else if (tableKey === 'events') {
    const cat = getEventCategory(item, headers);
    if (cat === 'VENCIMIENTO' || cat === 'VENCIMIENTO_CERCANO') {
      return false;
    }
  }

  // 1. Search term match
  if (filterConfig.searchTerm && filterConfig.searchTerm.trim() !== '') {
    const term = filterConfig.searchTerm.trim().toLowerCase();
    let matchesSearch = false;
    for (let i = 0; i < headers.length; i++) {
      const val = item[headers[i]];
      if (val !== undefined && val !== null && String(val).toLowerCase().includes(term)) {
        matchesSearch = true;
        break;
      }
    }
    if (!matchesSearch) return false;
  }

  // 2. Quick Chip match
  if (filterConfig.quickChip && filterConfig.quickChip.trim() !== '') {
    const chip = filterConfig.quickChip.trim().toLowerCase();
    let matchesChip = false;
    for (let i = 0; i < headers.length; i++) {
      const val = item[headers[i]];
      if (val !== undefined && val !== null && String(val).toLowerCase().includes(chip)) {
        matchesChip = true;
        break;
      }
    }
    if (!matchesChip) return false;
  }

  // 3. PM Radar Status match
  if (filterConfig.pmRadarFilter && filterConfig.pmRadarFilter.length > 0) {
    const st = getItemStatus(item, headers);
    const pmSet = new Set(filterConfig.pmRadarFilter);
    let matchesPm = false;
    if (pmSet.has('retire_now') && (st.code === 'RETIRE_NOW' || st.code === 'EXPIRED')) matchesPm = true;
    else if (pmSet.has('drainage') && st.code === 'DRAINAGE_PM') matchesPm = true;
    else if (pmSet.has('upcoming') && st.code === 'UPCOMING') matchesPm = true;
    else if (pmSet.has('en_regla') && st.code === 'NORMAL') matchesPm = true;
    else if (pmSet.has('canje_proveedor') && st.actionType === 'CANJE_PROVEEDOR') matchesPm = true;
    else if (pmSet.has('merma_directa') && st.actionType === 'MERMA_DIRECTA') matchesPm = true;
    if (!matchesPm) return false;
  }

  // 4. Event Category match
  if (filterConfig.eventFilter && filterConfig.eventFilter.length > 0) {
    const cat = getEventCategory(item, headers);
    if (!cat || !filterConfig.eventFilter.includes(cat)) {
      return false;
    }
  }

  // 5. Event Resolution / Traspaso Status match
  if (filterConfig.eventResolutionFilter && filterConfig.eventResolutionFilter.length > 0) {
    const res = getItemResolutionStatus(item, headers);
    const status = res.isResolved ? 'completed' : 'pending';
    if (!filterConfig.eventResolutionFilter.includes(status)) {
      return false;
    }
  }

  // 6. Bodega / FRC Bod filter match
  if (filterConfig.frcBodFilter && filterConfig.frcBodFilter.length > 0 && frcBodCol) {
    const val = item[frcBodCol];
    const valStr = val !== undefined && val !== null ? String(val).trim() : '';
    if (!filterConfig.frcBodFilter.includes(valStr)) {
      return false;
    }
  }

  // 7. Column filters match
  if (filterConfig.columnFilters && Object.keys(filterConfig.columnFilters).length > 0) {
    for (const [colName, allowedVals] of Object.entries(filterConfig.columnFilters)) {
      if (allowedVals && allowedVals.length > 0) {
        const rawVal = item[colName];
        const valStr = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
          ? String(rawVal).trim()
          : '(Vacío)';
        if (!allowedVals.includes(valStr)) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Computes the item count for each slice in a single pass over the dataset.
 */
export function computeSliceCounts(
  items: InventoryItem[],
  slices: TableSlice[],
  headers: string[],
  frcBodCol?: string | null
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(slices) || !Array.isArray(items)) return counts;

  for (let s = 0; s < slices.length; s++) {
    if (slices[s] && slices[s].id) {
      counts[slices[s].id] = 0;
    }
  }

  const itemsLen = items.length;
  const slicesLen = slices.length;

  for (let i = 0; i < itemsLen; i++) {
    const item = items[i];
    if (!item) continue;
    for (let s = 0; s < slicesLen; s++) {
      const slice = slices[s];
      if (slice && slice.id && itemMatchesSlice(item, slice, headers, frcBodCol)) {
        counts[slice.id] = (counts[slice.id] || 0) + 1;
      }
    }
  }

  return counts;
}

export const SLICE_COLOR_CLASSES: Record<string, {
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  ring: string;
  activeBg: string;
  activeText: string;
}> = {
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800',
    badgeBg: 'bg-rose-100 dark:bg-rose-900/60',
    badgeText: 'text-rose-800 dark:text-rose-200',
    ring: 'ring-rose-500/20 border-rose-500',
    activeBg: 'bg-rose-600',
    activeText: 'text-white'
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/60',
    badgeText: 'text-amber-800 dark:text-amber-200',
    ring: 'ring-amber-500/20 border-amber-500',
    activeBg: 'bg-amber-600',
    activeText: 'text-white'
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/60',
    badgeText: 'text-blue-800 dark:text-blue-200',
    ring: 'ring-blue-500/20 border-blue-500',
    activeBg: 'bg-blue-600',
    activeText: 'text-white'
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/60',
    badgeText: 'text-emerald-800 dark:text-emerald-200',
    ring: 'ring-emerald-500/20 border-emerald-500',
    activeBg: 'bg-emerald-600',
    activeText: 'text-white'
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/60',
    badgeText: 'text-purple-800 dark:text-purple-200',
    ring: 'ring-purple-500/20 border-purple-500',
    activeBg: 'bg-purple-600',
    activeText: 'text-white'
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800',
    badgeBg: 'bg-indigo-100 dark:bg-indigo-900/60',
    badgeText: 'text-indigo-800 dark:text-indigo-200',
    ring: 'ring-indigo-500/20 border-indigo-500',
    activeBg: 'bg-indigo-600',
    activeText: 'text-white'
  },
  slate: {
    bg: 'bg-slate-50 dark:bg-slate-800/80',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    badgeBg: 'bg-slate-100 dark:bg-slate-700',
    badgeText: 'text-slate-700 dark:text-slate-300',
    ring: 'ring-slate-400/20 border-slate-500',
    activeBg: 'bg-slate-800 dark:bg-slate-200',
    activeText: 'text-white dark:text-slate-900'
  }
};
