import React, { createContext, useContext, useMemo } from 'react';
import { InventoryItem, SheetConfig, SheetProperties, SpreadsheetMetadata, EventCategory, GlobalTicketConfig, ViewTicketConfig, TableSlice, SheetRecord, SliceFilterConfig, SortConfig, TableCapability } from '../types';
import { OfflineMutation, AuditLogEntry } from '../db/indexedDbService';
import { ConnectionHealthStatus } from '../hooks/useOfflineSync';
import { BulkActionContext } from '../utils/bulkActionsRegistry';
import { ManageableColumn } from '../hooks/useColumnManager';
import type { ColumnMetadata } from '../hooks/usePrecomputedColumns';
import type { DisplayRow } from '../hooks/useInventoryFiltering';
import type { VirtualItem } from '@tanstack/react-virtual';
import type { WorkerMetricsResult } from '../workers/inventoryWorker';
import type { ImportConsolidationMode } from '../utils/cuVcConsolidator';

export interface DashboardContextType {
  // Core Sheet & Metadata
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
  saveConfig: (c: SheetConfig) => void;
  metadata: SpreadsheetMetadata | null;
  activeSheet: SheetProperties | null;
  setActiveSheet?: React.Dispatch<React.SetStateAction<SheetProperties | null>>;
  activeView: string;
  setActiveView: (view: string, searchTermOverride?: string) => void;
  headers: string[];
  allTableHeaders?: string[];
  setHeaders?: React.Dispatch<React.SetStateAction<string[]>>;
  visibleHeaders: string[];
  products: SheetRecord[];
  policies: SheetRecord[];
  allMainItems: InventoryItem[];
  items: InventoryItem[];
  filteredItems: InventoryItem[];
  fetchData: (config?: SheetConfig, view?: string, force?: boolean) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string, duration?: number) => string;

  // Master-Detail Product Drawer
  selectedProduct: InventoryItem | null;
  setSelectedProduct: (p: InventoryItem | null) => void;
  handleDelete: (item: InventoryItem) => Promise<void>;
  handlePrintTicket: (items: InventoryItem[], mode: 'standard' | 'barcode') => void;

  // Item Form Lifecycle
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  editingItem: InventoryItem | null;
  setEditingItem: (item: InventoryItem | null) => void;
  formData: Record<string, string>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  formErrors: Record<string, string>;
  setFormErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  selectedEventCategory: EventCategory;
  setSelectedEventCategory: (cat: EventCategory) => void;
  handleOpenModal: (item?: InventoryItem, prefillSku?: string, initialCategory?: EventCategory) => void;
  handleOpenCopyModal: (item: InventoryItem) => void;
  handleCloseModal: () => void;
  handleSelectEventCategory: (cat: EventCategory) => void;
  handleFormChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handleBatchFormUpdate: (updates: Record<string, string>) => void;
  handleSave: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;

  // PM Report
  drainageReportItems: InventoryItem[];

  // Script Code Modal

  // Global Config Modal

  // Barcode Scanner Modal
  searchTerm: string;
  setSearchTerm: (code: string) => void;

  // Mobile Pistoleo Terminal
  handleSavePistoleoItem: (formData: Record<string, string>, targetExistingItem?: InventoryItem) => Promise<void>;

  // Bulk Edit Modal
  selectedRowIds: number[];
  handleApplyBulkEdit: (values: { frc_n: string; n_traspaso: string; tipo_evento: string; frc_bod: string }) => Promise<void>;

  // Gmail Modal

  // WhatsApp Modal

  // Column Manager Modal
  allManageableColumns: ManageableColumn[];
  toggleVisibility: (col: string) => void;
  moveColumn: (colId: string, direction: 'up' | 'down') => void;
  showAllColumns: () => void;
  resetColumnOrder: () => void;
  handleColumnDrop: (draggedCol: string, targetCol: string) => void;

  // Quick Traspaso Modal
  handleSaveQuickTraspaso: (targetItem: InventoryItem, traspasoNumber: string) => Promise<void>;

  // Ticket Config Modal
  globalTicketConfig: GlobalTicketConfig;
  handleSaveTicketConfig: (view: string, viewConfig: ViewTicketConfig) => void;

  // Bulk Import Modal
  handleUniversalImportConfirmed: (importedRows: SheetRecord[], mode?: ImportConsolidationMode) => Promise<void>;

  // Bulk Actions Config Modal

  // Slices & Views
  currentTableSlices: TableSlice[];
  sliceCounts: Record<string, number>;
  activeSliceId: string | null;
  hiddenSliceIds: string[];
  handleSelectSlice: (slice: TableSlice | null) => void;
  handleDeleteSlice: (sliceId: string) => void;
  handleToggleSliceVisibility: (sliceId: string) => void;
  handleSetBulkVisibility: (sliceIds: string[], visible: boolean) => void;
  currentFilters: SliceFilterConfig;
  sortConfig: SortConfig;
  groupByColumn: string | null;
  groupByDirection: 'asc' | 'desc';
  handleSetGroupByColumn?: (col: string) => void;
  handleSetGroupByDirection?: (dir: 'asc' | 'desc') => void;
  handleSaveSlice: (slice: TableSlice) => void;

  // Stock Count Terminal
  handleSyncRowsToVencimientos: (rows: SheetRecord[]) => Promise<void>;

  // Sync Audit & Offline State
  offlineQueue: OfflineMutation[];
  auditLog: AuditLogEntry[];
  isOffline: boolean;
  isSyncing: boolean;
  latencyMs: number | null;
  connectionStatus: ConnectionHealthStatus;
  lastHealthCheck: Date | null;
  healthErrorMessage: string | null;
  scriptSupportsAtomicSave: boolean | null;
  testConnectionHealth: () => Promise<{ success: boolean; latencyMs: number; status: ConnectionHealthStatus; error?: string }>;
  syncQueue: (targetMutationId?: string) => Promise<{ success: boolean; count: number; errors: string[] }>;
  removeMutation: (id: string) => Promise<void>;
  discardMutation: (id: string, reason?: string) => Promise<OfflineMutation | null>;
  discardAllFailedMutations: () => Promise<number>;
  retryMutation: (id: string) => Promise<{ success: boolean; count: number; errors: string[] }>;
  retryAllFailedMutations: () => Promise<{ success: boolean; count: number; errors: string[] }>;
  forkMutationAsAppend: (id: string) => Promise<OfflineMutation | null>;
  failedMutations: OfflineMutation[];
  failedCount: number;
  clearQueue: () => Promise<void>;
  clearAuditLog: () => Promise<void>;

  // Bulk Operations & Selection
  setSelectedRowIds?: React.Dispatch<React.SetStateAction<number[]>> | ((ids: number[]) => void);
  handleBulkDelete?: () => Promise<void> | void;
  handleReconcileWithCatalog?: () => Promise<void> | void;
  bulkActionCtx?: BulkActionContext;
  /** Capacidades de dominio de la hoja activa (ver `detectTableCapabilities`). */
  tableCapabilities?: Set<TableCapability>;
  columnLabelsMap?: Record<string, string>;

  // View & Presentation Controls
  isZenMode?: boolean;
  setIsZenMode?: (zen: boolean) => void;
  tableDensity?: 'comfortable' | 'compact' | 'ultra';
  setTableDensity?: (density: 'comfortable' | 'compact' | 'ultra') => void;
  isSummaryView?: boolean;
  handleToggleSummaryView?: () => void;
  areFiltersVisible?: boolean;
  setAreFiltersVisible?: React.Dispatch<React.SetStateAction<boolean>>;
  hasCustomColWidths?: boolean;
  handleResetColWidths?: () => void;
  handleToggleStickyColumns?: () => void;
  hiddenColumns?: Record<string, string[]>;
  activeSlice?: TableSlice | null;
  visibleTableSlices?: TableSlice[];
  customSlices?: TableSlice[];
  deletedSliceIds?: string[];
  deletedTableSlices?: TableSlice[];
  handleRestoreSlice?: (sliceId: string) => void;
  handleResetDefaultSlices?: () => void;
  isRelationalActive?: boolean;
  searchableHeaders?: string[];
  hasActiveFilters?: boolean;
  clearAllFilters?: () => void;
  isActionsMenuOpen?: boolean;
  setIsActionsMenuOpen?: (open: boolean) => void;
  lastCachedAt?: number | string | null;
  handleSyncOfflineQueue?: () => void;
  loading?: boolean;
  error?: string | null;

  // Sidebar & Navigation
  isSidebarCollapsed?: boolean;
  setIsSidebarCollapsed?: (collapsed: boolean) => void;
  otherSheets?: string[];
  isMobileMenuOpen?: boolean;
  setIsMobileMenuOpen?: (open: boolean) => void;

  // Filter Panels & Metrics
  quickChips?: string[];
  activeQuickChip?: string | null;
  setActiveQuickChip?: (chip: string | null) => void;
  eventResolutionFilter?: string[];
  setEventResolutionFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  handleFilterToggle?: <T>(prev: T[], val: T, isMulti: boolean) => T[];
  eventResolutionMetrics?: WorkerMetricsResult['eventResolutionMetrics'];
  eventFilter?: string[];
  setEventFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  eventMetrics?: WorkerMetricsResult['eventMetrics'];
  /** Total de filas del dominio del módulo, no de la hoja cruda (píldora «Todas»). */
  domainItemsCount?: number;
  frcBodValues?: string[];
  frcBodCounts?: Record<string, number>;
  frcBodFilter?: string[];
  setFrcBodFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  pmRadarFilter?: string[];
  setPmRadarFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  pmMetrics?: WorkerMetricsResult['pmMetrics'];

  // Table Container & Virtualization
  effectiveVisibleHeaders?: string[];
  visibleColumnMeta?: ColumnMetadata[];
  tableContainerRef?: React.RefObject<HTMLDivElement | null>;
  getColWidth?: (headerId: string, label: string, type?: string) => number;
  handleStartResize?: (colId: string, startWidth: number, e: React.MouseEvent) => void;
  handleAutoFitColumn?: (colId: string, label: string) => void;
  resizingCol?: { colId: string; startWidth: number } | null;
  onSelectRow?: (rowIndex: number, selected: boolean) => void;
  onClickItem?: (item: InventoryItem) => void;
  onDeleteRow?: (item: InventoryItem) => void;
  onPmRadarFilterClick?: (targetFilter: string, isMulti: boolean) => void;
  onEventResolutionFilterClick?: (status: 'pending' | 'completed', isMulti: boolean) => void;
  onEventFilterClick?: (eventCat: EventCategory, isMulti: boolean) => void;
  onFrcBodFilterClick?: (bodVal: string, isMulti: boolean) => void;
  onOpenQuickTraspaso?: (item: InventoryItem) => void;
  onOpenWhatsApp?: (item: InventoryItem) => void;
  onOpenEmail?: (item: InventoryItem) => void;
  isWhatsAppEnabled?: boolean;
  isEmailEnabled?: boolean;
  isCopyEnabled?: boolean;
  draggedCol?: string | null;
  setDraggedCol?: (col: string | null) => void;
  dragOverCol?: string | null;
  setDragOverCol?: (col: string | null) => void;
  columnFilters?: Record<string, string[]>;
  setColumnFilters?: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  columnOptionsMap?: WorkerMetricsResult['columnOptionsMap'];
  frcBodCol?: string | null;
  virtualRows?: VirtualItem[];
  paginatedDisplayRows?: DisplayRow[];
  paddingTop?: number;
  paddingBottom?: number;
  onSelectGroupRows?: (rowIndexes: number[], selected: boolean) => void;
  toggleGroupCollapse?: (groupKey: string) => void;
  measureElementRef?: (node: HTMLElement | null) => void;
  handleToggleSort?: (columnName: string) => void;
  expandAllGroups?: () => void;
  collapseAllGroups?: () => void;
  collapsedGroups?: Record<string, boolean>;
  groupedItems?: Array<[string, InventoryItem[]]> | null;
  toggleGroupByDirection?: () => void;
}

