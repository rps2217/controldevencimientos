import React, { useState, useEffect, useRef } from 'react';
import { useConfirm } from '../common/ConfirmDialog';
import { X, Layers, Check, Trash2, Sliders, Columns, Filter, Copy } from 'lucide-react';
import { 
  TableSlice, SliceFilterConfig, SliceColor, SortConfig, DynamicMonthRange 
} from '../../types';

// Subcomponents (Ponytail Protocol Modularization)
import { SliceGeneralTab } from './sliceEditor/SliceGeneralTab';
import { SliceFiltersTab } from './sliceEditor/SliceFiltersTab';
import { SliceColumnsTab } from './sliceEditor/SliceColumnsTab';

interface SliceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableKey: string;
  headers: string[];
  currentFilters: {
    searchTerm?: string;
    quickChip?: string | null;
    eventFilter?: string[];
    pmRadarFilter?: string[];
    dynamicMonthFilter?: number[];
    dynamicMonthRange?: DynamicMonthRange | null;
    eventResolutionFilter?: string[];
    frcBodFilter?: string[];
    columnFilters?: Record<string, string[]>;
  };
  currentSort?: SortConfig;
  currentGroupBy?: string;
  currentGroupByDirection?: 'asc' | 'desc';
  currentVisibleHeaders?: string[];
  editingSlice?: TableSlice | null;
  onSaveSlice: (slice: TableSlice) => void;
  onDeleteSlice?: (sliceId: string) => void;
}

const AVAILABLE_ICONS = [
  'Layers', 'AlertTriangle', 'Clock', 'Truck', 'Scale', 
  'Flame', 'CheckCircle2', 'RotateCcw', 'Bookmark', 
  'Sparkles', 'Package', 'FileText', 'Tag', 'Filter', 'ShieldCheck'
];

const AVAILABLE_COLORS: SliceColor[] = [
  'blue', 'rose', 'amber', 'emerald', 'purple', 'indigo', 'slate'
];

const PM_STATUS_OPTIONS = [
  { id: 'retire_now', label: 'Retiro Urgente', icon: 'AlertTriangle', color: 'rose' },
  { id: 'drainage', label: 'Radar PM (Drenaje)', icon: 'Flame', color: 'amber' },
  { id: 'upcoming', label: 'Próximos a Vencer', icon: 'Clock', color: 'indigo' },
  { id: 'en_regla', label: 'Inventario en Regla', icon: 'CheckCircle2', color: 'emerald' }
];

export function getOffsetMonthName(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const m = d.toLocaleString('es-ES', { month: 'short' });
  const capitalized = m.charAt(0).toUpperCase() + m.slice(1);
  return `${capitalized} ${d.getFullYear()}`;
}

const DYNAMIC_RANGE_PRESETS = [
  { label: 'Próximo mes (+1)', start: 1, end: 1, desc: 'Solo mes entrante' },
  { label: 'Próximos 3 meses (+1 a +3)', start: 1, end: 3, desc: 'Trimestre inmediato' },
  { label: 'Próximos 6 meses (+1 a +6)', start: 1, end: 6, desc: 'Semestre inmediato' },
  { label: 'De +2 a +4 meses', start: 2, end: 4, desc: 'Inicia en 2 meses (3 meses de ventana)' },
  { label: 'De +2 a +6 meses', start: 2, end: 6, desc: 'Inicia en 2 meses (5 meses de ventana)' },
  { label: 'De +3 a +6 meses', start: 3, end: 6, desc: 'Mediano plazo' },
];

const EVENT_CATEGORY_OPTIONS = [
  { id: 'TRANSPORTE', label: 'Transporte', icon: 'Truck', color: 'blue' },
  { id: 'DIFERENCIA', label: 'Diferencia Stock', icon: 'Scale', color: 'purple' },
  { id: 'AVERIA', label: 'Sobrante Invent.', icon: 'PlusCircle', color: 'emerald' },
  { id: 'CANJES', label: 'Canjes', icon: 'RotateCcw', color: 'indigo' },
  { id: 'DEVOLUCION', label: 'Faltante Invent.', icon: 'MinusCircle', color: 'rose' },
  { id: 'CALIDAD', label: 'Calidad', icon: 'ShieldCheck', color: 'emerald' }
];

