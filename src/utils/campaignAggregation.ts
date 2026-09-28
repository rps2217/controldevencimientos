/**
 * Derivación y filtrado de la vista de campañas, sin React.
 *
 * Vivía dentro de `CampaignConsolidationDashboard.tsx` como cuatro `useMemo`.
 * Es lógica pura (`campañas/matriz + filtros -> filas`), así que no tenía por qué
 * estar en un componente de 1.400 líneas: aquí se prueba sin montar el DOM.
 *
 * Los cuerpos son idénticos a los originales; el único cambio es recibir los datos
 * como parámetros en vez de leerlos de estado.
 */
import { CampaignAuditRow, CampaignConsolidationMatrix, InventoryCampaign } from '../types';

export type CampaignMatrixFilter = 'ALL' | 'VALIDADO_OK' | 'DISCREPANCIA' | 'NUNCA_PISTOLEADO' | 'HALLAZGO';

/**
 * Campaña activa por id, con la primera como respaldo.
 *
 * El respaldo importa: si todavía no hay id seleccionado pero existen campañas,
 * se muestra la primera. Sin él, la vista caería en el estado "sin campaña" con
 * datos disponibles.
 */
export function resolveActiveCampaign(
  campaigns: InventoryCampaign[],
  activeCampaignId: string | null
): InventoryCampaign | null {
  if (!activeCampaignId && campaigns.length > 0) {
    return campaigns[0];
  }
  return campaigns.find(c => c.id === activeCampaignId) || null;
}

/** Todas las filas de auditoría, sin importar su estado, en el orden de la matriz. */
export function collectAllAuditRows(matrix: CampaignConsolidationMatrix | null): CampaignAuditRow[] {
  if (!matrix) return [];
  return [...matrix.cuadrados, ...matrix.discrepancias, ...matrix.nuncaPistoleados, ...matrix.hallazgos];
}

/** Proveedores distintos presentes en la auditoría, ordenados para el desplegable. */
export function getAuditProviders(rows: CampaignAuditRow[]): string[] {
  const set = new Set<string>();
  rows.forEach(r => {
    if (r.proveedor) set.add(r.proveedor);
  });
  return Array.from(set).sort();
}

export interface ProviderProgress {
  proveedor: string;
  totalSkus: number;        // SKUs del proveedor en el universo CONTABLE (teórico con stock + hallazgos)
  contados: number;         // SKUs con al menos una lectura física
  cuadrados: number;
  discrepancias: number;
  porContar: number;        // Carga de conteo: SKUs con stock y cero lecturas (coincide con el checklist)
  hallazgos: number;
  cobertura: number;        // contados / totalSkus, en %
  totalTeorico: number;     // unidades esperadas (teórico efectivo)
  totalFisico: number;      // unidades contadas
}

/**
 * Un SKU del snapshot está realmente POR CONTAR si tiene stock y no fue leído.
 *
 * El universo teórico incluye SKUs con stock 0 (el ERP los lista y la matriz los marca
 * NUNCA_PISTOLEADO), pero esos no son carga de conteo: no están en la góndola y el
 * checklist del terminal los omite (`getPendingItems` filtra `teorico > 0`). Si el
 * avance por proveedor los contara como pendientes, el panel ofrecería "contar 12" y
 * el operario vería 9 en la lista. Se usa el stock del snapshot (no el efectivo con
 * ajuste de ventas) porque el terminal tampoco conoce ese ajuste: así el panel y el
 * checklist miden lo mismo.
 *
 * Esto separa dos ejes que antes compartían un número: la CARGA DE CONTEO (este panel)
 * y la COBERTURA DE AUDITORÍA (KPI de campaña, que sí incluye los SKUs sin stock por
 * auditar). Son preguntas distintas: "¿qué falta recorrer?" vs "¿qué falta auditar?".
 */
const esPorContar = (row: CampaignAuditRow): boolean => row.stockTeorico > 0;

/**
 * Avance de la auditoría agrupado por proveedor.
 *
 * El operario recorre la tienda por proveedor (un laboratorio a la vez), no por
 * mueble, así que necesita saber cuánto le falta de cada uno sin abrir la tabla.
 * Es el análogo de `resumenPorUbicacion`, pero sobre un eje que sí vive en la fila
 * (`CampaignAuditRow.proveedor`) y que la UI ya usa para filtrar.
 *
 * `cobertura` cuenta SKUs, no unidades: 80 unidades de 1 SKU no son el 80 % de una
 * góndola de 10 SKUs. Nunca divide por cero.
 */
