import { findColumnBySemantic, KnownFieldSemantic } from './columnAliases';
import { parseAnyDate, calculateWithdrawalDate, formatDisplayDate, formatInputDate } from './dateCalculations';
import { extractCuVcFromRow } from './cuVcConsolidator';
import { SheetConfig } from '../types';

export interface MasterProductSummary {
  sku: string;
  name: string;
  provider: string;
  price: string;
  category: string;
  raw: any;
}

export interface MasterCatalogIndex {
  exactMap: Map<string, any>;
  alphaMap: Map<string, any>;
  summaryMap: Map<string, MasterProductSummary>;
  summaries: MasterProductSummary[];
  getBySku: (sku: string) => MasterProductSummary | null;
  getRawBySku: (sku: string) => any | null;
  search: (query: string, limit?: number) => MasterProductSummary[];
}

/**
 * Normalizes a RUT string by removing dots, hyphens, and whitespace, in uppercase.
 * e.g. "76.123.456-7" -> "761234567"
 */
export function normalizeRut(rut: any): string {
  if (!rut) return '';
  return String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Normalizes text removing accents, punctuation, and multiple spaces for robust comparison.
 */
export function normalizeCleanText(text: any): string {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ResolvedItemPolicyInfo {
  policy: string;
  diasRetiro: number;
  fechaRetiroDate: Date | null;
  fechaRetiroDisplay: string;
  fechaRetiroIso: string;
  source: 'policy_module' | 'product_catalog' | 'item_form' | 'default';
  sourceDescription: string;
  matchedPolicyEntry?: any;
  matchedProductEntry?: any;
  providerName?: string;
  providerRut?: string;
  expiryDateStr?: string;
}

/**
 * UNIFIED SOURCE OF TRUTH for resolving Item Policy, Withdrawal Days, and Withdrawal Date.
 * Reusable across the Virtual Column (fecha_retiro_calc), ItemFormModal (manual entry & editing),
 * and background calculations.
 */
export function resolveItemPolicyAndRetiro(
  itemOrFormData: Record<string, any>,
  headers: string[] = [],
  products: any[] = [],
  policies: any[] = [],
  customAliases?: Record<string, string[]>
): ResolvedItemPolicyInfo {
  if (!itemOrFormData) {
    return {
      policy: 'Canje Estándar (30 días)',
      diasRetiro: 30,
      fechaRetiroDate: null,
      fechaRetiroDisplay: '-',
      fechaRetiroIso: '',
      source: 'default',
      sourceDescription: 'Valor predeterminado estándar (30 días)'
    };
  }

  // 1. Identify key columns in headers or item
  const skuCol = findColumnBySemantic(headers, 'sku', customAliases) || 
                 headers.find(h => /sku|código|codigo/i.test(h)) || 'SKU';
  const skuVal = itemOrFormData[skuCol] || itemOrFormData.SKU || itemOrFormData.sku || itemOrFormData['COD PRODUCTO'] || itemOrFormData['Código'];
  const cleanSku = skuVal ? String(skuVal).trim() : '';

  const fechaVcCol = findColumnBySemantic(headers, 'fecha_vc', customAliases) || 
                     headers.find(h => /vencimiento|caducidad|expiración|fecha_vc/i.test(h));
  const rawVc = (fechaVcCol ? itemOrFormData[fechaVcCol] : null) || 
                itemOrFormData.FECHA_VENCIMIENTO || 
                itemOrFormData.FECHA_VC || 
                itemOrFormData.fecha_vc || 
                itemOrFormData.VENCIMIENTO;

  const mmCol = findColumnBySemantic(headers, 'mes', customAliases) || headers.find(h => /^(mes|mm)$/i.test(h.trim()));
  const yyyyCol = findColumnBySemantic(headers, 'anio', customAliases) || headers.find(h => /^(a[nñ]o|yyyy|year)$/i.test(h.trim()));
  const rawMm = mmCol ? itemOrFormData[mmCol] : (itemOrFormData.MM || itemOrFormData.mes);
  const rawYyyy = yyyyCol ? itemOrFormData[yyyyCol] : (itemOrFormData.YYYY || itemOrFormData.anio);

  const diasRetiroCol = findColumnBySemantic(headers, 'dias_retiro', customAliases) || 
                        findColumnBySemantic(headers, 'dias_anticipacion', customAliases) || 
                        headers.find(h => /dias(_|\s)?(retiro|anticipacion|canje|limite)|dias_retiro_vc/i.test(h));
  const rawItemDays = diasRetiroCol ? itemOrFormData[diasRetiroCol] : (itemOrFormData.DIAS_RETIRO || itemOrFormData.dias_retiro);

  const policyCol = findColumnBySemantic(headers, 'politica', customAliases) || 
                    headers.find(h => /política|politica|regla/i.test(h));
  const rawItemPolicy = policyCol ? itemOrFormData[policyCol] : (itemOrFormData.POLITICA || itemOrFormData.politica);

  const provCol = findColumnBySemantic(headers, 'proveedor', customAliases) || 
                  headers.find(h => /proveedor|lab|fabricante/i.test(h));
  const rawItemProv = provCol ? itemOrFormData[provCol] : (itemOrFormData.PROVEEDOR || itemOrFormData.proveedor);

  const rutCol = headers.find(h => /rut.*prov|prov.*rut|^rut$/i.test(h));
  const rawItemRut = rutCol ? itemOrFormData[rutCol] : (itemOrFormData.RUT || itemOrFormData['RUT PROVEEDOR']);

  // 2. Find Master Product
  let matchedProduct: any = null;
  if (cleanSku && products && products.length > 0) {
    matchedProduct = findMasterProduct(cleanSku, products, customAliases);
    if (!matchedProduct) {
      matchedProduct = products.find((p: any) => {
        const pSku = p['COD PRODUCTO'] || p['C'] || p['Código'] || p['Código Producto'] || p['SKU'] || p['sku'];
        return pSku && String(pSku).trim() === cleanSku;
      });
    }
  }

  // Extract metadata from master product or item
  const prodDesc = matchedProduct 
    ? (matchedProduct['DESCRIPCION'] || matchedProduct['DESCRIPCIÓN'] || matchedProduct['NOMBRE'] || matchedProduct['B'])
    : (itemOrFormData.DESCRIPCION || '');
    
  const prodProv = matchedProduct
    ? (matchedProduct['PROVEEDOR'] || matchedProduct['LABORATORIO'] || matchedProduct['FABRICANTE'] || matchedProduct['NOMBRE PROVEEDOR'] || matchedProduct['F'])
    : rawItemProv;

  const prodRut = matchedProduct
    ? (matchedProduct['RUT PROVEEDOR'] || matchedProduct['RUT_PROVEEDOR'] || matchedProduct['RUT'] || matchedProduct['F'])
    : rawItemRut;

  const prodCategory = matchedProduct
    ? (matchedProduct['FAMILIA'] || matchedProduct['CATEGORIA'] || matchedProduct['MUNDO'] || matchedProduct['RUBRO'])
    : '';

  const prodPolicy = matchedProduct
    ? (matchedProduct['POLITICA'] || matchedProduct['POLITICA_CANJE'] || matchedProduct['CANJE SOLO POR VENCIMIENTO DIAS'] || matchedProduct['CANJE SOLO'] || matchedProduct['CANJE'])
    : '';

  const prodDays = matchedProduct
    ? (matchedProduct['RETIRO (DÍAS)'] || matchedProduct['RETIRO DÍAS'] || matchedProduct['DIAS_RETIRO'] || matchedProduct['DIAS_RETIRO_VC'] || matchedProduct['DIAS DE ANTICIPACION'])
    : null;

  // 3. Match row in policies table (Politicas_Canje)
  let matchedPolicyEntry: any = null;

  if (policies && policies.length > 0) {
    const cleanProdRut = normalizeRut(prodRut);

    // Priority 3a: Match by Provider RUT
    if (cleanProdRut) {
      matchedPolicyEntry = policies.find((p: any) => {
        const pRut = p['RUT'] || p['RUT PROVEEDOR'] || p['RUT_PROVEEDOR'] || p['A'];
        return pRut && normalizeRut(pRut) === cleanProdRut;
      });
    }

    // Priority 3b: Match by Provider Name (Fuzzy / Substring / Corporate Suffix stripped)
    if (!matchedPolicyEntry && prodProv) {
      const normProv = normalizeCleanText(prodProv);
      if (normProv) {
        matchedPolicyEntry = policies.find((p: any) => {
          const pName = p['PROVEEDOR'] || p['NOMBRE'] || p['RAZON SOCIAL'] || p['LABORATORIO'] || p['NOMBRE PROVEEDOR'] || p['B'];
          if (!pName) return false;
          const normPName = normalizeCleanText(pName);
          if (!normPName) return false;
          return normProv === normPName || normProv.includes(normPName) || normPName.includes(normProv);
        });
      }
    }

    // Priority 3c: Match by Family / Category (or provider/description containing family)
    if (!matchedPolicyEntry) {
      const candidates = [prodCategory, prodProv, prodDesc, rawItemPolicy].filter(Boolean).map(s => normalizeCleanText(s));
      matchedPolicyEntry = policies.find((p: any) => {
        const pFam = p['FAMILIA'] || p['CATEGORIA'] || p['RUBRO'] || p['MUNDO'];
        if (!pFam) return false;
        const normFam = normalizeCleanText(pFam);
        if (!normFam) return false;
        return candidates.some(cand => cand.includes(normFam) || normFam.includes(cand));
      });
    }

    // Priority 3d: Match by explicit item policy text
    if (!matchedPolicyEntry && rawItemPolicy) {
      const normItemPol = normalizeCleanText(rawItemPolicy);
      matchedPolicyEntry = policies.find((p: any) => {
        const pPol = p['POLITICA'] || p['ACCION'] || p['CANJE'] || p['NOMBRE'];
        if (!pPol) return false;
        const normPPol = normalizeCleanText(pPol);
        return normItemPol === normPPol || normItemPol.includes(normPPol) || normPPol.includes(normItemPol);
      });
    }
  }

  // 4. Resolve Withdrawal Days
  let resolvedDays: number | null = null;
  let daysSource: 'item_form' | 'policy_module' | 'product_catalog' | 'default' = 'default';
  let sourceDesc = '';

  // 4a. If item/form has explicit days entered by user
  if (rawItemDays !== undefined && rawItemDays !== null && String(rawItemDays).trim() !== '') {
    const parsed = parseInt(String(rawItemDays), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 365) {
      resolvedDays = parsed;
      daysSource = 'item_form';
      sourceDesc = 'Ingresado directamente en formulario';
    }
  }

  // 4b. If matched from policies table
  if (resolvedDays === null && matchedPolicyEntry) {
    const daysKeys = Object.keys(matchedPolicyEntry).filter(k => 
      /retiro.*d[ií]as|d[ií]as.*retiro|dias_retiro|dias_anticipacion|^dias$|^d[ií]as$|^h$/i.test(k)
    );
    for (const k of daysKeys) {
      const val = parseInt(String(matchedPolicyEntry[k]), 10);
      if (!isNaN(val) && val > 0) {
        resolvedDays = val;
        break;
      }
    }
    // If not found in key names, scan all values of policy entry for days
    if (resolvedDays === null) {
      for (const val of Object.values(matchedPolicyEntry)) {
        const num = parseInt(String(val), 10);
        if (!isNaN(num) && num >= 5 && num <= 365) {
          resolvedDays = num;
          break;
        }
      }
    }
    if (resolvedDays !== null) {
      daysSource = 'policy_module';
      const provInfo = matchedPolicyEntry['PROVEEDOR'] || matchedPolicyEntry['FAMILIA'] || prodProv || 'Módulo Políticas de Canje';
      sourceDesc = `Políticas de Canje (${provInfo})`;
    }
  }

  // 4c. If found in master product
  if (resolvedDays === null && prodDays) {
    const parsed = parseInt(String(prodDays), 10);
    if (!isNaN(parsed) && parsed > 0) {
      resolvedDays = parsed;
      daysSource = 'product_catalog';
      sourceDesc = 'Catálogo Maestro de Productos';
    }
  }

  // 4d. Fallback: Parse digits from policy text if available (e.g. "Canje 15 días" -> 15)
  if (resolvedDays === null) {
    const testText = rawItemPolicy || (matchedPolicyEntry && (matchedPolicyEntry['POLITICA'] || matchedPolicyEntry['ACCION'])) || prodPolicy || '';
    const matchDigits = String(testText).match(/\b(\d{1,3})\b/);
    if (matchDigits) {
      const num = parseInt(matchDigits[1], 10);
      if (!isNaN(num) && num > 0 && num <= 365) {
        resolvedDays = num;
        daysSource = matchedPolicyEntry ? 'policy_module' : 'item_form';
        sourceDesc = 'Deducido de descripción de política';
      }
    }
  }

  // 4e. Default standard days: 30 days (consistent with virtual column)
  if (resolvedDays === null) {
    resolvedDays = 30;
    daysSource = 'default';
    sourceDesc = 'Regla estándar (30 días de anticipación)';
  }

  // 5. Resolve Policy Name
  let resolvedPolicy = '';
  if (rawItemPolicy && String(rawItemPolicy).trim() !== '') {
    resolvedPolicy = String(rawItemPolicy).trim();
  } else if (matchedPolicyEntry) {
    const polName = matchedPolicyEntry['POLITICA'] || 
                    matchedPolicyEntry['ACCION'] || 
                    matchedPolicyEntry['CANJE'] || 
                    matchedPolicyEntry['CANJE SOLO POR VENCIMIENTO'] || 
                    matchedPolicyEntry['CONDICION'];
    if (polName) {
      resolvedPolicy = String(polName).trim();
    } else if (matchedPolicyEntry['FAMILIA']) {
      resolvedPolicy = `${matchedPolicyEntry['FAMILIA']} (${resolvedDays}d)`;
    }
  } else if (prodPolicy) {
    resolvedPolicy = String(prodPolicy).trim();
  }

  if (!resolvedPolicy) {
    resolvedPolicy = `Canje Estándar (${resolvedDays} días)`;
  }

  // 6. Resolve Expiry Date and calculate Withdrawal Date
  let effectiveVcDate: Date | null = null;
  let effectiveVcStr = '';

  if (rawVc) {
    effectiveVcDate = parseAnyDate(rawVc);
    if (effectiveVcDate) {
      effectiveVcStr = String(rawVc);
    }
  }

  // If no rawVc or invalid, check MM and YYYY
  if (!effectiveVcDate && rawMm && rawYyyy) {
    const m = parseInt(String(rawMm), 10);
    const y = parseInt(String(rawYyyy), 10);
    if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) {
      effectiveVcDate = new Date(y, m, 0); // Last day of month
      effectiveVcStr = `${y}-${String(m).padStart(2, '0')}-${String(effectiveVcDate.getDate()).padStart(2, '0')}`;
    }
  }

  let fechaRetiroDate: Date | null = null;
  let fechaRetiroDisplay = '-';
  let fechaRetiroIso = '';

  if (effectiveVcDate && !isNaN(effectiveVcDate.getTime())) {
    fechaRetiroDate = calculateWithdrawalDate(effectiveVcDate, resolvedDays);
    fechaRetiroDisplay = formatDisplayDate(fechaRetiroDate);
    fechaRetiroIso = formatInputDate(fechaRetiroDate);
  }

  return {
    policy: resolvedPolicy,
    diasRetiro: resolvedDays,
    fechaRetiroDate,
    fechaRetiroDisplay,
    fechaRetiroIso,
    source: daysSource,
    sourceDescription: sourceDesc,
    matchedPolicyEntry,
    matchedProductEntry: matchedProduct,
    providerName: prodProv ? String(prodProv).trim() : undefined,
    providerRut: prodRut ? String(prodRut).trim() : undefined,
    expiryDateStr: effectiveVcStr
  };
}

/**
 * Builds a high-performance O(1) indexed catalog for lightning-fast PDA barcode scanning.
 * Pre-computes summaries and hash indexes so scans don't perform O(N) array traversals or regexes.
 */
export function buildMasterCatalogIndex(
  products: any[],
  customAliases?: Record<string, string[]>
): MasterCatalogIndex {
  const exactMap = new Map<string, any>();
  const alphaMap = new Map<string, any>();
  const summaryMap = new Map<string, MasterProductSummary>();
  const summaries: MasterProductSummary[] = [];

  if (!products || products.length === 0) {
    return {
      exactMap,
      alphaMap,
      summaryMap,
      summaries,
      getBySku: () => null,
      getRawBySku: () => null,
      search: () => []
    };
  }

  const firstProd = products[0];
  const keys = Object.keys(firstProd || {});
  const skuCol = findColumnBySemantic(keys, 'sku', customAliases) || keys.find(k => /sku|código|codigo/i.test(k));

  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    if (!prod) continue;

    const summary = getMasterProductSummary(prod, customAliases);
    summaries.push(summary);

    const rawSku = skuCol ? prod[skuCol] : (prod.SKU || prod.sku);
    const skuStr = String(rawSku !== undefined && rawSku !== null ? rawSku : summary.sku).trim();

    if (skuStr) {
      const lower = skuStr.toLowerCase();
      exactMap.set(lower, prod);
      exactMap.set(skuStr, prod);
      summaryMap.set(lower, summary);
      summaryMap.set(skuStr, summary);

      const alpha = lower.replace(/[^a-z0-9]/g, '');
      if (alpha && !alphaMap.has(alpha)) {
        alphaMap.set(alpha, prod);
      }
      const numOnly = alpha.replace(/[^0-9]/g, '');
      if (numOnly && !alphaMap.has(numOnly)) {
        alphaMap.set(numOnly, prod);
      }
    }

    // Also index by any barcode / EAN columns if present
    for (const k of Object.keys(prod)) {
      if (/barcode|ean|c[oó]d(_|\s)?barra/i.test(k) && prod[k]) {
        const barcodeVal = String(prod[k]).trim().toLowerCase();
        if (barcodeVal) {
          if (!exactMap.has(barcodeVal)) exactMap.set(barcodeVal, prod);
          if (!summaryMap.has(barcodeVal)) summaryMap.set(barcodeVal, summary);
        }
      }
    }
  }

  const getRawBySku = (sku: string): any | null => {
    if (!sku) return null;
    const clean = String(sku).trim().toLowerCase();
    if (!clean) return null;

    // 1. Direct O(1) hash map lookup
    const direct = exactMap.get(clean);
    if (direct) return direct;

    // 2. Alphanumeric match O(1)
    const alpha = clean.replace(/[^a-z0-9]/g, '');
    if (alpha) {
      const alphaMatch = alphaMap.get(alpha);
      if (alphaMatch) return alphaMatch;
    }

    return null;
  };

  const getBySku = (sku: string): MasterProductSummary | null => {
    if (!sku) return null;
    const clean = String(sku).trim().toLowerCase();
    if (!clean) return null;

    const direct = summaryMap.get(clean);
    if (direct) return direct;

    const raw = getRawBySku(sku);
    if (raw) {
      return getMasterProductSummary(raw, customAliases);
    }
    return null;
  };

  const search = (query: string, limit: number = 8): MasterProductSummary[] => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return summaries.slice(0, limit);

    const tokens = q.split(/\s+/).filter(Boolean);

    const results: MasterProductSummary[] = [];
    for (let i = 0; i < summaries.length; i++) {
      const s = summaries[i];
      const skuL = s.sku.toLowerCase();
      const nameL = s.name.toLowerCase();
      const provL = s.provider.toLowerCase();
      const catL = s.category.toLowerCase();

      const matchesAll = tokens.every(t => 
        skuL.includes(t) || nameL.includes(t) || provL.includes(t) || catL.includes(t)
      );

      if (matchesAll) {
        results.push(s);
        if (results.length >= limit) break;
      }
    }
    return results;
  };

  return {
    exactMap,
    alphaMap,
    summaryMap,
    summaries,
    getBySku,
    getRawBySku,
    search
  };
}

