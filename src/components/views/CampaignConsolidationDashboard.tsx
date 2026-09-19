import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  CheckCircle2, AlertTriangle, HelpCircle, Package, Search, 
  ArrowRight, Download, RefreshCw, UploadCloud, FileSpreadsheet, 
  Calendar, Layers, ShieldCheck, Tag, Trash2, Plus, Edit3, 
  ChevronRight, ArrowUpRight, ArrowDownRight, MapPin, Store,
  Check, X, FileCheck, Sliders, Eye, EyeOff, RotateCcw,
  Sparkles, Zap, Share2, Cloud, CloudUpload, CloudDownload,
  Database, Info, Loader2, Scan, MoreVertical
} from 'lucide-react';
import { 
  InventoryCampaign, 
  CampaignConsolidationMatrix, 
  CampaignAuditRow, 
  StockCountSession,
  CampaignItemAuditStatus
} from '../../types';
import { 
  computeCampaignConsolidationMatrix, 
  importPharmacySnapshotToCampaign, 
  markSkuAsClosedInCampaign, 
  reopenSkuInCampaign, 
  setCampaignManualSalesAdjustment, 
  exportCampaignReportToExcel, 
  exportDiscrepanciesForRecountSheet,
  createNewCampaign,
  saveCampaignsToStorage,
  loadCampaignsFromStorage,
  saveStockCountSessionsToStorage,
  buildAuditRowsFromCampaignMatrix,
  playBeep
} from '../../utils/stockCountUtils';
import { 
  saveCampaignsToCloud, 
  loadCampaignsFromCloud, 
  syncCampaignsWithCloud,
  saveAuditRowsToDedicatedSheet 
} from '../../lib/sheets';
import { formatLocaleNumber } from '../../utils/pureCalculations';
import { parseDelimitedText, detectDelimiter } from '../../utils/universalImporter';
import { CampaignQuickScanModal } from '../modals/CampaignQuickScanModal';

