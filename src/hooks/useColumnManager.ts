import { useState, useEffect, useMemo, useCallback } from 'react';
import { SheetConfig, TableCapability } from '../types';
import { STORAGE_KEYS, readStorage, writeStorage, stringArrayMapSchema, type StringArrayMap } from '../utils/appStorage';
import { findTableSchema } from '../utils/virtualColumnsEvaluator';

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
  /** Capacidades de dominio de la hoja */
  tableCapabilities?: Set<TableCapability>;
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
  tableCapabilities,
  sheetConfig
}: UseColumnManagerOptions): UseColumnManagerReturn {
  // Load column orders and hidden columns from localStorage
  const [columnOrders, setColumnOrders] = useState<StringArrayMap>(() =>
    readStorage(STORAGE_KEYS.COL_ORDERS, stringArrayMapSchema, {})
  );

  const [hiddenColumns, setHiddenColumns] = useState<StringArrayMap>(() =>
    readStorage(STORAGE_KEYS.HIDDEN_COLS, stringArrayMapSchema, {})
  );

  // Persist preferences
  useEffect(() => {
    try {
      writeStorage(STORAGE_KEYS.COL_ORDERS, columnOrders);
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, [columnOrders]);

  useEffect(() => {
    try {
      writeStorage(STORAGE_KEYS.HIDDEN_COLS, hiddenColumns);
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, [hiddenColumns]);

  // Map of virtual column IDs -> labels from schema
  const virtualMap = useMemo(() => {
    const map: Record<string, string> = {};
    map['_row'] = '# (N° de Fila)';
    if (tableCapabilities?.has('vencimiento')) {
      map['_status'] = 'Estado / Radar PM';
    }
    if (tableCapabilities?.has('incidencia')) {
      map['_res_status'] = 'Estado Gestión';
    }
    map['_actions'] = 'Acciones';

    const schemaForSheet = findTableSchema(activeSheetTitle, sheetConfig, activeView);
    if (schemaForSheet) {
      Object.entries(schemaForSheet).forEach(([colId, colDef]) => {
        if (colDef.isVirtual || colDef.type === 'calculated' || Boolean(colDef.formula)) {
          map[colId] = colDef.label || colId;
        }
      });
    }
    return map;
  }, [activeSheetTitle, activeView, sheetConfig.schema, tableCapabilities]);

  // Combined list of base candidate column IDs: real headers + virtual status cols + schema virtual cols
  // [MODIFIED FOR STATUS, ROW, AND ACTIONS IN COLUMN MANAGER]
  const combinedCandidates = useMemo(() => {
    const result = [...headers];
    if (tableCapabilities?.has('vencimiento') && !result.includes('_status')) {
      result.unshift('_status');
    }
    if (tableCapabilities?.has('incidencia') && !result.includes('_res_status')) {
      result.unshift('_res_status');
    }
    if (!result.includes('_row')) {
      result.unshift('_row');
    }
    const schemaForSheet = findTableSchema(activeSheetTitle, sheetConfig, activeView);
    if (schemaForSheet) {
      Object.entries(schemaForSheet).forEach(([colId, colDef]) => {
        if ((colDef.isVirtual || colDef.type === 'calculated' || Boolean(colDef.formula)) && !result.includes(colId)) {
          result.push(colId);
        }
      });
    }
    if (!result.includes('_actions')) {
      result.push('_actions');
    }
    return result;
  }, [headers, tableCapabilities, activeSheetTitle, activeView, sheetConfig.schema]);

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
    const schemaForSheet = findTableSchema(activeSheetTitle, sheetConfig, activeView);

    return orderedColumnIds.map(id => {
      const isVirtual = id === '_row' || id === '_actions' || id === '_status' || id === '_res_status' || Boolean(virtualMap[id]) || schemaForSheet?.[id]?.isVirtual === true || schemaForSheet?.[id]?.type === 'calculated' || Boolean(schemaForSheet?.[id]?.formula);
      const label = schemaForSheet?.[id]?.label || virtualMap[id] || id;
      const isSchemaHidden = schemaForSheet?.[id]?.visible === false;
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

  // Visible headers list (ordered) - Only data columns (excludes structural columns like _row, _status, _res_status, _actions)
  const visibleHeaders = useMemo(() => {
    return allManageableColumns
      .filter(col => col.isVisible && col.id !== '_row' && col.id !== '_status' && col.id !== '_res_status' && col.id !== '_actions')
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
