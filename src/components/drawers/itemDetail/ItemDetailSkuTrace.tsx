import React from 'react';
import { InventoryItem, EventCategory } from '../../../types';
import { findColumnBySemantic } from '../../../utils/columnAliases';
import { formatDisplayDate, formatLocaleNumber, renderEventIcon, EVENT_CATEGORIES } from '../../../utils/dateCalculations';
import { Plus, Calendar, AlertTriangle } from 'lucide-react';

interface ItemDetailSkuTraceProps {
  sku: string;
  expirations: InventoryItem[];
  incidents: InventoryItem[];
  onNewEventForProduct: (sku: string, category?: EventCategory) => void;
  customAliases?: Record<string, string[]>;
}

export const ItemDetailSkuTrace: React.FC<ItemDetailSkuTraceProps> = ({
  sku,
  expirations,
  incidents,
  onNewEventForProduct,
  customAliases
}) => {
  if (!sku || sku === '-') return null;

  return (
    <div className="space-y-4">
      {/* Expirations list */}
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <span>Vencimientos Registrados ({expirations.length})</span>
          </h4>
        </div>

        {expirations.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">
            No hay registros de vencimiento para este SKU.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {expirations.map((exp, idx) => {
              const keys = Object.keys(exp);
              const vcCol = findColumnBySemantic(keys, 'fecha_vc', customAliases);
              const qtyCol = findColumnBySemantic(keys, 'cantidad', customAliases);
              const mesCol = findColumnBySemantic(keys, 'mes', customAliases);
              const anioCol = findColumnBySemantic(keys, 'anio', customAliases);

              const dateStr = vcCol && exp[vcCol] 
                ? formatDisplayDate(exp[vcCol]) 
                : (mesCol && anioCol && exp[mesCol] && exp[anioCol]) 
                  ? `${exp[mesCol]}/${exp[anioCol]}` 
                  : '-';
              const qtyStr = qtyCol && exp[qtyCol] ? formatLocaleNumber(exp[qtyCol]) : '1';

              return (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {dateStr}
                    </span>
                    {exp._rowIndex && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        #Fila {exp._rowIndex}
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    {qtyStr} un.
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Incidents / Events list */}
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Incidencias y Eventos FRC ({incidents.length})</span>
          </h4>
          <button
            type="button"
            onClick={() => onNewEventForProduct(sku)}
            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Registrar</span>
          </button>
        </div>

        {incidents.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">
            No hay incidencias registradas para este SKU.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {incidents.map((inc, idx) => {
              const keys = Object.keys(inc);
              const eventCol = findColumnBySemantic(keys, 'tipo_evento', customAliases);
              const obsCol = findColumnBySemantic(keys, 'observacion', customAliases);
              const qtyCol = findColumnBySemantic(keys, 'cantidad', customAliases);

              const eventType = (eventCol && inc[eventCol]) || 'INCIDENCIA';
              const obs = (obsCol && inc[obsCol]) || '-';
              const qty = (qtyCol && inc[qtyCol]) || '1';

              return (
                <div 
                  key={idx} 
                  className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {eventType}
                    </span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      {qty} un.
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {obs}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
