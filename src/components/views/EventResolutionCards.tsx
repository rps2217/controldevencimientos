import React from 'react';
import { Sliders, Database, Clock3, CheckCircle2 } from 'lucide-react';

interface EventResolutionMetrics {
  total: number;
  pending: number;
  completed: number;
}

interface EventResolutionCardsProps {
  eventResolutionFilter: string[];
  onFilterClick: (filter: string, isMulti: boolean) => void;
  metrics: EventResolutionMetrics;
}

export const EventResolutionCards: React.FC<EventResolutionCardsProps> = ({
  eventResolutionFilter,
  onFilterClick,
  metrics,
}) => {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2.5">
        <span className="font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-xs flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Estado de Gestión de Incidencias (N° de Traspaso)</span>
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Separación automática según ingreso en columna <strong>N_TRASPASO</strong>
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 1. Todos los registros */}
        <button
          onClick={(e) => onFilterClick('all', false)}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between cursor-pointer ${
            eventResolutionFilter.length === 0
              ? 'border-indigo-600 dark:border-indigo-400 ring-2 ring-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-slate-100/70 dark:hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Todos los Registros</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Total de incidencias y FRC</p>
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {metrics.total}
          </span>
        </button>

        {/* 2. Pendientes */}
        <button
          onClick={(e) => onFilterClick('pending', e.ctrlKey || e.metaKey)}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between cursor-pointer ${
            eventResolutionFilter.includes('pending')
              ? 'border-amber-500 ring-2 ring-amber-500/30 bg-amber-50 dark:bg-amber-950/50 shadow-sm'
              : 'border-amber-200/80 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/70 dark:hover:bg-amber-950/40'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center font-bold">
              <Clock3 className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200">Pendientes</h4>
                <span className="text-[10px] bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-1.5 py-0.2 rounded font-semibold">
                  Sin Traspaso
                </span>
              </div>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400 mt-0.5">Falta gestionar en sistema</p>
            </div>
          </div>
          <span className="text-2xl font-black text-amber-700 dark:text-amber-300 font-mono">
            {metrics.pending}
          </span>
        </button>

        {/* 3. Realizados */}
        <button
          onClick={(e) => onFilterClick('completed', e.ctrlKey || e.metaKey)}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between cursor-pointer ${
            eventResolutionFilter.includes('completed')
              ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/50 shadow-sm'
              : 'border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/20 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40'
          }`}
          title="Clic normal: Solo este. Ctrl+Clic: Sumar filtro."
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">Realizados</h4>
                <span className="text-[10px] bg-emerald-200/80 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200 px-1.5 py-0.2 rounded font-semibold">
                  Con N° Traspaso
                </span>
              </div>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-0.5">Gestionados con éxito</p>
            </div>
          </div>
          <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono">
            {metrics.completed}
          </span>
        </button>
      </div>
    </div>
  );
};
