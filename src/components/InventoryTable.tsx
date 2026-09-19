import React, { useMemo } from 'react';
import { InventoryItem, EventCategory, SortConfig } from '../types';
import { ColumnFilterMenu } from './views/ColumnFilterMenu';
import { InventoryTableRow } from './views/InventoryTableRow';
import { ColumnMetadata } from '../hooks/usePrecomputedColumns';
import { GripVertical, ChevronDown } from 'lucide-react';
import { findColumnBySemantic } from '../utils/columnAliases';
import { EVENT_CATEGORIES } from '../utils/dateCalculations';
import { useDashboard } from '../context/DashboardContext';

export interface InventoryTableProps {
  filteredItems?: InventoryItem[];
  selectedRowIds?: number[];
  setSelectedRowIds?: (ids: number[]) => void;
  headers?: string[];
  visibleHeaders?: string[];
  visibleColumnMeta?: ColumnMetadata[];
  activeView?: string;
  tableContainerRef?: React.RefObject<HTMLDivElement>;
  getColWidth?: (headerId: string, label: string, type?: string) => number;
  handleStartResize?: (colId: string, startWidth: number, e: React.MouseEvent) => void;
  handleAutoFitColumn?: (colId: string, label: string) => void;
  resizingCol?: { colId: string; startWidth: number } | null;
  pmRadarFilter?: string[];
  setPmRadarFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  handleFilterToggle?: (prev: string[], val: string, isMulti: boolean) => string[];
  onSelectRow?: (rowIndex: number, selected: boolean) => void;
  onClickItem?: (item: InventoryItem) => void;
  onDeleteRow?: (item: InventoryItem) => void;
  onPmRadarFilterClick?: (targetFilter: string, isMulti: boolean) => void;
  onEventResolutionFilterClick?: (status: 'pending' | 'completed', isMulti: boolean) => void;
  onEventFilterClick?: (eventCat: any, isMulti: boolean) => void;
  onFrcBodFilterClick?: (bodVal: string, isMulti: boolean) => void;
  onOpenQuickTraspaso?: (item: InventoryItem) => void;
  onOpenWhatsApp?: (item: InventoryItem) => void;
  onOpenEmail?: (item: InventoryItem) => void;
  isWhatsAppEnabled?: boolean;
  isEmailEnabled?: boolean;
  frcBodFilter?: string[];
  setFrcBodFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  sheetConfig?: any;
  activeSheet?: any;
  draggedCol?: string | null;
  setDraggedCol?: (col: string | null) => void;
  dragOverCol?: string | null;
  setDragOverCol?: (col: string | null) => void;
  handleColumnDrop?: (target: string, source: string) => void;
  eventFilter?: string[];
  setEventFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  eventResolutionFilter?: string[];
  setEventResolutionFilter?: React.Dispatch<React.SetStateAction<string[]>>;
  columnFilters?: Record<string, string[]>;
  setColumnFilters?: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  columnOptionsMap?: Record<string, any[]>;
  frcBodValues?: string[];
  frcBodCounts?: Record<string, number>;
  frcBodCol?: string;
  virtualRows?: any[];
  paginatedDisplayRows?: any[];
  paddingTop?: number;
  paddingBottom?: number;
  groupByColumn?: string;
  onSelectGroupRows?: (rowIndexes: number[], selected: boolean) => void;
  toggleGroupCollapse?: (groupKey: string) => void;
  measureElementRef?: (node: HTMLElement | null) => void;
  sortConfig?: SortConfig;
  handleToggleSort?: (columnName: string) => void;
  tableDensity?: 'comfortable' | 'compact' | 'ultra';
  expandAllGroups?: () => void;
  collapseAllGroups?: () => void;
  collapsedGroups?: Record<string, boolean>;
}

