import React from 'react';
import { Eye, EyeOff, SlidersHorizontal, Copy, Check } from 'lucide-react';
import { InventoryItem } from '../../../types';
import { getFieldLabel } from '../../../utils/columnAliases';
import { formatDisplayDate } from '../../../utils/dateCalculations';

interface ItemDetailFieldsGridProps {
  product: InventoryItem;
  productKeys: string[];
  orderedKeys: string[];
  hiddenFields: Record<string, boolean>;
  showAllFields: boolean;
  isConfiguringFields: boolean;
  setShowAllFields: (show: boolean) => void;
  setIsConfiguringFields: (configuring: boolean) => void;
  toggleFieldVisibility: (key: string) => void;
  handleShowAllFields: () => void;
  customAliases?: Record<string, string[]>;
}

export const ItemDetailFieldsGrid: React.FC<ItemDetailFieldsGridProps> = ({
  product,
  productKeys,
  orderedKeys,
  hiddenFields,
  showAllFields,
  isConfiguringFields,
  setShowAllFields,
  setIsConfiguringFields,
  toggleFieldVisibility,
  handleShowAllFields,
  customAliases
}) => {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopyValue = (key: string, val: any) => {
    if (val === undefined || val === null) return;
    navigator.clipboard.writeText(String(val));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const visibleKeys = orderedKeys.filter(k => !hiddenFields[k]);
  const shownKeys = showAllFields ? visibleKeys : visibleKeys.filter(k => {
    const v = product[k];
    return v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '-';
  });

  const hiddenCount = productKeys.filter(k => hiddenFields[k]).length;
  const emptyCount = visibleKeys.length - shownKeys.length;

  return (
    <div className="space-y-3">
      {/* Control Bar */}
      <div className="flex items-center justify-between gap-2 py-1 px-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Campos del Registro ({shownKeys.length})
        </span>

        <div className="flex items-center gap-1.5">
          {emptyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllFields(!showAllFields)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={showAllFields ? 'Ocultar campos vacíos' : 'Mostrar campos sin información'}
            >
              {showAllFields ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{showAllFields ? 'Solo con datos' : `+${emptyCount} vacíos`}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsConfiguringFields(!isConfiguringFields)}
            className={`text-[11px] font-semibold flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
              isConfiguringFields 
                ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300' 
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Configurar visibilidad de campos"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Configurar</span>
          </button>
        </div>
      </div>

      {/* Field Configuration Mode Panel */}
      {isConfiguringFields && (
        <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-2xl space-y-2 animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-200">
            <span>Visibilidad de Campos ({productKeys.length - hiddenCount}/{productKeys.length})</span>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={handleShowAllFields}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                Restablecer todos
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
            {orderedKeys.map(key => {
              const isHidden = !!hiddenFields[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleFieldVisibility(key)}
                  className={`text-[11px] font-medium px-2 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                    isHidden 
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 line-through' 
                      : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border-blue-200 dark:border-blue-800 shadow-2xs'
                  }`}
                >
                  {isHidden ? <EyeOff className="w-2.5 h-2.5 text-slate-400" /> : <Eye className="w-2.5 h-2.5 text-blue-500" />}
                  <span>{getFieldLabel(key, customAliases)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Fields List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {shownKeys.map(key => {
          const rawVal = product[key];
          const isDate = /fecha|vencimiento|retiro/i.test(key) && !/dias|días|cant/i.test(key);
          const displayVal = (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') 
            ? '-' 
            : isDate 
              ? formatDisplayDate(rawVal) 
              : String(rawVal);
          const isCopied = copiedKey === key;

          return (
            <div 
              key={key}
              className="p-3 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex items-start justify-between gap-2 group hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                  {getFieldLabel(key, customAliases)}
                </span>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 break-words mt-0.5 select-text">
                  {displayVal}
                </p>
              </div>

              {rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '' && (
                <button
                  type="button"
                  onClick={() => handleCopyValue(key, rawVal)}
                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Copiar valor"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
