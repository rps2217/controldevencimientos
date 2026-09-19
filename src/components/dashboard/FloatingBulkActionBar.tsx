import React from 'react';
import { 
  Printer, Settings, Barcode, Mail, MessageSquare, Download, Flame, Edit2, Trash2, Sliders, X 
} from 'lucide-react';
import { InventoryItem, SheetConfig } from '../../types';
import { isActionEnabledForTable, BulkActionContext, buildBulkActionContext } from '../../utils/bulkActionsRegistry';
import { VIRTUAL_COLUMNS } from '../../utils/virtualColumns';
import { parseAnyDate } from '../../utils/pureCalculations';
import { exportToExcel } from '../../utils/exportUtils';
import { useDashboard } from '../../context/DashboardContext';

export interface FloatingBulkActionBarProps {
  selectedRowIds?: number[];
  filteredItems?: InventoryItem[];
  activeView?: string;
  bulkActionCtx?: BulkActionContext;
  sheetConfig?: SheetConfig;
  headers?: string[];
  visibleHeaders?: string[];
  columnLabelsMap?: Record<string, string>;
  products?: any[];
  policies?: any[];
  handlePrintTicket?: (items: InventoryItem[], mode: 'standard' | 'barcode') => void;
  setIsTicketConfigOpen?: (open: boolean) => void;
  setIsGmailModalOpen?: (open: boolean) => void;
  setWhatsAppModalItems?: (items: any[]) => void;
  setIsWhatsAppModalOpen?: (open: boolean) => void;
  setIsPmReportOpen?: (open: boolean) => void;
  setIsBulkEditOpen?: (open: boolean) => void;
  handleBulkDelete?: () => void;
  setIsBulkActionsConfigOpen?: (open: boolean) => void;
  setSelectedRowIds?: ((ids: number[]) => void) | React.Dispatch<React.SetStateAction<number[]>>;
}

