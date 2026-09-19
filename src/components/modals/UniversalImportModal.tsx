import React, { useState, useRef, useMemo } from 'react';
import { 
  FileSpreadsheet, Upload, Clipboard, CheckCircle2, AlertCircle, 
  ArrowRight, Trash2, RefreshCw, Layers, Check, X, FileText, ChevronRight,
  ShieldCheck, AlertTriangle, Sparkles, Filter
} from 'lucide-react';
import { 
  parseExcelBuffer, 
  parseDelimitedText, 
  detectDelimiter, 
  generateSmartColumnMappings, 
  ColumnMappingSuggestion,
  ParsedSpreadsheetResult
} from '../../utils/universalImporter';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { InventoryItem } from '../../types';
import { 
  reconcileImportWithInventory, 
  ImportConsolidationMode, 
  ReconcileResult 
} from '../../utils/cuVcConsolidator';

interface UniversalImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetHeaders: string[];
  activeSheetTitle: string;
  existingItems?: InventoryItem[];
  customAliases?: Record<string, string[]>;
  onImportConfirmed: (mappedRows: Record<string, any>[], mode?: ImportConsolidationMode) => Promise<void>;
}

export const UniversalImportModal: React.FC<UniversalImportModalProps> = ({
  isOpen,
  onClose,
  targetHeaders,
  activeSheetTitle,
  existingItems = [],
  customAliases,
  onImportConfirmed
}) => {
  const isFrcSheet = /frc|incidencia|evento|averia|merma|diferencia/i.test(activeSheetTitle);

  const [activeTab, setActiveTab] = useState<'paste' | 'file'>('paste');
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<ParsedSpreadsheetResult | null>(null);
  const [customMappings, setCustomMappings] = useState<Record<string, string>>({});
  const [consolidationMode, setConsolidationMode] = useState<ImportConsolidationMode>(() => 
    /frc|incidencia|evento|averia|merma|diferencia/i.test(activeSheetTitle) ? 'append' : 'consolidate_sum'
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync consolidation mode when active sheet changes
  React.useEffect(() => {
    if (isFrcSheet) {
      setConsolidationMode('append');
    } else {
      setConsolidationMode('consolidate_sum');
    }
  }, [activeSheetTitle, isFrcSheet]);

  // Initialize auto-mappings whenever parsedData changes using synonyms dictionary
  const mappingSuggestions = useMemo(() => {
    if (!parsedData || parsedData.headers.length === 0) return [];
    return generateSmartColumnMappings(targetHeaders, parsedData.headers, customAliases);
  }, [parsedData, targetHeaders, customAliases]);

  // Sync initial mapping suggestions to editable mapping dictionary
  React.useEffect(() => {
    if (mappingSuggestions.length > 0) {
      const initialMap: Record<string, string> = {};
      mappingSuggestions.forEach(s => {
        if (s.sourceHeader) {
          initialMap[s.targetHeader] = s.sourceHeader;
        }
      });
      setCustomMappings(initialMap);
    }
  }, [mappingSuggestions]);

  const mappedRowsPreview = useMemo(() => {
    if (!parsedData || parsedData.rows.length === 0) return [];
    return parsedData.rows.map(sourceRow => {
      const mappedItem: Record<string, any> = {};
      targetHeaders.forEach(targetCol => {
        const mappedSourceCol = customMappings[targetCol];
        if (mappedSourceCol && sourceRow[mappedSourceCol] !== undefined) {
          mappedItem[targetCol] = sourceRow[mappedSourceCol];
        } else {
          mappedItem[targetCol] = '';
        }
      });
      return mappedItem;
    });
  }, [parsedData, targetHeaders, customMappings]);

  const reconciliation = useMemo(() => {
    if (mappedRowsPreview.length === 0) return null;
    return reconcileImportWithInventory(
      mappedRowsPreview,
      existingItems,
      targetHeaders,
      customAliases,
      consolidationMode
    );
  }, [mappedRowsPreview, existingItems, targetHeaders, customAliases, consolidationMode]);

  const handleProcessText = (textToProcess: string) => {
    if (!textToProcess.trim()) {
      setStatusMessage({ text: 'Por favor ingresa o pega datos de una hoja de cálculo.', type: 'error' });
      return;
    }

    try {
      const delim = detectDelimiter(textToProcess);
      const parsed = parseDelimitedText(textToProcess, delim);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setStatusMessage({ text: 'No se encontraron filas de datos válidas en el texto proporcionado.', type: 'error' });
        return;
      }

      const rows: Record<string, any>[] = parsed.rows.map(rowCells => {
        const obj: Record<string, any> = {};
        parsed.headers.forEach((h, idx) => {
          obj[h] = rowCells[idx] !== undefined ? rowCells[idx] : '';
        });
        return obj;
      });

      setParsedData({
        headers: parsed.headers,
        rows,
        totalRows: rows.length,
        delimiterDetected: delim === '\t' ? 'Tabulación (TSV)' : delim === ';' ? 'Punto y coma (;)' : 'Coma (,)',
        sourceType: delim === '\t' ? 'clipboard' : 'csv',
        warnings: []
      });

      setStatusMessage({ 
        text: `Datos reconocidos con éxito: ${rows.length} filas y ${parsed.headers.length} columnas detectadas.`, 
        type: 'success' 
      });
    } catch (err: any) {
      setStatusMessage({ text: `Error al procesar el texto: ${err.message}`, type: 'error' });
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const parsed = await parseExcelBuffer(buffer);
        setParsedData(parsed);
        setStatusMessage({
          text: `Archivo Excel cargado: ${parsed.totalRows} filas y ${parsed.headers.length} columnas detectadas.`,
          type: 'success'
        });
      } else {
        const text = await file.text();
        handleProcessText(text);
      }
    } catch (err: any) {
      setStatusMessage({ text: `Error al leer el archivo: ${err.message}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedData || parsedData.rows.length === 0) return;

    setIsProcessing(true);
    try {
      // Map rows according to customMappings
      const mappedRowsList = parsedData.rows.map(sourceRow => {
        const mappedItem: Record<string, any> = {};
        targetHeaders.forEach(targetCol => {
          const mappedSourceCol = customMappings[targetCol];
          if (mappedSourceCol && sourceRow[mappedSourceCol] !== undefined) {
            mappedItem[targetCol] = sourceRow[mappedSourceCol];
          } else {
            mappedItem[targetCol] = '';
          }
        });
        return mappedItem;
      });

      await onImportConfirmed(mappedRowsList, consolidationMode);
      onClose();
    } catch (err: any) {
      setStatusMessage({ text: `Error al guardar los datos: ${err.message}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-2xs ${
              isFrcSheet 
                ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400'
                : 'bg-blue-100 dark:bg-blue-950/70 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
            }`}>
              {isFrcSheet ? <Upload className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {isFrcSheet ? 'Importación Masiva de Incidencias & FRC' : 'Ingestión Universal de Datos'}
                <span className={`text-xs px-2 py-0.5 rounded-md font-mono border ${
                  isFrcSheet
                    ? 'bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/80'
                    : 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/80'
                }`}>
                  {activeSheetTitle}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isFrcSheet 
                  ? 'Importa lotes de incidencias operativas (averías, transporte, mermas, diferencias) desde Excel, CSV o pegando directamente desde el portapapeles.'
                  : 'Importa datos desde Excel (.xlsx, .xls), CSV, TSV o copiando directamente desde Looker / Hojas de Cálculo.'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Method Selector Tabs (Only show if not yet parsed) */}
          {!parsedData && (
            <div className="space-y-4">
              <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4">
                <button
                  onClick={() => setActiveTab('paste')}
                  className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                    activeTab === 'paste'
                      ? isFrcSheet ? 'border-amber-600 text-amber-600 dark:text-amber-400' : 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  <Clipboard className="w-4 h-4" />
                  Copiar y Pegar (Portapapeles / Looker)
                </button>
                <button
                  onClick={() => setActiveTab('file')}
                  className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                    activeTab === 'file'
                      ? isFrcSheet ? 'border-amber-600 text-amber-600 dark:text-amber-400' : 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Subir Archivo Excel o CSV
                </button>
              </div>

              {activeTab === 'paste' ? (
                <div className="space-y-3">
                  <div className="relative">
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder={isFrcSheet 
                        ? "Pega aquí tus incidencias FRC (ej. FRC_N, SKU, DESCRIPCION, CANTIDAD, FRC_EVEN, N_TRASPASO, PROVEEDOR, OBSERVACION)..."
                        : "Copia las filas desde Excel, Google Sheets o Looker y pégalas aquí (Ctrl+V)..."}
                      className="w-full h-44 p-3.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono bg-slate-50/50 dark:bg-slate-950/50 text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none shadow-2xs"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {isFrcSheet && (
                      <button
                        type="button"
                        onClick={() => {
                          const sample = "FRC_N\tSKU\tDESCRIPCION\tLOTE\tCANTIDAD\tFRC_EVEN\tN_TRASPASO\tPROVEEDOR\tOBSERVACION\nFRC-2026-007\t200021021\tPARACETAMOL 500MG TAB X16 BAGO\tL-9988\t12\tTRANSPORTE\tTR-90088\tLABORATORIOS BAGO\tCajas aplastadas en rampa de descarga\nFRC-2026-008\t200045091\tAMOXICILINA 500MG CAP X21 CHILE\tL-7744\t8\tDIFERENCIAS\tTR-90089\tLABORATORIO CHILE\tFaltante contra guía de despacho";
                          setRawText(sample);
                          handleProcessText(sample);
                        }}
                        className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                      >
                        ⚡ Cargar Plantilla de Ejemplo FRC
                      </button>
                    )}
                    <div className="flex justify-end gap-2 ml-auto">
                      <button
                        onClick={() => handleProcessText(rawText)}
                        disabled={!rawText.trim() || isProcessing}
                        className={`px-4 py-2 text-white text-xs font-bold rounded-xl disabled:bg-slate-300 dark:disabled:bg-slate-800 transition-all flex items-center gap-2 shadow-2xs cursor-pointer ${
                          isFrcSheet ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                        Analizar y Mapear Columnas
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 bg-slate-50/30 dark:bg-slate-800/30'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    accept=".xlsx,.xls,.csv,.tsv,.txt"
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Arrastra tu archivo aquí o haz clic para seleccionarlo
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Formatos soportados: Excel (.xlsx, .xls), CSV, TSV
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' 
                : statusMessage.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Mapping & Data Preview Section (when parsedData is available) */}
          {parsedData && (
            <div className="space-y-6">
              
              {/* Header stats & re-import button */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">Total Filas:</span>{' '}
                    <span className="font-bold text-slate-800 dark:text-slate-100">{parsedData.totalRows}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Columnas Origen:</span>{' '}
                    <span className="font-bold text-slate-800 dark:text-slate-100">{parsedData.headers.length}</span>
                  </div>
                  {parsedData.delimiterDetected && (
                    <div>
                      <span className="text-slate-400">Formato:</span>{' '}
                      <span className="font-mono text-blue-600 dark:text-blue-400">{parsedData.delimiterDetected}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setParsedData(null); setRawText(''); setStatusMessage(null); }}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3" />
                  Cambiar archivo/texto
                </button>
              </div>

              {/* Column Mapping Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Mapeo Asistido de Columnas
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Verifica cómo se relacionan las columnas del archivo con tu hoja destino
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1 border border-slate-100 dark:border-slate-800 rounded-xl">
                  {targetHeaders.map(targetCol => {
                    const currentSource = customMappings[targetCol] || '';
                    const hasMatch = currentSource !== '';

                    return (
                      <div 
                        key={targetCol}
                        className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                          hasMatch
                            ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80'
                            : 'bg-amber-50/30 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/40'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {targetCol}
                          </p>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            Columna Destino
                          </span>
                        </div>

                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                        <div className="flex-1 min-w-0">
                          <select
                            value={currentSource}
                            onChange={(e) => setCustomMappings(prev => ({ ...prev, [targetCol]: e.target.value }))}
                            className={`w-full text-xs p-1.5 rounded-lg border font-medium outline-none transition-all ${
                              hasMatch
                                ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:border-blue-500'
                                : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300 focus:border-amber-500'
                            }`}
                          >
                            <option value="">(No importar / Dejar vacío)</option>
                            {parsedData.headers.map(sourceH => (
                              <option key={sourceH} value={sourceH}>
                                {sourceH}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Feature: Intelligent Consolidation & Deduplication Audit */}
              {isFrcSheet ? (
                <div className="bg-amber-50/80 dark:bg-amber-950/40 p-4 rounded-2xl border border-amber-200/80 dark:border-amber-800/80 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                        <Upload className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-950 dark:text-amber-100 flex items-center gap-2">
                          Modo de Inserción de Incidencias FRC
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-900/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-semibold">
                            Registro de Eventos
                          </span>
                        </h4>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                          Cada fila representa un evento independiente. Los números de folio FRC_N se respetan o se generan correlativamente si vienen vacíos.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-100 font-bold">
                        {parsedData.totalRows} incidencias listas
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setConsolidationMode('append')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        consolidationMode === 'append'
                          ? 'border-amber-500 bg-white dark:bg-slate-900 ring-2 ring-amber-500/30 shadow-xs'
                          : 'border-amber-200/70 dark:border-amber-800/70 bg-white/70 dark:bg-slate-900/50 hover:border-amber-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-amber-600" />
                          Anexar Todo (Recomendado)
                        </span>
                        {consolidationMode === 'append' && <Check className="w-4 h-4 text-amber-600" />}
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 leading-tight">
                        Inserta cada fila como un nuevo evento/incidencia con su folio. Ideal para cargas operativas periódicas.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConsolidationMode('consolidate_overwrite')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        consolidationMode === 'consolidate_overwrite'
                          ? 'border-amber-500 bg-white dark:bg-slate-900 ring-2 ring-amber-500/30 shadow-xs'
                          : 'border-amber-200/70 dark:border-amber-800/70 bg-white/70 dark:bg-slate-900/50 hover:border-amber-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                          Actualizar si Folio FRC_N Existe
                        </span>
                        {consolidationMode === 'consolidate_overwrite' && <Check className="w-4 h-4 text-amber-600" />}
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 leading-tight">
                        Si el archivo contiene números de folio FRC_N ya existentes, actualiza sus campos en lugar de duplicar.
                      </p>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50/80 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          Consolidación por Vencimiento CU_VC (Sin Lotes)
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Anti-Duplicados
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Detecta automáticamente si el archivo o la hoja activa ya tienen registros del mismo SKU + MM/YYYY
                        </p>
                      </div>
                    </div>

                    {reconciliation && (
                      <div className="flex items-center gap-2 text-[11px] font-mono flex-wrap">
                        {reconciliation.internalDeduplicatedCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800" title="Duplicados dentro del archivo importado fusionados sumando stock">
                            {reconciliation.internalDeduplicatedCount} fusionados en archivo
                          </span>
                        )}
                        {reconciliation.matchedCount > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            {reconciliation.matchedCount} coincidencias en hoja
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            0 coincidencias (100% nuevos)
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold">
                          {reconciliation.rowsToAppend.length} nuevas filas
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Consolidation Mode Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setConsolidationMode('consolidate_sum')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        consolidationMode === 'consolidate_sum'
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          Sumar Stock
                        </span>
                        {consolidationMode === 'consolidate_sum' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                        Suma la cantidad a la fila existente si coincide SKU + MM/YYYY. Recomendado.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConsolidationMode('consolidate_overwrite')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        consolidationMode === 'consolidate_overwrite'
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                          Sobrescribir
                        </span>
                        {consolidationMode === 'consolidate_overwrite' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                        Reemplaza la cantidad existente con el valor del archivo importado.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConsolidationMode('skip_existing')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        consolidationMode === 'skip_existing'
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Filter className="w-3.5 h-3.5 text-slate-600" />
                          Omitir Existentes
                        </span>
                        {consolidationMode === 'skip_existing' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                        No altera filas existentes. Solo agrega los SKUs/vencimientos nuevos.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConsolidationMode('append')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        consolidationMode === 'append'
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-600" />
                          Anexar Todo
                        </span>
                        {consolidationMode === 'append' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                        Modo clásico: inserta todas las filas al final sin consolidar.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Data Preview Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Vista Previa de Filas a Ingerir (Primeras 5)
                </h3>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl max-h-48">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 sticky top-0">
                      <tr>
                        <th className="p-2 border-b dark:border-slate-700 font-bold w-8 text-center">#</th>
                        {targetHeaders.map(th => (
                          <th key={th} className="p-2 border-b dark:border-slate-700 font-bold truncate max-w-[140px]">
                            {th}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {parsedData.rows.slice(0, 5).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-2 text-center text-slate-400 font-mono">{rIdx + 1}</td>
                          {targetHeaders.map(th => {
                            const sourceKey = customMappings[th];
                            const val = sourceKey ? row[sourceKey] : '';
                            return (
                              <td key={th} className="p-2 truncate max-w-[140px] text-slate-800 dark:text-slate-200">
                                {val !== undefined && val !== null && String(val).trim() !== '' ? String(val) : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          {parsedData && (
            <button
              onClick={handleConfirmImport}
              disabled={isProcessing}
              className={`px-5 py-2.5 active:scale-98 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 ${
                isFrcSheet
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              <Check className="w-4 h-4" />
              {isFrcSheet
                ? `Ingestar ${parsedData.totalRows} Incidencias en ${activeSheetTitle}`
                : consolidationMode === 'consolidate_sum' && reconciliation && reconciliation.matchedCount > 0
                ? `Ingestar y Consolidar ${parsedData.totalRows} Registros (${reconciliation.rowsToUpdate.length} sumados + ${reconciliation.rowsToAppend.length} nuevos)`
                : `Ingestar ${parsedData.totalRows} Registros en ${activeSheetTitle}`}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
