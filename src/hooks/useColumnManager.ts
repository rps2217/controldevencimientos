import { useState, useEffect, useMemo, useCallback } from 'react';
import { SheetConfig } from '../types';
import { VIRTUAL_COLUMNS } from '../utils/virtualColumns';

export interface ManageableColumn {
  id: string;
  label: string;
  isVisible: boolean;
  isVirtual: boolean;
  isSchemaHidden: boolean;
}

export interface UseColumnManagerOptions {
  headers: string[];
  activeSheetTitle?: string;
  activeView: string;
  sheetConfig: SheetConfig;
}

export interface UseColumnManagerReturn {
  visibleHeaders: string[];
  allManageableColumns: ManageableColumn[];
  toggleVisibility: (colId: string) => void;
  reorderColumns: (fromIndex: number, toIndex: number) => void;
  handleColumnDrop: (targetHeader: string, droppedHeader: string) => void;
  moveColumn: (colId: string, direction: 'up' | 'down') => void;
  showAllColumns: () => void;
  resetColumnOrder: () => void;
  setVisibleColumns: (colIds: string[]) => void;
  columnOrders: Record<string, string[]>;
  hiddenColumns: Record<string, string[]>;
}

export function useColumnManager({
  headers,
  activeSheetTitle,
  activeView,
  sheetConfig
}: UseColumnManagerOptions): UseColumnManagerReturn {
  // Load column orders and hidden columns from localStorage
  const [columnOrders, setColumnOrders] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('appsheet_clone_col_orders');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [hiddenColumns, setHiddenColumns] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('appsheet_clone_hidden_cols');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem('appsheet_clone_col_orders', JSON.stringify(columnOrders));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, [columnOrders]);

  useEffect(() => {
    try {
      localStorage.setItem('appsheet_clone_hidden_cols', JSON.stringify(hiddenColumns));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, [hiddenColumns]);

  // Compute active virtual column IDs
  const activeVirtualCols = useMemo(() => {
    const activeVCs = sheetConfig.activeVirtualColumns || [];
    return VIRTUAL_COLUMNS.filter(
      vc => activeVCs.includes(vc.id) && (!vc.supportedViews || vc.supportedViews.includes(activeView as any))
    );
  }, [sheetConfig.activeVirtualColumns, activeView]);

  // Map of virtual column IDs -> labels
  const virtualMap = useMemo(() => {
    const map: Record<string, string> = {};
    activeVirtualCols.forEach(vc => {
      map[vc.id] = vc.label;
    });
    return map;
  }, [activeVirtualCols]);

  // Combined list of base candidate column IDs: real headers + active virtual cols
  const combinedCandidates = useMemo(() => {
    const vcIds = activeVirtualCols.map(vc => vc.id);
    return [...headers, ...vcIds];
  }, [headers, activeVirtualCols]);

  // Ordered list of all candidate columns for activeView
  const orderedColumnIds = useMemo(() => {
    const viewOrder = columnOrders[activeView];
    if (!viewOrder || viewOrder.length === 0) {
      return combinedCandidates;
    }
    // Filter viewOrder to valid candidates and append any candidate missing from viewOrder
    const result: string[] = [];
    viewOrder.forEach(id => {
      if (combinedCandidates.includes(id) && !result.includes(id)) {
        result.push(id);
      }
    });
    combinedCandidates.forEach(id => {
      if (!result.includes(id)) {
        result.push(id);
      }
    });
    return result;
  }, [columnOrders, activeView, combinedCandidates]);

  // All manageable columns metadata
  const allManageableColumns = useMemo<ManageableColumn[]>(() => {
    const viewHidden = hiddenColumns[activeView] || [];
    const schemaForSheet = activeSheetTitle ? sheetConfig.schema?.[activeSheetTitle] : undefined;

    return orderedColumnIds.map(id => {
      const isVirtual = Boolean(virtualMap[id]);
      const label = isVirtual ? virtualMap[id] : id;
      const isSchemaHidden = !isVirtual && schemaForSheet?.[id]?.visible === false;
      const isUserHidden = viewHidden.includes(id);
      const isVisible = !isSchemaHidden && !isUserHidden;

      return {
        id,
        label,
        isVisible,
        isVirtual,
        isSchemaHidden
      };
    });
  }, [orderedColumnIds, hiddenColumns, activeView, activeSheetTitle, sheetConfig.schema, virtualMap]);

  // Visible headers list (ordered)
  const visibleHeaders = useMemo(() => {
    return allManageableColumns
      .filter(col => col.isVisible)
      .map(col => col.id);
  }, [allManageableColumns]);

  // Handlers
  const toggleVisibility = useCallback((colId: string) => {
    setHiddenColumns(prev => {
      const current = prev[activeView] || [];
      const updated = current.includes(colId)
        ? current.filter(id => id !== colId)
        : [...current, colId];
      return { ...prev, [activeView]: updated };
    });
  }, [activeView]);

  const reorderColumns = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    setColumnOrders(prev => {
      const currentOrder = prev[activeView] || orderedColumnIds;
      const newOrder = [...currentOrder];
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      return { ...prev, [activeView]: newOrder };
    });
  }, [activeView, orderedColumnIds]);

  const handleColumnDrop = useCallback((targetHeader: string, droppedHeader: string) => {
    if (targetHeader === droppedHeader) return;
    setColumnOrders(prev => {
      const currentOrder = prev[activeView] || orderedColumnIds;
      const newOrder = [...currentOrder];
      if (!newOrder.includes(droppedHeader)) newOrder.push(droppedHeader);
      if (!newOrder.includes(targetHeader)) newOrder.push(targetHeader);

      const fromIdx = newOrder.indexOf(droppedHeader);
      const toIdx = newOrder.indexOf(targetHeader);
      if (fromIdx !== -1 && toIdx !== -1) {
        newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, droppedHeader);
      }
      return { ...prev, [activeView]: newOrder };
    });
  }, [activeView, orderedColumnIds]);

  const moveColumn = useCallback((colId: string, direction: 'up' | 'down') => {
    const index = orderedColumnIds.indexOf(colId);
    if (index === -1) return;
    if (direction === 'up' && index > 0) {
      reorderColumns(index, index - 1);
    } else if (direction === 'down' && index < orderedColumnIds.length - 1) {
      reorderColumns(index, index + 1);
    }
  }, [orderedColumnIds, reorderColumns]);

  const showAllColumns = useCallback(() => {
    setHiddenColumns(prev => ({
      ...prev,
      [activeView]: []
    }));
  }, [activeView]);

  const resetColumnOrder = useCallback(() => {
    setColumnOrders(prev => ({
      ...prev,
      [activeView]: combinedCandidates
    }));
    setHiddenColumns(prev => ({
      ...prev,
      [activeView]: []
    }));
  }, [activeView, combinedCandidates]);

  const setVisibleColumns = useCallback((colIds: string[]) => {
    if (!colIds || colIds.length === 0) return;
    const toHide = combinedCandidates.filter(id => !colIds.includes(id));
    setHiddenColumns(prev => ({
      ...prev,
      [activeView]: toHide
    }));
    setColumnOrders(prev => {
      const remaining = combinedCandidates.filter(id => !colIds.includes(id));
      return {
        ...prev,
        [activeView]: [...colIds, ...remaining]
      };
    });
  }, [activeView, combinedCandidates]);

  return {
    visibleHeaders,
    allManageableColumns,
    toggleVisibility,
    reorderColumns,
    handleColumnDrop,
    moveColumn,
    showAllColumns,
    resetColumnOrder,
    setVisibleColumns,
    columnOrders,
    hiddenColumns
  };
}
