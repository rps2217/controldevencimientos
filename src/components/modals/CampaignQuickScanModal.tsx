import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Scan, 
  X, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  Package, 
  ShoppingCart, 
  Layers, 
  Zap, 
  Volume2, 
  VolumeX,
  Plus,
  Minus
} from 'lucide-react';
import { CampaignAuditRow, CampaignConsolidationMatrix, StockCountSession } from '../../types';
import { playBeep } from '../../utils/stockCountUtils';
import { formatLocaleNumber } from '../../utils/pureCalculations';
import { MobileCameraBarcodeScanner } from '../views/MobileCameraBarcodeScanner';

interface CampaignQuickScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  matrix: CampaignConsolidationMatrix | null;
  sessions: StockCountSession[];
  masterProducts?: any[];
  onMarkSkuClosed: (sku: string) => void;
  onReopenSku: (sku: string) => void;
  onAdjustSales?: (sku: string, salesQty: number) => void;
  onSwitchToCounting: (sku: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
}

export const CampaignQuickScanModal: React.FC<CampaignQuickScanModalProps> = ({
  isOpen,
  onClose,
  matrix,
  sessions,
  masterProducts = [],
  onMarkSkuClosed,
  onReopenSku,
  onAdjustSales,
  onSwitchToCounting,
  showToast
}) => {
  const [inputCode, setInputCode] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeScannedCode, setActiveScannedCode] = useState<string | null>(null);
  const [matchedItem, setMatchedItem] = useState<CampaignAuditRow | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when modal opens or camera closes
  useEffect(() => {
    if (isOpen && !isCameraOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, isCameraOpen]);

  // Flatten rows from matrix for rapid lookup
  const allMatrixRows = useMemo<CampaignAuditRow[]>(() => {
    if (!matrix) return [];
    return [
      ...matrix.cuadrados,
      ...matrix.discrepancias,
      ...matrix.nuncaPistoleados,
      ...matrix.hallazgos
    ];
  }, [matrix]);

  // Lookup scanned code in campaign matrix
  const handleProcessScan = (codeToSearch: string) => {
    const clean = codeToSearch.trim();
    if (!clean || !matrix) return;

    setActiveScannedCode(clean);

    // 1. Direct SKU match in matrix
    let found = allMatrixRows.find(it => it.sku.toLowerCase() === clean.toLowerCase());

    // 2. Barcode match in master catalog if not found directly
    if (!found && masterProducts.length > 0) {
      const masterMatch = masterProducts.find((p: any) => {
        const pBarcode = String(p.barcode || p.BARCODE || p.codigo_barra || p.EAN || '').trim();
        const pSku = String(p.sku || p.SKU || '').trim();
        return pBarcode === clean || pSku === clean;
      });
      if (masterMatch) {
        const resolvedSku = String(masterMatch.sku || masterMatch.SKU || '').trim();
        found = allMatrixRows.find(it => it.sku.toLowerCase() === resolvedSku.toLowerCase());
      }
    }

    if (found) {
      setMatchedItem(found);
      if (soundEnabled) {
        if (found.estadoGlobal === 'VALIDADO_OK') {
          playBeep('success');
        } else {
          playBeep('skip');
        }
      }
    } else {
      setMatchedItem(null);
      if (soundEnabled) playBeep('error');
      showToast(`Código ${clean} no encontrado en la foto del ERP`, 'warning', 'No Catalogado');
    }

    // Keep input selected for next scan
    setInputCode('');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleProcessScan(inputCode);
  };

  const handleCameraScan = (code: string) => {
    setIsCameraOpen(false);
    handleProcessScan(code);
  };

  const handleToggleClosed = () => {
    if (!matchedItem) return;
    if (matchedItem.esCerrado || matchedItem.estadoGlobal === 'VALIDADO_OK') {
      onReopenSku(matchedItem.sku);
      if (soundEnabled) playBeep('skip');
      showToast(`SKU ${matchedItem.sku} reabierto para revisión`, 'info');
      // Update local state copy
      setMatchedItem({ ...matchedItem, esCerrado: false, estadoGlobal: 'DISCREPANCIA' });
    } else {
      onMarkSkuClosed(matchedItem.sku);
      if (soundEnabled) playBeep('success');
      showToast(`SKU ${matchedItem.sku} validado como CONFORME`, 'success');
      // Update local state copy
      setMatchedItem({ ...matchedItem, esCerrado: true, estadoGlobal: 'VALIDADO_OK' });
    }
  };

  const handleApplySalesAdjustment = (delta: number) => {
    if (!matchedItem || !onAdjustSales) return;
    const currentSales = matchedItem.ajusteManualVenta || 0;
    const newSales = Math.max(0, currentSales + delta);
    onAdjustSales(matchedItem.sku, newSales);
    if (soundEnabled) playBeep('skip');
    showToast(`Ventas en caja ajustadas: ${newSales} unids`, 'info');
    const newEfectivo = Math.max(0, matchedItem.stockTeorico - newSales);
    setMatchedItem({
      ...matchedItem,
      ajusteManualVenta: newSales,
      stockTeoricoEfectivo: newEfectivo,
      diferenciaNeta: matchedItem.stockFisicoTotal - newEfectivo
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* TOP BAR */}
        <div className="px-4 py-3.5 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Scan className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white truncate">
                  Pistola Verificadora de Campaña
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {matrix?.nombreCampana || 'Auditoría Farmacia'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                soundEnabled 
                  ? 'bg-slate-800 text-purple-400 hover:bg-slate-700' 
                  : 'bg-slate-800/60 text-slate-500 hover:bg-slate-800'
              }`}
              title={soundEnabled ? 'Sonidos activados' : 'Sonidos silenciados'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SCANNER INPUT ROW */}
        <div className="p-4 bg-slate-800/40 border-b border-slate-800 shrink-0">
          <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Pistolea código o SKU..."
                className="w-full pl-3.5 pr-8 py-3 bg-slate-950 border-2 border-slate-700 focus:border-purple-500 rounded-2xl text-white font-mono text-base font-bold outline-none placeholder:text-slate-600 transition-all shadow-inner"
                autoComplete="off"
              />
              {inputCode && (
                <button
                  type="button"
                  onClick={() => setInputCode('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Camera Trigger */}
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-purple-950/50 transition-all cursor-pointer shrink-0 active:scale-95"
              title="Escanear con cámara"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Cámara</span>
            </button>
          </form>

          {/* Camera Scanner View */}
          <MobileCameraBarcodeScanner
            isOpen={isCameraOpen}
            onClose={() => setIsCameraOpen(false)}
            onScan={handleCameraScan}
            sessionName={matrix?.nombreCampana || 'Auditoría Farmacia'}
          />
        </div>

        {/* RESULTS CARD / BODY */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {matchedItem ? (
            <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150">
              
              {/* Product Header */}
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-mono font-bold text-purple-400">
                      SKU: {matchedItem.sku}
                    </span>
                    <h4 className="text-sm font-bold text-white leading-snug mt-0.5">
                      {matchedItem.descripcion}
                    </h4>
                    {matchedItem.proveedor && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        Proveedor: {matchedItem.proveedor}
                      </p>
                    )}
                  </div>

                  {/* Status Semaphore Badge */}
                  <div className="shrink-0">
                    {matchedItem.estadoGlobal === 'VALIDADO_OK' && (
                      <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black flex items-center gap-1.5 shadow-xs">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>VALIDADO OK</span>
                      </span>
                    )}
                    {matchedItem.estadoGlobal === 'DISCREPANCIA' && (
                      <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black flex items-center gap-1.5 shadow-xs">
                        <AlertTriangle className="w-4 h-4" />
                        <span>DISCREPANCIA</span>
                      </span>
                    )}
                    {matchedItem.estadoGlobal === 'NUNCA_PISTOLEADO' && (
                      <span className="px-3 py-1 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-black flex items-center gap-1.5 shadow-xs">
                        <AlertTriangle className="w-4 h-4" />
                        <span>NUNCA PISTOLEADO</span>
                      </span>
                    )}
                    {matchedItem.estadoGlobal === 'HALLAZGO' && (
                      <span className="px-3 py-1 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-black flex items-center gap-1.5 shadow-xs">
                        <Package className="w-4 h-4" />
                        <span>HALLAZGO FÍSICO</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    ERP Teórico
                  </span>
                  <span className="text-base font-black text-slate-200 mt-0.5 block font-mono">
                    {formatLocaleNumber(matchedItem.stockTeorico)}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Físico Contado
                  </span>
                  <span className="text-base font-black text-indigo-400 mt-0.5 block font-mono">
                    {formatLocaleNumber(matchedItem.stockFisicoTotal)}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Ventas Caja
                  </span>
                  <span className="text-base font-black text-purple-400 mt-0.5 block font-mono">
                    {formatLocaleNumber(matchedItem.ajusteManualVenta || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl border text-center ${
                  matchedItem.diferenciaNeta === 0
                    ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-400'
                    : matchedItem.diferenciaNeta > 0
                    ? 'bg-blue-950/30 border-blue-800/60 text-blue-400'
                    : 'bg-rose-950/30 border-rose-800/60 text-rose-400'
                }`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider block opacity-80">
                    Diferencia
                  </span>
                  <span className="text-base font-black mt-0.5 block font-mono">
                    {matchedItem.diferenciaNeta > 0 ? `+${matchedItem.diferenciaNeta}` : matchedItem.diferenciaNeta}
                  </span>
                </div>
              </div>

              {/* Breakdown per Furniture / Sessions */}
              <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/60">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-2">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>Ubicaciones & Muebles donde fue Pistoleado:</span>
                </span>

                {matchedItem.sesionesDondeAparece.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-1">
                    Cero lecturas registradas. Aún no se ha pistoleado en ningún mueble.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {matchedItem.sesionesDondeAparece.map((sInfo, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                        <span className="font-bold text-slate-300 truncate pr-2">
                          {sInfo.nombreSesion} {sInfo.ubicacion ? `(${sInfo.ubicacion})` : ''}
                        </span>
                        <span className="font-mono font-black text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded-md shrink-0">
                          {sInfo.cantidad} unids
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Action Controls */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  {/* Validate / Reopen Button */}
                  <button
                    type="button"
                    onClick={handleToggleClosed}
                    className={`w-full py-3 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      matchedItem.esCerrado || matchedItem.estadoGlobal === 'VALIDADO_OK'
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {matchedItem.esCerrado || matchedItem.estadoGlobal === 'VALIDADO_OK'
                        ? 'Reabrir Revisión'
                        : 'Validar Conforme'}
                    </span>
                  </button>

                  {/* Jump to counting session */}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSwitchToCounting(matchedItem.sku);
                    }}
                    className="w-full py-3 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-950/50 transition-all cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Pistolear en Mueble</span>
                  </button>
                </div>

                {/* Quick Sales Adjustment */}
                {onAdjustSales && (
                  <div className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-bold flex items-center gap-1.5">
                      <ShoppingCart className="w-3.5 h-3.5 text-purple-400" />
                      <span>Venta en Caja:</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleApplySalesAdjustment(-1)}
                        className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center cursor-pointer"
                        title="Restar 1 venta"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2 font-mono font-bold text-white">
                        {matchedItem.ajusteManualVenta || 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApplySalesAdjustment(1)}
                        className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center cursor-pointer"
                        title="Sumar 1 venta"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* Empty Prompt Screen */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
              <div className="w-16 h-16 rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mb-3 text-purple-400">
                <Scan className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-300">
                Apunta y Pistolea con Láser o Cámara
              </h4>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Escanea cualquier producto en la estantería de la farmacia para consultar inmediatamente si está cuadrado, con faltante o sin pistolear.
              </p>
            </div>
          )}
        </div>

        {/* BOTTOM HELPER BAR */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>Presiona Enter o pistolea para buscar</span>
          {activeScannedCode && (
            <span className="font-mono text-purple-400 truncate max-w-[200px]">
              Último: {activeScannedCode}
            </span>
          )}
        </div>

      </div>
    </div>
  );
};
