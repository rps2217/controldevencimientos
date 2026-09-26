import type { SheetConfig, SheetMetadata, InventoryCampaign, StockCountSession } from '../types';
import { getErrorMessage } from '../utils/pureCalculations';
import { consolidateAuditRows, dedupeAuditRows } from '../utils/auditConsolidation';
import { fetchWithTimeout } from './http';

import { STORAGE_KEYS } from '../utils/appStorage';
import { redactSecretsForCloudSheet } from '../utils/dashboardConfigUtils';
export const SPREADSHEET_ID = '1a4jGo-7pduH4fue73F_67sQYJS0LJqI7hiXYpyWVA8o';

/** Valor de una celda tal como lo devuelve Google Sheets. */
export type CellValue = string | number | boolean | null | undefined;
export type SheetRow = CellValue[];
export type SheetMatrix = SheetRow[];

/** Configuración de la app tal como viaja en Script Properties (incluye claves extra del script). */
export interface CloudConfig extends SheetConfig {
  CAMPAIGNS_DATA?: string;
}

function getScriptUrl(): string | null {
  try {
    const url = localStorage.getItem(STORAGE_KEYS.SCRIPT_URL);
    return url ? url.trim() : null;
  } catch {
    return null;
  }
}

export interface ScriptResponse {
  success?: boolean;
  error?: string;
  values?: SheetMatrix;
  sheets?: SheetMetadata['sheets'];
  data?: Record<string, SheetMatrix>;
  config?: CloudConfig;
  [key: string]: unknown;
}

interface FetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

function getSecurityToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SECURITY_TOKEN) || '';
  } catch {
    return '';
  }
}

