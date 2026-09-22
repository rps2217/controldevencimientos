import { SheetConfig, TableSlice, SortConfig, DynamicMonthRange } from '../types';

/**
 * Helpers para almacenamiento persistente en Modo Demostración / Offline
 */
import { demoItemsKey, readStorage, writeStorage, objectArraySchema } from '../utils/appStorage';
export const getStoredDemoItems = <T>(view: string, defaultItems: T[]): T[] => {
  // Sin validar, un objeto suelto o un null persistido se devolvia como lista de
  // items y reventaba al hacer .map/.filter o al alimentar el estado de la tabla.
  return readStorage<T[]>(demoItemsKey(view), objectArraySchema, defaultItems);
};

export const saveStoredDemoItems = (view: string, items: readonly unknown[]) => {
  writeStorage(demoItemsKey(view), items);
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
