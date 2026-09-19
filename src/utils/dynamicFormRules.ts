import { EventCategory } from '../types';

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
    relevant: [/aver[ií]a|merma|deterioro|rotura|embalaje|empaque|baja|disposici[oó]n|quiebre|da[ñn]o/i],
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
    relevant: [/devoluci[oó]n|cliente|factura|nota_cr[eé]dito|motivo|recepci[oó]n/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|temperatura/i]
  },
  VENCIMIENTO_CERCANO: {
    relevant: [/vencimiento|caducidad|expiraci[oó]n|retiro|pol[ií]tica|d[ií]as|mm|yyyy|mes|a[ñn]o|precio/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|flete|cuarentena/i]
  },
  VENCIMIENTO: {
    relevant: [/vencimiento|caducidad|expiraci[oó]n|retiro|pol[ií]tica|d[ií]as|mm|yyyy|mes|a[ñn]o|precio/i],
    secondaryExcluded: [/cami[oó]n|patente|chofer|flete|cuarentena/i]
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
  isRequired?: boolean
): ShowIfEvaluation {
  // 1. If explicit "show all" is active
  if (showAllFields) {
    return { isVisible: true, isCoreField: true, reason: 'Modo expandido' };
  }

  // 2. Primary keys and required fields are never hidden
  if (isKey || isRequired) {
    return { isVisible: true, isCoreField: true, reason: isKey ? 'Identificador Clave' : 'Campo Requerido' };
  }

  // 3. If field already contains user data, never hide it
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
        'Rotura / derrame accidental en pasillo de bodega',
        'Envase perforado o golpeado en reposición',
        'Producto quebrado dado de baja para destrucción',
        'Empaque secundario desgarrado e inhabilitado'
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
        'Devolución comercial autorizada por jefatura',
        'Cliente devuelve por error de despacho / SKU equivocado',
        'Mercadería devuelta por cliente en buen estado para reingreso',
        'Devolución con Nota de Crédito pendiente de emisión'
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
