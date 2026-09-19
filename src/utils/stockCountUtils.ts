import { 
  StockCountSession, 
  StockCountEntry, 
  StockCountReconciliationItem, 
  InventoryItem,
  InventoryCampaign,
  CampaignSnapshotRecord,
  CampaignConsolidationMatrix,
  CampaignAuditRow,
  CountManifest
} from '../types';
import { findColumnBySemantic } from './columnAliases';
import { parseLocaleNumber, getEndOfMonthDateForYm, formatDisplayDate } from './pureCalculations';
import { findMasterProduct, getMasterProductSummary } from './referenceResolver';
import { exportToExcel } from './exportUtils';

/**
 * Generates the composed natural unique key CU_VC: SKU + YYYY + MM
 * e.g. SKU: "2000210218569", YYYY: "2027", MM: "12" -> "2000210218569202712"
 */
export function generateCuVc(
  sku: string | number, 
  yyyy?: string | number, 
  mm?: string | number
): string {
  const cleanSku = String(sku || '').trim().replace(/\s+/g, '');
  if (!cleanSku) return '';
  if (!yyyy || !mm) return cleanSku;

  const cleanYyyy = String(yyyy).trim();
  const cleanMm = String(mm).trim().padStart(2, '0');

  if (/^\d{4}$/.test(cleanYyyy) && /^(0[1-9]|1[0-2])$/.test(cleanMm)) {
    return `${cleanSku}${cleanYyyy}${cleanMm}`;
  }

  return cleanSku;
}

/**
 * Calculates the exact last day of a given month and year in Latin date format DD/MM/YYYY
 * e.g. YYYY: 2027, MM: 12 -> "31/12/2027"
 * e.g. YYYY: 2028, MM: 02 -> "29/02/2028" (bisiesto)
 */
export function calculateLastDayOfMonthDateString(
  yyyy: string | number, 
  mm: string | number
): string {
  const y = parseInt(String(yyyy), 10);
  const m = parseInt(String(mm), 10);

  const dateObj = getEndOfMonthDateForYm(y, m);
  if (!dateObj) return '';

  return formatDisplayDate(dateObj);
}

/**
 * Generates a short 8-character unique alphanumeric ID for ID_VC
 */
export function generateShortVcId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const STOCK_COUNT_STORAGE_KEY = 'app_stock_count_sessions_v1';

let saveSessionsDebounceTimer: any = null;

/**
 * Loads saved count sessions from localStorage (IndexedDB fallback safe)
 */
