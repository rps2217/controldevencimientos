export const SPREADSHEET_ID = '1a4jGo-7pduH4fue73F_67sQYJS0LJqI7hiXYpyWVA8o';

function getScriptUrl(): string | null {
  try {
    const url = localStorage.getItem('appsheet_clone_scriptUrl');
    return url ? url.trim() : null;
  } catch {
    return null;
  }
}

export interface ScriptResponse<T = any> {
  success?: boolean;
  error?: string;
  values?: any[][];
  sheets?: any[];
  config?: any;
  [key: string]: any;
}

interface FetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

function getSecurityToken(): string {
  try {
    return localStorage.getItem('appsheet_clone_securityToken') || '';
  } catch {
    return '';
  }
}

/**
 * Robust fetch client for Google Apps Script with exponential backoff retries,
 * network timeout handling, and informative Spanish error messages.
 */
async function fetchFromScript<T = ScriptResponse>(
  payload: Record<string, any>,
  options: FetchOptions = {}
): Promise<T> {
  const { timeoutMs = 28000, maxRetries = 2, retryDelayMs = 1200 } = options;

  const url = getScriptUrl();
  if (!url) {
    throw new Error('La URL del script no está configurada. Ve a Configuración para ingresar tu Web App URL.');
  }

  // Intercept and inject dynamic Spreadsheet ID and Security Token
  const customId = (() => {
    try {
      return localStorage.getItem('appsheet_clone_spreadsheetId') || '';
    } catch {
      return '';
    }
  })();
  
  const finalSpreadsheetId = customId.trim() ? customId.trim() : SPREADSHEET_ID;
  
  const finalPayload = {
    ...payload,
    spreadsheetId: payload.spreadsheetId === SPREADSHEET_ID ? finalSpreadsheetId : (payload.spreadsheetId || finalSpreadsheetId),
    securityToken: getSecurityToken()
  };

  let attempt = 0;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // By using text/plain, fetch avoids unnecessary CORS preflight (OPTIONS)
      // which Apps Script doesn't handle natively.
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(finalPayload),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Error en el servicio de Google Apps Script (HTTP ${response.status}: ${response.statusText})`);
      }

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('La respuesta de Google Apps Script no tiene formato JSON válido. Verifica que el Web App esté desplegado con acceso para "Cualquiera" (Anyone).');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;

      const isAbort = err.name === 'AbortError';
      const isNetworkError = err.message && (
        err.message.includes('Failed to fetch') ||
        err.message.includes('NetworkError') ||
        err.message.includes('Load failed')
      );

      // Only retry if it was a network drop or transient timeout and we have attempts left
      if ((isAbort || isNetworkError) && attempt < maxRetries) {
        attempt++;
        const backoff = retryDelayMs * Math.pow(1.5, attempt - 1);
        console.warn(`[AppsScript] Reintento ${attempt}/${maxRetries} tras fallo transitorio (${err.message}). Esperando ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      if (isAbort) {
        throw new Error(`La solicitud a Google Apps Script excedió el tiempo límite (${Math.round(timeoutMs / 1000)}s). Verifica tu conexión o el volumen de datos.`);
      }
      if (isNetworkError) {
        throw new Error('Error de conexión con Google Apps Script. Asegúrate de que el Web App esté publicado con acceso "Cualquiera" (Anyone) y no requiera inicio de sesión corporativo restringido.');
      }

      throw err;
    }
  }

  throw lastError || new Error('Fallo al comunicarse con Google Apps Script.');
}

// In-memory cache structures with TTL to avoid redundant HTTP requests
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const METADATA_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SHEET_DATA_TTL_MS = 3 * 60 * 1000; // 3 minutes
const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedMetadata: CacheEntry<any> | null = null;
let cachedPropertiesConfig: CacheEntry<any> | null = null;
const cachedSheetsData = new Map<string, CacheEntry<any[][]>>();

export function clearSheetsCache(sheetName?: string) {
  if (sheetName) {
    cachedSheetsData.delete(sheetName.trim().toLowerCase());
  } else {
    cachedSheetsData.clear();
    cachedMetadata = null;
    cachedPropertiesConfig = null;
  }
}

export async function getSpreadsheetMetadata(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedMetadata && (now - cachedMetadata.timestamp < METADATA_TTL_MS)) {
    return cachedMetadata.data;
  }
  const data = await fetchFromScript({ action: 'getMetadata', spreadsheetId: SPREADSHEET_ID });
  cachedMetadata = { data, timestamp: now };
  return data;
}

