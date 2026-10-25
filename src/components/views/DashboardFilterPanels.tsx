import React from 'react';
import { 
  Flame, Clock3, AlertTriangle, CheckCircle2, Clock, X, Filter, Sliders, RefreshCw
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

export const DashboardFilterPanels: React.FC = () => {
  const dashboard = useDashboard();

  const areFiltersVisible = dashboard.areFiltersVisible ?? false;
  const quickChips = dashboard.quickChips ?? [];
  const activeQuickChip = dashboard.activeQuickChip ?? null;
  const setActiveQuickChip = dashboard.setActiveQuickChip ?? (() => {});
  const activeView = dashboard.activeView;
  const caps = dashboard.tableCapabilities;
  const activeSheet = dashboard.activeSheet;
  const canExpire = caps?.has('vencimiento') ?? false;
  const canLogEvents = caps?.has('incidencia') ?? false;
  const eventResolutionFilter = dashboard.eventResolutionFilter ?? [];
  const setEventResolutionFilter = dashboard.setEventResolutionFilter ?? (() => {});
  const handleFilterToggle = dashboard.handleFilterToggle ?? ((prev: string[], _val: string, _isMulti?: boolean) => prev);
  const eventResolutionMetrics = dashboard.eventResolutionMetrics;
  const eventFilter = dashboard.eventFilter ?? [];
  const setEventFilter = dashboard.setEventFilter ?? (() => {});
  const eventMetrics = dashboard.eventMetrics;
  const pmRadarFilter = dashboard.pmRadarFilter ?? [];
  const setPmRadarFilter = dashboard.setPmRadarFilter ?? (() => {});
  const pmMetrics = dashboard.pmMetrics;

  if (!areFiltersVisible) return null;

  return (
    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800 shrink-0 px-3 sm:px-6 py-1.5 flex items-center justify-between gap-3 text-xs overflow-x-auto no-scrollbar transition-all">
      
      {/* EXCLUSIVELY COMPACT 1-LINE RADAR FOR EXPIRY DOMAIN */}
      {canExpire && activeSheet && pmMetrics && (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0 mr-1">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">Radar:</span>
          </span>

          {/* Pill: Retiro Inmediato */}
          <button
            type="button"
            onClick={(e) => setPmRadarFilter((prev: string[]) => handleFilterToggle(prev, 'retire_now', e.ctrlKey || e.metaKey))}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              pmRadarFilter.includes('retire_now')
                ? 'bg-rose-600 text-white shadow-xs ring-1 ring-rose-500'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/40'
            }`}
            title="Retiro Inmediato (Vencidos y Críticos)"
          >
            <span>🚨 Retiro Inmediato</span>
            <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${
              pmRadarFilter.includes('retire_now') ? 'bg-white/20 text-white' : 'bg-rose-200/70 dark:bg-rose-900/80'
            }`}>
              {pmMetrics.retireNow}
            </span>
          </button>

          {/* Pill: Radar PM (Drenaje) */}
          <button
            type="button"
            onClick={(e) => setPmRadarFilter((prev: string[]) => handleFilterToggle(prev, 'drainage', e.ctrlKey || e.metaKey))}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              pmRadarFilter.includes('drainage')
                ? 'bg-amber-500 text-white shadow-xs ring-1 ring-amber-400'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-900/40'
            }`}
            title="Alerta Radar Comercial / PM"
          >
            <span>🔥 Radar PM</span>
            <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${
              pmRadarFilter.includes('drainage') ? 'bg-white/20 text-white' : 'bg-amber-200/70 dark:bg-amber-900/80'
            }`}>
              {pmMetrics.drainage}
            </span>
          </button>

          {/* Pill: Próximos */}
          <button
            type="button"
            onClick={(e) => setPmRadarFilter((prev: string[]) => handleFilterToggle(prev, 'upcoming', e.ctrlKey || e.metaKey))}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              pmRadarFilter.includes('upcoming')
                ? 'bg-orange-500 text-white shadow-xs ring-1 ring-orange-400'
                : 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/50 hover:bg-orange-100 dark:hover:bg-orange-900/40'
            }`}
            title="Próximos a Vencer (<30 días)"
          >
            <span>🕒 Próximos</span>
            <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${
              pmRadarFilter.includes('upcoming') ? 'bg-white/20 text-white' : 'bg-orange-200/70 dark:bg-orange-900/80'
            }`}>
              {pmMetrics.upcoming}
            </span>
          </button>

          {/* Pill: En Regla */}
          <button
            type="button"
            onClick={(e) => setPmRadarFilter((prev: string[]) => handleFilterToggle(prev, 'en_regla', e.ctrlKey || e.metaKey))}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              pmRadarFilter.includes('en_regla')
                ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
            }`}
            title="Inventario en Plazo y Vigente"
          >
            <span>✅ En Regla</span>
            <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${
              pmRadarFilter.includes('en_regla') ? 'bg-white/20 text-white' : 'bg-emerald-200/70 dark:bg-emerald-900/80'
            }`}>
              {pmMetrics.enRegla}
            </span>
          </button>

          {/* Optional Policy Pills: Canje / Merma */}
          {(pmMetrics.canjeProveedor ?? 0) > 0 && (
            <button
              type="button"
              onClick={(e) => setPmRadarFilter((prev: string[]) => handleFilterToggle(prev, 'canje_proveedor', e.ctrlKey || e.metaKey))}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                pmRadarFilter.includes('canje_proveedor')
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-100'
              }`}
              title="Canje Proveedor acordado"
            >
              <span>🤝 Canje</span>
              <span className="font-mono text-[10px]">({pmMetrics.canjeProveedor})</span>
            </button>
          )}

          {(pmMetrics.mermaDirecta ?? 0) > 0 && (
            <button
              type="button"
              onClick={(e) => setPmRadarFilter((prev: string[]) => handleFilterToggle(prev, 'merma_directa', e.ctrlKey || e.metaKey))}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                pmRadarFilter.includes('merma_directa')
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              }`}
              title="Merma Directa (sin retorno)"
            >
              <span>🗑️ Merma</span>
              <span className="font-mono text-[10px]">({pmMetrics.mermaDirecta})</span>
            </button>
          )}

          {/* Clear Radar Filter Button */}
          {pmRadarFilter.length > 0 && (
            <button
              type="button"
              onClick={() => setPmRadarFilter([])}
              className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 font-semibold px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              title="Quitar filtros del radar"
            >
              <X className="w-3 h-3" />
              <span>Limpiar ({pmRadarFilter.length})</span>
            </button>
          )}
        </div>
      )}

      {/* EXCLUSIVELY COMPACT 1-LINE STATUS FOR INCIDENCE DOMAIN */}
      {canLogEvents && activeSheet && (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0 mr-1">
            <Sliders className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Incidencias:</span>
          </span>

          {/* Pill: Pendientes */}
          <button
            type="button"
            onClick={(e) => setEventResolutionFilter((prev: string[]) => handleFilterToggle(prev, 'pending', e.ctrlKey || e.metaKey))}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              eventResolutionFilter.includes('pending')
                ? 'bg-amber-500 text-white shadow-xs ring-1 ring-amber-400'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-900/40'
            }`}
            title="Incidencias pendientes de traspaso o resolución"
          >
            <span>⏳ Pendientes</span>
            <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${
              eventResolutionFilter.includes('pending') ? 'bg-white/20 text-white' : 'bg-amber-200/70 dark:bg-amber-900/80'
            }`}>
              {eventResolutionMetrics?.pending ?? 0}
            </span>
          </button>

          {/* Pill: Regularizados */}
          <button
            type="button"
            onClick={(e) => setEventResolutionFilter((prev: string[]) => handleFilterToggle(prev, 'completed', e.ctrlKey || e.metaKey))}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              eventResolutionFilter.includes('completed')
                ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
            }`}
            title="Incidencias regularizadas con folio de traspaso"
          >
            <span>✅ Regularizados</span>
            <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-md ${
              eventResolutionFilter.includes('completed') ? 'bg-white/20 text-white' : 'bg-emerald-200/70 dark:bg-emerald-900/80'
            }`}>
              {eventResolutionMetrics?.completed ?? 0}
            </span>
          </button>

          {/* Top Event Categories if counts > 0 */}
          {(eventMetrics?.transporte ?? 0) > 0 && (
            <button
              type="button"
              onClick={(e) => setEventFilter((prev: string[]) => handleFilterToggle(prev, 'TRANSPORTE', e.ctrlKey || e.metaKey))}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                eventFilter.includes('TRANSPORTE')
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 hover:bg-blue-100'
              }`}
            >
              <span>🚚 Transporte</span>
              <span className="font-mono text-[10px]">({eventMetrics?.transporte})</span>
            </button>
          )}

          {(eventMetrics?.diferencias ?? 0) > 0 && (
            <button
              type="button"
              onClick={(e) => setEventFilter((prev: string[]) => handleFilterToggle(prev, 'DIFERENCIAS', e.ctrlKey || e.metaKey))}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                eventFilter.includes('DIFERENCIAS')
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/50 hover:bg-purple-100'
              }`}
            >
              <span>⚖️ Diferencias</span>
              <span className="font-mono text-[10px]">({eventMetrics?.diferencias})</span>
            </button>
          )}

          {(eventMetrics?.mermas ?? 0) > 0 && (
            <button
              type="button"
              onClick={(e) => setEventFilter((prev: string[]) => handleFilterToggle(prev, 'MERMAS', e.ctrlKey || e.metaKey))}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                eventFilter.includes('MERMAS')
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100'
              }`}
            >
              <span>⚠️ Mermas</span>
              <span className="font-mono text-[10px]">({eventMetrics?.mermas})</span>
            </button>
          )}

          {/* Clear Incidence Filters Button */}
          {(eventResolutionFilter.length > 0 || eventFilter.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setEventResolutionFilter([]);
                setEventFilter([]);
              }}
              className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 font-semibold px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              title="Quitar filtros de incidencias"
            >
              <X className="w-3 h-3" />
              <span>Limpiar</span>
            </button>
          )}
        </div>
      )}

      {/* QUICK CHIPS (If available, integrated into the line) */}
      {quickChips.length > 0 && activeView !== 'schema' && activeView !== 'analytics' && (
        <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-slate-200 dark:border-slate-800">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden lg:inline">
            Filtros:
          </span>
          {quickChips.map((chip: string, idx: number) => (
            <button
              key={idx}
              onClick={() => setActiveQuickChip(activeQuickChip === chip ? null : chip)}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors shrink-0 cursor-pointer ${
                activeQuickChip === chip
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {chip}
            </button>
          ))}
          {activeQuickChip && (
            <button
              onClick={() => setActiveQuickChip(null)}
              className="text-[11px] text-slate-400 hover:text-slate-600 px-1 py-1 rounded transition-colors shrink-0"
              title="Limpiar filtro rápido"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

    </div>
  );
};

