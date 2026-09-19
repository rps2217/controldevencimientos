import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>(resolve => {
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setOptions(typeof opts === 'string' ? { message: opts } : opts);
    });
  }, []);

  const settle = (value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  };

  const variant = options?.variant ?? 'danger';
  const accent = {
    danger: { icon: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40', button: 'bg-rose-600 hover:bg-rose-700' },
    warning: { icon: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40', button: 'bg-amber-600 hover:bg-amber-700' },
    default: { icon: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40', button: 'bg-blue-600 hover:bg-blue-700' },
  }[variant];

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {options && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => settle(false)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-4 p-5">
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${accent.icon}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {options.title ?? 'Confirmar acción'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 break-words">
                    {options.message}
                  </p>
                </div>
                <button
                  onClick={() => settle(false)}
                  className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => settle(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {options.cancelLabel ?? 'Cancelar'}
                </button>
                <button
                  autoFocus
                  onClick={() => settle(true)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${accent.button}`}
                >
                  {options.confirmLabel ?? 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx;
};