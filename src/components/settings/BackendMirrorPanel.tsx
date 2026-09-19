import React, { useState } from 'react';
import { 
  Database, Server, Zap, Shield, RefreshCw, CheckCircle2, 
  AlertTriangle, ArrowRightLeft, Activity, Terminal, Key, Globe
} from 'lucide-react';
import { SheetConfig, BackendMirrorConfig, InventoryItem } from '../../types';
import { backendMirrorService, MirrorTestResult, MirrorLogEntry } from '../../services/backendMirrorService';

interface BackendMirrorPanelProps {
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
  saveConfig: (newConfig: SheetConfig) => void;
  activeSheetTitle?: string;
  headers?: string[];
  sampleItems?: InventoryItem[];
}

export const BackendMirrorPanel: React.FC<BackendMirrorPanelProps> = ({
  sheetConfig,
  setSheetConfig,
  saveConfig,
  activeSheetTitle = 'Hoja Activa',
  headers = [],
  sampleItems = []
}) => {
  const currentConfig: BackendMirrorConfig = sheetConfig.backendMirror || {
    enabled: false,
    provider: 'custom_rest',
    endpointUrl: '',
    apiKey: '',
    syncMode: 'dual_write',
    conflictStrategy: 'last_write_wins',
    autoSyncIntervalSec: 60
  };

  const [testResult, setTestResult] = useState<MirrorTestResult | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSyncingNow, setIsSyncingNow] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<MirrorLogEntry[]>(backendMirrorService.getLogs());

  const updateConfig = (patch: Partial<BackendMirrorConfig>) => {
    const updated: BackendMirrorConfig = { ...currentConfig, ...patch };
    const next: SheetConfig = { ...sheetConfig, backendMirror: updated };
    setSheetConfig(next);
    saveConfig(next);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await backendMirrorService.testConnection(currentConfig);
      setTestResult(res);
      setLogs(backendMirrorService.getLogs());
    } catch (e: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: `Error al probar conexión: ${e.message}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncCurrentSheet = async () => {
    if (!currentConfig.enabled || !currentConfig.endpointUrl) {
      alert('Debes habilitar el espejo e ingresar una URL de endpoint válida.');
      return;
    }

    setIsSyncingNow(true);
    setSyncStatusMsg(null);
    try {
      const res = await backendMirrorService.syncSheetToMirror(
        currentConfig,
        activeSheetTitle,
        headers,
        sampleItems
      );
      if (res.error) {
        setSyncStatusMsg(`Error: ${res.error}`);
      } else {
        const nowIso = new Date().toISOString();
        updateConfig({ lastSyncTimestamp: nowIso });
        setSyncStatusMsg(`¡Sincronización exitosa! ${res.mirroredCount} registros replicados.`);
      }
      setLogs(backendMirrorService.getLogs());
    } catch (err: any) {
      setSyncStatusMsg(`Error: ${err.message}`);
    } finally {
      setIsSyncingNow(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* EXPLANATORY HEADER BANNER */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-200 dark:border-indigo-800/60 p-4 rounded-2xl flex items-start gap-3">
        <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md shrink-0 mt-0.5">
          <Database className="w-5 h-5" />
        </div>
        <div className="text-xs text-indigo-900 dark:text-indigo-200 space-y-1">
          <p className="font-bold text-sm text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
            Espejo de Backend y Transición Multi-Base de Datos
            <span className="bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full text-[10px]">
              Alta Concurrencia
            </span>
          </p>
          <p className="leading-relaxed">
            Permite mantener una base de datos secundaria (PostgreSQL, Supabase o REST API) sincronizada en tiempo real junto con Google Sheets. 
            Esencial para conteos masivos en farmacia, reduciendo la latencia de guardado de <strong>~2.500ms</strong> a menos de <strong>150ms</strong> y evitando colisiones entre operadores.
          </p>
        </div>
      </div>

      {/* MASTER TOGGLE */}
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${currentConfig.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
            <Server className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-slate-800 dark:text-slate-200 text-sm block">
              Activar Espejo de Base de Datos
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {currentConfig.enabled 
                ? 'El sistema replica automáticamente cada inserción, edición y eliminación en el backend espejo.' 
                : 'Desactivado. La aplicación opera exclusivamente con Google Sheets y almacenamiento local IndexedDB.'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateConfig({ enabled: !currentConfig.enabled })}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            currentConfig.enabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              currentConfig.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* CONFIGURATION FORM */}
      <div className={`space-y-4 transition-opacity duration-200 ${currentConfig.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
        
        {/* PROVIDER & SYNC MODE ROW */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-blue-500" /> Proveedor de Base de Datos
            </label>
            <select
              value={currentConfig.provider}
              onChange={(e) => updateConfig({ provider: e.target.value as any })}
              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="custom_rest">Custom REST API / Microservicio</option>
              <option value="supabase">Supabase (PostgreSQL)</option>
              <option value="postgresql">PostgreSQL Directo</option>
              <option value="firebase">Firebase / Cloud Firestore</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-500" /> Modo de Operación
            </label>
            <select
              value={currentConfig.syncMode}
              onChange={(e) => updateConfig({ syncMode: e.target.value as any })}
              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="dual_write">Escritura Dual (Sheets + Espejo en Paralelo)</option>
              <option value="mirror_first">Espejo Primero (Baja latencia, volcado asíncrono)</option>
              <option value="backup_only">Solo Respaldo (Espejo pasivo)</option>
            </select>
          </div>
        </div>

        {/* ENDPOINT URL */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-blue-500" /> URL del Endpoint Espejo
          </label>
          <input
            type="url"
            value={currentConfig.endpointUrl}
            onChange={(e) => updateConfig({ endpointUrl: e.target.value })}
            placeholder="https://tu-servidor-o-supabase.co/rest/v1/inventario"
            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
          />
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            Endpoint receptor que procesa las peticiones POST con los registros replicados.
          </span>
        </div>

        {/* API KEY / TOKEN & CONFLICT STRATEGY */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-500" /> Token de Autorización / API Key (Opcional)
            </label>
            <input
              type="password"
              value={currentConfig.apiKey || ''}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              placeholder="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-500" /> Resolución de Conflictos (Concurrencia)
            </label>
            <select
              value={currentConfig.conflictStrategy}
              onChange={(e) => updateConfig({ conflictStrategy: e.target.value as any })}
              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="last_write_wins">Última Escritura Gana (Atomic Timestamp)</option>
              <option value="server_wins">Servidor Central Prevalece</option>
              <option value="client_wins">Terminal Local Prevalece</option>
            </select>
          </div>
        </div>

        {/* ACTION BUTTONS: TEST & MANUAL SYNC */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !currentConfig.endpointUrl}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Probar Conexión Espejo
          </button>

          <button
            type="button"
            onClick={handleSyncCurrentSheet}
            disabled={isSyncingNow || !currentConfig.endpointUrl}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncingNow ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Replicar Hoja Activa ({sampleItems.length} filas)
          </button>

          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Dispositivo Local: <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px]">{backendMirrorService.getDeviceId()}</code>
          </span>
        </div>

        {/* TEST RESULT BADGE */}
        {testResult && (
          <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
            testResult.success 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' 
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}>
            {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span className="font-medium">{testResult.message}</span>
          </div>
        )}

        {/* SYNC STATUS MESSAGE */}
        {syncStatusMsg && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 rounded-xl text-xs flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0 text-blue-500" />
            <span>{syncStatusMsg}</span>
          </div>
        )}

        {/* TELEMETRY & AUDIT LOGS */}
        <div className="mt-4 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-950">
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Registro de Eventos y Telemetría del Espejo</span>
            </div>
            <button
              type="button"
              onClick={() => setLogs(backendMirrorService.getLogs())}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              <RefreshCw className="w-3 h-3" /> Actualizar
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px]">
            {logs.length === 0 ? (
              <p className="text-slate-400 dark:text-slate-500 italic">No hay eventos registrados aún.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-slate-400 shrink-0">[{log.timestamp}]</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                    log.status === 'ok' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' :
                    log.status === 'error' ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300' :
                    'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  }`}>
                    {log.action}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
