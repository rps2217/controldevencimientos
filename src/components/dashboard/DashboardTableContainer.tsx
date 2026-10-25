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
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden min-h-0 relative">
      {/* Subtle top worker processing indicator */}
      {isWorkerProcessing && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500/20 overflow-hidden z-30">
          <div className="h-full bg-blue-600 dark:bg-blue-400 animate-pulse w-full" />
        </div>
      )}

      <InventoryTable />

      {/* Minimalist Footer Bar */}
      <div className="px-3 sm:px-6 py-2 bg-slate-50/90 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row justify-between items-center gap-2 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap justify-between sm:justify-start w-full sm:w-auto">
          <span className="text-[11px] font-medium">
            {filteredItems.length === totalItemsCount ? (
              <span><strong className="text-slate-700 dark:text-slate-200 font-bold">{totalItemsCount}</strong> registros</span>
            ) : (
              <span>Mostrando <strong className="text-slate-700 dark:text-slate-200 font-bold">{filteredItems.length}</strong> de <strong className="text-slate-700 dark:text-slate-200 font-bold">{totalItemsCount}</strong></span>
            )}
          </span>

          {groupByColumn && groupByColumn !== 'none' && groupedItems && (
            <div className="flex items-center gap-1.5 sm:gap-2 border-l border-slate-200 dark:border-slate-800 pl-2 sm:pl-2.5 overflow-x-auto no-scrollbar max-w-full text-[11px]">
              <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 whitespace-nowrap">
                {groupedItems.length} grupos ({groupByColumn})
              </span>
              {toggleGroupByDirection && (
                <button
                  onClick={toggleGroupByDirection}
                  className="bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold px-1.5 py-0.5 rounded transition-colors cursor-pointer whitespace-nowrap text-[10px]"
                  title={`Orden: ${groupByDirection === 'desc' ? 'Descendente' : 'Ascendente'}`}
                >
                  {groupByDirection === 'desc' ? 'Z-A' : 'A-Z'}
                </button>
              )}
              {expandAllGroups && (
                <button
                  onClick={expandAllGroups}
                  className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium cursor-pointer whitespace-nowrap text-[10px]"
                >
                  Expandir
                </button>
              )}
              <span className="text-slate-300 dark:text-slate-700">·</span>
              {collapseAllGroups && (
                <button
                  onClick={collapseAllGroups}
                  className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium cursor-pointer whitespace-nowrap text-[10px]"
                >
                  Contraer
                </button>
              )}
            </div>
          )}
        </div>
        
        <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
          <span>▲/▼ Navegar · Enter Seleccionar</span>
        </div>
      </div>
    </div>
  );
};
