import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Building2, Search, CheckCircle2, ChevronDown, X, Link2, ExternalLink } from 'lucide-react';
import { SheetRecord } from '../../../types';

interface ItemFormProviderRefInputProps {
  header: string;
  value: string;
  disabled?: boolean;
  hasError?: boolean;
  matchedSkuProduct?: SheetRecord | null;
  providerSuggestions?: string[];
  products?: SheetRecord[];
  onChange: (value: string) => void;
}

export const ItemFormProviderRefInput: React.FC<ItemFormProviderRefInputProps> = ({
  header,
  value,
  disabled = false,
  hasError = false,
  matchedSkuProduct,
  providerSuggestions = [],
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const masterProviderFromSku = useMemo(() => {
    if (!matchedSkuProduct) return '';
    return String(
      matchedSkuProduct.PROVEEDOR || 
      matchedSkuProduct.LABORATORIO || 
      matchedSkuProduct.FABRICANTE || 
      matchedSkuProduct['NOMBRE PROVEEDOR'] || 
      matchedSkuProduct.B || 
      ''
    ).trim();
  }, [matchedSkuProduct]);

  // Is current value directly verified against linked master product?
  const isDirectlyLinkedToSku = Boolean(
    masterProviderFromSku && 
    value && 
    value.trim().toLowerCase() === masterProviderFromSku.toLowerCase()
  );

  // Filtered master provider references
  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) {
      return providerSuggestions.slice(0, 20);
    }
    const q = searchQuery.toLowerCase().trim();
    return providerSuggestions
      .filter(p => p.toLowerCase().includes(q))
      .slice(0, 20);
  }, [providerSuggestions, searchQuery]);

  const handleSelect = (prov: string) => {
    onChange(prov);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    onChange('');
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className="relative space-y-1">
      {/* If linked to master SKU and verified, show reference card with option to modify */}
      {isDirectlyLinkedToSku && !isOpen ? (
        <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
          disabled 
            ? 'bg-slate-100/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700' 
            : 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 hover:border-blue-300'
        }`}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {value}
                </span>
                <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.2 rounded-md flex items-center gap-0.5 border border-blue-200 dark:border-blue-800">
                  <Link2 className="w-2.5 h-2.5" />
                  Ref: SKU Maestro
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                Proveedor referenciado automáticamente desde el Catálogo de Productos
              </p>
            </div>
          </div>

          {!disabled && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-100/60 dark:hover:bg-blue-900/60 px-2 py-1 rounded-lg transition-colors shrink-0 cursor-pointer"
              title="Cambiar proveedor seleccionando de la lista de referencias"
            >
              Cambiar Ref.
            </button>
          )}
        </div>
      ) : (
        /* Reference Combobox & Search */
        <div className="relative">
          <div className="relative flex items-center">
            <Building2 className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              name={header}
              value={isOpen ? searchQuery : value}
              disabled={disabled}
              onFocus={() => {
                if (!disabled) {
                  setIsOpen(true);
                  if (value && !searchQuery) setSearchQuery(value);
                }
              }}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              placeholder={disabled ? 'Calculado por referencia' : 'Seleccionar o buscar proveedor en Catálogo Maestro...'}
              className={`w-full border rounded-xl pl-9 pr-14 py-2 text-sm outline-none transition-all ${
                disabled
                  ? 'bg-slate-100/80 dark:bg-slate-800/40 text-slate-500 cursor-not-allowed border-dashed border-slate-300 dark:border-slate-700'
                  : hasError 
                    ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100' 
                    : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
              }`}
            />

            {!disabled && (
              <div className="absolute right-2 flex items-center gap-1">
                {value && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="Limpiar proveedor"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(prev => !prev)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Abrir catálogo de proveedores"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {/* Reference Dropdown */}
          {isOpen && !disabled && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/60 max-h-60 overflow-y-auto animate-in fade-in-50 zoom-in-95 duration-100">
              <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/60 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Link2 className="w-3 h-3 text-blue-500" />
                  Referencias Catálogo Maestro
                </span>
                <span className="font-normal font-mono">{filteredSuggestions.length} proveedores</span>
              </div>

              {/* Master SKU default if available */}
              {masterProviderFromSku && (
                <button
                  type="button"
                  onClick={() => handleSelect(masterProviderFromSku)}
                  className="w-full px-3 py-2 text-left bg-blue-50/60 dark:bg-blue-950/40 hover:bg-blue-100/80 dark:hover:bg-blue-900/60 transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-blue-700 dark:text-blue-300 truncate flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{masterProviderFromSku}</span>
                    </div>
                    <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80">
                      Proveedor asignado en Catálogo de Productos
                    </span>
                  </div>
                  <span className="text-[10px] font-bold bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-md shrink-0">
                    Sugerido
                  </span>
                </button>
              )}

              {filteredSuggestions.length > 0 ? (
                filteredSuggestions.map((prov) => {
                  const isSelected = value.toLowerCase() === prov.toLowerCase();
                  return (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => handleSelect(prov)}
                      className={`w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between gap-2 cursor-pointer group ${
                        isSelected ? 'bg-slate-100/80 dark:bg-slate-700/80' : ''
                      }`}
                    >
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                        {prov}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-3 text-center text-xs text-slate-400">
                  No se encontraron proveedores coincidentes en las referencias maestras.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
