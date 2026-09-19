import React, { useEffect, useState, useMemo, useRef, useDeferredValue, useCallback } from 'react';
import { 
  getSpreadsheetMetadata, 
  getSheetData, 
  getAllSheetsData,
  appendRow, 
  updateRow, 
  deleteRow,
  deleteRows,
  saveCloudConfig,
  loadCloudConfig,
  getScriptPropertiesConfig,
  saveScriptPropertiesConfig,
  clearSheetsCache
} from '../lib/sheets';
import { 
  InventoryItem, 
  SpreadsheetMetadata, 
  SheetProperties, 
  SheetConfig, 
  EventCategory,
  SortConfig,
  DynamicMonthRange
} from '../types';
import { useItemFormManager } from '../hooks/useItemFormManager';
import { DashboardProvider, DashboardContextType } from '../context/DashboardContext';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Plus, Edit2, Trash2, RefreshCw, Loader2, Database, AlertCircle, Package, 
  FileSpreadsheet, Printer, Barcode, Settings, FileText, Search, X, Truck, RotateCcw, 
  PackageX, Sparkles, Clock, Clock3, Flame, AlertTriangle, CheckCircle2, FilterX, 
  Sliders, Link2, Download, CheckSquare, Square, Columns, Eye, EyeOff, ArrowUp, ArrowDown, Menu, Scan, GripVertical, Tag, Mail, MessageSquare, ChevronDown, Check, MoreVertical, Building2, Maximize2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Utilities & Hooks
import { 
  EVENT_CATEGORIES, 
  renderEventIcon, 
  parseAnyDate, 
  formatInputDate,
  formatInputDateTime,
  getEventCategory, 
  getItemStatus,
  getCategoryFromEventValue,
  getItemResolutionStatus,
  parseLocaleNumber
} from '../utils/dateCalculations';
import { findColumnBySemantic } from '../utils/columnAliases';
import { resolveItemIdentity, matchRowIndexByIdentity } from '../utils/entityIdentityResolver';
import { findMasterProduct, dereferenceMasterProduct, autoCalculateItemFormData } from '../utils/referenceResolver';
import { 
  findExistingItemByCuVc, 
  reconcileImportWithInventory, 
  ImportConsolidationMode 
} from '../utils/cuVcConsolidator';
import { VIRTUAL_COLUMNS } from '../utils/virtualColumns';
import { useColumnResize } from '../hooks/useColumnResize';
import { useColumnManager } from '../hooks/useColumnManager';
import { useInventoryFiltering, handleFilterToggle, DisplayRow } from '../hooks/useInventoryFiltering';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useModuleViewState } from '../hooks/useModuleViewState';
import { indexedDbService } from '../db/indexedDbService';
import { 
  SAMPLE_HEADERS, 
  SAMPLE_ITEMS, 
  SAMPLE_EVENTS_HEADERS,
  SAMPLE_EVENTS_ITEMS,
  SAMPLE_PRODUCTS, 
  SAMPLE_POLICIES 
} from '../data/sampleInventory';

// Helpers para almacenamiento persistente y configuración modular
import {
  getStoredDemoItems,
  saveStoredDemoItems,
  mergeCloudConfigs,
  ModuleViewState,
  DEFAULT_MODULE_STATE
} from '../utils/dashboardConfigUtils';
export { mergeCloudConfigs, type ModuleViewState };

// Modals & Drawers & Sub-components
import { InventoryTable } from './InventoryTable';
import { Sidebar } from './navigation/Sidebar';
import { DashboardTopNav } from './navigation/DashboardTopNav';
import { DashboardPageHeader } from './navigation/DashboardPageHeader';
import { DashboardFilterPanels } from './views/DashboardFilterPanels';
import { SchemaEditorView } from './views/SchemaEditorView';
import { AnalyticsDashboard } from './views/AnalyticsDashboard';
import { FloatingBulkActionBar } from './dashboard/FloatingBulkActionBar';
import { DashboardModalsManager } from './dashboard/DashboardModalsManager';
import { ZenModeOverlay } from './dashboard/ZenModeOverlay';
import { DashboardMobileDrawer } from './dashboard/DashboardMobileDrawer';
import { DashboardMobileFABs } from './dashboard/DashboardMobileFABs';
import { DashboardTableContainer } from './dashboard/DashboardTableContainer';
import { exportToExcel } from '../utils/exportUtils';
import { EventResolutionCards } from './views/EventResolutionCards';
import { EventFilterChips } from './views/EventFilterChips';
import { PmRadarCards } from './views/PmRadarCards';
import { ColumnFilterMenu } from './views/ColumnFilterMenu';
import { InventoryTableRow } from './views/InventoryTableRow';
import { ViewConfigControlDrawer } from './drawers/ViewConfigControlDrawer';
import { usePrecomputedColumns } from '../hooks/usePrecomputedColumns';
import { TicketPrintView } from './views/TicketPrintView';
import { buildBulkActionContext, isActionEnabledForTable } from '../utils/bulkActionsRegistry';
import { 
  loadTicketConfigFromStorage, 
  saveTicketConfigToStorage,
  executeThermalPrint
} from '../utils/ticketUtils';
import { GlobalTicketConfig, ViewTicketConfig, TableSlice } from '../types';
import { SkeletonLoader } from './common/SkeletonLoader';
import { useToast } from './common/ToastContainer';
import { useTableSlices } from '../hooks/useTableSlices';
import { SliceSelectorBar } from './slices/SliceSelectorBar';