/** Normaliza un índice de fila de Google Sheets (1-based). Devuelve 0 si no es un entero >= 1. */
function parseSheetRowIndex(rowIndex: number | string | null | undefined): number {
  const parsed = typeof rowIndex === 'number' ? Math.floor(rowIndex) : parseInt(String(rowIndex ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 0;
}

/**
 * Robust fetch client for Google Apps Script with exponential backoff retries,
 * network timeout handling, and informative Spanish error messages.
 */
async function fetchFromScript<T = ScriptResponse>(
  payload: Record<string, unknown>,
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
      return localStorage.getItem(STORAGE_KEYS.SPREADSHEET_ID) || '';
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
  let lastError: unknown = null;

  while (attempt <= maxRetries) {
    try {
      // By using text/plain, fetch avoids unnecessary CORS preflight (OPTIONS)
      // which Apps Script doesn't handle natively.
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        body: JSON.stringify(finalPayload),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        }
      }, timeoutMs);

      if (!response.ok) {
        throw new Error(`Error en el servicio de Google Apps Script (HTTP ${response.status}: ${response.statusText})`);
      }

      const text = await response.text();
      let data: ScriptResponse;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('La respuesta de Google Apps Script no tiene formato JSON válido. Verifica que el Web App esté desplegado con acceso para "Cualquiera" (Anyone).');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      return data as T;
    } catch (err: unknown) {
      lastError = err;

      const errName = err instanceof Error ? err.name : '';
      const errMsg = getErrorMessage(err);
      const isAbort = errName === 'AbortError';
      const isNetworkError = errMsg.includes('Failed to fetch') ||
        errMsg.includes('NetworkError') ||
        errMsg.includes('Load failed');

      // Only retry if it was a network drop or transient timeout and we have attempts left
      if ((isAbort || isNetworkError) && attempt < maxRetries) {
        attempt++;
        const backoff = retryDelayMs * Math.pow(1.5, attempt - 1);
        console.warn(`[AppsScript] Reintento ${attempt}/${maxRetries} tras fallo transitorio (${errMsg}). Esperando ${backoff}ms...`);
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

let cachedMetadata: CacheEntry<SheetMetadata> | null = null;
let cachedPropertiesConfig: CacheEntry<ScriptResponse['config']> | null = null;
const cachedSheetsData = new Map<string, CacheEntry<SheetMatrix>>();

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
  cachedMetadata = { data: data as SheetMetadata, timestamp: now };
  return data as SheetMetadata;
}

export async function getSheetData(sheetName: string, forceRefresh = false): Promise<SheetMatrix> {
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
): Promise<Record<string, SheetMatrix>> {
  const result: Record<string, SheetMatrix> = {};
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
      for (const [name, rows] of Object.entries(res.data)) {
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

export async function appendRow(sheetName: string, values: SheetRow) {
  clearSheetsCache(sheetName);
  return fetchFromScript({ action: 'appendRow', sheetName, values, spreadsheetId: SPREADSHEET_ID });
}

export async function updateRow(
  sheetName: string, 
  rowIndex: number | null | undefined, 
  values: SheetRow,
  extraKeys?: { entityKey?: string; keyValue?: string; entityKeyCol?: string; keyColumn?: string }
) {
  clearSheetsCache(sheetName);
  const parsedRowIndex = parseSheetRowIndex(rowIndex);

  const entityKey = extraKeys?.entityKey || extraKeys?.keyValue;
  // Columna de la clave (si el resolutor la conoce): permite al servidor buscar en
  // esa columna y no en toda la fila, evitando falsos positivos con SKU numericos.
  const entityKeyCol = extraKeys?.entityKeyCol || extraKeys?.keyColumn;

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
    entityKeyCol: entityKeyCol || undefined,
    values, 
    spreadsheetId: SPREADSHEET_ID 
  });
}

export async function deleteRow(
  sheetId: number,
  rowIndex: number | null | undefined,
  sheetName?: string,
  extraKeys?: { entityKey?: string; keyValue?: string; entityKeyCol?: string; keyColumn?: string }
) {
  clearSheetsCache(sheetName);
  const parsedRowIndex = parseSheetRowIndex(rowIndex);
  const entityKey = extraKeys?.entityKey || extraKeys?.keyValue;
  const entityKeyCol = extraKeys?.entityKeyCol || extraKeys?.keyColumn;

  if (parsedRowIndex < 1 && !entityKey) {
    throw new Error(`Índice de fila inválido (${rowIndex}) para eliminar en "${sheetName || sheetId}".`);
  }

  return fetchFromScript({ 
    action: 'deleteRow', 
    sheetId, 
    rowIndex: parsedRowIndex, 
    row: parsedRowIndex,
    rowNumber: parsedRowIndex,
    targetRow: parsedRowIndex,
    entityKey: entityKey || undefined,
    keyValue: entityKey || undefined,
    entityKeyCol: entityKeyCol || undefined,
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

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      body: JSON.stringify({
        action: 'getAppProperties',
        securityToken: getSecurityToken()
      }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    }, 6000);
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
  } catch (err: unknown) {
    const tEnd = performance.now();
    const latencyMs = Math.round(tEnd - tStart);
    return {
      success: false,
      latencyMs,
      urlConfigured: true,
      error: (err instanceof Error && err.name === 'AbortError') ? 'Tiempo de espera agotado (>6s)' : (getErrorMessage(err) || 'Error de conexión')
    };
  }
}

/**
 * Sondea si el Web App desplegado conoce el guardado atomico de campanas.
 *
 * Por que existe: el cliente degrada al respaldo no atomico cuando el script es
 * antiguo, y ese respaldo puede perder lecturas entre terminales. Antes el aviso
 * solo quedaba en consola, asi que una instalacion sin redesplegar parecia correcta.
 * Se usa una accion de SOLO LECTURA para no escribir nada al sondear.
 */
export async function probeScriptCapabilities(): Promise<{
  reachable: boolean;
  atomicCampaignSave: boolean;
  error?: string;
}> {
  if (!getScriptUrl()) {
    return { reachable: false, atomicCampaignSave: false, error: 'URL de script no configurada (Modo Local)' };
  }
  try {
    const res = await fetchFromScript<{ success?: boolean; capabilities?: { atomicCampaignSave?: boolean } }>({
      action: 'getScriptCapabilities',
      spreadsheetId: SPREADSHEET_ID
    });
    return {
      reachable: true,
      atomicCampaignSave: res?.capabilities?.atomicCampaignSave === true
    };
  } catch (err) {
    // Un script anterior responde "Accion no soportada": alcanzable, pero sin la accion.
    const msg = getErrorMessage(err);
    const noSoportada = /Acci[oó]n no soportada/.test(msg);
    return {
      reachable: !noSoportada,
      atomicCampaignSave: false,
      error: noSoportada ? 'El script desplegado es anterior: no conoce el guardado atómico.' : msg
    };
  }
}

// PropertiesService storage (zero extra sheets needed)
export async function getScriptPropertiesConfig(forceRefresh = false): Promise<ScriptResponse['config'] | null> {
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

export async function saveScriptPropertiesConfig(config: CloudConfig) {
  cachedPropertiesConfig = { data: config, timestamp: Date.now() };
  return fetchFromScript({ 
    action: 'saveAppProperties', 
    config, 
    spreadsheetId: SPREADSHEET_ID 
  });
}

export async function loadCloudConfig(configSheetName = '_CONFIG_APP'): Promise<SheetConfig | null> {
  const parseCellConfig = (cell: CellValue): SheetConfig | null => {
    if (typeof cell !== 'string' || !cell.startsWith('{')) return null;
    try {
      return JSON.parse(cell);
    } catch {
      return null;
    }
  };

  try {
    const data = await getSheetData(configSheetName);
    if (data && data.length >= 2) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === 'APP_CONFIG' && data[i][1]) {
          const parsed = parseCellConfig(data[i][1]);
          if (parsed) return parsed;
        }
      }
      return parseCellConfig(data[1][1]) || parseCellConfig(data[1][0]);
    }
  } catch (e) {
    console.warn('Could not load cloud config:', e);
  }
  return null;
}

