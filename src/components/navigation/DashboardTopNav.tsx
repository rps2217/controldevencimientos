import React, { useEffect } from 'react';
import { Menu, Search, X, FilterX, Scan, FileSpreadsheet, Barcode, RefreshCw, Sliders, Database, Package, FileText, Sparkles, Plus, PieChart, Settings2, Calendar, Truck } from 'lucide-react';
import { ThemeSelector } from './ThemeSelector';
import { useDashboard } from '../../context/DashboardContext';
import { useModalsActions } from '../../context/ModalsContext';
import { useRightDrawer } from '../../context/RightDrawerContext';
import { useUiSettings } from '../../context/UiSettingsContext';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';

export const DashboardTopNav: React.FC = () => {
  const dashboard = useDashboard();
  const modalsActions = useModalsActions();
  const rightDrawer = useRightDrawer();
  const { onEditBackendUrl } = useUiSettings();

  const setIsMobileMenuOpen = modalsActions.setIsMobileMenuOpen;
  const activeView = dashboard.activeView;
  const activeSheetTitle = dashboard.activeSheet?.title;
  const searchableHeaders = dashboard.searchableHeaders ?? [];
  const searchTerm = dashboard.searchTerm ?? '';
  const setSearchTerm = dashboard.setSearchTerm;
  const searchValue = dashboard.searchTerm ?? '';
  const {
    inputRef: searchInputRef,
    typed: typedSearch,
    onChange: commitSearch,
    clear: clearSearch
  } = useDebouncedSearch(searchValue, setSearchTerm);
  const hasActiveFilters = dashboard.hasActiveFilters ?? false;
  const clearAllFilters = dashboard.clearAllFilters ?? (() => {});
  const setIsScannerOpen = modalsActions.setIsScannerOpen;
  const setIsMobilePistoleoOpen = modalsActions.setIsMobilePistoleoOpen;
  const filteredItems = dashboard.filteredItems ?? [];
  const sheetConfig = dashboard.sheetConfig;
  const isOffline = dashboard.isOffline ?? false;
  const isSyncing = dashboard.isSyncing;
  const offlineQueue = dashboard.offlineQueue ?? [];
  const fetchData = dashboard.fetchData;
  const loading = dashboard.loading ?? false;
  const latencyMs = dashboard.latencyMs;
  const onOpenSyncAudit = () => modalsActions.setIsSyncAuditOpen?.(true);
  const isRelationalActive = dashboard.isRelationalActive ?? false;
  const activeSheet = dashboard.activeSheet;
  const isModalOpen = dashboard.isModalOpen ?? false;
  const handleOpenModal = dashboard.handleOpenModal;
  const onOpenViewConfig = () => rightDrawer.setIsRightDrawerOpen(true);
  const onOpenStockCount = () => modalsActions.setIsStockCountOpen?.(true);

  const canCount = dashboard.tableCapabilities?.has('conteo') ?? false;

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
  }, [searchInputRef]);

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
      case 'calendar':
        return {
          title: 'Agenda & Calendario',
          icon: <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
          actionLabel: 'Nueva Tarea'
        };
      case 'recepBultos':
        return {
          title: 'Recepción Bultos',
          icon: <Truck className="w-4 h-4 text-orange-600 dark:text-orange-400" />,
          actionLabel: 'Pistolear Bulto'
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
    <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 z-40 sticky top-0 shrink-0 shadow-2xs transition-all">
      {/* ROW 1: Brand / Module Title, Primary Actions & Main Utilities */}
      <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* LEFT: Mobile Navigation Trigger & Unboxed Module Identity */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden h-10 w-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all shrink-0 cursor-pointer active:scale-95"
            title="Abrir menú de navegación"
            aria-label="Abrir menú de navegación"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Clean Module Badge - No Forced Truncation or Squishing */}
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
              {viewMeta.icon}
            </div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap">
                {viewMeta.title}
              </h1>
            </div>
          </div>
        </div>

        {/* CENTER (Desktop Large Only): Protagonist Integrated Search Bar */}
        <div className="hidden lg:flex flex-1 justify-center max-w-xl px-2 min-w-0">
          {(activeView !== 'schema' || searchableHeaders.length > 0) ? (
            <div className="relative w-full h-10 flex items-center bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 rounded-xl transition-all shadow-2xs min-w-0">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 ml-3 shrink-0" />
              
              <input
                key={`search-desk-${activeView}`}
                ref={searchInputRef}
                type="text"
                value={typedSearch}
                onChange={(e) => commitSearch(e.target.value)}
                placeholder={activeView === 'analytics' ? "Buscar métricas..." : `Buscar en ${searchableHeaders.length} columnas...`}
                className="w-full bg-transparent pl-2.5 pr-2 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
              />

              {!typedSearch && (
                <kbd className="hidden xl:inline-block px-1.5 py-0.5 text-[9px] font-mono text-slate-400 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md mr-2 shadow-2xs shrink-0">
                  ⌘K
                </kbd>
              )}

              {typedSearch && (
                <button
                  onClick={clearSearch}
                  className="w-6 h-6 flex items-center justify-center mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer shrink-0"
                  title="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 px-2 py-1 mr-1.5 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/50 transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
                  title="Limpiar todos los filtros"
                >
                  <FilterX className="w-3 h-3" />
                  <span>Limpiar</span>
                </button>
              )}

              {setIsMobilePistoleoOpen && canCount && (
                <button
                  onClick={() => setIsMobilePistoleoOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-extrabold text-white bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 rounded-lg shadow-xs transition-all mr-1 shrink-0 cursor-pointer active:scale-95"
                  title="Terminal de Pistoleo"
                >
                  <Barcode className="w-3.5 h-3.5 text-rose-200" />
                  <span>Pistoleo</span>
                </button>
              )}

              <button
                onClick={() => setIsScannerOpen(true)}
                className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all mr-1 shrink-0 cursor-pointer active:scale-95"
                title="Escanear con cámara"
              >
                <Scan className="w-4 h-4" />
              </button>
            </div>
          ) : null}
        </div>

        {/* RIGHT: Primary Action, Utilities & Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* PRIMARY ACTION (+ Nuevo Registro) */}
          {activeView !== 'schema' && activeView !== 'analytics' && handleOpenModal && (
            <button 
              disabled={!activeSheet || isModalOpen}
              onClick={() => handleOpenModal()}
              className="app-button bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20 flex items-center gap-1.5 px-3 sm:px-4"
              title={`Crear ${viewMeta.actionLabel}`}
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">{viewMeta.actionLabel}</span>
            </button>
          )}

          {/* Conteo Físico Terminal (Desktop & Tablet) */}
          {canCount && (
            <button
              onClick={onOpenStockCount}
              className="app-button hidden md:flex border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 items-center gap-1.5 px-3"
              title="Módulo de conteo masivo de existencias físicas"
            >
              <Barcode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Conteo</span>
            </button>
          )}

          {/* Theme & Settings */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <ThemeSelector />
            <button
              onClick={onEditBackendUrl}
              className="flex h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors shadow-2xs items-center justify-center cursor-pointer active:scale-95 shrink-0"
              title="Ajustes de conexión Apps Script"
              aria-label="Ajustes de conexión Apps Script"
            >
              <Settings2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* AppSheet-Style Sync & Offline Status Indicator */}
          <div 
            onClick={onOpenSyncAudit}
            className={`hidden lg:flex items-center gap-2 bg-white dark:bg-slate-800 border px-2.5 py-1.5 rounded-xl text-xs font-semibold shadow-2xs shrink-0 cursor-pointer transition-all group ${
              isSyncing 
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/30' 
                : isOffline || offlineQueue.length > 0
                ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30'
                : 'border-emerald-200 dark:border-emerald-800/80 hover:border-emerald-300'
            }`}
            title={
              isSyncing 
                ? 'Sincronizando cambios con la nube...' 
                : isOffline 
                ? 'Modo sin conexión (los cambios se guardan localmente)' 
                : offlineQueue.length > 0 
                ? `${offlineQueue.length} cambio(s) pendiente(s) de sincronizar` 
                : 'Sincronizado (Local-First Activo)'
            }
          >
            {isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
            ) : isOffline ? (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            ) : offlineQueue.length > 0 ? (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            )}
            <span className="text-slate-700 dark:text-slate-200 text-[11px] font-medium hidden xl:inline">
              {isSyncing 
                ? 'Sincronizando' 
                : isOffline 
                ? 'Offline' 
                : offlineQueue.length > 0 
                ? `${offlineQueue.length} pendiente${offlineQueue.length > 1 ? 's' : ''}` 
                : 'Sincronizado'}
            </span>
            {latencyMs !== null && !isOffline && (
              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono hidden 2xl:inline">
                ({latencyMs}ms)
              </span>
            )}
          </div>

          {/* Refresh button */}
          <button 
            onClick={() => fetchData(sheetConfig, activeView, true)} 
            className="h-10 w-10 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0 active:scale-95" 
            title="Refrescar datos desde la nube"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* View Config Drawer Button (Mobile & Tablet) */}
          {activeView !== 'schema' && activeView !== 'analytics' && onOpenViewConfig && (
            <button
              onClick={onOpenViewConfig}
              className="md:hidden h-10 w-10 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0 active:scale-95"
              title="Filtros & Ajustes de Vista"
            >
              <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </button>
          )}
        </div>
      </div>

      {/* ROW 2 (Mobile & Tablet < 1024px): Dedicated Full-Width Search Input Bar */}
      {(activeView !== 'schema' || searchableHeaders.length > 0) && (
        <div className="lg:hidden px-3 sm:px-6 pb-2.5 pt-0.5 border-t border-slate-100 dark:border-slate-800/80">
          <div className="relative w-full h-10 flex items-center bg-slate-100/90 dark:bg-slate-800/80 focus-within:bg-white dark:focus-within:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 rounded-xl transition-all shadow-2xs">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 ml-3 shrink-0" />
            
            <input
              key={`search-mob-${activeView}`}
              ref={searchInputRef}
              type="text"
              value={typedSearch}
              onChange={(e) => commitSearch(e.target.value)}
              placeholder={activeView === 'analytics' ? "Buscar y filtrar métricas..." : `Buscar en ${searchableHeaders.length} columnas...`}
              className="w-full bg-transparent pl-2.5 pr-2 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
            />

            {typedSearch && (
              <button
                onClick={clearSearch}
                className="w-6 h-6 flex items-center justify-center mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer shrink-0"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2 py-1 mr-1 text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/50 shrink-0 cursor-pointer"
                title="Limpiar filtros"
              >
                <FilterX className="w-3 h-3" />
                <span>Limpiar</span>
              </button>
            )}

            {setIsMobilePistoleoOpen && canCount && (
              <button
                onClick={() => setIsMobilePistoleoOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold text-white bg-gradient-to-r from-red-700 to-rose-700 rounded-lg shadow-xs mr-1 shrink-0 cursor-pointer active:scale-95"
                title="Terminal de Pistoleo Móvil"
              >
                <Barcode className="w-3 h-3 text-rose-200" />
                <span>Pistoleo</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
