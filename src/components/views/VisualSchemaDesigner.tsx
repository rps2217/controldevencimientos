import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Database, Key, Link2, Trash2, Plus, HelpCircle, 
  ChevronRight, Sparkles, X, Info, Settings, ToggleLeft, Layers, Tag
} from 'lucide-react';
import { SheetConfig, SpreadsheetMetadata, ColumnSchema, ColumnType } from '../../types';

interface VisualSchemaDesignerProps {
  sheetConfig: SheetConfig;
  saveConfig: (newConfig: SheetConfig) => void;
  metadata: SpreadsheetMetadata | null;
  activeSheetTitle?: string;
  activeSheetHeaders?: string[];
}

interface TableNode {
  title: string;
  columns: {
    name: string;
    schema?: ColumnSchema;
  }[];
}

interface Relationship {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
}

export const VisualSchemaDesigner: React.FC<VisualSchemaDesignerProps> = ({
  sheetConfig,
  saveConfig,
  metadata,
  activeSheetTitle,
  activeSheetHeaders = []
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredRelation, setHoveredRelation] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<{ table: string; column: string } | null>(null);
  const [isCreatingRelation, setIsCreatingRelation] = useState(false);
  
  // State for the new relation builder form
  const [fromTable, setFromTable] = useState('');
  const [fromColumn, setFromColumn] = useState('');
  const [toTable, setToTable] = useState('');

  // Re-draw triggers on resize
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);
    handleResize();

    return () => resizeObserver.disconnect();
  }, []);

  // 1. Compile all tables and their columns based on sheetConfig schema, activeSheet, and known mappings
  const tables = useMemo<TableNode[]>(() => {
    const list: TableNode[] = [];

    // Helper to collect all unique sheet names
    const allSheetNames = new Set<string>();
    if (metadata?.sheets) {
      metadata.sheets.forEach(s => {
        if (s.properties.title && !/^_/i.test(s.properties.title)) {
          allSheetNames.add(s.properties.title);
        }
      });
    }
    // Add sheetConfig known tables
    if (sheetConfig.main) allSheetNames.add(sheetConfig.main);
    if (sheetConfig.events) allSheetNames.add(sheetConfig.events);
    if (sheetConfig.products) allSheetNames.add(sheetConfig.products);
    if (sheetConfig.policies) allSheetNames.add(sheetConfig.policies);
    // Add schema tables
    if (sheetConfig.schema) {
      Object.keys(sheetConfig.schema).forEach(k => allSheetNames.add(k));
    }

    allSheetNames.forEach(sheetTitle => {
      const columnsMap = new Map<string, ColumnSchema>();
      
      // Load pre-existing columns from schema config
      const configuredCols = sheetConfig.schema?.[sheetTitle] || {};
      Object.entries(configuredCols).forEach(([colName, colSchema]) => {
        columnsMap.set(colName, colSchema as ColumnSchema);
      });

      // Merge active headers if this is the active sheet
      if (sheetTitle === activeSheetTitle && activeSheetHeaders.length > 0) {
        activeSheetHeaders.forEach(header => {
          if (!columnsMap.has(header)) {
            // Provide default schema stub
            columnsMap.set(header, {
              visible: true,
              searchable: true,
              type: 'text',
              behavior: 'none'
            });
          }
        });
      }

      // Default heuristics for known tables to ensure we have columns to display even if empty
      if (columnsMap.size === 0) {
        if (sheetTitle === sheetConfig.products || /product/i.test(sheetTitle)) {
          columnsMap.set('SKU', { visible: true, searchable: true, type: 'text', behavior: 'none', isKey: true });
          columnsMap.set('DESCRIPCION', { visible: true, searchable: true, type: 'text', behavior: 'none', isLabel: true });
          columnsMap.set('PROVEEDOR', { visible: true, searchable: true, type: 'text', behavior: 'none' });
          columnsMap.set('FAMILIA', { visible: true, searchable: true, type: 'text', behavior: 'none' });
        } else if (sheetTitle === sheetConfig.policies || /pol[ií]t/i.test(sheetTitle)) {
          columnsMap.set('COD_POLITICA', { visible: true, searchable: true, type: 'text', behavior: 'none', isKey: true });
          columnsMap.set('DESCRIPCION', { visible: true, searchable: true, type: 'text', behavior: 'none', isLabel: true });
          columnsMap.set('DIAS_RETIRO', { visible: true, searchable: true, type: 'number', behavior: 'none' });
        } else if (sheetTitle === sheetConfig.main || /vencimiento/i.test(sheetTitle)) {
          columnsMap.set('ID_VC', { visible: true, searchable: true, type: 'text', behavior: 'auto_id', isKey: true });
          columnsMap.set('SKU', { visible: true, searchable: true, type: 'ref', behavior: 'none', refTable: sheetConfig.products || 'PRODUCTOS' });
          columnsMap.set('LOTE', { visible: true, searchable: true, type: 'text', behavior: 'none' });
          columnsMap.set('FECHA_VC', { visible: true, searchable: true, type: 'date', behavior: 'calc_fecha_vc' });
        } else if (sheetTitle === sheetConfig.events || /incidenc|event/i.test(sheetTitle)) {
          columnsMap.set('ID_EVENTO', { visible: true, searchable: true, type: 'text', behavior: 'auto_id', isKey: true });
          columnsMap.set('SKU', { visible: true, searchable: true, type: 'ref', behavior: 'none', refTable: sheetConfig.products || 'PRODUCTOS' });
          columnsMap.set('CANTIDAD', { visible: true, searchable: true, type: 'number', behavior: 'none' });
          columnsMap.set('FECHA_REGISTRO', { visible: true, searchable: true, type: 'date', behavior: 'none' });
        } else {
          // Generic fallback columns for visual placeholder
          columnsMap.set('ID', { visible: true, searchable: true, type: 'text', behavior: 'auto_id', isKey: true });
          columnsMap.set('SKU', { visible: true, searchable: true, type: 'ref', behavior: 'none', refTable: sheetConfig.products || 'PRODUCTOS' });
          columnsMap.set('OBSERVACIONES', { visible: true, searchable: true, type: 'text', behavior: 'none' });
        }
      }

      list.push({
        title: sheetTitle,
        columns: Array.from(columnsMap.entries()).map(([name, schema]) => ({ name, schema }))
      });
    });

    return list;
  }, [sheetConfig, metadata, activeSheetTitle, activeSheetHeaders]);

  // Calculate unique relationships list
  const relationships = useMemo<Relationship[]>(() => {
    const list: Relationship[] = [];
    tables.forEach(t => {
      t.columns.forEach(col => {
        if (col.schema?.type === 'ref' && col.schema.refTable) {
          list.push({
            id: `${t.title}-${col.name}-${col.schema.refTable}`,
            fromTable: t.title,
            fromColumn: col.name,
            toTable: col.schema.refTable
          });
        }
      });
    });
    return list;
  }, [tables]);

  interface RelationshipProposal {
    fromTable: string;
    fromColumn: string;
    toTable: string;
    reason: string;
  }

  // Calculate smart relationship proposals
  const proposals = useMemo<RelationshipProposal[]>(() => {
    const list: RelationshipProposal[] = [];
    
    tables.forEach(t1 => {
      t1.columns.forEach(col => {
        // Skip if already a reference or key
        if (col.schema?.type === 'ref' || col.schema?.isKey) return;
        
        // Find matching target tables
        tables.forEach(t2 => {
          if (t1.title === t2.title) return;
          
          const colNameLower = col.name.toLowerCase().trim();
          const t2Lower = t2.title.toLowerCase().trim();
          
          // Match criteria 1: Column name matches target table name (e.g. col is "POLITICA" and table is "POLITICAS")
          const isNameMatch = t2Lower.includes(colNameLower) || colNameLower.includes(t2Lower) || 
            (colNameLower === 'sku' && (t2Lower.includes('product') || t2Lower.includes('catalogo')));
            
          if (isNameMatch) {
            // Find if t2 has a key column
            const targetKey = t2.columns.find(c => c.schema?.isKey)?.name || 'SKU';
            list.push({
              fromTable: t1.title,
              fromColumn: col.name,
              toTable: t2.title,
              reason: `La columna '${col.name}' coincide semánticamente con la tabla maestra '${t2.title}' (${targetKey})`
            });
          }
        });
      });
    });
    
    return list;
  }, [tables]);

  // Handle applying a smart proposal
  const handleApplyProposal = (prop: RelationshipProposal) => {
    const newSchema = { ...sheetConfig.schema };
    if (!newSchema[prop.fromTable]) newSchema[prop.fromTable] = {};
    
    const existingColSchema = newSchema[prop.fromTable][prop.fromColumn] || {
      visible: true,
      searchable: true,
      type: 'text',
      behavior: 'none'
    };

    newSchema[prop.fromTable][prop.fromColumn] = {
      ...existingColSchema,
      type: 'ref',
      refTable: prop.toTable
    };

    saveConfig({
      ...sheetConfig,
      schema: newSchema
    });
  };

  // Handle updating generic column properties in schema
  const handleUpdateColumnProperty = (table: string, column: string, updates: Partial<ColumnSchema>) => {
    const newSchema = { ...sheetConfig.schema };
    if (!newSchema[table]) newSchema[table] = {};
    
    const existing = newSchema[table][column] || {
      visible: true,
      searchable: true,
      type: 'text',
      behavior: 'none'
    };

    // If making this key, unset isKey for other columns in the same table
    if (updates.isKey) {
      Object.keys(newSchema[table]).forEach(colName => {
        if (colName !== column) {
          newSchema[table][colName] = {
            ...newSchema[table][colName],
            isKey: false
          };
        }
      });
    }

    // If making this label, unset isLabel for other columns in the same table
    if (updates.isLabel) {
      Object.keys(newSchema[table]).forEach(colName => {
        if (colName !== column) {
          newSchema[table][colName] = {
            ...newSchema[table][colName],
            isLabel: false
          };
        }
      });
    }

    newSchema[table][column] = {
      ...existing,
      ...updates
    } as ColumnSchema;

    saveConfig({
      ...sheetConfig,
      schema: newSchema
    });
  };

  // Handle adding new relation
  const handleAddRelationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromTable || !fromColumn || !toTable) return;

    const newSchema = { ...sheetConfig.schema };
    if (!newSchema[fromTable]) newSchema[fromTable] = {};
    
    const existingColSchema = newSchema[fromTable][fromColumn] || {
      visible: true,
      searchable: true,
      type: 'text',
      behavior: 'none'
    };

    newSchema[fromTable][fromColumn] = {
      ...existingColSchema,
      type: 'ref',
      refTable: toTable
    };

    saveConfig({
      ...sheetConfig,
      schema: newSchema
    });

    // Reset form
    setFromColumn('');
    setIsCreatingRelation(false);
  };

  // Handle removing a relation
  const handleRemoveRelation = (rel: Relationship) => {
    const newSchema = { ...sheetConfig.schema };
    if (newSchema[rel.fromTable] && newSchema[rel.fromTable][rel.fromColumn]) {
      const colSchema = newSchema[rel.fromTable][rel.fromColumn];
      newSchema[rel.fromTable][rel.fromColumn] = {
        ...colSchema,
        type: 'text', // Convert back to text
        refTable: undefined
      };
      
      saveConfig({
        ...sheetConfig,
        schema: newSchema
      });
    }
  };

  // Helper to render type-specific column badges / icons
  const renderTypeIcon = (type?: ColumnType, isKey?: boolean) => {
    if (isKey) return <span title="Llave Primaria"><Key className="w-3 h-3 text-amber-500" /></span>;
    if (type === 'ref') return <span title="Relación / Referencia"><Link2 className="w-3 h-3 text-blue-500" /></span>;
    return <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 scale-90">{type || 'text'}</span>;
  };

  // Coordinates solver for drawing line between nodes
  const [lineCoords, setLineCoords] = useState<{ id: string; x1: number; y1: number; x2: number; y2: number; label: string }[]>([]);

  useEffect(() => {
    const coords: typeof lineCoords = [];
    if (!containerRef.current) return;

    const parentRect = containerRef.current.getBoundingClientRect();

    relationships.forEach(rel => {
      // Find DOM elements for connection points
      const fromEl = document.getElementById(`col-item-${rel.fromTable}-${rel.fromColumn}`);
      // Find the key column or label of the target table, or just the target table card itself
      let toEl = document.getElementById(`col-item-${rel.toTable}-SKU`); // Proactive SKU match
      if (!toEl) {
        // Find target table's first key column
        const targetTableNode = tables.find(t => t.title === rel.toTable);
        const keyCol = targetTableNode?.columns.find(c => c.schema?.isKey)?.name;
        if (keyCol) {
          toEl = document.getElementById(`col-item-${rel.toTable}-${keyCol}`);
        }
      }
      if (!toEl) {
        toEl = document.getElementById(`table-node-card-${rel.toTable}`);
      }

      if (fromEl && toEl) {
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();

        const x1 = fromRect.right - parentRect.left;
        const y1 = fromRect.top + fromRect.height / 2 - parentRect.top;
        const x2 = toRect.left - parentRect.left;
        const y2 = toRect.top + toRect.height / 2 - parentRect.top;

        coords.push({
          id: rel.id,
          x1,
          y1,
          x2,
          y2,
          label: `${rel.fromColumn} ➔ ${rel.toTable}`
        });
      }
    });

    setLineCoords(coords);
  }, [relationships, dimensions, tables]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full max-w-7xl mx-auto p-4 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800 transition-all min-h-[650px]">
      
      {/* Visual Canvas (Left Column) */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex justify-between items-center bg-white dark:bg-slate-900 px-6 py-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <div>
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              Diseñador de Relaciones del Modelo
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Visualiza y mapea enlaces entre tablas. Las relaciones habilitan autocompletado interactivo (De-referenciación).
            </p>
          </div>
          
          <button
            onClick={() => {
              // Pre-fill defaults
              setFromTable(tables[0]?.title || '');
              const fromColList = tables[0]?.columns || [];
              setFromColumn(fromColList[0]?.name || '');
              setToTable(tables[1]?.title || '');
              setIsCreatingRelation(true);
            }}
            className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-200 dark:shadow-none flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Relación</span>
          </button>
        </div>

        {/* Diagram Area */}
        <div 
          ref={containerRef}
          className="relative flex-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 min-h-[480px] overflow-hidden select-none"
        >
          {/* Interactive Connecting SVG Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
            <defs>
              <marker
                id="designer-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
              </marker>
              <marker
                id="designer-arrow-hover"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
              </marker>
            </defs>
            {lineCoords.map(line => {
              const isHovered = hoveredRelation === line.id;
              return (
                <g key={line.id}>
                  {/* Invisible broad stroke for easier hovering */}
                  <path
                    d={`M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2 - 4} ${line.y2}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                    className="cursor-pointer pointer-events-auto"
                    onMouseEnter={() => setHoveredRelation(line.id)}
                    onMouseLeave={() => setHoveredRelation(null)}
                  />
                  {/* Glowing background line on hover */}
                  <path
                    d={`M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2 - 4} ${line.y2}`}
                    fill="none"
                    stroke={isHovered ? "#3b82f6" : "#cbd5e1"}
                    strokeOpacity={isHovered ? "0.4" : "0.15"}
                    strokeWidth={isHovered ? "8" : "3"}
                    className="transition-all duration-150"
                  />
                  {/* Core connecting line */}
                  <path
                    d={`M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2 - 6} ${line.y2}`}
                    fill="none"
                    stroke={isHovered ? "#2563eb" : "#3b82f6"}
                    strokeWidth="2"
                    markerEnd={isHovered ? "url(#designer-arrow-hover)" : "url(#designer-arrow)"}
                    strokeDasharray={isHovered ? "4 2" : undefined}
                    className="transition-all duration-150"
                  />
                  {/* Pulse circle on hover */}
                  {isHovered && (
                    <circle
                      cx={(line.x1 + line.x2) / 2}
                      cy={(line.y1 + line.y2) / 2}
                      r="4"
                      fill="#2563eb"
                      className="animate-ping"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Cards Layout Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-20">
            {tables.map(table => {
              const isLinkedToHovered = hoveredRelation && (
                hoveredRelation.startsWith(`${table.title}-`) || 
                hoveredRelation.endsWith(`-${table.title}`)
              );
              const fadeClass = hoveredRelation && !isLinkedToHovered ? 'opacity-40 scale-[0.98]' : '';

              return (
                <div
                  key={table.title}
                  id={`table-node-card-${table.title}`}
                  className={`bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 p-4 shadow-xs transition-all duration-300 ${fadeClass}`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2 mb-3">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 truncate">
                      <Database className="w-3.5 h-3.5 text-blue-500" />
                      {table.title}
                    </span>
                    {activeSheetTitle === table.title && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50 font-bold uppercase shrink-0 scale-90">
                        Activo
                      </span>
                    )}
                  </div>

                  {/* Columns List */}
                  <div className="space-y-1.5">
                    {table.columns.map(col => {
                      const isHoveredCol = hoveredRelation && (
                        hoveredRelation === `${table.title}-${col.name}-${col.schema?.refTable}` ||
                        (col.schema?.type === 'ref' && hoveredRelation.endsWith(`-${col.schema.refTable}`) && hoveredRelation.startsWith(`${table.title}-${col.name}`))
                      );
                      const isSelected = selectedColumn && selectedColumn.table === table.title && selectedColumn.column === col.name;

                      return (
                        <div
                          key={col.name}
                          id={`col-item-${table.title}-${col.name}`}
                          onClick={() => setSelectedColumn({ table: table.title, column: col.name })}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
                            isSelected
                              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 text-blue-950 dark:text-blue-100 shadow-xs ring-2 ring-blue-500/10'
                              : isHoveredCol 
                                ? 'bg-blue-100 dark:bg-blue-950/80 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200 shadow-xs'
                                : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-200 dark:hover:border-slate-600'
                          }`}
                        >
                          <span className="truncate pr-2">{col.name}</span>
                          <div className="shrink-0 flex items-center gap-1.5">
                            {renderTypeIcon(col.schema?.type, col.schema?.isKey)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Relational Settings Panel (Right Column) */}
      <div className="w-full lg:w-80 flex flex-col gap-4">
        {/* Helper Context Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-xs shrink-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            ¿Qué es una Relación (Ref)?
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3.5">
            Una relación permite que una columna herede o consulte datos de otra hoja utilizando una clave común (como el SKU). 
          </p>
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1"></span>
              <p>🔑 Las <strong>llaves</strong> identifican de forma única cada fila en una tabla maestra.</p>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1"></span>
              <p>🔗 Las <strong>referencias</strong> vinculan las filas operativas al catálogo maestro.</p>
            </div>
          </div>
        </div>

        {/* Smart Proposals Card */}
        <div className="bg-gradient-to-br from-indigo-50/50 to-blue-50/30 dark:from-indigo-950/20 dark:to-blue-950/10 rounded-2xl border border-indigo-200/60 dark:border-indigo-900/50 p-5 shadow-xs shrink-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
            Propuestas Inteligentes
          </h3>
          {proposals.length > 0 ? (
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
              {proposals.map((prop, idx) => (
                <div 
                  key={idx} 
                  className="bg-white dark:bg-slate-900 border border-indigo-100/80 dark:border-indigo-950 rounded-xl p-2.5 shadow-2xs text-[11px]"
                >
                  <p className="font-bold text-slate-700 dark:text-slate-200">
                    {prop.fromTable}.{prop.fromColumn} ➔ {prop.toTable}
                  </p>
                  <p className="text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">
                    {prop.reason}
                  </p>
                  <button
                    onClick={() => handleApplyProposal(prop)}
                    className="mt-2 w-full py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 font-bold rounded-lg transition-colors cursor-pointer text-center"
                  >
                    Vincular Tablas
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic leading-relaxed">
              ✨ ¡Excelente! Todas las columnas semánticas lógicas (como SKU) ya se encuentran correctamente vinculadas a sus respectivas tablas maestras.
            </p>
          )}
        </div>

        {/* Selected Column / Editor Panel */}
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <Settings className="w-4 h-4 text-slate-500" />
              Editor de Columna
            </h3>

            {selectedColumn ? (() => {
                const colSchema = sheetConfig.schema?.[selectedColumn.table]?.[selectedColumn.column] || {
                  visible: true,
                  searchable: true,
                  type: 'text',
                  behavior: 'none'
                };

                return (
                  <div className="space-y-4 animate-in fade-in duration-150 text-xs">
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Pestaña / Tabla</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5 block">{selectedColumn.table}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Columna</span>
                        <span className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5 block">{selectedColumn.column}</span>
                      </div>
                    </div>

                    {/* Property: Data Type */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1.5">Tipo de Dato</label>
                      <select
                        value={colSchema.type || 'text'}
                        onChange={(e) => {
                          const newType = e.target.value as any;
                          const updates: any = { type: newType };
                          if (newType !== 'ref') {
                            updates.refTable = undefined;
                          } else {
                            const other = tables.find(t => t.title !== selectedColumn.table);
                            updates.refTable = other?.title || '';
                          }
                          handleUpdateColumnProperty(selectedColumn.table, selectedColumn.column, updates);
                        }}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="text">Texto Corto (text)</option>
                        <option value="longtext">Texto Largo (longtext)</option>
                        <option value="number">Número (number)</option>
                        <option value="date">Fecha (date)</option>
                        <option value="datetime">Fecha y Hora (datetime)</option>
                        <option value="ref">Referencia / Enlace (ref)</option>
                        <option value="enum">Lista de Opciones (enum)</option>
                        <option value="calculated">Fórmula Calculada (calculated)</option>
                      </select>
                    </div>

                    {/* Property: Reference Table (Only visible when type is ref) */}
                    {colSchema.type === 'ref' && (
                      <div className="bg-blue-50/30 dark:bg-blue-950/25 border border-blue-100/50 dark:border-blue-900/40 rounded-xl p-3 space-y-2">
                        <label className="block text-[10px] font-bold text-blue-900 dark:text-blue-300 uppercase">Tabla de Destino</label>
                        <select
                          value={colSchema.refTable || ''}
                          onChange={(e) => {
                            handleUpdateColumnProperty(selectedColumn.table, selectedColumn.column, { refTable: e.target.value });
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/80 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-900 dark:text-blue-200 outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">-- Seleccionar Tabla Destino --</option>
                          {tables
                            .filter(t => t.title !== selectedColumn.table)
                            .map(t => (
                              <option key={t.title} value={t.title}>{t.title}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
                          La columna actuará como un selector dinámico apuntando a la tabla seleccionada.
                        </p>
                      </div>
                    )}

                    {/* Property: Behavior */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1.5">Comportamiento Especial</label>
                      <select
                        value={colSchema.behavior || 'none'}
                        onChange={(e) => {
                          handleUpdateColumnProperty(selectedColumn.table, selectedColumn.column, { behavior: e.target.value as any });
                        }}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-300 outline-none"
                      >
                        <option value="none">Ninguno (Estándar)</option>
                        <option value="auto_id">Autogenerar ID Secuencial (auto_id)</option>
                        <option value="calc_fecha_vc">Cálculo de Alerta Vencimiento (calc_fecha_vc)</option>
                        <option value="calc_retiro">Cálculo de Fecha de Retiro (calc_retiro)</option>
                        <option value="sku_lookup">Búsqueda Automática en Maestro (sku_lookup)</option>
                      </select>
                    </div>

                    {/* Boolean Toggles Grid */}
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5 space-y-3">
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Configuración de Atributos</label>
                      
                      <div className="grid grid-cols-2 gap-2.5">
                        {/* isKey */}
                        <button
                          onClick={() => handleUpdateColumnProperty(selectedColumn.table, selectedColumn.column, { isKey: !colSchema.isKey })}
                          className={`flex items-center gap-2 px-3 py-2 border rounded-xl font-bold cursor-pointer transition-colors text-left ${
                            colSchema.isKey 
                              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300 shadow-2xs' 
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <Key className="w-3.5 h-3.5 text-amber-500" />
                          <div className="leading-tight">
                            <span className="block text-[10px]">Llave Primaria</span>
                            <span className="text-[9px] font-normal opacity-80">{colSchema.isKey ? 'Activo' : 'Inactivo'}</span>
                          </div>
                        </button>

                        {/* isLabel */}
                        <button
                          onClick={() => handleUpdateColumnProperty(selectedColumn.table, selectedColumn.column, { isLabel: !colSchema.isLabel })}
                          className={`flex items-center gap-2 px-3 py-2 border rounded-xl font-bold cursor-pointer transition-colors text-left ${
                            colSchema.isLabel 
                              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 shadow-2xs' 
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <Tag className="w-3.5 h-3.5 text-emerald-500" />
                          <div className="leading-tight">
                            <span className="block text-[10px]">Etiqueta Vista</span>
                            <span className="text-[9px] font-normal opacity-80">{colSchema.isLabel ? 'Activo' : 'Inactivo'}</span>
                          </div>
                        </button>
                      </div>

                      <div className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                        {/* visible */}
                        <label className="flex items-center justify-between cursor-pointer py-1">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Mostrar columna en tablas</span>
                          <input
                            type="checkbox"
                            checked={colSchema.visible !== false}
                            onChange={(e) => handleUpdateColumnProperty(selectedColumn.table, selectedColumn.column, { visible: e.target.checked })}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                          />
                        </label>

                        {/* searchable */}
                        <label className="flex items-center justify-between cursor-pointer py-1">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Habilitar buscador / filtros</span>
                          <input
                            type="checkbox"
                            checked={colSchema.searchable !== false}
                            onChange={(e) => handleUpdateColumnProperty(selectedColumn.table, selectedColumn.column, { searchable: e.target.checked })}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Active reference deletion indicator */}
                    {colSchema.type === 'ref' && colSchema.refTable && (
                      <button
                        onClick={() => {
                          handleRemoveRelation({
                            id: '',
                            fromTable: selectedColumn.table,
                            fromColumn: selectedColumn.column,
                            toTable: colSchema.refTable || ''
                          });
                          setSelectedColumn(null);
                        }}
                        className="w-full py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-bold rounded-xl transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 border border-rose-200/40 dark:border-rose-900/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Desvincular Relación</span>
                      </button>
                    )}
                  </div>
                );
              })() : (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                <HelpCircle className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                <p className="text-xs">Haz clic en cualquier columna del mapa para editar sus relaciones o propiedades.</p>
              </div>
            )}
          </div>

          {/* Quick Active Relations Counter */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-4 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
            <span>Relaciones Totales:</span>
            <span className="font-black text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
              {relationships.length}
            </span>
          </div>
        </div>
      </div>

      {/* Slide-over or overlay Modal for Creating Relationship */}
      {isCreatingRelation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-500" />
                Construir Enlace / Relación
              </span>
              <button
                onClick={() => setIsCreatingRelation(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddRelationSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Tabla de Origen</label>
                <select
                  value={fromTable}
                  onChange={(e) => {
                    const table = e.target.value;
                    setFromTable(table);
                    // Match first column of that table
                    const cols = tables.find(t => t.title === table)?.columns || [];
                    setFromColumn(cols[0]?.name || '');
                  }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none"
                >
                  {tables.map(t => (
                    <option key={t.title} value={t.title}>{t.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Columna de Origen</label>
                <select
                  value={fromColumn}
                  onChange={(e) => setFromColumn(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none"
                >
                  {(tables.find(t => t.title === fromTable)?.columns || []).map(col => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center py-2">
                <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-600 rotate-90 sm:rotate-0" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Tabla de Referencia (RefTarget)</label>
                <select
                  value={toTable}
                  onChange={(e) => setToTable(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none"
                >
                  {tables
                    .filter(t => t.title !== fromTable)
                    .map(t => (
                      <option key={t.title} value={t.title}>{t.title}</option>
                    ))}
                </select>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                  La columna de origen actuará como referencia cruzada que apunta a la llave ID del destino.
                </span>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreatingRelation(false)}
                  className="flex-1 px-4 py-2.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md shadow-blue-200 dark:shadow-none cursor-pointer"
                >
                  Guardar Relación
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
