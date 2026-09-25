import React, { useState } from 'react';
import { Camera, X, Scan, AlertCircle } from 'lucide-react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [manualCode, setManualCode] = useState('');
  const elementId = 'reader-container';

  // Un solo disparo: al leer, el hook detiene la cámara y aquí se cierra el modal.
  const { status, error } = useBarcodeScanner({
    elementId,
    active: isOpen,
    stopOnScan: true,
    qrbox: { width: 280, height: 180 },
    onScan: (code) => {
      onScanSuccess(code);
      onClose();
    },
  });

  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = manualCode.trim();
    if (clean) {
      onScanSuccess(clean);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-slate-100">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Escáner de Código de Barras / SKU</h3>
              <p className="text-xs text-slate-500">Apunta con la cámara al código del producto</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center">
          <div className="w-full aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden relative shadow-inner flex items-center justify-center">
            <div id={elementId} className="w-full h-full" />
            {status !== 'RUNNING' && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 bg-slate-900">
                <Camera className="w-8 h-8 animate-pulse text-blue-400" />
                <span className="text-xs font-medium">Iniciando cámara...</span>
              </div>
            )}
            {/* Viewfinder Overlay Box */}
            <div className="absolute inset-x-12 inset-y-16 border-2 border-blue-500/60 rounded-xl pointer-events-none flex items-center justify-center">
              <div className="w-full h-0.5 bg-red-500/80 animate-bounce absolute" />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800 w-full">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Manual Input Form fallback */}
          <form onSubmit={handleManualSubmit} className="mt-4 w-full flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Escribir SKU o pistolear aquí..."
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
            >
              Buscar SKU
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-3">
            Al detectar o ingresar el código de barras o EAN, se filtrará automáticamente en el inventario.
          </p>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors shadow-sm"
          >
            Cerrar Escáner
          </button>
        </div>
      </div>
    </div>
  );
};
