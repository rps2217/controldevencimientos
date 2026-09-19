import React, { useState, useMemo } from 'react';
import { 
  X, 
  Sliders, 
  Eye, 
  EyeOff, 
  Layers, 
  Sparkles, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  Table, 
  Database, 
  FileSpreadsheet, 
  Settings2,
  CheckCircle2,
  Tag,
  ArrowUpAZ,
  ArrowDownZA,
  LayoutGrid,
  Pin,
  Settings,
  // New icons for actions & reports
  Mail,
  MessageSquare,
  Flame,
  Printer,
  Barcode,
  Download,
  Share2
} from 'lucide-react';
import { SheetConfig, TableSlice } from '../../types';
import { BUILT_IN_SLICES } from '../../utils/sliceRegistry';
import { VIRTUAL_COLUMNS } from '../../utils/virtualColumns';
import { parseAnyDate } from '../../utils/dateCalculations';
import { exportToExcel } from '../../utils/exportUtils';
import { buildBulkActionContext, isActionEnabledForTable } from '../../utils/bulkActionsRegistry';
import { useDashboard } from '../../context/DashboardContext';

export interface ViewConfigControlDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
  // Column visibility
  allHeaders?: string[];
  hiddenColumns?: string[];
  onToggleColumnVisibility?: (header: string) => void;
  onResetColumns?: () => void;
  onShowAllColumns?: () => void;
  // Slices
  activeTableKey?: string;
  activeSliceId?: string | null;
  onSelectSlice?: (sliceId: string | null) => void;
  customSlices?: TableSlice[];
  onOpenSliceEditor?: (sliceToEdit?: TableSlice) => void;
  // Table presentation & Zen mode
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  tableDensity?: 'comfortable' | 'compact' | 'ultra';
  onChangeTableDensity?: (density: 'comfortable' | 'compact' | 'ultra') => void;
  // External configs
  sheetConfig?: SheetConfig;
  onOpenGlobalConfig?: () => void;
  onOpenBulkActionsConfig?: () => void;
  onOpenSchemaEditor?: () => void;
  onOpenBackendMirror?: () => void;
  // Stats
  totalItemsCount?: number;
  filteredItemsCount?: number;
  // Grouping (shifted from page header)
  groupByColumn?: string;
  setGroupByColumn?: (col: string) => void;
  groupByDirection?: 'asc' | 'desc';
  onToggleGroupByDirection?: () => void;
  // Summary view (shifted from page header)
  isSummaryView?: boolean;
  onToggleSummaryView?: () => void;
  // KPIs (shifted from page header)
  areFiltersVisible?: boolean;
  onToggleFiltersVisible?: () => void;
  // Sticky Columns (shifted from page header)
  isStickyEnabled?: boolean;
  onToggleStickyColumns?: () => void;
  // Column Widths (shifted from page header)
  hasCustomColWidths?: boolean;
  handleResetColWidths?: () => void;
  // Ticket configuration (shifted from page header dropdown)
  onOpenTicketConfig?: () => void;
  // Actions & Export Props
  activeSheetTitle?: string;
  filteredItems?: any[];
  products?: any[];
  policies?: any[];
  drainageReportItems?: any[];
  visibleHeaders?: string[];
  handlePrintTicket?: (items: any[], mode?: 'standard' | 'barcode') => void;
  setIsGmailModalOpen?: (open: boolean) => void;
  setIsWhatsAppModalOpen?: (open: boolean) => void;
  setIsPmReportOpen?: (open: boolean) => void;
}

