import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, CheckCheck, Copy, MessageSquare, FileWarning, Printer, Download, Database, ShieldCheck, Building2 } from 'lucide-react';
import { StockCountReconciliationItem, StockCountSession } from '../../types';
import { formatLocaleNumber } from '../../utils/pureCalculations';

export type ReconciliationFilter = 'ALL' | 'DIF' | 'CUADRADO' | 'FALTANTE' | 'SOBRANTE' | 'NO_CATALOGADO';

export interface ReconciliationMetrics {
  totalContado: number;
  totalTeorico: number;
  diferenciaNeta: number;
  cuadrados: number;
  faltantes: number;
  sobrantes: number;
  noCatalogados: number;
  conDiferencia: number;
  cobertura: number;
}

export interface StockCountReconciliationViewProps {
  currentSession: StockCountSession;
  reconciliation: StockCountReconciliationItem[];
  filteredReconciliation: StockCountReconciliationItem[];
  reconciliationProviders: string[];
  reconciliationFilter: ReconciliationFilter;
  setReconciliationFilter: (filter: ReconciliationFilter) => void;
  selectedProviderFilter: string;
  setSelectedProviderFilter: (value: string) => void;
  metrics: ReconciliationMetrics;
  isSummaryCopied: boolean;
  isSyncingToSheet: boolean;
  handleUpdateAdjustment: (itemKey: string, value: number) => void;
  handleCopyReconciliationSummary: () => void;
  handleShareReconciliationWhatsApp: () => void;
  handleCopyDiscrepanciesReport: () => void;
  handlePrintSupplierTicket: () => void;
  handleExportExcel: (scope: 'FILTERED' | 'COUNTED_ONLY' | 'ALL') => void;
  handleSyncToVencimientos: () => void;
  handleSyncToAuditSheet: () => void;
}

/**
 * Vista de cuadratura física vs. teórica con virtualización.
 * Extraída de StockCountTerminal para mantener el terminal monolítico bajo control
 * (ver AGENTS.md sección 6: prohibido introducir componentes monolíticos).
 */