export function computeProviderProgress(matrix: CampaignConsolidationMatrix | null): ProviderProgress[] {
  if (!matrix) return [];

  const acc = new Map<string, ProviderProgress>();
  const bucket = (proveedor: string): ProviderProgress => {
    const key = proveedor.trim() || 'Sin Proveedor';
    let p = acc.get(key);
    if (!p) {
      p = {
        proveedor: key, totalSkus: 0, contados: 0, cuadrados: 0, discrepancias: 0,
        porContar: 0, hallazgos: 0, cobertura: 0, totalTeorico: 0, totalFisico: 0
      };
      acc.set(key, p);
    }
    return p;
  };

  for (const row of matrix.cuadrados) {
    const p = bucket(row.proveedor);
    p.totalSkus++; p.contados++; p.cuadrados++;
    p.totalTeorico += row.stockTeoricoEfectivo; p.totalFisico += row.stockFisicoTotal;
  }
  for (const row of matrix.discrepancias) {
    const p = bucket(row.proveedor);
    p.totalSkus++; p.contados++; p.discrepancias++;
    p.totalTeorico += row.stockTeoricoEfectivo; p.totalFisico += row.stockFisicoTotal;
  }
  for (const row of matrix.nuncaPistoleados) {
    // Solo los SKUs con stock entran al universo contable y a la carga de conteo.
    // Uno sin stock no está en la góndola: no se recorre ni diluye la cobertura.
    if (!esPorContar(row)) continue;
    const p = bucket(row.proveedor);
    p.totalSkus++; p.porContar++;
    p.totalTeorico += row.stockTeoricoEfectivo;
  }
  for (const row of matrix.hallazgos) {
    const p = bucket(row.proveedor);
    p.totalSkus++; p.contados++; p.hallazgos++;
    p.totalFisico += row.stockFisicoTotal;
  }

  const list = Array.from(acc.values());
  for (const p of list) {
    p.cobertura = p.totalSkus > 0 ? Math.round((p.contados / p.totalSkus) * 100) : 0;
  }
  // Lo que falta primero: ordenar por carga de conteo desc y luego por nombre.
  return list.sort((a, b) => b.porContar - a.porContar || a.proveedor.localeCompare(b.proveedor));
}

/**
 * SKUs que debe recorrer una sesión de conteo nueva acotada a un proveedor: los del
 * snapshot con stock y aún sin ninguna lectura física. Es la misma definición que usa
 * el badge del panel y el filtro del checklist del terminal (`teorico > 0`), para que
 * el botón "Contar" ofrezca exactamente lo que el operario verá al abrir la sesión.
 *
 * Vacío si el proveedor ya está completo o no existe (`''` para "sin proveedor").
 */
export function getProviderPendingSkus(
  matrix: CampaignConsolidationMatrix | null,
  proveedor: string
): string[] {
  if (!matrix) return [];
  const key = proveedor.trim() || 'Sin Proveedor';
  return matrix.nuncaPistoleados
    .filter(r => (r.proveedor.trim() || 'Sin Proveedor') === key && esPorContar(r))
    .map(r => r.sku);
}


/**
 * Filas visibles de la matriz según estado, proveedor y búsqueda.
 *
 * Con `ALL` el orden es discrepancias → nunca pistoleados → cuadrados → hallazgos,
 * deliberado: lo que exige acción va primero. Los filtros de proveedor y búsqueda
 * son acumulativos y se aplican después del de estado.
 */
export function filterAuditRows(
  matrix: CampaignConsolidationMatrix | null,
  filter: CampaignMatrixFilter,
  selectedProvider: string,
  searchTerm: string,
  selectedLocation?: string
): CampaignAuditRow[] {
  if (!matrix) return [];
  let list: CampaignAuditRow[] = [];
  if (filter === 'ALL') {
    list = [...matrix.discrepancias, ...matrix.nuncaPistoleados, ...matrix.cuadrados, ...matrix.hallazgos];
  } else if (filter === 'VALIDADO_OK') {
    list = matrix.cuadrados;
  } else if (filter === 'DISCREPANCIA') {
    list = matrix.discrepancias;
  } else if (filter === 'NUNCA_PISTOLEADO') {
    list = matrix.nuncaPistoleados;
  } else if (filter === 'HALLAZGO') {
    list = matrix.hallazgos;
  }

  if (selectedProvider !== 'ALL') {
    list = list.filter(r => r.proveedor === selectedProvider);
  }

  if (selectedLocation && selectedLocation !== 'ALL') {
    list = list.filter(r =>
      r.sesionesDondeAparece && r.sesionesDondeAparece.some(s => (s.ubicacion || s.nombreSesion) === selectedLocation)
    );
  }

  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase().trim();
    list = list.filter(r =>
      r.sku.toLowerCase().includes(q) ||
      r.descripcion.toLowerCase().includes(q) ||
      r.proveedor.toLowerCase().includes(q)
    );
  }

  return list;
}
