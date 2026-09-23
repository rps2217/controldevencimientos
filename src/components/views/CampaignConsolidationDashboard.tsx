import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Download, RefreshCw, UploadCloud, FileSpreadsheet, Calendar, Layers, Plus, Store, Check, RotateCcw, Zap, Cloud, Database, Loader2, Scan, MoreVertical } from 'lucide-react';
import { InventoryCampaign, CampaignConsolidationMatrix, CampaignAuditRow, StockCountSession, SheetRecord } from '../../types';
import { computeCampaignConsolidationMatrix, importPharmacySnapshotToCampaign, markSkuAsClosedInCampaign, reopenSkuInCampaign, setCampaignManualSalesAdjustment, exportCampaignReportToExcel, exportDiscrepanciesForRecountSheet, createNewCampaign, saveCampaignsToStorage, buildAuditRowsFromCampaignMatrix } from '../../utils/campaignUtils';
import { saveStockCountSessionsToStorage, playBeep } from '../../utils/stockCountUtils';
import { saveCampaignsToCloud, syncCampaignsWithCloud, saveAuditRowsToDedicatedSheet } from '../../lib/sheets';
import { formatLocaleNumber } from '../../utils/pureCalculations';
import { resolveActiveCampaign, collectAllAuditRows, getAuditProviders, filterAuditRows } from '../../utils/campaignAggregation';
import { parseDelimitedText, detectDelimiter } from '../../utils/universalImporter';
import { CampaignQuickScanModal } from '../modals/CampaignQuickScanModal';
import { CampaignMatrixTable } from '../campaign/CampaignMatrixTable';
import { CampaignKpiSemaphore } from '../campaign/CampaignKpiSemaphore';
import { getErrorMessage } from '../../utils/pureCalculations';

import { STORAGE_KEYS } from '../../utils/appStorage';
interface CampaignConsolidationDashboardProps {
  campaigns: InventoryCampaign[];
  activeCampaignId: string | null;
  sessions: StockCountSession[];
  onUpdateCampaigns: (campaigns: InventoryCampaign[]) => void;
  onSelectCampaign: (id: string) => void;
  onStartTargetedRecount: (sessionName: string, skus: string[]) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
  onSwitchToTerminal: (sku?: string) => void;
  onUpdateSessions?: (sessions: StockCountSession[]) => void;
  onNavigateToSessionList?: () => void;
}

