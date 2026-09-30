import React from 'react';
import { 
  Package, X, Edit2, Trash2, Copy, Barcode as BarcodeIcon, FileText 
} from 'lucide-react';
import { InventoryItem } from '../../../types';

interface ItemDetailHeaderProps {
  product: InventoryItem;
  title: string;
  sku: string;
  detailMode: 'vencimiento' | 'incidencia' | 'catalogo' | 'politica';
  onEdit: (product: InventoryItem) => void;
  onCopy?: (product: InventoryItem) => void;
  onDeleteRow?: (product: InventoryItem) => void;
  onPrintBarcode?: (product: InventoryItem) => void;
  onClose: () => void;
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
  onClose
}) => {
  return (
    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
          <Package className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate" title={title}>
              {title}
            </h3>
            {sku && sku !== '-' && (
              <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 shrink-0">
                {sku}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
              {detailMode}
            </span>
          </div>
          {typeof product._rowIndex === 'number' && product._rowIndex > 0 && (
            <p className="text-[11px] text-slate-400 font-mono">
              Fila #{product._rowIndex}
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onPrintBarcode && sku && sku !== '-' && (
          <button
            onClick={() => onPrintBarcode(product)}
            className="p-2 text-indigo-700 dark:text-indigo-300 bg-indigo-600/10 border border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
            title="Imprimir código de barras del SKU en formato ticket"
          >
            <BarcodeIcon className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => onEdit(product)}
          className="p-2 text-blue-700 dark:text-blue-300 bg-blue-600/10 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
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
            className="p-2 text-rose-600 dark:text-rose-400 bg-rose-600/10 border border-rose-200 dark:border-rose-800 rounded-xl hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
            title="Eliminar registro"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button 
          onClick={onClose} 
          className="p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
          title="Cerrar (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
