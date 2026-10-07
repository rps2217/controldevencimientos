import { InventoryItem, EventCategory } from '../types';
import { 
  getEventCategory, 
  computeItemRawStatus, 
  getItemResolutionStatus, 
  createColumnsContext,
  createMetricsAccumulator,
  MetricsResult,
  ItemStatusCode,
  ItemActionType,
  isExpiryDomainItem,
  isIncidenceDomainItem,
  matchesPmRadarFilter,
  matchesEventResolutionFilter,
  matchesMonthOffsetFilter,
  matchesColumnFilters,
  matchesSearchTerm
} from '../utils/pureCalculations';

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
  isOrphan: boolean;
}

export interface WorkerMetricsResult extends MetricsResult {
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
        canExpire: boolean;
        canLogEvents: boolean;
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

    const metrics = createMetricsAccumulator(items.length);

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

      metrics.addEventCategory(cat, statusRaw.code, statusRaw.actionType);
      metrics.addResolution(res.isResolved);

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
        bodegaVal,
        isOrphan: Boolean(item._isOrphan)
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
      ...metrics.finish(),
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
      canExpire,
      canLogEvents,
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

    const term = searchTerm.trim().toLowerCase();
    const hasSearch = term.length > 0;

    const matchingIndices: number[] = [];
    const len = cachedNormalizedItems.length;

    for (let i = 0; i < len; i++) {
      const item = cachedNormalizedItems[i];

      // View constraints. `VENC. CERC.` es un evento FRC, no vencimiento: el radar
      // sólo admite VENCIMIENTO puro y el registro FRC todo lo demás.
      if (canExpire) {
        if (!isExpiryDomainItem(item.eventCategory)) {
          continue;
        }
        if (frcBodFilterSet && frcBodCol) {
          if (!frcBodFilterSet.has(item.bodegaVal)) continue;
        }
        if (pmRadarFilterSet && !matchesPmRadarFilter(item, pmRadarFilterSet)) {
          continue;
        }
        if (!matchesMonthOffsetFilter(item.expiryMonthOffset, dynamicMonthRange, dynamicMonthFilter)) {
          continue;
        }
      } else if (canLogEvents) {
        if (eventFilterSet && !eventFilterSet.has(item.eventCategory)) {
          continue;
        }
        if (frcBodFilterSet && frcBodCol) {
          if (!frcBodFilterSet.has(item.bodegaVal)) continue;
        }
        if (eventResFilterSet && !matchesEventResolutionFilter(item.isResolved, item.traspasoVal, eventResFilterSet)) {
          continue;
        }
      }

      // Column filters
      if (hasColFilters && !matchesColumnFilters(item.original, activeColFilterEntries)) {
        continue;
      }

      // Fast dynamic early-exit search
      if (hasSearch) {
        const searchCols = cachedSearchableHeaders.length > 0 ? cachedSearchableHeaders : cachedHeaders;
        if (!matchesSearchTerm(item.original, searchCols, term)) {
          continue;
        }
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