export const StockCountReconciliationView: React.FC<StockCountReconciliationViewProps> = ({
  currentSession,
  reconciliation,
  filteredReconciliation,
  reconciliationProviders,
  reconciliationFilter,
  setReconciliationFilter,
  selectedProviderFilter,
  setSelectedProviderFilter,
  metrics,
  isSummaryCopied,
  isSyncingToSheet,
  handleUpdateAdjustment,
  handleCopyReconciliationSummary,
  handleShareReconciliationWhatsApp,
  handleCopyDiscrepanciesReport,
  handlePrintSupplierTicket,
  handleExportExcel,
  handleSyncToVencimientos,
  handleSyncToAuditSheet
}) => {
  // Virtualización de la tabla de alto volumen (10.000+ ítems)
  const reconciliationTableContainerRef = useRef<HTMLDivElement>(null);
  const reconciliationRowVirtualizer = useVirtualizer({
    count: filteredReconciliation.length,
    getScrollElement: () => reconciliationTableContainerRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  const virtualReconciliationRows = reconciliationRowVirtualizer.getVirtualItems();
  const reconciliationPaddingTop = virtualReconciliationRows.length > 0 ? virtualReconciliationRows[0]?.start || 0 : 0;
  const reconciliationPaddingBottom =
    virtualReconciliationRows.length > 0
      ? reconciliationRowVirtualizer.getTotalSize() - (virtualReconciliationRows[virtualReconciliationRows.length - 1]?.end || 0)
      : 0;

  return (
<div className="flex-1 overflow-hidden flex flex-col p-3 sm:p-6">
  
  {/* KPI Cards Row */}
  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5 shrink-0">
    <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900">
      <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300 block">Total Físico</span>
      <span className="text-xl font-extrabold text-blue-900 dark:text-blue-100 mt-1 block">
        {formatLocaleNumber(metrics.totalContado)}
      </span>
      <span className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 block">Unidades contadas</span>
    </div>

    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
      <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Teórico</span>
      <span className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">
        {formatLocaleNumber(metrics.totalTeorico)}
      </span>
      <span className="text-[10px] text-slate-400 mt-0.5 block">Según hoja</span>
    </div>

    <div className={`p-3.5 rounded-xl border ${
      metrics.diferenciaNeta === 0
        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
        : metrics.diferenciaNeta > 0
          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300'
          : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
    }`}>
      <span className="text-[10px] font-bold uppercase block">Diferencia Neta</span>
      <span className="text-xl font-extrabold mt-1 block">
        {metrics.diferenciaNeta > 0 ? `+${formatLocaleNumber(metrics.diferenciaNeta)}` : formatLocaleNumber(metrics.diferenciaNeta)}
      </span>
      <span className="text-[10px] mt-0.5 block">Físico - Teórico</span>
    </div>

    <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900">
      <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block">Cuadrados</span>
      <span className="text-xl font-extrabold text-emerald-900 dark:text-emerald-100 mt-1 block">
        {metrics.cuadrados}
      </span>
      <span className="text-[10px] text-emerald-600 mt-0.5 block">Exactitud 100%</span>
    </div>

    <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900">
      <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300 block">Faltantes</span>
      <span className="text-xl font-extrabold text-rose-900 dark:text-rose-100 mt-1 block">
        {metrics.faltantes}
      </span>
      <span className="text-[10px] text-rose-600 mt-0.5 block">Menor a teórico</span>
    </div>

    <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900">
      <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block">Sobrantes</span>
      <span className="text-xl font-extrabold text-amber-900 dark:text-amber-100 mt-1 block">
        {metrics.sobrantes + metrics.noCatalogados}
      </span>
      <span className="text-[10px] text-amber-600 mt-0.5 block">Mayor a teórico</span>
    </div>
  </div>

  {/* Filter Tabs & Actions Bar */}
  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-3 shrink-0">
    <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
      <button
        onClick={() => setReconciliationFilter('ALL')}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
          reconciliationFilter === 'ALL'
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
        }`}
      >
        Todos ({reconciliation.length})
      </button>

      <button
        onClick={() => setReconciliationFilter('DIF')}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
          reconciliationFilter === 'DIF'
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
        }`}
      >
        Con Diferencias ({metrics.conDiferencia})
      </button>

      <button
        onClick={() => setReconciliationFilter('CUADRADO')}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
          reconciliationFilter === 'CUADRADO'
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
        }`}
      >
        Cuadrados ({metrics.cuadrados})
      </button>

      {/* Proveedor Audit Filter Dropdown */}
      <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 shadow-xs ml-1">
        <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <select
          value={selectedProviderFilter}
          onChange={(e) => setSelectedProviderFilter(e.target.value)}
          className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer py-0.5 max-w-[160px] truncate"
          title="Filtrar auditoría focalizada por proveedor"
        >
          <option value="ALL">Proveedores: Todos ({reconciliationProviders.length})</option>
          {reconciliationProviders.map(prov => (
            <option key={prov} value={prov}>
              {prov}
            </option>
          ))}
        </select>
      </div>
    </div>

    <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
      {/* Executive Summary & WhatsApp Share */}
      <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5 shadow-sm">
        <button
          type="button"
          onClick={handleCopyReconciliationSummary}
          title="Copiar resumen ejecutivo de auditoría al portapapeles"
          className="px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
        >
          {isSummaryCopied ? <CheckCheck className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-blue-600" />}
          <span className="hidden md:inline">{isSummaryCopied ? '¡Copiado!' : 'Resumen'}</span>
        </button>

        <button
          type="button"
          onClick={handleShareReconciliationWhatsApp}
          title="Enviar resumen de cuadratura por WhatsApp a supervisores o equipo"
          className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors cursor-pointer border-l border-slate-200 dark:border-slate-700"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleCopyDiscrepanciesReport}
          title="Copiar tabla de diferencias (faltantes y sobrantes) para reportar en EVENTS"
          className="px-2 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer border-l border-slate-200 dark:border-slate-700 flex items-center gap-1"
        >
          <FileWarning className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Acta Diferencias</span>
        </button>
      </div>

      {/* Print Supplier Audit Ticket Button */}
      <button
        type="button"
        onClick={handlePrintSupplierTicket}
        title={`Imprimir ticket térmico para ${selectedProviderFilter === 'ALL' ? 'todos los proveedores' : selectedProviderFilter}`}
        className="px-2.5 py-1.5 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
      >
        <Printer className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
        <span className="hidden sm:inline">Ticket Proveedor</span>
      </button>

      <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => handleExportExcel('FILTERED')}
          title={`Exportar vista actual filtrada (${filteredReconciliation.length} registros)`}
          className="px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-600" />
          <span>Exportar ({filteredReconciliation.length})</span>
        </button>

        {reconciliation.filter(r => r.contado > 0).length > 0 && reconciliation.filter(r => r.contado > 0).length !== filteredReconciliation.length && (
          <button
            type="button"
            onClick={() => handleExportExcel('COUNTED_ONLY')}
            title="Exportar únicamente los productos con conteo físico registrado"
            className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md transition-colors cursor-pointer border-l border-slate-200 dark:border-slate-700 ml-1"
          >
            Solo Contados ({reconciliation.filter(r => r.contado > 0).length})
          </button>
        )}

        {reconciliation.length > filteredReconciliation.length && (
          <button
            type="button"
            onClick={() => handleExportExcel('ALL')}
            title={`Exportar padrón teórico completo (${reconciliation.length} registros)`}
            className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer border-l border-slate-200 dark:border-slate-700 ml-1"
          >
            Todo ({reconciliation.length})
          </button>
        )}
      </div>

      {/* If session has expiry dates, offer VENCIMIENTOS sync. Always offer dedicated AUDITORIA sheet save */}
      {currentSession.requiereVencimiento ? (
        <button
          onClick={handleSyncToVencimientos}
          disabled={isSyncingToSheet}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          title="Guarda los registros con fecha de vencimiento y CU_VC en la pestaña VENCIMIENTOS"
        >
          <Database className="w-4 h-4" />
          <span>{isSyncingToSheet ? 'Sincronizando...' : 'Sincronizar a VENCIMIENTOS'}</span>
        </button>
      ) : (
        <button
          onClick={handleSyncToAuditSheet}
          disabled={isSyncingToSheet}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          title="Guarda esta sesión de conteo en la pestaña dedicada '_AUDITORIA_INVENTARIO' de Google Sheets (No modifica VENCIMIENTOS)"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{isSyncingToSheet ? 'Guardando...' : 'Guardar en _AUDITORIA_INVENTARIO'}</span>
        </button>
      )}

      {/* Additional option to save to dedicated audit sheet even if expiration date is active */}
      {currentSession.requiereVencimiento && (
        <button
          onClick={handleSyncToAuditSheet}
          disabled={isSyncingToSheet}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer border border-slate-200 dark:border-slate-700"
          title="Guarda también un registro en la hoja de auditoría general"
        >
          <ShieldCheck className="w-4 h-4 text-indigo-500" />
          <span>Guardar en Auditoría</span>
        </button>
      )}
    </div>
  </div>

  {/* Reconciliation View: Mobile Cards (< md) vs Virtualized Table (>= md) */}
  
  {/* Mobile Card List (< md) */}
  <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 md:hidden pb-12">
    {filteredReconciliation.length === 0 ? (
      <div className="p-8 text-center text-slate-400">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-500" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No hay registros con este filtro</p>
      </div>
    ) : (
      filteredReconciliation.map(item => (
        <div
          key={item.itemKey}
          className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-black text-sm text-blue-600 dark:text-blue-400">{item.sku}</span>
                {currentSession.requiereVencimiento && item.mm && item.yyyy && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                    {item.mm}/{item.yyyy}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 mt-0.5">
                {item.descripcion}
              </p>
            </div>

            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase shrink-0 ${
              item.estado === 'CUADRADO' ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300' :
              item.estado === 'FALTANTE' ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300' :
              item.estado === 'SOBRANTE' ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300' :
              'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300'
            }`}>
              {item.estado === 'NO_CATALOGADO' ? 'No en Hoja' : item.estado}
            </span>
          </div>

          {/* Stock comparison grid */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 text-center text-xs">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 block">Teórico</span>
              <span className="font-black text-slate-700 dark:text-slate-300 font-mono">
                {formatLocaleNumber(item.teorico + (item.ajusteMovimiento || 0))}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 block">Físico</span>
              <span className="font-black text-blue-600 dark:text-blue-400 font-mono">
                {formatLocaleNumber(item.contado)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 block">Diferencia</span>
              <span className={`font-black font-mono ${
                item.diferencia === 0 ? 'text-emerald-600' :
                item.diferencia < 0 ? 'text-rose-600' : 'text-amber-600'
              }`}>
                {item.diferencia > 0 ? `+${formatLocaleNumber(item.diferencia)}` : formatLocaleNumber(item.diferencia)}
              </span>
            </div>
          </div>

          {/* Movement adjustment if not blind mode */}
          {currentSession.modo !== 'BLIND' && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-700 text-xs">
              <span className="text-[11px] text-slate-500 font-medium">Ajuste Flujo (Venta/Recep):</span>
              <input
                type="number"
                value={item.ajusteMovimiento || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  handleUpdateAdjustment(item.itemKey, val);
                }}
                placeholder="0"
                className="w-20 px-2 py-1 text-center font-mono font-bold text-xs bg-slate-100 dark:bg-slate-700 rounded-lg outline-none text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600"
              />
            </div>
          )}
        </div>
      ))
    )}
  </div>

  {/* Desktop Reconciliation Virtualized Table (>= md) */}
  <div ref={reconciliationTableContainerRef} className="hidden md:block flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 border-b border-slate-200 dark:border-slate-700 z-10">
        <tr>
          <th className="p-3 font-bold text-slate-600 dark:text-slate-400">SKU</th>
          <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Descripción</th>
          {currentSession.requiereVencimiento && (
            <>
              <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Mes/Año</th>
              <th className="p-3 font-bold text-slate-600 dark:text-slate-400">CU_VC</th>
            </>
          )}
          {currentSession.modo !== 'BLIND' ? (
            <>
              <th className="p-3 font-bold text-slate-600 dark:text-slate-400 text-right" title="Stock teórico capturado al iniciar la sesión">Teórico Base</th>
              <th className="p-3 font-bold text-slate-600 dark:text-slate-400 text-center" title="Ajuste por ventas (- unidades) o recepciones (+ unidades) durante el conteo">Ajuste Flujo (Venta/Recep)</th>
              <th className="p-3 font-bold text-slate-600 dark:text-slate-400 text-right" title="Teórico Base + Ajuste de Flujo">Teórico Ajustado</th>
            </>
          ) : (
            <th className="p-3 font-bold text-slate-600 dark:text-slate-400 text-right">Teórico</th>
          )}
          <th className="p-3 font-bold text-slate-600 dark:text-slate-400 text-right">Físico</th>
          <th className="p-3 font-bold text-slate-600 dark:text-slate-400 text-right">Diferencia</th>
          <th className="p-3 font-bold text-slate-600 dark:text-slate-400 text-center">Estado</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {reconciliationPaddingTop > 0 && (
          <tr>
            <td style={{ height: `${reconciliationPaddingTop}px` }} colSpan={currentSession.requiereVencimiento ? 9 : 7} />
          </tr>
        )}
        {virtualReconciliationRows.map((virtualRow) => {
          const item = filteredReconciliation[virtualRow.index];
          if (!item) return null;

          return (
            <tr 
              key={item.itemKey + virtualRow.index} 
              ref={reconciliationRowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{item.sku}</td>
              <td className="p-3 font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">{item.descripcion}</td>
              {currentSession.requiereVencimiento && (
                <>
                  <td className="p-3 font-semibold text-slate-600 dark:text-slate-400">
                    {item.mm && item.yyyy ? `${item.mm}/${item.yyyy}` : '-'}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {item.cu_vc || '-'}
                  </td>
                </>
              )}
              {currentSession.modo !== 'BLIND' ? (
                <>
                  <td className="p-3 text-right font-semibold text-slate-500">
                    {formatLocaleNumber(item.teorico)}
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      value={item.ajusteMovimiento || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        handleUpdateAdjustment(item.itemKey, val);
                      }}
                      placeholder="0"
                      title="Ajuste por ventas (- unidades) o recepciones (+ unidades) durante el conteo"
                      className="w-20 px-2 py-1 text-center font-mono font-bold text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 text-slate-800 dark:text-slate-100"
                    />
                  </td>
                  <td className="p-3 text-right font-semibold text-slate-600 dark:text-slate-300">
                    {formatLocaleNumber(item.teorico + item.ajusteMovimiento)}
                  </td>
                </>
              ) : (
                <td className="p-3 text-right font-semibold text-slate-500">{formatLocaleNumber(item.teorico)}</td>
              )}
              <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-100">{formatLocaleNumber(item.contado)}</td>
              <td className={`p-3 text-right font-extrabold ${
                item.diferencia === 0 ? 'text-emerald-600' :
                item.diferencia < 0 ? 'text-rose-600' : 'text-amber-600'
              }`}>
                {item.diferencia > 0 ? `+${formatLocaleNumber(item.diferencia)}` : formatLocaleNumber(item.diferencia)}
              </td>
              <td className="p-3 text-center">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  item.estado === 'CUADRADO' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300' :
                  item.estado === 'FALTANTE' ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300' :
                  item.estado === 'SOBRANTE' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' :
                  'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                }`}>
                  {item.estado === 'NO_CATALOGADO' ? 'No en Hoja' : item.estado}
                </span>
              </td>
            </tr>
          );
        })}
        {reconciliationPaddingBottom > 0 && (
          <tr>
            <td style={{ height: `${reconciliationPaddingBottom}px` }} colSpan={currentSession.requiereVencimiento ? 9 : 7} />
          </tr>
        )}
      </tbody>
    </table>
  </div>

</div>
  );
};
