import React, { useState } from 'react';
import { 
  Package, X, AlertCircle, CheckCircle2, Clock, Truck, FileSpreadsheet, PackageX, RotateCcw, Plus, ExternalLink, Edit2, Eye, EyeOff, SlidersHorizontal, Link2, Trash2, Barcode as BarcodeIcon 
} from 'lucide-react';
import { InventoryItem, EventCategory } from '../../types';
import { 
  EVENT_CATEGORIES, 
  renderEventIcon, 
  getItemStatus, 
  getEventCategory, 
  getItemResolutionStatus,
  formatDisplayDate, 
  formatLocaleNumber,
  parseAnyDate
} from '../../utils/dateCalculations';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { findMasterProduct, getMasterProductSummary } from '../../utils/referenceResolver';
import { Barcode } from '../common/Barcode';

interface ItemDetailDrawerProps {
  product: InventoryItem | null;
  onClose: () => void;
  onEdit: (product: InventoryItem) => void;
  onDeleteRow?: (product: InventoryItem) => void;
  onPrintBarcode?: (product: InventoryItem) => void;
  onNewEventForProduct: (sku: string, category?: EventCategory) => void;
  allMainItems: InventoryItem[];
  policies: any[];
  products?: any[];
  customAliases?: Record<string, string[]>;
}

