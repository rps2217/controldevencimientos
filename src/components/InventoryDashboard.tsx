import React, { useEffect, useState, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { appendRow, updateRow, deleteRow, saveCloudConfig, saveScriptPropertiesConfig, clearSheetsCache } from '../lib/sheets';
import { InventoryItem, SheetConfig, EventCategory, VIEW_KEYS } from '../types';
import { useItemFormManager } from '../hooks/useItemFormManager';
import { useModalsActions } from '../context/ModalsContext';
import { DashboardProvider, DashboardContextType } from '../context/DashboardContext';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle, Package } from 'lucide-react';

// Utilities & Hooks
import { getEventCategory, getItemStatus, parseLocaleNumber } from '../utils/dateCalculations';
import { rowToObject } from '../utils/pureCalculations';
import { findColumnBySemantic } from '../utils/columnAliases';
import { resolveTableCapabilities } from '../utils/sliceRegistry';
import { resolveItemIdentity } from '../utils/entityIdentityResolver';
import { 
  findExistingItemByCuVc
} from '../utils/cuVcConsolidator';
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
import { indexedDbService } from '../db/indexedDbService';
import { STORAGE_KEYS, readStorage, writeStorage, sheetConfigShapeSchema, isDemoMode } from '../utils/appStorage';

// Helpers para almacenamiento persistente y configuración modular
import { saveStoredDemoItems, mergeCloudConfigs, ModuleViewState } from '../utils/dashboardConfigUtils';
import { getErrorMessage } from '../utils/pureCalculations';
export { mergeCloudConfigs, type ModuleViewState };

// Modals & Drawers & Sub-components
import { Sidebar } from './navigation/Sidebar';
import { DashboardTopNav } from './navigation/DashboardTopNav';
import { DashboardPageHeader } from './navigation/DashboardPageHeader';
import { DashboardFilterPanels } from './views/DashboardFilterPanels';
import { SchemaEditorView } from './views/SchemaEditorView';
import { LazyFallback } from './common/LazyFallback';
import { FloatingBulkActionBar } from './dashboard/FloatingBulkActionBar';
import { DashboardModalsManager } from './dashboard/DashboardModalsManager';
import { ZenModeOverlay } from './dashboard/ZenModeOverlay';
import { DashboardMobileDrawer } from './dashboard/DashboardMobileDrawer';
import { DashboardMobileFABs } from './dashboard/DashboardMobileFABs';
import { DashboardTableContainer } from './dashboard/DashboardTableContainer';
import { ViewConfigControlDrawer } from './drawers/ViewConfigControlDrawer';
import { usePrecomputedColumns } from '../hooks/usePrecomputedColumns';
import { TicketPrintView } from './views/TicketPrintView';
import { buildBulkActionContext, isActionEnabledForTable } from '../utils/bulkActionsRegistry';
import { SkeletonLoader } from './common/SkeletonLoader';
import { useToast } from './common/ToastContainer';
import { useConfirm } from './common/ConfirmDialog';
import { useTableSlices } from '../hooks/useTableSlices';
import { useTableGrouping } from '../hooks/useTableGrouping';
import { useInventoryIngestion } from '../hooks/useInventoryIngestion';
import { useInventoryBulkActions } from '../hooks/useInventoryBulkActions';

