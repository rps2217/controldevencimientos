import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, X, Scan, Zap, Volume2, VolumeX, Plus, Minus, Search, 
  Check, CheckCircle2, AlertTriangle, ArrowLeft, RefreshCw, Layers, 
  Barcode, Calendar, Sparkles, Trash2, Edit3, ArrowRight, ShieldCheck, Keyboard
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { InventoryItem } from '../../types';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { findMasterProduct, getMasterProductSummary } from '../../utils/referenceResolver';
import { parseLocaleNumber, parseAnyDate } from '../../utils/dateCalculations';
import { playBeep, calculateLastDayOfMonthDateString, generateCuVc } from '../../utils/stockCountUtils';

interface ScannedSessionItem {
  id: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  mm: string;
  yyyy: string;
  fecha_vc: string;
  proveedor?: string;
  politica?: string;
  timestamp: string;
  isExisting: boolean;
  existingItem?: InventoryItem;
}

interface MobilePistoleoTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  headers: string[];
  masterProducts?: any[];
  policies?: any[];
  activeSheetTitle?: string;
  onSaveItem: (formData: Record<string, string>, targetExistingItem?: InventoryItem) => Promise<void>;
  onDeleteItem?: (item: InventoryItem) => Promise<void>;
  onOpenFullModal?: (item?: InventoryItem, prefillSku?: string) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
}

