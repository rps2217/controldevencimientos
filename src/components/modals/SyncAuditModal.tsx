import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, RefreshCw, Wifi, WifiOff, Database, History, 
  CheckCircle2, Clock, AlertTriangle, Trash2, Send, 
  Copy, Check, HardDrive, ShieldCheck, Search, Activity,
  RotateCw, PlusCircle, AlertOctagon, ChevronDown, ChevronUp,
  FileText
} from 'lucide-react';
import { OfflineMutation, AuditLogEntry, indexedDbService } from '../../db/indexedDbService';
import { ConnectionHealthStatus } from '../../hooks/useOfflineSync';

interface SyncAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  offlineQueue: OfflineMutation[];
  auditLog: AuditLogEntry[];
  isOffline: boolean;
  isSyncing: boolean;
  latencyMs: number | null;
  connectionStatus: ConnectionHealthStatus;
  lastHealthCheck: Date | null;
  healthErrorMessage: string | null;
  testConnectionHealth: () => Promise<any>;
  syncQueue: (targetMutationId?: string) => Promise<any>;
  removeMutation: (id: string) => Promise<void>;
  discardMutation?: (id: string, reason?: string) => Promise<any>;
  discardAllFailedMutations?: () => Promise<number>;
  retryMutation?: (id: string) => Promise<any>;
  retryAllFailedMutations?: () => Promise<any>;
  forkMutationAsAppend?: (id: string) => Promise<any>;
  clearQueue: () => Promise<void>;
  clearAuditLog: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
}

