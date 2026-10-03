import React, { useState, useMemo, useEffect } from 'react';
import { 
  Database, Key, Tag, Edit3, Search, Sparkles, RefreshCw, 
  CheckSquare, Square, X, ChevronRight, Hash, Type, FileText, 
  Eye, EyeOff, Link2, Code2, Info, Lock, ExternalLink, Calendar,
  Clock, Check, SlidersHorizontal, Layers, CheckCircle, AlertTriangle,
  Play, Copy, HelpCircle
} from 'lucide-react';
import { 
  SheetConfig, SpreadsheetMetadata, SheetProperties, 
  ColumnSchema, ColumnType, ColumnBehavior, SheetRecord
} from '../../types';
import { getSheetData } from '../../lib/sheets';
import { 
  evaluateAppSheetFormula, 
  validateFormulaSyntax, 
  evaluateBooleanCondition,
  FormulaEvaluationContext 
} from '../../utils/appSheetFormulaEngine';

interface AppSheetColumnStudioProps {
  metadata: SpreadsheetMetadata | null;
  activeSheet: SheetProperties | null;
  setActiveSheet: (sheet: SheetProperties | null) => void;
  headers: string[];
  setHeaders: (headers: string[]) => void;
  isSchemaLoading: boolean;
  setIsSchemaLoading: (loading: boolean) => void;
  sheetConfig: SheetConfig;
  saveConfig: (newConfig: SheetConfig) => void;
  activeView: string;
  products?: SheetRecord[];
  policies?: SheetRecord[];
  sampleItems?: any[];
}

