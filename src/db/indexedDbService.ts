/**
 * IndexedDB Local-First Database & Offline Storage Service
 * Reemplaza el frágil límite de 5MB de localStorage por una base de datos local
 * asíncrona, robusta y capaz de almacenar cientos de miles de registros y colas de mutación.
 */
import { STORAGE_KEYS, sheetCacheKey, readStorage, writeStorage, objectArraySchema, cachedSheetSchema, type CachedSheetFallback } from '../utils/appStorage';
import { isFailedMutation } from '../utils/offlineQueueUtils';

export interface CachedSheetData {
  sheetTitle: string;
  rows: any[][];
  timestamp: string;
  recordCount: number;
}

export interface OfflineMutation {
  id: string;
  type: 'append' | 'update' | 'delete';
  sheetTitle: string;
  sheetId?: number;
  rowIndex?: number;
  entityKey?: string;
  entityKeyCol?: string;
  keyValue?: string;
  keyColumn?: string;
  headers?: string[];
  values?: any;
  createdAt: string;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  attempts: number;
  lastError?: string;
}

export interface AuditLogEntry {
  id: string;
  action: 'append' | 'update' | 'delete' | 'sync' | 'count' | 'import' | 'bulk_edit' | 'discard';
  sheetTitle: string;
  entityKey?: string;
  description: string;
  timestamp: string;
  status: 'synced' | 'pending' | 'syncing' | 'failed';
  mutationId?: string;
  details?: Record<string, any>;
  errorMessage?: string;
}

const DB_NAME = 'InventoryLogisticsDB';
const DB_VERSION = 2;

const STORES = {
  SHEETS: 'sheets',
  MUTATION_QUEUE: 'mutation_queue',
  SETTINGS: 'settings',
  AUDIT_LOG: 'audit_log'
} as const;

class IndexedDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private isSupported: boolean;

  constructor() {
    this.isSupported = typeof window !== 'undefined' && 'indexedDB' in window;
  }

  private getDB(): Promise<IDBDatabase> {
    if (!this.isSupported) {
      return Promise.reject(new Error('IndexedDB no está disponible en este entorno.'));
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        const blockedTimeoutId = setTimeout(() => {
          console.warn('IndexedDB bloqueada por otra pestaña: se agotó el tiempo de espera (5s).');
          this.dbPromise = null;
          reject(new Error('IndexedDB bloqueada por otra conexión abierta. Cierra otras pestañas de la app y reintenta.'));
        }, 5000);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // 1. Almacén de hojas cacheadas
          if (!db.objectStoreNames.contains(STORES.SHEETS)) {
            db.createObjectStore(STORES.SHEETS, { keyPath: 'sheetTitle' });
          }

          // 2. Almacén de cola de mutaciones offline
          if (!db.objectStoreNames.contains(STORES.MUTATION_QUEUE)) {
            const mutationStore = db.createObjectStore(STORES.MUTATION_QUEUE, { keyPath: 'id' });
            mutationStore.createIndex('status', 'status', { unique: false });
            mutationStore.createIndex('createdAt', 'createdAt', { unique: false });
          }

          // 3. Almacén de configuraciones y esquemas
          if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
            db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
          }

          // 4. Almacén de registro de auditoría / historial local
          if (!db.objectStoreNames.contains(STORES.AUDIT_LOG)) {
            const auditStore = db.createObjectStore(STORES.AUDIT_LOG, { keyPath: 'id' });
            auditStore.createIndex('timestamp', 'timestamp', { unique: false });
            auditStore.createIndex('status', 'status', { unique: false });
            auditStore.createIndex('sheetTitle', 'sheetTitle', { unique: false });
          }
        };

        request.onsuccess = () => {
          clearTimeout(blockedTimeoutId);
          const db = request.result;

          // Reset the connection if it's closed or if a version change occurs
          db.onclose = () => {
            this.dbPromise = null;
          };

          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };

          resolve(db);
        };

        request.onerror = () => {
          clearTimeout(blockedTimeoutId);
          reject(request.error || new Error('Error al abrir IndexedDB'));
        };

        request.onblocked = () => {
          console.warn('La base de datos IndexedDB está bloqueada por otra pestaña abierta.');
        };
      });
    }

    return this.dbPromise;
  }

  // ==========================================
  // 1. GESTIÓN DE CACHÉ DE HOJAS (SHEET DATA)
  // ==========================================

  /**
   * Obtiene una hoja desde IndexedDB (o fallback localStorage si no está disponible)
   */
  async getCachedSheet(sheetTitle: string): Promise<{ rows: any[][]; timestamp: string } | null> {
    if (!sheetTitle) return null;

    try {
      if (this.isSupported) {
        const db = await this.getDB();
        return new Promise((resolve) => {
          const tx = db.transaction(STORES.SHEETS, 'readonly');
          const store = tx.objectStore(STORES.SHEETS);
          const req = store.get(sheetTitle);

          req.onsuccess = () => {
            if (req.result) {
              resolve({
                rows: req.result.rows || [],
                timestamp: req.result.timestamp || new Date().toISOString()
              });
            } else {
              // Intentar leer de localStorage si viene de versiones previas
              const lsFallback = this.getLocalStorageFallback(sheetCacheKey(sheetTitle));
              resolve(lsFallback);
            }
          };

          req.onerror = () => {
            resolve(this.getLocalStorageFallback(sheetCacheKey(sheetTitle)));
          };
        });
      }
    } catch (err) {
      console.warn('IndexedDB read error, fallback a localStorage:', err);
    }

    return this.getLocalStorageFallback(sheetCacheKey(sheetTitle));
  }

  /**
   * Guarda de forma asíncrona una hoja completa en IndexedDB sin bloquear el hilo principal
   */
  async saveCachedSheet(sheetTitle: string, rows: any[][]): Promise<void> {
    if (!sheetTitle || !Array.isArray(rows)) return;

    const payload: CachedSheetData = {
      sheetTitle,
      rows,
      timestamp: new Date().toISOString(),
      recordCount: Math.max(0, rows.length - 1)
    };

    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORES.SHEETS, 'readwrite');
          const store = tx.objectStore(STORES.SHEETS);
          const req = store.put(payload);

          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
        return;
      }
    } catch (err) {
      console.warn('IndexedDB write failed, fallback a localStorage:', err);
    }

    // Fallback safe localStorage si IndexedDB falla
    writeStorage(sheetCacheKey(sheetTitle), {
      rows,
      timestamp: payload.timestamp
    });
  }

  /**
   * Elimina el caché de una hoja específica
   */
  async clearCachedSheet(sheetTitle: string): Promise<void> {
    if (!sheetTitle) return;

    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORES.SHEETS, 'readwrite');
          const store = tx.objectStore(STORES.SHEETS);
          const req = store.delete(sheetTitle);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      }
    } catch (e) {
      console.warn('Error clearing sheet from IndexedDB:', e);
    }

    try {
      localStorage.removeItem(sheetCacheKey(sheetTitle));
    } catch {
      // Ignore
    }
  }

  // ==========================================
  // 2. COLA DE TRANSACCIONES / MUTACIONES OFFLINE
  // ==========================================

  /**
   * Recupera todas las mutaciones offline pendientes
   */
  async getOfflineQueue(): Promise<OfflineMutation[]> {
    try {
      if (this.isSupported) {
        const db = await this.getDB();
        return new Promise((resolve) => {
          const tx = db.transaction(STORES.MUTATION_QUEUE, 'readonly');
          const store = tx.objectStore(STORES.MUTATION_QUEUE);
          const req = store.getAll();

          req.onsuccess = () => {
            const list = req.result || [];
            // Si la cola en IndexedDB está vacía, migrar desde localStorage si existía
            if (list.length === 0) {
              const lsQueue = this.getLocalStorageQueue();
              if (lsQueue.length > 0) {
                // Migrar a IndexedDB
                lsQueue.forEach(m => this.enqueueMutation(m).catch(() => {}));
                resolve(lsQueue);
                return;
              }
            }
            resolve(list);
          };

          req.onerror = () => resolve(this.getLocalStorageQueue());
        });
      }
    } catch (err) {
      console.warn('Error getting offline queue from IndexedDB:', err);
    }

    return this.getLocalStorageQueue();
  }

  /**
   * Agrega o actualiza una mutación a la cola offline
   */
  async enqueueMutation(
    mutation: Partial<OfflineMutation> & { type: 'append' | 'update' | 'delete'; sheetTitle: string }
  ): Promise<OfflineMutation> {
    const fullMutation: OfflineMutation = {
      id: mutation.id || `mut_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type: mutation.type,
      sheetTitle: mutation.sheetTitle,
      sheetId: mutation.sheetId,
      rowIndex: mutation.rowIndex,
      entityKey: mutation.entityKey,
      entityKeyCol: mutation.entityKeyCol,
      keyValue: mutation.keyValue,
      keyColumn: mutation.keyColumn,
      headers: mutation.headers,
      values: mutation.values,
      createdAt: mutation.createdAt || new Date().toISOString(),
      status: mutation.status || 'pending',
      attempts: mutation.attempts || 0,
      lastError: mutation.lastError
    };

    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORES.MUTATION_QUEUE, 'readwrite');
          const store = tx.objectStore(STORES.MUTATION_QUEUE);
          const req = store.put(fullMutation);

          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } catch (err) {
      console.warn('Error saving mutation to IndexedDB:', err);
    }

    // Mantener backup en localStorage
    try {
      const current = this.getLocalStorageQueue();
      const existingIdx = current.findIndex(m => m.id === fullMutation.id);
      if (existingIdx >= 0) {
        current[existingIdx] = fullMutation;
      } else {
        current.push(fullMutation);
      }
      localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(current));
    } catch (e) {
      console.warn('localStorage mutation backup error:', e);
    }

    return fullMutation;
  }

  /**
   * Actualiza el estado y detalles de error de una mutación existente
   */
  async updateMutationStatus(
    id: string, 
    status: OfflineMutation['status'], 
    errorMsg?: string
  ): Promise<void> {
    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORES.MUTATION_QUEUE, 'readwrite');
          const store = tx.objectStore(STORES.MUTATION_QUEUE);
          const getReq = store.get(id);

          getReq.onsuccess = () => {
            if (getReq.result) {
              const updated: OfflineMutation = {
                ...getReq.result,
                status,
                attempts: (getReq.result.attempts || 0) + (status === 'failed' ? 1 : 0),
                lastError: errorMsg || getReq.result.lastError
              };
              store.put(updated);
            }
            resolve();
          };
          getReq.onerror = () => resolve();
        });
      }
    } catch (e) {
      console.warn('Error updating mutation status in IndexedDB:', e);
    }

    try {
      const current = this.getLocalStorageQueue();
      const item = current.find(m => m.id === id);
      if (item) {
        item.status = status;
        if (status === 'failed') item.attempts = (item.attempts || 0) + 1;
        if (errorMsg) item.lastError = errorMsg;
        localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(current));
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Elimina una mutación procesada con éxito
   */
  async removeMutation(id: string): Promise<void> {
    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORES.MUTATION_QUEUE, 'readwrite');
          const store = tx.objectStore(STORES.MUTATION_QUEUE);
          const req = store.delete(id);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      }
    } catch (err) {
      console.warn('Error removing mutation from IndexedDB:', err);
    }

    try {
      const current = this.getLocalStorageQueue().filter(m => m.id !== id);
      localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(current));
    } catch {
      // Ignore
    }
  }

  /**
   * Limpia toda la cola offline
   */
  async clearOfflineQueue(): Promise<void> {
    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORES.MUTATION_QUEUE, 'readwrite');
          const store = tx.objectStore(STORES.MUTATION_QUEUE);
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      }
    } catch (err) {
      console.warn('Error clearing mutation queue from IndexedDB:', err);
    }

    try {
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    } catch {
      // Ignore
    }
  }

  /**
   * Descarta un intento de sincronización específico con registro seguro en auditoría
   */
  async discardMutation(id: string, reason?: string): Promise<OfflineMutation | null> {
    const queue = await this.getOfflineQueue();
    const mutation = queue.find(m => m.id === id);
    if (!mutation) return null;

    // Registrar en auditoría con copia íntegra de los datos para evitar pérdida irreversible
    await this.addAuditLogEntry({
      action: 'discard',
      sheetTitle: mutation.sheetTitle,
      entityKey: mutation.entityKey || mutation.keyValue,
      description: `Intento de sincronización descartado (${mutation.type.toUpperCase()}) en ${mutation.sheetTitle}${reason ? `: ${reason}` : ''}`,
      status: 'failed',
      mutationId: mutation.id,
      errorMessage: mutation.lastError || reason || 'Descartado manualmente por el usuario',
      details: {
        type: mutation.type,
        sheetTitle: mutation.sheetTitle,
        entityKey: mutation.entityKey,
        keyValue: mutation.keyValue,
        values: mutation.values,
        attempts: mutation.attempts,
        lastError: mutation.lastError,
        discardedAt: new Date().toISOString(),
        reason: reason || 'Descarte por el usuario'
      }
    });

    await this.removeMutation(id);
    return mutation;
  }

  /**
   * Descarta todos los intentos de sincronización que se encuentren en estado fallido o con conflicto
   */
  async discardAllFailedMutations(): Promise<number> {
    const queue = await this.getOfflineQueue();
    const failedList = queue.filter(isFailedMutation);
    for (const m of failedList) {
      await this.discardMutation(m.id, 'Descarte masivo de conflictos de conciliación');
    }
    return failedList.length;
  }

  /**
   * Restablece una mutación fallida para reintentar su sincronización
   */
  async resetMutationForRetry(id: string): Promise<boolean> {
    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORES.MUTATION_QUEUE, 'readwrite');
          const store = tx.objectStore(STORES.MUTATION_QUEUE);
          const getReq = store.get(id);

          getReq.onsuccess = () => {
            if (getReq.result) {
              const updated: OfflineMutation = {
                ...getReq.result,
                status: 'pending',
                attempts: 0
              };
              store.put(updated);
            }
            resolve();
          };
          getReq.onerror = () => resolve();
        });
      }
    } catch (e) {
      console.warn('Error resetting mutation for retry in IndexedDB:', e);
    }

    try {
      const current = this.getLocalStorageQueue();
      const item = current.find(m => m.id === id);
      if (item) {
        item.status = 'pending';
        item.attempts = 0;
        localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(current));
      }
    } catch {
      // Ignore
    }

    return true;
  }

  /**
   * Convierte una mutación de tipo 'update' en 'append' (Guardar como nuevo registro)
   * Útil cuando el registro original fue eliminado o desplazado en Google Sheets por otro dispositivo
   */
  async forkMutationAsAppend(id: string): Promise<OfflineMutation | null> {
    const queue = await this.getOfflineQueue();
    const mutation = queue.find(m => m.id === id);
    if (!mutation) return null;

    const forked: OfflineMutation = {
      ...mutation,
      type: 'append',
      rowIndex: undefined,
      status: 'pending',
      attempts: 0,
      lastError: undefined,
      createdAt: new Date().toISOString()
    };

    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORES.MUTATION_QUEUE, 'readwrite');
          const store = tx.objectStore(STORES.MUTATION_QUEUE);
          const putReq = store.put(forked);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        });
      }
    } catch (e) {
      console.warn('Error forking mutation in IndexedDB:', e);
    }

    try {
      const current = this.getLocalStorageQueue();
      const idx = current.findIndex(m => m.id === id);
      if (idx >= 0) {
        current[idx] = forked;
        localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(current));
      }
    } catch {
      // Ignore
    }

    await this.addAuditLogEntry({
      action: 'append',
      sheetTitle: forked.sheetTitle,
      entityKey: forked.entityKey || forked.keyValue,
      description: `Registro re-encolado como nuevo (Append) tras conflicto de actualización en ${forked.sheetTitle}`,
      status: 'pending',
      mutationId: forked.id,
      details: {
        originalType: mutation.type,
        newType: 'append',
        previousError: mutation.lastError
      }
    });

    return forked;
  }

  // ==========================================
  // 3. REGISTRO DE AUDITORÍA / HISTORIAL LOCAL
  // ==========================================

  /**
   * Agrega una entrada al registro de auditoría local
   */
  async addAuditLogEntry(entry: Partial<AuditLogEntry> & { sheetTitle: string; description: string }): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      id: entry.id || `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: entry.action || 'update',
      sheetTitle: entry.sheetTitle,
      entityKey: entry.entityKey,
      description: entry.description,
      timestamp: entry.timestamp || new Date().toISOString(),
      status: entry.status || 'synced',
      mutationId: entry.mutationId,
      details: entry.details,
      errorMessage: entry.errorMessage
    };

    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORES.AUDIT_LOG, 'readwrite');
          const store = tx.objectStore(STORES.AUDIT_LOG);
          const req = store.put(fullEntry);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } catch (err) {
      console.warn('Error saving audit log entry to IndexedDB:', err);
    }

    // Mantener backup en localStorage (máximo 100 registros para evitar sobrecarga)
    try {
      const current = this.getLocalStorageAuditLog();
      current.unshift(fullEntry);
      const capped = current.slice(0, 100);
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(capped));
    } catch {
      // Ignore
    }

    return fullEntry;
  }

  /**
   * Obtiene las entradas más recientes del historial de auditoría
   */
  async getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
    try {
      if (this.isSupported) {
        const db = await this.getDB();
        return new Promise((resolve) => {
          const tx = db.transaction(STORES.AUDIT_LOG, 'readonly');
          const store = tx.objectStore(STORES.AUDIT_LOG);
          const req = store.getAll();

          req.onsuccess = () => {
            const list: AuditLogEntry[] = req.result || [];
            list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            resolve(list.slice(0, limit));
          };

          req.onerror = () => resolve(this.getLocalStorageAuditLog().slice(0, limit));
        });
      }
    } catch (err) {
      console.warn('Error reading audit log from IndexedDB:', err);
    }

    return this.getLocalStorageAuditLog().slice(0, limit);
  }

  /**
   * Actualiza el estado de una entrada de auditoría asociada a una mutación
   */
  async updateAuditLogStatus(mutationId: string, status: AuditLogEntry['status'], errorMessage?: string): Promise<void> {
    if (!mutationId) return;

    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORES.AUDIT_LOG, 'readwrite');
          const store = tx.objectStore(STORES.AUDIT_LOG);
          const req = store.getAll();

          req.onsuccess = () => {
            const items: AuditLogEntry[] = req.result || [];
            const matching = items.find(it => it.mutationId === mutationId || it.id === mutationId);
            if (matching) {
              matching.status = status;
              if (errorMessage) matching.errorMessage = errorMessage;
              store.put(matching);
            }
            resolve();
          };
          req.onerror = () => resolve();
        });
      }
    } catch (e) {
      console.warn('Error updating audit log status:', e);
    }

    try {
      const current = this.getLocalStorageAuditLog();
      const match = current.find(it => it.mutationId === mutationId || it.id === mutationId);
      if (match) {
        match.status = status;
        if (errorMessage) match.errorMessage = errorMessage;
        localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(current));
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Limpia todo el historial de auditoría
   */
  async clearAuditLog(): Promise<void> {
    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORES.AUDIT_LOG, 'readwrite');
          const store = tx.objectStore(STORES.AUDIT_LOG);
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      }
    } catch (err) {
      console.warn('Error clearing audit log from IndexedDB:', err);
    }

    try {
      localStorage.removeItem(STORAGE_KEYS.AUDIT_LOG);
    } catch {
      // Ignore
    }
  }

  private getLocalStorageAuditLog(): AuditLogEntry[] {
    return readStorage<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOG, objectArraySchema, []);
  }

  // ==========================================
  // 4. GESTIÓN DE CONFIGURACIONES Y PREFERENCIAS
  // ==========================================

  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    try {
      if (this.isSupported) {
        const db = await this.getDB();
        return new Promise((resolve) => {
          const tx = db.transaction(STORES.SETTINGS, 'readonly');
          const store = tx.objectStore(STORES.SETTINGS);
          const req = store.get(key);

          req.onsuccess = () => {
            if (req.result && req.result.value !== undefined) {
              resolve(req.result.value as T);
            } else {
              const ls = localStorage.getItem(key);
              if (ls !== null) {
                try {
                  resolve(JSON.parse(ls) as T);
                } catch {
                  resolve(ls as unknown as T);
                }
              } else {
                resolve(defaultValue);
              }
            }
          };

          req.onerror = () => resolve(defaultValue);
        });
      }
    } catch {
      // Fallback
    }

    try {
      const ls = localStorage.getItem(key);
      return ls !== null ? JSON.parse(ls) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async saveSetting<T>(key: string, value: T): Promise<void> {
    try {
      if (this.isSupported) {
        const db = await this.getDB();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORES.SETTINGS, 'readwrite');
          const store = tx.objectStore(STORES.SETTINGS);
          const req = store.put({ key, value, updatedAt: new Date().toISOString() });
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      }
    } catch (e) {
      console.warn('Error saving setting to IndexedDB:', e);
    }

    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch {
      // Ignore
    }
  }

  // ==========================================
  // 4. DIAGNÓSTICO Y ESTIMACIÓN DE ALMACENAMIENTO
  // ==========================================

  async getStorageStats(): Promise<{
    usageMb: number;
    quotaMb: number;
    percentUsed: number;
    isSupported: boolean;
  }> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usageMb = (estimate.usage || 0) / (1024 * 1024);
        const quotaMb = (estimate.quota || 0) / (1024 * 1024);
        const percentUsed = quotaMb > 0 ? (usageMb / quotaMb) * 100 : 0;

        return {
          usageMb: Math.round(usageMb * 100) / 100,
          quotaMb: Math.round(quotaMb),
          percentUsed: Math.round(percentUsed * 100) / 100,
          isSupported: true
        };
      } catch (err) {
        console.warn('Error estimating storage:', err);
      }
    }

    return {
      usageMb: 0,
      quotaMb: 0,
      percentUsed: 0,
      isSupported: false
    };
  }

  // Helpers internos
  private getLocalStorageFallback(key: string): { rows: any[][]; timestamp: string } | null {
    const cached = readStorage<CachedSheetFallback | null>(key, cachedSheetSchema.nullable(), null);
    if (!cached) return null;
    return { rows: cached.rows, timestamp: cached.timestamp || new Date().toISOString() };
  }

  private getLocalStorageQueue(): OfflineMutation[] {
    return readStorage<OfflineMutation[]>(STORAGE_KEYS.OFFLINE_QUEUE, objectArraySchema, []);
  }
}

export const indexedDbService = new IndexedDbService();
