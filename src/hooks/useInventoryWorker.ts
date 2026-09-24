import { useState, useEffect, useRef, useCallback } from 'react';
import { InventoryItem } from '../types';
import { WorkerMetricsResult, WorkerOutMessage } from '../workers/inventoryWorker';

export interface UseInventoryWorkerProps {
  items: InventoryItem[];
  headers: string[];
  frcBodCol: string | null;
  searchableHeaders: string[];
  /** Capacidad de vencimiento de la hoja activa (gobierna el filtro del Radar PM). */
  canExpire: boolean;
  /** Capacidad de incidencia de la hoja activa (gobierna los filtros de eventos). */
  canLogEvents: boolean;
  searchTerm: string;
  activeQuickChip: string | null;
  eventFilter: string[];
  frcBodFilter: string[];
  eventResolutionFilter: string[];
  pmRadarFilter: string[];
  columnFilters: Record<string, string[]>;
  dynamicMonthFilter?: number[];
  dynamicMonthRange?: { startOffset: number; endOffset: number } | null;
}

export function useInventoryWorker({
  items,
  headers,
  frcBodCol,
  searchableHeaders,
  canExpire,
  canLogEvents,
  searchTerm,
  activeQuickChip,
  eventFilter,
  frcBodFilter,
  eventResolutionFilter,
  pmRadarFilter,
  columnFilters,
  dynamicMonthFilter = [],
  dynamicMonthRange = null
}: UseInventoryWorkerProps) {
  const workerRef = useRef<Worker | null>(null);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [metrics, setMetrics] = useState<WorkerMetricsResult | null>(null);
  const [matchingIndices, setMatchingIndices] = useState<number[] | null>(null);

  // Initialize Worker
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/inventoryWorker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        const { type, payload } = e.data;
        if (type === 'DATA_PROCESSED') {
          setMetrics(payload);
          setIsProcessing(false);
        } else if (type === 'FILTER_RESULT') {
          setMatchingIndices(payload.matchingIndices);
          setIsProcessing(false);
        }
      };

      worker.onerror = (err) => {
        console.warn('Inventory Web Worker encountered an error, falling back to local thread computation:', err);
        setIsWorkerReady(false);
      };

      workerRef.current = worker;
      setIsWorkerReady(true);

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch (e) {
      console.warn('Web Workers unavailable or failed to initialize, using main thread fallback:', e);
      setIsWorkerReady(false);
    }
  }, []);

  const buildFilterPayload = useCallback(() => ({
    canExpire,
    canLogEvents,
    searchTerm: (searchTerm.trim() || activeQuickChip || '').toLowerCase(),
    eventFilter,
    frcBodFilter,
    frcBodCol,
    eventResolutionFilter,
    pmRadarFilter,
    columnFilters,
    dynamicMonthFilter,
    dynamicMonthRange
  }), [canExpire, canLogEvents, searchTerm, activeQuickChip, eventFilter, frcBodFilter, frcBodCol, eventResolutionFilter, pmRadarFilter, columnFilters, dynamicMonthFilter, dynamicMonthRange]);

  // Ref always pointing at the latest payload builder: the dataset effect below must re-read it
  // when data changes without re-running PROCESS_DATA on every filter change.
  const buildFilterPayloadRef = useRef(buildFilterPayload);
  buildFilterPayloadRef.current = buildFilterPayload;

  // Post PROCESS_DATA when dataset or structural headers change
  useEffect(() => {
    if (workerRef.current && isWorkerReady) {
      setIsProcessing(true);
      workerRef.current.postMessage({
        type: 'PROCESS_DATA',
        payload: {
          items,
          headers,
          frcBodCol,
          searchableHeaders
        }
      });
      
      // Immediately trigger FILTER_DATA so matchingIndices is refreshed for the new dataset
      workerRef.current.postMessage({ type: 'FILTER_DATA', payload: buildFilterPayloadRef.current() });
    }
  }, [items, headers, frcBodCol, searchableHeaders, isWorkerReady]);

  // Post FILTER_DATA when filter criteria or search term changes
  useEffect(() => {
    if (workerRef.current && isWorkerReady) {
      workerRef.current.postMessage({ type: 'FILTER_DATA', payload: buildFilterPayload() });
    }
  }, [
    canExpire,
    canLogEvents,
    searchTerm,
    activeQuickChip,
    eventFilter,
    frcBodFilter,
    frcBodCol,
    eventResolutionFilter,
    pmRadarFilter,
    columnFilters,
    dynamicMonthFilter,
    dynamicMonthRange,
    isWorkerReady,
    buildFilterPayload
  ]);

  return {
    isWorkerReady,
    isProcessing,
    metrics,
    matchingIndices
  };
}
