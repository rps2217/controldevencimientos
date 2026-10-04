import type { InventoryCampaign, StockCountSession } from '../types';
import { getErrorMessage } from '../utils/pureCalculations';
import {
  SPREADSHEET_ID,
  CampaignSaveResult,
  getScriptUrl
} from './sheetsTypes';
import {
  fetchFromScript,
  getSheetData,
  appendRow,
  updateRow,
  clearSheetsCache
} from './sheetsClient';

/**
 * Persistencia en la nube de Campañas de Inventario y Sesiones de Conteo.
 * Permite que cualquier dispositivo conectado a Google Sheets comparta y consulte las campañas.
 *
 * `expectedVersion` activa concurrencia optimista: el servidor compara la versión
 * almacenada contra la que el cliente leyó y, si otra terminal escribió antes,
 * rechaza el guardado devolviendo el estado vigente.
 */
export async function saveCampaignsToCloud(
  campaignsPayload: {
    campaigns: InventoryCampaign[];
    activeCampaignId?: string | null;
    sessions?: StockCountSession[];
    lastUpdated?: string;
    deletedSessionIds?: string[];
  },
  configSheetName = '_CONFIG_APP',
  expectedVersion: string | null = null
): Promise<CampaignSaveResult> {
  if (!getScriptUrl()) {
    console.warn('[Sheets] saveCampaignsToCloud omitido: URL de script no configurada (Modo Demo)');
    return { success: false };
  }
  try {
    const nowIso = new Date().toISOString();
    const jsonStr = JSON.stringify({
      ...campaignsPayload,
      lastUpdated: nowIso
    });

    // 1. Intento atómico (compare-and-swap) en una sola llamada al servidor.
    try {
      const cas = await fetchFromScript<{ success?: boolean; conflict?: boolean; current?: CampaignSaveResult['current']; version?: string }>({
        action: 'saveCampaignsAtomic',
        sheetName: configSheetName,
        config: jsonStr,
        expectedVersion,
        spreadsheetId: SPREADSHEET_ID
      });
      if (cas && cas.conflict) {
        return { success: false, conflict: true, current: cas.current || null };
      }
      if (cas && cas.success) {
        clearSheetsCache(configSheetName);
        return { success: true };
      }
    } catch (casErr) {
      const msg = getErrorMessage(casErr);
      if (!/Acción no soportada|Accion no soportada/.test(msg)) throw casErr;
      console.warn('[Sheets] saveCampaignsAtomic no soportado por el script desplegado; usando respaldo no atómico (riesgo de lost update con varias terminales).');
    }

    const CHUNK_SIZE = 30000; // 30KB por celda (máximo permitido por Google Sheets: 50.000)
    const chunks: string[] = [];
    for (let i = 0; i < jsonStr.length; i += CHUNK_SIZE) {
      chunks.push(jsonStr.slice(i, i + CHUNK_SIZE));
    }

    // 1. Guardar en Script Properties con propiedad dedicada CAMPAIGNS_DATA si es pequeño (< 8KB)
    if (jsonStr.length < 8000) {
      try {
        await fetchFromScript({
          action: 'saveAppProperties',
          config: jsonStr,
          propertyName: 'CAMPAIGNS_DATA',
          spreadsheetId: SPREADSHEET_ID
        });
      } catch (propsErr) {
        console.warn('[Sheets] ScriptProperties save skipped (tamaño o cuota):', propsErr);
      }
    }

    // 2. Guardar en la hoja _CONFIG_APP con arquitectura de Chunks robusta
    try {
      const rows = await getSheetData(configSheetName, true);

      if (!rows || rows.length === 0) {
        await appendRow(configSheetName, ['CLAVE', 'VALOR_JSON', 'ULTIMA_ACTUALIZACION']);
      }

      // Mapa de claves existentes en _CONFIG_APP para actualizar sin crear duplicados
      const existingKeyRowMap = new Map<string, number>();
      if (rows && rows.length >= 1) {
        for (let r = 1; r < rows.length; r++) {
          const key = String(rows[r][0] || '').trim();
          if (key) {
            existingKeyRowMap.set(key, r + 1); // 1-indexed para Google Sheets
          }
        }
      }

      // Guardar contador de chunks
      const chunksHeaderRow = existingKeyRowMap.get('CAMPAIGNS_DATA_CHUNKS');
      if (chunksHeaderRow) {
        await updateRow(configSheetName, chunksHeaderRow, ['CAMPAIGNS_DATA_CHUNKS', String(chunks.length), nowIso], { entityKey: 'CAMPAIGNS_DATA_CHUNKS' });
      } else {
        await appendRow(configSheetName, ['CAMPAIGNS_DATA_CHUNKS', String(chunks.length), nowIso]);
      }

      // Guardar cada fragmento
      for (let c = 0; c < chunks.length; c++) {
        const chunkKey = `CAMPAIGNS_DATA_CHUNK_${c}`;
        const chunkRow = existingKeyRowMap.get(chunkKey);
        if (chunkRow) {
          await updateRow(configSheetName, chunkRow, [chunkKey, chunks[c], nowIso], { entityKey: chunkKey });
        } else {
          await appendRow(configSheetName, [chunkKey, chunks[c], nowIso]);
        }
      }

      // Si antes había más chunks que ahora, limpiar los sobrantes
      const prevCountStr = existingKeyRowMap.get('CAMPAIGNS_DATA_CHUNKS') 
        ? rows[existingKeyRowMap.get('CAMPAIGNS_DATA_CHUNKS')! - 1]?.[1] 
        : null;
      const prevCount = prevCountStr ? parseInt(String(prevCountStr), 10) : 0;
      if (prevCount > chunks.length) {
        for (let c = chunks.length; c < prevCount; c++) {
          const obsoleteKey = `CAMPAIGNS_DATA_CHUNK_${c}`;
          const obsoleteRow = existingKeyRowMap.get(obsoleteKey);
          if (obsoleteRow) {
            await updateRow(configSheetName, obsoleteRow, [obsoleteKey, '', nowIso], { entityKey: obsoleteKey });
          }
        }
      }

      // Retrocompatibilidad con CAMPAIGNS_DATA único (si entra en 40k)
      const singleRow = existingKeyRowMap.get('CAMPAIGNS_DATA');
      if (jsonStr.length < 40000) {
        if (singleRow) {
          await updateRow(configSheetName, singleRow, ['CAMPAIGNS_DATA', jsonStr, nowIso], { entityKey: 'CAMPAIGNS_DATA' });
        } else {
          await appendRow(configSheetName, ['CAMPAIGNS_DATA', jsonStr, nowIso]);
        }
      } else if (singleRow) {
        await updateRow(configSheetName, singleRow, ['CAMPAIGNS_DATA', `[CHUNKED:${chunks.length}]`, nowIso], { entityKey: 'CAMPAIGNS_DATA' });
      }
    } catch (sheetErr) {
      console.warn('[Sheets] Respaldo en _CONFIG_APP falló:', sheetErr);
      throw sheetErr;
    }

    return { success: true };
  } catch (err) {
    console.error('[Sheets] Error al guardar campañas en la nube:', err);
    throw err;
  }
}

