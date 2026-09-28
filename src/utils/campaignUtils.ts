/**
 * Motor de campañas de inventario cíclico multisesión (farmacia en movimiento).
 *
 * Cubre el ciclo completo de una campaña: snapshot del ERP, matriz de cuadratura,
 * separación de aguas (cuadrados / discrepancias / nunca pistoleados / hallazgos),
 * ajuste de ventas, validación por SKU, exportación de reportes y actas, y su
 * persistencia en almacenamiento local.
 *
 * Se separó de `stockCountUtils` (sesiones de conteo y reconciliación de una sesión)
 * porque ambos dominios no compartían una sola función: mantenerlos juntos solo
 * engordaba el archivo sin dar cohesión.
 */
import {
  InventoryCampaign,
  CampaignSnapshotRecord,
  CampaignConsolidationMatrix,
  CampaignAuditRow,
  StockCountSession,
  StockCountEntry,
} from '../types';
import { findColumnBySemantic } from './columnAliases';
import { parseLocaleNumber, rowToObject } from './pureCalculations';
import { exportToExcel } from './exportUtils';
import { STORAGE_KEYS, readStorage, objectArraySchema } from './appStorage';

// ==========================================
// CAMPAÑA DE INVENTARIO CÍCLICO MULTISESIÓN
// ==========================================


/**
 * Loads all saved inventory campaigns from storage
 */
export function loadCampaignsFromStorage(): InventoryCampaign[] {
  return readStorage<InventoryCampaign[]>(STORAGE_KEYS.CAMPAIGNS, objectArraySchema, []);
}

/**
 * Persists inventory campaigns to storage
 */
export function saveCampaignsToStorage(campaigns: InventoryCampaign[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
  } catch (e) {
    console.warn('Error saving campaigns to storage:', e);
  }
}

/**
 * Gets the active campaign ID
 */
export function getActiveCampaignId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_CAMPAIGN_ID);
  } catch (e) {
    return null;
  }
}

/**
 * Sets the active campaign ID
 */
export function setActiveCampaignId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CAMPAIGN_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CAMPAIGN_ID);
    }
  } catch (e) {
    console.warn('Error setting active campaign ID:', e);
  }
}

/**
 * Creates a new blank inventory campaign
 */
