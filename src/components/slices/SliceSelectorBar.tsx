import React, { useState } from 'react';
import { 
  Layers, AlertTriangle, Clock, Truck, Scale, Flame, 
  CheckCircle2, RotateCcw, Bookmark, Sparkles, Package, 
  FileText, Tag, Filter, ShieldCheck, 
  Plus, X, SlidersHorizontal, EyeOff, ChevronDown, ChevronUp 
} from 'lucide-react';
import { TableSlice } from '../../types';
import { SLICE_COLOR_CLASSES } from '../../utils/sliceRegistry';

interface SliceSelectorBarProps {
  slices: TableSlice[];
  activeSliceId: string | null;
  onSelectSlice: (slice: TableSlice | null) => void;
  sliceCounts: Record<string, number>;
  totalItemsCount: number;
  hasActiveFilters: boolean;
  onOpenCreateSlice: () => void;
  onOpenSliceManager?: () => void;
  activeSlice: TableSlice | null;
  hiddenSlicesCount?: number;
  isCollapsedDefault?: boolean;
}

export const SliceIcon: React.FC<{ iconName?: string; className?: string }> = ({ iconName, className = 'w-3.5 h-3.5' }) => {
  switch (iconName) {
    case 'AlertTriangle':
      return <AlertTriangle className={className} />;
    case 'Clock':
      return <Clock className={className} />;
    case 'Truck':
      return <Truck className={className} />;
    case 'Scale':
      return <Scale className={className} />;
    case 'Flame':
      return <Flame className={className} />;
    case 'CheckCircle2':
      return <CheckCircle2 className={className} />;
    case 'RotateCcw':
      return <RotateCcw className={className} />;
    case 'Bookmark':
      return <Bookmark className={className} />;
    case 'Sparkles':
      return <Sparkles className={className} />;
    case 'Package':
      return <Package className={className} />;
    case 'FileText':
      return <FileText className={className} />;
    case 'Tag':
      return <Tag className={className} />;
    case 'ShieldCheck':
      return <ShieldCheck className={className} />;
    case 'Filter':
      return <Filter className={className} />;
    case 'Layers':
    default:
      return <Layers className={className} />;
  }
};

