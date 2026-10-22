import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ChevronDown, Barcode as BarcodeIcon, Sparkles, AppWindow, X 
} from 'lucide-react';
import { InventoryItem, EventCategory, SheetRecord, FormatRule } from '../../types';
import { getItemStatus } from '../../utils/dateCalculations';
import { findColumnBySemantic, orderFieldsForDisplay } from '../../utils/columnAliases';
import { findMasterProduct, getMasterProductSummary } from '../../utils/referenceResolver';
import { Barcode } from '../common/Barcode';
import { STORAGE_KEYS, readStorage, booleanMapSchema, DetailDrawerPosition } from '../../utils/appStorage';
import { evaluateItemFormatRules, renderFormatRuleIcon } from '../../utils/formatRulesEngine';

// Subcomponents (Ponytail Protocol Modularization)
import { ItemDetailHeader } from './itemDetail/ItemDetailHeader';
import { ItemDetailMasterRefCard } from './itemDetail/ItemDetailMasterRefCard';
import { ItemDetailStatusBanner } from './itemDetail/ItemDetailStatusBanner';
import { ItemDetailParentChild } from './itemDetail/ItemDetailParentChild';
import { ItemDetailFieldsGrid } from './itemDetail/ItemDetailFieldsGrid';
import { RelatedRecordsTableContent } from './itemDetail/RelatedRecordsTableContent';

interface ItemDetailDrawerProps {
  product: InventoryItem | null;
  onClose: () => void;
  onEdit: (product: InventoryItem) => void;
  onCopy?: (product: InventoryItem) => void;
  onDeleteRow?: (product: InventoryItem) => void;
  onPrintBarcode?: (product: InventoryItem) => void;
  onPrintBluetooth?: (product: InventoryItem) => void;
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
  position?: DetailDrawerPosition;
  onChangePosition?: (pos: DetailDrawerPosition) => void;
}