export function loadStockCountSessionsFromStorage(): StockCountSession[] {
  try {
    const raw = localStorage.getItem(STOCK_COUNT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Error loading stock count sessions from storage:', e);
    return [];
  }
}

/**
 * Persists count sessions to storage immediately (synchronous)
 */
export function saveStockCountSessionsToStorage(sessions: StockCountSession[]): void {
  try {
    localStorage.setItem(STOCK_COUNT_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Error saving stock count sessions to storage:', e);
  }
}

/**
 * Non-blocking debounced persistence to prevent UI freeze during high-frequency barcode scanning
 */
export function saveStockCountSessionsToStorageDebounced(sessions: StockCountSession[], delayMs: number = 300): void {
  if (saveSessionsDebounceTimer) {
    clearTimeout(saveSessionsDebounceTimer);
  }
  saveSessionsDebounceTimer = setTimeout(() => {
    saveStockCountSessionsToStorage(sessions);
  }, delayMs);
}

/**
 * Reconciles physical count entries with the active theoretical inventory sheet
 */
export function reconcileStockCountSession(
  session: StockCountSession,
  sheetItems: InventoryItem[],
  headers: string[],
  masterProducts: any[] = []
): StockCountReconciliationItem[] {
  const qtyCol = findColumnBySemantic(headers, 'cantidad') || 'CANTIDAD';
  const skuCol = findColumnBySemantic(headers, 'sku') || 'SKU';
  const descCol = findColumnBySemantic(headers, 'descripcion') || 'PRODUCTO';
  const cuCol = findColumnBySemantic(headers, 'id') || headers.find(h => /^cu(_|\s)?vc$/i.test(h.trim())) || 'CU_VC';
  const mCol = findColumnBySemantic(headers, 'mes') || 'MM';
  const yCol = findColumnBySemantic(headers, 'anio') || 'YYYY';
  const fechaCol = findColumnBySemantic(headers, 'fecha_vc') || 'FECHA_VC';
  const rutCol = findColumnBySemantic(headers, 'proveedor') || 'RUT_PROVEEDOR_VC';
  const polCol = findColumnBySemantic(headers, 'politica') || 'POLITICA';
  const diasCol = findColumnBySemantic(headers, 'dias_retiro') || findColumnBySemantic(headers, 'dias_anticipacion') || 'DIAS RETIRO_VC';
  const mundoCol = findColumnBySemantic(headers, 'mundo') || findColumnBySemantic(headers, 'categoria') || 'MUNDO';
  const pmCol = findColumnBySemantic(headers, 'pm') || 'PM';

  // 1. Group physical counts by unique item key
  const physicalTotals = new Map<string, {
    sku: string;
    descripcion: string;
    cu_vc?: string;
    mm?: string;
    yyyy?: string;
    fecha_vc?: string;
    totalContado: number;
    rutProveedor?: string;
    politica?: string;
    diasRetiro?: number | string;
    mundo?: string;
    pm?: string;
  }>();

  for (const entry of session.conteos) {
    const key = session.requiereVencimiento && entry.cu_vc 
      ? entry.cu_vc 
      : String(entry.sku).trim();

    if (!key) continue;

    const existing = physicalTotals.get(key);
    if (existing) {
      existing.totalContado += entry.cantidad;
      if (!existing.descripcion && entry.descripcion) existing.descripcion = entry.descripcion;
      if (!existing.mm && entry.mm) existing.mm = entry.mm;
      if (!existing.yyyy && entry.yyyy) existing.yyyy = entry.yyyy;
      if (!existing.fecha_vc && entry.fecha_vc) existing.fecha_vc = entry.fecha_vc;
    } else {
      physicalTotals.set(key, {
        sku: entry.sku,
        descripcion: entry.descripcion,
        cu_vc: entry.cu_vc,
        mm: entry.mm,
        yyyy: entry.yyyy,
        fecha_vc: entry.fecha_vc,
        totalContado: entry.cantidad,
        rutProveedor: entry.rutProveedor,
        politica: entry.politica,
        diasRetiro: entry.diasRetiro,
        mundo: entry.mundo,
        pm: entry.pm
      });
    }
  }

  // 2. Map theoretical quantities from the active sheet
  const theoreticalMap = new Map<string, {
    item: InventoryItem;
    teorico: number;
    sku: string;
    descripcion: string;
    cu_vc?: string;
    mm?: string;
    yyyy?: string;
    fecha_vc?: string;
    rutProveedor?: string;
    politica?: string;
    diasRetiro?: number | string;
    mundo?: string;
    pm?: string;
  }>();

  // If blind count, we DON'T populate the theoreticalMap from the sheetItems, 
  // so teorico will remain 0 for all items.
  if (session.modo !== 'BLIND') {
    for (const item of sheetItems) {
      const rawSku = skuCol ? item[skuCol] : item.SKU_VC || item.SKU;
      const cleanSku = String(rawSku || '').trim();
      if (!cleanSku) continue;

      const rawCu = cuCol ? item[cuCol] : item.CU_VC;
      const cleanCu = rawCu ? String(rawCu).trim() : '';

      const rawQty = qtyCol ? item[qtyCol] : item.CANTIDAD || item.CANT;
      const qtyNum = parseLocaleNumber(rawQty, 0);

      const rawDesc = descCol ? item[descCol] : item.PRODUCTO_VC || item.DESCRIPCION || '';
      const rawM = mCol ? item[mCol] : item.MM;
      const rawY = yCol ? item[yCol] : item.YYYY;
      const rawFecha = fechaCol ? item[fechaCol] : item.FECHA_VC;

      const key = session.requiereVencimiento && cleanCu 
        ? cleanCu 
        : (session.requiereVencimiento && rawY && rawM 
            ? generateCuVc(cleanSku, rawY, rawM) 
            : cleanSku);

      const existingTheor = theoreticalMap.get(key);
      if (existingTheor) {
        existingTheor.teorico += qtyNum;
      } else {
        theoreticalMap.set(key, {
          item,
          teorico: qtyNum,
          sku: cleanSku,
          descripcion: String(rawDesc || ''),
          cu_vc: cleanCu || (rawY && rawM ? generateCuVc(cleanSku, rawY, rawM) : undefined),
          mm: rawM ? String(rawM).padStart(2, '0') : undefined,
          yyyy: rawY ? String(rawY) : undefined,
          fecha_vc: rawFecha ? String(rawFecha) : undefined,
          rutProveedor: rutCol ? item[rutCol] : item.RUT_PROVEEDOR_VC,
          politica: polCol ? item[polCol] : item.POLITICA,
          diasRetiro: diasCol ? item[diasCol] : item['DIAS RETIRO_VC'],
          mundo: mundoCol ? item[mundoCol] : item.MUNDO,
          pm: pmCol ? item[pmCol] : item.PM
        });
      }
    }

    // Freeze snapshot logic for stock-in-motion safety
    if (!session.snapshotTeorico) {
      session.snapshotTeorico = {};
      for (const [key, theor] of theoreticalMap.entries()) {
        session.snapshotTeorico[key] = theor.teorico;
      }
    } else {
      // Apply snapshot to current map
      for (const [key, theor] of theoreticalMap.entries()) {
        if (session.snapshotTeorico[key] !== undefined) {
          theor.teorico = session.snapshotTeorico[key];
        } else {
          theor.teorico = 0; // New items not in original snapshot
        }
      }
      // Recover snapshot keys not in sheetItems map anymore
      for (const key of Object.keys(session.snapshotTeorico)) {
        if (!theoreticalMap.has(key)) {
          const rawSku = key.length >= 13 ? key.slice(0, 13) : key;
          theoreticalMap.set(key, {
            item: { _rowIndex: -1 } as any,
            teorico: session.snapshotTeorico[key],
            sku: rawSku,
            descripcion: 'Producto en Snapshot (Eliminado de planilla)',
          } as any);
        }
      }
    }
  }

  const reconciliationResults: StockCountReconciliationItem[] = [];
  const processedKeys = new Set<string>();

  // A. Process all items that have theoretical presence in sheet
  for (const [key, theor] of theoreticalMap.entries()) {
    processedKeys.add(key);
    const physical = physicalTotals.get(key);
    const contado = physical ? physical.totalContado : 0;
    
    // Support adjustments for stock in motion
    const adjustment = session.ajustesMovimiento?.[key] || 0;
    const effectiveTeorico = theor.teorico + adjustment;
    const diferencia = contado - effectiveTeorico;

    let estado: StockCountReconciliationItem['estado'] = 'CUADRADO';
    if (contado === 0 && effectiveTeorico > 0) {
      estado = 'FALTANTE';
    } else if (diferencia < 0) {
      estado = 'FALTANTE';
    } else if (diferencia > 0) {
      estado = 'SOBRANTE';
    }

    // Dereference master product details if missing
    let finalDesc = theor.descripcion || (physical ? physical.descripcion : '');
    let finalRut = theor.rutProveedor || (physical ? physical.rutProveedor : '');
    let finalPol = theor.politica || (physical ? physical.politica : '');
    let finalDias = theor.diasRetiro || (physical ? physical.diasRetiro : '');
    let finalMundo = theor.mundo || (physical ? physical.mundo : '');
    let finalPm = theor.pm || (physical ? physical.pm : '');

    if (!finalDesc && masterProducts.length > 0) {
      const masterProd = findMasterProduct(theor.sku, masterProducts);
      if (masterProd) {
        const summary = getMasterProductSummary(masterProd);
        finalDesc = summary.name;
        finalRut = summary.provider;
        finalMundo = summary.category;
      }
    }

    const rawQtyFromSheet = theor.item && theor.item._rowIndex !== -1
      ? parseLocaleNumber(theor.item[qtyCol] || theor.item.CANTIDAD || theor.item.CANT, 0)
      : theor.teorico;

    reconciliationResults.push({
      itemKey: key,
      sku: theor.sku,
      descripcion: finalDesc,
      cu_vc: theor.cu_vc || (physical ? physical.cu_vc : undefined),
      mm: theor.mm || (physical ? physical.mm : undefined),
      yyyy: theor.yyyy || (physical ? physical.yyyy : undefined),
      fecha_vc: theor.fecha_vc || (physical ? physical.fecha_vc : undefined),
      teorico: theor.teorico,
      contado,
      diferencia,
      estado,
      rutProveedor: finalRut,
      politica: finalPol,
      diasRetiro: finalDias,
      mundo: finalMundo,
      pm: finalPm,
      rowIndexOriginal: theor.item._rowIndex === -1 ? undefined : theor.item._rowIndex,
      ajusteMovimiento: adjustment,
      teoricoOriginal: rawQtyFromSheet
    });
  }

  // B. Process items counted physically that were NOT in the theoretical sheet
  for (const [key, physical] of physicalTotals.entries()) {
    if (processedKeys.has(key)) continue;

    let finalDesc = physical.descripcion;
    let finalRut = physical.rutProveedor;
    let finalMundo = physical.mundo;
    let finalPol = physical.politica;
    let finalDias = physical.diasRetiro;
    let finalPm = physical.pm;

    if (!finalDesc && masterProducts.length > 0) {
      const masterProd = findMasterProduct(physical.sku, masterProducts);
      if (masterProd) {
        const summary = getMasterProductSummary(masterProd);
        finalDesc = summary.name;
        finalRut = summary.provider;
        finalMundo = summary.category;
      }
    }

    const adjustment = session.ajustesMovimiento?.[key] || 0;
    const effectiveTeorico = 0 + adjustment;
    const diferencia = physical.totalContado - effectiveTeorico;

    reconciliationResults.push({
      itemKey: key,
      sku: physical.sku,
      descripcion: finalDesc || 'Producto no catalogado en hoja',
      cu_vc: physical.cu_vc,
      mm: physical.mm,
      yyyy: physical.yyyy,
      fecha_vc: physical.fecha_vc,
      teorico: 0,
      contado: physical.totalContado,
      diferencia,
      estado: 'NO_CATALOGADO',
      rutProveedor: finalRut,
      politica: finalPol,
      diasRetiro: finalDias,
      mundo: finalMundo,
      pm: finalPm,
      ajusteMovimiento: adjustment,
      teoricoOriginal: 0
    });
  }

  return reconciliationResults;
}

/**
 * Formats a clean, structured 14-column record ready for the VENCIMIENTOS sheet
 * Matching the exact columns: ID_VC, SKU_VC, PRODUCTO_VC, MM, YYYY, FECHA_VC,
 * RUT_PROVEEDOR_VC, POLITICA, DIAS RETIRO_VC, MUNDO, PM, timestamp, CU_VC, TIPO_EVENTO
 */
export function buildVencimientosRowFromCount(
  item: StockCountEntry | StockCountReconciliationItem,
  existingRowIndex?: number,
  existingIdVc?: string
): Record<string, any> {
  const sku = String(item.sku || '').trim();
  const mm = item.mm ? String(item.mm).padStart(2, '0') : '';
  const yyyy = item.yyyy ? String(item.yyyy).trim() : '';
  const cu_vc = item.cu_vc || generateCuVc(sku, yyyy, mm);
  const fecha_vc = item.fecha_vc || (yyyy && mm ? calculateLastDayOfMonthDateString(yyyy, mm) : '');
  const id_vc = existingIdVc || generateShortVcId();

  return {
    ID_VC: id_vc,
    SKU_VC: sku,
    PRODUCTO_VC: item.descripcion || '',
    MM: mm,
    YYYY: yyyy,
    FECHA_VC: fecha_vc,
    RUT_PROVEEDOR_VC: item.rutProveedor || '',
    POLITICA: item.politica || '30',
    'DIAS RETIRO_VC': item.diasRetiro || '30',
    MUNDO: item.mundo || '',
    PM: item.pm || '',
    timestamp: new Date().toISOString(),
    CU_VC: cu_vc,
    TIPO_EVENTO: '',
    CANTIDAD: 'contado' in item ? item.contado : item.cantidad,
    _rowIndex: existingRowIndex !== undefined ? existingRowIndex : 0,
    _entityKey: cu_vc,
    _entityKeyCol: 'CU_VC'
  };
}

/**
 * Exports count reconciliation to Excel (.xlsx)
 */
export async function exportStockCountToExcel(
  session: StockCountSession,
  reconciliation: StockCountReconciliationItem[]
): Promise<void> {
  const headers = [
    'SKU',
    'DESCRIPCION',
    'CU_VC',
    'MM',
    'YYYY',
    'FECHA_VC',
    'STOCK_TEORICO',
    'STOCK_FISICO',
    'DIFERENCIA',
    'ESTADO_CUADRATURA',
    'PROVEEDOR',
    'POLITICA',
    'MUNDO',
    'PM'
  ];

  const rows = reconciliation.map(item => ({
    SKU: item.sku,
    DESCRIPCION: item.descripcion,
    CU_VC: item.cu_vc || '',
    MM: item.mm || '',
    YYYY: item.yyyy || '',
    FECHA_VC: item.fecha_vc || '',
    STOCK_TEORICO: item.teorico,
    STOCK_FISICO: item.contado,
    DIFERENCIA: item.diferencia,
    ESTADO_CUADRATURA: item.estado,
    PROVEEDOR: item.rutProveedor || '',
    POLITICA: item.politica || '',
    MUNDO: item.mundo || '',
    PM: item.pm || ''
  }));

  const safeName = session.nombre.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `Conteo_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  await exportToExcel(filename, headers, rows, 'Cuadratura_Conteo');
}

// ==========================================
// CAMPAÑA DE INVENTARIO CÍCLICO MULTISESIÓN
// ==========================================

const CAMPAIGNS_STORAGE_KEY = 'app_inventory_campaigns_v1';
const ACTIVE_CAMPAIGN_ID_KEY = 'app_active_campaign_id_v1';

/**
 * Loads all saved inventory campaigns from storage
 */
export function loadCampaignsFromStorage(): InventoryCampaign[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Error loading campaigns from storage:', e);
    return [];
  }
}

/**
 * Persists inventory campaigns to storage
 */
export function saveCampaignsToStorage(campaigns: InventoryCampaign[]): void {
  try {
    localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
  } catch (e) {
    console.warn('Error saving campaigns to storage:', e);
  }
}

/**
 * Gets the active campaign ID
 */
export function getActiveCampaignId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CAMPAIGN_ID_KEY);
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
      localStorage.setItem(ACTIVE_CAMPAIGN_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_CAMPAIGN_ID_KEY);
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
 * Supports the exact format: Local | Código SKU | Descripción | Proveedor | Stock | Inv. Inicial | Egreso | Ingreso | Venta | Stock Min | Stock Max | Stock Crítico | Precio de Lista
 */
export function importPharmacySnapshotToCampaign(
  campaign: InventoryCampaign,
  rows: Record<string, any>[],
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

  for (const row of rows) {
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

  // 2. Accumulate all physical counts across all sessions
  // Map: SKU -> { totalContado, sesiones: Array<{ sesionId, nombreSesion, ubicacion, cantidad, timestamp }> }
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

  // Location summary map
  const locationSummaryMap = new Map<string, { sesionesCount: number; skus: Set<string>; totalUnidades: number }>();

  for (const session of campaignSessions) {
    const loc = session.ubicacion?.trim() || session.nombre || 'Sin Ubicación';
    let locStats = locationSummaryMap.get(loc);
    if (!locStats) {
      locStats = { sesionesCount: 1, skus: new Set<string>(), totalUnidades: 0 };
      locationSummaryMap.set(loc, locStats);
    } else {
      locStats.sesionesCount++;
    }

    for (const entry of session.conteos) {
      const cleanSku = String(entry.sku || '').trim();
      if (!cleanSku) continue;

      locStats.skus.add(cleanSku);
      locStats.totalUnidades += entry.cantidad;

      let phys = physicalMap.get(cleanSku);
      if (!phys) {
        phys = {
          sku: cleanSku,
          descripcion: entry.descripcion || '',
          proveedor: entry.rutProveedor || '',
          totalContado: entry.cantidad,
          sesiones: [{
            sesionId: session.id,
            nombreSesion: session.nombre,
            ubicacion: session.ubicacion,
            cantidad: entry.cantidad,
            timestamp: entry.timestamp
          }]
        };
        physicalMap.set(cleanSku, phys);
      } else {
        phys.totalContado += entry.cantidad;
        if (!phys.descripcion && entry.descripcion) phys.descripcion = entry.descripcion;
        if (!phys.proveedor && entry.rutProveedor) phys.proveedor = entry.rutProveedor;
        phys.sesiones.push({
          sesionId: session.id,
          nombreSesion: session.nombre,
          ubicacion: session.ubicacion,
          cantidad: entry.cantidad,
          timestamp: entry.timestamp
        });
      }
    }
  }

  // 3. Process all theoretical SKUs from current snapshot
  const theoreticalSnapshot = campaign.snapshotTeoricoActual || {};
  const theoreticalKeys = Object.keys(theoreticalSnapshot);

  const cuadrados: CampaignAuditRow[] = [];
  const discrepancias: CampaignAuditRow[] = [];
  const nuncaPistoleados: CampaignAuditRow[] = [];
  const hallazgos: CampaignAuditRow[] = [];

  const processedSkus = new Set<string>();
  let totalFisico = 0;
  let totalTeorico = 0;
  let totalSkusAuditados = 0;

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

    totalTeorico += stockTeorico;
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
      esCerrado: Boolean(closed),
      fechaCierre: closed?.fechaValidacion,
      sesionesDondeAparece: sesiones
    };

    // Classification into the 4 buckets
    if (closed) {
      row.estadoGlobal = 'VALIDADO_OK';
      cuadrados.push(row);
      totalSkusAuditados++;
    } else if (phys && phys.totalContado > 0) {
      totalSkusAuditados++;
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
    totalSkusAuditados++;

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
    totalSkusTeoricos: totalTheorSkus,
    totalSkusFisicosAuditados: totalSkusAuditados,
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

/**
 * Builds formatted rows for the dedicated Google Sheets audit tab (_AUDITORIA_INVENTARIO).
 * This ensures audit and campaign counts NEVER touch or pollute the VENCIMIENTOS tab.
 */
export function buildAuditRowsFromCampaignMatrix(
  matrix: CampaignConsolidationMatrix,
  campaign: InventoryCampaign
): Record<string, any>[] {
  const allRows: CampaignAuditRow[] = [
    ...matrix.cuadrados,
    ...matrix.discrepancias,
    ...matrix.hallazgos,
    ...matrix.nuncaPistoleados
  ];

  const nowIso = new Date().toISOString();
  const dateStr = new Date().toLocaleDateString('es-CL');

  return allRows.map(r => {
    let estadoLabel: string = r.estadoGlobal;
    if (r.esCerrado) estadoLabel = 'VALIDADO_CERRADO';
    else if (r.estadoGlobal === 'VALIDADO_OK') estadoLabel = 'CUADRADO_OK';
    else if (r.estadoGlobal === 'DISCREPANCIA') estadoLabel = r.diferenciaNeta < 0 ? 'FALTANTE' : 'SOBRANTE';
    else if (r.estadoGlobal === 'NUNCA_PISTOLEADO') estadoLabel = 'NUNCA_PISTOLEADO';
    else if (r.estadoGlobal === 'HALLAZGO') estadoLabel = 'HALLAZGO_NO_ERP';

    const ubicacionesStr = r.sesionesDondeAparece && r.sesionesDondeAparece.length > 0
      ? r.sesionesDondeAparece.map(s => `${s.ubicacion || s.nombreSesion} (${s.cantidad} u.)`).join('; ')
      : (r.stockFisicoTotal === 0 ? 'Sin lecturas' : 'General');

    return {
      ID_CAMPANA: campaign.id,
      FECHA_AUDITORIA: dateStr,
      LOCAL: campaign.local || r.local || '',
      SKU: r.sku,
      DESCRIPCION: r.descripcion,
      PROVEEDOR: r.proveedor || '',
      STOCK_ERP: r.stockTeorico,
      STOCK_FISICO: r.stockFisicoTotal,
      DIFERENCIA: r.diferenciaNeta,
      VENTA_AJUSTE: r.ajusteManualVenta || 0,
      ESTADO_AUDITORIA: estadoLabel,
      UBICACIONES_MUEBLES: ubicacionesStr,
      USUARIO_TERMINAL: 'Terminal Web',
      ULTIMA_ACTUALIZACION: nowIso
    };
  });
}

/**
 * Builds formatted rows from a single stock count session for the dedicated audit tab (_AUDITORIA_INVENTARIO)
 */
export function buildAuditRowsFromSession(
  session: StockCountSession,
  reconciliation: StockCountReconciliationItem[],
  campaign?: InventoryCampaign | null
): Record<string, any>[] {
  const nowIso = new Date().toISOString();
  const dateStr = new Date().toLocaleDateString('es-CL');

  return reconciliation.map(item => {
    return {
      ID_CAMPANA: campaign ? campaign.id : `ses_${session.id}`,
      FECHA_AUDITORIA: dateStr,
      LOCAL: campaign?.local || session.ubicacion || '',
      SKU: item.sku,
      DESCRIPCION: item.descripcion,
      PROVEEDOR: item.rutProveedor || '',
      STOCK_ERP: item.teorico,
      STOCK_FISICO: item.contado,
      DIFERENCIA: item.diferencia,
      VENTA_AJUSTE: item.ajusteMovimiento || 0,
      ESTADO_AUDITORIA: item.estado,
      UBICACIONES_MUEBLES: session.ubicacion || session.nombre,
      USUARIO_TERMINAL: 'Operario',
      ULTIMA_ACTUALIZACION: nowIso
    };
  });
}

// AudioContext singleton to avoid repeated instantiation and memory leaks on mobile/PDA devices
let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedAudioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        sharedAudioContext = new AudioContextClass();
      }
    }
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch (e) {
    return null;
  }
}

/**
 * Synthesizes dynamic, clean beep tones using the browser's Web Audio API (Zero dependencies).
 * Reuses a single AudioContext instance and triggers instant haptic feedback on mobile PDAs.
 */
export function playBeep(type: 'success' | 'error' | 'skip'): void {
  // 1. Instant haptic feedback for mobile / PDA terminals
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'success') {
        navigator.vibrate(35);
      } else if (type === 'error') {
        navigator.vibrate([60, 50, 60]);
      } else if (type === 'skip') {
        navigator.vibrate(20);
      }
    } catch {}
  }

  // 2. High performance Web Audio tone
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    
    if (type === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime); // Crisp, positive high beep
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } else if (type === 'skip') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime); // Soft neutral beep
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'error') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth'; // Buzzer sound
      osc.frequency.setValueAtTime(150, ctx.currentTime); // Low pitch error buzz
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    console.warn('AudioContext failed to execute:', e);
  }
}

/**
 * Retorna o crea un identificador persistente y amigable de este dispositivo / terminal
 * e.g. "Móvil-A41B" o "Terminal-F92C"
 */
export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem('app_device_id');
    if (!id) {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const prefix = isMobile ? 'Móvil' : 'Terminal';
      const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
      id = `${prefix}-${randomHex}`;
      localStorage.setItem('app_device_id', id);
    }
    return id;
  } catch {
    return 'Terminal-Local';
  }
}

/**
 * Genera un manifiesto oficial de entrega a partir de una sesión de conteo por mueble
 */
export function generateCountManifest(
  session: StockCountSession,
  campaign?: InventoryCampaign | null
): CountManifest {
  const deviceId = session.deviceId || getOrCreateDeviceId();
  const manifestId = session.manifestId || `MAN-${session.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
  
  const skuMap = new Map<string, { sku: string; descripcion: string; cantidad: number }>();
  for (const c of session.conteos) {
    const existing = skuMap.get(c.sku);
    if (existing) {
      existing.cantidad += c.cantidad;
    } else {
      skuMap.set(c.sku, {
        sku: c.sku,
        descripcion: c.descripcion || '',
        cantidad: c.cantidad
      });
    }
  }

  const totalUnidades = session.conteos.reduce((sum, c) => sum + c.cantidad, 0);

  return {
    manifestId,
    campaignId: campaign?.id,
    campaignName: campaign?.nombre,
    sessionId: session.id,
    sessionName: session.nombre,
    ubicacion: session.ubicacion,
    deviceId,
    auditor: session.auditor,
    totalSkus: skuMap.size,
    totalUnidades,
    fechaInicio: session.fechaInicio,
    fechaCierre: session.fechaCierre,
    estado: session.estado === 'COMPLETED' ? 'FINALIZADO_ENVIADO' : 'EN_CONTEO',
    resumenSkus: Array.from(skuMap.values())
  };
}

/**
 * Motor de Fusión y Consolidación Multi-dispositivo (Merge Engine)
 * Fusiona sin pérdida de datos las campañas y sesiones de conteo locales con las remotas de Google Sheets
 */
export function mergeCampaignsAndSessions(
  localData: { campaigns: InventoryCampaign[]; sessions: StockCountSession[]; activeCampaignId?: string | null },
  remoteData: { campaigns?: InventoryCampaign[]; sessions?: StockCountSession[]; activeCampaignId?: string | null } | null
): {
  mergedCampaigns: InventoryCampaign[];
  mergedSessions: StockCountSession[];
  activeCampaignId: string | null;
  newRemoteSessionsCount: number;
} {
  const localSessions = localData.sessions || [];
  const remoteSessions = (remoteData && Array.isArray(remoteData.sessions)) ? remoteData.sessions : [];
  
  // 1. Mapa de sesiones unificadas por ID
  const sessionMap = new Map<string, StockCountSession>();
  
  // Registrar sesiones remotas primero
  for (const rSess of remoteSessions) {
    if (rSess && rSess.id) {
      sessionMap.set(rSess.id, { ...rSess, sincronizadoNube: true });
    }
  }

  let newRemoteSessionsCount = 0;
  const localSessionIds = new Set(localSessions.map(s => s.id));
  for (const rSess of remoteSessions) {
    if (rSess && rSess.id && !localSessionIds.has(rSess.id)) {
      newRemoteSessionsCount++;
    }
  }

  // Fusionar sesiones locales
  for (const lSess of localSessions) {
    if (!lSess || !lSess.id) continue;
    const remote = sessionMap.get(lSess.id);
    if (!remote) {
      // Sesión creada localmente que aún no existe en la nube
      sessionMap.set(lSess.id, lSess);
    } else {
      // Existe en ambos: fusionar conteos de forma idempotente
      const entryIdSet = new Set<string>();
      const combinedConteos: StockCountEntry[] = [];
      
      const addEntry = (entry: StockCountEntry) => {
        const uniqueKey = entry.id || `${entry.sku}_${entry.timestamp}_${entry.cantidad}_${entry.cu_vc || ''}`;
        if (!entryIdSet.has(uniqueKey)) {
          entryIdSet.add(uniqueKey);
          combinedConteos.push(entry);
        }
      };

      (remote.conteos || []).forEach(addEntry);
      (lSess.conteos || []).forEach(addEntry);

      const estado = (lSess.estado === 'COMPLETED' || remote.estado === 'COMPLETED') ? 'COMPLETED' : 'IN_PROGRESS';
      
      sessionMap.set(lSess.id, {
        ...remote,
        ...lSess,
        estado,
        conteos: combinedConteos,
        lastUpdated: new Date().toISOString(),
        deviceId: lSess.deviceId || remote.deviceId || getOrCreateDeviceId(),
        sincronizadoNube: true
      });
    }
  }

  const mergedSessions = Array.from(sessionMap.values()).sort((a, b) => 
    new Date(b.fechaInicio || 0).getTime() - new Date(a.fechaInicio || 0).getTime()
  );

  // 2. Fusionar Campañas
  const localCampaigns = localData.campaigns || [];
  const remoteCampaigns = (remoteData && Array.isArray(remoteData.campaigns)) ? remoteData.campaigns : [];
  const campaignMap = new Map<string, InventoryCampaign>();

  for (const rCamp of remoteCampaigns) {
    if (rCamp && rCamp.id) {
      campaignMap.set(rCamp.id, rCamp);
    }
  }

  for (const lCamp of localCampaigns) {
    if (!lCamp || !lCamp.id) continue;
    const remote = campaignMap.get(lCamp.id);
    if (!remote) {
      campaignMap.set(lCamp.id, lCamp);
    } else {
      // Unión de sessionIds
      const allSessionIds = Array.from(new Set([...(remote.sessionIds || []), ...(lCamp.sessionIds || [])]));
      
      // Auto-vincular todas las sesiones existentes para asegurar consolidación total
      mergedSessions.forEach(s => {
        if (!allSessionIds.includes(s.id)) {
          allSessionIds.push(s.id);
        }
      });

      // Unión de validaciones cerradas
      const itemsValidadosCerrados = {
        ...(remote.itemsValidadosCerrados || {}),
        ...(lCamp.itemsValidadosCerrados || {})
      };

      // Unión de ajustes de venta
      const ajustesVentaManual = {
        ...(remote.ajustesVentaManual || {}),
        ...(lCamp.ajustesVentaManual || {})
      };

      // Snapshot con más datos
      const remoteSnapCount = Object.keys(remote.snapshotTeoricoActual || {}).length;
      const localSnapCount = Object.keys(lCamp.snapshotTeoricoActual || {}).length;
      const snapshotTeoricoActual = localSnapCount >= remoteSnapCount ? lCamp.snapshotTeoricoActual : remote.snapshotTeoricoActual;

      // Preservar historial de snapshots (Foto ERP) del que tenga datos reales
      const historialSnapshots = (remote.historialSnapshots && remote.historialSnapshots.length >= (lCamp.historialSnapshots?.length || 0))
        ? remote.historialSnapshots
        : (lCamp.historialSnapshots || []);

      // Preservar nombre y local si el local era el genérico por defecto
      const nombre = (remote.nombre && remote.nombre !== 'Inventario General Farmacia')
        ? remote.nombre
        : (lCamp.nombre || remote.nombre || 'Inventario General Farmacia');

      const local = remote.local || lCamp.local;

      campaignMap.set(lCamp.id, {
        ...remote,
        ...lCamp,
        nombre,
        local,
        sessionIds: allSessionIds,
        itemsValidadosCerrados,
        ajustesVentaManual,
        snapshotTeoricoActual,
        historialSnapshots,
        fechaActualizacion: new Date().toISOString()
      });
    }
  }

  // Si no hay campañas pero hay sesiones, crear una campaña contenedor por defecto
  let mergedCampaigns = Array.from(campaignMap.values());

  // Limpiar campañas placeholders vacías si ya existen campañas reales con snapshots o sesiones
  const hasRealCampaigns = mergedCampaigns.some(c => !c.id.startsWith('camp_auto_') || Object.keys(c.snapshotTeoricoActual || {}).length > 0);
  if (hasRealCampaigns) {
    mergedCampaigns = mergedCampaigns.filter(c => 
      !c.id.startsWith('camp_auto_') || 
      Object.keys(c.snapshotTeoricoActual || {}).length > 0 || 
      (c.sessionIds && c.sessionIds.length > 0)
    );
  }

  if (mergedCampaigns.length === 0 && mergedSessions.length > 0) {
    const defaultCamp: InventoryCampaign = {
      id: `camp_auto_${Date.now()}`,
      nombre: 'Inventario General Farmacia',
      local: 'LOCAL PRINCIPAL',
      fechaInicio: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
      estado: 'ACTIVA',
      snapshotTeoricoActual: {},
      historialSnapshots: [],
      sessionIds: mergedSessions.map(s => s.id),
      itemsValidadosCerrados: {},
      ajustesVentaManual: {}
    };
    mergedCampaigns = [defaultCamp];
  }

  // Selección inteligente de la campaña activa para sincronización multidispositivo:
  // Si la oficina cargó una foto ERP en la nube, el dispositivo móvil debe adoptar automáticamente
  // la campaña con el snapshot teórico en lugar de quedarse anclado a una campaña local vacía.
  const campWithSnapshots = mergedCampaigns.find(c => Object.keys(c.snapshotTeoricoActual || {}).length > 0);
  
  let activeCampaignId = localData.activeCampaignId || remoteData?.activeCampaignId || (mergedCampaigns[0]?.id || null);
  const currentActive = mergedCampaigns.find(c => c.id === activeCampaignId);
  const currentHasData = currentActive && Object.keys(currentActive.snapshotTeoricoActual || {}).length > 0;

  if (!currentHasData && campWithSnapshots) {
    activeCampaignId = campWithSnapshots.id;
  } else if (remoteData?.activeCampaignId && !currentHasData) {
    activeCampaignId = remoteData.activeCampaignId;
  }

  return {
    mergedCampaigns,
    mergedSessions,
    activeCampaignId,
    newRemoteSessionsCount
  };
}

