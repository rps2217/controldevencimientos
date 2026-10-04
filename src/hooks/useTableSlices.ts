import { useState, useEffect, useMemo, useCallback } from 'react';
import { TableSlice, SheetConfig, InventoryItem, SortConfig, DynamicMonthRange } from '../types';
import {
  loadCustomSlices,
  saveCustomSlices,
  loadHiddenSliceIds,
  saveHiddenSliceIds,
  loadDeletedSliceIds,
  saveDeletedSliceIds,
  getSlicesForTable,
  getDeletedSlicesForTable,
  getVisibleSlicesForTable,
  computeSliceCounts
} from '../utils/sliceRegistry';

interface UseTableSlicesParams {
  activeView: string;
  sheetConfig: SheetConfig;
  setSheetConfig: (c: SheetConfig) => void;
  saveConfig: (c: SheetConfig) => void;
  headers: string[];
  augmentedItems: InventoryItem[];
  frcBodCol: string | null;
  activeSliceId: string | null;
  setActiveSliceId: (id: string | null) => void;
  clearAllFilters: () => void;
  showAllColumns: () => void;
  setVisibleColumns: (cols: string[]) => void;
  setSortConfig: (s: SortConfig) => void;
  handleSetGroupByColumn: (col: string) => void;
  handleSetGroupByDirection: (dir: 'asc' | 'desc') => void;
  setSearchTerm: (s: string) => void;
  setActiveQuickChip: (c: string | null) => void;
  setEventFilter: (f: string[]) => void;
  setPmRadarFilter: (f: string[]) => void;
  setEventResolutionFilter: (f: string[]) => void;
  setFrcBodFilter: (f: string[]) => void;
  setColumnFilters: (f: Record<string, string[]>) => void;
  setDynamicMonthFilter: (f: number[]) => void;
  setDynamicMonthRange: (r: DynamicMonthRange | null) => void;
  setCurrentPage: (p: number) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error', title?: string) => void;
}

