import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Database, Key, Tag, Edit3, Search, Sparkles, RefreshCw, 
  CheckSquare, Square, X, ChevronRight, Hash, Type, FileText, 
  Eye, EyeOff, Link2, Code2, Info, Lock, ExternalLink, Calendar,
  Clock, Check, SlidersHorizontal, Layers, CheckCircle, AlertTriangle,
  Play, Copy, HelpCircle, Plus, QrCode, ScanLine
} from 'lucide-react';
import { 
  SheetConfig, SpreadsheetMetadata, SheetProperties, 
  ColumnSchema, ColumnType, ColumnBehavior, SheetRecord
} from '../../types';
import { getSheetData } from '../../lib/sheets';
import { 
  SAMPLE_HEADERS, 
  SAMPLE_EVENTS_HEADERS, 
  SAMPLE_PRODUCTS, 
  SAMPLE_POLICIES 
} from '../../data/sampleInventory';
import { 
  evaluateAppSheetFormula, 
  validateFormulaSyntax, 
  evaluateBooleanCondition,
  FormulaEvaluationContext 
} from '../../utils/appSheetFormulaEngine';
import { EnumValuesEditor } from './schema/EnumValuesEditor';

interface AppSheetColumnStudioProps {
  metadata: SpreadsheetMetadata | null;
  activeSheet: SheetProperties | null;
  setActiveSheet?: (sheet: SheetProperties | null) => void;
  headers: string[];
  setHeaders?: (headers: string[]) => void;
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
  const [testFormulaInput, setTestFormulaInput] = useState('');
  const [newColumnNameInput, setNewColumnNameInput] = useState('');
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  // Available sheets list excluding internal hidden sheets
  const availableSheets = useMemo(() => {
    if (!metadata?.sheets || metadata.sheets.length === 0) {
      // Default standard sheets if metadata is not yet populated
      return [
        { properties: { sheetId: 1, title: sheetConfig.main || 'Vencimientos_Inventario', hidden: false } },
        { properties: { sheetId: 2, title: sheetConfig.events || 'FRC', hidden: false } },
        { properties: { sheetId: 3, title: sheetConfig.products || 'Catalogo_Productos', hidden: false } },
        { properties: { sheetId: 4, title: sheetConfig.policies || 'Politicas_Canje', hidden: false } }
      ] as any[];
    }
    return metadata.sheets.filter(s => !/^_/i.test(s.properties.title || ''));
  }, [metadata, sheetConfig.main, sheetConfig.events, sheetConfig.products, sheetConfig.policies]);

  // Resolves fallback headers for a given sheet title
  const resolveFallbackHeaders = useCallback((title: string): string[] => {
    if (!title) return [];

    // 1. If table has configured columns in sheetConfig.schema
    if (sheetConfig.schema?.[title]) {
      const schemaKeys = Object.keys(sheetConfig.schema[title]);
      if (schemaKeys.length > 0) return schemaKeys;
    }

    // 2. Active headers if title matches current activeSheet
    if (activeSheet?.title === title && headers.length > 0) {
      return headers;
    }

    // 3. Products / Catalogo
    if (title === sheetConfig.products || /catalogo|product/i.test(title)) {
      if (products && products.length > 0) {
        return Object.keys(products[0]).filter(k => !k.startsWith('_'));
      }
      return Object.keys(SAMPLE_PRODUCTS[0]);
    }

    // 4. Policies / Politicas
    if (title === sheetConfig.policies || /pol[ií]tic|canje/i.test(title)) {
      if (policies && policies.length > 0) {
        return Object.keys(policies[0]).filter(k => !k.startsWith('_'));
      }
      return Object.keys(SAMPLE_POLICIES[0]);
    }

    // 5. Events / FRC
    if (title === sheetConfig.events || /frc|evento|incidenc/i.test(title)) {
      return SAMPLE_EVENTS_HEADERS;
    }

    // 6. Recep Bultos
    if (title === sheetConfig.recepBultos || /bulto/i.test(title)) {
      return ['TIMESTAMP', 'CODIGO_BULTO', 'ESTADO', 'OPERADOR'];
    }

    // 7. Main Vencimientos
    if (title === sheetConfig.main || /vencimiento/i.test(title)) {
      return headers.length > 0 ? headers : SAMPLE_HEADERS;
    }

    return [];
  }, [sheetConfig, activeSheet, headers, products, policies]);

