import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Bluetooth, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Battery, 
  RefreshCw, 
  Sparkles, 
  Info, 
  Smartphone, 
  Sliders,
  Check,
  Play,
  Barcode,
  Tag
} from 'lucide-react';
import { useBluetoothPrinter } from '../../hooks/useBluetoothPrinter';
import { ROLLOS, findRoll, evaluateFit, fitQuality, FIT_QUALITY_LABEL } from '../../utils/labelMediaProfile';
import { InventoryItem } from '../../types';
import { bluetoothPrinterService, MarklifeLabelOptions } from '../../services/bluetoothPrinterService';

interface BluetoothPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemsToPrint?: InventoryItem[];
}

export const BluetoothPrinterModal: React.FC<BluetoothPrinterModalProps> = ({
  isOpen,
  onClose,
  itemsToPrint = [],
}) => {
  const {
    isSupported,
    isConnected,
    isConnecting,
    isPrinting,
    deviceName,
    batteryLevel,
    error,
    selectedRollId,
    setSelectedRollId,
    connect,
    disconnect,
    printTest,
    printBatch,
  } = useBluetoothPrinter();

  const [barcodeOnly, setBarcodeOnly] = useState<boolean>(true);
  const [showSkuText, setShowSkuText] = useState<boolean>(true);
  const [printSuccessMsg, setPrintSuccessMsg] = useState<string | null>(null);
  const [printProgress, setPrintProgress] = useState<{ current: number; total: number } | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeRoll = useMemo(() => findRoll(selectedRollId) || ROLLOS[2], [selectedRollId]);

  const marklifeOptions: MarklifeLabelOptions = useMemo(() => ({
    barcodeOnly,
    showSkuText,
  }), [barcodeOnly, showSkuText]);

  const sampleSku = itemsToPrint.length > 0
    ? String(itemsToPrint[0]['sku'] || itemsToPrint[0]['SKU'] || itemsToPrint[0]['codigo'] || '780123456789')
    : '780123456789';

  const calidadRollo = useMemo(() => {
    return fitQuality(evaluateFit(sampleSku, activeRoll));
  }, [sampleSku, activeRoll]);

  // Actualizar previsualización interactiva de la etiqueta en el modal
  useEffect(() => {
    if (!isOpen) return;

    const sampleItem = itemsToPrint.length > 0 ? {
      sku: sampleSku,
      descripcion: String(itemsToPrint[0]['descripcion'] || itemsToPrint[0]['DESCRIPCION'] || 'PRODUCTO DE MUESTRA'),
      fechaVc: String(itemsToPrint[0]['fecha_vc'] || itemsToPrint[0]['FECHA_VC'] || '31/12/2026'),
      lote: String(itemsToPrint[0]['lote'] || itemsToPrint[0]['LOTE'] || 'L-9988'),
      cantidad: itemsToPrint[0]['cantidad'] || itemsToPrint[0]['CANTIDAD'] || '1 UN',
    } : {
      sku: '780123456789',
      descripcion: 'TEST MARKLIFE P15 TÉRMICA',
      fechaVc: '31/12/2026',
      lote: 'L-2026A',
      cantidad: '10 UN',
    };

    const canvas = bluetoothPrinterService.generateLabelCanvas(sampleItem, activeRoll, marklifeOptions);
    if (previewCanvasRef.current) {
      const container = previewCanvasRef.current;
      container.width = canvas.width;
      container.height = canvas.height;
      const ctx = container.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0);
      }
    }
  }, [isOpen, selectedRollId, itemsToPrint, activeRoll, marklifeOptions, sampleSku]);

  if (!isOpen) return null;

  const handleTestPrint = async () => {
    setPrintSuccessMsg(null);
    const ok = await printTest(selectedRollId, marklifeOptions);
    if (ok) {
      setPrintSuccessMsg('¡Etiqueta de prueba enviada con éxito a la Marklife P15!');
      setTimeout(() => setPrintSuccessMsg(null), 4000);
    }
  };

  const handleBatchPrint = async () => {
    if (itemsToPrint.length === 0) return;
    setPrintSuccessMsg(null);
    setPrintProgress({ current: 0, total: itemsToPrint.length });
    
    const count = await printBatch(itemsToPrint, selectedRollId, (curr, tot) => {
      setPrintProgress({ current: curr, total: tot });
    }, marklifeOptions);
    setPrintProgress(null);
    if (count > 0) {
      setPrintSuccessMsg(`¡${count} etiquetas impresas exitosamente!`);
      setTimeout(() => setPrintSuccessMsg(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ENCABEZADO */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Bluetooth className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base leading-tight">
                  Impresora Térmica Marklife P15
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300">
                  Bluetooth BLE
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Conexión directa vía Web Bluetooth sin drivers externos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENIDO SCROLLABLE */}
        <div className="p-5 space-y-4 overflow-y-auto no-scrollbar">
          
          {/* AVISO DE SOPORTE WEB BLUETOOTH */}
          {!isSupported && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold">Web Bluetooth no detectado en este navegador</p>
                <p className="leading-relaxed">
                  Para conectar directamente con la Marklife P15 por Bluetooth, abra esta aplicación en <strong>Google Chrome</strong> en su celular Android o PC. En iPhone (iOS) se requiere el navegador gratuito <strong>Bluefy</strong>.
                </p>
              </div>
            </div>
          )}

          {/* ESTADO DE CONEXIÓN */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Estado del Dispositivo
                </span>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
                  </span>
                ) : isConnecting ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-full animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Buscando...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 rounded-full">
                    Desconectado
                  </span>
                )}
              </div>

              {batteryLevel !== null && (
                <div className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <Battery className="w-4 h-4 text-emerald-500" />
                  <span>{batteryLevel}%</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {deviceName || 'Marklife P15 no vinculada'}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Protocolo L11/Quin 203 DPI · BLE GATT 0xFF00
                </p>
              </div>

              {isConnected ? (
                <button
                  type="button"
                  onClick={disconnect}
                  className="px-3.5 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/50 transition-colors cursor-pointer"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!isSupported || isConnecting}
                  onClick={connect}
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span>{isConnecting ? 'Buscando...' : 'Conectar Marklife P15'}</span>
                </button>
              )}
            </div>

            {error && (
              <p className="text-xs text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2 rounded-xl border border-rose-200 dark:border-rose-900/50">
                {error}
              </p>
            )}
          </div>

          {/* SELECTOR DE ROLLO Y MEDIDAS */}
          <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-indigo-500" />
                Rollo de Etiquetas Instalado
              </label>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  calidadRollo === 'optimo' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                    : calidadRollo === 'ok' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                      : calidadRollo === 'justo' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                }`}>
                  {FIT_QUALITY_LABEL[calidadRollo]}
                </span>
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {activeRoll.widthMm} × {activeRoll.heightMm} mm
                </span>
              </div>
            </div>

            <select
              value={selectedRollId}
              onChange={(e) => setSelectedRollId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              {ROLLOS.map((r) => {
                const calidad = fitQuality(evaluateFit(sampleSku, r));
                return (
                  <option key={r.id} value={r.id}>
                    {r.nombre} (Avance {r.heightMm}mm) · {FIT_QUALITY_LABEL[calidad]}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              La Marklife P15 cuenta con cabezal térmico de 203 DPI (8 puntos/mm). El código <strong>Code128 se gira 90° automáticamente</strong> para maximizar la longitud de las barras.
            </p>
          </div>

          {/* MODO DE CONTENIDO DE LA ETIQUETA */}
          <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Barcode className="w-3.5 h-3.5 text-indigo-500" />
                Formato de Etiqueta
              </label>
              <span className="text-[10px] text-slate-500 font-medium">
                {barcodeOnly ? 'Solo Código de Barras' : 'Con Detalles'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBarcodeOnly(true)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  barcodeOnly
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-900 dark:text-indigo-200'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-bold text-xs">Solo Código Barras</span>
                  {barcodeOnly && (
                    <span className="text-[9px] bg-indigo-600 text-white font-bold px-1.5 py-0.5 rounded-full">
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Maximiza altura de barras para lectura con pistola láser.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setBarcodeOnly(false)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  !barcodeOnly
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-900 dark:text-indigo-200'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-bold text-xs">Con Información</span>
                  {!barcodeOnly && (
                    <span className="text-[9px] bg-indigo-600 text-white font-bold px-1.5 py-0.5 rounded-full">
                      Activo
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Incluye descripción, fecha de vencimiento y lote.
                </p>
              </button>
            </div>

            {barcodeOnly && (
              <label className="flex items-center gap-2 pt-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSkuText}
                  onChange={(e) => setShowSkuText(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Mostrar texto numérico del SKU bajo las barras</span>
              </label>
            )}
          </div>

          {/* PREVISUALIZACIÓN REAL EN VIVO */}
          <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/50 flex flex-col items-center justify-center space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Previsualización a escala real de impresión
            </span>
            <div className="p-2 bg-white rounded-lg shadow-xs border border-slate-300 inline-block overflow-hidden max-w-full">
              <canvas
                ref={previewCanvasRef}
                className="max-h-36 object-contain image-rendering-pixelated"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              Monocromático 1-bit · Cabezal térmico 8 puntos/mm
            </span>
          </div>

          {/* MENSAJES DE ÉXITO O PROGRESO */}
          {printSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-xs font-medium flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{printSuccessMsg}</span>
            </div>
          )}

          {printProgress && (
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900/60 text-indigo-800 dark:text-indigo-200 text-xs font-medium flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-indigo-600" />
              <span>Imprimiendo etiquetas: {printProgress.current} de {printProgress.total}...</span>
            </div>
          )}

          {/* GUÍA RÁPIDA DE USO */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
              <Info className="w-4 h-4 text-indigo-500" />
              <span>Instrucciones de Vinculación</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400 pl-1 leading-relaxed">
              <li>Encienda su impresora <strong>Marklife P15</strong> manteniendo presionado el botón.</li>
              <li>Asegúrese de que el Bluetooth de su teléfono o PC esté <strong>activado</strong>.</li>
              <li>Presione <strong>"Conectar Marklife P15"</strong> y seleccione el dispositivo en la ventana emergente de Chrome.</li>
              <li>Presione <strong>"Imprimir Prueba"</strong> para verificar que el papel avance y corte al ras.</li>
            </ol>
          </div>

        </div>

        {/* PIE CON ACCIONES */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            Cerrar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPrinting}
              onClick={handleTestPrint}
              className="px-4 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isPrinting ? 'Imprimiendo...' : 'Imprimir Prueba'}</span>
            </button>

            {itemsToPrint.length > 0 && (
              <button
                type="button"
                disabled={isPrinting}
                onClick={handleBatchPrint}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Imprimir Lote ({itemsToPrint.length})</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
