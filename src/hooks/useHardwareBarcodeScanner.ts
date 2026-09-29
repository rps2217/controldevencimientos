import { useEffect, useRef } from 'react';

export interface UseHardwareBarcodeScannerOptions {
  /** Si el hook está activo escuchando eventos de teclado */
  enabled?: boolean;
  /** Callback ejecutado cuando se detecta un escaneo completo de hardware */
  onScan: (barcode: string) => void;
  /** Longitud mínima requerida para considerar un código válido (por defecto 3) */
  minBarcodeLength?: number;
  /** Tiempo máximo en milisegundos entre pulsaciones de tecla para considerarse ráfaga de escáner (por defecto 50ms) */
  maxIntervalMs?: number;
  /** Si se debe prevenir el comportamiento por defecto del Enter al terminar la lectura */
  preventDefaultOnEnter?: boolean;
  /**
   * Si es true, intercepta el escaneo incluso si el usuario tiene el foco en un input o textarea.
   * Si es false, no intercepta cuando el foco está en un input/textarea editable para permitir edición manual.
   */
  interceptInputFocus?: boolean;
}

/**
 * Hook para detectar lectores de código de barras físicos / pistolas láser / terminales RF
 * en modo emulación de teclado (HID USB o Bluetooth).
 *
 * Principio operativo:
 * Un lector de hardware envía una ráfaga de caracteres con intervalos ultracortos
 * (< 30-50 ms por tecla) y culmina con 'Enter' (o 'Tab').
 * Un humano teclea a más de 80-150 ms por carácter.
 */
export function useHardwareBarcodeScanner({
  enabled = true,
  onScan,
  minBarcodeLength = 3,
  maxIntervalMs = 50,
  preventDefaultOnEnter = true,
  interceptInputFocus = false,
}: UseHardwareBarcodeScannerOptions): void {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar teclas modificadoras solitarias
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) {
        return;
      }

      const activeElement = document.activeElement;
      const tag = activeElement?.tagName?.toUpperCase();
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (activeElement as HTMLElement)?.isContentEditable === true;

      // Si no se debe interceptar inputs y estamos en un campo editable, no procesar
      if (!interceptInputFocus && isEditable) {
        return;
      }

      const now = performance.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Si pasó demasiado tiempo entre teclas, reiniciar el búfer (escritura humana lenta)
      if (interval > maxIntervalMs) {
        bufferRef.current = '';
      }

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim();
        if (barcode.length >= minBarcodeLength) {
          if (preventDefaultOnEnter) {
            e.preventDefault();
            e.stopPropagation();
          }
          // Limpiar búfer antes del callback
          bufferRef.current = '';
          onScanRef.current(barcode);
        } else {
          bufferRef.current = '';
        }
        return;
      }

      // Acumular caracteres imprimibles (longitud 1)
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled, minBarcodeLength, maxIntervalMs, preventDefaultOnEnter, interceptInputFocus]);
}
