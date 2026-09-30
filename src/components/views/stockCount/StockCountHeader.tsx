import React from 'react';
import { Barcode, Cloud, Loader2, X, FileSpreadsheet, Layers, Zap, CheckCircle2, Store, HelpCircle, MapPin } from 'lucide-react';
import { StockCountSession } from '../../../types';
import { formatLocaleNumber } from '../../../utils/pureCalculations';

interface StockCountHeaderProps {
  viewState: 'CAMPAIGN' | 'LIST' | 'COUNTING' | 'RECONCILIATION';
  setViewState: (view: 'CAMPAIGN' | 'LIST' | 'COUNTING' | 'RECONCILIATION') => void;
  currentSession: StockCountSession | null;
  sessions: StockCountSession[];
  setActiveSessionId: (id: string) => void;
  isSyncingCloud: boolean;
  lastCloudSyncDate: string | null;
  erpSnapshotCount: number;
  isBlind: boolean;
  handleCloudSync: (force?: boolean) => Promise<void>;
  setIsErpUploadModalOpen: (open: boolean) => void;
  setIsWorkflowGuideModalOpen: (open: boolean) => void;
  handleSwitchToTerminal: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  onClose?: () => void;
  navigate: (path: string) => void;
  setForceDesktopCampaignView: (val: boolean) => void;
}

export const StockCountHeader: React.FC<StockCountHeaderProps> = ({
  viewState,
  setViewState,
  currentSession,
  sessions,
  setActiveSessionId,
  isSyncingCloud,
  lastCloudSyncDate,
  erpSnapshotCount,
  isBlind,
  handleCloudSync,
  setIsErpUploadModalOpen,
  setIsWorkflowGuideModalOpen,
  handleSwitchToTerminal,
  showToast,
  onClose,
  navigate,
  setForceDesktopCampaignView
}) => {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 shrink-0">
      <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="p-2 sm:p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20 shrink-0">
            <Barcode className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base md:text-lg font-bold tracking-tight truncate">
                Conteo de Existencias
              </h2>
              {currentSession && viewState !== 'CAMPAIGN' && (
                <span className={`text-[10px] sm:text-[11px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                  currentSession.modo === 'BLIND' 
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                }`}>
                  {currentSession.modo === 'BLIND' ? 'A Ciegas' : 'Contra Doc.'}
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
              {viewState === 'CAMPAIGN' && 'Consolidación global, snapshots de ERP y cuadratura de farmacia.'}
              {viewState === 'LIST' && 'Administra sesiones de conteo por mueble o pasillo.'}
              {viewState === 'COUNTING' && `${currentSession?.nombre || 'Sesión activa'} • ${currentSession?.conteos.length || 0} lecturas`}
              {viewState === 'RECONCILIATION' && `Cuadratura: ${currentSession?.nombre || ''}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Cloud Sync Button */}
          <button
            type="button"
            onClick={() => handleCloudSync(false)}
            disabled={isSyncingCloud}
            className="px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
            title="Sincronizar campañas y stock teórico desde el PC de oficina (Google Sheets)"
          >
            {isSyncingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            )}
            <span className="hidden sm:inline">
              {isSyncingCloud ? 'Sincronizando...' : 'Oficina / Nube'}
            </span>
            {lastCloudSyncDate && (
              <span className="text-[10px] text-blue-500/80 dark:text-blue-400/80 font-mono hidden md:inline">
                ({lastCloudSyncDate})
              </span>
            )}
          </button>

          <button
            onClick={() => onClose ? onClose() : navigate('/')}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Cerrar módulo de conteo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sub-bar Navigation Pills & Direct ERP Action Button */}
      <div className="px-3 sm:px-6 py-2 bg-slate-100/90 dark:bg-slate-900/80 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* DIRECT ERP UPLOAD TRIGGER BUTTON */}
          <button
            type="button"
            onClick={() => setIsErpUploadModalOpen(true)}
            className={`px-3 sm:px-3.5 py-1.5 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs active:scale-95 ${
              erpSnapshotCount > 0
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white animate-pulse'
            }`}
            title="Cargar o actualizar archivo de stock ERP (.xlsx, .csv)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>
              {erpSnapshotCount > 0 
                ? `ERP: ${formatLocaleNumber(erpSnapshotCount)} SKUs` 
                : '📂 Cargar Archivo ERP'}
            </span>
          </button>

          <span className="text-slate-300 dark:text-slate-700 mx-0.5 font-light">|</span>

          {/* Step 1: Sesiones por Mueble */}
          <button
            onClick={() => setViewState('LIST')}
            className={`px-3 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              viewState === 'LIST'
                ? 'bg-indigo-600 text-white shadow-sm font-black'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>1. Muebles ({sessions.length})</span>
          </button>

          {/* Step 2: Active Pistoleo */}
          <button
            onClick={() => handleSwitchToTerminal()}
            className={`px-3 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              viewState === 'COUNTING'
                ? 'bg-amber-500 text-white shadow-sm font-black'
                : currentSession
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 font-bold border border-amber-200 dark:border-amber-800/50'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${currentSession ? 'text-amber-500 fill-amber-500' : ''}`} />
            <span>2. Pistolear {currentSession ? `(${currentSession.conteos.length})` : ''}</span>
          </button>

          {/* Step 3: Cuadratura */}
          <button
            onClick={() => {
              if (currentSession) {
                setViewState('RECONCILIATION');
              } else if (sessions.length > 0) {
                setActiveSessionId(sessions[0].id);
                setViewState('RECONCILIATION');
              } else {
                setViewState('LIST');
                showToast('Crea o selecciona un mueble primero para ver su cuadratura.', 'info');
              }
            }}
            className={`px-3 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              viewState === 'RECONCILIATION'
                ? 'bg-emerald-600 text-white shadow-sm font-black'
                : currentSession
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/50'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>3. Cuadratura</span>
          </button>

          {/* Step 4: Campaña Farmacia / Tienda Completa */}
          {!(isBlind && viewState === 'COUNTING') && (
            <button
              onClick={() => {
                setForceDesktopCampaignView(false);
                setViewState('CAMPAIGN');
              }}
              className={`px-3 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                viewState === 'CAMPAIGN'
                  ? 'bg-purple-600 text-white shadow-sm font-black'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>4. Tienda Completa</span>
            </button>
          )}

          {/* Guided Flow Help Button */}
          <button
            type="button"
            onClick={() => setIsWorkflowGuideModalOpen(true)}
            className="p-1.5 text-slate-500 hover:text-amber-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer shrink-0"
            title="¿Cómo funciona el flujo de conteo?"
          >
            <HelpCircle className="w-4 h-4 text-amber-500" />
          </button>
        </div>

        {/* Quick Session / Furniture Switcher Dropdown */}
        {sessions.length > 0 && (
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0 max-w-[180px] sm:max-w-[240px]">
            <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <select
              value={currentSession?.id || ''}
              onChange={(e) => {
                if (e.target.value === '__NEW__') {
                  setViewState('LIST');
                } else if (e.target.value) {
                  setActiveSessionId(e.target.value);
                  setViewState('COUNTING');
                }
              }}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 outline-none cursor-pointer w-full truncate"
            >
              {sessions.map(s => (
                <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                  {s.nombre} ({s.conteos.reduce((a, b) => a + b.cantidad, 0)} u)
                </option>
              ))}
              <option value="__NEW__" className="bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold">
                ➕ Crear Mueble / Sección...
              </option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
};
