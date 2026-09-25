import React, { createContext, useContext } from 'react';
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
  activeView: string;
  setActiveView: (view: string) => void;
  headers: string[];
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

const DashboardContext = createContext<DashboardContextType | null>(null);

export const DashboardProvider: React.FC<{
  value: DashboardContextType;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};

export function useDashboard(): DashboardContextType {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
