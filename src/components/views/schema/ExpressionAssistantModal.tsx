import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Sparkles, CheckCircle, AlertTriangle, Play, X, Key, Tag, 
  Link2, Search, ExternalLink, ChevronDown, ChevronUp, Pin, 
  HelpCircle, Copy, Maximize2, Minimize2, Check, BookOpen, 
  Layers, Database, ArrowRight, MessageSquare
} from 'lucide-react';
import { SheetConfig, SpreadsheetMetadata, SheetProperties, ColumnSchema, SheetRecord } from '../../../types';
import { 
  validateFormulaDetailed, 
  evaluateAppSheetFormula, 
  FormulaEvaluationContext,
  DetailedFormulaValidation
} from '../../../utils/appSheetFormulaEngine';

interface ExpressionAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnHeader: string;
  columnType?: string;
  tableName: string;
  initialFormula: string;
  onSave: (formula: string) => void;
  availableSheets: SheetProperties[];
  sheetConfig: SheetConfig;
  tableHeaders: string[];
  products?: SheetRecord[];
  policies?: SheetRecord[];
  sampleItems?: any[];
}

export const ExpressionAssistantModal: React.FC<ExpressionAssistantModalProps> = ({
  isOpen,
  onClose,
  columnHeader,
  columnType = 'Text',
  tableName,
  initialFormula = '',
  onSave,
  availableSheets,
  sheetConfig,
  tableHeaders,
  products = [],
  policies = [],
  sampleItems = []
}) => {
  const [formula, setFormula] = useState<string>(initialFormula || '');
  const [activeTab, setActiveTab] = useState<'explorer' | 'examples'>('explorer');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [columnFilterQuery, setColumnFilterQuery] = useState<string>('');
  const [selectedFunctionCategory, setSelectedFunctionCategory] = useState<string>('Todas');
  const [functionSearchQuery, setFunctionSearchQuery] = useState<string>('');
  
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync formula on open
  useEffect(() => {
    if (isOpen) {
      setFormula(initialFormula || '');
    }
  }, [isOpen, initialFormula]);

  // Context for live evaluation on sample row
  const sampleRow = useMemo(() => {
    if (sampleItems && sampleItems.length > 0) {
      return sampleItems[0];
    }
    const dummy: Record<string, string> = {};
    tableHeaders.forEach(h => {
      dummy[h] = /fecha|vencimiento/i.test(h) 
        ? '2026-12-31' 
        : /dias/i.test(h) 
          ? '90' 
          : /sku/i.test(h) 
            ? '2000210218' 
            : /cant/i.test(h) 
              ? '5' 
              : 'EJEMPLO';
    });
    return dummy;
  }, [sampleItems, tableHeaders]);

  const evalContext: FormulaEvaluationContext = useMemo(() => ({
    row: sampleRow,
    headers: tableHeaders,
    tableName,
    products,
    policies,
    sheetConfig
  }), [sampleRow, tableHeaders, tableName, products, policies, sheetConfig]);

  // Real-time detailed validation
  const validation: DetailedFormulaValidation = useMemo(() => {
    return validateFormulaDetailed(formula, tableHeaders, evalContext);
  }, [formula, tableHeaders, evalContext]);

  // Insert token at cursor position
  const insertToken = (token: string) => {
    if (!textareaRef.current) {
      setFormula(prev => prev ? `${prev} ${token}` : token);
      return;
    }

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formula;
    const newText = text.substring(0, start) + token + text.substring(end);
    setFormula(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  // Toggle table accordion
  const toggleTableAccordion = (tblTitle: string) => {
    setExpandedTables(prev => ({
      ...prev,
      [tblTitle]: !prev[tblTitle]
    }));
  };

  // Resolve headers/schema for any table
  const getTableColumns = (tblTitle: string): { name: string; type: string; isKey: boolean; isLabel: boolean; isRef: boolean }[] => {
    const tableSchema = sheetConfig.schema?.[tblTitle] || {};
    let cols: string[] = Object.keys(tableSchema);
    
    if (cols.length === 0) {
      if (tblTitle === tableName) {
        cols = tableHeaders;
      } else if (tblTitle === sheetConfig.products || /catalogo|product/i.test(tblTitle)) {
        cols = products.length > 0 ? Object.keys(products[0]).filter(k => !k.startsWith('_')) : ['SKU', 'DESCRIPCION', 'PROVEEDOR', 'POLITICA', 'DIAS_RETIRO'];
      } else if (tblTitle === sheetConfig.policies || /pol[ií]tic/i.test(tblTitle)) {
        cols = policies.length > 0 ? Object.keys(policies[0]).filter(k => !k.startsWith('_')) : ['COD_POLITICA', 'DESCRIPCION', 'DIAS_RETIRO', 'ACCION'];
      } else if (tblTitle === sheetConfig.events || /frc|evento/i.test(tblTitle)) {
        cols = ['ID_EVENTO', 'FECHA_REGISTRO', 'SKU', 'TIPO_EVENTO', 'CANTIDAD', 'OBSERVACION'];
      } else {
        cols = ['ID', 'NOMBRE', 'FECHA', 'ESTADO'];
      }
    }

    return cols.map(c => {
      const colDef = tableSchema[c];
      const isKey = Boolean(colDef?.isKey || /^ID_VC$|^ID$|^SKU$/i.test(c));
      const isLabel = Boolean(colDef?.isLabel || /descripci[oó]n|nombre/i.test(c));
      const isRef = colDef?.type === 'ref' || /rut_proveedor|sku/i.test(c);
      const type = colDef?.type 
        ? colDef.type.toUpperCase() 
        : /fecha/i.test(c) 
          ? 'Date' 
          : /cant|dias|stock|precio/i.test(c) 
            ? 'Number' 
            : /mm|yyyy|estado/i.test(c) 
              ? 'Enum' 
              : 'Text';

      return {
        name: c,
        type,
        isKey,
        isLabel,
        isRef
      };
    });
  };

  // Other available tables (excluding active table)
  const otherTables = useMemo(() => {
    return availableSheets.filter(s => {
      const t = (s as any).properties?.title || s.title;
      return t !== tableName;
    });
  }, [availableSheets, tableName]);

  // Standard Examples / Function Library
  const FUNCTION_EXAMPLES = [
    {
      category: 'Fechas & Vencimientos',
      name: 'EOMONTH',
      syntax: 'EOMONTH(date, offsetMonths)',
      example: 'EOMONTH([FECHA_VC], -([DIAS RETIRO_VC]/30))',
      desc: 'Calcula el último día del mes retrocediendo o avanzando N meses.'
    },
    {
      category: 'Fechas & Vencimientos',
      name: 'DATE',
      syntax: 'DATE(year, month, day)',
      example: 'DATE([YYYY], [MM], 1)',
      desc: 'Construye un objeto de fecha válido a partir de año, mes y día.'
    },
    {
      category: 'Fechas & Vencimientos',
      name: 'TODAY / NOW',
      syntax: 'TODAY() o NOW()',
      example: 'TODAY()',
      desc: 'Obtiene la fecha u hora actual del sistema.'
    },
    {
      category: 'Búsqueda & Catálogo',
      name: 'LOOKUP',
      syntax: 'LOOKUP(valor_buscado, "TABLA", "COL_BUSQUEDA", "COL_RETORNO")',
      example: 'LOOKUP([SKU], "CATALOGO", "SKU", "DESCRIPCION")',
      desc: 'Busca una fila en otra tabla y retorna el valor de la columna especificada.'
    },
    {
      category: 'De-referenciación (Relaciones Ref)',
      name: 'De-reference [Ref].[Prop]',
      syntax: '[COLUMNA_REF].[COLUMNA_DESTINO]',
      example: '[RUT_PROVEEDOR].[POLITICA]',
      desc: 'Accede a los datos del registro maestro vinculado por una columna tipo Ref.'
    },
    {
      category: 'Números & Matemáticas',
      name: 'NUMBER',
      syntax: 'NUMBER(valor)',
      example: 'NUMBER([DIAS RETIRO_VC]/30)',
      desc: 'Convierte cualquier valor a su equivalente entero (Integer). Si está vacío devuelve blanco (""), y si no es reconocible devuelve 0.'
    },
    {
      category: 'Números & Matemáticas',
      name: 'DECIMAL',
      syntax: 'DECIMAL(valor)',
      example: 'DECIMAL([PRECIO])',
      desc: 'Convierte un valor o texto a número decimal. Devuelve blanco ("") si está vacío o 0 si no es numérico.'
    },
    {
      category: 'Números & Matemáticas',
      name: 'ROUND',
      syntax: 'ROUND(valor, decimales)',
      example: 'ROUND([CANTIDAD] / 12, 2)',
      desc: 'Redondea un número a la cantidad de decimales indicada.'
    },
    {
      category: 'Números & Matemáticas',
      name: 'ABS',
      syntax: 'ABS(valor)',
      example: 'ABS([DIFERENCIA])',
      desc: 'Devuelve el valor absoluto de un número o expresión.'
    },
    {
      category: 'Texto & Concatenación',
      name: 'TEXT',
      syntax: 'TEXT(valor)',
      example: 'TEXT([SKU])',
      desc: 'Convierte cualquier valor a cadena de texto.'
    },
    {
      category: 'Texto & Concatenación',
      name: 'Concatenación (&)',
      syntax: '[COL1] & [COL2] & [COL3]',
      example: '[SKU] & [YYYY] & [MM]',
      desc: 'Une textos o columnas en una sola cadena (ej. Código Único CU_VC).'
    },
    {
      category: 'Lógica & Condicionales',
      name: 'IF',
      syntax: 'IF(condicion, valor_verdadero, valor_falso)',
      example: 'IF([CANTIDAD] > 0, "CON DIFERENCIA", "CUADRADO")',
      desc: 'Evalúa una condición lógica y devuelve un resultado u otro.'
    },
    {
      category: 'Lógica & Condicionales',
      name: 'IFS',
      syntax: 'IFS(cond1, val1, cond2, val2, ... [TRUE, val_default])',
      example: 'IFS([CANTIDAD] <= 0, "SIN STOCK", [CANTIDAD] < 10, "STOCK CRÍTICO", TRUE, "EN REGLA")',
      desc: 'Evalúa múltiples condiciones en cascada y devuelve el valor correspondiente a la primera que sea verdadera.'
    },
    {
      category: 'Lógica & Condicionales',
      name: 'SWITCH',
      syntax: 'SWITCH(expresion, caso1, res1, caso2, res2, ... [default])',
      example: 'SWITCH([ESTADO], "V", "VENCIDO", "R", "RETIRO", "OTRO")',
      desc: 'Compara una expresión contra una lista de casos y devuelve el resultado coincidente.'
    },
    {
      category: 'Lógica & Condicionales',
      name: 'ISBLANK / ISNOTBLANK',
      syntax: 'ISBLANK(valor) o ISNOTBLANK(valor)',
      example: 'IF(ISBLANK([LOTE]), "SIN LOTE", [LOTE])',
      desc: 'Comprueba si una celda o columna está vacía o si contiene algún dato.'
    },
    {
      category: 'Lógica & Condicionales',
      name: 'AND / OR / NOT',
      syntax: 'AND(cond1, cond2) | OR(cond1, cond2) | NOT(cond)',
      example: 'AND([CANTIDAD] > 0, [DIAS_RETIRO] <= 30)',
      desc: 'Operadores lógicos para combinar múltiples condiciones.'
    },
    {
      category: 'Texto & Concatenación',
      name: 'CONCATENATE',
      syntax: 'CONCATENATE(texto1, texto2, ...)',
      example: 'CONCATENATE([SKU], " - ", [DESCRIPCION])',
      desc: 'Concatena múltiples columnas o cadenas de texto en una sola.'
    },
    {
      category: 'Texto & Concatenación',
      name: 'TRIM / UPPER / LOWER',
      syntax: 'TRIM(texto) | UPPER(texto) | LOWER(texto)',
      example: 'UPPER(TRIM([PROVEEDOR]))',
      desc: 'Limpia espacios en blanco al inicio y final, y transforma a mayúsculas o minúsculas.'
    },
    {
      category: 'Números & Matemáticas',
      name: 'SUM / AVERAGE / COUNT',
      syntax: 'SUM(num1, num2) | AVERAGE(...) | COUNT(...)',
      example: 'SUM([CANTIDAD], [CANTIDAD_EXTRA])',
      desc: 'Operaciones numéricas de agregación y conteo.'
    },
    {
      category: 'Números & Matemáticas',
      name: 'MIN / MAX',
      syntax: 'MIN(val1, val2) | MAX(val1, val2)',
      example: 'MAX(0, [CANTIDAD] - [STOCK_MINIMO])',
      desc: 'Devuelve el menor o mayor valor de una lista de argumentos.'
    },
    {
      category: 'Fechas & Vencimientos',
      name: 'YEAR / MONTH / DAY',
      syntax: 'YEAR(date) | MONTH(date) | DAY(date)',
      example: 'YEAR([FECHA_VC])',
      desc: 'Extrae el año, mes o día como número entero a partir de una fecha.'
    },
    {
      category: 'Búsqueda & Catálogo',
      name: 'INDEX',
      syntax: 'INDEX(lista_o_valores, posicion)',
      example: 'INDEX(SPLIT([CODIGO], "-"), 1)',
      desc: 'Obtiene el elemento en la posición especificada de una lista o texto dividido.'
    }
  ];

  const functionCategories = [
    'Todas',
    'Fechas & Vencimientos',
    'Lógica & Condicionales',
    'Texto & Concatenación',
    'Números & Matemáticas',
    'Búsqueda & Catálogo',
    'De-referenciación (Relaciones Ref)'
  ];

  const filteredFunctions = useMemo(() => {
    return FUNCTION_EXAMPLES.filter(fn => {
      const matchCat = selectedFunctionCategory === 'Todas' || fn.category === selectedFunctionCategory;
      if (!matchCat) return false;
      if (!functionSearchQuery.trim()) return true;
      const q = functionSearchQuery.toLowerCase();
      return fn.name.toLowerCase().includes(q) || fn.syntax.toLowerCase().includes(q) || fn.desc.toLowerCase().includes(q);
    });
  }, [FUNCTION_EXAMPLES, selectedFunctionCategory, functionSearchQuery]);

  const filteredActiveColumns = useMemo(() => {
    const all = getTableColumns(tableName);
    if (!columnFilterQuery.trim()) return all;
    const q = columnFilterQuery.toLowerCase();
    return all.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [tableName, columnFilterQuery, tableHeaders, sheetConfig.schema]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full flex flex-col transition-all duration-200 ${
        isFullScreen ? 'h-[96vh] max-w-[96vw]' : 'max-w-4xl max-h-[90vh]'
      }`}>
        
        {/* ========================================================================= */}
        {/* 1. MODAL HEADER (Matching AppSheet Expression Assistant)                 */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
              Expression Assistant
            </h3>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              title={isFullScreen ? 'Restaurar tamaño' : 'Pantalla completa'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Subtitle / Target Column Info Banner */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2">
            <span>App Formula for column <strong className="font-mono text-slate-900 dark:text-slate-100">{columnHeader}</strong></span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
              ({columnType})
            </span>
          </div>

          <span className="text-[11px] font-mono text-slate-400">
            Tabla: <strong>{tableName}</strong>
          </span>
        </div>

        {/* ========================================================================= */}
        {/* 2. FORMULA CODE EDITOR BOX                                               */}
        {/* ========================================================================= */}
        <div className="p-4 sm:p-5 flex flex-col space-y-2 shrink-0">
          <div className="relative rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all shadow-inner">
            <textarea
              ref={textareaRef}
              rows={3}
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="Ej: EOMONTH([FECHA_VC], -([DIAS RETIRO_VC]/30)) o [SKU] & [YYYY] & [MM]"
              className="w-full p-3 font-mono text-xs text-slate-900 dark:text-slate-100 bg-transparent outline-none resize-y leading-relaxed"
              spellCheck={false}
            />
          </div>

          {/* Validation Status & Live Test Bar */}
          <div className="flex items-center justify-between gap-3 text-xs pt-1 flex-wrap">
            
            {/* Semantic Validation Status Indicator */}
            <div className="flex items-center gap-2 min-w-0">
              {validation.status === 'valid' ? (
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center shrink-0 border border-emerald-300 dark:border-emerald-800">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span className="truncate">{validation.message}</span>
                  {validation.evaluatedSample && (
                    <span className="hidden sm:inline font-mono font-normal text-slate-500 text-[11px]">
                      (Muestra: <strong className="text-slate-800 dark:text-slate-200">{validation.evaluatedSample}</strong>)
                    </span>
                  )}
                </div>
              ) : validation.status === 'invalid' ? (
                <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-bold">
                  <div className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0 border border-rose-300 dark:border-rose-800">
                    <X className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] leading-tight line-clamp-1" title={validation.message}>
                    {validation.message}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                  <span>Ingresa una fórmula para validar sintaxis y variables.</span>
                </div>
              )}
            </div>

            {/* Test Action Button (AppSheet "Test ↗") */}
            <button
              type="button"
              onClick={() => setShowTestModal(!showTestModal)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 font-bold flex items-center gap-1 text-xs cursor-pointer ml-auto"
            >
              <span>Test</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Collapsible Sample Rows Live Tester Panel */}
          {showTestModal && (
            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/80 rounded-xl space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-300">
                <span className="flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-blue-600" />
                  Resultado de Evaluación con Fila de Muestra:
                </span>
                <span className="text-[10px] text-blue-700/80 font-mono">
                  {tableName}
                </span>
              </div>
              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between">
                <span className="text-xs font-mono text-slate-500">Valor computado:</span>
                <span className="text-xs font-mono font-black text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-1 rounded border border-blue-200 dark:border-blue-800">
                  {validation.evaluatedSample || '(vacío o nulo)'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. TABS: DATA EXPLORER vs EXAMPLES                                       */}
        {/* ========================================================================= */}
        <div className="flex items-center px-5 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('explorer')}
            className={`py-2 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'explorer'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Data Explorer (Columnas & Tablas)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('examples')}
            className={`py-2 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'examples'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Examples & Funciones</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 4. TAB 1: DATA EXPLORER (Exact AppSheet Layout from Screenshot)           */}
        {/* ========================================================================= */}
        {activeTab === 'explorer' && (
          <div className="flex-1 p-4 sm:p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Left Column: Active Table Card (Light blue header / container) */}
            <div className="bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-3 sm:p-4 flex flex-col">
              
              {/* Active Table Header */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-blue-200/80 dark:border-blue-800/60">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-blue-950 dark:text-blue-200">
                    {tableName}
                  </span>
                </div>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300">
                  Tabla Activa
                </span>
              </div>

              {/* Column Filter Input */}
              <div className="relative mb-2 shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={columnFilterQuery}
                  onChange={(e) => setColumnFilterQuery(e.target.value)}
                  placeholder="Filtrar columnas de la tabla..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500 shadow-2xs"
                />
              </div>

              {/* Active Table Column List */}
              <div className="space-y-1.5 overflow-y-auto max-h-[280px] pr-1">
                {/* Special _RowNumber field */}
                {(!columnFilterQuery.trim() || '_rownumber'.includes(columnFilterQuery.toLowerCase())) && (
                  <button
                    type="button"
                    onClick={() => insertToken('[_RowNumber]')}
                    className="w-full text-left p-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-300 transition-all flex items-center justify-between group cursor-pointer shadow-2xs"
                  >
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600">
                      _RowNumber
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Number</span>
                  </button>
                )}

                {/* Table Schema Columns */}
                {filteredActiveColumns.map((col) => (
                  <button
                    key={col.name}
                    type="button"
                    onClick={() => insertToken(`[${col.name}]`)}
                    className="w-full text-left p-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-300 transition-all flex items-center justify-between group cursor-pointer shadow-2xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 truncate">
                        {col.name}
                      </span>
                      {col.isKey && (
                        <span title="Clave Primaria">
                          <Key className="w-3 h-3 text-amber-500 shrink-0" />
                        </span>
                      )}
                      {col.isLabel && (
                        <span title="Etiqueta">
                          <Tag className="w-3 h-3 text-emerald-500 shrink-0" />
                        </span>
                      )}
                      {col.isRef && (
                        <span title="Referencia Relacional (Ref)">
                          <Link2 className="w-3 h-3 text-indigo-500 shrink-0" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                      {col.type}
                    </span>
                  </button>
                ))}
                {filteredActiveColumns.length === 0 && (
                  <div className="text-center py-4 text-xs text-slate-400">
                    No se encontraron columnas para "{columnFilterQuery}"
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Other Tables Accordions */}
            <div className="space-y-2.5 overflow-y-auto max-h-[380px] pr-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1">
                Otras Tablas Disponibles:
              </span>

              {otherTables.map((sheet) => {
                const title = (sheet as any).properties?.title || sheet.title;
                const isExpanded = Boolean(expandedTables[title]);
                const cols = getTableColumns(title);

                return (
                  <div
                    key={title}
                    className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xs transition-all"
                  >
                    {/* Accordion Header */}
                    <div 
                      onClick={() => toggleTableAccordion(title)}
                      className="p-3 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Database className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-bold uppercase font-mono text-slate-700 dark:text-slate-200">
                          {title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {cols.length} cols
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Accordion Body */}
                    {isExpanded && (
                      <div className="p-2 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-1 max-h-48 overflow-y-auto">
                        {cols.map((col) => (
                          <button
                            key={col.name}
                            type="button"
                            onClick={() => insertToken(`LOOKUP([SKU], "${title}", "SKU", "${col.name}")`)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-blue-50 dark:hover:bg-blue-950/50 flex items-center justify-between text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors cursor-pointer group"
                            title={`Insertar LOOKUP hacia ${title}.${col.name}`}
                          >
                            <span className="font-mono text-[11px] group-hover:font-bold">
                              {col.name}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">
                              {col.type}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {otherTables.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  No hay otras hojas registradas.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. TAB 2: EXAMPLES & FUNCTION REFERENCE                                  */}
        {/* ========================================================================= */}
        {activeTab === 'examples' && (
          <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3 flex flex-col">
            
            {/* Top Toolbar: Search + Category Filter */}
            <div className="space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={functionSearchQuery}
                  onChange={(e) => setFunctionSearchQuery(e.target.value)}
                  placeholder="Buscar función por nombre o sintaxis (ej: IF, EOMONTH, SUM, LOOKUP)..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500 shadow-2xs"
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {functionCategories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedFunctionCategory(cat)}
                    className={`px-2.5 py-1 text-[11px] rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
                      selectedFunctionCategory === cat
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Functions List */}
            <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
              {filteredFunctions.map((ex, i) => (
                <div
                  key={i}
                  onClick={() => insertToken(ex.example)}
                  className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 rounded-xl transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono">
                        {ex.name}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ({ex.category})
                      </span>
                    </div>
                    <span className="text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity font-bold">
                      Insertar fórmula ↵
                    </span>
                  </div>

                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    {ex.example}
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {ex.desc}
                  </p>
                </div>
              ))}
              {filteredFunctions.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  No se encontraron funciones para "{functionSearchQuery}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 6. MODAL FOOTER (Matching AppSheet Expression Assistant)                 */}
        {/* ========================================================================= */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Help me with expressions</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => {
                onSave(formula);
                onClose();
              }}
              className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
