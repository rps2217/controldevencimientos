import React, { lazy, Suspense } from 'react';
import { InventoryItem, SheetConfig, EventCategory, GlobalTicketConfig, ViewTicketConfig, TableSlice, SheetRecord, SheetProperties, SpreadsheetMetadata, SortConfig, SliceFilterConfig } from '../../types';
import { LazyFallback } from '../common/LazyFallback';
import { ScopedErrorBoundary } from '../common/ScopedErrorBoundary';
import { ImportConsolidationMode } from '../../utils/cuVcConsolidator';
import { OfflineMutation, AuditLogEntry } from '../../db/indexedDbService';
import { ConnectionHealthStatus } from '../../hooks/useOfflineSync';
import { useDashboard } from '../../context/DashboardContext';
import { useModalsActions, useModalsState } from '../../context/ModalsContext';
import { ManageableColumn } from '../../hooks/useColumnManager';

const PmReportModal = lazy(() => import('../modals/PmReportModal').then(m => ({ default: m.PmReportModal })));
const ScriptCodeModal = lazy(() => import('../modals/ScriptCodeModal').then(m => ({ default: m.ScriptCodeModal })));
const ItemFormModal = lazy(() => import('../modals/ItemFormModal').then(m => ({ default: m.ItemFormModal })));
const GlobalConfigModal = lazy(() => import('../modals/GlobalConfigModal').then(m => ({ default: m.GlobalConfigModal })));
const BarcodeScannerModal = lazy(() => import('../modals/BarcodeScannerModal').then(m => ({ default: m.BarcodeScannerModal })));
const MobilePistoleoTerminalModal = lazy(() => import('../modals/MobilePistoleoTerminalModal').then(m => ({ default: m.MobilePistoleoTerminalModal })));
const BulkEditModal = lazy(() => import('../modals/BulkEditModal').then(m => ({ default: m.BulkEditModal })));
const GmailDraftModal = lazy(() => import('../modals/GmailDraftModal').then(m => ({ default: m.GmailDraftModal })));
const WhatsAppModal = lazy(() => import('../modals/WhatsAppModal').then(m => ({ default: m.WhatsAppModal })));
const ColumnManagerModal = lazy(() => import('../modals/ColumnManagerModal').then(m => ({ default: m.ColumnManagerModal })));
const QuickTransferModal = lazy(() => import('../modals/QuickTransferModal').then(m => ({ default: m.QuickTransferModal })));
const TicketConfigModal = lazy(() => import('../modals/TicketConfigModal').then(m => ({ default: m.TicketConfigModal })));
const UniversalImportModal = lazy(() => import('../modals/UniversalImportModal').then(m => ({ default: m.UniversalImportModal })));
const BulkActionsConfigModal = lazy(() => import('../modals/BulkActionsConfigModal').then(m => ({ default: m.BulkActionsConfigModal })));
const SliceManagerModal = lazy(() => import('../modals/SliceManagerModal').then(m => ({ default: m.SliceManagerModal })));
const SliceEditorModal = lazy(() => import('../modals/SliceEditorModal').then(m => ({ default: m.SliceEditorModal })));
const SyncAuditModal = lazy(() => import('../modals/SyncAuditModal').then(m => ({ default: m.SyncAuditModal })));
const StockCountTerminal = lazy(() => import('../views/StockCountTerminal').then(m => ({ default: m.StockCountTerminal })));
const CrossTableRelationalMenu = lazy(() => import('../views/CrossTableRelationalMenu').then(m => ({ default: m.CrossTableRelationalMenu })));

export interface DashboardModalsManagerProps {
  handleOpenModal: (item?: InventoryItem, prefillSku?: string, initialCategory?: EventCategory) => void;
  handleDelete: (item: InventoryItem) => Promise<void>;
  allMainItems: InventoryItem[];
  policies: SheetRecord[];
  products: SheetRecord[];
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
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
  activeSheet: SheetProperties | null;
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
  metadata: SpreadsheetMetadata | null;
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
  gmailModalItems: InventoryItem[];
  setGmailModalItems: (items: InventoryItem[]) => void;
  filteredItems: InventoryItem[];
  visibleHeaders: string[];

  // WhatsApp
  isWhatsAppModalOpen: boolean;
  setIsWhatsAppModalOpen: (open: boolean) => void;
  whatsAppModalItems: InventoryItem[];
  setWhatsAppModalItems: (items: InventoryItem[]) => void;

