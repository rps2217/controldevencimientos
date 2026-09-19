/**
 * Fuente única de verdad para las claves de almacenamiento local.
 *
 * Los valores se mantienen idénticos a los históricos para no invalidar datos
 * ya persistidos (varios de ellos se serializan a la nube vía PropertiesService).
 * La unificación de prefijos se aplica sólo al nombre canónico en código; el
 * cambio de string en sí exigiría migración y no aporta valor operativo.
 */
export const STORAGE_KEYS = {
  // Configuración de conexión con Google Sheets
  SCRIPT_URL: 'appsheet_clone_scriptUrl',
  SECURITY_TOKEN: 'appsheet_clone_securityToken',
  SPREADSHEET_ID: 'appsheet_clone_spreadsheetId',

  // Configuración de la hoja (schema, columnas, slices, backendMirror)
  SHEET_CONFIG: 'appsheet_clone_config',

  // Cola offline y auditoría
  OFFLINE_QUEUE: 'appsheet_clone_offline_queue',
  AUDIT_LOG: 'appsheet_audit_log',

  // Presentación / preferencias de usuario
  DARK_MODE: 'app_dark_mode',
  THEME_VARIANT: 'app_theme_variant',
  TABLE_DENSITY: 'app_table_density',
  ZEN_MODE: 'app_zen_mode',
  COL_WIDTHS: 'appsheet_col_widths',
  HIDDEN_COLS: 'appsheet_clone_hidden_cols',
  COL_ORDERS: 'appsheet_clone_col_orders',
  DETAIL_HIDDEN_FIELDS: 'appsheet_detail_hidden_fields',
  SLICES_COLLAPSED: 'appsheet_slices_collapsed',

  // Sesiones de conteo e inventario cíclico
  STOCK_COUNT_SESSIONS: 'app_stock_count_sessions_v1',
  CAMPAIGNS: 'app_inventory_campaigns_v1',
  ACTIVE_CAMPAIGN_ID: 'app_active_campaign_id_v1',
  LAST_CAMPAIGN_CLOUD_SYNC: 'app_last_campaign_cloud_sync',

  // Slices personalizados
  CUSTOM_SLICES: 'appsheet_custom_slices',
  HIDDEN_SLICE_IDS: 'appsheet_hidden_slice_ids',

  // Varios
  DEVICE_ID: 'app_device_id',
  MODULE_STATES: 'app_module_states',
  TICKET_CONFIG: 'global_ticket_print_config',
} as const;
/** Clave dinámica de caché L1 por pestaña de Google Sheets. */
export const sheetCacheKey = (sheetTitle: string): string =>
  `appsheet_clone_cache_${sheetTitle}`;

/** Clave dinámica de ítems de demostración por vista. */
export const demoItemsKey = (view: string): string => `app_demo_items_${view}`;

/**
 * Migración de claves heredadas ejecutada una sola vez al arranque.
 *
 * - `appsheet_config` (obsoleta, nunca escrita por esta versión) se promueve a
 *   `appsheet_clone_config` sólo si la canónica aún no existe.
 */
export function migrateLegacyStorageKeys(): void {
  try {
    const legacyConfig = localStorage.getItem('appsheet_config');
    if (legacyConfig && !localStorage.getItem(STORAGE_KEYS.SHEET_CONFIG)) {
      localStorage.setItem(STORAGE_KEYS.SHEET_CONFIG, legacyConfig);
    }
    localStorage.removeItem('appsheet_config');
  } catch {
    // Storage no disponible (SSR / modo privado): la app sigue sin migración.
  }
}