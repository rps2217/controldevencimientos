import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  Package, 
  Layers, 
  ChevronDown, 
  Plus, 
  ExternalLink,
  Calendar,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { InventoryItem, SheetRecord, EventCategory } from '../../../types';
import { findColumnBySemantic } from '../../../utils/columnAliases';
import { formatDisplayDate, formatLocaleNumber, getItemStatus } from '../../../utils/dateCalculations';
import { buildEntityRelationshipSummary } from '../../../utils/relatedRecordsEngine';

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

  if (!skuSummary && !providerSummary && !warehouseSummary) {
    return null;
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
      {/* Header with Title and Inspector Link */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-500" />
          <span>Registros Relacionados (Parent-Child)</span>
        </h4>

        {currentEntityValue && onOpenInspector && (
          <button
            type="button"
            onClick={() => {
              const mappedType = activeTab === 'provider' ? 'proveedor' : activeTab === 'warehouse' ? 'bodega' : 'sku';
              onOpenInspector(mappedType, currentEntityValue);
            }}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <span>Ver Visión 360°</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
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

      {/* Mini Batches Sub-list */}
      {activeSummary && (
        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {activeSummary.batches.slice(0, 8).map((batch, idx) => {
            const status = getItemStatus(batch, Object.keys(batch));
            const bSku = batch.SKU || batch.sku || '-';
            const bQty = batch.CANTIDAD || batch.cantidad || '1';
            const bFecha = batch.FECHA_VC || batch.fecha_vc || `${batch.MES}/${batch.ANIO}` || '-';

            return (
              <div
                key={idx}
                onClick={() => onSelectRelatedItem?.(batch)}
                className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2 text-xs hover:border-blue-400 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                    {bSku}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${status.color}`}>
                    {status.label}
                  </span>
                </div>

                <div className="text-right shrink-0 font-mono text-[11px]">
                  <span className="font-bold text-slate-700 dark:text-slate-300 mr-2">
                    {formatLocaleNumber(bQty)} un.
                  </span>
                  <span className="text-slate-400">
                    {formatDisplayDate(bFecha)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
