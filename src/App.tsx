import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Link as LinkIcon, CheckCircle2, Compass, QrCode, Camera, ShieldCheck, AlertCircle } from 'lucide-react';
import InventoryDashboard from './components/InventoryDashboard';
import RecepcionBultosView from './components/views/RecepcionBultosView';
import { ToastProvider } from './components/common/ToastContainer';
import { ConfirmProvider } from './components/common/ConfirmDialog';
import { PWAReloadPrompt } from './components/pwa/PWAReloadPrompt';
import { RightDrawerProvider } from './context/RightDrawerContext';
import { ModalsProvider } from './context/ModalsContext';
import { UiSettingsProvider } from './context/UiSettingsContext';
import type { ThemeMode } from './types';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';

import { STORAGE_KEYS, hasDemoEntry, setDemoEntry, isDemoMode } from './utils/appStorage';

export default function App() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupUrl, setSetupUrl] = useState('');
  const [securityToken, setSecurityToken] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [setupError, setSetupError] = useState('');
  const [isChangingUrl, setIsChangingUrl] = useState(false);

  // Estados de escaneo y generación de código QR de configuración
  const [isQrScannerActive, setIsQrScannerActive] = useState(false);
  const [qrMessage, setQrMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isQrGeneratorOpen, setIsQrGeneratorOpen] = useState(false);

  // Sintetizador de audio nativo para feedback en la configuración
  const triggerAudioFeedback = (type: 'success' | 'error') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      if (type === 'success') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
        if (navigator.vibrate) navigator.vibrate(120);
      } else {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(220, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.25);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    } catch {
      // AudioContext no permitido o no soportado
    }
  };

  // Callback al detectar el código QR de configuración
  const handleQrSetupScan = (code: string) => {
    try {
      const data = JSON.parse(code);
      if (data && typeof data === 'object') {
        const url = data.url || '';
        const token = data.token || '';
        const sheetId = data.sheetId || '';
        
        if (url && url.includes('script.google.com/macros/s/')) {
          setSetupUrl(url);
          setSecurityToken(token);
          setSpreadsheetId(sheetId);
          setIsQrScannerActive(false);
          
          triggerAudioFeedback('success');
          setQrMessage({
            type: 'success',
            text: '¡Configuración importada con éxito! Revisa los campos y pulsa "Conectar y Abrir" abajo.'
          });
          setTimeout(() => setQrMessage(null), 7000);
        } else {
          triggerAudioFeedback('error');
          setQrMessage({
            type: 'error',
            text: 'El código QR no contiene una URL válida de Google Apps Script.'
          });
        }
      } else {
        triggerAudioFeedback('error');
        setQrMessage({
          type: 'error',
          text: 'Formato de configuración QR inválido.'
        });
      }
    } catch (e) {
      console.warn('Fallo al parsear QR de configuración:', e);
    }
  };

  // Lector de QR para aprovisionamiento rápido
  const { switchCamera: switchSetupCamera, hasTorch: hasSetupTorch, toggleTorch: toggleSetupTorch, torchOn: setupTorchOn } = useBarcodeScanner({
    elementId: 'setup-qr-camera-viewport',
    active: isQrScannerActive,
    onScan: handleQrSetupScan,
    stopOnScan: true,
    fps: 15,
  });

  // Initialize values on mount
  useEffect(() => {
    try {
      const storedUrl = localStorage.getItem(STORAGE_KEYS.SCRIPT_URL) || '';
      const storedToken = localStorage.getItem(STORAGE_KEYS.SECURITY_TOKEN) || '';
      const storedSheetId = localStorage.getItem(STORAGE_KEYS.SPREADSHEET_ID) || '';
      
      setSetupUrl(storedUrl);
      setSecurityToken(storedToken);
      setSpreadsheetId(storedSheetId);

      const isMobileDevice = window.innerWidth < 768;
      if (!storedUrl) {
        if (isMobileDevice) {
          // En dispositivos móviles, por defecto siempre mostramos el formulario de Google Apps Script si está vacío
          setNeedsSetup(true);
        } else if (!hasDemoEntry()) {
          // En escritorio, solo lo mostramos si el usuario aún no ha elegido explorar con datos de demo
          setNeedsSetup(true);
        }
      }
    } catch (err) {
      console.warn('LocalStorage initialization error:', err);
    }
  }, []);

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const savedVariant = localStorage.getItem(STORAGE_KEYS.THEME_VARIANT);
      const isDark = localStorage.getItem(STORAGE_KEYS.DARK_MODE) === 'true';
      if (!isDark) return 'light';
      return savedVariant === 'gray' ? 'dark-gray' : 'dark-slate';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      if (themeMode === 'light') {
        localStorage.setItem(STORAGE_KEYS.DARK_MODE, 'false');
        document.documentElement.classList.remove('dark', 'theme-gray');
      } else if (themeMode === 'dark-slate') {
        localStorage.setItem(STORAGE_KEYS.DARK_MODE, 'true');
        localStorage.setItem(STORAGE_KEYS.THEME_VARIANT, 'slate');
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('theme-gray');
      } else if (themeMode === 'dark-gray') {
        localStorage.setItem(STORAGE_KEYS.DARK_MODE, 'true');
        localStorage.setItem(STORAGE_KEYS.THEME_VARIANT, 'gray');
        document.documentElement.classList.add('dark', 'theme-gray');
      }
    } catch (err) {
      console.warn('LocalStorage error setting theme:', err);
    }
  }, [themeMode]);

  const handleEditBackendUrl = useCallback(() => setIsChangingUrl(true), []);
  const uiSettingsValue = useMemo(
    () => ({ themeMode, setThemeMode, onEditBackendUrl: handleEditBackendUrl }),
    [themeMode, handleEditBackendUrl]
  );

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupUrl.includes('script.google.com/macros/s/')) {
      setSetupError('La URL no parece ser un enlace válido de Google Apps Script (debe incluir script.google.com/macros/s/.../exec).');
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEYS.SCRIPT_URL, setupUrl.trim());
      localStorage.setItem(STORAGE_KEYS.SECURITY_TOKEN, securityToken.trim());
      localStorage.setItem(STORAGE_KEYS.SPREADSHEET_ID, spreadsheetId.trim());
    } catch (err) {
      console.warn('LocalStorage error setting config:', err);
    }
    // Conectar de verdad deshace la elección de demostración: si no, la bandera
    // sobreviviría a un borrado posterior de la URL y el onboarding no volvería a verse.
    setDemoEntry(false);
    setNeedsSetup(false);
    setIsChangingUrl(false);
    setSetupError('');
  };

  const handleExploreDemo = () => {
    setDemoEntry(true);
    setNeedsSetup(false);
    setIsChangingUrl(false);
    setSetupError('');
  };

  const handleActivateDemo = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.SCRIPT_URL);
      localStorage.removeItem(STORAGE_KEYS.SECURITY_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.SPREADSHEET_ID);
    } catch (err) {
      console.warn('LocalStorage error clearing config:', err);
    }
    setSetupUrl('');
    setSecurityToken('');
    setSpreadsheetId('');
    setDemoEntry(true);
    setNeedsSetup(false);
    setIsChangingUrl(false);
    setSetupError('');
    window.location.reload();
  };

  if (needsSetup || isChangingUrl) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#F8FAFC] dark:bg-slate-950 py-8 px-4 font-sans transition-colors overflow-y-auto">
        <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 my-auto">
          <div className="bg-blue-600 px-6 py-7 text-center text-white">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white bg-opacity-20 mb-3 shadow-xs">
              <LinkIcon className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight">Conectar Google Sheets</h1>
            <p className="mt-1.5 text-blue-100 text-xs">
              Ingresa la URL del Web App de tu Google Apps Script
            </p>
          </div>
          
          <div className="p-6 space-y-5">
            {setupError && (
              <div className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/30 p-3.5 rounded-xl border border-red-100 dark:border-red-900/50">
                {setupError}
              </div>
            )}

            {/* OPCIÓN: APROVISIONAMIENTO RÁPIDO POR QR */}
            <div className="bg-orange-50/50 dark:bg-orange-950/15 border border-orange-100 dark:border-orange-900/40 rounded-2xl p-4 flex flex-col gap-2.5 shadow-2xs">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 rounded-lg shrink-0">
                  <QrCode className="w-4 h-4" />
                </div>
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  Aprovisionamiento por QR
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                ¿Tienes otro dispositivo ya configurado? Escanea su código QR para clonar la conexión al instante y evitar escribir.
              </p>
              
              {!isQrScannerActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsQrScannerActive(true);
                    setQrMessage(null);
                  }}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs shadow-orange-500/20 active:scale-95"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Escanear QR de Otro Dispositivo</span>
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="relative bg-black rounded-xl overflow-hidden border border-orange-400/80 shadow-md">
                    <div id="setup-qr-camera-viewport" className="w-full h-44 bg-slate-950" />
                    
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                      <div className="w-28 h-28 border-2 border-dashed border-orange-400 rounded-lg animate-pulse" />
                      <span className="text-[8px] text-white/95 font-extrabold bg-black/70 px-2 py-0.5 rounded-full mt-2 tracking-wider uppercase">
                        Apunte al código QR
                      </span>
                    </div>

                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex justify-between gap-1 pointer-events-auto">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); switchSetupCamera(); }}
                        className="bg-black/80 hover:bg-black text-white px-2 py-1 rounded text-[9px] font-bold cursor-pointer"
                      >
                        Girar Cámara
                      </button>
                      {hasSetupTorch && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleSetupTorch(); }}
                          className={`px-2 py-1 rounded text-[9px] font-bold cursor-pointer ${
                            setupTorchOn ? 'bg-orange-500 text-white' : 'bg-black/80 hover:bg-black text-white'
                          }`}
                        >
                          Linterna: {setupTorchOn ? 'ON' : 'OFF'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setIsQrScannerActive(false); }}
                        className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-[9px] font-bold cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {qrMessage && (
                <div className={`p-3 rounded-xl flex items-start gap-2 text-xs font-semibold border ${
                  qrMessage.type === 'success' 
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200/50' 
                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200/50'
                }`}>
                  {qrMessage.type === 'success' ? <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />}
                  <span className="leading-snug">{qrMessage.text}</span>
                </div>
              )}
            </div>
            
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                  <LinkIcon className="w-3.5 h-3.5 text-blue-600" /> URL de Google Apps Script (/exec)
                </label>
                <input
                  type="url"
                  value={setupUrl}
                  onChange={(e) => setSetupUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:bg-white focus:border-blue-500 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                  <span className="text-blue-600 font-bold text-xs">🔒</span> Token / PIN de Seguridad (Opcional)
                </label>
                <input
                  type="password"
                  value={securityToken}
                  onChange={(e) => setSecurityToken(e.target.value)}
                  placeholder="PIN o Clave de seguridad"
                  className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:bg-white focus:border-blue-500 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Si configuras un PIN, el Apps Script requerirá este mismo PIN para validar las peticiones.
                </p>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                  <span className="text-blue-600 font-bold text-xs">📊</span> ID de tu Planilla Google Sheet (Opcional)
                </label>
                <input
                  type="text"
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder="ID de la hoja (en blanco para usar activa)"
                  className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:bg-white focus:border-blue-500 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Sobrescribe el ID hardcodeado para apuntar a tu propio libro de cálculo.
                </p>
              </div>
              
              <div className="flex gap-2.5 pt-1.5">
                {isChangingUrl && (
                  <button 
                    type="button"
                    onClick={() => {
                      setIsChangingUrl(false);
                      setIsQrGeneratorOpen(false);
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-extrabold py-2.5 rounded-xl transition-all text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
                <button 
                  type="submit"
                  className="flex-1 bg-blue-600 text-white font-extrabold py-2.5 rounded-xl shadow-xs shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isChangingUrl ? 'Actualizar Ajustes' : 'Conectar y Abrir'}</span>
                </button>
              </div>
            </form>

            {/* MOSTRAR QR DE CLONACIÓN SI ESTÁ CONFIGURADO */}
            {setupUrl && !isQrScannerActive && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
                <div className="bg-blue-50/40 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/40 rounded-2xl p-4 flex flex-col gap-2.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg shrink-0">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                      Compartir Configuración
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                    Muestra el código QR para configurar otros dispositivos con tu misma URL y PIN de forma instantánea.
                  </p>
                  
                  {!isQrGeneratorOpen ? (
                    <button
                      type="button"
                      onClick={() => setIsQrGeneratorOpen(true)}
                      className="w-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-extrabold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs active:scale-95"
                    >
                      <span>Mostrar Código QR de Clonación</span>
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl border border-blue-100 dark:border-blue-900/60 shadow-2xs">
                      <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-xs">
                        <img
                          src={`https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(JSON.stringify({ url: setupUrl, token: securityToken, sheetId: spreadsheetId }))}`}
                          alt="Código QR de Configuración"
                          className="w-36 h-36 object-contain"
                          loading="lazy"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center max-w-[200px] leading-relaxed">
                        Apunta la cámara del nuevo dispositivo a este código QR para auto-configurarlo de inmediato.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsQrGeneratorOpen(false)}
                        className="text-[9px] font-extrabold text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 rounded-full border border-red-100 dark:border-red-900/30 transition-colors cursor-pointer"
                      >
                        Ocultar QR
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isChangingUrl ? (
              <div className="pt-2">
                <div className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                  <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500">o</span>
                  <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                </div>
                <button
                  type="button"
                  onClick={handleExploreDemo}
                  className="w-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-extrabold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-xs shadow-2xs cursor-pointer active:scale-95"
                >
                  <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Explorar con datos de demostración</span>
                </button>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center leading-normal">
                  Recorre la aplicación con datos de ejemplo, sin conectar ninguna planilla.
                </p>
              </div>
            ) : (
              <div className="pt-1.5">
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg shrink-0">
                        <Compass className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Modo Demostración (Offline)
                      </span>
                    </div>
                    {isDemoMode() && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                        Activo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                    {isDemoMode()
                      ? 'Actualmente estás usando datos locales de ejemplo. Ingresa una URL arriba para conectar tu Google Sheets real, o pulsa abajo para reiniciar los datos de prueba.'
                      : 'Cambia a datos de ejemplo locales para pruebas, formación o uso sin conexión, sin alterar tu planilla real.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleActivateDemo}
                    className="mt-1 w-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                  >
                    <Compass className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{isDemoMode() ? 'Reiniciar Datos de Demostración' : 'Activar Modo Demostración'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <ToastProvider>
        <ConfirmProvider>
        <div className="flex flex-col h-screen w-full bg-[#F8FAFC] dark:bg-slate-950 font-sans overflow-hidden transition-colors print:overflow-visible print:h-auto print:min-h-0 print:block">
          <Routes>
            <Route path="/" element={
              <>
                <UiSettingsProvider value={uiSettingsValue}>
                  <main className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:h-auto print:min-h-0 print:block">
                    <RightDrawerProvider>
                      <ModalsProvider>
                        <InventoryDashboard />
                      </ModalsProvider>
                    </RightDrawerProvider>
                  </main>
                </UiSettingsProvider>
                <PWAReloadPrompt />
              </>
            } />
            <Route path="/recepcion-bultos" element={<RecepcionBultosView />} />
            <Route path="/conteo" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
        </ConfirmProvider>
      </ToastProvider>
    </Router>
  );
}


