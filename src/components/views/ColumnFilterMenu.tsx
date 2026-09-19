import React, { useState, useRef, useEffect } from 'react';
import { Filter, Check, Search, X } from 'lucide-react';

export interface FilterOption {
  label: string;
  value: string;
  icon?: React.ReactNode;
  badgeClass?: string;
}

interface ColumnFilterMenuProps {
  options: FilterOption[];
  selectedValues: string[];
  onToggle: (value: string, isMulti: boolean) => void;
  onClear: () => void;
  onSelectAll?: (values: string[]) => void;
  title: string;
  alignRight?: boolean;
}

export const ColumnFilterMenu: React.FC<ColumnFilterMenuProps> = ({
  options,
  selectedValues,
  onToggle,
  onClear,
  onSelectAll,
  title,
  alignRight = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasSelection = selectedValues.length > 0;

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative inline-flex items-center shrink-0 z-30" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`p-1 rounded-md transition-all flex items-center gap-1 cursor-pointer shrink-0 ${
          hasSelection
            ? 'bg-blue-600 text-white font-bold ring-2 ring-blue-400 dark:ring-blue-500 shadow-xs'
            : 'text-slate-400 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/80 dark:hover:bg-slate-600/80'
        }`}
        title={`Filtrar por ${title}`}
      >
        <Filter className={`w-3.5 h-3.5 ${hasSelection ? 'text-white' : ''}`} />
        {hasSelection && (
          <span className="text-[10px] font-bold px-1 bg-white/20 rounded-full leading-none">
            {selectedValues.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute top-full ${alignRight ? 'right-0' : 'left-0'} mt-1.5 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden cursor-default`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/60">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider truncate">
              {title}
            </span>
            {hasSelection && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="text-[10px] text-red-600 dark:text-red-400 hover:underline font-bold shrink-0 ml-2"
              >
                Limpiar ({selectedValues.length})
              </button>
            )}
          </div>

          {/* Search box if > 4 options */}
          {options.length > 4 && (
            <div className="p-2 border-b border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-800">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-500">
                Sin coincidencias
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedValues.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(opt.value, true);
                    }}
                    className="w-full px-3.5 py-1.5 text-left flex items-center gap-2.5 hover:bg-blue-50/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer group"
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 group-hover:border-blue-400'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                    <span
                      className={`text-xs truncate font-medium ${
                        opt.badgeClass || 'text-slate-700 dark:text-slate-200'
                      }`}
                      title={opt.label}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
