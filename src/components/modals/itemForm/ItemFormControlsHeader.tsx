import React from 'react';
import { Search, Sparkles, Sliders, Eye, EyeOff } from 'lucide-react';
import { MasterProductSummary } from '../../../utils/referenceResolver';

interface ItemFormControlsHeaderProps {
  productsCount: number;
  catalogSearchOpen: boolean;
  setCatalogSearchOpen: (open: boolean) => void;
  catalogSearchQuery: string;
  setCatalogSearchQuery: (query: string) => void;
  catalogSearchResults: MasterProductSummary[];
  catalogSearchRef: React.RefObject<HTMLDivElement | null>;
  onSelectMasterProduct: (selectedProd: MasterProductSummary) => void;
  showAllFields: boolean;
  setShowAllFields: React.Dispatch<React.SetStateAction<boolean>>;
  hiddenFieldsCount: number;
}

export const ItemFormControlsHeader: React.FC<ItemFormControlsHeaderProps> = ({
  productsCount,
  catalogSearchOpen,
  setCatalogSearchOpen,
  catalogSearchQuery,
  setCatalogSearchQuery,
  catalogSearchResults,
  catalogSearchRef,
  onSelectMasterProduct,
  showAllFields,
  setShowAllFields,
  hiddenFieldsCount
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-1">
      {/* Search in Master Catalog Typeahead */}
      {productsCount > 0 ? (
        <div className="relative flex-1" ref={catalogSearchRef as any}>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar SKU, producto o proveedor en catálogo maestro..."
              value={catalogSearchQuery}
              onChange={(e) => {
                setCatalogSearchQuery(e.target.value);
                setCatalogSearchOpen(true);
              }}
              onFocus={() => {
                if (catalogSearchQuery.trim()) setCatalogSearchOpen(true);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 transition-all"
            />
          </div>

          {/* Typeahead Dropdown Results */}
          {catalogSearchOpen && catalogSearchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in-50 duration-100">
              <div className="p-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-500" />
                  Resultados del Catálogo Maestro ({catalogSearchResults.length})
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Clic para autorrellenar</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {catalogSearchResults.map(prod => (
                  <button
                    key={prod.sku}
                    type="button"
                    onClick={() => onSelectMasterProduct(prod)}
                    className="w-full text-left p-2.5 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors flex items-center justify-between gap-2 group cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                          {prod.sku}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {prod.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {prod.provider && `Prov: ${prod.provider} • `}
                        {prod.category && `Cat: ${prod.category}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100/60 dark:bg-blue-900/40 px-2 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                      Seleccionar
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : <div className="flex-1" />}

      {/* Show_If Mode Switch (Smart Filter vs Show All) */}
      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setShowAllFields(false)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
            !showAllFields 
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs' 
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
          title="Muestra solo los campos relevantes para este tipo de evento (Show_If inteligente)"
        >
          <Sliders className="w-3 h-3 text-blue-500" />
          <span>Campos Relevantes</span>
        </button>
        <button
          type="button"
          onClick={() => setShowAllFields(true)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
            showAllFields 
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs' 
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
          title="Muestra todas las columnas de la hoja sin filtros"
        >
          {showAllFields ? <Eye className="w-3 h-3 text-slate-400" /> : <EyeOff className="w-3 h-3 text-slate-400" />}
          <span>Todos ({hiddenFieldsCount > 0 && !showAllFields ? `+${hiddenFieldsCount}` : 'Todos'})</span>
        </button>
      </div>
    </div>
  );
};
