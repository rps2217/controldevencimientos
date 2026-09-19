import React, { useState, useMemo, useRef } from 'react';
import { 
  InventoryCampaign, 
  StockCountSession,
  CampaignConsolidationMatrix,
  CampaignAuditRow
} from '../../types';
import { 
  computeCampaignConsolidationMatrix, 
  markSkuAsClosedInCampaign, 
  reopenSkuInCampaign,
  importPharmacySnapshotToCampaign,
  playBeep
} from '../../utils/stockCountUtils';
import { formatLocaleNumber } from '../../utils/pureCalculations';
import { 
  Search, 
  Cloud, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  PlusCircle, 
  Zap, 
  RefreshCw, 
  FileSpreadsheet, 
  Package, 
  Building2,
  Upload,
  Check,
  SlidersHorizontal
} from 'lucide-react';
import { read, utils } from 'xlsx';

interface MobileErpSnapshotViewProps {
  campaigns: InventoryCampaign[];
  activeCampaignId: string | null;
  sessions: StockCountSession[];
  onUpdateCampaigns: (campaigns: InventoryCampaign[]) => void;
  onSelectCampaign: (id: string) => void;
  onSwitchToTerminal: (sku?: string) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
  onSyncCloud: () => Promise<void>;
  isSyncingCloud: boolean;
  lastCloudSyncDate?: string;
  onOpenDesktopView?: () => void;
}

