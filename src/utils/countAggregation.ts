/**
 * Agregación y filtrado de la sesión de conteo, sin React.
 *
 * Vivía dentro de `StockCountTerminal.tsx` como ocho `useMemo`. Es lógica pura
 * (`sesión + filtros -> filas`), así que no tenía por qué estar en un componente
 * de 2.700 líneas: aquí se puede probar sin montar el DOM y el terminal queda con
 * sus componentes de presentación.
 *
 * Los cuerpos son idénticos a los originales; el único cambio es recibir la
 * sesión y los filtros como parámetros en vez de leerlos de estado.
 */
import { StockCountSession, StockCountEntry, StockCountReconciliationItem } from '../types';

export interface GroupedSkuEntry {
  sku: string;
  descripcion: string;
  totalCantidad: number;
  readingsCount: number;
  lastTimestamp: string;
  ubicaciones: string[];
  mm?: string;
  yyyy?: string;
  entries: StockCountEntry[];
}

export type ReconciliationFilter = 'ALL' | 'DIF' | 'CUADRADO' | 'FALTANTE' | 'SOBRANTE' | 'NO_CATALOGADO';

export interface ReconciliationMetrics {
  totalContado: number;
  totalTeorico: number;
  diferenciaNeta: number;
  cuadrados: number;
  faltantes: number;
  sobrantes: number;
  noCatalogados: number;
  conDiferencia: number;
  cobertura: number;
}

/** Agrupa las lecturas por SKU sumando cantidades y recolectando ubicaciones. */
export function groupSkuEntries(currentSession: StockCountSession | null): GroupedSkuEntry[] {
  if (!currentSession) return [];
  const map = new Map<string, GroupedSkuEntry>();

  for (const entry of currentSession.conteos) {
    const existing = map.get(entry.sku);
    if (!existing) {
      map.set(entry.sku, {
        sku: entry.sku,
        descripcion: entry.descripcion,
        totalCantidad: entry.cantidad,
        readingsCount: 1,
        lastTimestamp: entry.timestamp,
        ubicaciones: entry.ubicacion ? [entry.ubicacion] : [],
        mm: entry.mm,
        yyyy: entry.yyyy,
        entries: [entry]
      });
    } else {
      existing.totalCantidad += entry.cantidad;
      existing.readingsCount += 1;
      if (entry.ubicacion && !existing.ubicaciones.includes(entry.ubicacion)) {
        existing.ubicaciones.push(entry.ubicacion);
      }
      if (!existing.mm && entry.mm) {
        existing.mm = entry.mm;
        existing.yyyy = entry.yyyy;
      }
      existing.entries.push(entry);
    }
  }

  return Array.from(map.values());
}

/**
 * Última lectura con el acumulado de su SKU, para el feedback inmediato en móvil.
 * Depende del orden de `conteos`: el terminal inserta al frente, así que el
 * primero es la lectura más reciente.
 */
export function getLastScannedItem(currentSession: StockCountSession | null) {
  if (!currentSession || currentSession.conteos.length === 0) return null;
  const latest = currentSession.conteos[0];
  const totalForSku = currentSession.conteos
    .filter(c => c.sku === latest.sku)
    .reduce((sum, c) => sum + c.cantidad, 0);
  const readingsCountForSku = currentSession.conteos.filter(c => c.sku === latest.sku).length;
  return {
    ...latest,
    totalAcumulado: totalForSku,
    scanCount: readingsCountForSku
  };
}

/** Filtra los grupos por SKU, descripción o ubicación. */
export function filterGroupedEntries(entries: GroupedSkuEntry[], search: string): GroupedSkuEntry[] {
  if (!search.trim()) return entries;
  const q = search.toLowerCase().trim();
  return entries.filter(g =>
    g.sku.toLowerCase().includes(q) ||
    g.descripcion.toLowerCase().includes(q) ||
    g.ubicaciones.some(u => u.toLowerCase().includes(q))
  );
}

/** Filtra las lecturas cronológicas por SKU, descripción o ubicación. */
export function filterChronoEntries(currentSession: StockCountSession | null, search: string): StockCountEntry[] {
  if (!currentSession) return [];
  if (!search.trim()) return currentSession.conteos;
  const q = search.toLowerCase().trim();
  return currentSession.conteos.filter(c =>
    c.sku.toLowerCase().includes(q) ||
    c.descripcion.toLowerCase().includes(q) ||
    (c.ubicacion && c.ubicacion.toLowerCase().includes(q))
  );
}

/** Proveedores distintos presentes en la cuadratura, ordenados. */
export function getReconciliationProviders(reconciliation: StockCountReconciliationItem[]): string[] {
  const set = new Set<string>();
  reconciliation.forEach(r => {
    if (r.rutProveedor && r.rutProveedor.trim()) {
      set.add(r.rutProveedor.trim());
    }
  });
  return Array.from(set).sort();
}

/** Aplica el filtro de estado y el de proveedor elegidos en la vista. */
export function filterReconciliation(
  reconciliation: StockCountReconciliationItem[],
  filter: ReconciliationFilter,
  provider: string
): StockCountReconciliationItem[] {
  let list = reconciliation;
  if (provider !== 'ALL') {
    list = list.filter(r => String(r.rutProveedor || '').trim().toLowerCase() === String(provider || '').trim().toLowerCase());
  }
  if (filter === 'ALL') return list;
  if (filter === 'DIF') return list.filter(r => r.estado !== 'CUADRADO');
  return list.filter(r => r.estado === filter);
}

/**
 * KPIs de la cuadratura. `cobertura` usa el número de líneas como denominador y
 * nunca divide por cero (`|| 1`), así que una sesión vacía da 0% en vez de NaN.
 */
export function computeReconciliationMetrics(reconciliation: StockCountReconciliationItem[]): ReconciliationMetrics {
  let totalContado = 0;
  let totalTeorico = 0;
  let cuadrados = 0;
  let faltantes = 0;
  let sobrantes = 0;
  let noCatalogados = 0;

  for (const r of reconciliation) {
    totalContado += r.contado;
    totalTeorico += (r.teorico + r.ajusteMovimiento);
    if (r.estado === 'CUADRADO') cuadrados++;
    else if (r.estado === 'FALTANTE') faltantes++;
    else if (r.estado === 'SOBRANTE') sobrantes++;
    else if (r.estado === 'NO_CATALOGADO') noCatalogados++;
  }

  const itemsContadosCount = reconciliation.filter(r => r.contado > 0).length;
  const totalItemsCount = reconciliation.length || 1;
  const cobertura = Math.round((itemsContadosCount / totalItemsCount) * 100);

  return {
    totalContado,
    totalTeorico,
    diferenciaNeta: totalContado - totalTeorico,
    cuadrados,
    faltantes,
    sobrantes,
    noCatalogados,
    conDiferencia: faltantes + sobrantes + noCatalogados,
    cobertura
  };
}

/** Checklist de SKUs con stock teórico y cero lecturas, filtrable. */
export function getPendingItems(
  currentSession: StockCountSession | null,
  reconciliation: StockCountReconciliationItem[],
  search: string
): StockCountReconciliationItem[] {
  if (!currentSession) return [];
  const items = reconciliation.filter(r => r.contado === 0 && r.teorico > 0);
  if (!search.trim()) return items;
  const term = search.toLowerCase().trim();
  return items.filter(r =>
    r.sku.toLowerCase().includes(term) ||
    r.descripcion.toLowerCase().includes(term)
  );
}
