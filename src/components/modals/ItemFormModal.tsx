import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
import { SheetProperties, InventoryItem, EventCategory, SheetConfig, ColumnSchema, SheetRecord } from '../../types';
import { 
  EVENT_CATEGORIES, 
  parseLocaleNumber
} from '../../utils/dateCalculations';
import { evaluateShowIf } from '../../utils/dynamicFormRules';
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

// Subcomponents (Ponytail Protocol Modularization)
import { ItemFormCategorySelector } from './itemForm/ItemFormCategorySelector';
import { ItemFormMasterRefCard } from './itemForm/ItemFormMasterRefCard';
import { ItemFormPolicyCard } from './itemForm/ItemFormPolicyCard';
import { ItemFormCuVcBanner } from './itemForm/ItemFormCuVcBanner';
import { ItemFormControlsHeader } from './itemForm/ItemFormControlsHeader';
import { ItemFormFieldInput } from './itemForm/ItemFormFieldInput';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem: InventoryItem | null;
  onSetEditingItem?: (item: InventoryItem | null) => void;
  existingItems?: InventoryItem[];
  activeSheet: SheetProperties | null;
  /** Capacidad de vencimiento de la hoja activa (columna virtual de retiro). */
  canExpire?: boolean;
  /** Capacidad de incidencia de la hoja activa (selector de evento). */
  canLogEvents?: boolean;
  headers: string[];
  formData: Record<string, string>;
  formErrors: Record<string, string>;
  selectedEventCategory: EventCategory;
  onSelectEventCategory: (cat: EventCategory) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onSave: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;
  sheetConfig: SheetConfig;
  products: SheetRecord[];
  onBatchUpdateFormData?: (updates: Record<string, string>) => void;
  policies?: SheetRecord[];
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  isOpen,
  onClose,
  editingItem,
  onSetEditingItem,
  existingItems = [],
  activeSheet,
  canExpire = false,
  canLogEvents = false,
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

  const emitFieldChange = (name: string, value: string) =>
    onChange({ target: { name, value } } as React.ChangeEvent<HTMLInputElement>);

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

  const isMainOrEvents = canExpire || canLogEvents;
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
  const evaluatedFields: Array<{ header: string; colSchema?: ColumnSchema; isKey?: boolean; isRequired?: boolean; isVisible: boolean; isCoreField: boolean; reason?: string }> = headers.map(header => {
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
  if (canExpire && !hasRetiroCalc) {
    evaluatedFields.push({
      header: 'FECHA_RETIRO_CALC',
      colSchema: { visible: true, searchable: false, type: 'date', behavior: 'calc_retiro', label: 'Fecha Retiro Calc.' },
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
    if (selectedProd.raw) {
      const dereferenced = dereferenceMasterProduct(selectedProd.raw, headers, sheetConfig.customAliases);
      Object.assign(updates, dereferenced);
    }

    if (onBatchUpdateFormData) {
      onBatchUpdateFormData(updates);
    } else {
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
        emitFieldChange(k, v);
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
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={onSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            
            {/* Event Category Selector (Main or Events views) */}
            {isMainOrEvents && (
              <ItemFormCategorySelector
                selectedEventCategory={selectedEventCategory}
                onSelectEventCategory={onSelectEventCategory}
              />
            )}

            {/* AppSheet Feature 1: Ref Active Banner (Linked Master Product) */}
            {linkedMasterSummary && (
              <ItemFormMasterRefCard
                linkedMasterSummary={linkedMasterSummary}
                onSelectMasterProduct={handleSelectMasterProduct}
              />
            )}

            {/* Commercial Policy & Withdrawal Info Card */}
            {(isMainOrEvents || Boolean(resolvedPolicyInfo.matchedPolicyEntry || resolvedPolicyInfo.matchedProductEntry)) && (
              <ItemFormPolicyCard
                resolvedPolicyInfo={resolvedPolicyInfo}
                onApplyResolvedPolicy={handleApplyResolvedPolicy}
              />
            )}

            {/* Business Rule Banner: CU_VC Expiration Match */}
            {existingCuVcMatch && (
              <ItemFormCuVcBanner
                existingCuVcMatch={existingCuVcMatch}
                currentEnteredQty={currentEnteredQty}
                onConsolidateWithExisting={handleConsolidateWithExisting}
                onLoadExistingRow={handleLoadExistingRow}
              />
            )}

            {/* Search in Master Catalog & Show_If Controls */}
            <ItemFormControlsHeader
              productsCount={products.length}
              catalogSearchOpen={catalogSearchOpen}
              setCatalogSearchOpen={setCatalogSearchOpen}
              catalogSearchQuery={catalogSearchQuery}
              setCatalogSearchQuery={setCatalogSearchQuery}
              catalogSearchResults={catalogSearchResults}
              catalogSearchRef={catalogSearchRef}
              onSelectMasterProduct={handleSelectMasterProduct}
              showAllFields={showAllFields}
              setShowAllFields={setShowAllFields}
              hiddenFieldsCount={hiddenFieldsCount}
            />

            {/* Input Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleFields.map(({ header, colSchema, isKey }) => (
                <ItemFormFieldInput
                  key={header}
                  header={header}
                  colSchema={colSchema}
                  isKey={isKey}
                  canExpire={canExpire}
                  formData={formData}
                  formErrors={formErrors}
                  masterSummaries={masterSummaries}
                  selectedEventCategory={selectedEventCategory}
                  resolvedRetiroDisplay={resolvedPolicyInfo.fechaRetiroDisplay}
                  onChange={onChange}
                  onApplySuggestion={handleApplySuggestion}
                  onAdjustQuantity={handleAdjustQuantity}
                  onGenerateTraspaso={handleGenerateTraspaso}
                  onClearTraspaso={handleClearTraspaso}
                />
              ))}
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
          <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between gap-2 shrink-0">
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
