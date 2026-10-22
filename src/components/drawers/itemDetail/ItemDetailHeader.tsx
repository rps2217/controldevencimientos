import React, { useState, useRef, useEffect } from 'react';
import { 
  Package, X, Edit2, Trash2, Copy, Barcode as BarcodeIcon, ChevronLeft, ChevronRight, Maximize2, Minimize2, Bluetooth,
  PanelRight, PanelBottom, AppWindow, Rows, ChevronDown, GripHorizontal, Minus
} from 'lucide-react';
import { InventoryItem } from '../../../types';
import { DetailDrawerPosition } from '../../../utils/appStorage';

interface ItemDetailHeaderProps {
  product: InventoryItem;
  title: string;
  sku: string;
  detailMode: 'vencimiento' | 'incidencia' | 'catalogo' | 'politica';
  onEdit: (product: InventoryItem) => void;
  onCopy?: (product: InventoryItem) => void;
  onDeleteRow?: (product: InventoryItem) => void;
  onPrintBarcode?: (product: InventoryItem) => void;
  onPrintBluetooth?: (product: InventoryItem) => void;
  onClose: () => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
  isExpandedHorizontal?: boolean;
  onToggleExpand?: () => void;
  position?: DetailDrawerPosition;
  onChangePosition?: (pos: DetailDrawerPosition) => void;
  onToggleMinimize?: () => void;
  dragHandleProps?: any;
}

export const ItemDetailHeader: React.FC<ItemDetailHeaderProps> = ({
  product,
  title,
  sku,
  detailMode,
  onEdit,
  onCopy,
  onDeleteRow,
  onPrintBarcode,
  onPrintBluetooth,
  onClose,
  onNavigatePrev,
  onNavigateNext,
  currentIndex,
  totalCount,
  isExpandedHorizontal,
  onToggleExpand,
  position = 'right',
  onChangePosition,
  onToggleMinimize,
  dragHandleProps
}) => {
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const layoutMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node)) {
        setIsLayoutMenuOpen(false);
      }
    };
    if (isLayoutMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isLayoutMenuOpen]);
  return (
    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2.5 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
      {/* Top Row: Package Icon, SKU, Mode & Row Badges (Left) + Stepper & Actions (Right) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="p-1 -ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing rounded select-none"
              title="Arrastrar ventana flotante"
            >
              <GripHorizontal className="w-4 h-4" />
            </div>
          )}
          <div className="w-7 h-7 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
            <Package className="w-3.5 h-3.5" />
          </div>
          {sku && sku !== '-' && (
            <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 shrink-0">
              SKU: {sku}
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
            {detailMode}
          </span>
          {typeof product._rowIndex === 'number' && product._rowIndex > 0 && (
            <span className="text-[11px] text-slate-400 font-mono">
              Fila #{product._rowIndex}
            </span>
          )}
        </div>

        {/* Record Stepper & Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {totalCount !== undefined && totalCount > 0 && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs shrink-0">
              <button
                onClick={onNavigatePrev}
                disabled={!onNavigatePrev}
                className="p-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30 disabled:hover:text-slate-600 dark:disabled:hover:text-slate-300 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Registro anterior (Flecha Arriba / Izquierda)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-1 font-mono font-bold text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                {currentIndex || 1} / {totalCount}
              </span>
              <button
                onClick={onNavigateNext}
                disabled={!onNavigateNext}
                className="p-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30 disabled:hover:text-slate-600 dark:disabled:hover:text-slate-300 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Siguiente registro (Flecha Abajo / Derecha)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            {onPrintBluetooth && (
              <button
                onClick={() => onPrintBluetooth(product)}
                className="p-1.5 text-indigo-700 dark:text-indigo-300 bg-indigo-600/10 border border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                title="Imprimir etiqueta en Marklife P15 (Bluetooth BLE)"
              >
                <Bluetooth className="w-4 h-4" />
              </button>
            )}
            {onPrintBarcode && sku && sku !== '-' && (
              <button
                onClick={() => onPrintBarcode(product)}
                className="p-1.5 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                title="Imprimir código de barras del SKU en formato ticket"
              >
                <BarcodeIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onEdit(product)}
              className="p-1.5 text-blue-700 dark:text-blue-300 bg-blue-600/10 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
              title="Editar registro"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            {onCopy && (
              <button
                onClick={() => onCopy(product)}
                className="p-1.5 text-blue-700 dark:text-blue-300 bg-blue-600/10 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
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
                className="p-1.5 text-rose-600 dark:text-rose-400 bg-rose-600/10 border border-rose-200 dark:border-rose-800 rounded-xl hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                title="Eliminar registro"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {onToggleMinimize && (
              <button
                type="button"
                onClick={onToggleMinimize}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                title="Minimizar a píldora flotante"
                aria-label="Minimizar"
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            {onChangePosition && !isExpandedHorizontal && (
              <div className="relative" ref={layoutMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsLayoutMenuOpen(!isLayoutMenuOpen)}
                  className={`p-1.5 rounded-xl border transition-all cursor-pointer hidden sm:flex items-center gap-1 ${
                    position !== 'right'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title="Cambiar disposición de la ficha (Lateral, Muelle, Flotante, En Fila)"
                  aria-label="Cambiar modo de vista de detalle"
                >
                  {position === 'bottom' && <PanelBottom className="w-4 h-4" />}
                  {position === 'right' && <PanelRight className="w-4 h-4" />}
                  {position === 'floating' && <AppWindow className="w-4 h-4" />}
                  {position === 'inline' && <Rows className="w-4 h-4" />}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>

                {isLayoutMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Ubicación de Ficha
                    </div>
                    <button
                      type="button"
                      onClick={() => { onChangePosition('right'); setIsLayoutMenuOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer ${
                        position === 'right'
                          ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 font-bold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <PanelRight className="w-4 h-4 shrink-0 text-blue-500" />
                      <div className="flex flex-col">
                        <span>Panel Lateral</span>
                        <span className="text-[10px] text-slate-400 font-normal">Predeterminado</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { onChangePosition('bottom'); setIsLayoutMenuOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer ${
                        position === 'bottom'
                          ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 font-bold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <PanelBottom className="w-4 h-4 shrink-0 text-indigo-500" />
                      <div className="flex flex-col">
                        <span>Muelle Inferior</span>
                        <span className="text-[10px] text-slate-400 font-normal">Dock en 3 columnas</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { onChangePosition('floating'); setIsLayoutMenuOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer ${
                        position === 'floating'
                          ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 font-bold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <AppWindow className="w-4 h-4 shrink-0 text-amber-500" />
                      <div className="flex flex-col">
                        <span>Ventana Flotante</span>
                        <span className="text-[10px] text-slate-400 font-normal">Arrastrable (PiP)</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { onChangePosition('inline'); setIsLayoutMenuOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer ${
                        position === 'inline'
                          ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 font-bold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Rows className="w-4 h-4 shrink-0 text-emerald-500" />
                      <div className="flex flex-col">
                        <span>En Fila (Acordeón)</span>
                        <span className="text-[10px] text-slate-400 font-normal">Dentro de la tabla</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="p-1.5 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-blue-600 hover:text-white transition-colors cursor-pointer hidden sm:block"
                title={isExpandedHorizontal ? "Cambiar a panel acoplado" : "Expandir a pantalla completa (Ficha Técnica en 3 columnas)"}
              >
                {isExpandedHorizontal ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              title="Cerrar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Dedicated Full Item Description Row (Unclipped, wraps naturally) */}
      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-snug break-words" title={title}>
        {title}
      </h3>
    </div>
  );
};
