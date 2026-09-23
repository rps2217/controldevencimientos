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
  searchTerm: string
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
