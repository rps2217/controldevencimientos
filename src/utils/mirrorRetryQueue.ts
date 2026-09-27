/**
 * Buzón de reintento del Espejo de Backend.
 *
 * El espejo replicaba en fire-and-forget: si el POST fallaba, se registraba un
 * warning y la mutación no se reintentaba nunca. Como el espejo no es la fuente
 * de verdad (Sheets sí), eso no perdía datos del usuario, pero dejaba el espejo
 * divergiendo en silencio justo cuando el usuario lo había activado por
 * concurrencia. Este buzón lo cierra.
 *
 * Se apoya en el store `settings` de IndexedDB a través de la puerta de
 * almacenamiento, sin migrar el esquema de datos ni subir `DB_VERSION`. Las
 * funciones de *decisión* son puras para poder probarlas sin red ni DOM.
 */
import { readStorage, writeStorage } from './appStorage';
import { isMirrorRetryable, mirrorRetryDelayMs } from './mirrorSyncPolicy';
import type { OfflineMutation } from '../db/indexedDbService';
import { z } from 'zod';

export const MIRROR_RETRY_QUEUE_KEY = 'app_mirror_retry_queue';

/** Pendiente de replicar: la mutación original más su contador de intentos. */
export interface MirrorRetryEntry {
  mutationId: string;
  attempts: number;
  lastAttemptAt: string;
  lastError?: string;
  mutation: OfflineMutation;
}

/**
 * Tope de la cola. El buzón es un mecanismo de recuperación, no un archivo
 * histórico: si crece sin límite, el mismo crecimiento es una fuga de memoria y
 * de cuota. Al superarlo se descartan los más antiguos, que son los que ya
 * agotaron reintentos.
 */
export const MIRROR_RETRY_QUEUE_MAX = 200;

const retryEntrySchema = z.object({
  mutationId: z.string(),
  attempts: z.number(),
  lastAttemptAt: z.string(),
  lastError: z.string().optional(),
  mutation: z.record(z.string(), z.unknown()),
});

const mirrorRetryQueueSchema = z.array(retryEntrySchema);

/** Encola un fallo. Reintentar la misma mutación no debe duplicar entradas. */
export function enqueueMirrorRetry(
  queue: MirrorRetryEntry[],
  mutation: OfflineMutation,
  error: string,
  nowIso: string
): MirrorRetryEntry[] {
  const previa = queue.find(e => e.mutationId === mutation.id);
  const entry: MirrorRetryEntry = {
    mutationId: mutation.id,
    attempts: (previa?.attempts ?? 0) + 1,
    lastAttemptAt: nowIso,
    lastError: error,
    mutation,
  };
  const sinDuplicado = queue.filter(e => e.mutationId !== mutation.id);
  const conNueva = [...sinDuplicado, entry];
  return conNueva.length > MIRROR_RETRY_QUEUE_MAX
    ? conNueva.slice(conNueva.length - MIRROR_RETRY_QUEUE_MAX)
    : conNueva;
}

export function removeMirrorRetry(queue: MirrorRetryEntry[], mutationId: string): MirrorRetryEntry[] {
  return queue.filter(e => e.mutationId !== mutationId);
}

/** Sólo los pendientes que aún tienen margen de reintento automático. */
export function selectRetryable(queue: MirrorRetryEntry[]): MirrorRetryEntry[] {
  return queue.filter(e => isMirrorRetryable(e.attempts));
}

/**
 * Pendientes que toca reintentar AHORA: los que no agotaron intentos y además ya
 * cumplieron la espera del backoff. Sin esta segunda condición el drenado
 * martillaría un servidor caído en cada tick, que es justo lo que el backoff
 * existe para evitar.
 */
export function selectMirrorReady(queue: MirrorRetryEntry[], nowMs: number): MirrorRetryEntry[] {
  return selectRetryable(queue).filter(e => {
    const transcurrido = nowMs - Date.parse(e.lastAttemptAt);
    return Number.isNaN(transcurrido) || transcurrido >= mirrorRetryDelayMs(e.attempts);
  });
}

export function readMirrorRetryQueue(): MirrorRetryEntry[] {
  return readStorage<MirrorRetryEntry[]>(MIRROR_RETRY_QUEUE_KEY, mirrorRetryQueueSchema, []) as MirrorRetryEntry[];
}

export function writeMirrorRetryQueue(queue: MirrorRetryEntry[]): void {
  writeStorage(MIRROR_RETRY_QUEUE_KEY, queue);
}
