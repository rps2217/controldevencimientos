import { Html5QrcodeSupportedFormats } from 'html5-qrcode';

/**
 * Formatos que la app debe leer en bodega: retail (EAN/UPC), góndola (CODE_128/39),
 * QR de etiqueta interna e ITF (intercalado 2 de 5, usado en cajas y pallets).
 * Debe ser idéntico en todos los lectores: un código que un terminal acepta y otro
 * rechaza se traduce en un conteo incompleto.
 */
export const BARCODE_SUPPORTED_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.ITF,
];

/** Marca visible que identifica la cámara trasera frente a la frontal del dispositivo. */
const REAR_CAMERA_PATTERN = /back|rear|trasera|environment|externa|pda|2/i;

/** Elige la cámara trasera; si no puede identificarla, usa la última (suele ser la trasera). */
export function pickRearCamera<T extends { id: string; label?: string }>(devices: T[]): T | null {
  if (!devices || devices.length === 0) return null;
  return devices.find(d => REAR_CAMERA_PATTERN.test(d.label || '')) || devices[devices.length - 1];
}