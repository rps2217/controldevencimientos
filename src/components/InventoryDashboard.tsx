import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { saveCloudConfig, saveScriptPropertiesConfig } from '../lib/sheets';
import { InventoryItem, SheetConfig, EventCategory, VIEW_KEYS } from '../types';
import { useItemFormManager } from '../hooks/useItemFormManager';
import { useModalsActions } from '../context/ModalsContext';
import { DashboardProvider, DashboardContextType } from '../context/DashboardContext';

// Utilities & Hooks
import { getEventCategory, getItemStatus } from '../utils/dateCalculations';
import { findColumnBySemantic } from '../utils/columnAliases';
import { resolveTableCapabilities } from '../utils/sliceRegistry';
import { VIRTUAL_COLUMNS } from '../utils/virtualColumns';
import { useColumnResize } from '../hooks/useColumnResize';
import { useColumnManager } from '../hooks/useColumnManager';
import { useInventoryFiltering, handleFilterToggle } from '../hooks/useInventoryFiltering';
import { useOfflineSyncFeedback } from '../hooks/useOfflineSyncFeedback';
import { useCloudConfigSync } from '../hooks/useCloudConfigSync';
import { useDashboardChromeState } from '../hooks/useDashboardChromeState';
import { useInventoryData } from '../hooks/useInventoryData';
import type { FetchDataFn } from '../hooks/useInventoryData';
import { useTicketPrinting } from '../hooks/useTicketPrinting';
import { useModuleViewState } from '../hooks/useModuleViewState';
import { useTableVirtualization } from '../hooks/useTableVirtualization';
import { useInventoryMutations } from '../hooks/useInventoryMutations';
import { STORAGE_KEYS, readStorage, writeStorage, sheetConfigShapeSchema } from '../utils/appStorage';

// Helpers para almacenamiento persistente y configuración modular
import { mergeCloudConfigs, ModuleViewState } from '../utils/dashboardConfigUtils';
export { mergeCloudConfigs, type ModuleViewState };

// Modals & Drawers & Sub-components
import { Sidebar } from './navigation/Sidebar';
import { DashboardTopNav } from './navigation/DashboardTopNav';
import { DashboardPageHeader } from './navigation/DashboardPageHeader';
import { DashboardFilterPanels } from './views/DashboardFilterPanels';
import { FloatingBulkActionBar } from './dashboard/FloatingBulkActionBar';
import { DashboardModalsManager } from './dashboard/DashboardModalsManager';
import { DashboardViewRouter } from './dashboard/DashboardViewRouter';
import { ZenModeOverlay } from './dashboard/ZenModeOverlay';
import { DashboardMobileDrawer } from './dashboard/DashboardMobileDrawer';
import { DashboardMobileFABs } from './dashboard/DashboardMobileFABs';
import { ViewConfigControlDrawer } from './drawers/ViewConfigControlDrawer';
import { usePrecomputedColumns } from '../hooks/usePrecomputedColumns';
import { TicketPrintView } from './views/TicketPrintView';
import { isModuleEnabled } from '../utils/modulesRegistry';
import { buildBulkActionContext, isActionEnabledForTable } from '../utils/bulkActionsRegistry';
import { SkeletonLoader } from './common/SkeletonLoader';
import { useToast } from './common/ToastContainer';
import { useConfirm } from './common/ConfirmDialog';
import { useTableSlices } from '../hooks/useTableSlices';
import { useTableGrouping } from '../hooks/useTableGrouping';
import { useInventoryIngestion } from '../hooks/useInventoryIngestion';
import { useInventoryBulkActions } from '../hooks/useInventoryBulkActions';

