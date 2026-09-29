import React, { useState, useRef, useEffect } from 'react';
import { 
  Barcode, 
  Camera, 
  Zap, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Minus, 
  Layers, 
  MapPin, 
  Volume2, 
  VolumeX, 
  Flame, 
  Hash, 
  Edit3, 
  Check, 
  X,
  PackageCheck,
  Smartphone
} from 'lucide-react';
import type { StockCountEntry, StockCountSession, SheetRecord } from '../../types';
import type { MasterCatalogIndex, MasterProductSummary } from '../../utils/referenceResolver';
import { formatLocaleNumber } from '../../utils/pureCalculations';
import { playBeep } from '../../utils/stockCountUtils';

export interface OpticonTerminalViewProps {
  currentSession: StockCountSession;
  activeLocation: string;
  onChangeLocation: (newLoc: string) => void;
  lastScanned: (StockCountEntry & { totalAcumulado: number; scanCount: number }) | null;
  onCommitScan: (sku: string, qty: number, mm?: string, yyyy?: string) => void;
  onIncrementSku: (sku: string) => void;
  onDecrementSku: (sku: string) => void;
  onUndoLastReading: () => void;
  onOpenLiveCamera: () => void;
  theoreticalItemsMap?: Map<string, number>;
  masterCatalogIndex?: MasterCatalogIndex;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
}