interface CampaignConsolidationDashboardProps {
  campaigns: InventoryCampaign[];
  activeCampaignId: string | null;
  sessions: StockCountSession[];
  onUpdateCampaigns: (campaigns: InventoryCampaign[]) => void;
  onSelectCampaign: (id: string) => void;
  onStartTargetedRecount: (sessionName: string, skus: string[]) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
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
      return localStorage.getItem('app_last_campaign_cloud_sync');
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
        localStorage.setItem('app_last_campaign_cloud_sync', nowStr);
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
          localStorage.setItem('app_last_campaign_cloud_sync', nowStr);
        } catch {}
      }
    }).catch((err) => {
      console.warn('[Dashboard AutoSync] Initial sync notice:', err);
    });
  }, []);

  // Active campaign entity
  const activeCampaign = useMemo(() => {
    if (!activeCampaignId && campaigns.length > 0) {
      return campaigns[0];
    }
    return campaigns.find(c => c.id === activeCampaignId) || null;
  }, [campaigns, activeCampaignId]);

  // Computed live matrix for the active campaign
  const matrix: CampaignConsolidationMatrix | null = useMemo(() => {
    if (!activeCampaign) return null;
    return computeCampaignConsolidationMatrix(activeCampaign, sessions);
  }, [activeCampaign, sessions]);

  // All audit rows across all categories
  const allAuditRows = useMemo<CampaignAuditRow[]>(() => {
    if (!matrix) return [];
    return [...matrix.cuadrados, ...matrix.discrepancias, ...matrix.nuncaPistoleados, ...matrix.hallazgos];
  }, [matrix]);

  // Unique list of providers in snapshot for filter dropdown
  const providerList = useMemo(() => {
    if (!matrix) return [];
    const set = new Set<string>();
    allAuditRows.forEach(r => {
      if (r.proveedor) set.add(r.proveedor);
    });
    return Array.from(set).sort();
  }, [matrix, allAuditRows]);

  // Filtered rows for the matrix table
  const displayedRows = useMemo(() => {
    if (!matrix) return [];
    let list: CampaignAuditRow[] = [];
    if (matrixFilter === 'ALL') {
      list = [...matrix.discrepancias, ...matrix.nuncaPistoleados, ...matrix.cuadrados, ...matrix.hallazgos];
    } else if (matrixFilter === 'VALIDADO_OK') {
      list = matrix.cuadrados;
    } else if (matrixFilter === 'DISCREPANCIA') {
      list = matrix.discrepancias;
    } else if (matrixFilter === 'NUNCA_PISTOLEADO') {
      list = matrix.nuncaPistoleados;
    } else if (matrixFilter === 'HALLAZGO') {
      list = matrix.hallazgos;
    }

    if (selectedProvider !== 'ALL') {
      list = list.filter(r => r.proveedor === selectedProvider);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(r => 
        r.sku.toLowerCase().includes(q) || 
        r.descripcion.toLowerCase().includes(q) ||
        r.proveedor.toLowerCase().includes(q)
      );
    }

    return list;
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
    } catch (e: any) {
      showToast(`Error al procesar el snapshot: ${e.message}`, 'error');
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
      let parsedRows: Record<string, any>[] = [];

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
          localStorage.setItem('app_last_campaign_cloud_sync', nowStr);
        } catch {}
        showToast(
          `¡Foto ERP sincronizada en la nube! Visible inmediatamente en tu dispositivo móvil / PDA.`,
          'success',
          'Sincronizado'
        );
      } catch (cloudErr: any) {
        showToast(`Snapshot guardado localmente. Error en respaldo nube: ${cloudErr?.message || cloudErr}`, 'warning');
      }
    } catch (err: any) {
      showToast(`Error al leer archivo: ${err.message}`, 'error');
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
    } catch (e: any) {
      showToast(`Error al exportar: ${e.message}`, 'error');
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
    } catch (e: any) {
      showToast(`Error al exportar: ${e.message}`, 'error');
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
          localStorage.setItem('app_last_campaign_cloud_sync', nowStr);
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
    } catch (e: any) {
      showToast(`Error al sincronizar con la nube: ${e.message}`, 'error', 'Error');
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
    } catch (e: any) {
      showToast(`Error al guardar en hoja de auditoría: ${e.message}`, 'error', 'Error');
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
      {matrix && (
        <div className="px-6 py-4 bg-white/70 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 shrink-0 backdrop-blur-xs">
          
          {/* Storage & Separation Notice */}
          <div className="mb-3 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>
                <strong className="text-slate-700 dark:text-slate-200">Destino de Guardado:</strong> Pestaña <code className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-[11px] font-bold">_AUDITORIA_INVENTARIO</code> y Nube. La pestaña <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[11px]">VENCIMIENTOS</code> permanece aislada para fechas de vencimiento.
              </span>
            </div>
            {lastCloudSyncDate && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 shrink-0">
                <Cloud className="w-3.5 h-3.5" /> Sincronizado ({lastCloudSyncDate})
              </span>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Cobertura Global de Auditoría de la Farmacia</span>
              </span>
              <span className="text-blue-600 dark:text-blue-400 text-sm font-extrabold">
                {matrix.porcentajeCobertura}% Auditado ({matrix.totalSkusTeoricos - matrix.nuncaPistoleadosCount} de {matrix.totalSkusTeoricos} SKUs)
              </span>
            </div>
            <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div 
                style={{ width: `${matrix.totalSkusTeoricos > 0 ? (matrix.cuadradosCount / matrix.totalSkusTeoricos) * 100 : 0}%` }} 
                className="bg-emerald-500 h-full transition-all duration-500" 
                title="Cuadrados / Validados"
              />
              <div 
                style={{ width: `${matrix.totalSkusTeoricos > 0 ? (matrix.discrepanciasCount / matrix.totalSkusTeoricos) * 100 : 0}%` }} 
                className="bg-amber-500 h-full transition-all duration-500" 
                title="Discrepancias"
              />
              <div 
                style={{ width: `${matrix.totalSkusTeoricos > 0 ? (matrix.nuncaPistoleadosCount / matrix.totalSkusTeoricos) * 100 : 0}%` }} 
                className="bg-rose-400/80 h-full transition-all duration-500" 
                title="Nunca Pistoleados"
              />
            </div>
          </div>

          {/* Ribbon: Muebles y Dispositivos Consolidados en esta Campaña */}
          <div className="mb-4 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>Muebles Consolidados ({sessions.length}):</span>
                <span className="text-[11px] text-slate-400 font-normal">Lecturas de todos los dispositivos combinadas en la matriz</span>
              </span>
              <button
                type="button"
                onClick={() => onNavigateToSessionList ? onNavigateToSessionList() : onSwitchToTerminal()}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>+ Agregar Mueble</span>
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl text-xs text-slate-400 text-center border border-dashed border-slate-200 dark:border-slate-700">
                Aún no hay muebles pistoleados. Pulsa <strong className="text-blue-600">"Pistolear Mueble"</strong> para iniciar el primer conteo.
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {sessions.map(s => {
                  const unids = s.conteos.reduce((acc, c) => acc + c.cantidad, 0);
                  const isCompleted = s.estado === 'COMPLETED';
                  const deviceLabel = s.deviceId ? (s.deviceId.includes('movil') ? '📱 ' + s.deviceId : '💻 ' + s.deviceId) : 'Dispositivo';

                  return (
                    <div
                      key={s.id}
                      onClick={() => onSwitchToTerminal()}
                      className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5 shrink-0 shadow-2xs hover:border-blue-500 transition-all cursor-pointer group"
                      title={`${s.nombre} - ${unids} unidades - Clic para abrir`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${isCompleted ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 truncate max-w-[150px]">
                          {s.nombre}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">{formatLocaleNumber(unids)} unids</span>
                          <span>•</span>
                          <span className="truncate max-w-[90px]">{deviceLabel}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4 Semáforo KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            
            {/* Card 1: 🟢 Cuadrados / Validados */}
            <button
              onClick={() => { setActiveTab('MATRIX'); setMatrixFilter('VALIDADO_OK'); }}
              className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                matrixFilter === 'VALIDADO_OK' && activeTab === 'MATRIX'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Cuadrados / OK
                </span>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                  Cerrados
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  {formatLocaleNumber(matrix.cuadradosCount)}
                </span>
                <span className="text-xs text-slate-400">SKUs</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                Pistoleados y conformes. No requieren más revisión.
              </span>
            </button>

            {/* Card 2: 🟡 Discrepancias */}
            <button
              onClick={() => { setActiveTab('MATRIX'); setMatrixFilter('DISCREPANCIA'); }}
              className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                matrixFilter === 'DISCREPANCIA' && activeTab === 'MATRIX'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Discrepancias
                </span>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                  2da Pasada
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {formatLocaleNumber(matrix.discrepanciasCount)}
                </span>
                <span className="text-xs text-slate-400">SKUs</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                Diferencias (+ o -). Revisar ventas o 2do conteo.
              </span>
            </button>

            {/* Card 3: 🔴 Nunca Pistoleados */}
            <button
              onClick={() => { setActiveTab('MATRIX'); setMatrixFilter('NUNCA_PISTOLEADO'); }}
              className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                matrixFilter === 'NUNCA_PISTOLEADO' && activeTab === 'MATRIX'
                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 ring-2 ring-rose-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-rose-300'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" /> Nunca Pistoleados
                </span>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
                  Pendientes
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  {formatLocaleNumber(matrix.nuncaPistoleadosCount)}
                </span>
                <span className="text-xs text-slate-400">SKUs</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                Figuran en ERP pero 0 lecturas en todas las sesiones.
              </span>
            </button>

            {/* Card 4: 🔵 Hallazgos / No en ERP */}
            <button
              onClick={() => { setActiveTab('MATRIX'); setMatrixFilter('HALLAZGO'); }}
              className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                matrixFilter === 'HALLAZGO' && activeTab === 'MATRIX'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <Package className="w-4 h-4" /> Hallazgos Físicos
                </span>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                  Sobrantes
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                  {formatLocaleNumber(matrix.hallazgosCount)}
                </span>
                <span className="text-xs text-slate-400">SKUs</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                Pistoleados en físico pero no figuran en el ERP.
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. TAB CONTENT                                           */}
      {/* ======================================================== */}
      
      {/* TAB A: MATRIX OF CONSOLIDATION */}
      {activeTab === 'MATRIX' && (
        <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
          
          {/* Controls Bar: Search, Filters, Launch Targeted Recount */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por SKU, descripción o proveedor..."
                  className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setIsQuickScanModalOpen(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-600 dark:text-purple-400 hover:text-purple-700 p-1.5 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors cursor-pointer"
                  title="Escanear con Pistola Verificadora"
                >
                  <Scan className="w-4 h-4" />
                </button>
              </div>

              {/* Provider Filter */}
              {providerList.length > 0 && (
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                >
                  <option value="ALL">Todos los Proveedores ({providerList.length})</option>
                  {providerList.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Quick Action: Targeted 2nd Round Recount */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMatrixFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  matrixFilter === 'ALL'
                    ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Ver Todos ({matrix ? matrix.totalSkusTeoricos + matrix.hallazgosCount : 0})
              </button>

              {matrix && matrix.discrepanciasCount > 0 && (
                <>
                  <button
                    onClick={handleExportDiscrepanciesSheet}
                    className="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Exportar planilla de 2do conteo para imprimir o llevar en papel"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Planilla 2do Conteo</span>
                  </button>

                  <button
                    onClick={handleLaunchTargetedRecount}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Abrir terminal filtrada con solo los SKUs descuadrados"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Iniciar 2da Pasada ({matrix.discrepanciasCount})</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Table of Consolidated Matrix */}
          <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-xs border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">Estado</th>
                  <th className="py-3 px-4 w-36">Código SKU</th>
                  <th className="py-3 px-4 min-w-[240px]">Descripción / Proveedor</th>
                  <th className="py-3 px-3 text-right w-24">Teórico ERP</th>
                  <th className="py-3 px-3 text-right w-24">Físico Total</th>
                  <th className="py-3 px-3 text-center w-28">Venta / Ajuste</th>
                  <th className="py-3 px-3 text-right w-24">Diferencia</th>
                  <th className="py-3 px-4 min-w-[180px]">Muebles / Sesiones</th>
                  <th className="py-3 px-4 text-center w-28">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold">No se encontraron productos en este estado o filtro</p>
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => {
                    const isSquare = row.diferenciaNeta === 0;
                    const isNeverScanned = row.estadoGlobal === 'NUNCA_PISTOLEADO';
                    const isHallazgo = row.estadoGlobal === 'HALLAZGO';

                    return (
                      <tr 
                        key={row.sku}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                          row.esCerrado ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''
                        }`}
                      >
                        {/* Estado Badge */}
                        <td className="py-2.5 px-4 text-center">
                          {row.esCerrado || isSquare ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400" title="Validado / Cuadrado">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            </span>
                          ) : isNeverScanned ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400" title="Nunca Pistoleado (Sin Lecturas Físicas)">
                              <HelpCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                            </span>
                          ) : isHallazgo ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400" title="Hallazgo Físico (No en ERP)">
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400" title="Discrepancia para 2da Pasada">
                              <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                            </span>
                          )}
                        </td>

                        {/* SKU */}
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {row.sku}
                        </td>

                        {/* Descripción & Proveedor */}
                        <td className="py-2.5 px-4">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 block truncate max-w-sm" title={row.descripcion}>
                            {row.descripcion || 'Sin descripción'}
                          </span>
                          {row.proveedor && (
                            <span className="text-[11px] text-slate-400 block truncate">
                              {row.proveedor}
                            </span>
                          )}
                        </td>

                        {/* Stock Teórico ERP */}
                        <td className="py-2.5 px-3 text-right font-medium text-slate-600 dark:text-slate-400">
                          {formatLocaleNumber(row.stockTeorico)}
                        </td>

                        {/* Stock Físico Contado */}
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                          {formatLocaleNumber(row.stockFisicoTotal)}
                        </td>

                        {/* Venta en Turno / Ajuste Manual */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                            <span className="text-[11px] text-slate-400 font-bold">V:</span>
                            <input
                              type="number"
                              min="0"
                              value={row.ajusteManualVenta || (row.ventaRegistrada > 0 ? row.ventaRegistrada : '')}
                              onChange={(e) => handleUpdateSalesAdjustment(row.sku, parseInt(e.target.value, 10) || 0)}
                              placeholder="0"
                              title="Ingresa unidades vendidas en caja durante el conteo"
                              className="w-10 text-center font-bold text-slate-700 dark:text-slate-200 bg-transparent border-0 outline-none p-0 text-xs"
                            />
                          </div>
                        </td>

                        {/* Diferencia Neta */}
                        <td className="py-2.5 px-3 text-right font-black">
                          {row.diferenciaNeta === 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">0</span>
                          ) : row.diferenciaNeta > 0 ? (
                            <span className="text-blue-600 dark:text-blue-400">+{row.diferenciaNeta}</span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400">{row.diferenciaNeta}</span>
                          )}
                        </td>

                        {/* Muebles / Sesiones de Conteo */}
                        <td className="py-2.5 px-4">
                          {row.sesionesDondeAparece.length === 0 ? (
                            <span className="text-[11px] text-rose-500 italic font-medium">
                              Ningún mueble pistoleado
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {row.sesionesDondeAparece.map((s, idx) => (
                                <span 
                                  key={idx} 
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                  title={`${s.nombreSesion} (${s.ubicacion || 'Sin ubicación'}) - ${s.cantidad} unidades`}
                                >
                                  <MapPin className="w-2.5 h-2.5 text-blue-500" />
                                  <span>{s.ubicacion || s.nombreSesion}: {s.cantidad}u</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Acción de Cierre / Validación */}
                        <td className="py-2.5 px-4 text-center">
                          <button
                            onClick={() => handleToggleCloseSku(row)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              row.esCerrado
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            }`}
                          >
                            {row.esCerrado ? 'Reabrir' : 'Dar por OK'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
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