const AnalyticsDashboard = lazy(() => import('./views/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));

export const InventoryDashboard: React.FC = () => {
  // Acciones de modales: identidad estable, no suscriben al estado.
  const {
    setIsConfigOpen, setIsScriptModalOpen, setIsTicketConfigOpen,
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
    setActiveSheet,
    headers,
    setHeaders,
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

  const frcBodCol = useMemo<string | null>(() => {
    return findColumnBySemantic(headers, 'frc_bod') || 
           headers.find(h => {
             const clean = h.trim().toLowerCase();
             return /frc.*bod|bodega|destino|warehouse|^bod$/i.test(clean) || clean.includes('bod');
           }) || null;
  }, [headers]);

  const [draggedCol, setDraggedCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

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

  const [isSaving, setIsSaving] = useState(false);

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
  }, [clearHookFilters]);

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


  const rowVirtualizer = useVirtualizer({
    count: paginatedDisplayRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => {
      const row = paginatedDisplayRows[index];
      const isMobile = window.innerWidth < 768;
      if (row && row.type === 'header') return isMobile ? 60 : 44;
      return isMobile ? 160 : 60;
    },
    overscan: 10,
  });
  
  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end 
    : 0;


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
    setIsSaving,
    enqueueMutation,
    fetchData,
    showToast
  });

  const { handleApplyBulkEdit, handleBulkDelete } = useInventoryBulkActions({
    activeSheet,
    activeView,
    sheetConfig,
    headers,
    items,
    allMainItems,
    selectedRowIds,
    setSelectedRowIds,
    setItems,
    setAllMainItems,
    setIsSaving,
    enqueueMutation,
    fetchData
  });

  useEffect(() => {
    fetchData(sheetConfig, activeView, false);
    setSelectedRowIds([]);
  }, [activeView]);
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSheet || headers.length === 0) return;

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    const originalItems = [...items];
    const originalMainItems = [...allMainItems];
    const isDemo = isDemoMode();
    
    try {
      setIsSaving(true);
      const now = new Date();
      const currentFormattedDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');

      // Intelligent CU_VC Collision Detection: solo donde la hoja tiene dominio de
      // vencimiento. El respaldo por nombre se conserva para no perder hojas de stock
      // que hoy si consolidan; lo que se elimina es la identidad `activeView === 'main'`.
      let targetExistingItem = editingItem;
      let isConsolidatingWithExisting = false;

      if (!targetExistingItem && (tableCapabilities.has('vencimiento') || /vencimiento|caducidad|stock/i.test(activeSheet.title))) {
        const matched = findExistingItemByCuVc(formData, items, headers, sheetConfig.customAliases);
        if (matched.exists && matched.existingItem) {
          targetExistingItem = matched.existingItem;
          isConsolidatingWithExisting = true;
        }
      }

      // If consolidating with an existing row, sum up the quantities!
      const mergedFormData = { ...formData };
      if (isConsolidatingWithExisting && targetExistingItem) {
        const qtyCol = findColumnBySemantic(headers, 'cantidad') || headers.find(h => /cant|stock|unidades/i.test(h));
        if (qtyCol) {
          const currentQty = parseLocaleNumber(targetExistingItem[qtyCol]);
          const addQty = parseLocaleNumber(formData[qtyCol]);
          mergedFormData[qtyCol] = String(currentQty + addQty);
        }
      }

      const rowValues = headers.map(h => {
        const val = mergedFormData[h] !== undefined && mergedFormData[h] !== null ? String(mergedFormData[h]) : '';
        const colSchema = sheetConfig.schema?.[activeSheet.title]?.[h];
        if (!val && (colSchema?.type === 'datetime' || /timestamp|created_at|fecha_creaci[oó]n|fecha_registro/i.test(h))) {
          return currentFormattedDateTime;
        }
        return val;
      });
      
      // Calculate row index safely
      const validRowIndexes = items.map(i => typeof i._rowIndex === 'number' ? i._rowIndex : parseInt(String(i._rowIndex || '0'), 10)).filter(n => !isNaN(n) && n > 0);
      const nextRowIndex = targetExistingItem ? (targetExistingItem._rowIndex || 2) : (validRowIndexes.length ? Math.max(...validRowIndexes) + 1 : 2);

      // Optimistic update
      const newItem: InventoryItem = { ...rowToObject(headers, rowValues), _rowIndex: nextRowIndex };

      const identityInfo = resolveItemIdentity(newItem, headers, activeSheet.title);
      newItem._entityKey = identityInfo.keyValue;
      newItem._entityKeyCol = identityInfo.keyColumn || undefined;
      newItem._isSyntheticKey = identityInfo.isSynthetic;
      
      let nextItems: InventoryItem[];
      if (targetExistingItem) {
        nextItems = items.map(item => item._rowIndex === targetExistingItem!._rowIndex ? newItem : item);
      } else {
        nextItems = [...items, newItem];
      }

      setItems(nextItems);
      if (activeView === 'main') setAllMainItems(nextItems);
      if (activeView === 'products') setProducts(nextItems);
      if (activeView === 'policies') setPolicies(nextItems);

      // Update persistent demo storage
      saveStoredDemoItems(activeView, nextItems);

      // Save to IndexedDB cached sheet
      try {
        const cachedRows = [headers, ...nextItems.map(it => headers.map(h => it[h] !== undefined && it[h] !== null ? String(it[h]) : ''))];
        await indexedDbService.saveCachedSheet(activeSheet.title, cachedRows);
      } catch (cacheErr) {
        console.warn('Error saving to IndexedDB:', cacheErr);
      }

      handleCloseModal();

      const isUpdate = Boolean(targetExistingItem && targetExistingItem._rowIndex && targetExistingItem._rowIndex > 1);
      const targetRowIndex = isUpdate ? targetExistingItem!._rowIndex : undefined;

      if (isDemo) {
        if (isConsolidatingWithExisting) {
          showToast('Registro consolidado con éxito: Se sumó la cantidad al vencimiento existente (Modo Local)', 'success', 'Consolidación Inteligente');
        } else {
          showToast(isUpdate ? 'Registro actualizado con éxito (Modo Local)' : 'Registro guardado con éxito (Modo Local)', 'success', 'Operación Exitosa');
        }
        return;
      }

      try {
        if (isUpdate && targetRowIndex) {
          await updateRow(activeSheet.title, targetRowIndex, rowValues, {
            entityKey: identityInfo.keyValue,
            keyValue: identityInfo.keyValue
          });
        } else {
          await appendRow(activeSheet.title, rowValues);
        }
        clearSheetsCache(activeSheet.title);
        if (isConsolidatingWithExisting) {
          showToast('Registro consolidado con éxito: Se sumó la cantidad en Google Sheets.', 'success', 'Consolidación Inteligente');
        } else {
          showToast(isUpdate ? 'Registro actualizado en Google Sheets con éxito.' : 'Registro guardado en Google Sheets con éxito.', 'success', 'Guardado');
        }
      } catch (saveErr) {
        console.warn('Network error during save, adding to offline queue:', saveErr);
        await enqueueMutation({
          type: isUpdate ? 'update' : 'append',
          sheetTitle: activeSheet.title,
          rowIndex: targetRowIndex,
          entityKey: identityInfo.keyValue,
          entityKeyCol: identityInfo.keyColumn || undefined,
          keyValue: identityInfo.keyValue,
          keyColumn: identityInfo.keyColumn || undefined,
          headers,
          values: rowValues
        });
        showToast('Sin conexión con Google Sheets. Los cambios se guardaron localmente en la cola offline.', 'info', 'Modo Offline');
      }
    } catch (err: unknown) {
      // Rollback
      setItems(originalItems);
      setAllMainItems(originalMainItems);
      showToast(`Error guardando datos (rollback aplicado): ${getErrorMessage(err)}`, 'error', 'Error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePistoleoItem = async (formPayload: Record<string, string>, targetExistingItem?: InventoryItem) => {
    if (!activeSheet || headers.length === 0) return;
    setIsSaving(true);
    try {
      const isDemo = isDemoMode();
      const now = new Date();
      const currentFormattedDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');

      const rowValues = headers.map(h => {
        const val = formPayload[h] !== undefined && formPayload[h] !== null ? String(formPayload[h]) : '';
        const colSchema = sheetConfig.schema?.[activeSheet.title]?.[h];
        if (!val && (colSchema?.type === 'datetime' || /timestamp|created_at|fecha_creaci[oó]n|fecha_registro/i.test(h))) {
          return currentFormattedDateTime;
        }
        return val;
      });

      const validRowIndexes = items.map(i => typeof i._rowIndex === 'number' ? i._rowIndex : parseInt(String(i._rowIndex || '0'), 10)).filter(n => !isNaN(n) && n > 0);
      const nextRowIndex = targetExistingItem ? (targetExistingItem._rowIndex || 2) : (validRowIndexes.length ? Math.max(...validRowIndexes) + 1 : 2);

      const newItem: InventoryItem = { ...rowToObject(headers, rowValues), _rowIndex: nextRowIndex };

      const identityInfo = resolveItemIdentity(newItem, headers, activeSheet.title);
      newItem._entityKey = identityInfo.keyValue;
      newItem._entityKeyCol = identityInfo.keyColumn || undefined;
      newItem._isSyntheticKey = identityInfo.isSynthetic;

      let nextItems: InventoryItem[];
      if (targetExistingItem && targetExistingItem._rowIndex) {
        nextItems = items.map(item => item._rowIndex === targetExistingItem._rowIndex ? newItem : item);
      } else {
        nextItems = [...items, newItem];
      }

      setItems(nextItems);
      if (activeView === 'main') setAllMainItems(nextItems);
      saveStoredDemoItems(activeView, nextItems);

      try {
        const cachedRows = [headers, ...nextItems.map(it => headers.map(h => it[h] !== undefined && it[h] !== null ? String(it[h]) : ''))];
        await indexedDbService.saveCachedSheet(activeSheet.title, cachedRows);
      } catch (cacheErr) {
        console.warn('Error saving pistoleo item to IndexedDB:', cacheErr);
      }

      if (isDemo) {
        showToast(targetExistingItem ? 'Registro de pistoleo actualizado' : 'Nuevo registro de pistoleo guardado', 'success', 'Pistoleo Exitoso');
        return;
      }

      if (targetExistingItem && targetExistingItem._rowIndex && targetExistingItem._rowIndex > 1) {
        try {
          await updateRow(activeSheet.title, targetExistingItem._rowIndex, rowValues, {
            entityKey: identityInfo.keyValue,
            keyValue: identityInfo.keyValue
          });
        } catch (err) {
          await enqueueMutation({
            type: 'update',
            sheetTitle: activeSheet.title,
            rowIndex: targetExistingItem._rowIndex,
            entityKey: identityInfo.keyValue,
            headers,
            values: rowValues
          });
        }
      } else {
        try {
          await appendRow(activeSheet.title, rowValues);
        } catch (err) {
          await enqueueMutation({
            type: 'append',
            sheetTitle: activeSheet.title,
            entityKey: identityInfo.keyValue,
            headers,
            values: rowValues
          });
        }
      }
      showToast('Cambios de pistoleo guardados en la nube', 'success', 'Sincronización');
    } catch (err: unknown) {
      showToast(`Error al guardar pistoleo: ${getErrorMessage(err)}`, 'error', 'Error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = useCallback(async (item: InventoryItem) => {
    if (!activeSheet) return;
    const confirmed = await confirm({ title: 'Eliminar fila', message: `¿Estás seguro de que deseas eliminar la fila ${item._rowIndex}? Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar' });
    if (!confirmed) return;

    const originalItems = [...items];
    const originalMainItems = [...allMainItems];
    const isDemo = isDemoMode();

    try {
      setIsSaving(true);
      
      const nextItems = items
        .filter(i => i._rowIndex !== item._rowIndex)
        .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));

      setItems(nextItems);
      saveStoredDemoItems(activeView, nextItems);

      if (activeView === 'main') {
        const nextMain = allMainItems
          .filter(i => i._rowIndex !== item._rowIndex)
          .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));
        setAllMainItems(nextMain);
        saveStoredDemoItems('main', nextMain);
      }

      if (isDemo) {
        showToast('Registro eliminado en modo demostración', 'success', 'Eliminación Completada');
      } else {
        const ident = resolveItemIdentity(item, headers, activeSheet.title);
        try {
          await deleteRow(activeSheet.sheetId, item._rowIndex as number, activeSheet.title, {
            entityKey: ident.keyValue,
            keyValue: ident.keyValue,
            entityKeyCol: ident.keyColumn || undefined,
          });
          showToast('Registro eliminado de Google Sheets', 'success', 'Eliminación Completada');
        } catch (delErr) {
          console.warn('Error al eliminar en la nube, agregando a cola offline:', delErr);
          await enqueueMutation({
            type: 'delete',
            sheetId: activeSheet.sheetId,
            sheetTitle: activeSheet.title,
            rowIndex: item._rowIndex as number,
            entityKey: ident.keyValue,
            entityKeyCol: ident.keyColumn || undefined,
            keyValue: ident.keyValue,
            keyColumn: ident.keyColumn || undefined,
            headers
          });
          showToast('Sin conexión. La eliminación se guardó localmente en cola offline.', 'info', 'Modo Offline');
        }
        await fetchData(sheetConfig, activeView, true);
      }
    } catch (err: unknown) {
      setItems(originalItems);
      setAllMainItems(originalMainItems);
      showToast(`Error al eliminar fila: ${getErrorMessage(err)}`, 'error', 'Error de Eliminación');
    } finally {
      setIsSaving(false);
    }
  }, [activeSheet, items, allMainItems, activeView, headers, sheetConfig, confirm, showToast, fetchData, setItems, setAllMainItems, enqueueMutation]);

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
  }, []);

  const handleEventResolutionFilterClick = useCallback((status: 'pending' | 'completed', isMulti: boolean) => {
    setEventResolutionFilter(prev => handleFilterToggle(prev, status, isMulti));
  }, []);

  const handleEventFilterClick = useCallback((eventCat: EventCategory, isMulti: boolean) => {
    setEventFilter(prev => handleFilterToggle(prev, eventCat, isMulti));
  }, []);

  const handleFrcBodFilterClick = useCallback((bodVal: string, isMulti: boolean) => {
    setFrcBodFilter(prev => handleFilterToggle(prev, bodVal, isMulti));
  }, []);

  if (loading && !metadata) {
    return <SkeletonLoader />;
  }

  const mappedSheets = VIEW_KEYS.map(k => sheetConfig[k]).filter(Boolean);
  const otherSheets = metadata?.sheets
    .map(s => s.properties.title)
    .filter((t: string) => !mappedSheets.includes(t) && !/^_/i.test(t.trim())) || [];

  const dashboardContextValue: DashboardContextType = {
    sheetConfig,
    setSheetConfig,
    saveConfig,
    metadata,
    activeSheet,
    activeView,
    setActiveView,
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
    measureElementRef: rowVirtualizer.measureElement,
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

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-2 md:p-6">
          {error && (
            <div className="mb-6 rounded-xl bg-red-50 p-4 border border-red-100">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <div className="ml-3 text-sm font-medium text-red-700">{error}</div>
              </div>
            </div>
          )}

          {activeView === 'schema' ? (
            <SchemaEditorView
              configStorageMode={configStorageMode}
              hasCloudConfigSheet={hasCloudConfigSheet}
              cloudConfigSheetName={cloudConfigSheetName}
              syncSuccessMessage={syncSuccessMessage}
              isSyncingCloud={isSyncingCloud}
              metadata={metadata}
              activeSheet={activeSheet}
              setActiveSheet={setActiveSheet}
              headers={headers}
              setHeaders={setHeaders}
              isSchemaLoading={isSchemaLoading}
              setIsSchemaLoading={setIsSchemaLoading}
              sheetConfig={sheetConfig}
              saveConfig={saveConfig}
              setIsScriptModalOpen={setIsScriptModalOpen}
              handlePushPropertiesConfig={handlePushPropertiesConfig}
              handlePushCloudConfig={handlePushCloudConfig}
              activeView={activeView}
            />
          ) : activeView === 'analytics' ? (
            <Suspense fallback={<LazyFallback />}>
              <AnalyticsDashboard items={filteredItems} headers={headers} />
            </Suspense>
          ) : !activeSheet && !loading ? (
            <div className="h-full w-full flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50 dark:bg-slate-900/60">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">Módulo sin asignar</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">Aún no has seleccionado qué pestaña de tu Google Sheet cumplirá esta función.</p>
                <button onClick={() => setIsConfigOpen(true)} className="mt-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm px-6 py-2.5 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                  Abrir Configuración
                </button>
              </div>
            </div>
          ) : (
            <DashboardTableContainer />
          )}

          {/* FLOATING ACTION BAR (BULK ACTIONS) */}
          <FloatingBulkActionBar />

          {/* MOBILE ONLY FABs (Floating Action Buttons) */}
          <DashboardMobileFABs />
        </div>
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
