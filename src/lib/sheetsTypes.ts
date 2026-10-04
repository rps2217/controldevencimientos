import type { SheetConfig, SheetMetadata, InventoryCampaign, StockCountSession } from '../types';
import { STORAGE_KEYS } from '../utils/appStorage';

export const SPREADSHEET_ID = '1a4jGo-7pduH4fue73F_67sQYJS0LJqI7hiXYpyWVA8o';

/** Valor de una celda tal como lo devuelve Google Sheets. */
export type CellValue = string | number | boolean | null | undefined;
export type SheetRow = CellValue[];
export type SheetMatrix = SheetRow[];

/** Configuración de la app tal como viaja en Script Properties (incluye claves extra del script). */
export interface CloudConfig extends SheetConfig {
  CAMPAIGNS_DATA?: string;
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

export interface FetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
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

export function getScriptUrl(): string | null {
  try {
    const url = localStorage.getItem(STORAGE_KEYS.SCRIPT_URL);
    return url ? url.trim() : null;
  } catch {
    return null;
  }
}

export function getSecurityToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SECURITY_TOKEN) || '';
  } catch {
    return '';
  }
}

/** Normaliza un índice de fila de Google Sheets (1-based). Devuelve 0 si no es un entero >= 1. */
export function parseSheetRowIndex(rowIndex: number | string | null | undefined): number {
  const parsed = typeof rowIndex === 'number' ? Math.floor(rowIndex) : parseInt(String(rowIndex ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 0;
}
