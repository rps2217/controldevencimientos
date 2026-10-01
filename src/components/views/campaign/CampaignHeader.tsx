import React from 'react';
import { InventoryCampaign, StockCountSession } from '../../../types';
import { Store, Plus, FileSpreadsheet, UploadCloud, Layers } from 'lucide-react';

interface CampaignHeaderProps {
  campaigns: InventoryCampaign[];
  activeCampaignId: string | null;
  activeCampaign?: InventoryCampaign | null;
  sessions?: StockCountSession[];
  activeTab: 'MATRIX' | 'SNAPSHOT_UPLOAD';
  setActiveTab: (tab: 'MATRIX' | 'SNAPSHOT_UPLOAD') => void;
  onSelectCampaign: (id: string) => void;
  onOpenNewCampaignModal: () => void;
  onOpenUploadErpModal: () => void;
  onOpenQuickScanModal?: () => void;
  onOpenBulkSalesModal?: () => void;
  isSyncingCloud?: boolean;
  lastCloudSyncDate?: string | null;
  onSyncCloud?: () => Promise<void>;
  isSavingToAuditSheet: boolean;
  onSaveToAuditSheet: () => Promise<void>;
  onExportExcel: () => void;
  onExportRecountSheet?: () => void;
}

export const CampaignHeader: React.FC<CampaignHeaderProps> = ({
  campaigns,
  activeCampaignId,
  activeTab,
  setActiveTab,
  onSelectCampaign,
  onOpenNewCampaignModal,
  onOpenUploadErpModal,
  isSavingToAuditSheet,
  onSaveToAuditSheet,
  onExportExcel,
}) => {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 p-4 space-y-3 shrink-0">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-600 text-white rounded-2xl shadow-md shadow-purple-500/20 shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base">
                Consolidación General de Campaña
              </h3>
              <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800 font-mono">
                Tienda Completa
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cruza física de muebles vs foto teórica ERP (Suma Muebles - Ventas = Teórico Esperado)
            </p>
          </div>
        </div>

        {/* Campaign Switcher & New Campaign */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <span className="text-xs font-bold text-slate-400">Campaña:</span>
            <select
              value={activeCampaignId || ''}
              onChange={(e) => onSelectCampaign(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
            >
              {campaigns.map(c => (
                <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                  {c.nombre} ({c.local})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenNewCampaignModal}
            className="p-2 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-purple-700 dark:text-purple-300 rounded-xl border border-purple-200 dark:border-purple-800 transition-colors cursor-pointer"
            title="Crear nueva campaña de inventario general"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Pills & Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-slate-200/80 dark:border-slate-700/60">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('MATRIX')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'MATRIX' 
                ? 'bg-purple-600 text-white shadow-xs font-black' 
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Matriz de Consolidación</span>
          </button>

          <button
            type="button"
            onClick={onOpenUploadErpModal}
            className="px-3.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
            <span>Cargar Foto ERP</span>
          </button>
        </div>

        {/* Global Campaign Export Actions */}
        <div className="flex items-center gap-2 shrink-0 justify-end">
          <button
            type="button"
            onClick={onExportExcel}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel Matriz</span>
          </button>

          <button
            type="button"
            onClick={onSaveToAuditSheet}
            disabled={isSavingToAuditSheet}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Guardar en Hoja Auditoría</span>
          </button>
        </div>
      </div>
    </div>
  );
};