export const AppSheetColumnStudio: React.FC<AppSheetColumnStudioProps> = ({
  metadata,
  activeSheet,
  setActiveSheet,
  headers,
  setHeaders,
  isSchemaLoading,
  setIsSchemaLoading,
  sheetConfig,
  saveConfig,
  activeView: _activeView,
  products = [],
  policies = [],
  sampleItems = []
}) => {
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  const [editingColumnHeader, setEditingColumnHeader] = useState<string | null>(null);
  const [formulaAssistantCol, setFormulaAssistantCol] = useState<string | null>(null);
  
  // Custom test formula state in the assistant
  const [testFormulaInput, setTestFormulaInput] = useState('');

  // Sample row for live formula testing
  const sampleRow = useMemo(() => {
    if (sampleItems && sampleItems.length > 0) {
      return sampleItems[0];
    }
    // Create a mock sample row from headers
    const mock: Record<string, any> = {};
    headers.forEach(h => {
      if (/sku/i.test(h)) mock[h] = '2000210';
      else if (/mm|mes/i.test(h)) mock[h] = '12';
      else if (/yyyy|a[nñ]o/i.test(h)) mock[h] = '2026';
      else if (/fecha_vc|venc/i.test(h)) mock[h] = '2026-12-31';
      else if (/dias/i.test(h)) mock[h] = '30';
      else if (/cant|stock/i.test(h)) mock[h] = '50';
      else if (/prov|rut/i.test(h)) mock[h] = 'LABORATORIO CHILE';
      else if (/evento/i.test(h)) mock[h] = 'TRANSPORTE';
      else mock[h] = 'Ejemplo';
    });
    return mock;
  }, [sampleItems, headers]);

  // Context for formula evaluation
  const formulaEvalContext: FormulaEvaluationContext = useMemo(() => ({
    row: sampleRow,
    headers,
    tableName: activeSheet?.title || '',
    products,
    policies,
    customAliases: sheetConfig.customAliases
  }), [sampleRow, headers, activeSheet, products, policies, sheetConfig.customAliases]);

  // Available sheets list excluding internal hidden sheets
  const availableSheets = useMemo(() => {
    if (!metadata?.sheets) return [];
    return metadata.sheets.filter(s => !/^_/i.test(s.properties.title || ''));
  }, [metadata]);

  // Filtered sheets based on search
  const filteredSheets = useMemo(() => {
    if (!tableSearchQuery.trim()) return availableSheets;
    const q = tableSearchQuery.toLowerCase().trim();
    return availableSheets.filter(s => s.properties.title.toLowerCase().includes(q));
  }, [availableSheets, tableSearchQuery]);

  // Filtered headers based on column search
  const filteredHeaders = useMemo(() => {
    if (!columnSearchQuery.trim()) return headers;
    const q = columnSearchQuery.toLowerCase().trim();
    return headers.filter(h => {
      const schema = sheetConfig.schema?.[activeSheet?.title || '']?.[h];
      const typeStr = schema?.type || '';
      const formulaStr = schema?.formula || '';
      return (
        h.toLowerCase().includes(q) ||
        typeStr.toLowerCase().includes(q) ||
        formulaStr.toLowerCase().includes(q)
      );
    });
  }, [headers, columnSearchQuery, sheetConfig.schema, activeSheet]);

  // Switch active table and load headers
  const handleSelectTable = async (sheetProp: SheetProperties) => {
    if (activeSheet?.title === sheetProp.title && headers.length > 0) return;
    setActiveSheet(sheetProp);
    setIsSchemaLoading(true);
    setEditingColumnHeader(null);
    setFormulaAssistantCol(null);
    try {
      const rows = await getSheetData(sheetProp.title);
      if (rows && rows.length > 0) {
        setHeaders(rows[0].map(String));
      } else {
        setHeaders([]);
      }
    } catch (err) {
      console.error('[AppSheetStudio] Error al cargar hoja:', err);
      setHeaders([]);
    } finally {
      setIsSchemaLoading(false);
    }
  };

  // Auto-select initial table if none selected
  useEffect(() => {
    if (!activeSheet && availableSheets.length > 0) {
      const preferred = availableSheets.find(s => 
        s.properties.title === sheetConfig.main || /vencimiento/i.test(s.properties.title)
      ) || availableSheets[0];
      if (preferred) {
        handleSelectTable(preferred.properties);
      }
    }
  }, [activeSheet, availableSheets, sheetConfig.main]);

  // Helper to get schema for a column with defaults
  const getColSchema = (header: string): ColumnSchema => {
    if (!activeSheet) {
      return { visible: true, searchable: true, type: 'text', behavior: 'none' };
    }
    const current = sheetConfig.schema?.[activeSheet.title]?.[header];
    if (current) return current;

    const isNaturalKey = /^ID_VC$|^ID_EVENTO$|^ID$|^SKU$/i.test(header.trim());
    const isNaturalDate = /fecha|vencimiento|caducidad|retiro/i.test(header) && !/dias|d[ií]as/i.test(header);
    const isNaturalNum = /dias|d[ií]as|cant|stock|unidades|num/i.test(header);

    return {
      visible: true,
      searchable: true,
      editable: true,
      type: isNaturalDate ? 'date' : isNaturalNum ? 'number' : 'text',
      behavior: isNaturalKey && /^ID_VC$/i.test(header.trim()) ? 'auto_id' : 'none',
      isKey: isNaturalKey,
      isLabel: /descripci[oó]n|nombre|producto/i.test(header),
      options: '',
      formula: '',
      initialValue: '',
      refTable: /sku/i.test(header) ? (sheetConfig.products || '') : ''
    };
  };

  // Update a single property on a column
  const updateColumnProperty = <K extends keyof ColumnSchema>(
    colName: string, 
    key: K, 
    value: ColumnSchema[K]
  ) => {
    if (!activeSheet) return;
    const currentTable = activeSheet.title;
    const currentSchema = getColSchema(colName);
    
    const newSchema = { ...sheetConfig.schema };
    if (!newSchema[currentTable]) newSchema[currentTable] = {};

    // Single Key rule: If marking as key, unmark other columns as isKey
    if (key === 'isKey' && value === true) {
      Object.keys(newSchema[currentTable]).forEach(c => {
        if (c !== colName) {
          newSchema[currentTable][c] = {
            ...newSchema[currentTable][c],
            isKey: false
          };
        }
      });
    }

    // Single Label rule: If marking as label, unmark other columns as isLabel
    if (key === 'isLabel' && value === true) {
      Object.keys(newSchema[currentTable]).forEach(c => {
        if (c !== colName) {
          newSchema[currentTable][c] = {
            ...newSchema[currentTable][c],
            isLabel: false
          };
        }
      });
    }

    newSchema[currentTable][colName] = {
      ...currentSchema,
      [key]: value
    };

    saveConfig({ ...sheetConfig, schema: newSchema });
  };

  // Helper formula suggestions contextual to headers
  const formulaPresets = useMemo(() => {
    const list: Array<{ label: string; formula: string; desc: string; category: string }> = [];
    
    const skuCol = headers.find(h => /sku|c[oó]digo/i.test(h)) || 'SKU';
    const mmCol = headers.find(h => /^mm$/i.test(h.trim()) || /^mes$/i.test(h.trim())) || 'MM';
    const yyyyCol = headers.find(h => /^yyyy$/i.test(h.trim()) || /^a[nñ]o$/i.test(h.trim())) || 'YYYY';
    const provCol = headers.find(h => /proveedor|rut/i.test(h)) || 'RUT_PROVEEDOR';
    const vcCol = headers.find(h => /fecha_vc|vencimiento/i.test(h)) || 'FECHA_VC';
    const diasCol = headers.find(h => /dias_retiro|dias/i.test(h)) || 'DIAS_RETIRO';

    // 1. Unique code (CU_VC)
    list.push({
      category: 'Identificadores',
      label: 'Código Único Concatenado (CU_VC)',
      formula: `=[${skuCol}] & [${yyyyCol}] & [${mmCol}]`,
      desc: 'Genera la clave única de lote/vencimiento a partir de SKU, año y mes.'
    });

    // 2. Dereferencing from Policies
    list.push({
      category: 'Políticas de Canje',
      label: 'Política desde Proveedor / RUT',
      formula: `=[${provCol}].[POLITICA]`,
      desc: 'Trae automáticamente la política de canje acordada con el proveedor.'
    });

    list.push({
      category: 'Políticas de Canje',
      label: 'Días de Retiro desde Proveedor / RUT',
      formula: `=[${provCol}].[DIAS_RETIRO]`,
      desc: 'Trae automáticamente los días de retiro preventivo comercial.'
    });

    // 3. Lookup from Catalog
    list.push({
      category: 'Catálogo Maestro',
      label: 'Descripción desde Catálogo Maestro',
      formula: `=LOOKUP([_THISROW].[${skuCol}], "CATALOGO", "SKU", "DESCRIPCION")`,
      desc: 'Busca el nombre o descripción del producto por su código SKU.'
    });

    list.push({
      category: 'Catálogo Maestro',
      label: 'Proveedor desde Catálogo Maestro',
      formula: `=LOOKUP([_THISROW].[${skuCol}], "CATALOGO", "SKU", "PROVEEDOR")`,
      desc: 'Asocia el proveedor o laboratorio del producto por su SKU.'
    });

    list.push({
      category: 'Catálogo Maestro',
      label: 'Familia / Categoría desde Catálogo',
      formula: `=LOOKUP([_THISROW].[${skuCol}], "CATALOGO", "SKU", "FAMILIA")`,
      desc: 'Categoriza el SKU según el maestro de productos.'
    });

    // 4. Date calculations
    list.push({
      category: 'Fechas & Vencimientos',
      label: 'Fin de Mes de Vencimiento (EOMONTH)',
      formula: `=EOMONTH(DATE([${yyyyCol}], [${mmCol}], 1), 0)`,
      desc: 'Fija automáticamente la fecha de caducidad en el último día del mes.'
    });

    list.push({
      category: 'Fechas & Vencimientos',
      label: 'Fecha de Retiro Preventivo',
      formula: `=[${vcCol}] - [${diasCol}]`,
      desc: 'Resta los días de anticipación de la fecha de vencimiento.'
    });

    // 5. System stamps
    list.push({
      category: 'Sistema',
      label: 'Marca Temporal Actual (NOW)',
      formula: `=NOW()`,
      desc: 'Fecha y hora exacta del registro.'
    });

    list.push({
      category: 'Sistema',
      label: 'Fecha Actual (TODAY)',
      formula: `=TODAY()`,
      desc: 'Fecha del día sin hora.'
    });

    return list;
  }, [headers]);

  // Live test result for formula assistant
  const liveAssistantTestResult = useMemo(() => {
    if (!testFormulaInput || !testFormulaInput.trim()) {
      return null;
    }
    const syntax = validateFormulaSyntax(testFormulaInput, headers);
    const evalResult = evaluateAppSheetFormula(testFormulaInput, formulaEvalContext);
    return {
      syntax,
      evalResult
    };
  }, [testFormulaInput, headers, formulaEvalContext]);

  const currentlyInspectedSchema = editingColumnHeader ? getColSchema(editingColumnHeader) : null;

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row min-h-[650px] overflow-hidden">
      
      {/* ========================================================================= */}
      {/* 📁 PANEL IZQUIERDO: LISTA DE TABLAS (AppSheet Data Sidebar)              */}
      {/* ========================================================================= */}
      <div className="w-full md:w-64 lg:w-72 bg-slate-50/70 dark:bg-slate-900/60 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col shrink-0">
        
        {/* Header Data */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              Data & Tablas
            </span>
          </div>
          <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {availableSheets.length}
          </span>
        </div>

        {/* Search input for tables */}
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar tabla..."
            value={tableSearchQuery}
            onChange={(e) => setTableSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-all"
          />
        </div>

        {/* Tables list */}
        <div className="space-y-1 overflow-y-auto flex-1 max-h-[220px] md:max-h-[520px] pr-1">
          {filteredSheets.map((sheet) => {
            const isSelected = activeSheet?.title === sheet.properties.title;
            const tableSchema = sheetConfig.schema?.[sheet.properties.title] || {};
            const colCount = Object.keys(tableSchema).length;
            const keyCol = Object.keys(tableSchema).find(k => tableSchema[k]?.isKey);

            return (
              <button
                key={sheet.properties.sheetId}
                onClick={() => handleSelectTable(sheet.properties)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between group cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Layers className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-100' : 'text-slate-400 group-hover:text-blue-500'}`} />
                  <span className="truncate">{sheet.properties.title}</span>
                </div>
                
                <div className="flex items-center gap-1.5 shrink-0">
                  {keyCol && !isSelected && (
                    <span title={`Clave: ${keyCol}`}>
                      <Key className="w-3 h-3 text-amber-500" />
                    </span>
                  )}
                  {colCount > 0 && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                      isSelected 
                        ? 'bg-blue-700/60 text-blue-100' 
                        : 'bg-slate-200/80 dark:bg-slate-800 text-slate-500'
                    }`}>
                      {colCount}
                    </span>
                  )}
                  <ChevronRight className={`w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity ${isSelected ? 'text-white' : ''}`} />
                </div>
              </button>
            );
          })}

          {filteredSheets.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-400">
              No se encontraron pestañas coincidentes.
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 PANEL DERECHO: MATRIZ DE COLUMNAS (AppSheet Columns Canvas)           */}
      {/* ========================================================================= */}
      <div className="flex-1 p-5 md:p-6 flex flex-col min-w-0 bg-white dark:bg-slate-900 overflow-x-auto">
        
        {/* Table Canvas Header (Matching AppSheet table banner) */}
        {activeSheet ? (
          <div className="mb-5 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base md:text-lg font-black text-slate-900 dark:text-slate-50">
                    Table: <span className="text-blue-600 dark:text-blue-400 font-mono">{activeSheet.title}</span>
                  </h3>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap font-mono">
                  <span>Source: <strong className="text-slate-700 dark:text-slate-300">LOCAL</strong></span>
                  <span>·</span>
                  <span>Qualifier: <strong className="text-slate-700 dark:text-slate-300">{activeSheet.title}</strong></span>
                  <span>·</span>
                  <span>Data Source: <strong className="text-slate-700 dark:text-slate-300">google</strong></span>
                  <span>·</span>
                  <span>Source Type: <strong className="text-slate-700 dark:text-slate-300">Sheets</strong></span>
                  <span>·</span>
                  <span>Columns: <strong className="text-blue-600 dark:text-blue-400">{headers.length}</strong></span>
                </div>
              </div>

              {/* Action buttons & Column Filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar columnas..."
                    value={columnSearchQuery}
                    onChange={(e) => setColumnSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 w-44 sm:w-56 transition-all"
                  />
                  {columnSearchQuery && (
                    <button
                      onClick={() => setColumnSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleSelectTable(activeSheet)}
                  disabled={isSchemaLoading}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Recargar columnas de la hoja"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSchemaLoading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Recargar</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-slate-400">
            <Layers className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Selecciona una tabla en el panel izquierdo</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Podrás configurar tipos de datos, claves primarias, fórmulas automáticas de de-referenciación y reglas de visibilidad.
            </p>
          </div>
        )}

        {/* Loading Spinner */}
        {isSchemaLoading && (
          <div className="flex-1 flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty Headers Alert */}
        {!isSchemaLoading && activeSheet && headers.length === 0 && (
          <div className="p-8 text-center bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl text-amber-800 dark:text-amber-300 text-xs">
            Esta hoja no contiene encabezados en la fila 1 o está vacía.
          </div>
        )}

        {/* ========================================================================= */}
        {/* 📋 LA GRILLA MAESTRA DE COLUMNAS (AppSheet Column Grid)                  */}
        {/* ========================================================================= */}
        {!isSchemaLoading && activeSheet && headers.length > 0 && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-3 px-3 w-14 text-center">#</th>
                  <th className="py-3 px-3 w-40">NAME</th>
                  <th className="py-3 px-3 w-36">TYPE</th>
                  <th className="py-3 px-2 w-12 text-center" title="Clave Primaria">KEY?</th>
                  <th className="py-3 px-2 w-12 text-center" title="Etiqueta de Visualización">LABEL?</th>
                  <th className="py-3 px-3 min-w-[200px]" title="Cálculo Automático">FORMULA (App Formula)</th>
                  <th className="py-3 px-2 w-14 text-center" title="Visible en Formularios">SHOW?</th>
                  <th className="py-3 px-2 w-14 text-center" title="Editable por el Usuario">EDITABLE?</th>
                  <th className="py-3 px-2 w-14 text-center" title="Campo Requerido">REQUIRED?</th>
                  <th className="py-3 px-3 w-36" title="Valor Inicial al Crear">INITIAL VALUE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-800 dark:text-slate-100">
                {filteredHeaders.map((header, idx) => {
                  const schema = getColSchema(header);
                  const isFormulaPreset = Boolean(schema.formula && schema.formula.trim());
                  const hasSyntaxWarning = isFormulaPreset ? validateFormulaSyntax(schema.formula || '', headers).error : undefined;

                  return (
                    <tr 
                      key={header} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      {/* Row Index + Edit Pencil (AppSheet Pencil Icon) */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[11px] font-mono text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                            {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingColumnHeader(header)}
                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
                            title={`Editar configuración avanzada de ${header}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* NAME */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[130px]" title={header}>{header}</span>
                          {schema.isKey && (
                            <span className="text-[8px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 px-1 py-0.2 rounded font-bold font-mono">
                              KEY
                            </span>
                          )}
                          {schema.isLabel && (
                            <span className="text-[8px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 px-1 py-0.2 rounded font-bold font-mono">
                              LABEL
                            </span>
                          )}
                        </div>
                      </td>

                      {/* TYPE */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <select
                          value={schema.type || 'text'}
                          onChange={(e) => updateColumnProperty(header, 'type', e.target.value as ColumnType)}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="datetime">DateTime</option>
                          <option value="enum">Enum</option>
                          <option value="enumlist">EnumList</option>
                          <option value="ref">Ref (Relación)</option>
                          <option value="longtext">LongText</option>
                          <option value="calculated">Calculated</option>
                        </select>
                      </td>

                      {/* KEY? Checkbox */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updateColumnProperty(header, 'isKey', !schema.isKey)}
                          className="cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-600 transition-colors"
                          title={schema.isKey ? 'Clave primaria activa' : 'Hacer clave primaria'}
                        >
                          {schema.isKey ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* LABEL? Checkbox */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updateColumnProperty(header, 'isLabel', !schema.isLabel)}
                          className="cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-600 transition-colors"
                          title={schema.isLabel ? 'Etiqueta de visualización activa' : 'Hacer etiqueta de visualización'}
                        >
                          {schema.isLabel ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* FORMULA (App Formula) */}
                      <td className="py-2.5 px-3 min-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          <div className={`flex items-center flex-1 bg-slate-50 dark:bg-slate-800/80 border rounded-lg px-2 py-1 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all ${
                            hasSyntaxWarning 
                              ? 'border-amber-300 dark:border-amber-700' 
                              : 'border-slate-200 dark:border-slate-700'
                          }`}>
                            <span className="text-slate-400 font-mono font-bold mr-1.5 select-none">=</span>
                            <input
                              type="text"
                              value={schema.formula || ''}
                              onChange={(e) => updateColumnProperty(header, 'formula', e.target.value)}
                              placeholder="Ej: [RUT].[POLITICA] o [SKU] & [YYYY]"
                              className="w-full bg-transparent text-xs font-mono text-blue-700 dark:text-blue-300 placeholder-slate-400 outline-none"
                            />
                            {isFormulaPreset && (
                              <button
                                type="button"
                                onClick={() => updateColumnProperty(header, 'formula', '')}
                                className="text-slate-300 hover:text-slate-500 p-0.5"
                                title="Borrar fórmula"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Quick Formula Assistant trigger */}
                          <button
                            type="button"
                            onClick={() => {
                              setFormulaAssistantCol(header);
                              setTestFormulaInput(schema.formula || '');
                            }}
                            className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors shrink-0 cursor-pointer"
                            title="Abrir asistente de fórmulas y probador interactivo"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* SHOW? Checkbox */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updateColumnProperty(header, 'visible', schema.visible === false ? true : false)}
                          className="cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 transition-colors"
                          title={schema.visible !== false ? 'Visible' : 'Oculto'}
                        >
                          {schema.visible !== false ? (
                            <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* EDITABLE? Checkbox */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updateColumnProperty(header, 'editable', schema.editable === false ? true : false)}
                          className="cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 transition-colors"
                          title={schema.editable !== false ? 'Editable' : 'Bloqueado'}
                        >
                          {schema.editable !== false ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-amber-500" />
                          )}
                        </button>
                      </td>

                      {/* REQUIRED? Checkbox */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updateColumnProperty(header, 'required', !schema.required)}
                          className="cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 transition-colors"
                          title={schema.required ? 'Obligatorio' : 'Opcional'}
                        >
                          {schema.required ? (
                            <CheckSquare className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* INITIAL VALUE */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <input
                          type="text"
                          value={schema.initialValue || ''}
                          onChange={(e) => updateColumnProperty(header, 'initialValue', e.target.value)}
                          placeholder="Ej: TODAY() o PENDIENTE"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none focus:border-blue-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 🪄 MODAL: ASISTENTE DE FÓRMULAS & PROBADOR INTERACTIVO EN VIVO             */}
      {/* ========================================================================= */}
      {formulaAssistantCol && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  Asistente de Fórmulas para <code className="text-blue-600 dark:text-blue-400 font-mono">[{formulaAssistantCol}]</code>
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setFormulaAssistantCol(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Formula Live Tester Section */}
            <div className="p-4 my-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-slate-600 dark:text-slate-300 tracking-wider flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-blue-600" />
                  Probador en Vivo (Tiempo Real)
                </span>
                <span className="text-[10px] text-slate-400">
                  Evaluado con datos reales
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-slate-400">=</span>
                <input
                  type="text"
                  value={testFormulaInput}
                  onChange={(e) => setTestFormulaInput(e.target.value)}
                  placeholder="Escribe o selecciona una fórmula para probar..."
                  className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-blue-700 dark:text-blue-300 outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    updateColumnProperty(formulaAssistantCol, 'formula', testFormulaInput);
                    setFormulaAssistantCol(null);
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Aplicar
                </button>
              </div>

              {/* Evaluation Result */}
              {liveAssistantTestResult && (
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {liveAssistantTestResult.evalResult.success ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      Resultado:
                    </span>
                    <strong className="font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      {liveAssistantTestResult.evalResult.stringValue || '"" (vacío)'}
                    </strong>
                  </div>

                  {liveAssistantTestResult.syntax.error && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      {liveAssistantTestResult.syntax.error}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Quick Column Insert Chips */}
            <div className="mb-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Insertar Columna con un Clic:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap max-h-16 overflow-y-auto">
                {headers.map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setTestFormulaInput(prev => `${prev}[${h}]`)}
                    className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-slate-700 dark:text-slate-300 hover:text-blue-600 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  >
                    [{h}]
                  </button>
                ))}
              </div>
            </div>

            {/* Presets List */}
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {formulaPresets.map((preset, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setTestFormulaInput(preset.formula);
                  }}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-blue-600">
                      {preset.category}
                    </span>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      Cargar en probador <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                    {preset.label}
                  </h5>
                  <div className="mt-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-blue-700 dark:text-blue-300">
                    {preset.formula}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {preset.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormulaAssistantCol(null)}
                className="px-4 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ✏️ MODAL: DETALLE AVANZADO DE COLUMNA (AppSheet Column Inspector)         */}
      {/* ========================================================================= */}
      {editingColumnHeader && currentlyInspectedSchema && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                    Configuración de Columna: <span className="font-mono text-blue-600">{editingColumnHeader}</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Tabla: {activeSheet?.title}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingColumnHeader(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <div className="space-y-4 overflow-y-auto flex-1 py-4 pr-1">
              
              {/* Display Name / Label */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Etiqueta Visible (Display Name)
                </label>
                <input
                  type="text"
                  value={currentlyInspectedSchema.label || ''}
                  onChange={(e) => updateColumnProperty(editingColumnHeader, 'label', e.target.value)}
                  placeholder={`Ej: ${editingColumnHeader}`}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                />
              </div>

              {/* Type Details */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                  Detalles del Tipo de Dato
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Tipo Base</label>
                    <select
                      value={currentlyInspectedSchema.type || 'text'}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'type', e.target.value as ColumnType)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="text">Text (Texto simple)</option>
                      <option value="number">Number (Número entero o decimal)</option>
                      <option value="date">Date (Fecha YYYY-MM-DD)</option>
                      <option value="datetime">DateTime (Fecha y hora)</option>
                      <option value="enum">Enum (Lista de valores desplegable)</option>
                      <option value="enumlist">EnumList (Selección múltiple)</option>
                      <option value="ref">Ref (Relación con otra tabla)</option>
                      <option value="longtext">LongText (Texto multilínea)</option>
                      <option value="calculated">Calculated (Solo cálculo)</option>
                    </select>
                  </div>

                  {/* Ref Options */}
                  {currentlyInspectedSchema.type === 'ref' && (
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Tabla Relacionada (Ref)</label>
                      <select
                        value={currentlyInspectedSchema.refTable || ''}
                        onChange={(e) => {
                          updateColumnProperty(editingColumnHeader, 'refTable', e.target.value);
                          updateColumnProperty(editingColumnHeader, 'refTargetTable', e.target.value);
                        }}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                      >
                        <option value="">-- Seleccionar Tabla --</option>
                        {availableSheets.map(s => (
                          <option key={s.properties.sheetId} value={s.properties.title}>
                            {s.properties.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Enum Options */}
                  {(currentlyInspectedSchema.type === 'enum' || currentlyInspectedSchema.type === 'enumlist') && (
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Opciones de selección (separadas por comas)
                      </label>
                      <input
                        type="text"
                        value={currentlyInspectedSchema.options || ''}
                        onChange={(e) => updateColumnProperty(editingColumnHeader, 'options', e.target.value)}
                        placeholder="Ej: Pendiente, En Tránsito, Recibido, Rechazado"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Formula & Calculation */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                  Fórmula y Valor Inicial (App Formula)
                </span>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    App Formula (Cálculo Automático)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-slate-400">=</span>
                    <input
                      type="text"
                      value={currentlyInspectedSchema.formula || ''}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'formula', e.target.value)}
                      placeholder="Ej: [RUT_PROVEEDOR].[POLITICA] o [SKU] & [YYYY] & [MM]"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-blue-700 dark:text-blue-300 outline-none focus:border-blue-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Si defines una fórmula, el valor se calcula automáticamente y se deshabilita la edición manual en formularios.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Initial Value (Valor Inicial al Crear Registro)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={currentlyInspectedSchema.initialValue || ''}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'initialValue', e.target.value)}
                      placeholder="Ej: TODAY() o PENDIENTE"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Behavior & Validity */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                  Comportamiento y Reglas Lógicas
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.isKey || false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'isKey', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Key?</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.isLabel || false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'isLabel', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Label?</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.required || false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'required', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Required?</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.editable !== false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'editable', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Editable?</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.visible !== false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'visible', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Show?</span>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.searchable !== false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'searchable', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Searchable</span>
                  </label>
                </div>

                {/* Show_If Rule */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Regla de Visibilidad (Show_If)
                  </label>
                  <input
                    type="text"
                    value={currentlyInspectedSchema.showIfRule || ''}
                    onChange={(e) => updateColumnProperty(editingColumnHeader, 'showIfRule', e.target.value)}
                    placeholder="Ej: [TIPO_EVENTO] = 'TRANSPORTE'"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                  />
                </div>

                {/* Valid_If Rule */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Regla de Validación (Valid_If)
                  </label>
                  <input
                    type="text"
                    value={currentlyInspectedSchema.validIfRule || ''}
                    onChange={(e) => updateColumnProperty(editingColumnHeader, 'validIfRule', e.target.value)}
                    placeholder="Ej: [CANTIDAD] > 0"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                  />
                </div>

                {/* Valid_If Message */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Mensaje de Error si Falla la Validación
                  </label>
                  <input
                    type="text"
                    value={currentlyInspectedSchema.validIfMessage || ''}
                    onChange={(e) => updateColumnProperty(editingColumnHeader, 'validIfMessage', e.target.value)}
                    placeholder="Ej: La cantidad debe ser estrictamente mayor a 0."
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingColumnHeader(null)}
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
