import React, { useState, useEffect, useRef } from 'react';
import { Package, X, AlertCircle, CheckCircle2, Clock, Plus, Edit2, Eye, EyeOff, SlidersHorizontal, Link2, Trash2, ChevronDown, Barcode as BarcodeIcon } from 'lucide-react';
import { InventoryItem, EventCategory , SheetRecord } from '../../types';
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
import { findColumnBySemantic, getFieldLabel, orderFieldsForDisplay } from '../../utils/columnAliases';
import { findMasterProduct, getMasterProductSummary } from '../../utils/referenceResolver';
import { Barcode } from '../common/Barcode';

import { STORAGE_KEYS, readStorage, booleanMapSchema } from '../../utils/appStorage';
interface ItemDetailDrawerProps {
  product: InventoryItem | null;
  onClose: () => void;
  onEdit: (product: InventoryItem) => void;
  onDeleteRow?: (product: InventoryItem) => void;
  onPrintBarcode?: (product: InventoryItem) => void;
  onNewEventForProduct: (sku: string, category?: EventCategory) => void;
  allMainItems: InventoryItem[];
  policies: SheetRecord[];
  products?: SheetRecord[];
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
  products = [],
  customAliases
}) => {
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>(() =>
    readStorage<Record<string, boolean>>(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, booleanMapSchema, {})
  );
  const [isConfiguringFields, setIsConfiguringFields] = useState(false);
  // El codigo de barras y el bloque del maestro son referencia, no operacion diaria:
  // arrancan plegados para que vencimientos e incidencias queden a la vista.
  const [showBarcode, setShowBarcode] = useState(false);
  const [showMaster, setShowMaster] = useState(false);
  const [showMasterRef, setShowMasterRef] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Al cambiar de registro con el panel abierto, el scroll vuelve arriba: si no, el
  // detalle del registro nuevo entra a media altura del anterior.
  const identityKey = product?._entityKey ?? product?._rowIndex;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [identityKey]);

  // Escape cierra el panel. En movil el backdrop ya lo permite; en escritorio el panel
  // va en flujo y no hay backdrop, asi que sin esto solo cerraria el boton X.
  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, onClose]);

  const toggleFieldVisibility = (key: string) => {
    setHiddenFields(prev => {
      const updated = {
        ...prev,
        [key]: !prev[key]
      };
      try {
        localStorage.setItem(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, JSON.stringify(updated));
      } catch (err) {
        console.warn('Error saving detail drawer hidden fields:', err);
      }
      return updated;
    });
  };

  const handleShowAllFields = () => {
    setHiddenFields({});
    try {
      localStorage.removeItem(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS);
    } catch (err) {
      console.warn('Error resetting detail drawer hidden fields:', err);
    }
  };

  if (!product) return null;

  const productKeys = Object.keys(product).filter(k => !k.startsWith('_'));
  // Orden operativo y etiquetas legibles: la hoja trae `FECHA_VENCIMIENTO`, no texto para el operario.
  const orderedKeys = orderFieldsForDisplay(productKeys, customAliases);
  const visibleKeys = orderedKeys.filter(k => !hiddenFields[k]);
  const shownKeys = showAllFields ? visibleKeys : visibleKeys.filter(k => {
    const v = product[k];
    return v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '-';
  });
  const hiddenCount = productKeys.filter(k => hiddenFields[k]).length;
  const emptyCount = visibleKeys.length - shownKeys.length;

  const status = getItemStatus(product, productKeys);
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
    /*
     * Master-detail estilo AppSheet.
     *
     * En escritorio el panel NO flota: es un hermano en flujo dentro del `flex` del
     * dashboard, así que divide la pantalla de verdad. La tabla queda viva a la
     * izquierda y se puede cambiar de registro con el detalle abierto — al cambiar
     * `product`, este componente se re-renderiza con los datos nuevos sin cerrarse.
     *
     * En móvil no hay ancho para dividir, así que conserva el patrón anterior:
     * overlay con backdrop y foco atrapado.
     */
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:backdrop-blur-none lg:w-[28rem] xl:w-[32rem] 2xl:w-[36rem] lg:shrink-0 lg:border-l lg:border-slate-200 lg:dark:border-slate-800">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 lg:max-w-none lg:shadow-none lg:border-l-0">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/90">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-md shadow-blue-200 dark:shadow-none">
                <Package className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-2.5 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
                    SKU: {sku}
                  </span>
                  {policyName !== '-' && (
                    <span className="text-[11px] font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800 truncate max-w-[14rem]" title={policyName}>
                      Política: {policyName}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 leading-snug line-clamp-2">{name}</h2>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
            {onPrintBarcode && sku && sku !== '-' && (
              <button
                onClick={() => onPrintBarcode(product)}
                className="p-2 text-indigo-700 dark:text-indigo-300 bg-indigo-600/10 border border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors"
                title="Imprimir código de barras del SKU en formato ticket"
              >
                <BarcodeIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onEdit(product)}
              className="p-2 text-blue-700 dark:text-blue-300 bg-blue-600/10 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-600 hover:text-white transition-colors"
              title="Editar registro"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            {onDeleteRow && (
              <button
                onClick={() => {
                  onDeleteRow(product);
                  onClose();
                }}
                className="p-2 text-rose-600 dark:text-rose-400 bg-rose-600/10 border border-rose-200 dark:border-rose-800 rounded-xl hover:bg-rose-600 hover:text-white transition-colors"
                title="Eliminar registro"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              title="Cerrar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          </div>

          {/* Banda de estado operativo: la respuesta que el operario viene a buscar. */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1 ${status.color}`}>
              {status.icon}
              <span>{status.label}</span>
            </span>
            {status.actionType !== 'SIN_ACCION' && (
              <span className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${status.actionColor}`}>
                {status.actionIcon}
                <span>{status.actionLabel}</span>
              </span>
            )}
            {status.daysToRetire !== null && (
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {status.daysToRetire < 0 ? `vencido hace ${Math.abs(status.daysToRetire)}d` : `retiro en ${status.daysToRetire}d`}
              </span>
            )}
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 ml-auto">
              {expirations.length} venc. · {incidents.length} incid.
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Expirations Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Vencimientos ({expirations.length})</span>
              </h4>
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
                <span>Incidencias & FRC ({incidents.length})</span>
              </h4>
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

          {/* Product Master Fields */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setShowMaster(v => !v)}
                className="flex items-center gap-1.5 text-left group"
              >
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showMaster ? '' : '-rotate-90'}`} />
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Datos del Registro ({shownKeys.length}/{productKeys.length})
                </h4>
                {(hiddenCount > 0 || emptyCount > 0) && (
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 normal-case">
                    {hiddenCount > 0 && `${hiddenCount} oculto${hiddenCount > 1 ? 's' : ''}`}
                    {hiddenCount > 0 && emptyCount > 0 && ' · '}
                    {emptyCount > 0 && `${emptyCount} vacío${emptyCount > 1 ? 's' : ''}`}
                  </span>
                )}
              </button>
              <button
                onClick={() => setIsConfiguringFields(!isConfiguringFields)}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800/80 shrink-0"
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
                        <span className="truncate">{getFieldLabel(key, customAliases)}</span>
                        {isHidden ? <EyeOff className="w-3.5 h-3.5 shrink-0 text-slate-400" /> : <Eye className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {showMaster && (
            <>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {shownKeys
                .map((key) => {
                  const val = product[key];
                  return (
                    <div key={key} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 group relative">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">{getFieldLabel(key, customAliases)}</span>
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
            {emptyCount > 0 && (
              <button
                onClick={() => setShowAllFields(v => !v)}
                className="mt-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showAllFields ? 'Ocultar campos vacíos' : `Mostrar ${emptyCount} campo${emptyCount > 1 ? 's' : ''} vacío${emptyCount > 1 ? 's' : ''}`}
              </button>
            )}
            </>
            )}
          </div>

          {/* AppSheet Feature: Ref Master Product Connection Card */}
          {masterSummary && (
            <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-slate-50 dark:from-indigo-950/40 dark:via-blue-950/20 dark:to-slate-900 border border-blue-200 dark:border-blue-800/80 rounded-2xl shadow-xs overflow-hidden">
              <button
                onClick={() => setShowMasterRef(v => !v)}
                className="w-full p-4 flex items-center justify-between gap-2 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs shrink-0">
                    <Link2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 font-mono block">
                      Ref: Catálogo de Productos
                    </span>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {showMasterRef ? 'Datos Vinculados del Maestro' : (masterSummary.name || 'Datos Vinculados del Maestro')}
                    </h4>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Sincronizado
                  </span>
                  <ChevronDown className={`w-4 h-4 text-blue-500 transition-transform ${showMasterRef ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {showMasterRef && (
              <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs animate-in fade-in duration-200">
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
              )}
            </div>
          )}

          {/* Barcode Visualizer Card */}
          {sku && sku !== '-' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
              <button
                onClick={() => setShowBarcode(v => !v)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
                  <BarcodeIcon className="w-3.5 h-3.5 text-indigo-500" />
                  Código de Barras 1D (Code 128)
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showBarcode ? 'rotate-180' : ''}`} />
              </button>
              {showBarcode && (
                <div className="px-4 pb-4 flex flex-col items-center justify-center text-center animate-in fade-in duration-200">
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
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center gap-2">
          <div className="flex items-center gap-2 w-full">
            <button
              onClick={() => onNewEventForProduct(sku, 'VENCIMIENTO')}
              className="flex-1 px-3.5 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-200 dark:shadow-none flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Vencimiento</span>
            </button>
            <button
              onClick={() => onNewEventForProduct(sku, 'TRANSPORTE')}
              className="flex-1 px-3.5 py-2 bg-amber-600 text-white font-bold text-xs rounded-xl hover:bg-amber-700 shadow-sm shadow-amber-200 dark:shadow-none flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Incidencia</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

