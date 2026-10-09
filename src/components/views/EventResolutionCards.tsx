import React, { useState } from 'react';
import { Sliders, Database, Clock3, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

interface EventResolutionMetrics {
  total: number;
  pending: number;
  completed: number;
}

interface EventResolutionCardsProps {
  eventResolutionFilter: string[];
  onFilterClick: (filter: string, isMulti: boolean) => void;
  metrics?: EventResolutionMetrics;
}

export const EventResolutionCards: React.FC<EventResolutionCardsProps> = ({
  eventResolutionFilter,
  onFilterClick,
  metrics,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('app_event_res_expanded') === 'true';
    } catch {
      return false;
    }
  });

  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    try {
      localStorage.setItem('app_event_res_expanded', String(next));
    } catch {}
  };

  const m = metrics ?? { total: 0, pending: 0, completed: 0 };

  // COMPACT 1-LINE MINIMALIST MODE
  if (!isExpanded) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs py-1">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0">
          <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5 mr-1 shrink-0">
            <Sliders className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Traspasos:</span>
          </span>

          {/* Pill: Todos */}
          <button
            onClick={() => onFilterClick('all', false)}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs ${
              eventResolutionFilter.length === 0
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Database className="w-3 h-3 text-indigo-400" />
            <span>Todos</span>
            <span className="font-mono text-[10px] opacity-80">{m.total}</span>
          </button>

          {/* Pill: Pendientes */}
          <button
            onClick={(e) => onFilterClick('pending', e.ctrlKey || e.metaKey)}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border ${
              eventResolutionFilter.includes('pending')
                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100'
            }`}
          >
            <Clock3 className="w-3 h-3 text-amber-500" />
            <span>Pendientes</span>
            <span className="font-mono text-[10px] font-black">{m.pending}</span>
          </button>

          {/* Pill: Realizados */}
          <button
            onClick={(e) => onFilterClick('completed', e.ctrlKey || e.metaKey)}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border ${
              eventResolutionFilter.includes('completed')
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Realizados</span>
            <span className="font-mono text-[10px]">{m.completed}</span>
          </button>
        </div>

        {/* Toggle Expand */}
        <button
          onClick={toggleExpanded}
          className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold shrink-0 cursor-pointer transition-colors"
          title="Ver tarjetas completas"
        >
          <span className="hidden sm:inline">Tarjetas</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // EXPANDED MULTI-CARD VIEW
  return (
    <div>
      <div className="flex items-center justify-between gap-1 mb-2.5">
        <span className="font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-xs flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Estado de Gestión de Incidencias (N° de Traspaso)</span>
        </span>
        <button
          onClick={toggleExpanded}
          className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          title="Colapsar a modo 1 línea"
        >
          <span>Modo 1 Línea</span>
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 1. Todos los registros */}
        <button
          onClick={() => onFilterClick('all', false)}
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
            {m.total}
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
            {m.pending}
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
            {m.completed}
          </span>
        </button>
      </div>
    </div>
  );
};
