import { TableSlice, InventoryItem, TableCapability, TableCapabilitySetting, SheetConfig } from '../types';
import { getItemStatus, getEventCategory, getItemResolutionStatus } from './dateCalculations';
import { findColumnBySemantic, KnownFieldSemantic } from './columnAliases';

import { STORAGE_KEYS, readStorage, stringArraySchema, objectArraySchema } from '../utils/appStorage';

/**
 * Deduce las capacidades de dominio de una hoja a partir de sus encabezados.
 *
 * Misma idea que las bulk actions: manda la columna, no el nombre de la pestaña. Es
 * lo que permite que una hoja no canónica (otra bodega, otra sucursal) reciba los
 * slices de vencimiento si trae las columnas, y que una hoja de Clientes no reciba
 * ninguno.
 *
 * La precedencia vencimiento > incidencia es deliberada: `getEventCategory` asume
 * VENCIMIENTO por defecto, así que una hoja con fecha de vencimiento se trata como
 * tabla de vencimientos aunque además tenga columna de evento (es el caso de la
 * pestaña `main`, que trae FRC_EVEN). Sin esa precedencia, `main` heredaría los
 * slices de incidencias y cambiaría el comportamiento actual.
 */
export function detectTableCapabilities(
  headers: string[],
  customAliases?: Record<string, string[]>
): Set<TableCapability> {
  if (!Array.isArray(headers) || headers.length === 0) return new Set();
  const has = (semantic: KnownFieldSemantic) =>
    findColumnBySemantic(headers, semantic, customAliases) !== undefined;

  const caps = new Set<TableCapability>();

  // El conteo físico necesita identificar el SKU y cuantificar existencias: sin
  // ambas columnas el terminal no tiene nada que reconciliar (p. ej. una hoja de
  // Clientes con teléfono y email no debe ofrecerlo).
  if (has('sku') && has('cantidad')) caps.add('conteo');

  // La precedencia vencimiento > incidencia es deliberada: `getEventCategory` asume
  // VENCIMIENTO por defecto, así que una hoja con fecha de vencimiento se trata como
  // tabla de vencimientos aunque además tenga columna de evento (es el caso de la
  // pestaña `main`, que trae FRC_EVEN). Sin esa precedencia, `main` heredaría los
  // slices de incidencias y cambiaría el comportamiento actual.
  //
  // `catalogo` es la rama final: describir productos es lo que queda cuando la hoja
  // no tiene fechas ni registra eventos. Así una hoja ajena de catálogo (SKU +
  // descripción + proveedor) se detecta sin depender del nombre de la pestaña.
  if (has('fecha_vc') || has('fecha_retiro') || (has('mes') && has('anio'))) caps.add('vencimiento');
  else if (has('tipo_evento')) caps.add('incidencia');
  else if (has('sku') && has('descripcion')) caps.add('catalogo');

  return caps;
}

/**
 * Capacidades efectivas = detección por columnas + corrección manual del usuario.
 *
 * El automático es el valor por defecto (Ponytail: sin UI obligatoria, una hoja nueva
 * funciona sola). El override existe solo para el caso ambiguo que la detección no puede
 * resolver: una hoja con columna `Fecha` genérica que el usuario sí sabe que es de
 * vencimiento, o una hoja de vencimientos con datos sucios que no detecta nada.
 */
export function resolveTableCapabilities(
  headers: string[],
  customAliases?: Record<string, string[]>,
  override?: TableCapabilitySetting
): Set<TableCapability> {
  const caps = detectTableCapabilities(headers, customAliases);
  override?.enabled?.forEach(c => caps.add(c));
  override?.disabled?.forEach(c => caps.delete(c));
  return caps;
}

/** Todas las capacidades de dominio, con su etiqueta y explicación para la UI. */
export const ALL_TABLE_CAPABILITIES: { id: TableCapability; label: string; description: string }[] = [
  { id: 'vencimiento', label: 'Vencimientos y Retiro', description: 'Fechas de vencimiento, retiro preventivo, políticas comerciales y radar PM.' },
  { id: 'incidencia', label: 'Eventos e Incidencias', description: 'Registro FRC: transporte, diferencias, mermas, averías y calidad.' },
  { id: 'conteo', label: 'Conteo Físico y Cuadratura', description: 'Terminal de pistoleo y cuadratura. Requiere columna de SKU y de cantidad.' },
  { id: 'catalogo', label: 'Catálogo de Productos', description: 'Maestro de productos (SKU y descripción) sin fechas ni eventos. Alimenta la de-referenciación.' }
];

/**
 * Estado del override para la UI de 3 estados: 'auto' | 'enabled' | 'disabled'.
 */
export function getCapabilityOverrideStatus(
  capability: TableCapability,
  tableKey: string,
  sheetConfig?: SheetConfig
): 'auto' | 'enabled' | 'disabled' {
  const setting = sheetConfig?.tableCapabilities?.[tableKey];
  if (setting?.disabled?.includes(capability)) return 'disabled';
  if (setting?.enabled?.includes(capability)) return 'enabled';
  return 'auto';
}

