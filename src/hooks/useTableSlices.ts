import { useState, useEffect, useMemo, useCallback } from 'react';
import { TableSlice, SheetConfig, InventoryItem, SortConfig, DynamicMonthRange } from '../types';
import {
  loadCustomSlices,
  saveCustomSlices,
  loadHiddenSliceIds,
  saveHiddenSliceIds,
  getSlicesForTable,
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
  frcBodCol: string;
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
  const [isSliceModalOpen, setIsSliceModalOpen] = useState(false);
  const [isSliceManagerOpen, setIsSliceManagerOpen] = useState(false);
  const [editingSliceModalItem, setEditingSliceModalItem] = useState<TableSlice | null>(null);

  // Sync hidden slice IDs if sheetConfig updates from cloud
  useEffect(() => {
    if (sheetConfig.hiddenSliceIds) {
      setHiddenSliceIds(prev => {
        const merged = Array.from(new Set([...prev, ...(sheetConfig.hiddenSliceIds || [])]));
        return merged;
      });
    }
  }, [sheetConfig.hiddenSliceIds]);

  // Compute all slices available for current table (built-in + custom)
  const currentTableSlices = useMemo(() => {
    return getSlicesForTable(activeView, customSlices, sheetConfig.slices);
  }, [activeView, customSlices, sheetConfig.slices]);

  // Filtered slices visible in the top bar (excluding hidden ones)
  const visibleTableSlices = useMemo(() => {
    return getVisibleSlicesForTable(activeView, customSlices, sheetConfig.slices, hiddenSliceIds);
  }, [activeView, customSlices, sheetConfig.slices, hiddenSliceIds]);

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
      ]
    };
    setSheetConfig(updatedConfig);
    saveConfig(updatedConfig);

    showToast(`Vista personalizada "${slice.name}" guardada con éxito`, 'success');
    handleSelectSlice(slice);
  }, [sheetConfig, saveConfig, showToast, handleSelectSlice, setSheetConfig]);

  const handleDeleteSlice = useCallback((sliceId: string) => {
    setCustomSlices(prev => {
      const updated = prev.filter(s => s.id !== sliceId);
      saveCustomSlices(updated);
      return updated;
    });

    if (sheetConfig.slices) {
      const updatedConfig: SheetConfig = {
        ...sheetConfig,
        slices: sheetConfig.slices.filter(s => s.id !== sliceId)
      };
      setSheetConfig(updatedConfig);
      saveConfig(updatedConfig);
    }

    if (activeSliceId === sliceId) {
      handleSelectSlice(null);
    }
    showToast('Slice eliminado', 'info');
  }, [sheetConfig, saveConfig, activeSliceId, handleSelectSlice, showToast, setSheetConfig]);

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
    isSliceModalOpen,
    setIsSliceModalOpen,
    isSliceManagerOpen,
    setIsSliceManagerOpen,
    editingSliceModalItem,
    setEditingSliceModalItem,
    currentTableSlices,
    visibleTableSlices,
    activeSlice,
    sliceCounts,
    handleSelectSlice,
    handleSaveSlice,
    handleDeleteSlice,
    handleToggleStickyColumns,
    handleToggleSliceVisibility,
    handleSetBulkVisibility
  };
}
