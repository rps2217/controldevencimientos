import React from 'react';
import { InventoryItem, SheetConfig, EventCategory, GlobalTicketConfig, ViewTicketConfig, TableSlice } from '../../types';
import { ItemDetailDrawer } from '../drawers/ItemDetailDrawer';
import { PmReportModal } from '../modals/PmReportModal';
import { ScriptCodeModal } from '../modals/ScriptCodeModal';
import { ItemFormModal } from '../modals/ItemFormModal';
import { GlobalConfigModal } from '../modals/GlobalConfigModal';
import { BarcodeScannerModal } from '../modals/BarcodeScannerModal';
import { MobilePistoleoTerminalModal } from '../modals/MobilePistoleoTerminalModal';
import { BulkEditModal } from '../modals/BulkEditModal';
import { GmailDraftModal } from '../modals/GmailDraftModal';
import { WhatsAppModal } from '../modals/WhatsAppModal';
import { ColumnManagerModal } from '../modals/ColumnManagerModal';
import { QuickTransferModal } from '../modals/QuickTransferModal';
import { TicketConfigModal } from '../modals/TicketConfigModal';
import { UniversalImportModal } from '../modals/UniversalImportModal';
import { BulkActionsConfigModal } from '../modals/BulkActionsConfigModal';
import { SliceManagerModal } from '../modals/SliceManagerModal';
import { SliceEditorModal } from '../modals/SliceEditorModal';
import { SyncAuditModal } from '../modals/SyncAuditModal';
import { StockCountTerminal } from '../views/StockCountTerminal';
import { ImportConsolidationMode } from '../../utils/cuVcConsolidator';
import { OfflineMutation, AuditLogEntry } from '../../db/indexedDbService';
import { ConnectionHealthStatus } from '../../hooks/useOfflineSync';
import { useDashboard } from '../../context/DashboardContext';

export interface DashboardModalsManagerProps {
  // Master-Detail Drawer
  selectedProduct: InventoryItem | null;
  setSelectedProduct: (p: InventoryItem | null) => void;
  handleOpenModal: (item?: InventoryItem, prefillSku?: string, initialCategory?: EventCategory) => void;
  handleDelete: (item: InventoryItem) => Promise<void>;
  handlePrintTicket: (items: InventoryItem[], mode: 'standard' | 'barcode') => void;
  allMainItems: InventoryItem[];
  policies: any[];
  products: any[];
  sheetConfig: SheetConfig;
  setSheetConfig: (c: SheetConfig) => void;
  saveConfig: (c: SheetConfig) => void;
  
  // PM Report
  isPmReportOpen: boolean;
  setIsPmReportOpen: (open: boolean) => void;
  drainageReportItems: InventoryItem[];

  // Script Code
  isScriptModalOpen: boolean;
  setIsScriptModalOpen: (open: boolean) => void;

  // Item Form
  isModalOpen: boolean;
  handleCloseModal: () => void;
  editingItem: InventoryItem | null;
  setEditingItem: (item: InventoryItem | null) => void;
  activeSheet: any;
  activeView: string;
  headers: string[];
  formData: Record<string, string>;
  formErrors: Record<string, string>;
  selectedEventCategory: EventCategory;
  handleSelectEventCategory: (cat: EventCategory) => void;
  handleFormChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handleSave: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;
  handleBatchFormUpdate: (updates: Record<string, string>) => void;

  // Global Config
  isConfigOpen: boolean;
  setIsConfigOpen: (open: boolean) => void;
  metadata: any;
  fetchData: (config?: SheetConfig, view?: string, force?: boolean) => Promise<void>;

  // Barcode Scanner
  isScannerOpen: boolean;
  setIsScannerOpen: (open: boolean) => void;
  setSearchTerm: (code: string) => void;

  // Mobile Pistoleo Terminal
  isMobilePistoleoOpen: boolean;
  setIsMobilePistoleoOpen: (open: boolean) => void;
  handleSavePistoleoItem: (formData: Record<string, string>, targetExistingItem?: InventoryItem) => Promise<void>;

  // Bulk Edit
  isBulkEditOpen: boolean;
  setIsBulkEditOpen: (open: boolean) => void;
  selectedRowIds: number[];
  handleApplyBulkEdit: (values: { frc_n: string; n_traspaso: string; tipo_evento: string; frc_bod: string }) => Promise<void>;

  // Gmail
  isGmailModalOpen: boolean;
  setIsGmailModalOpen: (open: boolean) => void;
  gmailModalItems: any[];
  setGmailModalItems: (items: any[]) => void;
  filteredItems: InventoryItem[];
  visibleHeaders: string[];