export async function getSheetData(sheetName: string, forceRefresh = false) {
  const now = Date.now();
  const key = sheetName.trim().toLowerCase();
  if (!forceRefresh && cachedSheetsData.has(key)) {
    const entry = cachedSheetsData.get(key)!;
    if (now - entry.timestamp < SHEET_DATA_TTL_MS) {
      return entry.data;
    }
  }

  const data = await fetchFromScript({ action: 'getSheetData', sheetName, spreadsheetId: SPREADSHEET_ID });
  const values = data.values || [];
  cachedSheetsData.set(key, { data: values, timestamp: now });
  return values;
}

/**
 * Carga en lote de múltiples hojas en un solo viaje HTTP (Batch Fetching).
 * Reduce la latencia acumulada de conexión de ~6s a ~1.5s.
 */
export async function getAllSheetsData(
  sheetNames: string[],
  forceRefresh = false
): Promise<Record<string, any[][]>> {
  const result: Record<string, any[][]> = {};
  const namesToFetch: string[] = [];
  const now = Date.now();

  for (const name of sheetNames) {
    if (!name) continue;
    const key = name.trim().toLowerCase();
    if (!forceRefresh && cachedSheetsData.has(key)) {
      const entry = cachedSheetsData.get(key)!;
      if (now - entry.timestamp < SHEET_DATA_TTL_MS) {
        result[name] = entry.data;
        continue;
      }
    }
    namesToFetch.push(name);
  }

  if (namesToFetch.length === 0) {
    return result;
  }

  try {
    const res = await fetchFromScript({
      action: 'getAllSheetsData',
      sheetNames: namesToFetch,
      spreadsheetId: SPREADSHEET_ID
    });

    if (res && res.success && res.data) {
      for (const [name, rows] of Object.entries(res.data as Record<string, any[][]>)) {
        const rowsArr = rows || [];
        result[name] = rowsArr;
        cachedSheetsData.set(name.trim().toLowerCase(), { data: rowsArr, timestamp: now });
      }
      return result;
    }
  } catch (err) {
    console.warn('[Sheets] getAllSheetsData falló o el Web App no ha sido actualizado, aplicando fallback en paralelo:', err);
  }

  // Fallback retrocompatible: si el script remoto es una versión anterior sin getAllSheetsData
  const fallbackPromises = namesToFetch.map(async (name) => {
    try {
      const rows = await getSheetData(name, forceRefresh);
      result[name] = rows;
    } catch (e) {
      console.warn(`[Sheets] Error al obtener hoja fallback "${name}":`, e);
      result[name] = [];
    }
  });
  await Promise.all(fallbackPromises);

  return result;
}

export async function appendRow(sheetName: string, values: any[]) {
  clearSheetsCache(sheetName);
  return fetchFromScript({ action: 'appendRow', sheetName, values, spreadsheetId: SPREADSHEET_ID });
}

export async function updateRow(
  sheetName: string, 
  rowIndex: number | null | undefined, 
  values: any[],
  extraKeys?: { entityKey?: string; keyValue?: string; entityKeyCol?: string; keyColumn?: string }
) {
  clearSheetsCache(sheetName);
  const parsedRowIndex = typeof rowIndex === 'number' && !isNaN(rowIndex) && rowIndex >= 1 
    ? Math.floor(rowIndex) 
    : (typeof rowIndex === 'string' && !isNaN(parseInt(rowIndex, 10)) && parseInt(rowIndex, 10) >= 1 ? parseInt(rowIndex, 10) : 0);

  const entityKey = extraKeys?.entityKey || extraKeys?.keyValue;

  if (parsedRowIndex < 1 && !entityKey) {
    throw new Error(`Índice de fila inválido (${rowIndex}) para actualizar en "${sheetName}". Se requiere un número de fila válido o una clave de entidad.`);
  }

  const safeRowIndex = parsedRowIndex >= 1 ? parsedRowIndex : 0;

  return fetchFromScript({ 
    action: 'updateRow', 
    sheetName, 
    rowIndex: safeRowIndex, 
    row: safeRowIndex,
    rowNumber: safeRowIndex,
    targetRow: safeRowIndex,
    entityKey: entityKey || undefined,
    keyValue: entityKey || undefined,
    values, 
    spreadsheetId: SPREADSHEET_ID 
  });
}

