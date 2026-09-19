import React, { useState } from 'react';
import { Play, Check, FileSpreadsheet, EyeOff, Calendar, MapPin, Database, Loader2, Cloud, CloudOff, CloudUpload, Barcode, Zap, Trash2, ChevronRight, CheckCircle2 } from 'lucide-react';
import { StockCountSession, StockCountMode } from '../../types';
import { formatLocaleNumber } from '../../utils/pureCalculations';

const CURRENT_YEAR = new Date().getFullYear();

export interface NewSessionConfig {
  nombre: string;
  modo: StockCountMode;
  requiereVencimiento: boolean;
  rangoAnos?: { desde: number; hasta: number };
  ubicacion: string;
}

export interface StockCountSessionsListViewProps {
  sessions: StockCountSession[];
  isSyncingCloud: boolean;
  onCreateSession: (config: NewSessionConfig) => void;
  onOpenSession: (session: StockCountSession) => void;
  onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
  onBackupSessionToCloud: (session: StockCountSession) => void;
  onCloudSync: (silent: boolean) => void;
}

export const StockCountSessionsListView: React.FC<StockCountSessionsListViewProps> = ({
  sessions,
  isSyncingCloud,
  onCreateSession,
  onOpenSession,
  onDeleteSession,
  onBackupSessionToCloud,
  onCloudSync,
}) => {
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionMode, setNewSessionMode] = useState<StockCountMode>('BLIND');
  const [newSessionRequireExpiry, setNewSessionRequireExpiry] = useState<boolean>(true);
  const [newSessionYearFrom, setNewSessionYearFrom] = useState<number>(CURRENT_YEAR);
  const [newSessionYearTo, setNewSessionYearTo] = useState<number>(CURRENT_YEAR + 3);
  const [newSessionLocation, setNewSessionLocation] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateSession({
      nombre: newSessionName,
      modo: newSessionMode,
      requiereVencimiento: newSessionRequireExpiry,
      rangoAnos: newSessionRequireExpiry ? { desde: newSessionYearFrom, hasta: newSessionYearTo } : undefined,
      ubicacion: newSessionLocation,
    });
    setNewSessionName('');
    setNewSessionLocation('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

      {/* Left: New Session Creator */}
      <div className="order-2 lg:order-1 lg:col-span-5 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-blue-600"></div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Nueva Sesión de Conteo
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                Nombre o Identificador de la Sesión
              </label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Ej: Pasillo 3 - Lácteos y Refrigerados"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                Modalidad de Conteo
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setNewSessionMode('BLIND')}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    newSessionMode === 'BLIND'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <EyeOff className="w-3.5 h-3.5" /> A Ciegas
                    </span>
                    {newSessionMode === 'BLIND' && <Check className="w-3.5 h-3.5 text-amber-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    Sin stock teórico visible al operario. Auditoría limpia.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setNewSessionMode('DOCUMENT')}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    newSessionMode === 'DOCUMENT'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Contra Doc.
                    </span>
                    {newSessionMode === 'DOCUMENT' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                    Valida contra la hoja activa y muestra avance en tiempo real.
                  </p>
                </button>
              </div>
            </div>

            {/* Expiry Date Toggle (MM/YYYY) */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5 pr-2">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Capturar Fecha de Vencimiento
                  </span>
                  <span className="text-[11px] text-slate-400 block leading-tight">
                    Registra Mes y Año (genera <code className="text-blue-600 dark:text-blue-400 font-mono">CU_VC</code> y calcula <code className="text-blue-600 dark:text-blue-400 font-mono">FECHA_VC</code>).
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

            {/* Range of Years (Configurable) */}
            {newSessionRequireExpiry && (
              <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/50 flex flex-col gap-2.5 animate-in slide-in-from-top-3 duration-150">
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200 block">
                  Rango de Años de Interés
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Desde Año</label>
                    <select
                      value={newSessionYearFrom}
                      onChange={(e) => {
                        const from = parseInt(e.target.value);
                        setNewSessionYearFrom(from);
                        if (newSessionYearTo < from) {
                          setNewSessionYearTo(from);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-700 dark:text-slate-200"
                    >
                      {Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - 2 + i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Hasta Año</label>
                    <select
                      value={newSessionYearTo}
                      onChange={(e) => setNewSessionYearTo(Math.max(newSessionYearFrom, parseInt(e.target.value)))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-700 dark:text-slate-200"
                    >
                      {Array.from({ length: 8 }, (_, i) => newSessionYearFrom + i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Quick suggestion chips for furniture name */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['Góndola 1', 'Góndola 2', 'Pasillo A', 'Refrigerados', 'Vitrina Principal', 'Bodega'].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setNewSessionName(chip)}
                  className="px-2 py-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-700/80 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  + {chip}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" /> Ubicación o Bodega (Opcional)
              </label>
              <input
                type="text"
                value={newSessionLocation}
                onChange={(e) => setNewSessionLocation(e.target.value)}
                placeholder="Ej: Bodega Central - Rack A4"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Comenzar Conteo Físico</span>
            </button>
          </form>
        </div>
      </div>

      {/* Right: Existing Sessions List */}
      <div className="order-1 lg:order-2 lg:col-span-7 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            <span>Historial de Sesiones ({sessions.length})</span>
          </h3>
          <button
            type="button"
            onClick={() => onCloudSync(false)}
            disabled={isSyncingCloud}
            className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Sincronizar y combinar sesiones de todos los dispositivos móviles"
          >
            {isSyncingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            )}
            <span>{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Todos'}</span>
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-center">
            <Barcode className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No hay sesiones de conteo registradas</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Inicia tu primera sesión de conteo a ciegas o contra documento para auditar inventario físico.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
            {sessions.map(s => {
              const totalLecturas = s.conteos.length;
              const totalUnidades = s.conteos.reduce((acc, curr) => acc + curr.cantidad, 0);
              const deviceLabel = s.deviceId ? (s.deviceId.includes('movil') ? '📱 ' + s.deviceId : '💻 ' + s.deviceId) : 'Dispositivo';

              return (
                <div
                  key={s.id}
                  onClick={() => onOpenSession(s)}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`p-3 rounded-xl shrink-0 ${
                      s.estado === 'COMPLETED'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                        : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                    }`}>
                      {s.estado === 'COMPLETED' ? <CheckCircle2 className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                          {s.nombre}
                        </h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          s.modo === 'BLIND'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300'
                        }`}>
                          {s.modo === 'BLIND' ? 'A Ciegas' : 'Contra Doc.'}
                        </span>
                        {s.requiereVencimiento && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 shrink-0">
                            MM/YYYY
                          </span>
                        )}
                        {s.sincronizadoNube ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5 shrink-0" title="Respaldado en Google Sheets">
                            <Cloud className="w-3 h-3" /> Nube
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-0.5 shrink-0" title="Pendiente de respaldo en nube">
                            <CloudOff className="w-3 h-3" /> Local
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 mt-1 flex-wrap">
                        <span>📅 {new Date(s.fechaInicio).toLocaleDateString('es-CL')}</span>
                        <span>📦 {totalLecturas} lecturas ({formatLocaleNumber(totalUnidades)} unids)</span>
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          {s.estado === 'COMPLETED' ? 'Completado' : 'En progreso'}
                        </span>
                        <span>•</span>
                        <span className="text-slate-500 font-mono text-[11px]">{deviceLabel}</span>
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
                      className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      title="Respaldar este mueble en la nube de Google Sheets"
                    >
                      <CloudUpload className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSession(s);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer active:scale-95"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Pistolear</span>
                    </button>
                    <button
                      onClick={(e) => onDeleteSession(s.id, e)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      title="Eliminar sesión"
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