import React from 'react';
import { StockCountSession } from '../../../types';
import { formatLocaleNumber } from '../../../utils/pureCalculations';
import { Lock, Unlock, Cloud, Trash2, MapPin } from 'lucide-react';

interface StockCountKpiBarProps {
  currentSession: StockCountSession;
  totalUnitsCounted: number;
  uniqueSkusCounted: number;
  onToggleLockSession: () => void;
  onClearSession: () => void;
  onBackupToCloud: () => void;
}

export const StockCountKpiBar: React.FC<StockCountKpiBarProps> = ({
  currentSession,
  totalUnitsCounted,
  uniqueSkusCounted,
  onToggleLockSession,
  onClearSession,
  onBackupToCloud
}) => {
  const isLocked = currentSession.estado === 'COMPLETED';

  return (
    <div className="p-3 bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 dark:from-slate-800/80 dark:via-blue-950/20 dark:to-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 shrink-0">
          <MapPin className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">
              {currentSession.nombre}
            </span>
            <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
              {currentSession.ubicacion || 'General'}
            </span>
            {isLocked && (
              <span className="text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                Cerrada
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {currentSession.conteos.length} lecturas en el historial
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Total Unidades
          </span>
          <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400 font-mono">
            {formatLocaleNumber(totalUnitsCounted)}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            SKUs Únicos
          </span>
          <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
            {formatLocaleNumber(uniqueSkusCounted)}
          </span>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onToggleLockSession}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isLocked 
                ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800' 
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border-transparent'
            }`}
            title={isLocked ? 'Desbloquear sesión' : 'Bloquear sesión para evitar cambios'}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onBackupToCloud}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded-lg transition-colors cursor-pointer"
            title="Respaldar sesión en la nube"
          >
            <Cloud className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClearSession}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-lg transition-colors cursor-pointer"
            title="Vaciar todas las lecturas de esta sesión"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
