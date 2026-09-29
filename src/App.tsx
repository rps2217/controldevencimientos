import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Link as LinkIcon, CheckCircle2, Compass } from 'lucide-react';
import InventoryDashboard from './components/InventoryDashboard';
import RecepcionBultosView from './components/views/RecepcionBultosView';
import { ToastProvider } from './components/common/ToastContainer';
import { ConfirmProvider } from './components/common/ConfirmDialog';
import { PWAReloadPrompt } from './components/pwa/PWAReloadPrompt';
import { RightDrawerProvider } from './context/RightDrawerContext';
import { ModalsProvider } from './context/ModalsContext';
import { UiSettingsProvider } from './context/UiSettingsContext';
import type { ThemeMode } from './types';

import { STORAGE_KEYS, hasDemoEntry, setDemoEntry, isDemoMode } from './utils/appStorage';

export default function App() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupUrl, setSetupUrl] = useState('');
  const [securityToken, setSecurityToken] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [setupError, setSetupError] = useState('');
  const [isChangingUrl, setIsChangingUrl] = useState(false);

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
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#F8FAFC] dark:bg-slate-950 px-4 font-sans transition-colors">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="bg-blue-600 px-6 py-8 text-center text-white">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white bg-opacity-20 mb-4 shadow-sm">
              <LinkIcon className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Conectar Google Sheets</h1>
            <p className="mt-2 text-blue-100 text-sm">
              Ingresa la URL del Web App de tu Google Apps Script
            </p>
          </div>
          
          <form onSubmit={handleSetupSubmit} className="p-8 space-y-4">
            {setupError && (
              <div className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/50 p-3 rounded-lg border border-red-100 dark:border-red-900">
                {setupError}
              </div>
            )}
            
            <div>
              <label className="block text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <LinkIcon className="w-3.5 h-3.5 text-blue-600" /> URL de Google Apps Script (/exec)
              </label>
              <input
                type="url"
                value={setupUrl}
                onChange={(e) => setSetupUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <span className="text-blue-600 font-bold text-sm">🔒</span> Token / PIN de Seguridad (Opcional)
              </label>
              <input
                type="password"
                value={securityToken}
                onChange={(e) => setSecurityToken(e.target.value)}
                placeholder="PIN o Clave de seguridad"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-xs"
              />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                Si configuras un PIN, el Apps Script requerirá este mismo PIN para validar las peticiones.
              </p>
            </div>

            <div>
              <label className="block text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <span className="text-blue-600 font-bold text-sm">📊</span> ID de tu Planilla Google Sheet (Opcional)
              </label>
              <input
                type="text"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="ID de la hoja (en blanco para usar activa)"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-mono text-xs"
              />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                Sobrescribe el ID hardcodeado para apuntar a tu propio libro de cálculo.
              </p>
            </div>
            
            <div className="flex gap-3 pt-2">
              {isChangingUrl && (
                <button 
                  type="button"
                  onClick={() => setIsChangingUrl(false)}
                  className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-xs"
                >
                  Cancelar
                </button>
              )}
              <button 
                type="submit"
                className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 dark:shadow-none hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isChangingUrl ? 'Actualizar Ajustes' : 'Conectar y Abrir'}</span>
              </button>
            </div>

            {!isChangingUrl ? (
              <div className="pt-1">
                <div className="flex items-center gap-3 py-2">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">o</span>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
                <button
                  type="button"
                  onClick={handleExploreDemo}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Explorar con datos de demostración</span>
                </button>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">
                  Recorre la aplicación con datos de ejemplo, sin conectar ninguna planilla.
                </p>
              </div>
            ) : (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
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
          </form>
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


