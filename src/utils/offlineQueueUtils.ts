import type { OfflineMutation } from '../db/indexedDbService';

/** Reintentos tras los que una mutación en cola se considera fallida/conflicto. */
export const FAILED_ATTEMPTS_THRESHOLD = 3;

/** Una mutación está fallida si quedó marcada como tal o agotó reintentos.
 *  lastError puede sobrevivir a un reintento (resetMutationForRetry solo limpia
 *  status/attempts), por eso deliberadamente no cuenta como fallo. */
export function isFailedMutation(m: Pick<OfflineMutation, 'status' | 'attempts'>): boolean {
  return m.status === 'failed' || (m.attempts || 0) >= FAILED_ATTEMPTS_THRESHOLD;
}

/** Orden estricto de vaciado: FIFO por fecha de creación, sin mutar la entrada. */
export function sortQueueFifo(queue: OfflineMutation[]): OfflineMutation[] {
  return [...queue].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