export const FloatingBulkActionBar: React.FC<FloatingBulkActionBarProps> = (props) => {
  const dashboard = useDashboard();

  const selectedRowIds = props.selectedRowIds ?? dashboard.selectedRowIds ?? [];
  const filteredItems = props.filteredItems ?? dashboard.filteredItems ?? [];
  const activeView = props.activeView ?? dashboard.activeView;
  const sheetConfig = props.sheetConfig ?? dashboard.sheetConfig;
  const headers = props.headers ?? dashboard.headers ?? [];
  const visibleHeaders = props.visibleHeaders ?? dashboard.visibleHeaders ?? [];
  const columnLabelsMap = props.columnLabelsMap ?? dashboard.columnLabelsMap ?? {};
  const products = props.products ?? dashboard.products ?? [];
  const policies = props.policies ?? dashboard.policies ?? [];
  const handlePrintTicket = props.handlePrintTicket ?? dashboard.handlePrintTicket;
  const setIsTicketConfigOpen = props.setIsTicketConfigOpen ?? dashboard.setIsTicketConfigOpen;
  const setIsGmailModalOpen = props.setIsGmailModalOpen ?? dashboard.setIsGmailModalOpen;
  const setWhatsAppModalItems = props.setWhatsAppModalItems ?? dashboard.setWhatsAppModalItems;
  const setIsWhatsAppModalOpen = props.setIsWhatsAppModalOpen ?? dashboard.setIsWhatsAppModalOpen;
  const setIsPmReportOpen = props.setIsPmReportOpen ?? dashboard.setIsPmReportOpen;
  const setIsBulkEditOpen = props.setIsBulkEditOpen ?? dashboard.setIsBulkEditOpen;
  const handleBulkDelete = props.handleBulkDelete ?? dashboard.handleBulkDelete;
  const setIsBulkActionsConfigOpen = props.setIsBulkActionsConfigOpen ?? dashboard.setIsBulkActionsConfigOpen;
  const setSelectedRowIds = props.setSelectedRowIds ?? dashboard.setSelectedRowIds;
  const bulkActionCtx = props.bulkActionCtx ?? dashboard.bulkActionCtx ?? buildBulkActionContext(headers, activeView, activeView);
  if (selectedRowIds.length === 0 || activeView === 'schema' || activeView === 'analytics') {
    return null;
  }

  const selectedItems = filteredItems.filter(i => selectedRowIds.includes(i._rowIndex as number));

  const handleExportSelectedExcel = () => {
    // Prepare all virtual columns (system + user)
    const activeVirtual = [
      ...VIRTUAL_COLUMNS.filter(vc => sheetConfig.activeVirtualColumns?.includes(vc.id)),
      ...(sheetConfig.userVirtualColumns || []).map(uvc => ({
        id: uvc.id,
        label: uvc.label,
        calculate: (item: any) => {
          const values = uvc.sourceColumns.map(sc => item[sc] || '');
          if (uvc.operation === 'concatenate') return values.join(' ');
          if (uvc.operation === 'sum') return values.reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
          if (uvc.operation === 'diff_days') {
            const d1 = parseAnyDate(values[0]);
            const d2 = parseAnyDate(values[1]);
            if (d1 && d2) return Math.round(Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
            return '-';
          }
          return '-';
        }
      }))
    ];

    const allData = { products, policies, events: [] };
    const exportHeaders = (visibleHeaders && visibleHeaders.length > 0) ? visibleHeaders : headers;
    exportToExcel(`Seleccion_${new Date().toISOString().split('T')[0]}`, exportHeaders, selectedItems, 'Selección', activeVirtual, allData, columnLabelsMap);
  };

  return (
    <div className="hidden md:flex absolute bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-4 py-3 rounded-2xl shadow-2xl items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-300 border border-slate-700">
      <div className="flex items-center gap-2 border-r border-slate-600 pr-4">
        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-inner">{selectedRowIds.length}</span>
        <span className="text-sm font-medium whitespace-nowrap">seleccionados</span>
      </div>
      
      <div className="flex items-center gap-2">
        {isActionEnabledForTable('ticket', bulkActionCtx, sheetConfig) && (
          <div className="flex items-center bg-slate-700/80 rounded-xl p-0.5">
            <button 
              onClick={() => handlePrintTicket(selectedItems, 'standard')}
              className="text-xs hover:bg-slate-600 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 text-white cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-400" /> Imprimir Ticket
            </button>
            <button
              onClick={() => setIsTicketConfigOpen(true)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600 rounded-lg transition-colors cursor-pointer"
              title="Configurar columnas y formato del ticket"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isActionEnabledForTable('barcode_ticket', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={() => handlePrintTicket(selectedItems, 'barcode')}
            className="text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 shadow-sm cursor-pointer"
            title="Imprimir etiquetas térmicas con código de barras 1D (Code128) del SKU"
          >
            <Barcode className="w-3.5 h-3.5 text-indigo-300" /> Código Barras ({selectedRowIds.length})
          </button>
        )}
        
        {isActionEnabledForTable('gmail', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={() => setIsGmailModalOpen(true)}
            className="text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 bg-red-600/40 text-red-200 border border-red-500/40 shadow-sm cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-red-400" /> Borrador Gmail
          </button>
        )}

        {isActionEnabledForTable('whatsapp', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={() => {
              setWhatsAppModalItems(selectedItems);
              setIsWhatsAppModalOpen(true);
            }}
            className="text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 bg-emerald-600/40 text-emerald-200 border border-emerald-500/40 shadow-sm cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp ({selectedRowIds.length})
          </button>
        )}
        
        {isActionEnabledForTable('excel', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={handleExportSelectedExcel}
            className="text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" /> Exportar a Excel
          </button>
        )}
        
        {isActionEnabledForTable('pm_report', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={() => setIsPmReportOpen(true)}
            className="text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5 text-orange-400" /> Acción PM
          </button>
        )}

        {isActionEnabledForTable('bulk_edit', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={() => setIsBulkEditOpen(true)}
            className="text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 bg-blue-600/40 text-blue-200 border border-blue-500/40 cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5 text-blue-400" /> Edición Masiva FRC
          </button>
        )}
        
        {isActionEnabledForTable('delete', bulkActionCtx, sheetConfig) && (
          <button 
            onClick={handleBulkDelete}
            className="text-xs hover:bg-slate-700 px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1.5 bg-rose-600/40 text-rose-200 border border-rose-500/40 hover:bg-rose-600/60 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Eliminar ({selectedRowIds.length})
          </button>
        )}

        <div className="h-4 w-px bg-slate-600 my-auto mx-0.5"></div>

        <button 
          onClick={() => setIsBulkActionsConfigOpen(true)}
          className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-700 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
          title="Configurar acciones visibles para esta tabla"
        >
          <Sliders className="w-4 h-4" />
        </button>
        
        <button 
          onClick={() => setSelectedRowIds([])}
          className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-700 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
          title="Deseleccionar todo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