export const SliceSelectorBar: React.FC<SliceSelectorBarProps> = ({
  slices,
  activeSliceId,
  onSelectSlice,
  sliceCounts,
  totalItemsCount,
  hasActiveFilters,
  onOpenCreateSlice,
  onOpenSliceManager,
  activeSlice,
  hiddenSlicesCount = 0,
  isCollapsedDefault = true
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('appsheet_slices_collapsed');
      return saved !== null ? saved === 'true' : isCollapsedDefault;
    } catch {
      return isCollapsedDefault;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('appsheet_slices_collapsed', String(next)); } catch {}
      return next;
    });
  };

  const isAllRowsActive = activeSliceId === null;

  if (isCollapsed) {
    return (
      <div className="bg-slate-50/80 dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 px-6 sm:px-8 py-1.5 shrink-0 flex items-center justify-between gap-3 text-xs transition-all">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          <button
            type="button"
            onClick={toggleCollapse}
            className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
            title="Desplegar barra completa de Vistas / Slices"
          >
            <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="font-bold">Slices ({slices.length})</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <span className="text-slate-300 dark:text-slate-700">|</span>

          {activeSlice ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 border border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200 font-bold text-[11px]">
              <SliceIcon iconName={activeSlice.icon} className="w-3 h-3 text-blue-600" />
              <span>{activeSlice.name}</span>
              <span className="font-mono text-[10px] opacity-80">({sliceCounts[activeSlice.id] ?? 0})</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectSlice(null); }}
                className="ml-0.5 p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 cursor-pointer"
                title="Quitar filtro de slice"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium italic">
              Todas las filas ({totalItemsCount})
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleCollapse}
          className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
          title="Desplegar catálogo de Slices"
        >
          <span>Expandir Slices</span>
          <ChevronDown className="w-3 h-3 text-slate-500" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 px-6 sm:px-8 py-2.5 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
      {/* Slices Pills Scrollable Container */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 pr-2 mr-1 border-r border-slate-200 dark:border-slate-800">
          <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="hidden sm:inline">Vistas / Slices:</span>
        </div>

        {/* Pill 0: Todas las Filas */}
        <button
          type="button"
          onClick={() => onSelectSlice(null)}
          className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 flex items-center gap-2 border cursor-pointer ${
            isAllRowsActive
              ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800 dark:border-slate-100 shadow-sm'
              : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
          }`}
          title="Ver todas las filas de la tabla sin restricción de slice"
        >
          <span>Todas las Filas</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
            isAllRowsActive
              ? 'bg-white/20 dark:bg-slate-900/20 text-white dark:text-slate-900'
              : 'bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
          }`}>
            {totalItemsCount}
          </span>
        </button>

        {/* Slice Pills (Clean buttons without dangling hover icons) */}
        {slices.map((slice) => {
          const isActive = activeSliceId === slice.id;
          const count = sliceCounts[slice.id] ?? 0;
          const color = slice.color || 'blue';
          const colorScheme = SLICE_COLOR_CLASSES[color] || SLICE_COLOR_CLASSES.blue;

          return (
            <button
              key={slice.id}
              type="button"
              onClick={() => onSelectSlice(isActive ? null : slice)}
              className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 border shrink-0 cursor-pointer ${
                isActive
                  ? `${colorScheme.activeBg} ${colorScheme.activeText} border-transparent shadow-sm ring-2 ${colorScheme.ring}`
                  : `${colorScheme.bg} ${colorScheme.text} ${colorScheme.border} hover:opacity-90`
              }`}
              title={slice.description || slice.name}
            >
              <SliceIcon iconName={slice.icon} className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">{slice.name}</span>
              
              {/* Live Count Badge */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ml-0.5 ${
                isActive
                  ? 'bg-white/25 text-white'
                  : `${colorScheme.badgeBg} ${colorScheme.badgeText}`
              }`}>
                {count}
              </span>

              {!slice.isBuiltIn && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" title="Vista personalizada de usuario" />
              )}
            </button>
          );
        })}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Active Slice Dismiss Indicator */}
        {activeSlice && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs font-semibold">
            <Filter className="w-3 h-3 text-blue-500" />
            <span className="hidden sm:inline">Slice activo:</span>
            <strong className="font-bold max-w-[120px] truncate" title={activeSlice.name}>{activeSlice.name}</strong>

            {/* Dismiss Slice button */}
            <button
              type="button"
              onClick={() => onSelectSlice(null)}
              className="ml-0.5 p-0.5 rounded-md hover:bg-blue-200/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 transition-colors cursor-pointer"
              title="Quitar filtro de slice (Volver a Todas las Filas)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Administrar Vistas Button */}
        {onOpenSliceManager && (
          <button
            type="button"
            onClick={onOpenSliceManager}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs relative"
            title="Administrar todas las vistas y slices de esta tabla"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Administrar</span>
            {hiddenSlicesCount > 0 && (
              <span 
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold flex items-center gap-0.5 border border-amber-200 dark:border-amber-800"
                title={`${hiddenSlicesCount} vista${hiddenSlicesCount > 1 ? 's' : ''} oculta${hiddenSlicesCount > 1 ? 's' : ''} de la barra`}
              >
                <EyeOff className="w-2.5 h-2.5" />
                <span>{hiddenSlicesCount}</span>
              </span>
            )}
          </button>
        )}

        {/* Create / Capture Slice Button */}
        <button
          type="button"
          onClick={onOpenCreateSlice}
          className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 border shadow-2xs cursor-pointer ${
            hasActiveFilters
              ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-amber-200 dark:shadow-none'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
          title={hasActiveFilters ? "Guardar filtros y vista actual como un nuevo Slice" : "Crear una nueva vista personalizada"}
        >
          {hasActiveFilters ? (
            <>
              <Sparkles className="w-3.5 h-3.5 text-white" />
              <span>Guardar como Slice</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Nuevo Slice</span>
            </>
          )}
        </button>

        {/* Collapse Slices Bar Button */}
        <button
          type="button"
          onClick={toggleCollapse}
          className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-bold transition-all flex items-center gap-1 cursor-pointer"
          title="Ocultar/Minimizar barra de Slices para despejar la pantalla"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Ocultar Slices</span>
        </button>
      </div>
    </div>
  );
};
