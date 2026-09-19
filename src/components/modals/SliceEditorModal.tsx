import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Layers, Sparkles, Tag, Check, Trash2, Sliders, 
  Columns, Filter, ArrowUpDown, RefreshCw, Copy, 
  Search, AlertTriangle, Flame, Clock, CheckCircle2, 
  Truck, Scale, RotateCcw, ShieldCheck, Bookmark, FileText, Package,
  ArrowUpAZ, ArrowDownZA
} from 'lucide-react';
import { 
  TableSlice, SliceFilterConfig, SliceColor, SortConfig, DynamicMonthRange 
} from '../../types';
import { SliceIcon } from '../slices/SliceSelectorBar';
import { SLICE_COLOR_CLASSES } from '../../utils/sliceRegistry';

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
    eventResolutionFilter?: ('pending' | 'completed')[];
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
  { id: 'AVERIA', label: 'Mermas & Averías', icon: 'Flame', color: 'rose' },
  { id: 'CANJES', label: 'Canjes', icon: 'RotateCcw', color: 'indigo' },
  { id: 'DEVOLUCION', label: 'Devolución', icon: 'RotateCcw', color: 'amber' },
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

  // Track modal open/close transitions to avoid continuous resets on parent re-renders
  const prevIsOpenRef = useRef(false);
  const prevEditingIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    const editingTargetChanged = isOpen && editingSlice?.id !== prevEditingIdRef.current;

    prevIsOpenRef.current = isOpen;
    prevEditingIdRef.current = editingSlice?.id;

    if (!isOpen) return;

    // Only populate form state on initial modal open or when editing a different slice
    if (justOpened || editingTargetChanged) {
      if (editingSlice) {
        setName(isBuiltIn ? `${editingSlice.name} (Personalizado)` : editingSlice.name);
        setDescription(editingSlice.description || '');
        setIcon(editingSlice.icon || 'Layers');
        setColor(editingSlice.color || 'blue');
        setFilterConfig(editingSlice.filterConfig ? { ...editingSlice.filterConfig } : {});
        setGroupByColumn(editingSlice.groupByColumn || 'none');
        setGroupByDirection(editingSlice.groupByDirection || 'asc');
        if (editingSlice.sortConfig && editingSlice.sortConfig.column) {
          setSortColumn(editingSlice.sortConfig.column);
          setSortDirection(editingSlice.sortConfig.direction === 'desc' ? 'desc' : 'asc');
        } else {
          setSortColumn('');
          setSortDirection('asc');
        }
        if (editingSlice.visibleColumns && editingSlice.visibleColumns.length > 0) {
          setUseCustomColumns(true);
          setSelectedColumns(editingSlice.visibleColumns);
        } else {
          setUseCustomColumns(false);
          setSelectedColumns(currentVisibleHeaders.length > 0 ? currentVisibleHeaders : headers);
        }
      } else {
        // Initialize new slice with currently applied view filters
        const defaultName = getSuggestedSliceName(currentFilters, currentGroupBy, tableKey);
        setName(defaultName);
        setDescription('');
        setIcon('Bookmark');
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
        setUseCustomColumns(false);
        setSelectedColumns(currentVisibleHeaders.length > 0 ? currentVisibleHeaders : headers);
      }
      setColumnSearch('');
      setActiveTab('general');
      setErrors({});
    }
  }, [isOpen, editingSlice?.id, isBuiltIn]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSyncWithActiveScreen = () => {
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
    if (currentSort && currentSort.column) {
      setSortColumn(currentSort.column);
      setSortDirection(currentSort.direction === 'desc' ? 'desc' : 'asc');
    }
    if (currentVisibleHeaders && currentVisibleHeaders.length > 0) {
      setSelectedColumns([...currentVisibleHeaders]);
      setUseCustomColumns(currentVisibleHeaders.length !== headers.length);
    }
  };

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
    } catch (err: any) {
      console.error('Error saving slice:', err);
      setErrors({ name: `Error al guardar slice: ${err?.message || 'Error desconocido'}` });
    }
  };

  // Filtered headers for visible columns search
  const filteredHeaders = headers.filter(h => 
    h.toLowerCase().includes(columnSearch.trim().toLowerCase())
  );

  // Human-readable summary of captured filters
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
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]"
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
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono">
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
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-mono">
                {selectedColumns.length}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TAB 1: GENERAL & DISEÑO */}
          {activeTab === 'general' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Nombre y Descripción */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nombre del Slice / Vista <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors({});
                    }}
                    placeholder="Ej. Retiro Urgente Bodega 1, Lotes 2026, Reclamos Chofer..."
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.name ? 'border-red-500 bg-red-50/20' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  />
                  {errors.name && (
                    <p className="text-xs text-red-500 mt-1.5 font-bold flex items-center gap-1">
                      <span>⚠️</span> {errors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Descripción Operativa (Opcional)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Breve nota sobre qué registros agrupa este slice..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Color & Icon Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Color de Distinción
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {AVAILABLE_COLORS.map((c) => {
                      const scheme = SLICE_COLOR_CLASSES[c] || SLICE_COLOR_CLASSES.blue;
                      const isSelected = color === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                            scheme.bg
                          } ${scheme.border} ${
                            isSelected ? 'ring-2 ring-blue-500 scale-110 shadow-xs' : 'hover:scale-105'
                          }`}
                          title={`Color ${c}`}
                        >
                          {isSelected && <Check className={`w-4 h-4 ${scheme.text}`} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Ícono Representativo
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto p-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    {AVAILABLE_ICONS.map((ic) => {
                      const isSelected = icon === ic;
                      return (
                        <button
                          key={ic}
                          type="button"
                          onClick={() => setIcon(ic)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100'
                          }`}
                          title={ic}
                        >
                          <SliceIcon iconName={ic} className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Vista Previa de la Píldora */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    Vista Previa del Botón en la Barra:
                  </span>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const scheme = SLICE_COLOR_CLASSES[color] || SLICE_COLOR_CLASSES.blue;
                      return (
                        <div className={`text-xs px-3 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 ${scheme.bg} ${scheme.text} ${scheme.border}`}>
                          <SliceIcon iconName={icon} className="w-3.5 h-3.5" />
                          <span>{name || 'Mi Slice'}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ml-1 ${scheme.badgeBg} ${scheme.badgeText}`}>
                            12
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={handleSyncWithActiveScreen}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs hover:bg-slate-50 cursor-pointer"
                  title="Capturar y sincronizar filtros, orden y columnas actuales de la pantalla"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronizar con Pantalla</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CRITERIOS DE FILTRADO (INTERACTIVO) */}
          {activeTab === 'filters' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Quick Sync Button */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs text-blue-800 dark:text-blue-200 font-medium">
                    Puedes ajustar los criterios manualmente o capturarlos desde la vista activa.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSyncWithActiveScreen}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Capturar Vista Actual</span>
                </button>
              </div>

              {/* 1. Búsqueda por Texto */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-blue-500" />
                  <span>Término de Búsqueda Fijo (Opcional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={filterConfig.searchTerm || ''}
                    onChange={(e) => setFilterConfig(prev => ({ ...prev, searchTerm: e.target.value || undefined }))}
                    placeholder="Filtrar siempre por un texto, SKU, nombre o proveedor..."
                    className="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {filterConfig.searchTerm && (
                    <button
                      type="button"
                      onClick={() => setFilterConfig(prev => ({ ...prev, searchTerm: undefined }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Filtros de Radar PM (Para Vencimientos o General) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span>Estados de Vencimiento / Radar PM</span>
                  </label>
                  {filterConfig.pmRadarFilter && filterConfig.pmRadarFilter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterConfig(prev => ({ ...prev, pmRadarFilter: undefined }))}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {PM_STATUS_OPTIONS.map((opt) => {
                    const isSelected = (filterConfig.pmRadarFilter || []).includes(opt.id);
                    const scheme = SLICE_COLOR_CLASSES[opt.color] || SLICE_COLOR_CLASSES.blue;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleTogglePmStatus(opt.id)}
                        className={`text-xs p-2 rounded-xl font-bold border transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? `${scheme.bg} ${scheme.text} ${scheme.border} ring-2 ${scheme.ring}`
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <SliceIcon iconName={opt.icon} className="w-3.5 h-3.5" />
                          <span>{opt.label}</span>
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2.5. Filtro Dinámico de Rango de Meses de Vencimiento */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span>Rango Dinámico de Meses de Vencimiento</span>
                  </label>
                  {filterConfig.dynamicMonthRange && (
                    <button
                      type="button"
                      onClick={handleClearDynamicRange}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Limpiar Rango
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Define una ventana de tiempo móvil relativa al mes actual.
                </p>

                {/* Presets Rápidos */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Atajos de Ventanas Frecuentes:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {DYNAMIC_RANGE_PRESETS.map((p) => {
                      const isSelected =
                        filterConfig.dynamicMonthRange?.startOffset === p.start &&
                        filterConfig.dynamicMonthRange?.endOffset === p.end;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => handleSetDynamicRange(p.start, p.end)}
                          title={p.desc}
                          className={`text-[11px] px-2.5 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-1 ring-blue-500'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selectores de Inicio y Fin de Rango */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/80 dark:border-slate-700/60">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      Desde (Mes de inicio):
                    </label>
                    <select
                      value={filterConfig.dynamicMonthRange?.startOffset ?? ''}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          handleClearDynamicRange();
                        } else {
                          const start = parseInt(e.target.value, 10);
                          const currentEnd = filterConfig.dynamicMonthRange?.endOffset ?? Math.max(1, start);
                          handleSetDynamicRange(start, Math.max(start, currentEnd));
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">-- Sin Rango Dinámico --</option>
                      <option value="0">Mes actual (+0: {getOffsetMonthName(0)})</option>
                      <option value="1">Próximo mes (+1: {getOffsetMonthName(1)})</option>
                      <option value="2">En 2 meses (+2: {getOffsetMonthName(2)})</option>
                      <option value="3">En 3 meses (+3: {getOffsetMonthName(3)})</option>
                      <option value="4">En 4 meses (+4: {getOffsetMonthName(4)})</option>
                      <option value="5">En 5 meses (+5: {getOffsetMonthName(5)})</option>
                      <option value="6">En 6 meses (+6: {getOffsetMonthName(6)})</option>
                      <option value="9">En 9 meses (+9: {getOffsetMonthName(9)})</option>
                      <option value="12">En 1 año (+12: {getOffsetMonthName(12)})</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      Hasta (Mes de fin):
                    </label>
                    <select
                      disabled={filterConfig.dynamicMonthRange === undefined || filterConfig.dynamicMonthRange === null}
                      value={filterConfig.dynamicMonthRange?.endOffset ?? ''}
                      onChange={(e) => {
                        const end = parseInt(e.target.value, 10);
                        const currentStart = filterConfig.dynamicMonthRange?.startOffset ?? 0;
                        handleSetDynamicRange(currentStart, end);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {filterConfig.dynamicMonthRange ? (
                        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24]
                          .filter(val => val >= (filterConfig.dynamicMonthRange?.startOffset ?? 0))
                          .map((val) => (
                            <option key={val} value={val}>
                              +{val} meses ({getOffsetMonthName(val)})
                            </option>
                          ))
                      ) : (
                        <option value="">Selecciona inicio primero</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Explicación en Tiempo Real */}
                {filterConfig.dynamicMonthRange && (
                  <div className="p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 flex items-start gap-2">
                    <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-blue-900 dark:text-blue-200">
                      <span className="font-bold">Ventana activa: </span>
                      Desde <span className="font-semibold">{getOffsetMonthName(filterConfig.dynamicMonthRange.startOffset)} (+{filterConfig.dynamicMonthRange.startOffset})</span> hasta <span className="font-semibold">{getOffsetMonthName(filterConfig.dynamicMonthRange.endOffset)} (+{filterConfig.dynamicMonthRange.endOffset})</span>.
                      {filterConfig.dynamicMonthRange.startOffset > 0 && (
                        <span className="block text-[10px] text-blue-700 dark:text-blue-300 mt-0.5">
                          ✓ Excluye automáticamente el mes en curso ({getOffsetMonthName(0)}).
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Filtros de Categoría de Incidencia (Para FRC / Events) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-500" />
                    <span>Categorías de Incidencia (FRC)</span>
                  </label>
                  {filterConfig.eventFilter && filterConfig.eventFilter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterConfig(prev => ({ ...prev, eventFilter: undefined }))}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {EVENT_CATEGORY_OPTIONS.map((cat) => {
                    const isSelected = (filterConfig.eventFilter || []).includes(cat.id);
                    const scheme = SLICE_COLOR_CLASSES[cat.color] || SLICE_COLOR_CLASSES.blue;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleToggleEventCategory(cat.id)}
                        className={`text-xs p-2 rounded-xl font-bold border transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? `${scheme.bg} ${scheme.text} ${scheme.border} ring-1 ${scheme.ring}`
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <SliceIcon iconName={cat.icon} className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{cat.label}</span>
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Estado de Resolución / Traspaso */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>Estado de Traspaso / Regularización</span>
                  </label>
                  {filterConfig.eventResolutionFilter && filterConfig.eventResolutionFilter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterConfig(prev => ({ ...prev, eventResolutionFilter: undefined }))}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleEventResolution('pending')}
                    className={`text-xs p-2 rounded-xl font-bold border transition-all flex items-center justify-between cursor-pointer ${
                      (filterConfig.eventResolutionFilter || []).includes('pending')
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 ring-1 ring-amber-500'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span>Traspasos Pendientes (Sin Folio TR)</span>
                    </span>
                    {(filterConfig.eventResolutionFilter || []).includes('pending') && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleEventResolution('completed')}
                    className={`text-xs p-2 rounded-xl font-bold border transition-all flex items-center justify-between cursor-pointer ${
                      (filterConfig.eventResolutionFilter || []).includes('completed')
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 ring-1 ring-emerald-500'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Regularizados (Con Folio TR)</span>
                    </span>
                    {(filterConfig.eventResolutionFilter || []).includes('completed') && <Check className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* 5. Filtros de Columnas Específicos (si existieran) */}
              {filterConfig.columnFilters && Object.keys(filterConfig.columnFilters).length > 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-blue-500" />
                      <span>Filtros Específicos por Columna</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setFilterConfig(prev => ({ ...prev, columnFilters: undefined }))}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Limpiar Filtros de Columnas
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(filterConfig.columnFilters).map(([col, vals]) => (
                      <span key={col} className="text-[11px] px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <strong>{col}:</strong> {Array.isArray(vals) ? vals.join(', ') : String(vals)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: COLUMNAS & ORDEN */}
          {activeTab === 'columns' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Grouping & Default Sorting */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-blue-500" /> Agrupación Predeterminada
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={groupByColumn}
                      onChange={(e) => setGroupByColumn(e.target.value)}
                      className="flex-1 text-xs font-medium px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="none">Sin agrupación</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    {groupByColumn !== 'none' && (
                      <button
                        type="button"
                        onClick={() => setGroupByDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-1.5 shrink-0 transition-colors"
                        title="Cambiar orden de los grupos (Ascendente A-Z / Descendente Z-A)"
                      >
                        {groupByDirection === 'asc' ? (
                          <ArrowUpAZ className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ArrowDownZA className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        )}
                        <span>{groupByDirection === 'asc' ? 'A-Z' : 'Z-A'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <ArrowUpDown className="w-3.5 h-3.5 text-blue-500" /> Orden Predeterminado
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={sortColumn}
                      onChange={(e) => setSortColumn(e.target.value)}
                      className="flex-1 text-xs font-medium px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Predeterminado</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    {sortColumn && (
                      <button
                        type="button"
                        onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                      >
                        {sortDirection === 'asc' ? 'ASC' : 'DESC'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Visible Columns in Slice (AppSheet Slice Feature) */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Columns className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Columnas Visibles de este Slice
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomColumns}
                      onChange={(e) => setUseCustomColumns(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Personalizar columnas
                    </span>
                  </label>
                </div>

                {useCustomColumns && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="relative flex-1 mr-3">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={columnSearch}
                          onChange={(e) => setColumnSearch(e.target.value)}
                          placeholder="Buscar columna..."
                          className="w-full pl-8 pr-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400 shrink-0">
                        <span>{selectedColumns.length} de {headers.length}</span>
                        <span>•</span>
                        <button type="button" onClick={handleSelectAllColumns} className="hover:underline cursor-pointer">
                          Todas
                        </button>
                        <span>•</span>
                        <button type="button" onClick={handleClearColumns} className="hover:underline cursor-pointer">
                          Limpiar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto p-1">
                      {filteredHeaders.map(col => {
                        const isChecked = selectedColumns.includes(col);
                        return (
                          <label
                            key={col}
                            className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-xs cursor-pointer select-none transition-colors ${
                              isChecked
                                ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 font-medium'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleColumn(col)}
                              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 shrink-0"
                            />
                            <span className="truncate" title={col}>{col}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            {editingSlice && !isBuiltIn && onDeleteSlice && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`¿Estás seguro de eliminar el slice "${editingSlice.name}"?`)) {
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
