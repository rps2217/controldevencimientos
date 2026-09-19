import React, { useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Menu, Search, X, FilterX, Scan, Download, ChevronDown, 
  Mail, Flame, FileSpreadsheet, Printer, Barcode, RefreshCw, MessageSquare, Sliders, Settings, CheckCircle2,
  Database, Package, FileText, Sparkles, Plus, PieChart, Activity, Wifi, WifiOff, Upload, AlertTriangle
} from 'lucide-react';
import { InventoryItem, SheetConfig, SheetProperties } from '../../types';
import { VIRTUAL_COLUMNS } from '../../utils/virtualColumns';
import { parseAnyDate } from '../../utils/dateCalculations';
import { exportToExcel } from '../../utils/exportUtils';
import { buildBulkActionContext, isActionEnabledForTable } from '../../utils/bulkActionsRegistry';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { useDashboard } from '../../context/DashboardContext';

export interface DashboardTopNavProps {
  isMobileMenuOpen?: boolean;
  setIsMobileMenuOpen?: (open: boolean) => void;
  activeView?: string;
  activeSheetTitle?: string;
  searchableHeaders?: string[];
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
  hasActiveFilters?: boolean;
  clearAllFilters?: () => void;
  setIsScannerOpen?: (open: boolean) => void;
  setIsMobilePistoleoOpen?: (open: boolean) => void;
  isActionsMenuOpen?: boolean;
  setIsActionsMenuOpen?: (open: boolean) => void;
  setIsGmailModalOpen?: (open: boolean) => void;
  setIsWhatsAppModalOpen?: (open: boolean) => void;
  setIsPmReportOpen?: (open: boolean) => void;
  onOpenBulkActionsConfig?: () => void;
  onOpenTicketConfig?: () => void;
  drainageReportItems?: InventoryItem[];
  headers?: string[];
  visibleHeaders?: string[];
  filteredItems?: InventoryItem[];
  sheetConfig?: SheetConfig;
  products?: any[];
  policies?: any[];
  handlePrintTicket?: (items: InventoryItem[], mode?: 'standard' | 'barcode') => void;
  isOffline?: boolean;
  lastCachedAt?: number | string | null;
  isSyncing?: boolean;
  offlineQueue?: any[];
  handleSyncOfflineQueue?: () => void;
  fetchData?: (config: SheetConfig, view: string, force?: boolean) => void;
  loading?: boolean;
  latencyMs?: number | null;
  connectionStatus?: string;
  onOpenSyncAudit?: () => void;
  failedCount?: number;
  // Executive Context & Actions props
  isRelationalActive?: boolean;
  activeSheet?: SheetProperties | null;
  isModalOpen?: boolean;
  handleOpenModal?: () => void;
  setIsBulkImportOpen?: (open: boolean) => void;
  setIsScriptModalOpen?: (open: boolean) => void;
  onOpenViewConfig?: () => void;
}

