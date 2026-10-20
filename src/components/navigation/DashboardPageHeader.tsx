import React from 'react';
import { 
  Sliders, Plus, Layers, SlidersHorizontal, Upload, Paintbrush, Sparkles, Pencil,
  BarChart3, Flame, Clock, AlertTriangle, X, ArrowLeftRight, Trash2, CheckCircle2
} from 'lucide-react';
import { SLICE_COLOR_CLASSES } from '../../utils/sliceRegistry';
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
    <div className="bg-slate-50 border-b border-slate-200 shrink-0 px-3 py-1.5 flex items-center justify-between gap-3 text-xs">
      
      {/* LEFT ZONE: Slices */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
        {hasSlices ? (
          <>
            <button
              onClick={() => onSelectSlice?.(null)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                !activeSliceId
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todas
            </button>
            {slices.map((slice: TableSlice) => (
              <button
                key={slice.id}
                onClick={() => onSelectSlice?.(activeSliceId === slice.id ? null : slice)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  activeSliceId === slice.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {slice.name}
              </button>
            ))}
          </>
        ) : (
          <span className="text-slate-500 font-bold px-2 uppercase tracking-wider">
             {activeView}
          </span>
        )}
      </div>

      {/* RIGHT ZONE: Global Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setAreFiltersVisible?.(!areFiltersVisible)}
          className="px-3 py-1 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-all shadow-sm"
        >
          KPI
        </button>
        <button
          onClick={() => modalsActions.setIsCommandPaletteOpen(true)}
          className="px-3 py-1 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-all shadow-sm"
        >
          Cmd+K
        </button>
        <button
          onClick={() => dashboard.setIsInlineEditMode?.(!dashboard.isInlineEditMode)}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border shadow-sm ${
            dashboard.isInlineEditMode
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'text-slate-700 bg-white border-slate-300 hover:bg-slate-100'
          }`}
        >
          Edición
        </button>
        <button
          onClick={onOpenViewConfig}
          className="px-3 py-1 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-all shadow-sm"
        >
          Ajustes
        </button>
      </div>
    </div>
  );
};