export const ViewConfigControlDrawer: React.FC<ViewConfigControlDrawerProps> = (props) => {
  const dashboard = useDashboard();

  const isOpen = props.isOpen ?? dashboard.isRightDrawerOpen ?? false;
  const onClose = props.onClose ?? (() => dashboard.setIsRightDrawerOpen?.(false));
  const allHeaders = props.allHeaders ?? dashboard.headers ?? [];
  const hiddenColumns = props.hiddenColumns ?? (dashboard.hiddenColumns?.[dashboard.activeView] || []);
  const onToggleColumnVisibility = props.onToggleColumnVisibility ?? ((h: string) => dashboard.toggleVisibility?.(h));
  const onResetColumns = props.onResetColumns ?? (() => dashboard.resetColumnOrder?.());
  const onShowAllColumns = props.onShowAllColumns ?? (() => dashboard.showAllColumns?.());
  const activeTableKey = props.activeTableKey ?? dashboard.activeView;
  const activeSliceId = props.activeSliceId ?? dashboard.activeSliceId;
  const onSelectSlice = props.onSelectSlice ?? ((sliceId: string | null) => {
    if (!sliceId) {
      dashboard.handleSelectSlice?.(null);
    } else {
      const found = dashboard.currentTableSlices?.find(s => s.id === sliceId);
      dashboard.handleSelectSlice?.(found || null);
    }
  });
  const customSlices = props.customSlices ?? dashboard.customSlices ?? [];
  const onOpenSliceEditor = props.onOpenSliceEditor ?? ((slice?: TableSlice) => {
    dashboard.setEditingSliceModalItem?.(slice || null);
    dashboard.setIsSliceModalOpen?.(true);
  });
  const isZenMode = props.isZenMode ?? dashboard.isZenMode ?? false;
  const onToggleZenMode = props.onToggleZenMode ?? (() => {
    const next = !dashboard.isZenMode;
    dashboard.setIsZenMode?.(next);
    dashboard.showToast?.(next ? 'Modo Zen activado (Presiona Esc para salir)' : 'Modo Zen desactivado', 'info', 'Enfoque');
  });
  const tableDensity = props.tableDensity ?? dashboard.tableDensity ?? 'comfortable';
  const onChangeTableDensity = props.onChangeTableDensity ?? ((d) => dashboard.setTableDensity?.(d));
  const sheetConfig = props.sheetConfig ?? dashboard.sheetConfig;
  const onOpenGlobalConfig = props.onOpenGlobalConfig ?? (() => dashboard.setIsConfigOpen?.(true));
  const onOpenBulkActionsConfig = props.onOpenBulkActionsConfig ?? (() => dashboard.setIsBulkActionsConfigOpen?.(true));
  const onOpenSchemaEditor = props.onOpenSchemaEditor ?? (() => dashboard.setActiveView?.('schema'));
  const onOpenBackendMirror = props.onOpenBackendMirror;
  const totalItemsCount = props.totalItemsCount ?? dashboard.items?.length ?? 0;
  const filteredItemsCount = props.filteredItemsCount ?? dashboard.filteredItems?.length ?? 0;
  const groupByColumn = props.groupByColumn ?? dashboard.groupByColumn ?? '';
  const setGroupByColumn = props.setGroupByColumn ?? (() => {});
  const groupByDirection = props.groupByDirection ?? dashboard.groupByDirection ?? 'asc';
  const onToggleGroupByDirection = props.onToggleGroupByDirection;
  const isSummaryView = props.isSummaryView ?? dashboard.isSummaryView ?? false;
  const onToggleSummaryView = props.onToggleSummaryView ?? (() => dashboard.handleToggleSummaryView?.());
  const areFiltersVisible = props.areFiltersVisible ?? dashboard.areFiltersVisible ?? true;
  const onToggleFiltersVisible = props.onToggleFiltersVisible ?? (() => dashboard.setAreFiltersVisible?.(prev => !prev));
  const isStickyEnabled = props.isStickyEnabled ?? (dashboard.sheetConfig?.enableStickyColumns === true);
  const onToggleStickyColumns = props.onToggleStickyColumns ?? (() => dashboard.handleToggleStickyColumns?.());
  const hasCustomColWidths = props.hasCustomColWidths ?? dashboard.hasCustomColWidths ?? false;
  const handleResetColWidths = props.handleResetColWidths ?? (() => dashboard.handleResetColWidths?.());
  const onOpenTicketConfig = props.onOpenTicketConfig ?? (() => dashboard.setIsTicketConfigOpen?.(true));
  const activeSheetTitle = props.activeSheetTitle ?? dashboard.activeSheet?.title;
  const filteredItems = props.filteredItems ?? dashboard.filteredItems ?? [];
  const products = props.products ?? dashboard.products ?? [];
  const policies = props.policies ?? dashboard.policies ?? [];
  const drainageReportItems = props.drainageReportItems ?? dashboard.drainageReportItems ?? [];
  const visibleHeaders = props.visibleHeaders ?? dashboard.visibleHeaders ?? [];
  const handlePrintTicket = props.handlePrintTicket ?? dashboard.handlePrintTicket;
  const setIsGmailModalOpen = props.setIsGmailModalOpen ?? dashboard.setIsGmailModalOpen;
  const setIsWhatsAppModalOpen = props.setIsWhatsAppModalOpen ?? dashboard.setIsWhatsAppModalOpen;
  const setIsPmReportOpen = props.setIsPmReportOpen ?? dashboard.setIsPmReportOpen;
  const [activeTab, setActiveTab] = useState<'view' | 'columns' | 'slices' | 'actions' | 'system'>('view');
  const [columnSearch, setColumnSearch] = useState('');

  const bulkActionCtx = useMemo(() => {
    return buildBulkActionContext(allHeaders, activeTableKey, activeSheetTitle);
  }, [allHeaders, activeTableKey, activeSheetTitle]);

  const isWhatsAppActive = isActionEnabledForTable('whatsapp', bulkActionCtx, sheetConfig);
  const isGmailActive = isActionEnabledForTable('gmail', bulkActionCtx, sheetConfig);
  const isPmReportActive = isActionEnabledForTable('pm_report', bulkActionCtx, sheetConfig);
  const isTicketActive = isActionEnabledForTable('ticket', bulkActionCtx, sheetConfig);
  const isBarcodeTicketActive = isActionEnabledForTable('barcode_ticket', bulkActionCtx, sheetConfig);
  const isExcelActive = isActionEnabledForTable('excel', bulkActionCtx, sheetConfig);

  if (!isOpen) return null;

  // Filter columns by search term
  const filteredHeaders = allHeaders.filter(h => 
    h.toLowerCase().includes(columnSearch.toLowerCase().trim())
  );

  const visibleColumnsCount = allHeaders.length - hiddenColumns.length;

  // Available slices for this table
  const tableBuiltInSlices = BUILT_IN_SLICES[activeTableKey] || [];
  const tableCustomSlices = (customSlices || []).filter(s => s.tableKey === activeTableKey);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop con desenfoque suave */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
        <div className="w-screen max-w-md pointer-events-auto bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col transform transition-transform duration-300 ease-in-out">
          
          {/* Header del Panel Lateral */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                <Sliders className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Ajustes
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleZenMode}
                title={isZenMode ? "Salir de Modo Zen" : "Activar Modo Zen (Pantalla completa)"}
                className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isZenMode 
                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700' 
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                {isZenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="text-[10px] font-bold">{isZenMode ? 'Zen Activo' : 'Pantalla Zen'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-2 border-indigo-500 dark:border-indigo-400/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:scale-105 active:scale-95 shadow-sm shadow-indigo-100 dark:shadow-none transition-all duration-200 cursor-pointer flex items-center justify-center"
                title="Cerrar panel lateral"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Sub-Tabs de navegación interna */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 pt-2 gap-1 overflow-x-auto text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('view')}
              className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'view'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              Aspecto & Zen
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('columns')}
              className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'columns'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Columnas ({visibleColumnsCount}/{allHeaders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('slices')}
              className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'slices'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Slices & Filtros
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('actions')}
              className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'actions'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Acciones & Exportar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`pb-2 px-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'system'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Ajustes
            </button>
          </div>

          {/* Cuerpo del Drawer con Scroll */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-slate-700 dark:text-slate-200">

            {/* TAB 1: ASPECTO Y MODO ZEN */}
            {activeTab === 'view' && (
              <div className="space-y-4 animate-fade-in">
                
                {/* Banner de Modo Zen */}
                <div className={`p-3.5 rounded-xl border transition-all ${
                  isZenMode
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        Modo Zen de Lectura Rápida
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Oculta barras laterales y maximiza la tabla de vencimientos para auditar con total concentración y espacio horizontal.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleZenMode}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs ${
                        isZenMode
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {isZenMode ? 'Desactivar' : 'Activar Zen'}
                    </button>
                  </div>
                </div>

                {/* Selector de Densidad de Tabla */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Table className="w-3.5 h-3.5" />
                    Densidad de Filas
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'comfortable', label: 'Cómoda', desc: 'Espaciosa' },
                      { id: 'compact', label: 'Compacta', desc: 'Estándar' },
                      { id: 'ultra', label: 'Ultra', desc: 'Máx. Datos' },
                    ].map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => onChangeTableDensity(d.id as any)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          tableDensity === d.id
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold shadow-xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                        }`}
                      >
                        <div className="text-xs">{d.label}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">{d.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Agrupación Dinámica (Shifted from main view) */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-blue-500" />
                      Agrupación de Filas
                    </span>
                    {groupByColumn !== 'none' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold">
                        Activo
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={groupByColumn}
                        onChange={(e) => setGroupByColumn(e.target.value)}
                        className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 shadow-2xs focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer appearance-none"
                      >
                        <option value="none">Sin agrupar (Lista plana)</option>
                        {allHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-3.5 pointer-events-none border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-500" />
                    </div>
                    {groupByColumn !== 'none' && onToggleGroupByDirection && (
                      <button
                        type="button"
                        onClick={onToggleGroupByDirection}
                        className="p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 transition-all flex items-center justify-center shrink-0"
                        title={`Orden de grupo: ${groupByDirection === 'desc' ? 'Z a A' : 'A a Z'}`}
                      >
                        {groupByDirection === 'desc' ? (
                          <ArrowDownZA className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ArrowUpAZ className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Opciones de Presentación (Shifted from header dropdowns) */}
                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Presentación y Pantalla
                  </label>

                  <div className="space-y-2 bg-white dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    {/* Vista Resumida */}
                    {onToggleSummaryView && (
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">Vista Resumida</span>
                        <button
                          type="button"
                          onClick={onToggleSummaryView}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isSummaryView ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              isSummaryView ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Tarjetas KPI */}
                    {onToggleFiltersVisible && (
                      <div className="flex items-center justify-between gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/50">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">Mostrar Tarjetas KPI</span>
                        <button
                          type="button"
                          onClick={onToggleFiltersVisible}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            areFiltersVisible ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              areFiltersVisible ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Fijar Columnas (Sticky) */}
                    {onToggleStickyColumns && (
                      <div className="flex items-center justify-between gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/50">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                          <Pin className="w-3 h-3 text-slate-400 shrink-0" />
                          Fijar Primera Columna (Sticky)
                        </span>
                        <button
                          type="button"
                          onClick={onToggleStickyColumns}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isStickyEnabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              isStickyEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Restablecer Columnas y Anchos */}
                  <div className="flex gap-2">
                    {hasCustomColWidths && handleResetColWidths && (
                      <button
                        type="button"
                        onClick={handleResetColWidths}
                        className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        Ajustar Columnas
                      </button>
                    )}
                  </div>
                </div>

                {/* Métricas rápidas de la vista activa */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                    <span>Estado del Tablero</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono font-bold">
                      {filteredItemsCount} / {totalItemsCount} Filas
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Columnas Visibles:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{visibleColumnsCount} de {allHeaders.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Slice Activo:</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {activeSliceId ? 'Filtro Especial' : 'Todas las Filas'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acceso a Configuración de Acciones Masivas */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBulkActionsConfig();
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                      Configurar Botones y Acciones Masivas
                    </span>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">Personalizar →</span>
                  </button>
                </div>

              </div>
            )}

            {/* TAB 2: GESTOR DE VISIBILIDAD DE COLUMNAS */}
            {activeTab === 'columns' && (
              <div className="space-y-3 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Alternar Columnas
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onShowAllColumns}
                      className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                    >
                      Mostrar Todas
                    </button>
                    <button
                      type="button"
                      onClick={onResetColumns}
                      className="px-2 py-1 rounded-md text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
                      title="Restablecer visibilidad predeterminada"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restablecer
                    </button>
                  </div>
                </div>

                {/* Input de búsqueda de columnas */}
                <input
                  type="text"
                  placeholder="Buscar columna..."
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />

                {/* Lista de Columnas con Checkbox / Toggles */}
                <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-800/40">
                  {filteredHeaders.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No se encontraron columnas con ese nombre.
                    </div>
                  ) : (
                    filteredHeaders.map(header => {
                      const isHidden = hiddenColumns.includes(header);
                      return (
                        <div
                          key={header}
                          onClick={() => onToggleColumnVisibility(header)}
                          className="px-3 py-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer transition-colors"
                        >
                          <span className={`text-xs font-medium truncate pr-2 ${
                            isHidden ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'
                          }`}>
                            {header}
                          </span>
                          <button
                            type="button"
                            className={`p-1 rounded-md transition-colors ${
                              isHidden 
                                ? 'text-slate-300 dark:text-slate-600 hover:text-slate-500' 
                                : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60'
                            }`}
                          >
                            {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                  Tip: Ocultar columnas secundarias mejora la velocidad de desplazamiento en pantallas pequeñas.
                </p>
              </div>
            )}

            {/* TAB 3: SLICES Y VISTAS FILTRADAS */}
            {activeTab === 'slices' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Slices Preconfigurados & Personalizados
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSliceEditor();
                    }}
                    className="px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 flex items-center gap-1"
                  >
                    + Nuevo Slice
                  </button>
                </div>

                <div className="space-y-2">
                  {/* Vista Predeterminada */}
                  <button
                    type="button"
                    onClick={() => onSelectSlice(null)}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      activeSliceId === null
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Table className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-xs font-semibold">Todas las Filas</div>
                        <div className="text-[10px] text-slate-400">Sin segmentación de slice</div>
                      </div>
                    </div>
                    {activeSliceId === null && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                  </button>

                  {/* Slices Nativos */}
                  {tableBuiltInSlices.map(slice => (
                    <button
                      key={slice.id}
                      type="button"
                      onClick={() => onSelectSlice(slice.id)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        activeSliceId === slice.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            slice.color === 'emerald' ? 'bg-emerald-500' :
                            slice.color === 'amber' ? 'bg-amber-500' :
                            slice.color === 'rose' ? 'bg-rose-500' : 'bg-indigo-500'
                          }`} />
                          {slice.name}
                        </div>
                        <div className="text-[10px] text-slate-400">{slice.description}</div>
                      </div>
                      {activeSliceId === slice.id && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                    </button>
                  ))}

                  {/* Slices Custom del Usuario */}
                  {tableCustomSlices.map(slice => (
                    <button
                      key={slice.id}
                      type="button"
                      onClick={() => onSelectSlice(slice.id)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        activeSliceId === slice.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-500" />
                          {slice.name}
                          <span className="text-[9px] px-1 py-0.2 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded font-normal">Personalizado</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{slice.description}</div>
                      </div>
                      {activeSliceId === slice.id && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: ACCIONES Y EXPORTAR */}
            {activeTab === 'actions' && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Comunicación & Reportes
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Genera borradores, envía alertas y recopila informes gerenciales.
                  </p>
                </div>

                <div className="space-y-2">
                  {/* Borrador Gmail */}
                  {isGmailActive && setIsGmailModalOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setIsGmailModalOpen(true);
                      }}
                      className="w-full text-left p-3 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-3 transition-all rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs cursor-pointer group hover:border-red-200 dark:hover:border-red-900"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">Borrador Gmail</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">Generar correo formateado en HTML</div>
                      </div>
                      <span className="text-[10px] text-slate-400">Abrir →</span>
                    </button>
                  )}

                  {/* WhatsApp Web */}
                  {isWhatsAppActive && setIsWhatsAppModalOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setIsWhatsAppModalOpen(true);
                      }}
                      className="w-full text-left p-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-3 transition-all rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs cursor-pointer group hover:border-emerald-200 dark:hover:border-emerald-900"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">WhatsApp Web</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">Enviar mensaje predefinido con stock/alertas</div>
                      </div>
                      <span className="text-[10px] text-slate-400">Enviar →</span>
                    </button>
                  )}

                  {/* Reporte PM */}
                  {isPmReportActive && setIsPmReportOpen && drainageReportItems && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setIsPmReportOpen(true);
                      }}
                      className="w-full text-left p-3 hover:bg-orange-50 dark:hover:bg-orange-950/20 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-3 transition-all rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs cursor-pointer group hover:border-orange-200 dark:hover:border-orange-900"
                    >
                      <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/60 text-orange-600 dark:text-orange-300 flex items-center justify-center shrink-0">
                        <Flame className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">Reporte PM ({drainageReportItems.length})</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">Resumen de drenaje crítico para compras</div>
                      </div>
                      <span className="text-[10px] text-slate-400">Ver →</span>
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Archivos & Físico
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Exportaciones en formato tabular e impresiones térmicas.
                  </p>
                </div>

                <div className="space-y-2">
                  {/* Descargar Excel */}
                  {isExcelActive && filteredItems && (
                    <button
                      type="button"
                      onClick={() => {
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
                        const allData = { products: products || [], policies: policies || [], events: [] };
                        const exportHeaders = (visibleHeaders && visibleHeaders.length > 0) ? visibleHeaders : allHeaders;
                        
                        const columnLabelsMap: Record<string, string> = {};
                        VIRTUAL_COLUMNS.forEach(vc => { columnLabelsMap[vc.id] = vc.label; });
                        (sheetConfig.userVirtualColumns || []).forEach(uvc => { columnLabelsMap[uvc.id] = uvc.label; });
                        const schemaForSheet = activeSheetTitle ? sheetConfig.schema?.[activeSheetTitle] : undefined;
                        if (schemaForSheet) {
                          Object.keys(schemaForSheet).forEach(colId => {
                            if (schemaForSheet[colId]?.label) {
                              columnLabelsMap[colId] = schemaForSheet[colId].label;
                            }
                          });
                        }

                        exportToExcel(
                          `${activeTableKey}_${new Date().toISOString().split('T')[0]}`, 
                          exportHeaders, 
                          filteredItems, 
                          'Inventario', 
                          activeVirtual, 
                          allData, 
                          columnLabelsMap
                        );
                        onClose();
                      }}
                      className="w-full text-left p-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-3 transition-all rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs cursor-pointer group hover:border-emerald-200 dark:hover:border-emerald-900"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">Descargar Excel (.xlsx)</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{filteredItems.length} registros en la vista actual</div>
                      </div>
                      <span className="text-[10px] text-slate-400">Descargar →</span>
                    </button>
                  )}

                  {/* Imprimir Ticket Térmico */}
                  {isTicketActive && handlePrintTicket && filteredItems && (
                    <button
                      type="button"
                      onClick={() => {
                        handlePrintTicket(filteredItems, 'standard');
                        onClose();
                      }}
                      className="w-full text-left p-3 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-3 transition-all rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs cursor-pointer group hover:border-indigo-200 dark:hover:border-indigo-900"
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                        <Printer className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">Imprimir Ticket Térmico</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">Formato continuo para impresoras 80mm/58mm</div>
                      </div>
                      <span className="text-[10px] text-slate-400">Imprimir →</span>
                    </button>
                  )}

                  {/* Imprimir Código de Barras */}
                  {isBarcodeTicketActive && handlePrintTicket && filteredItems && (
                    <button
                      type="button"
                      onClick={() => {
                        handlePrintTicket(filteredItems, 'barcode');
                        onClose();
                      }}
                      className="w-full text-left p-3 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-3 transition-all rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3xs cursor-pointer group hover:border-indigo-200 dark:hover:border-indigo-900"
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                        <Barcode className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">Imprimir Códigos de Barra</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">Impresión masiva de etiquetas de barra por SKU</div>
                      </div>
                      <span className="text-[10px] text-slate-400">Imprimir →</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: AJUSTES DE SISTEMA Y CONECTIVIDAD */}
            {activeTab === 'system' && (
              <div className="space-y-3 animate-fade-in">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Herramientas y Conectividad
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenGlobalConfig();
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between transition-all text-left"
                  >
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Google Sheets & Web App Script
                    </span>
                    <span className="text-[10px] text-slate-400">Configurar →</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSchemaEditor();
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between transition-all text-left"
                  >
                    <span className="flex items-center gap-2">
                      <Table className="w-4 h-4 text-indigo-600" />
                      Editor de Esquema & Tipos de Datos
                    </span>
                    <span className="text-[10px] text-slate-400">Abrir →</span>
                  </button>

                  {onOpenBackendMirror && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenBackendMirror();
                      }}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between transition-all text-left"
                    >
                      <span className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-amber-600" />
                        Espejo Backend / PostgreSQL Dual-Write
                      </span>
                      <span className="text-[10px] text-slate-400">Espejo →</span>
                    </button>
                  )}

                  {onOpenTicketConfig && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTicketConfig();
                      }}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between transition-all text-left"
                    >
                      <span className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-blue-500" />
                        Configurar Impresión de Ticket Térmico
                      </span>
                      <span className="text-[10px] text-slate-400">Configurar →</span>
                    </button>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Hoja Activa: {activeTableKey}</div>
                  <div>URL de sincronización configurada: {localStorage.getItem('appsheet_clone_scriptUrl') ? 'Conectado' : 'No conectada (Modo Local)'}</div>
                </div>
              </div>
            )}

          </div>

          {/* Footer del Drawer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-center text-xs">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-500 dark:border-indigo-400/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:scale-105 active:scale-95 rounded-lg font-bold text-xs cursor-pointer transition-all duration-200 shadow-sm shadow-indigo-100 dark:shadow-none flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
              Cerrar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
export default ViewConfigControlDrawer;