export const InventoryTable: React.FC<InventoryTableProps> = (props) => {
  const dashboard = useDashboard();

  const filteredItems = props.filteredItems ?? dashboard.filteredItems ?? [];
  const selectedRowIds = props.selectedRowIds ?? dashboard.selectedRowIds ?? [];
  const setSelectedRowIds = props.setSelectedRowIds ?? dashboard.setSelectedRowIds ?? (() => {});
  const headers = props.headers ?? dashboard.headers ?? [];
  const visibleHeaders = props.visibleHeaders ?? dashboard.effectiveVisibleHeaders ?? dashboard.visibleHeaders ?? [];
  const visibleColumnMeta = props.visibleColumnMeta ?? dashboard.visibleColumnMeta ?? [];
  const activeView = props.activeView ?? dashboard.activeView;
  const tableContainerRef = props.tableContainerRef ?? dashboard.tableContainerRef;
  const getColWidth = props.getColWidth ?? dashboard.getColWidth ?? (() => 150);
  const handleStartResize = props.handleStartResize ?? dashboard.handleStartResize ?? (() => {});
  const handleAutoFitColumn = props.handleAutoFitColumn ?? dashboard.handleAutoFitColumn ?? (() => {});
  const resizingCol = props.resizingCol ?? dashboard.resizingCol ?? null;
  const pmRadarFilter = props.pmRadarFilter ?? dashboard.pmRadarFilter ?? [];
  const setPmRadarFilter = props.setPmRadarFilter ?? dashboard.setPmRadarFilter ?? (() => {});
  const handleFilterToggle = props.handleFilterToggle ?? dashboard.handleFilterToggle ?? ((prev, val) => prev);
  const onSelectRow = props.onSelectRow ?? dashboard.onSelectRow ?? (() => {});
  const onClickItem = props.onClickItem ?? dashboard.onClickItem ?? dashboard.setSelectedProduct;
  const onDeleteRow = props.onDeleteRow ?? dashboard.onDeleteRow ?? dashboard.handleDelete;
  const onPmRadarFilterClick = props.onPmRadarFilterClick ?? dashboard.onPmRadarFilterClick ?? (() => {});
  const onEventResolutionFilterClick = props.onEventResolutionFilterClick ?? dashboard.onEventResolutionFilterClick ?? (() => {});
  const onEventFilterClick = props.onEventFilterClick ?? dashboard.onEventFilterClick ?? (() => {});
  const onFrcBodFilterClick = props.onFrcBodFilterClick ?? dashboard.onFrcBodFilterClick ?? (() => {});
  const onOpenQuickTraspaso = props.onOpenQuickTraspaso ?? dashboard.onOpenQuickTraspaso ?? (() => {});
  const onOpenWhatsApp = props.onOpenWhatsApp ?? dashboard.onOpenWhatsApp;
  const onOpenEmail = props.onOpenEmail ?? dashboard.onOpenEmail;
  const isWhatsAppEnabled = props.isWhatsAppEnabled ?? dashboard.isWhatsAppEnabled ?? false;
  const isEmailEnabled = props.isEmailEnabled ?? dashboard.isEmailEnabled ?? false;
  const frcBodFilter = props.frcBodFilter ?? dashboard.frcBodFilter ?? [];
  const setFrcBodFilter = props.setFrcBodFilter ?? dashboard.setFrcBodFilter ?? (() => {});
  const sheetConfig = props.sheetConfig ?? dashboard.sheetConfig;
  const activeSheet = props.activeSheet ?? dashboard.activeSheet;
  const draggedCol = props.draggedCol ?? dashboard.draggedCol ?? null;
  const setDraggedCol = props.setDraggedCol ?? dashboard.setDraggedCol ?? (() => {});
  const dragOverCol = props.dragOverCol ?? dashboard.dragOverCol ?? null;
  const setDragOverCol = props.setDragOverCol ?? dashboard.setDragOverCol ?? (() => {});
  const handleColumnDrop = props.handleColumnDrop ?? dashboard.handleColumnDrop ?? (() => {});
  const eventFilter = props.eventFilter ?? dashboard.eventFilter ?? [];
  const setEventFilter = props.setEventFilter ?? dashboard.setEventFilter ?? (() => {});
  const eventResolutionFilter = props.eventResolutionFilter ?? dashboard.eventResolutionFilter ?? [];
  const setEventResolutionFilter = props.setEventResolutionFilter ?? dashboard.setEventResolutionFilter ?? (() => {});
  const columnFilters = props.columnFilters ?? dashboard.columnFilters ?? {};
  const setColumnFilters = props.setColumnFilters ?? dashboard.setColumnFilters ?? (() => {});
  const columnOptionsMap = props.columnOptionsMap ?? dashboard.columnOptionsMap ?? {};
  const frcBodValues = props.frcBodValues ?? dashboard.frcBodValues ?? [];
  const frcBodCounts = props.frcBodCounts ?? dashboard.frcBodCounts ?? {};
  const frcBodCol = props.frcBodCol ?? dashboard.frcBodCol ?? '';
  const virtualRows = props.virtualRows ?? dashboard.virtualRows ?? [];
  const paginatedDisplayRows = props.paginatedDisplayRows ?? dashboard.paginatedDisplayRows ?? [];
  const paddingTop = props.paddingTop ?? dashboard.paddingTop ?? 0;
  const paddingBottom = props.paddingBottom ?? dashboard.paddingBottom ?? 0;
  const groupByColumn = props.groupByColumn ?? dashboard.groupByColumn;
  const onSelectGroupRows = props.onSelectGroupRows ?? dashboard.onSelectGroupRows;
  const toggleGroupCollapse = props.toggleGroupCollapse ?? dashboard.toggleGroupCollapse;
  const measureElementRef = props.measureElementRef ?? dashboard.measureElementRef;
  const sortConfig = props.sortConfig ?? dashboard.sortConfig ?? { key: null, direction: null };
  const handleToggleSort = props.handleToggleSort ?? dashboard.handleToggleSort ?? (() => {});
  const tableDensity = props.tableDensity ?? dashboard.tableDensity ?? 'compact';
  const expandAllGroups = props.expandAllGroups ?? dashboard.expandAllGroups;
  const collapseAllGroups = props.collapseAllGroups ?? dashboard.collapseAllGroups;
  const collapsedGroups = props.collapsedGroups ?? dashboard.collapsedGroups;
  const isSticky = sheetConfig?.enableStickyColumns === true;

  // Calculate padding class based on table density
  const paddingClass = useMemo(() => {
    if (tableDensity === 'comfortable') return 'p-4';
    if (tableDensity === 'ultra') return 'p-1.5 text-[11px]';
    return 'p-2.5 text-xs'; // default is 'compact'
  }, [tableDensity]);

  // Dynamic width calculation for '#' column to house group expand/collapse actions comfortably
  const rowColWidth = useMemo(() => {
    const defaultWidth = getColWidth('_row', '#');
    if (groupByColumn && groupByColumn !== 'none') {
      return Math.max(defaultWidth, 68);
    }
    return defaultWidth;
  }, [getColWidth, groupByColumn]);

  return (
    <div className="bg-slate-50 dark:bg-slate-950 md:bg-white md:dark:bg-slate-900 rounded-2xl md:shadow-sm md:border md:border-slate-200 md:dark:border-slate-800 overflow-hidden flex flex-col h-full">
      <div className="flex-1 overflow-auto relative p-2 md:p-0" ref={tableContainerRef}>
        <table className="text-left border-collapse block md:table w-full md:w-[max-content] md:table-fixed" style={{ minWidth: '100%', tableLayout: 'fixed' }}>
          <thead className="hidden md:table-header-group bg-slate-100 dark:bg-slate-700/90 sticky top-0 border-b border-slate-200 dark:border-slate-600/80 text-xs font-bold text-slate-700 dark:text-slate-100 uppercase tracking-wider select-none z-10 shadow-sm">
            <tr>
              <th 
                className={`${paddingClass} text-center bg-slate-100 dark:bg-slate-700/90 border-b border-slate-200 dark:border-slate-600/80 ${
                  isSticky ? 'sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]' : ''
                }`} 
                style={{ width: '48px', minWidth: '48px', maxWidth: '48px', ...(isSticky ? { left: 0 } : {}) }}
              >
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 focus:ring-blue-500 cursor-pointer"
                    checked={filteredItems.length > 0 && selectedRowIds.length === filteredItems.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRowIds(filteredItems.map(i => i._rowIndex as number));
                      } else {
                        setSelectedRowIds([]);
                      }
                    }}
                    title="Seleccionar todos"
                  />
                </div>
              </th>
              <th 
                style={{ width: `${rowColWidth}px`, minWidth: `${rowColWidth}px`, maxWidth: `${rowColWidth}px`, ...(isSticky ? { left: '48px' } : {}) }} 
                className={`${paddingClass} text-center text-slate-600 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/90 border-b border-slate-200 dark:border-slate-600/80 relative group font-bold ${
                  isSticky ? 'sticky left-[48px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]' : ''
                }`}
              >
                {groupByColumn && groupByColumn !== 'none' ? (
                  <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={collapseAllGroups}
                      className="p-1 rounded bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors cursor-pointer shrink-0"
                      title="Contraer todos los grupos"
                    >
                      <svg className="w-3 h-3 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={expandAllGroups}
                      className="p-1 rounded bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors cursor-pointer shrink-0"
                      title="Expandir todos los grupos"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <span>#</span>
                )}
                <div
                  onMouseDown={(e) => handleStartResize('_row', rowColWidth, e)}
                  onDoubleClick={() => handleAutoFitColumn('_row', '#')}
                  className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/80 transition-colors z-20 flex items-center justify-center ${
                    resizingCol?.colId === '_row' ? 'bg-blue-600 w-2.5' : ''
                  }`}
                >
                  <div className="w-[1px] h-3 bg-slate-300 dark:bg-slate-500 group-hover:bg-blue-500"></div>
                </div>
              </th>

              {activeView === 'main' && (
                <th 
                  style={{ width: `${getColWidth('_status', 'Estado / Radar PM')}px`, minWidth: `${getColWidth('_status', 'Estado / Radar PM')}px`, maxWidth: `${getColWidth('_status', 'Estado / Radar PM')}px` }} 
                  className={`${paddingClass} bg-slate-100 dark:bg-slate-700/90 text-slate-700 dark:text-slate-100 border-b border-slate-200 dark:border-slate-600/80 relative group font-bold`}
                >
                  <div className="flex items-center justify-between gap-1 w-full min-w-0 pr-1">
                    <span className="truncate pr-1">Estado / Radar PM</span>
                    <ColumnFilterMenu
                      title="Estado Radar PM"
                      options={[
                        { label: 'En Regla', value: 'en_regla', badgeClass: 'text-emerald-600 dark:text-emerald-400' },
                        { label: 'Drenaje PM', value: 'drainage', badgeClass: 'text-amber-600 dark:text-amber-400' },
                        { label: 'Próximo a Retiro', value: 'upcoming', badgeClass: 'text-rose-600 dark:text-rose-400' },
                        { label: 'Retirar YA / Vencido', value: 'retire_now', badgeClass: 'text-red-600 dark:text-red-400' },
                        { label: 'Canje Proveedor', value: 'canje_proveedor', badgeClass: 'text-indigo-600 dark:text-indigo-400 font-semibold' },
                        { label: 'Merma Directa', value: 'merma_directa', badgeClass: 'text-rose-600 dark:text-rose-400 font-semibold' }
                      ]}
                      selectedValues={pmRadarFilter}
                      onToggle={(val, isMulti) => setPmRadarFilter(prev => handleFilterToggle(prev, val, isMulti))}
                      onClear={() => setPmRadarFilter([])}
                    />
                  </div>
                  <div
                    onMouseDown={(e) => handleStartResize('_status', getColWidth('_status', 'Estado / Radar PM'), e)}
                    onDoubleClick={() => handleAutoFitColumn('_status', 'Estado / Radar PM')}
                    className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/80 transition-colors z-20 flex items-center justify-center ${
                      resizingCol?.colId === '_status' ? 'bg-blue-600 w-2.5' : ''
                    }`}
                  >
                     <div className="w-[1px] h-3 bg-slate-300 dark:bg-slate-500 group-hover:bg-blue-500"></div>
                  </div>
                </th>
              )}

              {activeView === 'events' && (
                <th 
                  style={{ width: `${getColWidth('_res_status', 'Estado Gestión')}px`, minWidth: `${getColWidth('_res_status', 'Estado Gestión')}px`, maxWidth: `${getColWidth('_res_status', 'Estado Gestión')}px` }} 
                  className={`${paddingClass} bg-slate-100 dark:bg-slate-700/90 text-slate-700 dark:text-slate-100 border-b border-slate-200 dark:border-slate-600/80 relative group font-bold`}
                >
                  <div className="truncate pr-2">Estado Gestión</div>
                  <div
                    onMouseDown={(e) => handleStartResize('_res_status', getColWidth('_res_status', 'Estado Gestión'), e)}
                    onDoubleClick={() => handleAutoFitColumn('_res_status', 'Estado Gestión')}
                    className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/80 transition-colors z-20 flex items-center justify-center ${
                      resizingCol?.colId === '_res_status' ? 'bg-blue-600 w-2.5' : ''
                    }`}
                  >
                    <div className="w-[1px] h-3 bg-slate-300 dark:bg-slate-500 group-hover:bg-blue-500"></div>
                  </div>
                </th>
              )}

              {visibleHeaders.map((header, idx) => {
                const colSchema = sheetConfig.schema?.[activeSheet?.title || '']?.[header];
                const width = getColWidth(header, header, colSchema?.type);
                const isResizingThis = resizingCol?.colId === header;
                const isDraggingThis = draggedCol === header;
                const isDropTarget = dragOverCol === header && draggedCol !== header;
                
                const isEventCol = /^frc(_|\s)?even/i.test(header.trim()) || findColumnBySemantic(headers, 'tipo_evento') === header;
                const isTraspasoCol = /traspaso/i.test(header) || findColumnBySemantic(headers, 'n_traspaso') === header;
                const isBodCol = header === frcBodCol || /^frc(_|\s)?bod/i.test(header.trim()) || findColumnBySemantic(headers, 'frc_bod') === header || /bodega/i.test(header.trim());

                const alignRight = idx > visibleHeaders.length - 3;

                return (
                  <th 
                    key={header} 
                    style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                    className={`${paddingClass} bg-slate-100 dark:bg-slate-700/90 text-slate-700 dark:text-slate-100 border-b border-slate-200 dark:border-slate-600/80 relative group transition-all cursor-grab active:cursor-grabbing hover:bg-slate-200/90 dark:hover:bg-slate-600/90 dark:hover:text-white select-none ${
                      isDraggingThis ? 'opacity-40 scale-[0.98]' : ''
                    } ${
                      isDropTarget ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/50 dark:bg-blue-950/50 shadow-inner' : ''
                    }`}
                    draggable={true}
                    onDragStart={(e) => {
                      setDraggedCol(header);
                      e.dataTransfer.setData('text/plain', header);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverCol !== header) {
                        setDragOverCol(header);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverCol === header) {
                        setDragOverCol(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedHeader = e.dataTransfer.getData('text/plain');
                      setDraggedCol(null);
                      setDragOverCol(null);
                      if (droppedHeader) {
                        handleColumnDrop(header, droppedHeader);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedCol(null);
                      setDragOverCol(null);
                    }}
                    title="Mantén presionado y arrastra para reordenar columna"
                  >
                    <div className="flex items-center justify-between gap-1 w-full min-w-0 pr-1">
                      <div 
                        className="flex items-center gap-1 min-w-0 truncate cursor-pointer flex-1"
                        onClick={() => handleToggleSort(header)}
                        title={`Click para ordenar por ${header} (${sortConfig.column === header ? (sortConfig.direction === 'asc' ? 'Ascendente ➔ Descendente' : 'Descendente ➔ Quitar') : 'Ascendente'})`}
                      >
                        <GripVertical className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 group-hover:text-blue-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="truncate font-bold tracking-tight">{header}</span>
                        {sortConfig.column === header && (
                          <span className="shrink-0 text-blue-600 dark:text-blue-400 font-bold text-xs ml-0.5">
                            {sortConfig.direction === 'asc' ? '▲' : '▼'}
                          </span>
                        )}
                        {colSchema?.isKey && (
                          <span className="text-[9px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-1 py-0.2 rounded font-mono font-bold shrink-0">
                            ID
                          </span>
                        )}
                        {colSchema?.type === 'ref' && (
                          <span className="text-[9px] bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-1 py-0.2 rounded font-mono shrink-0">
                            REF
                          </span>
                        )}
                      </div>

                      {isEventCol ? (
                        <ColumnFilterMenu
                          title="Incidencias"
                          options={(Object.keys(EVENT_CATEGORIES) as EventCategory[]).map(cat => ({
                            label: EVENT_CATEGORIES[cat].name,
                            value: cat,
                            badgeClass: EVENT_CATEGORIES[cat].badgeText
                          }))}
                          selectedValues={eventFilter}
                          onToggle={(val, isMulti) => setEventFilter(prev => handleFilterToggle(prev, val, isMulti))}
                          onClear={() => setEventFilter([])}
                          alignRight={alignRight}
                        />
                      ) : isBodCol && frcBodValues.length > 0 ? (
                        <ColumnFilterMenu
                          title="Bodegas (FRC_BOD)"
                          options={frcBodValues.map(bod => ({
                            label: `${bod} (${frcBodCounts[bod] || 0})`,
                            value: bod,
                            badgeClass: 'text-sky-600 dark:text-sky-400 font-bold'
                          }))}
                          selectedValues={frcBodFilter}
                          onToggle={(val, isMulti) => setFrcBodFilter(prev => handleFilterToggle(prev, val, isMulti))}
                          onClear={() => setFrcBodFilter([])}
                          alignRight={alignRight}
                        />
                      ) : isTraspasoCol ? (
                        <ColumnFilterMenu
                          title="Traspaso / Estado"
                          options={[
                            { label: '--- Estado ---', value: 'header_status', disabled: true },
                            { label: 'Pendientes', value: 'pending', badgeClass: 'text-amber-600 dark:text-amber-400' },
                            { label: 'Realizados', value: 'completed', badgeClass: 'text-emerald-600 dark:text-emerald-400' },
                            { label: '--- Documentos ---', value: 'header_docs', disabled: true },
                            ...(columnOptionsMap[header] || [])
                          ]}
                          selectedValues={eventResolutionFilter}
                          onToggle={(val, isMulti) => setEventResolutionFilter(prev => handleFilterToggle(prev, val, isMulti))}
                          onClear={() => setEventResolutionFilter([])}
                          alignRight={alignRight}
                        />
                      ) : (
                        <ColumnFilterMenu
                          title={header}
                          options={columnOptionsMap[header] || []}
                          selectedValues={columnFilters[header] || []}
                          onToggle={(val, isMulti) => setColumnFilters(prev => ({
                            ...prev,
                            [header]: handleFilterToggle(prev[header] || [], val, isMulti)
                          }))}
                          onClear={() => setColumnFilters(prev => ({ ...prev, [header]: [] }))}
                          alignRight={alignRight}
                        />
                      )}
                    </div>
                    <div
                      onMouseDown={(e) => handleStartResize(header, width, e)}
                      onDoubleClick={() => handleAutoFitColumn(header, header)}
                      className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400/80 transition-colors z-20 flex items-center justify-center ${
                        isResizingThis ? 'bg-blue-600 w-2.5' : ''
                      }`}
                    >
                      <div className="w-[1px] h-3 bg-slate-300 dark:bg-slate-500 group-hover:bg-blue-500"></div>
                    </div>
                  </th>
                );
              })}

              {/* Fixed Actions Column Header */}
              <th className={`${paddingClass} text-right bg-slate-100 dark:bg-slate-700/90 text-slate-700 dark:text-slate-100 border-b border-slate-200 dark:border-slate-600/80 font-bold ${
                isSticky ? 'sticky right-0 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.03)]' : ''
              }`} style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-700 dark:text-slate-200 block md:table-row-group">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={visibleHeaders.length + (activeView === 'main' || activeView === 'events' ? 4 : 3)} className="p-8 text-center text-slate-400 dark:text-slate-500">
                  No hay datos en esta hoja.
                </td>
              </tr>
            ) : (<>
              {paddingTop > 0 && (
                <tr><td style={{ height: `${paddingTop}px` }} colSpan={visibleHeaders.length + (activeView === 'main' || activeView === 'events' ? 4 : 3)} /></tr>
              )}
              {virtualRows.map((virtualRow) => {
                const rowData = paginatedDisplayRows[virtualRow.index];
                const idx = virtualRow.index;
                if (!rowData) return null;

                // Render group header
                if (rowData.type === 'header') {
                  const isCollapsed = rowData.isCollapsed;
                  const groupItems: InventoryItem[] = rowData.items || [];
                  const groupRowIndexes: number[] = groupItems
                    .map((it) => it._rowIndex)
                    .filter((id): id is number => typeof id === 'number');
                  
                  const isAllGroupSelected = groupRowIndexes.length > 0 && groupRowIndexes.every(id => selectedRowIds.includes(id));
                  const isSomeGroupSelected = groupRowIndexes.some(id => selectedRowIds.includes(id)) && !isAllGroupSelected;

                  return (
                    <tr
                      key={`group-hdr-${rowData.groupKey}-${idx}`}
                      data-index={virtualRow.index}
                      ref={measureElementRef}
                      onClick={() => toggleGroupCollapse?.(rowData.groupKey)}
                      className="bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 cursor-pointer select-none border-y-2 border-slate-200 dark:border-slate-700 transition-colors"
                      title={isCollapsed ? 'Clic para expandir grupo' : 'Clic para contraer grupo'}
                    >
                      <td
                        colSpan={visibleHeaders.length + (activeView === 'main' || activeView === 'events' ? 4 : 3)}
                        className="px-4 py-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                            </div>

                            {/* Group Selection Control */}
                            {groupRowIndexes.length > 0 && (
                              <div 
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-600 hover:border-blue-500 transition-colors shadow-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isAllGroupSelected}
                                  ref={(el) => {
                                    if (el) el.indeterminate = isSomeGroupSelected;
                                  }}
                                  onChange={(e) => {
                                    if (onSelectGroupRows) {
                                      onSelectGroupRows(groupRowIndexes, e.target.checked);
                                    } else {
                                      if (e.target.checked) {
                                        const newSelected = Array.from(new Set([...selectedRowIds, ...groupRowIndexes]));
                                        setSelectedRowIds(newSelected);
                                      } else {
                                        setSelectedRowIds(selectedRowIds.filter(id => !groupRowIndexes.includes(id)));
                                      }
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  title={isAllGroupSelected ? 'Deseleccionar todos los registros de este grupo' : 'Seleccionar todos los registros de este grupo'}
                                />
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                  {isAllGroupSelected 
                                    ? 'Grupo seleccionado' 
                                    : isSomeGroupSelected 
                                    ? `${groupRowIndexes.filter(id => selectedRowIds.includes(id)).length}/${groupRowIndexes.length} selecc.` 
                                    : 'Seleccionar grupo'}
                                </span>
                              </div>
                            )}

                            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                              {groupByColumn}:
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                              {rowData.groupKey}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono font-bold">
                              {rowData.count} {rowData.count === 1 ? 'registro' : 'registros'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                            {isCollapsed ? 'Contraído (clic para ver)' : 'Expandido'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                
                const item = rowData.item;
                return (
                  <InventoryTableRow
                    key={`item-${item._rowIndex || idx}`}
                    item={item}
                    virtualIndex={idx}
                    headers={headers}
                    visibleColumnMeta={visibleColumnMeta}
                    activeView={activeView}
                    isSelected={selectedRowIds.includes(item._rowIndex as number)}
                    frcBodFilter={frcBodFilter}
                    getColWidth={getColWidth}
                    measureElementRef={measureElementRef}
                    onSelectRow={onSelectRow}
                    onClickItem={onClickItem}
                    onDeleteRow={onDeleteRow}
                    onPmRadarFilterClick={onPmRadarFilterClick}
                    onEventResolutionFilterClick={onEventResolutionFilterClick}
                    onEventFilterClick={onEventFilterClick}
                    onFrcBodFilterClick={onFrcBodFilterClick}
                    onOpenQuickTraspaso={onOpenQuickTraspaso}
                    onOpenWhatsApp={onOpenWhatsApp}
                    onOpenEmail={onOpenEmail}
                    isWhatsAppEnabled={isWhatsAppEnabled}
                    isEmailEnabled={isEmailEnabled}
                    isStickyEnabled={isSticky}
                    tableDensity={tableDensity}
                  />
                );
              })}
              {paddingBottom > 0 && (
                <tr><td style={{ height: `${paddingBottom}px` }} colSpan={visibleHeaders.length + (activeView === 'main' || activeView === 'events' ? 4 : 3)} /></tr>
              )}
            </>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};
