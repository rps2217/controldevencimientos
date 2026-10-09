import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ChevronDown, Barcode as BarcodeIcon, Sparkles 
} from 'lucide-react';
import { InventoryItem, EventCategory, SheetRecord, FormatRule } from '../../types';
import { getItemStatus, parseAnyDate } from '../../utils/dateCalculations';
import { findColumnBySemantic, orderFieldsForDisplay } from '../../utils/columnAliases';
import { findMasterProduct, getMasterProductSummary } from '../../utils/referenceResolver';
import { Barcode } from '../common/Barcode';
import { STORAGE_KEYS, readStorage, booleanMapSchema } from '../../utils/appStorage';
import { evaluateItemFormatRules, renderFormatRuleIcon } from '../../utils/formatRulesEngine';

// Subcomponents (Ponytail Protocol Modularization)
import { ItemDetailHeader } from './itemDetail/ItemDetailHeader';
import { ItemDetailMasterRefCard } from './itemDetail/ItemDetailMasterRefCard';
import { ItemDetailStatusBanner } from './itemDetail/ItemDetailStatusBanner';
import { ItemDetailParentChild } from './itemDetail/ItemDetailParentChild';
import { ItemDetailFieldsGrid } from './itemDetail/ItemDetailFieldsGrid';

interface ItemDetailDrawerProps {
  product: InventoryItem | null;
  onClose: () => void;
  onEdit: (product: InventoryItem) => void;
  onCopy?: (product: InventoryItem) => void;
  onDeleteRow?: (product: InventoryItem) => void;
  onPrintBarcode?: (product: InventoryItem) => void;
  onNewEventForProduct: (sku: string, category?: EventCategory) => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
  allMainItems: InventoryItem[];
  policies: SheetRecord[];
  products?: SheetRecord[];
  customAliases?: Record<string, string[]>;
  formatRules?: FormatRule[];
  onOpenParentChildInspector?: (entityType: 'sku' | 'proveedor' | 'bodega', entityValue: string) => void;
  onSelectRelatedItem?: (item: InventoryItem) => void;
}