export const InventoryDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast, updateToast } = useToast();
  const [metadata, setMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetProperties | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [allMainItems, setAllMainItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [isRelationalActive, setIsRelationalActive] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isStockCountOpen, setIsStockCountOpen] = useState<boolean>(false);
  
  // Storage & Cloud Sync Status
  const [hasCloudConfigSheet, setHasCloudConfigSheet] = useState<boolean>(false);
  const [cloudConfigSheetName, setCloudConfigSheetName] = useState<string>('_CONFIG_APP');
  const [configStorageMode, setConfigStorageMode] = useState<'properties' | 'sheet' | 'local'>('local');
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Advanced features: Pagination, Offline Cache & Concurrency
  const [pageSize, setPageSize] = useState<number | 'all'>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isSyncAuditOpen, setIsSyncAuditOpen] = useState<boolean>(false);

  // Local-First IndexedDB Offline Sync Hook with Transition Refs
  const prevIsOfflineRef = useRef<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const activeSyncToastIdRef = useRef<string | null>(null);

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
    clearAuditLog
  } = useOfflineSync(async (syncedCount?: number) => {
    await fetchData(sheetConfig, activeView, true);

    // Auto-sync visual feedback toast resolution upon recovering connection
    if (activeSyncToastIdRef.current) {
      const count = syncedCount || offlineQueue.length || 1;
      updateToast(
        activeSyncToastIdRef.current,
        `¡Sincronización automática completada! Se subieron ${count} cambios pendientes y tus datos ya están reflejados en Google Sheets.`,
        'success',
        'Datos Sincronizados',
        4000
      );
      activeSyncToastIdRef.current = null;
    } else if (syncedCount && syncedCount > 0) {
      // Background sync succeeded without a preceding offline transition (e.g. periodic sync)
      showToast(
        `Se subieron automáticamente ${syncedCount} cambios pendientes en segundo plano.`,
        'success',
        'Sincronización en Segundo Plano'
      );
    }
  });

  // Track transitions of connection status to show high-quality informative toasts
  useEffect(() => {
    if (prevIsOfflineRef.current !== isOffline) {
      if (isOffline) {
        // Online -> Offline transition
        showToast(
          'Sin conexión a Internet. Cambiando de forma segura a modo local. Puedes continuar registrando datos sin problemas.',
          'warning',
          'Modo Local Activo'
        );
      } else {
        // Offline -> Online transition
        if (offlineQueue.length > 0) {
          // Sync is automatically triggered by handleOnline in useOfflineSync.ts
          const toastId = showToast(
            `¡Conexión recuperada! Sincronizando de forma automática ${offlineQueue.length} cambios guardados localmente...`,
            'loading',
            'Sincronizando Cambios',
            0 // Persistent toast until resolved
          );
          activeSyncToastIdRef.current = toastId;
        } else {
          showToast(
            '¡Conexión restablecida con éxito! La aplicación se encuentra en línea y conectada.',
            'success',
            'Conexión Recuperada'
          );
        }
      }
      prevIsOfflineRef.current = isOffline;
    }
  }, [isOffline, offlineQueue.length, showToast, updateToast]);

  // Background Stale-While-Revalidate Sync Indicator
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState<boolean>(false);

  const handleSyncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    const toastId = showToast(`Sincronizando ${offlineQueue.length} cambios pendientes con Google Sheets...`, 'loading', 'Sincronización', 0);
    try {
      const res = await syncQueue();
      if (res && res.success) {
        showToast(`¡Se sincronizaron exitosamente ${res.count} mutaciones en Google Sheets!`, 'success', 'Sincronización Exitosa');
      } else if (res && res.errors && res.errors.length > 0) {
        showToast(`Hubo errores al sincronizar: ${res.errors.join(', ')}`, 'error', 'Sincronización Parcial');
      }
    } catch (err: any) {
      showToast(`Error sincronizando cola offline: ${err.message}`, 'error', 'Error de Sincronización');
    }
  };

  const [activeView, setActiveView] = useState<string>('main');

  // Search, Selection and Scoped Module States via useModuleViewState Hook
  const {
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
    setGroupByDirection
  } = useModuleViewState({ activeView });

  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);
  const [quickTraspasoItem, setQuickTraspasoItem] = useState<InventoryItem | null>(null);
  const [isQuickTraspasoOpen, setIsQuickTraspasoOpen] = useState<boolean>(false);

  const frcBodCol = useMemo(() => {
    return findColumnBySemantic(headers, 'frc_bod') || 
           headers.find(h => {
             const clean = h.trim().toLowerCase();
             return /frc.*bod|bodega|destino|warehouse|^bod$/i.test(clean) || clean.includes('bod');
           });
  }, [headers]);

  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false);
  const [draggedCol, setDraggedCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Sheet configuration state
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>(() => {
    try {
      const saved = localStorage.getItem('appsheet_clone_config');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(true);
  const [areFiltersVisible, setAreFiltersVisible] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [isPmReportOpen, setIsPmReportOpen] = useState(false);
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);

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
    activeView,
    sheetConfig,
    products,
    policies,
    eventFilter,
    onBeforeOpen: () => setIsConfigOpen(false)
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isMobilePistoleoOpen, setIsMobilePistoleoOpen] = useState(false);
  const [globalTicketConfig, setGlobalTicketConfig] = useState<GlobalTicketConfig>(() => {
    return loadTicketConfigFromStorage();
  });
  const [isTicketConfigOpen, setIsTicketConfigOpen] = useState(false);
  const [ticketPrintMode, setTicketPrintMode] = useState<'standard' | 'barcode'>('standard');
  const [itemsToPrintList, setItemsToPrintList] = useState<InventoryItem[] | null>(null);
  const [isGmailModalOpen, setIsGmailModalOpen] = useState(false);
  const [gmailModalItems, setGmailModalItems] = useState<any[]>([]);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppModalItems, setWhatsAppModalItems] = useState<any[]>([]);
  const [isBulkActionsConfigOpen, setIsBulkActionsConfigOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState<boolean>(false);
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact' | 'ultra'>(() => {
    try {
      const saved = localStorage.getItem('app_table_density');
      return (saved as 'comfortable' | 'compact' | 'ultra') || 'compact';
    } catch {
      return 'compact';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('app_table_density', tableDensity);
    } catch {
      // ignore
    }
  }, [tableDensity]);

  // Contextual intelligence for bulk actions on the current table
  const bulkActionCtx = useMemo(() => {
    return buildBulkActionContext(headers, activeView, activeSheet?.title);
  }, [headers, activeView, activeSheet?.title]);

  // Close menus on click outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#actions-dropdown-btn') && !target.closest('#actions-dropdown-menu')) {
        setIsActionsMenuOpen(false);
      }
      if (!target.closest('#view-dropdown-btn') && !target.closest('#view-dropdown-menu')) {
        setIsViewMenuOpen(false);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Sync ticket print config if sheetConfig updates from cloud
  useEffect(() => {
    if (sheetConfig.ticketPrintConfig) {
      setGlobalTicketConfig(prev => ({
        ...prev,
        ...sheetConfig.ticketPrintConfig
      }));
    }
  }, [sheetConfig.ticketPrintConfig]);

  const handleSaveTicketConfig = (view: string, viewConfig: ViewTicketConfig) => {
    setGlobalTicketConfig(prev => {
      const updated = { ...prev, [view]: viewConfig };
      saveTicketConfigToStorage(updated);
      
      const updatedSheetConfig: SheetConfig = {
        ...sheetConfig,
        ticketPrintConfig: updated
      };
      setSheetConfig(updatedSheetConfig);
      saveConfig(updatedSheetConfig);

      showToast(`Configuración de ticket para "${view}" guardada exitosamente`, 'success', 'Ticket Térmico');
      return updated;
    });
    setIsTicketConfigOpen(false);
  };

  const handlePrintTicket = (itemsToPrint: InventoryItem[], mode: 'standard' | 'barcode' = 'standard') => {
    if (itemsToPrint.length === 0) {
      alert("No hay registros para imprimir.");
      return;
    }
    setItemsToPrintList(itemsToPrint);
    setTicketPrintMode(mode);

    // Retrieve active thermal config to pass exact paperWidth, orientation and cutMarginMm
    const activeConfig = (globalTicketConfig[activeView] || sheetConfig.ticketPrintConfig?.[activeView] || {}) as any;
    const generalSettings = activeConfig.general || activeConfig;
    const paperWidth = generalSettings.paperWidth || '80mm';
    const orientation = generalSettings.orientation || 'portrait';
    const cutMarginMm = generalSettings.cutMarginMm !== undefined ? Number(generalSettings.cutMarginMm) : 2;

    // Execute thermal print with precise height calculation and explicit vertical orientation
    executeThermalPrint({
      elementId: 'thermal-ticket-root',
      paperWidth,
      orientation,
      cutMarginMm
    });
  };

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

  const saveConfig = (newConfig: SheetConfig) => {
    const configWithTimestamp: SheetConfig = {
      ...newConfig,
      updatedAt: new Date().toISOString()
    };
    setSheetConfig(configWithTimestamp);
    try {
      localStorage.setItem('appsheet_clone_config', JSON.stringify(configWithTimestamp));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }

    // Auto-sync background push to Google Apps Script PropertiesService / Cloud Config if connected
    const scriptUrl = localStorage.getItem('appsheet_clone_scriptUrl')?.trim();
    if (scriptUrl) {
      saveScriptPropertiesConfig(configWithTimestamp).catch(err => {
        console.warn('Auto-sync ScriptProperties fallback to Cloud Sheet:', err);
        if (cloudConfigSheetName || hasCloudConfigSheet) {
          saveCloudConfig(configWithTimestamp, cloudConfigSheetName || '_CONFIG_APP').catch(() => {});
        }
      });
    }
  };

  // Push config to Google Apps Script PropertiesService (Option 2 - Zero Extra Sheets)
  const handlePushPropertiesConfig = async () => {
    try {
      setIsSyncingCloud(true);
      await saveScriptPropertiesConfig(sheetConfig);
      setConfigStorageMode('properties');
      setSyncSuccessMessage('¡Configuración guardada en la Nube con PropertiesService (Opción 2)!');
      setTimeout(() => setSyncSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(`Error al guardar en PropertiesService: ${err.message}. Verifica haber pegado el código actualizado en Apps Script.`);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Push config to Google Sheet hidden tab (Option 1)
  const handlePushCloudConfig = async () => {
    try {
      setIsSyncingCloud(true);
      const targetSheet = cloudConfigSheetName || '_CONFIG_APP';
      await saveCloudConfig(sheetConfig, targetSheet);
      setHasCloudConfigSheet(true);
      setConfigStorageMode('sheet');
      setSyncSuccessMessage('¡Configuración guardada con éxito en la pestaña ' + targetSheet + '!');
      setTimeout(() => setSyncSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(`Error al guardar en la nube: ${err.message}`);
    } finally {
      setIsSyncingCloud(false);
    }
  };

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
    columnOrders,
    hiddenColumns
  } = useColumnManager({
    headers,
    activeSheetTitle: activeSheet?.title,
    activeView,
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

  const [isSummaryView, setIsSummaryView] = useState<boolean>(false);
  const [isZenMode, setIsZenMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('app_zen_mode');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('app_zen_mode', JSON.stringify(isZenMode));
    } catch {
      // ignore quota / security error
    }
  }, [isZenMode]);

  // Zen Mode Keyboard Shortcut (Escape to exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isZenMode) {
        setIsZenMode(false);
        showToast('Modo Zen desactivado', 'info', 'Enfoque');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZenMode, showToast]);

  const handleToggleSummaryView = useCallback(() => {
    if (!isSummaryView) {
      const keyCols = headers.filter(h => {
        const clean = h.toLowerCase();
        return /sku|código|codigo|descrip|producto|cant|unidades|stock|vencimiento|fecha_vc|pol[ií]tica|estado/i.test(clean);
      });
      if (keyCols.length > 0) {
        setVisibleColumns(keyCols);
      }
      setIsSummaryView(true);
      showToast('Vista Resumida activada: mostrando columnas indispensables', 'info', 'Densidad de Vista');
    } else {
      showAllColumns();
      setIsSummaryView(false);
      showToast('Vista Completa activada: mostrando todas las columnas', 'info', 'Densidad de Vista');
    }
  }, [isSummaryView, headers, setVisibleColumns, showAllColumns, showToast]);

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
    deferredSearchTerm,
    toggleGroupByDirection,
    handleToggleSort,
    collapsedGroups,
    toggleGroupCollapse,
    expandAllGroups,
    collapseAllGroups,
    clearAllFilters: clearHookFilters,
    eventMetrics,
    pmMetrics,
    eventResolutionMetrics,
    frcBodValues,
    frcBodCounts,
    augmentedItems,
    columnOptionsMap,
    filteredItems,
    groupedItems,
    displayRows,
    paginatedDisplayRows
  } = useInventoryFiltering({
    items,
    headers,
    activeView: activeView as any,
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
  const handleSetGroupByColumn = useCallback((col: string) => {
    setGroupByColumn(col);
    const prevSetting = sheetConfig.tableGroupings?.[activeSheetKey] || {};
    const updatedGroupings = {
      ...(sheetConfig.tableGroupings || {}),
      [activeSheetKey]: {
        ...prevSetting,
        groupByColumn: col,
      }
    };
    saveConfig({
      ...sheetConfig,
      tableGroupings: updatedGroupings
    });
  }, [activeSheetKey, sheetConfig, saveConfig, setGroupByColumn]);

  const handleSetGroupByDirection = useCallback((dir: 'asc' | 'desc') => {
    setGroupByDirection(dir);
    const prevSetting = sheetConfig.tableGroupings?.[activeSheetKey] || {};
    const updatedGroupings = {
      ...(sheetConfig.tableGroupings || {}),
      [activeSheetKey]: {
        ...prevSetting,
        groupByDirection: dir,
      }
    };
    saveConfig({
      ...sheetConfig,
      tableGroupings: updatedGroupings
    });
  }, [activeSheetKey, sheetConfig, saveConfig, setGroupByDirection]);

  const handleToggleGroupByDirection = useCallback(() => {
    const nextDir = groupByDirection === 'asc' ? 'desc' : 'asc';
    handleSetGroupByDirection(nextDir);
  }, [groupByDirection, handleSetGroupByDirection]);

  // Load contextual table grouping whenever activeSheetKey changes or on mount
  useEffect(() => {
    const saved = sheetConfig.tableGroupings?.[activeSheetKey];
    if (saved && saved.groupByColumn) {
      const col = saved.groupByColumn;
      const dir = saved.groupByDirection || 'asc';
      const isVirtual = VIRTUAL_COLUMNS.some(v => v.label === col || v.id === col);
      const isHeader = headers.includes(col);
      if (col === 'none' || isHeader || isVirtual) {
        setGroupByColumn(col);
        setGroupByDirection(dir);
      } else {
        setGroupByColumn('none');
        setGroupByDirection('asc');
      }
    } else {
      setGroupByColumn('none');
      setGroupByDirection('asc');
    }
  }, [activeSheetKey, headers, setGroupByColumn, setGroupByDirection]);

  // Effective visible headers: when grouping by a column, hide that column from table body to reduce cognitive clutter
  const effectiveVisibleHeaders = useMemo(() => {
    if (groupByColumn && groupByColumn !== 'none') {
      return visibleHeaders.filter(h => h !== groupByColumn);
    }
    return visibleHeaders;
  }, [visibleHeaders, groupByColumn]);

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

  const totalPages = pageSize === 'all' || groupByColumn !== 'none' ? 1 : Math.ceil(filteredItems.length / (pageSize as number)) || 1;

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
    const source = activeView === 'main' ? items : allMainItems;
    return source.filter(item => {
      const cat = getEventCategory(item, Object.keys(item));
      if (cat !== 'VENCIMIENTO') return false;
      const st = getItemStatus(item, Object.keys(item));
      return st.code === 'DRAINAGE_PM' || st.code === 'UPCOMING' || st.code === 'RETIRE_NOW';
    });
  }, [items, allMainItems, activeView]);

  const quickChips = useMemo(() => {
    if (activeView === 'products') {
      const providerCol = headers.find(h => /proveedor|marca|fabricante/i.test(h));
      const categoryCol = headers.find(h => /categor[ií]a|familia|tipo/i.test(h));
      const chips = [];
      
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
    if (activeView === 'events') {
      const respCol = headers.find(h => /responsable|usuario|creado_por|registrado/i.test(h));
      const originCol = headers.find(h => /origen|tienda|almac[eé]n/i.test(h));
      const chips = [];
      
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
    if (activeView === 'main') {
      const batchCol = headers.find(h => /lote|batch/i.test(h));
      const chips = [];
      if (batchCol) {
        // Just extract some common distinct batches if any
        const topBatches = Array.from(new Set(items.map(i => i[batchCol]))).filter(Boolean).slice(0, 3);
        topBatches.forEach(b => chips.push(`Lote: ${b}`));
      }
      return chips;
    }
    return [];
  }, [items, headers, activeView]);

  const fetchData = async (currentConfig = sheetConfig, currentView = activeView, forceRefresh = false) => {
    let hasRenderedCache = false;
    try {
      const scriptUrl = localStorage.getItem('appsheet_clone_scriptUrl');
      if (!scriptUrl || !scriptUrl.trim()) {
        throw new Error('No script URL configured, loading demo mode');
      }

      setError(null);

      // =========================================================================
      // FASE 1: STALE-WHILE-REVALIDATE (Renderizado Instantáneo desde IndexedDB - 0ms)
      // =========================================================================
      const expectedTargetSheet = 
        (currentView === 'main' || currentView === 'analytics') ? (currentConfig.main || 'Vencimientos_Inventario') :
        currentView === 'events' ? (currentConfig.events || 'FRC') :
        currentView === 'products' ? (currentConfig.products || 'Catalogo_Productos') :
        currentView === 'policies' ? (currentConfig.policies || 'Politicas_Canje') :
        currentView;

      if (!forceRefresh) {
        try {
          const cachedTarget = await indexedDbService.getCachedSheet(expectedTargetSheet);
          if (cachedTarget && cachedTarget.rows && cachedTarget.rows.length > 0) {
            const h = cachedTarget.rows[0];
            setHeaders(h);
            const schemaKeys = Object.entries(currentConfig.schema?.[expectedTargetSheet] || {})
              .filter(([_, conf]) => Boolean((conf as any)?.isKey))
              .map(([colName]) => colName);

            const parsed = cachedTarget.rows.slice(1).map((row: string[], idx: number) => {
              const it: InventoryItem = { _rowIndex: idx + 2 };
              h.forEach((header: string, ci: number) => {
                it[header] = row[ci] || '';
              });
              const identity = resolveItemIdentity(it, h, expectedTargetSheet, schemaKeys);
              it._entityKey = identity.keyValue;
              it._entityKeyCol = identity.keyColumn || undefined;
              it._isSyntheticKey = identity.isSynthetic;
              return it;
            });

            setItems(parsed);
            if (currentView === 'main') setAllMainItems(parsed);
            setLastCachedAt(cachedTarget.timestamp);
            hasRenderedCache = true;
            setLoading(false); // Cero espera visual para el usuario
          }

          // Cargar productos y políticas relacionales cacheados en 0ms
          const prodTitle = currentConfig.products || 'Catalogo_Productos';
          const cachedProds = await indexedDbService.getCachedSheet(prodTitle);
          if (cachedProds && cachedProds.rows && cachedProds.rows.length > 1) {
            const ph = cachedProds.rows[0];
            setProducts(cachedProds.rows.slice(1).map((r: string[]) => {
              const obj: any = {};
              ph.forEach((header: string, i: number) => obj[header] = r[i] || '');
              return obj;
            }));
            setIsRelationalActive(true);
          }

          const polTitle = currentConfig.policies || 'Politicas_Canje';
          const cachedPols = await indexedDbService.getCachedSheet(polTitle);
          if (cachedPols && cachedPols.rows && cachedPols.rows.length > 1) {
            const polH = cachedPols.rows[0];
            setPolicies(cachedPols.rows.slice(1).map((r: string[]) => {
              const obj: any = {};
              polH.forEach((header: string, i: number) => obj[header] = r[i] || '');
              return obj;
            }));
            setIsRelationalActive(true);
          }
        } catch (cacheErr) {
          console.warn('[Cache] Error al leer caché inicial IndexedDB:', cacheErr);
        }
      }

      if (!hasRenderedCache) {
        setLoading(true);
      }
      setIsBackgroundSyncing(true);

      // =========================================================================
      // FASE 2: REVALIDACIÓN CON GOOGLE SHEETS (Batch Fetching en 1 Solo Viaje)
      // =========================================================================
      const meta = await getSpreadsheetMetadata(forceRefresh);
      setMetadata(meta);
      const allSheets = meta.sheets.map((s: any) => s.properties.title);
      
      // 1. Opción 2: Script Properties (PropertiesService)
      let foundRemoteConfig = false;
      let remoteConfigToMerge: SheetConfig | null = null;
      try {
        const propConfig = await getScriptPropertiesConfig(forceRefresh);
        if (propConfig && (propConfig.schema || propConfig.main || propConfig.slices)) {
          remoteConfigToMerge = propConfig;
          setConfigStorageMode('properties');
          foundRemoteConfig = true;
        }
      } catch (e) {
        console.warn('PropertiesService config check:', e);
      }

      // 2. Si no está en Script Properties, verificar pestaña técnica _CONFIG_APP
      const configSheet = allSheets.find((t: string) => /^_CONFIG(_APP)?$|^_APP_CONFIG$/i.test(t.trim()));
      if (configSheet) {
        setHasCloudConfigSheet(true);
        setCloudConfigSheetName(configSheet);
        if (!foundRemoteConfig) {
          try {
            const cloudConf = await loadCloudConfig(configSheet);
            if (cloudConf && (cloudConf.schema || cloudConf.main || cloudConf.slices)) {
              remoteConfigToMerge = cloudConf;
              setConfigStorageMode('sheet');
              foundRemoteConfig = true;
            }
          } catch (e) {
            console.warn('Error loading cloud config from sheet:', e);
          }
        }
      } else {
        setHasCloudConfigSheet(false);
        if (!foundRemoteConfig) {
          setConfigStorageMode('local');
        }
      }

      if (remoteConfigToMerge) {
        currentConfig = mergeCloudConfigs(currentConfig, remoteConfigToMerge);
        try {
          localStorage.setItem('appsheet_clone_config', JSON.stringify(currentConfig));
        } catch {}
      }

      let mainSheetTitle = currentConfig.main || allSheets.find((t: string) => /vencimiento|caducidad/i.test(t)) || allSheets[0];
      let eventsSheetTitle = currentConfig.events || allSheets.find((t: string) => /^frc$|evento|incidencia|averia|merma|diferencia|transporte/i.test(t));
      let prodSheetTitle = currentConfig.products || allSheets.find((t: string) => /producto/i.test(t));
      let polSheetTitle = currentConfig.policies || allSheets.find((t: string) => /política|politica|canje/i.test(t));
      
      if (!currentConfig.main && mainSheetTitle) currentConfig.main = mainSheetTitle;
      if (!currentConfig.events && eventsSheetTitle) currentConfig.events = eventsSheetTitle;
      if (!currentConfig.products && prodSheetTitle) currentConfig.products = prodSheetTitle;
      if (!currentConfig.policies && polSheetTitle) currentConfig.policies = polSheetTitle;
      if (currentConfig !== sheetConfig) {
        setSheetConfig(currentConfig);
        localStorage.setItem('appsheet_clone_config', JSON.stringify(currentConfig));
      }
      
      // Determinar hoja objetivo para la vista activa
      let targetSheetTitle = '';
      if (currentView === 'main' || currentView === 'analytics') targetSheetTitle = currentConfig.main || allSheets[0];
      else if (currentView === 'events') targetSheetTitle = currentConfig.events || eventsSheetTitle || '';
      else if (currentView === 'products') targetSheetTitle = currentConfig.products;
      else if (currentView === 'policies') targetSheetTitle = currentConfig.policies;
      else targetSheetTitle = currentView;

      const targetSheetProp = meta.sheets.find((s: any) => s.properties.title === targetSheetTitle)?.properties;
      if (targetSheetProp) {
        setActiveSheet(targetSheetProp);
      } else {
        setActiveSheet(null);
      }

      // Preparar lista unificada de hojas para descargar en UN SOLO VIAJE (Batch Fetching)
      const sheetsToFetch = Array.from(new Set([
        targetSheetProp?.title,
        prodSheetTitle,
        polSheetTitle,
        (mainSheetTitle && currentView !== 'main') ? mainSheetTitle : null
      ].filter(Boolean) as string[]));

      // 🚀 Batch Fetching: Reduce llamadas HTTP secuenciales a 1 sola petición paralela o agregada
      const batchData = await getAllSheetsData(sheetsToFetch, forceRefresh);

      let hasRelational = false;

      // Procesar Catálogo de Productos
      if (prodSheetTitle && batchData[prodSheetTitle] && batchData[prodSheetTitle].length > 0) {
        const prodRows = batchData[prodSheetTitle];
        const h = prodRows[0];
        setProducts(prodRows.slice(1).map((row: string[]) => {
          const obj: any = {};
          h.forEach((header: string, i: number) => obj[header] = row[i] || '');
          return obj;
        }));
        await indexedDbService.saveCachedSheet(prodSheetTitle, prodRows);
        hasRelational = true;
      } else if (products.length > 0) {
        hasRelational = true;
      }

      // Procesar Políticas de Canje
      if (polSheetTitle && batchData[polSheetTitle] && batchData[polSheetTitle].length > 0) {
        const polRows = batchData[polSheetTitle];
        const h = polRows[0];
        setPolicies(polRows.slice(1).map((row: string[]) => {
          const obj: any = {};
          h.forEach((header: string, i: number) => obj[header] = row[i] || '');
          return obj;
        }));
        await indexedDbService.saveCachedSheet(polSheetTitle, polRows);
        hasRelational = true;
      } else if (policies.length > 0) {
        hasRelational = true;
      }

      // Procesar Datos de Vencimientos (si la vista actual es otra)
      if (mainSheetTitle && currentView !== 'main' && batchData[mainSheetTitle] && batchData[mainSheetTitle].length > 0) {
        const mainRows = batchData[mainSheetTitle];
        const h = mainRows[0];
        setAllMainItems(mainRows.slice(1).map((row: string[], index: number) => {
          const obj: any = { _rowIndex: index + 2 };
          h.forEach((header: string, i: number) => obj[header] = row[i] || '');
          return obj;
        }));
        await indexedDbService.saveCachedSheet(mainSheetTitle, mainRows);
      }

      // Procesar la Hoja Activa
      if (targetSheetProp && batchData[targetSheetProp.title]) {
        const rows = batchData[targetSheetProp.title];
        await indexedDbService.saveCachedSheet(targetSheetProp.title, rows);
        setLastCachedAt(new Date().toISOString());
        setIsOffline(false);

        if (rows.length > 0) {
          const headerRow = rows[0];
          setHeaders(headerRow);
          const schemaKeys = Object.entries(sheetConfig.schema?.[targetSheetProp.title] || {})
            .filter(([_, conf]) => Boolean((conf as any)?.isKey))
            .map(([colName]) => colName);

          const parsedItems: InventoryItem[] = rows.slice(1).map((row: string[], index: number) => {
            const item: InventoryItem = { _rowIndex: index + 2 };
            headerRow.forEach((header: string, colIndex: number) => {
              item[header] = row[colIndex] || '';
            });

            // Resolver clave primaria robusta
            const identity = resolveItemIdentity(item, headerRow, targetSheetProp.title, schemaKeys);
            item._entityKey = identity.keyValue;
            item._entityKeyCol = identity.keyColumn || undefined;
            item._isSyntheticKey = identity.isSynthetic;

            return item;
          });
          setItems(parsedItems);
          if (currentView === 'main') setAllMainItems(parsedItems);
        } else {
          setHeaders([]);
          setItems([]);
        }
      }

      setIsRelationalActive(hasRelational);
    } catch (err: any) {
      console.warn('Network or Apps Script error:', err);

      // Si ya tenemos items renderizados desde caché IndexedDB o estado local, conservarlos y marcar estado offline
      if (hasRenderedCache || items.length > 0) {
        setIsOffline(true);
        setIsRelationalActive(true);
        return;
      }

      // Fallback a modo demo solo si no hay datos ni caché
      setMetadata({
        sheets: [
          { properties: { sheetId: 1, title: 'Vencimientos_Inventario', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } } },
          { properties: { sheetId: 2, title: 'FRC', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } } },
          { properties: { sheetId: 3, title: 'Catalogo_Productos', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } } },
          { properties: { sheetId: 4, title: 'Politicas_Canje', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } } }
        ]
      });

      if (currentView === 'events') {
        setActiveSheet({ sheetId: 2, title: 'FRC', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } });
        setHeaders(SAMPLE_EVENTS_HEADERS);
        setItems(getStoredDemoItems('events', SAMPLE_EVENTS_ITEMS));
      } else if (currentView === 'products') {
        setActiveSheet({ sheetId: 3, title: 'Catalogo_Productos', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } });
        setHeaders(Object.keys(SAMPLE_PRODUCTS[0] || {}));
        const defaultProds = SAMPLE_PRODUCTS.map((p, i) => ({ _rowIndex: i + 2, ...p }));
        setItems(getStoredDemoItems('products', defaultProds));
      } else if (currentView === 'policies') {
        setActiveSheet({ sheetId: 4, title: 'Politicas_Canje', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } });
        setHeaders(Object.keys(SAMPLE_POLICIES[0] || {}));
        const defaultPols = SAMPLE_POLICIES.map((p, i) => ({ _rowIndex: i + 2, ...p }));
        setItems(getStoredDemoItems('policies', defaultPols));
      } else {
        setActiveSheet({ sheetId: 1, title: 'Vencimientos_Inventario', hidden: false, gridProperties: { rowCount: 10, columnCount: 10 } });
        setHeaders(SAMPLE_HEADERS);
        setItems(getStoredDemoItems('main', SAMPLE_ITEMS));
      }

      setAllMainItems(getStoredDemoItems('main', SAMPLE_ITEMS));
      const defaultProds = SAMPLE_PRODUCTS.map((p, i) => ({ _rowIndex: i + 2, ...p }));
      setProducts(getStoredDemoItems('products', defaultProds));
      const defaultPols = SAMPLE_POLICIES.map((p, i) => ({ _rowIndex: i + 2, ...p }));
      setPolicies(getStoredDemoItems('policies', defaultPols));
      setIsRelationalActive(true);
      setError('Modo Demostración / Sin conexión: Mostrando datos de ejemplo de logística y vencimientos. Puede configurar su URL de Google Apps Script en Ajustes.');
    } finally {
      setLoading(false);
      setIsBackgroundSyncing(false);
    }
  };

  const handleSaveQuickTraspaso = async (targetItem: InventoryItem, traspasoNumber: string) => {
    const traspasoCol = findColumnBySemantic(headers, 'n_traspaso') || 'N_TRASPASO';
    const updatedItem = { ...targetItem, [traspasoCol]: traspasoNumber };
    const identity = resolveItemIdentity(updatedItem, headers, activeSheet?.title);

    // Update local state immediately for instant feedback
    setItems(prev => prev.map(it => (it._rowIndex === targetItem._rowIndex ? updatedItem : it)));

    // If online and connected to Apps Script, sync changes to cloud
    if (activeSheet && updatedItem._rowIndex && updatedItem._rowIndex > 1) {
      const rowValues = headers.map(h => updatedItem[h] || '');
      try {
        await updateRow(activeSheet.title, updatedItem._rowIndex, rowValues, {
          entityKey: identity.keyValue,
          keyValue: identity.keyValue
        });
      } catch (saveErr) {
        console.warn('Network error during quick transfer save, adding to offline queue:', saveErr);
        await enqueueMutation({
          type: 'update',
          sheetTitle: activeSheet.title,
          rowIndex: updatedItem._rowIndex,
          entityKey: identity.keyValue,
          entityKeyCol: identity.keyColumn || undefined,
          keyValue: identity.keyValue,
          keyColumn: identity.keyColumn || undefined,
          headers,
          values: rowValues
        });
      }
    }
  };

  const handleUniversalImportConfirmed = async (
    mappedData: Record<string, any>[],
    mode: ImportConsolidationMode = 'consolidate_sum'
  ) => {
    if (!activeSheet || headers.length === 0) {
      showToast('No hay una hoja activa configurada.', 'error', 'Importación');
      return;
    }
    try {
      setIsSaving(true);
      const isDemo = !localStorage.getItem('appsheet_clone_scriptUrl')?.trim();

      const isVencimientosTable = activeView === 'main' || /vencimiento|caducidad|stock/i.test(activeSheet.title);

      if (isVencimientosTable && mode !== 'append') {
        // Run intelligent reconciliation!
        const reconciliation = reconcileImportWithInventory(
          mappedData,
          items,
          headers,
          sheetConfig.customAliases,
          mode
        );

        const totalUpdates = reconciliation.rowsToUpdate.length;
        const totalAppends = reconciliation.rowsToAppend.length;

        showToast(
          `Consolidando importación: ${totalUpdates} a actualizar y ${totalAppends} nuevos registros...`,
          'info',
          'Consolidación Inteligente'
        );

        // 1. Process updates for matched rows
        let updatedItemsList = [...items];
        for (const updateOp of reconciliation.rowsToUpdate) {
          const rowValues = headers.map(h => updateOp.updatedItem[h] !== undefined ? String(updateOp.updatedItem[h]) : '');
          updatedItemsList = updatedItemsList.map(it => it._rowIndex === updateOp.rowIndex ? { ...it, ...updateOp.updatedItem } : it);
          
          if (!isDemo) {
            try {
              await updateRow(activeSheet.title, updateOp.rowIndex, rowValues);
            } catch (err) {
              console.warn(`Error updating row ${updateOp.rowIndex} in cloud, adding to offline queue:`, err);
              await enqueueMutation({
                type: 'update',
                sheetTitle: activeSheet.title,
                rowIndex: updateOp.rowIndex,
                entityKey: updateOp.cuVc,
                entityKeyCol: 'CU_VC',
                headers,
                values: rowValues
              });
            }
          }
        }

        // 2. Process appends for new unique rows
        const validRowIndexes = updatedItemsList.map(i => typeof i._rowIndex === 'number' ? i._rowIndex : parseInt(String(i._rowIndex || '0'), 10)).filter(n => !isNaN(n) && n > 0);
        let nextRowIndex = validRowIndexes.length ? Math.max(...validRowIndexes) + 1 : 2;
        
        for (const newRow of reconciliation.rowsToAppend) {
          const rowValues = headers.map(h => newRow[h] !== undefined ? String(newRow[h]) : '');
          const newItem: InventoryItem = { _rowIndex: nextRowIndex++, ...newRow };
          const identityInfo = resolveItemIdentity(newItem, headers, activeSheet.title);
          newItem._entityKey = identityInfo.keyValue;
          newItem._entityKeyCol = identityInfo.keyColumn || undefined;
          newItem._isSyntheticKey = identityInfo.isSynthetic;
          updatedItemsList.push(newItem);

          if (!isDemo) {
            try {
              await appendRow(activeSheet.title, rowValues);
            } catch (err) {
              console.warn('Error appending row in cloud, adding to offline queue:', err);
              await enqueueMutation({
                type: 'append',
                sheetTitle: activeSheet.title,
                headers,
                values: rowValues
              });
            }
          }
        }

        setItems(updatedItemsList);
        if (activeView === 'main') setAllMainItems(updatedItemsList);
        saveStoredDemoItems(activeView, updatedItemsList);
        if (activeView === 'main') saveStoredDemoItems('main', updatedItemsList);

        try {
          const cachedRows = [headers, ...updatedItemsList.map(it => headers.map(h => it[h] !== undefined && it[h] !== null ? String(it[h]) : ''))];
          await indexedDbService.saveCachedSheet(activeSheet.title, cachedRows);
        } catch (cErr) {
          console.warn('Error caching imported items in IndexedDB:', cErr);
        }

        showToast(
          `¡Importación completada! ${totalUpdates} registros existentes consolidados y ${totalAppends} nuevos agregados sin duplicados de CU_VC.`,
          'success',
          'Importación Inteligente'
        );

      } else {
        // Fallback / standard append mode for other views or explicit append
        const validRowIndexes = items.map(i => typeof i._rowIndex === 'number' ? i._rowIndex : parseInt(String(i._rowIndex || '0'), 10)).filter(n => !isNaN(n) && n > 0);
        let nextRowIndex = validRowIndexes.length ? Math.max(...validRowIndexes) + 1 : 2;
        let updatedItemsList = [...items];

        for (const item of mappedData) {
          const rowValues = headers.map(h => item[h] !== undefined ? String(item[h]) : '');
          const newItem: InventoryItem = { _rowIndex: nextRowIndex++ };
          headers.forEach((h, i) => newItem[h] = rowValues[i]);
          const identityInfo = resolveItemIdentity(newItem, headers, activeSheet.title);
          newItem._entityKey = identityInfo.keyValue;
          newItem._entityKeyCol = identityInfo.keyColumn || undefined;
          newItem._isSyntheticKey = identityInfo.isSynthetic;
          updatedItemsList.push(newItem);

          if (!isDemo) {
            try {
              await appendRow(activeSheet.title, rowValues);
            } catch (saveErr) {
              console.warn('Network error during bulk import append, adding to offline queue:', saveErr);
              await enqueueMutation({
                type: 'append',
                sheetTitle: activeSheet.title,
                values: rowValues
              });
            }
          }
        }

        setItems(updatedItemsList);
        if (activeView === 'main') setAllMainItems(updatedItemsList);
        if (activeView === 'products') setProducts(updatedItemsList);
        if (activeView === 'policies') setPolicies(updatedItemsList);
        saveStoredDemoItems(activeView, updatedItemsList);
        if (activeView === 'main') saveStoredDemoItems('main', updatedItemsList);
        if (activeView === 'products') saveStoredDemoItems('products', updatedItemsList);
        if (activeView === 'policies') saveStoredDemoItems('policies', updatedItemsList);

        try {
          const cachedRows = [headers, ...updatedItemsList.map(it => headers.map(h => it[h] !== undefined && it[h] !== null ? String(it[h]) : ''))];
          await indexedDbService.saveCachedSheet(activeSheet.title, cachedRows);
        } catch (cErr) {
          console.warn('Error caching imported items in IndexedDB:', cErr);
        }

        showToast(`Se importaron ${mappedData.length} registros exitosamente en "${activeSheet.title}".`, 'success', 'Importación Exitosa');
      }

      if (!isDemo) {
        clearSheetsCache(activeSheet.title);
        await fetchData(sheetConfig, activeView, true);
      }
    } catch (err: any) {
      showToast(`Error al importar registros: ${err.message}`, 'error', 'Error de Importación');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    fetchData(sheetConfig, activeView, false);
    setSelectedRowIds([]);
  }, [activeView]);

  // Handle batch synchronization from stock count terminal to VENCIMIENTOS sheet
  const handleSyncRowsToVencimientos = async (rows: Record<string, any>[]) => {
    if (!activeSheet) return;
    const targetTitle = activeSheet.title;
    try {
      showToast(`Sincronizando ${rows.length} registros con ${targetTitle}...`, 'info', 'Sincronización');
      for (const row of rows) {
        const rowValues = headers.map(h => row[h] !== undefined ? String(row[h]) : '');
        const cuVc = row.CU_VC || row.cu_vc;
        const existingItem = items.find(it => (cuVc && it.CU_VC === cuVc) || (it.SKU_VC === row.SKU_VC && it.MM === row.MM && it.YYYY === row.YYYY));

        if (existingItem && existingItem._rowIndex) {
          try {
            await updateRow(targetTitle, existingItem._rowIndex, rowValues);
          } catch (err) {
            await enqueueMutation({
              type: 'update',
              sheetTitle: targetTitle,
              rowIndex: existingItem._rowIndex,
              entityKey: existingItem._entityKey || cuVc,
              entityKeyCol: existingItem._entityKeyCol || 'CU_VC',
              headers,
              values: rowValues
            });
          }
        } else {
          try {
            await appendRow(targetTitle, rowValues);
          } catch (err) {
            await enqueueMutation({
              type: 'append',
              sheetTitle: targetTitle,
              entityKey: cuVc,
              entityKeyCol: 'CU_VC',
              headers,
              values: rowValues
            });
          }
        }
      }
      showToast(`${rows.length} registros sincronizados exitosamente con ${targetTitle}`, 'success', 'Sincronización Completa');
      await fetchData(sheetConfig, activeView, true);
    } catch (err: any) {
      showToast(`Error durante sincronización: ${err.message}`, 'error', 'Error');
    }
  };

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
    const isDemo = !localStorage.getItem('appsheet_clone_scriptUrl')?.trim();
    
    try {
      setIsSaving(true);
      const now = new Date();
      const currentFormattedDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');

      // Intelligent CU_VC Collision Detection: If creating a new record in main/vencimientos table, check if SKU + MM/YYYY already exists
      let targetExistingItem = editingItem;
      let isConsolidatingWithExisting = false;

      if (!targetExistingItem && (activeView === 'main' || /vencimiento|caducidad|stock/i.test(activeSheet.title))) {
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
      const newItem: InventoryItem = { 
        _rowIndex: nextRowIndex 
      };
      headers.forEach((h, i) => newItem[h] = rowValues[i]);

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
      if (activeView === 'main') saveStoredDemoItems('main', nextItems);
      if (activeView === 'products') saveStoredDemoItems('products', nextItems);
      if (activeView === 'policies') saveStoredDemoItems('policies', nextItems);

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
    } catch (err: any) {
      // Rollback
      setItems(originalItems);
      setAllMainItems(originalMainItems);
      showToast(`Error guardando datos (rollback aplicado): ${err.message}`, 'error', 'Error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePistoleoItem = async (formPayload: Record<string, string>, targetExistingItem?: InventoryItem) => {
    if (!activeSheet || headers.length === 0) return;
    setIsSaving(true);
    try {
      const isDemo = !localStorage.getItem('appsheet_clone_scriptUrl')?.trim();
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

      const newItem: InventoryItem = { _rowIndex: nextRowIndex };
      headers.forEach((h, i) => newItem[h] = rowValues[i]);

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
      if (activeView === 'main') saveStoredDemoItems('main', nextItems);

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
    } catch (err: any) {
      showToast(`Error al guardar pistoleo: ${err.message}`, 'error', 'Error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!activeSheet) return;
    const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar la fila ${item._rowIndex}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    const originalItems = [...items];
    const originalMainItems = [...allMainItems];
    const isDemo = !localStorage.getItem('appsheet_clone_scriptUrl')?.trim();

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
          await deleteRow(activeSheet.sheetId, item._rowIndex as number, activeSheet.title);
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
    } catch (err: any) {
      setItems(originalItems);
      setAllMainItems(originalMainItems);
      showToast(`Error al eliminar fila: ${err.message}`, 'error', 'Error de Eliminación');
    } finally {
      setIsSaving(false);
    }
  };

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

  const handleEventFilterClick = useCallback((eventCat: any, isMulti: boolean) => {
    setEventFilter(prev => handleFilterToggle(prev, eventCat, isMulti));
  }, []);

  const handleFrcBodFilterClick = useCallback((bodVal: string, isMulti: boolean) => {
    setFrcBodFilter(prev => handleFilterToggle(prev, bodVal, isMulti));
  }, []);

  const handleOpenQuickTraspaso = useCallback((item: InventoryItem) => {
    setQuickTraspasoItem(item);
    setIsQuickTraspasoOpen(true);
  }, []);

  const handleApplyBulkEdit = async (values: { frc_n: string; n_traspaso: string; tipo_evento: string; frc_bod: string }) => {
    if (!activeSheet || selectedRowIds.length === 0) return;

    const findHeader = (target: string) => {
      const normTarget = target.replace(/[\s\-_]+/g, '').toLowerCase();
      for (const h of headers) {
        if (h.replace(/[\s\-_]+/g, '').toLowerCase() === normTarget) return h;
      }
      return undefined;
    };

    const colFrcN = findHeader('frc_n') || findHeader('folio') || findHeader('id_vc');
    const colTraspaso = findHeader('n_traspaso') || findHeader('traspaso');
    let colTipoEvento = findColumnBySemantic(headers, 'tipo_evento') || findHeader('tipo_de_evento') || findHeader('tipo_evento') || findHeader('tipo') || findHeader('incidencia');
    const colFrcBod = findHeader('frc_bod') || findHeader('bodega') || findHeader('frc_bodega');

    let currentHeaders = [...headers];
    if (values.tipo_evento && !colTipoEvento) {
      colTipoEvento = 'TIPO_EVENTO';
      currentHeaders.push(colTipoEvento);
      try {
        await updateRow(activeSheet.title, 1, currentHeaders);
      } catch (err) {
        console.warn('Could not auto-add TIPO_EVENTO header to sheet', err);
      }
    }

    const originalItems = [...items];

    try {
      setIsSaving(true);

      let resolvedTipoEvento = values.tipo_evento;
      if (values.tipo_evento) {
        const upper = values.tipo_evento.toUpperCase().trim();
        if (EVENT_CATEGORIES[upper as EventCategory]) {
          resolvedTipoEvento = EVENT_CATEGORIES[upper as EventCategory].name;
        } else if (upper === 'DIFERENCIAS') {
          resolvedTipoEvento = EVENT_CATEGORIES['DIFERENCIA'].name;
        } else if (upper === 'MERMAS') {
          resolvedTipoEvento = EVENT_CATEGORIES['AVERIA'].name;
        } else if (upper === 'CALIDAD') {
          resolvedTipoEvento = EVENT_CATEGORIES['DEVOLUCION'].name;
        }
      }

      const updatedItems = items.map(item => {
        if (!selectedRowIds.includes(item._rowIndex as number)) return item;
        const updated = { ...item };
        if (values.frc_n && colFrcN) updated[colFrcN] = values.frc_n;
        if (values.n_traspaso && colTraspaso) updated[colTraspaso] = values.n_traspaso;
        if (values.tipo_evento && colTipoEvento) updated[colTipoEvento] = resolvedTipoEvento;
        if (values.frc_bod && colFrcBod) updated[colFrcBod] = values.frc_bod;
        return updated;
      });

      setItems(updatedItems);

      const totalEdit = selectedRowIds.length;
      const toastId = showToast(`Actualizando registros... ${totalEdit} restantes`, 'loading', 'Edición Masiva', 0);
      let remainingEdit = totalEdit;

      for (const rawRowIndex of selectedRowIds) {
        const rowIndex = typeof rawRowIndex === 'number' ? rawRowIndex : parseInt(String(rawRowIndex), 10);
        if (!rowIndex || isNaN(rowIndex) || rowIndex < 2) continue;

        const itemToUpdate = updatedItems.find(i => i._rowIndex === rowIndex);
        if (itemToUpdate) {
          const rowValues = currentHeaders.map(h => itemToUpdate[h] || '');
          const ident = resolveItemIdentity(itemToUpdate, currentHeaders, activeSheet.title);
          try {
            await updateRow(activeSheet.title, rowIndex, rowValues, {
              entityKey: ident.keyValue,
              keyValue: ident.keyValue
            });
          } catch (err) {
            console.warn(`Error updating row ${rowIndex} in cloud, adding to offline queue`, err);
            await enqueueMutation({
              type: 'update',
              sheetTitle: activeSheet.title,
              rowIndex,
              entityKey: ident.keyValue,
              entityKeyCol: ident.keyColumn || undefined,
              keyValue: ident.keyValue,
              keyColumn: ident.keyColumn || undefined,
              headers: currentHeaders,
              values: rowValues
            });
          }
        }
        remainingEdit--;
        if (remainingEdit > 0) {
          updateToast(toastId, `Actualizando registros... ${remainingEdit} restantes`, 'loading', 'Edición Masiva', 0);
        }
      }

      setSelectedRowIds([]);
      await fetchData(sheetConfig, activeView, true);
      showToast(`¡Se actualizaron ${totalEdit} registros exitosamente con la información masiva!`, 'success', 'Edición Masiva');
    } catch (err: any) {
      setItems(originalItems);
      showToast(`Error en actualización masiva: ${err.message}`, 'error', 'Error en Edición');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!activeSheet || selectedRowIds.length === 0) return;
    const count = selectedRowIds.length;
    const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar ${count} registros seleccionados? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    const toastId = showToast(`Eliminando registros... ${count} restantes`, 'loading', 'Eliminación Masiva', 0);

    const originalItems = [...items];
    const originalMainItems = [...allMainItems];
    const isDemo = !localStorage.getItem('appsheet_clone_scriptUrl')?.trim();

    try {
      setIsSaving(true);
      
      const selectedSet = new Set(selectedRowIds);
      const remainingItems = items
        .filter(i => !selectedSet.has(i._rowIndex as number))
        .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));

      setItems(remainingItems);
      saveStoredDemoItems(activeView, remainingItems);

      if (activeView === 'main') {
        const remainingMain = allMainItems
          .filter(i => !selectedSet.has(i._rowIndex as number))
          .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));
        setAllMainItems(remainingMain);
        saveStoredDemoItems('main', remainingMain);
      }

      // Sort row indices in DESCENDING order so that deleting earlier rows doesn't shift later row indices
      const sortedRowIds = [...selectedRowIds].sort((a, b) => (b as number) - (a as number));

      if (isDemo) {
        setSelectedRowIds([]);
        updateToast(toastId, `¡Se eliminaron ${count} registros exitosamente!`, 'success', 'Eliminación Completada');
      } else {
        try {
          await deleteRows(activeSheet.sheetId, sortedRowIds, activeSheet.title);
        } catch (batchErr) {
          console.warn('deleteRows masivo falló o no soportado, ejecutando eliminaciones individuales descendentes:', batchErr);
          let remainingDelete = count;
          for (const rowIndex of sortedRowIds) {
            const itemToDelete = originalItems.find(i => i._rowIndex === rowIndex);
            const ident = itemToDelete ? resolveItemIdentity(itemToDelete, headers, activeSheet.title) : null;
            try {
              await deleteRow(activeSheet.sheetId, rowIndex, activeSheet.title);
            } catch (err) {
              console.warn(`Error al eliminar fila ${rowIndex} en la nube, agregando a cola offline`, err);
              await enqueueMutation({
                type: 'delete',
                sheetId: activeSheet.sheetId,
                sheetTitle: activeSheet.title,
                rowIndex,
                entityKey: ident?.keyValue,
                entityKeyCol: ident?.keyColumn || undefined,
                keyValue: ident?.keyValue,
                keyColumn: ident?.keyColumn || undefined,
                headers
              });
            }
            remainingDelete--;
            if (remainingDelete > 0) {
              updateToast(toastId, `Eliminando registros... ${remainingDelete} restantes`, 'loading', 'Eliminación Masiva', 0);
            }
          }
        }

        setSelectedRowIds([]);
        await fetchData(sheetConfig, activeView, true);
        updateToast(toastId, `¡Se eliminaron ${count} registros exitosamente en Google Sheets!`, 'success', 'Eliminación Completada');
      }
    } catch (err: any) {
      setItems(originalItems);
      setAllMainItems(originalMainItems);
      showToast(`Error en eliminación masiva: ${err.message}`, 'error', 'Error de Eliminación');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !metadata) {
    return <SkeletonLoader />;
  }

  const mappedSheets = [sheetConfig.main, sheetConfig.events, sheetConfig.products, sheetConfig.policies].filter(Boolean);
  const otherSheets = metadata?.sheets
    .map((s: any) => s.properties.title)
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

    isPmReportOpen,
    setIsPmReportOpen,
    drainageReportItems,

    isScriptModalOpen,
    setIsScriptModalOpen,

    isConfigOpen,
    setIsConfigOpen,

    isScannerOpen,
    setIsScannerOpen,
    searchTerm,
    setSearchTerm,

    isMobilePistoleoOpen,
    setIsMobilePistoleoOpen,
    handleSavePistoleoItem,

    isBulkEditOpen,
    setIsBulkEditOpen,
    selectedRowIds,
    handleApplyBulkEdit,

    isGmailModalOpen,
    setIsGmailModalOpen,
    gmailModalItems,
    setGmailModalItems,

    isWhatsAppModalOpen,
    setIsWhatsAppModalOpen,
    whatsAppModalItems,
    setWhatsAppModalItems,

    isColumnManagerOpen,
    setIsColumnManagerOpen,
    allManageableColumns,
    toggleVisibility,
    moveColumn,
    showAllColumns,
    resetColumnOrder,
    handleColumnDrop,

    isQuickTraspasoOpen,
    setIsQuickTraspasoOpen,
    quickTraspasoItem,
    setQuickTraspasoItem,
    handleSaveQuickTraspaso,

    isTicketConfigOpen,
    setIsTicketConfigOpen,
    globalTicketConfig,
    handleSaveTicketConfig,

    isBulkImportOpen,
    setIsBulkImportOpen,
    handleUniversalImportConfirmed,

    isBulkActionsConfigOpen,
    setIsBulkActionsConfigOpen,

    isSliceManagerOpen,
    setIsSliceManagerOpen,
    currentTableSlices,
    sliceCounts,
    activeSliceId,
    hiddenSliceIds,
    handleSelectSlice,
    setEditingSliceModalItem,
    handleDeleteSlice,
    handleToggleSliceVisibility,
    handleSetBulkVisibility,
    isSliceModalOpen,
    setIsSliceModalOpen,
    editingSliceModalItem,
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
    handleSaveSlice,

    isStockCountOpen,
    setIsStockCountOpen,
    handleSyncRowsToVencimientos,

    isSyncAuditOpen,
    setIsSyncAuditOpen,
    offlineQueue,
    auditLog,
    isOffline,
    isSyncing: isBackgroundSyncing || isSyncingCloud,
    latencyMs,
    connectionStatus,
    lastHealthCheck,
    healthErrorMessage,
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
    columnLabelsMap,

    // View & Presentation Controls
    isRightDrawerOpen,
    setIsRightDrawerOpen,
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
    isActionsMenuOpen,
    setIsActionsMenuOpen,
    lastCachedAt,
    handleSyncOfflineQueue,
    loading,
    error,

    // Sidebar & Navigation
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    otherSheets,
    isMobileMenuOpen,
    setIsMobileMenuOpen,

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
    onOpenWhatsApp: (item: InventoryItem) => {
      setWhatsAppModalItems([item]);
      setIsWhatsAppModalOpen(true);
    },
    onOpenEmail: (item: InventoryItem) => {
      setGmailModalItems([item]);
      setIsGmailModalOpen(true);
    },
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
            <AnalyticsDashboard items={filteredItems} headers={headers} />
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
      items={itemsToPrintList || (selectedRowIds.length > 0 ? filteredItems.filter(i => selectedRowIds.includes(i._rowIndex as number)) : filteredItems)} 
      headers={headers} 
      config={globalTicketConfig[activeView] || sheetConfig.ticketPrintConfig?.[activeView] || {}} 
      activeView={activeView}
      mode={ticketPrintMode}
    />
    </DashboardProvider>
  );
};

export default InventoryDashboard;
