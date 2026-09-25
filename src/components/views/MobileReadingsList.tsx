import React from 'react';
import { Search, Barcode, MapPin, Trash2 } from 'lucide-react';
import { StockCountSession, StockCountEntry } from '../../types';

type GroupedSkuEntry = {
  sku: string;
  descripcion: string;
  mm?: string;
  yyyy?: string;
  ubicaciones: string[];
  readingsCount: number;
  totalCantidad: number;
};

export interface MobileReadingsListProps {
  currentSession: StockCountSession;
  readingsSearch: string;
  onReadingsSearchChange: (value: string) => void;
  readingsViewMode: 'GROUPED' | 'CHRONO';
  onReadingsViewModeChange: (mode: 'GROUPED' | 'CHRONO') => void;
  groupedSkuEntries: GroupedSkuEntry[];
  filteredGroupedSkuEntries: GroupedSkuEntry[];
  filteredChronoEntries: StockCountEntry[];
  onGoToScan: () => void;
  onDecrementSku: (sku: string) => void;
  onIncrementSku: (sku: string) => void;
  onRemoveSkuAllEntries: (sku: string, descripcion: string) => void;
  onRemoveEntry: (entryId: string) => void;
}

/** Pestaña móvil "Lecturas": búsqueda, conmutador de vista y listado agrupado/cronológico. */
export const MobileReadingsList: React.FC<MobileReadingsListProps> = ({
  currentSession,
  readingsSearch,
  onReadingsSearchChange,
  readingsViewMode,
  onReadingsViewModeChange,
  groupedSkuEntries,
  filteredGroupedSkuEntries,
  filteredChronoEntries,
  onGoToScan,
  onDecrementSku,
  onIncrementSku,
  onRemoveSkuAllEntries,
  onRemoveEntry
}) => (
  <div className="flex-1 p-3 overflow-hidden flex flex-col gap-2.5">
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={readingsSearch}
          onChange={e => onReadingsSearchChange(e.target.value)}
          placeholder="Buscar SKU o nombre..."
          className="w-full pl-8 pr-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none min-h-[42px]"
        />
      </div>

      <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 rounded-xl p-0.5 text-xs font-bold shrink-0">
        <button
          type="button"
          onClick={() => onReadingsViewModeChange('GROUPED')}
          className={`px-2.5 py-1.5 rounded-lg transition-all ${
            readingsViewMode === 'GROUPED'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-slate-500'
          }`}
        >
          Agrupado ({groupedSkuEntries.length})
        </button>
        <button
          type="button"
          onClick={() => onReadingsViewModeChange('CHRONO')}
          className={`px-2.5 py-1.5 rounded-lg transition-all ${
            readingsViewMode === 'CHRONO'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-slate-500'
          }`}
        >
          Historial ({currentSession.conteos.length})
        </button>
      </div>
    </div>

    {currentSession.conteos.length === 0 ? (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
        <Barcode className="w-12 h-12 mb-3 opacity-30 text-blue-500" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No hay lecturas registradas</p>
        <p className="text-xs text-slate-400 mt-1 mb-4">Usa la pestaña Pistolear para escanear productos.</p>
        <button type="button" onClick={onGoToScan} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold">
          Ir a Pistolear
        </button>
      </div>
    ) : (
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-0.5">
        {readingsViewMode === 'GROUPED' ? (
          filteredGroupedSkuEntries.map(group => (
            <div
              key={group.sku}
              className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between gap-2"
            >
              <div className="truncate pr-1 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono font-extrabold text-blue-600 dark:text-blue-400 text-sm">{group.sku}</span>
                  {group.mm && group.yyyy && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                      {group.mm}/{group.yyyy}
                    </span>
                  )}
                  {group.ubicaciones.length > 0 && (
                    <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" /> {group.ubicaciones.join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-slate-800 dark:text-slate-100 font-bold text-xs mt-1 line-clamp-2">{group.descripcion}</p>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {group.readingsCount} {group.readingsCount === 1 ? 'lectura' : 'lecturas'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onDecrementSku(group.sku)}
                  className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl font-black text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-90 text-sm"
                >
                  -
                </button>

                <span className="font-black text-base text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1.5 rounded-xl min-w-[42px] text-center font-mono">
                  {group.totalCantidad}
                </span>

                <button
                  type="button"
                  onClick={() => onIncrementSku(group.sku)}
                  className="w-10 h-10 bg-blue-100 dark:bg-blue-900/60 rounded-xl font-black text-blue-700 dark:text-blue-300 flex items-center justify-center active:scale-90 text-sm"
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={() => onRemoveSkuAllEntries(group.sku, group.descripcion)}
                  className="text-slate-400 hover:text-red-600 p-2 ml-0.5"
                  aria-label="Eliminar lecturas del SKU"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          filteredChronoEntries.map(entry => (
            <div
              key={entry.id}
              className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between text-xs"
            >
              <div className="truncate pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-blue-600">{entry.sku}</span>
                  {entry.mm && entry.yyyy && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                      {entry.mm}/{entry.yyyy}
                    </span>
                  )}
                </div>
                <p className="text-slate-700 font-bold truncate mt-0.5">{entry.descripcion}</p>
                <span className="text-[10px] text-slate-400">{new Date(entry.timestamp).toLocaleTimeString('es-CL')}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-black text-sm text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg font-mono">
                  +{entry.cantidad}
                </span>
                <button onClick={() => onRemoveEntry(entry.id)} className="text-slate-400 hover:text-red-600 p-1"
                aria-label="Eliminar lectura">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    )}
  </div>
);