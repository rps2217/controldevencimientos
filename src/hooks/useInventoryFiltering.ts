import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { InventoryItem, SheetConfig, SortConfig, DynamicMonthRange, SheetRecord, TableCapability } from '../types';
import { 
  getItemStatus, 
  getEventCategory, 
  getItemResolutionStatus,
  createColumnsContext 
} from '../utils/dateCalculations';
import { findColumnBySemantic } from '../utils/columnAliases';
import { parseAnyDate, formatDisplayDate, createMetricsAccumulator } from '../utils/pureCalculations';
import { VIRTUAL_COLUMNS } from '../utils/virtualColumns';
import { detectTableCapabilities } from '../utils/sliceRegistry';
import { sortInventoryItems, compareItemValues } from '../utils/sortUtils';
import { useInventoryWorker } from './useInventoryWorker';

export interface DisplayRowItem {
  type: 'item';
  item: InventoryItem;
  groupKey?: string;
  index: number;
}

export interface DisplayRowHeader {
  type: 'header';
  groupKey: string;
  count: number;
  isCollapsed: boolean;
  items: InventoryItem[];
}

export type DisplayRow = DisplayRowItem | DisplayRowHeader;

export interface UseInventoryFilteringProps {
  items: InventoryItem[];
  headers: string[];
  /** Capacidades EFECTIVAS ya resueltas por el dashboard. Si faltan, se derivan de `headers`. */
  tableCapabilities?: Set<TableCapability>;
  frcBodCol: string | null;
  sheetConfig: SheetConfig;
  products: SheetRecord[];
  policies: SheetRecord[];
  searchTerm: string;
  activeQuickChip: string | null;
  searchableHeaders: string[];
  pageSize: number | 'all';
  currentPage: number;
  initialSort?: SortConfig;

  // Controlled states for tab memory isolation
  sortConfig?: SortConfig;
  setSortConfig?: (val: SortConfig | ((prev: SortConfig) => SortConfig)) => void;
  eventFilter?: string[];
  setEventFilter?: (val: string[] | ((prev: string[]) => string[])) => void;
  frcBodFilter?: string[];
  setFrcBodFilter?: (val: string[] | ((prev: string[]) => string[])) => void;
  eventResolutionFilter?: string[];
  setEventResolutionFilter?: (val: string[] | ((prev: string[]) => string[])) => void;
  pmRadarFilter?: string[];
  setPmRadarFilter?: (val: string[] | ((prev: string[]) => string[])) => void;
  columnFilters?: Record<string, string[]>;
  setColumnFilters?: (val: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>)) => void;
  dynamicMonthFilter?: number[];
  setDynamicMonthFilter?: (val: number[] | ((prev: number[]) => number[])) => void;
  dynamicMonthRange?: DynamicMonthRange | null;
  setDynamicMonthRange?: (val: DynamicMonthRange | null | ((prev: DynamicMonthRange | null) => DynamicMonthRange | null)) => void;
  groupByColumn?: string;
  setGroupByColumn?: (val: string | ((prev: string) => string)) => void;
  groupByDirection?: 'asc' | 'desc';
  setGroupByDirection?: (val: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) => void;
}

export function handleFilterToggle<T>(current: T[], value: T, isMulti = false): T[] {
  if (!isMulti) {
    if (current.length === 1 && current[0] === value) return [];
    return [value];
  }
  return current.includes(value) ? current.filter(x => x !== value) : [...current, value];
}

