import React, { useState, useMemo } from 'react';
import { 
  ChevronDown, Barcode as BarcodeIcon, Sparkles
} from 'lucide-react';
import { InventoryItem, SheetRecord, FormatRule } from '../../types';
import { getItemStatus } from '../../utils/dateCalculations';
import { findColumnBySemantic, orderFieldsForDisplay } from '../../utils/columnAliases';
import { findMasterProduct, getMasterProductSummary } from '../../utils/referenceResolver';
import { Barcode } from '../common/Barcode';
import { STORAGE_KEYS, readStorage, booleanMapSchema, DetailDrawerPosition } from '../../utils/appStorage';
import { evaluateItemFormatRules, renderFormatRuleIcon } from '../../utils/formatRulesEngine';

// Subcomponents
import { ItemDetailHeader } from '../drawers/itemDetail/ItemDetailHeader';
import { ItemDetailMasterRefCard } from '../drawers/itemDetail/ItemDetailMasterRefCard';
import { ItemDetailStatusBanner } from '../drawers/itemDetail/ItemDetailStatusBanner';
import { ItemDetailParentChild } from '../drawers/itemDetail/ItemDetailParentChild';
import { ItemDetailFieldsGrid } from '../drawers/itemDetail/ItemDetailFieldsGrid';
import { RelatedRecordsTableContent } from '../drawers/itemDetail/RelatedRecordsTableContent';

export interface InlineItemDetailRowProps {
  product: InventoryItem;
  colSpan: number;
  onClose: () => void;
  onEdit: (product: InventoryItem) => void;
  onCopy?: (product: InventoryItem) => void;
  onDeleteRow?: (product: InventoryItem) => void;
  onPrintBarcode?: (product: InventoryItem) => void;
  onPrintBluetooth?: (product: InventoryItem) => void;
  allMainItems: InventoryItem[];
  policies?: SheetRecord[];
  products?: SheetRecord[];
  customAliases?: Record<string, string[]>;
  formatRules?: FormatRule[];
  position?: DetailDrawerPosition;
  onChangePosition?: (pos: DetailDrawerPosition) => void;
  onOpenParentChildInspector?: (entityType: 'sku' | 'proveedor' | 'bodega', entityValue: string) => void;
  onSelectRelatedItem?: (item: InventoryItem) => void;
}

