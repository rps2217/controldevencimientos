import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { StockCountEntry } from '../../types';

export type LastScannedEntry = StockCountEntry & {
  totalAcumulado: number;
  scanCount: number;
};

interface LastScannedHeroCardProps {
  entry: LastScannedEntry | null;
  onIncrement: (sku: string) => void;
  onDecrement: (sku: string) => void;
}

export const LastScannedHeroCard: React.FC<LastScannedHeroCardProps> = ({
  entry,
  onIncrement,
  onDecrement,
}) => {
  if (!entry) return null;

  return (
    <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase font-black tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Último Producto Registrado
        </span>
        <span className="text-[10px] text-emerald-600 font-mono">
          {new Date(entry.timestamp).toLocaleTimeString('es-CL')}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="truncate pr-2 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-black text-sm text-emerald-900 dark:text-emerald-200">{entry.sku}</span>
            {entry.mm && entry.yyyy && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-200/60 text-emerald-800">
                {entry.mm}/{entry.yyyy}
              </span>
            )}
          </div>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
            {entry.descripcion}
          </p>
          <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
            Acumulado: {entry.totalAcumulado} unids ({entry.scanCount} lecturas)
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onDecrement(entry.sku)}
            className="w-9 h-9 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl text-emerald-800 dark:text-emerald-300 font-black flex items-center justify-center text-base active:scale-90 shadow-xs"
            title="Descontar 1 unidad"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => onIncrement(entry.sku)}
            className="w-9 h-9 bg-emerald-600 text-white rounded-xl font-black flex items-center justify-center text-base active:scale-90 shadow-xs"
            title="Sumar 1 unidad"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};