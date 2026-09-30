import React from 'react';
import { Link2, RotateCcw } from 'lucide-react';
import { MasterProductSummary } from '../../../utils/referenceResolver';

interface ItemFormMasterRefCardProps {
  linkedMasterSummary: MasterProductSummary;
  onSelectMasterProduct: (selectedProd: MasterProductSummary) => void;
}

export const ItemFormMasterRefCard: React.FC<ItemFormMasterRefCardProps> = ({
  linkedMasterSummary,
  onSelectMasterProduct
}) => {
  return (
    <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/80 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
          <Link2 className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 rounded font-mono">
              Ref: Catálogo Maestro
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
              {linkedMasterSummary.name || linkedMasterSummary.sku}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {linkedMasterSummary.provider && `Proveedor: ${linkedMasterSummary.provider} • `}
            {linkedMasterSummary.category && `Familia: ${linkedMasterSummary.category}`}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSelectMasterProduct(linkedMasterSummary)}
        className="shrink-0 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 hover:shadow-xs transition-all flex items-center gap-1 cursor-pointer"
        title="Vuelve a rellenar descripción y proveedor desde el catálogo maestro"
      >
        <RotateCcw className="w-3 h-3" />
        <span>Sincronizar Ref</span>
      </button>
    </div>
  );
};
