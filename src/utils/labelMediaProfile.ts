/**
 * Perfiles de impresión para etiquetas térmicas de la familia Marklife P15/P12.
 *
 * Puro TS, sin DOM ni dependencias: la geometría se puede verificar sin impresora.
 * La P15 imprime a 203 dpi (8 puntos/mm) y no permite medios puntos, así que el
 * encaje de un código de barras es aritmética entera, no una estimación.
 *
 * Ver ROADMAP §31: en un rollo de 12 mm de ancho, un Code128 de SKU real (143
 * módulos) no cabe horizontal — requiere rotarse 90° para usar el largo de avance
 * como ancho de barras.
 */
import { encodeCode128, codesToBinaryString } from './barcodeGenerator';

/** 203 dpi = 8 puntos por milímetro. Es la resolución de toda la familia P12/P15. */
export const DOTS_PER_MM = 8;

/**
 * Módulos de silencio exigidos por ISO/IEC 15417 a cada lado del código.
 * Sin ellos el lector no distingue el arranque y la tasa de lectura cae.
 */
export const QUIET_ZONE_MODULES = 10;

/** 0 = las barras cruzan el ancho fijo del rollo; 90 = cruzan el largo de avance. */
export type LabelRotation = 0 | 90;

export interface LabelMedia {
  id: string;
  nombre: string;
  /** Ancho fijo del rollo. No puede superarse: es el cabezal. */
  widthMm: number;
  /** Largo de avance: cuánto papel consume cada etiqueta. */
  heightMm: number;
  /** Separación entre etiquetas. */
  gapMm: number;
  /** Rotación recomendada para que un código de barras de longitud real encaje. */
  rotacion: LabelRotation;
}

/**
 * Rollos comerciales reales de la familia P12/P15. El 12×22 no está en el
 * catálogo del driver `@thermal-label/marklife`, por eso se declara aquí: la
 * impresora no reporta qué medios tiene cargados.
 *
 * Ordenados de menor a mayor: el operario elige el que tiene cargado.
 */
export const ROLLOS: LabelMedia[] = [
  { id: '12x22', nombre: '12 × 22 mm', widthMm: 12, heightMm: 22, gapMm: 2, rotacion: 90 },
  { id: '12x30', nombre: '12 × 30 mm', widthMm: 12, heightMm: 30, gapMm: 2, rotacion: 90 },
  { id: '12x40', nombre: '12 × 40 mm', widthMm: 12, heightMm: 40, gapMm: 2, rotacion: 90 },
  { id: '14x30', nombre: '14 × 30 mm', widthMm: 14, heightMm: 30, gapMm: 2, rotacion: 90 },
  { id: '14x40', nombre: '14 × 40 mm', widthMm: 14, heightMm: 40, gapMm: 2, rotacion: 90 },
  { id: '15x30', nombre: '15 × 30 mm', widthMm: 15, heightMm: 30, gapMm: 2, rotacion: 90 },
  { id: '15x50', nombre: '15 × 50 mm', widthMm: 15, heightMm: 50, gapMm: 2, rotacion: 90 },
];

/** Rollo por defecto al elegir una etiqueta troquelada: el menor con margen cómodo. */
export const DEFAULT_ROLL_ID = '12x40';

/** Módulos que ocupa un texto en Code128, incluidas las dos zonas de silencio. */
export function moduleCount(texto: string): number {
  return codesToBinaryString(encodeCode128(texto)).length + QUIET_ZONE_MODULES * 2;
}

export interface FitResult {
  /** `false` cuando el módulo resultante es menor a 1 punto: no hay medios puntos en el papel. */
  cabe: boolean;
  dotsPerModule: number;
  /** Advertencia por módulo entre 1 y 1,5 puntos: legible pero frágil al roce. */
  justo: boolean;
}

/**
 * Evalúa si un código cabe en un rollo con la rotación dada.
 *
 * La rotación decide qué dimensión limita: sin rotar manda el ancho fijo del
 * cabezal; rotado 90°, el largo de avance pasa a ser el ancho disponible.
 */
export function evaluateFit(
  texto: string,
  media: LabelMedia,
  rotation: LabelRotation = media.rotacion
): FitResult {
  const disponibleMm = rotation === 90 ? media.heightMm : media.widthMm;
  const dots = disponibleMm * DOTS_PER_MM;
  const dotsPerModule = dots / moduleCount(texto);
  return {
    cabe: dotsPerModule >= 1,
    dotsPerModule,
    justo: dotsPerModule >= 1 && dotsPerModule < 1.5,
  };
}

/** Resuelve un perfil por su id. Devuelve `undefined` si el rollo no está catalogado. */
export function findRoll(id: string): LabelMedia | undefined {
  return ROLLOS.find(r => r.id === id);
}

/** Resuelve un rollo por id, cayendo al por defecto si no existe o no se indicó. */
export function resolveRoll(id?: string): LabelMedia {
  return findRoll(id || '') || findRoll(DEFAULT_ROLL_ID)!;
}

export type FitQuality = 'optimo' | 'ok' | 'justo' | 'no-cabe';

/**
 * Traduce el resultado numérico a una etiqueta legible para el selector.
 * Los cortes (2,0 y 1,5 dots/módulo) salen del ROADMAP §31, medidos con el
 * generador real: por debajo de 1,5 el código es frágil al roce.
 */
export function fitQuality(fit: FitResult): FitQuality {
  if (!fit.cabe) return 'no-cabe';
  if (fit.dotsPerModule >= 2) return 'optimo';
  if (fit.dotsPerModule >= 1.5) return 'ok';
  return 'justo';
}

/** Texto corto y operativo para la UI, con el motivo del aviso. */
export const FIT_QUALITY_LABEL: Record<FitQuality, string> = {
  optimo: 'Óptimo',
  ok: 'Bueno',
  justo: 'Al límite (se lee con dificultad)',
  'no-cabe': 'No cabe',
};

/**
 * Descriptor de medio en la forma que espera `@thermal-label/marklife-web`.
 * Su tipo se declara estructuralmente para no acoplar este módulo al driver.
 */
export function toMediaDescriptor(media: LabelMedia): {
  id: string;
  name: string;
  type: 'die-cut';
  widthMm: number;
  heightMm: number;
} {
  return {
    id: media.id,
    name: media.nombre,
    type: 'die-cut',
    widthMm: media.widthMm,
    heightMm: media.heightMm,
  };
}
