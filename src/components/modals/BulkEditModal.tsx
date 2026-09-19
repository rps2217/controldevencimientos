import React, { useState } from 'react';
import { X, CheckCircle2, Edit2, Layers } from 'lucide-react';

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onApply: (values: { frc_n: string; n_traspaso: string; tipo_evento: string; frc_bod: string }) => Promise<void>;
}

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  onApply,
}) => {
  const [frc_n, setFrcN] = useState('');
  const [n_traspaso, setNTraspaso] = useState('');
  const [tipo_evento, setTipoEvento] = useState('');
  const [frc_bod, setFrcBod] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await onApply({ frc_n, n_traspaso, tipo_evento, frc_bod });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Edición Masiva FRC & Incidencias</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Actualizando <span className="font-bold text-blue-600 dark:text-blue-400">{selectedCount} registros</span> seleccionados
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div className="bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 p-3.5 rounded-2xl">
            <p className="text-xs text-blue-800 dark:text-blue-300 font-medium">
              Nota: Deja en blanco cualquier campo que no desees modificar. Solo se aplicarán los valores ingresados a las filas seleccionadas.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              FRC_N (Número / Folio FRC)
            </label>
            <input
              type="text"
              value={frc_n}
              onChange={(e) => setFrcN(e.target.value)}
              placeholder="Ej. FRC-2026-001 (dejar en blanco para no cambiar)"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              N_TRASPASO (Número de Traspaso)
            </label>
            <input
              type="text"
              value={n_traspaso}
              onChange={(e) => setNTraspaso(e.target.value)}
              placeholder="Ej. TR-99823 (dejar en blanco para no cambiar)"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              FRC_EVEN (Tipo de Evento / Incidencia)
            </label>
            <select
              value={tipo_evento}
              onChange={(e) => setTipoEvento(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500"
            >
              <option value="">-- No modificar / Mantener actual --</option>
              <option value="VENC. CERC.">VENC. CERC. (Vencimiento cercano)</option>
              <option value="DET. PED">DET. PED (Deterioro de pedido)</option>
              <option value="CAL. INTER">CAL. INTER (Calidad interna)</option>
              <option value="CAL. EXT.">CAL. EXT. (Calidad externa)</option>
              <option value="CANJES">CANJES (Canjes)</option>
              <option value="DIF. PED">DIF. PED (Diferencia de pedido)</option>
              <option value="VENCIMIENTO">VENCIMIENTO (Vencimiento regular)</option>
              <option value="AVERIA">AVERIA (Avería / Merma)</option>
              <option value="DEVOLUCION">DEVOLUCION (Reclamo / Devolución)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              FRC_BOD (Bodega / FRC Bodega)
            </label>
            <input
              type="text"
              value={frc_bod}
              onChange={(e) => setFrcBod(e.target.value)}
              placeholder="Ej. Bodega Central / B-01 (dejar en blanco para no cambiar)"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50 transition-all"
            >
              <Edit2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Aplicando...' : `Aplicar a ${selectedCount} filas`}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