export async function deleteRow(sheetId: number, rowIndex: number | null | undefined, sheetName?: string) {
  clearSheetsCache(sheetName);
  const parsedRowIndex = typeof rowIndex === 'number' && !isNaN(rowIndex) && rowIndex >= 1 
    ? Math.floor(rowIndex) 
    : (typeof rowIndex === 'string' && !isNaN(parseInt(rowIndex, 10)) && parseInt(rowIndex, 10) >= 1 ? parseInt(rowIndex, 10) : 0);

  if (parsedRowIndex < 1) {
    throw new Error(`Índice de fila inválido (${rowIndex}) para eliminar en "${sheetName || sheetId}".`);
  }

  return fetchFromScript({ 
    action: 'deleteRow', 
    sheetId, 
    rowIndex: parsedRowIndex, 
    row: parsedRowIndex,
    rowNumber: parsedRowIndex,
    targetRow: parsedRowIndex,
    sheetName, 
    spreadsheetId: SPREADSHEET_ID 
  });
}

export async function deleteRows(sheetId: number, rowIndexes: (number | string)[], sheetName?: string) {
  clearSheetsCache(sheetName);
  const validIndexes = (rowIndexes || [])
    .map(idx => typeof idx === 'number' ? Math.floor(idx) : parseInt(String(idx), 10))
    .filter(idx => !isNaN(idx) && idx >= 1);

  if (validIndexes.length === 0) {
    throw new Error(`No hay índices de fila válidos para eliminar en "${sheetName || sheetId}".`);
  }

  return fetchFromScript({ 
    action: 'deleteRows', 
    sheetId, 
    rowIndexes: validIndexes, 
    rows: validIndexes,
    sheetName, 
    spreadsheetId: SPREADSHEET_ID 
  });
}

/**
 * Realiza un test de latencia en milisegundos y salud de conexión hacia Google Apps Script
 */
export async function pingGoogleSheets(): Promise<{ 
  success: boolean; 
  latencyMs: number; 
  error?: string; 
  urlConfigured: boolean 
}> {
  const url = getScriptUrl();
  if (!url) {
    return { success: false, latencyMs: 0, urlConfigured: false, error: 'URL no configurada (Modo Local)' };
  }

  const tStart = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'getAppProperties',
        securityToken: getSecurityToken()
      }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const tEnd = performance.now();
    const latencyMs = Math.round(tEnd - tStart);

    if (!response.ok) {
      return { success: false, latencyMs, urlConfigured: true, error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (data && data.error) {
        return { success: false, latencyMs, urlConfigured: true, error: data.error };
      }
    } catch (e) {
      // Ignore parse failure if not valid JSON, but trust HTTP 200
    }

    return { success: true, latencyMs, urlConfigured: true };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const tEnd = performance.now();
    const latencyMs = Math.round(tEnd - tStart);
    return {
      success: false,
      latencyMs,
      urlConfigured: true,
      error: err.name === 'AbortError' ? 'Tiempo de espera agotado (>6s)' : (err.message || 'Error de conexión')
    };
  }
}

// PropertiesService storage (zero extra sheets needed)
export async function getScriptPropertiesConfig(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedPropertiesConfig && (now - cachedPropertiesConfig.timestamp < CONFIG_TTL_MS)) {
    return cachedPropertiesConfig.data;
  }
  try {
    const res = await fetchFromScript({ action: 'getAppProperties', spreadsheetId: SPREADSHEET_ID });
    if (res && res.success && res.config && (res.config.schema || res.config.main)) {
      cachedPropertiesConfig = { data: res.config, timestamp: now };
      return res.config;
    }
  } catch (e) {
    console.warn('Script Properties config not found or not supported yet:', e);
  }
  return null;
}

export async function saveScriptPropertiesConfig(config: any) {
  cachedPropertiesConfig = { data: config, timestamp: Date.now() };
  return fetchFromScript({ 
    action: 'saveAppProperties', 
    config, 
    spreadsheetId: SPREADSHEET_ID 
  });
}

export async function loadCloudConfig(configSheetName = '_CONFIG_APP') {
  try {
    const data = await getSheetData(configSheetName);
    if (data && data.length >= 2) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === 'APP_CONFIG' && data[i][1]) {
          return JSON.parse(data[i][1]);
        }
      }
      if (data[1][1] && data[1][1].startsWith('{')) {
        return JSON.parse(data[1][1]);
      }
      if (data[1][0] && data[1][0].startsWith('{')) {
        return JSON.parse(data[1][0]);
      }
    }
  } catch (e) {
    console.warn('Could not load cloud config:', e);
  }
  return null;
}

