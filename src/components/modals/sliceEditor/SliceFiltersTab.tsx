import React from 'react';
import { SliceFilterConfig } from '../../../types';
import { Clock, CheckCircle2 } from 'lucide-react';
import { getOffsetMonthName } from '../SliceEditorModal';

interface SliceFiltersTabProps {
  filterConfig: SliceFilterConfig;
  setFilterConfig: React.Dispatch<React.SetStateAction<SliceFilterConfig>>;
  headers: string[];
  tableKey: string;
  handleTogglePmStatus: (statusId: string) => void;
  handleSetDynamicRange: (start: number, end: number) => void;
  handleClearDynamicRange: () => void;
  handleToggleEventCategory: (catId: string) => void;
  handleToggleEventResolution: (res: 'pending' | 'completed') => void;
  dynamicRangePresets: Array<{ label: string; start: number; end: number; desc: string }>;
  pmStatusOptions: Array<{ id: string; label: string; icon: string; color: string }>;
  eventCategoryOptions: Array<{ id: string; label: string; icon: string; color: string }>;
}

export const SliceFiltersTab: React.FC<SliceFiltersTabProps> = ({
  filterConfig,
  setFilterConfig,
  headers: _headers,
  tableKey,
  handleTogglePmStatus,
  handleSetDynamicRange,
  handleClearDynamicRange,
  handleToggleEventCategory,
  handleToggleEventResolution: _handleToggleEventResolution,
  dynamicRangePresets,
  pmStatusOptions,
  eventCategoryOptions
}) => {
  return (
    <div className="space-y-5">
      {/* Search Term Filter */}
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
          Término de Búsqueda Fijo
        </label>
        <input
          type="text"
          value={filterConfig.searchTerm || ''}
          onChange={(e) => setFilterConfig(prev => ({ ...prev, searchTerm: e.target.value || undefined }))}
          placeholder="Ej: nombre de proveedor, marca o palabra clave fija..."
          className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-all"
        />
      </div>

      {/* Dynamic Month Range (Vencimientos) */}
      <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            Rango de Meses Futuros (Vencimiento)
          </label>
          {filterConfig.dynamicMonthRange && (
            <button
              type="button"
              onClick={handleClearDynamicRange}
              className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
            >
              Quitar filtro de meses
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {dynamicRangePresets.map(preset => {
            const isSelected = filterConfig.dynamicMonthRange?.startOffset === preset.start && 
                               filterConfig.dynamicMonthRange?.endOffset === preset.end;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSetDynamicRange(preset.start, preset.end)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-100 shadow-xs font-bold' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{preset.label}</span>
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {getOffsetMonthName(preset.start)} - {getOffsetMonthName(preset.end)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* PM Radar Filter Options */}
      <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
          Radar PM & Severidad Comercial
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {pmStatusOptions.map(opt => {
            const isSelected = (filterConfig.pmRadarFilter || []).includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleTogglePmStatus(opt.id)}
                className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                  isSelected 
                    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-900 dark:text-amber-100 shadow-xs' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Incident Event Category Filter Options */}
      {tableKey === 'events' && (
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            Categorías de Eventos / Incidencias
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {eventCategoryOptions.map(opt => {
              const isSelected = (filterConfig.eventFilter || []).includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleToggleEventCategory(opt.id)}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                    isSelected 
                      ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-500 text-purple-900 dark:text-purple-100 shadow-xs' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
