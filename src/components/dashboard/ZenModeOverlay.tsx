import React from 'react';
import { Maximize2, Search, X, Sliders } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

export interface ZenModeOverlayProps {
  isZenMode?: boolean;
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
  onOpenSettings?: () => void;
  onExitZenMode?: () => void;
}

export const ZenModeOverlay: React.FC<ZenModeOverlayProps> = (props) => {
  const dashboard = useDashboard();

  const isZenMode = props.isZenMode ?? dashboard.isZenMode ?? false;
  const searchTerm = props.searchTerm ?? dashboard.searchTerm ?? '';
  const setSearchTerm = props.setSearchTerm ?? dashboard.setSearchTerm;
  const onOpenSettings = props.onOpenSettings ?? (() => dashboard.setIsRightDrawerOpen?.(true));
  const onExitZenMode = props.onExitZenMode ?? (() => {
    dashboard.setIsZenMode?.(false);
    dashboard.showToast?.('Modo Zen desactivado', 'info', 'Enfoque');
  });

  if (!isZenMode) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900/95 dark:bg-slate-900/95 text-white backdrop-blur-md px-5 py-2.5 rounded-2xl shadow-2xl border border-slate-700/80 text-xs font-bold animate-in fade-in slide-in-from-top duration-200 max-w-3xl w-[92%] sm:w-auto justify-between sm:justify-start">
      <div className="flex items-center gap-2 shrink-0">
        <Maximize2 className="w-4 h-4 text-purple-400 animate-pulse shrink-0" />
        <span className="hidden sm:inline">Modo Zen</span>
        <span className="text-[10px] text-slate-400 font-mono hidden lg:inline">(Esc para salir)</span>
      </div>
      
      {/* Extended search input in Zen Mode */}
      <div className="relative flex-1 sm:w-72 md:w-96 lg:w-[420px]">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar SKU, producto, vencimiento, proveedor..."
          className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl bg-slate-800/90 text-white placeholder:text-slate-400 border border-slate-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all shadow-inner"
          autoFocus
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            title="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm shrink-0"
        title="Abrir panel de vistas, columnas y configuraciones"
      >
        <Sliders className="w-3.5 h-3.5 text-indigo-400" />
        <span>Ajustes</span>
      </button>

      <button
        type="button"
        onClick={onExitZenMode}
        className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm shrink-0"
        title="Salir del Modo Zen y restaurar todas las barras periféricas"
      >
        <span>Salir</span>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