export async function saveCloudConfig(config: any, configSheetName = '_CONFIG_APP') {
  const jsonStr = JSON.stringify(config, null, 2);
  const nowIso = new Date().toISOString();

  // 1. Guardar en Script Properties si está disponible
  try {
    await fetchFromScript({
      action: 'saveAppProperties',
      config: jsonStr,
      propertyName: 'APP_CONFIG',
      spreadsheetId: SPREADSHEET_ID
    });
  } catch (err) {
    console.warn('[Sheets] ScriptProperties save skipped:', err);
  }

  // 2. Guardar en la hoja _CONFIG_APP
  const rows = await getSheetData(configSheetName, true);
  
  if (!rows || rows.length === 0) {
    await appendRow(configSheetName, ['CLAVE', 'VALOR_JSON', 'ULTIMA_ACTUALIZACION']);
    await appendRow(configSheetName, ['APP_CONFIG', jsonStr, nowIso]);
  } else if (rows.length === 1) {
    await appendRow(configSheetName, ['APP_CONFIG', jsonStr, nowIso]);
  } else {
    // Buscar la fila exacta de APP_CONFIG
    let targetRow = 2;
    for (let r = 0; r < rows.length; r++) {
      if (rows[r] && String(rows[r][0] || '').trim() === 'APP_CONFIG') {
        targetRow = r + 1;
        break;
      }
    }
    await updateRow(configSheetName, targetRow, ['APP_CONFIG', jsonStr, nowIso], { entityKey: 'APP_CONFIG' });
  }
}

/**
 * Persistencia en la nube de Campañas de Inventario y Sesiones de Conteo.
 * Permite que cualquier dispositivo conectado a Google Sheets comparta y consulte las campañas.
 */
