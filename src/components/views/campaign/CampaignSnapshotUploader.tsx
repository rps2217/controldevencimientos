import React, { useState } from 'react';
import { InventoryCampaign } from '../../../types';
import { detectDelimiter, parseDelimitedText } from '../../../utils/universalImporter';
import { importPharmacySnapshotToCampaign } from '../../../utils/campaignUtils';
import { FileSpreadsheet, Sparkles, UploadCloud } from 'lucide-react';
import { formatLocaleNumber } from '../../../utils/pureCalculations';

interface CampaignSnapshotUploaderProps {
  activeCampaign: InventoryCampaign | null;
  campaigns: InventoryCampaign[];
  onUpdateCampaigns: (camps: InventoryCampaign[]) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  onDone: () => void;
}

export const CampaignSnapshotUploader: React.FC<CampaignSnapshotUploaderProps> = ({
  activeCampaign,
  campaigns,
  onUpdateCampaigns,
  showToast,
  onDone
}) => {
  const [pastedText, setPastedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcessSnapshot = () => {
    if (!activeCampaign) {
      showToast('Selecciona una campaña de inventario activa primero', 'warning');
      return;
    }
    if (!pastedText.trim()) {
      showToast('Pega los datos exportados de tu sistema ERP primero', 'warning');
      return;
    }

    try {
      setIsProcessing(true);
      const delimiter = detectDelimiter(pastedText);
      const { headers, rows } = parseDelimitedText(pastedText, delimiter);

      if (rows.length === 0) {
        showToast('No se encontraron filas con datos en el texto ingresado', 'error');
        setIsProcessing(false);
        return;
      }

      const { updatedCampaign, totalImported } = importPharmacySnapshotToCampaign(
        activeCampaign,
        rows,
        headers,
        'Snapshot_ERP'
      );

      const allUpdated = campaigns.map(c => c.id === updatedCampaign.id ? updatedCampaign : c);
      onUpdateCampaigns(allUpdated);

      showToast(`¡Se importaron ${formatLocaleNumber(totalImported)} SKUs del sistema ERP!`, 'success');
      setPastedText('');
      onDone();
    } catch (err) {
      console.error(err);
      showToast('Error al procesar la foto del ERP', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl my-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-2xl">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-extrabold text-base text-slate-800 dark:text-slate-100">
            Cargar Foto / Stock Teórico del ERP
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pega directamente desde Excel o CSV las columnas SKU, Descripción y Stock Teórico del sistema.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <textarea
          rows={10}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Copia las filas desde Excel (SKU, Descripción, Cantidad...) y pégalas aquí directamente..."
          className="w-full p-4 font-mono text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-all resize-none"
        />
        <p className="text-[11px] text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          <span>El sistema mapea automáticamente las columnas semánticas (SKU, Cantidad / Stock ERP, Descripción, Proveedor).</span>
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleProcessSnapshot}
          disabled={isProcessing || !pastedText.trim()}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-200 dark:shadow-none transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <UploadCloud className="w-4 h-4" />
          <span>{isProcessing ? 'Procesando...' : 'Procesar e Importar al Sistema'}</span>
        </button>
      </div>
    </div>
  );
};
