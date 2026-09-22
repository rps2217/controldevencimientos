import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { BARCODE_SUPPORTED_FORMATS, pickRearCamera } from '../utils/barcodeScannerConfig';
import { getErrorMessage } from '../utils/pureCalculations';

/**
 * Ciclo de vida de la cámara de lectura de códigos, compartido por los lectores
 * de la app (terminal de pistoleo, escáner móvil y modal de escaneo).
 *
 * Existía duplicado: la secuencia "elegir cámara trasera, arrancar con los
 * formatos de bodega, detectar linterna, parar" se repetía literalmente, y con
 * ella los mismos fallos (no soltar la cámara al desmontar, dejar el lector
 * corriendo al cambiar de modo). Una sola copia garantiza además que todos los
 * terminales acepten exactamente los mismos formatos, que es una invariante de
 * conteo: un código que un lector acepta y otro rechaza deja el conteo incompleto.
 */

export type ScannerStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'ERROR';

export interface CameraDevice {
  id: string;
  label: string;
}

/** Caja de lectura: número, dimensiones fijas o función del tamaño del visor. */
type QrBox = number | { width: number; height: number } | ((w: number, h: number) => { width: number; height: number });

export interface UseBarcodeScannerOptions {
  /** Elemento contenedor donde el lector inyecta el video. */
  elementId: string;
  /** El lector sólo corre mientras esto sea verdadero. */
  active: boolean;
  onScan: (code: string) => void;
  /** Ventana en la que se ignora el mismo código repetido (evita ráfagas). */
  repeatWindowMs?: number;
  /** Ventana en la que se ignora cualquier lectura distinta. */
  throttleMs?: number;
  /** Tras una lectura válida, detiene el lector (escaneo de un solo disparo). */
  stopOnScan?: boolean;
  /** Relaja la detección de linterna para visores que no exponen capacidades. */
  torchOptimistic?: boolean;
  qrbox?: QrBox;
  aspectRatio?: number;
  fps?: number;
}

export interface UseBarcodeScannerResult {
  status: ScannerStatus;
  error: string;
  cameras: CameraDevice[];
  selectedCameraId: string;
  torchOn: boolean;
  hasTorch: boolean;
  start: (cameraId?: string) => Promise<void>;
  stop: () => Promise<void>;
  switchCamera: () => Promise<void>;
  toggleTorch: () => Promise<void>;
}

function isPermissionError(err: unknown): boolean {
  const msg = getErrorMessage(err);
  return /NotAllowedError|Permission|not allowed|denegado/i.test(msg);
}

export function useBarcodeScanner(options: UseBarcodeScannerOptions): UseBarcodeScannerResult {
  const { elementId, active } = options;

  const [status, setStatus] = useState<ScannerStatus>('IDLE');
  const [error, setError] = useState('');
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  // Las opciones que pueden cambiar en cada render (qrbox suele ser una función
  // en línea) viven en un ref: si entraran en las dependencias de `start`, cada
  // render lo recrearía y el efecto reiniciaría la cámara en bucle.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanAt = useRef(0);
  const lastCode = useRef('');
  // Cada arranque/parada incrementa la época: un arranque asíncrono que termine
  // después de una parada no debe reactivar un lector ya detenido.
  const epoch = useRef(0);

  const stop = useCallback(async () => {
    epoch.current += 1;
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        await scanner.clear();
      } catch {
        // El visor ya estaba detenido o el elemento se desmontó: nada que liberar.
      }
    }
    setStatus('IDLE');
    setTorchOn(false);
  }, []);

  const start = useCallback(async (cameraId?: string) => {
    // Primero se libera el lector anterior; la época se toma después para que su
    // propia parada no invalide este arranque.
    if (scannerRef.current) await stop();
    const myEpoch = ++epoch.current;
    const opts = optionsRef.current;
    try {
      setStatus('STARTING');
      setError('');

      if (!navigator?.mediaDevices?.getUserMedia) {
        setStatus('ERROR');
        setError('El contexto del navegador no permite el acceso a la cámara. Usa el modo Láser PDA o el ingreso manual.');
        return;
      }

      const devices = await Html5Qrcode.getCameras();
      if (myEpoch !== epoch.current) return;

      if (!devices || devices.length === 0) {
        setStatus('ERROR');
        setError('No se detectaron cámaras en el dispositivo. Si usas un PDA con láser integrado, usa el botón físico de disparo con el cursor en el campo de texto.');
        return;
      }

      setCameras(devices);
      const targetId = cameraId || pickRearCamera(devices)?.id || devices[devices.length - 1].id;
      setSelectedCameraId(targetId);

      const html5QrCode = new Html5Qrcode(elementId, {
        formatsToSupport: BARCODE_SUPPORTED_FORMATS,
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        targetId,
        {
          fps: opts.fps ?? 15,
          qrbox: opts.qrbox,
          aspectRatio: opts.aspectRatio,
        },
        (decodedText) => {
          const now = Date.now();
          const code = decodedText.trim();
          if (code === lastCode.current && now - lastScanAt.current < (opts.repeatWindowMs ?? 0)) return;
          if (now - lastScanAt.current < (opts.throttleMs ?? 0)) return;

          lastScanAt.current = now;
          lastCode.current = code;
          optionsRef.current.onScan(code);
          if (opts.stopOnScan) setTimeout(() => { void stop(); }, 0);
        },
        () => {
          // Cuadro sin código legible: el lector reintenta solo.
        }
      );

      if (myEpoch !== epoch.current) {
        await stop();
        return;
      }

      setStatus('RUNNING');
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities() as { torch?: boolean };
        if (capabilities?.torch || opts.torchOptimistic) setHasTorch(true);
      } catch {
        if (opts.torchOptimistic) setHasTorch(true);
      }
    } catch (err: unknown) {
      if (myEpoch !== epoch.current) return;
      setStatus('ERROR');
      setError(
        isPermissionError(err)
          ? 'Permiso de cámara denegado o restringido por el navegador. Puedes ingresar el código manualmente.'
          : `No se pudo iniciar la cámara: ${getErrorMessage(err) || 'error desconocido'}.`
      );
    }
  }, [elementId, stop]);

  const switchCamera = useCallback(async () => {
    if (cameras.length <= 1) return;
    const current = cameras.findIndex(c => c.id === selectedCameraId);
    const next = cameras[(current + 1) % cameras.length];
    await start(next.id);
  }, [cameras, selectedCameraId, start]);

  const toggleTorch = useCallback(async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const next = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: next } as MediaTrackConstraints],
      });
      setTorchOn(next);
    } catch {
      // Algunos visores ignoran la linterna: se mantiene el estado anterior.
    }
  }, [hasTorch, torchOn]);

  useEffect(() => {
    if (active) {
      void start();
    } else {
      void stop();
    }
    return () => {
      void stop();
    };
  }, [active, start, stop]);

  return { status, error, cameras, selectedCameraId, torchOn, hasTorch, start, stop, switchCamera, toggleTorch };
}
