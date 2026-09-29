import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, X, AlertCircle, CheckCircle2, Clock, Plus, Edit2, Eye, EyeOff, 
  SlidersHorizontal, Link2, Trash2, ChevronDown, Barcode as BarcodeIcon, FileText, Copy 
} from 'lucide-react';
import { InventoryItem, EventCategory, SheetRecord } from '../../types';
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
  onCopy?: (product: InventoryItem) => void;
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
  onCopy,
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
  
  // States that reset per-item
  const [showBarcode, setShowBarcode] = useState(false);
  const [showMaster, setShowMaster] = useState(false);
  const [showMasterRef, setShowMasterRef] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [showSkuTrace, setShowSkuTrace] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const productKeys = product ? Object.keys(product).filter(k => !k.startsWith('_')) : [];
  
  // 1. Contextual mode detection
  const hasSku = product ? findColumnBySemantic(productKeys, 'sku', customAliases) !== undefined : false;
  const hasFechaVc = product ? (
    findColumnBySemantic(productKeys, 'fecha_vc', customAliases) !== undefined || 
    (findColumnBySemantic(productKeys, 'mes', customAliases) !== undefined && 
     findColumnBySemantic(productKeys, 'anio', customAliases) !== undefined)
  ) : false;
  const hasTipoEvento = product ? findColumnBySemantic(productKeys, 'tipo_evento', customAliases) !== undefined : false;
  const hasDiasAnticipacion = product ? findColumnBySemantic(productKeys, 'dias_anticipacion', customAliases) !== undefined : false;

  let detailMode: 'vencimiento' | 'incidencia' | 'catalogo' | 'politica' = 'vencimiento';

  if (hasTipoEvento) {
    detailMode = 'incidencia';
  } else if (hasSku) {
    if (hasFechaVc) {
      detailMode = 'vencimiento';
    } else {
      detailMode = 'catalogo';
    }
  } else if (hasDiasAnticipacion) {
    detailMode = 'politica';
  }

  const identityKey = product ? (product._entityKey ?? product._rowIndex) : undefined;

  // Whenever the active item changes, reset collapse states intelligently based on mode
  useEffect(() => {
    if (!product) return;
    scrollRef.current?.scrollTo({ top: 0 });
    
    // In Incident or Policy modes, keep the record fields open immediately
    // In SKU/Vencimiento/Catalog modes, we collapse technical fields because other visual summaries are more important
    setShowMaster(detailMode === 'incidencia' || detailMode === 'politica');
    setShowSkuTrace(false);        // Close sku trace accordion by default
    setShowBarcode(false);
    setShowMasterRef(false);
  }, [identityKey, detailMode, product]);

  // Escape key listener to close drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!product) return null;

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

  // Setup keys and display metadata
  const orderedKeys = orderFieldsForDisplay(productKeys, customAliases);
  const visibleKeys = orderedKeys.filter(k => !hiddenFields[k]);
  const shownKeys = showAllFields ? visibleKeys : visibleKeys.filter(k => {
    const v = product[k];
    return v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '-';
  });
  const hiddenCount = productKeys.filter(k => hiddenFields[k]).length;
  const emptyCount = visibleKeys.length - shownKeys.length;

  const skuKey = findColumnBySemantic(productKeys, 'sku', customAliases) || 'SKU';
  const nameKey = findColumnBySemantic(productKeys, 'descripcion', customAliases) || '';
  const policyKey = findColumnBySemantic(productKeys, 'politica', customAliases) || '';

  const sku = product[skuKey] || '-';
  const name = (nameKey && product[nameKey]) || 'Detalle del Registro';
  const policyName = (policyKey && product[policyKey]) || '-';

  // AppSheet Ref: Find corresponding product in master catalog
  const masterProduct = sku !== '-' && products.length > 0
    ? findMasterProduct(sku, products, customAliases)
    : null;
  const masterSummary = masterProduct 
    ? getMasterProductSummary(masterProduct, customAliases) 
    : null;

  // Find related records for this SKU in main and event records
  const relatedRecords = sku !== '-' ? allMainItems.filter(item => {
    const itemKeys = Object.keys(item);
    const itSkuCol = findColumnBySemantic(itemKeys, 'sku') || '';
    const itSku = item[itSkuCol];
    return itSku && String(itSku).trim() === String(sku).trim();
  }) : [];

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

  // Mode Specific Computations
  const status = getItemStatus(product, productKeys);
  const category = getEventCategory(product, productKeys);
  const catDef = EVENT_CATEGORIES[category];
  const resStatus = getItemResolutionStatus(product, productKeys);

  // Query linked master products if we are in POLICY mode
  const policyNameCol = findColumnBySemantic(productKeys, 'politica', customAliases) || 
                         findColumnBySemantic(productKeys, 'proveedor', customAliases) || 
                         productKeys[0];
  const activePolicyName = product[policyNameCol];
  const linkedMasterProducts = (detailMode === 'politica' && activePolicyName)
    ? products.filter(p => {
        const pKeys = Object.keys(p);
        const pPolicyCol = findColumnBySemantic(pKeys, 'politica', customAliases);
        return pPolicyCol && p[pPolicyCol] && String(p[pPolicyCol]).trim().toLowerCase() === String(activePolicyName).trim().toLowerCase();
      })
    : [];

  // Shared Header Buttons Component
  const renderHeaderActions = () => (
    <div className="flex items-center gap-1.5 shrink-0">
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
      {onCopy && (
        <button
          onClick={() => onCopy(product)}
          className="p-2 text-blue-700 dark:text-blue-300 bg-blue-600/10 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
          title="Copiar y editar registro"
        >
          <Copy className="w-4 h-4" />
        </button>
      )}
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
  );

  // Expirations Section Render Block
  const renderExpirationsList = () => (
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
              <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-4 animate-in fade-in duration-100">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Vence: {fVc}</span>
                    {lote !== '-' && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 font-mono">Lote: {lote}</span>}
                    {cant !== '-' && <span className="text-[10px] bg-blue-50 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold">{cant} un.</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Fecha Retiro: {fRet}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 ${st.color}`}>
                    {st.icon}
                    <span>{st.label}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Incidents Section Render Block
  const renderIncidentsList = () => (
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
            const catDefLocal = EVENT_CATEGORIES[cat];
            const cantCol = findColumnBySemantic(incKeys, 'cantidad');
            const obsCol = findColumnBySemantic(incKeys, 'observacion');

            const cant = cantCol && inc[cantCol] ? formatLocaleNumber(inc[cantCol]) : '-';
            const obs = (obsCol && inc[obsCol]) || '-';

            const resStatusLocal = getItemResolutionStatus(inc, incKeys);

            return (
              <div key={idx} className={`p-3 bg-slate-50 dark:bg-slate-800/60 border rounded-xl flex items-center justify-between gap-4 animate-in fade-in duration-100 ${resStatusLocal.isResolved ? 'border-emerald-100 dark:border-emerald-900/40' : 'border-amber-100 dark:border-amber-900/40'}`}>
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`p-1.5 rounded-lg ${catDefLocal?.iconBg || 'bg-slate-100 text-slate-600'} shrink-0 mt-0.5`}>
                    {renderEventIcon(cat, 'w-3.5 h-3.5')}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{catDefLocal?.shortLabel || 'Incidencia'}</span>
                      {cant !== '-' && <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-black font-mono">{cant} un.</span>}
                      {resStatusLocal.isResolved ? (
                        <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                          TR: {resStatusLocal.traspasoNumber}
                        </span>
                      ) : (
                        <span className="text-[9px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded font-bold">
                          ⏳ Pendiente
                        </span>
                      )}
                    </div>
                    {obs !== '-' && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{obs}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Database/Registry Fields Render Block
  const renderRecordFieldsBlock = (headerText: string) => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4.5 space-y-4 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setShowMaster(v => !v)}
          className="flex items-center gap-1.5 text-left group cursor-pointer"
        >
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showMaster ? '' : '-rotate-90'}`} />
          <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {headerText} ({shownKeys.length}/{productKeys.length})
          </h4>
          {(hiddenCount > 0 || emptyCount > 0) && (
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 normal-case">
              {hiddenCount > 0 && `${hiddenCount} oculto`}
              {hiddenCount > 0 && emptyCount > 0 && ' · '}
              {emptyCount > 0 && `${emptyCount} vacío`}
            </span>
          )}
        </button>
        <button
          onClick={() => setIsConfiguringFields(!isConfiguringFields)}
          className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800/80 shrink-0 cursor-pointer"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>{isConfiguringFields ? 'Ocultar' : 'Personalizar'}</span>
        </button>
      </div>

      {/* Field Customization Panel */}
      {isConfiguringFields && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Configurar Columnas Visibles</span>
            <button 
              onClick={handleShowAllFields}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-bold cursor-pointer"
            >
              Resetear Vista
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
            {productKeys.map(key => {
              const isHidden = !!hiddenFields[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleFieldVisibility(key)}
                  className={`flex items-center justify-between gap-2 p-1.5 rounded-lg text-[11px] font-medium border text-left transition-colors cursor-pointer ${
                    isHidden 
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 line-through' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-300'
                  }`}
                >
                  <span className="truncate">{getFieldLabel(key, customAliases)}</span>
                  {isHidden ? <EyeOff className="w-3 h-3 text-slate-400" /> : <Eye className="w-3 h-3 text-blue-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showMaster && (
        <div className="animate-in fade-in duration-150">
          <div className="grid grid-cols-2 gap-2.5">
            {shownKeys.map((key) => {
              const val = product[key];
              return (
                <div key={key} className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 group relative flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">{getFieldLabel(key, customAliases)}</span>
                    <button
                      onClick={() => toggleFieldVisibility(key)}
                      className="text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 cursor-pointer"
                      title="Ocultar columna"
                    >
                      <EyeOff className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 break-words mt-1 block">
                    {String(val !== undefined && val !== null && String(val).trim() !== '' ? val : '-')}
                  </span>
                </div>
              );
            })}
          </div>
          {emptyCount > 0 && (
            <button
              onClick={() => setShowAllFields(v => !v)}
              className="mt-3 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline block cursor-pointer"
            >
              {showAllFields ? 'Ocultar campos vacíos' : `Mostrar ${emptyCount} campos vacíos`}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 top-[65px] z-30 flex justify-end bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-155 lg:static lg:inset-auto lg:top-auto lg:z-auto lg:bg-transparent lg:backdrop-blur-none lg:w-[28rem] xl:w-[32rem] 2xl:w-[36rem] lg:shrink-0 lg:h-full">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 lg:max-w-none lg:shadow-sm lg:rounded-3xl lg:border border-slate-200 dark:border-slate-800">
        
        {/* ================= HEADER SECTION (CONTEXTUAL) ================= */}
        {detailMode === 'incidencia' ? (
          /* 1. INCIDENT CONTEXT HEADER */
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/90">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-2xl ${catDef?.iconBg || 'bg-amber-100 text-amber-700'} flex items-center justify-center font-bold text-lg shrink-0 shadow-md shadow-amber-200/50 dark:shadow-none`}>
                  {renderEventIcon(category, "w-5 h-5")}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sku && sku !== '-' && (
                      <span className="text-xs font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
                        SKU: {sku}
                      </span>
                    )}
                    {catDef && (
                      <span className={`text-[10px] font-black tracking-wider uppercase ${catDef.badgeBg} ${catDef.badgeText} px-2 py-0.5 rounded-lg border ${catDef.badgeBorder} truncate max-w-[14rem]`}>
                        {catDef.shortLabel}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 leading-snug line-clamp-2 font-black">
                    {name}
                  </h2>
                </div>
              </div>
              {renderHeaderActions()}
            </div>

            {/* Resolution Sub-band */}
            <div className="flex items-center gap-2 flex-wrap mt-3.5">
              {resStatus.isResolved ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80 animate-in fade-in duration-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Realizado (TR: {resStatus.traspasoNumber})</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/80 animate-pulse">
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Pendiente de Traspaso</span>
                </span>
              )}
              {policyName !== '-' && (
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Política SKU: {policyName}
                </span>
              )}
            </div>
          </div>
        ) : detailMode === 'politica' ? (
          /* 2. POLICY CONTEXT HEADER */
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/90 animate-in fade-in duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-md shadow-amber-200 dark:shadow-none">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black tracking-wider uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800">
                      Regla de Retorno
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Acuerdo Comercial
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 leading-snug line-clamp-2 font-black">
                    {activePolicyName || name}
                  </h2>
                </div>
              </div>
              {renderHeaderActions()}
            </div>
          </div>
        ) : detailMode === 'catalogo' ? (
          /* 3. CATALOG PRODUCT CONTEXT HEADER */
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/90 animate-in fade-in duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-md shadow-blue-200 dark:shadow-none">
                  <Package className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {sku && sku !== '-' && (
                      <span className="text-xs font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-2.5 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
                        SKU: {sku}
                      </span>
                    )}
                    <span className="text-[10px] font-black tracking-wider uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      Ficha de Catálogo
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 leading-snug line-clamp-2 font-black">
                    {name}
                  </h2>
                </div>
              </div>
              {renderHeaderActions()}
            </div>
          </div>
        ) : (
          /* 4. DEFAULT PRODUCT / EXPIRATION CONTEXT HEADER */
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/90">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-md shadow-indigo-200 dark:shadow-none">
                  <Package className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {sku && sku !== '-' && (
                      <span className="text-xs font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-2.5 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
                        SKU: {sku}
                      </span>
                    )}
                    {policyName !== '-' && (
                      <span className="text-[11px] font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800 truncate max-w-[14rem]" title={policyName}>
                        Política: {policyName}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 leading-snug line-clamp-2 font-black">
                    {name}
                  </h2>
                </div>
              </div>
              {renderHeaderActions()}
            </div>

            {/* Expiration state band */}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 ${status.color}`}>
                {status.icon}
                <span>{status.label}</span>
              </span>
              {status.actionType !== 'SIN_ACCION' && (
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border flex items-center gap-1 ${status.actionColor}`}>
                  {status.actionIcon}
                  <span>{status.actionLabel}</span>
                </span>
              )}
              {status.daysToRetire !== null && (
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  {status.daysToRetire < 0 ? `vencido hace ${Math.abs(status.daysToRetire)}d` : `retiro en ${status.daysToRetire}d`}
                </span>
              )}
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 ml-auto">
                {expirations.length} venc. · {incidents.length} incid.
              </span>
            </div>
          </div>
        )}

        {/* ================= CONTENT BODY SECTION ================= */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/40 dark:bg-slate-950/10">
          
          {detailMode === 'incidencia' ? (
            /* A. INCIDENT LAYOUT (Incident fields first, SKU trace collapsed at bottom) */
            <>
              {renderRecordFieldsBlock('Detalles de la Ficha / Registro')}

              {sku && sku !== '-' && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-3xs overflow-hidden transition-all">
                  <button
                    onClick={() => setShowSkuTrace(v => !v)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 rounded-xl">
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                          Trazabilidad del SKU asociado ({sku})
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {expirations.length} vencimientos · {incidents.length} incidencias en total
                        </p>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showSkuTrace ? 'rotate-180' : ''}`} />
                  </button>

                  {showSkuTrace && (
                    <div className="p-4 border-t border-slate-150 dark:border-slate-800/80 space-y-5 bg-slate-50/50 dark:bg-slate-900/20 animate-in fade-in duration-150">
                      {renderExpirationsList()}
                      {renderIncidentsList()}

                      {masterSummary && (
                        <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-slate-50 dark:from-indigo-950/40 dark:via-blue-950/20 dark:to-slate-900 border border-blue-200 dark:border-blue-800/80 rounded-xl shadow-xs overflow-hidden">
                          <button
                            onClick={() => setShowMasterRef(v => !v)}
                            className="w-full p-3.5 flex items-center justify-between gap-2 text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="p-1.5 bg-blue-600 text-white rounded-lg shrink-0">
                                <Link2 className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 font-mono block">
                                  Ref: Catálogo de Productos
                                </span>
                                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                  {showMasterRef ? 'Datos del Maestro' : (masterSummary.name || 'Datos del Maestro')}
                                </h4>
                              </div>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-blue-500 transition-transform ${showMasterRef ? 'rotate-180' : ''}`} />
                          </button>
                          {showMasterRef && (
                            <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-white dark:bg-slate-800/80 p-2 rounded-lg border border-slate-200/80">
                                <span className="text-[9px] font-bold text-slate-400 uppercase block">Descripción</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-100 truncate block mt-0.5" title={masterSummary.name}>
                                  {masterSummary.name || '-'}
                                </span>
                              </div>
                              <div className="bg-white dark:bg-slate-800/80 p-2 rounded-lg border border-slate-200/80">
                                <span className="text-[9px] font-bold text-slate-400 uppercase block">Proveedor</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-100 truncate block mt-0.5" title={masterSummary.provider}>
                                  {masterSummary.provider || '-'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {sku && sku !== '-' && (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
                          <button
                            onClick={() => setShowBarcode(v => !v)}
                            className="w-full px-3.5 py-2 flex items-center justify-between text-left cursor-pointer"
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1.5">
                              <BarcodeIcon className="w-3.5 h-3.5 text-indigo-500" />
                              Código de Barras EAN / SKU
                            </span>
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showBarcode ? 'rotate-180' : ''}`} />
                          </button>
                          {showBarcode && (
                            <div className="px-3.5 pb-3.5 flex flex-col items-center justify-center">
                              <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-inner max-w-full overflow-x-auto">
                                <Barcode value={sku} width={1.5} height={40} showText={true} fontSize={10} color="#0f172a" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : detailMode === 'politica' ? (
            /* B. POLICY LAYOUT (Fully expanded commercial terms, scanning linked SKUs) */
            <>
              {renderRecordFieldsBlock('Detalles de la Regla Comercial')}

              {/* Linked Products List */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-500" />
                  <span>Productos que aplican esta política ({linkedMasterProducts.length})</span>
                </h4>

                {linkedMasterProducts.length === 0 ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-xs text-slate-400 dark:text-slate-500">
                    Ningún producto en el catálogo maestro tiene asignada esta política de retorno todavía.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                    {linkedMasterProducts.map((p, idx) => {
                      const pKeys = Object.keys(p);
                      const pSkuCol = findColumnBySemantic(pKeys, 'sku', customAliases) || 'SKU';
                      const pDescCol = findColumnBySemantic(pKeys, 'descripcion', customAliases) || '';
                      const pProvCol = findColumnBySemantic(pKeys, 'proveedor', customAliases) || '';

                      const pSku = p[pSkuCol] || '-';
                      const pDesc = (pDescCol && p[pDescCol]) || 'Producto';
                      const pProv = (pProvCol && p[pProvCol]) || '';

                      return (
                        <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-800/80 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-100">
                          <div className="min-w-0">
                            <span className="text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                              SKU: {String(pSku)}
                            </span>
                            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-1">
                              {String(pDesc)}
                            </h5>
                            {pProv && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                                Lab: {String(pProv)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : detailMode === 'catalogo' ? (
            /* C. CATALOG MASTER LAYOUT (SKU histories expanded, metadata collapsed) */
            <>
              {/* Related Expirations of SKU */}
              {renderExpirationsList()}

              {/* Related Incidents of SKU */}
              {renderIncidentsList()}

              {/* Collapsed Technical Metadata of Product */}
              {renderRecordFieldsBlock('Datos Técnicos del Catálogo')}

              {/* Barcode Visualizer Card */}
              {sku && sku !== '-' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
                  <button
                    onClick={() => setShowBarcode(v => !v)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
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
                        <Barcode value={sku} width={1.6} height={44} showText={true} fontSize={11} color="#0f172a" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* D. DEFAULT PRODUCT / EXPIRATION LAYOUT */
            <>
              {renderExpirationsList()}
              {renderIncidentsList()}
              
              {renderRecordFieldsBlock('Datos Técnicos del Registro')}

              {masterSummary && (
                <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-slate-50 dark:from-indigo-950/40 dark:via-blue-950/20 dark:to-slate-900 border border-blue-200 dark:border-blue-800/80 rounded-2xl shadow-xs overflow-hidden">
                  <button
                    onClick={() => setShowMasterRef(v => !v)}
                    className="w-full p-4 flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
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
                    className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
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
                        <Barcode value={sku} width={1.6} height={44} showText={true} fontSize={11} color="#0f172a" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ================= FOOTER ACTIONS SECTION ================= */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
          {detailMode === 'incidencia' ? (
            /* Incident Mode Footer */
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={() => onEdit(product)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-black text-xs rounded-xl hover:bg-blue-700 shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar Registro de Incidencia</span>
              </button>
              {onDeleteRow && (
                <button
                  onClick={() => {
                    onDeleteRow(product);
                    onClose();
                  }}
                  className="px-4 py-2 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 font-bold text-xs rounded-xl hover:bg-rose-600 hover:text-white transition-all active:scale-98 cursor-pointer"
                  title="Eliminar Incidencia permanentemente"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : detailMode === 'politica' ? (
            /* Policy Mode Footer */
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={() => onEdit(product)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-black text-xs rounded-xl hover:bg-blue-700 shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar Regla de Política</span>
              </button>
              {onDeleteRow && (
                <button
                  onClick={() => {
                    onDeleteRow(product);
                    onClose();
                  }}
                  className="px-4 py-2 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 font-bold text-xs rounded-xl hover:bg-rose-600 hover:text-white transition-all active:scale-98 cursor-pointer"
                  title="Eliminar Política permanentemente"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : detailMode === 'catalogo' ? (
            /* Catalog Mode Footer */
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={() => onNewEventForProduct(sku, 'VENCIMIENTO')}
                className="flex-1 px-3 py-2 bg-blue-600 text-white font-black text-xs rounded-xl hover:bg-blue-700 shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar Vencimiento</span>
              </button>
              <button
                onClick={() => onNewEventForProduct(sku, 'TRANSPORTE')}
                className="flex-1 px-3 py-2 bg-amber-600 text-white font-black text-xs rounded-xl hover:bg-amber-700 shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar Incidencia</span>
              </button>
            </div>
          ) : (
            /* Default Mode Footer */
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={() => onNewEventForProduct(sku, 'VENCIMIENTO')}
                className="flex-1 px-3.5 py-2 bg-blue-600 text-white font-black text-xs rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-200 dark:shadow-none flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuevo Vencimiento</span>
              </button>
              <button
                onClick={() => onNewEventForProduct(sku, 'TRANSPORTE')}
                className="flex-1 px-3.5 py-2 bg-amber-600 text-white font-black text-xs rounded-xl hover:bg-amber-700 shadow-sm shadow-amber-200 dark:shadow-none flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Incidencia</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
