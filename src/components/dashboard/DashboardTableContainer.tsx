import React from 'react';
import { InventoryTable, InventoryTableProps } from '../InventoryTable';
import { useDashboard } from '../../context/DashboardContext';

export interface DashboardTableContainerProps extends InventoryTableProps {
  totalItemsCount?: number;
  groupedItems?: any[] | null;
  groupByDirection?: 'asc' | 'desc';
  toggleGroupByDirection?: () => void;
}

export const DashboardTableContainer: React.FC<DashboardTableContainerProps> = (props) => {
  const dashboard = useDashboard();

  const totalItemsCount = props.totalItemsCount ?? dashboard.items?.length ?? 0;
  const groupedItems = props.groupedItems ?? dashboard.groupedItems ?? null;
  const groupByDirection = props.groupByDirection ?? dashboard.groupByDirection ?? 'asc';
  const toggleGroupByDirection = props.toggleGroupByDirection ?? dashboard.toggleGroupByDirection;

  const filteredItems = props.filteredItems ?? dashboard.filteredItems ?? [];
  const groupByColumn = props.groupByColumn ?? dashboard.groupByColumn;
  const expandAllGroups = props.expandAllGroups ?? dashboard.expandAllGroups;
  const collapseAllGroups = props.collapseAllGroups ?? dashboard.collapseAllGroups;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 md:bg-white md:dark:bg-slate-900 md:border border-slate-200 dark:border-slate-800 md:rounded-3xl md:shadow-sm overflow-hidden min-h-0 relative">
      <InventoryTable {...props} />

      {/* Footer summary bar */}
      <div className="hidden md:flex p-3 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex-col sm:flex-row justify-between items-center gap-2">
        <div className="flex items-center gap-3">
          <span>
            Mostrando <strong className="text-slate-800 dark:text-slate-100">{filteredItems.length}</strong> de <strong className="text-slate-800 dark:text-slate-100">{totalItemsCount}</strong> registros
          </span>
          {groupByColumn && groupByColumn !== 'none' && groupedItems && (
            <div className="flex items-center gap-2 border-l border-slate-300 dark:border-slate-600 pl-3">
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                Agrupado en {groupedItems.length} grupos ({groupByColumn})
              </span>
              {toggleGroupByDirection && (
                <button
                  onClick={toggleGroupByDirection}
                  className="text-[10px] bg-blue-100 dark:bg-blue-900/60 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 font-extrabold px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                  title={`Orden de grupos: ${groupByDirection === 'desc' ? 'Descendente (Z-A)' : 'Ascendente (A-Z)'}. Clic para cambiar.`}
                >
                  {groupByDirection === 'desc' ? 'Orden Z-A' : 'Orden A-Z'}
                </button>
              )}
              {expandAllGroups && (
                <button
                  onClick={expandAllGroups}
                  className="text-[10px] text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 font-bold underline cursor-pointer"
                >
                  Expandir todos
                </button>
              )}
              <span className="text-slate-300 dark:text-slate-600">|</span>
              {collapseAllGroups && (
                <button
                  onClick={collapseAllGroups}
                  className="text-[10px] text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 font-bold underline cursor-pointer"
                >
                  Contraer todos
                </button>
              )}
            </div>
          )}
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Tip: Arrastra las líneas entre columnas para cambiar su tamaño, o haz <strong>doble clic</strong> para auto-ajustar.
        </span>
      </div>
    </div>
  );
};
