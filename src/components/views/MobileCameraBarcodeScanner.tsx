import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, Zap, Volume2, VolumeX, ShieldAlert } from 'lucide-react';
import { playBeep } from '../../utils/stockCountUtils';

interface MobileCameraBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
  activeLocation?: string;
  sessionName?: string;
}

export const MobileCameraBarcodeScanner: React.FC<MobileCameraBarcodeScannerProps> = ({
  isOpen,
  onClose,
  onScan,
  activeLocation,
  sessionName
}) => {
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [scannerStatus, setScannerStatus] = useState<'IDLE' | 'STARTING' | 'RUNNING' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [scanFeedbackCount, setScanFeedbackCount] = useState<number>(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = 'mobile-pda-barcode-scanner-stream';
  const lastScanTimestamp = useRef<number>(0);

  // Initialize and get cameras
  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    let isMounted = true;

    async function initCamera() {
      try {
        setScannerStatus('STARTING');
        setErrorMessage('');

        if (!navigator?.mediaDevices?.getUserMedia) {
          if (!isMounted) return;
          setScannerStatus('ERROR');
          setErrorMessage('El contexto del navegador no permite acceso a la cámara. Usa la lectura por láser PDA o texto manual.');
          return;
        }

        const devices = await Html5Qrcode.getCameras().catch(err => {
          const msg = String(err?.message || err || '');
          if (msg.includes('NotAllowedError') || msg.includes('Permission') || msg.includes('not allowed')) {
            throw new Error('Permiso de cámara denegado o restringido en este contexto.');
          }
          throw err;
        });
        if (!isMounted) return;

        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera ("environment")
          const backCam = devices.find(d => 
            /back|rear|trasera|environment|externa|pda|2/i.test(d.label)
          );
          const defaultCamId = backCam ? backCam.id : devices[devices.length - 1].id;
          setSelectedCameraId(defaultCamId);
          startScannerWithCamera(defaultCamId);
        } else {
          setScannerStatus('ERROR');
          setErrorMessage('No se detectaron cámaras en el dispositivo. Si usas un PDA con láser integrado, simplemente usa el botón físico de disparo con el cursor en el campo de texto.');
        }
      } catch (err: any) {
        if (!isMounted) return;
        setScannerStatus('ERROR');
        const errMsg = String(err?.message || err || '');
        setErrorMessage(
          (errMsg.includes('Permission') || errMsg.includes('NotAllowedError') || errMsg.includes('not allowed') || errMsg.includes('denegado'))
            ? 'Permiso de cámara restringido o denegado en el navegador. Puedes ingresar o pistolear el código manualmente.' 
            : 'Error al inicializar cámara: ' + (errMsg || 'Desconocido')
        );
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen]);

  // Audio & Haptic Feedback
  const triggerSuccessFeedback = () => {
    if (soundEnabled) {
      playBeep('success');
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(35);
      } catch {}
    }
  };

  const startScannerWithCamera = async (cameraId: string) => {
    try {
      if (scannerRef.current) {
        await stopScanner();
      }

      setScannerStatus('STARTING');
      const formatsToSupport: Html5QrcodeSupportedFormats[] = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.ITF
      ];

      const html5QrCode = new Html5Qrcode(readerElementId, {
        formatsToSupport,
        verbose: false
      });
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        cameraId,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(minEdge * 0.85),
              height: Math.floor(minEdge * 0.55)
            };
          },
          aspectRatio: 1.333333
        },
        (decodedText) => {
          const now = Date.now();
          const cleanText = decodedText.trim();
          
          // Debounce same code scan within 1.2s to prevent runaway scans, but allow different codes instantly
          if (cleanText === lastScannedCode && now - lastScanTimestamp.current < 1200) {
            return;
          }
          if (now - lastScanTimestamp.current < 400) {
            return;
          }

          lastScanTimestamp.current = now;
          setLastScannedCode(cleanText);
          setScanFeedbackCount(c => c + 1);
          triggerSuccessFeedback();
          onScan(cleanText);
        },
        () => {
          // Scanner frame error (silent frame skipping)
        }
      );

      setScannerStatus('RUNNING');

      // Check for torch capability
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if ((capabilities as any)?.torch) {
          setHasTorch(true);
        }
      } catch {}

    } catch (err: any) {
      setScannerStatus('ERROR');
      setErrorMessage(err?.message || 'No se pudo iniciar el lector de cámara.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setScannerStatus('IDLE');
    setTorchOn(false);
  };

  const handleToggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any]
      });
      setTorchOn(nextTorch);
    } catch {}
  };

  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamId = cameras[nextIndex].id;
    setSelectedCameraId(nextCamId);
    await startScannerWithCamera(nextCamId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col justify-between select-none animate-in fade-in duration-150">
      
      {/* Top Mobile Bar */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-white safe-top">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-600 rounded-xl">
            <Camera className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold leading-tight">Lector de Cámara Móvil / PDA</h3>
            <p className="text-[11px] text-slate-400 font-mono">
              {sessionName ? `Sesión: ${sessionName}` : 'Pistoleo Activo'}
              {activeLocation ? ` • 📍 ${activeLocation}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              onClick={handleToggleTorch}
              className={`p-2.5 rounded-xl border transition-all ${
                torchOn
                  ? 'bg-amber-500 border-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/30'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title="Linterna / Flash"
            >
              <Zap className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border transition-all ${
              soundEnabled
                ? 'bg-slate-800 border-slate-700 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
            title="Sonido de confirmación"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {cameras.length > 1 && (
            <button
              onClick={handleSwitchCamera}
              className="p-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 rounded-xl"
              title="Cambiar Cámara"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-2.5 bg-slate-800 hover:bg-red-600/80 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewfinder Stream Area */}
      <div className="flex-1 relative flex items-center justify-center p-2 overflow-hidden bg-black">
        <div 
          id={readerElementId} 
          className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-800 bg-slate-950"
        />

        {/* Dynamic Scanning Reticle Overlay */}
        {scannerStatus === 'RUNNING' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            <div className="w-72 h-44 border-2 border-blue-500/80 rounded-2xl relative shadow-[0_0_20px_rgba(59,130,246,0.3)] flex items-center justify-center">
              {/* Corner Targets */}
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

              {/* Animated Laser Bar */}
              <div className="w-full h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-bounce opacity-85" />
            </div>

            <p className="mt-4 px-3 py-1 rounded-full bg-black/70 text-slate-200 text-xs font-semibold backdrop-blur-md">
              Apunta el código de barras dentro del marco
            </p>
          </div>
        )}

        {/* Loading / Error States */}
        {scannerStatus === 'STARTING' && (
          <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-white gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-semibold">Activando cámara de escaneo...</p>
          </div>
        )}

        {scannerStatus === 'ERROR' && (
          <div className="absolute inset-6 bg-slate-900/95 border border-red-900/50 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-white gap-3">
            <ShieldAlert className="w-12 h-12 text-red-400" />
            <h4 className="text-base font-bold text-red-200">Aviso de Cámara</h4>
            <p className="text-xs text-slate-300 max-w-sm">{errorMessage}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => selectedCameraId && startScannerWithCamera(selectedCameraId)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-bold rounded-xl"
              >
                Reintentar
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status & Last Scan Bar */}
      <div className="p-4 bg-slate-900/95 border-t border-slate-800 safe-bottom">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="truncate pr-2">
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 block">
              Último Código Leído
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-mono font-extrabold text-emerald-400">
                {lastScannedCode || 'Esperando escaneo...'}
              </span>
              {scanFeedbackCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 text-[10px] font-bold animate-pulse">
                  ✓ Registrado
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-lg active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            Finalizar Pistoleo
          </button>
        </div>
      </div>

    </div>
  );
};
