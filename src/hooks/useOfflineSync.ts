import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { indexedDbService, OfflineMutation, AuditLogEntry } from '../db/indexedDbService';
import { appendRow, updateRow, deleteRow, getSheetData, pingGoogleSheets } from '../lib/sheets';
import { matchRowIndexByIdentity, buildRowIdentityIndex } from '../utils/entityIdentityResolver';
import { findColumnBySemantic } from '../utils/columnAliases';
import { backendMirrorService } from '../services/backendMirrorService';

export type ConnectionHealthStatus = 'connected' | 'syncing' | 'offline' | 'unconfigured' | 'error';

function getMutationDescription(mutation: {
  type: 'append' | 'update' | 'delete';
  sheetTitle: string;
  rowIndex?: number;
  keyValue?: string;
  entityKey?: string;
  values?: any;
}): string {
  const target = mutation.keyValue || mutation.entityKey || (mutation.rowIndex ? `Fila #${mutation.rowIndex}` : '');

  if (mutation.type === 'append') {
    if (mutation.values) {
      if (Array.isArray(mutation.values)) {
        const skuVal = mutation.values[0] || mutation.values[1] || '';
        const descVal = mutation.values[2] || mutation.values[3] || '';
        const preview = [skuVal, descVal].filter(Boolean).join(' - ');
        return `Nuevo registro creado: ${preview || 'Sin datos'} en ${mutation.sheetTitle}`;
      } else if (typeof mutation.values === 'object') {
        const sku = mutation.values.sku || mutation.values.SKU || mutation.values.id || '';
        const desc = mutation.values.descripcion || mutation.values.DESCRIPCION || '';
        const preview = [sku, desc].filter(Boolean).join(' - ');
        return `Nuevo registro creado: ${preview || 'Item'} en ${mutation.sheetTitle}`;
      }
    }
    return `Nuevo registro creado en ${mutation.sheetTitle}`;
  }

  if (mutation.type === 'update') {
    return `Actualizado: ${target || 'Registro'} en ${mutation.sheetTitle}`;
  }

  if (mutation.type === 'delete') {
    return `Eliminado: ${target || 'Registro'} en ${mutation.sheetTitle}`;
  }

  return `Operación en ${mutation.sheetTitle}`;
}

