import React from 'react';
import { Clock, CheckCircle2, Flame, Clock3, AlertTriangle, ArrowLeftRight, Trash2, Sparkles } from 'lucide-react';

interface PmMetrics {
  total: number;
  enRegla: number;
  drainage: number;
  upcoming: number;
  retireNow: number;
  canjeProveedor?: number;
  mermaDirecta?: number;
}

interface PmRadarCardsProps {
  pmRadarFilter: string[];
  onFilterClick: (filter: string, isMulti: boolean) => void;
  metrics: PmMetrics;
}

export const PmRadarCards: React.FC<PmRadarCardsProps> = ({
  pmRadarFilter,
  onFilterClick,
  metrics,
}) => {
  return (
    <div className="bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-3 sm:px-6 lg:px-8 py-3.5 shrink-0 transition-all">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch">
        
        {/* PRIMARY STATUS GROUP (iOS Inset Segment) */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-2.5">
          {/* Card: Total */}
          <button
            onClick={(e) => onFilterClick('all', false)}
            className={`group p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 relative flex flex-col justify-between min-h-[72px] sm:min-h-[78px] active:scale-[0.97] cursor-pointer shadow-2xs ${
              pmRadarFilter.length === 0
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 ring-2 ring-blue-500/30'
                : 'bg-white dark:bg-slate-800/90 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                pmRadarFilter.length === 0 ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
              }`}>
                Todos
              </span>
              <div className={`w-6 h-6 rounded-xl flex items-center justify-center ${
                pmRadarFilter.length === 0 ? 'bg-white/20 text-white' : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
              }`}>
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                pmRadarFilter.length === 0 ? 'text-white' : 'text-slate-900 dark:text-slate-100'
              }`}>
                {metrics.total}
              </span>
              <span className={`text-[10px] font-medium truncate max-w-[90px] ${
                pmRadarFilter.length === 0 ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
              }`}>
                Catálogo
              </span>
            </div>
          </button>

          {/* Card: En Regla */}
          <button
            onClick={(e) => onFilterClick('en_regla', e.ctrlKey || e.metaKey)}
            className={`group p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 relative flex flex-col justify-between min-h-[72px] sm:min-h-[78px] active:scale-[0.97] cursor-pointer shadow-2xs ${
              pmRadarFilter.includes('en_regla')
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20 ring-2 ring-emerald-500/30'
                : 'bg-white dark:bg-slate-800/90 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
            title="Clic: Filtrar. Ctrl+Clic: Multi-selección"
          >
            <div className="flex items-center justify-between w-full">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                pmRadarFilter.includes('en_regla') ? 'text-emerald-100' : 'text-emerald-700 dark:text-emerald-400'
              }`}>
                En Regla
              </span>
              <div className={`w-6 h-6 rounded-xl flex items-center justify-center ${
                pmRadarFilter.includes('en_regla') ? 'bg-white/20 text-white' : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
              }`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                pmRadarFilter.includes('en_regla') ? 'text-white' : 'text-slate-900 dark:text-slate-100'
              }`}>
                {metrics.enRegla}
              </span>
              <span className={`text-[10px] font-medium truncate max-w-[90px] ${
                pmRadarFilter.includes('en_regla') ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'
              }`}>
                En Plazo
              </span>
            </div>
          </button>

          {/* Card: Drenaje PM */}
          <button
            onClick={(e) => onFilterClick('drainage', e.ctrlKey || e.metaKey)}
            className={`group p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 relative flex flex-col justify-between min-h-[72px] sm:min-h-[78px] active:scale-[0.97] cursor-pointer shadow-2xs ${
              pmRadarFilter.includes('drainage')
                ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20 ring-2 ring-amber-500/30'
                : 'bg-white dark:bg-slate-800/90 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
            title="Clic: Filtrar. Ctrl+Clic: Multi-selección"
          >
            <div className="flex items-center justify-between w-full">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                pmRadarFilter.includes('drainage') ? 'text-amber-100' : 'text-amber-700 dark:text-amber-400'
              }`}>
                Drenaje PM
              </span>
              <div className={`w-6 h-6 rounded-xl flex items-center justify-center ${
                pmRadarFilter.includes('drainage') ? 'bg-white/20 text-white' : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
              }`}>
                <Flame className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                pmRadarFilter.includes('drainage') ? 'text-white' : 'text-slate-900 dark:text-slate-100'
              }`}>
                {metrics.drainage}
              </span>
              <span className={`text-[10px] font-medium truncate max-w-[90px] ${
                pmRadarFilter.includes('drainage') ? 'text-amber-100' : 'text-slate-400 dark:text-slate-500'
              }`}>
                Comercial
              </span>
            </div>
          </button>

          {/* Card: Próximo Retiro */}
          <button
            onClick={(e) => onFilterClick('upcoming', e.ctrlKey || e.metaKey)}
            className={`group p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 relative flex flex-col justify-between min-h-[72px] sm:min-h-[78px] active:scale-[0.97] cursor-pointer shadow-2xs ${
              pmRadarFilter.includes('upcoming')
                ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20 ring-2 ring-orange-500/30'
                : 'bg-white dark:bg-slate-800/90 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
            title="Clic: Filtrar. Ctrl+Clic: Multi-selección"
          >
            <div className="flex items-center justify-between w-full">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                pmRadarFilter.includes('upcoming') ? 'text-orange-100' : 'text-orange-700 dark:text-orange-400'
              }`}>
                Próximo Retiro
              </span>
              <div className={`w-6 h-6 rounded-xl flex items-center justify-center ${
                pmRadarFilter.includes('upcoming') ? 'bg-white/20 text-white' : 'bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400'
              }`}>
                <Clock3 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                pmRadarFilter.includes('upcoming') ? 'text-white' : 'text-slate-900 dark:text-slate-100'
              }`}>
                {metrics.upcoming}
              </span>
              <span className={`text-[10px] font-medium truncate max-w-[90px] ${
                pmRadarFilter.includes('upcoming') ? 'text-orange-100' : 'text-slate-400 dark:text-slate-500'
              }`}>
                &lt;30 días
              </span>
            </div>
          </button>

          {/* Card: Retirar Ya / Vencido */}
          <button
            onClick={(e) => onFilterClick('retire_now', e.ctrlKey || e.metaKey)}
            className={`group col-span-2 sm:col-span-1 p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 relative flex flex-col justify-between min-h-[72px] sm:min-h-[78px] active:scale-[0.97] cursor-pointer shadow-2xs ${
              pmRadarFilter.includes('retire_now')
                ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-500/20 ring-2 ring-red-500/30'
                : 'bg-white dark:bg-slate-800/90 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
            title="Clic: Filtrar. Ctrl+Clic: Multi-selección"
          >
            <div className="flex items-center justify-between w-full">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                pmRadarFilter.includes('retire_now') ? 'text-red-100' : 'text-red-600 dark:text-red-400'
              }`}>
                Retirar Ya
              </span>
              <div className={`w-6 h-6 rounded-xl flex items-center justify-center ${
                pmRadarFilter.includes('retire_now') ? 'bg-white/20 text-white' : 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400'
              }`}>
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                pmRadarFilter.includes('retire_now') ? 'text-white' : 'text-slate-900 dark:text-slate-100'
              }`}>
                {metrics.retireNow}
              </span>
              <span className={`text-[10px] font-medium truncate max-w-[90px] ${
                pmRadarFilter.includes('retire_now') ? 'text-red-100' : 'text-slate-400 dark:text-slate-500'
              }`}>
                Inmediato
              </span>
            </div>
          </button>
        </div>

        {/* SECONDARY GROUP: POLÍTICA ACCIÓN (Canje vs Merma) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:w-80 shrink-0">
          {/* CANJE PROVEEDOR */}
          <button
            onClick={(e) => onFilterClick('canje_proveedor', e.ctrlKey || e.metaKey)}
            className={`group p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 relative flex flex-col justify-between min-h-[72px] sm:min-h-[78px] active:scale-[0.97] cursor-pointer shadow-2xs ${
              pmRadarFilter.includes('canje_proveedor')
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20 ring-2 ring-indigo-500/30'
                : 'bg-white dark:bg-slate-800/90 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
            title="Clic: Filtrar Canje Proveedor. Ctrl+Clic: Multi-selección"
          >
            <div className="flex items-center justify-between w-full">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                pmRadarFilter.includes('canje_proveedor') ? 'text-indigo-100' : 'text-indigo-700 dark:text-indigo-300'
              }`}>
                Canje Proveedor
              </span>
              <div className={`w-6 h-6 rounded-xl flex items-center justify-center ${
                pmRadarFilter.includes('canje_proveedor') ? 'bg-white/20 text-white' : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
              }`}>
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                pmRadarFilter.includes('canje_proveedor') ? 'text-white' : 'text-slate-900 dark:text-slate-100'
              }`}>
                {metrics.canjeProveedor ?? 0}
              </span>
              <span className={`text-[10px] font-medium truncate max-w-[90px] ${
                pmRadarFilter.includes('canje_proveedor') ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'
              }`}>
                Devolución
              </span>
            </div>
          </button>

          {/* MERMA DIRECTA */}
          <button
            onClick={(e) => onFilterClick('merma_directa', e.ctrlKey || e.metaKey)}
            className={`group p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-200 relative flex flex-col justify-between min-h-[72px] sm:min-h-[78px] active:scale-[0.97] cursor-pointer shadow-2xs ${
              pmRadarFilter.includes('merma_directa')
                ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-500/20 ring-2 ring-rose-500/30'
                : 'bg-white dark:bg-slate-800/90 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
            title="Clic: Filtrar Merma Directa. Ctrl+Clic: Multi-selección"
          >
            <div className="flex items-center justify-between w-full">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                pmRadarFilter.includes('merma_directa') ? 'text-rose-100' : 'text-rose-700 dark:text-rose-300'
              }`}>
                Merma Directa
              </span>
              <div className={`w-6 h-6 rounded-xl flex items-center justify-center ${
                pmRadarFilter.includes('merma_directa') ? 'bg-white/20 text-white' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
              }`}>
                <Trash2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                pmRadarFilter.includes('merma_directa') ? 'text-white' : 'text-slate-900 dark:text-slate-100'
              }`}>
                {metrics.mermaDirecta ?? 0}
              </span>
              <span className={`text-[10px] font-medium truncate max-w-[90px] ${
                pmRadarFilter.includes('merma_directa') ? 'text-rose-100' : 'text-slate-400 dark:text-slate-500'
              }`}>
                Sin Retorno
              </span>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
};

