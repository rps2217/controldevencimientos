import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Package, Link as LinkIcon, Settings2, CheckCircle2, Moon, Sun, Contrast, Check } from 'lucide-react';
import InventoryDashboard from './components/InventoryDashboard';
import { ToastProvider } from './components/common/ToastContainer';
import { PWAReloadPrompt } from './components/pwa/PWAReloadPrompt';
import { AppLogo } from './components/common/AppLogo';

export type ThemeMode = 'light' | 'dark-slate' | 'dark-gray';

export default function App() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupUrl, setSetupUrl] = useState('');
  const [securityToken, setSecurityToken] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [setupError, setSetupError] = useState('');
  const [isChangingUrl, setIsChangingUrl] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Initialize values on mount
  useEffect(() => {
    try {
      const storedUrl = localStorage.getItem('appsheet_clone_scriptUrl') || '';
      const storedToken = localStorage.getItem('appsheet_clone_securityToken') || '';
      const storedSheetId = localStorage.getItem('appsheet_clone_spreadsheetId') || '';
      
      setSetupUrl(storedUrl);
      setSecurityToken(storedToken);
      setSpreadsheetId(storedSheetId);

      if (!storedUrl) {
        setNeedsSetup(true);
      }
    } catch (err) {
      console.warn('LocalStorage initialization error:', err);
    }
  }, []);

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const savedVariant = localStorage.getItem('app_theme_variant');
      const isDark = localStorage.getItem('app_dark_mode') === 'true';
      if (!isDark) return 'light';
      return savedVariant === 'gray' ? 'dark-gray' : 'dark-slate';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      if (themeMode === 'light') {
        localStorage.setItem('app_dark_mode', 'false');
        document.documentElement.classList.remove('dark', 'theme-gray');
      } else if (themeMode === 'dark-slate') {
        localStorage.setItem('app_dark_mode', 'true');
        localStorage.setItem('app_theme_variant', 'slate');
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('theme-gray');
      } else if (themeMode === 'dark-gray') {
        localStorage.setItem('app_dark_mode', 'true');
        localStorage.setItem('app_theme_variant', 'gray');
        document.documentElement.classList.add('dark', 'theme-gray');
      }
    } catch (err) {
      console.warn('LocalStorage error setting theme:', err);
    }
  }, [themeMode]);

  // Close theme dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const darkMode = themeMode !== 'light';

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupUrl.includes('script.google.com/macros/s/')) {
      setSetupError('La URL no parece ser un enlace válido de Google Apps Script (debe incluir script.google.com/macros/s/.../exec).');
      return;
    }

    try {
      localStorage.setItem('appsheet_clone_scriptUrl', setupUrl.trim());
      localStorage.setItem('appsheet_clone_securityToken', securityToken.trim());
      localStorage.setItem('appsheet_clone_spreadsheetId', spreadsheetId.trim());
    } catch (err) {
      console.warn('LocalStorage error setting config:', err);
    }
    setNeedsSetup(false);
    setIsChangingUrl(false);
    setSetupError('');
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
          </form>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <ToastProvider>
        <div className="flex flex-col h-screen w-full bg-[#F8FAFC] dark:bg-slate-950 font-sans overflow-hidden transition-colors print:overflow-visible print:h-auto print:min-h-0 print:block">
          <Routes>
            <Route path="/" element={
              <>
                <nav className="hidden md:flex h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 items-center justify-between shrink-0 shadow-sm print:hidden">
                  <AppLogo size="md" showText={true} />

                  <div className="flex items-center gap-3">
                    {/* Theme Selector Dropdown */}
                    <div className="relative" ref={themeMenuRef}>
                      <button
                        onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2 text-xs font-semibold"
                        title="Cambiar Tema Visual"
                      >
                        {themeMode === 'light' && <Sun className="h-4 w-4 text-amber-500" />}
                        {themeMode === 'dark-slate' && <Moon className="h-4 w-4 text-blue-400" />}
                        {themeMode === 'dark-gray' && <Contrast className="h-4 w-4 text-zinc-300" />}
                        <span className="hidden sm:inline">
                          {themeMode === 'light' && 'Modo Claro'}
                          {themeMode === 'dark-slate' && 'Modo Azul'}
                          {themeMode === 'dark-gray' && 'Modo Gris'}
                        </span>
                      </button>

                      {isThemeMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                          <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            Tema Visual
                          </div>
                          
                          {/* Light Option */}
                          <button
                            onClick={() => {
                              setThemeMode('light');
                              setIsThemeMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${
                              themeMode === 'light'
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Sun className="w-4 h-4 text-amber-500" />
                              <span>Modo Claro</span>
                            </div>
                            {themeMode === 'light' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                          </button>

                          {/* Dark Slate Option */}
                          <button
                            onClick={() => {
                              setThemeMode('dark-slate');
                              setIsThemeMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${
                              themeMode === 'dark-slate'
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Moon className="w-4 h-4 text-blue-400" />
                              <span>Modo Azul</span>
                            </div>
                            {themeMode === 'dark-slate' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                          </button>

                          {/* Dark Gray Option */}
                          <button
                            onClick={() => {
                              setThemeMode('dark-gray');
                              setIsThemeMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${
                              themeMode === 'dark-gray'
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Contrast className="w-4 h-4 text-zinc-300" />
                              <span>Modo Gris</span>
                            </div>
                            {themeMode === 'dark-gray' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setIsChangingUrl(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
                    >
                      <Settings2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      <span>URL de Apps Script</span>
                    </button>
                  </div>
                </nav>
                <main className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:h-auto print:min-h-0 print:block">
                  <InventoryDashboard />
                </main>
                <PWAReloadPrompt />
              </>
            } />
            <Route path="/conteo" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </ToastProvider>
    </Router>
  );
}


