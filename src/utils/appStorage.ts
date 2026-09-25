/**
 * Fuente única de verdad para las claves de almacenamiento local.
 *
 * Los valores se mantienen idénticos a los históricos para no invalidar datos
 * ya persistidos (varios de ellos se serializan a la nube vía PropertiesService).
 * La unificación de prefijos se aplica sólo al nombre canónico en código; el
 * cambio de string en sí exigiría migración y no aporta valor operativo.
 */
import { z } from 'zod';

export const STORAGE_KEYS = {
  // Configuración de conexión con Google Sheets
  SCRIPT_URL: 'appsheet_clone_scriptUrl',
  SECURITY_TOKEN: 'appsheet_clone_securityToken',
  SPREADSHEET_ID: 'appsheet_clone_spreadsheetId',

  // Configuración de la hoja (schema, columnas, slices, backendMirror)
  SHEET_CONFIG: 'appsheet_clone_config',

  // Puerta de demostración del onboarding: abrir la app sin backend configurado
  DEMO_ENTRY: 'appsheet_clone_demoEntry',

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
 * Sin `SCRIPT_URL` no hay backend: la app opera contra los datos de demostración.
 * Estaba escrito igual en cinco sitios; vive aquí junto al resto de accesos a
 * almacenamiento para que la definición de "modo demo" sea una sola.
 */
export const isDemoMode = (): boolean =>
  !localStorage.getItem(STORAGE_KEYS.SCRIPT_URL)?.trim();

/**
 * El usuario eligió explícitamente "explorar la demostración" desde el onboarding.
 *
 * No se reutiliza `SCRIPT_URL` para esto: apuntarla a un valor falso haría que la app
 * creyera tener backend y encolara mutaciones contra un endpoint inexistente. El modo
 * demo sigue definiéndose por la ausencia de `SCRIPT_URL` (`isDemoMode`); esta bandera
 * sólo recuerda que el usuario ya decidió entrar, para no volver a pedirle una URL en
 * cada recarga.
 */
export const hasDemoEntry = (): boolean =>
  localStorage.getItem(STORAGE_KEYS.DEMO_ENTRY) === '1';

export function setDemoEntry(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEYS.DEMO_ENTRY, '1');
    else localStorage.removeItem(STORAGE_KEYS.DEMO_ENTRY);
  } catch {
    // Storage no disponible o lleno: la sesión sigue, sólo se pierde la memoria de la elección.
  }
}

/**
 * Lectura validada de una clave de localStorage.
 *
 * Cierra el fallo real de los `JSON.parse` sueltos: parsear sin validar acepta
 * basura con la forma equivocada (p. ej. `{"Hoja": "texto"}` donde se espera
 * `{"Hoja": {col: ancho}}`), y el error se manifiesta después, lejos de la causa,
 * al indexar en profundidad o al reventar dentro de un `useMemo`/render.
 *
 * No se usa el `T` declarado por el llamante como fuente de verdad: el tipo se
 * *aplica* validando con el esquema. Así el dato no puede mentir sobre su forma.
 *
 * Ante dato inválido se devuelve el fallback en lugar de lanzar: un valor
 * corrupto en preferencias no debe impedir arrancar la aplicación. Quien quiera
 * saber si hubo descarte puede usar `readStorageValidated`.
 */
export function readStorage<T>(key: string, schema: z.ZodType, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Igual que `readStorage` pero informa si el dato almacenado se descartó. */
export function readStorageValidated<T>(
  key: string,
  schema: z.ZodType,
  fallback: T
): { value: T; valid: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return { value: fallback, valid: true }; // ausente != corrupto
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? { value: parsed.data as T, valid: true } : { value: fallback, valid: false };
  } catch {
    return { value: fallback, valid: false };
  }
}

/** Escritura tolerante: en modo privado o cuota llena no debe tumbar la acción. */
export function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage no disponible o lleno: la app sigue con estado en memoria.
  }
}

