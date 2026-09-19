import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const PWAReloadPrompt: React.FC = () => {
  const isOnline = useOnlineStatus();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // SW registered successfully
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-[180] flex items-center gap-2 rounded-xl bg-amber-500/95 text-slate-950 px-3.5 py-2 text-xs font-bold shadow-xl backdrop-blur-xs border border-amber-400 animate-in slide-in-from-bottom-2">
          <WifiOff className="w-4 h-4 text-slate-950" />
          <span>Modo Offline — Trabajando con datos guardados localmente</span>
        </div>
      )}

      {/* New Version Prompt */}
      {(offlineReady || needRefresh) && (
        <div className="fixed bottom-4 right-4 z-[180] flex items-center gap-3 rounded-2xl bg-slate-900/95 text-white p-4 text-xs shadow-2xl backdrop-blur-md border border-slate-700 max-w-sm animate-in slide-in-from-bottom-3">
          <div className="flex-1 space-y-1">
            <h4 className="font-bold text-slate-100 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              {offlineReady ? 'Aplicación lista para uso offline' : 'Nueva versión disponible'}
            </h4>
            <p className="text-[11px] text-slate-400">
              {offlineReady
                ? 'El sistema se ha almacenado en caché y funcionará sin internet.'
                : 'Hay una actualización reciente. Recarga para ver los cambios.'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {needRefresh && (
              <button
                type="button"
                onClick={() => updateServiceWorker(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors text-[11px] cursor-pointer"
              >
                Actualizar
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