export const MobileErpSnapshotView: React.FC<MobileErpSnapshotViewProps> = ({
  campaigns,
  activeCampaignId,
  sessions,
  onUpdateCampaigns,
  onSelectCampaign,
  onSwitchToTerminal,
  showToast,
  onSyncCloud,
  isSyncingCloud,
  lastCloudSyncDate,
  onOpenDesktopView
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DISCREPANCIA' | 'NUNCA_PISTOLEADO' | 'VALIDADO_OK' | 'HALLAZGO'>('DISCREPANCIA');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active campaign
  const activeCampaign = useMemo(() => {
    return campaigns.find(c => c.id === activeCampaignId) || campaigns[0] || null;
  }, [campaigns, activeCampaignId]);

  // Computed matrix
  const matrix: CampaignConsolidationMatrix | null = useMemo(() => {
    if (!activeCampaign) return null;
    return computeCampaignConsolidationMatrix(activeCampaign, sessions);
  }, [activeCampaign, sessions]);

  // Snapshot details
  const snapshotCount = activeCampaign ? Object.keys(activeCampaign.snapshotTeoricoActual || {}).length : 0;
  const latestSnapshotMeta = activeCampaign?.historialSnapshots && activeCampaign.historialSnapshots.length > 0 
    ? activeCampaign.historialSnapshots[activeCampaign.historialSnapshots.length - 1] 
    : null;

  // Filtered rows for mobile
  const filteredRows = useMemo(() => {
    if (!matrix) return [];
    let list: CampaignAuditRow[] = [];
    if (statusFilter === 'ALL') {
      list = [...matrix.discrepancias, ...matrix.nuncaPistoleados, ...matrix.cuadrados, ...matrix.hallazgos];
    } else if (statusFilter === 'DISCREPANCIA') {
      list = matrix.discrepancias;
    } else if (statusFilter === 'NUNCA_PISTOLEADO') {
      list = matrix.nuncaPistoleados;
    } else if (statusFilter === 'VALIDADO_OK') {
      list = matrix.cuadrados;
    } else if (statusFilter === 'HALLAZGO') {
      list = matrix.hallazgos;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(r => 
        r.sku.toLowerCase().includes(q) || 
        r.descripcion.toLowerCase().includes(q) ||
        r.proveedor.toLowerCase().includes(q)
      );
    }

    return list;
  }, [matrix, statusFilter, searchTerm]);

  // Toggle validation status for a single SKU
  const handleToggleValidate = (row: CampaignAuditRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeCampaign) return;
    if (row.esCerrado) {
      const updated = reopenSkuInCampaign(activeCampaign, row.sku);
      const allUpdated = campaigns.map(c => c.id === updated.id ? updated : c);
      onUpdateCampaigns(allUpdated);
      playBeep('skip');
      showToast(`SKU ${row.sku} reabierto para revisión`, 'info');
    } else {
      const updated = markSkuAsClosedInCampaign(
        activeCampaign, 
        row.sku, 
        row.stockTeorico, 
        row.stockFisicoTotal, 
        'Validado en Móvil'
      );
      const allUpdated = campaigns.map(c => c.id === updated.id ? updated : c);
      onUpdateCampaigns(allUpdated);
      playBeep('success');
      showToast(`SKU ${row.sku} validado como cerrado`, 'success');
    }
  };

  // Upload file directly from mobile if needed
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCampaign) return;

    try {
      setIsUploading(true);
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      
      let parsedHeaders: string[] = [];
      let parsedRows: any[][] = [];

      try {
        const wb = read(uint8, { type: 'array', cellDates: true, dense: true });
        const firstSheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[firstSheetName];
        const jsonData: any[][] = utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

        if (jsonData.length >= 2) {
          parsedHeaders = jsonData[0].map(h => String(h || '').trim());
          parsedRows = jsonData.slice(1);
        }
      } catch (xlsxErr) {
        // Fallback para texto plano CSV / TSV si no es binario xlsx
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(uint8);
        const { parseDelimitedText } = await import('../../utils/universalImporter');
        const delimited = parseDelimitedText(text);
        if (delimited.headers.length > 0 && delimited.rows.length > 0) {
          parsedHeaders = delimited.headers;
          parsedRows = delimited.rows;
        } else {
          throw xlsxErr;
        }
      }

      if (parsedRows.length === 0 || parsedHeaders.length === 0) {
        showToast('El archivo no contiene filas de datos válidas', 'error');
        return;
      }

      const { updatedCampaign, totalImported, newSkus } = importPharmacySnapshotToCampaign(
        activeCampaign,
        parsedRows,
        parsedHeaders,
        file.name
      );

      const allUpdated = campaigns.map(c => c.id === updatedCampaign.id ? updatedCampaign : c);
      onUpdateCampaigns(allUpdated);
      playBeep('success');
      showToast(`Foto ERP cargada: ${totalImported} SKUs (${newSkus} nuevos)`, 'success');
      onSyncCloud();
    } catch (err: any) {
      showToast(`Error al leer archivo: ${err.message || err}`, 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 pb-20">
      
      {/* Top Mobile Bar: Campaign and Cloud Sync */}
      <div className="p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/80 shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                {activeCampaign?.nombre || 'Inventario Farmacia'}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {latestSnapshotMeta?.nombreArchivo 
                  ? `Foto ERP: ${latestSnapshotMeta.nombreArchivo}` 
                  : snapshotCount > 0 ? `Foto ERP activa (${snapshotCount} SKUs)` : 'Sin Foto ERP cargada'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onSyncCloud()}
              disabled={isSyncingCloud}
              className="px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSyncingCloud ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              )}
              <span>{isSyncingCloud ? 'Nube...' : 'Sincronizar'}</span>
            </button>
          </div>
        </div>

        {/* Cloud Sync Status & Last Updated Timestamp */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5">
          <span className="flex items-center gap-1 font-medium">
            <Cloud className="w-3 h-3 text-emerald-500" />
            {lastCloudSyncDate ? `Actualizado: ${lastCloudSyncDate}` : 'Conectado a Google Sheets'}
          </span>
          {onOpenDesktopView && (
            <button
              type="button"
              onClick={onOpenDesktopView}
              className="text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>Vista Completa</span>
              <SlidersHorizontal className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Snapshot Empty State Card */}
      {(!matrix || snapshotCount === 0) ? (
        <div className="flex-1 p-4 overflow-y-auto flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 border border-blue-100 dark:border-blue-900 shadow-sm">
            <FileSpreadsheet className="w-8 h-8" />
          </div>

          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
            Foto ERP no cargada en este móvil
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mb-4 leading-relaxed">
            Si cargaste el reporte de stock del ERP desde el computador de oficina, pulsa el botón a continuación para descargar la foto desde la nube.
          </p>

          <div className="flex flex-col gap-2.5 w-full max-w-xs">
            <button
              type="button"
              onClick={() => onSyncCloud()}
              disabled={isSyncingCloud}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSyncingCloud ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>Descargar Foto ERP desde la Nube</span>
            </button>

            <label className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer">
              <Upload className="w-4 h-4 text-slate-400" />
              <span>{isUploading ? 'Procesando...' : 'Subir Archivo Excel Local'}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </div>
        </div>
      ) : (
        /* Active ERP Snapshot Content */
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Quick Metrics Grid for Mobile (2x2) */}
          <div className="p-2.5 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700/80 grid grid-cols-2 gap-2 shrink-0">
            {/* Total ERP */}
            <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Teórico ERP</span>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                  {formatLocaleNumber(matrix.totalSkusTeoricos)} <span className="text-[10px] font-normal text-slate-400">SKUs</span>
                </span>
                <span className="text-[10px] font-bold text-slate-500 font-mono">
                  {formatLocaleNumber(matrix.totalTeoricoEsperado)} u.
                </span>
              </div>
            </div>

            {/* Físico Contado */}
            <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Físico Contado</span>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                  {formatLocaleNumber(matrix.totalFisicoContado)} <span className="text-[10px] font-normal text-slate-400">u.</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  {matrix.porcentajeCobertura.toFixed(0)}% cov
                </span>
              </div>
            </div>
          </div>

          {/* Filter Pills Horizontal Scroll */}
          <div className="px-2.5 py-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('DISCREPANCIA')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                statusFilter === 'DISCREPANCIA'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Diferencias ({matrix.discrepancias.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('NUNCA_PISTOLEADO')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                statusFilter === 'NUNCA_PISTOLEADO'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
              }`}
            >
              <XCircle className="w-3 h-3" />
              <span>Sin Pistolear ({matrix.nuncaPistoleados.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('VALIDADO_OK')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                statusFilter === 'VALIDADO_OK'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Cuadrados ({matrix.cuadrados.length})</span>
            </button>

            {matrix.hallazgos.length > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('HALLAZGO')}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                  statusFilter === 'HALLAZGO'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                }`}
              >
                <PlusCircle className="w-3 h-3" />
                <span>Hallazgos ({matrix.hallazgos.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>Todos ({matrix.totalSkusTeoricos})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="p-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por SKU o medicamento..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Items List for Mobile */}
          <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
            {filteredRows.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  No hay productos con el filtro actual
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Prueba cambiando el filtro o término de búsqueda.
                </p>
              </div>
            ) : (
              filteredRows.map((row) => {
                const diff = row.diferenciaNeta;
                const isOver = diff > 0;
                const isMissing = diff < 0;

                return (
                  <div
                    key={row.sku}
                    className={`p-3 rounded-xl border bg-white dark:bg-slate-800 transition-all shadow-xs ${
                      row.esCerrado
                        ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/20 dark:bg-emerald-950/10'
                        : isMissing
                        ? 'border-red-200 dark:border-red-800/60'
                        : isOver
                        ? 'border-blue-200 dark:border-blue-800/60'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {/* Header Row: SKU & Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-black text-slate-900 dark:text-slate-100">
                        {row.sku}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {row.esCerrado ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" /> Validado
                          </span>
                        ) : row.estadoGlobal === 'NUNCA_PISTOLEADO' ? (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] font-bold">
                            Sin Conteo
                          </span>
                        ) : row.estadoGlobal === 'HALLAZGO' ? (
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                            Hallazgo Extra
                          </span>
                        ) : isMissing ? (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] font-black">
                            Faltan {Math.abs(diff)}
                          </span>
                        ) : isOver ? (
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-black">
                            Sobran +{diff}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                            Cuadrado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Product Name */}
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug mb-2 line-clamp-2">
                      {row.descripcion}
                    </h4>

                    {/* 3-Column Comparison: Teórico ERP | Físico | Diferencia */}
                    <div className="grid grid-cols-3 gap-1 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-100 dark:border-slate-800 text-center mb-2">
                      <div>
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Teórico ERP</span>
                        <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                          {formatLocaleNumber(row.stockTeorico)}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Físico Cont.</span>
                        <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                          {formatLocaleNumber(row.stockFisicoTotal)}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Diferencia</span>
                        <span className={`text-xs font-black ${
                          diff === 0 
                            ? 'text-emerald-600' 
                            : diff > 0 
                            ? 'text-blue-600' 
                            : 'text-red-600'
                        }`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </div>
                    </div>

                    {/* Furniture Locations if counted */}
                    {row.sesionesDondeAparece && row.sesionesDondeAparece.length > 0 && (
                      <div className="mb-2 text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 flex-wrap">
                        <span className="font-bold text-slate-600 dark:text-slate-300">En muebles:</span>
                        {row.sesionesDondeAparece.map((s, idx) => (
                          <span key={idx} className="px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300 font-mono">
                            {s.nombreSesion} ({s.cantidad})
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action Bar: Pistolear & Validar */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => onSwitchToTerminal(row.sku)}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Pistolear en Mueble</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleToggleValidate(row, e)}
                        className={`py-1.5 px-3 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer ${
                          row.esCerrado
                            ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{row.esCerrado ? 'Reabrir' : 'Validar'}</span>
                      </button>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

    </div>
  );
};
