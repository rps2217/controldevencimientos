import { 
  StockCountSession, 
  StockCountEntry, 
  StockCountReconciliationItem, 
  InventoryItem,
  InventoryCampaign,
  SheetRecord
} from '../types';
import { findColumnBySemantic } from './columnAliases';
import { parseLocaleNumber, getEndOfMonthDateForYm, formatDisplayDate } from './pureCalculations';
import { findMasterProduct, getMasterProductSummary } from './referenceResolver';
import { exportToExcel } from './exportUtils';
import { STORAGE_KEYS, readStorage, objectArraySchema } from './appStorage';

// El ciclo de campañas (snapshot ERP, matriz de cuadratura, reportes y su
// persistencia) vive en `campaignUtils.ts`. Este módulo cubre las sesiones de
// conteo y la reconciliación de una sesión contra la hoja activa.

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


let saveSessionsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSessionsToSave: StockCountSession[] | null = null;

/**
 * Loads saved count sessions from localStorage (IndexedDB fallback safe)
 */
export function loadStockCountSessionsFromStorage(): StockCountSession[] {
  return readStorage<StockCountSession[]>(
    STORAGE_KEYS.STOCK_COUNT_SESSIONS,
    objectArraySchema,
    []
  );
}

/**
 * Persists count sessions to storage immediately (synchronous)
 */
export function saveStockCountSessionsToStorage(sessions: StockCountSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.STOCK_COUNT_SESSIONS, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Error saving stock count sessions to storage:', e);
  }
}

/**
 * Non-blocking debounced persistence to prevent UI freeze during high-frequency barcode scanning
 */
export function saveStockCountSessionsToStorageDebounced(sessions: StockCountSession[], delayMs: number = 300): void {
  pendingSessionsToSave = sessions;
  if (saveSessionsDebounceTimer) {
    clearTimeout(saveSessionsDebounceTimer);
  }
  saveSessionsDebounceTimer = setTimeout(() => {
    saveStockCountSessionsToStorage(sessions);
    pendingSessionsToSave = null;
    saveSessionsDebounceTimer = null;
  }, delayMs);
}

/**
 * Flushes any pending debounced write immediately. Call when the page may be
 * discarded (tab hidden / closed, PDA app switched away) so the last reading is
 * never lost to an un-fired timer.
 */
export function flushStockCountSessionsToStorage(): void {
  if (saveSessionsDebounceTimer) {
    clearTimeout(saveSessionsDebounceTimer);
    saveSessionsDebounceTimer = null;
  }
  if (pendingSessionsToSave) {
    saveStockCountSessionsToStorage(pendingSessionsToSave);
    pendingSessionsToSave = null;
  }
}

/**
 * Reconciles physical count entries with the active theoretical inventory sheet
 */
export function reconcileStockCountSession(
  session: StockCountSession,
  sheetItems: InventoryItem[],
  headers: string[],
  masterProducts: SheetRecord[] = []
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
            item: { _rowIndex: -1 },
            teorico: session.snapshotTeorico[key],
            sku: rawSku,
            descripcion: 'Producto en Snapshot (Eliminado de planilla)',
          });
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
    const finalPol = theor.politica || (physical ? physical.politica : '');
    const finalDias = theor.diasRetiro || (physical ? physical.diasRetiro : '');
    let finalMundo = theor.mundo || (physical ? physical.mundo : '');
    const finalPm = theor.pm || (physical ? physical.pm : '');

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
    const finalPol = physical.politica;
    const finalDias = physical.diasRetiro;
    const finalPm = physical.pm;

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
): SheetRecord {
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


/**
 * Builds formatted rows from a single stock count session for the dedicated audit tab (_AUDITORIA_INVENTARIO)
 */
export function buildAuditRowsFromSession(
  session: StockCountSession,
  reconciliation: StockCountReconciliationItem[],
  campaign?: InventoryCampaign | null
): SheetRecord[] {
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
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!id) {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const prefix = isMobile ? 'Móvil' : 'Terminal';
      const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
      id = `${prefix}-${randomHex}`;
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
    }
    return id;
  } catch {
    return 'Terminal-Local';
  }
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

