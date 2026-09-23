import type { Html5QrcodeSupportedFormats } from 'html5-qrcode';

/**
 * Valores del enum `Html5QrcodeSupportedFormats` de la librería. Se replican aquí
 * en vez de importarlos porque importar el enum arrastra toda la librería
 * (~110 KB gzip, ~24% del bundle inicial) al chunk de arranque, y solo se necesita
 * al abrir el escáner. Son el contrato público y estable del enum (`core.d.ts`).
 */
const FORMAT = {
  QR_CODE: 0,
  CODE_39: 3,
  CODE_128: 5,
  ITF: 8,
  EAN_13: 9,
  EAN_8: 10,
  UPC_A: 14,
  UPC_E: 15,
} satisfies Record<string, Html5QrcodeSupportedFormats>;

/**
 * Formatos que la app debe leer en bodega: retail (EAN/UPC), góndola (CODE_128/39),
 * QR de etiqueta interna e ITF (intercalado 2 de 5, usado en cajas y pallets).
 * Debe ser idéntico en todos los lectores: un código que un terminal acepta y otro
 * rechaza se traduce en un conteo incompleto.
 */
export const BARCODE_SUPPORTED_FORMATS: Html5QrcodeSupportedFormats[] = [
  FORMAT.EAN_13,
  FORMAT.EAN_8,
  FORMAT.CODE_128,
  FORMAT.CODE_39,
  FORMAT.UPC_A,
  FORMAT.UPC_E,
  FORMAT.QR_CODE,
  FORMAT.ITF,
];

/** Marca visible que identifica la cámara trasera frente a la frontal del dispositivo. */
const REAR_CAMERA_PATTERN = /back|rear|trasera|environment|externa|pda|2/i;

/** Elige la cámara trasera; si no puede identificarla, usa la última (suele ser la trasera). */
export function pickRearCamera<T extends { id: string; label?: string }>(devices: T[]): T | null {
  if (!devices || devices.length === 0) return null;
  return devices.find(d => REAR_CAMERA_PATTERN.test(d.label || '')) || devices[devices.length - 1];
}