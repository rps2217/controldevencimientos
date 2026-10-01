import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Barcode, 
  Camera, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  MapPin, 
  Volume2, 
  VolumeX, 
  Edit3, 
  Check, 
  X,
  PackageCheck,
  Search,
  Lock,
  Unlock,
  Sparkles,
  ArrowRight,
  HelpCircle,
  Info
} from 'lucide-react';
import type { StockCountEntry, StockCountSession } from '../../types';
import type { MasterCatalogIndex, MasterProductSummary } from '../../utils/referenceResolver';
import { formatLocaleNumber } from '../../utils/pureCalculations';
import { playBeep } from '../../utils/stockCountUtils';
import { MobileExpiryPrompt } from './MobileExpiryPrompt';
import { CampaignSkuErpBadge } from '../campaign/CampaignSkuBadges';

export interface BentoCountTerminalProps {
  currentSession: StockCountSession;
  activeLocation: string;
  onChangeLocation: (newLoc: string) => void;
  isLocationLocked: boolean;
  onToggleLocationLock: () => void;
  lastScannedItem: (StockCountEntry & { totalAcumulado: number; scanCount: number }) | null;
  onCommitScan: (sku: string, qty: number, mm?: string, yyyy?: string) => void;
  onIncrementSku: (sku: string) => void;
  onDecrementSku: (sku: string) => void;
  onRemoveSkuAllEntries: (sku: string, desc?: string) => void;
  onRemoveEntry: (id: string) => void;
  onUndoLastEntry: () => void;
  groupedSkuEntries: Array<{
    sku: string;
    descripcion: string;
    totalCantidad: number;
    readingsCount: number;
    mm?: string;
    yyyy?: string;
    ubicaciones: string[];
    entries: StockCountEntry[];
  }>;
  pendingItems: Array<{
    sku: string;
    descripcion: string;
    teorico: number;
  }>;
  theoreticalItemsMap?: Map<string, number>;
  masterCatalogIndex?: MasterCatalogIndex;
  onOpenLiveCamera: () => void;
  onGoToReconciliation: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
  campaignSkuStats?: any;
  yearsList: string[];
  expiryPromptSku: string | null;
  setExpiryPromptSku: (sku: string | null) => void;
  tempMm: string;
  setTempMm: (mm: string) => void;
  tempYyyy: string;
  setTempYyyy: (yyyy: string) => void;
  onBackToSessions?: () => void;
  onBackToCampaign?: () => void;
  onFinishFurnitureAndNext?: () => void;
}

/**
 * BentoCountTerminal:
 * Arquitectura Bento Grid intuitiva para conteo de inventario físico.
 * Diseñada para máxima claridad, velocidad y facilidad para operarios de cualquier nivel.
 */
