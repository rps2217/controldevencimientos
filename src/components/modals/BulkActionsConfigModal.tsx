import React from 'react';
import { X, Sliders } from 'lucide-react';
import { SheetConfig, SpreadsheetMetadata } from '../../types';
import { TableBulkActionsPanel } from '../settings/TableBulkActionsPanel';

interface BulkActionsConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
  saveConfig: (newConfig: SheetConfig) => void;
  activeSheetTitle: string;
  activeView: string;
  headers: string[];
  metadata: SpreadsheetMetadata | null;
}

export const BulkActionsConfigModal: React.FC<BulkActionsConfigModalProps> = ({
  isOpen,
  onClose,
  sheetConfig,
  setSheetConfig,
  saveConfig,
  activeSheetTitle,
  activeView,
  headers,
  metadata
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg flex items-center gap-2">
                Acciones Masivas por Tabla
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Controla qué botones aparecen al seleccionar filas para evitar ruido visual
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <TableBulkActionsPanel
            sheetConfig={sheetConfig}
            setSheetConfig={setSheetConfig}
            saveConfig={saveConfig}
            activeSheetTitle={activeSheetTitle}
            activeView={activeView}
            headers={headers}
            metadata={metadata}
          />
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Los cambios se guardan y aplican inmediatamente a esta sesión.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-sm cursor-pointer"
          >
            Listo
          </button>
        </div>

      </div>
    </div>
  );
};