export function useTableSlices({
  activeView,
  sheetConfig,
  setSheetConfig,
  saveConfig,
  headers,
  augmentedItems,
  frcBodCol,
  activeSliceId,
  setActiveSliceId,
  clearAllFilters,
  showAllColumns,
  setVisibleColumns,
  setSortConfig,
  handleSetGroupByColumn,
  handleSetGroupByDirection,
  setSearchTerm,
  setActiveQuickChip,
  setEventFilter,
  setPmRadarFilter,
  setEventResolutionFilter,
  setFrcBodFilter,
  setColumnFilters,
  setDynamicMonthFilter,
  setDynamicMonthRange,
  setCurrentPage,
  showToast
}: UseTableSlicesParams) {
  const [customSlices, setCustomSlices] = useState<TableSlice[]>(() => loadCustomSlices());
  const [hiddenSliceIds, setHiddenSliceIds] = useState<string[]>(() => loadHiddenSliceIds(sheetConfig.hiddenSliceIds));
  const [deletedSliceIds, setDeletedSliceIds] = useState<string[]>(() => loadDeletedSliceIds(sheetConfig.deletedSliceIds));

  // Sync hidden slice IDs if sheetConfig updates from cloud
  useEffect(() => {
    if (sheetConfig.hiddenSliceIds) {
      setHiddenSliceIds(prev => {
        const merged = Array.from(new Set([...prev, ...(sheetConfig.hiddenSliceIds || [])]));
        return merged;
      });
    }
  }, [sheetConfig.hiddenSliceIds]);

  // Sync deleted slice IDs if sheetConfig updates from cloud
  useEffect(() => {
    if (sheetConfig.deletedSliceIds) {
      setDeletedSliceIds(prev => {
        const merged = Array.from(new Set([...prev, ...(sheetConfig.deletedSliceIds || [])]));
        return merged;
      });
    }
  }, [sheetConfig.deletedSliceIds]);

  // Sync custom slices if sheetConfig updates from cloud
  useEffect(() => {
    if (sheetConfig.slices && Array.isArray(sheetConfig.slices)) {
      setCustomSlices(prev => {
        const map = new Map<string, TableSlice>();
        prev.forEach(s => map.set(s.id, s));
        sheetConfig.slices?.forEach(s => map.set(s.id, s));
        const merged = Array.from(map.values());
        saveCustomSlices(merged);
        return merged;
      });
    }
  }, [sheetConfig.slices]);

  // Compute active slices available for current table (excluding deleted ones)
  const currentTableSlices = useMemo(() => {
    return getSlicesForTable(
      activeView,
      customSlices,
      sheetConfig.slices,
      headers,
      sheetConfig.customAliases,
      sheetConfig.tableCapabilities?.[activeView],
      deletedSliceIds
    );
  }, [activeView, customSlices, sheetConfig.slices, headers, sheetConfig.customAliases, sheetConfig.tableCapabilities, deletedSliceIds]);

  // Compute deleted/trash slices for current table
  const deletedTableSlices = useMemo(() => {
    return getDeletedSlicesForTable(
      activeView,
      customSlices,
      sheetConfig.slices,
      deletedSliceIds,
      headers,
      sheetConfig.customAliases,
      sheetConfig.tableCapabilities?.[activeView]
    );
  }, [activeView, customSlices, sheetConfig.slices, deletedSliceIds, headers, sheetConfig.customAliases, sheetConfig.tableCapabilities]);

  // Filtered slices visible in the top bar (excluding hidden & deleted ones)
  const visibleTableSlices = useMemo(() => {
    return getVisibleSlicesForTable(
      activeView,
      customSlices,
      sheetConfig.slices,
      hiddenSliceIds,
      headers,
      sheetConfig.customAliases,
      sheetConfig.tableCapabilities?.[activeView],
      deletedSliceIds
    );
  }, [activeView, customSlices, sheetConfig.slices, hiddenSliceIds, headers, sheetConfig.customAliases, sheetConfig.tableCapabilities, deletedSliceIds]);

  const activeSlice = useMemo(() => {
    if (!activeSliceId) return null;
    return currentTableSlices.find(s => s.id === activeSliceId) || null;
  }, [currentTableSlices, activeSliceId]);

  // High-performance single-pass slice live counts
  const sliceCounts = useMemo(() => {
    return computeSliceCounts(augmentedItems, currentTableSlices, headers, frcBodCol);
  }, [augmentedItems, currentTableSlices, headers, frcBodCol]);

  const handleSelectSlice = useCallback((slice: TableSlice | null) => {
    setCurrentPage(1);
    if (!slice) {
      setActiveSliceId(null);
      clearAllFilters();
      showAllColumns();
      return;
    }

    setActiveSliceId(slice.id);

    // Apply slice filters
    const filterConfig = slice.filterConfig || {};
    setSearchTerm(filterConfig.searchTerm || '');
    setActiveQuickChip(filterConfig.quickChip || null);
    setEventFilter(filterConfig.eventFilter || []);
    setPmRadarFilter(filterConfig.pmRadarFilter || []);
    setEventResolutionFilter(filterConfig.eventResolutionFilter || []);
    setFrcBodFilter(filterConfig.frcBodFilter || []);
    setColumnFilters(filterConfig.columnFilters || {});
    setDynamicMonthFilter(filterConfig.dynamicMonthFilter || []);
    setDynamicMonthRange(filterConfig.dynamicMonthRange || null);

    // Apply slice grouping if defined
    if (slice.groupByColumn) {
      handleSetGroupByColumn(slice.groupByColumn);
      handleSetGroupByDirection(slice.groupByDirection || 'asc');
    } else {
      handleSetGroupByColumn('none');
      handleSetGroupByDirection('asc');
    }

    // Apply slice sorting if defined
    if (slice.sortConfig) {
      setSortConfig(slice.sortConfig);
    }

    // Apply slice visible columns (AppSheet slice feature)
    if (slice.visibleColumns && slice.visibleColumns.length > 0) {
      setVisibleColumns(slice.visibleColumns);
    } else {
      showAllColumns();
    }
  }, [clearAllFilters, showAllColumns, setVisibleColumns, setSortConfig, handleSetGroupByColumn, handleSetGroupByDirection, setSearchTerm, setActiveQuickChip, setActiveSliceId, setCurrentPage, setEventFilter, setPmRadarFilter, setEventResolutionFilter, setFrcBodFilter, setColumnFilters, setDynamicMonthFilter, setDynamicMonthRange]);

  const handleSaveSlice = useCallback((slice: TableSlice) => {
    // If it was in deletedSliceIds, remove it
    const nextDeletedIds = deletedSliceIds.filter(id => id !== slice.id);
    if (nextDeletedIds.length !== deletedSliceIds.length) {
      setDeletedSliceIds(nextDeletedIds);
      saveDeletedSliceIds(nextDeletedIds);
    }

    setCustomSlices(prev => {
      const exists = prev.some(s => s.id === slice.id);
      const updated = exists ? prev.map(s => s.id === slice.id ? slice : s) : [...prev, slice];
      saveCustomSlices(updated);
      return updated;
    });

    const updatedConfig: SheetConfig = {
      ...sheetConfig,
      slices: [
        ...(sheetConfig.slices || []).filter(s => s.id !== slice.id),
        slice
      ],
      deletedSliceIds: nextDeletedIds
    };
    setSheetConfig(updatedConfig);
    saveConfig(updatedConfig);

    showToast(`Vista personalizada "${slice.name}" guardada y sincronizada en la nube`, 'success');
    handleSelectSlice(slice);
  }, [sheetConfig, deletedSliceIds, saveConfig, showToast, handleSelectSlice, setSheetConfig]);

  const handleDeleteSlice = useCallback((sliceId: string) => {
    // Mark as deleted for both built-in and custom slices
    const nextDeletedIds = Array.from(new Set([...deletedSliceIds, sliceId]));
    setDeletedSliceIds(nextDeletedIds);
    saveDeletedSliceIds(nextDeletedIds);

    // Remove from custom slices
    setCustomSlices(prev => {
      const updated = prev.filter(s => s.id !== sliceId);
      saveCustomSlices(updated);
      return updated;
    });

    const updatedConfig: SheetConfig = {
      ...sheetConfig,
      slices: (sheetConfig.slices || []).filter(s => s.id !== sliceId),
      deletedSliceIds: nextDeletedIds
    };
    setSheetConfig(updatedConfig);
    saveConfig(updatedConfig);

    if (activeSliceId === sliceId) {
      handleSelectSlice(null);
    }
    showToast('Slice eliminado (puedes restaurarlo desde la papelera de slices)', 'info');
  }, [sheetConfig, deletedSliceIds, saveConfig, activeSliceId, handleSelectSlice, showToast, setSheetConfig]);

  const handleRestoreSlice = useCallback((sliceId: string) => {
    const nextDeletedIds = deletedSliceIds.filter(id => id !== sliceId);
    setDeletedSliceIds(nextDeletedIds);
    saveDeletedSliceIds(nextDeletedIds);

    const updatedConfig: SheetConfig = {
      ...sheetConfig,
      deletedSliceIds: nextDeletedIds
    };
    setSheetConfig(updatedConfig);
    saveConfig(updatedConfig);

    showToast('Slice restaurado con éxito', 'success');
  }, [sheetConfig, deletedSliceIds, saveConfig, showToast, setSheetConfig]);

  const handleResetDefaultSlices = useCallback(() => {
    // Remove all built-in slice IDs from deletedSliceIds and hiddenSliceIds for current view
    const allBuiltIns = getSlicesForTable(activeView, [], [], headers, sheetConfig.customAliases, sheetConfig.tableCapabilities?.[activeView], []);
    const builtInIds = new Set(allBuiltIns.filter(s => s.isBuiltIn).map(s => s.id));

    const nextDeletedIds = deletedSliceIds.filter(id => !builtInIds.has(id));
    const nextHiddenIds = hiddenSliceIds.filter(id => !builtInIds.has(id));

    setDeletedSliceIds(nextDeletedIds);
    saveDeletedSliceIds(nextDeletedIds);
    setHiddenSliceIds(nextHiddenIds);
    saveHiddenSliceIds(nextHiddenIds);

    const updatedConfig: SheetConfig = {
      ...sheetConfig,
      deletedSliceIds: nextDeletedIds,
      hiddenSliceIds: nextHiddenIds
    };
    setSheetConfig(updatedConfig);
    saveConfig(updatedConfig);

    showToast('Slices predeterminados restaurados a los valores de fábrica', 'success');
  }, [activeView, headers, sheetConfig, deletedSliceIds, hiddenSliceIds, saveConfig, showToast, setSheetConfig]);

  const handleToggleStickyColumns = useCallback(() => {
    const nextVal = !sheetConfig?.enableStickyColumns;
    const updatedConfig: SheetConfig = {
      ...sheetConfig,
      enableStickyColumns: nextVal
    };
    setSheetConfig(updatedConfig);
    saveConfig(updatedConfig);
    showToast(
      nextVal ? 'Columnas fijas (Sticky) ACTIVADAS' : 'Columnas fijas (Sticky) DESACTIVADAS',
      'info',
      'Vista de Tabla'
    );
  }, [sheetConfig, saveConfig, showToast, setSheetConfig]);

  const handleToggleSliceVisibility = useCallback((sliceId: string) => {
    setHiddenSliceIds(prev => {
      const isHidden = prev.includes(sliceId);
      const updated = isHidden ? prev.filter(id => id !== sliceId) : [...prev, sliceId];
      saveHiddenSliceIds(updated);

      const updatedConfig: SheetConfig = {
        ...sheetConfig,
        hiddenSliceIds: updated
      };
      setSheetConfig(updatedConfig);
      saveConfig(updatedConfig);

      showToast(isHidden ? 'Vista ahora visible en la barra superior' : 'Vista oculta de la barra superior', 'info');
      return updated;
    });
  }, [sheetConfig, saveConfig, showToast, setSheetConfig]);

  const handleSetBulkVisibility = useCallback((sliceIds: string[], visible: boolean) => {
    setHiddenSliceIds(prev => {
      let updated: string[];
      if (visible) {
        const toRemove = new Set(sliceIds);
        updated = prev.filter(id => !toRemove.has(id));
      } else {
        updated = Array.from(new Set([...prev, ...sliceIds]));
      }
      saveHiddenSliceIds(updated);

      const updatedConfig: SheetConfig = {
        ...sheetConfig,
        hiddenSliceIds: updated
      };
      setSheetConfig(updatedConfig);
      saveConfig(updatedConfig);

      showToast(visible ? 'Vistas ahora visibles en la barra' : 'Vistas ocultadas de la barra superior', 'info');
      return updated;
    });
  }, [sheetConfig, saveConfig, showToast, setSheetConfig]);

  return {
    customSlices,
    hiddenSliceIds,
    deletedSliceIds,
    currentTableSlices,
    deletedTableSlices,
    visibleTableSlices,
    activeSlice,
    sliceCounts,
    handleSelectSlice,
    handleSaveSlice,
    handleDeleteSlice,
    handleRestoreSlice,
    handleResetDefaultSlices,
    handleToggleStickyColumns,
    handleToggleSliceVisibility,
    handleSetBulkVisibility
  };
}