export async function saveCloudConfig(config: SheetConfig, configSheetName = '_CONFIG_APP') {
  // La pestaña `_CONFIG_APP` la lee cualquiera con acceso a la hoja, así que su
  // JSON va sin secretos. Script Properties (paso 1) es privado y conserva la
  // config íntegra: por eso se serializan por separado.
  const jsonStr = JSON.stringify(config, null, 2);
  const sheetJsonStr = JSON.stringify(redactSecretsForCloudSheet(config), null, 2);
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
    await appendRow(configSheetName, ['APP_CONFIG', sheetJsonStr, nowIso]);
  } else if (rows.length === 1) {
    await appendRow(configSheetName, ['APP_CONFIG', sheetJsonStr, nowIso]);
  } else {
    // Buscar la fila exacta de APP_CONFIG
    let targetRow = 2;
    for (let r = 0; r < rows.length; r++) {
      if (rows[r] && String(rows[r][0] || '').trim() === 'APP_CONFIG') {
        targetRow = r + 1;
        break;
      }
    }
    await updateRow(configSheetName, targetRow, ['APP_CONFIG', sheetJsonStr, nowIso], { entityKey: 'APP_CONFIG' });
  }
}

/** Resultado de un guardado de campañas: `conflict` indica que otra terminal escribió antes. */
export interface CampaignSaveResult {
  success: boolean;
  conflict?: boolean;
  current?: {
    campaigns?: InventoryCampaign[];
    sessions?: StockCountSession[];
    activeCampaignId?: string | null;
    lastUpdated?: string;
  } | null;
}

/**
 * Persistencia en la nube de Campañas de Inventario y Sesiones de Conteo.
 * Permite que cualquier dispositivo conectado a Google Sheets comparta y consulte las campañas.
 *
 * `expectedVersion` activa concurrencia optimista: el servidor compara la versión
 * almacenada contra la que el cliente leyó y, si otra terminal escribió antes,
 * rechaza el guardado devolviendo el estado vigente. Sin esto, dos terminales que
 * leen antes de que la otra escriba producen un lost update: la segunda guarda un
 * estado fusionado sobre una lectura obsoleta y borra las lecturas de la primera.
 */
