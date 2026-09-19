import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  X, Loader2, Sparkles, AlertCircle, Link2, Info, Search, 
  Check, RotateCcw, Eye, EyeOff, Sliders, Plus, CheckCircle2, ChevronDown, Calendar,
  AlertTriangle, ArrowRight, Layers, ShieldCheck, Clock, FileText
} from 'lucide-react';
import { SheetProperties, InventoryItem, EventCategory, SheetConfig } from '../../types';
import { 
  EVENT_CATEGORIES, 
  renderEventIcon, 
  formatInputDate, 
  formatInputDateTime, 
  formatDisplayDate, 
  parseAnyDate,
  parseLocaleNumber
} from '../../utils/dateCalculations';
import { evaluateShowIf, getOperationalSuggestions, QUICK_QUANTITY_PRESETS } from '../../utils/dynamicFormRules';
import { 
  findMasterProduct, 
  searchMasterProducts, 
  dereferenceMasterProduct, 
  getMasterProductSummary,
  getMasterCatalogIndex,
  MasterProductSummary,
  resolveItemPolicyAndRetiro
} from '../../utils/referenceResolver';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { findExistingItemByCuVc, extractCuVcFromRow } from '../../utils/cuVcConsolidator';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem: InventoryItem | null;
  onSetEditingItem?: (item: InventoryItem | null) => void;
  existingItems?: InventoryItem[];
  activeSheet: SheetProperties | null;
  activeView: string;
  headers: string[];
  formData: Record<string, string>;
  formErrors: Record<string, string>;
  selectedEventCategory: EventCategory;
  onSelectEventCategory: (cat: EventCategory) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onSave: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;
  sheetConfig: SheetConfig;
  products: any[];
  onBatchUpdateFormData?: (updates: Record<string, string>) => void;
  policies?: any[];
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  isOpen,
  onClose,
  editingItem,
  onSetEditingItem,
  existingItems = [],
  activeSheet,
  activeView,
  headers,
  formData,
  formErrors,
  selectedEventCategory,
  onSelectEventCategory,
  onChange,
  onSave,
  isSaving,
  sheetConfig,
  products,
  onBatchUpdateFormData,
  policies = []
}) => {
  // Show_If state: whether to force show all fields or keep conditional filter
  const [showAllFields, setShowAllFields] = useState(false);

  // Ref / Master Catalog Search Typeahead state
  const [catalogSearchOpen, setCatalogSearchOpen] = useState(false);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const catalogSearchRef = useRef<HTMLDivElement>(null);

  // Close catalog search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (catalogSearchRef.current && !catalogSearchRef.current.contains(e.target as Node)) {
        setCatalogSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const candidateCuVc = useMemo(() => {
    if (!formData || !headers) return { cuVc: '', sku: '', yyyy: '', mm: '', isValidComposite: false };
    return extractCuVcFromRow(formData, headers, sheetConfig?.customAliases);
  }, [formData, headers, sheetConfig?.customAliases]);

  const existingCuVcMatch = useMemo(() => {
    if (editingItem || !existingItems || existingItems.length === 0 || !candidateCuVc.isValidComposite) {
      return null;
    }
    const match = findExistingItemByCuVc(formData, existingItems, headers, sheetConfig?.customAliases);
    return match.exists ? match : null;
  }, [editingItem, existingItems, formData, headers, sheetConfig?.customAliases, candidateCuVc]);

  const isMainOrEvents = activeView === 'main' || activeView === 'events';
  const categoryDef = EVENT_CATEGORIES[selectedEventCategory] || EVENT_CATEGORIES.VENCIMIENTO;

  // Identify key semantic columns in current headers
  const skuHeader = findColumnBySemantic(headers, 'sku', sheetConfig.customAliases) || headers.find(h => /sku|código|codigo/i.test(h));
  const currentSkuVal = skuHeader ? String(formData[skuHeader] || '').trim() : '';

  const cantHeader = findColumnBySemantic(headers, 'cantidad', sheetConfig.customAliases) || 
                     headers.find(h => /^(cant|cantidad|stock|unidades)$/i.test(String(h).trim()));

  const currentEnteredQty = cantHeader && formData[cantHeader] 
    ? parseLocaleNumber(formData[cantHeader]) 
    : 0;

  const handleConsolidateWithExisting = () => {
    if (!existingCuVcMatch || !existingCuVcMatch.existingItem) return;
    const existing = existingCuVcMatch.existingItem;
    const newSummedQty = existingCuVcMatch.currentQuantity + currentEnteredQty;

    const updates: Record<string, string> = {};
    headers.forEach(h => {
      updates[h] = existing[h] !== undefined && existing[h] !== null ? String(existing[h]) : (formData[h] || '');
    });

    if (cantHeader) {
      updates[cantHeader] = String(newSummedQty);
    }

    if (onBatchUpdateFormData) {
      onBatchUpdateFormData(updates);
    }
    if (onSetEditingItem) {
      onSetEditingItem(existing);
    }
  };

  const handleLoadExistingRow = () => {
    if (!existingCuVcMatch || !existingCuVcMatch.existingItem) return;
    const existing = existingCuVcMatch.existingItem;
    const updates: Record<string, string> = {};
    headers.forEach(h => {
      updates[h] = existing[h] !== undefined && existing[h] !== null ? String(existing[h]) : '';
    });
    if (onBatchUpdateFormData) {
      onBatchUpdateFormData(updates);
    }
    if (onSetEditingItem) {
      onSetEditingItem(existing);
    }
  };

  // Look up linked master product (memoized)
  const masterSummaries = useMemo(() => {
    if (!products || products.length === 0) return [];
    return getMasterCatalogIndex(products, sheetConfig.customAliases).summaries;
  }, [products, sheetConfig.customAliases]);

  const linkedMasterProduct = useMemo(() => {
    return currentSkuVal && currentSkuVal.length >= 2 && products.length > 0 
      ? findMasterProduct(currentSkuVal, products, sheetConfig.customAliases) 
      : null;
  }, [currentSkuVal, products, sheetConfig.customAliases]);

  const linkedMasterSummary = useMemo(() => {
    return linkedMasterProduct 
      ? getMasterProductSummary(linkedMasterProduct, sheetConfig.customAliases) 
      : null;
  }, [linkedMasterProduct, sheetConfig.customAliases]);

  // UNIFIED POLICY & RETIREMENT RESOLUTION (uses exact same logic as Virtual Column)
  const resolvedPolicyInfo = useMemo(() => {
    return resolveItemPolicyAndRetiro(formData, headers, products, policies, sheetConfig.customAliases);
  }, [formData, headers, products, policies, sheetConfig.customAliases]);

  // Evaluate Show_If for all headers
  const evaluatedFields = headers.map(header => {
    const colSchema = activeSheet?.title ? sheetConfig.schema?.[activeSheet.title]?.[header] : undefined;
    const isKey = colSchema?.isKey;
    const isRequired = colSchema?.required;
    const evaluation = evaluateShowIf(header, selectedEventCategory, formData, isKey, showAllFields, isRequired);
    return {
      header,
      colSchema,
      isKey,
      isRequired,
      ...evaluation
    };
  });

  // Inject virtual FECHA_RETIRO_CALC in the form of the Vencimientos view if not physically present in headers
  const hasRetiroCalc = headers.some(h => /fecha(_|\s)?retiro/i.test(h) || /retiro(_|\s)?calc/i.test(h));
  if (activeView === 'main' && !hasRetiroCalc) {
    evaluatedFields.push({
      header: 'FECHA_RETIRO_CALC',
      colSchema: { type: 'date', behavior: 'calc_retiro', label: 'Fecha Retiro Calc.' } as any,
      isKey: false,
      isRequired: false,
      isVisible: true,
      isCoreField: true,
      reason: 'virtual_field'
    });
  }

  const visibleFields = evaluatedFields.filter(f => f.isVisible);
  const hiddenFieldsCount = evaluatedFields.length - visibleFields.length;

  // Handler for selecting a product from the Ref Catalog
  const handleSelectMasterProduct = (selectedProd: MasterProductSummary) => {
    const updates: Record<string, string> = {};

    if (skuHeader) {
      updates[skuHeader] = selectedProd.sku;
    }

    // De-reference fields from master product to current sheet
    const dereferenced = dereferenceMasterProduct(selectedProd.raw, headers, sheetConfig.customAliases);
    Object.assign(updates, dereferenced);

    if (onBatchUpdateFormData) {
      onBatchUpdateFormData(updates);
    } else {
      // Fallback to updating each field sequentially
      Object.entries(updates).forEach(([k, v]) => {
        onChange({
          target: { name: k, value: String(v) }
        } as React.ChangeEvent<HTMLInputElement>);
      });
    }

    setCatalogSearchOpen(false);
    setCatalogSearchQuery('');
  };

  // Handler for applying resolved commercial policy and retirement days directly
  const handleApplyResolvedPolicy = () => {
    const updates: Record<string, string> = {};
    const policyCol = findColumnBySemantic(headers, 'politica', sheetConfig?.customAliases) || 
                      headers.find(h => /pol[ií]tica|politica|regla/i.test(h));
    const diasCol = findColumnBySemantic(headers, 'dias_retiro', sheetConfig?.customAliases) || 
                    findColumnBySemantic(headers, 'dias_anticipacion', sheetConfig?.customAliases) ||
                    headers.find(h => /dias(_|\s)?(retiro|anticipacion|canje|limite)|dias_retiro_vc/i.test(h));
    const fechaRetiroCol = findColumnBySemantic(headers, 'fecha_retiro', sheetConfig?.customAliases) ||
                           headers.find(h => /retiro|canje_retiro|fecha_canje/i.test(h));

    if (policyCol && resolvedPolicyInfo.policy) {
      updates[policyCol] = resolvedPolicyInfo.policy;
    }
    if (diasCol && resolvedPolicyInfo.diasRetiro) {
      updates[diasCol] = String(resolvedPolicyInfo.diasRetiro);
    }
    if (fechaRetiroCol && resolvedPolicyInfo.fechaRetiroDisplay && resolvedPolicyInfo.fechaRetiroDisplay !== '-') {
      updates[fechaRetiroCol] = resolvedPolicyInfo.fechaRetiroDisplay;
    }
    updates['FECHA_RETIRO_CALC'] = resolvedPolicyInfo.fechaRetiroDisplay;

    if (onBatchUpdateFormData) {
      onBatchUpdateFormData(updates);
    } else {
      Object.entries(updates).forEach(([k, v]) => {
        onChange({ target: { name: k, value: v } } as any);
      });
    }
  };

  // Handler for inserting operational comment suggestion (Valid_If)
  const handleApplySuggestion = (header: string, suggestion: string) => {
    const currentVal = String(formData[header] || '').trim();
    const newVal = currentVal ? `${currentVal}. ${suggestion}` : suggestion;

    if (onBatchUpdateFormData) {
      onBatchUpdateFormData({ [header]: newVal });
    } else {
      onChange({
        target: { name: header, value: newVal }
      } as React.ChangeEvent<HTMLTextAreaElement>);
    }
  };

  // Handler for quantity shortcuts
  const handleAdjustQuantity = (header: string, delta: number) => {
    const currentVal = parseInt(formData[header] || '0', 10);
    const newVal = Math.max(1, (isNaN(currentVal) ? 0 : currentVal) + delta);

    if (onBatchUpdateFormData) {
      onBatchUpdateFormData({ [header]: String(newVal) });
    } else {
      onChange({
        target: { name: header, value: String(newVal) }
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  // Handler for generating TR folio
  const handleGenerateTraspaso = (header: string) => {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const folio = `TR-${randomNum}`;
    if (onBatchUpdateFormData) {
      onBatchUpdateFormData({ [header]: folio });
    } else {
      onChange({
        target: { name: header, value: folio }
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const handleClearTraspaso = (header: string) => {
    if (onBatchUpdateFormData) {
      onBatchUpdateFormData({ [header]: '' });
    } else {
      onChange({
        target: { name: header, value: '' }
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  // Filtered master catalog products for typeahead (memoized)
  const catalogSearchResults = useMemo(() => {
    if (!catalogSearchOpen) return [];
    return searchMasterProducts(
      catalogSearchQuery, 
      products, 
      8, 
      sheetConfig.customAliases
    );
  }, [catalogSearchOpen, catalogSearchQuery, products, sheetConfig.customAliases]);

  if (!isOpen || !activeSheet) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm md:p-4">
      <div className="w-full h-full md:h-auto max-w-2xl bg-white dark:bg-slate-900 md:rounded-3xl shadow-2xl border-0 md:border border-slate-200 dark:border-slate-800 flex flex-col md:max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">
                {editingItem ? 'Editar Registro' : 'Nuevo Registro'}
              </h3>
              <span className="text-[11px] font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                {activeSheet?.title || 'Hoja'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Formulario operativo con reglas condicionales y referencias maestras
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={onSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            
            {/* Event Category Selector (Main or Events views) */}
            {isMainOrEvents && (
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Tipo de Registro / Evento:
                  </label>
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                    Adapta campos (Show_If)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(EVENT_CATEGORIES) as EventCategory[]).map(catKey => {
                    const cat = EVENT_CATEGORIES[catKey];
                    const isSelected = selectedEventCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => onSelectEventCategory(catKey)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                          isSelected 
                            ? `${cat.cardBorder} bg-white dark:bg-slate-800 shadow-sm` 
                            : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className={`p-1 rounded-lg ${cat.iconBg} shrink-0`}>
                          {renderEventIcon(catKey, 'w-3.5 h-3.5')}
                        </div>
                        <div className="overflow-hidden min-w-0">
                          <span className={`text-[11px] font-bold block truncate ${isSelected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>
                            {cat.shortLabel}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2.5 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span>{categoryDef.description}</span>
                </p>
              </div>
            )}

            {/* AppSheet Feature 1: Ref Active Banner (Linked Master Product) */}
            {linkedMasterSummary && (
              <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/80 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.2 rounded font-mono">
                        Ref: Catálogo Maestro
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {linkedMasterSummary.name || linkedMasterSummary.sku}
                      </span>
                    </div>
                     <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {linkedMasterSummary.provider && `Proveedor: ${linkedMasterSummary.provider} • `}
                      {linkedMasterSummary.category && `Familia: ${linkedMasterSummary.category}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectMasterProduct(linkedMasterSummary)}
                  className="shrink-0 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 hover:shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                  title="Vuelve a rellenar descripción y proveedor desde el catálogo maestro"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Sincronizar Ref</span>
                </button>
              </div>
            )}

            {/* Commercial Policy & Withdrawal Info Card (Políticas de Canje & Días de Retiro) */}
            {(activeView === 'main' || activeView === 'events' || Boolean(resolvedPolicyInfo.matchedPolicyEntry || resolvedPolicyInfo.matchedProductEntry)) && (
              <div className="p-3.5 bg-gradient-to-r from-teal-50/90 via-emerald-50/70 to-blue-50/80 dark:from-teal-950/40 dark:via-emerald-950/30 dark:to-blue-950/30 border border-teal-200/90 dark:border-teal-800/80 rounded-2xl shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      <ShieldCheck className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/60 px-2 py-0.5 rounded font-mono border border-teal-200 dark:border-teal-800">
                          Política & Retiro Preventivo
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          resolvedPolicyInfo.source === 'policy_module' 
                            ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300' 
                            : resolvedPolicyInfo.source === 'product_catalog'
                              ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {resolvedPolicyInfo.sourceDescription}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="bg-white/90 dark:bg-slate-800/90 p-2 rounded-xl border border-teal-100 dark:border-teal-900/50">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Política Comercial</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 truncate block mt-0.5" title={resolvedPolicyInfo.policy}>
                            {resolvedPolicyInfo.policy}
                          </span>
                        </div>

                        <div className="bg-white/90 dark:bg-slate-800/90 p-2 rounded-xl border border-teal-100 dark:border-teal-900/50">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Días de Anticipación</span>
                          <span className="font-bold text-teal-700 dark:text-teal-300 block mt-0.5 font-mono">
                            {resolvedPolicyInfo.diasRetiro} días de retiro
                          </span>
                        </div>

                        <div className="bg-white/90 dark:bg-slate-800/90 p-2 rounded-xl border border-teal-100 dark:border-teal-900/50">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Fecha Retiro Calc.</span>
                          <span className="font-bold text-blue-700 dark:text-blue-300 block mt-0.5 font-mono">
                            {resolvedPolicyInfo.fechaRetiroDisplay}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyResolvedPolicy}
                    className="shrink-0 text-xs font-bold text-teal-700 dark:text-teal-300 hover:text-teal-900 dark:hover:text-teal-100 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800 hover:shadow-xs transition-all flex items-center gap-1 cursor-pointer mt-0.5"
                    title="Aplica la política y días de retiro resueltos a los campos del formulario"
                  >
                    <Check className="w-3.5 h-3.5 text-teal-600" />
                    <span>Aplicar</span>
                  </button>
                </div>
              </div>
            )}

            {/* Business Rule Banner: CU_VC Expiration Match (No Lotes - Consolidación Inteligente) */}
            {existingCuVcMatch && (
              <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-2 border-amber-300 dark:border-amber-700/80 rounded-2xl shadow-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <AlertTriangle className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded font-mono border border-amber-200 dark:border-amber-800">
                        Vencimiento ya existente ({candidateCuVc.mm}/{candidateCuVc.yyyy})
                      </span>
                      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 font-mono">
                        CU_VC: {existingCuVcMatch.cuVc} • Fila #{existingCuVcMatch.rowIndex}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-100 mt-1">
                      El SKU {candidateCuVc.sku} ya cuenta con existencias en este mismo vencimiento
                    </h4>

                    <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 mt-0.5 leading-relaxed">
                      Al <strong>no trabajar con lotes</strong>, las existencias del mismo mes y año se consolidan en una sola fila.
                      Stock actual registrado: <strong>{existingCuVcMatch.currentQuantity} un</strong>.
                      {currentEnteredQty > 0 && (
                        <span> Al sumar este ingreso ({currentEnteredQty} un), el nuevo stock consolidado será de <strong>{existingCuVcMatch.currentQuantity + currentEnteredQty} un</strong>.</span>
                      )}
                    </p>

                    <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handleConsolidateWithExisting}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{currentEnteredQty > 0 ? `Sumar a fila existente (+${currentEnteredQty} un → Total ${existingCuVcMatch.currentQuantity + currentEnteredQty})` : 'Consolidar en fila existente'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleLoadExistingRow}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 text-amber-800 dark:text-amber-200 text-xs font-semibold rounded-xl border border-amber-300 dark:border-amber-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Cargar fila #{existingCuVcMatch.rowIndex}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AppSheet Feature 2: Show_If Control Bar */}
            <div className="flex items-center justify-between py-1.5 px-2 bg-slate-100/70 dark:bg-slate-800/40 rounded-xl border border-slate-200/70 dark:border-slate-700/60 text-xs">
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Campos Relevantes (Show_If):
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 px-2 py-0.5 rounded-md shadow-2xs border border-slate-200 dark:border-slate-600">
                  {visibleFields.length} de {headers.length}
                </span>
                {hiddenFieldsCount > 0 && !showAllFields && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    ({hiddenFieldsCount} ocultos por regla de categoría)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAllFields(!showAllFields)}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                {showAllFields ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>Solo Relevantes</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Mostrar Todos ({headers.length})</span>
                  </>
                )}
              </button>
            </div>

            {/* Input Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleFields.map(({ header, colSchema, isKey }) => {
                const isAutoCalc = (colSchema?.behavior === 'calc_fecha_vc' && activeView === 'main') || 
                                   (colSchema?.behavior === 'calc_retiro' && activeView === 'main') || 
                                   colSchema?.behavior === 'auto_id' || 
                                   colSchema?.type === 'calculated' || 
                                   /^ID_VC$/i.test(String(header).trim()) ||
                                   /^CU_VC$/i.test(String(header).trim()) ||
                                   /^CU$/i.test(String(header).trim()) ||
                                   /^CODIGO_UNICO$/i.test(String(header).trim()) ||
                                    /FECHA_RETIRO_CALC/i.test(String(header).trim()) ||
                                   findColumnBySemantic(headers, 'id', sheetConfig?.customAliases) === header;
                
                const isSku = /sku|código|codigo/i.test(header);
                const isObs = /observ|nota|motivo|detalle|coment|causa/i.test(header);
                const isCant = /^cant|unidades|stock/i.test(header);
                const isDateCol = (colSchema?.type === 'date' && !/dias|días|cant|stock|unidades|num/i.test(header)) || 
                                  (/fecha|vencimiento|vence|retiro/i.test(header) && 
                                   !/time/i.test(header) && 
                                   !/dias|días|cant|stock|unidades|num/i.test(header));
                const isDateTimeCol = colSchema?.type === 'datetime' || /timestamp|created_at/i.test(header);
                const isTraspasoCol = /traspaso/i.test(header);
                const traspasoVal = String(formData[header] || '').trim();
                const isTraspasoFilled = traspasoVal !== '' && traspasoVal !== '-' && traspasoVal !== '0';
                
                const hasError = !!formErrors[header];
                const errorMsg = formErrors[header];

                return (
                  <div 
                    key={header} 
                    className={`flex flex-col gap-1.5 ${
                      isObs ? 'sm:col-span-2' : ''
                    } ${isTraspasoCol ? 'sm:col-span-2 bg-slate-50/80 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <span>{header}</span>
                        {isKey && (
                          <span className="text-[9px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-1 py-0.2 rounded font-mono font-bold">
                            KEY
                          </span>
                        )}
                        {isAutoCalc && (
                          <span className="text-[10px] bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 px-1.5 py-0.2 rounded font-mono font-bold">
                            auto
                          </span>
                        )}
                      </label>
                      
                      {/* SKU with catalog typeahead trigger */}
                      {isSku && products.length > 0 && (
                        <div className="relative" ref={catalogSearchRef}>
                          <button
                            type="button"
                            onClick={() => setCatalogSearchOpen(!catalogSearchOpen)}
                            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800 cursor-pointer"
                          >
                            <Search className="w-3 h-3" />
                            <span>Buscar en Catálogo ({products.length})</span>
                            <ChevronDown className="w-3 h-3" />
                          </button>

                          {/* Autocomplete Dropdown */}
                          {catalogSearchOpen && (
                            <div className="absolute right-0 top-full mt-1 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 p-2 animate-in fade-in zoom-in-95 duration-150">
                              <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                                <div className="relative">
                                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                  <input
                                    type="text"
                                    autoFocus
                                    placeholder="Filtrar por SKU, nombre o proveedor..."
                                    value={catalogSearchQuery}
                                    onChange={(e) => setCatalogSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500"
                                  />
                                </div>
                              </div>
                              <div className="max-h-56 overflow-y-auto space-y-1 p-1">
                                {catalogSearchResults.length === 0 ? (
                                  <p className="text-center py-4 text-xs text-slate-400">
                                    No se encontraron productos en el catálogo.
                                  </p>
                                ) : (
                                  catalogSearchResults.map((prod) => (
                                    <button
                                      key={prod.sku}
                                      type="button"
                                      onClick={() => handleSelectMasterProduct(prod)}
                                      className="w-full text-left p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-transparent hover:border-blue-200 dark:hover:border-blue-800/60 transition-colors flex items-center justify-between gap-2 group cursor-pointer"
                                    >
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded">
                                            {prod.sku}
                                          </span>
                                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate block">
                                            {prod.name}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                          {prod.provider || 'Sin proveedor'} {prod.price ? `• $${prod.price}` : ''}
                                        </p>
                                      </div>
                                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold opacity-0 group-hover:opacity-100 shrink-0">
                                        Vincular
                                      </span>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Traspaso status badge */}
                      {isTraspasoCol && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isTraspasoFilled 
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' 
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                        }`}>
                          {isTraspasoFilled ? '✅ Estado: Realizado' : '⏳ Estado: Pendiente'}
                        </span>
                      )}
                    </div>

                    {/* Input Element */}
                    {colSchema?.type === 'ref' ? (
                      <select
                        name={header}
                        value={formData[header] || ''}
                        onChange={onChange}
                        className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none transition-all ${
                          hasError 
                            ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                            : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                        }`}
                      >
                        <option value="">-- Seleccionar registro de {colSchema.refTable || 'tabla relacionada'} --</option>
                        {masterSummaries.map((summary, idx) => {
                          if (!summary.sku) return null;
                          return (
                            <option key={`ref-${idx}-${summary.sku}`} value={summary.sku}>
                              {summary.sku} {summary.name ? `- ${summary.name}` : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : colSchema?.type === 'enum' && colSchema.options ? (
                      <select
                        name={header}
                        value={formData[header] || ''}
                        onChange={onChange}
                        className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none transition-all ${
                          hasError 
                            ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                            : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                        }`}
                      >
                        <option value="">-- Seleccionar --</option>
                        {colSchema.options.split(',').map((opt: string) => (
                          <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                        ))}
                      </select>
                    ) : isObs ? (
                      <div className="space-y-2">
                        <textarea
                          name={header}
                          rows={2}
                          value={formData[header] || ''}
                          onChange={onChange}
                          placeholder={`Ingresa ${header.toLowerCase()}...`}
                          className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none transition-all resize-none ${
                            hasError 
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                              : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                          }`}
                        />

                        {/* AppSheet Feature 2: Valid_If Operational Suggestions */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            <span>Sugerencias operativas rápidas ({categoryDef.shortLabel}):</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {getOperationalSuggestions(selectedEventCategory).map((sugg, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() => handleApplySuggestion(header, sugg)}
                                className="text-[10px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg transition-all text-left cursor-pointer"
                              >
                                + {sugg}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : isDateCol ? (
                      <div className="space-y-1.5">
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            name={header}
                            value={formData[header] || ''}
                            onChange={onChange}
                            readOnly={isAutoCalc}
                            placeholder={
                              isAutoCalc 
                                ? 'Calculado automáticamente' 
                                : 'DD/MM/AAAA o AAAA-MM-DD (opcional)'
                            }
                            className={`w-full border rounded-xl pl-3.5 pr-20 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none transition-all ${
                              isAutoCalc
                                ? 'bg-slate-100/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                                : hasError
                                  ? 'bg-rose-50/50 dark:bg-rose-950/40 border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10'
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                            }`}
                          />

                          {/* Quick Calendar & Clear buttons */}
                          {!isAutoCalc && (
                            <div className="absolute right-2 flex items-center gap-1">
                              {formData[header] && (
                                <button
                                  type="button"
                                  title="Borrar fecha (dejar vacío)"
                                  onClick={() => {
                                    onChange({ target: { name: header, value: '' } } as any);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <label 
                                className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer relative" 
                                title="Seleccionar en calendario"
                              >
                                <Calendar className="w-4 h-4" />
                                <input
                                  type="date"
                                  tabIndex={-1}
                                  value={formatInputDate(formData[header]) || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val) {
                                      const d = parseAnyDate(val);
                                      const formatted = d ? formatDisplayDate(d) : val;
                                      onChange({ target: { name: header, value: formatted } } as any);
                                    }
                                  }}
                                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer pointer-events-auto"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        {/* Date Helper footer */}
                        {!isAutoCalc && (
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1 pt-0.5">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const today = new Date();
                                  const formatted = formatDisplayDate(today);
                                  onChange({ target: { name: header, value: formatted } } as any);
                                }}
                                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                Hoy
                              </button>
                              {formData[header] && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onChange({ target: { name: header, value: '' } } as any);
                                  }}
                                  className="font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                                >
                                  Sin fecha
                                </button>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {formData[header] && parseAnyDate(formData[header])
                                ? `✓ ${formatDisplayDate(formData[header])}`
                                : 'Opcional'}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type={
                            isDateTimeCol ? 'datetime-local' :
                            colSchema?.type === 'number' || /^cant|unidades|stock|dias|precio/i.test(header) ? 'number' : 'text'
                          }
                          name={header}
                          value={isDateTimeCol ? (formatInputDateTime(formData[header]) || formData[header] || '') : (formData[header] || '')}
                          onChange={onChange}
                          readOnly={isAutoCalc}
                          placeholder={
                            isAutoCalc 
                              ? 'Calculado automáticamente' 
                              : isTraspasoCol 
                                ? 'Ej. TR-99823 (dejar vacío si aún está pendiente)' 
                                : `Ingresa ${header.toLowerCase()}...`
                          }
                          className={`w-full border rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none transition-all ${
                            isAutoCalc
                              ? 'bg-slate-100/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                              : hasError
                                ? 'bg-rose-50/50 dark:bg-rose-950/40 border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                          }`}
                        />

                        {/* Quick Quantity Presets */}
                        {isCant && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Rápido:</span>
                            {QUICK_QUANTITY_PRESETS.map((q) => (
                              <button
                                key={q}
                                type="button"
                                onClick={() => handleAdjustQuantity(header, q)}
                                className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                              >
                                +{q}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Traspaso helper buttons */}
                        {isTraspasoCol && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleGenerateTraspaso(header)}
                                className="text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Generar Folio TR</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleClearTraspaso(header)}
                                className="text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                              >
                                <span>Marcar Pendiente</span>
                              </button>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-1">
                              💡 Registra el folio de traspaso de tu sistema para marcarlo como <strong>Realizado</strong>. Déjalo vacío para mantenerlo como <strong>Pendiente</strong>.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error message */}
                    {hasError && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1 mt-0.5">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{errorMsg}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Expand additional fields banner when some fields are hidden */}
            {hiddenFieldsCount > 0 && !showAllFields && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAllFields(true)}
                  className="w-full py-2.5 px-4 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Mostrar {hiddenFieldsCount} campos secundarios no habituales para {categoryDef.shortLabel}</span>
                </button>
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between gap-2 shrink-0">
            <div className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:block">
              Presiona Enter para guardar o Esc para cancelar
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{isSaving ? 'Guardando...' : editingItem ? 'Actualizar Fila' : 'Guardar en Sheet'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
