import React, { useState } from 'react';
import { 
  Check, 
  FileSpreadsheet, 
  EyeOff, 
  Calendar, 
  Database, 
  Loader2, 
  Cloud, 
  CloudOff, 
  CloudUpload, 
  Barcode, 
  Zap, 
  Trash2, 
  ChevronRight, 
  CheckCircle2, 
  Sparkles, 
  HelpCircle,
  UploadCloud
} from 'lucide-react';
import { StockCountSession, StockCountMode, InventoryItem } from '../../types';
import { formatLocaleNumber } from '../../utils/pureCalculations';

const CURRENT_YEAR = new Date().getFullYear();

export interface NewSessionConfig {
  nombre: string;
  modo: StockCountMode;
  requiereVencimiento: boolean;
  rangoAnos?: { desde: number; hasta: number };
  ubicacion: string;
  skuScope?: string[];
}

export interface StockCountSessionsListViewProps {
  sessions: StockCountSession[];
  sheetItems?: InventoryItem[];
  isSyncingCloud: boolean;
  realProviders?: string[];
  erpSnapshotCount?: number;
  activeCampaignName?: string;
  onOpenUploadErp?: () => void;
  onOpenWorkflowGuide?: () => void;
  onCreateSession: (config: NewSessionConfig) => void;
  onOpenSession: (session: StockCountSession) => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  onBackupSessionToCloud: (session: StockCountSession) => void;
  onCloudSync: (silent: boolean) => void;
}

