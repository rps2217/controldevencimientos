import React from 'react';
import { ItemStatusResult } from '../../../utils/dateCalculations';
import { Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface ItemDetailStatusBannerProps {
  status: ItemStatusResult;
  detailMode: 'vencimiento' | 'incidencia' | 'catalogo' | 'politica';
}

export const ItemDetailStatusBanner: React.FC<ItemDetailStatusBannerProps> = ({
  status,
  detailMode
}) => {
  if (detailMode !== 'vencimiento') return null;

  const isDanger = status.code === 'EXPIRED' || status.code === 'RETIRE_NOW';
  const isWarning = status.code === 'UPCOMING' || status.code === 'DRAINAGE_PM';

  return (
    <div className={`p-4 rounded-2xl border ${status.color} shadow-xs`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isDanger ? (
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          ) : isWarning ? (
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          )}
          <div>
            <h4 className="font-bold text-sm">
              {status.label}
            </h4>
            {status.daysToRetire !== null && status.daysToRetire !== undefined && (
              <p className="text-xs opacity-80 mt-0.5">
                {status.daysToRetire < 0
                  ? `Vencido hace ${Math.abs(status.daysToRetire)} días`
                  : status.daysToRetire === 0
                  ? 'Retiro inmediato hoy'
                  : `${status.daysToRetire} días restantes para retiro`}
              </p>
            )}
          </div>
        </div>
        {status.actionLabel && (
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${status.actionColor}`}>
            {status.actionLabel}
          </span>
        )}
      </div>
    </div>
  );
};
