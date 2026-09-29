import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export interface ScopedErrorBoundaryProps {
  children: ReactNode;
  moduleName?: string;
  onReset?: () => void;
  fallbackRender?: (error: Error, reset: () => void) => ReactNode;
  className?: string;
}

interface ScopedErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary granular para aislar fallos en componentes hijos o modales específicos.
 * Previene que un fallo de renderizado en un módulo secundario rompa la aplicación completa
 * o cause un reinicio no deseado perdiendo mutaciones en memoria.
 */
export class ScopedErrorBoundary extends Component<
  ScopedErrorBoundaryProps,
  ScopedErrorBoundaryState
> {
  constructor(props: ScopedErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ScopedErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ScopedErrorBoundary] Fallo aislado en módulo "${this.props.moduleName || 'Desconocido'}":`, error, errorInfo);
  }

  public reset = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      const { moduleName = 'este componente', fallbackRender, className = '' } = this.props;
      const error = this.state.error;

      if (fallbackRender && error) {
        return fallbackRender(error, this.reset);
      }

      return (
        <div
          className={`p-4 my-2 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 ${className}`}
          role="alert"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-rose-950 dark:text-rose-100 flex items-center gap-1.5">
                <span>Discrepancia en {moduleName}</span>
              </h4>
              <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                Se aisló un error durante el renderizado de este elemento para mantener el resto del sistema operativo.
              </p>
              {error?.message && (
                <div className="mt-2 p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-rose-200/60 dark:border-rose-800/40 font-mono text-[10px] text-rose-800 dark:text-rose-300 max-h-20 overflow-y-auto break-words">
                  {error.message}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={this.reset}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reintentar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