  // Internal reactive selection of table in studio
  const [selectedSheet, setSelectedSheet] = useState<SheetProperties>(() => {
    if (activeSheet) return activeSheet;
    const pref = availableSheets.find(s => 
      s.properties.title === sheetConfig.main || /vencimiento/i.test(s.properties.title)
    ) || availableSheets[0];
    return pref ? pref.properties : { sheetId: 1, title: sheetConfig.main || 'Vencimientos_Inventario', hidden: false };
  });

  // Internal table headers for the currently selected table
  const [tableHeaders, setTableHeaders] = useState<string[]>(() => {
    const initTitle = activeSheet?.title || sheetConfig.main || 'Vencimientos_Inventario';
    const resolved = resolveFallbackHeaders(initTitle);
    if (resolved.length > 0) return resolved;
    if (headers && headers.length > 0) return headers;
    return SAMPLE_HEADERS;
  });

  // Switch active table and load headers with immediate local response
  const handleSelectTable = async (sheetProp: SheetProperties) => {
    setSelectedSheet(sheetProp);
    setEditingColumnHeader(null);
    setFormulaAssistantCol(null);
    setIsAddingColumn(false);
    
    // Notify parent if available
    setActiveSheet?.(sheetProp);

    // 1. Immediately update tableHeaders with fallback/cached/schema headers
    const immediate = resolveFallbackHeaders(sheetProp.title);
    if (immediate.length > 0) {
      setTableHeaders(immediate);
      setHeaders?.(immediate);
    }

    // 2. Fetch live headers from Google Sheets in the background
    setIsSchemaLoading(true);
    try {
      const rows = await getSheetData(sheetProp.title);
      if (rows && rows.length > 0 && Array.isArray(rows[0]) && rows[0].length > 0) {
        const liveHeaders = rows[0].map(String).map(s => s.trim()).filter(Boolean);
        if (liveHeaders.length > 0) {
          setTableHeaders(liveHeaders);
          setHeaders?.(liveHeaders);
        }
      }
    } catch (err) {
      // In demo mode or if offline, the immediate fallback headers are already preserved
      console.warn('[AppSheetStudio] Usando encabezados locales/caché para:', sheetProp.title);
      if (immediate.length > 0) {
        setTableHeaders(immediate);
        setHeaders?.(immediate);
      }
    } finally {
      setIsSchemaLoading(false);
    }
  };