  // WhatsApp
  isWhatsAppModalOpen: boolean;
  setIsWhatsAppModalOpen: (open: boolean) => void;
  whatsAppModalItems: any[];
  setWhatsAppModalItems: (items: any[]) => void;

  // Column Manager
  isColumnManagerOpen: boolean;
  setIsColumnManagerOpen: (open: boolean) => void;
  allManageableColumns: any[];
  toggleVisibility: (col: string) => void;
  moveColumn: (colId: string, direction: 'up' | 'down') => void;
  showAllColumns: () => void;
  resetColumnOrder: () => void;
  handleColumnDrop: (dragged: string, droppedOn: string) => void;

  // Quick Transfer
  isQuickTraspasoOpen: boolean;
  setIsQuickTraspasoOpen: (open: boolean) => void;
  quickTraspasoItem: InventoryItem | null;
  setQuickTraspasoItem: (item: InventoryItem | null) => void;
  handleSaveQuickTraspaso: (item: InventoryItem, folio: string) => Promise<void>;

  // Ticket Config
  isTicketConfigOpen: boolean;
  setIsTicketConfigOpen: (open: boolean) => void;
  globalTicketConfig: GlobalTicketConfig;
  handleSaveTicketConfig: (view: string, viewConfig: ViewTicketConfig) => void;

  // Universal Import
  isBulkImportOpen: boolean;
  setIsBulkImportOpen: (open: boolean) => void;
  handleUniversalImportConfirmed: (mappedData: Record<string, any>[], mode?: ImportConsolidationMode) => Promise<void>;

  // Bulk Actions Config
  isBulkActionsConfigOpen: boolean;
  setIsBulkActionsConfigOpen: (open: boolean) => void;

  // Slice Management
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

  // Slice Editor
  isSliceModalOpen: boolean;
  setIsSliceModalOpen: (open: boolean) => void;
  editingSliceModalItem: TableSlice | null;
  currentFilters: any;
  sortConfig: any;
  groupByColumn: string;
  groupByDirection: 'asc' | 'desc';
  handleSaveSlice: (slice: TableSlice) => void;

  // Stock Count Terminal
  isStockCountOpen: boolean;
  setIsStockCountOpen: (open: boolean) => void;
  items: InventoryItem[];
  handleSyncRowsToVencimientos: (rows: Record<string, any>[]) => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info', title?: string) => void;

  // Sync & Audit Modal
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
  syncQueue: () => Promise<any>;
  removeMutation: (id: string) => Promise<void>;
  discardMutation?: (id: string, reason?: string) => Promise<any>;
  discardAllFailedMutations?: () => Promise<number>;
  retryMutation?: (id: string) => Promise<any>;
  retryAllFailedMutations?: () => Promise<any>;
  forkMutationAsAppend?: (id: string) => Promise<any>;
  clearQueue: () => Promise<void>;
  clearAuditLog: () => Promise<void>;
}

