import React from 'react';
import { 
  Sliders, Plus, Layers, SlidersHorizontal, Upload, Paintbrush, Sparkles,
  BarChart3, Flame, Clock, AlertTriangle, X, ArrowLeftRight, Trash2, CheckCircle2
} from 'lucide-react';
import { SLICE_COLOR_CLASSES } from '../../utils/sliceRegistry';
import { SliceIcon } from '../slices/SliceSelectorBar';
import { useDashboard } from '../../context/DashboardContext';
import { useModalsActions } from '../../context/ModalsContext';
import { useRightDrawer } from '../../context/RightDrawerContext';

export const DashboardPageHeader: React.FC = () => {
  const dashboard = useDashboard();
  const modalsActions = useModalsActions();
  const rightDrawer = useRightDrawer();

  const activeView = dashboard.activeView;
  const canLogEvents = dashboard.tableCapabilities?.has('incidencia') ?? false;
  const canExpire = dashboard.tableCapabilities?.has('vencimiento') ?? false;
  const setIsBulkImportOpen = modalsActions.setIsBulkImportOpen;
  const onOpenCreateSlice = () => modalsActions.openSliceEditor(null);
  const onOpenSliceManager = () => modalsActions.setIsSliceManagerOpen(true);
  const onOpenViewConfig = () => rightDrawer.setIsRightDrawerOpen(true);
  const slices = dashboard.visibleTableSlices ?? dashboard.currentTableSlices ?? [];
  const activeSliceId = dashboard.activeSliceId ?? null;
  const onSelectSlice = dashboard.handleSelectSlice ?? (() => {});
  const sliceCounts = dashboard.sliceCounts ?? {};
  const totalItemsCount = dashboard.domainItemsCount ?? dashboard.items?.length ?? 0;
  const hasSlices = slices.length > 0 && activeView !== 'schema' && activeView !== 'analytics';

  // KPI Metrics & Filters for Option 3 Integrated View
  const pmMetrics = dashboard.pmMetrics;
  const pmRadarFilter = dashboard.pmRadarFilter ?? [];
  const setPmRadarFilter = dashboard.setPmRadarFilter;
  const eventResolutionMetrics = dashboard.eventResolutionMetrics;
  const eventResolutionFilter = dashboard.eventResolutionFilter ?? [];
  const setEventResolutionFilter = dashboard.setEventResolutionFilter;
  const areFiltersVisible = dashboard.areFiltersVisible ?? false;
  const setAreFiltersVisible = dashboard.setAreFiltersVisible;
  const handleFilterToggle = dashboard.handleFilterToggle;

  return (
    <div className="bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800 shrink-0 px-3 sm:px-6 py-1.5 flex items-center justify-between gap-3 text-xs">
      
      {/* LEFT & CENTER ZONE: Slices & Integrated KPI Badges (Option 3: Zero-Strip Data-First) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0 py-0.5">
        {hasSlices ? (
          <>
            {/* "Todas las filas" base slice button */}
            <button
              onClick={() => onSelectSlice?.(null)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs ${
                !activeSliceId
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Mostrar todas las filas de la tabla sin restricción de vista"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Todas</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono font-bold ${
                !activeSliceId
                  ? 'bg-white/20 text-white dark:bg-black/20 dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                {totalItemsCount}
              </span>
            </button>

            {/* Configured table slices */}
            {slices.map((slice) => {
              const isSelected = activeSliceId === slice.id;
              const colorClasses = SLICE_COLOR_CLASSES[slice.color || 'blue'] || SLICE_COLOR_CLASSES.blue;
              const count = sliceCounts[slice.id] ?? 0;

              return (
                <button
                  key={slice.id}
                  onClick={() => onSelectSlice?.(isSelected ? null : slice)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs border ${
                    isSelected
                      ? `${colorClasses.activeBg} ${colorClasses.activeText} border-transparent shadow-xs ring-1 ${colorClasses.ring}`
                      : `${colorClasses.bg} ${colorClasses.text} ${colorClasses.border} hover:opacity-90`
                  }`}
                  title={slice.description || slice.name}
                >
                  <SliceIcon iconName={slice.icon} className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">{slice.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                    isSelected ? 'bg-white/25 text-white' : `${colorClasses.badgeBg} ${colorClasses.badgeText}`
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}

            {/* Quick action: Create new slice */}
            {onOpenCreateSlice && (
              <button
                onClick={onOpenCreateSlice}
                className="px-2 py-1 rounded-xl text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                title="Capturar vista actual como nuevo Slice"
              >
                <Plus className="w-3 h-3" />
                <span className="hidden sm:inline">Vista</span>
              </button>
            )}

            {/* Slice Manager shortcut */}
            {onOpenSliceManager && (
              <button
                onClick={onOpenSliceManager}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0 cursor-pointer"
                title="Administrar vistas guardadas (Slices)"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            )}

            {/* INTEGRATED KPI ALERT INDICATORS (Opción 3: Zero-Strip Inline Indicators) */}
            {canExpire && pmMetrics && (pmMetrics.retireNow > 0 || pmMetrics.drainage > 0) && (
              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200 dark:border-slate-700 shrink-0">
                {/* Urgent Retire Now Alert */}
                {pmMetrics.retireNow > 0 && (
                  <button
                    onClick={(e) => {
                      if (setPmRadarFilter) {
                        setPmRadarFilter(prev => handleFilterToggle ? handleFilterToggle(prev, 'retire_now', e.ctrlKey || e.metaKey) : (prev.includes('retire_now') ? [] : ['retire_now']));
                      }
                    }}
                    className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 text-[11px] shrink-0 cursor-pointer transition-all border ${
                      pmRadarFilter.includes('retire_now')
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60 hover:bg-red-100'
                    }`}
                    title="Filtrar productos con retiro inmediato vencido"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span>Retirar Ya:</span>
                    <span className="font-mono font-black">{pmMetrics.retireNow}</span>
                  </button>
                )}

                {/* Commercial Drainage Alert */}
                {pmMetrics.drainage > 0 && (
                  <button
                    onClick={(e) => {
                      if (setPmRadarFilter) {
                        setPmRadarFilter(prev => handleFilterToggle ? handleFilterToggle(prev, 'drainage', e.ctrlKey || e.metaKey) : (prev.includes('drainage') ? [] : ['drainage']));
                      }
                    }}
                    className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 text-[11px] shrink-0 cursor-pointer transition-all border ${
                      pmRadarFilter.includes('drainage')
                        ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100'
                    }`}
                    title="Filtrar productos en radar de drenaje comercial"
                  >
                    <Flame className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>Drenaje:</span>
                    <span className="font-mono">{pmMetrics.drainage}</span>
                  </button>
                )}

                {/* Active Radar Filter Clear Button */}
                {pmRadarFilter.length > 0 && (
                  <button
                    onClick={() => setPmRadarFilter?.([])}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-md transition-colors shrink-0"
                    title="Limpiar filtro de radar"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* INTEGRATED INCIDENCE RESOLUTION ALERTS (Opción 3) */}
            {canLogEvents && eventResolutionMetrics && eventResolutionMetrics.pending > 0 && (
              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200 dark:border-slate-700 shrink-0">
                <button
                  onClick={(e) => {
                    if (setEventResolutionFilter) {
                      setEventResolutionFilter(prev => handleFilterToggle ? handleFilterToggle(prev, 'pending', e.ctrlKey || e.metaKey) : (prev.includes('pending') ? [] : ['pending']));
                    }
                  }}
                  className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 text-[11px] shrink-0 cursor-pointer transition-all border ${
                    eventResolutionFilter.includes('pending')
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100'
                  }`}
                  title="Filtrar traspasos e incidencias pendientes"
                >
                  <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                  <span>Pendientes:</span>
                  <span className="font-mono font-black">{eventResolutionMetrics.pending}</span>
                </button>

                {eventResolutionFilter.length > 0 && (
                  <button
                    onClick={() => setEventResolutionFilter?.([])}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-md transition-colors shrink-0"
                    title="Limpiar filtro de traspasos"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>
              {activeView === 'schema'
                ? 'Estructura de columnas, tipos y claves primarias'
                : activeView === 'analytics'
                ? 'Métricas gerenciales y análisis de distribución'
                : 'Inventario general de datos'}
            </span>
          </div>
        )}
      </div>

      {/* RIGHT ZONE: Minimal Unified Tools */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Toggle Paneles KPI / Filtros Detallados (Opción 3) */}
        {hasSlices && (
          <button
            onClick={() => setAreFiltersVisible?.(!areFiltersVisible)}
            className={`px-2 sm:px-2.5 py-1 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 shrink-0 ${
              areFiltersVisible
                ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-400/30'
                : 'border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title={areFiltersVisible ? 'Ocultar paneles KPI extendidos' : 'Mostrar paneles KPI detallados'}
          >
            <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Paneles KPI</span>
          </button>
        )}

        {/* Bulk Import FRC Quick Access (por capacidad de incidencia) */}
        {canLogEvents && setIsBulkImportOpen && (
          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="px-2.5 py-1 rounded-xl font-bold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
            title="Importar masivamente Incidencias FRC desde Excel o Portapapeles"
          >
            <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="hidden sm:inline">Importar FRC</span>
          </button>
        )}

        {/* Command Center Palette (Cmd+K) Button */}
        <button
          onClick={() => modalsActions.setIsCommandPaletteOpen(true)}
          className="px-2.5 sm:px-3 py-1.5 rounded-xl font-bold border border-cyan-200 dark:border-cyan-800/80 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 shrink-0"
          title="Centro de Comandos Rápidos (Cmd+K / Ctrl+K)"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          <span className="hidden sm:inline">Cmd+K</span>
        </button>

        {/* Format Rules (AppSheet) Button */}
        {activeView !== 'schema' && activeView !== 'analytics' && (
          <button
            onClick={() => modalsActions.setIsFormatRulesModalOpen(true)}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl font-bold border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 shrink-0"
            title="Administrar Reglas de Formato Condicional (AppSheet Format Rules)"
          >
            <Paintbrush className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">Format Rules</span>
          </button>
        )}

        {/* Panel Lateral de Vistas y Configuración */}
        {activeView !== 'schema' && activeView !== 'analytics' && onOpenViewConfig && (
          <button
            onClick={onOpenViewConfig}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-xl font-bold border border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 shrink-0"
            title="Abrir Panel Lateral de Control, Densidad y Vistas"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">Vistas & Ajustes</span>
          </button>
        )}
      </div>
    </div>
  );
};
