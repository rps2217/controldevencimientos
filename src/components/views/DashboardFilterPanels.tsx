import React from 'react';
import { Upload, Plus, FileWarning } from 'lucide-react';
import { InventoryItem, SheetProperties } from '../../types';
import { EventResolutionCards } from './EventResolutionCards';
import { EventFilterChips } from './EventFilterChips';
import { PmRadarCards } from './PmRadarCards';
import { useDashboard } from '../../context/DashboardContext';

export interface DashboardFilterPanelsProps {
  areFiltersVisible?: boolean;
  quickChips?: string[];
  activeQuickChip?: string | null;
  setActiveQuickChip?: (chip: string | null) => void;
  activeView?: string;
  activeSheet?: SheetProperties | null;
  items?: InventoryItem[];
  eventResolutionFilter?: string[];
  setEventResolutionFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  handleFilterToggle?: <T>(prev: T[], val: T, isMulti: boolean) => T[];
  eventResolutionMetrics?: any;
  eventFilter?: any[];
  setEventFilter?: React.Dispatch<React.SetStateAction<any[]>>;
  eventMetrics?: any;
  frcBodValues?: string[];
  frcBodCounts?: Record<string, number>;
  frcBodFilter?: string[];
  setFrcBodFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  pmRadarFilter?: string[];
  setPmRadarFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  pmMetrics?: any;
  onOpenBulkImport?: () => void;
  onOpenNewItemModal?: () => void;
}

export const DashboardFilterPanels: React.FC<DashboardFilterPanelsProps> = (props) => {
  const dashboard = useDashboard();

  const areFiltersVisible = props.areFiltersVisible ?? dashboard.areFiltersVisible ?? false;
  const quickChips = props.quickChips ?? dashboard.quickChips ?? [];
  const activeQuickChip = props.activeQuickChip ?? dashboard.activeQuickChip ?? null;
  const setActiveQuickChip = props.setActiveQuickChip ?? dashboard.setActiveQuickChip ?? (() => {});
  const activeView = props.activeView ?? dashboard.activeView;
  const activeSheet = props.activeSheet ?? dashboard.activeSheet;
  const items = props.items ?? dashboard.items ?? [];
  const eventResolutionFilter = props.eventResolutionFilter ?? dashboard.eventResolutionFilter ?? [];
  const setEventResolutionFilter = props.setEventResolutionFilter ?? dashboard.setEventResolutionFilter ?? (() => {});
  const handleFilterToggle = props.handleFilterToggle ?? dashboard.handleFilterToggle ?? ((prev, val) => prev);
  const eventResolutionMetrics = props.eventResolutionMetrics ?? dashboard.eventResolutionMetrics;
  const eventFilter = props.eventFilter ?? dashboard.eventFilter ?? [];
  const setEventFilter = props.setEventFilter ?? dashboard.setEventFilter ?? (() => {});
  const eventMetrics = props.eventMetrics ?? dashboard.eventMetrics;
  const frcBodValues = props.frcBodValues ?? dashboard.frcBodValues ?? [];
  const frcBodCounts = props.frcBodCounts ?? dashboard.frcBodCounts ?? {};
  const frcBodFilter = props.frcBodFilter ?? dashboard.frcBodFilter ?? [];
  const setFrcBodFilter = props.setFrcBodFilter ?? dashboard.setFrcBodFilter ?? (() => {});
  const pmRadarFilter = props.pmRadarFilter ?? dashboard.pmRadarFilter ?? [];
  const setPmRadarFilter = props.setPmRadarFilter ?? dashboard.setPmRadarFilter ?? (() => {});
  const pmMetrics = props.pmMetrics ?? dashboard.pmMetrics;
  const onOpenBulkImport = props.onOpenBulkImport ?? (() => dashboard.setIsBulkImportOpen(true));
  const onOpenNewItemModal = props.onOpenNewItemModal ?? (() => dashboard.handleOpenModal());

  if (!areFiltersVisible) return null;

  return (
    <>
      {/* QUICK CHIPS (Píldoras Contextuales) */}
      {quickChips.length > 0 && activeView !== 'schema' && activeView !== 'analytics' && (
        <div className="bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 px-8 py-2.5 shrink-0 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-2 shrink-0">
            Filtros Rápidos:
          </span>
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => setActiveQuickChip(activeQuickChip === chip ? null : chip)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors shrink-0 ${
                activeQuickChip === chip
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {chip}
            </button>
          ))}
          {activeQuickChip && (
            <button
              onClick={() => setActiveQuickChip(null)}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 px-2 py-1.5 rounded-full transition-colors shrink-0 underline"
            >
              Limpiar filtro
            </button>
          )}
        </div>
      )}

      {/* INCIDENCIAS & FRC STRIP (When activeView === 'events') */}
      {activeView === 'events' && activeSheet && (
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-4 shrink-0 flex flex-col gap-4 shadow-xs">
          {/* Action and Summary Bar for Incidencias & FRC */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold shadow-2xs">
                <FileWarning className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Gestión Operativa de Incidencias & FRC
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-medium">
                    {items.length} {items.length === 1 ? 'registro' : 'registros'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Control y resolución de averías, diferencias de inventario, transporte y mermas
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onOpenBulkImport && (
                <button
                  onClick={onOpenBulkImport}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all flex items-center gap-2 shadow-2xs cursor-pointer active:scale-98"
                  title="Importar masivamente Incidencias FRC desde Excel o Portapapeles"
                >
                  <Upload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Importar FRC (Excel / Portapapeles)</span>
                </button>
              )}
              {onOpenNewItemModal && (
                <button
                  onClick={onOpenNewItemModal}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Registrar una nueva incidencia individual"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Nueva Incidencia</span>
                </button>
              )}
            </div>
          </div>

          <EventResolutionCards 
            eventResolutionFilter={eventResolutionFilter} 
            onFilterClick={(val, isMulti) => setEventResolutionFilter(prev => handleFilterToggle(prev, val, isMulti))}
            metrics={eventResolutionMetrics} 
          />
          {/* Categorías FRC Secundarias y Bodegas */}
          <EventFilterChips 
            totalItems={items.length} 
            eventFilter={eventFilter} 
            onFilterClick={(val, isMulti) => setEventFilter(prev => handleFilterToggle(prev, val, isMulti))}
            metrics={eventMetrics} 
            frcBodValues={frcBodValues}
            frcBodCounts={frcBodCounts}
            frcBodFilter={frcBodFilter}
            onFrcBodFilterClick={(val, isMulti) => setFrcBodFilter(prev => handleFilterToggle(prev, val, isMulti))}
          />
        </div>
      )}

      {/* RADAR COMERCIAL (Only in main view, exclusively for Vencimientos) */}
      {activeView === 'main' && activeSheet && (
        <PmRadarCards 
          pmRadarFilter={pmRadarFilter} 
          onFilterClick={(val, isMulti) => setPmRadarFilter(prev => handleFilterToggle(prev, val, isMulti))}
          metrics={pmMetrics} 
        />
      )}
    </>
  );
};