export const OpticonTerminalView: React.FC<OpticonTerminalViewProps> = ({
  currentSession,
  activeLocation,
  onChangeLocation,
  lastScanned,
  onCommitScan,
  onIncrementSku,
  onDecrementSku,
  onUndoLastReading,
  onOpenLiveCamera,
  theoreticalItemsMap,
  masterCatalogIndex,
  showToast
}) => {
  // Input buffer for direct typing via Industrial Numpad or Bluetooth Laser gun
  const [inputBuffer, setInputBuffer] = useState<string>('');
  const [multiplierMode, setMultiplierMode] = useState<boolean>(false);
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(1);
  const [soundHapticsEnabled, setSoundHapticsEnabled] = useState<boolean>(true);
  const [isEditingLocation, setIsEditingLocation] = useState<boolean>(false);
  const [tempLocation, setTempLocation] = useState<string>(activeLocation || currentSession.ubicacion || 'Mueble 1');
  const [pulseCountAnim, setPulseCountAnim] = useState<boolean>(false);

  const laserHardwareInputRef = useRef<HTMLInputElement>(null);

  // Trigger haptic vibration on mobile hardware
  const triggerHaptic = (type: 'success' | 'alert' | 'undo') => {
    if (!soundHapticsEnabled) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (type === 'success') navigator.vibrate(40);
        else if (type === 'alert') navigator.vibrate([60, 40, 60]);
        else if (type === 'undo') navigator.vibrate(80);
      } catch {}
    }
  };

  // Keep hidden laser input focused for hardware / bluetooth gun scanners
  useEffect(() => {
    const focusScanner = () => {
      if (!isEditingLocation && laserHardwareInputRef.current) {
        laserHardwareInputRef.current.focus({ preventScroll: true });
      }
    };
    focusScanner();
    const interval = setInterval(focusScanner, 2000);
    return () => clearInterval(interval);
  }, [isEditingLocation]);

  // Flash count animation whenever lastScanned changes
  useEffect(() => {
    if (lastScanned) {
      setPulseCountAnim(true);
      const t = setTimeout(() => setPulseCountAnim(false), 200);
      return () => clearTimeout(t);
    }
  }, [lastScanned?.sku, lastScanned?.totalAcumulado]);

  // Handle hardware laser / keyboard scan submission
  const handleHardwareScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = inputBuffer.trim();
    if (!code) return;

    processScanCode(code);
    setInputBuffer('');
  };

  // Core scan processor
  const processScanCode = (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    const qty = multiplierMode ? selectedMultiplier : 1;
    onCommitScan(cleanCode, qty);
    
    triggerHaptic('success');
    if (soundHapticsEnabled) playBeep('success');

    if (multiplierMode) {
      // Reset multiplier after applying box
      setMultiplierMode(false);
      setSelectedMultiplier(1);
    }
  };

  // Numpad key press handler
  const handleNumpadPress = (val: string) => {
    if (val === 'CLEAR') {
      setInputBuffer('');
      triggerHaptic('undo');
    } else if (val === 'BACKSPACE') {
      setInputBuffer(prev => prev.slice(0, -1));
    } else if (val === 'ENTER') {
      if (inputBuffer.trim()) {
        processScanCode(inputBuffer.trim());
        setInputBuffer('');
      }
    } else {
      setInputBuffer(prev => prev + val);
    }
  };

  // Handle Location change
  const handleSaveLocation = () => {
    const clean = tempLocation.trim();
    if (clean) {
      onChangeLocation(clean);
      setIsEditingLocation(false);
      showToast(`Ubicación fijada: ${clean}`, 'info');
    }
  };

  // Theoretical comparison for active SKU
  const activeTeorico = lastScanned && theoreticalItemsMap ? (theoreticalItemsMap.get(lastScanned.sku) ?? null) : null;
  const activeDifference = (lastScanned && activeTeorico !== null) ? (lastScanned.totalAcumulado - activeTeorico) : null;

  // Session stats
  const totalUnitsInSession = currentSession.conteos.reduce((a, b) => a + b.cantidad, 0);
  const uniqueSkusCount = new Set(currentSession.conteos.map(c => c.sku)).size;

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden h-full">
      
      {/* Hidden input to capture physical Bluetooth / USB laser gun scans */}
      <form onSubmit={handleHardwareScanSubmit} className="sr-only">
        <input
          ref={laserHardwareInputRef}
          type="text"
          value={inputBuffer}
          onChange={(e) => setInputBuffer(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </form>

      {/* ======================================================== */}
      {/* 1. TOP INDUSTRIAL BREADCRUMB & METRICS HEADER            */}
      {/* ======================================================== */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-md">
        
        {/* Location Selector (One-Touch edit) */}
        {isEditingLocation ? (
          <div className="flex items-center gap-1.5 flex-1 max-w-[200px]">
            <input
              type="text"
              value={tempLocation}
              onChange={(e) => setTempLocation(e.target.value)}
              placeholder="Ej: Mueble 04"
              className="px-2 py-1 bg-slate-800 border border-blue-500 rounded-lg text-xs font-bold text-white outline-none w-full font-mono"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveLocation}
              className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsEditingLocation(false)}
              className="p-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTempLocation(activeLocation || currentSession.ubicacion || 'Mueble 1');
              setIsEditingLocation(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-black text-blue-400 font-mono transition-colors cursor-pointer active:scale-95"
            title="Toca para cambiar de mueble o pasillo"
          >
            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="truncate max-w-[130px]">{activeLocation || currentSession.ubicacion || 'Mueble 1'}</span>
            <Edit3 className="w-3 h-3 text-slate-400 ml-0.5" />
          </button>
        )}

        {/* Global Session Counters & Quick Controls */}
        <div className="flex items-center gap-3">
          <div className="text-right font-mono">
            <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">Mueble</span>
            <span className="text-xs font-black text-emerald-400">
              {formatLocaleNumber(totalUnitsInSession)} u. <span className="text-slate-400 font-normal">({uniqueSkusCount} SKUs)</span>
            </span>
          </div>

          {/* Sound & Haptic Toggle */}
          <button
            type="button"
            onClick={() => {
              setSoundHapticsEnabled(!soundHapticsEnabled);
              triggerHaptic('success');
            }}
            className={`p-2 rounded-xl border transition-colors cursor-pointer active:scale-95 ${
              soundHapticsEnabled 
                ? 'bg-blue-950/70 border-blue-800 text-blue-400' 
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
            title={soundHapticsEnabled ? 'Sonido y Vibración Activos' : 'Silencio'}
          >
            {soundHapticsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. OPTICON HIGH-CONTRAST LCD DISPLAY (HERO CENTER)       */}
      {/* ======================================================== */}
      <div className="flex-1 p-4 flex flex-col justify-center max-w-lg mx-auto w-full overflow-y-auto">
        
        {lastScanned ? (
          /* ACTIVE PRODUCT DISPLAY */
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col items-center text-center relative overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            
            {/* Top Tag: SKU & Expiry */}
            <div className="flex items-center gap-2 mb-2 flex-wrap justify-center">
              <span className="px-3 py-1 bg-blue-950/80 border border-blue-800 text-blue-300 font-mono font-black text-sm rounded-lg tracking-wider">
                {lastScanned.sku}
              </span>
              {lastScanned.mm && lastScanned.yyyy && (
                <span className="px-2.5 py-1 bg-amber-950/80 border border-amber-800 text-amber-300 font-mono font-bold text-xs rounded-lg">
                  VTO: {lastScanned.mm}/{lastScanned.yyyy}
                </span>
              )}
            </div>

            {/* Product Name */}
            <h2 className="text-base sm:text-lg font-bold text-slate-100 line-clamp-2 leading-snug px-2 mb-4">
              {lastScanned.descripcion || 'Producto sin descripción'}
            </h2>

            {/* GIGANTIC OPTICON COUNT DISPLAY */}
            <div className="w-full bg-slate-950 border border-slate-800/80 rounded-2xl py-4 px-6 flex flex-col items-center justify-center my-1 relative shadow-inner">
              <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">
                CANTIDAD ACUMULADA
              </span>
              
              <div className={`text-6xl sm:text-7xl font-mono font-black text-emerald-400 tracking-tight transition-transform duration-150 ${pulseCountAnim ? 'scale-110 text-emerald-300' : 'scale-100'}`}>
                {formatLocaleNumber(lastScanned.totalAcumulado)}
              </div>
              
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1 font-mono font-medium">
                <span className="text-blue-400 font-bold">+{lastScanned.cantidad}</span> en este escaneo • {lastScanned.scanCount} lecturas
              </div>
            </div>

            {/* THEORETICAL COMPARISON PILL (IF NOT BLIND MODE) */}
            {currentSession.modo !== 'BLIND' && activeTeorico !== null && (
              <div className="mt-3 w-full">
                {activeDifference === 0 ? (
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>¡CUADRADO! Teórico: {activeTeorico} u.</span>
                  </div>
                ) : activeDifference! > 0 ? (
                  <div className="px-3 py-1.5 rounded-xl bg-blue-950/60 border border-blue-800/80 text-blue-300 text-xs font-bold flex items-center justify-center gap-1.5">
                    <PackageCheck className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>SOBRANTE: +{activeDifference} (Teórico: {activeTeorico} u.)</span>
                  </div>
                ) : (
                  <div className="px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>FALTANTE: {activeDifference} (Teórico: {activeTeorico} u.)</span>
                  </div>
                )}
              </div>
            )}

            {/* Quick Micro-Steppers (+1 / -1 / Undo) directly under display */}
            <div className="grid grid-cols-4 gap-2 w-full mt-4">
              <button
                type="button"
                onClick={() => {
                  onDecrementSku(lastScanned.sku);
                  triggerHaptic('undo');
                }}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-rose-400 font-black text-base rounded-xl border border-slate-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                title="Restar 1 unidad (-1)"
              >
                <Minus className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onIncrementSku(lastScanned.sku);
                  triggerHaptic('success');
                  if (soundHapticsEnabled) playBeep('success');
                }}
                className="col-span-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-base rounded-xl shadow-lg shadow-emerald-900/40 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Sumar 1 unidad (+1)"
              >
                <Plus className="w-5 h-5 stroke-[3]" />
                <span className="text-sm font-mono">+1 UNID</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onUndoLastReading();
                  triggerHaptic('undo');
                  if (soundHapticsEnabled) playBeep('skip');
                }}
                className="py-2.5 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 font-bold text-xs rounded-xl border border-slate-700 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center"
                title="Deshacer última lectura registrada"
              >
                <RotateCcw className="w-3.5 h-3.5 mb-0.5" />
                <span className="text-[9px]">UNDO</span>
              </button>
            </div>

          </div>
        ) : (
          /* IDLE WAITING SCREEN (RETÍCULA LISTA) */
          <div className="bg-slate-900/60 border-2 border-dashed border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-950/60 border border-blue-800/80 text-blue-400 flex items-center justify-center mb-3 animate-pulse">
              <Barcode className="w-8 h-8" />
            </div>
            <h3 className="text-base font-black text-slate-200 tracking-wide font-mono">
              TERMINAL OPTICON LISTO
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              Pistolea un código de barras con tu lector Bluetooth / láser o activa la cámara inferior.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 text-[11px] font-mono text-emerald-400 border border-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Modo Rápido 1 a 1 Activo
            </div>
          </div>
        )}

      </div>

      {/* ======================================================== */}
      {/* 3. THUMB ACTION DECK & ZERO-OS INDUSTRIAL NUMPAD          */}
      {/* ======================================================== */}
      <div className="bg-slate-900 border-t border-slate-800 p-3 shrink-0 flex flex-col gap-2.5 max-w-lg mx-auto w-full">
        
        {/* Multiplier / Box mode selector pills */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">
            Modo Empaque:
          </span>
          <div className="flex items-center gap-1 text-xs">
            {[
              { label: '1 a 1', val: 1 },
              { label: '×5', val: 5 },
              { label: '×10', val: 10 },
              { label: '×20', val: 20 },
              { label: '×30', val: 30 }
            ].map(m => (
              <button
                key={m.label}
                type="button"
                onClick={() => {
                  if (m.val === 1) {
                    setMultiplierMode(false);
                    setSelectedMultiplier(1);
                  } else {
                    setMultiplierMode(true);
                    setSelectedMultiplier(m.val);
                  }
                  triggerHaptic('success');
                }}
                className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs transition-all cursor-pointer ${
                  (m.val === 1 && !multiplierMode) || (multiplierMode && selectedMultiplier === m.val)
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Manual SKU input bar with Numpad preview */}
        <div className="relative">
          <input
            type="text"
            value={inputBuffer}
            onChange={(e) => setInputBuffer(e.target.value)}
            placeholder="Tipea SKU o usa el numpad..."
            className="w-full pl-3 pr-20 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono font-bold text-white outline-none focus:border-blue-500 placeholder:text-slate-600"
          />
          {inputBuffer.trim() && (
            <button
              type="button"
              onClick={() => handleNumpadPress('ENTER')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-lg font-mono cursor-pointer active:scale-95 shadow-sm"
            >
              OK ↵
            </button>
          )}
        </div>

        {/* Industrial One-Touch Numpad (Zero OS keyboard popup) */}
        <div className="grid grid-cols-4 gap-1.5 font-mono">
          {['7', '8', '9'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => handleNumpadPress(d)}
              className="h-11 bg-slate-800 hover:bg-slate-700 active:bg-blue-600 text-slate-100 font-black text-lg rounded-xl border border-slate-700 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleNumpadPress('CLEAR')}
            className="h-11 bg-rose-950/70 hover:bg-rose-900 text-rose-300 font-black text-xs rounded-xl border border-rose-800 shadow-xs active:scale-95 transition-all cursor-pointer"
            title="Borrar entrada"
          >
            CLR
          </button>

          {['4', '5', '6'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => handleNumpadPress(d)}
              className="h-11 bg-slate-800 hover:bg-slate-700 active:bg-blue-600 text-slate-100 font-black text-lg rounded-xl border border-slate-700 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleNumpadPress('BACKSPACE')}
            className="h-11 bg-slate-800 hover:bg-slate-700 text-amber-400 font-black text-sm rounded-xl border border-slate-700 shadow-xs active:scale-95 transition-all cursor-pointer"
            title="Retroceso"
          >
            ⌫
          </button>

          {['1', '2', '3'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => handleNumpadPress(d)}
              className="h-11 bg-slate-800 hover:bg-slate-700 active:bg-blue-600 text-slate-100 font-black text-lg rounded-xl border border-slate-700 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onOpenLiveCamera()}
            className="row-span-2 h-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-lg shadow-indigo-900/50 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center gap-1"
            title="Abrir lector de cámara para escaneo continuo"
          >
            <Camera className="w-5 h-5" />
            <span className="text-[10px] uppercase">Cámara</span>
          </button>

          <button
            type="button"
            onClick={() => handleNumpadPress('0')}
            className="col-span-2 h-11 bg-slate-800 hover:bg-slate-700 active:bg-blue-600 text-slate-100 font-black text-lg rounded-xl border border-slate-700 shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleNumpadPress('ENTER')}
            className="h-11 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-md shadow-emerald-900/40 active:scale-95 transition-all cursor-pointer"
          >
            OK
          </button>
        </div>

      </div>

    </div>
  );
};
