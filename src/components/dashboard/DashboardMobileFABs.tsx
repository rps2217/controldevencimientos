import React from 'react';
import { Barcode, Plus } from 'lucide-react';
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
    <div className="md:hidden fixed bottom-6 right-5 z-40 flex flex-col items-end gap-2.5">
      {canCount && (
        <button
          onClick={onOpenPistoleo}
          className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-red-800 via-rose-900 to-red-800 text-white font-extrabold text-xs rounded-full shadow-[0_8px_25px_rgba(153,27,27,0.45)] border border-red-500/40 active:scale-95 transition-all cursor-pointer"
          title="Abrir Terminal de Pistoleo Móvil (Cámara / Láser PDA)"
        >
          <Barcode className="w-4 h-4 text-rose-300 animate-pulse" />
          <span>Pistoleo Móvil</span>
        </button>
      )}

      <button
        onClick={onOpenNewItem}
        className="bg-blue-600 text-white p-3 rounded-full shadow-[0_8px_25px_rgba(37,99,235,0.4)] border border-blue-500/20 active:scale-95 transition-all cursor-pointer"
        title="Nuevo Registro"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>
    </div>
  );
};