export const SyncAuditModal: React.FC<SyncAuditModalProps> = ({
  isOpen,
  onClose,
  offlineQueue,
  auditLog,
  isOffline,
  isSyncing,
  latencyMs,
  connectionStatus,
  lastHealthCheck,
  healthErrorMessage,
  testConnectionHealth,
  syncQueue,
  removeMutation,
  discardMutation,
  discardAllFailedMutations,
  retryMutation,
  retryAllFailedMutations,
  forkMutationAsAppend,
  clearQueue,
  clearAuditLog,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'audit' | 'storage'>('queue');
  const [queueFilter, setQueueFilter] = useState<'all' | 'conflicts' | 'pending'>('all');
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'synced' | 'failed' | 'discard'>('all');
  const [copiedAudit, setCopiedAudit] = useState(false);
  
  // Conflict Resolution Dialog States
  const [itemToDiscard, setItemToDiscard] = useState<OfflineMutation | null>(null);
  const [isConfirmDiscardAllOpen, setIsConfirmDiscardAllOpen] = useState(false);
  const [expandedPayloadIds, setExpandedPayloadIds] = useState<Set<string>>(new Set());
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  const [storageStats, setStorageStats] = useState<{
    usageMb: number;
    quotaMb: number;
    percentUsed: number;
    isSupported: boolean;
  } | null>(null);

  // Load storage usage stats when opened
  useEffect(() => {
    if (isOpen) {
      indexedDbService.getStorageStats().then(setStorageStats);
    }
  }, [isOpen, offlineQueue.length, auditLog.length]);

  // Compute failed/conflicting mutations
  const failedMutations = useMemo(() => {
    return offlineQueue.filter(m => m.status === 'failed' || (m.attempts && m.attempts >= 3) || Boolean(m.lastError));
  }, [offlineQueue]);

  // If there are conflicts and user opens the modal, default to 'all' or show the conflicts prominently
  const filteredQueue = useMemo(() => {
    if (queueFilter === 'conflicts') {
      return failedMutations;
    }
    if (queueFilter === 'pending') {
      return offlineQueue.filter(m => !(m.status === 'failed' || (m.attempts && m.attempts >= 3) || Boolean(m.lastError)));
    }
    return offlineQueue;
  }, [offlineQueue, queueFilter, failedMutations]);

  const handleTestPing = async () => {
    setIsTestingPing(true);
    try {
      const res = await testConnectionHealth();
      if (res.success) {
        showToast(`Conexión excelente con Google Apps Script (${res.latencyMs} ms)`, 'success', 'Salud de Red');
      } else {
        showToast(res.error || 'No se pudo conectar a Google Apps Script', 'warning', 'Diagnóstico de Red');
      }
    } finally {
      setIsTestingPing(false);
    }
  };

  const handleSyncAll = async () => {
    if (offlineQueue.length === 0) return;
    const res = await syncQueue();
    if (res.success) {
      showToast(`¡Se sincronizaron exitosamente ${res.count} mutaciones!`, 'success', 'Sincronización Completa');
    } else if (res.errors && res.errors.length > 0) {
      showToast(`Sincronización parcial con errores: ${res.errors.join(', ')}`, 'error', 'Sincronización');
    }
  };

  const togglePayloadExpand = (id: string) => {
    setExpandedPayloadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyMutationData = (item: OfflineMutation) => {
    const dataToCopy = {
      id: item.id,
      tipoOperacion: item.type,
      hoja: item.sheetTitle,
      identificadorClave: item.entityKey || item.keyValue,
      filaIndice: item.rowIndex,
      creadoEl: new Date(item.createdAt).toISOString(),
      reintentos: item.attempts,
      ultimoError: item.lastError,
      datosRegistro: item.values
    };
    navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2));
    showToast('Datos completos del registro copiados al portapapeles', 'success');
  };

  // Retry a single failed mutation
  const handleRetrySingle = async (item: OfflineMutation) => {
    if (!retryMutation) return;
    setActionInProgressId(item.id);
    try {
      showToast(`Reintentando sincronización de ${item.entityKey || item.sheetTitle}...`, 'info');
      const res = await retryMutation(item.id);
      if (res && res.success) {
        showToast('¡Registro sincronizado exitosamente con Google Sheets!', 'success');
      } else if (res && res.errors && res.errors.length > 0) {
        showToast(`Error al reintentar: ${res.errors.join(', ')}`, 'error');
      }
    } catch (err: any) {
      showToast(`Fallo al reintentar: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Retry all failed/conflicted mutations
  const handleRetryAllFailed = async () => {
    if (!retryAllFailedMutations) return;
    try {
      showToast(`Reintentando ${failedMutations.length} registro(s) con conflicto...`, 'info');
      const res = await retryAllFailedMutations();
      if (res && res.success) {
        showToast('¡Registros con conflicto sincronizados exitosamente!', 'success');
      } else if (res && res.errors && res.errors.length > 0) {
        showToast(`Reintento parcial con observaciones: ${res.errors.join(', ')}`, 'warning');
      }
    } catch (err: any) {
      showToast(`Error al reintentar conflictos: ${err.message}`, 'error');
    }
  };

  // Fork an update mutation as an append to avoid losing data
  const handleForkAsAppend = async (item: OfflineMutation) => {
    if (!forkMutationAsAppend) return;
    setActionInProgressId(item.id);
    try {
      await forkMutationAsAppend(item.id);
      showToast('Registro convertido a anexo nuevo. Se sincronizará como nueva fila en Google Sheets.', 'success');
    } catch (err: any) {
      showToast(`Error al convertir a nuevo registro: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  // Confirm single item discard
  const handleConfirmDiscardItem = async (reason?: string) => {
    if (!itemToDiscard) return;
    try {
      if (discardMutation) {
        await discardMutation(itemToDiscard.id, reason || 'Descarte manual por el usuario (resolución de conflicto)');
      } else {
        await removeMutation(itemToDiscard.id);
      }
      showToast('Intento de sincronización descartado y respaldado en Auditoría.', 'info');
    } catch (err: any) {
      showToast(`Error al descartar registro: ${err.message}`, 'error');
    } finally {
      setItemToDiscard(null);
    }
  };

  // Confirm bulk discard of all failed mutations
  const handleConfirmDiscardAllFailed = async () => {
    try {
      if (discardAllFailedMutations) {
        const count = await discardAllFailedMutations();
        showToast(`Se descartaron ${count} registro(s) con problemas de conciliación. Quedaron respaldados en Auditoría.`, 'info');
      } else {
        await clearQueue();
        showToast('Cola de sincronización vaciada.', 'info');
      }
    } catch (err: any) {
      showToast(`Error al descartar conflictos: ${err.message}`, 'error');
    } finally {
      setIsConfirmDiscardAllOpen(false);
    }
  };

  const filteredAuditLog = useMemo(() => {
    return auditLog.filter(entry => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'discard' && entry.action !== 'discard') return false;
        if (statusFilter !== 'discard' && entry.status !== statusFilter) return false;
      }
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        entry.description.toLowerCase().includes(q) ||
        entry.sheetTitle.toLowerCase().includes(q) ||
        (entry.entityKey && entry.entityKey.toLowerCase().includes(q)) ||
        (entry.errorMessage && entry.errorMessage.toLowerCase().includes(q))
      );
    });
  }, [auditLog, statusFilter, searchTerm]);

  const handleCopyAudit = () => {
    const jsonStr = JSON.stringify(auditLog, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedAudit(true);
    setTimeout(() => setCopiedAudit(false), 2000);
    showToast('Historial completo de auditoría copiado al portapapeles', 'info');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-850/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Conciliación, Sincronización y Auditoría
                </h2>
                {failedMutations.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                    {failedMutations.length} Conflicto{failedMutations.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Control de mutaciones offline, resolución de discrepancias de sincronización y registro forense
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONNECTION TELEMETRY BAR */}
        <div className="px-5 py-3 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Status Pill */}
            <div className="flex items-center gap-1.5">
              {isOffline ? (
                <>
                  <WifiOff className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold text-amber-700 dark:text-amber-400">Modo Offline</span>
                </>
              ) : connectionStatus === 'connected' ? (
                <>
                  <Wifi className="w-4 h-4 text-emerald-500" />
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Conectado a Google Sheets</span>
                </>
              ) : connectionStatus === 'syncing' ? (
                <>
                  <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                  <span className="font-semibold text-blue-700 dark:text-blue-400">Sincronizando con Google Sheets...</span>
                </>
              ) : connectionStatus === 'unconfigured' ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold text-amber-700 dark:text-amber-400">Sin Configurar</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span className="font-semibold text-red-700 dark:text-red-400">Desconectado</span>
                </>
              )}
            </div>

            {/* Latency */}
            {latencyMs !== null && (
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-mono">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                <span>{latencyMs} ms</span>
              </div>
            )}

            {/* Storage stats */}
            {storageStats && (
              <div className="hidden sm:flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                <span>IndexedDB: {storageStats.usageMb} MB ({storageStats.percentUsed}%)</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestPing}
              disabled={isTestingPing}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Comprobar latencia y salud con Google Apps Script"
            >
              <RefreshCw className={`w-3 h-3 ${isTestingPing ? 'animate-spin text-blue-500' : ''}`} />
              <span>Probar Conexión</span>
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="px-5 pt-3 pb-0 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'queue'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Cola Pendiente</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                failedMutations.length > 0
                  ? 'bg-rose-500 text-white'
                  : offlineQueue.length > 0
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                {offlineQueue.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Historial de Auditoría</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {auditLog.length}
              </span>
            </button>
          </div>

          {/* Action trigger based on active tab */}
          {activeTab === 'queue' && offlineQueue.length > 0 && (
            <div className="flex items-center gap-2 pb-2">
              <button
                onClick={handleSyncAll}
                disabled={isSyncing}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sincronizar Ahora</span>
              </button>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="flex items-center gap-2 pb-2">
              {auditLog.length > 0 && (
                <button
                  onClick={clearAuditLog}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                  title="Borrar historial local"
                >
                  Limpiar
                </button>
              )}
              <button
                onClick={handleCopyAudit}
                className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {copiedAudit ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAudit ? 'Copiado' : 'Copiar Registro'}</span>
              </button>
            </div>
          )}
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-5">
          
          {/* TAB 1: PENDING OFFLINE QUEUE */}
          {activeTab === 'queue' && (
            <div className="space-y-4">

              {/* CONFLICT MANAGEMENT ALERT BANNER (APPSHEET-STYLE RESOLUTION) */}
              {failedMutations.length > 0 && (
                <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200 shadow-2xs">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-rose-100 dark:bg-rose-900/60 rounded-xl text-rose-600 dark:text-rose-400 shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-rose-900 dark:text-rose-100">
                            {failedMutations.length} Conflicto{failedMutations.length > 1 ? 's' : ''} de Conciliación Detectado{failedMutations.length > 1 ? 's' : ''}
                          </h4>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-200 dark:bg-rose-900/80 text-rose-800 dark:text-rose-200">
                            Acción Recomendada
                          </span>
                        </div>
                        <p className="text-xs text-rose-800 dark:text-rose-300 mt-1 max-w-xl leading-relaxed">
                          Estos registros no pudieron integrarse a Google Sheets (por ejemplo, la fila fue modificada o borrada por otro dispositivo, o se rechazó por validación). Puedes descartar el intento para desbloquear la cola, reintentar o guardarlo como un nuevo registro.
                        </p>
                      </div>
                    </div>

                    {/* Batch Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        onClick={handleRetryAllFailed}
                        disabled={isSyncing}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-slate-700 text-rose-700 dark:text-rose-300 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                        title="Reintentar todas las mutaciones fallidas"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Reintentar Conflictos</span>
                      </button>

                      <button
                        onClick={() => setIsConfirmDiscardAllOpen(true)}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Descartar todos los intentos con fallas para desbloquear la cola"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Descartar Conflictos ({failedMutations.length})</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* QUEUE FILTER PILLS (IF ITEMS EXIST) */}
              {offlineQueue.length > 0 && (
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 dark:text-slate-500 font-medium">Filtrar:</span>
                    <button
                      onClick={() => setQueueFilter('all')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                        queueFilter === 'all'
                          ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      Todos ({offlineQueue.length})
                    </button>

                    {failedMutations.length > 0 && (
                      <button
                        onClick={() => setQueueFilter('conflicts')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                          queueFilter === 'conflicts'
                            ? 'bg-rose-600 text-white'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-200'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>Conflictos ({failedMutations.length})</span>
                      </button>
                    )}

                    <button
                      onClick={() => setQueueFilter('pending')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                        queueFilter === 'pending'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      Pendientes ({offlineQueue.length - failedMutations.length})
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                    Mostrando {filteredQueue.length} de {offlineQueue.length}
                  </span>
                </div>
              )}

              {/* QUEUE LIST */}
              {offlineQueue.length === 0 ? (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Todos los cambios están sincronizados
                  </h3>
                  <p className="text-xs max-w-sm mt-1">
                    No hay mutaciones ni operaciones pendientes en la cola local. Todas las acciones se encuentran respaldadas en Google Sheets.
                  </p>
                </div>
              ) : filteredQueue.length === 0 ? (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500">
                  <p className="text-xs">No hay elementos en este filtro de la cola.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredQueue.map((item, idx) => {
                    const isConflict = item.status === 'failed' || (item.attempts && item.attempts >= 3) || Boolean(item.lastError);
                    const isExpanded = expandedPayloadIds.has(item.id);
                    const isOperating = actionInProgressId === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-xl border transition-all shadow-2xs ${
                          isConflict
                            ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/40 dark:bg-rose-950/20'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <span className="font-mono text-xs text-slate-400 dark:text-slate-500 w-5 text-right shrink-0 mt-0.5">
                              #{idx + 1}
                            </span>

                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold uppercase shrink-0 mt-0.5 ${
                              item.type === 'append' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' :
                              item.type === 'update' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800' :
                              'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800'
                            }`}>
                              {item.type}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 flex-wrap">
                                <span>Tabla: <span className="font-mono text-blue-600 dark:text-blue-400">{item.sheetTitle}</span></span>
                                {item.entityKey && (
                                  <span className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                                    Clave: {item.entityKey}
                                  </span>
                                )}
                                {item.rowIndex && (
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                    (Fila: {item.rowIndex})
                                  </span>
                                )}
                                {isConflict && (
                                  <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                                    ⚠️ Conflicto ({item.attempts} intentos)
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                                <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                                <span>•</span>
                                <span>ID: <code className="font-mono text-[10px]">{item.id.slice(0, 14)}...</code></span>
                              </div>

                              {/* ERROR MESSAGE DISPLAY */}
                              {item.lastError && (
                                <div className="mt-2 text-xs text-rose-700 dark:text-rose-400 bg-rose-100/70 dark:bg-rose-900/40 p-2 rounded-lg border border-rose-200 dark:border-rose-800/60 flex items-start gap-1.5">
                                  <AlertOctagon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <span className="font-mono text-[11px] leading-tight break-all">
                                    {item.lastError}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* ACTION BUTTONS */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                            {/* Copy payload */}
                            <button
                              onClick={() => handleCopyMutationData(item)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Copiar datos del registro al portapapeles"
                            >
                              <Copy className="w-4 h-4" />
                            </button>

                            {/* View / Toggle Payload Details */}
                            <button
                              onClick={() => togglePayloadExpand(item.id)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Ver valores adjuntos"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {/* Individual Retry Button */}
                            {retryMutation && (
                              <button
                                onClick={() => handleRetrySingle(item)}
                                disabled={isOperating || isSyncing}
                                className="px-2 py-1 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                title="Reintentar sincronizar este registro"
                              >
                                <RotateCw className={`w-3 h-3 ${isOperating ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">Reintentar</span>
                              </button>
                            )}

                            {/* Fork as Append (Save as New) Button if it was an update that failed */}
                            {item.type === 'update' && forkMutationAsAppend && (
                              <button
                                onClick={() => handleForkAsAppend(item)}
                                disabled={isOperating || isSyncing}
                                className="px-2 py-1 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                title="Si la fila original fue modificada o movida en Google Sheets, guárdalo como un nuevo registro para no perder información"
                              >
                                <PlusCircle className="w-3 h-3" />
                                <span className="hidden sm:inline">Guardar como Nuevo</span>
                              </button>
                            )}

                            {/* Discard / Skip Button */}
                            <button
                              onClick={() => setItemToDiscard(item)}
                              className="px-2 py-1 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer flex items-center gap-1"
                              title="Descartar este intento de sincronización (se respaldará en Auditoría)"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Descartar</span>
                            </button>
                          </div>
                        </div>

                        {/* EXPANDABLE PAYLOAD PREVIEW */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 text-xs">
                            <div className="flex items-center justify-between text-slate-500 mb-1.5">
                              <span className="font-semibold flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                Valores del Registro ({item.type.toUpperCase()})
                              </span>
                              <button
                                onClick={() => handleCopyMutationData(item)}
                                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                Copiar todo
                              </button>
                            </div>
                            <pre className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-[11px] overflow-x-auto text-slate-700 dark:text-slate-300 max-h-40 border border-slate-200 dark:border-slate-800">
                              {typeof item.values === 'object' ? JSON.stringify(item.values, null, 2) : String(item.values)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AUDIT LOG (RECENT ACTIONS) */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              
              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5 pb-2">
                <div className="relative flex-1 w-full">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar en descripción, tabla, clave o error..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-1 w-full sm:w-auto">
                  {(['all', 'synced', 'pending', 'failed', 'discard'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                        statusFilter === st
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {st === 'all' ? 'Todos' : st === 'synced' ? 'Éxito' : st === 'pending' ? 'En Cola' : st === 'discard' ? 'Descartados' : 'Errores'}
                    </button>
                  ))}
                </div>
              </div>

              {filteredAuditLog.length === 0 ? (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500">
                  <p className="text-xs">No hay eventos de auditoría que coincidan con el filtro.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAuditLog.map((log) => (
                    <div
                      key={log.id}
                      className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs shadow-2xs ${
                        log.action === 'discard'
                          ? 'border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className={`mt-0.5 p-1 rounded-md shrink-0 ${
                          log.action === 'discard' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400' :
                          log.status === 'synced' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                          log.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                          'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                        }`}>
                          {log.action === 'discard' ? <Trash2 className="w-3.5 h-3.5" /> :
                           log.status === 'synced' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                           log.status === 'pending' ? <Clock className="w-3.5 h-3.5" /> :
                           <AlertTriangle className="w-3.5 h-3.5" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {log.description}
                            </span>
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {log.sheetTitle}
                            </span>
                            {log.entityKey && (
                              <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded text-slate-500">
                                Clave: {log.entityKey}
                              </span>
                            )}
                          </div>

                          {log.errorMessage && (
                            <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 font-mono">
                              Detalle: {log.errorMessage}
                            </div>
                          )}

                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-2">
                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                            <span>•</span>
                            <span className="uppercase font-mono font-bold text-[9px]">{log.action}</span>
                          </div>
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        log.action === 'discard' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800' :
                        log.status === 'synced' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' :
                        log.status === 'pending' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800' :
                        'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800'
                      }`}>
                        {log.action === 'discard' ? 'Descartado' : log.status === 'synced' ? 'Sincronizado' : log.status === 'pending' ? 'En Cola' : 'Error'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-slate-400" />
            <span>Motor Local-First: IndexedDB + Google Apps Script</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>

      {/* CONFIRMATION DIALOG: SINGLE ITEM DISCARD */}
      {itemToDiscard && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  ¿Descartar intento de sincronización?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Al igual que en AppSheet, esto descartará la mutación que está trabada en la cola. A diferencia de AppSheet, nuestro sistema guardará una copia íntegra en el <strong>Historial de Auditoría</strong> para que nunca pierdas trazabilidad.
                </p>
              </div>
            </div>

            {/* Quick summary of item */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Tabla:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{itemToDiscard.sheetTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tipo:</span>
                <span className="font-mono uppercase font-bold text-blue-600 dark:text-blue-400">{itemToDiscard.type}</span>
              </div>
              {itemToDiscard.entityKey && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Clave / SKU:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{itemToDiscard.entityKey}</span>
                </div>
              )}
              {itemToDiscard.lastError && (
                <div className="pt-1 border-t border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 font-mono text-[11px]">
                  {itemToDiscard.lastError}
                </div>
              )}
            </div>

            {/* Copy before discard */}
            <button
              onClick={() => handleCopyMutationData(itemToDiscard)}
              className="w-full py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar datos del registro antes de descartar</span>
            </button>

            {/* Dialog Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setItemToDiscard(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirmDiscardItem()}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Confirmar Descarte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG: BULK DISCARD ALL FAILED */}
      {isConfirmDiscardAllOpen && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  ¿Descartar {failedMutations.length} registro(s) con conflicto?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Se descartarán únicamente los registros con errores repetidos para desbloquear la sincronización. Los registros que estén esperando turno normalmente se conservarán. Cada uno de los conflictos descartados quedará respaldado íntegramente en el <strong>Historial de Auditoría</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsConfirmDiscardAllOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDiscardAllFailed}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Descartar {failedMutations.length} Conflictos
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
