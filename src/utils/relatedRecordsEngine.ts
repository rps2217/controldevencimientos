import { InventoryItem, SheetRecord, RelatedEntityType, RelatedEntitySummary } from '../types';
import { findColumnBySemantic } from './columnAliases';
import { getItemStatus, parseAnyDate, formatDisplayDate, formatLocaleNumber, getItemResolutionStatus } from './dateCalculations';
import { findMasterProduct, normalizeCleanText, normalizeRut } from './referenceResolver';

export interface ExtendedRelatedSummary extends RelatedEntitySummary {
  totalIncidentUnits: number;
  providerInfo?: {
    name: string;
    rut?: string;
    contact?: string;
    policy?: string;
    diasRetiro?: number | string;
  };
}

/**
 * Motor central de resolución de relaciones Parent-Child estilo AppSheet.
 * Permite examinar la entidad padre (Proveedor, SKU, Bodega, Chofer)
 * y recuperar sus registros hijos (Lotes, Incidencias, Catálogo) con métricas vivas.
 */
export function buildEntityRelationshipSummary(
  entityType: RelatedEntityType,
  entityValue: string,
  options: {
    allMainItems: InventoryItem[];
    events?: InventoryItem[];
    products?: SheetRecord[];
    policies?: SheetRecord[];
    customAliases?: Record<string, string[]>;
  }
): ExtendedRelatedSummary {
  const {
    allMainItems = [],
    events = [],
    products = [],
    policies = [],
    customAliases
  } = options;

  const cleanVal = (entityValue || '').trim();
  const cleanValNorm = normalizeCleanText(cleanVal);
  const cleanRut = normalizeRut(cleanVal);

  const matchedBatches: InventoryItem[] = [];
  const matchedIncidents: InventoryItem[] = [];
  const matchedProducts: SheetRecord[] = [];
  const matchedPolicies: SheetRecord[] = [];

  // 1. Filtrar Productos del Catálogo Maestro
  for (const prod of products) {
    const keys = Object.keys(prod);
    const skuCol = findColumnBySemantic(keys, 'sku', customAliases) || 'SKU';
    const provCol = findColumnBySemantic(keys, 'proveedor', customAliases) || 'PROVEEDOR';
    const catCol = findColumnBySemantic(keys, 'categoria', customAliases) || 'CATEGORIA';

    const pSku = String(prod[skuCol] || '').trim();
    const pProv = String(prod[provCol] || '').trim();
    const pCat = String(prod[catCol] || '').trim();

    if (entityType === 'sku' && pSku.toLowerCase() === cleanVal.toLowerCase()) {
      matchedProducts.push(prod);
    } else if (entityType === 'proveedor') {
      const provNorm = normalizeCleanText(pProv);
      const rutNorm = normalizeRut(pProv);
      if (provNorm.includes(cleanValNorm) || cleanValNorm.includes(provNorm) || (cleanRut && rutNorm === cleanRut)) {
        matchedProducts.push(prod);
      }
    } else if (entityType === 'categoria') {
      if (normalizeCleanText(pCat).includes(cleanValNorm)) {
        matchedProducts.push(prod);
      }
    }
  }

  // Pre-indexar SKUs que pertenecen a este proveedor para cruce rápido si la entidad es proveedor
  const providerSkuSet = new Set<string>();
  if (entityType === 'proveedor') {
    for (const p of matchedProducts) {
      const keys = Object.keys(p);
      const skuCol = findColumnBySemantic(keys, 'sku', customAliases) || 'SKU';
      if (p[skuCol]) {
        providerSkuSet.add(String(p[skuCol]).trim().toLowerCase());
      }
    }
  }

  // 2. Filtrar Lotes de Inventario (allMainItems)
  for (const item of allMainItems) {
    const keys = Object.keys(item);
    const skuCol = findColumnBySemantic(keys, 'sku', customAliases);
    const provCol = findColumnBySemantic(keys, 'proveedor', customAliases);
    const bodCol = findColumnBySemantic(keys, 'frc_bod', customAliases) || keys.find(k => /bodega|sucursal|local/i.test(k));
    const catCol = findColumnBySemantic(keys, 'categoria', customAliases);

    const iSku = skuCol && item[skuCol] ? String(item[skuCol]).trim() : '';
    const iProv = provCol && item[provCol] ? String(item[provCol]).trim() : '';
    const iBod = bodCol && item[bodCol] ? String(item[bodCol]).trim() : (item.FRC_BOD || item.BODEGA || '');
    const iCat = catCol && item[catCol] ? String(item[catCol]).trim() : '';

    let isMatch = false;

    if (entityType === 'sku') {
      isMatch = iSku.toLowerCase() === cleanVal.toLowerCase();
    } else if (entityType === 'proveedor') {
      const iProvNorm = normalizeCleanText(iProv);
      const iRutNorm = normalizeRut(iProv);
      if (
        (iProv && (iProvNorm.includes(cleanValNorm) || cleanValNorm.includes(iProvNorm))) ||
        (cleanRut && iRutNorm === cleanRut) ||
        (iSku && providerSkuSet.has(iSku.toLowerCase()))
      ) {
        isMatch = true;
      }
    } else if (entityType === 'bodega') {
      isMatch = normalizeCleanText(String(iBod)).includes(cleanValNorm);
    } else if (entityType === 'categoria') {
      isMatch = normalizeCleanText(String(iCat)).includes(cleanValNorm);
    }

    if (isMatch) {
      matchedBatches.push(item);
    }
  }

  // 3. Filtrar Incidencias y FRC
  // Si no se pasaron events explícitos, buscamos en allMainItems aquellos que tengan campos de eventos
  const candidateEvents = events.length > 0 ? events : allMainItems.filter(i => {
    return i.TIPO_EVENTO || i.FECHA_EVENTO || i.FRC_N || i.OBSERVACIONES;
  });

  for (const ev of candidateEvents) {
    const keys = Object.keys(ev);
    const skuCol = findColumnBySemantic(keys, 'sku', customAliases);
    const provCol = findColumnBySemantic(keys, 'proveedor', customAliases);
    const bodCol = findColumnBySemantic(keys, 'frc_bod', customAliases) || keys.find(k => /bodega|sucursal|local/i.test(k));
    const choferCol = keys.find(k => /chofer|conductor|transporte|chofer_nombre/i.test(k));

    const eSku = skuCol && ev[skuCol] ? String(ev[skuCol]).trim() : '';
    const eProv = provCol && ev[provCol] ? String(ev[provCol]).trim() : '';
    const eBod = bodCol && ev[bodCol] ? String(ev[bodCol]).trim() : (ev.FRC_BOD || ev.BODEGA || '');
    const eChofer = choferCol && ev[choferCol] ? String(ev[choferCol]).trim() : '';

    let isMatch = false;

    if (entityType === 'sku') {
      isMatch = eSku.toLowerCase() === cleanVal.toLowerCase();
    } else if (entityType === 'proveedor') {
      const eProvNorm = normalizeCleanText(eProv);
      const eRutNorm = normalizeRut(eProv);
      if (
        (eProv && (eProvNorm.includes(cleanValNorm) || cleanValNorm.includes(eProvNorm))) ||
        (cleanRut && eRutNorm === cleanRut) ||
        (eSku && providerSkuSet.has(eSku.toLowerCase()))
      ) {
        isMatch = true;
      }
    } else if (entityType === 'bodega') {
      isMatch = normalizeCleanText(String(eBod)).includes(cleanValNorm);
    } else if (entityType === 'chofer') {
      isMatch = normalizeCleanText(String(eChofer)).includes(cleanValNorm);
    }

    if (isMatch) {
      matchedIncidents.push(ev);
    }
  }

  // 4. Calcular KPIs agregados
  let totalUnits = 0;
  let criticalBatchesCount = 0;

  for (const b of matchedBatches) {
    const keys = Object.keys(b);
    const qtyCol = findColumnBySemantic(keys, 'cantidad', customAliases);
    const rawQty = qtyCol && b[qtyCol] !== undefined ? b[qtyCol] : (b.CANTIDAD || b.cantidad || 0);
    const numQty = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty).replace(/,/g, '.')) || 0;
    totalUnits += numQty;

    const status = getItemStatus(b, keys);
    if (status.code === 'EXPIRED' || status.code === 'RETIRE_NOW' || status.code === 'UPCOMING') {
      criticalBatchesCount++;
    }
  }

  let totalIncidentUnits = 0;
  let pendingIncidentsCount = 0;

  for (const inc of matchedIncidents) {
    const keys = Object.keys(inc);
    const qtyCol = findColumnBySemantic(keys, 'cantidad', customAliases);
    const rawQty = qtyCol && inc[qtyCol] !== undefined ? inc[qtyCol] : (inc.CANTIDAD || inc.cantidad || 0);
    const numQty = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty).replace(/,/g, '.')) || 0;
    totalIncidentUnits += numQty;

    const resStatus = getItemResolutionStatus(inc, keys);
    if (!resStatus.isResolved) {
      pendingIncidentsCount++;
    }
  }

  // Buscar información de política si la entidad es proveedor
  let providerInfo: ExtendedRelatedSummary['providerInfo'] = undefined;
  if (entityType === 'proveedor') {
    const matchedPol = policies.find(p => {
      const pText = Object.values(p).join(' ');
      return normalizeCleanText(pText).includes(cleanValNorm) || (cleanRut && normalizeRut(pText).includes(cleanRut));
    });

    providerInfo = {
      name: cleanVal,
      rut: cleanRut || undefined,
      policy: matchedPol ? String(matchedPol.POLITICA || matchedPol.DESCRIPCION || 'Canje Estándar') : 'Canje Comercial',
      diasRetiro: matchedPol ? (matchedPol.DIAS_RETIRO || matchedPol.DIAS_ANTICIPACION || 30) : 30
    };
  }

  return {
    entityType,
    entityValue: cleanVal,
    batches: matchedBatches,
    incidents: matchedIncidents,
    catalogProducts: matchedProducts,
    policies: matchedPolicies,
    totalIncidentUnits,
    providerInfo,
    kpis: {
      totalUnits,
      totalBatches: matchedBatches.length,
      totalIncidents: matchedIncidents.length,
      criticalBatchesCount,
      pendingIncidentsCount
    }
  };
}

