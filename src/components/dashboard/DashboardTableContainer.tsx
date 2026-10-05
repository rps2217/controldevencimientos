import React from 'react';
import { InventoryTable } from '../InventoryTable';
import { useDashboard } from '../../context/DashboardContext';

export const DashboardTableContainer: React.FC = () => {
  const dashboard = useDashboard();

  const totalItemsCount = dashboard.domainItemsCount ?? dashboard.items?.length ?? 0;
  const groupedItems = dashboard.groupedItems ?? null;
  const groupByDirection = dashboard.groupByDirection ?? 'asc';
  const toggleGroupByDirection = dashboard.toggleGroupByDirection;

  const filteredItems = dashboard.filteredItems ?? [];
  const groupByColumn = dashboard.groupByColumn;
  const expandAllGroups = dashboard.expandAllGroups;
  const collapseAllGroups = dashboard.collapseAllGroups;

  const isWorkerProcessing = dashboard.isWorkerProcessing ?? false;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 md:bg-white md:dark:bg-slate-900 md:border border-slate-200 dark:border-slate-800 md:rounded-3xl md:shadow-sm overflow-hidden min-h-0 relative">
      {/* Subtle top worker processing indicator */}
      {isWorkerProcessing && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500/20 overflow-hidden z-30">
          <div className="h-full bg-blue-600 dark:bg-blue-400 animate-pulse w-full" />
        </div>
      )}

      <InventoryTable />

      {/* Footer summary bar */}
      <div className="p-2.5 sm:p-3 pr-16 sm:pr-3 bg-slate-100/90 dark:bg-slate-800/90 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row justify-between items-center gap-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-between sm:justify-start w-full sm:w-auto">
          <span className="text-[11px] sm:text-xs">
            Mostrando <strong className="text-slate-800 dark:text-slate-100 font-bold">{filteredItems.length}</strong> de <strong className="text-slate-800 dark:text-slate-100 font-bold">{totalItemsCount}</strong> registros
          </span>
          {groupByColumn && groupByColumn !== 'none' && groupedItems && (
            <div className="flex items-center gap-1.5 sm:gap-2 border-l border-slate-300 dark:border-slate-700 pl-2 sm:pl-2.5 overflow-x-auto no-scrollbar max-w-full">
              <span className="text-[10px] sm:text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 whitespace-nowrap">
                Agrupado en {groupedItems.length} grupos ({groupByColumn})
              </span>
              {toggleGroupByDirection && (
                <button
                  onClick={toggleGroupByDirection}
                  className="text-[10px] bg-blue-100 dark:bg-blue-900/60 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 font-extrabold px-1.5 py-0.5 rounded transition-colors cursor-pointer whitespace-nowrap"
                  title={`Orden de grupos: ${groupByDirection === 'desc' ? 'Descendente (Z-A)' : 'Ascendente (A-Z)'}. Clic para cambiar.`}
                >
                  {groupByDirection === 'desc' ? 'Orden Z-A' : 'Orden A-Z'}
                </button>
              )}
              {expandAllGroups && (
                <button
                  onClick={expandAllGroups}
                  className="text-[10px] text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 font-bold underline cursor-pointer whitespace-nowrap"
                >
                  Expandir
                </button>
              )}
              <span className="text-slate-300 dark:text-slate-600">|</span>
              {collapseAllGroups && (
                <button
                  onClick={collapseAllGroups}
                  className="text-[10px] text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 font-bold underline cursor-pointer whitespace-nowrap"
                >
                  Contraer
                </button>
              )}
            </div>
          )}
        </div>
        
        <div className="hidden md:flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 bg-slate-200/80 dark:bg-slate-700/80 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200" title="Atajos de teclado activos para la tabla">
            ▲/▼ Navegar · Enter Seleccionar
          </span>
          <span>Tip: Doble clic en divisor de columna para auto-ajustar.</span>
        </div>
      </div>
    </div>
  );
};