export const CampaignConsolidationDashboard: React.FC<CampaignConsolidationDashboardProps> = ({
  campaigns,
  activeCampaignId,
  sessions,
  onUpdateCampaigns,
  onSelectCampaign,
  onStartTargetedRecount,
  showToast,
  onSwitchToTerminal,
  onUpdateSessions,
  onNavigateToSessionList
}) => {
  // Active tab inside Campaign view: 'MATRIX' | 'SNAPSHOT_UPLOAD' | 'CAMPAIGN_SETTINGS'
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'SNAPSHOT_UPLOAD' | 'CAMPAIGN_SETTINGS'>('MATRIX');
  
  // Status filter for Matrix: 'ALL' | 'CUADRADO' | 'DISCREPANCIA' | 'NUNCA_PISTOLEADO' | 'HALLAZGO'
  const [matrixFilter, setMatrixFilter] = useState<'ALL' | 'VALIDADO_OK' | 'DISCREPANCIA' | 'NUNCA_PISTOLEADO' | 'HALLAZGO'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('ALL');
  
  // New campaign modal / creation form states
  const [isNewCampaignOpen, setIsNewCampaignOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignLocal, setNewCampaignLocal] = useState('');

  // Quick Scan modal state & Tools menu state
  const [isQuickScanModalOpen, setIsQuickScanModalOpen] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);

  // Snapshot upload states
  const [pastedSnapshotText, setPastedSnapshotText] = useState('');
  const [isProcessingSnapshot, setIsProcessingSnapshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cloud persistence states
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [isSavingToAuditSheet, setIsSavingToAuditSheet] = useState(false);
  const [lastCloudSyncDate, setLastCloudSyncDate] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.LAST_CAMPAIGN_CLOUD_SYNC);
    } catch {
      return null;
    }
  });

  // Background Auto-Sync to Google Sheets / Cloud so mobile PDAs get updates instantly
  const autoSyncCampaignsToCloud = async (camps: InventoryCampaign[], actId: string | null) => {
    try {
      await saveCampaignsToCloud({
        campaigns: camps,
        activeCampaignId: actId,
        sessions
      });
      const nowStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      setLastCloudSyncDate(nowStr);
      try {
        localStorage.setItem(STORAGE_KEYS.LAST_CAMPAIGN_CLOUD_SYNC, nowStr);
      } catch {}
    } catch (err) {
      console.warn('[Cloud AutoSync] Background sync to Google Sheets error:', err);
    }
  };

  // Auto-sync bidirectional on mount to consolidate fresh counts and ERP snapshots from other devices
  useEffect(() => {
    syncCampaignsWithCloud({
      campaigns,
      activeCampaignId,
      sessions
    }).then(res => {
      if (res && res.success && res.mergedCampaigns.length > 0) {
        onUpdateCampaigns(res.mergedCampaigns);
        if (onUpdateSessions) {
          onUpdateSessions(res.mergedSessions);
        }
        if (res.activeCampaignId) {
          onSelectCampaign(res.activeCampaignId);
        }
        const nowStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        setLastCloudSyncDate(nowStr);
        try {
          localStorage.setItem(STORAGE_KEYS.LAST_CAMPAIGN_CLOUD_SYNC, nowStr);
        } catch {}
      }
    }).catch((err) => {
      console.warn('[Dashboard AutoSync] Initial sync notice:', err);
    });
  }, []);

  // Active campaign entity
  const activeCampaign = useMemo(() => {
    return resolveActiveCampaign(campaigns, activeCampaignId);
  }, [campaigns, activeCampaignId]);

  // Computed live matrix for the active campaign
  const matrix: CampaignConsolidationMatrix | null = useMemo(() => {
    if (!activeCampaign) return null;
    return computeCampaignConsolidationMatrix(activeCampaign, sessions);
  }, [activeCampaign, sessions]);

  // All audit rows across all categories
  const allAuditRows = useMemo<CampaignAuditRow[]>(() => {
    return collectAllAuditRows(matrix);
  }, [matrix]);

  // Unique list of providers in snapshot for filter dropdown
  const providerList = useMemo(() => {
    return getAuditProviders(allAuditRows);
  }, [allAuditRows]);

  // Filtered rows for the matrix table
  const displayedRows = useMemo(() => {
    return filterAuditRows(matrix, matrixFilter, selectedProvider, searchTerm);
  }, [matrix, matrixFilter, selectedProvider, searchTerm]);

  // Handle creating a new campaign
  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) {
      showToast('Por favor ingresa un nombre para la campaña', 'warning');
      return;
    }

    const newCamp = createNewCampaign(newCampaignName, newCampaignLocal);
    const updated = [newCamp, ...campaigns];
    onUpdateCampaigns(updated);
    onSelectCampaign(newCamp.id);
    autoSyncCampaignsToCloud(updated, newCamp.id);
    setIsNewCampaignOpen(false);
    setNewCampaignName('');
    setNewCampaignLocal('');
    showToast(`Campaña "${newCamp.nombre}" creada y respaldada en la nube`, 'success');
  };

  // Handle single SKU audit closure
  const handleToggleCloseSku = (row: CampaignAuditRow) => {
    if (!activeCampaign) return;
    if (row.esCerrado) {
      const updated = reopenSkuInCampaign(activeCampaign, row.sku);
      const allUpdated = campaigns.map(c => c.id === updated.id ? updated : c);
      onUpdateCampaigns(allUpdated);
      autoSyncCampaignsToCloud(allUpdated, activeCampaign.id);
      playBeep('skip');
      showToast(`SKU ${row.sku} reabierto para revisión`, 'info');
    } else {
      const updated = markSkuAsClosedInCampaign(
        activeCampaign, 
        row.sku, 
        row.stockTeorico, 
        row.stockFisicoTotal, 
        'Validado y cuadrado por operario'
      );
      const allUpdated = campaigns.map(c => c.id === updated.id ? updated : c);
      onUpdateCampaigns(allUpdated);
      autoSyncCampaignsToCloud(allUpdated, activeCampaign.id);
      playBeep('success');
      showToast(`SKU ${row.sku} validado y marcado como cerrado`, 'success');
    }
  };

  // Handle manual sales adjustment for a SKU
  const handleUpdateSalesAdjustment = (sku: string, val: number) => {
    if (!activeCampaign) return;
    const updated = setCampaignManualSalesAdjustment(activeCampaign, sku, val);
    const allUpdated = campaigns.map(c => c.id === updated.id ? updated : c);
    onUpdateCampaigns(allUpdated);
    autoSyncCampaignsToCloud(allUpdated, activeCampaign.id);
  };

  // Handle processing pasted snapshot text from ERP Excel/CSV
  const handleProcessPastedSnapshot = () => {
    if (!activeCampaign) {
      showToast('Crea o selecciona una campaña primero', 'warning');
      return;
    }
    if (!pastedSnapshotText.trim()) {
      showToast('Pega los datos del reporte de stock del ERP primero', 'warning');
      return;
    }

    try {
      setIsProcessingSnapshot(true);
      const delimiter = detectDelimiter(pastedSnapshotText);
      const { headers, rows } = parseDelimitedText(pastedSnapshotText, delimiter);

      if (rows.length === 0) {
        showToast('No se detectaron filas válidas en el texto pegado', 'error');
        return;
      }

      const { updatedCampaign, totalImported, newSkus, updatedSkus } = importPharmacySnapshotToCampaign(
        activeCampaign,
        rows,
        headers,
        `Snapshot_Pegado_${new Date().toLocaleDateString('es-CL')}`
      );

      const allUpdated = campaigns.map(c => c.id === updatedCampaign.id ? updatedCampaign : c);
      onUpdateCampaigns(allUpdated);
      autoSyncCampaignsToCloud(allUpdated, activeCampaign.id);
      setPastedSnapshotText('');
      setActiveTab('MATRIX');
      playBeep('success');
      showToast(
        `Se procesaron ${totalImported} SKUs (${newSkus} nuevos incorporados, ${updatedSkus} actualizados) • Sincronizado con Dispositivos Móviles`,
        'success',
        'Snapshot ERP Cargado y en Nube'
      );
    } catch (e: unknown) {
      showToast(`Error al procesar el snapshot: ${getErrorMessage(e)}`, 'error');
    } finally {
      setIsProcessingSnapshot(false);
    }
  };

  // Handle file drop / upload (Supports Excel .xlsx, .xls, .csv, .txt, .tsv)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCampaign) return;

    setIsProcessingSnapshot(true);
    try {
      let parsedHeaders: string[] = [];
      let parsedRows: SheetRecord[] | string[][] = [];

      const fileNameLower = file.name.toLowerCase();
      const isExcel = fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls');

      if (isExcel) {
        const buffer = await file.arrayBuffer();
        const { parseExcelBuffer } = await import('../../utils/universalImporter');
        const excelResult = await parseExcelBuffer(buffer);
        parsedHeaders = excelResult.headers;
        parsedRows = excelResult.rows;
      } else {
        const text = await file.text();
        const delimiter = detectDelimiter(text);
        const delimitedResult = parseDelimitedText(text, delimiter);
        parsedHeaders = delimitedResult.headers;
        parsedRows = delimitedResult.rows;
      }

      if (parsedRows.length === 0) {
        showToast('El archivo no contiene filas o tiene un formato no reconocido', 'error');
        return;
      }

      const { updatedCampaign, totalImported, newSkus, updatedSkus } = importPharmacySnapshotToCampaign(
        activeCampaign,
        parsedRows,
        parsedHeaders,
        file.name
      );

      const allUpdated = campaigns.map(c => c.id === updatedCampaign.id ? updatedCampaign : c);
      onUpdateCampaigns(allUpdated);
      setActiveTab('MATRIX');
      playBeep('success');
      showToast(
        `Archivo "${file.name}" cargado: ${totalImported} SKUs (${newSkus} nuevos, ${updatedSkus} actualizados). Sincronizando en la nube...`,
        'info',
        'Snapshot Cargado'
      );

      try {
        await saveCampaignsToCloud({
          campaigns: allUpdated,
          activeCampaignId: activeCampaign.id,
          sessions
        });
        const nowStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        setLastCloudSyncDate(nowStr);
        try {
          localStorage.setItem(STORAGE_KEYS.LAST_CAMPAIGN_CLOUD_SYNC, nowStr);
        } catch {}
        showToast(
          `¡Foto ERP sincronizada en la nube! Visible inmediatamente en tu dispositivo móvil / PDA.`,
          'success',
          'Sincronizado'
        );
      } catch (cloudErr: unknown) {
        showToast(`Snapshot guardado localmente. Error en respaldo nube: ${getErrorMessage(cloudErr)}`, 'warning');
      }
    } catch (err: unknown) {
      showToast(`Error al leer archivo: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsProcessingSnapshot(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Export full campaign report
  const handleExportFullReport = async () => {
    if (!matrix || !activeCampaign) return;
    try {
      await exportCampaignReportToExcel(matrix, activeCampaign);
      playBeep('success');
      showToast('Reporte consolidado de campaña descargado en Excel (.xlsx)', 'success');
    } catch (e: unknown) {
      showToast(`Error al exportar: ${getErrorMessage(e)}`, 'error');
    }
  };

  // Export discrepant items sheet for 2nd physical count
  const handleExportDiscrepanciesSheet = async () => {
    if (!matrix || !activeCampaign) return;
    if (matrix.discrepancias.length === 0) {
      showToast('No hay discrepancias registradas en la campaña.', 'info');
      return;
    }
    try {
      await exportDiscrepanciesForRecountSheet(matrix, activeCampaign.nombre);
      playBeep('success');
      showToast('Planilla de 2do conteo descargada en Excel (.xlsx)', 'success');
    } catch (e: unknown) {
      showToast(`Error al exportar: ${getErrorMessage(e)}`, 'error');
    }
  };

  // Start targeted 2nd round count in terminal
  const handleLaunchTargetedRecount = () => {
    if (!matrix || !activeCampaign) return;
    if (matrix.discrepancias.length === 0) {
      showToast('No hay discrepancias pendientes para recontar.', 'info');
      return;
    }
    const skus = matrix.discrepancias.map(r => r.sku);
    const sessionName = `2da Vuelta - Discrepancias (${skus.length} SKUs)`;
    onStartTargetedRecount(sessionName, skus);
  };

  // ☁️ SINCRONIZACIÓN Y CONSOLIDACIÓN ATÓMICA DE DISPOSITIVOS (GOOGLE SHEETS)
  // Combina bidireccionalmente los muebles pistoleados en otros teléfonos/PCs con los locales
  const handleSyncDevicesWithCloud = async () => {
    setIsSyncingCloud(true);
    try {
      showToast('Sincronizando y consolidando con Google Sheets y dispositivos...', 'info', 'Sincronización');
      const res = await syncCampaignsWithCloud({
        campaigns,
        activeCampaignId,
        sessions
      });

      if (res && res.success) {
        onUpdateCampaigns(res.mergedCampaigns);
        if (onUpdateSessions) {
          onUpdateSessions(res.mergedSessions);
        }
        saveCampaignsToStorage(res.mergedCampaigns);
        saveStockCountSessionsToStorage(res.mergedSessions);

        const nowStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        setLastCloudSyncDate(nowStr);
        try {
          localStorage.setItem(STORAGE_KEYS.LAST_CAMPAIGN_CLOUD_SYNC, nowStr);
        } catch {}

        playBeep('success');
        showToast(
          `¡Sincronización completa! ${res.mergedSessions.length} muebles consolidados (${res.newRemoteSessionsCount > 0 ? `${res.newRemoteSessionsCount} muebles nuevos de otros dispositivos` : 'datos al día'}).`,
          'success',
          'Nube Consolidada'
        );
      } else {
        showToast('No se pudo conectar a Google Sheets. Los datos locales permanecen seguros.', 'warning', 'Aviso de Red');
      }
    } catch (e: unknown) {
      showToast(`Error al sincronizar con la nube: ${getErrorMessage(e)}`, 'error', 'Error');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // 🛡️ GUARDAR EN PESTAÑA DEDICADA "_AUDITORIA_INVENTARIO" (SIN TOCAR VENCIMIENTOS)
  const handleSaveToDedicatedAuditSheet = async () => {
    if (!matrix || !activeCampaign) return;
    setIsSavingToAuditSheet(true);
    try {
      const rows = buildAuditRowsFromCampaignMatrix(matrix, activeCampaign);
      showToast(`Guardando ${rows.length} registros en la hoja _AUDITORIA_INVENTARIO...`, 'info', 'Guardando Auditoría');
      
      const res = await saveAuditRowsToDedicatedSheet('_AUDITORIA_INVENTARIO', rows);
      playBeep('success');
      showToast(
        `¡Auditoría guardada exitosamente! ${res.count} registros respaldados en la pestaña "${res.sheetName}" de Google Sheets. (La pestaña VENCIMIENTOS no fue modificada).`,
        'success',
        'Auditoría Respaldada'
      );
    } catch (e: unknown) {
      showToast(`Error al guardar en hoja de auditoría: ${getErrorMessage(e)}`, 'error', 'Error');
    } finally {
      setIsSavingToAuditSheet(false);
    }
  };

  // If no campaign exists yet, prompt creation screen
  if (!activeCampaign) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-900">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
          <Store className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Campaña de Inventario Cíclico
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
          Inicia una campaña para consolidar múltiples sesiones de conteo (por mueble o pasillo) contra los snapshots diarios del ERP de tu farmacia.
        </p>
        <button
          onClick={() => setIsNewCampaignOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Iniciar Nueva Campaña</span>
        </button>

        {/* Modal New Campaign */}
        {isNewCampaignOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Store className="w-5 h-5 text-blue-600" />
                <span>Nueva Campaña de Inventario</span>
              </h3>
              <form onSubmit={handleCreateCampaign} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                    Nombre de la Campaña
                  </label>
                  <input
                    type="text"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    placeholder="Ej: Inventario General Farmacia - Septiembre 2026"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                    Local o Sucursal (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newCampaignLocal}
                    onChange={(e) => setNewCampaignLocal(e.target.value)}
                    placeholder="Ej: LOCAL 121"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewCampaignOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                  >
                    Crear Campaña
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-100 dark:bg-slate-950">
      
      {/* ======================================================== */}
      {/* 1. TOP HEADER & CAMPAIGN SELECTOR / ACTIONS               */}
      {/* ======================================================== */}
      <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <select
                value={activeCampaign.id}
                onChange={(e) => onSelectCampaign(e.target.value)}
                className="font-bold text-base text-slate-800 dark:text-slate-100 bg-transparent border-0 outline-none cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {campaigns.map(c => (
                  <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium">
                    {c.nombre} {c.local ? `(${c.local})` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setIsNewCampaignOpen(true)}
                title="Crear otra campaña"
                className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>Iniciada: {new Date(activeCampaign.fechaInicio).toLocaleDateString('es-CL')}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
                {activeCampaign.historialSnapshots.length} Snapshots ERP cargados
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                {sessions.length} Sesiones de Mueble vinculadas
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons on header */}
        <div className="flex items-center gap-2">
          
          {/* Sincronizar Dispositivos Directo */}
          <button
            type="button"
            onClick={handleSyncDevicesWithCloud}
            disabled={isSyncingCloud}
            className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs active:scale-95"
            title="Consolidar conteos y muebles de todos los dispositivos móviles y Google Sheets"
          >
            {isSyncingCloud ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
            ) : (
              <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            )}
            <span className="hidden sm:inline">
              {isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Dispositivos'}
            </span>
            {lastCloudSyncDate && (
              <span className="text-[10px] text-blue-500 font-mono hidden lg:inline">
                ({lastCloudSyncDate})
              </span>
            )}
          </button>

          {/* Guardar en Hoja de Auditoría Directo */}
          <button
            type="button"
            onClick={handleSaveToDedicatedAuditSheet}
            disabled={isSavingToAuditSheet || !matrix}
            className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs active:scale-95 shrink-0"
            title="Guardar matriz de auditoría física en la pestaña _AUDITORIA_INVENTARIO de Google Sheets"
          >
            {isSavingToAuditSheet ? (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            )}
            <span className="hidden sm:inline">
              {isSavingToAuditSheet ? 'Guardando...' : 'Guardar en _AUDITORIA_INVENTARIO'}
            </span>
          </button>

          {/* Primary 1: Pistola Verificadora */}
          <button
            type="button"
            onClick={() => setIsQuickScanModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-md shadow-purple-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            title="Abrir Pistola Verificadora para consultar estado de productos en estantería"
          >
            <Scan className="w-4 h-4" />
            <span>Pistola Consulta</span>
          </button>

          {/* Primary 2: Pistolear Mueble */}
          <button
            type="button"
            onClick={() => onSwitchToTerminal()}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            title="Comenzar o continuar pistoleo de mueble/pasillo en sesión activa"
          >
            <Zap className="w-4 h-4" />
            <span>Pistolear Mueble</span>
          </button>

          {/* Primary 3: Herramientas & Opciones Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsToolsDropdownOpen(!isToolsDropdownOpen)}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Opciones de exportación, foto ERP y sincronización"
            >
              <MoreVertical className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">Herramientas</span>
            </button>

            {isToolsDropdownOpen && (
              <div 
                className="absolute right-0 top-full mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-40 p-2 flex flex-col gap-1 animate-in zoom-in-95 duration-100"
                onClick={() => setIsToolsDropdownOpen(false)}
              >
                <div className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Acciones de Campaña
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('SNAPSHOT_UPLOAD')}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Cargar Snapshot / Foto ERP</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportFullReport}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Exportar Cierre Oficial (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportDiscrepanciesSheet}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Planilla 2da Vuelta (Discrepancias)</span>
                </button>

                <div className="h-px bg-slate-200 dark:bg-slate-800 my-1"></div>

                <div className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Sincronización
                </div>

                <button
                  type="button"
                  onClick={handleSyncDevicesWithCloud}
                  disabled={isSyncingCloud}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSyncingCloud ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <Cloud className="w-4 h-4 text-blue-600 shrink-0" />
                  )}
                  <span>Sincronizar Todos los Dispositivos</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveToDedicatedAuditSheet}
                  disabled={isSavingToAuditSheet || !matrix}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSavingToAuditSheet ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  ) : (
                    <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  )}
                  <span>Guardar en Hoja Auditoría de Sheets</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. PROGRESS BAR & 4 KPI CARDS (THE MATRIZ SEMAPHORE)      */}
      {/* ======================================================== */}
      {/* ======================================================== */}
      {/* 2. PROGRESS BAR & 4 KPI CARDS (THE MATRIZ SEMAPHORE)      */}
      {/* ======================================================== */}
      <CampaignKpiSemaphore
        matrix={matrix}
        sessions={sessions}
        matrixFilter={matrixFilter}
        lastCloudSyncDate={lastCloudSyncDate}
        onNavigateToSessionList={onNavigateToSessionList}
        onSwitchToTerminal={onSwitchToTerminal}
        onSelectFilter={(f) => { setActiveTab('MATRIX'); setMatrixFilter(f); }}
        isMatrixTabActive={activeTab === 'MATRIX'}
      />

      {/* ======================================================== */}
      {/* 3. TAB CONTENT                                           */}
      {/* ======================================================== */}
      
      {/* TAB A: MATRIX OF CONSOLIDATION */}
      {activeTab === 'MATRIX' && (
        <CampaignMatrixTable
          matrix={matrix}
          displayedRows={displayedRows}
          providerList={providerList}
          matrixFilter={matrixFilter}
          searchTerm={searchTerm}
          selectedProvider={selectedProvider}
          onMatrixFilterChange={setMatrixFilter}
          onSearchTermChange={setSearchTerm}
          onSelectedProviderChange={setSelectedProvider}
          onQuickScan={() => setIsQuickScanModalOpen(true)}
          onExportDiscrepancies={handleExportDiscrepanciesSheet}
          onLaunchTargetedRecount={handleLaunchTargetedRecount}
          onToggleCloseSku={handleToggleCloseSku}
          onUpdateSalesAdjustment={handleUpdateSalesAdjustment}
        />
      )}

      {/* TAB B: SNAPSHOT UPLOADER */}
      {activeTab === 'SNAPSHOT_UPLOAD' && (
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Cargar Reporte de Stock Actual del ERP
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sube el archivo Excel exportado del sistema oficial de la farmacia. El sistema actualizará los teóricos respetando lo que ya contaste.
                </p>
              </div>
            </div>

            {/* Drag & Drop File Zone */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl p-8 text-center cursor-pointer transition-colors mb-6"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                className="hidden"
              />
              <FileSpreadsheet className="w-10 h-10 text-indigo-500 mx-auto mb-3 opacity-80" />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block mb-1">
                Haz clic para seleccionar el archivo Excel (.xlsx / .csv)
              </span>
              <span className="text-xs text-slate-400 block">
                Columnas soportadas: <code className="text-indigo-600 font-mono">Local | Código SKU | Descripción | Proveedor | Stock | Inv. Inicial | Egreso | Ingreso | Venta</code>
              </span>
            </div>

            {/* Alternative: Copy-Paste Text Area */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  O pega directamente las celdas copiadas de Excel
                </label>
                <button
                  type="button"
                  onClick={() => setPastedSnapshotText('')}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Limpiar
                </button>
              </div>
              <textarea
                rows={6}
                value={pastedSnapshotText}
                onChange={(e) => setPastedSnapshotText(e.target.value)}
                placeholder="Pega aquí las filas de Excel con sus encabezados (Ctrl + V)..."
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
              />
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setActiveTab('MATRIX')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Volver a la Matriz
              </button>
              <button
                type="button"
                onClick={handleProcessPastedSnapshot}
                disabled={isProcessingSnapshot || !pastedSnapshotText.trim()}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer"
              >
                {isProcessingSnapshot ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Procesar e Incorporar Snapshot</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Historial de Snapshots */}
          {activeCampaign.historialSnapshots.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span>Historial de Snapshots Cargados en esta Campaña</span>
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeCampaign.historialSnapshots.map((snap) => (
                  <div key={snap.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        {snap.nombreArchivo}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Cargado: {new Date(snap.fechaCarga).toLocaleString('es-CL')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400 block">
                        {formatLocaleNumber(snap.totalSkus)} SKUs
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formatLocaleNumber(snap.totalStockTeorico)} unidades
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal New Campaign */}
      {isNewCampaignOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Store className="w-5 h-5 text-blue-600" />
              <span>Nueva Campaña de Inventario</span>
            </h3>
            <form onSubmit={handleCreateCampaign} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                  Nombre de la Campaña
                </label>
                <input
                  type="text"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="Ej: Inventario General Farmacia - Septiembre 2026"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                  Local o Sucursal (Opcional)
                </label>
                <input
                  type="text"
                  value={newCampaignLocal}
                  onChange={(e) => setNewCampaignLocal(e.target.value)}
                  placeholder="Ej: LOCAL 121"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex justify-end gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={() => setIsNewCampaignOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  Crear Campaña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embedded High-Performance Campaign Quick Scan Modal */}
      <CampaignQuickScanModal
        isOpen={isQuickScanModalOpen}
        onClose={() => setIsQuickScanModalOpen(false)}
        matrix={matrix}
        sessions={sessions}
        onMarkSkuClosed={(sku) => {
          const row = allAuditRows.find(r => r.sku === sku);
          if (row) handleToggleCloseSku(row);
        }}
        onReopenSku={(sku) => {
          const row = allAuditRows.find(r => r.sku === sku);
          if (row) handleToggleCloseSku(row);
        }}
        onAdjustSales={handleUpdateSalesAdjustment}
        onSwitchToCounting={(sku) => {
          setIsQuickScanModalOpen(false);
          onSwitchToTerminal(sku);
        }}
        showToast={showToast}
      />
    </div>
  );
};
