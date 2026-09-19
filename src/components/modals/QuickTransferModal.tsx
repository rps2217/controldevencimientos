import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Clock3, AlertCircle, ArrowRight, FileSpreadsheet, Loader2 } from 'lucide-react';
import { InventoryItem } from '../../types';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { getEventCategory, EVENT_CATEGORIES, renderEventIcon } from '../../utils/dateCalculations';

interface QuickTransferModalProps {
  isOpen: boolean;
  item: InventoryItem | null;
  headers: string[];
  onClose: () => void;
  onSave: (item: InventoryItem, traspasoNumber: string) => Promise<void>;
}

export const QuickTransferModal: React.FC<QuickTransferModalProps> = ({
  isOpen,
  item,
  headers,
  onClose,
  onSave
}) => {
  const [traspasoInput, setTraspasoInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const traspasoCol = findColumnBySemantic(headers, 'n_traspaso') || 'N_TRASPASO';
  const skuCol = findColumnBySemantic(headers, 'sku') || 'SKU';
  const descCol = findColumnBySemantic(headers, 'descripcion') || 'DESCRIPCION';
  const cantCol = findColumnBySemantic(headers, 'cantidad') || 'CANTIDAD';
  const loteCol = findColumnBySemantic(headers, 'lote') || 'LOTE';

  useEffect(() => {
    if (item) {
      setTraspasoInput(String(item[traspasoCol] || '').trim());
      setError(null);
    }
  }, [item, traspasoCol]);

  if (!isOpen || !item) return null;

  const sku = item[skuCol] || '-';
  const desc = item[descCol] || 'Sin descripción';
  const cant = item[cantCol] || '-';
  const lote = item[loteCol] || '-';
  const cat = getEventCategory(item, headers);
  const catDef = EVENT_CATEGORIES[cat];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSave(item, traspasoInput.trim());
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar el número de traspaso');
    } finally {
      setIsSaving(false);
    }
  };

  const isMarkingAsCompleted = traspasoInput.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850/50">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isMarkingAsCompleted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}`}>
              {isMarkingAsCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Clock3 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Gestión de Traspaso / Resolución
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Anotar N° de traspaso entregado por su sistema informático
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:text-slate-200 p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Target Product Summary Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black text-slate-900 dark:text-slate-100 bg-slate-200/80 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                {sku}
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${catDef.badgeBg} ${catDef.badgeText} border`}>
                  {catDef.shortLabel}
                </span>
                {cant !== '-' && (
                  <span className="text-[10px] font-bold font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                    {cant} un.
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {desc}
            </p>
            {lote !== '-' && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lote: <span className="font-mono font-medium">{lote}</span>
              </p>
            )}
          </div>

          {/* Transfer Number Input Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>N° de Traspaso ({traspasoCol}):</span>
              </label>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isMarkingAsCompleted 
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' 
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
              }`}>
                {isMarkingAsCompleted ? '✅ Se marcará como REALIZADO' : '⏳ Quedará como PENDIENTE'}
              </span>
            </div>

            <input
              type="text"
              autoFocus
              value={traspasoInput}
              onChange={(e) => setTraspasoInput(e.target.value)}
              placeholder="Ej. TR-884920, TRAS-10294..."
              className="w-full bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 rounded-2xl px-4 py-3 text-base font-mono font-bold text-slate-900 dark:text-slate-100 outline-none transition-all shadow-sm"
            />
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              💡 <strong>Regla de Gestión:</strong> Cada vez que gestiona el producto en su sistema informático externo y registra aquí el número de traspaso, la incidencia queda registrada como <strong>Realizada</strong>. Si borra el número, volverá a figurar como <strong>Pendiente</strong>.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs flex items-center gap-2 transition-all shadow-sm ${
                isMarkingAsCompleted 
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 dark:shadow-none' 
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 dark:shadow-none'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isMarkingAsCompleted ? 'Guardar y Marcar como Realizado' : 'Guardar (Pendiente)'}</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
