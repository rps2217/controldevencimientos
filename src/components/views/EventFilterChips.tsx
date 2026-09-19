import React from 'react';
import { Clock3, Truck, CheckCircle2, Tag, FileSpreadsheet, PackageX, RotateCcw, Building2 } from 'lucide-react';
import { EventCategory } from '../../types';

interface EventMetrics {
  vencimientoCercano: number;
  transporte: number;
  calInterna: number;
  calExterna: number;
  canjes: number;
  diferencia: number;
  averia: number;
  devolucion: number;
}

interface EventFilterChipsProps {
  totalItems: number;
  eventFilter: string[];
  onFilterClick: (filter: string, isMulti: boolean) => void;
  metrics: EventMetrics;
  frcBodValues?: string[];
  frcBodCounts?: Record<string, number>;
  frcBodFilter?: string[];
  onFrcBodFilterClick?: (filter: string, isMulti: boolean) => void;
}

export const EventFilterChips: React.FC<EventFilterChipsProps> = ({
  totalItems,
  eventFilter,
  onFilterClick,
  metrics,
  frcBodValues = [],
  frcBodCounts = {},
  frcBodFilter = [],
  onFrcBodFilterClick
}) => {
  const activeEventSet = React.useMemo(() => new Set(eventFilter), [eventFilter]);
  const activeBodSet = React.useMemo(() => new Set(frcBodFilter), [frcBodFilter]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
        <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px] mr-1">Filtrar Tipo de Incidencia:</span>
        <button 
          onClick={(e) => onFilterClick('all', false)}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
            eventFilter.length === 0
              ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm' 
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Todos los tipos ({totalItems})
        </button>
        
        <button 
          onClick={(e) => onFilterClick('VENCIMIENTO_CERCANO', e.ctrlKey || e.metaKey)}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            activeEventSet.has('VENCIMIENTO_CERCANO')
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-none' 
              : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <Clock3 className="w-3.5 h-3.5" />
          <span>VENC. CERC. ({metrics.vencimientoCercano})</span>
        </button>
        
        <button 
          onClick={(e) => onFilterClick('TRANSPORTE', e.ctrlKey || e.metaKey)}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            activeEventSet.has('TRANSPORTE')
              ? 'bg-amber-600 text-white shadow-sm shadow-amber-200 dark:shadow-none' 
              : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <Truck className="w-3.5 h-3.5" />
          <span>DET. PED ({metrics.transporte})</span>
        </button>
        
        <button 
          onClick={(e) => onFilterClick('CAL_INTERNA', e.ctrlKey || e.metaKey)}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            activeEventSet.has('CAL_INTERNA')
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200 dark:shadow-none' 
              : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>CAL. INTER ({metrics.calInterna})</span>
        </button>
        
        <button 
          onClick={(e) => onFilterClick('CAL_EXTERNA', e.ctrlKey || e.metaKey)}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            activeEventSet.has('CAL_EXTERNA')
              ? 'bg-teal-600 text-white shadow-sm shadow-teal-200 dark:shadow-none' 
              : 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>CAL. EXT. ({metrics.calExterna})</span>
        </button>
        
        <button 
          onClick={(e) => onFilterClick('CANJES', e.ctrlKey || e.metaKey)}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            activeEventSet.has('CANJES')
              ? 'bg-pink-600 text-white shadow-sm shadow-pink-200 dark:shadow-none' 
              : 'bg-pink-50 dark:bg-pink-950/50 text-pink-800 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/50'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <Tag className="w-3.5 h-3.5" />
          <span>CANJES ({metrics.canjes})</span>
        </button>
        
        <button 
          onClick={(e) => onFilterClick('DIFERENCIA', e.ctrlKey || e.metaKey)}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            activeEventSet.has('DIFERENCIA')
              ? 'bg-purple-600 text-white shadow-sm shadow-purple-200 dark:shadow-none' 
              : 'bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>DIF. PED ({metrics.diferencia})</span>
        </button>
        
        <button 
          onClick={(e) => onFilterClick('AVERIA', e.ctrlKey || e.metaKey)}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            activeEventSet.has('AVERIA')
              ? 'bg-rose-600 text-white shadow-sm shadow-rose-200 dark:shadow-none' 
              : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <PackageX className="w-3.5 h-3.5" />
          <span>AVERIA ({metrics.averia})</span>
        </button>
        
        <button 
          onClick={(e) => onFilterClick('DEVOLUCION', e.ctrlKey || e.metaKey)}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
            activeEventSet.has('DEVOLUCION')
              ? 'bg-teal-600 text-white shadow-sm shadow-teal-200 dark:shadow-none' 
              : 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>DEVOLUCION ({metrics.devolucion})</span>
        </button>
      </div>

      {frcBodValues.length > 0 && onFrcBodFilterClick && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px] mr-1">Filtrar por Bodega (FRC_BOD):</span>
          <button 
            onClick={(e) => onFrcBodFilterClick('all', false)}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              frcBodFilter.length === 0
                ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Todas las bodegas ({totalItems})
          </button>
          {frcBodValues.map(bod => {
            const active = activeBodSet.has(bod);
            const count = frcBodCounts[bod] || 0;
            return (
              <button
                key={bod}
                onClick={(e) => onFrcBodFilterClick(bod, e.ctrlKey || e.metaKey)}
                className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-200 dark:shadow-none'
                    : 'bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                }`}
                title="Clic normal: Solo esta bodega. Ctrl+Clic: Sumar filtro."
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{bod} ({count})</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
