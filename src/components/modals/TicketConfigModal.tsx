import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Settings, 
  Printer, 
  Sparkles, 
  CheckSquare, 
  Square, 
  Search, 
  RotateCcw,
  Receipt,
  FileText,
  Sliders,
  Barcode,
  Scissors,
  Bluetooth,
  CheckCircle2,
  AlertCircle,
  Battery,
  RefreshCw,
  Play,
  Check,
  Tag,
  Info
} from 'lucide-react';
import { 
  ViewTicketConfig, 
  TicketColumnConfig, 
  TicketGeneralSettings, 
  InventoryItem 
} from '../../types';
import { 
  normalizeTicketConfig, 
  getDefaultViewTicketSettings, 
  getDefaultColumnConfig,
  executeThermalPrint 
} from '../../utils/ticketUtils';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { formatDisplayDate } from '../../utils/pureCalculations';
import { generateBarcodeSvgString } from '../../utils/barcodeGenerator';
import {
  ROLLOS,
  findRoll,
  evaluateFit,
  fitQuality,
  FIT_QUALITY_LABEL
} from '../../utils/labelMediaProfile';
import { useBluetoothPrinter } from '../../hooks/useBluetoothPrinter';
import { bluetoothPrinterService, MarklifeLabelOptions } from '../../services/bluetoothPrinterService';

interface TicketConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  headers: string[];
  activeView: string;
  config: ViewTicketConfig;
  onSave: (view: string, newConfig: ViewTicketConfig) => void;
  sampleItems?: InventoryItem[];
}