export const DashboardModalsManager: React.FC<Partial<DashboardModalsManagerProps>> = (props) => {
  const context = useDashboard();
  const {
    selectedProduct,
    setSelectedProduct,
    handleOpenModal,
    handleDelete,
    handlePrintTicket,
    allMainItems,
    policies,
    products,
    sheetConfig,
    setSheetConfig,
    saveConfig,
    isPmReportOpen,
    setIsPmReportOpen,
    drainageReportItems,
    isScriptModalOpen,
    setIsScriptModalOpen,
    isModalOpen,
    handleCloseModal,
    editingItem,
    setEditingItem,
    activeSheet,
    activeView,
    headers,
    formData,
    formErrors,
    selectedEventCategory,
    handleSelectEventCategory,
    handleFormChange,
    handleSave,
    isSaving,
    handleBatchFormUpdate,
    isConfigOpen,
    setIsConfigOpen,
    metadata,
    fetchData,
    isScannerOpen,
    setIsScannerOpen,
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
    filteredItems,
    visibleHeaders,
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
    currentFilters,
    sortConfig,
    groupByColumn,
    groupByDirection,
    handleSaveSlice,
    isStockCountOpen,
    setIsStockCountOpen,
    items,
    handleSyncRowsToVencimientos,
    showToast,
    isSyncAuditOpen,
    setIsSyncAuditOpen,
    offlineQueue,
    auditLog,
    isOffline,
    isSyncing,
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
    clearQueue,
    clearAuditLog,
  } = { ...context, ...props };

  return (
    <>
      {/* 1. MASTER-DETAIL PRODUCT DRAWER */}
      <ItemDetailDrawer
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onEdit={(prod) => {
          setSelectedProduct(null);
          handleOpenModal(prod);
        }}
        onDeleteRow={handleDelete}
        onPrintBarcode={(prod) => handlePrintTicket([prod], 'barcode')}
        onNewEventForProduct={(sku, category) => {
          handleOpenModal(undefined, sku, category);
        }}
        allMainItems={allMainItems}
        policies={policies}
        products={products}
        customAliases={sheetConfig.customAliases}
      />

      {/* 2. PM DRAINAGE REPORT MODAL */}
      <PmReportModal
        isOpen={isPmReportOpen}
        onClose={() => setIsPmReportOpen(false)}
        drainageReportItems={drainageReportItems}
      />

      {/* 3. GOOGLE APPS SCRIPT CODE MODAL */}
      <ScriptCodeModal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
      />

      {/* 4. MAIN FORM MODAL */}
      <ItemFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editingItem={editingItem}
        onSetEditingItem={setEditingItem}
        existingItems={items}
        activeSheet={activeSheet}
        activeView={activeView}
        headers={headers}
        formData={formData}
        formErrors={formErrors}
        selectedEventCategory={selectedEventCategory}
        onSelectEventCategory={handleSelectEventCategory}
        onChange={handleFormChange}
        onSave={handleSave}
        isSaving={isSaving}
        sheetConfig={sheetConfig}
        products={products}
        onBatchUpdateFormData={handleBatchFormUpdate}
        policies={policies}
      />

      {/* 5. GLOBAL CONFIG MODAL */}
      <GlobalConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        sheetConfig={sheetConfig}
        setSheetConfig={setSheetConfig}
        saveConfig={saveConfig}
        metadata={metadata}
        fetchData={fetchData}
        activeView={activeView}
        activeSheetTitle={activeSheet?.title || activeView}
        headers={headers}
      />

      {/* BARCODE SCANNER MODAL */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(code) => setSearchTerm(code)}
      />

      {/* MOBILE PISTOLEO TERMINAL MODAL */}
      <MobilePistoleoTerminalModal
        isOpen={isMobilePistoleoOpen}
        onClose={() => setIsMobilePistoleoOpen(false)}
        items={items}
        headers={headers}
        masterProducts={products}
        policies={policies}
        activeSheetTitle={activeSheet?.title || activeView}
        onSaveItem={handleSavePistoleoItem}
        onDeleteItem={handleDelete}
        onOpenFullModal={(prod, prefillSku) => {
          handleOpenModal(prod, prefillSku);
        }}
        showToast={showToast}
      />

      {/* BULK EDIT MODAL */}
      <BulkEditModal
        isOpen={isBulkEditOpen}
        onClose={() => setIsBulkEditOpen(false)}
        selectedCount={selectedRowIds.length}
        onApply={handleApplyBulkEdit}
      />

      {/* GMAIL DRAFT MODAL */}
      <GmailDraftModal
        isOpen={isGmailModalOpen}
        onClose={() => {
          setIsGmailModalOpen(false);
          setGmailModalItems([]);
        }}
        selectedItems={gmailModalItems.length > 0 ? gmailModalItems : (selectedRowIds.length > 0 ? filteredItems.filter(i => selectedRowIds.includes(i._rowIndex as number)) : filteredItems)}
        headers={visibleHeaders.length > 0 ? visibleHeaders : headers}
        customAliases={sheetConfig.customAliases}
        activeViewTitle={
          activeView === 'main' ? 'Vencimientos y Drenaje' :
          activeView === 'events' ? 'Incidencias FRC' :
          activeView === 'products' ? 'Productos' : 'Inventario'
        }
        allMainItems={allMainItems}
        products={products}
        policies={policies}
      />

      {/* WHATSAPP MODAL */}
      <WhatsAppModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => {
          setIsWhatsAppModalOpen(false);
          setWhatsAppModalItems([]);
        }}
        selectedItems={whatsAppModalItems.length > 0 ? whatsAppModalItems : (selectedRowIds.length > 0 ? filteredItems.filter(i => selectedRowIds.includes(i._rowIndex as number)) : filteredItems)}
        headers={headers}
        customAliases={sheetConfig.customAliases}
      />

      {/* COLUMN MANAGER MODAL */}
      <ColumnManagerModal
        isOpen={isColumnManagerOpen}
        onClose={() => setIsColumnManagerOpen(false)}
        columns={allManageableColumns}
        toggleVisibility={toggleVisibility}
        moveColumn={moveColumn}
        showAllColumns={showAllColumns}
        resetColumnOrder={resetColumnOrder}
        handleColumnDrop={handleColumnDrop}
      />

      {/* QUICK TRANSFER MODAL */}
      <QuickTransferModal
        isOpen={isQuickTraspasoOpen}
        onClose={() => {
          setIsQuickTraspasoOpen(false);
          setQuickTraspasoItem(null);
        }}
        item={quickTraspasoItem}
        headers={headers}
        onSave={handleSaveQuickTraspaso}
      />
      
      {/* TICKET CONFIG MODAL */}
      <TicketConfigModal
        isOpen={isTicketConfigOpen}
        onClose={() => setIsTicketConfigOpen(false)}
        headers={headers}
        activeView={activeView}
        config={globalTicketConfig[activeView] || sheetConfig.ticketPrintConfig?.[activeView] || {}}
        onSave={handleSaveTicketConfig}
        sampleItems={filteredItems}
      />

      {/* UNIVERSAL IMPORT MODAL */}
      <UniversalImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        targetHeaders={headers}
        activeSheetTitle={activeSheet?.title || 'Hoja Activa'}
        existingItems={items}
        customAliases={sheetConfig.customAliases}
        onImportConfirmed={handleUniversalImportConfirmed}
      />

      {/* BULK ACTIONS CONFIGURATION MODAL */}
      <BulkActionsConfigModal
        isOpen={isBulkActionsConfigOpen}
        onClose={() => setIsBulkActionsConfigOpen(false)}
        sheetConfig={sheetConfig}
        setSheetConfig={setSheetConfig}
        saveConfig={saveConfig}
        activeSheetTitle={activeSheet?.title || ''}
        activeView={activeView}
        headers={headers}
        metadata={metadata}
      />

      {/* SLICE MANAGER MODAL */}
      <SliceManagerModal
        isOpen={isSliceManagerOpen}
        onClose={() => setIsSliceManagerOpen(false)}
        tableKey={activeView}
        slices={currentTableSlices}
        sliceCounts={sliceCounts}
        activeSliceId={activeSliceId}
        hiddenSliceIds={hiddenSliceIds}
        onSelectSlice={handleSelectSlice}
        onEditSlice={(slice) => {
          setEditingSliceModalItem(slice);
          setIsSliceModalOpen(true);
        }}
        onCreateSlice={() => {
          setEditingSliceModalItem(null);
          setIsSliceModalOpen(true);
        }}
        onDeleteSlice={handleDeleteSlice}
        onToggleSliceVisibility={handleToggleSliceVisibility}
        onSetBulkVisibility={handleSetBulkVisibility}
      />

      {/* SLICE EDITOR MODAL */}
      <SliceEditorModal
        isOpen={isSliceModalOpen}
        onClose={() => {
          setIsSliceModalOpen(false);
          setEditingSliceModalItem(null);
        }}
        tableKey={activeView}
        headers={headers}
        currentFilters={currentFilters}
        currentSort={sortConfig}
        currentGroupBy={groupByColumn}
        currentGroupByDirection={groupByDirection}
        currentVisibleHeaders={visibleHeaders}
        editingSlice={editingSliceModalItem}
        onSaveSlice={handleSaveSlice}
        onDeleteSlice={handleDeleteSlice}
      />

      {/* STOCK COUNT TERMINAL OVERLAY */}
      {isStockCountOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full h-full max-w-7xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col">
            <StockCountTerminal
              sheetItems={items}
              headers={headers}
              masterProducts={products}
              activeSheetTitle={activeSheet?.title || 'VENCIMIENTOS'}
              onSyncRowsToVencimientos={handleSyncRowsToVencimientos}
              showToast={showToast}
              onClose={() => setIsStockCountOpen(false)}
            />
          </div>
        </div>
      )}
      {/* SYNC & AUDIT MODAL */}
      <SyncAuditModal
        isOpen={isSyncAuditOpen}
        onClose={() => setIsSyncAuditOpen(false)}
        offlineQueue={offlineQueue}
        auditLog={auditLog}
        isOffline={isOffline}
        isSyncing={isSyncing}
        latencyMs={latencyMs}
        connectionStatus={connectionStatus}
        lastHealthCheck={lastHealthCheck}
        healthErrorMessage={healthErrorMessage}
        testConnectionHealth={testConnectionHealth}
        syncQueue={syncQueue}
        removeMutation={removeMutation}
        discardMutation={discardMutation}
        discardAllFailedMutations={discardAllFailedMutations}
        retryMutation={retryMutation}
        retryAllFailedMutations={retryAllFailedMutations}
        forkMutationAsAppend={forkMutationAsAppend}
        clearQueue={clearQueue}
        clearAuditLog={clearAuditLog}
        showToast={showToast}
      />
    </>
  );
};
