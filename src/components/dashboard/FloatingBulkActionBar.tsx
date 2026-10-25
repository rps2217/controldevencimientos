import React, { useState, useRef, useEffect } from 'react';
import { 
  Printer, Settings, Barcode, Mail, MessageSquare, Download, Flame, Edit2, Trash2, 
  Sliders, X, Copy, RefreshCw, Bluetooth, ChevronDown, ChevronUp, MoreHorizontal 
} from 'lucide-react';
import { isActionEnabledForTable, buildBulkActionContext } from '../../utils/bulkActionsRegistry';
import { exportToExcel } from '../../utils/exportUtils';
import { useDashboard } from '../../context/DashboardContext';
import { useModalsActions } from '../../context/ModalsContext';
import { InventoryItem } from '../../types';

export const FloatingBulkActionBar: React.FC = () => {
  const dashboard = useDashboard();
  const modalsActions = useModalsActions();

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const selectedRowIds = dashboard.selectedRowIds ?? [];
  const filteredItems = dashboard.filteredItems ?? [];
  const activeView = dashboard.activeView;
  const sheetConfig = dashboard.sheetConfig;
  const headers = dashboard.headers ?? [];
  const visibleHeaders = dashboard.visibleHeaders ?? [];
  const columnLabelsMap = dashboard.columnLabelsMap ?? {};
  const products = dashboard.products ?? [];
  const policies = dashboard.policies ?? [];
  const handlePrintTicket = dashboard.handlePrintTicket;
  const setIsTicketConfigOpen = modalsActions.setIsTicketConfigOpen;
  const openBluetoothPrinter = modalsActions.openBluetoothPrinter;
  const setIsGmailModalOpen = modalsActions.setIsGmailModalOpen;
  const setGmailModalItems = modalsActions.setGmailModalItems;
  const setWhatsAppModalItems = modalsActions.setWhatsAppModalItems;
  const setIsWhatsAppModalOpen = modalsActions.setIsWhatsAppModalOpen;
  const setIsPmReportOpen = modalsActions.setIsPmReportOpen;
  const setIsBulkEditOpen = modalsActions.setIsBulkEditOpen;
  const handleBulkDelete = dashboard.handleBulkDelete;
  const handleReconcileWithCatalog = dashboard.handleReconcileWithCatalog;
  const handleOpenCopyModal = dashboard.handleOpenCopyModal;
  const setIsBulkActionsConfigOpen = modalsActions.setIsBulkActionsConfigOpen;
  const setSelectedRowIds = dashboard.setSelectedRowIds ?? (() => {});
  const bulkActionCtx = dashboard.bulkActionCtx ?? buildBulkActionContext(headers, activeView, activeView);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
        setIsPrintMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  if (selectedRowIds.length === 0 || activeView === 'schema' || activeView === 'analytics') {
    return null;
  }

  const selectedSet = new Set(selectedRowIds.map(Number));
  const selectedItems = filteredItems.filter((i: InventoryItem) => selectedSet.has(Number(i._rowIndex)));

  const handleExportSelectedExcel = () => {
    const allData = { products, policies, events: [] };
    const exportHeaders = (visibleHeaders && visibleHeaders.length > 0) ? visibleHeaders : headers;
    exportToExcel(`Seleccion_${new Date().toISOString().split('T')[0]}`, exportHeaders, selectedItems, 'Selección', undefined, allData, columnLabelsMap);
  };

  const hasAnyPrint = isActionEnabledForTable('ticket', bulkActionCtx, sheetConfig) || 
                      isActionEnabledForTable('barcode_ticket', bulkActionCtx, sheetConfig);

  const hasSecondaryActions = isActionEnabledForTable('gmail', bulkActionCtx, sheetConfig) ||
                              isActionEnabledForTable('whatsapp', bulkActionCtx, sheetConfig) ||
                              isActionEnabledForTable('pm_report', bulkActionCtx, sheetConfig) ||
                              isActionEnabledForTable('reconcile_catalog', bulkActionCtx, sheetConfig) ||
                              (selectedRowIds.length === 1 && handleOpenCopyModal && isActionEnabledForTable('copy_edit', bulkActionCtx, sheetConfig));

  return (
    <div 
      ref={barRef}
      className="fixed bottom-4 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md text-white px-3 py-2 rounded-2xl shadow-2xl flex items-center gap-2 border border-slate-700/80 max-w-full overflow-visible animate-in slide-in-from-bottom-6 fade-in duration-200 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
    >
      {/* 1. SELECTION COUNT BADGE */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700/60 text-xs shrink-0 font-medium">
        <span className="font-mono text-blue-400 font-bold text-xs">{selectedRowIds.length}</span>
        <span className="text-slate-300 hidden sm:inline">seleccionados</span>
      </div>

      <div className="h-4 w-px bg-slate-700 mx-0.5 shrink-0" />

      {/* 2. PRIMARY ACTIONS */}
      <div className="flex items-center gap-1.5 shrink-0">
        
        {/* Exportar a Excel */}
        {isActionEnabledForTable('excel', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={handleExportSelectedExcel}
            className="text-xs hover:bg-slate-800 px-2.5 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-slate-200 hover:text-white cursor-pointer shrink-0"
            title="Exportar filas seleccionadas a hoja Excel"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        )}

        {/* Imprimir Menu Dropdown */}
        {hasAnyPrint && (
          <div className="relative">
            <button
              onClick={() => {
                setIsPrintMenuOpen(prev => !prev);
                setIsMoreMenuOpen(false);
              }}
              className="text-xs hover:bg-slate-800 px-2.5 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-slate-200 hover:text-white cursor-pointer shrink-0"
              title="Opciones de impresión de etiquetas y tickets"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Imprimir</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isPrintMenuOpen && (
              <div className="absolute bottom-full mb-2 left-0 w-56 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150">
                {isActionEnabledForTable('ticket', bulkActionCtx, sheetConfig) && (
                  <button
                    onClick={() => {
                      setIsPrintMenuOpen(false);
                      handlePrintTicket(selectedItems, 'standard');
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Ticket Térmico Estándar</span>
                  </button>
                )}

                {isActionEnabledForTable('barcode_ticket', bulkActionCtx, sheetConfig) && (
                  <button
                    onClick={() => {
                      setIsPrintMenuOpen(false);
                      handlePrintTicket(selectedItems, 'barcode');
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <Barcode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Código Barras (1D)</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsPrintMenuOpen(false);
                    openBluetoothPrinter(selectedItems);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                >
                  <Bluetooth className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Marklife P15 (Bluetooth)</span>
                </button>

                <div className="h-px bg-slate-800 my-1" />

                <button
                  onClick={() => {
                    setIsPrintMenuOpen(false);
                    setIsTicketConfigOpen(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                >
                  <Settings className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-[11px]">Formato de Ticket...</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Editar Lote */}
        {isActionEnabledForTable('bulk_edit', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={() => setIsBulkEditOpen(true)}
            className="text-xs hover:bg-slate-800 px-2.5 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-slate-200 hover:text-white cursor-pointer shrink-0"
            title="Editar valores comunes en lote"
          >
            <Edit2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Editar Lote</span>
          </button>
        )}

        {/* Eliminar */}
        {isActionEnabledForTable('delete', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={handleBulkDelete}
            className="text-xs hover:bg-rose-950/60 hover:text-rose-200 px-2.5 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-rose-300 border border-rose-900/40 cursor-pointer shrink-0"
            title={`Eliminar ${selectedRowIds.length} fila(s)`}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Eliminar</span>
          </button>
        )}

        {/* 3. MÁS ACCIONES ▾ (DROPDOWN) */}
        {hasSecondaryActions && (
          <div className="relative">
            <button
              onClick={() => {
                setIsMoreMenuOpen(prev => !prev);
                setIsPrintMenuOpen(false);
              }}
              className="text-xs hover:bg-slate-800 px-2.5 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1 text-slate-200 hover:text-white cursor-pointer shrink-0 border border-slate-700/70"
              title="Más acciones disponibles"
            >
              <MoreHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Más</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isMoreMenuOpen && (
              <div className="absolute bottom-full mb-2 right-0 sm:left-0 sm:right-auto w-60 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150">
                
                {/* Copiar y Editar si 1 ítem */}
                {selectedRowIds.length === 1 && handleOpenCopyModal && isActionEnabledForTable('copy_edit', bulkActionCtx, sheetConfig) && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      handleOpenCopyModal(selectedItems[0]);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Copiar y Editar</span>
                  </button>
                )}

                {/* Acción PM / Reporte de Drenaje */}
                {isActionEnabledForTable('pm_report', bulkActionCtx, sheetConfig) && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setIsPmReportOpen(true);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    <span>Reporte Acción PM</span>
                  </button>
                )}

                {/* Reconciliar Catálogo */}
                {handleReconcileWithCatalog && isActionEnabledForTable('reconcile_catalog', bulkActionCtx, sheetConfig) && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      handleReconcileWithCatalog();
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Reconciliar Catálogo</span>
                  </button>
                )}

                {/* WhatsApp */}
                {isActionEnabledForTable('whatsapp', bulkActionCtx, sheetConfig) && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setWhatsAppModalItems(selectedItems);
                      setIsWhatsAppModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Enviar WhatsApp ({selectedRowIds.length})</span>
                  </button>
                )}

                {/* Gmail */}
                {isActionEnabledForTable('gmail', bulkActionCtx, sheetConfig) && (
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setGmailModalItems(selectedItems);
                      setIsGmailModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>Borrador Gmail ({selectedRowIds.length})</span>
                  </button>
                )}

                <div className="h-px bg-slate-800 my-1" />

                {/* Configurar Acciones */}
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    setIsBulkActionsConfigOpen(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors w-full text-left cursor-pointer"
                >
                  <Sliders className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-[11px]">Configurar Acciones de Tabla</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-slate-700 mx-0.5 shrink-0" />

      {/* 4. DESELECT ALL */}
      <button 
        onClick={() => setSelectedRowIds([])}
        className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
        title="Deseleccionar todo"
        aria-label="Deseleccionar todo"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

