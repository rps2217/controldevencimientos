import React from 'react';
import { Barcode, Plus, Truck } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { useModalsActions } from '../../context/ModalsContext';

export const DashboardMobileFABs: React.FC = () => {
  const dashboard = useDashboard();
  const modalsActions = useModalsActions();

  const isZenMode = dashboard.isZenMode ?? false;
  const activeView = dashboard.activeView;
  const activeSheet = dashboard.activeSheet;
  const onOpenPistoleo = () => modalsActions.setIsMobilePistoleoOpen?.(true);
  const onOpenNewItem = () => dashboard.handleOpenModal();
  const canCount = dashboard.tableCapabilities?.has('conteo') ?? false;

  if (isZenMode || activeView === 'schema' || activeView === 'analytics' || !activeSheet) {
    return null;
  }

  return (
    <div className="md:hidden fixed bottom-6 right-5 z-40 flex flex-col items-end gap-2.5 pb-[env(safe-area-inset-bottom)]">
      {canCount && (
        <button
          onClick={onOpenPistoleo}
          className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-900 dark:bg-slate-800 text-white font-semibold text-xs rounded-full shadow-lg border border-slate-700 active:scale-95 transition-all cursor-pointer"
          title="Terminal de Pistoleo Móvil"
        >
          <Barcode className="w-4 h-4 text-rose-400" />
          <span>Pistoleo</span>
        </button>
      )}

      {activeView === 'recepBultos' && (
        <a
          href="/recepcion-bultos"
          className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-900 dark:bg-slate-800 text-white font-semibold text-xs rounded-full shadow-lg border border-slate-700 active:scale-95 transition-all cursor-pointer"
          title="Abrir Terminal Móvil de Pistoleo Rápido"
        >
          <Truck className="w-4 h-4 text-amber-400" />
          <span>Terminal Rápida</span>
        </a>
      )}

      <button
        onClick={onOpenNewItem}
        className="bg-blue-600 hover:bg-blue-700 text-white w-12 h-12 flex items-center justify-center rounded-full shadow-lg border border-blue-500/30 active:scale-95 transition-all cursor-pointer"
        title="Nuevo Registro"
        aria-label="Nuevo Registro"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>
    </div>
  );
};