let cachedIndexProducts: any[] | null = null;
let cachedIndexAliases: Record<string, string[]> | undefined = undefined;
let cachedIndexResult: MasterCatalogIndex | null = null;

export function getMasterCatalogIndex(
  products: any[],
  customAliases?: Record<string, string[]>
): MasterCatalogIndex {
  if (!products || products.length === 0) {
    return buildMasterCatalogIndex([], customAliases);
  }

  if (
    cachedIndexResult &&
    cachedIndexProducts === products &&
    cachedIndexAliases === customAliases
  ) {
    return cachedIndexResult;
  }

  cachedIndexProducts = products;
  cachedIndexAliases = customAliases;
  cachedIndexResult = buildMasterCatalogIndex(products, customAliases);
  return cachedIndexResult;
}

/**
 * Extracts a normalized, semantic summary of a master product row
 */
export function getMasterProductSummary(
  product: any, 
  customAliases?: Record<string, string[]>
): MasterProductSummary {
  if (!product) {
    return { sku: '', name: '', provider: '', price: '', category: '', raw: null };
  }

  const keys = Object.keys(product);
  const skuCol = findColumnBySemantic(keys, 'sku', customAliases) || keys.find(k => /sku|código|codigo/i.test(k));
  const descCol = findColumnBySemantic(keys, 'descripcion', customAliases) || keys.find(k => /desc|nombre|name|producto/i.test(k));
  const provCol = findColumnBySemantic(keys, 'proveedor', customAliases) || keys.find(k => /prov|laboratorio|marca/i.test(k));
  const priceCol = findColumnBySemantic(keys, 'precio', customAliases) || keys.find(k => /precio|costo|price|valor/i.test(k));
  const catCol = findColumnBySemantic(keys, 'categoria', customAliases) || keys.find(k => /categor|familia|rubro/i.test(k));

  return {
    sku: skuCol && product[skuCol] !== undefined ? String(product[skuCol]).trim() : (product.SKU || ''),
    name: descCol && product[descCol] !== undefined ? String(product[descCol]).trim() : (product.DESCRIPCION || ''),
    provider: provCol && product[provCol] !== undefined ? String(product[provCol]).trim() : (product.PROVEEDOR || ''),
    price: priceCol && product[priceCol] !== undefined ? String(product[priceCol]).trim() : (product.PRECIO_COSTO || ''),
    category: catCol && product[catCol] !== undefined ? String(product[catCol]).trim() : (product.CATEGORIA || product.FAMILIA || ''),
    raw: product
  };
}

