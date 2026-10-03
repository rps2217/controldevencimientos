import { EventCategory } from '../types';
import { evaluateBooleanCondition } from './appSheetFormulaEngine';

export interface ShowIfEvaluation {
  isVisible: boolean;
  isCoreField: boolean;
  reason?: string;
}

/**
 * Universal fields that are always relevant regardless of event category
 */
const CORE_FIELD_REGEX = /sku|c[oó]digo|descr|nombre|cant|unidades|stock|lote|observ|nota|motivo|detalle|id|folio|traspaso|prov|laboratorio/i;

/**
 * Category-specific relevance patterns
 */
const CATEGORY_FIELD_PATTERNS: Record<EventCategory, { relevant: RegExp[]; secondaryExcluded: RegExp[] }> = {
  TRANSPORTE: {
    relevant: [/transporte|cami[oó]n|patente|chofer|conductor|gu[ií]a|despacho|flete|bulto|recepci[oó]n|da[ñn]o/i],
    secondaryExcluded: [/pol[ií]tica|canje|d[ií]as_retiro|d[ií]as_anticipaci[oó]n|cuarentena/i]
  },
  DIFERENCIA: {
    relevant: [/diferencia|sobrante|faltante|ajuste|f[ií]sico|sistema|inventario|conteo|factura|bulto/i],
    secondaryExcluded: [/pol[ií]tica|canje|d[ií]as_retiro|d[ií]as_anticipaci[oó]n|cuarentena/i]
  },
  AVERIA: {
    relevant: [/sobrante|inventario|cuadratura|conteo|ajuste|f[ií]sico/i],
    secondaryExcluded: [/pol[ií]tica|canje|d[ií]as_retiro|d[ií]as_anticipaci[oó]n|cami[oó]n|patente/i]
  },
  CAL_INTERNA: {
    relevant: [/calidad|cuarentena|inspecci[oó]n|rechazo|no_conformidad|temperatura|norma|motivo/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|flete/i]
  },
  CAL_EXTERNA: {
    relevant: [/calidad|reclamo|cliente|devoluci[oó]n|rechazo|inspecci[oó]n|cuarentena/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|flete/i]
  },
  CANJES: {
    relevant: [/canje|retiro|proveedor|cr[eé]dito|nota|fecha_vc|vencimiento/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|temperatura/i]
  },
  DEVOLUCION: {
    relevant: [/faltante|inventario|p[eé]rdida|merma|ajuste|conteo/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|temperatura/i]
  },
  VENCIMIENTO_CERCANO: {
    relevant: [/vencimiento|caducidad|expiraci[oó]n|retiro|pol[ií]tica|d[ií]as|mm|yyyy|mes|a[ñn]o/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|flete|cuarentena/i]
  },
  VENCIMIENTO: {
    relevant: [/vencimiento|caducidad|expiraci[oó]n|retiro|pol[ií]tica|d[ií]as|mm|yyyy|mes|a[ñn]o/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|flete|cuarentena/i]
  },
  MERMAS: {
    relevant: [/merma|p[eé]rdida|deterioro|inventario|ajuste|conteo/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|temperatura/i]
  }
};

/**
 * Evaluates conditional visibility (Show_If) for a given header
 */
export function evaluateShowIf(
  header: string,
  selectedCategory: EventCategory,
  formData: Record<string, string>,
  isKey?: boolean,
  showAllFields?: boolean,
  isRequired?: boolean,
  showIfRule?: string
): ShowIfEvaluation {
  // 1. If explicit "show all" is active
  if (showAllFields) {
    return { isVisible: true, isCoreField: true, reason: 'Modo expandido' };
  }

  // 2. Custom AppSheet Show_If rule takes top priority if configured
  if (showIfRule && showIfRule.trim()) {
    const isSatisfied = evaluateBooleanCondition(showIfRule, { row: formData });
    return {
      isVisible: isSatisfied,
      isCoreField: isKey || isRequired || false,
      reason: isSatisfied ? 'Visible por regla Show_If' : 'Oculto por regla Show_If'
    };
  }

  // 3. Primary keys and required fields are never hidden
  if (isKey || isRequired) {
    return { isVisible: true, isCoreField: true, reason: isKey ? 'Identificador Clave' : 'Campo Requerido' };
  }

  // 4. If field already contains user data, never hide it
  const val = String(formData[header] || '').trim();
  if (val !== '') {
    return { isVisible: true, isCoreField: false, reason: 'Contiene datos ingresados' };
  }

  // 4. Core universal fields are always visible
  if (CORE_FIELD_REGEX.test(header)) {
    return { isVisible: true, isCoreField: true, reason: 'Campo esencial' };
  }

  const catRules = CATEGORY_FIELD_PATTERNS[selectedCategory];
  if (!catRules) {
    return { isVisible: true, isCoreField: false };
  }

  // 5. If matches category relevant pattern -> visible
  for (const relPattern of catRules.relevant) {
    if (relPattern.test(header)) {
      return { isVisible: true, isCoreField: false, reason: 'Específico de categoría' };
    }
  }

  // 6. If matches secondary excluded pattern for this category -> hide
  for (const exclPattern of catRules.secondaryExcluded) {
    if (exclPattern.test(header)) {
      return { isVisible: false, isCoreField: false, reason: 'No aplica a esta categoría' };
    }
  }

  // Default: visible
  return { isVisible: true, isCoreField: false };
}

