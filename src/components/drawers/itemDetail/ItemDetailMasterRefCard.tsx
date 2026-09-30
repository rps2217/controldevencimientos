import React from 'react';
import { Link2 } from 'lucide-react';
import { MasterProductSummary } from '../../../utils/referenceResolver';

interface ItemDetailMasterRefCardProps {
  masterSummary: MasterProductSummary;
}

export const ItemDetailMasterRefCard: React.FC<ItemDetailMasterRefCardProps> = ({ masterSummary }) => {
  return (
    <div className="p-3.5 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/80 rounded-2xl shadow-xs">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs">
          <Link2 className="w-3.5 h-3.5" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 font-mono">
          Ref: Catálogo Maestro
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Descripción</span>
          <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
            {masterSummary.name || '-'}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Proveedor</span>
          <p className="font-semibold text-slate-700 dark:text-slate-200 truncate">
            {masterSummary.provider || '-'}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase">Familia / Categoría</span>
          <p className="font-semibold text-slate-700 dark:text-slate-200 truncate">
            {masterSummary.category || '-'}
          </p>
        </div>
      </div>
    </div>
  );
};