export async function saveCampaignsToCloud(
  campaignsPayload: {
    campaigns: any[];
    activeCampaignId?: string | null;
    sessions?: any[];
    lastUpdated?: string;
  },
  configSheetName = '_CONFIG_APP'
): Promise<boolean> {
  if (!getScriptUrl()) {
    console.warn('[Sheets] saveCampaignsToCloud omitido: URL de script no configurada (Modo Demo)');
    return false;
  }
  try {
    const nowIso = new Date().toISOString();
    const jsonStr = JSON.stringify({
      ...campaignsPayload,
      lastUpdated: nowIso
    });

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
      const prevCount = prevCountStr ? parseInt(prevCountStr, 10) : 0;
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

    return true;
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
  campaigns?: any[];
  activeCampaignId?: string | null;
  sessions?: any[];
  lastUpdated?: string;
} | null> {
  if (!getScriptUrl()) {
    console.warn('[Sheets] loadCampaignsFromCloud omitido: URL de script no configurada (Modo Demo)');
    return null;
  }
  // 1. Intentar cargar desde la hoja _CONFIG_APP con ensamblado de chunks (soporta fotos ERP de cualquier tamaño)
  try {
    const rows = await getSheetData(configSheetName, true);
    if (rows && rows.length >= 2) {
      const rowKeyMap = new Map<string, string>();
      for (let i = 1; i < rows.length; i++) {
        const k = String(rows[i][0] || '').trim();
        const v = String(rows[i][1] || '');
        if (k) rowKeyMap.set(k, v);
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
              return parsed;
            }
          }
        }
      }

      // B. Si no hay chunks, verificar clave CAMPAIGNS_DATA tradicional
      const singleData = rowKeyMap.get('CAMPAIGNS_DATA');
      if (singleData && !singleData.startsWith('[CHUNKED:')) {
        const parsed = JSON.parse(singleData);
        if (parsed && Array.isArray(parsed.campaigns)) {
          return parsed;
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
 * Descarga los datos remotos, los fusiona inteligentemente sin pérdida de conteos ni sesiones,
 * y empuja la versión consolidada a la nube.
 */
export async function syncCampaignsWithCloud(
  localPayload: {
    campaigns: any[];
    activeCampaignId?: string | null;
    sessions: any[];
  },
  configSheetName = '_CONFIG_APP'
): Promise<{
  mergedCampaigns: any[];
  mergedSessions: any[];
  activeCampaignId: string | null;
  newRemoteSessionsCount: number;
  success: boolean;
}> {
  if (!getScriptUrl()) {
    console.warn('[Sheets] syncCampaignsWithCloud omitido: URL de script no configurada (Modo Demo)');
    return {
      mergedCampaigns: localPayload.campaigns,
      mergedSessions: localPayload.sessions,
      activeCampaignId: localPayload.activeCampaignId || null,
      newRemoteSessionsCount: 0,
      success: true
    };
  }
  try {
    const { mergeCampaignsAndSessions } = await import('../utils/stockCountUtils');
    
    // 1. Descargar estado remoto
    const remoteData = await loadCampaignsFromCloud(configSheetName);

    // 2. Fusionar inteligentemente sesiones y campañas
    const mergeResult = mergeCampaignsAndSessions(localPayload, remoteData);

    // 3. Empujar estado fusionado a la nube
    await saveCampaignsToCloud({
      campaigns: mergeResult.mergedCampaigns,
      activeCampaignId: mergeResult.activeCampaignId,
      sessions: mergeResult.mergedSessions
    }, configSheetName);

    return {
      ...mergeResult,
      success: true
    };
  } catch (err) {
    console.error('[Sheets] Error durante syncCampaignsWithCloud:', err);
    return {
      mergedCampaigns: localPayload.campaigns,
      mergedSessions: localPayload.sessions,
      activeCampaignId: localPayload.activeCampaignId || null,
      newRemoteSessionsCount: 0,
      success: false
    };
  }
}

export const AUDIT_SHEET_DEFAULT_HEADERS = [
  'ID_CAMPANA',
  'FECHA_AUDITORIA',
  'LOCAL',
  'SKU',
  'DESCRIPCION',
  'PROVEEDOR',
  'STOCK_ERP',
  'STOCK_FISICO',
  'DIFERENCIA',
  'VENTA_AJUSTE',
  'ESTADO_AUDITORIA',
  'UBICACIONES_MUEBLES',
  'USUARIO_TERMINAL',
  'ULTIMA_ACTUALIZACION'
];

/**
 * Guarda las filas consolidadas de auditoría física en una pestaña DEDICADA de Google Sheets
 * (por defecto "_AUDITORIA_INVENTARIO" o "AUDITORIA_CAMPANAS").
 * PRESERVA la pestaña VENCIMIENTOS intacta y sin mezclar.
 */
export async function saveAuditRowsToDedicatedSheet(
  sheetName: string = '_AUDITORIA_INVENTARIO',
  rows: Record<string, any>[]
): Promise<{ success: boolean; count: number; sheetName: string }> {
  if (!rows || rows.length === 0) {
    return { success: true, count: 0, sheetName };
  }

  clearSheetsCache(sheetName);
  let existingData: any[][] = [];
  try {
    existingData = await getSheetData(sheetName, true);
  } catch (err) {
    console.warn(`[Sheets] La hoja ${sheetName} no existe aún o está vacía, se creará al insertar datos.`, err);
    existingData = [];
  }

  const headerList: string[] = existingData[0] && existingData[0].length > 0 
    ? existingData[0].map(h => String(h).trim().toUpperCase()) 
    : AUDIT_SHEET_DEFAULT_HEADERS;

  // Mapa de filas existentes por clave compuesta de campaña + SKU
  const existingRowsMap = new Map<string, any[]>();
  const campaignColIdx = headerList.findIndex(h => /ID_CAMPANA|CAMPANA/i.test(h));
  const skuColIdx = headerList.findIndex(h => /^SKU$|CODIGO/i.test(h));

  for (let r = 1; r < existingData.length; r++) {
    const row = existingData[r];
    const campVal = campaignColIdx >= 0 ? String(row[campaignColIdx] || '').trim() : '';
    const skuVal = skuColIdx >= 0 ? String(row[skuColIdx] || '').trim() : '';
    if (skuVal) {
      existingRowsMap.set(`${campVal}_${skuVal}`, row);
    }
  }

  const nowIso = new Date().toISOString();

  // Incorporar / sobrescribir las nuevas filas de auditoría
  for (const row of rows) {
    const campId = String(row.ID_CAMPANA || row.id_campana || '').trim();
    const sku = String(row.SKU || row.sku || '').trim();
    const compositeKey = `${campId}_${sku}`;

    const rowValues = headerList.map(header => {
      if (header === 'ULTIMA_ACTUALIZACION') return nowIso;
      if (row[header] !== undefined) return String(row[header]);
      const lowerKey = header.toLowerCase();
      if (row[lowerKey] !== undefined) return String(row[lowerKey]);
      return '';
    });

    existingRowsMap.set(compositeKey, rowValues);
  }

  // Ensamblar la matriz completa (Encabezados + Todas las filas consolidadas)
  const fullMatrix: any[][] = [
    headerList,
    ...Array.from(existingRowsMap.values())
  ];

  // 1. Intentar volcado en lote ultra-rápido en una sola petición HTTP (setSheetData)
  try {
    const batchRes = await fetchFromScript({
      action: 'setSheetData',
      sheetName,
      values: fullMatrix,
      rows: fullMatrix,
      spreadsheetId: SPREADSHEET_ID
    });

    if (batchRes && batchRes.success) {
      clearSheetsCache(sheetName);
      return {
        success: true,
        count: rows.length,
        sheetName
      };
    }
  } catch (batchErr) {
    console.warn('[Sheets] Volcado setSheetData no soportado por versión antigua de Apps Script, aplicando fallback fila a fila:', batchErr);
  }

  // 2. Fallback resiliente para implementaciones anteriores de Apps Script
  if (!existingData || existingData.length === 0) {
    await appendRow(sheetName, headerList);
  }

  let successCount = 0;
  for (const row of rows) {
    const values = headerList.map(header => {
      if (header === 'ULTIMA_ACTUALIZACION') return nowIso;
      if (row[header] !== undefined) return String(row[header]);
      const lowerKey = header.toLowerCase();
      if (row[lowerKey] !== undefined) return String(row[lowerKey]);
      return '';
    });

    try {
      await appendRow(sheetName, values);
      successCount++;
    } catch (e) {
      console.error('[Sheets] Error insertando fila en hoja de auditoría:', e);
    }
  }

  return { 
    success: true, 
    count: successCount, 
    sheetName 
  };
}

export const APPS_SCRIPT_TEMPLATE = `// Google Apps Script (Code.gs) - Versión de Alto Rendimiento (Lectura Concurrente + Carga en Lote)
function doPost(e) {
  let isWriteAction = false;
  let lock = null;
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const spreadsheetId = payload.spreadsheetId;

    // CONTROL DE SEGURIDAD / VALIDACIÓN DE PIN-TOKEN
    const SECURITY_PIN = ""; // Puedes escribir un PIN de 4 dígitos o contraseña aquí para forzarlo
    const scriptProperties = PropertiesService.getScriptProperties();
    const expectedToken = SECURITY_PIN || scriptProperties.getProperty('SECURITY_TOKEN') || '';
    if (expectedToken && payload.securityToken !== expectedToken) {
      return responseJson({ error: 'Acceso No Autorizado: PIN o Token de seguridad incorrecto o ausente.' });
    }

    const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();

    // OPTIMIZACIÓN 1: El candado de exclusión SOLO se activa en escrituras/mutaciones
    // Las operaciones de lectura (getMetadata, getSheetData, getAllSheetsData, getAppProperties)
    // corren concurrentemente a máxima velocidad sin colas ni tiempos de espera.
    const writeActions = ['appendRow', 'updateRow', 'deleteRow', 'deleteRows', 'saveAppProperties'];
    isWriteAction = writeActions.indexOf(action) !== -1;
    if (isWriteAction) {
      lock = LockService.getScriptLock();
      lock.waitLock(15000);
    }

    // Helper: Extrae datos en memoria limpia usando getValues() nativo (3x más veloz que getDisplayValues)
    function getCleanSheetValues(sheet) {
      if (!sheet) return [];
      var raw = sheet.getDataRange().getValues();
      if (!raw || raw.length === 0) return [];
      var lastRowIdx = raw.length - 1;
      while (lastRowIdx > 0) {
        var row = raw[lastRowIdx];
        var hasVal = false;
        for (var c = 0; c < row.length; c++) {
          if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
            hasVal = true;
            break;
          }
        }
        if (hasVal) break;
        lastRowIdx--;
      }
      var clean = raw.slice(0, lastRowIdx + 1);
      // Formatear fechas nativas de Google Sheets a formato legible DD/MM/YYYY
      for (var r = 1; r < clean.length; r++) {
        for (var c = 0; c < clean[r].length; c++) {
          var cell = clean[r][c];
          if (cell instanceof Date && !isNaN(cell.getTime())) {
            var dd = ('0' + cell.getDate()).slice(-2);
            var mm = ('0' + (cell.getMonth() + 1)).slice(-2);
            var yyyy = cell.getFullYear();
            clean[r][c] = dd + '/' + mm + '/' + yyyy;
          }
        }
      }
      return clean;
    }

    // 1. METADATOS DE HOJAS
    if (action === 'getMetadata') {
      const sheets = ss.getSheets().map(sheet => ({
        properties: {
          sheetId: sheet.getSheetId(),
          title: sheet.getName(),
          hidden: sheet.isSheetHidden(),
          gridProperties: {
            rowCount: sheet.getMaxRows(),
            columnCount: sheet.getMaxColumns()
          }
        }
      }));
      return responseJson({ sheets: sheets });
    }

    // 2. CARGA EN LOTE DE MÚLTIPLES HOJAS EN UN SOLO VIAJE (BATCH FETCH - ALTA VELOCIDAD)
    if (action === 'getAllSheetsData') {
      const sheetNames = payload.sheetNames || [];
      const results = {};
      for (var sIdx = 0; sIdx < sheetNames.length; sIdx++) {
        var sName = sheetNames[sIdx];
        var targetSheet = ss.getSheetByName(sName);
        if (targetSheet) {
          results[sName] = getCleanSheetValues(targetSheet);
        }
      }
      return responseJson({ success: true, data: results });
    }

    // 3. OBTENER DATOS DE UNA SOLA HOJA
    if (action === 'getSheetData') {
      const sheet = ss.getSheetByName(payload.sheetName);
      if (!sheet) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName, values: [] });
      return responseJson({ values: getCleanSheetValues(sheet) });
    }

    // 4. AGREGAR FILA O FILAS EN LOTE (BATCH APPEND)
    if (action === 'appendRow' || action === 'appendRows') {
      var sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : null;
      if (!sheet && payload.sheetName) {
        sheet = ss.insertSheet(payload.sheetName);
      }
      if (!sheet) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName });
      
      var rowsToAppend = action === 'appendRows' ? (payload.rows || payload.values || []) : [payload.values || []];
      if (!rowsToAppend || rowsToAppend.length === 0) {
        return responseJson({ success: true, count: 0 });
      }

      var lastRow = sheet.getLastRow();
      var maxCols = sheet.getMaxColumns();
      var requiredCols = 1;
      for (var rIdx = 0; rIdx < rowsToAppend.length; rIdx++) {
        if (rowsToAppend[rIdx] && rowsToAppend[rIdx].length > requiredCols) {
          requiredCols = rowsToAppend[rIdx].length;
        }
      }

      if (requiredCols > maxCols) {
        sheet.insertColumnsAfter(maxCols, requiredCols - maxCols);
      }

      // Escribir en un solo bloque getRange().setValues() para velocidad instantánea
      sheet.getRange(lastRow + 1, 1, rowsToAppend.length, requiredCols).setValues(rowsToAppend);
      return responseJson({ success: true, newRow: sheet.getLastRow(), appendedCount: rowsToAppend.length });
    }

    // 4.1 VOLCADO COMPLETO / REEMPLAZO EN LOTE DE HOJA (SET SHEET DATA / BULK SAVE)
    if (action === 'setSheetData' || action === 'batchSetSheetData') {
      var sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : null;
      if (!sheet && payload.sheetName) {
        sheet = ss.insertSheet(payload.sheetName);
      }
      if (!sheet) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName });

      var matrixValues = payload.values || payload.rows || [];
      if (!matrixValues || matrixValues.length === 0) {
        return responseJson({ success: true, count: 0 });
      }

      // Limpiar contenido previo para sincronización limpia y exacta
      sheet.clearContents();

      var numRows = matrixValues.length;
      var numCols = 1;
      for (var m = 0; m < matrixValues.length; m++) {
        if (matrixValues[m] && matrixValues[m].length > numCols) {
          numCols = matrixValues[m].length;
        }
      }

      // Normalizar filas con longitud uniforme
      var normalizedData = [];
      for (var rowI = 0; rowI < numRows; rowI++) {
        var rowArr = matrixValues[rowI] || [];
        var fullRow = [];
        for (var colI = 0; colI < numCols; colI++) {
          fullRow.push(rowArr[colI] !== undefined && rowArr[colI] !== null ? String(rowArr[colI]) : '');
        }
        normalizedData.push(fullRow);
      }

      var maxSheetRows = sheet.getMaxRows();
      if (numRows > maxSheetRows) {
        sheet.insertRowsAfter(maxSheetRows, numRows - maxSheetRows);
      }
      var maxSheetCols = sheet.getMaxColumns();
      if (numCols > maxSheetCols) {
        sheet.insertColumnsAfter(maxSheetCols, numCols - maxSheetCols);
      }

      sheet.getRange(1, 1, numRows, numCols).setValues(normalizedData);
      return responseJson({ success: true, rowCount: numRows, colCount: numCols });
    }

    // 5. ACTUALIZAR FILA
    if (action === 'updateRow') {
      var sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : null;
      if (!sheet && payload.sheetId !== undefined) {
        sheet = ss.getSheets().find(function(s) { return s.getSheetId() === payload.sheetId; });
      }
      if (!sheet && payload.sheetName) {
        sheet = ss.insertSheet(payload.sheetName);
      }
      if (!sheet) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName });
      
      var rawRow = payload.rowIndex !== undefined && payload.rowIndex !== null ? payload.rowIndex : (payload.row !== undefined && payload.row !== null ? payload.row : (payload.rowNumber || payload.targetRow));
      var targetRow = parseInt(rawRow, 10);
      
      // Auto-recuperación si rowIndex es null o inválido: buscar por clave de entidad/CU_VC/SKU
      if (isNaN(targetRow) || targetRow < 1) {
        var searchKey = String(payload.entityKey || payload.keyValue || '').trim().toUpperCase();
        if (searchKey) {
          var allData = sheet.getDataRange().getValues();
          if (allData && allData.length > 1) {
            for (var r = 1; r < allData.length; r++) {
              for (var c = 0; c < allData[r].length; c++) {
                if (String(allData[r][c]).trim().toUpperCase() === searchKey) {
                  targetRow = r + 1;
                  break;
                }
              }
              if (!isNaN(targetRow) && targetRow > 1) break;
            }
          }
        }
      }

      var rowValues = payload.values || [];
      if (!rowValues.length) {
        return responseJson({ error: 'No se enviaron valores para actualizar la fila' });
      }

      // Si no se especificó o no se encontró la fila, anexar de forma segura
      if (isNaN(targetRow) || targetRow < 1) {
        sheet.appendRow(rowValues);
        return responseJson({ success: true, appended: true, updatedRow: sheet.getLastRow() });
      }

      // Expandir filas o columnas si la hoja es más pequeña que la fila/celdas deseadas
      var maxRows = sheet.getMaxRows();
      if (targetRow > maxRows) {
        sheet.insertRowsAfter(maxRows, targetRow - maxRows);
      }
      var maxCols = sheet.getMaxColumns();
      if (rowValues.length > maxCols) {
        sheet.insertColumnsAfter(maxCols, rowValues.length - maxCols);
      }

      sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
      return responseJson({ success: true, updatedRow: targetRow });
    }

    // 6. ELIMINAR FILA O FILAS
    if (action === 'deleteRow' || action === 'deleteRows') {
      var sheet = payload.sheetId !== undefined ? ss.getSheets().find(function(s) { return s.getSheetId() === payload.sheetId; }) : null;
      if (!sheet && payload.sheetName) {
        sheet = ss.getSheetByName(payload.sheetName);
      }
      if (!sheet) return responseJson({ error: 'Hoja no encontrada' });

      var rawIndexes = action === 'deleteRows' ? (payload.rowIndexes || payload.rows || []) : [payload.rowIndex !== undefined ? payload.rowIndex : payload.row];
      var validIndexes = [];
      for (var i = 0; i < rawIndexes.length; i++) {
        var num = parseInt(rawIndexes[i], 10);
        if (!isNaN(num) && num > 1) {
          validIndexes.push(num);
        }
      }

      if (!validIndexes.length) return responseJson({ error: 'No se especificaron filas válidas para eliminar' });

      var sortedIndexes = validIndexes.slice().sort(function(a, b) { return b - a; });
      for (var j = 0; j < sortedIndexes.length; j++) {
        sheet.deleteRow(sortedIndexes[j]);
      }
      return responseJson({ success: true });
    }

    // 7. LEER SCRIPT PROPERTIES (Sin crear hojas)
    if (action === 'getAppProperties') {
      const scriptProps = PropertiesService.getScriptProperties();
      const propName = payload.propertyName || payload.key || 'APP_CONFIG';
      const raw = scriptProps.getProperty(propName);
      let parsed = null;
      if (raw) {
        try { parsed = JSON.parse(raw); } catch (err) { parsed = raw; }
      }
      return responseJson({ success: true, config: parsed, data: parsed, value: raw });
    }

    // 8. GUARDAR EN SCRIPT PROPERTIES (Sin crear hojas)
    if (action === 'saveAppProperties') {
      const scriptProps = PropertiesService.getScriptProperties();
      const propName = payload.propertyName || payload.key || 'APP_CONFIG';
      const valToSave = payload.config !== undefined ? payload.config : payload.value;
      const str = typeof valToSave === 'string' ? valToSave : JSON.stringify(valToSave);
      scriptProps.setProperty(propName, str);
      return responseJson({ success: true });
    }

    return responseJson({ error: 'Acción no soportada: ' + action });
  } catch (err) {
    return responseJson({ error: err.toString() });
  } finally {
    if (isWriteAction && lock) {
      try { lock.releaseLock(); } catch(e) {}
    }
  }
}

function doGet(e) {
  const SECURITY_PIN = ""; // Puedes escribir un PIN de 4 dígitos o contraseña aquí para forzarlo
  const scriptProperties = PropertiesService.getScriptProperties();
  const expectedToken = SECURITY_PIN || scriptProperties.getProperty('SECURITY_TOKEN') || '';
  if (expectedToken && e.parameter.securityToken !== expectedToken) {
    return responseJson({ error: 'Acceso No Autorizado: PIN o Token de seguridad incorrecto o ausente.' });
  }
  return responseJson({ status: 'ok', message: 'API Apps Script lista y conectada.' });
}

function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

export const APPS_SCRIPT_ADVANCED_PROPERTIES_CODE = APPS_SCRIPT_TEMPLATE;
export const APPS_SCRIPT_RECOMMENDED_CODE = APPS_SCRIPT_TEMPLATE;
