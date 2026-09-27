/**
 * Rasterizador de etiquetas térmicas a RGBA (1 bit útil por píxel).
 *
 * Puro TS, sin canvas ni DOM. Un código de barras son barras verticales de grosor
 * constante, así que se pinta con aritmética entera directamente sobre el búfer.
 * Eso permite verificar el resultado sin navegador y sin impresora, que es lo único
 * que se puede hacer antes de que llegue la P15 (ROADMAP §31).
 *
 * No rasteriza el texto legible: eso exigiría un motor de fuentes o un canvas. El
 * paso que el lector necesita es la parte que aquí se garantiza.
 *
 * La salida tiene la forma de `RawImageData` de `@thermal-label/contracts` (el
 * mismo `{ width, height, data }` de `ImageData`), declarada estructuralmente para
 * no acoplar este módulo al driver.
 */
import { encodeCode128, codesToBinaryString } from './barcodeGenerator';
import {
  DOTS_PER_MM,
  QUIET_ZONE_MODULES,
  moduleCount,
  type LabelMedia,
  type LabelRotation
} from './labelMediaProfile';

/** Bitmap RGBA listo para entregar al transporte. Blanco no imprime; negro sí. */
export interface RasterImage {
  width: number;
  height: number;
  /** 4 bytes por píxel, en orden R, G, B, A. */
  data: Uint8ClampedArray;
}

const BLANCO: readonly number[] = [255, 255, 255, 255];
const NEGRO: readonly number[] = [0, 0, 0, 255];

/** Tamaño de la etiqueta en puntos, que es el lienzo real del cabezal. */
export function labelSizeDots(media: LabelMedia): { width: number; height: number } {
  return {
    width: media.widthMm * DOTS_PER_MM,
    height: media.heightMm * DOTS_PER_MM
  };
}

/**
 * Ancho de módulo en puntos, truncado a entero.
 *
 * El cabezal sólo imprime puntos completos: un módulo de 2,79 puntos obligaría a
 * alternar barras de 2 y 3 puntos, y esa irregularidad es justo lo que penalizan
 * los lectores. Truncar garantiza que ningún módulo quede más estrecho que el
 * nominal. Devuelve 0 cuando el código no cabe (el caso 12 mm sin rotar).
 */
export function moduleWidthDots(
  texto: string,
  media: LabelMedia,
  rotation: LabelRotation = media.rotacion
): number {
  const disponibleMm = rotation === 90 ? media.heightMm : media.widthMm;
  return Math.floor((disponibleMm * DOTS_PER_MM) / moduleCount(texto));
}

/**
 * Rasteriza un código Code128 al tamaño exacto de un rollo.
 *
 * Devuelve `null` si el texto está vacío o si el código no cabe (ancho de módulo
 * 0). El llamador decide qué hacer; aquí no se inventa una etiqueta a medias.
 *
 * Con `rotation: 90` el eje de lectura del código pasa a ser vertical, de modo que
 * ocupa el largo de avance en vez del ancho del cabezal. Las barras cruzan la
 * dimensión perpendicular completa, que es lo que maximiza la lectura.
 */
export function rasterizeBarcode(
  texto: string,
  media: LabelMedia,
  rotation: LabelRotation = media.rotacion
): RasterImage | null {
  const limpio = String(texto || '').trim();
  if (!limpio) return null;

  const moduleW = moduleWidthDots(limpio, media, rotation);
  if (moduleW < 1) return null;

  const binary = codesToBinaryString(encodeCode128(limpio));
  const totalModulos = binary.length + QUIET_ZONE_MODULES * 2;
  const codeDots = totalModulos * moduleW;

  const { width, height } = labelSizeDots(media);
  const data = new Uint8ClampedArray(width * height * 4);

  const pintarTodo = (color: readonly number[]) => {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }
  };
  pintarTodo(BLANCO);

  // Las barras van centradas en su eje: el margen sobrante queda repartido y el
  // código no se pega a un borde troquelado.
  const inicio = Math.floor(((rotation === 90 ? height : width) - codeDots) / 2);

  for (let i = 0; i < binary.length; i++) {
    if (binary[i] !== '1') continue;
    const desde = inicio + (QUIET_ZONE_MODULES + i) * moduleW;
    for (let m = 0; m < moduleW; m++) {
      const posicion = desde + m;
      if (posicion < 0) continue;
      if (rotation === 90) {
        if (posicion >= height) continue;
        // Fila completa: el eje de lectura es vertical.
        const base = posicion * width * 4;
        for (let x = 0; x < width; x++) {
          const idx = base + x * 4;
          data[idx] = NEGRO[0];
          data[idx + 1] = NEGRO[1];
          data[idx + 2] = NEGRO[2];
          data[idx + 3] = NEGRO[3];
        }
      } else {
        if (posicion >= width) continue;
        // Columna completa: el eje de lectura es horizontal.
        for (let y = 0; y < height; y++) {
          const idx = (y * width + posicion) * 4;
          data[idx] = NEGRO[0];
          data[idx + 1] = NEGRO[1];
          data[idx + 2] = NEGRO[2];
          data[idx + 3] = NEGRO[3];
        }
      }
    }
  }

  return { width, height, data };
}
