import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronDown, Barcode as BarcodeIcon 
} from 'lucide-react';
import { InventoryItem, EventCategory, SheetRecord } from '../../types';
import { 
  getItemStatus, 
  parseAnyDate
} from '../../utils/dateCalculations';
import { findColumnBySemantic, orderFieldsForDisplay } from '../../utils/columnAliases';
import { findMasterProduct, getMasterProductSummary } from '../../utils/referenceResolver';
import { Barcode } from '../common/Barcode';
import { STORAGE_KEYS, readStorage, booleanMapSchema } from '../../utils/appStorage';

// Subcomponents (Ponytail Protocol Modularization)
import { ItemDetailHeader } from './itemDetail/ItemDetailHeader';
import { ItemDetailMasterRefCard } from './itemDetail/ItemDetailMasterRefCard';
import { ItemDetailStatusBanner } from './itemDetail/ItemDetailStatusBanner';
import { ItemDetailSkuTrace } from './itemDetail/ItemDetailSkuTrace';
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
  products = [],
  customAliases
}) => {
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>(() =>
    readStorage<Record<string, boolean>>(STORAGE_KEYS.DETAIL_HIDDEN_FIELDS, booleanMapSchema, {})
  );
  const [isConfiguringFields, setIsConfiguringFields] = useState(false);
  
  // States that reset per-item
  const [showBarcode, setShowBarcode] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [showSkuTrace, setShowSkuTrace] = useState(false);
  
  // AppSheet Split View: Resizable panel width state
  const DEFAULT_PANEL_WIDTH = 460;
  const MIN_PANEL_WIDTH = 300;
  const MAX_PANEL_WIDTH = 850;

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('appsheet_detail_panel_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= MIN_PANEL_WIDTH && parsed <= MAX_PANEL_WIDTH) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_PANEL_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // Whenever the active item changes, reset collapse states intelligently based on mode
  useEffect(() => {
    if (!product) return;
    scrollRef.current?.scrollTo({ top: 0 });
    setShowSkuTrace(false);
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

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const savePanelWidth = (w: number) => {
    try {
      localStorage.setItem('appsheet_detail_panel_width', String(w));
    } catch {}
  };

  const startResizing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const drawerRight = drawerRef.current
        ? drawerRef.current.getBoundingClientRect().right
        : window.innerWidth;
      const newWidth = drawerRight - e.clientX;
      const maxW = Math.min(MAX_PANEL_WIDTH, window.innerWidth * 0.65);
      const clamped = Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, maxW));
      setPanelWidth(clamped);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      const drawerRight = drawerRef.current
        ? drawerRef.current.getBoundingClientRect().right
        : window.innerWidth;
      const newWidth = drawerRight - e.touches[0].clientX;
      const maxW = Math.min(MAX_PANEL_WIDTH, window.innerWidth * 0.65);
      const clamped = Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, maxW));
      setPanelWidth(clamped);
    };

    const stopResizing = () => {
      setIsResizing(false);
      savePanelWidth(panelWidth);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', stopResizing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopResizing);
    };
  }, [isResizing, panelWidth]);

  // ALL HOOKS EXECUTED UNCONDITIONALLY ABOVE
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

  const skuKey = findColumnBySemantic(productKeys, 'sku', customAliases) || 'SKU';
  const nameKey = findColumnBySemantic(productKeys, 'descripcion', customAliases) || '';

  const sku = product[skuKey] || '-';
  const name = (nameKey && product[nameKey]) || 'Detalle del Registro';

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
    .filter(r => (findColumnBySemantic(Object.keys(r), 'fecha_vc', customAliases) || (findColumnBySemantic(Object.keys(r), 'mes', customAliases) && findColumnBySemantic(Object.keys(r), 'anio', customAliases))))
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

  const incidents = relatedRecords.filter(r => findColumnBySemantic(Object.keys(r), 'tipo_evento', customAliases) !== undefined);

  // Status computation for expiration
  const status = getItemStatus(product, productKeys);

  // Content JSX rendered inside either mobile overlay or desktop split panel
  const detailInnerContent = (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
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
        onClose={onClose}
        onNavigatePrev={onNavigatePrev}
        onNavigateNext={onNavigateNext}
        currentIndex={currentIndex}
        totalCount={totalCount}
      />

      {/* Scrollable Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        
        {/* Expiration Status Banner */}
        <ItemDetailStatusBanner
          status={status}
          detailMode={detailMode}
        />

        {/* Master Reference Card */}
        {masterSummary && (
          <ItemDetailMasterRefCard
            masterSummary={masterSummary}
          />
        )}

        {/* SKU Trace & Related Expirations / Events */}
        {(expirations.length > 0 || incidents.length > 0) && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSkuTrace(!showSkuTrace)}
              className="w-full p-3.5 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span>Trazabilidad SKU ({expirations.length} vtos, {incidents.length} incidencias)</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showSkuTrace ? 'rotate-180' : ''}`} />
            </button>

            {showSkuTrace && (
              <div className="p-3 border-t border-slate-200 dark:border-slate-700">
                <ItemDetailSkuTrace
                  sku={sku}
                  expirations={expirations}
                  incidents={incidents}
                  onNewEventForProduct={onNewEventForProduct}
                  customAliases={customAliases}
                />
              </div>
            )}
          </div>
        )}

        {/* Barcode Preview Accordion */}
        {sku && sku !== '-' && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowBarcode(!showBarcode)}
              className="w-full p-3.5 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="flex items-center gap-2">
                <BarcodeIcon className="w-4 h-4 text-indigo-500" />
                <span>Código de Barras</span>
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

        {/* Technical Fields Grid */}
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
        />

      </div>
    </div>
  );

  // Render on Mobile: Slide-over Drawer with overlay
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200 [contain:strict]">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200 overflow-hidden transform-gpu will-change-transform">
          {detailInnerContent}
        </div>
      </div>
    );
  }

  // Render on Desktop: AppSheet Contiguous Resizable Split View Panel (no backdrop overlay)
  return (
    <div 
      ref={drawerRef}
      style={{ width: `${panelWidth}px` }}
      className={`h-full shrink-0 flex relative app-panel !rounded-3xl animate-in slide-in-from-right duration-200 overflow-hidden transform-gpu will-change-[width] [contain:layout_style] ${
        isResizing ? 'select-none transition-none' : 'transition-[width] duration-150'
      }`}
    >
      {/* Resizable Vertical Splitter / Drag Handle (AppSheet Style) */}
      <div
        onMouseDown={startResizing}
        onTouchStart={startResizing}
        onDoubleClick={() => {
          setPanelWidth(DEFAULT_PANEL_WIDTH);
          savePanelWidth(DEFAULT_PANEL_WIDTH);
        }}
        className={`absolute left-0 top-0 bottom-0 w-3 -ml-1.5 z-30 cursor-col-resize group flex items-center justify-center transition-colors ${
          isResizing ? 'bg-blue-500/30' : 'hover:bg-blue-500/20'
        }`}
        title="Arrastra para ajustar el ancho (Doble clic para restablecer)"
      >
        <div className={`w-1 h-12 rounded-full transition-colors ${
          isResizing ? 'bg-blue-600 shadow-md' : 'bg-slate-300 dark:bg-slate-700 group-hover:bg-blue-500'
        }`} />
      </div>

      {detailInnerContent}
    </div>
  );
};
