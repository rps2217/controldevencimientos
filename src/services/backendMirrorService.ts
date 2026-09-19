/**
 * Backend Mirroring REST Synchronization Service
 * 
 * Permite mantener un "Espejo de Backend" REST
 * en paralelo a Google Sheets, superando las limitaciones de latencia y concurrencia 
 * en operaciones críticas de alta frecuencia (como conteos masivos en farmacia).
 */
import { STORAGE_KEYS } from '../utils/appStorage';

import { BackendMirrorConfig, InventoryItem } from '../types';
import { OfflineMutation } from '../db/indexedDbService';
import { getErrorMessage } from '../utils/pureCalculations';
import { fetchWithTimeout } from '../lib/http';

export interface MirrorTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  statusCode?: number;
}

export interface MirrorLogEntry {
  id: string;
  timestamp: string;
  action: 'test' | 'sync' | 'mutation' | 'conflict';
  status: 'ok' | 'error' | 'warning';
  message: string;
  details?: any;
}

class BackendMirrorService {
  private logs: MirrorLogEntry[] = [];
  private deviceId: string;

  constructor() {
    // Generate or retrieve unique device ID for conflict detection
    if (typeof window !== 'undefined') {
      let devId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      if (!devId) {
        devId = 'dev_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, devId);
      }
      this.deviceId = devId;
    } else {
      this.deviceId = 'dev_srv';
    }
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public getLogs(): MirrorLogEntry[] {
    return [...this.logs].slice(-50);
  }

  public addLog(action: MirrorLogEntry['action'], status: MirrorLogEntry['status'], message: string, details?: any) {
    const entry: MirrorLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      action,
      status,
      message,
      details
    };
    this.logs.push(entry);
    if (this.logs.length > 100) this.logs.shift();
  }

  /**
   * Test connection to the Mirror Backend
   */
  public async testConnection(config: BackendMirrorConfig): Promise<MirrorTestResult> {
    if (!config.endpointUrl || !config.endpointUrl.trim()) {
      return {
        success: false,
        latencyMs: 0,
        message: 'La URL del endpoint de espejo está vacía.'
      };
    }

    const startTime = performance.now();

    try {
      // Validate URL format
      const url = new URL(config.endpointUrl);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId,
        'X-Client-Role': 'pharmacy_inventory'
      };

      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers
      }, 6000);

      const latencyMs = Math.round(performance.now() - startTime);

      if (response.ok || response.status === 404 || response.status === 405) {
        // Many mirror root endpoints might return 404 or 405 for GET on a collection, which proves the server is alive
        const result: MirrorTestResult = {
          success: true,
          latencyMs,
          statusCode: response.status,
          message: `Conexión exitosa con el servidor espejo (${latencyMs}ms, HTTP ${response.status})`
        };
        this.addLog('test', 'ok', result.message, { latencyMs });
        return result;
      } else {
        const result: MirrorTestResult = {
          success: false,
          latencyMs,
          statusCode: response.status,
          message: `El servidor respondió con código de error HTTP ${response.status}: ${response.statusText}`
        };
        this.addLog('test', 'error', result.message);
        return result;
      }
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const message = isTimeout 
        ? `Tiempo de espera agotado (timeout de 6s). Verifique si el servidor está en línea.`
        : `Fallo de conexión de red: ${getErrorMessage(err) || 'No se pudo alcanzar el endpoint'}`;

      this.addLog('test', 'error', message);
      return {
        success: false,
        latencyMs,
        message
      };
    }
  }

  /**
   * Replicate a single mutation to the Mirror Backend
   */
  public async mirrorMutation(config: BackendMirrorConfig, mutation: OfflineMutation): Promise<{ success: boolean; error?: string }> {
    if (!config.enabled || !config.endpointUrl) {
      return { success: true };
    }

    try {
      const payload = {
        mutationId: mutation.id,
        type: mutation.type,
        sheetTitle: mutation.sheetTitle,
        entityKey: mutation.entityKey,
        entityKeyCol: mutation.entityKeyCol,
        values: mutation.values,
        headers: mutation.headers,
        rowIndex: mutation.rowIndex,
        clientTimestamp: mutation.createdAt,
        deviceId: this.deviceId,
        conflictStrategy: config.conflictStrategy
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId,
        'X-Mutation-Type': mutation.type
      };

      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const res = await fetchWithTimeout(config.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      this.addLog('mutation', 'ok', `Mutación [${mutation.type}] replicada al espejo (${mutation.sheetTitle})`);
      return { success: true };
    } catch (err: unknown) {
      this.addLog('mutation', 'error', `Fallo al replicar mutación al espejo: ${getErrorMessage(err)}`);
      return { success: false, error: getErrorMessage(err) };
    }
  }

  /**
   * Synchronize an entire sheet's rows to the Mirror Backend
   */
  public async syncSheetToMirror(
    config: BackendMirrorConfig, 
    sheetTitle: string, 
    headers: string[], 
    items: InventoryItem[]
  ): Promise<{ mirroredCount: number; error?: string }> {
    if (!config.enabled || !config.endpointUrl) {
      return { mirroredCount: 0, error: 'El espejo de backend no está habilitado.' };
    }

    try {
      const payload = {
        action: 'bulk_sync',
        sheetTitle,
        headers,
        rowCount: items.length,
        items: items.map(it => {
          const clean: Record<string, any> = {};
          headers.forEach(h => {
            clean[h] = it[h] ?? '';
          });
          clean._rowIndex = it._rowIndex;
          clean._entityKey = it._entityKey;
          return clean;
        }),
        timestamp: new Date().toISOString(),
        deviceId: this.deviceId
      };

      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId
      };

      if (config.apiKey) {
        reqHeaders['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const res = await fetchWithTimeout(config.endpointUrl, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(payload)
      }, 30000);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} al sincronizar espejo: ${res.statusText}`);
      }

      this.addLog('sync', 'ok', `Sincronizados ${items.length} registros con el espejo (${sheetTitle})`);
      return { mirroredCount: items.length };
    } catch (err: unknown) {
      this.addLog('sync', 'error', `Error en sincronización masiva a espejo: ${getErrorMessage(err)}`);
      return { mirroredCount: 0, error: getErrorMessage(err) };
    }
  }
}

export const backendMirrorService = new BackendMirrorService();