export const MobilePistoleoTerminalModal: React.FC<MobilePistoleoTerminalModalProps> = ({
  isOpen,
  onClose,
  items,
  headers,
  masterProducts = [],
  policies = [],
  activeSheetTitle = 'VENCIMIENTOS',
  onSaveItem,
  onDeleteItem,
  onOpenFullModal,
  showToast
}) => {
  // Mode toggles
  const [scanMode, setScanMode] = useState<'LASER' | 'CAMERA'>('LASER');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  
  // Camera state
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraStatus, setCameraStatus] = useState<'IDLE' | 'STARTING' | 'RUNNING' | 'ERROR'>('IDLE');
  const [cameraError, setCameraError] = useState<string>('');

  // Scanning & Form State
  const [inputCode, setInputCode] = useState<string>('');
  const [activeScannedCode, setActiveScannedCode] = useState<string>('');
  const [matchedItems, setMatchedItems] = useState<InventoryItem[]>([]);
  const [selectedMatchedIndex, setSelectedMatchedIndex] = useState<number>(0);
  const [masterSummary, setMasterSummary] = useState<{ name: string; provider: string; category: string } | null>(null);

  const matchedItem = selectedMatchedIndex >= 0 && selectedMatchedIndex < matchedItems.length 
    ? matchedItems[selectedMatchedIndex] 
    : null;
  
  // Scanned item form controls
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState<string>(() => String(new Date().getFullYear()));
  const [customDescription, setCustomDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Live session history
  const [sessionScans, setSessionScans] = useState<ScannedSessionItem[]>([]);
  
  // DOM Refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = 'pistoleo-terminal-camera-stream';
  const lastScanTimestamp = useRef<number>(0);
  const isMounted = useRef<boolean>(true);

  // Column helpers
  const skuCol = findColumnBySemantic(headers, 'sku') || 'SKU';
  const descCol = findColumnBySemantic(headers, 'descripcion') || 'PRODUCTO';
  const qtyCol = findColumnBySemantic(headers, 'cantidad') || 'CANTIDAD';
  const fechaCol = findColumnBySemantic(headers, 'fecha_vc') || 'FECHA_VC';
  const mmCol = findColumnBySemantic(headers, 'mes') || 'MM';
  const yyyyCol = findColumnBySemantic(headers, 'anio') || 'YYYY';
  const cuCol = findColumnBySemantic(headers, 'id') || 'CU_VC';
  const rutCol = findColumnBySemantic(headers, 'proveedor') || 'RUT_PROVEEDOR_VC';
  const polCol = findColumnBySemantic(headers, 'politica') || 'POLITICA';

  // Session stats
  const totalScannedItemsCount = sessionScans.length;
  const totalScannedUnits = sessionScans.reduce((sum, s) => sum + s.cantidad, 0);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      stopCameraScanner();
    };
  }, []);

  // Auto-focus input for physical PDA Laser guns
  useEffect(() => {
    if (isOpen && scanMode === 'LASER') {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, scanMode, activeScannedCode]);

  // Handle Camera initialization when switching to CAMERA mode
  useEffect(() => {
    if (!isOpen) {
      stopCameraScanner();
      return;
    }

    if (scanMode === 'CAMERA') {
      startCameraScanner();
    } else {
      stopCameraScanner();
    }
  }, [isOpen, scanMode]);

  const triggerFeedback = (type: 'success' | 'error' | 'skip') => {
    if (soundEnabled) {
      playBeep(type);
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (type === 'success') navigator.vibrate(35);
        else if (type === 'error') navigator.vibrate([60, 50, 60]);
      } catch {}
    }
  };

  // Camera start / stop functions
  const startCameraScanner = async () => {
    try {
      setCameraStatus('STARTING');
      setCameraError('');

      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraStatus('ERROR');
        setCameraError('El contexto del navegador no soporta acceso directo a la cámara. Usa el modo Láser PDA.');
        return;
      }

      const devices = await Html5Qrcode.getCameras().catch(err => {
        const msg = String(err?.message || err || '');
        if (msg.includes('NotAllowedError') || msg.includes('Permission') || msg.includes('not allowed')) {
          throw new Error('Permiso de cámara denegado o restringido por el navegador.');
        }
        throw err;
      });
      if (!isMounted.current) return;

      if (devices && devices.length > 0) {
        setCameras(devices);
        const backCam = devices.find(d => /back|rear|trasera|environment|externa|pda|2/i.test(d.label));
        const camId = backCam ? backCam.id : devices[devices.length - 1].id;
        setSelectedCameraId(camId);

        if (scannerRef.current) {
          await stopCameraScanner();
        }

        const formatsToSupport: Html5QrcodeSupportedFormats[] = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE
        ];

        const html5QrCode = new Html5Qrcode(readerElementId, {
          formatsToSupport,
          verbose: false
        });
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          camId,
          {
            fps: 15,
            qrbox: { width: 260, height: 140 },
            aspectRatio: 1.777778
          },
          (decodedText) => {
            const now = Date.now();
            const cleanText = decodedText.trim();
            if (now - lastScanTimestamp.current < 1000) return;
            
            lastScanTimestamp.current = now;
            processBarcodeScan(cleanText);
          },
          () => {}
        );

        setCameraStatus('RUNNING');

        try {
          const capabilities = html5QrCode.getRunningTrackCapabilities();
          if ((capabilities as any)?.torch) {
            setHasTorch(true);
          }
        } catch {}
      } else {
        setCameraStatus('ERROR');
        setCameraError('No se detectaron cámaras en el dispositivo. Usa el modo Láser PDA.');
      }
    } catch (err: any) {
      setCameraStatus('ERROR');
      const errMsg = String(err?.message || err || '');
      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission') || errMsg.includes('not allowed') || errMsg.includes('denegado')) {
        setCameraError('Permiso de cámara denegado o no disponible en este marco. Usa la entrada de texto Láser PDA.');
      } else {
        setCameraError(errMsg || 'No se pudo iniciar la cámara.');
      }
    }
  };

  const stopCameraScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setCameraStatus('IDLE');
    setTorchOn(false);
  };

  const handleToggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any]
      });
      setTorchOn(nextTorch);
    } catch {}
  };

  // Main Barcode Processing Core
  const processBarcodeScan = (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    setInputCode(cleanCode);
    setActiveScannedCode(cleanCode);

    // 1. Search in ALL existing inventory items for coincidences
    const matches = items.filter(item => {
      const itemSku = String(item[skuCol] || item.SKU || '').trim();
      const itemCuVc = String(item[cuCol] || item.CU_VC || '').trim();
      const itemBarcode = String(item.COD_BARRA || item.BARCODE || '').trim();
      return (
        itemSku.toLowerCase() === cleanCode.toLowerCase() ||
        itemCuVc.toLowerCase() === cleanCode.toLowerCase() ||
        (itemBarcode && itemBarcode.toLowerCase() === cleanCode.toLowerCase())
      );
    });

    setMatchedItems(matches);
    setSelectedMatchedIndex(matches.length > 0 ? 0 : -1);

    if (matches.length > 0) {
      const activeMatch = matches[0];
      setCustomDescription(String(activeMatch[descCol] || activeMatch.PRODUCTO || ''));
      setQuantity(1); // Default increment step
      
      const mm = String(activeMatch[mmCol] || activeMatch.MM || '').trim();
      const yyyy = String(activeMatch[yyyyCol] || activeMatch.YYYY || '').trim();
      if (mm && yyyy) {
        setSelectedMonth(mm.padStart(2, '0'));
        setSelectedYear(yyyy);
      }
      triggerFeedback('success');
    } else {
      // 2. Search in Master Products catalog if available
      const masterProd = findMasterProduct(cleanCode, masterProducts);
      if (masterProd) {
        const summary = getMasterProductSummary(masterProd);
        setMasterSummary(summary);
        setCustomDescription(summary.name);
      } else {
        setMasterSummary(null);
        setCustomDescription(`SKU ${cleanCode}`);
      }
      setQuantity(1);
      triggerFeedback('success');
    }
  };

  const handleInputSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    processBarcodeScan(inputCode);
  };

  const handleClearInput = () => {
    setInputCode('');
    setActiveScannedCode('');
    setMatchedItems([]);
    setSelectedMatchedIndex(-1);
    setMasterSummary(null);
    setCustomDescription('');
    setQuantity(1);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Quantity Stepper Handlers
  const handleIncreaseQty = () => setQuantity(q => q + 1);
  const handleDecreaseQty = () => setQuantity(q => (q > 1 ? q - 1 : 1));

  // Save / Add item to inventory
  const handleConfirmSave = async (mode: 'ADD_NEW' | 'SUM_STOCK' | 'UPDATE_EXPIRED') => {
    if (!activeScannedCode) {
      showToast('Escanea o ingresa un código válido primero.', 'warning', 'Pistoleo');
      return;
    }

    try {
      setIsSubmitting(true);
      const computedFecha = calculateLastDayOfMonthDateString(selectedYear, selectedMonth);
      const computedCuVc = generateCuVc(activeScannedCode, selectedYear, selectedMonth);

      const formData: Record<string, string> = {
        [skuCol]: activeScannedCode,
        [descCol]: customDescription || masterSummary?.name || `SKU ${activeScannedCode}`,
        [mmCol]: selectedMonth,
        [yyyyCol]: selectedYear,
        [fechaCol]: computedFecha,
        [cuCol]: computedCuVc
      };

      if (masterSummary?.provider) {
        formData[rutCol] = masterSummary.provider;
      }

      let targetItemToUpdate: InventoryItem | undefined = undefined;

      if (matchedItem && mode === 'SUM_STOCK') {
        const currentQty = parseLocaleNumber(matchedItem[qtyCol] || 0);
        formData[qtyCol] = String(currentQty + quantity);
        targetItemToUpdate = matchedItem;
      } else if (matchedItem && mode === 'UPDATE_EXPIRED') {
        formData[qtyCol] = String(quantity);
        targetItemToUpdate = matchedItem;
      } else {
        // New item or append mode
        formData[qtyCol] = String(quantity);
      }

      await onSaveItem(formData, targetItemToUpdate);

      // Add to session stream history
      const newSessionItem: ScannedSessionItem = {
        id: `sc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        sku: activeScannedCode,
        descripcion: formData[descCol],
        cantidad: quantity,
        mm: selectedMonth,
        yyyy: selectedYear,
        fecha_vc: computedFecha,
        proveedor: masterSummary?.provider,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isExisting: Boolean(matchedItem),
        existingItem: targetItemToUpdate
      };

      setSessionScans(prev => [newSessionItem, ...prev]);
      triggerFeedback('success');

      // Reset for next pistoleo scan
      handleClearInput();
    } catch (err: any) {
      triggerFeedback('error');
      showToast(`Error al guardar: ${err.message}`, 'error', 'Error en Pistoleo');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!matchedItem || !onDeleteItem) return;
    try {
      setIsSubmitting(true);
      await onDeleteItem(matchedItem);
      triggerFeedback('success');
      showToast(`Lote (Fila #${matchedItem._rowIndex}) eliminado con éxito.`, 'success', 'Eliminación');
      handleClearInput();
    } catch (err: any) {
      triggerFeedback('error');
      showToast(`Error al eliminar: ${err.message}`, 'error', 'Error en Eliminación');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] bg-slate-950 flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-150">
      
      {/* 1. TOP SAP/STEM STYLE BURGUNDY BAR (Directly inspired by images) */}
      <div className="bg-gradient-to-r from-red-950 via-rose-950 to-red-900 text-white px-3 py-2.5 flex items-center justify-between shadow-xl border-b border-red-900/60 safe-top">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 active:bg-white/20 rounded-xl transition-colors text-slate-200 cursor-pointer"
            title="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-900/60 border border-red-800 flex items-center justify-center text-rose-300">
              <Scan className="w-4 h-4" />
            </div>
            <span className="text-xs font-mono font-bold tracking-wider text-red-200 uppercase">
              TERMINAL PDA
            </span>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-1.5">
          {/* Mode Switcher Button (Laser vs Camera) */}
          <button
            onClick={() => setScanMode(m => (m === 'LASER' ? 'CAMERA' : 'LASER'))}
            className={`p-2 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ${
              scanMode === 'CAMERA'
                ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-red-900/80 border-red-700/80 text-white hover:bg-red-800'
            }`}
            title={scanMode === 'LASER' ? 'Activar Cámara' : 'Usar Láser / Teclado'}
          >
            {scanMode === 'CAMERA' ? (
              <>
                <Camera className="w-4 h-4 text-slate-950" />
                <span className="text-[10px] font-bold">Cámara</span>
              </>
            ) : (
              <>
                <Barcode className="w-4 h-4 text-rose-300" />
                <span className="text-[10px] font-bold">Láser PDA</span>
              </>
            )}
          </button>

          {/* Sound / Mute */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-red-900/60 border-red-800 text-emerald-400'
                : 'bg-red-900/40 border-red-800 text-slate-400'
            }`}
            title="Sonido de lectura"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <div className="w-px h-5 bg-red-900/80 mx-1" />

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="Cerrar terminal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. MAIN SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-100 flex flex-col p-3 gap-3">

        {/* Document ID & Live Counter Bar (Image 1 & 2 inspired) */}
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-slate-400 font-mono font-bold tracking-wider">
            #PI20260911001
          </span>

          <div className="flex items-center gap-1.5 font-bold">
            <Search className="w-4 h-4 text-rose-400" />
            <span className="text-slate-300">Total :</span>
            <span className="text-emerald-400 font-mono text-sm bg-emerald-950/80 px-2 py-0.5 rounded-lg border border-emerald-800/60">
              {totalScannedItemsCount} ({totalScannedUnits.toFixed(1)})
            </span>
          </div>
        </div>

        {/* MODE A: Embedded Camera Viewfinder (Image 2 Inspired) */}
        {scanMode === 'CAMERA' && (
          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative shadow-2xl shrink-0">
            <div 
              id={readerElementId} 
              className="w-full aspect-[16/9] bg-black"
            />

            {/* Viewfinder Target Box Overlay */}
            {cameraStatus === 'RUNNING' && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div className="w-64 h-28 border-2 border-rose-500/80 rounded-xl relative shadow-[0_0_15px_rgba(244,63,94,0.3)] flex items-center justify-center">
                  <div className="w-full h-0.5 bg-red-500 shadow-[0_0_10px_#ef4444] animate-bounce opacity-90" />
                </div>
              </div>
            )}

            {/* Flash Torch Toggle */}
            {hasTorch && cameraStatus === 'RUNNING' && (
              <button
                onClick={handleToggleTorch}
                className={`absolute top-2 right-2 p-2 rounded-xl border backdrop-blur-md transition-all ${
                  torchOn ? 'bg-amber-500 border-amber-300 text-slate-950 font-bold' : 'bg-black/60 border-slate-700 text-white'
                }`}
              >
                <Zap className="w-4 h-4" />
              </button>
            )}

            {cameraStatus === 'STARTING' && (
              <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center gap-2 text-xs text-rose-300 font-semibold">
                <RefreshCw className="w-5 h-5 animate-spin text-rose-500" />
                <span>Iniciando cámara trasera...</span>
              </div>
            )}

            {cameraStatus === 'ERROR' && (
              <div className="absolute inset-0 bg-slate-950/95 p-4 flex flex-col items-center justify-center text-center text-xs text-red-300 gap-2">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <span>{cameraError}</span>
                <button
                  onClick={() => setScanMode('LASER')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs mt-1"
                >
                  Usar Modo Láser / Teclado
                </button>
              </div>
            )}
          </div>
        )}

        {/* MODE B: Input Field & Buttons (Image 1 Inspired) */}
        <form onSubmit={handleInputSubmit} className="flex flex-col gap-2">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block px-0.5">
            Enter BarcodeItemCode Here
          </label>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInputSubmit();
                  }
                }}
                placeholder="Pistolear o Ingrese Código SKU..."
                className="w-full bg-slate-900 border-2 border-slate-700 focus:border-rose-500 rounded-2xl px-4 py-3.5 text-base font-mono font-extrabold text-white placeholder-slate-500 outline-none shadow-inner tracking-wide transition-colors"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />

              {inputCode && (
                <button
                  type="button"
                  onClick={handleClearInput}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-red-950 border border-red-800 text-red-300 hover:bg-red-900 rounded-xl transition-colors"
                  title="Limpiar"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Keyboard & Clear buttons (Matching image layout) */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => inputRef.current?.focus()}
                className="p-3.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-2xl text-slate-300"
                title="Enfocar Teclado / Pistola"
              >
                <Keyboard className="w-5 h-5 text-rose-400" />
              </button>

              <button
                type="button"
                onClick={handleClearInput}
                className="p-3.5 bg-red-900/80 hover:bg-red-800 active:scale-95 border border-red-700 text-white rounded-2xl font-black text-sm"
                title="Limpiar campo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </form>

        {/* 3. SCANNED PRODUCT RESULT CARD (Image 1 & 2 inspired) */}
        {activeScannedCode ? (
          <div className="bg-slate-900/90 border-2 border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-2xl animate-in zoom-in-95 duration-150 relative">
            
            {/* Top row: Barcode & Status Badge */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div>
                <span className="text-[10px] font-mono text-slate-400 block uppercase font-extrabold tracking-wider">
                  Código Pistoleado
                </span>
                <span className="text-xl font-mono font-extrabold text-white tracking-wider block">
                  {activeScannedCode}
                </span>
              </div>

              {matchedItems.length > 0 ? (
                <span className="px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {matchedItems.length === 1 ? '1 Coincidencia' : `${matchedItems.length} Coincidencias`}
                </span>
              ) : masterSummary ? (
                <span className="px-2.5 py-1 rounded-full bg-blue-950 border border-blue-700 text-blue-300 text-[11px] font-bold flex items-center gap-1.5 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  En Catálogo Maestro
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-amber-950 border border-amber-700 text-amber-300 text-[11px] font-bold flex items-center gap-1.5 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Código Nuevo
                </span>
              )}
            </div>

            {/* Description Input / Display */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">
                Descripción del Producto
              </label>
              <input
                type="text"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Nombre del producto..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-semibold text-slate-100 placeholder-slate-600 focus:border-rose-500 outline-none"
              />
            </div>

            {/* ALL COINCIDENCES LIST SELECTOR */}
            {matchedItems.length > 0 && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2 shadow-inner">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-amber-300 flex items-center gap-1.5 text-[11px]">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    {matchedItems.length === 1 
                      ? '1 Lote Registrado en Inventario' 
                      : `${matchedItems.length} Lotes Registrados para este SKU`}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    Total: {matchedItems.reduce((acc, it) => acc + parseLocaleNumber(it[qtyCol] || 0), 0)} ud
                  </span>
                </div>

                {matchedItems.length > 1 && (
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Toca el lote específico que deseas actualizar o sumar:
                  </p>
                )}

                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {matchedItems.map((item, idx) => {
                    const isSelected = selectedMatchedIndex === idx;
                    const mm = String(item[mmCol] || item.MM || '').trim();
                    const yyyy = String(item[yyyyCol] || item.YYYY || '').trim();
                    const fecha = String(item[fechaCol] || item.FECHA_VC || '').trim();
                    const qty = parseLocaleNumber(item[qtyCol] || 0);

                    return (
                      <button
                        key={`match-${item._rowIndex || idx}`}
                        type="button"
                        onClick={() => {
                          setSelectedMatchedIndex(idx);
                          setCustomDescription(String(item[descCol] || item.PRODUCTO || ''));
                          if (mm && yyyy) {
                            setSelectedMonth(mm.padStart(2, '0'));
                            setSelectedYear(yyyy);
                          }
                        }}
                        className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-rose-950/90 border-rose-500 text-white shadow-md shadow-rose-950/40 ring-1 ring-rose-500'
                            : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-rose-400 bg-rose-500' : 'border-slate-600 bg-slate-800'
                          }`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="truncate">
                            <span className="font-mono font-extrabold text-xs block text-slate-100">
                              Lote / Vencimiento: {mm && yyyy ? `${mm}/${yyyy}` : (fecha || 'Sin Fecha')}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono truncate">
                              Fila #{item._rowIndex} • SKU: {item[skuCol] || item.SKU}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`font-mono font-extrabold text-xs block ${
                            isSelected ? 'text-rose-300' : 'text-slate-300'
                          }`}>
                            {qty} ud
                          </span>
                          <span className="text-[9px] uppercase tracking-wider text-slate-500">
                            Stock actual
                          </span>
                        </div>
                      </button>
                    );
                  })}

                  {/* Option to create a new lot for this SKU */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMatchedIndex(-1);
                      setQuantity(1);
                    }}
                    className={`w-full text-center py-2 px-3 rounded-xl border border-dashed transition-all text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                      selectedMatchedIndex === -1
                        ? 'bg-amber-950/90 border-amber-500 text-amber-200'
                        : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Registrar Nuevo Lote Vencimiento para este SKU</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quantity Stepper (Directly inspired by images: (-) 1 (+)) */}
            <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
              <div>
                <span className="text-xs font-bold text-slate-300 block">Cantidad a Registrar</span>
                <span className="text-[10px] text-slate-500">Unidades pistoleadas</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDecreaseQty}
                  className="w-11 h-11 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-90 border border-slate-700 text-white font-extrabold text-xl flex items-center justify-center transition-transform shadow-md"
                >
                  <Minus className="w-5 h-5 text-rose-400" />
                </button>

                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-14 text-center text-xl font-mono font-extrabold bg-transparent text-white outline-none"
                />

                <button
                  type="button"
                  onClick={handleIncreaseQty}
                  className="w-11 h-11 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-90 border border-rose-400 text-white font-extrabold text-xl flex items-center justify-center transition-transform shadow-lg shadow-rose-900/40"
                >
                  <Plus className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Expiration Month / Year Selectors */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">
                  Mes Vencimiento (MM)
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-200 outline-none focus:border-rose-500"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = String(i + 1).padStart(2, '0');
                    return (
                      <option key={m} value={m}>
                        {m} - {new Date(2026, i, 1).toLocaleString('es', { month: 'long' })}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">
                  Año Vencimiento (YYYY)
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-200 outline-none focus:border-rose-500"
                >
                  {Array.from({ length: 8 }, (_, i) => {
                    const y = String(new Date().getFullYear() + i);
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* ONE-HANDED ACTION BUTTONS (Anchored for thumb access) */}
            <div className="flex flex-col gap-2 mt-1">
              {matchedItem ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleConfirmSave('SUM_STOCK')}
                      className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      <span>Sumar Stock (+{quantity})</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleConfirmSave('UPDATE_EXPIRED')}
                      className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-98 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-blue-950/50 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                      <span>Actualizar Registro</span>
                    </button>
                  </div>

                  {onDeleteItem && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleConfirmDelete}
                      className="w-full py-2.5 px-4 bg-rose-950/80 hover:bg-rose-900/90 text-rose-300 border border-rose-800/80 active:scale-98 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Eliminar Lote / Registro (Fila #{matchedItem._rowIndex})</span>
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleConfirmSave('ADD_NEW')}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-98 text-white text-sm font-black rounded-xl shadow-xl shadow-rose-950/60 flex items-center justify-center gap-2 transition-all"
                >
                  {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  <span>Agregar a Vencimientos (+{quantity} ud)</span>
                </button>
              )}

              {onOpenFullModal && matchedItem && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFullModal(matchedItem);
                  }}
                  className="w-full py-2 text-center text-xs font-bold text-slate-400 hover:text-white transition-colors underline decoration-slate-700"
                >
                  Abrir formulario completo para editar otros campos
                </button>
              )}
            </div>

          </div>
        ) : (
          /* Empty state prompt */
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-2 text-slate-400 my-auto">
            <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-rose-500 mb-1">
              <Barcode className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-slate-200">Listo para Pistolear a Una Mano</h4>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Dispara con el láser de tu PDA o usa la cámara para escanear cualquier código. El producto aparecerá al instante para agregar o sumar stock.
            </p>
          </div>
        )}

        {/* 4. LIVE SESSION STREAM / RECENT SCANS LIST */}
        {sessionScans.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center justify-between text-xs px-0.5">
              <span className="font-extrabold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-rose-400" />
                Histórico de la Sesión ({sessionScans.length})
              </span>
              <button
                onClick={() => setSessionScans([])}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Limpiar lista
              </button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
              {sessionScans.map((scan) => (
                <div
                  key={scan.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-rose-300">{scan.sku}</span>
                      <span className="text-[10px] font-mono text-slate-400">({scan.timestamp})</span>
                    </div>
                    <p className="text-[11px] text-slate-300 truncate">{scan.descripcion}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-md bg-rose-950 border border-rose-800 font-mono font-extrabold text-rose-200 text-xs">
                      +{scan.cantidad} ud
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {scan.mm}/{scan.yyyy}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* 5. FOOTER LOGO BAR (Inspired by SAP / STEM layout in images) */}
      <div className="bg-slate-900 border-t border-slate-800/80 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-400 safe-bottom">
        <span className="font-medium text-slate-400">powered by <strong className="text-white">STEM</strong></span>
        <div className="flex items-center gap-1.5 font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800/60 text-[10px]">
          SAP Gold Partner
        </div>
      </div>

    </div>
  );
};
