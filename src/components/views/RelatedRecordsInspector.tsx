import React, { useState, useMemo } from 'react';
import { 
  X, 
  Building2, 
  Package, 
  ShieldAlert, 
  Clock, 
  Layers, 
  Search, 
  Plus, 
  Copy, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle, 
  Truck, 
  FileText,
  Calendar,
  Filter
} from 'lucide-react';
import { 
  InventoryItem, 
  SheetRecord, 
  RelatedEntityType 
} from '../../types';
import { 
  buildEntityRelationshipSummary, 
  generateParentChildTextReport, 
  ExtendedRelatedSummary 
} from '../../utils/relatedRecordsEngine';
import { formatDisplayDate, formatLocaleNumber, getItemStatus } from '../../utils/dateCalculations';

export interface RelatedRecordsInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: RelatedEntityType;
  entityValue: string;
  allMainItems: InventoryItem[];
  events?: InventoryItem[];
  products?: SheetRecord[];
  policies?: SheetRecord[];
  onSelectRow?: (item: InventoryItem) => void;
  onOpenCreateBatch?: (prefill: Record<string, string>) => void;
  onOpenCreateIncident?: (sku: string, prefill?: Record<string, string>) => void;
  onApplyFilterToTable?: (value: string) => void;
  showToast?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  customAliases?: Record<string, string[]>;
}

