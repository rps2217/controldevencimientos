import React from 'react';
import { AlertTriangle, ArrowRight, Layers } from 'lucide-react';
import { ExistingCuVcMatch } from '../../../utils/cuVcConsolidator';

interface ItemFormCuVcBannerProps {
  existingCuVcMatch: ExistingCuVcMatch;
  currentEnteredQty: number;
  onConsolidateWithExisting: () => void;
  onLoadExistingRow: () => void;
}

export const ItemFormCuVcBanner: React.FC<ItemFormCuVcBannerProps> = ({
  existingCuVcMatch,
  currentEnteredQty,
  onConsolidateWithExisting,
  onLoadExistingRow
}) => {
  const rowIndex = existingCuVcMatch.existingItem?._rowIndex ?? existingCuVcMatch.rowIndex ?? '-';

  return (
    <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-300 dark:border-amber-800/80 rounded-2xl shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded font-mono border border-amber-300 dark:border-amber-800">
                ¡Vencimiento Existente Detectado!
              </span>
              <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
                CU_VC: {existingCuVcMatch.cuVc}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Ya existe este SKU registrado en la fila <strong className="text-slate-800 dark:text-slate-100">#{rowIndex}</strong> con <strong className="text-amber-700 dark:text-amber-400">{existingCuVcMatch.currentQuantity} unidades</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-amber-200/80 dark:border-amber-800/50 flex items-center justify-end gap-2 flex-wrap">
        <button
          type="button"
          onClick={onLoadExistingRow}
          className="text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          <span>Cargar Fila #{rowIndex}</span>
        </button>

        <button
          type="button"
          onClick={onConsolidateWithExisting}
          className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Sumar Stock ({existingCuVcMatch.currentQuantity} + {currentEnteredQty} = {existingCuVcMatch.currentQuantity + currentEnteredQty})</span>
        </button>
      </div>
    </div>
  );
};
