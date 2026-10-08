import React, { useMemo, useState } from 'react';
import { 
  X, 
  ExternalLink, 
  Building2, 
  Package, 
  ShieldCheck, 
  Clock, 
  Layers, 
  Search,
  ArrowRight,
  FileSpreadsheet
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { RelatedRecordsInspector } from './RelatedRecordsInspector';

export interface CrossTableRelationalMenuProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'proveedor' | 'bodega' | 'sku' | 'categoria';
  entityValue: string;
}

export const CrossTableRelationalMenu: React.FC<CrossTableRelationalMenuProps> = ({
  isOpen,
  onClose,
  entityType,
  entityValue
}) => {
  const dashboard = useDashboard();
  const { 
    items,
    allMainItems, 
    products, 
    policies, 
    setActiveView, 
    setSearchTerm,
    showToast,
    sheetConfig
  } = dashboard;

  const cleanValue = (entityValue || '').trim();
  const [showParentChildModal, setShowParentChildModal] = useState(false);

  // Compute counts across all tables for this entity
  const counts = useMemo(() => {
    if (!cleanValue) {
      return { currentView: 0, main: 0, events: 0, products: 0, policies: 0 };
    }
    const valLower = cleanValue.toLowerCase();

    // Tabla actual
    const currentViewMatches = (items || []).filter(item => {
      return Object.values(item).some(v => v && String(v).toLowerCase().includes(valLower));
    }).length;

    // Vencimientos (main)
    const mainMatches = (allMainItems || []).filter(item => {
      return Object.values(item).some(v => v && String(v).toLowerCase().includes(valLower));
    }).length;

    // Incidencias & FRC (events)
    const eventMatches = (allMainItems || []).filter(item => {
      const isEvent = item.TIPO_EVENTO || item.FECHA_EVENTO || item.OBSERVACIONES || item.FRC_N;
      return isEvent && Object.values(item).some(v => v && String(v).toLowerCase().includes(valLower));
    }).length;

    // Catálogo Maestro (products)
    const productMatches = (products || []).filter(p => {
      return Object.values(p).some(v => v && String(v).toLowerCase().includes(valLower));
    }).length;

    // Políticas de Retiro (policies)
    const policyMatches = (policies || []).filter(p => {
      return Object.values(p).some(v => v && String(v).toLowerCase().includes(valLower));
    }).length;

    return {
      currentView: currentViewMatches,
      main: mainMatches,
      events: eventMatches,
      products: productMatches,
      policies: policyMatches
    };
  }, [items, allMainItems, products, policies, cleanValue]);

  if (!isOpen || !cleanValue) return null;

  if (showParentChildModal) {
    return (
      <RelatedRecordsInspector
        isOpen={true}
        onClose={() => {
          setShowParentChildModal(false);
          onClose();
        }}
        entityType={entityType}
        entityValue={cleanValue}
        allMainItems={allMainItems || []}
        products={products}
        policies={policies}
        onSelectRow={(item) => {
          dashboard.setSelectedProduct?.(item);
          setShowParentChildModal(false);
          onClose();
        }}
        onOpenCreateBatch={(prefill) => {
          dashboard.handleOpenModal?.(undefined);
          if (dashboard.handleBatchFormUpdate) {
            dashboard.handleBatchFormUpdate(prefill);
          }
        }}
        onOpenCreateIncident={(sku, prefill) => {
          dashboard.handleOpenModal?.(undefined, sku);
          if (prefill && dashboard.handleBatchFormUpdate) {
            dashboard.handleBatchFormUpdate(prefill);
          }
        }}
        onApplyFilterToTable={(val) => {
          dashboard.setSearchTerm(val);
        }}
        showToast={(msg, type) => dashboard.showToast(msg, type)}
        customAliases={sheetConfig?.customAliases}
      />
    );
  }

  const handleFilterCurrentTable = () => {
    setSearchTerm(cleanValue);
    showToast(`Filtrando en la tabla actual por "${cleanValue}"`, 'info', 'Filtro Relacional');
    onClose();
  };

  const handleNavigateToView = (viewKey: string, viewTitle: string) => {
    setActiveView(viewKey, cleanValue);
    showToast(`Navegando a ${viewTitle} filtrado por "${cleanValue}"`, 'info', 'Navegación Relacional');
    onClose();
  };

  const getEntityLabel = () => {
    switch (entityType) {
      case 'proveedor': return 'Proveedor / Marca';
      case 'bodega': return 'Bodega / Ubicación';
      case 'sku': return 'SKU / Código Unificado';
      case 'categoria': return 'Categoría / Familia';
      default: return 'Entidad';
    }
  };

  const getEntityIcon = () => {
    switch (entityType) {
      case 'proveedor': return <Building2 className="w-5 h-5 text-indigo-500" />;
      case 'bodega': return <Layers className="w-5 h-5 text-emerald-500" />;
      case 'sku': return <Package className="w-5 h-5 text-blue-500" />;
      case 'categoria': return <FileSpreadsheet className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl max-w-md w-full overflow-hidden flex flex-col transition-all">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
              {getEntityIcon()}
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Navegación Relacional • {getEntityLabel()}
              </span>
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base truncate max-w-[240px]">
                {cleanValue}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Relational Options List */}
        <div className="p-4 space-y-2.5 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium px-1">
            Selecciona la acción o tabla para realizar el cruce relacional de datos en tiempo real:
          </p>

          {/* Option 1 (PRIMERA OPCIÓN): Filtrar en esta misma tabla */}
          <button
            onClick={handleFilterCurrentTable}
            className="w-full p-3.5 rounded-xl border-2 border-indigo-500/30 dark:border-indigo-500/40 bg-indigo-50/60 dark:bg-indigo-950/40 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/60 hover:border-indigo-500 transition-all cursor-pointer flex items-center justify-between group text-left shadow-2xs"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-600 text-white group-hover:scale-105 transition-transform shadow-xs">
                <Search className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                    Filtrar en esta misma tabla
                  </h4>
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200">
                    Vista actual
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Aplica "{cleanValue}" como filtro directo en la tabla activa
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-200/80 dark:bg-indigo-800/80 text-indigo-900 dark:text-indigo-100">
                {counts.currentView} registros
              </span>
              <ArrowRight className="w-4 h-4 text-indigo-500 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* Option: Visión 360° Parent-Child */}
          <button
            onClick={() => setShowParentChildModal(true)}
            className="w-full p-3.5 rounded-xl border-2 border-blue-500/30 dark:border-blue-500/40 bg-blue-50/60 dark:bg-blue-950/40 hover:bg-blue-100/80 dark:hover:bg-blue-900/60 hover:border-blue-500 transition-all cursor-pointer flex items-center justify-between group text-left shadow-2xs"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-600 text-white group-hover:scale-105 transition-transform shadow-xs">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-blue-900 dark:text-blue-200 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                    Explorador 360° Parent-Child
                  </h4>
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                    AppSheet
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Desglose interactivo de lotes, incidencias y catálogo de esta entidad
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-blue-200/80 dark:bg-blue-800/80 text-blue-900 dark:text-blue-100">
                {counts.main + counts.events} vinculados
              </span>
              <ArrowRight className="w-4 h-4 text-blue-500 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 dark:border-slate-800" /></div>
            <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 px-2">
              Navegación Cruzada entre Tablas
            </div>
          </div>

          {/* Option 2: Radar de Vencimientos */}
          <button
            onClick={() => handleNavigateToView('main', 'Radar de Vencimientos')}
            className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-blue-50/80 dark:hover:bg-blue-950/40 hover:border-blue-300 dark:hover:border-blue-700/60 transition-all cursor-pointer flex items-center justify-between group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  Radar de Vencimientos
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Control de stock con fecha de caducidad
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                {counts.main} ítems
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
          </button>

          {/* Option 3: Registro de Incidencias & FRC */}
          <button
            onClick={() => handleNavigateToView('events', 'Incidencias & FRC')}
            className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-amber-50/80 dark:hover:bg-amber-950/40 hover:border-amber-300 dark:hover:border-amber-700/60 transition-all cursor-pointer flex items-center justify-between group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                  Registro de Incidencias & FRC
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mermas, mermas de transporte y folios FRC
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                {counts.events} coincidencia(s)
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 transition-colors" />
            </div>
          </button>

          {/* Option 4: Catálogo Maestro de Productos */}
          <button
            onClick={() => handleNavigateToView('products', 'Catálogo Maestro')}
            className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer flex items-center justify-between group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  Catálogo Maestro de Productos
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Ficha técnica y políticas por SKU
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                {counts.products} catálogo
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
            </div>
          </button>

          {/* Option 5: Políticas comerciales */}
          <button
            onClick={() => handleNavigateToView('policies', 'Políticas de Retiro')}
            className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40 hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all cursor-pointer flex items-center justify-between group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  Políticas de Retiro & Canjes
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Acuerdos comerciales y plazos de anticipación
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                {counts.policies} acuerdos
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            Atajo: Clic en el nombre para explorar
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
