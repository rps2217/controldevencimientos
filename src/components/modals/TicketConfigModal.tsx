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
  Scissors
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
  const [activeTab, setActiveTab] = useState<'columns' | 'general' | 'preview'>('columns');

  // Track opening state to avoid resetting local state when parent re-renders
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const normalized = normalizeTicketConfig(config, headers, activeView);
      setLocalColumns(normalized.columns);
      setLocalGeneral(normalized.general || {
        title: activeView === 'events' ? 'REGISTRO DE INCIDENCIAS' : 'REPORTE VENCIMIENTOS',
        paperWidth: '80mm',
        orientation: 'portrait',
        showDateTime: true,
        showTotalCount: true,
        footerText: '--- FIN DEL REPORTE ---'
      });
      setColumnSearch('');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, headers, activeView, config]);

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
    setLocalGeneral(defaults.general || {
      title: activeView === 'events' ? 'REGISTRO DE INCIDENCIAS' : 'REPORTE VENCIMIENTOS',
      paperWidth: '80mm',
      showDateTime: true,
      showTotalCount: true,
      footerText: '--- FIN DEL REPORTE ---'
    });
  };

  const filteredHeaders = useMemo(() => {
    if (!columnSearch.trim()) return headers;
    const term = columnSearch.toLowerCase();
    return headers.filter(h => h.toLowerCase().includes(term));
  }, [headers, columnSearch]);

  const visibleCount = useMemo(() => {
    return Object.values(localColumns).filter((c: TicketColumnConfig) => c && c.show).length;
  }, [localColumns]);

  // Sample item for live thermal receipt preview
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

  if (!isOpen) return null;

  const handleSaveAndClose = () => {
    onSave(activeView, {
      columns: localColumns,
      general: localGeneral
    });
    onClose();
  };

  // Test Print function directly from the modal
  const handleTestPrint = () => {
    // Temporarily save to trigger print
    onSave(activeView, {
      columns: localColumns,
      general: localGeneral
    });

    executeThermalPrint({
      elementId: 'thermal-ticket-root',
      paperWidth: localGeneral.paperWidth || '80mm',
      orientation: localGeneral.orientation || 'portrait',
      cutMarginMm: localGeneral.cutMarginMm !== undefined ? Number(localGeneral.cutMarginMm) : 2
    });
  };

  // Helper for live preview column values
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

  const primaryHeaders = new Set([skuHeader, descHeader, dateHeader, loteHeader, cantHeader].filter(Boolean));
  const otherConfiguredHeaders = headers.filter(h => !primaryHeaders.has(h) && localColumns[h]?.show);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  Configuración de Ticket Térmico
                </h2>
                <span className="bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800/60">
                  Vista: {activeView}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Personaliza las columnas, tipografías y formato de impresión continua (80mm/58mm)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Navigation Tabs (visible only on small screens) */}
        <div className="flex lg:hidden border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 p-1.5 gap-1.5 shrink-0">
          <button
            onClick={() => setActiveTab('columns')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'columns' 
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Columnas ({visibleCount})
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'general' 
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Formato
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'preview' 
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Previsualizar
          </button>
        </div>

        {/* Main Body (Split Grid on Desktop: Config Left, Live Ticket Right) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-0">
          
          {/* LEFT COLUMN: Column & Layout Settings */}
          <div className={`lg:col-span-7 flex flex-col overflow-hidden border-r border-slate-200 dark:border-slate-800 ${
            activeTab === 'preview' ? 'hidden lg:flex' : 'flex'
          }`}>
            
            {/* Toolbar and Quick Actions */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/20 space-y-3 shrink-0">
              
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleResetToSmartDefaults}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors shadow-2xs"
                    title="Restablecer columnas recomendadas automáticamente"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    Recomendados
                  </button>
                  <button
                    onClick={() => handleSelectAll(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                    Todo
                  </button>
                  <button
                    onClick={() => handleSelectAll(false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    Ninguno
                  </button>
                </div>

                <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  <span className="text-blue-600 dark:text-blue-400">{visibleCount}</span> de {headers.length} columnas
                </div>
              </div>

              {/* Column Search Box */}
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

            {/* Scrollable Column Configuration List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredHeaders.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No se encontraron columnas que coincidan con &quot;{columnSearch}&quot;
                </div>
              ) : (
                filteredHeaders.map(header => {
                  const colConfig = localColumns[header] || { show: false, size: 10, bold: false };
                  const isPrimary = findColumnBySemantic([header], 'sku') || 
                                    findColumnBySemantic([header], 'descripcion') || 
                                    findColumnBySemantic([header], 'fecha_vc') || 
                                    findColumnBySemantic([header], 'cantidad') ||
                                    findColumnBySemantic([header], 'lote');

                  return (
                    <div 
                      key={header} 
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                        colConfig.show
                          ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/60 shadow-2xs'
                          : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-700/50 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer flex-1 overflow-hidden pr-2">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 shrink-0 cursor-pointer"
                          checked={colConfig.show}
                          onChange={(e) => handleUpdateColumn(header, { show: e.target.checked })}
                        />
                        <div className="min-w-0 flex items-center gap-1.5 truncate">
                          <span className={`text-xs font-bold truncate ${
                            colConfig.show 
                              ? 'text-slate-800 dark:text-slate-100' 
                              : 'text-slate-500 dark:text-slate-400'
                          }`} title={header}>
                            {header}
                          </span>
                          {isPrimary && (
                            <span className="text-[9px] uppercase font-extrabold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-sm shrink-0">
                              Clave
                            </span>
                          )}
                        </div>
                      </label>
                      
                      {/* Typography Controls */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5 shadow-2xs">
                          <span className="text-[10px] text-slate-400 font-medium">Tamaño:</span>
                          <input 
                            type="number" 
                            className="w-10 px-1 py-0.5 text-xs text-center font-bold border-0 bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none"
                            value={colConfig.size}
                            onChange={(e) => handleUpdateColumn(header, { size: Math.max(8, Math.min(24, parseInt(e.target.value, 10) || 10)) })}
                            min={8} 
                            max={24}
                          />
                          <span className="text-[10px] text-slate-400">px</span>
                        </div>
                        
                        <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 shadow-2xs">
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

            {/* General Format Settings (Collapsible or bottom section) */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3 shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span>Ajustes Generales del Ticket</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    Ancho de Papel
                  </label>
                  <div className="flex rounded-xl bg-slate-200 dark:bg-slate-700 p-0.5">
                    <button
                      type="button"
                      onClick={() => setLocalGeneral(prev => ({ ...prev, paperWidth: '80mm' }))}
                      className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                        localGeneral.paperWidth === '80mm'
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      80mm (Estándar)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalGeneral(prev => ({ ...prev, paperWidth: '58mm' }))}
                      className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                        localGeneral.paperWidth === '58mm'
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      58mm (Compacto)
                    </button>
                  </div>
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
                      className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        (localGeneral.orientation || 'portrait') === 'portrait'
                          ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <span className="inline-block w-2.5 h-3.5 border-2 border-current rounded-xs"></span>
                      <span>Vertical (Retrato)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalGeneral(prev => ({ ...prev, orientation: 'landscape' }))}
                      className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                        localGeneral.orientation === 'landscape'
                          ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <span className="inline-block w-3.5 h-2.5 border-2 border-current rounded-xs"></span>
                      <span>Horizontal (Paisaje)</span>
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
                        className={`py-1 px-1.5 text-center rounded-lg transition-all text-xs font-bold ${
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
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Incluir Fecha y Hora</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={localGeneral.showTotalCount ?? true}
                    onChange={(e) => setLocalGeneral(prev => ({ ...prev, showTotalCount: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Incluir Total de Registros</span>
                </label>
              </div>

              {/* Barcode Option before Record Jump */}
              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 mt-0.5">
                      <Barcode className="w-4 h-4" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localGeneral.includeSkuBarcode ?? false}
                          onChange={(e) => setLocalGeneral(prev => ({ ...prev, includeSkuBarcode: e.target.checked }))}
                          className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Código de Barras de SKU por Registro</span>
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Genera el código 1D (Code 128) antes del salto de cada producto para escaneo láser en terreno con alto discreto (~8 mm).
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
                            className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all ${
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
                        className="w-3 h-3 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Texto bajo barras</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Real-Time Simulated Thermal Receipt Preview */}
          <div className={`lg:col-span-5 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 ${
            activeTab === 'columns' || activeTab === 'general' ? 'hidden lg:flex' : 'flex'
          }`}>
            
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Vista Previa Térmica ({localGeneral.paperWidth || '80mm'})
                </span>
              </div>
              <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold px-2 py-0.5 rounded-full">
                Simulación
              </span>
            </div>

            {/* Thermal Receipt Visual Container */}
            <div className="flex-1 overflow-y-auto flex items-start justify-center p-2">
              <div 
                className={`bg-white text-black font-mono leading-tight shadow-xl p-4 border border-slate-300 rounded-sm transition-all duration-200 select-none ${
                  localGeneral.paperWidth === '58mm' ? 'w-[56mm] max-w-[240px]' : 'w-[76mm] max-w-[320px]'
                }`}
                style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.12))' }}
              >
                {/* Header */}
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

                {/* Simulated Items (1 or 2 items) */}
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
                        {/* SKU + Description */}
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

                        {/* Batch & Quantity */}
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

                        {/* Other custom fields */}
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

                        {/* Expiration Date */}
                        {showDate && dateVal && (
                          <div 
                            style={{ fontSize: `${dateConf?.size || 11}px` }}
                            className={`mt-1 ${dateConf?.bold ? 'font-bold' : 'font-medium'}`}
                          >
                            <span>F.Venc: </span>
                            <span>{dateVal}</span>
                          </div>
                        )}

                        {/* Barcode Preview before Item Jump */}
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

                {/* Footer */}
                <div 
                  className="text-center border-t border-dashed border-black mt-2 pt-1 text-[10px] font-bold"
                  style={{ paddingBottom: `${localGeneral.cutMarginMm ?? 2}mm` }}
                >
                  {localGeneral.footerText || '--- FIN DEL REPORTE ---'}
                </div>

                {/* Simulated Cut Indicator */}
                <div className="mt-2 pt-1 border-t-2 border-dotted border-rose-500/60 flex items-center justify-center gap-1.5 text-[9px] font-bold text-rose-600">
                  <Scissors className="w-3 h-3 rotate-90" />
                  <span>CORTE TÉRMICO {(localGeneral.cutMarginMm ?? 2) > 0 ? `(+${localGeneral.cutMarginMm ?? 2}mm)` : '(AL RAS)'}</span>
                </div>
              </div>
            </div>

            {/* Test Print button inside preview */}
            <div className="mt-3 shrink-0">
              <button
                type="button"
                onClick={handleTestPrint}
                className="w-full py-2 px-3 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-500" />
                <span>Imprimir Ticket de Prueba</span>
              </button>
            </div>

          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handleResetToSmartDefaults}
            className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveAndClose}
              className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition-all shadow-md shadow-blue-500/20"
            >
              Guardar Configuración
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