  // Sample row for live formula testing contextual to the selected sheet
  const sampleRow = useMemo(() => {
    const title = selectedSheet.title;
    if (title === sheetConfig.products || /catalogo|product/i.test(title)) {
      if (products && products.length > 0) return products[0];
      return SAMPLE_PRODUCTS[0];
    }
    if (title === sheetConfig.policies || /pol[ií]tic|canje/i.test(title)) {
      if (policies && policies.length > 0) return policies[0];
      return SAMPLE_POLICIES[0];
    }
    if (sampleItems && sampleItems.length > 0) {
      return sampleItems[0];
    }
    // Create a mock sample row from current tableHeaders
    const mock: Record<string, any> = {};
    tableHeaders.forEach(h => {
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
  }, [selectedSheet.title, sheetConfig, products, policies, sampleItems, tableHeaders]);

  // Context for formula evaluation
  const formulaEvalContext: FormulaEvaluationContext = useMemo(() => ({
    row: sampleRow,
    headers: tableHeaders,
    tableName: selectedSheet.title,
    products,
    policies,
    customAliases: sheetConfig.customAliases
  }), [sampleRow, tableHeaders, selectedSheet.title, products, policies, sheetConfig.customAliases]);

  // Filtered sheets based on search
  const filteredSheets = useMemo(() => {
    if (!tableSearchQuery.trim()) return availableSheets;
    const q = tableSearchQuery.toLowerCase().trim();
    return availableSheets.filter(s => s.properties.title.toLowerCase().includes(q));
  }, [availableSheets, tableSearchQuery]);

  // Filtered headers based on column search
  const filteredHeaders = useMemo(() => {
    if (!columnSearchQuery.trim()) return tableHeaders;
    const q = columnSearchQuery.toLowerCase().trim();
    return tableHeaders.filter(h => {
      const schema = sheetConfig.schema?.[selectedSheet.title]?.[h];
      const typeStr = schema?.type || '';
      const formulaStr = schema?.formula || '';
      return (
        h.toLowerCase().includes(q) ||
        typeStr.toLowerCase().includes(q) ||
        formulaStr.toLowerCase().includes(q)
      );
    });
  }, [tableHeaders, columnSearchQuery, sheetConfig.schema, selectedSheet.title]);

  // Helper to get schema for a column with defaults
  const getColSchema = (header: string): ColumnSchema => {
    const currentTable = selectedSheet.title;
    const current = sheetConfig.schema?.[currentTable]?.[header];
    if (current) return current;

    const isNaturalKey = /^ID_VC$|^ID_EVENTO$|^ID$|^SKU$/i.test(header.trim());
    const isNaturalDate = /fecha|vencimiento|caducidad|retiro/i.test(header) && !/dias|d[ií]as/i.test(header);
    const isNaturalNum = /dias|d[ií]as|cant|stock|unidades|num/i.test(header);

    return {
      visible: true,
      searchable: true,
      editable: true,
      required: isNaturalKey,
      scannable: /sku|codigo|c[oó]digo|ean|qr|barcode/i.test(header),
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

  // Table schema metrics summary (AppSheet stats)
  const schemaStats = useMemo(() => {
    let requiredCount = 0;
    let searchableCount = 0;
    let formulaCount = 0;
    let scannableCount = 0;

    tableHeaders.forEach(h => {
      const s = getColSchema(h);
      if (s.required || s.isKey) requiredCount++;
      if (s.searchable !== false) searchableCount++;
      if (s.formula && s.formula.trim()) formulaCount++;
      if (s.scannable) scannableCount++;
    });

    return { requiredCount, searchableCount, formulaCount, scannableCount };
  }, [tableHeaders, sheetConfig.schema, selectedSheet.title]);

  // Update a single property on a column
  const updateColumnProperty = <K extends keyof ColumnSchema>(
    colName: string, 
    key: K, 
    value: ColumnSchema[K]
  ) => {
    const currentTable = selectedSheet.title;
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

  // Add a new column to the current table
  const handleAddNewColumn = () => {
    const trimmed = newColumnNameInput.trim().toUpperCase().replace(/\s+/g, '_');
    if (!trimmed) return;
    if (tableHeaders.includes(trimmed)) {
      alert(`La columna ${trimmed} ya existe en esta tabla.`);
      return;
    }
    const updated = [...tableHeaders, trimmed];
    setTableHeaders(updated);
    setHeaders?.(updated);
    updateColumnProperty(trimmed, 'visible', true);
    setNewColumnNameInput('');
    setIsAddingColumn(false);
  };

  // Helper formula suggestions contextual to tableHeaders
  const formulaPresets = useMemo(() => {
    const list: Array<{ label: string; formula: string; desc: string; category: string }> = [];
    
    const skuCol = tableHeaders.find(h => /sku|c[oó]digo/i.test(h)) || 'SKU';
    const mmCol = tableHeaders.find(h => /^mm$/i.test(h.trim()) || /^mes$/i.test(h.trim())) || 'MM';
    const yyyyCol = tableHeaders.find(h => /^yyyy$/i.test(h.trim()) || /^a[nñ]o$/i.test(h.trim())) || 'YYYY';
    const provCol = tableHeaders.find(h => /proveedor|rut/i.test(h)) || 'RUT_PROVEEDOR';
    const vcCol = tableHeaders.find(h => /fecha_vc|vencimiento/i.test(h)) || 'FECHA_VC';
    const diasCol = tableHeaders.find(h => /dias_retiro|dias/i.test(h)) || 'DIAS_RETIRO';

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

    // 4. Date calculations
    list.push({
      category: 'Fechas & Vencimientos',
      label: 'Fin de Mes de Vencimiento (EOMONTH)',
      formula: `=EOMONTH(DATE([${yyyyCol}], [${mmCol}], 1), 0)`,
      desc: 'Fija automáticamente la fecha de caducidad en el último día del mes.'
    });

    list.push({
      category: 'Fechas & Vencimientos',
      label: 'Fecha de Retiro Preventivo (EOMONTH)',
      formula: `=EOMONTH([${vcCol}], -([${diasCol}]/30))`,
      desc: 'Calcula el fin de mes de retiro según los días de política comercial: EOMONTH([FECHA_VC], -([DIAS_RETIRO]/30)).'
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
  }, [tableHeaders]);

  // Live test result for formula assistant
  const liveAssistantTestResult = useMemo(() => {
    if (!testFormulaInput || !testFormulaInput.trim()) {
      return null;
    }
    const syntax = validateFormulaSyntax(testFormulaInput, tableHeaders);
    const evalResult = evaluateAppSheetFormula(testFormulaInput, formulaEvalContext);
    return {
      syntax,
      evalResult
    };
  }, [testFormulaInput, tableHeaders, formulaEvalContext]);

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
            const isSelected = selectedSheet.title === sheet.properties.title;
            const tableSchema = sheetConfig.schema?.[sheet.properties.title] || {};
            const colCount = Object.keys(tableSchema).length;
            const keyCol = Object.keys(tableSchema).find(k => tableSchema[k]?.isKey);

            return (
              <button
                key={sheet.properties.sheetId || sheet.properties.title}
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
        <div className="mb-5 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base md:text-lg font-black text-slate-900 dark:text-slate-50">
                  Table: <span className="text-blue-600 dark:text-blue-400 font-mono">{selectedSheet.title}</span>
                </h3>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap font-mono">
                <span>Source: <strong className="text-slate-700 dark:text-slate-300">LOCAL</strong></span>
                <span>·</span>
                <span>Qualifier: <strong className="text-slate-700 dark:text-slate-300">{selectedSheet.title}</strong></span>
                <span>·</span>
                <span>Columns: <strong className="text-blue-600 dark:text-blue-400">{tableHeaders.length}</strong></span>
                <span>·</span>
                <span title="Columnas requeridas obligatorias">Required: <strong className="text-rose-600 dark:text-rose-400">{schemaStats.requiredCount}</strong></span>
                <span>·</span>
                <span title="Columnas indexables en el buscador general">Searchable: <strong className="text-indigo-600 dark:text-indigo-400">{schemaStats.searchableCount}</strong></span>
                <span>·</span>
                <span title="Columnas con fórmulas AppSheet activas">Formulas: <strong className="text-purple-600 dark:text-purple-400">{schemaStats.formulaCount}</strong></span>
                <span>·</span>
                <span title="Columnas con escaneo de código de barras / QR">Scan: <strong className="text-emerald-600 dark:text-emerald-400">{schemaStats.scannableCount}</strong></span>
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

              {/* Add Column Button */}
              <button
                type="button"
                onClick={() => setIsAddingColumn(!isAddingColumn)}
                className="px-3 py-1.5 text-xs font-bold bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Agregar nueva columna a la tabla"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nueva Columna</span>
              </button>

              <button
                onClick={() => handleSelectTable(selectedSheet)}
                disabled={isSchemaLoading}
                className="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Recargar columnas de la hoja"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSchemaLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Recargar</span>
              </button>
            </div>
          </div>

          {/* New Column Inline Form */}
          {isAddingColumn && (
            <div className="mt-3 p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center gap-2">
              <input
                type="text"
                value={newColumnNameInput}
                onChange={(e) => setNewColumnNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNewColumn()}
                placeholder="Nombre de la nueva columna (ej. ESTADO_AUDITORIA)..."
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddNewColumn}
                className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => { setIsAddingColumn(false); setNewColumnNameInput(''); }}
                className="px-3 py-1.5 text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Loading Spinner */}
        {isSchemaLoading && (
          <div className="flex-1 flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty Headers Alert */}
        {!isSchemaLoading && tableHeaders.length === 0 && (
          <div className="p-8 text-center bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl text-amber-800 dark:text-amber-300 text-xs">
            Esta hoja no contiene columnas configuradas. Puedes agregar una con el botón "+ Nueva Columna".
          </div>
        )}

        {/* ========================================================================= */}
        {/* 📋 LA GRILLA MAESTRA DE COLUMNAS (AppSheet Column Grid)                  */}
        {/* ========================================================================= */}
        {!isSchemaLoading && tableHeaders.length > 0 && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse min-w-[1120px]">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-3 px-3 w-14 text-center">#</th>
                  <th className="py-3 px-3 w-40">NAME</th>
                  <th className="py-3 px-3 w-36">TYPE</th>
                  <th className="py-3 px-2 w-12 text-center" title="Clave Primaria (Key)">KEY?</th>
                  <th className="py-3 px-2 w-12 text-center" title="Etiqueta de Visualización (Label)">LABEL?</th>
                  <th className="py-3 px-3 min-w-[200px]" title="Cálculo Automático (App Formula)">FORMULA (App Formula)</th>
                  <th className="py-3 px-2 w-12 text-center" title="Visible en Formularios y Vistas">SHOW?</th>
                  <th className="py-3 px-2 w-12 text-center" title="Editable por el Usuario">EDIT?</th>
                  <th className="py-3 px-2 w-14 text-center" title="Campo Requerido / Obligatorio">REQUIRE?</th>
                  <th className="py-3 px-2 w-14 text-center" title="Indexable en el Buscador General de la App">SEARCH?</th>
                  <th className="py-3 px-2 w-12 text-center" title="Habilita Escaneo con Cámara / Pistola de Código de Barras">SCAN?</th>
                  <th className="py-3 px-3 w-36" title="Valor Inicial al Crear Registro">INITIAL VALUE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-800 dark:text-slate-100">
                {filteredHeaders.map((header, idx) => {
                  const schema = getColSchema(header);
                  const isFormulaPreset = Boolean(schema.formula && schema.formula.trim());
                  const hasSyntaxWarning = isFormulaPreset ? validateFormulaSyntax(schema.formula || '', tableHeaders).error : undefined;

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

                      {/* REQUIRE? Checkbox */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updateColumnProperty(header, 'required', !schema.required)}
                          className="cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-600 transition-colors"
                          title={schema.required ? 'Campo obligatorio / requerido' : 'Campo opcional'}
                        >
                          {schema.required ? (
                            <CheckSquare className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* SEARCH? Checkbox (Indexable en buscador general) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updateColumnProperty(header, 'searchable', schema.searchable === false ? true : false)}
                          className="cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors"
                          title={schema.searchable !== false ? 'Indexable en el buscador general de la app' : 'No indexable en el buscador'}
                        >
                          {schema.searchable !== false ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* SCAN? Checkbox (Habilita escáner de código de barras) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updateColumnProperty(header, 'scannable', !schema.scannable)}
                          className="cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-600 transition-colors"
                          title={schema.scannable ? 'Habilitado para escáner / cámara de código de barras' : 'Escáner deshabilitado'}
                        >
                          {schema.scannable ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
                  Evaluado con datos de {selectedSheet.title}
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
                {tableHeaders.map(h => (
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
                    Tabla: {selectedSheet.title}
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
                          <option key={s.properties.sheetId || s.properties.title} value={s.properties.title}>
                            {s.properties.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Enum & EnumList Options Editor */}
                  {(currentlyInspectedSchema.type === 'enum' || currentlyInspectedSchema.type === 'enumlist') && (
                    <div className="sm:col-span-2 pt-1">
                      <EnumValuesEditor
                        options={currentlyInspectedSchema.options || ''}
                        onChange={(newVal) => updateColumnProperty(editingColumnHeader, 'options', newVal)}
                        isEnumList={currentlyInspectedSchema.type === 'enumlist'}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {/* Key? */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:border-blue-400 transition-colors">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.isKey || false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'isKey', e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-amber-500" />
                        <span>Key? (Clave Primaria)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Identificador unívoco del registro en la tabla</p>
                    </div>
                  </label>

                  {/* Label? */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:border-blue-400 transition-colors">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.isLabel || false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'isLabel', e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Label? (Etiqueta Display)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Texto representativo en búsquedas y referencias</p>
                    </div>
                  </label>

                  {/* Required? */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:border-blue-400 transition-colors">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.required || false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'required', e.target.checked)}
                      className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        <span>Require? (Obligatorio)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">No se puede guardar el registro si el campo está vacío</p>
                    </div>
                  </label>

                  {/* Editable? */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:border-blue-400 transition-colors">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.editable !== false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'editable', e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                        <span>Editable?</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Permite modificación manual (desactivar para sólo lectura)</p>
                    </div>
                  </label>

                  {/* Show? */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:border-blue-400 transition-colors">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.visible !== false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'visible', e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Show? (Visible)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Muestra la columna en formularios y vistas</p>
                    </div>
                  </label>

                  {/* Searchable */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:border-blue-400 transition-colors">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.searchable !== false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'searchable', e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Searchable (Buscador)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Indexa y busca coincidencias en la barra de búsqueda general</p>
                    </div>
                  </label>

                  {/* Scannable */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:border-blue-400 transition-colors">
                    <input
                      type="checkbox"
                      checked={currentlyInspectedSchema.scannable || false}
                      onChange={(e) => updateColumnProperty(editingColumnHeader, 'scannable', e.target.checked)}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <ScanLine className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Scan? (Código de Barras)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Habilita lectura rápida por cámara o lector óptico</p>
                    </div>
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
