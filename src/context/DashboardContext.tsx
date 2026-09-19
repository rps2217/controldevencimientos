import React, { createContext, useContext } from 'react';
import { 
  InventoryItem, 
  SheetConfig, 
  SheetProperties, 
  SpreadsheetMetadata, 
  EventCategory, 
  GlobalTicketConfig, 
  ViewTicketConfig,
  TableSlice,
  SortConfig,
  DynamicMonthRange
} from '../types';
import { OfflineMutation, AuditLogEntry } from '../db/indexedDbService';
import { ConnectionHealthStatus } from '../hooks/useOfflineSync';
import { BulkActionContext } from '../utils/bulkActionsRegistry';

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
  products: any[];
  policies: any[];
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
  isPmReportOpen: boolean;
  setIsPmReportOpen: (open: boolean) => void;
  drainageReportItems: InventoryItem[];

  // Script Code Modal
  isScriptModalOpen: boolean;
  setIsScriptModalOpen: (open: boolean) => void;

  // Global Config Modal
  isConfigOpen: boolean;
  setIsConfigOpen: (open: boolean) => void;

  // Barcode Scanner Modal
  isScannerOpen: boolean;
  setIsScannerOpen: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (code: string) => void;

  // Mobile Pistoleo Terminal
  isMobilePistoleoOpen: boolean;
  setIsMobilePistoleoOpen: (open: boolean) => void;
  handleSavePistoleoItem: (formData: Record<string, string>, targetExistingItem?: InventoryItem) => Promise<void>;

  // Bulk Edit Modal
  isBulkEditOpen: boolean;
  setIsBulkEditOpen: (open: boolean) => void;
  selectedRowIds: number[];
  handleApplyBulkEdit: (values: { frc_n: string; n_traspaso: string; tipo_evento: string; frc_bod: string }) => Promise<void>;

  // Gmail Modal
  isGmailModalOpen: boolean;
  setIsGmailModalOpen: (open: boolean) => void;
  gmailModalItems: any[];
  setGmailModalItems: (items: any[]) => void;

  // WhatsApp Modal
  isWhatsAppModalOpen: boolean;
  setIsWhatsAppModalOpen: (open: boolean) => void;
  whatsAppModalItems: any[];
  setWhatsAppModalItems: (items: any[]) => void;

  // Column Manager Modal
  isColumnManagerOpen: boolean;
  setIsColumnManagerOpen: (open: boolean) => void;
  allManageableColumns: any[];
  toggleVisibility: (col: string) => void;
  moveColumn: (colId: string, direction: 'up' | 'down') => void;
  showAllColumns: () => void;
  resetColumnOrder: () => void;
  handleColumnDrop: (draggedCol: string, targetCol: string) => void;

  // Quick Traspaso Modal
  isQuickTraspasoOpen: boolean;
  setIsQuickTraspasoOpen: (open: boolean) => void;
  quickTraspasoItem: InventoryItem | null;
  setQuickTraspasoItem: (item: InventoryItem | null) => void;
  handleSaveQuickTraspaso: (targetItem: InventoryItem, traspasoNumber: string) => Promise<void>;

  // Ticket Config Modal
  isTicketConfigOpen: boolean;
  setIsTicketConfigOpen: (open: boolean) => void;
  globalTicketConfig: GlobalTicketConfig;
  handleSaveTicketConfig: (view: string, viewConfig: ViewTicketConfig) => void;

  // Bulk Import Modal
  isBulkImportOpen: boolean;
  setIsBulkImportOpen: (open: boolean) => void;
  handleUniversalImportConfirmed: (importedRows: Record<string, any>[], mode?: any) => Promise<void>;

  // Bulk Actions Config Modal
  isBulkActionsConfigOpen: boolean;
  setIsBulkActionsConfigOpen: (open: boolean) => void;

  // Slices & Views
  isSliceManagerOpen: boolean;
  setIsSliceManagerOpen: (open: boolean) => void;
  currentTableSlices: TableSlice[];
  sliceCounts: Record<string, number>;
  activeSliceId: string | null;
  hiddenSliceIds: string[];
  handleSelectSlice: (slice: TableSlice | null) => void;
  setEditingSliceModalItem: (slice: TableSlice | null) => void;
  handleDeleteSlice: (sliceId: string) => void;
  handleToggleSliceVisibility: (sliceId: string) => void;
  handleSetBulkVisibility: (sliceIds: string[], visible: boolean) => void;
  isSliceModalOpen: boolean;
  setIsSliceModalOpen: (open: boolean) => void;
  editingSliceModalItem: TableSlice | null;
  currentFilters: any;
  sortConfig: any;
  groupByColumn: string | null;
  groupByDirection: 'asc' | 'desc';
  handleSaveSlice: (slice: TableSlice) => void;

  // Stock Count Terminal
  isStockCountOpen: boolean;
  setIsStockCountOpen: (open: boolean) => void;
  handleSyncRowsToVencimientos: (rows: Record<string, any>[]) => Promise<void>;

  // Sync Audit & Offline State
  isSyncAuditOpen: boolean;
  setIsSyncAuditOpen: (open: boolean) => void;
  offlineQueue: OfflineMutation[];
  auditLog: AuditLogEntry[];
  isOffline: boolean;
  isSyncing: boolean;
  latencyMs: number | null;
  connectionStatus: ConnectionHealthStatus;
  lastHealthCheck: Date | null;
  healthErrorMessage: string | null;
  testConnectionHealth: () => Promise<any>;
  syncQueue: (targetMutationId?: string) => Promise<any>;
  removeMutation: (id: string) => Promise<void>;
  discardMutation: (id: string, reason?: string) => Promise<any>;
  discardAllFailedMutations: () => Promise<number>;
  retryMutation: (id: string) => Promise<any>;
  retryAllFailedMutations: () => Promise<any>;
  forkMutationAsAppend: (id: string) => Promise<any>;
  failedMutations: OfflineMutation[];
  failedCount: number;
  clearQueue: () => Promise<void>;
  clearAuditLog: () => Promise<void>;

  // Bulk Operations & Selection
  setSelectedRowIds?: React.Dispatch<React.SetStateAction<number[]>> | ((ids: number[]) => void);
  handleBulkDelete?: () => Promise<void> | void;
  bulkActionCtx?: BulkActionContext;
  columnLabelsMap?: Record<string, string>;

  // View & Presentation Controls
  isRightDrawerOpen?: boolean;
  setIsRightDrawerOpen?: (open: boolean) => void;
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
  eventResolutionMetrics?: any;
  eventFilter?: any[];
  setEventFilter?: React.Dispatch<React.SetStateAction<any[]>>;
  eventMetrics?: any;
  frcBodValues?: string[];
  frcBodCounts?: Record<string, number>;
  frcBodFilter?: string[];
  setFrcBodFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  pmRadarFilter?: string[];
  setPmRadarFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  pmMetrics?: any;

  // Table Container & Virtualization
  effectiveVisibleHeaders?: string[];
  visibleColumnMeta?: any[];
  tableContainerRef?: React.RefObject<HTMLDivElement>;
  getColWidth?: (headerId: string, label: string, type?: string) => number;
  handleStartResize?: (colId: string, startWidth: number, e: React.MouseEvent) => void;
  handleAutoFitColumn?: (colId: string, label: string) => void;
  resizingCol?: { colId: string; startWidth: number } | null;
  onSelectRow?: (rowIndex: number, selected: boolean) => void;
  onClickItem?: (item: InventoryItem) => void;
  onDeleteRow?: (item: InventoryItem) => void;
  onPmRadarFilterClick?: (targetFilter: string, isMulti: boolean) => void;
  onEventResolutionFilterClick?: (status: 'pending' | 'completed', isMulti: boolean) => void;
  onEventFilterClick?: (eventCat: any, isMulti: boolean) => void;
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
  columnOptionsMap?: Record<string, any[]>;
  frcBodCol?: string;
  virtualRows?: any[];
  paginatedDisplayRows?: any[];
  paddingTop?: number;
  paddingBottom?: number;
  onSelectGroupRows?: (rowIndexes: number[], selected: boolean) => void;
  toggleGroupCollapse?: (groupKey: string) => void;
  measureElementRef?: (node: HTMLElement | null) => void;
  handleToggleSort?: (columnName: string) => void;
  expandAllGroups?: () => void;
  collapseAllGroups?: () => void;
  collapsedGroups?: Record<string, boolean>;
  groupedItems?: any[] | null;
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
