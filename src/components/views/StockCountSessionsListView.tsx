import React, { useState } from 'react';
import { Play, Check, FileSpreadsheet, EyeOff, Calendar, MapPin, Database, Loader2, Cloud, CloudOff, CloudUpload, Barcode, Zap, Trash2, ChevronRight, CheckCircle2, Sparkles, HelpCircle } from 'lucide-react';
import { StockCountSession, StockCountMode } from '../../types';
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
  isSyncingCloud: boolean;
  realProviders?: string[];
  onCreateSession: (config: NewSessionConfig) => void;
  onOpenSession: (session: StockCountSession) => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  onBackupSessionToCloud: (session: StockCountSession) => void;
  onCloudSync: (silent: boolean) => void;
}

export const StockCountSessionsListView: React.FC<StockCountSessionsListViewProps> = ({
  sessions,
  isSyncingCloud,
  realProviders = [],
  onCreateSession,
  onOpenSession,
  onDeleteSession,
  onBackupSessionToCloud,
  onCloudSync,
}) => {
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionMode, setNewSessionMode] = useState<StockCountMode>('BLIND');
  const [newSessionRequireExpiry, setNewSessionRequireExpiry] = useState<boolean>(false);
  const [newSessionYearFrom, setNewSessionYearFrom] = useState<number>(CURRENT_YEAR);
  const [newSessionYearTo, setNewSessionYearTo] = useState<number>(CURRENT_YEAR + 3);
  const [newSessionLocation, setNewSessionLocation] = useState('');

  // Preset quick selectors
  const applyPreset = (preset: 'QUICK' | 'EXPIRY' | 'BLIND_AUDIT') => {
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
    const finalName = newSessionName.trim() || `Mueble ${sessions.length + 1} - ${new Date().toLocaleDateString('es-CL')}`;
    onCreateSession({
      nombre: finalName,
      modo: newSessionMode,
      requiereVencimiento: newSessionRequireExpiry,
      rangoAnos: newSessionRequireExpiry ? { desde: newSessionYearFrom, hasta: newSessionYearTo } : undefined,
      ubicacion: newSessionLocation.trim() || finalName,
    });
    setNewSessionName('');
    setNewSessionLocation('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-7xl mx-auto w-full">

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
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nombre del Mueble, Sección o Proveedor
              </label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Ej: Mueble 1, Pasillo 2 o Lab. Bagó"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>

            {/* Quick chips for furniture or supplier name */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1.5">
                {realProviders.length > 0 ? `Proveedores Reales en Foto ERP (${realProviders.length}):` : 'Sugerencias Rápidas de Sección:'}
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                {(realProviders.length > 0 ? realProviders : ['Mueble 1', 'Mueble 2', 'Pasillo 1', 'Refrigerados', 'Bodega']).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setNewSessionName(realProviders.length > 0 ? `Proveedor: ${chip}` : chip);
                      setNewSessionLocation(chip);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

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
  );
};