/**
 * Safely evaluates a basic logical or mathematical expression against form data (Show_If or Valid_If)
 * Supported:
 * - Equality: FIELD = 'VALUE' or FIELD = 10
 * - Comparisons: FIELD > 10, FIELD < 5, FIELD >= 10
 * - Inequality: FIELD != 'VALUE'
 * - Empty checks: FIELD = '' or FIELD != ''
 */
export function evaluateCustomRule(
  expression: string,
  formData: Record<string, string>
): { success: boolean; error?: string } {
  if (!expression || !expression.trim()) {
    return { success: true };
  }

  try {
    const expr = expression.trim();

    // 1. Parse equality / inequality (e.g. FIELD = 'VALUE' or FIELD != 'VALUE')
    const eqMatch = expr.match(/^([A-Za-z0-9_À-ÿ\s°º#-]+)\s*(!?=)\s*(['"]?)(.*?)\3$/);
    if (eqMatch) {
      const field = eqMatch[1].trim();
      const operator = eqMatch[2];
      const targetVal = eqMatch[4];

      const currentVal = (formData[field] !== undefined ? String(formData[field]) : '').trim();

      if (operator === '=') {
        return { success: currentVal.toUpperCase() === targetVal.toUpperCase() };
      } else {
        return { success: currentVal.toUpperCase() !== targetVal.toUpperCase() };
      }
    }

    // 2. Parse numeric comparisons (e.g. FIELD > 10, FIELD <= 100)
    const compMatch = expr.match(/^([A-Za-z0-9_À-ÿ\s°º#-]+)\s*(>=?|<=?)\s*([0-9.-]+)$/);
    if (compMatch) {
      const field = compMatch[1].trim();
      const operator = compMatch[2];
      const targetNum = parseFloat(compMatch[3]);

      const currentRaw = (formData[field] !== undefined ? String(formData[field]) : '').trim();
      const currentNum = parseFloat(currentRaw);

      if (isNaN(currentNum)) {
        return { success: false }; // Not a number, comparison fails
      }

      switch (operator) {
        case '>': return { success: currentNum > targetNum };
        case '>=': return { success: currentNum >= targetNum };
        case '<': return { success: currentNum < targetNum };
        case '<=': return { success: currentNum <= targetNum };
        default: return { success: false };
      }
    }

    // Fallback: If it's a simple field name, return true if field is not empty
    if (/^[A-Za-z0-9_À-ÿ\s°º#-]+$/.test(expr)) {
      const val = (formData[expr] !== undefined ? String(formData[expr]) : '').trim();
      return { success: val !== '' };
    }

    return { success: false, error: 'Expresión no soportada. Ejemplos válidos: CANTIDAD > 0, FRC_EVEN = \'TRANSPORTE\'' };
  } catch (err) {
    return { success: false, error: 'Error al evaluar expresión' };
  }
}

/**
 * Operational suggestions for comments/observations (Valid_If assistance)
 */
export function getOperationalSuggestions(category: EventCategory): string[] {
  switch (category) {
    case 'TRANSPORTE':
      return [
        'Cajas aplastadas en estiba de camión',
        'Chofer se retira sin esperar conteo físico',
        'Pallet volteado / roto durante descarga',
        'Diferencia de bultos vs Guía de Despacho',
        'Mercadería mojada por lluvia / lona rota'
      ];
    case 'DIFERENCIA':
      return [
        'Faltante físico en recepción vs factura',
        'Sobrante físico no facturado en pallet',
        'Cruce de código: vino SKU incorrecto dentro de bulto',
        'Caja máster incompleta de fábrica',
        'Ajuste de inventario por conteo cíclico'
      ];
    case 'AVERIA':
      return [
        'Sobrante físico detectado en cuadratura',
        'Sobrante de mercadería no ingresada',
        'Sobrante hallado en mueble de bodega',
        'Unidades sobrantes en auditoría interna'
      ];
    case 'CAL_INTERNA':
      return [
        'No conformidad en control de calidad interno',
        'Sello de seguridad vulnerado en recepción',
        'Rango de temperatura de frío fuera de especificación',
        'Fecha de lote o vencimiento ilegible en envase'
      ];
    case 'CAL_EXTERNA':
      return [
        'Devolución de cliente por producto en mal estado',
        'Reclamo formal de local por embalaje defectuoso',
        'Producto observado por auditoría externa'
      ];
    case 'CANJES':
      return [
        'Canje acordado y aprobado con proveedor / laboratorio',
        'En espera de retiro físico por móvil de proveedor',
        'Canje comercial 1x1 respaldado con Nota de Crédito'
      ];
    case 'DEVOLUCION':
      return [
        'Faltante de stock físico en auditoría',
        'Faltante no justificado en conteo cíclico',
        'Merma o merma física por pérdida',
        'Faltante detectado al preparar pedido'
      ];
    case 'VENCIMIENTO_CERCANO':
    case 'VENCIMIENTO':
    default:
      return [
        'Próximo a retiro comercial por política de días',
        'Alerta crítica: Retiro urgente para liquidación PM',
        'Lote canjeable con proveedor según contrato',
        'Traspaso preventivo para liquidación comercial rápida'
      ];
  }
}

/**
 * Quick quantity presets for fast warehouse operations
 */
export const QUICK_QUANTITY_PRESETS = [1, 5, 10, 25, 50, 100];
