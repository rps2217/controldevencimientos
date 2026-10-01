import React, { useState } from 'react';
import { StockCountEntry } from '../../../types';
import { formatLocaleNumber } from '../../../utils/pureCalculations';
import { Trash2, Edit2, Check, Search, Hash } from 'lucide-react';

interface StockCountAuditsTableProps {
  entries: StockCountEntry[];
  onUpdateEntryQuantity: (entryId: string, newQty: number) => void;
  onRemoveEntry: (entryId: string) => void;
}

export const StockCountAuditsTable: React.FC<StockCountAuditsTableProps> = ({
  entries,
  onUpdateEntryQuantity,
  onRemoveEntry
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<string>('');
  const [filterQuery, setFilterQuery] = useState<string>('');

  const handleStartEdit = (entry: StockCountEntry) => {
    setEditingId(entry.id);
    setEditQty(String(entry.cantidad));
  };

  const handleSaveEdit = (entryId: string) => {
    const parsed = parseFloat(editQty);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdateEntryQuantity(entryId, parsed);
    }
    setEditingId(null);
  };

  const filteredEntries = filterQuery.trim()
    ? entries.filter(e => 
        e.sku.toLowerCase().includes(filterQuery.toLowerCase()) || 
        (e.descripcion && e.descripcion.toLowerCase().includes(filterQuery.toLowerCase()))
      )
    : entries;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
        <Hash className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
          No hay lecturas registradas en esta sesión.
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Ingresa un SKU o escanea con el lector óptico para comenzar a contar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search in readings list */}
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrar lecturas por SKU o descripción..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500"
          />
        </div>
        <span className="text-[11px] font-bold text-slate-400 font-mono shrink-0">
          {filteredEntries.length} de {entries.length} lecturas
        </span>
      </div>

      {/* Readings Table */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs max-h-80 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sticky top-0 z-10">
              <th className="px-3 py-2">Hora</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2">MM/YYYY</th>
              <th className="px-3 py-2 text-right">Cant.</th>
              <th className="px-3 py-2 text-center w-16">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
            {filteredEntries.map((entry) => {
              const isEditing = editingId === entry.id;
              const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';

              return (
                <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-400 whitespace-nowrap">
                    {timeStr}
                  </td>
                  <td className="px-3 py-2 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {entry.sku}
                  </td>
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                    {entry.descripcion || '-'}
                  </td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    {entry.mm && entry.yyyy ? `${entry.mm}/${entry.yyyy}` : '-'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100">
                    {isEditing ? (
                      <input
                        type="number"
                        min={1}
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(entry.id);
                        }}
                        autoFocus
                        className="w-16 px-1.5 py-0.5 text-right font-bold bg-amber-50 dark:bg-slate-800 border border-amber-400 rounded outline-none"
                      />
                    ) : (
                      formatLocaleNumber(entry.cantidad)
                    )}
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(entry.id)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded transition-colors"
                          title="Guardar cantidad"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(entry)}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded transition-colors"
                          title="Editar cantidad"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveEntry(entry.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded transition-colors"
                        title="Eliminar lectura"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
