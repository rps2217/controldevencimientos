import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { StockCountSession, InventoryCampaign } from '../types';
import { 
  loadStockCountSessionsFromStorage, 
  loadStockCountSessionsFromStorageAsync,
  flushStockCountSessionsToStorage, 
  playBeep, 
  getOrCreateDeviceId 
} from '../utils/stockCountUtils';
import { 
  loadCampaignsFromStorage, 
  loadCampaignsFromStorageAsync,
  saveCampaignsToStorage, 
  getActiveCampaignId, 
  setActiveCampaignId 
} from '../utils/campaignUtils';
import { syncCampaignsWithCloud } from '../lib/sheets';
import { STORAGE_KEYS } from '../utils/appStorage';
import { getErrorMessage } from '../utils/pureCalculations';

export interface UseStockCountSessionsProps {
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
}

export function useStockCountSessions({ showToast }: UseStockCountSessionsProps) {
  // Campaigns list & active campaign
  const [campaigns, setCampaigns] = useState<InventoryCampaign[]>(() => loadCampaignsFromStorage());
  const [activeCampaignIdState, setActiveCampaignIdState] = useState<string | null>(() => getActiveCampaignId());

  // Cloud Auto-Sync with Office PC & Google Sheets
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [lastCloudSyncDate, setLastCloudSyncDate] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.LAST_CAMPAIGN_CLOUD_SYNC);
    } catch {
      return null;
    }
  });

  // Active campaign entity
  const activeCampaign = useMemo(() => {
    if (!activeCampaignIdState && campaigns.length > 0) {
      return campaigns[0];
    }
    return campaigns.find(c => c.id === activeCampaignIdState) || null;
  }, [campaigns, activeCampaignIdState]);

  // Session list & active session
  const [sessions, setSessions] = useState<StockCountSession[]>(() => loadStockCountSessionsFromStorage());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Deleted session IDs tracking state to ensure real physical deletion is propagated without ghost revivals
  const [deletedSessionIds, setDeletedSessionIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('app_deleted_session_ids_v1');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Save deletedSessionIds to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('app_deleted_session_ids_v1', JSON.stringify(deletedSessionIds));
    } catch {}
  }, [deletedSessionIds]);

  // Hidratación asíncrona desde IndexedDB si localStorage fue limpiado o superó su cuota
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      loadCampaignsFromStorageAsync(),
      loadStockCountSessionsFromStorageAsync()
    ]).then(([asyncCampaigns, asyncSessions]) => {
      if (!isMounted) return;
      if (asyncCampaigns.length > 0) {
        setCampaigns(prev => prev.length === 0 ? asyncCampaigns : prev);
      }
      if (asyncSessions.length > 0) {
        setSessions(prev => prev.length === 0 ? asyncSessions : prev);
      }
    }).catch((err) => {
      console.warn('[Storage] Hydration from IndexedDB failed:', err);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Active session entity
  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  // Computed snapshot count
  const erpSnapshotCount = useMemo(() => {
    return activeCampaign ? Object.keys(activeCampaign.snapshotTeoricoActual || {}).length : 0;
  }, [activeCampaign]);

  // Auto-sync helper for ERP upload modal
  const handleAutoSyncCampaignsToCloud = useCallback(async (camps: InventoryCampaign[], actId: string | null) => {
    try {
      const res = await syncCampaignsWithCloud({
        campaigns: camps,
        activeCampaignId: actId,
        sessions,
        deletedSessionIds
      });
      if (res && res.success) {
        setCampaigns(res.mergedCampaigns);
        setSessions(res.mergedSessions);
        if (res.deletedSessionIds) {
          setDeletedSessionIds(res.deletedSessionIds);
        }
      }
    } catch (e) {
      console.warn('AutoSync cloud error:', e);
    }
  }, [sessions, deletedSessionIds]);

  // Cloud sync handler (Two-Way Merging between this device and Google Sheets)
  const handleCloudSync = useCallback(async (silent: boolean = false) => {
    setIsSyncingCloud(true);
    try {
      const res = await syncCampaignsWithCloud({
        campaigns,
        activeCampaignId: activeCampaignIdState,
        sessions,
        deletedSessionIds
      });

      if (res && res.success) {
        setCampaigns(res.mergedCampaigns);
        setSessions(res.mergedSessions);
        if (res.deletedSessionIds) {
          setDeletedSessionIds(res.deletedSessionIds);
        }
        saveCampaignsToStorage(res.mergedCampaigns);
        flushStockCountSessionsToStorage();

        if (res.activeCampaignId) {
          setActiveCampaignIdState(res.activeCampaignId);
          setActiveCampaignId(res.activeCampaignId);
        }

        const nowStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        setLastCloudSyncDate(nowStr);
        try {
          localStorage.setItem(STORAGE_KEYS.LAST_CAMPAIGN_CLOUD_SYNC, nowStr);
        } catch {}

        if (!silent) {
          playBeep('success');
          showToast(
            `¡Sincronizado con oficina! ${res.mergedSessions.length} muebles y ${res.mergedCampaigns.length} campaña(s) consolidadas.`,
            'success',
            'Sincronización Exitosa'
          );
        }
      } else if (!silent) {
        showToast('No se pudo conectar a Google Sheets.', 'warning');
      }
    } catch (e: unknown) {
      if (!silent) {
        showToast(`Error al consultar la nube: ${getErrorMessage(e)}`, 'error');
      }
    } finally {
      setIsSyncingCloud(false);
    }
  }, [campaigns, activeCampaignIdState, sessions, deletedSessionIds, showToast]);

  // Respaldar manifiesto de una sesión / mueble específico a la nube
  const handleBackupSessionToCloud = async (sessionToBackup: StockCountSession) => {
    setIsSyncingCloud(true);
    try {
      showToast(`Respaldando manifiesto de "${sessionToBackup.nombre}" en la nube...`, 'info', 'Respaldo Nube');
      const updatedSession: StockCountSession = {
        ...sessionToBackup,
        sincronizadoNube: true,
        lastUpdated: new Date().toISOString(),
        deviceId: sessionToBackup.deviceId || getOrCreateDeviceId()
      };
      const updatedSessions = sessions.map(s => s.id === sessionToBackup.id ? updatedSession : s);
      setSessions(updatedSessions);

      const res = await syncCampaignsWithCloud({
        campaigns,
        activeCampaignId: activeCampaignIdState,
        sessions: updatedSessions,
        deletedSessionIds
      });

      if (res && res.success) {
        setCampaigns(res.mergedCampaigns);
        setSessions(res.mergedSessions);
        if (res.deletedSessionIds) {
          setDeletedSessionIds(res.deletedSessionIds);
        }
        saveCampaignsToStorage(res.mergedCampaigns);
        flushStockCountSessionsToStorage();
        playBeep('success');
        showToast(
          `✅ Manifiesto de "${sessionToBackup.nombre}" respaldado en la nube (${sessionToBackup.conteos.length} lecturas).`,
          'success',
          'Manifiesto Guardado'
        );
      } else {
        showToast('Guardado localmente. Se respaldará en la nube cuando haya conexión.', 'warning');
      }
    } catch (err: unknown) {
      showToast(`Error de respaldo: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Auto-sync on mount to pull any fresh theoretical stock uploaded in the office PC
  const hasMountedSyncRef = useRef(false);
  useEffect(() => {
    if (hasMountedSyncRef.current) return;
    hasMountedSyncRef.current = true;
    handleCloudSync(true);
  }, [handleCloudSync]);

  // Persist campaigns
  const handleUpdateCampaigns = (updated: InventoryCampaign[]) => {
    setCampaigns(updated);
    saveCampaignsToStorage(updated);
  };

  const handleSelectCampaign = (id: string) => {
    setActiveCampaignIdState(id);
    setActiveCampaignId(id);
  };

  return {
    campaigns,
    setCampaigns,
    activeCampaignIdState,
    setActiveCampaignIdState,
    activeCampaign,
    sessions,
    setSessions,
    deletedSessionIds,
    setDeletedSessionIds,
    activeSessionId,
    setActiveSessionId,
    activeSession,
    isSyncingCloud,
    lastCloudSyncDate,
    erpSnapshotCount,
    handleAutoSyncCampaignsToCloud,
    handleCloudSync,
    handleBackupSessionToCloud,
    handleUpdateCampaigns,
    handleSelectCampaign
  };
}