/**
 * Carga las campañas de inventario y sesiones desde Google Sheets (Nube)
 * Soporta reconstrucción automática de fragmentos (Chunks) para snapshots masivos.
 */
export async function loadCampaignsFromCloud(configSheetName = '_CONFIG_APP'): Promise<{
  campaigns?: InventoryCampaign[];
  activeCampaignId?: string | null;
  sessions?: StockCountSession[];
  lastUpdated?: string;
  version?: string;
} | null> {
  if (!getScriptUrl()) {
    console.warn('[Sheets] loadCampaignsFromCloud omitido: URL de script no configurada (Modo Demo)');
    return null;
  }
  try {
    const rows = await getSheetData(configSheetName, true);
    if (rows && rows.length >= 1) {
      const rowKeyMap = new Map<string, string>();
      const tieneEncabezado = String(rows[0]?.[0] || '').trim() === 'CLAVE';
      for (let i = tieneEncabezado ? 1 : 0; i < rows.length; i++) {
        const k = String(rows[i][0] || '').trim();
        const v = String(rows[i][1] || '');
        if (k && k !== 'CLAVE') rowKeyMap.set(k, v);
      }

      // A. Verificar si existen CHUNKS
      if (rowKeyMap.has('CAMPAIGNS_DATA_CHUNKS')) {
        const count = parseInt(rowKeyMap.get('CAMPAIGNS_DATA_CHUNKS') || '0', 10);
        if (count > 0) {
          const pieces: string[] = [];
          for (let c = 0; c < count; c++) {
            const piece = rowKeyMap.get(`CAMPAIGNS_DATA_CHUNK_${c}`) || '';
            pieces.push(piece);
          }
          const fullJson = pieces.join('');
          if (fullJson) {
            const parsed = JSON.parse(fullJson);
            if (parsed && Array.isArray(parsed.campaigns)) {
              return { ...parsed, version: rowKeyMap.get('CAMPAIGNS_VERSION') || undefined };
            }
          }
        }
      }

      // B. Si no hay chunks, verificar clave CAMPAIGNS_DATA tradicional
      const singleData = rowKeyMap.get('CAMPAIGNS_DATA');
      if (singleData && !singleData.startsWith('[CHUNKED:')) {
        const parsed = JSON.parse(singleData);
        if (parsed && Array.isArray(parsed.campaigns)) {
          return { ...parsed, version: rowKeyMap.get('CAMPAIGNS_VERSION') || undefined };
        }
      }
    }
  } catch (e) {
    console.warn('[Sheets] No se pudo leer CAMPAIGNS_DATA (chunks) de _CONFIG_APP:', e);
  }

  // 2. Fallback a Script Properties (para configuraciones livianas)
  try {
    const res = await fetchFromScript({ action: 'getAppProperties', spreadsheetId: SPREADSHEET_ID });
    if (res && res.success && res.config && res.config.CAMPAIGNS_DATA) {
      const parsed = typeof res.config.CAMPAIGNS_DATA === 'string' 
        ? JSON.parse(res.config.CAMPAIGNS_DATA) 
        : res.config.CAMPAIGNS_DATA;
      if (parsed && Array.isArray(parsed.campaigns)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[Sheets] Script Properties no devolvió CAMPAIGNS_DATA:', e);
  }

  return null;
}

/**
 * Sincronización atómica bidireccional (2-Way Merge) entre el dispositivo local y Google Sheets
 */
export async function syncCampaignsWithCloud(
  localPayload: {
    campaigns: InventoryCampaign[];
    activeCampaignId?: string | null;
    sessions: StockCountSession[];
    deletedSessionIds?: string[];
  },
  configSheetName = '_CONFIG_APP'
): Promise<{
  mergedCampaigns: InventoryCampaign[];
  mergedSessions: StockCountSession[];
  activeCampaignId: string | null;
  newRemoteSessionsCount: number;
  success: boolean;
  deletedSessionIds?: string[];
}> {
  if (!getScriptUrl()) {
    console.warn('[Sheets] syncCampaignsWithCloud omitido: URL de script no configurada (Modo Demo)');
    return {
      mergedCampaigns: localPayload.campaigns,
      mergedSessions: localPayload.sessions,
      activeCampaignId: localPayload.activeCampaignId || null,
      newRemoteSessionsCount: 0,
      success: true,
      deletedSessionIds: localPayload.deletedSessionIds || []
    };
  }
  try {
    const { mergeCampaignsAndSessions } = await import('../utils/stockCountUtils');
    
    const MAX_INTENTOS = 4;
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      const remoteData = await loadCampaignsFromCloud(configSheetName);
      const mergeResult = mergeCampaignsAndSessions(localPayload, remoteData);

      const saveRes = await saveCampaignsToCloud({
        campaigns: mergeResult.mergedCampaigns,
        activeCampaignId: mergeResult.activeCampaignId,
        sessions: mergeResult.mergedSessions,
        deletedSessionIds: mergeResult.deletedSessionIds
      }, configSheetName, remoteData?.version ?? '');

      if (saveRes.success) {
        return {
          ...mergeResult,
          success: true
        };
      }

      if (!saveRes.conflict) {
        return {
          mergedCampaigns: localPayload.campaigns,
          mergedSessions: localPayload.sessions,
          activeCampaignId: localPayload.activeCampaignId || null,
          newRemoteSessionsCount: 0,
          success: false,
          deletedSessionIds: localPayload.deletedSessionIds || []
        };
      }

      console.warn(`[Sheets] Conflicto de version al sincronizar campanas (intento ${intento}/${MAX_INTENTOS}); re-fusionando con el estado vigente.`);
    }

    console.error('[Sheets] No se pudo sincronizar campanas tras varios conflictos de version.');
    return {
      mergedCampaigns: localPayload.campaigns,
      mergedSessions: localPayload.sessions,
      activeCampaignId: localPayload.activeCampaignId || null,
      newRemoteSessionsCount: 0,
      success: false,
      deletedSessionIds: localPayload.deletedSessionIds || []
    };
  } catch (err) {
    console.error('[Sheets] Error durante syncCampaignsWithCloud:', err);
    return {
      mergedCampaigns: localPayload.campaigns,
      mergedSessions: localPayload.sessions,
      activeCampaignId: localPayload.activeCampaignId || null,
      newRemoteSessionsCount: 0,
      success: false,
      deletedSessionIds: localPayload.deletedSessionIds || []
    };
  }
}
