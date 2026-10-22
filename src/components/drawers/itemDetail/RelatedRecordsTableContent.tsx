import React, { useState, useMemo } from 'react';
import { 
  Search, Layers, ExternalLink, Plus, 
  ArrowUpDown, ArrowUp, ArrowDown, Package,
  Eye, EyeOff, RotateCcw, ArrowLeft
} from 'lucide-react';
import { InventoryItem } from '../../../types';
import { formatDisplayDate, formatLocaleNumber, getItemStatus, extractItemFields } from '../../../utils/dateCalculations';
import { parseAnyDate, parseLocaleNumber } from '../../../utils/pureCalculations';

export interface RelatedRecordsTableContentProps {
  title: string;
  entityValue: string;
  entityType: 'sku' | 'proveedor' | 'bodega';
  batches: InventoryItem[];
  onSelectItem: (item: InventoryItem) => void;
  onNewEvent?: (sku: string) => void;
  onBack?: () => void;
}

type SortField = 'date' | 'qty' | 'sku' | 'desc' | 'bodega' | 'status';
type SortDirection = 'asc' | 'desc';
type RelatedColKey = 'sku' | 'desc' | 'bodega' | 'qty' | 'date' | 'status' | 'action';

const RELATED_COLUMNS: { key: RelatedColKey; label: string }[] = [
  { key: 'sku', label: 'SKU / Lote' },
  { key: 'desc', label: 'Descripción' },
  { key: 'bodega', label: 'Bodega / Ubicación' },
  { key: 'qty', label: 'Cantidad' },
  { key: 'date', label: 'Vencimiento' },
  { key: 'status', label: 'Estado' },
  { key: 'action', label: 'Acción' },
];