// Decentralized Granular Contexts for optimal sub-component subscriptions (Fase 4.2)
const SheetDataContext = createContext<Partial<DashboardContextType> | null>(null);
const FilterSettingsContext = createContext<Partial<DashboardContextType> | null>(null);
const OfflineSyncContext = createContext<Partial<DashboardContextType> | null>(null);
const FormStateContext = createContext<Partial<DashboardContextType> | null>(null);

const DashboardContext = createContext<DashboardContextType | null>(null);

export const DashboardProvider: React.FC<{
  value: DashboardContextType;
  children: React.ReactNode;
}> = ({ value, children }) => {
  // 1. Sliced Context for Raw Sheets & Core Data
  const sheetData = useMemo(() => ({
    sheetConfig: value.sheetConfig,
    setSheetConfig: value.setSheetConfig,
    saveConfig: value.saveConfig,
    metadata: value.metadata,
    activeSheet: value.activeSheet,
    activeView: value.activeView,
    setActiveView: value.setActiveView,
    headers: value.headers,
    allTableHeaders: value.allTableHeaders,
    visibleHeaders: value.visibleHeaders,
    products: value.products,
    policies: value.policies,
    allMainItems: value.allMainItems,
    items: value.items,
    filteredItems: value.filteredItems,
    fetchData: value.fetchData,
    loading: value.loading,
    error: value.error,
    lastCachedAt: value.lastCachedAt,
    tableCapabilities: value.tableCapabilities,
    columnLabelsMap: value.columnLabelsMap,
  }), [
    value.sheetConfig, value.metadata, value.activeSheet, value.activeView,
    value.headers, value.visibleHeaders, value.products, value.policies,
    value.allMainItems, value.items, value.filteredItems, value.fetchData,
    value.loading, value.error, value.lastCachedAt, value.tableCapabilities,
    value.columnLabelsMap
  ]);

  // 2. Sliced Context for Filters, Search, Chip Selections
  const filterSettings = useMemo(() => ({
    searchTerm: value.searchTerm,
    setSearchTerm: value.setSearchTerm,
    currentFilters: value.currentFilters,
    sortConfig: value.sortConfig,
    groupByColumn: value.groupByColumn,
    groupByDirection: value.groupByDirection,
    handleSetGroupByColumn: value.handleSetGroupByColumn,
    handleSetGroupByDirection: value.handleSetGroupByDirection,
    activeSliceId: value.activeSliceId,
    handleSelectSlice: value.handleSelectSlice,
    currentTableSlices: value.currentTableSlices,
    sliceCounts: value.sliceCounts,
    hiddenSliceIds: value.hiddenSliceIds,
    handleDeleteSlice: value.handleDeleteSlice,
    handleToggleSliceVisibility: value.handleToggleSliceVisibility,
    handleSetBulkVisibility: value.handleSetBulkVisibility,
    handleSaveSlice: value.handleSaveSlice,
    activeSlice: value.activeSlice,
    visibleTableSlices: value.visibleTableSlices,
    customSlices: value.customSlices,
    isRelationalActive: value.isRelationalActive,
    searchableHeaders: value.searchableHeaders,
    hasActiveFilters: value.hasActiveFilters,
    clearAllFilters: value.clearAllFilters,
    quickChips: value.quickChips,
    activeQuickChip: value.activeQuickChip,
    setActiveQuickChip: value.setActiveQuickChip,
    eventResolutionFilter: value.eventResolutionFilter,
    setEventResolutionFilter: value.setEventResolutionFilter,
    eventResolutionMetrics: value.eventResolutionMetrics,
    eventFilter: value.eventFilter,
    setEventFilter: value.setEventFilter,
    eventMetrics: value.eventMetrics,
    domainItemsCount: value.domainItemsCount,
    frcBodValues: value.frcBodValues,
    frcBodCounts: value.frcBodCounts,
    frcBodFilter: value.frcBodFilter,
    setFrcBodFilter: value.setFrcBodFilter,
    pmRadarFilter: value.pmRadarFilter,
    setPmRadarFilter: value.setPmRadarFilter,
    pmMetrics: value.pmMetrics,
    columnFilters: value.columnFilters,
    setColumnFilters: value.setColumnFilters,
    columnOptionsMap: value.columnOptionsMap,
    frcBodCol: value.frcBodCol,
  }), [
    value.searchTerm, value.currentFilters, value.sortConfig, value.groupByColumn,
    value.groupByDirection, value.handleSetGroupByColumn, value.handleSetGroupByDirection,
    value.activeSliceId, value.currentTableSlices, value.sliceCounts, value.hiddenSliceIds,
    value.activeSlice, value.visibleTableSlices, value.customSlices, value.isRelationalActive,
    value.searchableHeaders, value.hasActiveFilters, value.quickChips, value.activeQuickChip,
    value.eventResolutionFilter, value.eventResolutionMetrics, value.eventFilter,
    value.eventMetrics, value.domainItemsCount, value.frcBodValues, value.frcBodCounts,
    value.frcBodFilter, value.pmRadarFilter, value.pmMetrics, value.columnFilters,
    value.columnOptionsMap, value.frcBodCol
  ]);

  // 3. Sliced Context for Offline-First Mutations & Sync Status
  const offlineSync = useMemo(() => ({
    offlineQueue: value.offlineQueue,
    auditLog: value.auditLog,
    isOffline: value.isOffline,
    isSyncing: value.isSyncing,
    latencyMs: value.latencyMs,
    connectionStatus: value.connectionStatus,
    lastHealthCheck: value.lastHealthCheck,
    healthErrorMessage: value.healthErrorMessage,
    scriptSupportsAtomicSave: value.scriptSupportsAtomicSave,
    testConnectionHealth: value.testConnectionHealth,
    syncQueue: value.syncQueue,
    removeMutation: value.removeMutation,
    discardMutation: value.discardMutation,
    discardAllFailedMutations: value.discardAllFailedMutations,
    retryMutation: value.retryMutation,
    retryAllFailedMutations: value.retryAllFailedMutations,
    forkMutationAsAppend: value.forkMutationAsAppend,
    failedMutations: value.failedMutations,
    failedCount: value.failedCount,
    clearQueue: value.clearQueue,
    clearAuditLog: value.clearAuditLog,
  }), [
    value.offlineQueue, value.auditLog, value.isOffline, value.isSyncing,
    value.latencyMs, value.connectionStatus, value.lastHealthCheck,
    value.healthErrorMessage, value.scriptSupportsAtomicSave, value.failedCount
  ]);

  // 4. Sliced Context for Modals, Form inputs and UI Presentation properties
  const formState = useMemo(() => ({
    selectedProduct: value.selectedProduct,
    setSelectedProduct: value.setSelectedProduct,
    handleDelete: value.handleDelete,
    handlePrintTicket: value.handlePrintTicket,
    isModalOpen: value.isModalOpen,
    setIsModalOpen: value.setIsModalOpen,
    editingItem: value.editingItem,
    setEditingItem: value.setEditingItem,
    formData: value.formData,
    setFormData: value.setFormData,
    formErrors: value.formErrors,
    setFormErrors: value.setFormErrors,
    selectedEventCategory: value.selectedEventCategory,
    setSelectedEventCategory: value.setSelectedEventCategory,
    handleOpenModal: value.handleOpenModal,
    handleOpenCopyModal: value.handleOpenCopyModal,
    handleCloseModal: value.handleCloseModal,
    handleSelectEventCategory: value.handleSelectEventCategory,
    handleFormChange: value.handleFormChange,
    handleBatchFormUpdate: value.handleBatchFormUpdate,
    handleSave: value.handleSave,
    isSaving: value.isSaving,
    drainageReportItems: value.drainageReportItems,
    handleSavePistoleoItem: value.handleSavePistoleoItem,
    selectedRowIds: value.selectedRowIds,
    handleApplyBulkEdit: value.handleApplyBulkEdit,
    allManageableColumns: value.allManageableColumns,
    toggleVisibility: value.toggleVisibility,
    moveColumn: value.moveColumn,
    showAllColumns: value.showAllColumns,
    resetColumnOrder: value.resetColumnOrder,
    handleColumnDrop: value.handleColumnDrop,
    handleSaveQuickTraspaso: value.handleSaveQuickTraspaso,
    globalTicketConfig: value.globalTicketConfig,
    handleSaveTicketConfig: value.handleSaveTicketConfig,
    handleUniversalImportConfirmed: value.handleUniversalImportConfirmed,
    handleSyncRowsToVencimientos: value.handleSyncRowsToVencimientos,
    setSelectedRowIds: value.setSelectedRowIds,
    handleBulkDelete: value.handleBulkDelete,
    bulkActionCtx: value.bulkActionCtx,
    isZenMode: value.isZenMode,
    setIsZenMode: value.setIsZenMode,
    tableDensity: value.tableDensity,
    setTableDensity: value.setTableDensity,
    isSummaryView: value.isSummaryView,
    handleToggleSummaryView: value.handleToggleSummaryView,
    areFiltersVisible: value.areFiltersVisible,
    setAreFiltersVisible: value.setAreFiltersVisible,
    hasCustomColWidths: value.hasCustomColWidths,
    handleResetColWidths: value.handleResetColWidths,
    handleToggleStickyColumns: value.handleToggleStickyColumns,
    hiddenColumns: value.hiddenColumns,
    isActionsMenuOpen: value.isActionsMenuOpen,
    setIsActionsMenuOpen: value.setIsActionsMenuOpen,
    isSidebarCollapsed: value.isSidebarCollapsed,
    setIsSidebarCollapsed: value.setIsSidebarCollapsed,
    otherSheets: value.otherSheets,
    isMobileMenuOpen: value.isMobileMenuOpen,
    setIsMobileMenuOpen: value.setIsMobileMenuOpen,
    showToast: value.showToast,
    effectiveVisibleHeaders: value.effectiveVisibleHeaders,
    visibleColumnMeta: value.visibleColumnMeta,
    tableContainerRef: value.tableContainerRef,
    getColWidth: value.getColWidth,
    handleStartResize: value.handleStartResize,
    handleAutoFitColumn: value.handleAutoFitColumn,
    resizingCol: value.resizingCol,
    onSelectRow: value.onSelectRow,
    onClickItem: value.onClickItem,
    onDeleteRow: value.onDeleteRow,
    onPmRadarFilterClick: value.onPmRadarFilterClick,
    onEventResolutionFilterClick: value.onEventResolutionFilterClick,
    onEventFilterClick: value.onEventFilterClick,
    onFrcBodFilterClick: value.onFrcBodFilterClick,
    onOpenQuickTraspaso: value.onOpenQuickTraspaso,
    onOpenWhatsApp: value.onOpenWhatsApp,
    onOpenEmail: value.onOpenEmail,
    isWhatsAppEnabled: value.isWhatsAppEnabled,
    isEmailEnabled: value.isEmailEnabled,
    isCopyEnabled: value.isCopyEnabled,
    draggedCol: value.draggedCol,
    setDraggedCol: value.setDraggedCol,
    dragOverCol: value.dragOverCol,
    setDragOverCol: value.setDragOverCol,
    virtualRows: value.virtualRows,
    paginatedDisplayRows: value.paginatedDisplayRows,
    paddingTop: value.paddingTop,
    paddingBottom: value.paddingBottom,
    onSelectGroupRows: value.onSelectGroupRows,
    toggleGroupCollapse: value.toggleGroupCollapse,
    measureElementRef: value.measureElementRef,
    handleToggleSort: value.handleToggleSort,
    expandAllGroups: value.expandAllGroups,
    collapseAllGroups: value.collapseAllGroups,
    collapsedGroups: value.collapsedGroups,
    groupedItems: value.groupedItems,
    toggleGroupByDirection: value.toggleGroupByDirection,
  }), [
    value.selectedProduct, value.isModalOpen, value.editingItem, value.formData,
    value.formErrors, value.selectedEventCategory, value.isSaving, value.selectedRowIds,
    value.allManageableColumns, value.globalTicketConfig, value.isZenMode, value.tableDensity,
    value.isSummaryView, value.areFiltersVisible, value.hasCustomColWidths, value.hiddenColumns,
    value.isActionsMenuOpen, value.isSidebarCollapsed, value.isMobileMenuOpen,
    value.effectiveVisibleHeaders, value.visibleColumnMeta, value.resizingCol,
    value.draggedCol, value.dragOverCol, value.virtualRows, value.paginatedDisplayRows,
    value.paddingTop, value.paddingBottom, value.collapsedGroups, value.groupedItems
  ]);

  return (
    <SheetDataContext.Provider value={sheetData}>
      <FilterSettingsContext.Provider value={filterSettings}>
        <OfflineSyncContext.Provider value={offlineSync}>
          <FormStateContext.Provider value={formState}>
            <DashboardContext.Provider value={value}>
              {children}
            </DashboardContext.Provider>
          </FormStateContext.Provider>
        </OfflineSyncContext.Provider>
      </FilterSettingsContext.Provider>
    </SheetDataContext.Provider>
  );
};

export function useDashboard(): DashboardContextType {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}

/**
 * Hook to subscribe ONLY to Core Sheet Data & Metadata.
 * Prevents unnecessary re-renders when filters or offline queues update.
 */
export function useSheetData(): Partial<DashboardContextType> {
  const context = useContext(SheetDataContext);
  if (!context) {
    throw new Error('useSheetData must be used within a DashboardProvider');
  }
  return context;
}

/**
 * Hook to subscribe ONLY to Filters, Search, Chips and Slice settings.
 */
export function useFilterSettings(): Partial<DashboardContextType> {
  const context = useContext(FilterSettingsContext);
  if (!context) {
    throw new Error('useFilterSettings must be used within a DashboardProvider');
  }
  return context;
}

/**
 * Hook to subscribe ONLY to Offline Queue, Audits and Connectivity status.
 */
export function useOfflineSyncState(): Partial<DashboardContextType> {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSyncState must be used within a DashboardProvider');
  }
  return context;
}

/**
 * Hook to subscribe ONLY to UI Forms, Modals and Presentation styles.
 */
export function useFormState(): Partial<DashboardContextType> {
  const context = useContext(FormStateContext);
  if (!context) {
    throw new Error('useFormState must be used within a DashboardProvider');
  }
  return context;
}