/**
 * Lectura/escritura de valores guardados como cadena cruda (sin JSON).
 * `TABLE_DENSITY` se persiste así desde antes de la puerta validada; estos
 * accesores permiten validarlo contra un esquema sin cambiar el formato en
 * disco, que sería perder la preferencia ya elegida por el usuario.
 */
export function readRawStorage<T>(key: string, schema: z.ZodType, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = schema.safeParse(raw);
    return parsed.success ? (parsed.data as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeRawStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage no disponible o lleno: la app sigue con estado en memoria.
  }
}

// --- Esquemas de las estructuras persistidas en localStorage ---

/** Lista de cadenas (p. ej. IDs de slice ocultos). */
export const stringArraySchema = z.array(z.string());

/**
 * Lista de objetos planos (cola offline, bitacora de auditoria, items demo).
 *
 * Se valida el contenedor y que cada elemento sea objeto, no sus campos: estos
 * DTO evolucionan entre versiones y algunos los escribe la nube. Un `null`, un
 * objeto suelto o una lista de escalares donde se espera una lista de objetos es
 * lo que rompe: quien consume hace `.map`/`.filter` o lo pasa a un estado de
 * tabla, y revienta lejos de la causa.
 */
export const objectArraySchema = z.array(z.record(z.string(), z.unknown()));

/** Mapa de campos booleanos (p. ej. campos ocultos del panel de detalle). */
export const booleanMapSchema = z.record(z.string(), z.boolean());

/** Preferencias de presentación: `{ [hoja]: { [columna]: ancho } }`. */
export const preferencesObjectSchema = z.record(z.string(), z.record(z.string(), z.number()));
export type PreferencesObject = z.infer<typeof preferencesObjectSchema>;

/**
 * Caché L1 de una hoja (fallback a localStorage cuando IndexedDB no está).
 *
 * Se valida el contenedor y la forma de `rows` (lista de listas de celdas):
 * quien consume hace `rows.map` y luego indexa la fila, así que un `rows: null`
 * o una lista de escalares revienta lejos de la causa, en el arranque offline.
 * `timestamp` es opcional a propósito: entradas de versiones anteriores pueden
 * no traerlo y no por eso dejan de ser caché válido; el consumidor lo rellena.
 */
export const cachedSheetSchema = z.object({
  rows: z.array(z.array(z.unknown())),
  timestamp: z.string().optional(),
});
export type CachedSheetFallback = z.infer<typeof cachedSheetSchema>;

/** Órdenes y columnas ocultas: `{ [hoja]: [columna, ...] }`. */
export const stringArrayMapSchema = z.record(z.string(), z.array(z.string()));
export type StringArrayMap = z.infer<typeof stringArrayMapSchema>;

/**
 * Estado de vista por módulo: `{ [vista]: { ...campos } }`.
 *
 * Se valida sólo la forma del contenedor, no cada campo. Los consumidores hacen
 * `{ ...DEFAULT_MODULE_STATE, ...parsed[vista] }`, así que un campo ausente o
 * extra no rompe nada; lo que sí rompía era tener una cadena o un array donde se
 * espera un objeto (esparcir un string mete índices como si fueran campos).
 */
export const moduleStatesSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

/**
 * Configuración de hoja: se valida sólo que sea un objeto plano.
 *
 * No se valida campo a campo a propósito. El esquema declarado es enorme, tiene
 * campos que evolucionan entre versiones y algunos los escribe la nube vía
 * PropertiesService; exigirlos aquí descartaría configuración válida de usuarios
 * de versiones anteriores, que es justo el daño que se quiere evitar. Lo que sí
 * revienta el arranque es un `null` o un array donde se espera un objeto (el
 * fallo real documentado fue `JSON.parse("null")`), y eso lo corta esta forma.
 */
export const sheetConfigShapeSchema = z.record(z.string(), z.unknown());

/**
 * Densidad de la tabla: se guarda como cadena cruda, no como JSON, así que se
 * valida contra los valores admitidos en vez de parsearla.
 */
export const tableDensitySchema = z.enum(['comfortable', 'compact', 'ultra']);

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