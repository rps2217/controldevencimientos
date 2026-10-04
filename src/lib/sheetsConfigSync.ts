import type { SheetConfig } from '../types';
import { redactSecretsForCloudSheet } from '../utils/dashboardConfigUtils';
import {
  SPREADSHEET_ID,
  CellValue,
  CloudConfig,
  ScriptResponse
} from './sheetsTypes';
import {
  fetchFromScript,
  getSheetData,
  appendRow,
  updateRow
} from './sheetsClient';

const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedPropertiesConfig: { data: ScriptResponse['config']; timestamp: number } | null = null;

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