export const InventoryDashboard: React.FC = () => {
  // Acciones de modales: identidad estable, no suscriben al estado.
  const {
    setIsConfigOpen, setIsTicketConfigOpen,
    openQuickTraspaso: handleOpenQuickTraspaso,
    openWhatsApp: handleOpenWhatsApp,
    openEmail: handleOpenEmail,
  } = useModalsActions();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  
  // Storage & Cloud Sync Status

  // Advanced features: Pagination, Offline Cache & Concurrency
  const [pageSize] = useState<number | 'all'>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [activeView, setActiveView] = useState<string>('main');

  // Search, Selection and Scoped Module States via useModuleViewState Hook
  const {
    searchTerm,
    setSearchTerm,
    setSearchTermForView,
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
    setGroupByDirection
  } = useModuleViewState({ activeView });

  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);

  // Sheet configuration state
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>(() =>
    readStorage<SheetConfig>(STORAGE_KEYS.SHEET_CONFIG, sheetConfigShapeSchema, {})
  );

  // Puente hacia `useInventoryData.fetchData`: se asigna tras declararlo. El
  // callback de sincronización lo lee al vaciar la cola, no durante el render,
  // así que un ref rompe el ciclo sin provocar cierres obsoletos.
  const fetchDataRef = useRef<FetchDataFn | null>(null);

  const {
    offlineQueue,
    auditLog,
    isOffline,
    setIsOffline,
    isSyncing: isSyncingCloud,
    setIsSyncing: setIsSyncingCloud,
    lastCachedAt,
    setLastCachedAt,
    latencyMs,
    connectionStatus,
    lastHealthCheck,
    healthErrorMessage,
    scriptSupportsAtomicSave,
    testConnectionHealth,
    enqueueMutation,
    syncQueue,
    removeMutation,
    discardMutation,
    discardAllFailedMutations,
    retryMutation,
    retryAllFailedMutations,
    forkMutationAsAppend,
    failedMutations,
    failedCount,
    clearQueue,
    clearAuditLog,
    handleSyncOfflineQueue,
  } = useOfflineSyncFeedback({ fetchDataRef, sheetConfig, activeView });

  const {
    hasCloudConfigSheet,
    setHasCloudConfigSheet,
    cloudConfigSheetName,
    setCloudConfigSheetName,
    configStorageMode,
    setConfigStorageMode,
    syncSuccessMessage,
    handlePushPropertiesConfig,
    handlePushCloudConfig
  } = useCloudConfigSync(sheetConfig, setIsSyncingCloud);

  const {
    metadata,
    activeSheet,
    setActiveSheet: _setActiveSheet,
    headers,
    setHeaders: _setHeaders,
    items,
    setItems,
    allMainItems,
    setAllMainItems,
    products,
    setProducts,
    policies,
    setPolicies,
    isRelationalActive,
    loading,
    error,
    isBackgroundSyncing,
    fetchData
  } = useInventoryData({
    sheetConfig,
    setSheetConfig,
    activeView,
    showToast,
    setIsOffline,
    setLastCachedAt,
    setHasCloudConfigSheet,
    setCloudConfigSheetName,
    setConfigStorageMode
  });

  // `useOfflineSyncFeedback` necesita recargar los datos al vaciar su cola, y
  // este hook necesita sus setters de estado offline: el ciclo se rompe con un
  // ref, que el callback diferido lee en la sincronización (no en render).
  fetchDataRef.current = fetchData;

  // Redirección si la vista activa se desactiva globalmente en los módulos
  useEffect(() => {
    if (sheetConfig?.enabledModules && activeView !== 'main') {
      if (!isModuleEnabled(activeView, sheetConfig.enabledModules)) {
        setActiveView('main');
      }
    }
  }, [activeView, sheetConfig?.enabledModules]);

  const frcBodCol = useMemo<string | null>(() => {
    return findColumnBySemantic(headers, 'frc_bod') || 
           headers.find(h => {
             const clean = h.trim().toLowerCase();
             return /frc.*bod|bodega|destino|warehouse|^bod$/i.test(clean) || clean.includes('bod');
           }) || null;
  }, [headers]);

  const [draggedCol, setDraggedCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Capacidades de dominio de la hoja activa, derivadas de sus columnas: gobiernan qué UI
  // de dominio (conteo, pistoleo, columnas de estado, radar) se ofrece, en vez de asumir
  // por identidad de vista o nombre de pestaña. La corrección manual del usuario se aplica
  // encima, indexada por `activeView` (la misma clave que usan los slices; para hojas no
  // canónicas `activeView` es el título de la pestaña).
  const tableCapabilities = useMemo(
    () => resolveTableCapabilities(headers, sheetConfig.customAliases, sheetConfig.tableCapabilities?.[activeView]),
    [headers, sheetConfig.customAliases, sheetConfig.tableCapabilities, activeView]
  );

  const {
    isModalOpen,
    setIsModalOpen,
    editingItem,
    setEditingItem,
    formData,
    setFormData,
    formErrors,
    setFormErrors,
    selectedEventCategory,
    setSelectedEventCategory,
    handleOpenModal,
    handleOpenCopyModal,
    handleCloseModal,
    handleSelectEventCategory,
    validateForm,
    handleFormChange,
    handleBatchFormUpdate
  } = useItemFormManager({
    headers,
    activeSheet,
    canLogEvents: tableCapabilities.has('incidencia'),
    sheetConfig,
    products,
    policies,
    eventFilter,
    onBeforeOpen: () => setIsConfigOpen(false)
  });

  // Contextual intelligence for bulk actions on the current table
  const bulkActionCtx = useMemo(() => {
    return buildBulkActionContext(headers, activeView, activeSheet?.title, sheetConfig.tableCapabilities?.[activeView]);
  }, [headers, activeView, activeSheet?.title, sheetConfig.tableCapabilities]);


  // Column Resizing Custom Hook
  const activeSheetKey = activeSheet?.title || activeView;
  const {
    resizingCol,
    getColWidth,
    handleStartResize,
    handleAutoFitColumn,
    handleResetColWidths,
    hasCustomColWidths
  } = useColumnResize({
    activeSheetKey,
    items
  });

  // `saveConfig` se redefine en cada render, lo que hace cambiar de identidad a
  // los dos useCallback que lo listan como dependencia (handleSetGroupByColumn /
  // handleSetGroupByDirection). Estabilizarlo corta esa cadena.
  const saveConfig = useCallback((newConfig: SheetConfig) => {
    const configWithTimestamp: SheetConfig = {
      ...newConfig,
      updatedAt: new Date().toISOString()
    };
    setSheetConfig(configWithTimestamp);
    writeStorage(STORAGE_KEYS.SHEET_CONFIG, configWithTimestamp);

    // Auto-sync background push to Google Apps Script PropertiesService / Cloud Config if connected
    const scriptUrl = localStorage.getItem(STORAGE_KEYS.SCRIPT_URL)?.trim();
    if (scriptUrl) {
      saveScriptPropertiesConfig(configWithTimestamp).catch(err => {
        console.warn('Auto-sync ScriptProperties fallback to Cloud Sheet:', err);
        if (cloudConfigSheetName || hasCloudConfigSheet) {
          saveCloudConfig(configWithTimestamp, cloudConfigSheetName || '_CONFIG_APP').catch(() => {});
        }
      });
    }
  }, [cloudConfigSheetName, hasCloudConfigSheet]);

  const {
    globalTicketConfig,
    ticketPrintMode,
    itemsToPrintList,
    handleSaveTicketConfig,
    handlePrintTicket
  } = useTicketPrinting({
    sheetConfig,
    setSheetConfig,
    saveConfig,
    activeView,
    showToast,
    closeTicketConfig: () => setIsTicketConfigOpen(false)
  });

  // Centralized Column Manager Hook
  const {
    visibleHeaders,
    allManageableColumns,
    toggleVisibility,
    handleColumnDrop,
    moveColumn,
    showAllColumns,
    resetColumnOrder,
    setVisibleColumns,
    hiddenColumns
  } = useColumnManager({
    headers,
    activeSheetTitle: activeSheet?.title,
    activeView,
    tableCapabilities,
    sheetConfig
  });

  const columnLabelsMap = useMemo(() => {
    const map: Record<string, string> = {};
    VIRTUAL_COLUMNS.forEach(vc => {
      map[vc.id] = vc.label;
    });
    (sheetConfig.userVirtualColumns || []).forEach(uvc => {
      map[uvc.id] = uvc.label;
    });
    const schemaForSheet = activeSheet?.title ? sheetConfig.schema?.[activeSheet.title] : undefined;
    if (schemaForSheet) {
      Object.keys(schemaForSheet).forEach(colId => {
        if (schemaForSheet[colId]?.label) {
          map[colId] = schemaForSheet[colId].label;
        }
      });
    }
    return map;
  }, [activeSheet?.title, sheetConfig.schema, sheetConfig.userVirtualColumns]);

  const {
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    areFiltersVisible,
    setAreFiltersVisible,
    isSchemaLoading,
    setIsSchemaLoading,
    isSummaryView,
    tableDensity,
    setTableDensity,
    isZenMode,
    setIsZenMode,
    handleToggleSummaryView
  } = useDashboardChromeState({
    headers,
    setVisibleColumns,
    showAllColumns,
    showToast
  });

  const searchableHeaders = useMemo(() => {
    if (!activeSheet) return headers;
    const currentSchema = sheetConfig.schema?.[activeSheet.title];
    return headers.filter(h => {
      if (currentSchema && currentSchema[h] !== undefined) {
        return currentSchema[h].searchable !== false;
      }
      return true;
    });
  }, [headers, activeSheet, sheetConfig.schema]);

  // Unified filtering, metrics aggregation, virtual columns, and grouping hook
  const {
    toggleGroupByDirection,
    handleToggleSort,
    collapsedGroups,
    toggleGroupCollapse,
    expandAllGroups,
    collapseAllGroups,
    clearAllFilters: clearHookFilters,
    eventMetrics,
    domainItemsCount,
    pmMetrics,
    eventResolutionMetrics,
    frcBodValues,
    frcBodCounts,
    augmentedItems,
    columnOptionsMap,
    filteredItems,
    groupedItems,
    paginatedDisplayRows
  } = useInventoryFiltering({
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
  });

  // Contextual persistent grouping handlers per table
  const {
    handleSetGroupByColumn,
    handleSetGroupByDirection,
    effectiveVisibleHeaders
  } = useTableGrouping({
    activeSheetKey,
    headers,
    visibleHeaders,
    sheetConfig,
    saveConfig,
    groupByColumn,
    setGroupByColumn,
    setGroupByDirection
  });

  // Precomputed metadata for visible columns to prevent per-cell regex in 60fps virtualization
  const { visibleColumnMeta } = usePrecomputedColumns(headers, effectiveVisibleHeaders, frcBodCol);

  const hasActiveFilters = 
    searchTerm !== '' || 
    eventFilter.length > 0 || 
    frcBodFilter.length > 0 || 
    eventResolutionFilter.length > 0 || 
    pmRadarFilter.length > 0 || 
    dynamicMonthRange !== null ||
    dynamicMonthFilter.length > 0 ||
    activeQuickChip !== null ||
    Object.values(columnFilters).some((vals: string[]) => vals && vals.length > 0);

  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    setActiveQuickChip(null);
    clearHookFilters();
  }, [clearHookFilters, setSearchTerm, setActiveQuickChip]);

  // AppSheet Pattern: Slices / Vistas Personalizadas
  const {
    customSlices,
    hiddenSliceIds,
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
  } = useTableSlices({
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
  });

  // Auto-reset page when search terms or filter constraints change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeQuickChip, activeView]);


  // Unified TanStack virtualization hook
  const {
    tableContainerRef,
    virtualRows,
    paddingTop,
    paddingBottom,
    measureElement
  } = useTableVirtualization(paginatedDisplayRows);

  // Critical items for PM drainage report
  const drainageReportItems = useMemo(() => {
    // La capacidad manda: una hoja con columnas de vencimiento alimenta su propio informe.
    const source = tableCapabilities.has('vencimiento') ? items : allMainItems;
    return source.filter(item => {
      const cat = getEventCategory(item, Object.keys(item));
      if (cat !== 'VENCIMIENTO') return false;
      const st = getItemStatus(item, Object.keys(item));
      return st.code === 'DRAINAGE_PM' || st.code === 'UPCOMING' || st.code === 'RETIRE_NOW';
    });
  }, [items, allMainItems, tableCapabilities]);

  const quickChips = useMemo(() => {
    const chips: string[] = [];

    // La capacidad manda: los chips describen el dominio de la hoja, no su nombre.
    if (tableCapabilities.has('vencimiento')) {
      const batchCol = headers.find(h => /lote|batch/i.test(h));
      if (batchCol) {
        const topBatches = Array.from(new Set(items.map(i => i[batchCol]))).filter(Boolean).slice(0, 3);
        topBatches.forEach(b => chips.push(`Lote: ${b}`));
      }
      return chips;
    }

    if (tableCapabilities.has('incidencia')) {
      const respCol = headers.find(h => /responsable|usuario|creado_por|registrado/i.test(h));
      const originCol = headers.find(h => /origen|tienda|almac[eé]n/i.test(h));

      if (respCol) {
        const topResp = Array.from(new Set(items.map(i => i[respCol]))).filter(Boolean).slice(0, 2);
        topResp.forEach(r => chips.push(String(r)));
      }
      if (originCol) {
        const topOrigin = Array.from(new Set(items.map(i => i[originCol]))).filter(Boolean).slice(0, 2);
        topOrigin.forEach(o => chips.push(String(o)));
      }
      return chips;
    }

    // Catálogo: la hoja describe productos (SKU + descripción) sin fechas ni evento.
    // Se decide por capacidad, así una hoja ajena de catálogo también lo recibe.
    if (tableCapabilities.has('catalogo')) {
      const providerCol = headers.find(h => /proveedor|marca|fabricante/i.test(h));
      const categoryCol = headers.find(h => /categor[ií]a|familia|tipo/i.test(h));

      if (providerCol) {
        const topProviders = Array.from(new Set(items.map(i => i[providerCol]))).filter(Boolean).slice(0, 3);
        topProviders.forEach(p => chips.push(String(p)));
      }
      if (categoryCol) {
        const topCategories = Array.from(new Set(items.map(i => i[categoryCol]))).filter(Boolean).slice(0, 2);
        topCategories.forEach(c => chips.push(String(c)));
      }
      return chips;
    }

    return chips;
  }, [items, headers, tableCapabilities]);

  const {
    handleSaveQuickTraspaso,
    handleUniversalImportConfirmed,
    handleSyncRowsToVencimientos
  } = useInventoryIngestion({
    activeSheet,
    activeView,
    canExpire: tableCapabilities.has('vencimiento'),
    sheetConfig,
    headers,
    items,
    setItems,
    setAllMainItems,
    setProducts,
    setPolicies,
    setIsSaving: () => {},
    enqueueMutation,
    fetchData,
    showToast
  });

  const { handleApplyBulkEdit, handleBulkDelete, handleReconcileWithCatalog } = useInventoryBulkActions({
    activeSheet,
    activeView,
    sheetConfig,
    headers,
    items,
    allMainItems,
    products,
    policies,
    selectedRowIds,
    setSelectedRowIds,
    setItems,
    setAllMainItems,
    setIsSaving: () => {},
    enqueueMutation,
    fetchData
  });

  // Centralized Hook for Row/Pistoleo Mutations and Deletions
  const {
    isSaving,
    handleSave,
    handleSavePistoleoItem,
    handleDelete
  } = useInventoryMutations({
    activeSheet,
    activeView,
    tableCapabilities,
    sheetConfig,
    headers,
    items,
    allMainItems,
    products,
    policies,
    editingItem,
    formData,
    validateForm,
    setFormErrors,
    handleCloseModal,
    setItems,
    setAllMainItems,
    setProducts,
    setPolicies,
    enqueueMutation,
    fetchData,
    showToast,
    confirm,
    selectedEventCategory
  });

  useEffect(() => {
    fetchDataRef.current?.(sheetConfig, activeView, false);
    setSelectedRowIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  const handleSelectRow = useCallback((rowIndex: number, selected: boolean) => {
    setSelectedRowIds(prev => selected ? [...prev, rowIndex] : prev.filter(id => id !== rowIndex));
  }, []);

  const handleSelectGroupRows = useCallback((rowIndexes: number[], selected: boolean) => {
    setSelectedRowIds(prev => {
      const set = new Set(prev);
      if (selected) {
        rowIndexes.forEach(id => set.add(id));
      } else {
        rowIndexes.forEach(id => set.delete(id));
      }
      return Array.from(set);
    });
  }, []);

  const handleRowClick = useCallback((item: InventoryItem) => {
    setSelectedProduct(item);
  }, []);

  const handlePmRadarFilterClick = useCallback((targetFilter: string, isMulti: boolean) => {
    setPmRadarFilter(prev => handleFilterToggle(prev, targetFilter, isMulti));
  }, [setPmRadarFilter]);

  const handleEventResolutionFilterClick = useCallback((status: 'pending' | 'completed', isMulti: boolean) => {
    setEventResolutionFilter(prev => handleFilterToggle(prev, status, isMulti));
  }, [setEventResolutionFilter]);

  const handleEventFilterClick = useCallback((eventCat: EventCategory, isMulti: boolean) => {
    setEventFilter(prev => handleFilterToggle(prev, eventCat, isMulti));
  }, [setEventFilter]);

  const handleFrcBodFilterClick = useCallback((bodVal: string, isMulti: boolean) => {
    setFrcBodFilter(prev => handleFilterToggle(prev, bodVal, isMulti));
  }, [setFrcBodFilter]);

  if (loading && !metadata) {
    return <SkeletonLoader type="card" count={3} />;
  }

  const mappedSheets = VIEW_KEYS.map(k => sheetConfig[k]).filter(Boolean);
  const otherSheets = metadata?.sheets
    .map(s => s.properties.title)
    .filter((t: string) => !mappedSheets.includes(t) && !/^_/i.test(t.trim())) || [];

  const handleSetActiveView = useCallback((newView: string, searchOverride?: string) => {
    if (searchOverride !== undefined) {
      setSearchTermForView(newView, searchOverride);
    }
    setActiveView(newView);
  }, [setSearchTermForView]);

  const dashboardContextValue: DashboardContextType = {
    sheetConfig,
    setSheetConfig,
    saveConfig,
    metadata,
    activeSheet,
    activeView,
    setActiveView: handleSetActiveView,
    headers,
    visibleHeaders,
    products,
    policies,
    allMainItems,
    items,
    filteredItems,
    fetchData,
    showToast,

    selectedProduct,
    setSelectedProduct,
    handleDelete,
    handlePrintTicket,

    isModalOpen,
    setIsModalOpen,
    editingItem,
    setEditingItem,
    formData,
    setFormData,
    formErrors,
    setFormErrors,
    selectedEventCategory,
    setSelectedEventCategory,
    handleOpenModal,
    handleOpenCopyModal,
    handleCloseModal,
    handleSelectEventCategory,
    handleFormChange,
    handleBatchFormUpdate,
    handleSave,
    isSaving,

    drainageReportItems,



    searchTerm,
    setSearchTerm,

    handleSavePistoleoItem,

    selectedRowIds,
    handleApplyBulkEdit,



    allManageableColumns,
    toggleVisibility,
    moveColumn,
    showAllColumns,
    resetColumnOrder,
    handleColumnDrop,

    handleSaveQuickTraspaso,

    globalTicketConfig,
    handleSaveTicketConfig,

    handleUniversalImportConfirmed,


    currentTableSlices,
    sliceCounts,
    activeSliceId,
    hiddenSliceIds,
    handleSelectSlice,
    handleDeleteSlice,
    handleToggleSliceVisibility,
    handleSetBulkVisibility,
    currentFilters: {
      searchTerm,
      quickChip: activeQuickChip,
      eventFilter,
      pmRadarFilter,
      eventResolutionFilter,
      frcBodFilter,
      columnFilters,
      dynamicMonthFilter,
      dynamicMonthRange
    },
    sortConfig,
    groupByColumn,
    groupByDirection,
    handleSetGroupByColumn,
    handleSetGroupByDirection,
    handleSaveSlice,

    handleSyncRowsToVencimientos,

    offlineQueue,
    auditLog,
    isOffline,
    isSyncing: isBackgroundSyncing || isSyncingCloud,
    latencyMs,
    connectionStatus,
    lastHealthCheck,
    healthErrorMessage,
    scriptSupportsAtomicSave,
    testConnectionHealth,
    syncQueue,
    removeMutation,
    discardMutation,
    discardAllFailedMutations,
    retryMutation,
    retryAllFailedMutations,
    forkMutationAsAppend,
    failedMutations,
    failedCount,
    clearQueue,
    clearAuditLog,

    // Bulk Operations & Selection
    setSelectedRowIds,
    handleBulkDelete,
    handleReconcileWithCatalog,
    bulkActionCtx,
    tableCapabilities,
    columnLabelsMap,

    // View & Presentation Controls
    isZenMode,
    setIsZenMode,
    tableDensity,
    setTableDensity,
    isSummaryView,
    handleToggleSummaryView,
    areFiltersVisible,
    setAreFiltersVisible,
    hasCustomColWidths,
    handleResetColWidths,
    handleToggleStickyColumns,
    hiddenColumns,
    activeSlice,
    visibleTableSlices,
    customSlices,
    isRelationalActive,
    searchableHeaders,
    hasActiveFilters,
    clearAllFilters,
    lastCachedAt,
    handleSyncOfflineQueue,
    loading,
    error,

    // Sidebar & Navigation
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    otherSheets,

    // Filter Panels & Metrics
    quickChips,
    activeQuickChip,
    setActiveQuickChip,
    eventResolutionFilter,
    setEventResolutionFilter,
    handleFilterToggle,
    eventResolutionMetrics,
    eventFilter,
    setEventFilter,
    eventMetrics,
    domainItemsCount,
    frcBodValues,
    frcBodCounts,
    frcBodFilter,
    setFrcBodFilter,
    pmRadarFilter,
    setPmRadarFilter,
    pmMetrics,

    // Table Container & Virtualization
    effectiveVisibleHeaders,
    visibleColumnMeta,
    tableContainerRef,
    getColWidth,
    handleStartResize,
    handleAutoFitColumn,
    resizingCol,
    onSelectRow: handleSelectRow,
    onClickItem: handleRowClick,
    onDeleteRow: handleDelete,
    onPmRadarFilterClick: handlePmRadarFilterClick,
    onEventResolutionFilterClick: handleEventResolutionFilterClick,
    onEventFilterClick: handleEventFilterClick,
    onFrcBodFilterClick: handleFrcBodFilterClick,
    onOpenQuickTraspaso: handleOpenQuickTraspaso,
    onOpenWhatsApp: handleOpenWhatsApp,
    onOpenEmail: handleOpenEmail,
    isWhatsAppEnabled: isActionEnabledForTable('whatsapp', bulkActionCtx, sheetConfig),
    isEmailEnabled: isActionEnabledForTable('gmail', bulkActionCtx, sheetConfig),
    isCopyEnabled: isActionEnabledForTable('copy_edit', bulkActionCtx, sheetConfig),
    draggedCol,
    setDraggedCol,
    dragOverCol,
    setDragOverCol,
    columnFilters,
    setColumnFilters,
    columnOptionsMap,
    frcBodCol,
    virtualRows,
    paginatedDisplayRows,
    paddingTop,
    paddingBottom,
    onSelectGroupRows: handleSelectGroupRows,
    toggleGroupCollapse,
    measureElementRef: measureElement,
    handleToggleSort,
    expandAllGroups,
    collapseAllGroups,
    collapsedGroups,
    groupedItems,
    toggleGroupByDirection
  };

  return (
    <DashboardProvider value={dashboardContextValue}>
    <div className="flex h-full overflow-hidden bg-[#F8FAFC] dark:bg-slate-950 print:hidden">
      
      {/* DESKTOP SIDEBAR NAVIGATION */}
      {!isZenMode && (
        <div className="hidden lg:flex">
          <Sidebar />
        </div>
      )}

      {/* MOBILE SIDEBAR DRAWER */}
      <DashboardMobileDrawer />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* FLOATING ZEN FOCUS OVERLAY CONTROLS */}
        <ZenModeOverlay />

        {/* MACRO SEARCH NAV (Always top, sticky) */}
        {!isZenMode && (
          <DashboardTopNav />
        )}

        {/* DESKTOP ONLY CONTEXTUAL TOOLS */}
        <div className="hidden md:flex flex-col">
          {/* CONTEXTUAL PAGE HEADER (Unified Command & Slices Toolbar) */}
          {!isZenMode && (
            <DashboardPageHeader />
          )}

          {/* FILTERS & RADAR PANELS (Collapsible) */}
          {!isZenMode && (
            <DashboardFilterPanels />
          )}
        </div>

        {/* Content Body & Active View Routing (Modularized - Ponytail Protocol) */}
        <DashboardViewRouter
          configStorageMode={configStorageMode}
          hasCloudConfigSheet={hasCloudConfigSheet}
          cloudConfigSheetName={cloudConfigSheetName}
          syncSuccessMessage={syncSuccessMessage}
          isSyncingCloud={isSyncingCloud}
          isSchemaLoading={isSchemaLoading}
          setIsSchemaLoading={setIsSchemaLoading}
          handlePushPropertiesConfig={handlePushPropertiesConfig}
          handlePushCloudConfig={handlePushCloudConfig}
        />

        {/* FLOATING ACTION BAR (BULK ACTIONS) */}
        <FloatingBulkActionBar />

        {/* MOBILE ONLY FABs (Floating Action Buttons) */}
        <DashboardMobileFABs />
      </div>

      {/* WORKSPACE SIDE DRAWER */}
      <ViewConfigControlDrawer />

      {/* CENTRALIZED DASHBOARD MODALS AND DRAWERS (Consumes state from DashboardContext) */}
      <DashboardModalsManager />
    </div>

    {/* HIDDEN UNLESS PRINTING: TICKET PRINT VIEW */}
    <TicketPrintView 
      items={itemsToPrintList ?? []} 
      headers={headers} 
      config={globalTicketConfig[activeView] || sheetConfig.ticketPrintConfig?.[activeView] || {}} 
      activeView={activeView}
      mode={ticketPrintMode}
    />
    </DashboardProvider>
  );
};

export default InventoryDashboard;