export const InlineItemDetailRow: React.FC<InlineItemDetailRowProps> = ({
  product,
  colSpan,
  onClose,
  onEdit,
  onCopy,
  onDeleteRow,
  onPrintBarcode,
  onPrintBluetooth,
  allMainItems,
  policies = [],
  products = [],
  customAliases,
  formatRules = [],
  position = 'inline',
  onChangePosition,
  onOpenParentChildInspector,
  onSelectRelatedItem
}) => {
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>(() =>
    readStorage<Record<string, boolean>>(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, booleanMapSchema, {})
  );
  const [isConfiguringFields, setIsConfiguringFields] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);

  // Full-space related records drill-down state (AppSheet style)
  const [expandedRelatedContext, setExpandedRelatedContext] = useState<{
    title: string;
    entityValue: string;
    entityType: 'sku' | 'proveedor' | 'bodega';
    batches: InventoryItem[];
  } | null>(null);

  const productKeys = useMemo(
    () => (product ? Object.keys(product).filter(k => !k.startsWith('_')) : []),
    [product]
  );

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

  const skuKey = findColumnBySemantic(productKeys, 'sku', customAliases) || productKeys.find(k => /sku|c[oó]digo|code|item/i.test(k)) || 'SKU';
  const nameKey = findColumnBySemantic(productKeys, 'descripcion', customAliases) || productKeys.find(k => /descrip|nombre|name|title/i.test(k)) || '';
  const providerCol = findColumnBySemantic(productKeys, 'proveedor', customAliases);
  const bodegaCol = findColumnBySemantic(productKeys, 'frc_bod', customAliases);

  const sku = product[skuKey] != null && String(product[skuKey]).trim() !== '' ? String(product[skuKey]) : '-';
  const name = nameKey && product[nameKey] != null ? String(product[nameKey]) : 'Detalle del Registro';
  const providerVal = providerCol ? product[providerCol] : undefined;
  const bodegaVal = bodegaCol ? product[bodegaCol] : undefined;

  const status = useMemo(() => {
    return getItemStatus(product, productKeys);
  }, [product, productKeys]);

  const masterProduct = useMemo(() => {
    if (!sku || sku === '-' || products.length === 0) return null;
    return findMasterProduct(sku, products, customAliases);
  }, [sku, products, customAliases]);

  const masterSummary = useMemo(() => {
    if (!masterProduct) return null;
    return getMasterProductSummary(masterProduct, customAliases);
  }, [masterProduct, customAliases]);

  const formatResult = useMemo(() => {
    if (formatRules.length === 0) return null;
    return evaluateItemFormatRules(product, productKeys, formatRules, detailMode, customAliases);
  }, [product, productKeys, formatRules, detailMode, customAliases]);

  const orderedKeys = useMemo(
    () => orderFieldsForDisplay(productKeys, customAliases),
    [productKeys, customAliases]
  );

  const toggleFieldVisibility = (field: string) => {
    setHiddenFields(prev => {
      const next = { ...prev, [field]: !prev[field] };
      try {
        localStorage.setItem(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleShowAllFields = () => {
    setHiddenFields({});
    try {
      localStorage.removeItem(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS);
    } catch {}
  };

  return (
    <tr className="bg-slate-50/95 dark:bg-slate-900/95 border-y-2 border-blue-500/40 animate-in fade-in duration-200">
      <td colSpan={colSpan} className="p-3 sm:p-5">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xl overflow-hidden min-h-[420px] flex flex-col">
          {expandedRelatedContext ? (
            <div className="flex-1 flex flex-col">
              <RelatedRecordsTableContent
                title={expandedRelatedContext.title}
                entityValue={expandedRelatedContext.entityValue}
                entityType={expandedRelatedContext.entityType}
                batches={expandedRelatedContext.batches}
                onSelectItem={(item) => {
                  setExpandedRelatedContext(null);
                  onSelectRelatedItem?.(item);
                }}
                onNewEvent={() => {
                  setExpandedRelatedContext(null);
                  onEdit(product);
                }}
                onBack={() => setExpandedRelatedContext(null)}
              />
            </div>
          ) : (
            <>
              {/* Header */}
              <ItemDetailHeader
                product={product}
                title={name}
                sku={sku}
                detailMode={detailMode}
                onEdit={onEdit}
                onCopy={onCopy}
                onDeleteRow={onDeleteRow}
                onPrintBarcode={onPrintBarcode}
                onPrintBluetooth={onPrintBluetooth}
                onClose={onClose}
                isExpandedHorizontal={false}
                position={position}
                onChangePosition={onChangePosition}
              />

              {/* 3-Column Inline Dashboard */}
              <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                {/* Col 1: Status, Master Ref, Barcode */}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowBarcode(!showBarcode);
                        }}
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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

                {/* Col 2: Technical Fields Grid */}
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

                {/* Col 3: Related Records */}
                <div>
                  <ItemDetailParentChild
                    sku={sku}
                    provider={providerVal ? String(providerVal) : undefined}
                    warehouse={bodegaVal ? String(bodegaVal) : undefined}
                    allMainItems={allMainItems}
                    products={products}
                    policies={policies}
                    onSelectRelatedItem={onSelectRelatedItem || onEdit}
                    onNewEventForProduct={() => {}}
                    onOpenInspector={onOpenParentChildInspector}
                    customAliases={customAliases}
                    onExpandFullView={(ctx) => setExpandedRelatedContext(ctx)}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};
