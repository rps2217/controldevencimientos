import { InventoryItem, EventCategory, SheetConfig } from '../types';
import { 
  getEventCategory, 
  computeItemRawStatus, 
  getItemResolutionStatus, 
  createColumnsContext,
  ItemStatusCode,
  ItemActionType 
} from '../utils/pureCalculations';
import { findColumnBySemantic } from '../utils/columnAliases';

export interface WorkerNormalizedItem {
  index: number;
  original: InventoryItem;
  eventCategory: EventCategory;
  statusCode: ItemStatusCode;
  actionType: ItemActionType;
  daysToRetire: number | null;
  daysToExpiry: number | null;
  expiryMonthOffset: number | null;
  isResolved: boolean;
  traspasoVal: string | null;
  bodegaVal: string;
}

export interface WorkerMetricsResult {
  eventMetrics: {
    total: number;
    vencimientos: number;
    transporte: number;
    diferencia: number;
    calInterna: number;
    calExterna: number;
    canjes: number;
    averia: number;
    devolucion: number;
    vencimientoCercano: number;
    drainagePm: number;
    upcoming: number;
    retireNow: number;
  };
  pmMetrics: {
    total: number;
    drainage: number;
    upcoming: number;
    retireNow: number;
    enRegla: number;
    canjeProveedor: number;
    mermaDirecta: number;
  };
  eventResolutionMetrics: {
    total: number;
    pending: number;
    completed: number;
  };
  frcBodValues: string[];
  frcBodCounts: Record<string, number>;
  columnOptionsMap: Record<string, { label: string; value: string }[]>;
}

export type WorkerInMessage =
  | {
      type: 'PROCESS_DATA';
      payload: {
        items: InventoryItem[];
        headers: string[];
        frcBodCol: string | null;
        searchableHeaders: string[];
      };
    }
  | {
      type: 'FILTER_DATA';
      payload: {
        activeView: 'main' | 'events' | 'products' | 'policies';
        searchTerm: string;
        eventFilter: string[];
        frcBodFilter: string[];
        frcBodCol: string | null;
        eventResolutionFilter: string[];
        pmRadarFilter: string[];
        columnFilters: Record<string, string[]>;
        dynamicMonthFilter?: number[];
        dynamicMonthRange?: { startOffset: number; endOffset: number } | null;
      };
    };

export type WorkerOutMessage =
  | {
      type: 'DATA_PROCESSED';
      payload: WorkerMetricsResult;
    }
  | {
      type: 'FILTER_RESULT';
      payload: {
        matchingIndices: number[];
      };
    };

