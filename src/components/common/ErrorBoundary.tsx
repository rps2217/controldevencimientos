import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleClearStorageAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-slate-800 dark:text-slate-100 font-sans">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-4">
            <div className="mx-auto w-14 h-14 bg-rose-100 dark:bg-rose-950/60 rounded-2xl flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Se detectó una discrepancia al cargar
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                La aplicación recuperó el estado de seguridad para prevenir inconsistencias en la pantalla.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="bg-slate-100 dark:bg-slate-800/70 p-3 rounded-xl text-[11px] text-slate-600 dark:text-slate-300 font-mono text-left max-h-24 overflow-y-auto break-words">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reintentar Carga</span>
              </button>
              <button
                type="button"
                onClick={this.handleClearStorageAndReload}
                className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-slate-400" />
                <span>Restablecer Datos Locales</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
