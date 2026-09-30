import React from 'react';
import { StockCountSession } from '../../../types';
import { CheckCircle2, FileSpreadsheet, UploadCloud, Copy, Share2, Lock, Unlock } from 'lucide-react';

interface StockCountSessionToolbarProps {
  currentSession: StockCountSession;
  isSyncingToSheet: boolean;
  onSyncToVencimientos: () => Promise<void>;
  onSyncToAuditSheet: () => Promise<void>;
  onExportExcel: () => void;
  onCopySummary: () => void;
  onShareWhatsApp: () => void;
}

export const StockCountSessionToolbar: React.FC<StockCountSessionToolbarProps> = ({
  currentSession,
  isSyncingToSheet,
  onSyncToVencimientos,
  onSyncToAuditSheet,
  onExportExcel,
  onCopySummary,
  onShareWhatsApp
}) => {
  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Guardar en Auditoría (General) */}
        <button
          type="button"
          onClick={onSyncToAuditSheet}
          disabled={isSyncingToSheet || currentSession.conteos.length === 0}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          title="Guarda el conteo de esta sección en la pestaña _AUDITORIA_INVENTARIO de Google Sheets"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Guardar en Auditoría</span>
        </button>

        {/* Sincronizar a Vencimientos (Solo si hay fechas) */}
        <button
          type="button"
          onClick={onSyncToVencimientos}
          disabled={isSyncingToSheet || currentSession.conteos.length === 0}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          title="Sincroniza los registros con la pestaña VENCIMIENTOS"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Sincronizar a Vencimientos</span>
        </button>

        {/* Exportar Excel */}
        <button
          type="button"
          onClick={onExportExcel}
          disabled={currentSession.conteos.length === 0}
          className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>Excel</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCopySummary}
          disabled={currentSession.conteos.length === 0}
          className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
          title="Copiar resumen ejecutivo al portapapeles"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>Copiar Resumen</span>
        </button>

        <button
          type="button"
          onClick={onShareWhatsApp}
          disabled={currentSession.conteos.length === 0}
          className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
          title="Enviar resumen de cuadratura por WhatsApp"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>WhatsApp</span>
        </button>
      </div>
    </div>
  );
};
