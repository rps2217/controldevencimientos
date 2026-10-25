import React from 'react';
import { 
  Sliders, Plus, Layers, SlidersHorizontal, Pencil,
  BarChart3, CheckCircle2
} from 'lucide-react';
import { SliceIcon } from '../slices/SliceSelectorBar';
import { useDashboard } from '../../context/DashboardContext';
import { useModalsActions } from '../../context/ModalsContext';
import { useRightDrawer } from '../../context/RightDrawerContext';
import { TableSlice } from '../../types';

export const DashboardPageHeader: React.FC = () => {
  const dashboard = useDashboard();
  const modalsActions = useModalsActions();
  const rightDrawer = useRightDrawer();

  const activeView = dashboard.activeView;
  const onOpenSliceManager = () => modalsActions.setIsSliceManagerOpen(true);
  const onOpenViewConfig = () => rightDrawer.setIsRightDrawerOpen(true);
  const slices = dashboard.visibleTableSlices ?? dashboard.currentTableSlices ?? [];
  const activeSliceId = dashboard.activeSliceId ?? null;
  const onSelectSlice = dashboard.handleSelectSlice ?? (() => {});
  const sliceCounts = dashboard.sliceCounts ?? {};
  const totalItemsCount = dashboard.domainItemsCount ?? dashboard.items?.length ?? 0;
  const hasSlices = slices.length > 0 && activeView !== 'schema' && activeView !== 'analytics';

  const areFiltersVisible = dashboard.areFiltersVisible ?? false;
  const setAreFiltersVisible = dashboard.setAreFiltersVisible;

  return (
    <div className="bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800 shrink-0 px-3 sm:px-6 py-1.5 flex items-center justify-between gap-3 text-xs transition-colors">
      
      {/* LEFT ZONE: AppSheet Segmented Slices Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0 py-0.5">
        {hasSlices ? (
          <>
            {/* Tab: Todas */}
            <button
              onClick={() => onSelectSlice?.(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                !activeSliceId
                  ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
              }`}
            >
              <span>Todas</span>
              <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${
                !activeSliceId
                  ? 'bg-white/20 dark:bg-slate-900/20 text-white dark:text-slate-900'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                {totalItemsCount}
              </span>
            </button>

            {/* Slices Tabs */}
            {slices.map((slice: TableSlice) => {
              const isActive = activeSliceId === slice.id;
              const count = sliceCounts[slice.id] ?? 0;
              return (
                <button
                  key={slice.id}
                  onClick={() => onSelectSlice?.(isActive ? null : slice)}
                  title={slice.description || slice.name}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <SliceIcon iconName={slice.icon} className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span className="truncate max-w-[150px]">{slice.name}</span>
                  <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}

            {/* Manage Slices Button */}
            <button
              onClick={onOpenSliceManager}
              className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer ml-0.5"
              title="Gestionar y personalizar Slices / Vistas"
              aria-label="Gestionar Slices"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <span className="text-slate-400 dark:text-slate-500 font-bold px-2 uppercase tracking-wider text-[11px]">
             {activeView}
          </span>
        )}
      </div>

      {/* RIGHT ZONE: Streamlined Global Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setAreFiltersVisible?.(!areFiltersVisible)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border shadow-2xs flex items-center gap-1.5 cursor-pointer ${
            areFiltersVisible
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 font-bold'
              : 'text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80'
          }`}
          title={areFiltersVisible ? "Ocultar barra de KPIs y filtros" : "Mostrar barra de KPIs y filtros"}
        >
          <BarChart3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>KPIs</span>
        </button>

        <button
          onClick={() => dashboard.setIsInlineEditMode?.(!dashboard.isInlineEditMode)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border shadow-2xs flex items-center gap-1.5 cursor-pointer ${
            dashboard.isInlineEditMode
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80'
          }`}
          title="Alternar modo de edición rápida en tabla"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Edición</span>
        </button>

        <button
          onClick={onOpenViewConfig}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
          title="Ajustes de columnas y vista"
        >
          <Sliders className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span className="hidden sm:inline">Ajustes</span>
        </button>
      </div>
    </div>
  );
};