export const RelatedRecordsTableContent: React.FC<RelatedRecordsTableContentProps> = ({
  title,
  entityValue,
  entityType,
  batches,
  onSelectItem,
  onNewEvent,
  onBack
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [hiddenCols, setHiddenCols] = useState<Record<RelatedColKey, boolean>>({
    sku: false,
    desc: false,
    bodega: false,
    qty: false,
    date: false,
    status: false,
    action: false,
  });
  const [isColSelectorOpen, setIsColSelectorOpen] = useState(false);

  const toggleCol = (colKey: RelatedColKey) => {
    setHiddenCols(prev => ({ ...prev, [colKey]: !prev[colKey] }));
  };

  const showAllCols = () => {
    setHiddenCols({ sku: false, desc: false, bodega: false, qty: false, date: false, status: false, action: false });
  };

  const visibleColsCount = RELATED_COLUMNS.filter(c => !hiddenCols[c.key]).length;

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection(field === 'qty' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400/50 group-hover:text-slate-400 shrink-0" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 font-bold shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 font-bold shrink-0" />
    );
  };

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
      let comp = 0;

      if (sortBy === 'sku') {
        comp = fieldsA.sku.localeCompare(fieldsB.sku);
      } else if (sortBy === 'desc') {
        comp = fieldsA.desc.localeCompare(fieldsB.desc);
      } else if (sortBy === 'bodega') {
        comp = (fieldsA.bodega || '').localeCompare(fieldsB.bodega || '');
      } else if (sortBy === 'qty') {
        const qA = parseLocaleNumber(fieldsA.qty) || 0;
        const qB = parseLocaleNumber(fieldsB.qty) || 0;
        comp = qA - qB;
      } else if (sortBy === 'status') {
        const sA = getItemStatus(a, Object.keys(a));
        const sB = getItemStatus(b, Object.keys(b));
        comp = (sA.daysToRetire ?? 9999) - (sB.daysToRetire ?? 9999);
      } else {
        const dA = parseAnyDate(fieldsA.fecha);
        const dB = parseAnyDate(fieldsB.fecha);
        const tA = dA ? dA.getTime() : Infinity;
        const tB = dB ? dB.getTime() : Infinity;
        comp = tA - tB;
      }

      return sortDirection === 'desc' ? -comp : comp;
    });
  }, [batches, searchTerm, statusFilter, sortBy, sortDirection]);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden" onClick={() => isColSelectorOpen && setIsColSelectorOpen(false)}>
      {/* Header */}
      <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0"
              title="Volver a la ficha principal"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Ficha</span>
            </button>
          )}
          <div className="p-2.5 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 truncate">
              <span className="truncate">{title}</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shrink-0">
                {entityValue}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Vista completa de registros relacionados (Total: {batches.length} ítems)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onNewEvent && entityType === 'sku' && (
            <button
              type="button"
              onClick={() => onNewEvent(entityValue)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Evento FRC</span>
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
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

        <div className="flex items-center gap-2 text-xs flex-wrap">
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
            onChange={(e) => {
              const newField = e.target.value as SortField;
              setSortBy(newField);
              if (newField === 'qty') setSortDirection('desc');
            }}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="date">Ordenar por Vencimiento</option>
            <option value="qty">Ordenar por Cantidad</option>
            <option value="sku">Ordenar por SKU / Lote</option>
            <option value="desc">Ordenar por Descripción</option>
            <option value="bodega">Ordenar por Bodega / Ubicación</option>
            <option value="status">Ordenar por Estado / Alerta</option>
          </select>

          <button
            type="button"
            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {sortDirection === 'desc' ? (
              <>
                <ArrowDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 font-bold" />
                <span>Mayor a menor</span>
              </>
            ) : (
              <>
                <ArrowUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 font-bold" />
                <span>Menor a mayor</span>
              </>
            )}
          </button>

          {/* Column Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsColSelectorOpen(!isColSelectorOpen)}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-500" />
              <span>Columnas ({visibleColsCount}/{RELATED_COLUMNS.length})</span>
            </button>

            {isColSelectorOpen && (
              <div 
                className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-2 space-y-1"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Alternar Columnas
                  </span>
                  <button
                    type="button"
                    onClick={showAllCols}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" /> Todas
                  </button>
                </div>
                <div className="py-1 space-y-0.5 max-h-56 overflow-y-auto">
                  {RELATED_COLUMNS.map(col => {
                    const isVisible = !hiddenCols[col.key];
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => toggleCol(col.key)}
                        className={`w-full px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors text-left cursor-pointer ${
                          isVisible ? 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200' : 'text-slate-400 line-through'
                        }`}
                      >
                        <span className="truncate">{col.label}</span>
                        {isVisible ? <Eye className="w-3.5 h-3.5 text-indigo-500" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50 dark:bg-slate-950/40">
        {filteredBatches.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <Package className="w-10 h-10 stroke-1" />
            <p className="text-sm font-medium">No se encontraron registros relacionados.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  {!hiddenCols.sku && <th onClick={() => handleSort('sku')} className="py-3 px-4 cursor-pointer">SKU / Lote {renderSortIcon('sku')}</th>}
                  {!hiddenCols.desc && <th onClick={() => handleSort('desc')} className="py-3 px-4 cursor-pointer">Descripción {renderSortIcon('desc')}</th>}
                  {!hiddenCols.bodega && <th onClick={() => handleSort('bodega')} className="py-3 px-4 cursor-pointer">Bodega {renderSortIcon('bodega')}</th>}
                  {!hiddenCols.qty && <th onClick={() => handleSort('qty')} className="py-3 px-4 text-right cursor-pointer">Cantidad {renderSortIcon('qty')}</th>}
                  {!hiddenCols.date && <th onClick={() => handleSort('date')} className="py-3 px-4 cursor-pointer">Vencimiento {renderSortIcon('date')}</th>}
                  {!hiddenCols.status && <th onClick={() => handleSort('status')} className="py-3 px-4 cursor-pointer">Estado {renderSortIcon('status')}</th>}
                  {!hiddenCols.action && <th className="py-3 px-4 text-center">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBatches.map((item, index) => {
                  const status = getItemStatus(item, Object.keys(item));
                  const { sku, desc, lote, qty, fecha, bodega } = extractItemFields(item);
                  return (
                    <tr
                      key={index}
                      onClick={() => onSelectItem(item)}
                      className="hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 cursor-pointer transition-colors group"
                    >
                      {!hiddenCols.sku && (
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600">
                          {sku} {lote && <span className="text-[10px] text-slate-400 block">L: {lote}</span>}
                        </td>
                      )}
                      {!hiddenCols.desc && <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs">{desc}</td>}
                      {!hiddenCols.bodega && <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{bodega}</td>}
                      {!hiddenCols.qty && <td className="py-3 px-4 text-right font-mono font-bold text-slate-700 dark:text-slate-300">{formatLocaleNumber(qty)} un.</td>}
                      {!hiddenCols.date && <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">{formatDisplayDate(fecha)}</td>}
                      {!hiddenCols.status && (
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                      )}
                      {!hiddenCols.action && (
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onSelectItem(item); }}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-colors inline-flex items-center justify-center cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 shrink-0">
        <div>Mostrando <span className="font-bold text-slate-700 dark:text-slate-200">{filteredBatches.length}</span> de <span className="font-bold text-slate-700 dark:text-slate-200">{batches.length}</span> registros</div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Volver a Ficha
          </button>
        )}
      </div>
    </div>
  );
};