export const ItemDetailDrawer: React.FC<ItemDetailDrawerProps> = ({
  product,
  onClose,
  onEdit,
  onCopy,
  onDeleteRow,
  onPrintBarcode,
  onNewEventForProduct,
  onNavigatePrev,
  onNavigateNext,
  currentIndex,
  totalCount,
  allMainItems,
  policies = [],
  products = [],
  customAliases,
  formatRules = [],
  onOpenParentChildInspector,
  onSelectRelatedItem
}) => {
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>(() =>
    readStorage<Record<string, boolean>>(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, booleanMapSchema, {})
  );
  const [isConfiguringFields, setIsConfiguringFields] = useState(false);
  
  const [showBarcode, setShowBarcode] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const productKeys = product ? Object.keys(product).filter(k => !k.startsWith('_')) : [];
  
  // Contextual mode detection
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

  useEffect(() => {
    if (!product) return;
    scrollRef.current?.scrollTo({ top: 0 });
    setShowBarcode(false);
  }, [identityKey, detailMode, product]);

  // Keyboard listener: Escape to close, Arrow keys for prev/next
  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

      if (e.key === 'Escape') {
        onClose();
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && onNavigatePrev) {
        e.preventDefault();
        onNavigatePrev();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && onNavigateNext) {
        e.preventDefault();
        onNavigateNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, onClose, onNavigatePrev, onNavigateNext]);

  const formatResult = useMemo(() => {
    if (!product || !formatRules || formatRules.length === 0) return null;
    return evaluateItemFormatRules(product, productKeys, formatRules, detailMode, customAliases);
  }, [product, productKeys, formatRules, detailMode, customAliases]);

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

  const orderedKeys = orderFieldsForDisplay(productKeys, customAliases);

  const skuKey = findColumnBySemantic(productKeys, 'sku', customAliases) || 'SKU';
  const nameKey = findColumnBySemantic(productKeys, 'descripcion', customAliases) || '';

  const sku = product[skuKey] || '-';
  const name = (nameKey && product[nameKey]) || 'Detalle del Registro';

  const masterProduct = sku !== '-' && products.length > 0
    ? findMasterProduct(sku, products, customAliases)
    : null;
  const masterSummary = masterProduct 
    ? getMasterProductSummary(masterProduct, customAliases) 
    : null;

  const status = getItemStatus(product, productKeys);

  const provKey = findColumnBySemantic(productKeys, 'proveedor', customAliases);
  const providerVal = (provKey && product[provKey]) || masterSummary?.provider || '';
  const bodKey = findColumnBySemantic(productKeys, 'frc_bod', customAliases) || productKeys.find(k => /bodega|sucursal|local/i.test(k));
  const bodegaVal = (bodKey && product[bodKey]) || product.FRC_BOD || product.BODEGA || '';

  if (isExpanded) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 md:p-6 animate-in fade-in duration-200 [contain:strict]">
        <div className="w-full max-w-7xl h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
          
          {/* Unified Header */}
          <ItemDetailHeader
            product={product}
            title={name}
            sku={sku}
            detailMode={detailMode}
            onEdit={onEdit}
            onCopy={onCopy}
            onDeleteRow={onDeleteRow}
            onPrintBarcode={onPrintBarcode}
            onClose={onClose}
            onNavigatePrev={onNavigatePrev}
            onNavigateNext={onNavigateNext}
            currentIndex={currentIndex}
            totalCount={totalCount}
            isExpandedHorizontal={true}
            onToggleExpand={() => setIsExpanded(false)}
          />

          {/* 3-Column Integrated Grid Content */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            
            {/* Column 1: Status, Master Ref, Barcode */}
            <div className="space-y-4">
              {formatResult && formatResult.matchingRules.length > 0 && (
                <div className="p-3 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/40 flex items-center justify-between text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>Format Rules ({formatResult.matchingRules.length}):</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {formatResult.matchingRules.map((r: FormatRule) => (
                      <span 
                        key={r.id}
                        style={{ backgroundColor: r.backgroundColor, color: r.textColor }}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold border border-black/5 flex items-center gap-1 shadow-2xs"
                      >
                        {renderFormatRuleIcon(r.icon, 'w-3 h-3')}
                        <span>{r.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <ItemDetailStatusBanner
                status={status}
                detailMode={detailMode}
              />

              {masterSummary && (
                <ItemDetailMasterRefCard
                  masterSummary={masterSummary}
                />
              )}

              {sku && sku !== '-' && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs">
                  <button
                    type="button"
                    onClick={() => setShowBarcode(!showBarcode)}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <BarcodeIcon className="w-4 h-4 text-indigo-500" />
                      <span>Código de Barras ({sku})</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showBarcode ? 'rotate-180' : ''}`} />
                  </button>

                  {showBarcode && (
                    <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex flex-col items-center gap-2">
                      <Barcode value={sku} width={2} height={50} showText={true} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Column 2: Technical Fields Grid */}
            <div className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
                Atributos y Campos Técnicos
              </div>
              <ItemDetailFieldsGrid
                product={product}
                productKeys={productKeys}
                orderedKeys={orderedKeys}
                hiddenFields={hiddenFields}
                showAllFields={showAllFields}
                isConfiguringFields={isConfiguringFields}
                setShowAllFields={setShowAllFields}
                setIsConfiguringFields={setIsConfiguringFields}
                toggleFieldVisibility={toggleFieldVisibility}
                handleShowAllFields={handleShowAllFields}
                customAliases={customAliases}
                formatResult={formatResult}
              />
            </div>

            {/* Column 3: Parent-Child & Related Records */}
            <div className="space-y-4 lg:col-span-1">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
                Trazabilidad y Registros Relacionados
              </div>
              <ItemDetailParentChild
                sku={sku}
                provider={providerVal ? String(providerVal) : undefined}
                warehouse={bodegaVal ? String(bodegaVal) : undefined}
                allMainItems={allMainItems}
                products={products}
                policies={policies}
                onSelectRelatedItem={onSelectRelatedItem || onEdit}
                onNewEventForProduct={onNewEventForProduct}
                onOpenInspector={onOpenParentChildInspector}
                customAliases={customAliases}
              />
            </div>

          </div>
        </div>
      </div>
    );
  }

  // AppSheet Style Clean Master-Detail Dock Panel (Default)
  return (
    <div 
      className="fixed inset-0 z-50 flex justify-end md:static md:z-auto bg-slate-900/40 md:bg-transparent backdrop-blur-xs md:backdrop-blur-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[460px] md:w-[480px] lg:w-[500px] xl:w-[540px] shrink-0 h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl md:shadow-xl flex flex-col z-50 md:z-20 overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Unified AppSheet Header */}
        <ItemDetailHeader
          product={product}
          title={name}
          sku={sku}
          detailMode={detailMode}
          onEdit={onEdit}
          onCopy={onCopy}
          onDeleteRow={onDeleteRow}
          onPrintBarcode={onPrintBarcode}
          onClose={onClose}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={onNavigateNext}
          currentIndex={currentIndex}
          totalCount={totalCount}
          isExpandedHorizontal={false}
          onToggleExpand={() => setIsExpanded(true)}
        />

        {/* Clean Vertical AppSheet Detail Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Format Rules Pill */}
          {formatResult && formatResult.matchingRules.length > 0 && (
            <div className="p-3 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/40 flex items-center justify-between text-xs flex-wrap gap-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Format Rules ({formatResult.matchingRules.length}):</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {formatResult.matchingRules.map((r: FormatRule) => (
                  <span 
                    key={r.id}
                    style={{ backgroundColor: r.backgroundColor, color: r.textColor }}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-bold border border-black/5 flex items-center gap-1 shadow-2xs"
                  >
                    {renderFormatRuleIcon(r.icon, 'w-3 h-3')}
                    <span>{r.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Status & Alerts Banner */}
          <ItemDetailStatusBanner
            status={status}
            detailMode={detailMode}
          />

          {/* Master Catalog Reference Card */}
          {masterSummary && (
            <ItemDetailMasterRefCard
              masterSummary={masterSummary}
            />
          )}

          {/* Barcode Section */}
          {sku && sku !== '-' && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setShowBarcode(!showBarcode)}
                className="w-full p-3 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <BarcodeIcon className="w-4 h-4 text-indigo-500" />
                  <span>Código de Barras ({sku})</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showBarcode ? 'rotate-180' : ''}`} />
              </button>

              {showBarcode && (
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex flex-col items-center gap-2">
                  <Barcode value={sku} width={2} height={50} showText={true} />
                </div>
              )}
            </div>
          )}

          {/* AppSheet Technical Fields List */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900/60 shadow-xs">
            <ItemDetailFieldsGrid
              product={product}
              productKeys={productKeys}
              orderedKeys={orderedKeys}
              hiddenFields={hiddenFields}
              showAllFields={showAllFields}
              isConfiguringFields={isConfiguringFields}
              setShowAllFields={setShowAllFields}
              setIsConfiguringFields={setIsConfiguringFields}
              toggleFieldVisibility={toggleFieldVisibility}
              handleShowAllFields={handleShowAllFields}
              customAliases={customAliases}
              formatResult={formatResult}
            />
          </div>

          {/* AppSheet Related Records (Parent-Child) */}
          <ItemDetailParentChild
            sku={sku}
            provider={providerVal ? String(providerVal) : undefined}
            warehouse={bodegaVal ? String(bodegaVal) : undefined}
            allMainItems={allMainItems}
            products={products}
            policies={policies}
            onSelectRelatedItem={onSelectRelatedItem || onEdit}
            onNewEventForProduct={onNewEventForProduct}
            onOpenInspector={onOpenParentChildInspector}
            customAliases={customAliases}
          />

        </div>
      </div>
    </div>
  );
};
