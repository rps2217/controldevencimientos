/**
 * Semántica de los modos de sincronización del Espejo de Backend.
 *
 * Vive aparte del servicio para que sea pura y verificable: el modo decide
 * *cuándo* y *si se espera* al espejo respecto de Google Sheets, y esa decisión
 * no necesita red ni DOM para probarse.
 *
 * Antes de este módulo `syncMode` se elegía en la UI y no se leía en ninguna
 * parte: los tres modos replicaban igual (fire-and-forget tras Sheets), así que
 * "Espejo Primero" no daba la latencia prometida ni "Solo Respaldo" dejaba de
 * escribir en cada mutación.
 */
import type { BackendMirrorConfig } from '../types';

export type MirrorSyncMode = BackendMirrorConfig['syncMode'];

export interface MirrorDispatchPlan {
  /** Se replica al espejo en esta mutación. `backup_only` lo desactiva. */
  mirror: boolean;
  /** Se espera la respuesta del espejo antes de continuar con Sheets. */
  awaitBeforeSheets: boolean;
}

/**
 * Traduce el modo a la decisión de despacho.
 *
 * - `mirror_first`: el espejo va primero y **se espera**; es lo que da la
 *   latencia sub-150 ms, y por eso la escritura a Sheets no puede adelantarse.
 * - `dual_write`: se replica en paralelo a Sheets, sin bloquear la operación.
 * - `backup_only`: el espejo es pasivo; no recibe mutaciones automáticas.
 */
export function planMirrorDispatch(mode: MirrorSyncMode | undefined): MirrorDispatchPlan {
  switch (mode) {
    case 'backup_only':
      return { mirror: false, awaitBeforeSheets: false };
    case 'mirror_first':
      return { mirror: true, awaitBeforeSheets: true };
    case 'dual_write':
    default:
      return { mirror: true, awaitBeforeSheets: false };
  }
}

/** Espera inicial entre reintentos del espejo. */
export const MIRROR_RETRY_BASE_MS = 2_000;
/** Techo de la espera: sin tope, el 2^n se vuelve impracticable tras pocos fallos. */
export const MIRROR_RETRY_MAX_MS = 60_000;
/** Intentos antes de dejar de reintentar automáticamente y quedar sólo en el panel. */
export const MIRROR_MAX_ATTEMPTS = 6;

/**
 * El backoff necesita la espera del intento que *va a hacerse*, y la PRIMERA
 * espera es la base (no `base * 2`): si se indexara desde 1, el primer reintento
 * tarde el doble y con el techo de intentos se pierde casi la mitad del margen.
 */
export function mirrorRetryDelayMs(attempts: number): number {
  const escalon = Math.max(0, attempts - 1);
  return Math.min(MIRROR_RETRY_BASE_MS * 2 ** escalon, MIRROR_RETRY_MAX_MS);
}

/** Un pendiente aún se reintenta automáticamente. */
export const isMirrorRetryable = (attempts: number): boolean => attempts < MIRROR_MAX_ATTEMPTS;

/**
 * Normaliza el intervalo de drenado. El valor por defecto del panel (60 s) se
 * conserva, pero un valor ausente o absurdo no debe apagar el drenado en
 * silencio: se acota a un rango donde sirve.
 */
export const clampMirrorIntervalSec = (sec: number | undefined): number => {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return 60;
  return Math.min(Math.max(Math.round(sec), 15), 3_600);
};
