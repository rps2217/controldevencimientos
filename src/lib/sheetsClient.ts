import type { SheetMetadata } from '../types';
import { getErrorMessage } from '../utils/pureCalculations';
import { fetchWithTimeout } from './http';
import { STORAGE_KEYS } from '../utils/appStorage';
import {
  SPREADSHEET_ID,
  SheetRow,
  SheetMatrix,
  ScriptResponse,
  FetchOptions,
  getScriptUrl,
  getSecurityToken,
  parseSheetRowIndex
} from './sheetsTypes';

/**
 * Robust fetch client for Google Apps Script with exponential backoff retries,
 * network timeout handling, and informative Spanish error messages.
 */
export async function fetchFromScript<T = ScriptResponse>(
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

let cachedMetadata: CacheEntry<SheetMetadata> | null = null;
const cachedSheetsData = new Map<string, CacheEntry<SheetMatrix>>();

export function clearSheetsCache(sheetName?: string) {
  if (sheetName) {
    cachedSheetsData.delete(sheetName.trim().toLowerCase());
  } else {
    cachedSheetsData.clear();
    cachedMetadata = null;
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
    } catch {
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
    const msg = getErrorMessage(err);
    const noSoportada = /Acci[oó]n no soportada/.test(msg);
    return {
      reachable: !noSoportada,
      atomicCampaignSave: false,
      error: noSoportada ? 'El script desplegado es anterior: no conoce el guardado atómico.' : msg
    };
  }
}
