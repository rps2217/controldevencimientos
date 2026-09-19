import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Loader2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'loading' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  title?: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => string;
  updateToast: (id: string, message: string, type?: ToastType, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', title?: string, duration: number = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    setToasts(prev => {
      // If new toast is success or error, remove any lingering loading toasts
      const filtered = (type === 'success' || type === 'error') 
        ? prev.filter(t => t.type !== 'loading') 
        : prev;
      return [...filtered, { id, message, title, type }];
    });

    // Auto dismiss for non-loading or even loading if duration is specified
    const dismissTime = type === 'loading' ? 0 : duration;
    if (dismissTime > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, dismissTime);
    }
    return id;
  }, []);

  const updateToast = useCallback((id: string, message: string, type?: ToastType, title?: string, duration: number = 4000) => {
    setToasts(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          message,
          type: type !== undefined ? type : t.type,
          title: title !== undefined ? title : t.title
        };
      }
      return t;
    }));

    if (type && type !== 'loading' && duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, updateToast, removeToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none print:hidden">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all ${
                toast.type === 'success'
                  ? 'bg-slate-900/95 dark:bg-slate-900/95 text-emerald-100 border-emerald-500/30 shadow-emerald-950/20'
                  : toast.type === 'error'
                  ? 'bg-slate-900/95 dark:bg-slate-900/95 text-rose-100 border-rose-500/30 shadow-rose-950/20'
                  : toast.type === 'warning'
                  ? 'bg-slate-900/95 dark:bg-slate-900/95 text-amber-100 border-amber-500/30 shadow-amber-950/20'
                  : toast.type === 'loading'
                  ? 'bg-slate-900/95 dark:bg-slate-900/95 text-blue-100 border-blue-500/30 shadow-blue-950/20'
                  : 'bg-slate-900/95 dark:bg-slate-900/95 text-slate-100 border-slate-700/50'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
                {toast.type === 'warning' && <AlertCircle className="w-5 h-5 text-amber-400" />}
                {toast.type === 'loading' && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-slate-400" />}
              </div>
              <div className="flex-1 min-w-0">
                {toast.title && <h5 className="font-bold text-sm tracking-tight mb-0.5 text-white">{toast.title}</h5>}
                <p className="text-xs leading-relaxed opacity-90 text-slate-200">{toast.message}</p>
              </div>
              {toast.type !== 'loading' && (
                <button
                  onClick={() => removeToast(toast.id)}
                  className="shrink-0 text-slate-400 hover:text-white transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
