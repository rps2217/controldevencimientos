import React, { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Contrast, Check } from 'lucide-react';
import { useUiSettings } from '../../context/UiSettingsContext';
import type { ThemeMode } from '../../types';

const OPCIONES: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'light', label: 'Modo Claro', icon: <Sun className="w-4 h-4 text-amber-500" /> },
  { mode: 'dark-slate', label: 'Modo Azul', icon: <Moon className="w-4 h-4 text-blue-400" /> },
  { mode: 'dark-gray', label: 'Modo Gris', icon: <Contrast className="w-4 h-4 text-zinc-300" /> },
];

/**
 * Selector de tema en la barra superior.
 *
 * Antes vivía en `App.tsx` (una barra aparte, encima del dashboard). Subió aquí junto
 * al buscador para que la configuración del entorno quede en una sola franja y la
 * búsqueda gane protagonismo, al estilo de las vistas de AppSheet.
 */
export const ThemeSelector: React.FC = () => {
  const { themeMode, setThemeMode } = useUiSettings();
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alClicFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClicFuera);
    return () => document.removeEventListener('mousedown', alClicFuera);
  }, [abierto]);

  const actual = OPCIONES.find(o => o.mode === themeMode) ?? OPCIONES[0];

  return (
    <div className="relative hidden md:block" ref={contenedorRef}>
      <button
        onClick={() => setAbierto(!abierto)}
        className="h-10 w-10 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-2xs flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
        title={`Tema visual actual: ${actual.label}`}
        aria-label={`Tema visual actual: ${actual.label}. Cambiar tema`}
        aria-haspopup="true"
        aria-expanded={abierto}
      >
        {actual.icon}
      </button>

      {abierto && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Tema Visual
          </div>
          {OPCIONES.map(({ mode, label, icon }) => (
            <button
              key={mode}
              onClick={() => { setThemeMode(mode); setAbierto(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors cursor-pointer ${
                themeMode === mode
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2">{icon}{label}</span>
              {themeMode === mode && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