export const RelatedRecordsInspector: React.FC<RelatedRecordsInspectorProps> = ({
  isOpen,
  onClose,
  entityType,
  entityValue,
  allMainItems,
  events = [],
  products = [],
  policies = [],
  onSelectRow,
  onOpenCreateBatch,
  onOpenCreateIncident,
  onApplyFilterToTable,
  showToast,
  customAliases
}) => {
  const [activeTab, setActiveTab] = useState<'batches' | 'incidents' | 'products'>('batches');
  const [filterQuery, setFilterQuery] = useState('');

  // 1. Calcular el grafo de relaciones Parent-Child
  const summary: ExtendedRelatedSummary = useMemo(() => {
    return buildEntityRelationshipSummary(entityType, entityValue, {
      allMainItems,
      events,
      products,
      policies,
      customAliases
    });
  }, [entityType, entityValue, allMainItems, events, products, policies, customAliases]);

  if (!isOpen || !entityValue) return null;

  const handleCopyReport = async () => {
    try {
      const text = generateParentChildTextReport(summary);
      await navigator.clipboard.writeText(text);
      if (showToast) {
        showToast('Resumen copiado al portapapeles para WhatsApp o Correo', 'success');
      }
    } catch {
      if (showToast) showToast('Error al copiar el resumen', 'error');
    }
  };

  const handleCreateChildBatch = () => {
    if (!onOpenCreateBatch) return;
    const prefill: Record<string, string> = {};
    if (entityType === 'proveedor') prefill.PROVEEDOR = entityValue;
    if (entityType === 'sku') prefill.SKU = entityValue;
    if (entityType === 'bodega') prefill.BODEGA = entityValue;
    onOpenCreateBatch(prefill);
    onClose();
  };

  const handleCreateChildIncident = () => {
    if (!onOpenCreateIncident) return;
    const targetSku = entityType === 'sku' ? entityValue : (summary.batches[0]?.SKU || '');
    const prefill: Record<string, string> = {};
    if (entityType === 'proveedor') prefill.PROVEEDOR = entityValue;
    if (entityType === 'bodega') prefill.BODEGA = entityValue;
    onOpenCreateIncident(targetSku, prefill);
    onClose();
  };

  const handleFilterCurrent = () => {
    if (onApplyFilterToTable) {
      onApplyFilterToTable(entityValue);
      if (showToast) {
        showToast(`Filtrando tabla activa por "${entityValue}"`, 'info');
      }
      onClose();
    }
  };

  const getEntityIcon = () => {
    switch (entityType) {
      case 'proveedor': return <Building2 className="w-5 h-5 text-indigo-500" />;
      case 'sku': return <Package className="w-5 h-5 text-blue-500" />;
      case 'bodega': return <Layers className="w-5 h-5 text-emerald-500" />;
      case 'chofer': return <Truck className="w-5 h-5 text-amber-500" />;
      default: return <Package className="w-5 h-5 text-slate-500" />;
    }
  };

  const q = filterQuery.toLowerCase().trim();

  const filteredBatches = summary.batches.filter(b => {
    if (!q) return true;
    return Object.values(b).some(v => v && String(v).toLowerCase().includes(q));
  });

  const filteredIncidents = summary.incidents.filter(inc => {
    if (!q) return true;
    return Object.values(inc).some(v => v && String(v).toLowerCase().includes(q));
  });

  const filteredProducts = summary.catalogProducts.filter(p => {
    if (!q) return true;
    return Object.values(p).some(v => v && String(v).toLowerCase().includes(q));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header Padre */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center justify-center shrink-0">
              {getEntityIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                  Parent Entity: {entityType.toUpperCase()}
                </span>
                {summary.providerInfo && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {summary.providerInfo.policy}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight mt-0.5">
                {entityValue}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 KPIs Clave Parent-Child */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-100/50 dark:bg-slate-950/40 border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Stock en Lotes</span>
            <span className="text-base sm:text-lg font-black text-blue-600 dark:text-blue-400 font-mono">
              {formatLocaleNumber(summary.kpis.totalUnits)} un.
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Lotes Hermanos</span>
            <span className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 font-mono">
              {summary.kpis.totalBatches}
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Lotes Críticos / Vto</span>
            <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 font-mono">
              {summary.kpis.criticalBatchesCount}
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Incidencias / FRC</span>
            <span className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 font-mono">
              {summary.kpis.totalIncidents} ({summary.kpis.pendingIncidentsCount} pend.)
            </span>
          </div>
        </div>

        {/* Acciones Rápidas Parent-Child */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCreateChildBatch}
              className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center gap-1.5 border border-blue-200 dark:border-blue-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Nuevo Lote Hijo</span>
            </button>

            <button
              onClick={handleCreateChildIncident}
              className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center gap-1.5 border border-amber-200 dark:border-amber-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Registrar Incidencia</span>
            </button>

            <button
              onClick={handleFilterCurrent}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filtrar en Tabla</span>
            </button>
          </div>

          <button
            onClick={handleCopyReport}
            className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 font-bold text-xs flex items-center gap-1.5 shadow-2xs"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copiar Informe 360°</span>
          </button>
        </div>

        {/* Tab Selector & Buscador Interno */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('batches')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'batches'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              📦 Lotes de Inventario ({summary.batches.length})
            </button>

            <button
              onClick={() => setActiveTab('incidents')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'incidents'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              ⚠️ Incidencias y FRC ({summary.incidents.length})
            </button>

            {summary.catalogProducts.length > 0 && (
              <button
                onClick={() => setActiveTab('products')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'products'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                📋 Catálogo Maestro ({summary.catalogProducts.length})
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar en registros..."
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg w-full sm:w-48 outline-hidden"
            />
          </div>
        </div>

        {/* Sub-tabla Interactiva */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'batches' && (
            <div className="space-y-2">
              {filteredBatches.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No se encontraron lotes de inventario asociados.
                </div>
              ) : (
                filteredBatches.map((batch, idx) => {
                  const status = getItemStatus(batch, Object.keys(batch));
                  const sku = batch.SKU || batch.sku || '-';
                  const desc = batch.DESCRIPCION || batch.descripcion || batch.NOMBRE || '-';
                  const cant = batch.CANTIDAD || batch.cantidad || '1';
                  const fecha = batch.FECHA_VC || batch.fecha_vc || `${batch.MES}/${batch.ANIO}` || '-';

                  return (
                    <div
                      key={idx}
                      onClick={() => onSelectRow?.(batch)}
                      className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer transition-all flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                            SKU {sku}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${status.color}`}>
                            {status.icon} {status.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                          {desc}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-extrabold text-xs text-slate-800 dark:text-slate-200">
                          {formatLocaleNumber(cant)} un.
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Vto: {formatDisplayDate(fecha)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'incidents' && (
            <div className="space-y-2">
              {filteredIncidents.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No hay incidencias ni eventos registrados.
                </div>
              ) : (
                filteredIncidents.map((inc, idx) => {
                  const tipo = inc.TIPO_EVENTO || inc.tipo_evento || 'Incidencia';
                  const obs = inc.OBSERVACIONES || inc.observaciones || inc.DETALLE || '-';
                  const fecha = inc.FECHA_EVENTO || inc.fecha_evento || inc.FECHA || '-';
                  const frc = inc.FRC_N || inc.frc_n || inc.FOLIO || '';

                  return (
                    <div
                      key={idx}
                      onClick={() => onSelectRow?.(inc)}
                      className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-amber-400 cursor-pointer transition-all flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200">
                            {tipo}
                          </span>
                          {frc && (
                            <span className="text-[10px] font-mono font-bold text-slate-500">
                              FRC: {frc}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700 dark:text-slate-300 truncate mt-1">
                          {obs}
                        </div>
                      </div>

                      <div className="text-right shrink-0 text-[11px] text-slate-400 font-mono">
                        {formatDisplayDate(fecha)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'products' && (
            <div className="space-y-2">
              {filteredProducts.map((p, idx) => {
                const sku = p.SKU || p.sku || '-';
                const desc = p.DESCRIPCION || p.descripcion || p.NOMBRE || '-';
                const cat = p.CATEGORIA || p.categoria || '-';

                return (
                  <div
                    key={idx}
                    className="p-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        SKU {sku}
                      </span>
                      <div className="text-slate-600 dark:text-slate-300">{desc}</div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {cat}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
