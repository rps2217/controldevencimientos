import React from 'react';
import { ShieldCheck, Plus } from 'lucide-react';
import { ResolvedItemPolicyInfo } from '../../../utils/referenceResolver';

interface ItemFormPolicyCardProps {
  resolvedPolicyInfo: ResolvedItemPolicyInfo;
  onApplyResolvedPolicy: () => void;
}

export const ItemFormPolicyCard: React.FC<ItemFormPolicyCardProps> = ({
  resolvedPolicyInfo,
  onApplyResolvedPolicy
}) => {
  return (
    <div className="p-3.5 bg-gradient-to-r from-teal-50/90 via-emerald-50/70 to-blue-50/80 dark:from-teal-950/40 dark:via-emerald-950/30 dark:to-blue-950/30 border border-teal-200/90 dark:border-teal-800/80 rounded-2xl shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
            <ShieldCheck className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/60 px-2 py-0.5 rounded font-mono border border-teal-200 dark:border-teal-800">
                Política & Retiro Preventivo
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                resolvedPolicyInfo.source === 'policy_module' 
                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300' 
                  : resolvedPolicyInfo.source === 'product_catalog'
                    ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}>
                {resolvedPolicyInfo.sourceDescription}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-white/90 dark:bg-slate-800/90 p-2 rounded-xl border border-teal-100 dark:border-teal-900/50">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Política Comercial</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 truncate block mt-0.5" title={resolvedPolicyInfo.policy}>
                  {resolvedPolicyInfo.policy}
                </span>
              </div>

              <div className="bg-white/90 dark:bg-slate-800/90 p-2 rounded-xl border border-teal-100 dark:border-teal-900/50">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Días de Anticipación</span>
                <span className="font-bold text-teal-700 dark:text-teal-300 block mt-0.5 font-mono">
                  {resolvedPolicyInfo.diasRetiro} días de retiro
                </span>
              </div>

              <div className="bg-white/90 dark:bg-slate-800/90 p-2 rounded-xl border border-teal-100 dark:border-teal-900/50">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Fecha Retiro Calc.</span>
                <span className="font-bold text-blue-700 dark:text-blue-300 block mt-0.5 font-mono">
                  {resolvedPolicyInfo.fechaRetiroDisplay}
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onApplyResolvedPolicy}
          className="shrink-0 text-xs font-bold text-teal-700 dark:text-teal-300 hover:text-teal-900 dark:hover:text-teal-100 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800 hover:shadow-xs transition-all flex items-center gap-1 cursor-pointer mt-0.5"
          title="Rellena la política y calcula la fecha de retiro de acuerdo al maestro de políticas"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Aplicar a Formulario</span>
          <span className="sm:hidden">Aplicar</span>
        </button>
      </div>
    </div>
  );
};
