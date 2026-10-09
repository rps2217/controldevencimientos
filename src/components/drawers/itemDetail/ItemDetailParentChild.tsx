import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  ExternalLink,
  Maximize2,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { InventoryItem, SheetRecord, EventCategory } from '../../../types';
import { formatDisplayDate, formatLocaleNumber, getItemStatus, extractItemFields } from '../../../utils/dateCalculations';
import { parseAnyDate, parseLocaleNumber } from '../../../utils/pureCalculations';
import { buildEntityRelationshipSummary } from '../../../utils/relatedRecordsEngine';
import { RelatedRecordsModal } from './RelatedRecordsModal';

interface ItemDetailParentChildProps {
  sku: string;
  provider?: string;
  warehouse?: string;
  allMainItems: InventoryItem[];
  products?: SheetRecord[];
  policies?: SheetRecord[];
  onSelectRelatedItem?: (item: InventoryItem) => void;
  onNewEventForProduct?: (sku: string, category?: EventCategory) => void;
  onOpenInspector?: (entityType: 'sku' | 'proveedor' | 'bodega', entityValue: string) => void;
  customAliases?: Record<string, string[]>;
}

export const ItemDetailParentChild: React.FC<ItemDetailParentChildProps> = ({
  sku,
  provider,
  warehouse,
  allMainItems,
  products = [],
  policies = [],
  onSelectRelatedItem,
  onNewEventForProduct,
  onOpenInspector,
  customAliases
}) => {
  const [activeTab, setActiveTab] = useState<'sku' | 'provider' | 'warehouse'>('sku');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Relaciones por SKU
  const skuSummary = useMemo(() => {
    if (!sku || sku === '-') return null;
    return buildEntityRelationshipSummary('sku', sku, {
      allMainItems,
      products,
      policies,
      customAliases
    });
  }, [sku, allMainItems, products, policies, customAliases]);

  // Relaciones por Proveedor
  const providerSummary = useMemo(() => {
    if (!provider || provider.trim() === '') return null;
    return buildEntityRelationshipSummary('proveedor', provider, {
      allMainItems,
      products,
      policies,
      customAliases
    });
  }, [provider, allMainItems, products, policies, customAliases]);

  // Relaciones por Bodega
  const warehouseSummary = useMemo(() => {
    if (!warehouse || warehouse.trim() === '') return null;
    return buildEntityRelationshipSummary('bodega', warehouse, {
      allMainItems,
      products,
      policies,
      customAliases
    });
  }, [warehouse, allMainItems, products, policies, customAliases]);

  const activeSummary = activeTab === 'sku' 
    ? skuSummary 
    : activeTab === 'provider' 
      ? providerSummary 
      : warehouseSummary;

  const currentEntityValue = activeTab === 'sku' 
    ? sku 
    : activeTab === 'provider' 
      ? provider 
      : warehouse;

  const activeTabTitle = activeTab === 'sku' 
    ? 'Registros del Mismo SKU' 
    : activeTab === 'provider' 
      ? 'Registros del Proveedor' 
      : 'Registros de la Bodega';

  const [subSortBy, setSubSortBy] = useState<'date' | 'qty' | 'lote'>('date');
  const [subSortDir, setSubSortDir] = useState<'asc' | 'desc'>('asc');

  const sortedBatches = useMemo(() => {
    if (!activeSummary) return [];
    return [...activeSummary.batches].sort((a, b) => {
      const fA = extractItemFields(a);
      const fB = extractItemFields(b);
      let comp = 0;
      if (subSortBy === 'qty') {
        const qA = parseLocaleNumber(fA.qty) || 0;
        const qB = parseLocaleNumber(fB.qty) || 0;
        comp = qA - qB;
      } else if (subSortBy === 'lote') {
        comp = (fA.lote || '').localeCompare(fB.lote || '');
      } else {
        // default: 'date'
        const dA = parseAnyDate(fA.fecha);
        const dB = parseAnyDate(fB.fecha);
        const tA = dA ? dA.getTime() : Infinity;
        const tB = dB ? dB.getTime() : Infinity;
        comp = tA - tB;
      }
      return subSortDir === 'desc' ? -comp : comp;
    });
  }, [activeSummary, subSortBy, subSortDir]);

  if (!skuSummary && !providerSummary && !warehouseSummary) {
    return null;
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
      {/* Header with Title, Expand and Inspector Link */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-500" />
          <span>Registros Relacionados (Parent-Child)</span>
        </h4>

        <div className="flex items-center gap-2">
          {activeSummary && activeSummary.batches.length > 0 && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="p-1 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors"
              title="Expandir tabla completa de relacionados"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {currentEntityValue && onOpenInspector && (
            <button
              type="button"
              onClick={() => {
                const mappedType = activeTab === 'provider' ? 'proveedor' : activeTab === 'warehouse' ? 'bodega' : 'sku';
                onOpenInspector(mappedType, currentEntityValue);
              }}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <span>Visión 360°</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-900/60 p-1 rounded-xl text-xs font-bold">
        {skuSummary && (
          <button
            type="button"
            onClick={() => setActiveTab('sku')}
            className={`flex-1 py-1 px-2 rounded-lg transition-all text-center truncate ${
              activeTab === 'sku'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Mismo SKU ({skuSummary.batches.length})
          </button>
        )}

        {providerSummary && (
          <button
            type="button"
            onClick={() => setActiveTab('provider')}
            className={`flex-1 py-1 px-2 rounded-lg transition-all text-center truncate ${
              activeTab === 'provider'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Proveedor ({providerSummary.batches.length})
          </button>
        )}

        {warehouseSummary && (
          <button
            type="button"
            onClick={() => setActiveTab('warehouse')}
            className={`flex-1 py-1 px-2 rounded-lg transition-all text-center truncate ${
              activeTab === 'warehouse'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Bodega ({warehouseSummary.batches.length})
          </button>
        )}
      </div>

      {/* Summary KPI Strip */}
      {activeSummary && (
        <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
          <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-400 block font-bold">Stock Total</span>
            <span className="font-mono font-extrabold text-blue-600 dark:text-blue-400">
              {formatLocaleNumber(activeSummary.kpis.totalUnits)} un.
            </span>
          </div>

          <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-400 block font-bold">Críticos / Vto</span>
            <span className="font-mono font-extrabold text-rose-600 dark:text-rose-400">
              {activeSummary.kpis.criticalBatchesCount} lotes
            </span>
          </div>

          <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-400 block font-bold">Incidencias</span>
            <span className="font-mono font-extrabold text-amber-600 dark:text-amber-400">
              {activeSummary.kpis.totalIncidents}
            </span>
          </div>
        </div>
      )}

      {/* Mini Batches Sub-list with richer info and sorting controls */}
      {activeSummary && (
        <div className="space-y-2">
          {/* Sub-list Sorting Bar */}
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Lotes ({sortedBatches.length})
            </span>
            <div className="flex items-center gap-1.5">
              <select
                value={subSortBy}
                onChange={(e) => {
                  const val = e.target.value as 'date' | 'qty' | 'lote';
                  setSubSortBy(val);
                  if (val === 'qty') setSubSortDir('desc');
                }}
                className="text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="date">Vencimiento</option>
                <option value="qty">Cantidad</option>
                <option value="lote">Lote</option>
              </select>

              <button
                type="button"
                onClick={() => setSubSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="p-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors"
                title={subSortDir === 'desc' ? 'Mayor a menor (Clic para cambiar a menor a mayor)' : 'Menor a mayor (Clic para cambiar a mayor a menor)'}
              >
                {subSortDir === 'desc' ? (
                  <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {sortedBatches.slice(0, 6).map((batch, idx) => {
              const status = getItemStatus(batch, Object.keys(batch));
              const { sku: bSku, desc: bDesc, lote: bLote, qty: bQty, fecha: bFecha } = extractItemFields(batch);

              return (
                <div
                  key={idx}
                  onClick={() => onSelectRelatedItem?.(batch)}
                  className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2 text-xs hover:border-indigo-500 cursor-pointer transition-colors group"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                        {bSku}
                      </span>
                      {bLote && (
                        <span className="text-[10px] font-mono text-slate-400">
                          L: {bLote}
                        </span>
                      )}
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    {bDesc && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {bDesc}
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0 font-mono text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300 block">
                      {formatLocaleNumber(bQty)} un.
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatDisplayDate(bFecha)}
                    </span>
                  </div>
                </div>
              );
            })}

            {sortedBatches.length > 6 && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="w-full py-1.5 text-center text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-xl transition-colors flex items-center justify-center gap-1"
              >
                <span>Ver todos los {sortedBatches.length} registros (Expandir tabla)</span>
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Expanded Modal */}
      {activeSummary && currentEntityValue && (
        <RelatedRecordsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={activeTabTitle}
          entityValue={currentEntityValue}
          entityType={activeTab === 'provider' ? 'proveedor' : activeTab === 'warehouse' ? 'bodega' : 'sku'}
          batches={activeSummary.batches}
          onSelectItem={(item) => {
            onSelectRelatedItem?.(item);
          }}
          onNewEvent={onNewEventForProduct}
        />
      )}
    </div>
  );
};