function getSuggestedSliceName(
  filters: SliceEditorModalProps['currentFilters'],
  groupBy?: string,
  tableKey?: string
): string {
  if (filters.searchTerm) return `Búsqueda: ${filters.searchTerm}`;
  if (filters.quickChip) return `Filtro: ${filters.quickChip}`;
  if (filters.dynamicMonthRange) {
    return `Vencimientos +${filters.dynamicMonthRange.startOffset} a +${filters.dynamicMonthRange.endOffset} meses`;
  }
  if (filters.dynamicMonthFilter && filters.dynamicMonthFilter.length > 0) {
    return `Vencimientos +${filters.dynamicMonthFilter.join(', +')} meses`;
  }
  if (filters.pmRadarFilter && filters.pmRadarFilter.length > 0) {
    const map: Record<string, string> = {
      retire_now: 'Retiro Urgente',
      drainage: 'Radar PM Drenaje',
      upcoming: 'Próximos a Vencer',
      en_regla: 'En Regla'
    };
    return `Vista ${filters.pmRadarFilter.map(k => map[k] || k).join(', ')}`;
  }
  if (filters.eventFilter && filters.eventFilter.length > 0) {
    return `Incidencias: ${filters.eventFilter.join(', ')}`;
  }
  if (filters.frcBodFilter && filters.frcBodFilter.length > 0) {
    return `Bodega: ${filters.frcBodFilter.join(', ')}`;
  }
  if (filters.eventResolutionFilter && filters.eventResolutionFilter.length > 0) {
    return filters.eventResolutionFilter.includes('pending') ? 'Traspasos Pendientes' : 'Traspasos Realizados';
  }
  if (groupBy && groupBy !== 'none') {
    return `Agrupado por ${groupBy}`;
  }
  return tableKey === 'events' ? 'Mi Vista Incidencias' : 'Mi Vista Personalizada';
}