export const StockCountSessionsListView: React.FC<StockCountSessionsListViewProps> = ({
  sessions,
  sheetItems = [],
  isSyncingCloud,
  realProviders = [],
  erpSnapshotCount = 0,
  activeCampaignName,
  onOpenUploadErp,
  onOpenWorkflowGuide,
  onCreateSession,
  onOpenSession,
  onDeleteSession,
  onBackupSessionToCloud,
  onCloudSync,
}) => {
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionMode, setNewSessionMode] = useState<StockCountMode>('DOCUMENT');
  const [newSessionRequireExpiry, setNewSessionRequireExpiry] = useState<boolean>(false);
  const [newSessionYearFrom] = useState<number>(CURRENT_YEAR);
  const [newSessionYearTo] = useState<number>(CURRENT_YEAR + 3);
  const [newSessionLocation, setNewSessionLocation] = useState('');

  // Enhanced provider directed audit mode
  const [sessionType, setSessionType] = useState<'FREE' | 'PROVIDER'>('FREE');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [providerSearch, setProviderSearch] = useState<string>('');

  // Dynamically compute expected SKUs for the selected provider/lab
  const providerSkus = React.useMemo(() => {
    if (!selectedProvider) return [];
    const cleanSel = selectedProvider.trim().toLowerCase();
    const skusSet = new Set<string>();
    sheetItems.forEach(item => {
      const p = item.RUT_PROVEEDOR_VC || item.PROVEEDOR || item.proveedor || item.RUT_PROVEEDOR;
      if (p && String(p).trim().toLowerCase() === cleanSel && item.SKU) {
        skusSet.add(item.SKU.trim());
      }
    });
    return Array.from(skusSet);
  }, [selectedProvider, sheetItems]);

  // Preset quick selectors
  const applyPreset = (preset: 'QUICK' | 'EXPIRY' | 'BLIND_AUDIT') => {
    setSessionType('FREE');
    if (preset === 'QUICK') {
      setNewSessionName(`Mueble ${sessions.length + 1} - Conteo Rápido`);
      setNewSessionMode('DOCUMENT');
      setNewSessionRequireExpiry(false);
      setNewSessionLocation(`Mueble ${sessions.length + 1}`);
    } else if (preset === 'EXPIRY') {
      setNewSessionName(`Mueble ${sessions.length + 1} - Con Vencimientos`);
      setNewSessionMode('DOCUMENT');
      setNewSessionRequireExpiry(true);
      setNewSessionLocation(`Mueble ${sessions.length + 1}`);
    } else if (preset === 'BLIND_AUDIT') {
      setNewSessionName(`Auditoría a Ciegas ${sessions.length + 1}`);
      setNewSessionMode('BLIND');
      setNewSessionRequireExpiry(false);
      setNewSessionLocation(`Zona ${sessions.length + 1}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalName = '';
    let finalUbicacion = '';
    let skuScope: string[] | undefined = undefined;

    if (sessionType === 'PROVIDER') {
      if (!selectedProvider) {
        return;
      }
      finalName = `${selectedProvider} - Conteo Dirigido`;
      finalUbicacion = selectedProvider;
      skuScope = providerSkus;
    } else {
      finalName = newSessionName.trim() || `Mueble ${sessions.length + 1} - ${new Date().toLocaleDateString('es-CL')}`;
      finalUbicacion = newSessionLocation.trim() || finalName;
    }

    onCreateSession({
      nombre: finalName,
      modo: newSessionMode,
      requiereVencimiento: newSessionRequireExpiry,
      rangoAnos: newSessionRequireExpiry ? { desde: newSessionYearFrom, hasta: newSessionYearTo } : undefined,
      ubicacion: finalUbicacion,
      skuScope
    });

    setNewSessionName('');
    setNewSessionLocation('');
    setSelectedProvider('');
    setProviderSearch('');
    setSessionType('FREE');
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 max-w-7xl mx-auto w-full">

      {/* Top Guided Step 0 Banner: ERP Snapshot Source */}
      <div className="p-4 rounded-3xl bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-slate-900/60 border border-blue-500/30 backdrop-blur-sm shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-md shadow-blue-500/30 shrink-0">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-extrabold border border-blue-400/30">
                Paso 0: Inventario Teórico ERP
              </span>
              {erpSnapshotCount > 0 ? (
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {formatLocaleNumber(erpSnapshotCount)} SKUs teóricos cargados
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                  Sin archivo ERP cargado aún
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {erpSnapshotCount > 0 
                ? `Campaña activa: "${activeCampaignName || 'Principal'}". Las terminales móviles ya comparan faltantes y sobrantes.`
                : 'Carga tu planilla Excel (.xlsx) o CSV del ERP para auditar diferencias automáticamente en cada mueble.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
          {onOpenUploadErp && (
            <button
              type="button"
              onClick={onOpenUploadErp}
              className="flex-1 md:flex-none px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{erpSnapshotCount > 0 ? 'Actualizar Archivo ERP' : 'Cargar Archivo ERP (.xlsx / .csv)'}</span>
            </button>
          )}
          {onOpenWorkflowGuide && (
            <button
              type="button"
              onClick={onOpenWorkflowGuide}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Ver guía paso a paso del flujo de conteo"
            >
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Guía de Flujo</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full">

      {/* Left: New Session Creator (Always top on mobile) */}
      <div className="order-1 lg:order-1 lg:col-span-5 bg-white dark:bg-slate-800/80 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                Crear Mueble, Sección o Proveedor
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">Paso 1</span>
          </div>

          {/* Quick Presets for New Users */}
          <div className="mb-4 p-3 bg-blue-50/70 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900/50">
            <span className="text-[11px] font-bold text-blue-900 dark:text-blue-300 block mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Plantillas Rápidas:
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('QUICK')}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all text-center cursor-pointer active:scale-95"
              >
                ⚡ Rápido
              </button>
              <button
                type="button"
                onClick={() => applyPreset('EXPIRY')}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all text-center cursor-pointer active:scale-95"
              >
                📅 Con Vto.
              </button>
              <button
                type="button"
                onClick={() => applyPreset('BLIND_AUDIT')}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all text-center cursor-pointer active:scale-95"
              >
                👁️ A Ciegas
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {/* Segmented Session Type Selector */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
              <button
                type="button"
                onClick={() => setSessionType('FREE')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  sessionType === 'FREE'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                🏢 Por Mueble / Libre
              </button>
              <button
                type="button"
                onClick={() => setSessionType('PROVIDER')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  sessionType === 'PROVIDER'
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                📦 Dirigido por Proveedor
              </button>
            </div>

            {sessionType === 'FREE' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nombre del Mueble o Sección
                  </label>
                  <input
                    type="text"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    placeholder="Ej: Mueble 1, Pasillo 2 o Refrigerados"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>

                {/* Sugerencias Rápidas */}
                <div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1.5">
                    Sugerencias Rápidas de Sección:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                    {['Mueble 1', 'Mueble 2', 'Pasillo 1', 'Pasillo 2', 'Refrigerados', 'Bodega Sur', 'Mesa de Ofertas'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setNewSessionName(chip);
                          setNewSessionLocation(chip);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Directed Provider Audit Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Escribe para buscar Proveedor <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={providerSearch}
                      onChange={(e) => {
                        setProviderSearch(e.target.value);
                        if (selectedProvider) setSelectedProvider('');
                      }}
                      placeholder="Buscar por RUT o nombre de proveedor..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                    {providerSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setProviderSearch('');
                          setSelectedProvider('');
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold hover:text-slate-600"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  {/* Suggestion overlay list */}
                  {!selectedProvider && providerSearch.trim().length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl max-h-40 overflow-y-auto bg-white dark:bg-slate-800 shadow-xl z-20 relative divide-y divide-slate-100 dark:divide-slate-700/50">
                      {realProviders
                        .filter(p => p.toLowerCase().includes(providerSearch.toLowerCase()))
                        .slice(0, 15)
                        .map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setSelectedProvider(p);
                              setProviderSearch(p);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
                          >
                            📦 {p}
                          </button>
                        ))}
                      {realProviders.filter(p => p.toLowerCase().includes(providerSearch.toLowerCase())).length === 0 && (
                        <div className="p-3 text-xs text-slate-400 text-center">
                          No se encontraron laboratorios con ese nombre en el ERP
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Provider Card */}
                  {selectedProvider && (
                    <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/60 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                          Laboratorio Seleccionado
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProvider('');
                            setProviderSearch('');
                          }}
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Cambiar
                        </button>
                      </div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {selectedProvider}
                      </p>
                      <div className="pt-2 border-t border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>SKUs teóricos del proveedor:</span>
                        <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                          {providerSkus.length} SKUs
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Modalidad de Conteo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewSessionMode('DOCUMENT')}
                  className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                    newSessionMode === 'DOCUMENT'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Normal
                    </span>
                    {newSessionMode === 'DOCUMENT' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    Muestra avance y compara con catálogo.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setNewSessionMode('BLIND')}
                  className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                    newSessionMode === 'BLIND'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 ring-2 ring-amber-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <EyeOff className="w-3.5 h-3.5" /> A Ciegas
                    </span>
                    {newSessionMode === 'BLIND' && <Check className="w-3.5 h-3.5 text-amber-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    Auditoría pura sin ver cantidades previas.
                  </p>
                </button>
              </div>
            </div>

            {/* Expiry Date Toggle (MM/YYYY) */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5 pr-2">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Capturar Mes y Año de Vencimiento
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">
                    Solicita MM/AAAA para control de caducidades.
                  </span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={newSessionRequireExpiry}
                  onChange={(e) => setNewSessionRequireExpiry(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Crear y Comenzar a Pistolear</span>
            </button>
          </form>
        </div>
      </div>

      {/* Right: Existing Sessions List */}
      <div className="order-1 lg:order-2 lg:col-span-7 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <span>Muebles Contados en Tienda</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[11px] font-bold font-mono">
              {sessions.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onCloudSync(false)}
            disabled={isSyncingCloud}
            className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Sincronizar y combinar sesiones con Google Sheets"
          >
            {isSyncingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            )}
            <span className="hidden sm:inline">{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Nube'}</span>
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800/80 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-600 flex items-center justify-center mb-3">
              <Barcode className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">Aún no hay muebles contados</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mb-4 leading-relaxed">
              Crea tu primer mueble o pasillo en el panel izquierdo para comenzar a pistolear productos.
            </p>
            <button
              type="button"
              onClick={() => applyPreset('QUICK')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Usar Plantilla Rápida</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1 max-h-[600px]">
            {sessions.map(s => {
              const totalLecturas = s.conteos.length;
              const totalUnidades = s.conteos.reduce((acc, curr) => acc + curr.cantidad, 0);

              return (
                <div
                  key={s.id}
                  onClick={() => onOpenSession(s)}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`p-3 rounded-2xl shrink-0 ${
                      s.estado === 'COMPLETED'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                        : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                    }`}>
                      {s.estado === 'COMPLETED' ? <CheckCircle2 className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                          {s.nombre}
                        </h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          s.modo === 'BLIND'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                        }`}>
                          {s.modo === 'BLIND' ? 'A Ciegas' : 'Normal'}
                        </span>
                        {s.requiereVencimiento && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 shrink-0">
                            Vencimientos
                          </span>
                        )}
                        {s.sincronizadoNube ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5 shrink-0" title="Respaldado en Google Sheets">
                            <Cloud className="w-3 h-3" /> Nube
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-0.5 shrink-0" title="Guardado localmente">
                            <CloudOff className="w-3 h-3" /> Local
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          📦 {formatLocaleNumber(totalUnidades)} unidades
                        </span>
                        <span>•</span>
                        <span>{totalLecturas} registros</span>
                        <span>•</span>
                        <span>📅 {new Date(s.fechaInicio).toLocaleDateString('es-CL')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBackupSessionToCloud(s);
                      }}
                      className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      title="Respaldar en la nube"
                    >
                      <CloudUpload className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSession(s);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer active:scale-95"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Contar</span>
                    </button>
                    <button
                      onClick={(e) => onDeleteSession(s.id, e)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      title="Eliminar mueble"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      </div>

    </div>
  );
};