export const DashboardTopNav: React.FC<DashboardTopNavProps> = (props) => {
  const dashboard = useDashboard();

  const isMobileMenuOpen = props.isMobileMenuOpen ?? false;
  const setIsMobileMenuOpen = props.setIsMobileMenuOpen ?? (() => {});
  const activeView = props.activeView ?? dashboard.activeView;
  const activeSheetTitle = props.activeSheetTitle ?? dashboard.activeSheet?.title;
  const searchableHeaders = props.searchableHeaders ?? dashboard.searchableHeaders ?? [];
  const searchTerm = props.searchTerm ?? dashboard.searchTerm ?? '';
  const setSearchTerm = props.setSearchTerm ?? dashboard.setSearchTerm;
  const hasActiveFilters = props.hasActiveFilters ?? dashboard.hasActiveFilters ?? false;
  const clearAllFilters = props.clearAllFilters ?? dashboard.clearAllFilters ?? (() => {});
  const setIsScannerOpen = props.setIsScannerOpen ?? dashboard.setIsScannerOpen;
  const setIsMobilePistoleoOpen = props.setIsMobilePistoleoOpen ?? dashboard.setIsMobilePistoleoOpen;
  const isActionsMenuOpen = props.isActionsMenuOpen ?? dashboard.isActionsMenuOpen ?? false;
  const setIsActionsMenuOpen = props.setIsActionsMenuOpen ?? dashboard.setIsActionsMenuOpen ?? (() => {});
  const setIsGmailModalOpen = props.setIsGmailModalOpen ?? dashboard.setIsGmailModalOpen;
  const setIsWhatsAppModalOpen = props.setIsWhatsAppModalOpen ?? dashboard.setIsWhatsAppModalOpen;
  const setIsPmReportOpen = props.setIsPmReportOpen ?? dashboard.setIsPmReportOpen;
  const onOpenBulkActionsConfig = props.onOpenBulkActionsConfig ?? (() => dashboard.setIsBulkActionsConfigOpen?.(true));
  const onOpenTicketConfig = props.onOpenTicketConfig ?? (() => dashboard.setIsTicketConfigOpen?.(true));
  const drainageReportItems = props.drainageReportItems ?? dashboard.drainageReportItems ?? [];
  const headers = props.headers ?? dashboard.headers ?? [];
  const visibleHeaders = props.visibleHeaders ?? dashboard.visibleHeaders;
  const filteredItems = props.filteredItems ?? dashboard.filteredItems ?? [];
  const sheetConfig = props.sheetConfig ?? dashboard.sheetConfig;
  const products = props.products ?? dashboard.products ?? [];
  const policies = props.policies ?? dashboard.policies ?? [];
  const handlePrintTicket = props.handlePrintTicket ?? dashboard.handlePrintTicket;
  const isOffline = props.isOffline ?? dashboard.isOffline ?? false;
  const lastCachedAt = props.lastCachedAt ?? dashboard.lastCachedAt;
  const isSyncing = props.isSyncing ?? dashboard.isSyncing;
  const offlineQueue = props.offlineQueue ?? dashboard.offlineQueue ?? [];
  const handleSyncOfflineQueue = props.handleSyncOfflineQueue ?? dashboard.handleSyncOfflineQueue ?? (() => {});
  const fetchData = props.fetchData ?? dashboard.fetchData;
  const loading = props.loading ?? dashboard.loading ?? false;
  const latencyMs = props.latencyMs ?? dashboard.latencyMs;
  const connectionStatus = props.connectionStatus ?? dashboard.connectionStatus ?? 'connected';
  const onOpenSyncAudit = props.onOpenSyncAudit ?? (() => dashboard.setIsSyncAuditOpen?.(true));
  const failedCount = props.failedCount ?? dashboard.failedCount ?? 0;
  const isRelationalActive = props.isRelationalActive ?? dashboard.isRelationalActive ?? false;
  const activeSheet = props.activeSheet ?? dashboard.activeSheet;
  const isModalOpen = props.isModalOpen ?? dashboard.isModalOpen ?? false;
  const handleOpenModal = props.handleOpenModal ?? dashboard.handleOpenModal;
  const setIsBulkImportOpen = props.setIsBulkImportOpen ?? dashboard.setIsBulkImportOpen;
  const setIsScriptModalOpen = props.setIsScriptModalOpen ?? dashboard.setIsScriptModalOpen;
  const onOpenViewConfig = props.onOpenViewConfig ?? (() => dashboard.setIsRightDrawerOpen?.(true));
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global Keyboard shortcut for search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const bulkActionCtx = useMemo(() => {
    return buildBulkActionContext(headers, activeView, activeSheetTitle);
  }, [headers, activeView, activeSheetTitle]);

  const isWhatsAppActive = isActionEnabledForTable('whatsapp', bulkActionCtx, sheetConfig);
  const isGmailActive = isActionEnabledForTable('gmail', bulkActionCtx, sheetConfig);
  const isPmReportActive = isActionEnabledForTable('pm_report', bulkActionCtx, sheetConfig);
  const isTicketActive = isActionEnabledForTable('ticket', bulkActionCtx, sheetConfig);
  const isBarcodeTicketActive = isActionEnabledForTable('barcode_ticket', bulkActionCtx, sheetConfig);
  const isExcelActive = isActionEnabledForTable('excel', bulkActionCtx, sheetConfig);

  const getViewMeta = () => {
    switch (activeView) {
      case 'main':
        return {
          title: 'Vencimientos',
          icon: <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
          actionLabel: 'Nuevo Vencimiento'
        };
      case 'events':
        return {
          title: 'Incidencias FRC',
          icon: <FileSpreadsheet className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
          actionLabel: 'Nueva Incidencia'
        };
      case 'products':
        return {
          title: 'Catálogo Maestro',
          icon: <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
          actionLabel: 'Nuevo Producto'
        };
      case 'policies':
        return {
          title: 'Políticas Canje',
          icon: <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
          actionLabel: 'Nueva Política'
        };
      case 'schema':
        return {
          title: 'Estructura & Datos',
          icon: <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
          actionLabel: 'Nuevo Registro'
        };
      case 'analytics':
        return {
          title: 'Analítica & Métricas',
          icon: <PieChart className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
          actionLabel: 'Nuevo'
        };
      default:
        return {
          title: activeSheetTitle || activeView,
          icon: <Database className="w-4 h-4 text-blue-600" />,
          actionLabel: 'Nuevo Registro'
        };
    }
  };

  const viewMeta = getViewMeta();

  return (
    <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 z-30 sticky top-0 shrink-0 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2.5 sm:gap-3 shadow-2xs">
      
      {/* LEFT: Mobile trigger & View Identity Context */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="lg:hidden h-10 w-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl transition-all shrink-0 cursor-pointer active:scale-95"
          title="Abrir menú de navegación"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* View Badge Pill */}
        <div className="flex items-center gap-2 h-10 px-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
          <div className="shrink-0">
            {viewMeta.icon}
          </div>
          <span className="font-bold text-xs text-slate-800 dark:text-slate-100 whitespace-nowrap">
            {viewMeta.title}
          </span>
          <span className="font-mono text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white dark:bg-slate-700 border border-slate-200/60 dark:border-slate-600/60 text-slate-600 dark:text-slate-300">
            {filteredItems.length}
          </span>
          {isRelationalActive && activeView === 'main' && (
            <span className="hidden xl:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <Sparkles className="w-2.5 h-2.5 text-emerald-500" /> Relacional
            </span>
          )}
        </div>
      </div>

      {/* CENTER: iOS-Inspired Sleek Search Bar */}
      <div className="flex-1 flex justify-center max-w-2xl px-1 sm:px-2">
        {(activeView !== 'schema' || searchableHeaders.length > 0) ? (
          <div className="relative w-full h-10 flex items-center bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 rounded-2xl transition-all shadow-2xs">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 ml-3 shrink-0" />
            
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={activeView === 'analytics' ? "Buscar y filtrar métricas..." : `Buscar en ${searchableHeaders.length} columnas...`}
              className="w-full bg-transparent pl-2.5 pr-2 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
            />

            {/* Keyboard shortcut indicator */}
            {!searchTerm && (
              <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[9px] font-mono text-slate-400 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md mr-2 shadow-2xs">
                ⌘K
              </kbd>
            )}

            {/* Clear search button */}
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="w-7 h-7 flex items-center justify-center mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Clear all active filters pill */}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2.5 py-1 mr-1.5 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/50 transition-all whitespace-nowrap shrink-0 active:scale-95"
                title="Limpiar todos los filtros aplicados"
              >
                <FilterX className="w-3 h-3" />
                <span className="hidden sm:inline">Limpiar</span>
              </button>
            )}

            {/* Mobile Pistoleo Terminal Trigger */}
            {setIsMobilePistoleoOpen && (
              <button
                onClick={() => setIsMobilePistoleoOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-extrabold text-white bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 rounded-xl shadow-xs transition-all mr-1 shrink-0 cursor-pointer active:scale-95"
                title="Abrir Terminal de Pistoleo Móvil (Cámara / Láser PDA)"
              >
                <Barcode className="w-3.5 h-3.5 text-rose-200" />
                <span className="hidden xs:inline text-[11px]">Pistoleo</span>
              </button>
            )}

            {/* Barcode Camera Scanner */}
            <button
              onClick={() => setIsScannerOpen(true)}
              className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all mr-1 shrink-0 cursor-pointer active:scale-95"
              title="Escanear código de barras o QR con la cámara"
            >
              <Scan className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="w-full" />
        )}
      </div>

      {/* RIGHT: Primary Action, Utilities & Sync Indicator */}
      <div className="flex items-center gap-2 shrink-0">
        
        {/* PWA Install Button (Mobile Only) */}
        <PWAInstallButton variant="compact" className="md:hidden" />

        {/* Special Action: Bulk Import FRC */}
        {activeView === 'events' && setIsBulkImportOpen && (
          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="h-10 flex items-center gap-1.5 px-3.5 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
            title="Importar masivamente Incidencias FRC desde Excel o Portapapeles"
          >
            <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Importar FRC</span>
          </button>
        )}

        {/* Special Action: Apps Script for Schema */}
        {activeView === 'schema' && setIsScriptModalOpen && (
          <button
            onClick={() => setIsScriptModalOpen(true)}
            className="hidden sm:flex h-10 items-center gap-1.5 px-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            <span>Apps Script</span>
          </button>
        )}

        {/* PRIMARY ACTION BUTTON (+ Nuevo Registro) */}
        {activeView !== 'schema' && activeView !== 'analytics' && handleOpenModal && (
          <button 
            disabled={!activeSheet || isModalOpen}
            onClick={() => handleOpenModal()}
            className="h-10 flex items-center gap-1.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-xs shadow-blue-500/20 disabled:opacity-50 transition-all cursor-pointer shrink-0"
            title={`Crear ${viewMeta.actionLabel}`}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">{viewMeta.actionLabel}</span>
          </button>
        )}

        {/* Conteo Físico Terminal */}
        <button
          onClick={() => navigate('/conteo')}
          className="hidden md:flex h-10 items-center gap-1.5 px-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-2xs shrink-0 cursor-pointer active:scale-95"
          title="Módulo de conteo masivo de existencias físicas"
        >
          <Barcode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Conteo</span>
        </button>



        {/* Compact Status, Ping & Sync Indicator */}
        <div 
          onClick={onOpenSyncAudit}
          className="hidden lg:flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 px-2.5 py-1.5 rounded-xl text-xs font-semibold shadow-2xs shrink-0 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all group"
          title={
            isSyncing 
              ? 'Sincronizando cambios con Google Sheets...' 
              : isOffline 
                ? 'Modo sin conexión' 
                : `En línea${latencyMs ? ` · Latencia: ${latencyMs}ms` : ''} · Clic para ver auditoría`
          }
        >
          {isSyncing ? (
            <>
              <RefreshCw className="w-3 h-3 text-blue-600 animate-spin shrink-0" />
              <span className="text-blue-600 dark:text-blue-400 text-[11px] font-medium whitespace-nowrap">Sincronizando...</span>
            </>
          ) : isOffline ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="text-amber-600 dark:text-amber-400 text-[11px] font-medium whitespace-nowrap">Offline</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-slate-600 dark:text-slate-300 text-[11px] font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors whitespace-nowrap">
                En línea
              </span>
            </>
          )}

          {lastCachedAt && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden xl:inline whitespace-nowrap">
              ({new Date(lastCachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
            </span>
          )}

          {failedCount > 0 ? (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onOpenSyncAudit?.();
              }}
              className="ml-1 bg-rose-500 hover:bg-rose-600 text-white px-2 py-0.5 rounded-md text-[10px] font-bold transition-all animate-pulse flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs"
              title={`${failedCount} conflicto(s) de conciliación detectado(s). Clic para resolver o descartar.`}
            >
              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
              <span>{failedCount} Conflicto{failedCount > 1 ? 's' : ''}</span>
            </button>
          ) : offlineQueue.length > 0 ? (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleSyncOfflineQueue();
              }}
              className="ml-1 bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap"
              title="Sincronizar mutaciones pendientes"
            >
              Sync ({offlineQueue.length})
            </button>
          ) : (
            <Activity className="w-3 h-3 text-slate-400 group-hover:text-blue-500 transition-colors shrink-0 ml-0.5 hidden xl:block" />
          )}
        </div>

        {/* Refresh button */}
        <button 
          onClick={() => fetchData(sheetConfig, activeView, true)} 
          className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 p-2 rounded-xl shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0" 
          title="Refrescar datos desde la nube"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>

        {/* Panel Lateral de Vistas y Configuración */}
        {activeView !== 'schema' && activeView !== 'analytics' && onOpenViewConfig && (
          <button
            onClick={onOpenViewConfig}
            className="md:hidden bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 p-2 rounded-xl shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
            title="Abrir Panel Lateral de Control, Densidad y Vistas"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </button>
        )}
      </div>
    </header>
  );
};
