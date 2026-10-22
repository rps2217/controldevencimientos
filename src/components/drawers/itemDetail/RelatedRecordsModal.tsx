import React from 'react';
import { X } from 'lucide-react';
import { InventoryItem } from '../../../types';
import { RelatedRecordsTableContent } from './RelatedRecordsTableContent';

interface RelatedRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  entityValue: string;
  entityType: 'sku' | 'proveedor' | 'bodega';
  batches: InventoryItem[];
  onSelectItem: (item: InventoryItem) => void;
  onNewEvent?: (sku: string) => void;
}

export const RelatedRecordsModal: React.FC<RelatedRecordsModalProps> = ({
  isOpen,
  onClose,
  title,
  entityValue,
  entityType,
  batches,
  onSelectItem,
  onNewEvent
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[85vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200 relative">
        
        {/* Close Button absolute top-right for modal convenience */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex-1 min-h-0 flex flex-col">
          <RelatedRecordsTableContent
            title={title}
            entityValue={entityValue}
            entityType={entityType}
            batches={batches}
            onSelectItem={(item) => {
              onSelectItem(item);
              onClose();
            }}
            onNewEvent={onNewEvent ? (sku) => {
              onNewEvent(sku);
              onClose();
            } : undefined}
            onBack={onClose}
          />
        </div>
      </div>
    </div>
  );
};