export const BentoCountTerminal: React.FC<BentoCountTerminalProps> = ({
  currentSession,
  activeLocation,
  onChangeLocation,
  isLocationLocked,
  onToggleLocationLock,
  lastScannedItem,
  onCommitScan,
  onIncrementSku,
  onDecrementSku,
  onRemoveSkuAllEntries: _onRemoveSkuAllEntries,
  onRemoveEntry: _onRemoveEntry,
  onUndoLastEntry,
  groupedSkuEntries,
  pendingItems,
  theoreticalItemsMap,
  masterCatalogIndex,
  onOpenLiveCamera,
  onGoToReconciliation,
  showToast,
  campaignSkuStats,
  yearsList,
  expiryPromptSku,
  setExpiryPromptSku,
  tempMm,
  setTempMm,
  tempYyyy,
  setTempYyyy,
  onBackToSessions,
  onBackToCampaign,
  onFinishFurnitureAndNext
}) => {
  // Input buffer for direct typing via Industrial Numpad or Bluetooth Laser gun
  const [inputBuffer, setInputBuffer] = useState<string>('');
  const [multiplier, setMultiplier] = useState<number>(1);
  const [soundHapticsEnabled, setSoundHapticsEnabled] = useState<boolean>(true);
  const [isEditingLocation, setIsEditingLocation] = useState<boolean>(false);
  const [tempLocation, setTempLocation] = useState<string>(activeLocation || currentSession.ubicacion || 'Mueble 1');
  const [pulseCountAnim, setPulseCountAnim] = useState<boolean>(false);
  const [activeSideTab, setActiveSideTab] = useState<'RECENT' | 'PENDING'>('RECENT');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [showQuickGuide, setShowQuickGuide] = useState<boolean>(false);

  // Autocomplete dropdown matches
  const [catalogSearchResults, setCatalogSearchResults] = useState<MasterProductSummary[]>([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const laserHardwareInputRef = useRef<HTMLInputElement>(null);

  // Enhanced supplier directed count metrics
  const progressPercent = useMemo(() => {
    if (!currentSession?.skuScope || currentSession.skuScope.length === 0) return 0;
    const totalExpected = currentSession.skuScope.length;
    const countedInScope = groupedSkuEntries.filter(e => currentSession.skuScope?.includes(e.sku)).length;
    return Math.round((countedInScope / totalExpected) * 100);
  }, [currentSession, groupedSkuEntries]);

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
      if (!isEditingLocation && !expiryPromptSku && laserHardwareInputRef.current) {
        laserHardwareInputRef.current.focus({ preventScroll: true });
      }
    };
    focusScanner();
    const interval = setInterval(focusScanner, 2500);
    return () => clearInterval(interval);
  }, [isEditingLocation, expiryPromptSku]);

  // Flash count animation whenever lastScanned changes
  useEffect(() => {
    if (lastScannedItem) {
      setPulseCountAnim(true);
      const t = setTimeout(() => setPulseCountAnim(false), 220);
      return () => clearTimeout(t);
    }
  }, [lastScannedItem?.sku, lastScannedItem?.totalAcumulado]);

  // Handle master product search / SKU matching
  const handleInputChange = (val: string) => {
    setInputBuffer(val);
    const clean = val.trim();
    if (!clean || !masterCatalogIndex) {
      setCatalogSearchResults([]);
      setIsSearchDropdownOpen(false);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      return;
    }

    // Exact O(1) match
    const exact = masterCatalogIndex.getBySku(clean);
    if (exact) {
      setIsSearchDropdownOpen(false);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      return;
    }

    // Debounced search
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const results = masterCatalogIndex.search(clean, 5);
      setCatalogSearchResults(results);
      setIsSearchDropdownOpen(results.length > 0);
    }, 180);
  };

  // Core scan processor
  const processScanCode = (code: string, qty: number = multiplier) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    // Check expiry requirement
    if (currentSession.requiereVencimiento) {
      const existing = currentSession.conteos.find(c => c.sku === cleanCode && c.mm && c.yyyy);
      if (!existing) {
        setExpiryPromptSku(cleanCode);
        return;
      }
    }

    onCommitScan(cleanCode, qty);
    triggerHaptic('success');
    if (soundHapticsEnabled) playBeep('success');

    // Reset multiplier back to 1 if it was a custom box
    if (multiplier !== 1) {
      setMultiplier(1);
    }
    setIsSearchDropdownOpen(false);
  };

  // Fast complete remaining provider SKUs with 0 stock
  const handleCompleteWithZeros = () => {
    const uncounted = pendingItems.filter(item => !groupedSkuEntries.some(g => g.sku === item.sku));
    if (uncounted.length === 0) {
      showToast('No hay productos pendientes por completar con ceros', 'info');
      return;
    }
    
    // Commit a 0-quantity scan for each uncounted SKU
    uncounted.forEach(item => {
      onCommitScan(item.sku, 0);
    });
    
    showToast(`Se registraron ${uncounted.length} productos con cantidad 0`, 'success');
  };

  // Handle hardware laser / keyboard scan submission
  const handleHardwareScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = inputBuffer.trim();
    if (!code) return;

    processScanCode(code);
    setInputBuffer('');
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
      handleInputChange(inputBuffer + val);
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
  const activeTeorico = lastScannedItem && theoreticalItemsMap ? (theoreticalItemsMap.get(lastScannedItem.sku) ?? null) : null;
  const activeDifference = (lastScannedItem && activeTeorico !== null) ? (lastScannedItem.totalAcumulado - activeTeorico) : null;

  // Session stats
  const totalUnitsInSession = currentSession.conteos.reduce((a, b) => a + b.cantidad, 0);
  const uniqueSkusCount = groupedSkuEntries.length;

  // Filtered recent items
  const filteredRecentItems = useMemo(() => {
    if (!searchFilter.trim()) return groupedSkuEntries.slice(0, 15);
    const q = searchFilter.toLowerCase().trim();
    return groupedSkuEntries.filter(g => 
      g.sku.toLowerCase().includes(q) || g.descripcion.toLowerCase().includes(q)
    ).slice(0, 15);
  }, [groupedSkuEntries, searchFilter]);

  // Filtered pending items
  const filteredPendingItems = useMemo(() => {
    if (!searchFilter.trim()) return pendingItems.slice(0, 15);
    const q = searchFilter.toLowerCase().trim();
    return pendingItems.filter(p => 
      p.sku.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q)
    ).slice(0, 15);
  }, [pendingItems, searchFilter]);

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-slate-100 p-2 sm:p-4 overflow-y-auto">
      
      {/* Hidden input to capture physical Bluetooth / USB laser gun scans */}
      <form onSubmit={handleHardwareScanSubmit} className="sr-only">
        <input
          ref={laserHardwareInputRef}
          type="text"
          value={inputBuffer}
          onChange={(e) => handleInputChange(e.target.value)}
          autoComplete="off"
        />
      </form>

      {/* Optional First-Time User Guide Banner */}
      {showQuickGuide && (
        <div className="max-w-7xl mx-auto w-full mb-3 bg-blue-950/80 border border-blue-800/80 rounded-2xl p-3.5 sm:p-4 text-xs text-blue-200 animate-in fade-in slide-in-from-top-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-white block">💡 Guía Rápida para el Operario:</span>
              <p className="text-blue-200/90 text-[11px] leading-relaxed">
                1. <strong>Pistolea:</strong> Apunta el lector láser o usa la cámara para leer el código de barras.<br />
                2. <strong>Cajas/Empaques:</strong> Selecciona el multiplicador (ej. ×6 o ×20) si estás contando bultos cerrados.<br />
                3. <strong>Correcciones:</strong> Si te equivocas, pulsa <strong>UNDO</strong> o el botón <strong>-</strong> para restar.<br />
                4. <strong>Cuadratura:</strong> Al terminar el mueble, pulsa <strong>Cuadratura</strong> para revisar sobrantes y faltantes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowQuickGuide(false)}
            className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer shrink-0"
          >
            Entendido
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* BENTO GRID CONTAINER                                     */}
      {/* ======================================================== */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">

        {/* ---------------------------------------------------- */}
        {/* BENTO BOX 1: UBICACIÓN Y CONTEXTO (Col 1-7 Top)      */}
        {/* ---------------------------------------------------- */}
        <div className="md:col-span-7 bg-slate-800/90 border border-slate-700/80 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-sm flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 truncate">
              {onBackToSessions && (
                <button
                  type="button"
                  onClick={onBackToSessions}
                  className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-700"
                  title="Cambiar o ver otros muebles"
                >
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span className="truncate max-w-[130px]">{currentSession.nombre}</span>
                </button>
              )}
              {onBackToCampaign && (
                <button
                  type="button"
                  onClick={onBackToCampaign}
                  className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-700"
                  title="Ir a consolidación general de tienda"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Tienda</span>
                </button>
              )}
              <button
                type="button"
                onClick={onToggleLocationLock}
                className={`p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isLocationLocked
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title={isLocationLocked ? 'Ubicación FIJA' : 'Ubicación LIBRE'}
              >
                {isLocationLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowQuickGuide(!showQuickGuide)}
                className={`p-1.5 rounded-xl border transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold ${
                  showQuickGuide 
                    ? 'bg-blue-950/70 border-blue-800 text-blue-300' 
                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:text-white'
                }`}
                title="Ver ayuda rápida de conteo"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ayuda</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSoundHapticsEnabled(!soundHapticsEnabled);
                  triggerHaptic('success');
                }}
                className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                  soundHapticsEnabled 
                    ? 'bg-blue-950/70 border-blue-800 text-blue-400' 
                    : 'bg-slate-700 border-slate-600 text-slate-400'
                }`}
                title={soundHapticsEnabled ? 'Sonido & Vibración Activos' : 'Silencio'}
              >
                {soundHapticsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={onGoToReconciliation}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Cuadratura</span>
              </button>

              {onFinishFurnitureAndNext && (
                <button
                  type="button"
                  onClick={onFinishFurnitureAndNext}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition-colors shadow-sm cursor-pointer flex items-center gap-1.5 active:scale-95"
                  title="Guardar este mueble y pasar automáticamente al siguiente"
                >
                  <span>🏁 Siguiente Mueble</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Editable Location Bar */}
          {isEditingLocation ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tempLocation}
                onChange={(e) => setTempLocation(e.target.value)}
                placeholder="Ej: Mueble 1 (Lácteos)"
                className="px-3 py-2 bg-slate-900 border border-blue-500 rounded-xl text-sm font-bold text-white outline-none w-full"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveLocation}
                className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl cursor-pointer"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingLocation(false)}
                className="p-2 bg-slate-700 text-slate-300 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div 
              onClick={() => {
                setTempLocation(activeLocation || currentSession.ubicacion || 'Mueble 1');
                setIsEditingLocation(true);
              }}
              className="flex items-center justify-between px-3 py-2 bg-slate-900/90 hover:bg-slate-900 border border-slate-700/60 rounded-xl cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-2 truncate">
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="font-bold text-sm text-slate-100 truncate">
                  {activeLocation || currentSession.ubicacion || 'Mueble 1'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 group-hover:text-blue-400 flex items-center gap-1">
                <Edit3 className="w-3 h-3" />
                Cambiar Mueble
              </span>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------- */}
        {/* BENTO BOX 2: MÉTRICAS & TOTALES (Col 8-12 Top)       */}
        {/* ---------------------------------------------------- */}
        <div className="md:col-span-5 bg-slate-800/90 border border-slate-700/80 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div className="grid grid-cols-2 gap-4 flex-1 pr-3 border-r border-slate-700">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Total Unidades
              </span>
              <span className="text-2xl sm:text-3xl font-mono font-black text-emerald-400 leading-tight">
                {formatLocaleNumber(totalUnitsInSession)}
              </span>
              <span className="text-[10px] text-slate-400">contadas</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Productos (SKUs)
              </span>
              <span className="text-2xl sm:text-3xl font-mono font-black text-blue-400 leading-tight">
                {uniqueSkusCount}
              </span>
              <span className="text-[10px] text-slate-400">distintos</span>
            </div>
          </div>

          <div className="pl-3 flex flex-col items-center justify-center">
            <button
              type="button"
              onClick={() => {
                onUndoLastEntry();
                triggerHaptic('undo');
                playBeep('skip');
              }}
              disabled={currentSession.conteos.length === 0}
              className="p-3 bg-slate-700/80 hover:bg-rose-950/60 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-rose-300 rounded-2xl border border-slate-600 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5"
              title="Deshacer última lectura"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-[9px] font-bold">DESHACER</span>
            </button>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* BENTO BOX 3: HERO LCD DISPLAY (Col 1-7 Center)       */}
        {/* ---------------------------------------------------- */}
        <div className="md:col-span-7 bg-slate-950 border-2 border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
          
          {/* Expiry Prompt Modal if triggered */}
          {expiryPromptSku ? (
            <div className="animate-in fade-in zoom-in-95 duration-150">
              <MobileExpiryPrompt
                sku={expiryPromptSku}
                quantity={multiplier}
                yearsList={yearsList}
                tempYyyy={tempYyyy}
                tempMm={tempMm}
                onSelectYear={(y) => {
                  setTempYyyy(y);
                  if (tempMm) {
                    onCommitScan(expiryPromptSku, multiplier, tempMm, y);
                    setExpiryPromptSku(null);
                    triggerHaptic('success');
                  }
                }}
                onSelectMonth={(m) => {
                  setTempMm(m);
                  if (tempYyyy) {
                    onCommitScan(expiryPromptSku, multiplier, m, tempYyyy);
                    setExpiryPromptSku(null);
                    triggerHaptic('success');
                  }
                }}
                onSkip={() => {
                  onCommitScan(expiryPromptSku, multiplier, undefined, undefined);
                  setExpiryPromptSku(null);
                  triggerHaptic('success');
                }}
                onClose={() => {
                  setExpiryPromptSku(null);
                  playBeep('skip');
                }}
              />
            </div>
          ) : lastScannedItem ? (
            /* ACTIVE PRODUCT HERO */
            <div className="flex flex-col items-center text-center">
              {/* Header Badges */}
              <div className="flex items-center gap-2 mb-2 flex-wrap justify-center">
                <span className="px-3 py-1 bg-blue-950/90 border border-blue-800 text-blue-300 font-mono font-black text-sm rounded-xl tracking-wider">
                  SKU: {lastScannedItem.sku}
                </span>
                {lastScannedItem.mm && lastScannedItem.yyyy && (
                  <span className="px-2.5 py-1 bg-amber-950/90 border border-amber-800 text-amber-300 font-mono font-bold text-xs rounded-xl">
                    Vto: {lastScannedItem.mm}/{lastScannedItem.yyyy}
                  </span>
                )}
                {campaignSkuStats && <CampaignSkuErpBadge stats={campaignSkuStats} compact />}
              </div>

              {/* Product Name */}
              <h2 className="text-base sm:text-lg font-bold text-slate-100 line-clamp-2 leading-snug mb-3 max-w-md">
                {lastScannedItem.descripcion || 'Producto sin descripción'}
              </h2>

              {/* GIGANTIC LCD NUMBER DISPLAY */}
              <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl py-4 sm:py-5 px-6 flex flex-col items-center justify-center my-1 shadow-inner relative">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-0.5">
                  TOTAL CONTADO EN ESTE MUEBLE
                </span>
                
                <div className={`text-6xl sm:text-7xl font-mono font-black text-emerald-400 tracking-tight transition-transform duration-150 ${pulseCountAnim ? 'scale-110 text-emerald-300' : 'scale-100'}`}>
                  {formatLocaleNumber(lastScannedItem.totalAcumulado)}
                </div>
                
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <span className="text-blue-400 font-bold font-mono">+{lastScannedItem.cantidad}</span> en última lectura • {lastScannedItem.scanCount} lecturas
                </div>
              </div>

              {/* Theoretical comparison */}
              {currentSession.modo !== 'BLIND' && activeTeorico !== null && (
                <div className="mt-3 w-full">
                  {activeDifference === 0 ? (
                    <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>¡CUADRADO! Teórico del sistema: {activeTeorico} u.</span>
                    </div>
                  ) : activeDifference! > 0 ? (
                    <div className="px-3 py-1.5 rounded-xl bg-blue-950/60 border border-blue-800/80 text-blue-300 text-xs font-bold flex items-center justify-center gap-1.5">
                      <PackageCheck className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>SOBRANTE: +{activeDifference} u. (Teórico: {activeTeorico} u.)</span>
                    </div>
                  ) : (
                    <div className="px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>FALTANTE: {activeDifference} u. (Teórico: {activeTeorico} u.)</span>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Touch Steppers (-1, +1, +5, +10, +25, +50) */}
              <div className="w-full mt-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1 text-left">
                  Sumar Cantidad al Producto Activo:
                </span>
                <div className="grid grid-cols-6 gap-1.5 w-full font-mono font-bold text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onDecrementSku(lastScannedItem.sku);
                      triggerHaptic('undo');
                    }}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 text-rose-400 font-black text-sm rounded-xl border border-slate-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                    title="Restar 1 unidad (-1)"
                  >
                    -1
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onIncrementSku(lastScannedItem.sku);
                      triggerHaptic('success');
                      if (soundHapticsEnabled) playBeep('success');
                    }}
                    className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl shadow-md active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                    title="Sumar 1 unidad (+1)"
                  >
                    +1
                  </button>

                  {[5, 10, 25, 50].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => {
                        onCommitScan(lastScannedItem.sku, inc);
                        triggerHaptic('success');
                        if (soundHapticsEnabled) playBeep('success');
                      }}
                      className="py-2.5 bg-slate-800 hover:bg-indigo-950/80 hover:text-indigo-200 text-slate-300 rounded-xl border border-slate-700/80 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                      title={`Sumar ${inc} unidades (+${inc})`}
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            /* IDLE RADAR WAITING STATE */
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-blue-950/70 border border-blue-800 text-blue-400 flex items-center justify-center mb-3 animate-pulse">
                <Barcode className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-100">
                LISTO PARA PISTOLEAR
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Escanea un código de barras con el lector láser o usa la cámara del dispositivo.
              </p>
              
              <button
                type="button"
                onClick={onOpenLiveCamera}
                className="mt-5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-2xl shadow-lg shadow-indigo-950/50 flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
              >
                <Camera className="w-4 h-4" />
                <span>Activar Cámara / Escáner</span>
              </button>
            </div>
          )}

        </div>

        {/* ---------------------------------------------------- */}
        {/* BENTO BOX 4: HISTORIAL & PENDIENTES (Col 8-12 Center)*/}
        {/* ---------------------------------------------------- */}
        <div className="md:col-span-5 bg-slate-800/90 border border-slate-700/80 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-sm flex flex-col">
          
          {/* Segmented Header: Recientes vs Pendientes */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-700">
            <div className="flex items-center bg-slate-900 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveSideTab('RECENT')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activeSideTab === 'RECENT'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Contados ({groupedSkuEntries.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSideTab('PENDING')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activeSideTab === 'PENDING'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pendientes ({pendingItems.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenLiveCamera}
              className="p-1.5 bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
              title="Abrir lector de cámara"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          {/* Supplier-directed active count progress banner */}
          {currentSession.skuScope && currentSession.skuScope.length > 0 && (
            <div className="mt-3 p-3 bg-indigo-950/40 rounded-2xl border border-indigo-500/25 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-extrabold text-indigo-300 flex items-center gap-1 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Progreso Laboratorio
                </span>
                <span className="font-mono font-black text-indigo-300">
                  {groupedSkuEntries.filter(e => currentSession.skuScope?.includes(e.sku)).length} / {currentSession.skuScope.length} SKUs ({progressPercent}%)
                </span>
              </div>
              <div className="w-full bg-slate-900/80 rounded-full h-2 border border-slate-700/60 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.5)]" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Quick Search inside side tab */}
          <div className="relative my-2.5">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar por SKU o descripción..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-medium text-slate-100 outline-none focus:border-blue-500"
            />
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto max-h-[300px] flex flex-col gap-1.5 pr-1">
            {activeSideTab === 'RECENT' ? (
              filteredRecentItems.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Sin productos contados aún en este mueble
                </div>
              ) : (
                filteredRecentItems.map(item => (
                  <div 
                    key={item.sku}
                    className="p-2.5 bg-slate-900/80 hover:bg-slate-900 border border-slate-700/60 rounded-xl flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="truncate flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-blue-400">{item.sku}</span>
                        {item.mm && item.yyyy && (
                          <span className="text-[10px] font-mono text-amber-400">
                            ({item.mm}/{item.yyyy})
                          </span>
                        )}
                      </div>
                      <p className="text-slate-300 truncate text-[11px] mt-0.5">{item.descripcion}</p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onDecrementSku(item.sku)}
                        className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg flex items-center justify-center text-xs cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-emerald-400 px-1.5 min-w-[28px] text-center">
                        {item.totalCantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => onIncrementSku(item.sku)}
                        className="w-6 h-6 bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold rounded-lg flex items-center justify-center text-xs cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : (
              filteredPendingItems.length === 0 ? (
                <div className="py-8 text-center text-emerald-400 text-xs flex flex-col items-center">
                  <CheckCircle2 className="w-6 h-6 mb-1 opacity-70" />
                  <span>¡Todo contado! No hay pendientes.</span>
                </div>
              ) : (
                <>
                  {currentSession.skuScope && currentSession.skuScope.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCompleteWithZeros}
                      className="w-full py-2.5 mb-2 bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-200 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <PackageCheck className="w-4 h-4 text-indigo-400" />
                      <span>Completar Pendientes con Cantidad 0</span>
                    </button>
                  )}
                  {filteredPendingItems.map(item => (
                    <div
                      key={item.sku}
                      onClick={() => {
                        setInputBuffer(item.sku);
                        showToast(`SKU ${item.sku} cargado. Usa el teclado para ingresar cantidad.`, 'info');
                      }}
                      className="p-2.5 bg-slate-900/80 hover:bg-slate-900 border border-amber-900/40 hover:border-amber-500/40 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors"
                      title="Haz clic para cargar en el teclado digital"
                    >
                      <div className="truncate flex-1">
                        <span className="font-mono font-bold text-amber-400">{item.sku}</span>
                        <p className="text-slate-300 truncate text-[11px] mt-0.5">{item.descripcion}</p>
                        <span className="text-[10px] text-slate-400">Teórico: {item.teorico} u.</span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation(); // Avoid triggering card click
                          processScanCode(item.sku, 1);
                          showToast(`Contado: ${item.sku}`, 'info');
                        }}
                        className="px-2.5 py-1 bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        Contar
                      </button>
                    </div>
                  ))
                  }
                </>
              )
            )}
          </div>

        </div>

        {/* ---------------------------------------------------- */}
        {/* BENTO BOX 5: NUMPAD INDUSTRIAL & EMPAQUES (Bottom)   */}
        {/* ---------------------------------------------------- */}
        <div className="md:col-span-12 bg-slate-800/90 border border-slate-700/80 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-sm flex flex-col gap-3">
          
          {/* Quick packaging multiplier pills */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
              <span>Empaque / Bulto:</span>
            </span>
            <div className="flex items-center gap-1.5">
              {[
                { label: '1 a 1', val: 1 },
                { label: '×6 (Caja)', val: 6 },
                { label: '×10', val: 10 },
                { label: '×20', val: 20 },
                { label: '×30', val: 30 },
                { label: '×50', val: 50 },
                { label: '×100', val: 100 }
              ].map(m => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => {
                    setMultiplier(m.val);
                    triggerHaptic('success');
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    multiplier === m.val
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Direct SKU Input bar with Autocomplete */}
          <div className="relative">
            <input
              type="text"
              value={inputBuffer}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Tipea SKU o usa el teclado táctil..."
              className="w-full pl-4 pr-24 py-2.5 bg-slate-950 border border-slate-700 rounded-2xl text-sm font-mono font-bold text-white outline-none focus:border-blue-500"
            />
            {inputBuffer.trim() && (
              <button
                type="button"
                onClick={() => handleNumpadPress('ENTER')}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl cursor-pointer active:scale-95 shadow-sm"
              >
                REGISTRAR ↵
              </button>
            )}

            {/* Dropdown search autocomplete results */}
            {isSearchDropdownOpen && catalogSearchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-30 max-h-52 overflow-y-auto p-1.5">
                {catalogSearchResults.map(prod => (
                  <button
                    key={prod.sku}
                    type="button"
                    onClick={() => {
                      processScanCode(prod.sku);
                      setInputBuffer('');
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 flex items-center justify-between text-xs transition-colors cursor-pointer"
                  >
                    <div className="truncate pr-2">
                      <span className="font-mono font-bold text-blue-400 mr-2">{prod.sku}</span>
                      <span className="text-slate-200 font-medium">{prod.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">{prod.provider || prod.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Zero-OS Touch Numpad Grid */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 font-mono max-w-2xl mx-auto w-full">
            {['7', '8', '9'].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => handleNumpadPress(d)}
                className="h-10 sm:h-11 bg-slate-900 hover:bg-slate-700 active:bg-blue-600 text-slate-100 font-black text-lg sm:text-xl rounded-xl border border-slate-700/80 shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleNumpadPress('CLEAR')}
              className="h-10 sm:h-11 bg-rose-950/70 hover:bg-rose-900 text-rose-300 font-black text-xs rounded-xl border border-rose-800/80 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              CLR
            </button>

            {['4', '5', '6'].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => handleNumpadPress(d)}
                className="h-10 sm:h-11 bg-slate-900 hover:bg-slate-700 active:bg-blue-600 text-slate-100 font-black text-lg sm:text-xl rounded-xl border border-slate-700/80 shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleNumpadPress('BACKSPACE')}
              className="h-10 sm:h-11 bg-slate-900 hover:bg-slate-700 text-amber-400 font-black text-sm rounded-xl border border-slate-700/80 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              ⌫
            </button>

            {['1', '2', '3'].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => handleNumpadPress(d)}
                className="h-10 sm:h-11 bg-slate-900 hover:bg-slate-700 active:bg-blue-600 text-slate-100 font-black text-lg sm:text-xl rounded-xl border border-slate-700/80 shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={onOpenLiveCamera}
              className="row-span-2 h-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-lg shadow-indigo-950/50 active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-center gap-1"
            >
              <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[10px] uppercase">Cámara</span>
            </button>

            <button
              type="button"
              onClick={() => handleNumpadPress('0')}
              className="col-span-2 h-10 sm:h-11 bg-slate-900 hover:bg-slate-700 active:bg-blue-600 text-slate-100 font-black text-lg sm:text-xl rounded-xl border border-slate-700/80 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => handleNumpadPress('ENTER')}
              className="h-10 sm:h-11 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-base rounded-xl shadow-md shadow-emerald-950/40 active:scale-95 transition-all cursor-pointer"
            >
              OK
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};