/**
 * Tolerant lookup of a master product row by SKU
 */
export function findMasterProduct(
  sku: string, 
  products: any[], 
  customAliases?: Record<string, string[]>
): any | null {
  if (!sku || !products || products.length === 0) return null;
  const index = getMasterCatalogIndex(products, customAliases);
  return index.getRawBySku(sku);
}

/**
 * Searches the master catalog by SKU, product description, or provider
 */
export function searchMasterProducts(
  query: string, 
  products: any[], 
  limit: number = 8,
  customAliases?: Record<string, string[]>
): MasterProductSummary[] {
  if (!products || products.length === 0) return [];
  const index = getMasterCatalogIndex(products, customAliases);
  return index.search(query, limit);
}

/**
 * De-references fields from a master product to the target sheet's column names
 * Maps:
 * - Master Description -> Target Description column
 * - Master Provider -> Target Provider column
 * - Master Price -> Target Price column
 * - Master Category -> Target Category column
 * - Master Policy -> Target Policy column
 */
export function dereferenceMasterProduct(
  masterProduct: any, 
  targetHeaders: string[], 
  customAliases?: Record<string, string[]>
): Record<string, any> {
  const result: Record<string, any> = {};
  if (!masterProduct || !targetHeaders || targetHeaders.length === 0) return result;

  const masterKeys = Object.keys(masterProduct);

  const getMasterVal = (semantic: KnownFieldSemantic, fallbackRegex: RegExp) => {
    let masterCol = findColumnBySemantic(masterKeys, semantic, customAliases);
    
    // Safety checks: do not match provider columns for policy, or date columns for days
    if (semantic === 'politica' && masterCol && /proveedor|lab|fabricante|rut/i.test(masterCol)) {
      masterCol = undefined;
    }
    if ((semantic === 'dias_retiro' || semantic === 'dias_anticipacion') && masterCol && /fecha|vencimiento|vto/i.test(masterCol)) {
      masterCol = undefined;
    }

    if (masterCol && masterProduct[masterCol] !== undefined && masterProduct[masterCol] !== '') {
      return masterProduct[masterCol];
    }
    
    let fallbackCol = masterKeys.find(k => fallbackRegex.test(k));
    if (semantic === 'politica' && fallbackCol && /proveedor|lab|fabricante|rut/i.test(fallbackCol)) {
      fallbackCol = undefined;
    }
    if ((semantic === 'dias_retiro' || semantic === 'dias_anticipacion') && fallbackCol && /fecha|vencimiento|vto/i.test(fallbackCol)) {
      fallbackCol = undefined;
    }

    if (fallbackCol && masterProduct[fallbackCol] !== undefined && masterProduct[fallbackCol] !== '') {
      return masterProduct[fallbackCol];
    }
    return undefined;
  };

  for (const targetHeader of targetHeaders) {
    const cleanHeader = String(targetHeader || '').trim();
    let val: any = undefined;

    if (/sku|código|codigo/i.test(cleanHeader)) {
      val = getMasterVal('sku', /sku|código|codigo/i);
    } else if (/desc|nombre|name|producto/i.test(cleanHeader)) {
      val = getMasterVal('descripcion', /desc|nombre|name|producto/i);
    } else if (/proveedor|lab|fabricante|rut_prov/i.test(cleanHeader)) {
      val = getMasterVal('proveedor', /proveedor|lab|fabricante|rut_prov/i);
    } else if (/política|politica|regla/i.test(cleanHeader)) {
      val = getMasterVal('politica', /canje(_|\s)?solo(_|\s)?por(_|\s)?vencimiento(s)?(_|\s)?dia(s)?/i) ||
            getMasterVal('politica', /canje(_|\s)?solo/i) ||
            getMasterVal('politica', /pol[ií]tica|politica|regla/i);
    } else if (/dias(_|\s)?retiro|dias(_|\s)?ant|dias/i.test(cleanHeader)) {
      val = getMasterVal('dias_retiro', /retiro(_|\s)?\((_|\s)?d[ií]as(_|\s)?\)/i) ||
            getMasterVal('dias_retiro', /retiro(_|\s)?d[ií]as/i) ||
            getMasterVal('dias_retiro', /dias(_|\s)?(retiro|anticipacion|canje|limite)|dias_retiro_vc/i) ||
            getMasterVal('dias_anticipacion', /dias(_|\s)?anticipacion|anticipacion/i);
    } else if (/mundo|zona|division|segmento/i.test(cleanHeader)) {
      val = getMasterVal('mundo', /mundo|zona|division|segmento|area/i);
    } else if (/pm|product_manager|responsable|comprador|gestor/i.test(cleanHeader)) {
      val = getMasterVal('pm', /pm|product_manager|responsable|comprador|gestor/i);
    } else if (/precio|costo|price|valor/i.test(cleanHeader)) {
      val = getMasterVal('precio', /precio|costo|price|valor/i);
    } else if (/categor|familia|rubro/i.test(cleanHeader)) {
      val = getMasterVal('categoria', /categor|familia|rubro|linea/i);
    } else {
      for (const sem of ['sku', 'descripcion', 'proveedor', 'politica', 'dias_retiro', 'dias_anticipacion', 'mundo', 'pm', 'precio', 'categoria'] as KnownFieldSemantic[]) {
        const matchedTargetCol = findColumnBySemantic([targetHeader], sem, customAliases);
        if (matchedTargetCol) {
          val = getMasterVal(sem, new RegExp(sem, 'i'));
          if (val !== undefined) break;
        }
      }

      if (val === undefined) {
        const exactMatchKey = masterKeys.find(k => k.trim().toLowerCase() === cleanHeader.toLowerCase());
        if (exactMatchKey && masterProduct[exactMatchKey] !== undefined && masterProduct[exactMatchKey] !== '') {
          val = masterProduct[exactMatchKey];
        }
      }
    }

    if (val !== undefined && val !== null && String(val).trim() !== '') {
      result[targetHeader] = String(val);
    }
  }

  return result;
}

