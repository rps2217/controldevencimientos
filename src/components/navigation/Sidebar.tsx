import React from 'react';
import { 
  Database, FileSpreadsheet, Package, FileText, TableProperties, List, Settings, PanelLeftClose, PanelLeftOpen, PieChart, Barcode
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

interface SidebarItemProps {
  key?: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
  badge?: string;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, onClick, collapsed, badge }) => {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3.5'} min-h-[44px] py-2.5 rounded-2xl text-sm font-bold transition-all relative cursor-pointer active:scale-[0.98] ${
        active 
          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25 dark:shadow-none' 
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
      }`}
    >
      <div className={`${active ? 'text-white' : 'text-slate-400 dark:text-slate-500'} shrink-0`}>
        {icon}
      </div>
      {!collapsed && <span className="truncate">{label}</span>}
      {badge && !collapsed && (
        <span className="ml-auto text-[10px] font-black tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/70 dark:text-blue-200">
          {badge}
        </span>
      )}
      {active && !collapsed && !badge && (
        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/90"></div>
      )}
    </button>
  );
}

export interface SidebarProps {
  isSidebarCollapsed?: boolean;
  setIsSidebarCollapsed?: (collapsed: boolean) => void;
  activeView?: string;
  setActiveView?: (view: string) => void;
  setSelectedProduct?: (prod: any) => void;
  otherSheets?: string[];
  onOpenConfig?: () => void;
  onOpenStockCount?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const dashboard = useDashboard();

  const isSidebarCollapsed = props.isSidebarCollapsed ?? dashboard.isSidebarCollapsed ?? false;
  const setIsSidebarCollapsed = props.setIsSidebarCollapsed ?? dashboard.setIsSidebarCollapsed ?? (() => {});
  const activeView = props.activeView ?? dashboard.activeView;
  const setActiveView = props.setActiveView ?? dashboard.setActiveView;
  const setSelectedProduct = props.setSelectedProduct ?? dashboard.setSelectedProduct;
  const otherSheets = props.otherSheets ?? dashboard.otherSheets ?? [];
  const onOpenConfig = props.onOpenConfig ?? (() => dashboard.setIsConfigOpen(true));
  const onOpenStockCount = props.onOpenStockCount ?? (() => dashboard.setIsStockCountOpen?.(true));
  return (
    <div className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 z-20 transition-all duration-300`}>
      <div className={`p-4 border-b border-slate-100 dark:border-slate-800 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isSidebarCollapsed && <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">Módulos</p>}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
          className="p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" 
          title={isSidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {isSidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <SidebarItem 
            icon={<Database className="w-5 h-5" />} 
            label="Vencimientos & Radar" 
            active={activeView === 'main'} 
            onClick={() => { setActiveView('main'); setSelectedProduct(null); }}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<FileSpreadsheet className="w-5 h-5" />} 
            label="Incidencias & FRC" 
            active={activeView === 'events'} 
            onClick={() => { setActiveView('events'); setSelectedProduct(null); }}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<Package className="w-5 h-5" />} 
            label="Catálogo Productos" 
            active={activeView === 'products'} 
            onClick={() => { setActiveView('products'); setSelectedProduct(null); }}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<FileText className="w-5 h-5" />} 
            label="Políticas de Canje" 
            active={activeView === 'policies'} 
            onClick={() => { setActiveView('policies'); setSelectedProduct(null); }}
            collapsed={isSidebarCollapsed}
          />

          {onOpenStockCount && (
            <SidebarItem 
              icon={<Barcode className="w-5 h-5" />} 
              label="Conteo de Stock" 
              active={false} 
              onClick={onOpenStockCount}
              collapsed={isSidebarCollapsed}
              badge="Físico"
            />
          )}
          
          <div className="my-2 border-t border-slate-100 dark:border-slate-800"></div>
          
          <SidebarItem 
            icon={<TableProperties className="w-5 h-5" />} 
            label="Estructura de Datos" 
            active={activeView === 'schema'} 
            onClick={() => { setActiveView('schema'); setSelectedProduct(null); }}
            collapsed={isSidebarCollapsed}
          />
          <SidebarItem 
            icon={<PieChart className="w-5 h-5" />} 
            label="Analítica & Dashboard" 
            active={activeView === 'analytics'} 
            onClick={() => { setActiveView('analytics'); setSelectedProduct(null); }}
            collapsed={isSidebarCollapsed}
          />
        </div>

        {otherSheets.length > 0 && (
          <div>
            {!isSidebarCollapsed ? (
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 px-3 border-t border-slate-100 dark:border-slate-800 pt-6">Otras Pestañas</p>
            ) : (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-6 mb-3 mx-2"></div>
            )}
            <div className="flex flex-col gap-1">
              {otherSheets.map((title: string) => (
                <SidebarItem 
                  key={title}
                  icon={<List className="w-5 h-5" />} 
                  label={title} 
                  active={activeView === title} 
                  onClick={() => { setActiveView(title); setSelectedProduct(null); }}
                  collapsed={isSidebarCollapsed}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <button 
          onClick={onOpenConfig} 
          title={isSidebarCollapsed ? "Configuración" : undefined}
          className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-3 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm transition-all`}
        >
          <Settings className="w-5 h-5 text-slate-400 dark:text-slate-500" />
          {!isSidebarCollapsed && "Configuración"}
        </button>
      </div>
    </div>
  );
};