export function useOfflineSync(onSyncSuccess?: (successCount?: number) => Promise<void>) {
  const [offlineQueue, setOfflineQueue] = useState<OfflineMutation[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastCachedAt, setLastCachedAt] = useState<string | null>(null);

  // Telemetría y Salud de Conexión en Tiempo Real
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionHealthStatus>(
    !navigator.onLine ? 'offline' : 'connected'
  );
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
  const [healthErrorMessage, setHealthErrorMessage] = useState<string | null>(null);

  const isSyncingRef = useRef<boolean>(false);
  isSyncingRef.current = isSyncing;

  const onSyncSuccessRef = useRef(onSyncSuccess);
  useEffect(() => {
    onSyncSuccessRef.current = onSyncSuccess;
  }, [onSyncSuccess]);

  // Refresh audit log from IndexedDB
  const refreshAuditLog = useCallback(async () => {
    try {
      const logs = await indexedDbService.getAuditLog(100);
      setAuditLog(logs);
      return logs;
    } catch (e) {
      console.warn('Error refreshing audit log:', e);
      return [];
    }
  }, []);

  // Helper para agregar entradas personalizadas al registro de auditoría
  const addAuditEntry = useCallback(
    async (entry: {
      action: AuditLogEntry['action'];
      sheetTitle: string;
      description: string;
      status?: AuditLogEntry['status'];
      entityKey?: string;
      details?: Record<string, any>;
      errorMessage?: string;
    }) => {
      const created = await indexedDbService.addAuditLogEntry(entry);
      await refreshAuditLog();
      return created;
    },
    [refreshAuditLog]
  );

  // Limpiar todo el historial de auditoría
  const clearAuditLog = useCallback(async () => {
    await indexedDbService.clearAuditLog();
    setAuditLog([]);
  }, []);

  // Refresh offline queue from IndexedDB
  const refreshQueue = useCallback(async () => {
    try {
      const queue = await indexedDbService.getOfflineQueue();
      // Ensure strict FIFO ordering by creation date
      queue.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setOfflineQueue(queue);
      return queue;
    } catch (e) {
      console.warn('Error refreshing offline queue:', e);
      return [];
    }
  }, []);

  // Test de latencia y ping hacia Google Apps Script
  const testConnectionHealth = useCallback(async (): Promise<{
    success: boolean;
    latencyMs: number;
    status: ConnectionHealthStatus;
    error?: string;
  }> => {
    if (!navigator.onLine) {
      setIsOffline(true);
      setConnectionStatus('offline');
      setLatencyMs(null);
      setHealthErrorMessage('Sin conexión a Internet en el navegador');
      return { success: false, latencyMs: 0, status: 'offline', error: 'Sin conexión a Internet' };
    }

    try {
      const res = await pingGoogleSheets();
      setLastHealthCheck(new Date());

      if (!res.urlConfigured) {
        setConnectionStatus('unconfigured');
        setLatencyMs(null);
        setHealthErrorMessage('URL de Google Apps Script no configurada');
        return { success: false, latencyMs: 0, status: 'unconfigured', error: 'URL no configurada' };
      }

      if (res.success) {
        setConnectionStatus('connected');
        setLatencyMs(res.latencyMs);
        setHealthErrorMessage(null);
        setIsOffline(false);
        return { success: true, latencyMs: res.latencyMs, status: 'connected' };
      } else {
        setConnectionStatus('error');
        setLatencyMs(res.latencyMs || null);
        setHealthErrorMessage(res.error || 'Error de respuesta en Apps Script');
        return { success: false, latencyMs: res.latencyMs, status: 'error', error: res.error };
      }
    } catch (err: any) {
      setConnectionStatus('error');
      setLatencyMs(null);
      setHealthErrorMessage(err.message || 'Fallo de conexión');
      return { success: false, latencyMs: 0, status: 'error', error: err.message };
    }
  }, []);

  // Enqueue a mutation to IndexedDB, state, and Audit Log
  const enqueueMutation = useCallback(
    async (mutation: {
      type: 'append' | 'update' | 'delete';
      sheetTitle: string;
      sheetId?: number;
      rowIndex?: number;
      entityKey?: string;
      entityKeyCol?: string;
      keyValue?: string;
      keyColumn?: string;
      headers?: string[];
      values?: any;
    }) => {
      const created = await indexedDbService.enqueueMutation(mutation);
      
      // Auto-log to Audit Log with descriptive summary
      const desc = getMutationDescription(mutation);
      await indexedDbService.addAuditLogEntry({
        action: mutation.type,
        sheetTitle: mutation.sheetTitle,
        entityKey: mutation.keyValue || mutation.entityKey,
        description: desc,
        status: 'pending',
        mutationId: created.id,
        details: {
          type: mutation.type,
          rowIndex: mutation.rowIndex,
          keyValue: mutation.keyValue,
          values: mutation.values
        }
      });

      // Real-time mirror replication if enabled
      try {
        const savedConfigStr = localStorage.getItem('appsheet_config');
        if (savedConfigStr) {
          const parsed = JSON.parse(savedConfigStr);
          if (parsed?.backendMirror?.enabled) {
            backendMirrorService.mirrorMutation(parsed.backendMirror, created).catch(mErr => {
              console.warn('[OfflineSync] Immediate mirror replication warning:', mErr);
            });
          }
        }
      } catch (e) {
        // Non-blocking mirror operation
      }

      await refreshQueue();
      await refreshAuditLog();
      return created;
    },
    [refreshQueue, refreshAuditLog]
  );

  // Synchronize the queue of mutations with Google Sheets in FIFO order
  const syncQueue = useCallback(async (targetMutationId?: string) => {
    if (isSyncingRef.current) return { success: false, count: 0, errors: ['Sincronización en curso'] };

    let currentQueue = await indexedDbService.getOfflineQueue();
    if (currentQueue.length === 0) {
      return { success: true, count: 0, errors: [] };
    }

    if (targetMutationId) {
      currentQueue = currentQueue.filter(m => m.id === targetMutationId);
      if (currentQueue.length === 0) {
        return { success: true, count: 0, errors: [] };
      }
    }

    // Sort strictly FIFO
    currentQueue.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    setIsSyncing(true);
    setConnectionStatus('syncing');
    let successCount = 0;
    const errors: string[] = [];
    const freshSheetsCache = new Map<string, any[][]>();
    const freshIndexesCache = new Map<string, Map<string, number>>();

    try {
      for (const mutation of currentQueue) {
        // Skip mutations that have failed more than 4 times unless explicitly retried individually
        if (!targetMutationId && mutation.attempts && mutation.attempts >= 5 && mutation.status === 'failed') {
          continue;
        }

        try {
          await indexedDbService.updateMutationStatus(mutation.id, 'syncing');
          await indexedDbService.updateAuditLogStatus(mutation.id, 'syncing');

          if (mutation.type === 'append') {
            await appendRow(mutation.sheetTitle, mutation.values);
          } else if (mutation.type === 'update') {
            let targetRowIndex: number | null = (typeof mutation.rowIndex === 'number' && !isNaN(mutation.rowIndex) && mutation.rowIndex > 1) 
              ? Math.floor(mutation.rowIndex) 
              : null;

            // Re-resolve rowIndex by entity key if available to prevent corrupting shifted rows or fixing null indexes
            const entityKey = mutation.keyValue || mutation.entityKey;
            try {
              let currentRows = freshSheetsCache.get(mutation.sheetTitle);
              let currentIndex = freshIndexesCache.get(mutation.sheetTitle);

              if (!currentRows) {
                currentRows = await getSheetData(mutation.sheetTitle, true);
                if (currentRows && currentRows.length > 0) {
                  freshSheetsCache.set(mutation.sheetTitle, currentRows);
                  const effectiveHeaders = (mutation.headers && mutation.headers.length > 0) 
                    ? mutation.headers 
                    : (currentRows[0] || []).map(String);
                  currentIndex = buildRowIdentityIndex(currentRows, effectiveHeaders);
                  freshIndexesCache.set(mutation.sheetTitle, currentIndex);
                }
              }

              if (currentRows && currentRows.length > 0) {
                const effectiveHeaders = (mutation.headers && mutation.headers.length > 0) 
                  ? mutation.headers 
                  : (currentRows[0] || []).map(String);

                // If no direct entityKey was stored, try to extract it from the values array or object
                let searchKey = entityKey;
                if (!searchKey && mutation.values) {
                  if (Array.isArray(mutation.values)) {
                    // Check if any column is SKU or CU_VC
                    const skuCol = findColumnBySemantic(effectiveHeaders, 'sku');
                    const cuCol = effectiveHeaders.find(h => /^cu(_|\s)?(vc|calculado)?$/i.test(h.trim()));
                    if (cuCol) {
                      const cIdx = effectiveHeaders.indexOf(cuCol);
                      if (cIdx >= 0 && mutation.values[cIdx]) searchKey = String(mutation.values[cIdx]).trim();
                    } else if (skuCol) {
                      const sIdx = effectiveHeaders.indexOf(skuCol);
                      if (sIdx >= 0 && mutation.values[sIdx]) searchKey = String(mutation.values[sIdx]).trim();
                    }
                  } else if (typeof mutation.values === 'object') {
                    const cuVal = mutation.values.CU_VC || mutation.values.cu_vc || mutation.values.CU;
                    const skuVal = mutation.values.SKU || mutation.values.sku || mutation.values.id;
                    if (cuVal) searchKey = String(cuVal).trim();
                    else if (skuVal) searchKey = String(skuVal).trim();
                  }
                }

                if (searchKey) {
                  const resolvedRowIndex = matchRowIndexByIdentity(
                    {
                      keyColumn: mutation.keyColumn || mutation.entityKeyCol || null,
                      keyValue: searchKey,
                      isSynthetic: false,
                      rowIndex: targetRowIndex || 0
                    },
                    currentRows,
                    effectiveHeaders,
                    currentIndex
                  );
                  if (resolvedRowIndex && resolvedRowIndex > 1) {
                    targetRowIndex = resolvedRowIndex;
                  }
                }
              }
            } catch (e) {
              console.warn('[OfflineSync] Could not re-resolve rowIndex by key, fallback to available rowIndex:', e);
            }

            if (targetRowIndex && targetRowIndex > 1) {
              await updateRow(mutation.sheetTitle, targetRowIndex, mutation.values, {
                entityKey: entityKey,
                keyValue: entityKey
              });
              // Invalidate cached sheet so next mutation fetches updated state
              freshSheetsCache.delete(mutation.sheetTitle);
              freshIndexesCache.delete(mutation.sheetTitle);
            } else {
              // Fallback: If row could not be found to update, append it so data is never lost
              console.warn(`[OfflineSync] Row index could not be located for update in "${mutation.sheetTitle}". Appending instead to preserve data.`);
              await appendRow(mutation.sheetTitle, mutation.values);
            }
          } else if (mutation.type === 'delete') {
            let targetRowIndex: number | null = (typeof mutation.rowIndex === 'number' && !isNaN(mutation.rowIndex) && mutation.rowIndex > 1) 
              ? Math.floor(mutation.rowIndex) 
              : null;

            // Re-resolve rowIndex by entity key if available
            const entityKey = mutation.keyValue || mutation.entityKey;
            if (entityKey) {
              try {
                let currentRows = freshSheetsCache.get(mutation.sheetTitle);
                let currentIndex = freshIndexesCache.get(mutation.sheetTitle);

                if (!currentRows) {
                  currentRows = await getSheetData(mutation.sheetTitle, true);
                  if (currentRows && currentRows.length > 0) {
                    freshSheetsCache.set(mutation.sheetTitle, currentRows);
                    const effectiveHeaders = (mutation.headers && mutation.headers.length > 0) 
                      ? mutation.headers 
                      : (currentRows[0] || []).map(String);
                    currentIndex = buildRowIdentityIndex(currentRows, effectiveHeaders);
                    freshIndexesCache.set(mutation.sheetTitle, currentIndex);
                  }
                }

                if (currentRows && currentRows.length > 0) {
                  const effectiveHeaders = (mutation.headers && mutation.headers.length > 0) 
                    ? mutation.headers 
                    : (currentRows[0] || []).map(String);

                  const resolvedRowIndex = matchRowIndexByIdentity(
                    {
                      keyColumn: mutation.keyColumn || mutation.entityKeyCol || null,
                      keyValue: entityKey,
                      isSynthetic: false,
                      rowIndex: targetRowIndex || 0
                    },
                    currentRows,
                    effectiveHeaders,
                    currentIndex
                  );
                  if (resolvedRowIndex && resolvedRowIndex > 1) {
                    targetRowIndex = resolvedRowIndex;
                  }
                }
              } catch (e) {
                console.warn('[OfflineSync] Could not re-resolve rowIndex by key for deletion:', e);
              }
            }

            if (targetRowIndex && targetRowIndex > 1) {
              await deleteRow(mutation.sheetId || 0, targetRowIndex, mutation.sheetTitle);
              // Invalidate cached sheet
              freshSheetsCache.delete(mutation.sheetTitle);
              freshIndexesCache.delete(mutation.sheetTitle);
            } else {
              console.warn(`[OfflineSync] Row for deletion not found in "${mutation.sheetTitle}", skipping.`);
            }
          }

          // Remove from IndexedDB on success and mark audit as synced
          await indexedDbService.removeMutation(mutation.id);
          await indexedDbService.updateAuditLogStatus(mutation.id, 'synced');
          successCount++;
        } catch (err: any) {
          console.error(`[OfflineSync] Error procesando mutación ${mutation.id} (${mutation.type}):`, err);
          errors.push(err.message || 'Error de sincronización');
          await indexedDbService.updateMutationStatus(mutation.id, 'failed', err.message || 'Error en red');
          await indexedDbService.updateAuditLogStatus(mutation.id, 'failed', err.message || 'Fallo de red');
        }
      }

      // Refresh state after sync attempt
      const remaining = await refreshQueue();
      await refreshAuditLog();
      setIsOffline(!navigator.onLine || remaining.length > 0);
      setConnectionStatus(!navigator.onLine ? 'offline' : (errors.length === 0 ? 'connected' : 'error'));

      if (successCount > 0 && onSyncSuccessRef.current) {
        await onSyncSuccessRef.current(successCount);
      }

      return {
        success: errors.length === 0,
        count: successCount,
        errors
      };
    } finally {
      setIsSyncing(false);
    }
  }, [refreshQueue, refreshAuditLog]);

  // Remove an individual mutation from the queue
  const removeMutation = useCallback(async (id: string) => {
    await indexedDbService.removeMutation(id);
    await refreshQueue();
    await refreshAuditLog();
  }, [refreshQueue, refreshAuditLog]);

  // Discard an individual mutation with audit log tracking (AppSheet-like but with full audit and data copy)
  const discardMutation = useCallback(async (id: string, reason?: string) => {
    const res = await indexedDbService.discardMutation(id, reason);
    await refreshQueue();
    await refreshAuditLog();
    return res;
  }, [refreshQueue, refreshAuditLog]);

  // Discard all failed / conflict mutations at once
  const discardAllFailedMutations = useCallback(async () => {
    const count = await indexedDbService.discardAllFailedMutations();
    await refreshQueue();
    await refreshAuditLog();
    return count;
  }, [refreshQueue, refreshAuditLog]);

  // Retry an individual failed mutation (resets attempts and retries sync)
  const retryMutation = useCallback(async (id: string) => {
    await indexedDbService.resetMutationForRetry(id);
    await refreshQueue();
    await refreshAuditLog();
    return await syncQueue(id);
  }, [refreshQueue, refreshAuditLog, syncQueue]);

  // Retry all failed mutations
  const retryAllFailedMutations = useCallback(async () => {
    const queue = await indexedDbService.getOfflineQueue();
    const failedList = queue.filter(m => m.status === 'failed' || (m.attempts && m.attempts >= 3));
    for (const m of failedList) {
      await indexedDbService.resetMutationForRetry(m.id);
    }
    await refreshQueue();
    await refreshAuditLog();
    return await syncQueue();
  }, [refreshQueue, refreshAuditLog, syncQueue]);

  // Convert an update mutation into an append (Save as New)
  const forkMutationAsAppend = useCallback(async (id: string) => {
    const res = await indexedDbService.forkMutationAsAppend(id);
    await refreshQueue();
    await refreshAuditLog();
    if (res && navigator.onLine) {
      syncQueue(res.id);
    }
    return res;
  }, [refreshQueue, refreshAuditLog, syncQueue]);

  const failedMutations = useMemo(() => {
    return offlineQueue.filter(m => m.status === 'failed' || (m.attempts && m.attempts >= 3));
  }, [offlineQueue]);

  // Clear all pending mutations in the queue
  const clearQueue = useCallback(async () => {
    await indexedDbService.clearOfflineQueue();
    setOfflineQueue([]);
  }, []);

  const syncQueueRef = useRef(syncQueue);
  syncQueueRef.current = syncQueue;

  const testConnectionHealthRef = useRef(testConnectionHealth);
  testConnectionHealthRef.current = testConnectionHealth;

  // Initial load and event listeners for network changes
  useEffect(() => {
    refreshQueue();
    refreshAuditLog();

    // Initial ping
    testConnectionHealthRef.current();

    const handleOnline = () => {
      setIsOffline(false);
      testConnectionHealthRef.current();
      // Auto-trigger reconciliation on internet restoration if queue has items
      indexedDbService.getOfflineQueue().then((q) => {
        if (q.length > 0 && !isSyncingRef.current) {
          console.log('[OfflineSync] Conexión restablecida. Auto-sincronizando cola offline...');
          syncQueueRef.current();
        }
      });
    };

    const handleOffline = () => {
      setIsOffline(true);
      setConnectionStatus('offline');
      setLatencyMs(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 60s for health and queue sync
    const intervalId = setInterval(() => {
      if (navigator.onLine && !isSyncingRef.current) {
        testConnectionHealthRef.current();
        indexedDbService.getOfflineQueue().then((q) => {
          if (q.some(m => m.status === 'pending')) {
            syncQueueRef.current();
          }
        });
      }
    }, 60000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, [refreshQueue, refreshAuditLog]);

  return {
    offlineQueue,
    auditLog,
    isOffline,
    setIsOffline,
    isSyncing,
    setIsSyncing,
    lastCachedAt,
    setLastCachedAt,
    latencyMs,
    connectionStatus,
    lastHealthCheck,
    healthErrorMessage,
    testConnectionHealth,
    enqueueMutation,
    syncQueue,
    removeMutation,
    discardMutation,
    discardAllFailedMutations,
    retryMutation,
    retryAllFailedMutations,
    forkMutationAsAppend,
    failedMutations,
    failedCount: failedMutations.length,
    clearQueue,
    refreshQueue,
    refreshAuditLog,
    addAuditEntry,
    clearAuditLog
  };
}