  // Column Manager
  isColumnManagerOpen: boolean;
  setIsColumnManagerOpen: (open: boolean) => void;
  allManageableColumns: ManageableColumn[];
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
  handleUniversalImportConfirmed: (mappedData: SheetRecord[], mode?: ImportConsolidationMode) => Promise<void>;

  // Bulk Actions Config
  isBulkActionsConfigOpen: boolean;
  setIsBulkActionsConfigOpen: (open: boolean) => void;

  // Slice Management
  currentTableSlices: TableSlice[];
  sliceCounts: Record<string, number>;
  activeSliceId: string | null;
  hiddenSliceIds: string[];
  handleSelectSlice: (slice: TableSlice | null) => void;
  handleDeleteSlice: (sliceId: string) => void;
  handleToggleSliceVisibility: (sliceId: string) => void;
  handleSetBulkVisibility: (sliceIds: string[], visible: boolean) => void;

  // Slice Editor
  currentFilters: SliceFilterConfig;
  sortConfig: SortConfig;
  groupByColumn: string;
  groupByDirection: 'asc' | 'desc';
  handleSaveSlice: (slice: TableSlice) => void;

  // Stock Count Terminal
  isStockCountOpen: boolean;
  setIsStockCountOpen: (open: boolean) => void;
  items: InventoryItem[];
  handleSyncRowsToVencimientos: (rows: SheetRecord[]) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string) => void;

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
  scriptSupportsAtomicSave?: boolean | null;
  testConnectionHealth: () => Promise<{ success: boolean; latencyMs: number; status: ConnectionHealthStatus; error?: string }>;
  syncQueue: (targetMutationId?: string) => Promise<{ success: boolean; count: number; errors: string[] }>;
  removeMutation: (id: string) => Promise<void>;
  discardMutation?: (id: string, reason?: string) => Promise<OfflineMutation | null>;
  discardAllFailedMutations?: () => Promise<number>;
  retryMutation?: (id: string) => Promise<{ success: boolean; count: number; errors: string[] }>;
  retryAllFailedMutations?: () => Promise<{ success: boolean; count: number; errors: string[] }>;
  forkMutationAsAppend?: (id: string) => Promise<OfflineMutation | null>;
  clearQueue: () => Promise<void>;
  clearAuditLog: () => Promise<void>;
}

