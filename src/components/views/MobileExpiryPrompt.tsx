import React from 'react';
import { X, Calendar } from 'lucide-react';

export const MONTHS_LIST = [
  { val: '01', label: '01 - Ene' },
  { val: '02', label: '02 - Feb' },
  { val: '03', label: '03 - Mar' },
  { val: '04', label: '04 - Abr' },
  { val: '05', label: '05 - May' },
  { val: '06', label: '06 - Jun' },
  { val: '07', label: '07 - Jul' },
  { val: '08', label: '08 - Ago' },
  { val: '09', label: '09 - Sep' },
  { val: '10', label: '10 - Oct' },
  { val: '11', label: '11 - Nov' },
  { val: '12', label: '12 - Dic' },
];

interface MobileExpiryPromptProps {
  sku: string;
  quantity: number;
  yearsList: string[];
  tempYyyy: string;
  tempMm: string;
  onSelectYear: (year: string) => void;
  onSelectMonth: (month: string) => void;
  onSkip: () => void;
  onClose: () => void;
}

export const MobileExpiryPrompt: React.FC<MobileExpiryPromptProps> = ({
  sku,
  quantity,
  yearsList,
  tempYyyy,
  tempMm,
  onSelectYear,
  onSelectMonth,
  onSkip,
  onClose,
}) => {
  return (
    <div className="bg-blue-50/95 dark:bg-slate-800 p-4 rounded-2xl border-2 border-blue-500 dark:border-blue-700 shadow-xl animate-in zoom-in-95 duration-150">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 block">
            Fecha de Vencimiento
          </span>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mt-0.5">
            ¿Cuándo vence este producto?
          </h3>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            SKU: {sku} • Cant: {quantity}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-slate-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="mb-3">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 block">1. Selecciona Año</span>
        <div className="grid grid-cols-4 gap-1.5">
          {yearsList.map(y => (
            <button
              key={y}
              type="button"
              onClick={() => onSelectYear(y)}
              className={`py-2.5 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                tempYyyy === y
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 block">2. Selecciona Mes</span>
        <div className="grid grid-cols-4 gap-1.5">
          {MONTHS_LIST.map(m => (
            <button
              key={m.val}
              type="button"
              onClick={() => onSelectMonth(m.val)}
              className={`py-2.5 rounded-xl text-xs font-black transition-all text-center border cursor-pointer ${
                tempMm === m.val
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              {m.label.split(' - ')[0]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="w-full py-3 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Calendar className="w-4 h-4 text-slate-500" />
        <span>Omitir Fecha (Sin Vencimiento)</span>
      </button>
    </div>
  );
};