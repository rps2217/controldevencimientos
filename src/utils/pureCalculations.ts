import { InventoryItem, EventCategory, EventResolutionStatus } from '../types';
import { findColumnBySemantic } from './columnAliases';

/**
 * Match a raw string from FRC_EVEN (e.g. 'VENC. CERC.', 'DET. PED', 'CAL. INTER', 'CANJES', 'DIF. PED')
 * into its corresponding EventCategory
 */
export function getCategoryFromEventValue(rawVal: any): EventCategory | null {
  if (rawVal === null || rawVal === undefined) return null;
  const raw = String(rawVal).trim().toUpperCase();
  if (!raw || raw === '-') return null;

  if (raw === 'VENC. CERC.' || raw === 'VENC. CERC' || raw.includes('VENC. CERC') || raw.includes('VENC.CERC') || raw.includes('CERCAN')) {
    return 'VENCIMIENTO_CERCANO';
  }
  if (raw === 'DET. PED' || raw === 'DET. PED.' || raw.includes('DET. PED') || raw.includes('DET.PED') || raw.includes('TRANSP') || raw.includes('DETERIORO')) {
    return 'TRANSPORTE';
  }
  if (raw === 'CAL. INTER' || raw === 'CAL. INTER.' || raw.includes('CAL. INTER') || raw.includes('CAL. INT') || raw.includes('CALIDAD INT') || raw.includes('INTERNA')) {
    return 'CAL_INTERNA';
  }
  if (raw === 'CAL. EXT.' || raw === 'CAL. EXT' || raw.includes('CAL. EXT') || raw.includes('CALIDAD EXT') || raw.includes('EXTERNA')) {
    return 'CAL_EXTERNA';
  }
  if (raw === 'CANJES' || raw.includes('CANJE')) {
    return 'CANJES';
  }
  if (raw === 'DIF. PED' || raw === 'DIF. PED.' || raw.includes('DIF. PED') || raw.includes('DIF.PED') || raw.includes('DIFER')) {
    return 'DIFERENCIA';
  }
  if (raw.includes('AVER') || raw.includes('MERMA') || raw.includes('ROTURA')) {
    return 'AVERIA';
  }
  if (raw.includes('DEVOL') || raw.includes('RECLAM')) {
    return 'DEVOLUCION';
  }
  if (raw.includes('VENC') || raw.includes('CADUC')) {
    return 'VENCIMIENTO';
  }
  return null;
}

/**
 * Universal Date Parser supporting:
 * - Google Sheets / Excel serial numbers (e.g. 45321)
 * - ISO format: YYYY-MM-DD, YYYY/MM/DD, YYYY-MM-DDTHH:mm:ss
 * - Latin format: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * - Compact numeric: YYYYMMDD
 * - Month/Year: MM/YYYY, MM-YYYY, YYYY-MM (evaluates to last day of the month)
 * - Native Date objects or timestamps
 */