export function useInventoryFiltering(props: UseInventoryFilteringProps) {
  const {
    items,
    headers,
    tableCapabilities,
    frcBodCol,
    sheetConfig,
    products,
    policies,
    searchTerm,
    activeQuickChip,
    searchableHeaders,
    pageSize,
    currentPage,
    initialSort = { column: null, direction: null }
  } = props;

  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Capacidades EFECTIVAS de la hoja activa. El dashboard las resuelve una sola vez; aquí
  // solo se derivan de las columnas como respaldo si no llegan por props.
  const tableCaps = useMemo(
    () => tableCapabilities ?? detectTableCapabilities(headers, sheetConfig.customAliases),
    [tableCapabilities, headers, sheetConfig.customAliases]
  );
  const canExpire = tableCaps.has('vencimiento');
  const canLogEvents = tableCaps.has('incidencia');

  // Filter and Sorting state (Fallback to local if props not provided)
  const [localSortConfig, setLocalSortConfig] = useState<SortConfig>(initialSort);
  const sortConfig = props.sortConfig !== undefined ? props.sortConfig : localSortConfig;
  const setSortConfig = props.setSortConfig !== undefined ? props.setSortConfig : setLocalSortConfig;

  const [localEventFilter, setLocalEventFilter] = useState<string[]>([]);
  const eventFilter = props.eventFilter !== undefined ? props.eventFilter : localEventFilter;
  const setEventFilter = props.setEventFilter !== undefined ? props.setEventFilter : setLocalEventFilter;

  const [localFrcBodFilter, setLocalFrcBodFilter] = useState<string[]>([]);
  const frcBodFilter = props.frcBodFilter !== undefined ? props.frcBodFilter : localFrcBodFilter;
  const setFrcBodFilter = props.setFrcBodFilter !== undefined ? props.setFrcBodFilter : setLocalFrcBodFilter;

  const [localEventResolutionFilter, setLocalEventResolutionFilter] = useState<string[]>([]);
  const eventResolutionFilter = props.eventResolutionFilter !== undefined ? props.eventResolutionFilter : localEventResolutionFilter;
  const setEventResolutionFilter = props.setEventResolutionFilter !== undefined ? props.setEventResolutionFilter : setLocalEventResolutionFilter;

  const [localPmRadarFilter, setLocalPmRadarFilter] = useState<string[]>([]);
  const pmRadarFilter = props.pmRadarFilter !== undefined ? props.pmRadarFilter : localPmRadarFilter;
  const setPmRadarFilter = props.setPmRadarFilter !== undefined ? props.setPmRadarFilter : setLocalPmRadarFilter;

  const [localColumnFilters, setLocalColumnFilters] = useState<Record<string, string[]>>({});
  const columnFilters = props.columnFilters !== undefined ? props.columnFilters : localColumnFilters;
  const setColumnFilters = props.setColumnFilters !== undefined ? props.setColumnFilters : setLocalColumnFilters;

  const [localDynamicMonthFilter, setLocalDynamicMonthFilter] = useState<number[]>([]);
  const dynamicMonthFilter = props.dynamicMonthFilter !== undefined ? props.dynamicMonthFilter : localDynamicMonthFilter;
  const setDynamicMonthFilter = props.setDynamicMonthFilter !== undefined ? props.setDynamicMonthFilter : setLocalDynamicMonthFilter;

  const [localDynamicMonthRange, setLocalDynamicMonthRange] = useState<DynamicMonthRange | null>(null);
  const dynamicMonthRange = props.dynamicMonthRange !== undefined ? props.dynamicMonthRange : localDynamicMonthRange;
  const setDynamicMonthRange = props.setDynamicMonthRange !== undefined ? props.setDynamicMonthRange : setLocalDynamicMonthRange;

  const [localGroupByColumn, setLocalGroupByColumn] = useState<string>('none');
  const groupByColumn = props.groupByColumn !== undefined ? props.groupByColumn : localGroupByColumn;
  const setGroupByColumn = props.setGroupByColumn !== undefined ? props.setGroupByColumn : setLocalGroupByColumn;

  const [localGroupByDirection, setLocalGroupByDirection] = useState<'asc' | 'desc'>('asc');
  const groupByDirection = props.groupByDirection !== undefined ? props.groupByDirection : localGroupByDirection;
  const setGroupByDirection = props.setGroupByDirection !== undefined ? props.setGroupByDirection : setLocalGroupByDirection;

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroupByDirection = useCallback(() => {
    setGroupByDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  }, []);

  // Reset collapsed groups when group by column changes
  useEffect(() => {
    setCollapsedGroups({});
  }, [groupByColumn]);

  // Toggle sort handler (None -> ASC -> DESC -> None)
  const handleToggleSort = useCallback((columnName: string) => {
    setSortConfig(prev => {
      if (prev.column !== columnName) {
        return { column: columnName, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column: columnName, direction: 'desc' };
      }
      return { column: null, direction: null };
    });
  }, []);

  // Virtual columns augmentation (avoid cloning objects when no virtual columns active)
  const augmentedItems = useMemo(() => {
    const activeVCs = sheetConfig.activeVirtualColumns || [];
    if (!activeVCs || activeVCs.length === 0) {
      return items;
    }
    const targetVCs = VIRTUAL_COLUMNS.filter(col => activeVCs.includes(col.id));
    if (targetVCs.length === 0) {
      return items;
    }
    return items.map(item => {
      const virtualData: Record<string, string | number> = {};
      targetVCs.forEach(col => {
        virtualData[col.id] = col.calculate(item, headers, { products, policies });
      });
      return { ...item, ...virtualData };
    });
  }, [items, headers, sheetConfig.activeVirtualColumns, products, policies]);

  // Web Worker for non-blocking background calculations
  const { metrics, matchingIndices, isProcessing, isWorkerReady } = useInventoryWorker({
    items: augmentedItems,
    headers,
    frcBodCol,
    searchableHeaders,
    canExpire,
    canLogEvents,
    searchTerm: deferredSearchTerm,
    activeQuickChip,
    eventFilter,
    frcBodFilter,
    eventResolutionFilter,
    pmRadarFilter,
    columnFilters,
    dynamicMonthFilter,
    dynamicMonthRange
  });

  // Single-pass metrics fallback if worker metrics not yet ready. Comparte el
  // acumulador con el worker para que ambas rutas no puedan divergir.
  const localMetrics = useMemo(() => {
    if (metrics) return metrics;

    const acc = createMetricsAccumulator(items.length);
    const bodCounts: Record<string, number> = {};
    const bodSet = new Set<string>();
    const colContext = createColumnsContext(headers);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (frcBodCol) {
        const val = item[frcBodCol];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const trimmed = String(val).trim();
          bodSet.add(trimmed);
          bodCounts[trimmed] = (bodCounts[trimmed] || 0) + 1;
        }
      }

      const cat = getEventCategory(item, headers, colContext);
      const st = getItemStatus(item, headers, colContext);
      acc.addEventCategory(cat, st.code, st.actionType);
      acc.addResolution(getItemResolutionStatus(item, headers, colContext).isResolved);
    }

    return {
      ...acc.finish(),
      frcBodValues: Array.from(bodSet).sort((a, b) => a.localeCompare(b)),
      frcBodCounts: bodCounts,
      columnOptionsMap: {},
    };
  }, [items, headers, frcBodCol, metrics]);

  // Options map for column dropdown filter menus
  const columnOptionsMap = useMemo(() => {
    const map: Record<string, { label: string; value: string }[]> = {};
    
    if (metrics?.columnOptionsMap && Object.keys(metrics.columnOptionsMap).length > 0) {
      Object.assign(map, metrics.columnOptionsMap);
    } else {
      // Lightweight sampling fallback while worker is processing to prevent main-thread freeze
      const sample = augmentedItems.length > 200 ? augmentedItems.slice(0, 200) : augmentedItems;
      headers.forEach(h => {
        const uniqueVals = new Set<string>();
        sample.forEach(item => {
          const val = item[h];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            uniqueVals.add(String(val).trim());
          } else {
            uniqueVals.add('(Vacío)');
          }
        });
        map[h] = Array.from(uniqueVals)
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 100)
          .map(v => ({ label: v, value: v }));
      });
    }

    // Always ensure active virtual columns are included in columnOptionsMap
    const activeVCs = sheetConfig.activeVirtualColumns || [];
    const activeViewVCs = VIRTUAL_COLUMNS
      .filter(vc => activeVCs.includes(vc.id) && (!vc.supportedCapabilities || vc.supportedCapabilities.some(c => tableCaps.has(c))))
      .map(vc => vc.id);

    activeViewVCs.forEach(h => {
      const uniqueVals = new Set<string>();
      augmentedItems.forEach(item => {
        const val = item[h];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          uniqueVals.add(String(val).trim());
        } else {
          uniqueVals.add('(Vacío)');
        }
      });
      map[h] = Array.from(uniqueVals)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 100)
        .map(v => ({ label: v, value: v }));
    });

    return map;
  }, [augmentedItems, headers, sheetConfig.activeVirtualColumns, metrics, tableCaps]);

  // Fast filtering using Worker matching indices when available
  const filteredItems = useMemo(() => {
    const rawFiltered: InventoryItem[] = [];

    if (matchingIndices !== null && isWorkerReady) {
      for (let k = 0; k < matchingIndices.length; k++) {
        const item = augmentedItems[matchingIndices[k]];
        if (item) rawFiltered.push(item);
      }
    } else {
      // Local single-pass fallback
      const hasEventFilter = canLogEvents && eventFilter.length > 0;
      const eventFilterSet = hasEventFilter ? new Set(eventFilter) : null;

      const hasFrcBodFilter = frcBodFilter.length > 0 && !!frcBodCol;
      const frcBodFilterSet = hasFrcBodFilter ? new Set(frcBodFilter) : null;

      const hasEventResFilter = canLogEvents && eventResolutionFilter.length > 0;
      const eventResFilterSet = hasEventResFilter ? new Set(eventResolutionFilter) : null;

      const hasPmRadarFilter = canExpire && pmRadarFilter.length > 0;
      const pmRadarFilterSet = hasPmRadarFilter ? new Set(pmRadarFilter) : null;

      const activeColFilterEntries = (Object.entries(columnFilters) as [string, string[]][])
        .filter(([_, vals]) => vals && vals.length > 0)
        .map(([colName, vals]) => [colName, new Set(vals)] as [string, Set<string>]);
      const hasColFilters = activeColFilterEntries.length > 0;

      const fallbackColContext = createColumnsContext(headers);
      const traspasoCol = hasEventResFilter ? (fallbackColContext.traspasoCol || findColumnBySemantic(headers, 'n_traspaso') || 'N_TRASPASO') : '';
      const vcCol = fallbackColContext.vcCol;
      const term = (deferredSearchTerm.trim() || activeQuickChip || '').toLowerCase();
      const hasSearch = term.length > 0;

      const len = augmentedItems.length;

      for (let i = 0; i < len; i++) {
        const item = augmentedItems[i];

        // View constraints. `VENC. CERC.` es un evento FRC, no vencimiento: el radar
        // sólo admite VENCIMIENTO puro y el registro FRC todo lo demás. Mismo gate que
        // el worker (`inventoryWorker.ts`), para que las dos rutas no puedan divergir.
        if (canExpire) {
          const cat = getEventCategory(item, headers, fallbackColContext);
          if (cat !== 'VENCIMIENTO') {
            continue;
          }
          if (frcBodFilterSet && frcBodCol) {
            const val = item[frcBodCol];
            const valStr = val !== undefined && val !== null ? String(val).trim() : '';
            if (!frcBodFilterSet.has(valStr)) continue;
          }
          if (pmRadarFilterSet) {
            const st = getItemStatus(item, headers, fallbackColContext);
            let matchPm = false;
            if (pmRadarFilterSet.has('drainage') && st.code === 'DRAINAGE_PM') matchPm = true;
            else if (pmRadarFilterSet.has('upcoming') && st.code === 'UPCOMING') matchPm = true;
            else if (pmRadarFilterSet.has('retire_now') && (st.code === 'RETIRE_NOW' || st.code === 'EXPIRED')) matchPm = true;
            else if (pmRadarFilterSet.has('en_regla') && st.code === 'NORMAL') matchPm = true;
            else if (pmRadarFilterSet.has('canje_proveedor') && st.actionType === 'CANJE_PROVEEDOR') matchPm = true;
            else if (pmRadarFilterSet.has('merma_directa') && st.actionType === 'MERMA_DIRECTA') matchPm = true;
            if (!matchPm) continue;
          }
          if (dynamicMonthRange) {
            const today = new Date();
            let dVc = null;
            if (vcCol && item[vcCol]) {
              dVc = parseAnyDate(item[vcCol]);
            }
            if (dVc) {
              const offset = (dVc.getFullYear() - today.getFullYear()) * 12 + dVc.getMonth() - today.getMonth();
              if (offset < dynamicMonthRange.startOffset || offset > dynamicMonthRange.endOffset) {
                continue;
              }
            } else {
              continue;
            }
          } else if (dynamicMonthFilter && dynamicMonthFilter.length > 0) {
            const today = new Date();
            let dVc = null;
            if (vcCol && item[vcCol]) {
              dVc = parseAnyDate(item[vcCol]);
            }
            if (dVc) {
              const offset = (dVc.getFullYear() - today.getFullYear()) * 12 + dVc.getMonth() - today.getMonth();
              if (!dynamicMonthFilter.includes(offset)) {
                continue;
              }
            } else {
              continue;
            }
          }
        } else if (canLogEvents) {
          if (eventFilterSet) {
            const cat = getEventCategory(item, headers, fallbackColContext);
            if (!cat || !eventFilterSet.has(cat)) continue;
          }
          if (frcBodFilterSet && frcBodCol) {
            const val = item[frcBodCol];
            const valStr = val !== undefined && val !== null ? String(val).trim() : '';
            if (!frcBodFilterSet.has(valStr)) continue;
          }
          if (eventResFilterSet) {
            const isResolved = getItemResolutionStatus(item, headers, fallbackColContext).isResolved;
            const status = isResolved ? 'completed' : 'pending';
            const traspasoVal = item[traspasoCol];
            const matchRes = eventResFilterSet.has(status) || (traspasoVal && eventResFilterSet.has(String(traspasoVal)));
            if (!matchRes) continue;
          }
        }

        // Column filters
        if (hasColFilters) {
          let matchCols = true;
          for (let j = 0; j < activeColFilterEntries.length; j++) {
            const [colName, valSet] = activeColFilterEntries[j];
            let val = item[colName];
            if (val === undefined) {
              const matchedKey = Object.keys(item).find(
                (k) => k.toLowerCase().trim() === colName.toLowerCase().trim()
              );
              if (matchedKey) {
                val = item[matchedKey];
              }
            }
            const valStr = val !== undefined && val !== null && String(val).trim() !== '' ? String(val).trim() : '(Vacío)';
            if (!valSet.has(valStr)) {
              matchCols = false;
              break;
            }
          }
          if (!matchCols) continue;
        }

        // Global text search
        if (hasSearch) {
          let matchSearch = false;
          for (let j = 0; j < searchableHeaders.length; j++) {
            const val = item[searchableHeaders[j]];
            if (val !== undefined && val !== null && String(val).toLowerCase().includes(term)) {
              matchSearch = true;
              break;
            }
          }
          if (!matchSearch) continue;
        }

        rawFiltered.push(item);
      }
    }

    // Apply stable multi-type column sorting
    return sortInventoryItems(rawFiltered, sortConfig);
  }, [
    augmentedItems, 
    matchingIndices, 
    isWorkerReady, 
    deferredSearchTerm, 
    activeQuickChip, 
    searchableHeaders, 
    eventFilter, 
    frcBodFilter, 
    frcBodCol, 
    eventResolutionFilter, 
    pmRadarFilter, 
    columnFilters, 
    dynamicMonthFilter,
    dynamicMonthRange,
    headers,
    sortConfig,
    canExpire,
    canLogEvents
  ]);

  // Grouping logic
  const isGroupByDateCol = useMemo(() => {
    return groupByColumn !== 'none' && (
      findColumnBySemantic([groupByColumn], 'fecha_vc') === groupByColumn ||
      findColumnBySemantic([groupByColumn], 'fecha_retiro') === groupByColumn ||
      /fecha|vencimiento|caducidad|f_vto|f_venc|f\.vto|f\.venc|exp_date/i.test(groupByColumn)
    );
  }, [groupByColumn]);

  const groupedItems = useMemo(() => {
    if (groupByColumn === 'none') return null;
    const map = new Map<string, InventoryItem[]>();
    for (const item of filteredItems) {
      const rawVal = item[groupByColumn];
      let val = '(Sin asignar / Vacío)';
      if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
        if (isGroupByDateCol || (typeof rawVal === 'string' && /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/i.test(rawVal.trim())) || rawVal instanceof Date) {
          val = formatDisplayDate(rawVal);
        } else {
          val = String(rawVal).trim();
        }
      }
      if (!map.has(val)) {
        map.set(val, []);
      }
      map.get(val)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => {
      return compareItemValues(a[0], b[0], groupByDirection);
    });
  }, [filteredItems, groupByColumn, groupByDirection, isGroupByDateCol]);

  // Virtualization display row structure
  const displayRows = useMemo<DisplayRow[]>(() => {
    if (groupByColumn === 'none' || !groupedItems) {
      return filteredItems.map((item, index) => ({
        type: 'item' as const,
        item,
        index
      }));
    }

    const rows: DisplayRow[] = [];
    let runningIndex = 0;

    for (const [groupKey, groupItemList] of groupedItems) {
      const isCollapsed = !!collapsedGroups[groupKey];
      rows.push({
        type: 'header',
        groupKey,
        count: groupItemList.length,
        isCollapsed,
        items: groupItemList
      });

      if (!isCollapsed) {
        for (const item of groupItemList) {
          rows.push({
            type: 'item',
            item,
            groupKey,
            index: runningIndex++
          });
        }
      }
    }

    return rows;
  }, [groupByColumn, groupedItems, filteredItems, collapsedGroups]);

  // Paginated display rows
  const paginatedDisplayRows = useMemo<DisplayRow[]>(() => {
    if (pageSize === 'all' || groupByColumn !== 'none') return displayRows;
    const maxPage = Math.max(1, Math.ceil(displayRows.length / (pageSize as number)));
    const safePage = Math.min(Math.max(1, currentPage), maxPage);
    const start = (safePage - 1) * (pageSize as number);
    return displayRows.slice(start, start + (pageSize as number));
  }, [displayRows, currentPage, pageSize, groupByColumn]);

  // Group helpers
  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  }, []);

  const expandAllGroups = useCallback(() => {
    setCollapsedGroups({});
  }, []);

  const collapseAllGroups = useCallback(() => {
    if (!groupedItems) return;
    const allCollapsed: Record<string, boolean> = {};
    for (const [key] of groupedItems) {
      allCollapsed[key] = true;
    }
    setCollapsedGroups(allCollapsed);
  }, [groupedItems]);

  const clearAllFilters = useCallback(() => {
    setEventFilter([]);
    setFrcBodFilter([]);
    setEventResolutionFilter([]);
    setPmRadarFilter([]);
    setColumnFilters({});
    setDynamicMonthFilter([]);
    setDynamicMonthRange(null);
    setSortConfig({ column: null, direction: null });
  }, []);

  return {
    deferredSearchTerm,
    sortConfig,
    setSortConfig,
    handleToggleSort,
    eventFilter,
    setEventFilter,
    frcBodFilter,
    setFrcBodFilter,
    eventResolutionFilter,
    setEventResolutionFilter,
    pmRadarFilter,
    setPmRadarFilter,
    columnFilters,
    setColumnFilters,
    dynamicMonthFilter,
    setDynamicMonthFilter,
    dynamicMonthRange,
    setDynamicMonthRange,
    groupByColumn,
    setGroupByColumn,
    groupByDirection,
    setGroupByDirection,
    toggleGroupByDirection,
    collapsedGroups,
    toggleGroupCollapse,
    expandAllGroups,
    collapseAllGroups,
    clearAllFilters,
    isWorkerProcessing: isProcessing,
    isWorkerReady,
    // Total de filas del DOMINIO del módulo, no de la hoja cruda. Se deriva de la
    // misma pasada que alimenta las métricas para que la píldora «Todas» y la tabla
    // no puedan divergir: en el radar de vencimientos sólo cuentan las filas de
    // vencimiento; en cualquier otro módulo cuentan todas (una fila sin código de
    // evento reconocido nunca se oculta por conteo).
    domainItemsCount: canExpire ? localMetrics.eventMetrics.vencimientos : localMetrics.eventMetrics.total,
    eventMetrics: localMetrics.eventMetrics,
    pmMetrics: localMetrics.pmMetrics,
    eventResolutionMetrics: localMetrics.eventResolutionMetrics,
    frcBodValues: localMetrics.frcBodValues,
    frcBodCounts: localMetrics.frcBodCounts,
    augmentedItems,
    columnOptionsMap,
    filteredItems,
    groupedItems,
    displayRows,
    paginatedDisplayRows
  };
}
