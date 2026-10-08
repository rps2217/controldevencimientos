import React, { useState, useMemo } from 'react';
import { 
  X, Search, Layers, ExternalLink, Calendar, Plus, 
  ArrowUpDown, Package, AlertTriangle 
} from 'lucide-react';
import { InventoryItem } from '../../../types';
import { formatDisplayDate, formatLocaleNumber, getItemStatus, extractItemFields } from '../../../utils/dateCalculations';

interface RelatedRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  entityValue: string;
  entityType: 'sku' | 'proveedor' | 'bodega';
  batches: InventoryItem[];
  onSelectItem: (item: InventoryItem) => void;
  onNewEvent?: (sku: string) => void;
}

export const RelatedRecordsModal: React.FC<RelatedRecordsModalProps> = ({
  isOpen,
  onClose,
  title,
  entityValue,
  entityType,
  batches,
  onSelectItem,
  onNewEvent
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'qty' | 'sku'>('date');

  const filteredBatches = useMemo(() => {
    return batches.filter(item => {
      const { sku, desc, lote } = extractItemFields(item);
      const query = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || sku.toLowerCase().includes(query) || desc.toLowerCase().includes(query) || lote.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (statusFilter !== 'all') {
        const status = getItemStatus(item, Object.keys(item));
        const isExp = status.code === 'EXPIRED';
        const isCrit = status.code === 'RETIRE_NOW' || status.code === 'UPCOMING' || status.code === 'DRAINAGE_PM';
        if (statusFilter === 'critical' && !isCrit && !isExp) return false;
        if (statusFilter === 'expired' && !isExp) return false;
        if (statusFilter === 'ok' && (isCrit || isExp)) return false;
      }

      return true;
    }).sort((a, b) => {
      const fieldsA = extractItemFields(a);
      const fieldsB = extractItemFields(b);
      if (sortBy === 'sku') {
        return fieldsA.sku.localeCompare(fieldsB.sku);
      }
      if (sortBy === 'qty') {
        const qA = Number(fieldsA.qty || 0);
        const qB = Number(fieldsB.qty || 0);
        return qB - qA;
      }
      // default sortBy === 'date'
      return fieldsA.fecha.localeCompare(fieldsB.fecha);
    });
  }, [batches, searchTerm, statusFilter, sortBy]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[85vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                  {entityValue}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Visualización completa de registros relacionados (Total: {batches.length} ítems)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNewEvent && entityType === 'sku' && (
              <button
                type="button"
                onClick={() => {
                  onNewEvent(entityValue);
                  onClose();
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Evento FRC</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por SKU, descripción o lote..."
                className="w-full pl-9 pr-4 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="all">Todos los estados</option>
              <option value="ok">En regla / Normal</option>
              <option value="critical">Críticos / Vto cercano</option>
              <option value="expired">Vencidos</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="date">Ordenar por Vencimiento</option>
              <option value="qty">Ordenar por Cantidad</option>
              <option value="sku">Ordenar por SKU</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950/40">
          {filteredBatches.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-2">
              <Package className="w-10 h-10 stroke-1" />
              <p className="text-sm font-medium">No se encontraron registros que coincidan con los filtros.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <th className="py-3 px-4">SKU / Lote</th>
                    <th className="py-3 px-4">Descripción del Producto</th>
                    <th className="py-3 px-4">Bodega / Ubicación</th>
                    <th className="py-3 px-4 text-right">Cantidad</th>
                    <th className="py-3 px-4">Vencimiento</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredBatches.map((item, index) => {
                    const status = getItemStatus(item, Object.keys(item));
                    const { sku, desc, lote, qty, fecha, bodega } = extractItemFields(item);

                    return (
                      <tr 
                        key={index}
                        onClick={() => {
                          onSelectItem(item);
                          onClose();
                        }}
                        className="hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                            {sku}
                          </div>
                          {lote && (
                            <div className="text-[10px] font-mono text-slate-400">
                              Lote: {lote}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">
                          {desc}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {bodega}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                          {formatLocaleNumber(qty)} un.
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {formatDisplayDate(fecha)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectItem(item);
                              onClose();
                            }}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-600 hover:text-white rounded-xl transition-colors inline-flex items-center justify-center"
                            title="Inspeccionar registro"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Summary */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div>
            Mostrando <span className="font-bold text-slate-700 dark:text-slate-200">{filteredBatches.length}</span> de <span className="font-bold text-slate-700 dark:text-slate-200">{batches.length}</span> registros relacionados
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