export const TicketConfigModal: React.FC<TicketConfigModalProps> = ({ 
  isOpen, 
  onClose, 
  headers, 
  activeView, 
  config, 
  onSave,
  sampleItems = []
}) => {
  const [localColumns, setLocalColumns] = useState<Record<string, TicketColumnConfig>>({});
  const [localGeneral, setLocalGeneral] = useState<TicketGeneralSettings>({
    title: 'REPORTE VENCIMIENTOS',
    paperWidth: '80mm',
    orientation: 'portrait',
    showDateTime: true,
    showTotalCount: true,
    footerText: '--- FIN DEL REPORTE ---'
  });
  const [columnSearch, setColumnSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'columns' | 'general' | 'marklife' | 'preview'>('columns');
  const [previewMode, setPreviewMode] = useState<'ticket' | 'marklife'>('ticket');

  // Hook de Bluetooth BLE para la Marklife P15
  const {
    isSupported: isBleSupported,
    isConnected: isBleConnected,
    isConnecting: isBleConnecting,
    isPrinting: isBlePrinting,
    deviceName: bleDeviceName,
    batteryLevel: bleBatteryLevel,
    error: bleError,
    selectedRollId: bleRollId,
    setSelectedRollId: setBleRollId,
    connect: connectBle,
    disconnect: disconnectBle,
    printTest: printTestBle,
    printBatch: printBatchBle,
  } = useBluetoothPrinter();

  const [bleSuccessMsg, setBleSuccessMsg] = useState<string | null>(null);
  const [bleProgress, setBleProgress] = useState<{ current: number; total: number } | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Track opening state to avoid resetting local state when parent re-renders
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const normalized = normalizeTicketConfig(config, headers, activeView);
      setLocalColumns(normalized.columns);
      setLocalGeneral(normalized.general);
      if (normalized.general.labelRollId) {
        setBleRollId(normalized.general.labelRollId);
      }
      setColumnSearch('');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, headers, activeView, config, setBleRollId]);

  // Sincronizar el rollo seleccionado con los ajustes generales
  const currentRollId = localGeneral.labelRollId || bleRollId || '12x40';
  const activeRoll = useMemo(() => findRoll(currentRollId) || ROLLOS[2], [currentRollId]);

  const handleUpdateColumn = (header: string, updates: Partial<TicketColumnConfig>) => {
    setLocalColumns(prev => {
      const current = prev[header] || getDefaultColumnConfig(header);
      return {
        ...prev,
        [header]: { ...current, ...updates }
      };
    });
  };

  const handleSelectAll = (show: boolean) => {
    setLocalColumns(prev => {
      const updated: Record<string, TicketColumnConfig> = {};
      headers.forEach(h => {
        const current = prev[h] || getDefaultColumnConfig(h);
        updated[h] = { ...current, show };
      });
      return updated;
    });
  };

  const handleResetToSmartDefaults = () => {
    const defaults = getDefaultViewTicketSettings(headers, activeView);
    setLocalColumns(defaults.columns);
    setLocalGeneral(defaults.general);
  };

  const filteredHeaders = useMemo(() => {
    if (!columnSearch.trim()) return headers;
    const term = columnSearch.toLowerCase();
    return headers.filter(h => h.toLowerCase().includes(term));
  }, [headers, columnSearch]);

  const visibleCount = useMemo(() => {
    return Object.values(localColumns).filter((c: TicketColumnConfig) => c && c.show).length;
  }, [localColumns]);

  // Ítem de muestra para previsualización en vivo (ticket y etiqueta)
  const previewItem: InventoryItem = useMemo(() => {
    if (sampleItems && sampleItems.length > 0) {
      return sampleItems[0];
    }
    const mock: InventoryItem = { _rowIndex: 2 };
    headers.forEach(h => {
      if (findColumnBySemantic([h], 'sku')) mock[h] = '780123456789';
      else if (findColumnBySemantic([h], 'descripcion')) mock[h] = 'PRODUCTO DE MUESTRA 500G';
      else if (findColumnBySemantic([h], 'fecha_vc')) mock[h] = '2026-10-31';
      else if (findColumnBySemantic([h], 'lote')) mock[h] = 'L-98421';
      else if (findColumnBySemantic([h], 'cantidad')) mock[h] = '24';
      else mock[h] = 'Dato';
    });
    return mock;
  }, [sampleItems, headers]);

  // Helper para columnas clave
  const skuHeader = headers.find(h => findColumnBySemantic([h], 'sku') !== undefined);
  const descHeader = headers.find(h => findColumnBySemantic([h], 'descripcion') !== undefined);
  const dateHeader = headers.find(h => findColumnBySemantic([h], 'fecha_vc') !== undefined);
  const loteHeader = headers.find(h => findColumnBySemantic([h], 'lote') !== undefined);
  const cantHeader = headers.find(h => findColumnBySemantic([h], 'cantidad') !== undefined);

  const showSku = skuHeader ? localColumns[skuHeader]?.show : false;
  const showDesc = descHeader ? localColumns[descHeader]?.show : false;
  const showDate = dateHeader ? localColumns[dateHeader]?.show : false;
  const showLote = loteHeader ? localColumns[loteHeader]?.show : false;
  const showCant = cantHeader ? localColumns[cantHeader]?.show : false;

  const primaryHeaders = useMemo(() => new Set([skuHeader, descHeader, dateHeader, loteHeader, cantHeader].filter(Boolean)), [skuHeader, descHeader, dateHeader, loteHeader, cantHeader]);
  const otherConfiguredHeaders = useMemo(() => headers.filter(h => !primaryHeaders.has(h) && localColumns[h]?.show), [headers, primaryHeaders, localColumns]);

  // SKU de muestra para evaluar calidad de fit del rollo
  const skuDeMuestra = useMemo(() => {
    const fromSample = sampleItems
      .map(it => String(it[skuHeader || ''] || it['CU_VC'] || '').trim())
      .find(v => v.length > 0);
    return fromSample || '2000210218569';
  }, [sampleItems, skuHeader]);

  const calidadRollo = useMemo(() => {
    return activeRoll ? fitQuality(evaluateFit(skuDeMuestra, activeRoll)) : null;
  }, [skuDeMuestra, activeRoll]);

  // Configuración de la etiqueta Marklife P15 (Solo Código de Barras vs Responsivo a Columnas)
  const marklifeOptions: MarklifeLabelOptions = useMemo(() => ({
    barcodeOnly: localGeneral.marklifeBarcodeOnly !== false,
    showSkuText: localGeneral.marklifeShowSkuText !== false,
    columnsConfig: localColumns,
    headers: headers,
  }), [localGeneral.marklifeBarcodeOnly, localGeneral.marklifeShowSkuText, localColumns, headers]);

  // Renderizar la etiqueta de la Marklife P15 en canvas en tiempo real
  useEffect(() => {
    if (!isOpen) return;

    const sampleItemObj = sampleItems.length > 0 ? {
      sku: String(sampleItems[0]['sku'] || sampleItems[0]['SKU'] || sampleItems[0]['codigo'] || sampleItems[0]['CU_VC'] || skuDeMuestra || '780123456789'),
      descripcion: String(sampleItems[0]['descripcion'] || sampleItems[0]['DESCRIPCION'] || 'PRODUCTO DE MUESTRA 500G'),
      fechaVc: String(sampleItems[0]['fecha_vc'] || sampleItems[0]['FECHA_VC'] || '31/10/2026'),
      lote: String(sampleItems[0]['lote'] || sampleItems[0]['LOTE'] || 'L-98421'),
      cantidad: sampleItems[0]['cantidad'] || sampleItems[0]['CANTIDAD'] || '1 UN',
      ...sampleItems[0]
    } : {
      sku: skuDeMuestra,
      descripcion: 'PRODUCTO DE MUESTRA 500G',
      fechaVc: '31/10/2026',
      lote: 'L-98421',
      cantidad: '24 UN',
    };

    const canvas = bluetoothPrinterService.generateLabelCanvas(sampleItemObj, activeRoll, marklifeOptions);
    if (previewCanvasRef.current) {
      const container = previewCanvasRef.current;
      container.width = canvas.width;
      container.height = canvas.height;
      const ctx = container.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0);
      }
    }
  }, [isOpen, activeRoll, sampleItems, skuDeMuestra, marklifeOptions]);

  if (!isOpen) return null;

  const handleSaveAndClose = () => {
    onSave(activeView, {
      columns: localColumns,
      general: {
        ...localGeneral,
        labelRollId: currentRollId,
        marklifeBarcodeOnly: localGeneral.marklifeBarcodeOnly !== false,
        marklifeShowSkuText: localGeneral.marklifeShowSkuText !== false,
      }
    });
    onClose();
  };

  // Impresión de ticket térmico continuo estándar vía navegador
  const handleTestPrintTicket = () => {
    onSave(activeView, {
      columns: localColumns,
      general: {
        ...localGeneral,
        labelRollId: currentRollId,
        marklifeBarcodeOnly: localGeneral.marklifeBarcodeOnly !== false,
        marklifeShowSkuText: localGeneral.marklifeShowSkuText !== false,
      }
    });

    executeThermalPrint({
      elementId: 'thermal-ticket-root',
      paperWidth: localGeneral.paperWidth || '80mm',
      orientation: localGeneral.orientation || 'portrait',
      cutMarginMm: localGeneral.cutMarginMm !== undefined ? Number(localGeneral.cutMarginMm) : 2,
      rollSizeMm: activeRoll ? { widthMm: activeRoll.widthMm, heightMm: activeRoll.heightMm } : undefined
    });
  };

  // Impresión de prueba directa a Marklife P15 vía Bluetooth BLE
  const handleTestPrintMarklife = async () => {
    setBleSuccessMsg(null);
    try {
      const ok = await printTestBle(currentRollId, marklifeOptions);
      if (ok) {
        setBleSuccessMsg('¡Etiqueta de prueba enviada con éxito a la Marklife P15!');
        setTimeout(() => setBleSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      console.error('Error al imprimir prueba Marklife:', err);
    }
  };

  // Impresión por lotes en Marklife P15
  const handleBatchPrintMarklife = async () => {
    const items = sampleItems.length > 0 ? sampleItems : [previewItem];
    setBleSuccessMsg(null);
    setBleProgress({ current: 0, total: items.length });

    try {
      const count = await printBatchBle(items, currentRollId, (curr, tot) => {
        setBleProgress({ current: curr, total: tot });
      }, marklifeOptions);
      setBleProgress(null);
      if (count > 0) {
        setBleSuccessMsg(`¡${count} etiquetas impresas exitosamente en la Marklife P15!`);
        setTimeout(() => setBleSuccessMsg(null), 4500);
      }
    } catch (err: any) {
      setBleProgress(null);
      console.error('Error al imprimir lote en Marklife:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94vh]">
        
        {/* HEADER */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  Centro de Impresión Térmica y Etiquetas
                </h2>
                <span className="bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/60">
                  {activeView}
                </span>
                {sampleItems.length > 0 && (
                  <span className="bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/50">
                    {sampleItems.length} {sampleItems.length === 1 ? 'registro' : 'registros'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configura tickets continuos (80mm/58mm POS) y etiquetas portátiles adhesivas Marklife P15 (Bluetooth BLE)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NAVEGACIÓN POR PESTAÑAS (SUPERIOR) */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 p-1.5 gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
          <button
            onClick={() => {
              setActiveTab('columns');
              setPreviewMode('ticket');
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'columns' 
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-blue-500" />
            <span>Columnas del Ticket</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300">
              {visibleCount}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('general');
              setPreviewMode('ticket');
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'general' 
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>Formato Continuo (80/58mm)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('marklife');
              setPreviewMode('marklife');
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'marklife' 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5" />
            <span>Marklife P15 (Bluetooth BLE)</span>
            {isBleConnected ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500 text-white px-1.5 py-0.2 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Conectada
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200">
                Portátil
              </span>
            )}
          </button>

          {/* Tab de Previsualización solo en móvil */}
          <button
            onClick={() => setActiveTab('preview')}
            className={`lg:hidden px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 ml-auto cursor-pointer ${
              activeTab === 'preview' 
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Previsualizar</span>
          </button>
        </div>

        {/* CUERPO PRINCIPAL (Split Grid en Desktop: Configuración Izquierda, Previsualización Derecha) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-0">
          
          {/* PANEL IZQUIERDO: CONFIGURACIONES */}
          <div className={`lg:col-span-7 flex flex-col overflow-hidden border-r border-slate-200 dark:border-slate-800 ${
            activeTab === 'preview' ? 'hidden lg:flex' : 'flex'
          }`}>

            {/* PESTAÑA 1: COLUMNAS DEL TICKET */}
            {activeTab === 'columns' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Barra de herramientas */}
                <div className="p-3.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/20 space-y-2.5 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleResetToSmartDefaults}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors cursor-pointer"
                        title="Restablecer columnas recomendadas automáticamente"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                        Recomendados
                      </button>
                      <button
                        onClick={() => handleSelectAll(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                        Todo
                      </button>
                      <button
                        onClick={() => handleSelectAll(false)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
                      >
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                        Ninguno
                      </button>
                    </div>

                    <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      <span className="text-blue-600 dark:text-blue-400">{visibleCount}</span> de {headers.length} columnas visibles
                    </div>
                  </div>

                  {/* Buscador de columnas */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={columnSearch}
                      onChange={(e) => setColumnSearch(e.target.value)}
                      placeholder="Buscar columna en esta tabla..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Lista de columnas scrolleable */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-2 no-scrollbar">
                  {filteredHeaders.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No se encontraron columnas que coincidan con "{columnSearch}"
                    </div>
                  ) : (
                    filteredHeaders.map(header => {
                      const colConfig = localColumns[header] || getDefaultColumnConfig(header);
                      return (
                        <div 
                          key={header}
                          className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                            colConfig.show 
                              ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 shadow-2xs' 
                              : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 opacity-60'
                          }`}
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={colConfig.show}
                              onChange={(e) => handleUpdateColumn(header, { show: e.target.checked })}
                            />
                            <div className="min-w-0">
                              <p className={`text-xs font-bold truncate ${colConfig.show ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500'}`}>
                                {header}
                              </p>
                            </div>
                          </label>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5">
                              <span className="text-[10px] text-slate-400 font-medium">Tamaño:</span>
                              <input 
                                type="number" 
                                className="w-10 text-xs font-bold text-center bg-transparent focus:outline-none"
                                value={colConfig.size || 10}
                                onChange={(e) => handleUpdateColumn(header, { size: Math.max(8, Math.min(24, parseInt(e.target.value, 10) || 10)) })}
                                min={8} 
                                max={24}
                              />
                              <span className="text-[10px] text-slate-400">px</span>
                            </div>
                            
                            <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 shadow-2xs">
                              <input 
                                type="checkbox" 
                                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={colConfig.bold}
                                onChange={(e) => handleUpdateColumn(header, { bold: e.target.checked })}
                              />
                              <span className={`text-xs font-semibold ${colConfig.bold ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                                Negrita
                              </span>
                            </label>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* PESTAÑA 2: FORMATO CONTINUO POS (80mm / 58mm) */}
            {activeTab === 'general' && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar">
                
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>Ajustes Generales del Ticket Continuo POS</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Título Encabezado
                    </label>
                    <input
                      type="text"
                      value={localGeneral.title || ''}
                      onChange={(e) => setLocalGeneral(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="REPORTE VENCIMIENTOS"
                      className="w-full px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Ancho de Papel POS
                    </label>
                    <select
                      value={localGeneral.paperWidth || '80mm'}
                      onChange={(e) => setLocalGeneral(prev => ({ ...prev, paperWidth: e.target.value as '80mm' | '58mm' }))}
                      className="w-full px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="80mm">80 mm (Estándar POS)</option>
                      <option value="58mm">58 mm (Compacto Térmico)</option>
                    </select>
                    <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      Impresión continua estándar a través de la ventana de impresión del navegador o USB POS.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        Orientación de Impresión
                      </label>
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                        {(localGeneral.orientation || 'portrait') === 'portrait' ? 'Vertical (Recomendado)' : 'Horizontal'}
                      </span>
                    </div>
                    <div className="flex rounded-xl bg-slate-200 dark:bg-slate-700 p-0.5">
                      <button
                        type="button"
                        onClick={() => setLocalGeneral(prev => ({ ...prev, orientation: 'portrait' }))}
                        className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          (localGeneral.orientation || 'portrait') === 'portrait'
                            ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <span className="inline-block w-2.5 h-3.5 border-2 border-current rounded-xs"></span>
                        <span>Vertical</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocalGeneral(prev => ({ ...prev, orientation: 'landscape' }))}
                        className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          localGeneral.orientation === 'landscape'
                            ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <span className="inline-block w-3.5 h-2.5 border-2 border-current rounded-xs"></span>
                        <span>Horizontal</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        Corte Final (Ahorro de Papel)
                      </label>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        Sin colas en blanco
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 p-0.5 rounded-xl bg-slate-200 dark:bg-slate-700">
                      {[
                        { value: 0, label: 'Al ras (0 mm)', tip: 'Corte inmediato, máximo ahorro de papel' },
                        { value: 2, label: 'Mínimo (2 mm)', tip: 'Margen de seguridad recomendado' },
                        { value: 5, label: 'Estándar (5 mm)', tip: 'Margen holgado para guillotina separada' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setLocalGeneral(prev => ({ ...prev, cutMarginMm: opt.value }))}
                          className={`py-1 px-1.5 text-center rounded-lg transition-all text-xs font-bold cursor-pointer ${
                            (localGeneral.cutMarginMm ?? 2) === opt.value
                              ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                          title={opt.tip}
                        >
                          <span className="block leading-tight">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={localGeneral.showDateTime ?? true}
                      onChange={(e) => setLocalGeneral(prev => ({ ...prev, showDateTime: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Mostrar Fecha y Hora</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={localGeneral.showTotalCount ?? true}
                      onChange={(e) => setLocalGeneral(prev => ({ ...prev, showTotalCount: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Mostrar Total de Ítems</span>
                  </label>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                    Texto Pie de Página
                  </label>
                  <input
                    type="text"
                    value={localGeneral.footerText || ''}
                    onChange={(e) => setLocalGeneral(prev => ({ ...prev, footerText: e.target.value }))}
                    placeholder="--- FIN DEL REPORTE ---"
                    className="w-full px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Código de barras SKU en ticket continuo */}
                <div className="p-3 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 mt-0.5">
                        <Barcode className="w-4 h-4" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={localGeneral.includeSkuBarcode ?? false}
                            onChange={(e) => setLocalGeneral(prev => ({ ...prev, includeSkuBarcode: e.target.checked }))}
                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span>Código de Barras de SKU por Registro</span>
                        </label>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          Genera el código 1D (Code 128) antes del salto de cada producto para escaneo láser en terreno (~8 mm).
                        </p>
                      </div>
                    </div>
                  </div>

                  {localGeneral.includeSkuBarcode && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                          Alto del Código:
                        </span>
                        <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
                          {[6, 8, 10, 12].map(mm => (
                            <button
                              key={mm}
                              type="button"
                              onClick={() => setLocalGeneral(prev => ({ ...prev, barcodeHeightMm: mm }))}
                              className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                (localGeneral.barcodeHeightMm || 8) === mm
                                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {mm} mm {mm === 8 ? '(Recomendado)' : ''}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={localGeneral.showBarcodeTextInReport ?? false}
                          onChange={(e) => setLocalGeneral(prev => ({ ...prev, showBarcodeTextInReport: e.target.checked }))}
                          className="w-3 h-3 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span>Texto numérico bajo barras</span>
                      </label>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* PESTAÑA 3: IMPRESORA PORTÁTIL MARKLIFE P15 (BLUETOOTH BLE) */}
            {activeTab === 'marklife' && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar">
                
                {/* AVISO DE SOPORTE WEB BLUETOOTH */}
                {!isBleSupported && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
                      <p className="font-bold">Web Bluetooth no detectado en este navegador</p>
                      <p className="leading-relaxed">
                        Para conectar directamente con la Marklife P15 por Bluetooth sin instalar controladores, abra esta aplicación en <strong>Google Chrome</strong> (o Microsoft Edge) en su celular Android o PC. En iPhone (iOS) se requiere el navegador gratuito <strong>Bluefy</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* TARJETA DE ESTADO Y CONEXIÓN BLUETOOTH */}
                <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                        <Bluetooth className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          Impresora Térmica Marklife P15
                        </span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Protocolo L11/Quin 203 DPI · BLE GATT 0xFF00
                        </p>
                      </div>
                    </div>

                    {isBleConnected ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Conectada
                      </span>
                    ) : isBleConnecting ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/70 px-3 py-1 rounded-full animate-pulse border border-blue-200 dark:border-blue-800">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" /> Buscando...
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-2.5 py-1 rounded-full">
                        No vinculada
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 border-t border-indigo-100 dark:border-indigo-900/40 gap-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          {bleDeviceName || 'Dispositivo no seleccionado'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {isBleConnected ? 'Listo para recibir comandos de impresión' : 'Encienda el botón físico de la impresora antes de vincular'}
                        </p>
                      </div>
                      {bleBatteryLevel !== null && (
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                          <Battery className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{bleBatteryLevel}%</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isBleConnected ? (
                        <button
                          type="button"
                          onClick={disconnectBle}
                          className="px-3.5 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/50 transition-colors cursor-pointer"
                        >
                          Desconectar
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!isBleSupported || isBleConnecting}
                          onClick={connectBle}
                          className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-600/25 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <Bluetooth className="w-3.5 h-3.5" />
                          <span>{isBleConnecting ? 'Buscando...' : 'Conectar Marklife P15'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {bleError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60">
                      {bleError}
                    </p>
                  )}
                </div>

                {/* SELECTOR DE ROLLO TROQUELADO DE ETIQUETAS */}
                <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-indigo-500" />
                      Rollo de Etiquetas Instalado
                    </label>
                    {calidadRollo && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        calidadRollo === 'optimo' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                          : calidadRollo === 'ok' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                            : calidadRollo === 'justo' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                      }`}>
                        Ajuste: {FIT_QUALITY_LABEL[calidadRollo]}
                      </span>
                    )}
                  </div>

                  <select
                    value={currentRollId}
                    onChange={(e) => {
                      const newRollId = e.target.value;
                      setBleRollId(newRollId);
                      setLocalGeneral(prev => ({ ...prev, labelRollId: newRollId }));
                    }}
                    className="w-full px-3 py-2 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  >
                    {ROLLOS.map((r) => {
                      const calidad = fitQuality(evaluateFit(skuDeMuestra, r));
                      return (
                        <option key={r.id} value={r.id}>
                          {r.nombre} ({r.widthMm} × {r.heightMm} mm) · {FIT_QUALITY_LABEL[calidad]}
                        </option>
                      );
                    })}
                  </select>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                    La Marklife P15 cuenta con cabezal de 203 DPI (8 puntos/mm). El código de barras <strong>Code128 se gira 90° automáticamente</strong> para maximizar la longitud de las barras y garantizar lectura instantánea con pistola láser.
                  </p>
                </div>

                {/* MODO DE CONTENIDO DE LA ETIQUETA MARKLIFE (SOLO CÓDIGO DE BARRAS VS RESPONSIVO) */}
                <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Barcode className="w-3.5 h-3.5 text-indigo-500" />
                      Contenido de la Etiqueta Marklife
                    </label>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {localGeneral.marklifeBarcodeOnly !== false ? 'Modo Puro Barras' : 'Modo Responsivo'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Opción 1: Solo Código de Barras (Recomendado) */}
                    <button
                      type="button"
                      onClick={() => setLocalGeneral(prev => ({ ...prev, marklifeBarcodeOnly: true }))}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        localGeneral.marklifeBarcodeOnly !== false
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-900 dark:text-indigo-200'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <Barcode className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Solo Código de Barras</span>
                        </div>
                        {localGeneral.marklifeBarcodeOnly !== false && (
                          <span className="text-[9px] bg-indigo-600 text-white font-bold px-1.5 py-0.5 rounded-full">
                            Activo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        Maximiza altura de barras (Code128). Sin textos extra para lectura instantánea con pistola láser.
                      </p>
                    </button>

                    {/* Opción 2: Responsivo a Selección de Columnas */}
                    <button
                      type="button"
                      onClick={() => setLocalGeneral(prev => ({ ...prev, marklifeBarcodeOnly: false }))}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        localGeneral.marklifeBarcodeOnly === false
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-900 dark:text-indigo-200'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Responsivo a Columnas</span>
                        </div>
                        {localGeneral.marklifeBarcodeOnly === false && (
                          <span className="text-[9px] bg-indigo-600 text-white font-bold px-1.5 py-0.5 rounded-full">
                            Activo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        Respeta las {visibleCount} columnas activadas en "Columnas del Ticket" (descripción, lote, etc.).
                      </p>
                    </button>
                  </div>

                  {/* Checkbox condicional para SKU legible al pie */}
                  {localGeneral.marklifeBarcodeOnly !== false && (
                    <label className="flex items-center gap-2 pt-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={localGeneral.marklifeShowSkuText !== false}
                        onChange={(e) => setLocalGeneral(prev => ({ ...prev, marklifeShowSkuText: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Incluir número legible del SKU al pie de las barras</span>
                    </label>
                  )}
                </div>

                {/* MENSAJES DE ÉXITO O PROGRESO DE IMPRESIÓN */}
                {bleSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-xs font-medium flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{bleSuccessMsg}</span>
                  </div>
                )}

                {bleProgress && (
                  <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900/60 text-indigo-900 dark:text-indigo-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                        Imprimiendo en Marklife P15...
                      </span>
                      <span>{bleProgress.current} de {bleProgress.total}</span>
                    </div>
                    <div className="w-full bg-indigo-200 dark:bg-indigo-900 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-full transition-all duration-300"
                        style={{ width: `${Math.round((bleProgress.current / bleProgress.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* ACCIONES DIRECTAS DE IMPRESIÓN MARKLIFE */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Acciones de Impresión Física
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {sampleItems.length > 0 ? `${sampleItems.length} ítems en lote` : '1 ítem de muestra'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={isBlePrinting || !isBleConnected}
                      onClick={handleTestPrintMarklife}
                      className="py-2.5 px-3 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                    >
                      <Printer className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{isBlePrinting ? 'Imprimiendo...' : 'Imprimir Etiqueta de Prueba'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBlePrinting || !isBleConnected}
                      onClick={handleBatchPrintMarklife}
                      className="py-2.5 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>
                        {isBlePrinting 
                          ? 'Imprimiendo lote...' 
                          : `Imprimir Lote (${sampleItems.length > 0 ? sampleItems.length : 1})`}
                      </span>
                    </button>
                  </div>

                  {!isBleConnected && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                      Conecte la impresora Marklife P15 para habilitar los botones de impresión física.
                    </p>
                  )}
                </div>

                {/* GUÍA RÁPIDA DE USO */}
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    <Info className="w-4 h-4 text-indigo-500" />
                    <span>Instrucciones de Uso Rápido en Bodega</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400 pl-1 leading-relaxed">
                    <li>Encienda su impresora <strong>Marklife P15</strong> manteniendo presionado el botón 2 segundos.</li>
                    <li>Verifique que el Bluetooth de su dispositivo esté encendido.</li>
                    <li>Presione <strong>"Conectar Marklife P15"</strong> y elija el dispositivo en la ventana emergente de Chrome.</li>
                    <li>Presione <strong>"Imprimir Etiqueta de Prueba"</strong> para verificar que el troquel corte al ras.</li>
                  </ol>
                </div>

              </div>
            )}

          </div>

          {/* PANEL DERECHO: PREVISUALIZACIÓN EN VIVO (Ticket Continuo o Etiqueta Marklife) */}
          <div className={`lg:col-span-5 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 p-3.5 sm:p-5 ${
            activeTab === 'columns' || activeTab === 'general' || activeTab === 'marklife' ? 'hidden lg:flex' : 'flex'
          }`}>
            
            {/* CONMUTADOR DE MODO DE PREVISUALIZACIÓN */}
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex rounded-xl bg-slate-200 dark:bg-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewMode('ticket')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    previewMode === 'ticket'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Receipt className="w-3 h-3 text-slate-500" />
                  <span>Ticket Continuo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('marklife')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    previewMode === 'marklife'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700'
                  }`}
                >
                  <Tag className="w-3 h-3" />
                  <span>Etiqueta Marklife</span>
                </button>
              </div>

              <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold px-2 py-0.5 rounded-full">
                {previewMode === 'ticket' ? (localGeneral.paperWidth || '80mm') : `${activeRoll.widthMm}×${activeRoll.heightMm}mm`}
              </span>
            </div>

            {/* CONTENIDO DE PREVISUALIZACIÓN */}
            <div className="flex-1 overflow-y-auto flex items-center justify-center p-2 no-scrollbar">
              
              {/* VISTA PREVIA A: TICKET CONTINUO POS */}
              {previewMode === 'ticket' && (
                <div 
                  className={`bg-white text-black font-mono leading-tight shadow-xl p-4 border border-slate-300 rounded-sm transition-all duration-200 select-none ${
                    localGeneral.paperWidth === '58mm' ? 'w-[56mm] max-w-[240px]' : 'w-[76mm] max-w-[320px]'
                  }`}
                  style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.12))' }}
                >
                  {/* Encabezado */}
                  <div className="text-center border-b border-dashed border-black pb-2 mb-2">
                    <h3 className="text-[13px] font-bold tracking-wider uppercase m-0 leading-tight">
                      {localGeneral.title || 'REPORTE VENCIMIENTOS'}
                    </h3>
                    {localGeneral.showDateTime !== false && (
                      <p className="text-[10px] m-0 mt-1">Fecha: {new Date().toLocaleString()}</p>
                    )}
                    {localGeneral.showTotalCount !== false && (
                      <p className="text-[10px] m-0">Total ítems: {sampleItems.length || 1}</p>
                    )}
                  </div>

                  {/* Ítems simulados */}
                  <div className="space-y-2">
                    {[previewItem].map((item, idx) => {
                      const skuVal = skuHeader ? String(item[skuHeader] || '780123456789').trim() : '';
                      const descVal = descHeader ? String(item[descHeader] || 'PRODUCTO DE MUESTRA 500G').trim() : '';
                      const rawDateVal = dateHeader ? item[dateHeader] : '2026-10-31';
                      const dateVal = rawDateVal ? formatDisplayDate(rawDateVal) : '';
                      const loteVal = loteHeader ? String(item[loteHeader] || 'L-98421').trim() : '';
                      const cantVal = cantHeader ? String(item[cantHeader] || '24').trim() : '';

                      const skuConf = skuHeader ? localColumns[skuHeader] : undefined;
                      const descConf = descHeader ? localColumns[descHeader] : undefined;
                      const dateConf = dateHeader ? localColumns[dateHeader] : undefined;
                      const loteConf = loteHeader ? localColumns[loteHeader] : undefined;
                      const cantConf = cantHeader ? localColumns[cantHeader] : undefined;

                      return (
                        <div key={idx} className="border-b border-dotted border-black pb-2">
                          {/* SKU + Descripción */}
                          {((showSku && skuVal) || (showDesc && descVal)) && (
                            <div className="leading-snug">
                              {showSku && skuVal && (
                                <span 
                                  style={{ fontSize: `${skuConf?.size || 12}px` }}
                                  className={`font-mono ${skuConf?.bold ? 'font-bold' : 'font-normal'}`}
                                >
                                  [{skuVal}]{descVal && descVal !== skuVal ? ' ' : ''}
                                </span>
                              )}
                              {showDesc && descVal && descVal !== skuVal && (
                                <span 
                                  style={{ fontSize: `${descConf?.size || 12}px` }}
                                  className={descConf?.bold ? 'font-bold' : 'font-normal'}
                                >
                                  {descVal}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Lote & Cantidad */}
                          {((showLote && loteVal) || (showCant && cantVal)) && (
                            <div className="text-[10px] flex gap-3 text-black mt-1">
                              {showLote && loteVal && (
                                <span 
                                  style={{ fontSize: `${loteConf?.size || 10}px` }}
                                  className={loteConf?.bold ? 'font-bold' : 'font-normal'}
                                >
                                  Lote: {loteVal}
                                </span>
                              )}
                              {showCant && cantVal && (
                                <span 
                                  style={{ fontSize: `${cantConf?.size || 10}px` }}
                                  className={cantConf?.bold ? 'font-bold' : 'font-normal'}
                                >
                                  Cant: {cantVal}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Otras columnas */}
                          {otherConfiguredHeaders.map(h => {
                            const rawVal = item[h] || 'Valor';
                            const isDateColumn = findColumnBySemantic([h], 'fecha_vc') !== undefined 
                              || findColumnBySemantic([h], 'fecha_retiro') !== undefined 
                              || (/fecha/i.test(h) && !/evento|incidencia|tipo/i.test(h));
                            const displayVal = isDateColumn && rawVal !== 'Valor' ? formatDisplayDate(rawVal) : String(rawVal);
                            const hConf = localColumns[h];
                            return (
                              <div 
                                key={h}
                                style={{ fontSize: `${hConf?.size || 10}px` }}
                                className={`mt-0.5 text-black ${hConf?.bold ? 'font-bold' : 'font-normal'}`}
                              >
                                <span className="opacity-80">{h}: </span>
                                <span>{displayVal}</span>
                              </div>
                            );
                          })}

                          {/* Fecha Vencimiento */}
                          {showDate && dateVal && (
                            <div 
                              style={{ fontSize: `${dateConf?.size || 11}px` }}
                              className={`mt-1 ${dateConf?.bold ? 'font-bold' : 'font-medium'}`}
                            >
                              <span>F.Venc: </span>
                              <span>{dateVal}</span>
                            </div>
                          )}

                          {/* Código de barras 1D */}
                          {localGeneral.includeSkuBarcode && skuVal && (
                            <div className="mt-1.5 mb-0.5 w-full flex flex-col items-center justify-center overflow-hidden">
                              <div 
                                className="w-full flex justify-center items-center"
                                style={{ 
                                  height: `${localGeneral.barcodeHeightMm || 8}mm`, 
                                  maxHeight: `${localGeneral.barcodeHeightMm || 8}mm` 
                                }}
                                dangerouslySetInnerHTML={{
                                  __html: generateBarcodeSvgString(skuVal, {
                                    width: localGeneral.paperWidth === '58mm' ? 1.4 : 1.7,
                                    height: Math.round((localGeneral.barcodeHeightMm || 8) * 3.78),
                                    showText: localGeneral.showBarcodeTextInReport ?? false,
                                    fontSize: 9,
                                    quietZone: 4,
                                    color: '#000000',
                                    background: 'transparent'
                                  })
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Pie de página */}
                  <div 
                    className="text-center border-t border-dashed border-black mt-2 pt-1 text-[10px] font-bold"
                    style={{ paddingBottom: `${localGeneral.cutMarginMm ?? 2}mm` }}
                  >
                    {localGeneral.footerText || '--- FIN DEL REPORTE ---'}
                  </div>

                  {/* Indicador de corte */}
                  <div className="mt-2 pt-1 border-t-2 border-dotted border-rose-500/60 flex items-center justify-center gap-1.5 text-[9px] font-bold text-rose-600">
                    <Scissors className="w-3 h-3 rotate-90" />
                    <span>CORTE TÉRMICO {(localGeneral.cutMarginMm ?? 2) > 0 ? `(+${localGeneral.cutMarginMm ?? 2}mm)` : '(AL RAS)'}</span>
                  </div>
                </div>
              )}

              {/* VISTA PREVIA B: ETIQUETA ADHESIVA MARKLIFE P15 */}
              {previewMode === 'marklife' && (
                <div className="flex flex-col items-center justify-center space-y-3 w-full max-w-xs">
                  {/* Selector rápido de modo directo en la previsualización */}
                  <div className="flex items-center gap-1 p-1 bg-slate-200 dark:bg-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setLocalGeneral(prev => ({ ...prev, marklifeBarcodeOnly: true }))}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        localGeneral.marklifeBarcodeOnly !== false
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-800'
                      }`}
                    >
                      <Barcode className="w-3 h-3" />
                      <span>Solo Barras</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalGeneral(prev => ({ ...prev, marklifeBarcodeOnly: false }))}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        localGeneral.marklifeBarcodeOnly === false
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-800'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Con Columnas ({visibleCount})</span>
                    </button>
                  </div>

                  {/* Etiqueta adhesiva troquelada simulada */}
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border-2 border-dashed border-indigo-200 dark:border-indigo-900/80 flex flex-col items-center justify-center space-y-2 relative">
                    <div className="flex items-center justify-between w-full px-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">
                        Troquel {activeRoll.widthMm} × {activeRoll.heightMm} mm
                      </span>
                      <span className="text-[9px] font-semibold text-slate-500">
                        {localGeneral.marklifeBarcodeOnly !== false 
                          ? (localGeneral.marklifeShowSkuText !== false ? 'Barras + SKU' : 'Puras Barras')
                          : `${visibleCount} cols`}
                      </span>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl shadow-xs border border-slate-300 inline-block overflow-hidden max-w-full">
                      <canvas
                        ref={previewCanvasRef}
                        className="max-h-44 object-contain"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </div>

                    <div className="flex items-center justify-between w-full text-[10px] text-slate-500 dark:text-slate-400 px-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span>203 DPI Monocromo</span>
                      <span>Rotación Code128 90°</span>
                    </div>
                  </div>

                  {/* Resumen del ítem mostrado */}
                  <div className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-700 dark:text-slate-200">SKU: {skuDeMuestra}</span>
                    {sampleItems.length > 1 && (
                      <span className="block text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                        +{sampleItems.length - 1} etiquetas adicionales en este lote
                      </span>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* BOTONES DE DISPARO RÁPIDO DENTRO DE PREVISUALIZACIÓN */}
            <div className="mt-3 shrink-0">
              {previewMode === 'ticket' ? (
                <button
                  type="button"
                  onClick={handleTestPrintTicket}
                  className="w-full py-2.5 px-3 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Imprimir Ticket Continuo (POS)</span>
                </button>
              ) : (
                <div className="space-y-1.5">
                  {isBleConnected ? (
                    <button
                      type="button"
                      disabled={isBlePrinting}
                      onClick={handleTestPrintMarklife}
                      className="w-full py-2.5 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>{isBlePrinting ? 'Imprimiendo en Marklife...' : 'Imprimir en Marklife P15'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!isBleSupported || isBleConnecting}
                      onClick={connectBle}
                      className="w-full py-2.5 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Bluetooth className="w-3.5 h-3.5" />
                      <span>Conectar Marklife P15 para Imprimir</span>
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>

        </div>

        {/* PIE DEL MODAL CON ACCIONES */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handleResetToSmartDefaults}
            className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              onClick={handleSaveAndClose}
              className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
            >
              Guardar Configuración
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