/** Aplica una corrección manual de capacidad para una tabla, de forma inmutable. */
export function setTableCapabilityOverride(
  currentConfig: SheetConfig,
  tableKey: string,
  capability: TableCapability,
  override: 'auto' | 'enabled' | 'disabled'
): SheetConfig {
  const all = currentConfig.tableCapabilities || {};
  const setting = all[tableKey] || { enabled: [], disabled: [] };

  const enabled = (setting.enabled || []).filter(c => c !== capability);
  const disabled = (setting.disabled || []).filter(c => c !== capability);

  if (override === 'enabled') enabled.push(capability);
  else if (override === 'disabled') disabled.push(capability);

  return {
    ...currentConfig,
    tableCapabilities: {
      ...all,
      [tableKey]: { enabled, disabled }
    }
  };
}

/** Devuelve una tabla a detección automática pura, sin correcciones. */
export function resetTableCapabilitiesToAuto(
  currentConfig: SheetConfig,
  tableKey: string
): SheetConfig {
  const all = { ...(currentConfig.tableCapabilities || {}) };
  delete all[tableKey];
  return { ...currentConfig, tableCapabilities: all };
}

/** Un slice personalizado no declara capacidad: nunca se restringe. */
function sliceFitsCapabilities(slice: TableSlice, caps: Set<TableCapability>): boolean {
  if (!slice.requiredCapability) return true;
  return caps.has(slice.requiredCapability);
}

export const BUILT_IN_SLICES: TableSlice[] = [
  // 1. Radar de Vencimientos (main)
  {
    id: 'builtin_main_retire_now',
    name: 'Retiro Inmediato',
    description: 'Lotes vencidos o que requieren retiro urgente hoy según política',
    tableKey: 'main',
    requiredCapability: 'vencimiento',
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
    requiredCapability: 'vencimiento',
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
    requiredCapability: 'vencimiento',
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
    requiredCapability: 'vencimiento',
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
    requiredCapability: 'vencimiento',
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
    requiredCapability: 'vencimiento',
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
    requiredCapability: 'incidencia',
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
    requiredCapability: 'incidencia',
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
    requiredCapability: 'incidencia',
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
    requiredCapability: 'incidencia',
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
    requiredCapability: 'incidencia',
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
    requiredCapability: 'incidencia',
    icon: 'CheckCircle2',
    color: 'emerald',
    isBuiltIn: true,
    filterConfig: {
      eventResolutionFilter: ['completed']
    }
  }
];


export function loadCustomSlices(): TableSlice[] {
  return readStorage<TableSlice[]>(STORAGE_KEYS.CUSTOM_SLICES, objectArraySchema, []);
}

export function saveCustomSlices(slices: TableSlice[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_SLICES, JSON.stringify(slices));
  } catch (err) {
    console.warn('Error saving custom slices to localStorage:', err);
  }
}

export function loadHiddenSliceIds(sheetConfigHidden?: string[]): string[] {
  try {
    // Si el dato guardado no es un array de cadenas (p. ej. un string suelto),
    // `[...localHidden]` lo desparramaba en caracteres sueltos como IDs ocultos.
    const localHidden = readStorage<string[]>(
      STORAGE_KEYS.HIDDEN_SLICE_IDS,
      stringArraySchema,
      []
    );
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
    localStorage.setItem(STORAGE_KEYS.HIDDEN_SLICE_IDS, JSON.stringify(hiddenIds));
  } catch (err) {
    console.warn('Error saving hidden slice IDs to localStorage:', err);
  }
}

export function getSlicesForTable(
  tableKey: string,
  customSlices: TableSlice[] = [],
  sheetConfigSlices?: TableSlice[],
  headers: string[] = [],
  customAliases?: Record<string, string[]>,
  capabilityOverride?: TableCapabilitySetting
): TableSlice[] {
  const caps = resolveTableCapabilities(headers, customAliases, capabilityOverride);

  // Los nativos entran por capacidad, no por nombre de pestana: asi una hoja no
  // canonica recibe lo que sus columnas permiten, y ninguna recibe lo que no.
  const builtIns = BUILT_IN_SLICES.filter(s => sliceFitsCapabilities(s, caps));
  
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
  hiddenSliceIds: string[] = [],
  headers: string[] = [],
  customAliases?: Record<string, string[]>,
  capabilityOverride?: TableCapabilitySetting
): TableSlice[] {
  const allSlices = getSlicesForTable(tableKey, customSlices, sheetConfigSlices, headers, customAliases, capabilityOverride);
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

  // Los slices nativos ya entran filtrados por capacidad de la hoja, así que aquí
  // sólo se afina por ítem. Se decide por capacidad (no por nombre de pestaña) para
  // que una hoja no canónica reciba el mismo trato que la canónica equivalente.
  //
  // `VENC. CERC.` es un evento FRC (mercadería recibida con poca vida útil), no una
  // categoría de vencimiento: pertenece al dominio de incidencia. Por eso el radar de
  // vencimientos sólo admite VENCIMIENTO puro y el registro FRC admite todo lo demás.
  if (slice.requiredCapability === 'vencimiento') {
    if (getEventCategory(item, headers) !== 'VENCIMIENTO') {
      return false;
    }
  } else if (slice.requiredCapability === 'incidencia') {
    if (getEventCategory(item, headers) === 'VENCIMIENTO') {
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