/**
 * Automatically calculates and auto-completes dependent fields for manual product entries:
 * - POLITICA (from master catalog or policy defaults)
 * - PM (Product Manager / Responsable from master catalog)
 * - DIAS_RETIRO_VC (Lead time days from master catalog or policies table)
 * - FECHA_RETIRO (Calculated as FECHA_VC - DIAS_RETIRO_VC days)
 * - FECHA_VC (Calculated from MM & YYYY last day of month)
 * - CU_VC (Unique Expiry Code = SKU + YYYY + MM)
 */
export function autoCalculateItemFormData(
  currentForm: Record<string, string>,
  headers: string[],
  products: any[] = [],
  policies: any[] = [],
  sheetConfig?: SheetConfig
): Record<string, string> {
  const newForm = { ...currentForm };
  if (!headers || headers.length === 0) return newForm;

  const customAliases = sheetConfig?.customAliases;

  // Identify semantic headers
  const skuCol = findColumnBySemantic(headers, 'sku', customAliases) || 
                 headers.find(h => /sku|código|codigo/i.test(h));
  const policyCol = findColumnBySemantic(headers, 'politica', customAliases) || 
                    headers.find(h => /política|politica|regla/i.test(h));
  const pmCol = findColumnBySemantic(headers, 'pm', customAliases) || 
                headers.find(h => /pm|product_manager|responsable|comprador|gestor|jefe_producto/i.test(h));
  const diasRetiroCol = findColumnBySemantic(headers, 'dias_retiro', customAliases) || 
                        findColumnBySemantic(headers, 'dias_anticipacion', customAliases) || 
                        headers.find(h => /dias(_|\s)?(retiro|anticipacion|canje|limite)|dias_retiro_vc/i.test(h));
  const cuVcCol = findColumnBySemantic(headers, 'id', customAliases) || 
                  headers.find(h => /^cu(_|\s)?(vc|calculado)?$/i.test(h.trim()) || /^id_vc$/i.test(h.trim()) || /^codigo_unico$/i.test(h.trim()));

  const mmCol = findColumnBySemantic(headers, 'mes', customAliases) || 
                headers.find(h => /^(mes|mm)$/i.test(h.trim()));
  const yyyyCol = findColumnBySemantic(headers, 'anio', customAliases) || 
                  headers.find(h => /^(a[nñ]o|yyyy|year)$/i.test(h.trim()));
  const fechaVcCol = findColumnBySemantic(headers, 'fecha_vc', customAliases) || 
                     headers.find(h => /vencimiento|caducidad|expiración|fecha_vc/i.test(h));
  const fechaRetiroCol = findColumnBySemantic(headers, 'fecha_retiro', customAliases) || 
                         headers.find(h => /retiro|canje_retiro|fecha_canje/i.test(h));

  // 1. Lookup SKU in master catalog (products) if SKU is typed
  const skuVal = skuCol && newForm[skuCol] ? String(newForm[skuCol]).trim() : '';
  let masterProduct: any = null;
  if (skuVal && products && products.length > 0) {
    masterProduct = findMasterProduct(skuVal, products, customAliases);
    if (masterProduct) {
      // Auto dereference fields (Description, Provider, Price, Category, etc.) if empty or needed
      const dereferenced = dereferenceMasterProduct(masterProduct, headers, customAliases);
      for (const [k, v] of Object.entries(dereferenced)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          const isPolicyOrDays = /pol[ií]tica|politica|canje|dias(_|\s)?(retiro|anticipacion|canje|limite)|dias_retiro_vc/i.test(k);
          if (isPolicyOrDays || !newForm[k] || newForm[k].trim() === '') {
            newForm[k] = String(v);
          }
        }
      }
    }
  }

  // 2. MM & YYYY <-> FECHA_VC Sync
  let mVal = mmCol && newForm[mmCol] ? newForm[mmCol].trim() : '';
  let yVal = yyyyCol && newForm[yyyyCol] ? newForm[yyyyCol].trim() : '';
  let fechaVcVal = fechaVcCol && newForm[fechaVcCol] ? newForm[fechaVcCol].trim() : '';

  if (mVal && yVal && !isNaN(Number(mVal)) && !isNaN(Number(yVal))) {
    const mNum = parseInt(mVal, 10);
    const yNum = parseInt(yVal, 10);
    if (mNum >= 1 && mNum <= 12 && yNum >= 2000 && yNum <= 2100) {
      const lastDay = new Date(yNum, mNum, 0);
      const calcY = lastDay.getFullYear();
      const calcM = String(lastDay.getMonth() + 1).padStart(2, '0');
      const calcD = String(lastDay.getDate()).padStart(2, '0');
      const computedDateStr = `${calcY}-${calcM}-${calcD}`;
      if (fechaVcCol && (!newForm[fechaVcCol] || newForm[fechaVcCol] !== computedDateStr)) {
        newForm[fechaVcCol] = computedDateStr;
        fechaVcVal = computedDateStr;
      }
    }
  } else if (fechaVcVal) {
    const parsedDate = parseAnyDate(fechaVcVal);
    if (parsedDate) {
      const extractedY = String(parsedDate.getFullYear());
      const extractedM = String(parsedDate.getMonth() + 1).padStart(2, '0');
      if (yyyyCol && !newForm[yyyyCol]) { newForm[yyyyCol] = extractedY; yVal = extractedY; }
      if (mmCol && !newForm[mmCol]) { newForm[mmCol] = extractedM; mVal = extractedM; }
    }
  }

  // 3. UNIFIED RESOLUTION of Policy, Withdrawal Days, and Withdrawal Date
  const policyRes = resolveItemPolicyAndRetiro(newForm, headers, products, policies, customAliases);

  // 4. Auto-fill POLITICA
  if (policyCol) {
    if (!newForm[policyCol] || newForm[policyCol].trim() === '' || newForm[policyCol] === 'Canje Estándar (30 días)') {
      newForm[policyCol] = policyRes.policy;
    }
  }
  newForm._politica = policyRes.policy;

  // 5. Auto-fill PM if empty
  if (pmCol && (!newForm[pmCol] || newForm[pmCol].trim() === '')) {
    if (masterProduct) {
      const masterPmCol = Object.keys(masterProduct).find(k => /pm|product_manager|responsable|comprador|gestor|jefe/i.test(k));
      if (masterPmCol && masterProduct[masterPmCol]) {
        newForm[pmCol] = String(masterProduct[masterPmCol]).trim();
      }
    }
  }

  // 6. Auto-fill DIAS_RETIRO
  if (diasRetiroCol) {
    const currentDaysVal = String(newForm[diasRetiroCol] || '').trim();
    if (currentDaysVal === '' || isNaN(parseInt(currentDaysVal, 10)) || currentDaysVal.includes('-')) {
      newForm[diasRetiroCol] = String(policyRes.diasRetiro);
    }
  }
  newForm._diasRetiro = String(policyRes.diasRetiro);

  // 7. FECHA_RETIRO Calculation (Consistently uses resolveItemPolicyAndRetiro / calculateWithdrawalDate)
  if (policyRes.fechaRetiroDisplay && policyRes.fechaRetiroDisplay !== '-') {
    headers.forEach(h => {
      if (/fecha(_|\s)?retiro/i.test(h) || /retiro(_|\s)?calc/i.test(h) || /^fecha(_|\s)?canje/i.test(h)) {
        newForm[h] = policyRes.fechaRetiroDisplay;
      }
    });
    if (fechaRetiroCol) {
      newForm[fechaRetiroCol] = policyRes.fechaRetiroDisplay;
    }
    newForm['FECHA_RETIRO_CALC'] = policyRes.fechaRetiroDisplay;
    newForm._fechaRetiroCalc = policyRes.fechaRetiroDisplay;
  } else if (!newForm['FECHA_RETIRO_CALC']) {
    newForm['FECHA_RETIRO_CALC'] = '-';
  }

  newForm._policySource = policyRes.source;
  newForm._policySourceDesc = policyRes.sourceDescription;

  // 8. Auto-calculate CU_VC = SKU + YYYY + MM using extractCuVcFromRow
  const derivedCuInfo = extractCuVcFromRow(newForm, headers, customAliases);
  if (derivedCuInfo.cuVc) {
    headers.forEach(h => {
      const isCuHeader = /^cu(_|\s)?(vc|calculado)?$/i.test(h.trim()) || 
                         /^id_vc$/i.test(h.trim()) || 
                         /^codigo(_|\s)?unico$/i.test(h.trim()) || 
                         /^cu$/i.test(h.trim());
      if (isCuHeader) {
        newForm[h] = derivedCuInfo.cuVc;
      }
    });
    if (cuVcCol) {
      newForm[cuVcCol] = derivedCuInfo.cuVc;
    }
  }

  return newForm;
}