export function parseAnyDate(dateVal: any): Date | null {
  if (dateVal === null || dateVal === undefined) return null;
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return null;
    const clean = new Date(dateVal.getTime());
    clean.setHours(0, 0, 0, 0);
    return clean;
  }
  
  // 1. Google Sheets / Excel Serial Date number check (e.g. 45321)
  if (typeof dateVal === 'number' && !isNaN(dateVal) && dateVal > 20000 && dateVal < 70000) {
    // 25569 = Days between 1899-12-30 and 1970-01-01 (Unix epoch)
    const ms = Math.round((dateVal - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }

  const str = String(dateVal).trim();
  if (!str || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') return null;

  // Numeric string check for Excel serial
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (num > 20000 && num < 70000) {
      const ms = Math.round((num - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
  }

  // 2. ISO format: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD (with optional time)
  const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && day >= 1 && day <= 31) {
      const d = new Date(y, m - 1, day, 0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 3. Latin format: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && day >= 1 && day <= 31) {
      const d = new Date(y, m - 1, day, 0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 4. Compact numeric date format YYYYMMDD
  const ymdCompact = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymdCompact) {
    const y = Number(ymdCompact[1]);
    const m = Number(ymdCompact[2]);
    const day = Number(ymdCompact[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && day >= 1 && day <= 31) {
      const d = new Date(y, m - 1, day, 0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 5. Month/Year format: MM/YYYY or MM-YYYY (evaluates to last day of that month)
  const my = str.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (my) {
    const m = Number(my[1]);
    const y = Number(my[2]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12) {
      const lastDay = new Date(y, m, 0, 0, 0, 0, 0);
      if (!isNaN(lastDay.getTime())) return lastDay;
    }
  }

  // 6. Year/Month format: YYYY-MM or YYYY/MM (evaluates to last day of that month)
  const ym = str.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (ym) {
    const y = Number(ym[1]);
    const m = Number(ym[2]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12) {
      const lastDay = new Date(y, m, 0, 0, 0, 0, 0);
      if (!isNaN(lastDay.getTime())) return lastDay;
    }
  }

  return null;
}

/**
 * Format a Date for standard HTML `<input type="date">` (YYYY-MM-DD)
 */
export function formatInputDate(dateVal: any): string {
  const d = parseAnyDate(dateVal);
  if (!d) return '';
  const yyyy = d.getFullYear();
  if (yyyy < 1900 || yyyy > 2100) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format a Date or Timestamp for HTML `<input type="datetime-local">` (YYYY-MM-DDTHH:mm)
 */
export function formatInputDateTime(dateVal: any): string {
  if (!dateVal) return '';
  let d: Date | null = null;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    const str = String(dateVal).trim();
    if (!str || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') return '';
    const native = new Date(str);
    if (!isNaN(native.getTime())) {
      d = native;
    } else {
      d = parseAnyDate(str);
    }
  }
  if (!d || isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  if (yyyy < 1900 || yyyy > 2100) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Format a Date for elegant table display (DD/MM/YYYY)
 */
export function formatDisplayDate(dateVal: any, fallback = '-'): string {
  const d = parseAnyDate(dateVal);
  if (!d) return String(dateVal || fallback);
  const yyyy = d.getFullYear();
  if (yyyy < 1900 || yyyy > 2100) return String(dateVal || fallback);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Robust number parsing supporting currency symbols, thousand commas/periods, and spaces
 */
export function parseLocaleNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;

  let str = String(val).trim();
  if (!str) return fallback;

  // Detect negative format (e.g., -100, -$100, (100))
  let isNegative = false;
  if (str.startsWith('-') || (str.startsWith('(') && str.endsWith(')'))) {
    isNegative = true;
    str = str.replace(/^[\(-]+|[\)]+$/g, '').trim();
  }

  // Strip out currencies, prefixes, and common unit suffixes
  str = str.replace(/(S\/\.|\$|€|£|CLP|USD|UF|PEN|R\$|\bUN\b|\bUD\b|\bKG\b|%)/gi, '').trim();
  if (!str) return fallback;

  // Remove interior spaces (e.g., 1 250,50 -> 1250,50)
  str = str.replace(/\s+/g, '');

  // Handle European/Latin style with thousands periods and comma decimal: 1.250,50 -> 1250.50
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+(,\d+)$/.test(str)) {
    // Single comma decimal: 1250,50 -> 1250.50
    str = str.replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
    // US style with thousands commas and dot decimal: 1,250.50 -> 1250.50
    str = str.replace(/,/g, '');
  }

  let num = parseFloat(str);
  if (isNaN(num)) return fallback;
  if (isNegative && num > 0) num = -num;
  return num;
}

/**
 * Format number with thousand separators
 */
export function formatLocaleNumber(numVal: any, decimals = 0): string {
  const n = typeof numVal === 'number' ? numVal : parseLocaleNumber(numVal);
  return n.toLocaleString('es-ES', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
}

// Helper to determine the event category of any item using smart column detection
export interface CalculationColumnsContext {
  eventHeader: string | null;
  vcCol: string | null;
  retCol: string | null;
  yCol: string | null;
  mCol: string | null;
  idCol: string | null;
  polCol: string | null;
  traspasoCol: string | null;
}

export function createColumnsContext(headers: string[]): CalculationColumnsContext {
  return {
    eventHeader: findColumnBySemantic(headers, 'tipo_evento') || headers.find(h => /^frc(_|\s)?even/i.test(h.trim())) || null,
    vcCol: findColumnBySemantic(headers, 'fecha_vc') || null,
    retCol: findColumnBySemantic(headers, 'fecha_retiro') || null,
    yCol: findColumnBySemantic(headers, 'anio') || 'E',
    mCol: findColumnBySemantic(headers, 'mes') || 'D',
    idCol: findColumnBySemantic(headers, 'id') || null,
    polCol: findColumnBySemantic(headers, 'politica') || null,
    traspasoCol: findColumnBySemantic(headers, 'n_traspaso') 
      || headers.find(h => /^n(_|\s)?traspaso/i.test(h.trim()))
      || headers.find(h => /traspaso/i.test(h.trim())) 
      || null
  };
}

export function getEventCategory(item: InventoryItem, headers: string[], colContext?: CalculationColumnsContext): EventCategory {
  const eventHeader = colContext ? colContext.eventHeader : (findColumnBySemantic(headers, 'tipo_evento') || headers.find(h => /^frc(_|\s)?even/i.test(h.trim())));
  if (eventHeader && item[eventHeader]) {
    const parsed = getCategoryFromEventValue(item[eventHeader]);
    if (parsed) return parsed;
  }
  
  // Check if item has FECHA_VC or MM/YYYY
  const vcCol = colContext ? colContext.vcCol : findColumnBySemantic(headers, 'fecha_vc');
  if (vcCol && item[vcCol]) return 'VENCIMIENTO';

  return 'VENCIMIENTO';
}

export function getEndOfMonthDateForYm(y: number, m: number): Date | null {
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12 || y < 1900 || y > 2100) {
    return null;
  }
  return new Date(y, m, 0);
}

export function getEndOfMonthDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
}

export function getExpiryDateFromYm(item: InventoryItem, headers: string[], colContext?: CalculationColumnsContext): Date | null {
  const yCol = (colContext ? colContext.yCol : findColumnBySemantic(headers, 'anio')) || 'E';
  const mCol = (colContext ? colContext.mCol : findColumnBySemantic(headers, 'mes')) || 'D';
  
  const year = item[yCol];
  const month = item[mCol];
  
  if (year !== undefined && year !== null && month !== undefined && month !== null) {
    const y = parseInt(String(year));
    const m = parseInt(String(month));
    const d = getEndOfMonthDateForYm(y, m);
    if (d) return d;
  }

  // Check if item has CU_VC (e.g., 2000210218569202712 -> ends with YYYYMM: 2027 + 12)
  const idCol = colContext ? colContext.idCol : findColumnBySemantic(headers, 'id');
  const cuVal = idCol && item[idCol] ? String(item[idCol]).trim() : '';
  if (cuVal && cuVal.length >= 6) {
    const match = cuVal.match(/(\d{4})(0[1-9]|1[0-2])$/);
    if (match) {
      const y = parseInt(match[1]);
      const m = parseInt(match[2]);
      const d = getEndOfMonthDateForYm(y, m);
      if (d) return d;
    }
  }
  
  return null; 
}

export type ItemStatusCode = 'EXPIRED' | 'RETIRE_NOW' | 'UPCOMING' | 'DRAINAGE_PM' | 'NORMAL';
export type ItemActionType = 'CANJE_PROVEEDOR' | 'MERMA_DIRECTA' | 'VENTA_DRENAJE' | 'SIN_ACCION';

/**
 * Intelligent Action Detector according to Product Policy (Canje Proveedor vs. Merma Directa vs. Drenaje)
 */
export function detectPolicyActionType(
  item: InventoryItem, 
  headers: string[], 
  statusCode: ItemStatusCode,
  colContext?: CalculationColumnsContext
): ItemActionType {
  if (statusCode === 'NORMAL') return 'SIN_ACCION';
  if (statusCode === 'DRAINAGE_PM') return 'VENTA_DRENAJE';

  // Find the exact policy column from headers
  const polCol = colContext ? colContext.polCol : findColumnBySemantic(headers, 'politica');
  let polStr = polCol && item[polCol] !== undefined && item[polCol] !== null ? String(item[polCol]).trim() : '';

  if (!polStr) {
    // Check known item fields without confusing with category/family
    polStr = String(item.POLITICA || item.politica || item.POLITICA_CANJE || item.TIPO_POLITICA || item.REGLA_CANJE || '').trim();
  }

  const normalized = polStr.toLowerCase();

  // 1. PRIMARY CHECK: Explicitly detect items with NO exchange policy (e.g. "SIN CANJE", "NO CANJE", "MERMA", "DESTRUCCION")
  // Note: must check "sin canje" before "canje" because "sin canje" contains the substring "canje"!
  if (
    !polStr ||
    normalized.includes('sin canje') || 
    normalized.includes('no canje') || 
    normalized.includes('sin politica') ||
    normalized.includes('sin retorno') ||
    normalized.includes('merma') || 
    normalized.includes('destruc') ||
    normalized.includes('perdida') ||
    normalized.includes('baja') ||
    normalized === 'no' ||
    normalized === 'false' ||
    normalized === '-' ||
    normalized === '0'
  ) {
    return 'MERMA_DIRECTA';
  }

  // 2. Explicit Canje / Devolución / Retorno / Plazo contractual (e.g. "30 días", "60", "CANJE 60D")
  if (
    normalized.includes('canje') || 
    normalized.includes('devol') || 
    normalized.includes('retorno') || 
    normalized.includes('proveedor') ||
    normalized.includes('garantia') ||
    normalized.includes('1x1') ||
    /\b\d{1,3}\s*(d|d[ií]as|dias)?\b/i.test(polStr)
  ) {
    return 'CANJE_PROVEEDOR';
  }

  // Default for expired/critical items without explicit exchange agreement is Merma Directa
  return 'MERMA_DIRECTA';
}

// Date reference cache (refreshed every minute or day for O(1) timestamp calculations)
let cachedDateBucket = 0;
let cachedTodayTime = 0;
let cachedRealTodayYear = 0;
let cachedRealTodayMonth = 0;

function getCachedDateInfo() {
  const now = Date.now();
  // Refresh cache if older than 1 minute (60,000ms)
  if (now - cachedDateBucket > 60000) {
    cachedDateBucket = now;
    const realToday = new Date(now);
    cachedRealTodayYear = realToday.getFullYear();
    cachedRealTodayMonth = realToday.getMonth();
    
    realToday.setHours(0, 0, 0, 0);
    cachedTodayTime = realToday.getTime();
  }
  return {
    todayTime: cachedTodayTime,
    realTodayYear: cachedRealTodayYear,
    realTodayMonth: cachedRealTodayMonth
  };
}

export function computeItemRawStatus(item: InventoryItem, headers: string[], colContext?: CalculationColumnsContext): {
  code: ItemStatusCode;
  actionType: ItemActionType;
  daysToRetire: number | null;
  daysToExpiry: number | null;
  expiryMonthOffset: number | null;
} {
  const retCol = colContext ? colContext.retCol : findColumnBySemantic(headers, 'fecha_retiro');
  const vcCol = colContext ? colContext.vcCol : findColumnBySemantic(headers, 'fecha_vc');
  
  const { todayTime, realTodayYear, realTodayMonth } = getCachedDateInfo();

  let daysToRetire: number | null = null;
  let daysToExpiry: number | null = null;
  let expiryMonthOffset: number | null = null;

  if (retCol && item[retCol]) {
    const dRet = parseAnyDate(item[retCol]);
    if (dRet) {
      daysToRetire = Math.ceil((dRet.getTime() - todayTime) / 86400000);
    }
  }

  let dVc = null;
  if (vcCol && item[vcCol]) {
    dVc = parseAnyDate(item[vcCol]);
  } else {
    dVc = getExpiryDateFromYm(item, headers, colContext);
  }

  if (dVc) {
    daysToExpiry = Math.ceil((dVc.getTime() - todayTime) / 86400000);
    expiryMonthOffset = (dVc.getFullYear() - realTodayYear) * 12 + dVc.getMonth() - realTodayMonth;
    
    if (!daysToRetire && daysToExpiry !== null) {
      const dRet = new Date(dVc);
      dRet.setDate(dRet.getDate() - 30);
      daysToRetire = Math.ceil((dRet.getTime() - todayTime) / 86400000);
    }
  }

  let code: ItemStatusCode = 'NORMAL';

  if (daysToExpiry !== null && daysToExpiry <= 0) {
    code = 'EXPIRED';
  } else if (daysToRetire !== null && daysToRetire <= 0) {
    code = 'RETIRE_NOW';
  } else if (daysToRetire !== null && daysToRetire <= 30) {
    code = 'UPCOMING';
  } else if (daysToRetire !== null && daysToRetire <= 90) {
    code = 'DRAINAGE_PM';
  }

  const actionType = detectPolicyActionType(item, headers, code, colContext);

  return { code, actionType, daysToRetire, daysToExpiry, expiryMonthOffset };
}

export function getItemResolutionStatus(item: InventoryItem, headers: string[], colContext?: CalculationColumnsContext): EventResolutionStatus {
  const traspasoCol = colContext ? colContext.traspasoCol : (
    findColumnBySemantic(headers, 'n_traspaso') 
    || headers.find(h => /^n(_|\s)?traspaso/i.test(h.trim()))
    || headers.find(h => /traspaso/i.test(h.trim()))
  );

  const val = traspasoCol 
    ? item[traspasoCol] 
    : (item.N_TRASPASO || item.n_traspaso || item['N_TRASPASO'] || item['N° TRASPASO'] || item['NRO_TRASPASO'] || item['NUM_TRASPASO']);
  
  if (val !== undefined && val !== null) {
    const str = String(val).trim();
    if (
      str !== '' && 
      str !== '-' && 
      str !== '0' && 
      !/^(sin\s+traspaso|sin\s+asignar|pendiente|n\/?a|s\/n|ninguno|null|undefined)$/i.test(str)
    ) {
      return {
        isResolved: true,
        status: 'REALIZADO',
        label: 'Realizado',
        traspasoNumber: str,
        traspasoColumn: traspasoCol
      };
    }
  }

  return {
    isResolved: false,
    status: 'PENDIENTE',
    label: 'Pendiente',
    traspasoNumber: '',
    traspasoColumn: traspasoCol
  };
}

export function getEventReason(item: InventoryItem, headers: string[]): string {
  const obsCol = findColumnBySemantic(headers, 'observacion') || headers.find(h => /observaci|motivo|detalle|causa|razon/i.test(h.trim()));
  if (obsCol && item[obsCol]) {
    return String(item[obsCol]).trim();
  }
  return '-';
}

export function calculateWithdrawalDate(dVc: Date, diasRetiro: number): Date {
  const monthsToSubtract = Math.round(diasRetiro / 30);
  return new Date(dVc.getFullYear(), dVc.getMonth() - monthsToSubtract + 1, 0);
}

/**
 * Clean and format phone numbers, ensuring they have the +56 prefix (Chile)
 */
export function formatPhoneNumber(phone: any): string {
  let rawPhone = String(phone || '').trim().replace(/[^\d+]/g, '');
  if (!rawPhone) return '';
  // If it already has an international prefix with '+'
  if (rawPhone.startsWith('+')) {
    return rawPhone;
  }
  // If starts with 56 and is 11 digits (Chile country code without +)
  if (rawPhone.startsWith('56') && rawPhone.length >= 10) {
    return '+' + rawPhone;
  }
  // Default Chilean prefix
  return '+56' + rawPhone;
}
