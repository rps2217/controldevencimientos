import React from 'react';

export interface CountNumpadProps {
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  onMultiply: (factor: number) => void;
  onIncrement: () => void;
}

/** Teclado numérico táctil del terminal móvil de conteo. */
export const CountNumpad: React.FC<CountNumpadProps> = ({
  onDigit,
  onClear,
  onBackspace,
  onMultiply,
  onIncrement
}) => {
  const digitCls =
    'h-12 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono font-black text-xl rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs active:bg-blue-50 dark:active:bg-blue-950/60 active:scale-95 transition-all flex items-center justify-center cursor-pointer';

  return (
    <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-700">
      {['7', '8', '9'].map(d => (
        <button key={d} type="button" onClick={() => onDigit(d)} className={digitCls}>
          {d}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="h-12 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-black text-sm rounded-xl border border-rose-200 dark:border-rose-800 shadow-2xs active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        title="Limpiar cantidad a 1"
      >
        C
      </button>

      {['4', '5', '6'].map(d => (
        <button key={d} type="button" onClick={() => onDigit(d)} className={digitCls}>
          {d}
        </button>
      ))}
      <button
        type="button"
        onClick={onBackspace}
        className="h-12 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-black text-base rounded-xl border border-amber-200 dark:border-amber-800 shadow-2xs active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        title="Borrar último dígito"
      >
        ⌫
      </button>

      {['1', '2', '3'].map(d => (
        <button key={d} type="button" onClick={() => onDigit(d)} className={digitCls}>
          {d}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onMultiply(10)}
        className="h-12 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-black text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 shadow-2xs active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        title="Multiplicar por 10"
      >
        ×10
      </button>

      <button type="button" onClick={() => onDigit('0')} className={digitCls}>
        0
      </button>
      <button type="button" onClick={() => onDigit('00')} className={digitCls}>
        00
      </button>
      <button
        type="button"
        onClick={onIncrement}
        className="h-12 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-black text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-2xs active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        title="Sumar 1 unidad"
      >
        +1
      </button>
      <button
        type="submit"
        className="h-12 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center cursor-pointer uppercase tracking-tight"
      >
        ↵ OK
      </button>
    </div>
  );
};