let cachedNormalizedItems: WorkerNormalizedItem[] = [];
let cachedHeaders: string[] = [];
let cachedSearchableHeaders: string[] = [];

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const { type, payload } = e.data;

  if (type === 'PROCESS_DATA') {
    const { items, headers, frcBodCol, searchableHeaders } = payload;
    cachedHeaders = headers;
    cachedSearchableHeaders = searchableHeaders || [];

    let vencimientos = 0;
    let transporte = 0;
    let diferencia = 0;
    let calInterna = 0;
    let calExterna = 0;
    let canjes = 0;
    let averia = 0;
    let devolucion = 0;
    let vencimientoCercano = 0;
    let drainagePm = 0;
    let upcoming = 0;
    let retireNow = 0;
    let canjeProveedorCount = 0;
    let mermaDirectaCount = 0;
    let pending = 0;
    let completed = 0;

    const bodCounts: Record<string, number> = {};
    const bodSet = new Set<string>();
    const columnUniqueSets: Record<string, Set<string>> = {};

    headers.forEach((h) => {
      columnUniqueSets[h] = new Set<string>();
    });

    const len = items.length;
    cachedNormalizedItems = new Array(len);

    const allColKeys = new Set<string>(headers);
    if (len > 0 && items[0]) {
      Object.keys(items[0]).forEach((k) => {
        if (!k.startsWith('_')) allColKeys.add(k);
      });
    }

    const allColKeysArray = Array.from(allColKeys);
    allColKeysArray.forEach((h) => {
      columnUniqueSets[h] = new Set<string>();
    });

    const colContext = createColumnsContext(headers);

    for (let i = 0; i < len; i++) {
      const item = items[i];

      // Bodega
      let bodegaVal = '';
      if (frcBodCol) {
        const val = item[frcBodCol];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          bodegaVal = String(val).trim();
          bodSet.add(bodegaVal);
          bodCounts[bodegaVal] = (bodCounts[bodegaVal] || 0) + 1;
        }
      }

      // Column values for dropdowns
      for (let j = 0; j < allColKeysArray.length; j++) {
        const h = allColKeysArray[j];
        const val = item[h];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          columnUniqueSets[h].add(String(val).trim());
        } else {
          columnUniqueSets[h].add('(Vacío)');
        }
      }

      // Status and Categories with pre-resolved columns
      const cat = getEventCategory(item, headers, colContext);
      const statusRaw = computeItemRawStatus(item, headers, colContext);
      const res = getItemResolutionStatus(item, headers, colContext);

      if (cat === 'TRANSPORTE') {
        transporte++;
      } else if (cat === 'DIFERENCIA') {
        diferencia++;
      } else if (cat === 'CAL_INTERNA') {
        calInterna++;
      } else if (cat === 'CAL_EXTERNA') {
        calExterna++;
      } else if (cat === 'CANJES') {
        canjes++;
      } else if (cat === 'AVERIA') {
        averia++;
      } else if (cat === 'DEVOLUCION') {
        devolucion++;
      } else {
        if (cat === 'VENCIMIENTO_CERCANO') {
          vencimientoCercano++;
        }
        vencimientos++;
        if (statusRaw.code === 'DRAINAGE_PM') drainagePm++;
        else if (statusRaw.code === 'UPCOMING') upcoming++;
        else if (statusRaw.code === 'RETIRE_NOW' || statusRaw.code === 'EXPIRED') retireNow++;

        if (statusRaw.actionType === 'CANJE_PROVEEDOR') canjeProveedorCount++;
        else if (statusRaw.actionType === 'MERMA_DIRECTA') mermaDirectaCount++;
      }

      if (res.isResolved) completed++;
      else pending++;

      cachedNormalizedItems[i] = {
        index: i,
        original: item,
        eventCategory: cat,
        statusCode: statusRaw.code,
        actionType: statusRaw.actionType,
        daysToRetire: statusRaw.daysToRetire,
        daysToExpiry: statusRaw.daysToExpiry,
        expiryMonthOffset: statusRaw.expiryMonthOffset,
        isResolved: res.isResolved,
        traspasoVal: res.traspasoNumber || null,
        bodegaVal
      };
    }

    const columnOptionsMap: Record<string, { label: string; value: string }[]> = {};
    headers.forEach((h) => {
      columnOptionsMap[h] = Array.from(columnUniqueSets[h] || [])
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 100)
        .map((v) => ({ label: v, value: v }));
    });

    const metricsResult: WorkerMetricsResult = {
      eventMetrics: {
        total: len,
        vencimientos,
        transporte,
        diferencia,
        calInterna,
        calExterna,
        canjes,
        averia,
        devolucion,
        vencimientoCercano,
        drainagePm,
        upcoming,
        retireNow
      },
      pmMetrics: {
        total: vencimientos,
        drainage: drainagePm,
        upcoming,
        retireNow,
        enRegla: Math.max(0, vencimientos - drainagePm - upcoming - retireNow),
        canjeProveedor: canjeProveedorCount,
        mermaDirecta: mermaDirectaCount
      },
      eventResolutionMetrics: {
        total: len,
        pending,
        completed
      },
      frcBodValues: Array.from(bodSet).sort((a, b) => a.localeCompare(b)),
      frcBodCounts: bodCounts,
      columnOptionsMap
    };

    self.postMessage({
      type: 'DATA_PROCESSED',
      payload: metricsResult
    } as WorkerOutMessage);
  } else if (type === 'FILTER_DATA') {
    const {
      activeView,
      searchTerm,
      eventFilter,
      frcBodFilter,
      frcBodCol,
      eventResolutionFilter,
      pmRadarFilter,
      columnFilters,
      dynamicMonthFilter,
      dynamicMonthRange
    } = payload;

    const hasEventFilter = activeView === 'events' && eventFilter.length > 0;
    const eventFilterSet = hasEventFilter ? new Set(eventFilter) : null;

    const hasFrcBodFilter = frcBodFilter.length > 0 && !!frcBodCol;
    const frcBodFilterSet = hasFrcBodFilter ? new Set(frcBodFilter) : null;

    const hasEventResFilter = activeView === 'events' && eventResolutionFilter.length > 0;
    const eventResFilterSet = hasEventResFilter ? new Set(eventResolutionFilter) : null;

    const hasPmRadarFilter = activeView === 'main' && pmRadarFilter.length > 0;
    const pmRadarFilterSet = hasPmRadarFilter ? new Set(pmRadarFilter) : null;

    const activeColFilterEntries = (Object.entries(columnFilters) as [string, string[]][])
      .filter(([_, vals]) => vals && vals.length > 0)
      .map(([colName, vals]) => [colName, new Set(vals)] as [string, Set<string>]);
    const hasColFilters = activeColFilterEntries.length > 0;

    const term = searchTerm.trim().toLowerCase();
    const hasSearch = term.length > 0;

    const matchingIndices: number[] = [];
    const len = cachedNormalizedItems.length;

    for (let i = 0; i < len; i++) {
      const item = cachedNormalizedItems[i];

      // View constraints
      if (activeView === 'main') {
        if (item.eventCategory !== 'VENCIMIENTO' && item.eventCategory !== 'VENCIMIENTO_CERCANO') {
          continue;
        }
        if (frcBodFilterSet && frcBodCol) {
          if (!frcBodFilterSet.has(item.bodegaVal)) continue;
        }
        if (pmRadarFilterSet) {
          let matchPm = false;
          if (pmRadarFilterSet.has('drainage') && item.statusCode === 'DRAINAGE_PM') matchPm = true;
          else if (pmRadarFilterSet.has('upcoming') && item.statusCode === 'UPCOMING') matchPm = true;
          else if (
            pmRadarFilterSet.has('retire_now') &&
            (item.statusCode === 'RETIRE_NOW' || item.statusCode === 'EXPIRED')
          )
            matchPm = true;
          else if (pmRadarFilterSet.has('en_regla') && item.statusCode === 'NORMAL') matchPm = true;
          else if (pmRadarFilterSet.has('canje_proveedor') && item.actionType === 'CANJE_PROVEEDOR') matchPm = true;
          else if (pmRadarFilterSet.has('merma_directa') && item.actionType === 'MERMA_DIRECTA') matchPm = true;
          if (!matchPm) continue;
        }
        if (dynamicMonthRange) {
          if (
            item.expiryMonthOffset === null ||
            item.expiryMonthOffset < dynamicMonthRange.startOffset ||
            item.expiryMonthOffset > dynamicMonthRange.endOffset
          ) {
            continue;
          }
        } else if (dynamicMonthFilter && dynamicMonthFilter.length > 0) {
          if (item.expiryMonthOffset === null || !dynamicMonthFilter.includes(item.expiryMonthOffset)) {
            continue;
          }
        }
      } else if (activeView === 'events') {
        if (eventFilterSet) {
          if (!eventFilterSet.has(item.eventCategory)) continue;
        }
        if (frcBodFilterSet && frcBodCol) {
          if (!frcBodFilterSet.has(item.bodegaVal)) continue;
        }
        if (eventResFilterSet) {
          const status = item.isResolved ? 'completed' : 'pending';
          const matchRes =
            eventResFilterSet.has(status) ||
            (item.traspasoVal && eventResFilterSet.has(item.traspasoVal));
          if (!matchRes) continue;
        }
      }

      // Column filters
      if (hasColFilters) {
        let matchCols = true;
        for (let j = 0; j < activeColFilterEntries.length; j++) {
          const [colName, valSet] = activeColFilterEntries[j];
          let rawVal = item.original[colName];
          if (rawVal === undefined) {
            const matchedKey = Object.keys(item.original).find(
              (k) => k.toLowerCase().trim() === colName.toLowerCase().trim()
            );
            if (matchedKey) {
              rawVal = item.original[matchedKey];
            }
          }
          const valStr =
            rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
              ? String(rawVal).trim()
              : '(Vacío)';
          if (!valSet.has(valStr)) {
            matchCols = false;
            break;
          }
        }
        if (!matchCols) continue;
      }

      // Fast dynamic early-exit search
      if (hasSearch) {
        let matchSearch = false;
        const searchCols = cachedSearchableHeaders.length > 0 ? cachedSearchableHeaders : cachedHeaders;
        for (let s = 0; s < searchCols.length; s++) {
          const colName = searchCols[s];
          const sVal = item.original[colName];
          if (sVal !== undefined && sVal !== null && String(sVal).toLowerCase().includes(term)) {
            matchSearch = true;
            break;
          }
        }
        if (!matchSearch) continue;
      }

      matchingIndices.push(item.index);
    }

    self.postMessage({
      type: 'FILTER_RESULT',
      payload: {
        matchingIndices
      }
    } as WorkerOutMessage);
  }
};