/**
 * Genera un resumen ejecutivo en texto para compartir por WhatsApp o Correo
 * con la relación padre-hijos consolidada.
 */
export function generateParentChildTextReport(summary: ExtendedRelatedSummary): string {
  const { entityType, entityValue, kpis, batches, incidents, providerInfo } = summary;

  let headerIcon = '🏢';
  if (entityType === 'sku') headerIcon = '📦';
  if (entityType === 'bodega') headerIcon = '🏬';
  if (entityType === 'chofer') headerIcon = '🚚';

  const lines: string[] = [
    `📊 *INFORME CONSOLIDADO PARENT-CHILD (360°)*`,
    `${headerIcon} *${entityType.toUpperCase()}:* ${entityValue}`,
    `📅 Generado: ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
    ``,
    `📈 *MÉTRICAS CLAVE:*`,
    `• Stock Total en Lotes: ${formatLocaleNumber(kpis.totalUnits)} unidades (${kpis.totalBatches} lotes)`,
    `• Lotes Críticos / Vencidos: ${kpis.criticalBatchesCount}`,
    `• Incidencias / Mermas FRC: ${kpis.totalIncidents} registradas (${kpis.pendingIncidentsCount} pendientes)`
  ];

  if (providerInfo) {
    lines.push(
      `• Política Comercial: ${providerInfo.policy} (${providerInfo.diasRetiro} días de retiro)`
    );
  }

  if (batches.length > 0) {
    lines.push(``, `📦 *DETALLE DE LOTES EN RIESGO (Primeros 5):*`);
    batches.slice(0, 5).forEach((b, idx) => {
      const keys = Object.keys(b);
      const sku = b.SKU || b.sku || '-';
      const fecha = b.FECHA_VC || b.fecha_vc || `${b.MES}/${b.ANIO}` || '-';
      const cant = b.CANTIDAD || b.cantidad || '1';
      lines.push(`  ${idx + 1}. SKU ${sku} | Vto: ${fecha} | Cant: ${cant}`);
    });
    if (batches.length > 5) {
      lines.push(`  ... y ${batches.length - 5} lotes adicionales.`);
    }
  }

  if (incidents.length > 0) {
    lines.push(``, `⚠️ *INCIDENCIAS / FRC VINCULADAS (Primeras 3):*`);
    incidents.slice(0, 3).forEach((inc, idx) => {
      const tipo = inc.TIPO_EVENTO || 'Evento';
      const obs = inc.OBSERVACIONES || inc.DETALLE || 'Sin detalle';
      lines.push(`  ${idx + 1}. [${tipo}] ${obs}`);
    });
  }

  lines.push(``, `_Reporte generado desde Gestor de Vencimientos e Inventario_`);
  return lines.join('\n');
}