export async function saveCampaignsToCloud(
  campaignsPayload: {
    campaigns: InventoryCampaign[];
    activeCampaignId?: string | null;
    sessions?: StockCountSession[];
    lastUpdated?: string;
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

    // 1. Intento atómico (compare-and-swap) en una sola llamada al servidor. El
    //    candado de Apps Script no basta por sí solo: el respaldo en chunks son
    //    varias peticiones HTTP, y entre una y otra otra terminal puede escribir.
    //    Un único POST con verificación de versión elimina esa ventana.
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
      // Web App desplegada con una versión anterior del script: no conoce la acción.
      // Se degrada al camino no atómico para no romper instalaciones existentes.
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
  /** Versión del estado leído: se devuelve al guardar para detectar escrituras ajenas. */
  version?: string;
} | null> {
  if (!getScriptUrl()) {
    console.warn('[Sheets] loadCampaignsFromCloud omitido: URL de script no configurada (Modo Demo)');
    return null;
  }
  // 1. Intentar cargar desde la hoja _CONFIG_APP con ensamblado de chunks (soporta fotos ERP de cualquier tamaño)
  try {
    const rows = await getSheetData(configSheetName, true);
    if (rows && rows.length >= 1) {
      const rowKeyMap = new Map<string, string>();
      // La fila 0 es encabezado solo si lo parece: si la hoja se creo sin el, saltarla
      // ocultaria la primera clave (mismo criterio que saveCampaignsAtomic en el script).
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
 * Descarga los datos remotos, los fusiona inteligentemente sin pérdida de conteos ni sesiones,
 * y empuja la versión consolidada a la nube.
 */
export async function syncCampaignsWithCloud(
  localPayload: {
    campaigns: InventoryCampaign[];
    activeCampaignId?: string | null;
    sessions: StockCountSession[];
  },
  configSheetName = '_CONFIG_APP'
): Promise<{
  mergedCampaigns: InventoryCampaign[];
  mergedSessions: StockCountSession[];
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
    
    // Reintento sobre conflicto de version: si otra terminal escribio entre el load
    // y el save, se re-fusiona contra el estado vigente y se reintenta.
    const MAX_INTENTOS = 4;
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      // 1. Descargar estado remoto
      const remoteData = await loadCampaignsFromCloud(configSheetName);

      // 2. Fusionar inteligentemente sesiones y campañas
      const mergeResult = mergeCampaignsAndSessions(localPayload, remoteData);

      // 3. Empujar estado fusionado con la version leida (compare-and-swap). El
      //    reintento cubre el caso de que otra terminal haya escrito entre el load
      //    y el save: se re-fusiona contra el estado vigente. La fusion es
      //    idempotente por entrada, asi que reintentar no duplica lecturas.
      const saveRes = await saveCampaignsToCloud({
        campaigns: mergeResult.mergedCampaigns,
        activeCampaignId: mergeResult.activeCampaignId,
        sessions: mergeResult.mergedSessions
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
          success: false
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
      success: false
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
  rows: Record<string, CellValue>[]
): Promise<{ success: boolean; count: number; sheetName: string }> {
  if (!rows || rows.length === 0) {
    return { success: true, count: 0, sheetName };
  }

  clearSheetsCache(sheetName);
  let existingData: SheetMatrix = [];
  try {
    existingData = await getSheetData(sheetName, true);
  } catch (err) {
    console.warn(`[Sheets] La hoja ${sheetName} no existe aún o está vacía, se creará al insertar datos.`, err);
    existingData = [];
  }

  const headerList: string[] = existingData[0] && existingData[0].length > 0 
    ? existingData[0].map(h => String(h).trim().toUpperCase()) 
    : AUDIT_SHEET_DEFAULT_HEADERS;

  const nowIso = new Date().toISOString();

  // Encabezados + filas consolidadas por campaña + SKU (sin duplicar)
  const fullMatrix: SheetMatrix = consolidateAuditRows(existingData, rows, headerList, nowIso);
  // Conteo honesto: filas realmente distintas escritas para este lote
  const consolidatedCount = dedupeAuditRows(rows, headerList, nowIso).length;

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
        count: consolidatedCount,
        sheetName
      };
    }
  } catch (batchErr) {
    console.warn('[Sheets] Volcado setSheetData no soportado por versión antigua de Apps Script, aplicando fallback fila a fila:', batchErr);
  }

  // 2. Fallback resiliente para implementaciones anteriores de Apps Script.
  // No hay setSheetData para sobrescribir por clave: se insertan las filas
  // consolidadas de esta campaña, deduplicadas en memoria, para no duplicar
  // filas repetidas dentro del mismo lote.
  const rowsToAppend = dedupeAuditRows(rows, headerList, nowIso);

  if (!existingData || existingData.length === 0) {
    await appendRow(sheetName, headerList);
  }

  let successCount = 0;
  for (const values of rowsToAppend) {
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
    const writeActions = ['appendRow', 'appendRows', 'updateRow', 'deleteRow', 'deleteRows', 'saveAppProperties', 'setSheetData', 'batchSetSheetData', 'saveCampaignsAtomic'];
    isWriteAction = writeActions.indexOf(action) !== -1;
    if (isWriteAction) {
      lock = LockService.getScriptLock();
      lock.waitLock(15000);
    }

    // Helper: localiza la fila que contiene una clave de entidad (CU_VC/SKU/ID).
    // Devuelve el numero de fila (1-based) o -1.
    //
    // Si se conoce la columna de la clave se busca SOLO ahi. Escanear toda la fila
    // es peligroso con SKU numericos: un codigo corto (p. ej. "100") puede coincidir
    // con una celda de CANTIDAD o STOCK de otra fila y la escritura iria a la fila
    // equivocada. Sin columna conocida se exige coincidencia unica en toda la fila,
    // de modo que una ambiguedad no reubique nada.
    function findRowByKey(sheet, searchKey, keyColumnName) {
      if (!sheet || !searchKey) return -1;
      var data = sheet.getDataRange().getValues();
      if (!data || data.length < 2) return -1;

      var colIdx = -1;
      if (keyColumnName) {
        var wanted = String(keyColumnName).trim().toUpperCase();
        for (var h = 0; h < data[0].length; h++) {
          if (String(data[0][h]).trim().toUpperCase() === wanted) { colIdx = h; break; }
        }
      }

      var encontradas = [];
      for (var r = 1; r < data.length; r++) {
        if (colIdx >= 0) {
          if (String(data[r][colIdx]).trim().toUpperCase() === searchKey) encontradas.push(r + 1);
        } else {
          for (var c = 0; c < data[r].length; c++) {
            if (String(data[r][c]).trim().toUpperCase() === searchKey) { encontradas.push(r + 1); break; }
          }
        }
      }
      return encontradas.length === 1 ? encontradas[0] : -1;
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

    // 3.5 CAPACIDADES DEL SCRIPT DESPLEGADO (solo lectura, nunca escribe)
    // Permite que el cliente avise si el Web App desplegado es anterior y no conoce
    // el guardado atomico. Un script viejo responde "Accion no soportada" a esta
    // misma accion, que es justo lo que se quiere distinguir.
    if (action === 'getScriptCapabilities') {
      return responseJson({
        success: true,
        capabilities: { atomicCampaignSave: true }
      });
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
      
      // La clave de entidad manda sobre el indice cuando es verificable en la hoja.
      // El indice lo calculo el cliente sobre una lectura previa: si la hoja se movio
      // entretanto (otra terminal elimino una fila, o alguien inserto/ordeno en Sheets)
      // escribe sobre el vecino sin dar error. Si la clave esta en celdas (CU_VC, SKU,
      // ID), se localiza y se corrige el indice obsoleto. Las claves compuestas
      // (SKU::FECHA, SKU+YYYY+MM) no existen como celda unica, asi que ahi se conserva
      // el indice que ya resolvio el cliente.
      var searchKey = String(payload.entityKey || payload.keyValue || '').trim().toUpperCase();
      if (searchKey) {
        var locatedRow = findRowByKey(sheet, searchKey, payload.entityKeyCol || payload.keyColumn);
        if (locatedRow > 1) {
          targetRow = locatedRow;
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

      // En el borrado individual la identidad tambien manda: si el indice quedo
      // obsoleto, borrarlo elimina el registro VECINO (perdida silenciosa, no error).
      // Tres casos: clave de celda (se reubica), clave compuesta (se verifica el
      // contenido antes de destruir) y clave sintetica (deriva del propio indice,
      // no aporta informacion nueva: se usa el indice tal cual).
      if (action === 'deleteRow') {
        var delKey = String(payload.entityKey || payload.keyValue || '').trim().toUpperCase();
        var delRow = validIndexes[0];
        var esCompuesta = delKey.indexOf('::') !== -1;
        var esSintetica = delKey.indexOf('_ROW_') !== -1;
        if (delKey && !esCompuesta && !esSintetica) {
          var locatedDel = findRowByKey(sheet, delKey, payload.entityKeyCol || payload.keyColumn);
          if (locatedDel > 1) {
            validIndexes = [locatedDel];
          } else {
            return responseJson({ error: 'No se elimino la fila: la clave indicada no existe en la hoja (indice posiblemente obsoleto).' });
          }
        } else if (esCompuesta) {
          // Solo se borra si la fila destino realmente contiene la clave compuesta.
          var rowVals = sheet.getRange(delRow, 1, 1, sheet.getLastColumn()).getValues()[0];
          var rowText = rowVals.map(function(v) { return String(v).trim().toUpperCase(); });
          var partes = delKey.split('::').filter(function(p) { return p.length > 0; });
          var coincide = partes.length > 0 && partes.every(function(p) { return rowText.indexOf(p) !== -1; });
          if (!coincide) {
            return responseJson({ error: 'No se elimino la fila: el contenido no corresponde a la clave indicada (indice posiblemente obsoleto).' });
          }
        }
      }

      var sortedIndexes = validIndexes.slice().sort(function(a, b) { return b - a; });
      for (var j = 0; j < sortedIndexes.length; j++) {
        sheet.deleteRow(sortedIndexes[j]);
      }
      return responseJson({ success: true });
    }

    // 6.5 GUARDADO ATOMICO DE CAMPANAS (COMPARE-AND-SWAP)
    // El respaldo normal son varias peticiones (contador + un update por chunk), asi
    // que dos terminales pueden intercalarse entre ellas y perder lecturas. Aqui el
    // chunking ocurre DENTRO de esta unica peticion, con el candado tomado y
    // verificando la version: o se escribe el estado completo, o se rechaza.
    // Si expectedVersion no coincide con la guardada, devuelve el estado vigente
    // para que el cliente re-fusione en lugar de pisarlo.
    if (action === 'saveCampaignsAtomic') {
      let sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : null;
      if (!sheet) {
        if (!payload.sheetName) return responseJson({ error: 'Hoja no encontrada: ' + payload.sheetName });
        sheet = ss.insertSheet(payload.sheetName);
      }
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['CLAVE', 'VALOR_JSON', 'ULTIMA_ACTUALIZACION']);
      }

      const CAS_CHUNK = 30000; // Limite por celda de Sheets: 50.000
      const rows = sheet.getDataRange().getValues();
      const keyRow = {};
      // Se recorre desde 0 y no desde 1: si la hoja se creo sin encabezado (o el
      // encabezado se borro), saltarse la primera fila ocultaria la clave CAMPAIGNS_DATA.
      for (var kr = 0; kr < rows.length; kr++) {
        var kk = String(rows[kr][0] || '').trim();
        if (kk && kk !== 'CLAVE') keyRow[kk] = kr + 1;
      }

      const currentVersion = keyRow['CAMPAIGNS_VERSION'] ? String(rows[keyRow['CAMPAIGNS_VERSION'] - 1][1] || '') : '';
      const expected = payload.expectedVersion === undefined ? null : payload.expectedVersion;

      function assembleCurrent() {
        var count = keyRow['CAMPAIGNS_DATA_CHUNKS'] ? parseInt(String(rows[keyRow['CAMPAIGNS_DATA_CHUNKS'] - 1][1] || '0'), 10) : 0;
        if (count > 0) {
          var acc = '';
          for (var c = 0; c < count; c++) {
            var ck = 'CAMPAIGNS_DATA_CHUNK_' + c;
            acc += keyRow[ck] ? String(rows[keyRow[ck] - 1][1] || '') : '';
          }
          if (acc) { try { return JSON.parse(acc); } catch (e) { return null; } }
        }
        var single = keyRow['CAMPAIGNS_DATA'] ? String(rows[keyRow['CAMPAIGNS_DATA'] - 1][1] || '') : '';
        if (single && single.indexOf('[CHUNKED:') !== 0) {
          try { return JSON.parse(single); } catch (e) { return null; }
        }
        return null;
      }

      if (expected !== null && expected !== currentVersion) {
        return responseJson({ success: false, conflict: true, current: assembleCurrent(), version: currentVersion });
      }

      const str = typeof payload.config === 'string' ? payload.config : JSON.stringify(payload.config);
      const nowIso = new Date().toISOString();
      const newVersion = String(new Date().getTime()) + '-' + Math.random().toString(36).slice(2, 8);

      const writeKey = function(key, value) {
        if (keyRow[key]) {
          sheet.getRange(keyRow[key], 1, 1, 3).setValues([[key, value, nowIso]]);
        } else {
          sheet.appendRow([key, value, nowIso]);
          keyRow[key] = sheet.getLastRow();
        }
      };

      var chunks = [];
      for (var ci = 0; ci < str.length; ci += CAS_CHUNK) {
        chunks.push(str.substring(ci, ci + CAS_CHUNK));
      }

      var prevChunks = keyRow['CAMPAIGNS_DATA_CHUNKS'] ? parseInt(String(rows[keyRow['CAMPAIGNS_DATA_CHUNKS'] - 1][1] || '0'), 10) : 0;

      writeKey('CAMPAIGNS_DATA_CHUNKS', String(chunks.length));
      for (var w = 0; w < chunks.length; w++) {
        writeKey('CAMPAIGNS_DATA_CHUNK_' + w, chunks[w]);
      }
      // Limpiar chunks sobrantes de un guardado anterior mas grande.
      for (var ob = chunks.length; ob < prevChunks; ob++) {
        writeKey('CAMPAIGNS_DATA_CHUNK_' + ob, '');
      }
      writeKey('CAMPAIGNS_DATA', str.length < 40000 ? str : '[CHUNKED:' + chunks.length + ']');
      writeKey('CAMPAIGNS_VERSION', newVersion);

      return responseJson({ success: true, version: newVersion });
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
