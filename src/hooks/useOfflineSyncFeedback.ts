import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useOfflineSync } from './useOfflineSync';
import type { FetchDataFn } from './useInventoryData';
import type { SheetConfig } from '../types';
import { useToast } from '../components/common/ToastContainer';
import { getErrorMessage } from '../utils/pureCalculations';

interface UseOfflineSyncFeedbackParams {
  /** Puente a `fetchData`: se lee al vaciar la cola, no durante el render. */
  fetchDataRef: RefObject<FetchDataFn | null>;
  sheetConfig: SheetConfig;
  activeView: string;
}

/**
 * Cola offline + todo su feedback de usuario, en una sola unidad.
 *
 * Vivía repartido en `InventoryDashboard`: 24 valores desestructurados de
 * `useOfflineSync`, el `onSyncSuccess` con sus toasts, el efecto de transición
 * online/offline y `handleSyncOfflineQueue`. 107 líneas del componente para
 * coordinar un único flujo (vaciar la cola y contarlo).
 *
 * El feedback es intrínseco a sincronizar, no al dashboard: por eso el hook se
 * lo queda en vez de devolver eventos para que el llamante arme los toasts.
 * Al ser el único consumidor de `useOfflineSync`, la coordinación se disuelve
 * en lugar de trasladarse.
 */
export function useOfflineSyncFeedback({
  fetchDataRef,
  sheetConfig,
  activeView,
}: UseOfflineSyncFeedbackParams) {
  const { showToast, updateToast, removeToast } = useToast();
  const prevIsOfflineRef = useRef<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const activeSyncToastIdRef = useRef<string | null>(null);
  const queuedCountRef = useRef(0);

  const offline = useOfflineSync(async (syncedCount?: number) => {
    await fetchDataRef.current?.(sheetConfig, activeView, true);

    if (activeSyncToastIdRef.current) {
      const count = syncedCount || queuedCountRef.current || 1;
      updateToast(
        activeSyncToastIdRef.current,
        `¡Sincronización automática completada! Se subieron ${count} cambios pendientes y tus datos ya están reflejados en Google Sheets.`,
        'success',
        'Datos Sincronizados',
        4000
      );
      activeSyncToastIdRef.current = null;
    } else if (syncedCount && syncedCount > 0) {
      showToast(
        `Se subieron automáticamente ${syncedCount} cambios pendientes en segundo plano.`,
        'success',
        'Sincronización en Segundo Plano'
      );
    }
  });

  const { isOffline, offlineQueue } = offline;
  queuedCountRef.current = offlineQueue.length;

  // Track transitions of connection status to show high-quality informative toasts
  useEffect(() => {
    if (prevIsOfflineRef.current !== isOffline) {
      if (isOffline) {
        showToast(
          'Sin conexión a Internet. Cambiando de forma segura a modo local. Puedes continuar registrando datos sin problemas.',
          'warning',
          'Modo Local Activo'
        );
      } else if (offlineQueue.length > 0) {
        // Sync is automatically triggered by handleOnline in useOfflineSync.ts
        const toastId = showToast(
          `¡Conexión recuperada! Sincronizando de forma automática ${offlineQueue.length} cambios guardados localmente...`,
          'loading',
          'Sincronizando Cambios',
          0 // Persistent toast until resolved
        );
        activeSyncToastIdRef.current = toastId;
      } else {
        showToast(
          '¡Conexión restablecida con éxito! La aplicación se encuentra en línea y conectada.',
          'success',
          'Conexión Recuperada'
        );
      }
      prevIsOfflineRef.current = isOffline;
    }
  }, [isOffline, offlineQueue.length, showToast, updateToast]);

  const handleSyncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    const toastId = showToast(
      `Sincronizando ${offlineQueue.length} cambios pendientes con Google Sheets...`,
      'loading',
      'Sincronización',
      0
    );
    try {
      const res = await offline.syncQueue();
      if (res && res.success) {
        updateToast(
          toastId,
          `¡Se sincronizaron exitosamente ${res.count} mutaciones en Google Sheets!`,
          'success',
          'Sincronización Exitosa'
        );
      } else if (res && res.errors && res.errors.length > 0) {
        updateToast(toastId, `Hubo errores al sincronizar: ${res.errors.join(', ')}`, 'error', 'Sincronización Parcial');
      } else {
        removeToast(toastId);
      }
    } catch (err: unknown) {
      updateToast(toastId, `Error sincronizando cola offline: ${getErrorMessage(err)}`, 'error', 'Error de Sincronización');
    }
  };

  return { ...offline, handleSyncOfflineQueue };
}