export const SliceEditorModal: React.FC<SliceEditorModalProps> = ({
  isOpen,
  onClose,
  tableKey,
  headers,
  currentFilters,
  currentSort,
  currentGroupBy,
  currentGroupByDirection,
  currentVisibleHeaders = [],
  editingSlice,
  onSaveSlice,
  onDeleteSlice
}) => {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Layers');
  const [color, setColor] = useState<SliceColor>('blue');
  const [filterConfig, setFilterConfig] = useState<SliceFilterConfig>({});
  const [groupByColumn, setGroupByColumn] = useState<string>('none');
  const [groupByDirection, setGroupByDirection] = useState<'asc' | 'desc'>('asc');
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [useCustomColumns, setUseCustomColumns] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [columnSearch, setColumnSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'general' | 'filters' | 'columns'>('general');
  const [errors, setErrors] = useState<{ name?: string }>({});

  const isBuiltIn = Boolean(editingSlice?.isBuiltIn);

  const prevIsOpenRef = useRef(false);
  const prevEditingIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    const editingChanged = editingSlice?.id !== prevEditingIdRef.current;
    
    prevIsOpenRef.current = isOpen;
    prevEditingIdRef.current = editingSlice?.id;

    if (!isOpen) return;

    if (justOpened || editingChanged) {
      if (editingSlice) {
        setName(isBuiltIn ? `${editingSlice.name} (Mi Copia)` : editingSlice.name);
        setDescription(editingSlice.description || '');
        setIcon(editingSlice.icon || 'Bookmark');
        setColor(editingSlice.color || 'blue');
        setFilterConfig(editingSlice.filterConfig ? { ...editingSlice.filterConfig } : {});
        setGroupByColumn(editingSlice.groupByColumn || 'none');
        setGroupByDirection(editingSlice.groupByDirection || 'asc');
        setSortColumn(editingSlice.sortConfig?.column || '');
        setSortDirection(editingSlice.sortConfig?.direction || 'asc');
        if (editingSlice.visibleColumns && editingSlice.visibleColumns.length > 0) {
          setSelectedColumns([...editingSlice.visibleColumns]);
          setUseCustomColumns(true);
        } else {
          setSelectedColumns([...headers]);
          setUseCustomColumns(false);
        }
      } else {
        setName(getSuggestedSliceName(currentFilters, currentGroupBy, tableKey));
        setDescription('');
        setIcon(tableKey === 'events' ? 'AlertTriangle' : 'Bookmark');
        setColor('blue');
        setFilterConfig({
          searchTerm: currentFilters.searchTerm || undefined,
          quickChip: currentFilters.quickChip || undefined,
          eventFilter: currentFilters.eventFilter?.length ? [...currentFilters.eventFilter] : undefined,
          pmRadarFilter: currentFilters.pmRadarFilter?.length ? [...currentFilters.pmRadarFilter] : undefined,
          dynamicMonthFilter: currentFilters.dynamicMonthFilter?.length ? [...currentFilters.dynamicMonthFilter] : undefined,
          dynamicMonthRange: currentFilters.dynamicMonthRange ? { ...currentFilters.dynamicMonthRange } : undefined,
          eventResolutionFilter: currentFilters.eventResolutionFilter?.length ? [...currentFilters.eventResolutionFilter] : undefined,
          frcBodFilter: currentFilters.frcBodFilter?.length ? [...currentFilters.frcBodFilter] : undefined,
          columnFilters: currentFilters.columnFilters && Object.keys(currentFilters.columnFilters).length > 0
            ? { ...currentFilters.columnFilters }
            : undefined
        });
        setGroupByColumn(currentGroupBy || 'none');
        setGroupByDirection(currentGroupByDirection || 'asc');
        if (currentSort && currentSort.column) {
          setSortColumn(currentSort.column);
          setSortDirection(currentSort.direction === 'desc' ? 'desc' : 'asc');
        } else {
          setSortColumn('');
          setSortDirection('asc');
        }
        if (currentVisibleHeaders && currentVisibleHeaders.length > 0) {
          setSelectedColumns([...currentVisibleHeaders]);
          setUseCustomColumns(currentVisibleHeaders.length !== headers.length);
        } else {
          setSelectedColumns([...headers]);
          setUseCustomColumns(false);
        }
      }
      setErrors({});
      setColumnSearch('');
      setActiveTab('general');
    }
  }, [isOpen, editingSlice, headers, currentFilters, currentSort, currentGroupBy, currentGroupByDirection, currentVisibleHeaders, isBuiltIn, tableKey]);

  if (!isOpen) return null;

  const handleToggleColumn = (col: string) => {
    setSelectedColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const handleSelectAllColumns = () => {
    setSelectedColumns([...headers]);
  };

  const handleClearColumns = () => {
    setSelectedColumns([]);
  };

  const handleTogglePmStatus = (statusId: string) => {
    setFilterConfig(prev => {
      const current = prev.pmRadarFilter || [];
      const updated = current.includes(statusId)
        ? current.filter(s => s !== statusId)
        : [...current, statusId];
      return {
        ...prev,
        pmRadarFilter: updated.length > 0 ? updated : undefined
      };
    });
  };

  const handleSetDynamicRange = (start: number, end: number) => {
    const validStart = Math.max(0, start);
    const validEnd = Math.max(validStart, end);
    setFilterConfig(prev => ({
      ...prev,
      dynamicMonthRange: { startOffset: validStart, endOffset: validEnd },
      dynamicMonthFilter: undefined
    }));
  };

  const handleClearDynamicRange = () => {
    setFilterConfig(prev => ({
      ...prev,
      dynamicMonthRange: undefined,
      dynamicMonthFilter: undefined
    }));
  };

  const handleToggleEventCategory = (catId: string) => {
    setFilterConfig(prev => {
      const current = prev.eventFilter || [];
      const updated = current.includes(catId)
        ? current.filter(c => c !== catId)
        : [...current, catId];
      return {
        ...prev,
        eventFilter: updated.length > 0 ? updated : undefined
      };
    });
  };

  const handleToggleEventResolution = (res: 'pending' | 'completed') => {
    setFilterConfig(prev => {
      const current = prev.eventResolutionFilter || [];
      const updated = current.includes(res)
        ? current.filter(r => r !== res)
        : [...current, res];
      return {
        ...prev,
        eventResolutionFilter: updated.length > 0 ? updated : undefined
      };
    });
  };

  const handleSave = (e?: React.SyntheticEvent, forceAsNew = false) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanName = name.trim();
    if (!cleanName) {
      setErrors({ name: 'El nombre del slice es obligatorio' });
      setActiveTab('general');
      return;
    }

    const shouldCreateNew = forceAsNew || isBuiltIn || !editingSlice;

    const newSlice: TableSlice = {
      id: shouldCreateNew
        ? `slice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        : editingSlice.id,
      name: cleanName,
      description: description.trim() || undefined,
      tableKey: tableKey || 'main',
      icon: icon || 'Bookmark',
      color: color || 'blue',
      isBuiltIn: false,
      filterConfig: filterConfig || {},
      groupByColumn: groupByColumn !== 'none' ? groupByColumn : undefined,
      groupByDirection: groupByColumn !== 'none' ? groupByDirection : undefined,
      sortConfig: sortColumn ? { column: sortColumn, direction: sortDirection } : undefined,
      visibleColumns: useCustomColumns && selectedColumns.length > 0 ? selectedColumns : undefined
    };

    try {
      onSaveSlice(newSlice);
      onClose();
    } catch (err: unknown) {
      console.error('Error saving slice:', err);
      setErrors({ name: `Error al guardar slice: ${err instanceof Error ? err.message : 'Error desconocido'}` });
    }
  };

  const filterSummary: string[] = [];
  if (filterConfig.searchTerm) filterSummary.push(`Búsqueda: "${filterConfig.searchTerm}"`);
  if (filterConfig.quickChip) filterSummary.push(`Píldora: "${filterConfig.quickChip}"`);
  if (filterConfig.pmRadarFilter && filterConfig.pmRadarFilter.length > 0) {
    filterSummary.push(`Radar PM: ${filterConfig.pmRadarFilter.join(', ')}`);
  }
  if (filterConfig.dynamicMonthRange) {
    filterSummary.push(`Rango Meses: +${filterConfig.dynamicMonthRange.startOffset} a +${filterConfig.dynamicMonthRange.endOffset} (${getOffsetMonthName(filterConfig.dynamicMonthRange.startOffset)} - ${getOffsetMonthName(filterConfig.dynamicMonthRange.endOffset)})`);
  } else if (filterConfig.dynamicMonthFilter && filterConfig.dynamicMonthFilter.length > 0) {
    filterSummary.push(`Meses Futuros: +${filterConfig.dynamicMonthFilter.join(', +')}`);
  }
  if (filterConfig.eventFilter && filterConfig.eventFilter.length > 0) {
    filterSummary.push(`Categorías: ${filterConfig.eventFilter.join(', ')}`);
  }
  if (filterConfig.eventResolutionFilter && filterConfig.eventResolutionFilter.length > 0) {
    filterSummary.push(`Resolución: ${filterConfig.eventResolutionFilter.map(s => s === 'pending' ? 'Pendiente' : 'Realizado').join(', ')}`);
  }
  if (filterConfig.frcBodFilter && filterConfig.frcBodFilter.length > 0) {
    filterSummary.push(`Bodegas: ${filterConfig.frcBodFilter.join(', ')}`);
  }
  if (filterConfig.columnFilters && Object.keys(filterConfig.columnFilters).length > 0) {
    const colCount = Object.keys(filterConfig.columnFilters).length;
    filterSummary.push(`${colCount} filtro(s) de columnas`);
  }

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="max-w-2xl w-full app-panel overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {isBuiltIn ? (
                  <>
                    <span>Personalizar Vista del Sistema</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold">
                      Copia Personalizada
                    </span>
                  </>
                ) : editingSlice ? (
                  'Editar Vista Personalizada (Slice)'
                ) : (
                  'Crear Vista Personalizada (Slice)'
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Segmento inteligente de datos con filtros, orden y columnas dedicadas (estilo AppSheet).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-50/40 dark:bg-slate-900/40">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'general'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>1. General & Diseño</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('filters')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 relative cursor-pointer ${
              activeTab === 'filters'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>2. Criterios de Filtrado</span>
            {filterSummary.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono font-bold">
                {filterSummary.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('columns')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 relative cursor-pointer ${
              activeTab === 'columns'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>3. Columnas & Orden</span>
            {useCustomColumns && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-mono font-bold">
                {selectedColumns.length}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'general' && (
            <SliceGeneralTab
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              icon={icon}
              setIcon={setIcon}
              color={color}
              setColor={setColor}
              availableIcons={AVAILABLE_ICONS}
              availableColors={AVAILABLE_COLORS}
              errors={errors}
              filterSummary={filterSummary}
            />
          )}

          {activeTab === 'filters' && (
            <SliceFiltersTab
              filterConfig={filterConfig}
              setFilterConfig={setFilterConfig}
              headers={headers}
              tableKey={tableKey}
              handleTogglePmStatus={handleTogglePmStatus}
              handleSetDynamicRange={handleSetDynamicRange}
              handleClearDynamicRange={handleClearDynamicRange}
              handleToggleEventCategory={handleToggleEventCategory}
              handleToggleEventResolution={handleToggleEventResolution}
              dynamicRangePresets={DYNAMIC_RANGE_PRESETS}
              pmStatusOptions={PM_STATUS_OPTIONS}
              eventCategoryOptions={EVENT_CATEGORY_OPTIONS}
            />
          )}

          {activeTab === 'columns' && (
            <SliceColumnsTab
              headers={headers}
              useCustomColumns={useCustomColumns}
              setUseCustomColumns={setUseCustomColumns}
              selectedColumns={selectedColumns}
              columnSearch={columnSearch}
              setColumnSearch={setColumnSearch}
              handleToggleColumn={handleToggleColumn}
              handleSelectAllColumns={handleSelectAllColumns}
              handleClearColumns={handleClearColumns}
              groupByColumn={groupByColumn}
              setGroupByColumn={setGroupByColumn}
              sortColumn={sortColumn}
              setSortColumn={setSortColumn}
              sortDirection={sortDirection}
              setSortDirection={setSortDirection}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            {editingSlice && !isBuiltIn && onDeleteSlice && (
              <button
                type="button"
                onClick={async () => {
                  if (await confirm({ title: 'Eliminar slice', message: `¿Estás seguro de eliminar el slice "${editingSlice.name}"?`, confirmLabel: 'Eliminar' })) {
                    onDeleteSlice(editingSlice.id);
                    onClose();
                  }
                }}
                className="text-xs px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-bold transition-colors flex items-center gap-1.5 border border-transparent hover:border-red-200 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar Slice</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            {editingSlice && !isBuiltIn && (
              <button
                type="button"
                onClick={(e) => handleSave(e, true)}
                className="text-xs px-3.5 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Guardar como una nueva vista sin modificar la existente"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicar como Nuevo</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => handleSave(e, false)}
              className="text-xs px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-200 dark:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>
                {isBuiltIn
                  ? 'Guardar como Vista Personalizada'
                  : editingSlice
                  ? 'Actualizar Slice'
                  : 'Guardar Slice'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