export const DashboardModalsManager: React.FC<Partial<DashboardModalsManagerProps>> = (props) => {
  const context = useDashboard();
  const {
    handleOpenModal,
    handleDelete,
    allMainItems,
    policies,
    products,
    sheetConfig,
    setSheetConfig,
    saveConfig,
    drainageReportItems,
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
    metadata,
    fetchData,
    setSearchTerm,
    handleSavePistoleoItem,
    selectedRowIds,
    handleApplyBulkEdit,
    filteredItems,
    visibleHeaders,
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
    currentFilters,
    sortConfig,
    groupByColumn,
    groupByDirection,
    handleSaveSlice,
    items,
    handleSyncRowsToVencimientos,
    showToast,
    offlineQueue,
    auditLog,
    isOffline,
    isSyncing,
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
    clearQueue,
    clearAuditLog,
  } = { ...context, ...props };

  // Estado y acciones de modales vienen del contexto dedicado (Fase 1.3), no del
  // value del dashboard: abrir un modal ya no re-renderiza el cuerpo del dashboard.
  const modalsState = useModalsState();
  const modalsActions = useModalsActions();
  const {
    isPmReportOpen, isScriptModalOpen, isConfigOpen, isScannerOpen,
    isMobilePistoleoOpen, isBulkEditOpen, isGmailModalOpen, gmailModalItems,
    isWhatsAppModalOpen, whatsAppModalItems, isColumnManagerOpen,
    isQuickTraspasoOpen, quickTraspasoItem, isTicketConfigOpen, isBulkImportOpen,
    isBulkActionsConfigOpen, isStockCountOpen, isSyncAuditOpen,
  } = modalsState;
  // Slices: UI pura, movida a ModalsContext en el segundo corte de Fase 1.3.
  const { isSliceManagerOpen, isSliceModalOpen, editingSliceModalItem } = modalsState;
  const {
    setIsPmReportOpen, setIsScriptModalOpen, setIsConfigOpen, setIsScannerOpen,
    setIsMobilePistoleoOpen, setIsBulkEditOpen, setIsGmailModalOpen, setGmailModalItems,
    setIsWhatsAppModalOpen, setWhatsAppModalItems, setIsColumnManagerOpen,
    setIsQuickTraspasoOpen, setQuickTraspasoItem, setIsTicketConfigOpen,
    setIsBulkImportOpen, setIsBulkActionsConfigOpen, setIsStockCountOpen, setIsSyncAuditOpen,
  } = modalsActions;
  const { setIsSliceManagerOpen, setIsSliceModalOpen, setEditingSliceModalItem } = modalsActions;

  return (
    <>
      {/* 2. PM DRAINAGE REPORT MODAL */}
      {isPmReportOpen && (
        <ScopedErrorBoundary moduleName="Reporte PM / Drenaje" onReset={() => setIsPmReportOpen(false)}>
          <Suspense fallback={<LazyFallback />}>
            <PmReportModal
              isOpen={isPmReportOpen}
              onClose={() => setIsPmReportOpen(false)}
              drainageReportItems={selectedRowIds.length > 0 ? filteredItems.filter(i => new Set(selectedRowIds.map(Number)).has(Number(i._rowIndex))) : drainageReportItems}
            />
          </Suspense>
        </ScopedErrorBoundary>
      )}

      {/* 3. GOOGLE APPS SCRIPT CODE MODAL */}
      {isScriptModalOpen && (
        <Suspense fallback={<LazyFallback />}>
          <ScriptCodeModal
            isOpen={isScriptModalOpen}
            onClose={() => setIsScriptModalOpen(false)}
          />
        </Suspense>
      )}

      {/* 4. MAIN FORM MODAL */}
      {isModalOpen && (
        <ScopedErrorBoundary moduleName="Formulario de Registro" onReset={handleCloseModal}>
          <Suspense fallback={<LazyFallback />}>
            <ItemFormModal
              isOpen={isModalOpen}
              onClose={handleCloseModal}
              editingItem={editingItem}
              onSetEditingItem={setEditingItem}
              existingItems={items}
              activeSheet={activeSheet}
              canExpire={context.tableCapabilities?.has('vencimiento') ?? false}
              canLogEvents={context.tableCapabilities?.has('incidencia') ?? false}
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
          </Suspense>
        </ScopedErrorBoundary>
      )}

      {/* 5. GLOBAL CONFIG MODAL */}
      {isConfigOpen && (
        <ScopedErrorBoundary moduleName="Configuración Global" onReset={() => setIsConfigOpen(false)}>
          <Suspense fallback={<LazyFallback />}>
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
          </Suspense>
        </ScopedErrorBoundary>
      )}

      {/* BARCODE SCANNER MODAL */}
      {isScannerOpen && (
        <Suspense fallback={<LazyFallback />}>
          <BarcodeScannerModal
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScanSuccess={(code) => setSearchTerm(code)}
          />
        </Suspense>
      )}

      {/* MOBILE PISTOLEO TERMINAL MODAL */}
      {isMobilePistoleoOpen && (
        <Suspense fallback={<LazyFallback />}>
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
        </Suspense>
      )}

      {/* BULK EDIT MODAL */}
      {isBulkEditOpen && (
        <Suspense fallback={<LazyFallback />}>
          <BulkEditModal
            isOpen={isBulkEditOpen}
            onClose={() => setIsBulkEditOpen(false)}
            selectedCount={selectedRowIds.length}
            onApply={handleApplyBulkEdit}
          />
        </Suspense>
      )}

      {/* GMAIL DRAFT MODAL */}
      {isGmailModalOpen && (
        <Suspense fallback={<LazyFallback />}>
          <GmailDraftModal
            isOpen={isGmailModalOpen}
            onClose={() => {
              setIsGmailModalOpen(false);
              setGmailModalItems([]);
            }}
            selectedItems={gmailModalItems.length > 0 ? gmailModalItems : (selectedRowIds.length > 0 ? filteredItems.filter(i => new Set(selectedRowIds.map(Number)).has(Number(i._rowIndex))) : filteredItems)}
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
        </Suspense>
      )}

      {/* WHATSAPP MODAL */}
      {isWhatsAppModalOpen && (
        <Suspense fallback={<LazyFallback />}>
          <WhatsAppModal
            isOpen={isWhatsAppModalOpen}
            onClose={() => {
              setIsWhatsAppModalOpen(false);
              setWhatsAppModalItems([]);
            }}
            selectedItems={whatsAppModalItems.length > 0 ? whatsAppModalItems : (selectedRowIds.length > 0 ? filteredItems.filter(i => new Set(selectedRowIds.map(Number)).has(Number(i._rowIndex))) : filteredItems)}
            headers={headers}
            customAliases={sheetConfig.customAliases}
          />
        </Suspense>
      )}

      {/* COLUMN MANAGER MODAL */}
      {isColumnManagerOpen && (
        <Suspense fallback={<LazyFallback />}>
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
        </Suspense>
      )}

      {/* QUICK TRANSFER MODAL */}
      {isQuickTraspasoOpen && (
        <Suspense fallback={<LazyFallback />}>
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
        </Suspense>
      )}
      
      {/* TICKET CONFIG MODAL */}
      {isTicketConfigOpen && (
        <Suspense fallback={<LazyFallback />}>
          <TicketConfigModal
            isOpen={isTicketConfigOpen}
            onClose={() => setIsTicketConfigOpen(false)}
            headers={headers}
            activeView={activeView}
            config={globalTicketConfig[activeView] || sheetConfig.ticketPrintConfig?.[activeView] || {}}
            onSave={handleSaveTicketConfig}
            sampleItems={filteredItems}
          />
        </Suspense>
      )}

      {/* UNIVERSAL IMPORT MODAL */}
      {isBulkImportOpen && (
        <ScopedErrorBoundary moduleName="Importador Universal" onReset={() => setIsBulkImportOpen(false)}>
          <Suspense fallback={<LazyFallback />}>
            <UniversalImportModal
              isOpen={isBulkImportOpen}
              onClose={() => setIsBulkImportOpen(false)}
              targetHeaders={headers}
              activeSheetTitle={activeSheet?.title || 'Hoja Activa'}
              existingItems={items}
              customAliases={sheetConfig.customAliases}
              onImportConfirmed={handleUniversalImportConfirmed}
            />
          </Suspense>
        </ScopedErrorBoundary>
      )}

      {/* BULK ACTIONS CONFIGURATION MODAL */}
      {isBulkActionsConfigOpen && (
        <Suspense fallback={<LazyFallback />}>
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
        </Suspense>
      )}

      {/* SLICE MANAGER MODAL */}
      {isSliceManagerOpen && (
        <Suspense fallback={<LazyFallback />}>
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
        </Suspense>
      )}

      {/* SLICE EDITOR MODAL */}
      {isSliceModalOpen && (
        <Suspense fallback={<LazyFallback />}>
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
            currentGroupBy={groupByColumn ?? undefined}
            currentGroupByDirection={groupByDirection}
            currentVisibleHeaders={visibleHeaders ?? undefined}
            editingSlice={editingSliceModalItem}
            onSaveSlice={handleSaveSlice}
            onDeleteSlice={handleDeleteSlice}
          />
        </Suspense>
      )}

      {/* STOCK COUNT TERMINAL OVERLAY */}
      {isStockCountOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full h-full max-w-7xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col">
            <ScopedErrorBoundary moduleName="Terminal de Conteo e Inventario" onReset={() => setIsStockCountOpen(false)}>
              <Suspense fallback={<LazyFallback />}>
                <StockCountTerminal
                  sheetItems={items}
                  headers={headers}
                  masterProducts={products}
                  activeSheetTitle={activeSheet?.title || 'VENCIMIENTOS'}
                  onSyncRowsToVencimientos={handleSyncRowsToVencimientos}
                  showToast={showToast}
                  onClose={() => setIsStockCountOpen(false)}
                />
              </Suspense>
            </ScopedErrorBoundary>
          </div>
        </div>
      )}

      {/* SYNC & AUDIT MODAL */}
      {isSyncAuditOpen && (
        <Suspense fallback={<LazyFallback />}>
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
            scriptSupportsAtomicSave={scriptSupportsAtomicSave}
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
        </Suspense>
      )}
      {/* CROSS-TABLE RELATIONAL DRILLDOWN MENU */}
      {modalsState.isRelationalMenuOpen && modalsState.relationalEntity && (
        <Suspense fallback={<LazyFallback />}>
          <CrossTableRelationalMenu
            isOpen={modalsState.isRelationalMenuOpen}
            onClose={() => modalsActions.closeRelationalMenu?.()}
            entityType={modalsState.relationalEntity.type}
            entityValue={modalsState.relationalEntity.value}
          />
        </Suspense>
      )}
    </>
  );
};
