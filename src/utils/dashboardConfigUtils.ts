import { SheetConfig, TableSlice, SortConfig, DynamicMonthRange } from '../types';

/**
 * Helpers para almacenamiento persistente en Modo Demostración / Offline
 */
export const getStoredDemoItems = (view: string, defaultItems: any[]) => {
  try {
    const raw = localStorage.getItem(`app_demo_items_${view}`);
    if (raw !== null) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Error al leer ítems demo de localStorage:', e);
  }
  return defaultItems;
};

export const saveStoredDemoItems = (view: string, items: any[]) => {
  try {
    localStorage.setItem(`app_demo_items_${view}`, JSON.stringify(items));
  } catch (e) {
    console.warn('Error al guardar ítems demo en localStorage:', e);
  }
};

/**
 * Fusiona de forma no destructiva la configuración local con la configuración de la nube
 */
export function mergeCloudConfigs(local: SheetConfig, remote: SheetConfig): SheetConfig {
  if (!local && !remote) return {};
  if (!local) return remote;
  if (!remote) return local;

  const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
  const remoteTime = remote?.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

  const isRemoteNewer = remoteTime >= localTime;
  const primary = isRemoteNewer ? remote : local;
  const secondary = isRemoteNewer ? local : remote;

  // Non-destructive Merge for Custom Slices
  const primarySlices = primary.slices || [];
  const secondarySlices = secondary.slices || [];
  const sliceMap = new Map<string, TableSlice>();

  secondarySlices.forEach(s => {
    if (s && s.id) sliceMap.set(s.id, s);
  });
  primarySlices.forEach(s => {
    if (s && s.id) sliceMap.set(s.id, s);
  });

  // Non-destructive Merge for Schema
  const mergedSchema = {
    ...(secondary.schema || {}),
    ...(primary.schema || {})
  };

  // Non-destructive Merge for Bulk Actions
  const mergedBulk = {
    ...(secondary.tableBulkActions || {}),
    ...(primary.tableBulkActions || {})
  };

  return {
    ...secondary,
    ...primary,
    slices: Array.from(sliceMap.values()),
    schema: mergedSchema,
    tableBulkActions: mergedBulk,
    updatedAt: new Date(Math.max(localTime, remoteTime, Date.now())).toISOString()
  };
}

export interface ModuleViewState {
  activeSliceId: string | null;
  searchTerm: string;
  activeQuickChip: string | null;
  sortConfig: SortConfig;
  eventFilter: string[];
  frcBodFilter: string[];
  eventResolutionFilter: string[];
  pmRadarFilter: string[];
  columnFilters: Record<string, string[]>;
  dynamicMonthFilter: number[];
  dynamicMonthRange: DynamicMonthRange | null;
  groupByColumn: string;
  groupByDirection: 'asc' | 'desc';
}

export const DEFAULT_MODULE_STATE: ModuleViewState = {
  activeSliceId: null,
  searchTerm: '',
  activeQuickChip: null,
  sortConfig: { column: null, direction: null },
  eventFilter: [],
  frcBodFilter: [],
  eventResolutionFilter: [],
  pmRadarFilter: [],
  columnFilters: {},
  dynamicMonthFilter: [],
  dynamicMonthRange: null,
  groupByColumn: 'none',
  groupByDirection: 'asc',
};
