import React from 'react';
import { 
  Sliders, Plus, Layers, SlidersHorizontal, Upload
} from 'lucide-react';
import { SheetProperties, TableSlice } from '../../types';
import { SLICE_COLOR_CLASSES } from '../../utils/sliceRegistry';
import { SliceIcon } from '../slices/SliceSelectorBar';
import { useDashboard } from '../../context/DashboardContext';

export interface DashboardPageHeaderProps {
  activeView?: string;
  isRelationalActive?: boolean;
  setIsBulkImportOpen?: (open: boolean) => void;
  onOpenCreateSlice?: () => void;
  onOpenSliceManager?: () => void;
  activeSlice?: TableSlice | null;
  onOpenViewConfig?: () => void;
  // Slices integration
  slices?: TableSlice[];
  activeSliceId?: string | null;
  onSelectSlice?: (slice: TableSlice | null) => void;
  sliceCounts?: Record<string, number>;
  totalItemsCount?: number;
  
  // Keep standard props as optional for interface compatibility
  isViewMenuOpen?: boolean;
  setIsViewMenuOpen?: (open: boolean) => void;
  groupByColumn?: string;
  setGroupByColumn?: (col: string) => void;
  groupByDirection?: 'asc' | 'desc';
  onToggleGroupByDirection?: () => void;
  visibleHeaders?: string[];
  setIsColumnManagerOpen?: (open: boolean) => void;
  areFiltersVisible?: boolean;
  setAreFiltersVisible?: React.Dispatch<React.SetStateAction<boolean>>;
  setIsTicketConfigOpen?: (open: boolean) => void;
  hasCustomColWidths?: boolean;
  handleResetColWidths?: () => void;
  isSummaryView?: boolean;
  onToggleSummaryView?: () => void;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  onOpenStockCount?: () => void;
  onToggleStickyColumns?: () => void;
  isStickyEnabled?: boolean;
  activeSheet?: SheetProperties | null;
  isModalOpen?: boolean;
  handleOpenModal?: () => void;
  onEditSlice?: (slice: TableSlice) => void;
  setIsScriptModalOpen?: (open: boolean) => void;
}

export const DashboardPageHeader: React.FC<DashboardPageHeaderProps> = (props) => {
  const dashboard = useDashboard();

  const activeView = props.activeView ?? dashboard.activeView;
  const setIsBulkImportOpen = props.setIsBulkImportOpen ?? dashboard.setIsBulkImportOpen;
  const onOpenCreateSlice = props.onOpenCreateSlice ?? (() => {
    dashboard.setEditingSliceModalItem?.(null);
    dashboard.setIsSliceModalOpen?.(true);
  });
  const onOpenSliceManager = props.onOpenSliceManager ?? (() => dashboard.setIsSliceManagerOpen?.(true));
  const onOpenViewConfig = props.onOpenViewConfig ?? (() => dashboard.setIsRightDrawerOpen?.(true));
  const slices = props.slices ?? dashboard.visibleTableSlices ?? dashboard.currentTableSlices ?? [];
  const activeSliceId = props.activeSliceId ?? dashboard.activeSliceId ?? null;
  const onSelectSlice = props.onSelectSlice ?? dashboard.handleSelectSlice ?? (() => {});
  const sliceCounts = props.sliceCounts ?? dashboard.sliceCounts ?? {};
  const totalItemsCount = props.totalItemsCount ?? dashboard.items?.length ?? 0;
  const onEditSlice = props.onEditSlice ?? ((slice: TableSlice) => {
    dashboard.setEditingSliceModalItem?.(slice);
    dashboard.setIsSliceModalOpen?.(true);
  });
  const hasSlices = slices.length > 0 && activeView !== 'schema' && activeView !== 'analytics';

  return (
    <div className="bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800 shrink-0 px-3 sm:px-6 py-1.5 flex items-center justify-between gap-3 text-xs">
      
      {/* LEFT ZONE: Slices & Custom Views (AppSheet Style) */}
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
        {/* Bulk Import FRC Quick Access */}
        {activeView === 'events' && setIsBulkImportOpen && (
          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="px-2.5 py-1 rounded-xl font-bold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
            title="Importar masivamente Incidencias FRC desde Excel o Portapapeles"
          >
            <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="hidden sm:inline">Importar FRC</span>
          </button>
        )}

        {/* Panel Lateral de Vistas y Configuración */}
        {activeView !== 'schema' && activeView !== 'analytics' && onOpenViewConfig && (
          <button
            onClick={onOpenViewConfig}
            className="px-3.5 py-1.5 rounded-xl font-bold border border-blue-200 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            title="Abrir Panel Lateral de Control, Densidad y Vistas"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Vistas & Ajustes</span>
          </button>
        )}
      </div>
    </div>
  );
};
