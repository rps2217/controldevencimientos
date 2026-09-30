import React, { useState, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  FileSpreadsheet, 
  Clipboard, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Loader2, 
  ArrowRight,
  Database,
  Building2,
  PackageCheck
} from 'lucide-react';
import { InventoryCampaign, StockCountSession } from '../../types';
import { 
  importPharmacySnapshotToCampaign, 
  createNewCampaign, 
  saveCampaignsToStorage 
} from '../../utils/campaignUtils';
import { detectDelimiter, parseDelimitedText, parseExcelBuffer } from '../../utils/universalImporter';
import { playBeep } from '../../utils/stockCountUtils';
import { formatLocaleNumber, getErrorMessage } from '../../utils/pureCalculations';

interface ErpSnapshotUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaigns: InventoryCampaign[];
  activeCampaignId: string | null;
  sessions: StockCountSession[];
  onUpdateCampaigns: (campaigns: InventoryCampaign[]) => void;
  onSelectCampaign: (id: string) => void;
  onAutoSyncCloud: (campaigns: InventoryCampaign[], activeId: string | null) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
}

export const ErpSnapshotUploadModal: React.FC<ErpSnapshotUploadModalProps> = ({
  isOpen,
  onClose,
  campaigns,
  activeCampaignId,
  sessions,
  onUpdateCampaigns,
  onSelectCampaign,
  onAutoSyncCloud,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'FILE' | 'PASTE'>('FILE');
  const [pastedText, setPastedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetCampaignMode, setTargetCampaignMode] = useState<'CURRENT' | 'NEW'>('CURRENT');
  const [newCampaignName, setNewCampaignName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const activeCampaign = campaigns.find(c => c.id === activeCampaignId) || campaigns[0] || null;
  const currentSnapshotCount = activeCampaign ? Object.keys(activeCampaign.snapshotTeoricoActual || {}).length : 0;

  const processRowsAndHeaders = async (headers: string[], rows: any[], sourceName: string) => {
    setIsProcessing(true);
    try {
      let targetCampaign = activeCampaign;

      if (targetCampaignMode === 'NEW' || !targetCampaign) {
        const campName = newCampaignName.trim() || `Inventario ${new Date().toLocaleDateString('es-CL')}`;
        targetCampaign = createNewCampaign(campName);
        const updatedCampaigns = [targetCampaign, ...campaigns];
        onUpdateCampaigns(updatedCampaigns);
        onSelectCampaign(targetCampaign.id);
      }

      const { updatedCampaign, totalImported, newSkus, updatedSkus } = importPharmacySnapshotToCampaign(
        targetCampaign,
        rows,
        headers,
        sourceName
      );

      const allUpdated = campaigns.map(c => c.id === updatedCampaign.id ? updatedCampaign : c);
      if (!campaigns.some(c => c.id === updatedCampaign.id)) {
        allUpdated.unshift(updatedCampaign);
      }

      onUpdateCampaigns(allUpdated);
      onSelectCampaign(updatedCampaign.id);
      saveCampaignsToStorage(allUpdated);
      
      await onAutoSyncCloud(allUpdated, updatedCampaign.id);

      playBeep('success');
      showToast(
        `¡Foto ERP cargada con éxito! ${totalImported} SKUs procesados (${newSkus} nuevos, ${updatedSkus} actualizados) y sincronizados con terminales móviles.`,
        'success',
        'Inventario Teórico Actualizado'
      );
      setPastedText('');
      onClose();
    } catch (err: unknown) {
      playBeep('error');
      showToast(`Error al procesar archivo ERP: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const fileNameLower = file.name.toLowerCase();
      const isExcel = fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls');

      let parsedHeaders: string[] = [];
      let parsedRows: any[] = [];

      if (isExcel) {
        const buffer = await file.arrayBuffer();
        const res = await parseExcelBuffer(buffer);
        parsedHeaders = res.headers;
        parsedRows = res.rows;
      } else {
        const text = await file.text();
        const delimiter = detectDelimiter(text);
        const res = parseDelimitedText(text, delimiter);
        parsedHeaders = res.headers;
        parsedRows = res.rows;
      }

      if (parsedRows.length === 0) {
        showToast('El archivo no contiene filas válidas o está vacío.', 'error');
        return;
      }

      await processRowsAndHeaders(parsedHeaders, parsedRows, file.name);
    } catch (e: unknown) {
      showToast(`No se pudo leer el archivo: ${getErrorMessage(e)}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) {
      showToast('Pega los datos del reporte de stock del ERP primero.', 'warning');
      return;
    }
    const delimiter = detectDelimiter(pastedText);
    const { headers, rows } = parseDelimitedText(pastedText, delimiter);
    if (rows.length === 0) {
      showToast('No se detectaron filas tabulares válidas en el texto pegado.', 'error');
      return;
    }
    await processRowsAndHeaders(headers, rows, `Pegado_${new Date().toLocaleDateString('es-CL')}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-md shadow-blue-500/20">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Cargar Archivo ERP / Foto de Stock
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-extrabold border border-blue-200 dark:border-blue-800">
                  Paso 0
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Alimenta el stock teórico para comparar con los conteos físicos de cada mueble.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Campaign Target Info */}
        <div className="px-5 py-3 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-slate-700 dark:text-slate-300">
              Campaña destino: <strong className="text-blue-700 dark:text-blue-300">{activeCampaign?.nombre || 'Nueva Campaña'}</strong>
            </span>
            {currentSnapshotCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                {formatLocaleNumber(currentSnapshotCount)} SKUs cargados actualmente
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <input
                type="radio"
                name="campaignMode"
                checked={targetCampaignMode === 'CURRENT'}
                onChange={() => setTargetCampaignMode('CURRENT')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>Actualizar actual</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <input
                type="radio"
                name="campaignMode"
                checked={targetCampaignMode === 'NEW'}
                onChange={() => setTargetCampaignMode('NEW')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>Crear nueva campaña</span>
            </label>
          </div>
        </div>

        {targetCampaignMode === 'NEW' && (
          <div className="px-5 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/40">
            <input
              type="text"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              placeholder="Nombre de la nueva campaña (Ej: Inventario General Octubre 2026)"
              className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 outline-none"
            />
          </div>
        )}

        {/* Tabs: Upload File vs Paste Text */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('FILE')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'FILE'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Archivo Excel / CSV (.xlsx, .csv)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PASTE')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'PASTE'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Clipboard className="w-4 h-4" />
            <span>Copiar y Pegar desde Excel / POS</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto">
          {activeTab === 'FILE' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 scale-[0.99]'
                  : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-slate-50/50 dark:bg-slate-800/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 shadow-inner">
                {isProcessing ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-8 h-8" />
                )}
              </div>

              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                {isProcessing ? 'Procesando archivo ERP...' : 'Arrastra tu archivo Excel / CSV aquí'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
                Soporta planillas de exportación de ERP / POS con columnas de SKU, Descripción, Stock, Proveedor o Laboratorio.
              </p>

              <button
                type="button"
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Explorar Archivos (.xlsx, .csv)</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Pega aquí las filas copiadas desde tu hoja de cálculo o software de farmacia:
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={8}
                placeholder="SKU	DESCRIPCION	PROVEEDOR	STOCK&#10;780001	PARACETAMOL 500MG	LAB CHILE	120&#10;780002	IBUPROFENO 400MG	BAGO	85..."
                className="w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-mono text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePasteSubmit}
                  disabled={isProcessing || !pastedText.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Procesar Texto Pegado</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Guidance Pill */}
          <div className="mt-4 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-800 dark:text-slate-100">Detección Semántica Inteligente:</strong>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                El sistema detecta automáticamente columnas como <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">SKU</code>, <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">Descripción</code>, <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">Proveedor</code> y <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">Stock Teórico</code> sin importar el orden o nombres de encabezados.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Las terminales móviles recibirán el snapshot automáticamente vía Nube.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