const ItemDetailDrawerComponent: React.FC<ItemDetailDrawerProps> = ({
  product,
  onClose,
  onEdit,
  onCopy,
  onDeleteRow,
  onPrintBarcode,
  onPrintBluetooth,
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
  onSelectRelatedItem,
  position = 'right',
  onChangePosition
}) => {
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>(() =>
    readStorage<Record<string, boolean>>(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, booleanMapSchema, {})
  );
  const [isConfiguringFields, setIsConfiguringFields] = useState(false);
  
  const [showBarcode, setShowBarcode] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);

  // Full-space related records drill-down state (AppSheet style)
  const [expandedRelatedContext, setExpandedRelatedContext] = useState<{
    title: string;
    entityValue: string;
    entityType: 'sku' | 'proveedor' | 'bodega';
    batches: InventoryItem[];
  } | null>(null);

  // Resizable split-screen dimensions
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DETAIL_DRAWER_WIDTH);
      return saved ? Math.max(380, Math.min(900, parseInt(saved, 10))) : 480;
    } catch {
      return 480;
    }
  });

  const [drawerHeight, setDrawerHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DETAIL_DRAWER_HEIGHT);
      return saved ? Math.max(260, Math.min(650, parseInt(saved, 10))) : 420;
    } catch {
      return 420;
    }
  });

  const handleStartResizeWidth = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = drawerWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(360, Math.min(window.innerWidth * 0.75, startW + deltaX));
      setDrawerWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      try {
        localStorage.setItem(STORAGE_KEYS.DETAIL_DRAWER_WIDTH, String(drawerWidth));
      } catch {}
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleStartResizeHeight = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = drawerHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(250, Math.min(window.innerHeight * 0.75, startH + deltaY));
      setDrawerHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      try {
        localStorage.setItem(STORAGE_KEYS.DETAIL_DRAWER_HEIGHT, String(drawerHeight));
      } catch {}
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleStartDragFloating = (e: React.MouseEvent) => {
    e.preventDefault();
    const currentX = floatingPos?.x ?? Math.max(20, window.innerWidth - 560);
    const currentY = floatingPos?.y ?? 85;
    const startX = e.clientX;
    const startY = e.clientY;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newX = Math.max(10, Math.min(window.innerWidth - 300, currentX + (moveEvent.clientX - startX)));
      const newY = Math.max(10, Math.min(window.innerHeight - 200, currentY + (moveEvent.clientY - startY)));
      setFloatingPos({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpandedRelatedContext(null);
  }, [product]);

  if (!product) return null;

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

  // Minimized Floating Pill Mode
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom duration-200">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-bold truncate max-w-[200px]">{name}</span>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="text-xs text-blue-400 hover:underline font-bold ml-2 cursor-pointer"
        >
          Restaurar Ficha
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Expanded Fullscreen Mode
  if (isExpanded) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-200">
        <div className="w-full max-w-7xl h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
          {expandedRelatedContext ? (
            <RelatedRecordsTableContent
              title={expandedRelatedContext.title}
              entityValue={expandedRelatedContext.entityValue}
              entityType={expandedRelatedContext.entityType}
              batches={expandedRelatedContext.batches}
              onSelectItem={(item) => {
                setExpandedRelatedContext(null);
                onSelectRelatedItem?.(item);
              }}
              onNewEvent={onNewEventForProduct}
              onBack={() => setExpandedRelatedContext(null)}
            />
          ) : (
            <>
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
                onClose={() => setIsExpanded(false)}
                onNavigatePrev={onNavigatePrev}
                onNavigateNext={onNavigateNext}
                currentIndex={currentIndex}
                totalCount={totalCount}
                isExpandedHorizontal={true}
                onToggleExpand={() => setIsExpanded(false)}
                position={position}
                onChangePosition={onChangePosition}
              />
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                <div className="space-y-4">
                  <ItemDetailStatusBanner status={status} detailMode={detailMode} />
                  {masterSummary && <ItemDetailMasterRefCard masterSummary={masterSummary} />}
                </div>
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900 shadow-xs">
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
                <div>
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
                    onExpandFullView={(ctx) => setExpandedRelatedContext(ctx)}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Floating Window Mode (Draggable PiP)
  if (position === 'floating') {
    const defaultX = Math.max(20, window.innerWidth - 560);
    const defaultY = 85;
    const posX = floatingPos?.x ?? defaultX;
    const posY = floatingPos?.y ?? defaultY;

    return (
      <div 
        style={{ left: `${posX}px`, top: `${posY}px`, width: '540px', maxHeight: '82vh' }}
        className="fixed z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
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
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={onNavigateNext}
          currentIndex={currentIndex}
          totalCount={totalCount}
          isExpandedHorizontal={false}
          onToggleExpand={() => setIsExpanded(true)}
          position={position}
          onChangePosition={onChangePosition}
          onToggleMinimize={() => setIsMinimized(true)}
          dragHandleProps={{ onMouseDown: handleStartDragFloating }}
        />
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {expandedRelatedContext ? (
            <RelatedRecordsTableContent
              title={expandedRelatedContext.title}
              entityValue={expandedRelatedContext.entityValue}
              entityType={expandedRelatedContext.entityType}
              batches={expandedRelatedContext.batches}
              onSelectItem={(item) => {
                setExpandedRelatedContext(null);
                onSelectRelatedItem?.(item);
              }}
              onNewEvent={onNewEventForProduct}
              onBack={() => setExpandedRelatedContext(null)}
            />
          ) : (
            <>
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
                onExpandFullView={(ctx) => setExpandedRelatedContext(ctx)}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  const isBottom = position === 'bottom';

  // AppSheet Style Clean Master-Detail Dock Panel
  return (
    <div 
      className={`fixed inset-0 z-50 flex ${
        isBottom ? 'justify-center items-end' : 'justify-end'
      } md:static md:z-auto bg-slate-900/40 md:bg-transparent backdrop-blur-xs md:backdrop-blur-none animate-in fade-in duration-150 ${
        isBottom ? 'w-full' : ''
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={
          isBottom
            ? { height: `${drawerHeight}px` }
            : { width: `${drawerWidth}px` }
        }
        className={
          isBottom
            ? "relative w-full max-h-[85vh] md:max-h-[60vh] shrink-0 bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-none border-t border-slate-200 dark:border-slate-800 shadow-2xl md:shadow-lg flex flex-col z-50 md:z-20 overflow-hidden animate-in slide-in-from-bottom duration-200"
            : "relative w-full sm:max-w-[85vw] shrink-0 h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl md:shadow-xl flex flex-col z-50 md:z-20 overflow-hidden animate-in slide-in-from-right duration-200"
        }
      >
        {/* Resizable handles for Split-Screen */}
        {isBottom ? (
          <div
            onMouseDown={handleStartResizeHeight}
            className="hidden md:flex absolute top-0 left-0 right-0 h-2 cursor-row-resize hover:bg-blue-500/80 active:bg-blue-600 transition-colors z-30 items-center justify-center group"
            title="Arrastrar para ajustar altura del muelle"
          >
            <div className="w-16 h-1 bg-slate-300 dark:bg-slate-600 rounded-full group-hover:bg-blue-400" />
          </div>
        ) : (
          <div
            onMouseDown={handleStartResizeWidth}
            className="hidden md:flex absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/80 active:bg-blue-600 transition-colors z-30 items-center justify-center group"
            title="Arrastrar para ajustar ancho del panel"
          >
            <div className="w-1 h-12 bg-slate-300 dark:bg-slate-600 rounded-full group-hover:bg-blue-400" />
          </div>
        )}
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
          onPrintBluetooth={onPrintBluetooth}
          onClose={onClose}
          onNavigatePrev={onNavigatePrev}
          onNavigateNext={onNavigateNext}
          currentIndex={currentIndex}
          totalCount={totalCount}
          isExpandedHorizontal={false}
          onToggleExpand={() => setIsExpanded(true)}
          position={position}
          onChangePosition={onChangePosition}
        />

        {/* Clean AppSheet Detail Body */}
        {expandedRelatedContext ? (
          <div className="flex-1 flex flex-col min-h-0">
            <RelatedRecordsTableContent
              title={expandedRelatedContext.title}
              entityValue={expandedRelatedContext.entityValue}
              entityType={expandedRelatedContext.entityType}
              batches={expandedRelatedContext.batches}
              onSelectItem={(item) => {
                setExpandedRelatedContext(null);
                onSelectRelatedItem?.(item);
              }}
              onNewEvent={onNewEventForProduct}
              onBack={() => setExpandedRelatedContext(null)}
            />
          </div>
        ) : isBottom ? (
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {/* Column 1: Status, Master Ref, Barcode & Rules */}
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
            </div>

            {/* Column 2: AppSheet Technical Fields List */}
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

            {/* Column 3: AppSheet Related Records (Parent-Child) */}
            <div>
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
                onExpandFullView={(ctx) => setExpandedRelatedContext(ctx)}
              />
            </div>
          </div>
        ) : (
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
              onExpandFullView={(ctx) => setExpandedRelatedContext(ctx)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const ItemDetailDrawer = React.memo(ItemDetailDrawerComponent);
