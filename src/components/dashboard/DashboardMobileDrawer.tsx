import React from 'react';
import { X } from 'lucide-react';
import { Sidebar } from '../navigation/Sidebar';
import { SheetProperties } from '../../types';
import { useDashboard } from '../../context/DashboardContext';

export interface DashboardMobileDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
  activeView?: string;
  setActiveView?: (view: string) => void;
  setSelectedProduct?: (product: any) => void;
  otherSheets?: string[];
  onOpenConfig?: () => void;
  onOpenStockCount?: () => void;
}

export const DashboardMobileDrawer: React.FC<DashboardMobileDrawerProps> = (props) => {
  const dashboard = useDashboard();

  const isOpen = props.isOpen ?? (dashboard.isMobileMenuOpen && !dashboard.isZenMode);
  const onClose = props.onClose ?? (() => dashboard.setIsMobileMenuOpen?.(false));
  const activeView = props.activeView ?? dashboard.activeView;
  const setActiveView = props.setActiveView ?? dashboard.setActiveView;
  const setSelectedProduct = props.setSelectedProduct ?? dashboard.setSelectedProduct;
  const otherSheets = props.otherSheets ?? dashboard.otherSheets ?? [];
  const onOpenConfig = props.onOpenConfig ?? (() => dashboard.setIsConfigOpen(true));
  const onOpenStockCount = props.onOpenStockCount ?? (() => dashboard.setIsStockCountOpen?.(true));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-72 bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="font-bold text-slate-800 dark:text-slate-100 text-base">Menú de Navegación</span>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar
            isSidebarCollapsed={false}
            setIsSidebarCollapsed={() => {}}
            activeView={activeView}
            setActiveView={(v) => { 
              setActiveView(v); 
              setSelectedProduct(null); 
              onClose(); 
            }}
            setSelectedProduct={setSelectedProduct}
            otherSheets={otherSheets}
            onOpenConfig={() => { 
              onOpenConfig(); 
              onClose(); 
            }}
            onOpenStockCount={() => { 
              onOpenStockCount(); 
              onClose(); 
            }}
          />
        </div>
      </div>
    </div>
  );
};