export function createNewCampaign(nombre: string, local?: string): InventoryCampaign {
  const now = new Date().toISOString();
  return {
    id: `camp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    nombre: nombre.trim() || `Campaña ${new Date().toLocaleDateString('es-CL')}`,
    local: local?.trim() || '',
    fechaInicio: now,
    fechaActualizacion: now,
    estado: 'ACTIVA',
    snapshotTeoricoActual: {},
    historialSnapshots: [],
    sessionIds: [],
    itemsValidadosCerrados: {},
    ajustesVentaManual: {}
  };
}

/**
 * Parses raw tabular rows from pharmacy ERP Excel/CSV export and imports them into a campaign snapshot
 * Supports the exact format: Local | Código SKU | Descripción | Proveedor | Stock | Inv. Inicial | Egreso | Ingreso | Venta | Stock Min | Stock Max | Stock Crítico
 */
export function importPharmacySnapshotToCampaign(
  campaign: InventoryCampaign,
  rows: ReadonlyArray<Record<string, unknown> | ReadonlyArray<unknown>>,
  headers: string[],
  filename: string = 'Snapshot_ERP'
): { updatedCampaign: InventoryCampaign; totalImported: number; newSkus: number; updatedSkus: number } {
  const now = new Date().toISOString();
  
  // Dynamic header resolution
  const skuCol = findColumnBySemantic(headers, 'sku') || 
    headers.find(h => /^(c[oó]d(igo)?(_|\s)?(sku|barra|art|articulo|producto)?|ean|barcode|sku)$/i.test(h.trim()));
    
  const descCol = findColumnBySemantic(headers, 'descripcion') || 
    headers.find(h => /^(descripci[oó]n|nombre|producto|articulo|detalle)$/i.test(h.trim()));
    
  const provCol = findColumnBySemantic(headers, 'proveedor') || 
    headers.find(h => /^(proveedor|rut(_|\s)?prov(eedor)?|laboratorio|marca)$/i.test(h.trim()));
    
  const stockCol = findColumnBySemantic(headers, 'cantidad') || 
    headers.find(h => /^(stock|saldo|existencia(s)?|cant(idad)?|unidades)$/i.test(h.trim()));
    
  const ventaCol = findColumnBySemantic(headers, 'venta');
  const ingresoCol = findColumnBySemantic(headers, 'ingreso');
  const egresoCol = findColumnBySemantic(headers, 'egreso');
  const invIniCol = findColumnBySemantic(headers, 'inv_inicial');
  const localCol = findColumnBySemantic(headers, 'local');
  const minCol = findColumnBySemantic(headers, 'stock_min');
  const maxCol = findColumnBySemantic(headers, 'stock_max');
  const critCol = findColumnBySemantic(headers, 'stock_critico');

  let newSkus = 0;
  let updatedSkus = 0;
  let totalStock = 0;
  let totalVentas = 0;

  const currentSnapshot = { ...campaign.snapshotTeoricoActual };
  let detectedLocal = campaign.local || '';

  for (const rawRow of rows) {
    // Los llamadores no son consistentes: el modal y la campana de consolidación
    // entregan matrices (string[][]) mientras que otros entregan registros. Se
    // normaliza aquí, en el único punto de entrada, para no perder ninguna fila.
    const row = Array.isArray(rawRow) ? rowToObject(headers, rawRow) : (rawRow as Record<string, unknown>);

    // 1. Resolve SKU code (handling multiple formats and aliases)
    let rawSku = skuCol ? row[skuCol] : null;
    if (rawSku === undefined || rawSku === null || String(rawSku).trim() === '') {
      rawSku = row['Código SKU'] || row['Codigo SKU'] || row['Código'] || row['Codigo'] || 
               row['Cód. Barra'] || row['Cod. Barra'] || row['EAN'] || row.SKU || row.sku || 
               row.CODIGO || row.Codigo;
    }
    
    // Normalization (strip trailing decimals if parsed as numeric float like 7804671180800.0)
    let cleanSku = String(rawSku ?? '').trim();
    if (cleanSku.endsWith('.0')) {
      cleanSku = cleanSku.substring(0, cleanSku.length - 2);
    }
    if (!cleanSku) continue;

    // 2. Resolve Description
    let rawDesc = descCol ? row[descCol] : null;
    if (!rawDesc) {
      rawDesc = row['Descripción'] || row['Descripcion'] || row['DESCRIPCION'] || 
                row['PRODUCTO'] || row['Producto'] || row['Nombre'] || row['Articulo'] || '';
    }

    // 3. Resolve Provider
    let rawProv = provCol ? row[provCol] : null;
    if (!rawProv) {
      rawProv = row['Proveedor'] || row['PROVEEDOR'] || row['Rut Proveedor'] || row['Laboratorio'] || '';
    }

    // 4. Resolve Stock
    let rawStock = stockCol ? row[stockCol] : null;
    if (rawStock === undefined || rawStock === null || String(rawStock).trim() === '') {
      rawStock = row['Stock'] || row['STOCK'] || row['Saldo'] || row['SALDO'] || 
                 row['Existencias'] || row['Cantidad'] || row['Cant'] || 0;
    }

    const rawVenta = ventaCol ? row[ventaCol] : (row['Venta'] ?? row['VENTA'] ?? 0);
    const rawIngreso = ingresoCol ? row[ingresoCol] : (row['Ingreso'] ?? row['INGRESO'] ?? 0);
    const rawEgreso = egresoCol ? row[egresoCol] : (row['Egreso'] ?? row['EGRESO'] ?? 0);
    const rawInvIni = invIniCol ? row[invIniCol] : (row['Inv. Inicial'] ?? row['INV_INICIAL'] ?? 0);
    const rawLocal = localCol ? row[localCol] : (row['Local'] ?? row['LOCAL'] ?? '');
    const rawMin = minCol ? row[minCol] : (row['Stock Min'] ?? 0);
    const rawMax = maxCol ? row[maxCol] : (row['Stock Max'] ?? 0);
    const rawCrit = critCol ? row[critCol] : (row['Stock Crítico'] ?? 0);

    const parsedStock = parseLocaleNumber(rawStock, 0);
    const parsedVenta = parseLocaleNumber(rawVenta, 0);
    const parsedIngreso = parseLocaleNumber(rawIngreso, 0);
    const parsedEgreso = parseLocaleNumber(rawEgreso, 0);
    const parsedInvIni = parseLocaleNumber(rawInvIni, 0);

    totalStock += parsedStock;
    totalVentas += parsedVenta;

    if (rawLocal && !detectedLocal) {
      detectedLocal = String(rawLocal).trim();
    }

    if (!currentSnapshot[cleanSku]) {
      newSkus++;
    } else {
      updatedSkus++;
    }

    currentSnapshot[cleanSku] = {
      sku: cleanSku,
      descripcion: String(rawDesc || currentSnapshot[cleanSku]?.descripcion || '').trim(),
      proveedor: String(rawProv || currentSnapshot[cleanSku]?.proveedor || '').trim(),
      stockTeorico: parsedStock,
      venta: parsedVenta,
      ingreso: parsedIngreso,
      egreso: parsedEgreso,
      invInicial: parsedInvIni,
      stockMin: parseLocaleNumber(rawMin, 0),
      stockMax: parseLocaleNumber(rawMax, 0),
      stockCritico: parseLocaleNumber(rawCrit, 0),
      local: rawLocal ? String(rawLocal).trim() : detectedLocal,
      fechaCarga: now
    };
  }

  const snapshotRecord: CampaignSnapshotRecord = {
    id: `snap_${Date.now()}`,
    nombreArchivo: filename,
    fechaCarga: now,
    totalSkus: Object.keys(currentSnapshot).length,
    totalStockTeorico: totalStock,
    totalVentasRegistradas: totalVentas
  };

  const updatedCampaign: InventoryCampaign = {
    ...campaign,
    local: detectedLocal || campaign.local,
    fechaActualizacion: now,
    snapshotTeoricoActual: currentSnapshot,
    historialSnapshots: [snapshotRecord, ...campaign.historialSnapshots]
  };

  return {
    updatedCampaign,
    totalImported: Object.keys(currentSnapshot).length,
    newSkus,
    updatedSkus
  };
}

/**
 * Computes the complete Master Consolidation Matrix across all sessions in a campaign
 * Categorizes every SKU into the 4 standard audit buckets:
 * 🟢 CUADRADOS / VALIDADOS (Auditados y conformes)
 * 🟡 DISCREPANCIAS (Diferencias pendientes de 2do conteo / revisión de venta)
 * 🔴 NUNCA PISTOLEADOS (Existen en ERP pero 0 lecturas en todas las sesiones)
 * 🔵 HALLAZGOS (Pistoleados pero no en ERP o stock 0)
 */
export function computeCampaignConsolidationMatrix(
  campaign: InventoryCampaign,
  allSessions: StockCountSession[]
): CampaignConsolidationMatrix {
  const now = new Date().toISOString();
  
  // 1. Filter sessions associated with this campaign
  const campaignSessions = allSessions.filter(s => 
    campaign.sessionIds.length === 0 || campaign.sessionIds.includes(s.id)
  );

  // 2. Acumulación física. Hay dos clases de sesión y se agregan distinto:
  //
  //   - Conteo normal: mira mercadería que ningún otro conteo miró, así que se SUMA
  //     entre sesiones (mueble A 50 + mueble B 30 = 80 unidades del mismo SKU).
  //   - 2da vuelta: vuelve a mirar la MISMA mercadería contada ANTES que ella, así
  //     que su cantidad REEMPLAZA la del SKU en vez de sumarse. Si el primer conteo
  //     dijo 98 y la vuelta confirma 98, el físico es 98 y no 196. La vuelta es el
  //     conteo vigente de todo lo que barrió, y como se lanza de forma GLOBAL
  //     (recorre la tienda completa), su total es el total real del SKU.
  //
  // Las sesiones se procesan en ORDEN CRONOLÓGICO, no agrupadas por bandera. Un
  // conteo normal posterior a una vuelta es una ubicación nueva (p.ej. una bodega
  // contada después) y debe SUMAR: la vuelta sólo corrige lo contado antes de ella,
  // no puede borrar lo que vino después. Agrupar por bandera perdía esas unidades.
  //
  // Sin esta distinción la 2da vuelta duplicaba el físico y la matriz reportaba un
  // sobrante inexistente (98 + 98 = 196 en vez de 98), corrompiendo la cuadratura.
  // Es la operación central de un inventario general con stock en movimiento: la
  // vuelta existe justo para corregir, no para agregar mercadería.
  //
  // La cantidad se acumula en `totalesPorSku` (valor físico final) y en paralelo se
  // registra la traza de sesiones, que es informativa.
  const totalesPorSku = new Map<string, number>();
  const physDescripcion = new Map<string, { descripcion: string; proveedor?: string }>();
  const physSesiones = new Map<string, Array<{
    sesionId: string;
    nombreSesion: string;
    ubicacion?: string;
    cantidad: number;
    timestamp: string;
  }>>();

  // Cantidad por SKU dentro de una sesión: las lecturas repetidas del mismo SKU se
  // suman, porque el operario repite la lectura al volver sobre el mismo estante.
  const totalesDeSesion = (session: StockCountSession) => {
    const totals = new Map<string, { cantidad: number; entry: StockCountEntry }>();
    for (const entry of session.conteos) {
      const cleanSku = String(entry.sku || '').trim();
      if (!cleanSku) continue;
      const acc = totals.get(cleanSku);
      if (acc) acc.cantidad += entry.cantidad;
      else totals.set(cleanSku, { cantidad: entry.cantidad, entry });
    }
    return totals;
  };

  const registrarTraza = (session: StockCountSession, sku: string, cantidad: number, timestamp: string) => {
    const traza = physSesiones.get(sku) || [];
    traza.push({
      sesionId: session.id,
      nombreSesion: session.nombre,
      ubicacion: session.ubicacion,
      cantidad,
      timestamp
    });
    physSesiones.set(sku, traza);
  };

  const guardarMaestro = (sku: string, entry: StockCountEntry) => {
    const actual = physDescripcion.get(sku);
    if (!actual) {
      physDescripcion.set(sku, { descripcion: entry.descripcion || '', proveedor: entry.rutProveedor });
    } else {
      if (!actual.descripcion && entry.descripcion) actual.descripcion = entry.descripcion;
      if (!actual.proveedor && entry.rutProveedor) actual.proveedor = entry.rutProveedor;
    }
  };

  // Orden cronológico estable: `fechaInicio` y, a igualdad, el id. Sin el desempate
  // por id, dos sesiones con la misma marca dependen del orden de entrada y el
  // resultado de la cuadratura dejaría de ser reproducible.
  const sesionesCronologicas = [...campaignSessions].sort((a, b) => {
    const fa = a.fechaInicio || '';
    const fb = b.fechaInicio || '';
    if (fa !== fb) return fa.localeCompare(fb);
    return (a.id || '').localeCompare(b.id || '');
  });

  for (const session of sesionesCronologicas) {
    for (const [cleanSku, { cantidad, entry }] of totalesDeSesion(session)) {
      if (session.esSegundaVuelta) {
        // Reemplaza lo contado ANTES: la vuelta es el conteo vigente de ese SKU.
        totalesPorSku.set(cleanSku, cantidad);
      } else {
        totalesPorSku.set(cleanSku, (totalesPorSku.get(cleanSku) || 0) + cantidad);
      }
      guardarMaestro(cleanSku, entry);
      registrarTraza(session, cleanSku, cantidad, entry.timestamp);
    }
  }

  const physicalMap = new Map<string, {
    sku: string;
    descripcion: string;
    proveedor?: string;
    totalContado: number;
    sesiones: Array<{
      sesionId: string;
      nombreSesion: string;
      ubicacion?: string;
      cantidad: number;
      timestamp: string;
    }>;
  }>();

  for (const [cleanSku, totalContado] of totalesPorSku) {
    const maestro = physDescripcion.get(cleanSku);
    physicalMap.set(cleanSku, {
      sku: cleanSku,
      descripcion: maestro?.descripcion || '',
      proveedor: maestro?.proveedor || '',
      totalContado,
      sesiones: physSesiones.get(cleanSku) || []
    });
  }

  // Resumen por ubicación derivado del conteo VIGENTE de cada SKU: la vuelta se
  // atribuye al mueble de su conteo original (el nombre "Auditoría 2da Vuelta" no
  // identifica un mueble), para que el acta no muestre un mueble fantasma.
  const ubicacionPorSesion = new Map<string, string>();
  for (const session of campaignSessions.filter(s => !s.esSegundaVuelta)) {
    ubicacionPorSesion.set(session.id, session.ubicacion?.trim() || session.nombre || 'Sin Ubicación');
  }

  const locationSummaryMap = new Map<string, { sesionesCount: number; skus: Set<string>; totalUnidades: number }>();
  const registrarUbicacion = (ubicacion: string, sku: string, cantidad: number) => {
    let locStats = locationSummaryMap.get(ubicacion);
    if (!locStats) {
      locStats = { sesionesCount: 0, skus: new Set<string>(), totalUnidades: 0 };
      locationSummaryMap.set(ubicacion, locStats);
    }
    locStats.skus.add(sku);
    locStats.totalUnidades += cantidad;
  };

  for (const [cleanSku, { totalContado, sesiones }] of physicalMap) {
    // Se atribuye al último conteo NORMAL que vio el SKU (la 2da vuelta no identifica
    // un mueble). Si sólo lo contó una vuelta, se usa su propia ubicación como último
    // recurso para no perder la fila del resumen.
    const normalVigente = [...sesiones].reverse().find(s => ubicacionPorSesion.has(s.sesionId));
    const loc = normalVigente
      ? ubicacionPorSesion.get(normalVigente.sesionId)!
      : (sesiones[sesiones.length - 1]?.ubicacion?.trim() || 'Sin Ubicación');
    registrarUbicacion(loc, cleanSku, totalContado);
  }

  // Sesiones distintas por ubicación (no contribuciones, que son por SKU). Las 2das
  // vueltas no son un mueble: sus unidades ya se atribuyeron al mueble del conteo que
  // corrigen, así que contarlas aquí crearía un mueble "Auditoría 2da Vuelta".
  for (const session of campaignSessions) {
    if (session.esSegundaVuelta) continue;
    const loc = ubicacionPorSesion.get(session.id)
      || session.ubicacion?.trim() || session.nombre || 'Sin Ubicación';
    const locStats = locationSummaryMap.get(loc);
    if (locStats) locStats.sesionesCount++;
  }

  // 3. Process all theoretical SKUs from current snapshot
  const theoreticalSnapshot = campaign.snapshotTeoricoActual || {};
  const theoreticalKeys = Object.keys(theoreticalSnapshot);

  const cuadrados: CampaignAuditRow[] = [];
  // Corte documental: el snapshot congela el stock en `fechaCorte`. Un conteo posterior
  // mide mercadería que pudo venderse o reponerse desde entonces, así que su diferencia
  // puede ser movimiento y no pérdida. Se marca para que el operario la cruce con los
  // movimientos de su turno antes de perseguirla.
  const fechaCorte = campaign.historialSnapshots?.[0]?.fechaCarga
    || (theoreticalKeys.length > 0 ? theoreticalSnapshot[theoreticalKeys[0]]?.fechaCarga : '')
    || null;

  const corteMs = fechaCorte ? Date.parse(fechaCorte) : NaN;
  const hayCorte = !Number.isNaN(corteMs);

  const skusConLecturaPosterior: string[] = [];
  const skusPendientesDeConteo: string[] = [];
  if (hayCorte) {
    for (const [sku, phys] of physicalMap) {
      if (phys.sesiones.some(s => {
        const t = Date.parse(s.timestamp);
        return !Number.isNaN(t) && t > corteMs;
      })) {
        skusConLecturaPosterior.push(sku);
      }
    }
    for (const sku of theoreticalKeys) {
      const stock = theoreticalSnapshot[sku]?.stockTeorico || 0;
      if (stock > 0 && !physicalMap.has(sku)) skusPendientesDeConteo.push(sku);
    }
  }
  const setSkusPosteriores = new Set(skusConLecturaPosterior);

  const discrepancias: CampaignAuditRow[] = [];
  const nuncaPistoleados: CampaignAuditRow[] = [];
  const hallazgos: CampaignAuditRow[] = [];

  const processedSkus = new Set<string>();
  let totalFisico = 0;
  let totalTeorico = 0;

  for (const sku of theoreticalKeys) {
    processedSkus.add(sku);
    const snapItem = theoreticalSnapshot[sku];
    const phys = physicalMap.get(sku);
    const closed = campaign.itemsValidadosCerrados?.[sku];
    const manualSalesAdj = campaign.ajustesVentaManual?.[sku] || 0;

    const stockTeorico = snapItem.stockTeorico || 0;
    const ventaReg = snapItem.venta || 0;
    const stockFisico = phys ? phys.totalContado : 0;
    const effectiveTeorico = stockTeorico - manualSalesAdj;
    const diferenciaNeta = stockFisico - effectiveTeorico;

    // El total espeja el de las filas: se acumula el teórico EFECTIVO (con el ajuste
    // de ventas del turno), no el del snapshot. Si no, el encabezado diría "faltan
    // 10" mientras todas las filas dicen "cuadrado".
    totalTeorico += effectiveTeorico;
    totalFisico += stockFisico;

    const sesiones = phys ? phys.sesiones : [];

    const row: CampaignAuditRow = {
      sku,
      descripcion: snapItem.descripcion || (phys ? phys.descripcion : ''),
      proveedor: snapItem.proveedor || (phys ? phys.proveedor : '') || '',
      local: snapItem.local || campaign.local || '',
      stockTeorico,
      stockFisicoTotal: stockFisico,
      ventaRegistrada: ventaReg,
      ajusteManualVenta: manualSalesAdj,
      stockTeoricoEfectivo: effectiveTeorico,
      diferenciaNeta,
      estadoGlobal: 'DISCREPANCIA',
      conteoPosteriorAlCorte: setSkusPosteriores.has(sku),
      esCerrado: Boolean(closed),
      fechaCierre: closed?.fechaValidacion,
      sesionesDondeAparece: sesiones
    };

    // Classification into the 4 buckets
    if (closed) {
      row.estadoGlobal = 'VALIDADO_OK';
      cuadrados.push(row);
    } else if (phys && phys.totalContado > 0) {
      if (diferenciaNeta === 0) {
        row.estadoGlobal = 'VALIDADO_OK';
        cuadrados.push(row);
      } else {
        row.estadoGlobal = 'DISCREPANCIA';
        discrepancias.push(row);
      }
    } else {
      // 0 physical readings across all sessions!
      // Even if theoretical stock in ERP is 0, this SKU has NEVER been pistoleado/audited
      // in any session. It must remain in NUNCA_PISTOLEADO until an operator audits it.
      row.estadoGlobal = 'NUNCA_PISTOLEADO';
      nuncaPistoleados.push(row);
    }
  }

  // 4. Process physical items that were NOT in theoretical snapshot (Hallazgos)
  for (const [sku, phys] of physicalMap.entries()) {
    if (processedSkus.has(sku)) continue;

    const manualSalesAdj = campaign.ajustesVentaManual?.[sku] || 0;
    const stockFisico = phys.totalContado;
    const diferenciaNeta = stockFisico - (0 - manualSalesAdj);
    const closed = campaign.itemsValidadosCerrados?.[sku];

    totalFisico += stockFisico;

    const row: CampaignAuditRow = {
      sku,
      descripcion: phys.descripcion || 'Producto Físico No Encontrado en ERP',
      proveedor: phys.proveedor || '',
      local: campaign.local || '',
      stockTeorico: 0,
      stockFisicoTotal: stockFisico,
      ventaRegistrada: 0,
      ajusteManualVenta: manualSalesAdj,
      stockTeoricoEfectivo: 0 - manualSalesAdj,
      diferenciaNeta,
      estadoGlobal: 'HALLAZGO',
      conteoPosteriorAlCorte: setSkusPosteriores.has(sku),
      esCerrado: Boolean(closed),
      fechaCierre: closed?.fechaValidacion,
      sesionesDondeAparece: phys.sesiones
    };

    if (closed) {
      row.estadoGlobal = 'VALIDADO_OK';
      cuadrados.push(row);
    } else {
      hallazgos.push(row);
    }
  }

  const totalTheorSkus = theoreticalKeys.length;
  const coveragePercent = totalTheorSkus > 0 
    ? Math.min(100, Math.round(((totalTheorSkus - nuncaPistoleados.length) / totalTheorSkus) * 100))
    : 0;

  const resumenUbicacion = Array.from(locationSummaryMap.entries()).map(([loc, data]) => ({
    ubicacion: loc,
    sesionesCount: data.sesionesCount,
    skusContados: data.skus.size,
    totalUnidades: data.totalUnidades
  }));

  return {
    campaignId: campaign.id,
    nombreCampana: campaign.nombre,
    fechaCalculo: now,
    corte: {
      fechaCorte: hayCorte ? fechaCorte : null,
      skusConLecturaPosterior: skusConLecturaPosterior.sort(),
      skusPendientesDeConteo: skusPendientesDeConteo.sort()
    },
    totalSkusTeoricos: totalTheorSkus,
    porcentajeCobertura: coveragePercent,
    cuadradosCount: cuadrados.length,
    discrepanciasCount: discrepancias.length,
    nuncaPistoleadosCount: nuncaPistoleados.length,
    hallazgosCount: hallazgos.length,
    totalFisicoContado: totalFisico,
    totalTeoricoEsperado: totalTeorico,
    diferenciaNetaTotal: totalFisico - totalTeorico,
    cuadrados,
    discrepancias,
    nuncaPistoleados,
    hallazgos,
    resumenPorUbicacion: resumenUbicacion
  };
}

/**
 * Marks a SKU as officially audited/closed in the campaign so it stays in Cuadrados
 */
export function markSkuAsClosedInCampaign(
  campaign: InventoryCampaign,
  sku: string,
  stockTeorico: number,
  stockFisico: number,
  nota?: string
): InventoryCampaign {
  const now = new Date().toISOString();
  return {
    ...campaign,
    fechaActualizacion: now,
    itemsValidadosCerrados: {
      ...campaign.itemsValidadosCerrados,
      [sku]: {
        sku,
        itemKey: sku,
        fechaValidacion: now,
        stockTeoricoValidado: stockTeorico,
        stockFisicoValidado: stockFisico,
        diferenciaValidada: stockFisico - stockTeorico,
        nota: nota || 'Validado manualmente por operario'
      }
    }
  };
}

/**
 * Re-opens a closed SKU back into the active discrepancy workflow
 */
export function reopenSkuInCampaign(
  campaign: InventoryCampaign,
  sku: string
): InventoryCampaign {
  const newClosed = { ...campaign.itemsValidadosCerrados };
  delete newClosed[sku];
  return {
    ...campaign,
    fechaActualizacion: new Date().toISOString(),
    itemsValidadosCerrados: newClosed
  };
}

/**
 * Adjusts manual sales offset for a SKU (e.g. 2 units sold at the register during count)
 */
export function setCampaignManualSalesAdjustment(
  campaign: InventoryCampaign,
  sku: string,
  unitsSold: number
): InventoryCampaign {
  return {
    ...campaign,
    fechaActualizacion: new Date().toISOString(),
    ajustesVentaManual: {
      ...campaign.ajustesVentaManual,
      [sku]: unitsSold
    }
  };
}

/**
 * Exports the complete Inventory Campaign Reconciliation Report to Excel (.xlsx)
 */
export async function exportCampaignReportToExcel(
  matrix: CampaignConsolidationMatrix,
  campaign: InventoryCampaign
): Promise<void> {
  const headers = [
    'ESTADO_AUDITORIA',
    'CODIGO_SKU',
    'DESCRIPCION',
    'PROVEEDOR',
    'LOCAL',
    'STOCK_TEORICO_ERP',
    'STOCK_FISICO_TOTAL',
    'VENTA_REGISTRADA_ERP',
    'AJUSTE_VENTA_TURNO',
    'TEORICO_EFECTIVO',
    'DIFERENCIA_NETA',
    'VALIDADO_CERRADO',
    'UBICACIONES_Y_SESIONES'
  ];

  const allRows: CampaignAuditRow[] = [
    ...matrix.discrepancias,
    ...matrix.nuncaPistoleados,
    ...matrix.cuadrados,
    ...matrix.hallazgos
  ];

  const rows = allRows.map(r => ({
    ESTADO_AUDITORIA: r.estadoGlobal,
    CODIGO_SKU: r.sku,
    DESCRIPCION: r.descripcion,
    PROVEEDOR: r.proveedor,
    LOCAL: r.local || campaign.local || '',
    STOCK_TEORICO_ERP: r.stockTeorico,
    STOCK_FISICO_TOTAL: r.stockFisicoTotal,
    VENTA_REGISTRADA_ERP: r.ventaRegistrada,
    AJUSTE_VENTA_TURNO: r.ajusteManualVenta,
    TEORICO_EFECTIVO: r.stockTeoricoEfectivo,
    DIFERENCIA_NETA: r.diferenciaNeta,
    VALIDADO_CERRADO: r.esCerrado ? 'SI' : 'NO',
    UBICACIONES_Y_SESIONES: r.sesionesDondeAparece.map(s => `${s.ubicacion || s.nombreSesion} (${s.cantidad} u.)`).join('; ')
  }));

  const safeName = campaign.nombre.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `Campaña_Inventario_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  await exportToExcel(filename, headers, rows, 'Matriz_Consolidada');
}

/**
 * Exports only the discrepant items (🟡) formatted for a physical 2nd round investigation / recount sheet
 */
export async function exportDiscrepanciesForRecountSheet(
  matrix: CampaignConsolidationMatrix,
  campaignName: string
): Promise<void> {
  const headers = [
    'CODIGO_SKU',
    'DESCRIPCION',
    'PROVEEDOR',
    'STOCK_TEORICO',
    '1ER_CONTEO_FISICO',
    'DIFERENCIA_1ER_PASADA',
    'UBICACIONES_PREVIAS',
    '2DO_CONTEO_FISICO_CONFIRMACION',
    'VENTA_EN_CAJA_VERIFICADA',
    'FIRMA_RESPONSABLE'
  ];

  const rows = matrix.discrepancias.map(r => ({
    CODIGO_SKU: r.sku,
    DESCRIPCION: r.descripcion,
    PROVEEDOR: r.proveedor,
    STOCK_TEORICO: r.stockTeorico,
    '1ER_CONTEO_FISICO': r.stockFisicoTotal,
    DIFERENCIA_1ER_PASADA: r.diferenciaNeta,
    UBICACIONES_PREVIAS: r.sesionesDondeAparece.map(s => s.ubicacion || s.nombreSesion).join(', ') || 'N/A',
    '2DO_CONTEO_FISICO_CONFIRMACION': '',
    'VENTA_EN_CAJA_VERIFICADA': '',
    'FIRMA_RESPONSABLE': ''
  }));

  const safeName = campaignName.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `Discrepancias_Para_Reconteo_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  await exportToExcel(filename, headers, rows, 'Reconteo_Discrepancias');
}

export { buildAuditRowsFromCampaignMatrix } from './auditConsolidation';
