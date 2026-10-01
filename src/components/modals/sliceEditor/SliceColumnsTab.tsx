import React from 'react';
import { Columns, Search, ArrowUpAZ, ArrowDownZA } from 'lucide-react';

interface SliceColumnsTabProps {
  headers: string[];
  useCustomColumns: boolean;
  setUseCustomColumns: (use: boolean) => void;
  selectedColumns: string[];
  columnSearch: string;
  setColumnSearch: (val: string) => void;
  handleToggleColumn: (col: string) => void;
  handleSelectAllColumns: () => void;
  handleClearColumns: () => void;
  groupByColumn: string;
  setGroupByColumn: (col: string) => void;
  sortColumn: string;
  setSortColumn: (col: string) => void;
  sortDirection: 'asc' | 'desc';
  setSortDirection: (dir: 'asc' | 'desc') => void;
}

export const SliceColumnsTab: React.FC<SliceColumnsTabProps> = ({
  headers,
  useCustomColumns: _useCustomColumns,
  setUseCustomColumns,
  selectedColumns,
  columnSearch,
  setColumnSearch,
  handleToggleColumn,
  handleSelectAllColumns,
  handleClearColumns,
  groupByColumn,
  setGroupByColumn,
  sortColumn,
  setSortColumn,
  sortDirection,
  setSortDirection
}) => {
  const filteredHeaders = headers.filter(h => 
    h.toLowerCase().includes(columnSearch.trim().toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Grouping and Sorting Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
        {/* Group By */}
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
            Agrupar por Columna
          </label>
          <select
            value={groupByColumn}
            onChange={(e) => setGroupByColumn(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
          >
            <option value="none">Sin agrupación (Tabla Plana)</option>
            {headers.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
            Ordenar por Columna
          </label>
          <div className="flex items-center gap-1.5">
            <select
              value={sortColumn}
              onChange={(e) => setSortColumn(e.target.value)}
              className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            >
              <option value="">Orden Predeterminado</option>
              {headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            {sortColumn && (
              <button
                type="button"
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                title={sortDirection === 'asc' ? 'Ascendente (A-Z)' : 'Descendente (Z-A)'}
              >
                {sortDirection === 'asc' ? <ArrowUpAZ className="w-4 h-4 text-blue-500" /> : <ArrowDownZA className="w-4 h-4 text-blue-500" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visible Columns Customization Toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Columns className="w-4 h-4 text-blue-500" />
            <span>Personalizar Columnas Visibles ({selectedColumns.length}/{headers.length})</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllColumns}
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Todas
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <button
              type="button"
              onClick={handleClearColumns}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline"
            >
              Ninguna
            </button>
          </div>
        </div>

        {/* Search in columns */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar columna..."
            value={columnSearch}
            onChange={(e) => setColumnSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500"
          />
        </div>

        {/* Columns Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto p-1 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30">
          {filteredHeaders.map(col => {
            const isChecked = selectedColumns.includes(col);
            return (
              <label
                key={col}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  isChecked 
                    ? 'bg-white dark:bg-slate-800 border-blue-500 text-blue-900 dark:text-blue-100 shadow-2xs' 
                    : 'bg-white/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    setUseCustomColumns(true);
                    handleToggleColumn(col);
                  }}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="truncate">{col}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};
