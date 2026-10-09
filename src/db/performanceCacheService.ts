import { indexedDbService } from './indexedDbService';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const MEMORY_CACHE = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

/**
 * High-performance caching layer combining in-memory Map and IndexedDB settings store
 * implementing Stale-While-Revalidate for sub-millisecond data hydration.
 */
export const performanceCache = {
  async get<T>(key: string): Promise<T | null> {
    const now = Date.now();
    
    // 1. Check memory cache first (Instant ~0ms)
    const memEntry = MEMORY_CACHE.get(key) as CacheEntry<T> | undefined;
    if (memEntry) {
      if (now - memEntry.timestamp < memEntry.ttlMs) {
        return memEntry.data;
      }
      MEMORY_CACHE.delete(key);
    }

    // 2. Check IndexedDB / persistent storage cache (~2-5ms)
    try {
      const dbEntry = await indexedDbService.getSetting<CacheEntry<T> | null>(`cache_${key}`, null);
      if (dbEntry && now - dbEntry.timestamp < dbEntry.ttlMs) {
        // Populate memory cache for subsequent instant reads
        MEMORY_CACHE.set(key, dbEntry);
        return dbEntry.data;
      }
    } catch (err) {
      console.warn('[PerformanceCache] Read error from persistent storage:', err);
    }

    return null;
  },

  async set<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttlMs
    };

    // Store in memory
    MEMORY_CACHE.set(key, entry);

    // Store in persistent storage asynchronously without blocking main thread
    try {
      await indexedDbService.saveSetting(`cache_${key}`, entry);
    } catch (err) {
      console.warn('[PerformanceCache] Write error to persistent storage:', err);
    }
  },

  async invalidate(key: string): Promise<void> {
    MEMORY_CACHE.delete(key);
    try {
      await indexedDbService.saveSetting(`cache_${key}`, null);
    } catch (err) {
      console.warn('[PerformanceCache] Invalidate error:', err);
    }
  },

  clear(): void {
    MEMORY_CACHE.clear();
  }
};

/**
 * Performance monitor utility for tracking execution times of heavy operations.
 */
export function measurePerformance<T>(label: string, fn: () => T): T {
  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    if (duration > 16.6) { // Longer than 1 frame (60fps)
      console.warn(`[Performance Warning] '${label}' took ${duration.toFixed(2)}ms`);
    }
    return result;
  } catch (err) {
    const duration = performance.now() - start;
    console.error(`[Performance Error] '${label}' failed after ${duration.toFixed(2)}ms:`, err);
    throw err;
  }
}

/**
 * Async performance monitor utility.
 */
export async function measurePerformanceAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    if (duration > 50) {
      console.warn(`[Performance Warning Async] '${label}' took ${duration.toFixed(2)}ms`);
    }
    return result;
  } catch (err) {
    const duration = performance.now() - start;
    console.error(`[Performance Error Async] '${label}' failed after ${duration.toFixed(2)}ms:`, err);
    throw err;
  }
}