export const ItemDetailDrawer: React.FC<ItemDetailDrawerProps> = ({
  product,
  onClose,
  onEdit,
  onDeleteRow,
  onPrintBarcode,
  onNewEventForProduct,
  allMainItems,
  policies,
  products = [],
  customAliases
}) => {
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('appsheet_detail_hidden_fields');
      return saved ? JSON.parse(saved) : {};
    } catch (err) {
      console.warn('Error loading detail drawer hidden fields:', err);
      return {};
    }
  });
  const [isConfiguringFields, setIsConfiguringFields] = useState(false);

  const toggleFieldVisibility = (key: string) => {
    setHiddenFields(prev => {
      const updated = {
        ...prev,
        [key]: !prev[key]
      };
      try {
        localStorage.setItem('appsheet_detail_hidden_fields', JSON.stringify(updated));
      } catch (err) {
        console.warn('Error saving detail drawer hidden fields:', err);
      }
      return updated;
    });
  };

  const handleShowAllFields = () => {
    setHiddenFields({});
    try {
      localStorage.removeItem('appsheet_detail_hidden_fields');
    } catch (err) {
      console.warn('Error resetting detail drawer hidden fields:', err);
    }
  };

  if (!product) return null;

  const productKeys = Object.keys(product).filter(k => !k.startsWith('_'));
  const skuKey = findColumnBySemantic(productKeys, 'sku', customAliases) || 'SKU';
  const nameKey = findColumnBySemantic(productKeys, 'descripcion', customAliases) || '';
  const policyKey = findColumnBySemantic(productKeys, 'politica', customAliases) || '';

  const sku = product[skuKey] || '-';
  const name = (nameKey && product[nameKey]) || 'Detalle del Producto';
  const policyName = (policyKey && product[policyKey]) || '-';

  // AppSheet Ref: Find corresponding product in master catalog
  const masterProduct = sku !== '-' && products.length > 0
    ? findMasterProduct(sku, products, customAliases)
    : null;
  const masterSummary = masterProduct 
    ? getMasterProductSummary(masterProduct, customAliases) 
    : null;

  // Find related records for this SKU in main and event records
  const relatedRecords = allMainItems.filter(item => {
    const itemKeys = Object.keys(item);
    const itSkuCol = findColumnBySemantic(itemKeys, 'sku') || '';
    const itSku = item[itSkuCol];
    return itSku && String(itSku).trim() === String(sku).trim();
  });

  const expirations = relatedRecords
    .filter(r => getEventCategory(r, Object.keys(r)) === 'VENCIMIENTO')
    .sort((a, b) => {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      const aVcCol = findColumnBySemantic(aKeys, 'fecha_vc', customAliases);
      const bVcCol = findColumnBySemantic(bKeys, 'fecha_vc', customAliases);
      const dA = aVcCol && a[aVcCol] ? parseAnyDate(a[aVcCol]) : null;
      const dB = bVcCol && b[bVcCol] ? parseAnyDate(b[bVcCol]) : null;
      if (!dA && !dB) return 0;
      if (!dA) return 1;
      if (!dB) return -1;
      return dA.getTime() - dB.getTime();
    });

  const incidents = relatedRecords.filter(r => getEventCategory(r, Object.keys(r)) !== 'VENCIMIENTO');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/90 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-md shadow-blue-200 dark:shadow-none">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-2.5 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
                  SKU: {sku}
                </span>
                {policyName !== '-' && (
                  <span className="text-xs font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800">
                    Política: {policyName}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{name}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onPrintBarcode && sku && sku !== '-' && (
              <button
                onClick={() => onPrintBarcode(product)}
                className="px-3 py-2 bg-indigo-600/10 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold text-xs rounded-xl hover:bg-indigo-600 hover:text-white transition-colors shadow-xs flex items-center gap-1.5"
                title="Imprimir código de barras del SKU en formato ticket"
              >
                <BarcodeIcon className="w-3.5 h-3.5" />
                <span>Ticket Barra</span>
              </button>
            )}
            <button
              onClick={() => onEdit(product)}
              className="px-3 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5"
              title="Editar registro"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Editar</span>
            </button>
            {onDeleteRow && (
              <button
                onClick={() => {
                  onDeleteRow(product);
                  onClose();
                }}
                className="px-3 py-2 bg-rose-600/10 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold text-xs rounded-xl hover:bg-rose-600 hover:text-white transition-colors flex items-center gap-1.5"
                title="Eliminar registro"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Barcode Visualizer Card */}
          {sku && sku !== '-' && (
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col items-center justify-center text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono mb-2 flex items-center gap-1.5">
                <BarcodeIcon className="w-3.5 h-3.5 text-indigo-500" />
                Código de Barras 1D (Code 128)
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-inner max-w-full overflow-x-auto flex justify-center">
                <Barcode 
                  value={sku} 
                  width={1.6} 
                  height={44} 
                  showText={true} 
                  fontSize={11} 
                  color="#0f172a" 
                />
              </div>
            </div>
          )}

          {/* AppSheet Feature: Ref Master Product Connection Card */}
          {masterSummary && (
            <div className="p-4 bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-slate-50 dark:from-indigo-950/40 dark:via-blue-950/20 dark:to-slate-900 border border-blue-200 dark:border-blue-800/80 rounded-2xl shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs">
                    <Link2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 font-mono">
                      Ref: Catálogo de Productos
                    </span>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Datos Vinculados del Maestro
                    </h4>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Sincronizado
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Descripción Maestra</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 truncate block mt-0.5" title={masterSummary.name}>
                    {masterSummary.name || '-'}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Proveedor / Lab.</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 truncate block mt-0.5" title={masterSummary.provider}>
                    {masterSummary.provider || '-'}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Categoría / Familia</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 truncate block mt-0.5" title={masterSummary.category}>
                    {masterSummary.category || '-'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Product Master Fields */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <span>Datos Maestros ({productKeys.filter(k => !hiddenFields[k]).length}/{productKeys.length})</span>
              </h4>
              <button
                onClick={() => setIsConfiguringFields(!isConfiguringFields)}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800/80"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>{isConfiguringFields ? 'Ocultar Configuración' : 'Personalizar Vista (AppSheet)'}</span>
              </button>
            </div>

            {/* AppSheet Field Visibility Config Panel */}
            {isConfiguringFields && (
              <div className="mb-4 p-4 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-2xl animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Visibilidad de Campos (Vista Detalle)</span>
                  <button 
                    onClick={handleShowAllFields}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    Mostrar Todos
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                  {productKeys.map(key => {
                    const isHidden = !!hiddenFields[key];
                    return (
                      <button
                        key={key}
                        onClick={() => toggleFieldVisibility(key)}
                        className={`flex items-center justify-between gap-2 p-2 rounded-xl text-xs font-medium border text-left transition-colors ${
                          isHidden 
                            ? 'bg-slate-200/60 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 line-through' 
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-300'
                        }`}
                      >
                        <span className="truncate">{key}</span>
                        {isHidden ? <EyeOff className="w-3.5 h-3.5 shrink-0 text-slate-400" /> : <Eye className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {productKeys
                .filter(k => !hiddenFields[k])
                .map((key) => {
                  const val = product[key];
                  return (
                    <div key={key} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 group relative">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">{key}</span>
                        <button
                          onClick={() => toggleFieldVisibility(key)}
                          className="text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                          title="Ocultar campo en esta vista"
                        >
                          <EyeOff className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words mt-0.5 block">{String(val || '-')}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Expirations Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Lotes y Vencimientos ({expirations.length})</span>
              </h4>
              <button 
                onClick={() => onNewEventForProduct(sku, 'VENCIMIENTO')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Registrar Vencimiento
              </button>
            </div>

            {expirations.length === 0 ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-xs text-slate-400 dark:text-slate-500">
                No hay fechas de vencimiento registradas para este SKU.
              </div>
            ) : (
              <div className="space-y-2">
                {expirations.map((exp, idx) => {
                  const expKeys = Object.keys(exp);
                  const st = getItemStatus(exp, expKeys);
                  const vcCol = findColumnBySemantic(expKeys, 'fecha_vc');
                  const retCol = findColumnBySemantic(expKeys, 'fecha_retiro');
                  const cantCol = findColumnBySemantic(expKeys, 'cantidad');
                  const loteCol = findColumnBySemantic(expKeys, 'lote');

                  const fVc = vcCol && exp[vcCol] ? formatDisplayDate(exp[vcCol]) : '-';
                  const fRet = retCol && exp[retCol] ? formatDisplayDate(exp[retCol]) : '-';
                  const cant = cantCol && exp[cantCol] ? formatLocaleNumber(exp[cantCol]) : '-';
                  const lote = (loteCol && exp[loteCol]) || '-';

                  return (
                    <div key={idx} className="p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Vence: {fVc}</span>
                          {lote !== '-' && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 font-mono">Lote: {lote}</span>}
                          {cant !== '-' && <span className="text-[10px] bg-blue-50 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold">{cant} un.</span>}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Fecha Retiro: {fRet}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1 shrink-0 ${st.color}`}>
                          {st.icon}
                          <span>{st.label}</span>
                        </span>
                        {st.actionType !== 'SIN_ACCION' && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 shrink-0 ${st.actionColor}`}>
                            {st.actionIcon}
                            <span>{st.actionLabel}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Incidents Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Historial de Incidencias & FRC ({incidents.length})</span>
              </h4>
              <button 
                onClick={() => onNewEventForProduct(sku, 'TRANSPORTE')}
                className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Registrar Incidencia
              </button>
            </div>

            {incidents.length === 0 ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-xs text-slate-400 dark:text-slate-500">
                Sin registros de mermas, deterioros o diferencias de pedido.
              </div>
            ) : (
              <div className="space-y-2">
                {incidents.map((inc, idx) => {
                  const incKeys = Object.keys(inc);
                  const cat = getEventCategory(inc, incKeys);
                  const catDef = EVENT_CATEGORIES[cat];
                  const cantCol = findColumnBySemantic(incKeys, 'cantidad');
                  const obsCol = findColumnBySemantic(incKeys, 'observacion');

                  const cant = cantCol && inc[cantCol] ? formatLocaleNumber(inc[cantCol]) : '-';
                  const obs = (obsCol && inc[obsCol]) || '-';

                  const resStatus = getItemResolutionStatus(inc, incKeys);

                  return (
                    <div key={idx} className={`p-3.5 bg-white dark:bg-slate-800 border rounded-xl flex items-center justify-between gap-4 shadow-sm ${resStatus.isResolved ? 'border-emerald-200 dark:border-emerald-800/60' : 'border-amber-200 dark:border-amber-800/60'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${catDef.iconBg} shrink-0`}>
                          {renderEventIcon(cat, 'w-4 h-4')}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{catDef.shortLabel}</span>
                            {cant !== '-' && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-bold font-mono">{cant} un.</span>}
                            {resStatus.isResolved ? (
                              <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-md font-bold font-mono">
                                ✅ Realizado (TR: {resStatus.traspasoNumber})
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded-md font-bold">
                                ⏳ Pendiente (Sin Traspaso)
                              </span>
                            )}
                          </div>
                          {obs !== '-' && <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{obs}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Cerrar
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNewEventForProduct(sku, 'VENCIMIENTO')}
              className="px-3.5 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-200 dark:shadow-none flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Vencimiento</span>
            </button>
            <button
              onClick={() => onNewEventForProduct(sku, 'TRANSPORTE')}
              className="px-3.5 py-2 bg-amber-600 text-white font-bold text-xs rounded-xl hover:bg-amber-700 shadow-sm shadow-amber-200 dark:shadow-none flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Incidencia</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

