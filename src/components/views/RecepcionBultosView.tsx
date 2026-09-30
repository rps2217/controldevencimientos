import React, { useState, useEffect, useRef } from 'react';
import { Printer, Trash2, ArrowLeft, Truck, Check, AlertTriangle, Scan } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { executeThermalPrint } from '../../utils/ticketUtils';
import { indexedDbService } from '../../db/indexedDbService';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';

/**
 * Módulo de Recepción Rápida (Testimonio de Arribo)
 * Diseño Mobile-First para uso en PDA/Móviles con feedback háptico y auditivo.
 */
export default function RecepcionBultosView() {
  const navigate = useNavigate();
  const [bultoCode, setBultoCode] = useState('');
  const [sessionItems, setSessionItems] = useState<{ code: string; timestamp: number }[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus automático al montar, tras cada escaneo y al hacer click en el contenedor
  useEffect(() => {
    if (!isCameraActive) {
      inputRef.current?.focus();
    }
  }, [sessionItems, feedback, isCameraActive]);

  const handleContainerClick = () => {
    if (!isCameraActive) {
      inputRef.current?.focus();
    }
  };

  // Callback de escaneo continuo con la cámara móvil
  const handleCameraScan = (code: string) => {
    const formattedCode = code.trim().toUpperCase();
    if (!formattedCode) return;

    if (sessionItems.some(item => item.code === formattedCode)) {
      showTemporaryFeedback('error', `El bulto ${formattedCode} ya ha sido escaneado.`);
      return;
    }

    const timestamp = Date.now();
    void (async () => {
      try {
        await indexedDbService.enqueueMutation({
          type: 'append',
          sheetTitle: 'RECEP_BULTOS',
          values: {
            'TIMESTAMP': new Date(timestamp).toISOString(),
            'CODIGO_BULTO': formattedCode
          }
        });

        setSessionItems(prev => [...prev, { code: formattedCode, timestamp }]);
        showTemporaryFeedback('success', `Bulto ${formattedCode} registrado.`);
      } catch (err) {
        console.error('Error guardando bulto:', err);
        showTemporaryFeedback('error', 'Error al guardar bulto.');
      }
    })();
  };

  // Inicializar hook genérico de escaneo continuo
  const { switchCamera, toggleTorch, hasTorch, torchOn } = useBarcodeScanner({
    elementId: 'bultos-camera-viewport',
    active: isCameraActive,
    onScan: handleCameraScan,
    repeatWindowMs: 2500, // Evitar lecturas duplicadas en ráfaga
    fps: 15,
  });

  // Sintetizador de audio nativo no-bloqueante para PDA/Móviles
  const triggerAudioFeedback = (type: 'success' | 'error') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      if (type === 'success') {
        // Beep agudo corto de confirmación (tipo láser Honeywell/Zebra)
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1400, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.12);
        
        // Vibración corta si el hardware lo soporta (100ms)
        if (navigator.vibrate) {
          navigator.vibrate(100);
        }
      } else {
        // Beep grave de error (doble tono descendente)
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(220, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
        
        if (navigator.vibrate) {
          navigator.vibrate([150, 80, 150]);
        }
      }
    } catch (e) {
      console.warn('Web Audio API not supported/active:', e);
    }
  };

  const showTemporaryFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    triggerAudioFeedback(type);
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = bultoCode.trim().toUpperCase(); // Normalizar a mayúsculas
    if (!code) return;

    if (sessionItems.some(item => item.code === code)) {
      setBultoCode('');
      showTemporaryFeedback('error', `El bulto ${code} ya ha sido escaneado.`);
      return;
    }

    const timestamp = Date.now();
    
    try {
      // Persistir en cola offline para sincronización
      await indexedDbService.enqueueMutation({
        type: 'append',
        sheetTitle: 'RECEP_BULTOS',
        values: {
          'TIMESTAMP': new Date(timestamp).toISOString(),
          'CODIGO_BULTO': code
        }
      });

      setSessionItems(prev => [...prev, { code, timestamp }]);
      setBultoCode('');
      showTemporaryFeedback('success', `Bulto ${code} registrado.`);
    } catch (err) {
      console.error('Error guardando bulto:', err);
      showTemporaryFeedback('error', 'Error al guardar bulto en base de datos local.');
    }
  };

  const handleClear = async () => {
    if (sessionItems.length === 0) return;
    if (window.confirm('¿Borrar todos los bultos de la sesión actual? Esta acción no altera lo que ya fue guardado en Google Sheets.')) {
      setSessionItems([]);
      triggerAudioFeedback('error');
    }
  };

  const handlePrint = () => {
    if (sessionItems.length === 0) return;
    
    setIsPrinting(true);
    setTimeout(() => {
      executeThermalPrint({
        elementId: 'thermal-ticket-root',
        paperWidth: '80mm',
        orientation: 'portrait',
        cutMarginMm: 2,
        onAfterPrint: () => setIsPrinting(false)
      });
    }, 150);
  };

  return (
    <div 
      onClick={handleContainerClick}
      className="flex flex-col h-screen w-full bg-slate-50 dark:bg-slate-950 p-2 sm:p-4 gap-2 select-none"
    >
      {/* Standard Header Mobile */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 px-3.5 py-2.5 rounded-2xl shadow-2xs border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => navigate('/')} 
            className="h-10 w-10 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer active:scale-95"
            title="Volver al dashboard"
          >
            <ArrowLeft size={20} className="stroke-[2.5]" />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400">
              <Truck className="w-4 h-4" />
            </div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap">
              Arribo de Bultos
            </h1>
          </div>
        </div>
        <span className="font-mono text-xs font-extrabold px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200/80 dark:border-orange-900/60 shrink-0">
          {sessionItems.length} Bultos
        </span>
      </div>

      {/* Alerta de Feedback instantáneo de escaneo */}
      {feedback && (
        <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-bold transition-all border ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200/60' 
            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200/60'
        }`}>
          {feedback.type === 'success' ? <Check size={16} className="shrink-0" /> : <AlertTriangle size={16} className="shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Input de Scanner con Captura Continua de Cámara Integrada */}
      <div className="flex flex-col gap-2 shrink-0">
        <form onSubmit={handleScan} className="flex gap-2">
          <div className="relative flex-1 flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={bultoCode}
              onChange={(e) => setBultoCode(e.target.value)}
              placeholder="Escanear bulto o toque icono cámara..."
              className="w-full p-3.5 pr-12 rounded-2xl border-2 border-orange-500 bg-white dark:bg-slate-900 text-base font-bold focus:outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-4 focus:ring-orange-500/15 transition-all shadow-2xs"
              autoComplete="off"
            />
            {/* Botón de Cámara Integrado dentro del Input */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCameraActive(!isCameraActive);
              }}
              className={`absolute right-3.5 p-1.5 rounded-xl transition-all duration-300 ${
                isCameraActive 
                  ? 'bg-orange-600 text-white shadow-xs shadow-orange-500/35 scale-105 border border-orange-400' 
                  : 'text-slate-400 dark:text-slate-500 hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Activar captura continua usando la cámara del móvil"
            >
              <Scan size={18} className={`stroke-[2.5] ${isCameraActive ? 'animate-pulse' : ''}`} />
            </button>
          </div>
          <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white px-5 rounded-2xl font-extrabold text-sm shadow-xs shadow-orange-500/20 active:scale-95 transition-all shrink-0">OK</button>
        </form>

        {/* Visor de Cámara para Escaneo Continuo */}
        {isCameraActive && (
          <div className="relative bg-black rounded-2xl border-2 border-orange-500 overflow-hidden shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Feed de Video */}
            <div id="bultos-camera-viewport" className="w-full h-44 bg-slate-950" />
            
            {/* Guía Holográfica del Escáner */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div className="w-4/5 h-1/2 border-2 border-dashed border-orange-500/70 rounded-xl relative">
                {/* Láser óptico animado */}
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-bounce" />
              </div>
              <span className="text-[9px] text-white/90 font-bold bg-black/60 px-2 py-0.5 rounded-full mt-2 tracking-wide uppercase">
                Alinee el código de barras
              </span>
            </div>

            {/* Controles de Cámara flotantes */}
            <div className="absolute bottom-2 left-2 right-2 flex justify-between gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  switchCamera();
                }}
                className="bg-black/70 hover:bg-black text-white px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
              >
                Girar Cámara
              </button>
              {hasTorch && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTorch();
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                    torchOn ? 'bg-orange-500 text-white' : 'bg-black/70 hover:bg-black text-white'
                  }`}
                >
                  {torchOn ? 'Linterna: ON' : 'Linterna: OFF'}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCameraActive(false);
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lista de últimos escaneos */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col">
        {sessionItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
            <Truck size={48} className="stroke-[1.5] text-slate-300 dark:text-slate-700 mb-3 animate-pulse" />
            <p className="text-sm font-semibold">Terminal de Recepción Activa</p>
            <p className="text-[11px] mt-1 max-w-[200px] leading-relaxed">Conecte un lector Bluetooth/OTG o use el teclado para escanear etiquetas de bultos.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {sessionItems.slice().reverse().map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-850/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold px-1.5 py-0.5 rounded-md font-mono">
                    {sessionItems.length - i}
                  </span>
                  <div className="font-mono text-base font-bold text-slate-800 dark:text-slate-200">{item.code}</div>
                </div>
                <div className="text-xs text-slate-400 font-medium font-mono">
                  {new Date(item.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="grid grid-cols-2 gap-2 shrink-0">
        <button 
          disabled={sessionItems.length === 0}
          onClick={(e) => { e.stopPropagation(); handleClear(); }} 
          className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 p-4 rounded-2xl font-extrabold text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-40 disabled:hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed text-sm"
        >
          <Trash2 size={18} className="stroke-[2.5]" /> Borrar Sesión
        </button>
        <button 
          disabled={sessionItems.length === 0}
          onClick={(e) => { e.stopPropagation(); handlePrint(); }} 
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-2xl font-extrabold shadow-xs shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed text-sm"
        >
          <Printer size={18} className="stroke-[2.5]" /> Imprimir Ticket
        </button>
      </div>

      {/* Printable Area invisible in normal web view but visible during executeThermalPrint / print */}
      {isPrinting && (
        <div id="thermal-ticket-root" className="bg-white text-black font-mono p-4 text-xs max-w-[80mm] mx-auto border border-slate-100">
          <div className="font-bold text-sm mb-1 text-center">ARRIBO DE BULTOS</div>
          <div className="text-[10px] text-center mb-2">
            <div>Fecha: {new Date().toLocaleDateString('es-CL')}</div>
            <div>Hora: {new Date().toLocaleTimeString('es-CL')}</div>
          </div>
          
          <div className="border-t border-b border-black py-2 my-2 space-y-1">
            {sessionItems.map((item, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span>{i + 1}. {item.code}</span>
                <span className="font-mono">{new Date(item.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
          
          <div className="flex justify-between font-bold mt-2">
            <span>TOTAL BULTOS:</span>
            <span>{sessionItems.length}</span>
          </div>
          
          <div className="text-center text-[10px] mt-4 border-t border-dashed border-black pt-2">
            --- FIN DE RECEPCIÓN ---
          </div>
        </div>
      )}
    </div>
  );
}
