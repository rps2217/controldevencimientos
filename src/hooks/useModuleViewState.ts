import { useState, useMemo, useEffect, useRef } from 'react';
import { SortConfig, DynamicMonthRange } from '../types';
import { ModuleViewState, DEFAULT_MODULE_STATE } from '../utils/dashboardConfigUtils';

export interface UseModuleViewStateOptions {
  activeView: string;
  storageKey?: string;
}

export function useModuleViewState({
  activeView,
  storageKey = 'app_module_states'
}: UseModuleViewStateOptions) {
  const [moduleStates, setModuleStates] = useState<Record<string, ModuleViewState>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const initialModuleState = useMemo(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed['main']) return { ...DEFAULT_MODULE_STATE, ...parsed['main'] };
      }
    } catch {
      // ignore
    }
    return DEFAULT_MODULE_STATE;
  }, [storageKey]);

  const [searchTerm, setSearchTerm] = useState(initialModuleState.searchTerm);
  const [activeQuickChip, setActiveQuickChip] = useState<string | null>(initialModuleState.activeQuickChip);
  const [activeSliceId, setActiveSliceId] = useState<string | null>(initialModuleState.activeSliceId);
  const [sortConfig, setSortConfig] = useState<SortConfig>(initialModuleState.sortConfig);
  const [eventFilter, setEventFilter] = useState<string[]>(initialModuleState.eventFilter);
  const [frcBodFilter, setFrcBodFilter] = useState<string[]>(initialModuleState.frcBodFilter);
  const [eventResolutionFilter, setEventResolutionFilter] = useState<string[]>(initialModuleState.eventResolutionFilter);
  const [pmRadarFilter, setPmRadarFilter] = useState<string[]>(initialModuleState.pmRadarFilter);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(initialModuleState.columnFilters);
  const [dynamicMonthFilter, setDynamicMonthFilter] = useState<number[]>(initialModuleState.dynamicMonthFilter);
  const [dynamicMonthRange, setDynamicMonthRange] = useState<DynamicMonthRange | null>(initialModuleState.dynamicMonthRange);
  const [groupByColumn, setGroupByColumn] = useState<string>(initialModuleState.groupByColumn);
  const [groupByDirection, setGroupByDirection] = useState<'asc' | 'desc'>(initialModuleState.groupByDirection);

  const lastViewRef = useRef<string>(activeView);

  // 1. Tab switch transition: save previous view's state and restore target view's state
  useEffect(() => {
    const prevView = lastViewRef.current;
    if (prevView === activeView) return;

    // Save previous view state
    const prevViewState: ModuleViewState = {
      activeSliceId,
      searchTerm,
      activeQuickChip,
      sortConfig,
      eventFilter,
      frcBodFilter,
      eventResolutionFilter,
      pmRadarFilter,
      columnFilters,
      dynamicMonthFilter,
      dynamicMonthRange,
      groupByColumn,
      groupByDirection,
    };

    setModuleStates(prev => {
      const updated = {
        ...prev,
        [prevView]: prevViewState
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });

    // Load target view state
    const targetState = moduleStates[activeView] || DEFAULT_MODULE_STATE;

    // Batch apply target view state
    setActiveSliceId(targetState.activeSliceId ?? null);
    setSearchTerm(targetState.searchTerm ?? '');
    setActiveQuickChip(targetState.activeQuickChip ?? null);
    setSortConfig(targetState.sortConfig || { column: null, direction: null });
    setEventFilter(targetState.eventFilter || []);
    setFrcBodFilter(targetState.frcBodFilter || []);
    setEventResolutionFilter(targetState.eventResolutionFilter || []);
    setPmRadarFilter(targetState.pmRadarFilter || []);
    setColumnFilters(targetState.columnFilters || {});
    setDynamicMonthFilter(targetState.dynamicMonthFilter || []);
    setDynamicMonthRange(targetState.dynamicMonthRange || null);
    setGroupByColumn(targetState.groupByColumn || 'none');
    setGroupByDirection(targetState.groupByDirection || 'asc');

    // Update ref
    lastViewRef.current = activeView;
  }, [activeView, storageKey]);

  // 2. Continuous background persistence: save state of active view on modification
  useEffect(() => {
    if (lastViewRef.current !== activeView) return; // Prevent overwriting during transitions

    const stateToSave: ModuleViewState = {
      activeSliceId,
      searchTerm,
      activeQuickChip,
      sortConfig,
      eventFilter,
      frcBodFilter,
      eventResolutionFilter,
      pmRadarFilter,
      columnFilters,
      dynamicMonthFilter,
      dynamicMonthRange,
      groupByColumn,
      groupByDirection,
    };

    setModuleStates(prev => {
      const currentSaved = prev[activeView];
      if (currentSaved && 
          currentSaved.activeSliceId === stateToSave.activeSliceId &&
          currentSaved.searchTerm === stateToSave.searchTerm &&
          currentSaved.activeQuickChip === stateToSave.activeQuickChip &&
          JSON.stringify(currentSaved.sortConfig) === JSON.stringify(stateToSave.sortConfig) &&
          JSON.stringify(currentSaved.eventFilter) === JSON.stringify(stateToSave.eventFilter) &&
          JSON.stringify(currentSaved.frcBodFilter) === JSON.stringify(stateToSave.frcBodFilter) &&
          JSON.stringify(currentSaved.eventResolutionFilter) === JSON.stringify(stateToSave.eventResolutionFilter) &&
          JSON.stringify(currentSaved.pmRadarFilter) === JSON.stringify(stateToSave.pmRadarFilter) &&
          JSON.stringify(currentSaved.columnFilters) === JSON.stringify(stateToSave.columnFilters) &&
          JSON.stringify(currentSaved.dynamicMonthFilter) === JSON.stringify(stateToSave.dynamicMonthFilter) &&
          JSON.stringify(currentSaved.dynamicMonthRange) === JSON.stringify(stateToSave.dynamicMonthRange) &&
          currentSaved.groupByColumn === stateToSave.groupByColumn &&
          currentSaved.groupByDirection === stateToSave.groupByDirection) {
        return prev;
      }

      const updated = {
        ...prev,
        [activeView]: stateToSave
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, [
    activeView,
    activeSliceId,
    searchTerm,
    activeQuickChip,
    sortConfig,
    eventFilter,
    frcBodFilter,
    eventResolutionFilter,
    pmRadarFilter,
    columnFilters,
    dynamicMonthFilter,
    dynamicMonthRange,
    groupByColumn,
    groupByDirection,
    storageKey
  ]);

  return {
    moduleStates,
    setModuleStates,
    searchTerm,
    setSearchTerm,
    activeQuickChip,
    setActiveQuickChip,
    activeSliceId,
    setActiveSliceId,
    sortConfig,
    setSortConfig,
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
  };
}
