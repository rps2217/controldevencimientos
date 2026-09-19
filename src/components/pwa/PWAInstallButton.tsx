import React, { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        setInstallSuccess(true);
        setTimeout(() => setInstallSuccess(false), 3000);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // Fallback for browsers that don't emit beforeinstallprompt yet
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title="Instalar como App en tu teléfono o computadora"
        className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all duration-200 cursor-pointer shadow-xs border ${
          installSuccess
            ? 'bg-emerald-600 text-white border-emerald-500'
            : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white border-emerald-500/80 shadow-emerald-900/20 active:scale-95'
        } ${className}`}
      >
        {installSuccess ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>¡Instalada!</span>
          </>
        ) : (
          <>
            <Smartphone className="w-3.5 h-3.5 group-hover:animate-bounce" />
            <span className={variant === 'compact' ? 'hidden sm:inline' : 'inline'}>
              Instalar App
            </span>
            <Download className="w-3 h-3 opacity-75" />
          </>
        )}
      </button>

      {/* Guía interactiva de instalación para iOS / Safari / Navegadores sin prompt nativo */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4 text-slate-800 dark:text-slate-100">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Instalar en tu Móvil</h3>
                  <p className="text-[11px] text-slate-500">Acceso directo como app nativa</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                <div className="p-2 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg shrink-0">
                  <Share className="w-4 h-4" />
                </div>
                <div>
                  <strong className="block text-slate-900 dark:text-slate-100 font-semibold mb-0.5">Paso 1</strong>
                  Toca el botón <strong>Compartir</strong> en la barra inferior de Safari o el menú de tu navegador (los 3 puntos).
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <strong className="block text-slate-900 dark:text-slate-100 font-semibold mb-0.5">Paso 2</strong>
                  Desliza hacia abajo y selecciona <strong>"Agregar a Inicio"</strong> (o <em>"Instalar aplicación"</em>).
                </div>
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-900/50 text-[11px] leading-relaxed">
                ✨ ¡Listo! Se creará el ícono con el logo de farmacia en tu pantalla principal y se abrirá a pantalla completa sin barras de navegador.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Entendido
            </button>

          </div>
        </div>
      )}
    </>
  );
};
