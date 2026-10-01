import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Layers, FileSpreadsheet, Zap } from 'lucide-react';
import { StockCountSession, StockCountEntry, InventoryItem, SheetRecord } from '../../types';
import { generateCuVc, calculateLastDayOfMonthDateString, reconcileStockCountSession, buildVencimientosRowFromCount, buildAuditRowsFromSession, loadStockCountSessionsFromStorage, saveStockCountSessionsToStorageDebounced, flushStockCountSessionsToStorage, exportStockCountToExcel, generateShortVcId, playBeep, getOrCreateDeviceId } from '../../utils/stockCountUtils';
import { saveCampaignsToStorage } from '../../utils/campaignUtils';
import { saveAuditRowsToDedicatedSheet, syncCampaignsWithCloud } from '../../lib/sheets';
import { LazyFallback } from '../common/LazyFallback';
import { MobileCameraBarcodeScanner } from './MobileCameraBarcodeScanner';
import { MobileErpSnapshotView } from './MobileErpSnapshotView';
import { StockCountReconciliationView } from './StockCountReconciliationView';
import { StockCountSessionsListView, NewSessionConfig } from './StockCountSessionsListView';
import { BentoCountTerminal } from './BentoCountTerminal';
import { buildMasterCatalogIndex } from '../../utils/referenceResolver';
import { formatLocaleNumber, parseLocaleNumber } from '../../utils/pureCalculations';
import { groupSkuEntries, getLastScannedItem, getReconciliationProviders, filterReconciliation, computeReconciliationMetrics, getPendingItems } from '../../utils/countAggregation';
import { copyTextToClipboard } from '../../utils/exportUtils';
import { executeThermalPrint } from '../../utils/ticketUtils';
import { TicketPrintView } from './TicketPrintView';
import { getErrorMessage } from '../../utils/pureCalculations';
import { useConfirm } from '../common/ConfirmDialog';
import { useHardwareBarcodeScanner } from '../../hooks/useHardwareBarcodeScanner';
import { ScopedErrorBoundary } from '../common/ScopedErrorBoundary';

import { ErpSnapshotUploadModal } from '../modals/ErpSnapshotUploadModal';
import { StockCountWorkflowGuideModal } from '../modals/StockCountWorkflowGuideModal';
import { useStockCountSessions } from '../../hooks/useStockCountSessions';
import { StockCountHeader } from './stockCount/StockCountHeader';
const CampaignConsolidationDashboard = lazy(() => import('./CampaignConsolidationDashboard').then(m => ({ default: m.CampaignConsolidationDashboard })));

interface StockCountTerminalProps {
  sheetItems: InventoryItem[];
  headers: string[];
  masterProducts: SheetRecord[];
  activeSheetTitle: string;
  onSyncRowsToVencimientos: (rows: SheetRecord[]) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
  onClose?: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
/** Id del contenedor térmico de este terminal; debe ser único en el documento. */
const STOCKCOUNT_TICKET_DOM_ID = 'thermal-ticket-root-stockcount';

export const StockCountTerminal: React.FC<StockCountTerminalProps> = ({
  sheetItems,
  headers,
  masterProducts,
  activeSheetTitle,
  onSyncRowsToVencimientos,
  showToast,
  onClose
}) => {
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Session & Campaign state managed by dedicated hook (Ponytail Protocol)
  const {
    campaigns,
    setCampaigns,
    activeCampaignIdState,
    activeCampaign,
    sessions,
    setSessions,
    deletedSessionIds,
    setDeletedSessionIds,
    activeSessionId,
    setActiveSessionId,
    isSyncingCloud,
    lastCloudSyncDate,
    erpSnapshotCount,
    handleAutoSyncCampaignsToCloud,
    handleCloudSync,
    handleBackupSessionToCloud,
    handleUpdateCampaigns,
    handleSelectCampaign
  } = useStockCountSessions({ showToast });

  // ERP & Workflow guide modals state
  const [isErpUploadModalOpen, setIsErpUploadModalOpen] = useState<boolean>(false);
  const [isWorkflowGuideModalOpen, setIsWorkflowGuideModalOpen] = useState<boolean>(false);

  // Navigation view inside modal: 'COUNTING' | 'LIST' | 'RECONCILIATION' | 'CAMPAIGN'
  const [viewState, setViewState] = useState<'CAMPAIGN' | 'LIST' | 'COUNTING' | 'RECONCILIATION'>(() => {
    const savedSessions = loadStockCountSessionsFromStorage();
    if (savedSessions.length > 0) {
      return 'COUNTING';
    }
    return 'LIST';
  });

  // Mobile layout detection & optional full desktop toggle
  const [forceDesktopCampaignView, setForceDesktopCampaignView] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Launch targeted recount for discrepancies from campaign
  const handleStartTargetedRecount = (sessionName: string, targetSkus: string[]) => {
    const newSessionId = `session_${Date.now()}`;
    const newSession: StockCountSession = {
      id: newSessionId,
      nombre: sessionName,
      fechaInicio: new Date().toISOString(),
      hojaOrigen: activeSheetTitle || 'main',
      estado: 'IN_PROGRESS',
      modo: 'DOCUMENT',
      requiereVencimiento: false,
      ubicacion: 'Auditoría 2da Vuelta',
      // Marca la sesión para que la matriz de campaña REEMPLACE el físico del SKU en
      // vez de sumarlo: la vuelta re-cuenta la misma mercadería que el conteo que
      // corrige. Ver computeCampaignConsolidationMatrix.
      esSegundaVuelta: true,
      conteos: []
    };

    // Update sessions
    const updatedSessions = [newSession, ...sessions];
    setSessions(updatedSessions);

    // If campaign exists, link session to campaign
    if (activeCampaignIdState) {
      const updatedCampaigns = campaigns.map(c => {
        if (c.id === activeCampaignIdState) {
          return {
            ...c,
            sessionIds: [...c.sessionIds, newSessionId]
          };
        }
        return c;
      });
      handleUpdateCampaigns(updatedCampaigns);
    }

    setActiveSessionId(newSessionId);
    setViewState('COUNTING');
    showToast(`Sesión de 2da vuelta iniciada para ${targetSkus.length} SKUs`, 'success');
  };

  /**
   * Lanza un conteo NUEVO acotado a los SKUs pendientes de un proveedor.
   *
   * No reutiliza `handleStartTargetedRecount`: ese marca la sesión como 2da vuelta
   * (`esSegundaVuelta: true`), y la matriz REEMPLAZA el físico de una 2da vuelta en vez
   * de sumarlo (la vuelta re-cuenta mercadería ya contada). Un conteo de proveedor es
   * mercadería que aún no se contó, así que debe ir como sesión normal y con `skuScope`
   * para que el operario solo recorra ese laboratorio.
   */
  const handleStartProviderCount = (proveedor: string, skus: string[]) => {
    if (skus.length === 0) {
      showToast(`No hay SKUs pendientes de ${proveedor}.`, 'info');
      return;
    }
    const sessionName = `${proveedor} - Conteo (${skus.length} SKUs)`;
    const newSessionId = generateShortVcId();
    const newSession: StockCountSession = {
      id: newSessionId,
      nombre: sessionName,
      modo: 'DOCUMENT',
      requiereVencimiento: false,
      hojaOrigen: activeSheetTitle || 'main',
      estado: 'IN_PROGRESS',
      fechaInicio: new Date().toISOString(),
      conteos: [],
      ubicacion: proveedor,
      notas: `Conteo por proveedor: ${proveedor}`,
      skuScope: skus,
      deviceId: getOrCreateDeviceId(),
      lastUpdated: new Date().toISOString(),
      sincronizadoNube: false
    };

    setSessions(prev => [newSession, ...prev]);

    if (activeCampaignIdState) {
      setCampaigns(prev => {
        const updated = prev.map(c => {
          if (c.id === activeCampaignIdState && !c.sessionIds.includes(newSessionId)) {
            return { ...c, sessionIds: [...c.sessionIds, newSessionId] };
          }
          return c;
        });
        saveCampaignsToStorage(updated);
        return updated;
      });
    }

    setActiveSessionId(newSessionId);
    setCountLocation(proveedor);
    setViewState('COUNTING');
    showToast(`Conteo iniciado para ${proveedor}: ${skus.length} SKUs pendientes`, 'success', 'Conteo por Proveedor');
  };

  // New session creation form states

  // Active counting terminal form states
  const [scannedSku, setScannedSku] = useState('');
  const [selectedProductDesc, setSelectedProductDesc] = useState('');
  const [countQuantity, setCountQuantity] = useState<number>(1);
  const [countLocation, setCountLocation] = useState<string>('');
  const [isLocationLocked, setIsLocationLocked] = useState<boolean>(false);
  const [isSummaryCopied, setIsSummaryCopied] = useState<boolean>(false);

  // Expiry prompt states for sequential 2-step flow
  const [expiryPromptSku, setExpiryPromptSku] = useState<string | null>(null);
  const [tempMm, setTempMm] = useState<string>('');
  const [tempYyyy, setTempYyyy] = useState<string>('');
  
  const skuInputRef = useRef<HTMLInputElement>(null);

  // Mobile / PDA camera scanner state
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  // Real-time Campaign status for scanned SKU across all pharmacy sessions & ERP snapshot
  const campaignSkuStats = useMemo(() => {
    if (!scannedSku || !scannedSku.trim()) return null;
    const sku = scannedSku.trim();
    const itemInErp = activeCampaign?.snapshotTeoricoActual?.[sku];
    let totalFisicoCampana = 0;
    sessions.filter(s => !s.deleted).forEach(sess => {
      sess.conteos.forEach(c => {
        if (c.sku.trim() === sku) {
          totalFisicoCampana += c.cantidad;
        }
      });
    });
    const isValidatedInCampaign = !!activeCampaign?.itemsValidadosCerrados?.[sku];
    const ventaAjuste = activeCampaign?.ajustesVentaManual?.[sku] || 0;
    const stockTeorico = itemInErp ? itemInErp.stockTeorico : null;
    const stockEfectivo = stockTeorico !== null ? Math.max(0, stockTeorico - ventaAjuste) : null;
    const diferencia = stockEfectivo !== null ? totalFisicoCampana - stockEfectivo : null;
    return {
      inErp: !!itemInErp,
      stockTeorico,
      ventaAjuste,
      stockEfectivo,
      totalFisicoCampana,
      diferencia,
      isValidatedInCampaign
    };
  }, [scannedSku, activeCampaign, sessions]);

  // Reconciliation filter & Supplier audit filter
  const [reconciliationFilter, setReconciliationFilter] = useState<'ALL' | 'DIF' | 'CUADRADO' | 'FALTANTE' | 'SOBRANTE' | 'NO_CATALOGADO'>('ALL');
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>('ALL');
  const [itemsToPrintList, setItemsToPrintList] = useState<InventoryItem[]>([]);
  const [ticketPrintMode, setTicketPrintMode] = useState<'standard' | 'barcode'>('standard');
  const [isSyncingToSheet, setIsSyncingToSheet] = useState(false);

  // Visual Flash Feedback State for high-visibility confirmation in noisy environments
  const [visualFlash, setVisualFlash] = useState<'NONE' | 'SUCCESS' | 'WARNING' | 'ERROR'>('NONE');
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerVisualFlash = (type: 'SUCCESS' | 'WARNING' | 'ERROR') => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setVisualFlash(type);
    flashTimerRef.current = setTimeout(() => {
      setVisualFlash('NONE');
    }, type === 'ERROR' ? 300 : 180);
  };

  // Master catalog pre-indexed for lightning-fast O(1) lookups on low-end PDAs
  const masterCatalogIndex = useMemo(() => {
    return buildMasterCatalogIndex(masterProducts);
  }, [masterProducts]);

  // Save sessions to storage with debouncing to keep the main thread responsive
  useEffect(() => {
    saveStockCountSessionsToStorageDebounced(sessions, 300);
  }, [sessions]);

  // Volcar de inmediato la escritura pendiente cuando la página puede descartarse
  // (cambio de pestaña, app en segundo plano, cierre): en PDA esto es el caso común,
  // no el borde. Sin esto, la última lectura se perdía en la ventana de 300ms.
  useEffect(() => {
    const flush = () => flushStockCountSessionsToStorage();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  // Focus SKU input whenever switching to counting view
  useEffect(() => {
    if (viewState === 'COUNTING') {
      setTimeout(() => {
        skuInputRef.current?.focus();
      }, 100);
    }
  }, [viewState]);

  // Current active session
  const currentSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId && !s.deleted) || null;
  }, [sessions, activeSessionId]);

  // En modalidad BLIND el operario no debe ver ningún dato teórico (AGENTS.md §M: auditoría limpia).
  const isBlind = currentSession?.modo === 'BLIND';

  // Dynamic years list based on session configuration
  const yearsList = useMemo(() => {
    if (currentSession?.rangoAnos) {
      const { desde, hasta } = currentSession.rangoAnos;
      const list = [];
      for (let y = desde; y <= hasta; y++) {
        list.push(String(y));
      }
      return list.length > 0 ? list : [String(CURRENT_YEAR)];
    }
    return Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR + i));
  }, [currentSession]);

  // Handle master product search / SKU matching with O(1) exact lookup
  const handleSkuChange = (val: string) => {
    setScannedSku(val);
    const clean = val.trim();
    if (!clean) {
      setSelectedProductDesc('');
      return;
    }

    // Instant O(1) exact match check
    const exact = masterCatalogIndex.getBySku(clean);
    if (exact) {
      setSelectedProductDesc(exact.name);
    }
  };

  // Start new session
  const handleCreateSession = (config: NewSessionConfig) => {
    const name = config.nombre.trim() || `Conteo ${config.modo === 'BLIND' ? 'a Ciegas' : 'Doc'} - ${new Date().toLocaleDateString('es-CL')}`;
    
    const newSessionId = generateShortVcId();
    const newSession: StockCountSession = {
      id: newSessionId,
      nombre: name,
      modo: config.modo,
      requiereVencimiento: config.requiereVencimiento,
      hojaOrigen: activeSheetTitle || 'main',
      estado: 'IN_PROGRESS',
      fechaInicio: new Date().toISOString(),
      conteos: [],
      notas: config.ubicacion ? `Ubicación inicial: ${config.ubicacion}` : undefined,
      rangoAnos: config.rangoAnos,
      skuScope: config.skuScope,
      deviceId: getOrCreateDeviceId(),
      lastUpdated: new Date().toISOString(),
      sincronizadoNube: false
    };

    setSessions(prev => [newSession, ...prev]);

    // Automatically link to active campaign if one is selected
    if (activeCampaignIdState) {
      setCampaigns(prev => {
        const updated = prev.map(c => {
          if (c.id === activeCampaignIdState && !c.sessionIds.includes(newSessionId)) {
            return { ...c, sessionIds: [...c.sessionIds, newSessionId] };
          }
          return c;
        });
        saveCampaignsToStorage(updated);
        return updated;
      });
    }

    setActiveSessionId(newSession.id);
    setCountLocation(config.ubicacion);
    setViewState('COUNTING');
    showToast(`Mueble "${name}" iniciado. ¡Listo para pistolear!`, 'info', 'Conteo Activo');
  };

  // Resume or open existing session
  const handleOpenSession = (session: StockCountSession) => {
    setActiveSessionId(session.id);
    if (session.estado === 'COMPLETED') {
      setViewState('RECONCILIATION');
    } else {
      setViewState('COUNTING');
    }
  };

  // 🏁 Finalizar Mueble actual y pasar inmediatamente al Mueble N+1
  const handleFinishFurnitureAndNext = () => {
    if (!currentSession) return;
    
    // Mark current session as completed
    setSessions(prev => prev.map(s => {
      if (s.id === currentSession.id) {
        return {
          ...s,
          estado: 'COMPLETED',
          lastUpdated: new Date().toISOString()
        };
      }
      return s;
    }));

    const nextNumber = sessions.filter(s => !s.deleted).length + 1;
    const nextName = `Mueble ${nextNumber}`;
    
    // Auto-create next session
    handleCreateSession({
      nombre: nextName,
      modo: currentSession.modo,
      requiereVencimiento: currentSession.requiereVencimiento,
      rangoAnos: currentSession.rangoAnos,
      ubicacion: nextName
    });

    setScannedSku('');
    setSelectedProductDesc('');
    setCountQuantity(1);
    playBeep('success');
  };

  // Switch to the active counting terminal, resuming an in-progress session if needed
  const handleSwitchToTerminal = (targetSku?: string) => {
    if (targetSku) {
      setScannedSku(targetSku);
      handleSkuChange(targetSku);
    }
    const activeSessions = sessions.filter(s => !s.deleted);
    if (currentSession && currentSession.estado !== 'COMPLETED') {
      setViewState('COUNTING');
    } else if (activeSessions.length > 0) {
      const inProgress = activeSessions.find(s => s.estado !== 'COMPLETED') || activeSessions[0];
      setActiveSessionId(inProgress.id);
      setViewState('COUNTING');
    } else {
      setViewState('LIST');
    }
  };

  // Delete session with real physical deletion and real-time cloud propagation
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirm({ title: 'Eliminar sesión', message: '¿Estás seguro de eliminar esta sesión de conteo? Se borrará por completo de la nube y de todos los dispositivos en tiempo real.', confirmLabel: 'Eliminar' })) {
      // 1. Physically filter out the deleted session locally
      const updatedSessions = sessions.filter(s => s.id !== sessionId);
      setSessions(updatedSessions);

      // 2. Add to deletedSessionIds tracker to propagate deletion and prevent ghost revivals
      const updatedDeletedSessionIds = Array.from(new Set([...deletedSessionIds, sessionId]));
      setDeletedSessionIds(updatedDeletedSessionIds);

      // Sincronizar inmediatamente para propagar el borrado a Google Sheets
      try {
        const res = await syncCampaignsWithCloud({
          campaigns,
          activeCampaignId: activeCampaignIdState,
          sessions: updatedSessions,
          deletedSessionIds: updatedDeletedSessionIds
        });
        if (res && res.success) {
          setSessions(res.mergedSessions);
          if (res.deletedSessionIds) {
            setDeletedSessionIds(res.deletedSessionIds);
          }
        }
      } catch (err) {
        console.warn('[Sheets] No se pudo propagar el borrado de inmediato:', err);
      }

      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setViewState('LIST');
      }
      showToast('Sesión de conteo eliminada y sincronizada', 'info');
    }
  };

  /**
   * Una sesión puede nacer acotada a los SKUs de un proveedor (`skuScope`). La conciliación
   * recorta a ese conjunto, así que una lectura ajena no llega a la matriz ni a VENCIMIENTOS.
   * Espeja esa misma condición para poder avisarlo al operario en el momento del pistoleo.
   */
  const fueraDeAlcance = (sku: string): boolean => {
    const scope = currentSession?.skuScope;
    if (!scope || scope.length === 0) return false;
    const clean = sku.trim();
    return !scope.some(s => String(s).trim() === clean);
  };

  // Record a physical count entry with full business logic and validation
  const commitCountEntry = (sku: string, mmVal?: string, yyyyVal?: string, isOmitted: boolean = false, overrideQty?: number) => {
    if (!currentSession) return;

    const cleanSku = sku.trim();
    const qty = overrideQty !== undefined ? overrideQty : countQuantity;

    // Lookup master info in O(1) to enrich entry
    const summary = masterCatalogIndex.getBySku(cleanSku);
    const master = masterCatalogIndex.getRawBySku(cleanSku);
    const finalDesc = selectedProductDesc || (summary ? summary.name : 'Producto sin descripción');

    let cu_vc: string | undefined = undefined;
    let fecha_vc: string | undefined = undefined;

    if (mmVal && yyyyVal && !isOmitted) {
      cu_vc = generateCuVc(cleanSku, yyyyVal, mmVal);
      fecha_vc = calculateLastDayOfMonthDateString(yyyyVal, mmVal);
    }

    const newEntry: StockCountEntry = {
      id: generateShortVcId(),
      sku: cleanSku,
      descripcion: finalDesc,
      cu_vc,
      mm: isOmitted ? undefined : mmVal,
      yyyy: isOmitted ? undefined : yyyyVal,
      fecha_vc,
      cantidad: qty,
      ubicacion: countLocation.trim() || undefined,
      timestamp: new Date().toISOString(),
      rutProveedor: summary?.provider,
      politica: String(master?.POLITICA || master?.politica || '30'),
      diasRetiro: (master?.['DIAS RETIRO_VC'] || master?.dias_retiro || '30'),
      mundo: summary?.category || (master?.MUNDO !== undefined ? String(master.MUNDO) : undefined),
      pm: master?.PM !== undefined ? String(master.PM) : (master?.pm !== undefined ? String(master.pm) : undefined)
    };

    setSessions(prev => prev.map(s => {
      if (s.id === currentSession.id) {
        return {
          ...s,
          conteos: [newEntry, ...s.conteos]
        };
      }
      return s;
    }));

    // Reset input fields for next fast scan
    setScannedSku('');
    setSelectedProductDesc('');
    setCountQuantity(1);
    if (!isLocationLocked) {
      setCountLocation('');
    }
    setExpiryPromptSku(null);
    setTempMm('');
    setTempYyyy('');

    // Dynamic beep and toast confirmation. El orden de las ramas importa: "fuera de alcance"
    // va primero porque es el motivo más específico: un SKU ajeno al proveedor puede no estar
    // en el catálogo maestro y, si se evaluara después, se reportaría como "no catalogado".
    if (fueraDeAlcance(cleanSku)) {
      // Sesión acotada a un proveedor y lectura ajena: la conciliación la omite, así que un
      // "Registrado" en verde haría creer que el esfuerzo sirvió. Se guarda igual (puede ser
      // un hallazgo legítimo), pero se avisa para que el operario no cuente mercadería ajena.
      playBeep('skip');
      triggerVisualFlash('WARNING');
      showToast(`Fuera del alcance de esta sesión: ${cleanSku} (+${qty}). No entrará en la conciliación.`, 'warning');
    } else if (!summary) {
      // SKU fuera del catálogo maestro: la lectura se guarda (puede ser un hallazgo legítimo),
      // pero se avisa con tono neutro para que el operario note un posible dígito mal leído.
      playBeep('skip');
      triggerVisualFlash('WARNING');
      showToast(`SKU no catalogado: ${cleanSku} (+${qty}). Verifica el código.`, 'warning');
    } else if (isOmitted) {
      playBeep('skip');
      triggerVisualFlash('WARNING');
      showToast(`Registrado sin vencimiento: ${cleanSku} (+${qty})`, 'info');
    } else if (mmVal && yyyyVal) {
      playBeep('success');
      triggerVisualFlash('SUCCESS');
      showToast(`Registrado con vencimiento ${mmVal}/${yyyyVal}: ${cleanSku} (+${qty})`, 'success');
    } else {
      playBeep('success');
      triggerVisualFlash('SUCCESS');
      showToast(`Registrado: ${cleanSku} (+${qty})`, 'success');
    }

    // Retain input focus
    setTimeout(() => {
      skuInputRef.current?.focus();
    }, 50);
  };

  // Direct scan handler for Mobile / PDA Camera Scanner
  const handleCameraScanCode = (code: string) => {
    if (!currentSession) return;
    const cleanSku = code.trim();
    if (!cleanSku) return;

    // Fetch product info from catalog in O(1)
    const summary = masterCatalogIndex.getBySku(cleanSku);
    const finalDesc = summary ? summary.name : 'Producto sin descripción';
    setSelectedProductDesc(finalDesc);

    if (currentSession.requiereVencimiento) {
      const previousMatch = currentSession.conteos.find(c => c.sku === cleanSku && c.mm && c.yyyy);
      if (previousMatch) {
        commitCountEntry(cleanSku, previousMatch.mm, previousMatch.yyyy, false);
      } else {
        // Close camera scanner and ask for expiration date prompt
        setIsCameraScannerOpen(false);
        setExpiryPromptSku(cleanSku);
        setTempMm('');
        setTempYyyy('');
      }
    } else {
      commitCountEntry(cleanSku, undefined, undefined, false);
    }
  };

  // Hardware Laser / Bluetooth / USB HID Gun Scanner listener
  useHardwareBarcodeScanner({
    enabled: viewState === 'COUNTING' && !!currentSession && !isCameraScannerOpen && !expiryPromptSku,
    onScan: (barcode) => {
      handleCameraScanCode(barcode);
    },
    minBarcodeLength: 3,
    maxIntervalMs: 50,
    preventDefaultOnEnter: true,
    interceptInputFocus: true,
  });

  // Remove individual count entry
  const handleRemoveEntry = (entryId: string) => {
    if (!currentSession) return;
    setSessions(prev => prev.map(s => {
      if (s.id === currentSession.id) {
        return {
          ...s,
          conteos: s.conteos.filter(c => c.id !== entryId)
        };
      }
      return s;
    }));
    showToast('Lectura eliminada del conteo', 'info');
  };

  // Deshace la última lectura registrada (las entradas se insertan al inicio del arreglo).
  const handleUndoLastEntry = () => {
    if (!currentSession || currentSession.conteos.length === 0) {
      playBeep('error');
      showToast('No hay lecturas que deshacer', 'warning');
      return;
    }
    const last = currentSession.conteos[0];
    handleRemoveEntry(last.id);
    playBeep('skip');
    showToast(`Deshecha lectura: ${last.sku} (-${last.cantidad})`, 'info');
  };

  // Global Desktop Keyboard Shortcuts (Ctrl+Z to Undo, Esc to Clear SKU)
  useEffect(() => {
    if (viewState !== 'COUNTING') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoLastEntry();
      } else if (e.key === 'Escape') {
        if (scannedSku) {
          e.preventDefault();
          handleSkuChange('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewState, scannedSku]);

  // Group count entries by SKU for consolidated view on mobile/desktop
  const groupedSkuEntries = useMemo(() => groupSkuEntries(currentSession), [currentSession]);

  // Real providers extracted from the active sheet items
  const availableRealProviders = useMemo(() => {
    const set = new Set<string>();
    for (const item of sheetItems) {
      const p = item.RUT_PROVEEDOR_VC || item.PROVEEDOR || item.proveedor || item.RUT_PROVEEDOR;
      if (p && String(p).trim()) {
        set.add(String(p).trim());
      }
    }
    return Array.from(set).sort();
  }, [sheetItems]);

  // Last scanned item with cumulative quantity for instant visual feedback on mobile
  const lastScannedItem = useMemo(() => getLastScannedItem(currentSession), [currentSession]);

  // Increment quantity for a specific SKU (+1) directly from the grouped card
  const handleIncrementSkuQuantity = (sku: string) => {
    if (!currentSession) return;
    const existingEntries = currentSession.conteos.filter(c => c.sku === sku);
    if (existingEntries.length === 0) return;
    const latest = existingEntries[0];
    const newEntry: StockCountEntry = {
      ...latest,
      id: generateShortVcId(),
      cantidad: 1,
      timestamp: new Date().toISOString()
    };
    setSessions(prev => prev.map(s => {
      if (s.id === currentSession.id) {
        return {
          ...s,
          conteos: [newEntry, ...s.conteos]
        };
      }
      return s;
    }));
    playBeep('success');
  };

  // Decrement quantity for a specific SKU (-1) directly from the grouped card
  const handleDecrementSkuQuantity = (sku: string) => {
    if (!currentSession) return;
    const existingEntries = currentSession.conteos.filter(c => c.sku === sku);
    if (existingEntries.length === 0) return;
    
    const latest = existingEntries[0];
    if (latest.cantidad > 1) {
      setSessions(prev => prev.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            conteos: s.conteos.map(c => c.id === latest.id ? { ...c, cantidad: c.cantidad - 1 } : c)
          };
        }
        return s;
      }));
    } else {
      setSessions(prev => prev.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            conteos: s.conteos.filter(c => c.id !== latest.id)
          };
        }
        return s;
      }));
    }
    playBeep('skip');
  };

  // Remove all count entries for a specific SKU
  const handleRemoveSkuAllEntries = async (sku: string, desc?: string) => {
    if (!currentSession) return;
    const label = desc ? `${sku} (${desc})` : sku;
    if (await confirm({ title: 'Eliminar lecturas', message: `¿Eliminar todas las lecturas registradas para el SKU ${label}?`, confirmLabel: 'Eliminar' })) {
      setSessions(prev => prev.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            conteos: s.conteos.filter(c => c.sku !== sku)
          };
        }
        return s;
      }));
      playBeep('skip');
      showToast(`Lecturas del SKU ${sku} eliminadas`, 'info');
    }
  };

  // Update adjustment for stock in motion
  const handleUpdateAdjustment = (itemKey: string, value: number) => {
    if (!activeSessionId) return;
    setSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      const currentAdjustments = s.ajustesMovimiento || {};
      return {
        ...s,
        ajustesMovimiento: {
          ...currentAdjustments,
          [itemKey]: value
        }
      };
    }));
  };

  // Theoretical map for high-speed Opticon comparisons
  const theoreticalItemsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (currentSession?.modo === 'BLIND') return map;
    sheetItems.forEach(item => {
      const sku = String(item.SKU || item.sku || '').trim();
      const qty = parseLocaleNumber(item.CANTIDAD || item.cantidad || item.STOCK || item.stock || 0, 0);
      if (sku) {
        map.set(sku, (map.get(sku) || 0) + qty);
      }
    });
    return map;
  }, [sheetItems, currentSession?.modo]);

  // Bento & Opticon Fast Scan Commit Handler
  const handleCommitBentoScan = (sku: string, qty: number, mm?: string, yyyy?: string) => {
    if (!currentSession) return;
    const cleanSku = sku.trim();
    if (!cleanSku) return;

    if (mm && yyyy) {
      commitCountEntry(cleanSku, mm, yyyy, false, qty);
    } else {
      commitCountEntry(cleanSku, undefined, undefined, false, qty);
    }
  };

  // Reconciled items for the active session (computed lazily in RECONCILIATION & COUNTING views to optimize scan performance)
  const reconciliation = useMemo(() => {
    if (!currentSession) return [];
    if (viewState !== 'RECONCILIATION' && viewState !== 'COUNTING') return [];
    return reconcileStockCountSession(currentSession, sheetItems, headers, masterProducts);
  }, [currentSession, sheetItems, headers, masterProducts, viewState]);

  // Unique list of suppliers found in current reconciliation session
  const reconciliationProviders = useMemo(() => getReconciliationProviders(reconciliation), [reconciliation]);

  // Filtered reconciliation list for display & thermal printing
  const filteredReconciliation = useMemo(
    () => filterReconciliation(reconciliation, reconciliationFilter, selectedProviderFilter),
    [reconciliation, reconciliationFilter, selectedProviderFilter]);

  // Thermal ticket printer for supplier / reconciliation audit
  const handlePrintSupplierTicket = () => {
    if (filteredReconciliation.length === 0) {
      showToast('No hay productos para imprimir con el filtro actual', 'warning');
      return;
    }
    const itemsToPrint: InventoryItem[] = filteredReconciliation.map((r, idx) => ({
      _rowIndex: idx + 1,
      SKU: r.sku,
      DESCRIPCION: r.descripcion,
      'CANTIDAD CONTADA': r.contado,
      'CANTIDAD TEORICA': r.teorico,
      DIFERENCIA: r.diferencia === 0 ? '0 (OK)' : (r.diferencia > 0 ? `+${r.diferencia}` : String(r.diferencia)),
      PROVEEDOR: r.rutProveedor || 'N/A',
      ESTADO: r.estado
    }));

    setItemsToPrintList(itemsToPrint);
    setTicketPrintMode('standard');

    executeThermalPrint({
      elementId: STOCKCOUNT_TICKET_DOM_ID,
      paperWidth: '80mm',
      orientation: 'portrait',
      cutMarginMm: 2
    });

    const providerLabel = selectedProviderFilter === 'ALL' ? 'Todos los Proveedores' : selectedProviderFilter;
    showToast(`Imprimiendo ticket de auditoría (${providerLabel} - ${filteredReconciliation.length} ítems)`, 'info', 'Impresora Térmica');
  };

  // Reconciliation summary KPIs
  const metrics = useMemo(() => computeReconciliationMetrics(reconciliation), [reconciliation]);

  // Pending items list for operational checklist
  const pendingItems = useMemo(() => getPendingItems(currentSession, reconciliation), [currentSession, reconciliation]);

  // Export reconciliation report to Excel
  const handleExportExcel = async (exportScope: 'FILTERED' | 'COUNTED_ONLY' | 'ALL' = 'FILTERED') => {
    if (!currentSession) return;
    try {
      let exportList = filteredReconciliation;
      if (exportScope === 'COUNTED_ONLY') {
        exportList = reconciliation.filter(r => r.contado > 0);
      } else if (exportScope === 'ALL') {
        exportList = reconciliation;
      }

      if (exportList.length === 0) {
        showToast('No hay registros para exportar con el criterio seleccionado', 'warning');
        return;
      }

      await exportStockCountToExcel(currentSession, exportList);
      showToast(`Planilla de cuadratura exportada (${exportList.length} registros)`, 'success', 'Excel Generado');
    } catch (e: unknown) {
      showToast(`Error al exportar: ${getErrorMessage(e)}`, 'error');
    }
  };

  // Sync physical count records to the VENCIMIENTOS sheet
  const handleSyncToVencimientos = async () => {
    if (!currentSession || reconciliation.length === 0) return;
    setIsSyncingToSheet(true);

    try {
      // Items that were physically counted AND have expiry dates (skip omitted ones)
      const countedItems = reconciliation.filter(r => r.contado > 0 && r.mm && r.yyyy);
      if (countedItems.length === 0) {
        showToast('No hay productos con fechas de vencimiento registradas para sincronizar (las lecturas sin fecha fueron omitidas)', 'warning');
        setIsSyncingToSheet(false);
        return;
      }

      // Build 14-column records matching the VENCIMIENTOS sheet
      const rowsToSave = countedItems.map(item => {
        return buildVencimientosRowFromCount(item, item.rowIndexOriginal);
      });

      await onSyncRowsToVencimientos(rowsToSave);

      // Mark session as COMPLETED
      setSessions(prev => prev.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            estado: 'COMPLETED',
            fechaCierre: new Date().toISOString()
          };
        }
        return s;
      }));

      showToast(`Se han sincronizado ${rowsToSave.length} registros con la pestaña VENCIMIENTOS`, 'success', 'Sincronización Exitosa');
    } catch (e: unknown) {
      showToast(`Error al sincronizar: ${getErrorMessage(e)}`, 'error');
    } finally {
      setIsSyncingToSheet(false);
    }
  };

  // Sync general stock count / furniture audit to the dedicated _AUDITORIA_INVENTARIO sheet (leaving VENCIMIENTOS untouched)
  const handleSyncToAuditSheet = async () => {
    if (!currentSession || reconciliation.length === 0) return;
    setIsSyncingToSheet(true);

    try {
      const activeCamp = campaigns.find(c => c.id === activeCampaignIdState) || null;
      const rowsToSave = buildAuditRowsFromSession(currentSession, reconciliation, activeCamp);
      
      if (rowsToSave.length === 0) {
        showToast('No hay registros contados para guardar en auditoría', 'warning');
        setIsSyncingToSheet(false);
        return;
      }

      showToast(`Guardando ${rowsToSave.length} registros en la hoja _AUDITORIA_INVENTARIO...`, 'info', 'Guardando');
      const res = await saveAuditRowsToDedicatedSheet('_AUDITORIA_INVENTARIO', rowsToSave);

      // Mark session as COMPLETED
      setSessions(prev => prev.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            estado: 'COMPLETED',
            fechaCierre: new Date().toISOString()
          };
        }
        return s;
      }));

      playBeep('success');
      showToast(`¡Auditoría guardada exitosamente en la pestaña "${res.sheetName}" de Google Sheets! (La pestaña VENCIMIENTOS permanece intacta)`, 'success', 'Auditoría Guardada');
    } catch (e: unknown) {
      showToast(`Error al guardar en auditoría: ${getErrorMessage(e)}`, 'error');
    } finally {
      setIsSyncingToSheet(false);
    }
  };

  // Build executive summary text for supervisor / WhatsApp
  const buildReconciliationSummaryText = () => {
    if (!currentSession) return '';
    const dateStr = new Date().toLocaleDateString('es-CL');
    const timeStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const coveragePct = metrics.totalTeorico > 0 
      ? Math.round((metrics.cuadrados / Math.max(1, reconciliation.length)) * 100) 
      : 100;

    let text = `📋 *RESUMEN DE CUADRATURA DE INVENTARIO*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🏷️ *Sesión:* ${currentSession.nombre}\n`;
    text += `📍 *Ubicación:* ${currentSession.ubicacion || 'General / Sala'}\n`;
    text += `📅 *Fecha:* ${dateStr} ${timeStr}\n`;
    text += `⚙️ *Modalidad:* ${currentSession.modo === 'BLIND' ? 'Conteo a Ciegas' : 'Contra Documento'}\n\n`;

    text += `📊 *MÉTRICAS CLAVE*\n`;
    text += `• Total Físico: ${formatLocaleNumber(metrics.totalContado)} unids\n`;
    text += `• Total Teórico: ${formatLocaleNumber(metrics.totalTeorico)} unids\n`;
    text += `• Dif. Neta: ${metrics.diferenciaNeta > 0 ? '+' : ''}${formatLocaleNumber(metrics.diferenciaNeta)} unids\n`;
    text += `• Exactitud (SKUs Cuadrados): ${metrics.cuadrados} (${coveragePct}%)\n`;
    text += `• SKUs con Faltante: ${metrics.faltantes}\n`;
    text += `• SKUs con Sobrante: ${metrics.sobrantes}\n`;
    if (metrics.noCatalogados > 0) {
      text += `• SKUs No Catalogados: ${metrics.noCatalogados}\n`;
    }

    const discrepantItems = reconciliation.filter(r => r.diferencia !== 0);
    if (discrepantItems.length > 0) {
      text += `\n⚠️ *PRINCIPALES DIFERENCIAS (${discrepantItems.length} ítems)*\n`;
      discrepantItems.slice(0, 15).forEach((item, idx) => {
        const sign = item.diferencia > 0 ? '+' : '';
        const mmYyyy = item.mm && item.yyyy ? ` [${item.mm}/${item.yyyy}]` : '';
        text += `${idx + 1}. *SKU ${item.sku}*${mmYyyy}: ${item.descripcion.slice(0, 30)}... | Físico: ${item.contado} vs Teo: ${item.teorico} (*${sign}${item.diferencia}*)\n`;
      });
      if (discrepantItems.length > 15) {
        text += `...y ${discrepantItems.length - 15} ítems más con diferencias.\n`;
      }
    }

    text += `\n_Generado automáticamente desde Gestor de Vencimientos e Incidencias_`;
    return text;
  };

  const handleCopyReconciliationSummary = async () => {
    const text = buildReconciliationSummaryText();
    const success = await copyTextToClipboard(text);
    if (success) {
      setIsSummaryCopied(true);
      playBeep('success');
      showToast('Resumen de cuadratura copiado al portapapeles', 'success');
      setTimeout(() => setIsSummaryCopied(false), 2500);
    } else {
      showToast('No se pudo copiar el resumen al portapapeles', 'error');
    }
  };

  const handleShareReconciliationWhatsApp = () => {
    const text = buildReconciliationSummaryText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopyDiscrepanciesReport = async () => {
    const discrepancies = reconciliation.filter(r => r.diferencia !== 0);
    if (discrepancies.length === 0) {
      showToast('No hay diferencias registradas en esta sesión. Todo está 100% cuadrado.', 'info');
      return;
    }

    let report = `ACTA DE DIFERENCIAS DE INVENTARIO - ${currentSession?.nombre.toUpperCase()}\n`;
    report += `Fecha: ${new Date().toLocaleDateString('es-CL')} | Total Ítems con Diferencia: ${discrepancies.length}\n`;
    report += `--------------------------------------------------------------------------------\n`;
    report += `SKU\tDESCRIPCION\tMES_ANO\tTEORICO\tFISICO\tDIFERENCIA\tTIPO_INCIDENCIA\n`;
    
    discrepancies.forEach(d => {
      const mesAno = d.mm && d.yyyy ? `${d.mm}/${d.yyyy}` : '';
      const tipo = d.diferencia < 0 ? 'FALTANTE_STOCK' : 'SOBRANTE_STOCK';
      report += `${d.sku}\t${d.descripcion}\t${mesAno}\t${d.teorico}\t${d.contado}\t${d.diferencia}\t${tipo}\n`;
    });

    const success = await copyTextToClipboard(report);
    if (success) {
      playBeep('success');
      showToast(`Acta con ${discrepancies.length} diferencias copiada al portapapeles`, 'success');
    }
  };

  return (
    <div className="flex-1 w-full h-full bg-white dark:bg-slate-900 flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 relative">
        
        {/* Visual Flash Feedback Overlay for Noisy Environments */}
        {visualFlash !== 'NONE' && (
          <div 
            className={`fixed inset-0 pointer-events-none z-50 transition-all duration-100 ${
              visualFlash === 'SUCCESS' 
                ? 'border-[8px] sm:border-[12px] border-emerald-500 bg-emerald-500/15 shadow-[inset_0_0_50px_rgba(16,185,129,0.4)]' 
                : visualFlash === 'WARNING'
                ? 'border-[8px] sm:border-[12px] border-amber-500 bg-amber-500/15 shadow-[inset_0_0_50px_rgba(245,158,11,0.4)]'
                : 'border-[8px] sm:border-[12px] border-rose-600 bg-rose-600/20 shadow-[inset_0_0_50px_rgba(225,29,72,0.45)]'
            }`}
          />
        )}
        
        {/* ======================================================== */}
        {/* HEADER (StockCountHeader Component)                     */}
        {/* ======================================================== */}
        <StockCountHeader
          viewState={viewState}
          setViewState={setViewState}
          currentSession={currentSession}
          sessions={sessions.filter(s => !s.deleted)}
          setActiveSessionId={setActiveSessionId}
          isSyncingCloud={isSyncingCloud}
          lastCloudSyncDate={lastCloudSyncDate}
          erpSnapshotCount={erpSnapshotCount}
          isBlind={isBlind}
          handleCloudSync={handleCloudSync}
          setIsErpUploadModalOpen={setIsErpUploadModalOpen}
          setIsWorkflowGuideModalOpen={setIsWorkflowGuideModalOpen}
          handleSwitchToTerminal={handleSwitchToTerminal}
          showToast={showToast}
          onClose={onClose}
          navigate={navigate}
          setForceDesktopCampaignView={setForceDesktopCampaignView}
        />

        {/* ======================================================== */}
        {/* BODY - VIEW 0: CAMPAIGN CONSOLIDATION DASHBOARD          */}
        {/* ======================================================== */}
        {viewState === 'CAMPAIGN' && (
          <ScopedErrorBoundary moduleName="Consolidación de Campaña">
            {isMobile && !forceDesktopCampaignView ? (
              <MobileErpSnapshotView
                campaigns={campaigns}
                activeCampaignId={activeCampaignIdState}
                sessions={sessions.filter(s => !s.deleted)}
                onUpdateCampaigns={handleUpdateCampaigns}
                onSelectCampaign={handleSelectCampaign}
                onSwitchToTerminal={handleSwitchToTerminal}
                showToast={showToast}
                onSyncCloud={() => handleCloudSync(false)}
                isSyncingCloud={isSyncingCloud}
                lastCloudSyncDate={lastCloudSyncDate || undefined}
                onOpenDesktopView={() => setForceDesktopCampaignView(true)}
              />
            ) : (
              <Suspense fallback={<LazyFallback />}>
                <CampaignConsolidationDashboard
                  campaigns={campaigns}
                  activeCampaignId={activeCampaignIdState}
                  sessions={sessions.filter(s => !s.deleted)}
                  onUpdateCampaigns={handleUpdateCampaigns}
                  onSelectCampaign={handleSelectCampaign}
                  onStartTargetedRecount={handleStartTargetedRecount}
                  onStartProviderCount={handleStartProviderCount}
                  showToast={showToast}
                  onUpdateSessions={setSessions}
                  onNavigateToSessionList={() => setViewState('LIST')}
                  onSwitchToTerminal={handleSwitchToTerminal}
                />
              </Suspense>
            )}
          </ScopedErrorBoundary>
        )}

        {/* ======================================================== */}
        {/* BODY - VIEW 1: SESSIONS LIST & NEW SESSION CREATOR       */}
        {/* ======================================================== */}
        {viewState === 'LIST' && (
          <ScopedErrorBoundary moduleName="Lista de Sesiones">
            <StockCountSessionsListView
              sessions={sessions.filter(s => !s.deleted)}
              sheetItems={sheetItems}
              isSyncingCloud={isSyncingCloud}
              realProviders={availableRealProviders}
              erpSnapshotCount={erpSnapshotCount}
              activeCampaignName={activeCampaign?.nombre}
              onOpenUploadErp={() => setIsErpUploadModalOpen(true)}
              onOpenWorkflowGuide={() => setIsWorkflowGuideModalOpen(true)}
              onCreateSession={handleCreateSession}
              onOpenSession={handleOpenSession}
              onDeleteSession={handleDeleteSession}
              onBackupSessionToCloud={handleBackupSessionToCloud}
              onCloudSync={handleCloudSync}
            />
          </ScopedErrorBoundary>
        )}

        {/* ======================================================== */}
        {/* BODY - VIEW 2: ACTIVE BENTO COUNTING TERMINAL            */}
        {/* ======================================================== */}
        {viewState === 'COUNTING' && (
          currentSession ? (
            <ScopedErrorBoundary moduleName="Terminal Bento de Conteo">
              <BentoCountTerminal
                currentSession={currentSession}
                activeLocation={countLocation || currentSession.ubicacion || 'Mueble 1'}
                onChangeLocation={(newLoc) => setCountLocation(newLoc)}
                isLocationLocked={isLocationLocked}
                onToggleLocationLock={() => {
                  const nextLock = !isLocationLocked;
                  setIsLocationLocked(nextLock);
                  playBeep('skip');
                  showToast(nextLock ? 'Ubicación fijada' : 'Ubicación libre', 'info');
                }}
                lastScannedItem={lastScannedItem}
                onCommitScan={handleCommitBentoScan}
                onIncrementSku={handleIncrementSkuQuantity}
                onDecrementSku={handleDecrementSkuQuantity}
                onRemoveSkuAllEntries={handleRemoveSkuAllEntries}
                onRemoveEntry={handleRemoveEntry}
                onUndoLastEntry={handleUndoLastEntry}
                groupedSkuEntries={groupedSkuEntries}
                pendingItems={pendingItems}
                theoreticalItemsMap={theoreticalItemsMap}
                masterCatalogIndex={masterCatalogIndex}
                onOpenLiveCamera={() => setIsCameraScannerOpen(true)}
                onGoToReconciliation={() => setViewState('RECONCILIATION')}
                showToast={showToast}
                campaignSkuStats={campaignSkuStats}
                yearsList={yearsList}
                expiryPromptSku={expiryPromptSku}
                setExpiryPromptSku={setExpiryPromptSku}
                tempMm={tempMm}
                setTempMm={setTempMm}
                tempYyyy={tempYyyy}
                setTempYyyy={setTempYyyy}
                onBackToSessions={() => setViewState('LIST')}
                onBackToCampaign={activeCampaign ? () => setViewState('CAMPAIGN') : undefined}
                onFinishFurnitureAndNext={handleFinishFurnitureAndNext}
              />
            </ScopedErrorBoundary>
          ) : (
            /* Friendly Empty State / Quick Starter if no session is active */
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900 text-slate-100 overflow-y-auto">
              <div className="max-w-md w-full bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 text-center shadow-xl">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  ¿Listo para comenzar a contar?
                </h3>
                <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                  Para pistolear productos, primero elige qué mueble o pasillo vas a auditar.
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => handleCreateSession({
                      nombre: `Mueble ${sessions.length + 1}`,
                      modo: 'DOCUMENT',
                      requiereVencimiento: false,
                      ubicacion: `Mueble ${sessions.length + 1}`
                    })}
                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 text-sm"
                  >
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>Iniciar Conteo Rápido (Mueble {sessions.length + 1})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewState('LIST')}
                    className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all text-xs"
                  >
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span>Ver o Crear Muebles Específicos</span>
                  </button>
                </div>
              </div>
            </div>
          )
        )}


        {/* ======================================================== */}
        {/* BODY - VIEW 3: RECONCILIATION & SHEET SYNCHRONIZATION    */}
        {/* ======================================================== */}
        {viewState === 'RECONCILIATION' && currentSession && (
          <ScopedErrorBoundary moduleName="Cuadratura y Conciliación">
            <StockCountReconciliationView
              currentSession={currentSession}
              reconciliation={reconciliation}
              filteredReconciliation={filteredReconciliation}
              reconciliationProviders={reconciliationProviders}
              reconciliationFilter={reconciliationFilter}
              setReconciliationFilter={setReconciliationFilter}
              selectedProviderFilter={selectedProviderFilter}
              setSelectedProviderFilter={setSelectedProviderFilter}
              metrics={metrics}
              isSummaryCopied={isSummaryCopied}
              isSyncingToSheet={isSyncingToSheet}
              handleUpdateAdjustment={handleUpdateAdjustment}
              handleCopyReconciliationSummary={handleCopyReconciliationSummary}
              handleShareReconciliationWhatsApp={handleShareReconciliationWhatsApp}
              handleCopyDiscrepanciesReport={handleCopyDiscrepanciesReport}
              handlePrintSupplierTicket={handlePrintSupplierTicket}
              handleExportExcel={handleExportExcel}
              handleSyncToVencimientos={handleSyncToVencimientos}
              handleSyncToAuditSheet={handleSyncToAuditSheet}
            />
          </ScopedErrorBoundary>
        )}

        {/* Mobile Camera Barcode Scanner Modal for PDA / Cellphones */}
        {currentSession && (
          <MobileCameraBarcodeScanner
            isOpen={isCameraScannerOpen}
            onClose={() => setIsCameraScannerOpen(false)}
            onScan={handleCameraScanCode}
            activeLocation={countLocation || currentSession.ubicacion}
            sessionName={currentSession.nombre}
          />
        )}

        {/* Persistent Mobile Bottom Navigation Bar */}
        {isMobile && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-around py-1.5 px-2 shadow-lg">
            {/* Foto ERP */}
            <button
              type="button"
              onClick={() => {
                setForceDesktopCampaignView(false);
                setViewState('CAMPAIGN');
              }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all cursor-pointer ${
                viewState === 'CAMPAIGN'
                  ? 'text-blue-600 dark:text-blue-400 font-black'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="text-[10px]">Foto ERP</span>
            </button>

            {/* Muebles */}
            <button
              type="button"
              onClick={() => setViewState('LIST')}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all cursor-pointer ${
                viewState === 'LIST'
                  ? 'text-blue-600 dark:text-blue-400 font-black'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span className="text-[10px]">Muebles ({sessions.filter(s => !s.deleted).length})</span>
            </button>

            {/* Pistola Conteo */}
            <button
              type="button"
              onClick={() => handleSwitchToTerminal()}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all cursor-pointer ${
                viewState === 'COUNTING'
                  ? 'text-amber-500 font-black'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              <Zap className={`w-4 h-4 ${viewState === 'COUNTING' ? 'fill-amber-500 text-amber-500' : ''}`} />
              <span className="text-[10px]">Pistola {currentSession ? `(${currentSession.conteos.length})` : ''}</span>
            </button>

            {/* Cuadratura */}
            {currentSession && (
              <button
                type="button"
                onClick={() => setViewState('RECONCILIATION')}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all cursor-pointer ${
                  viewState === 'RECONCILIATION'
                    ? 'text-emerald-600 dark:text-emerald-400 font-black'
                    : 'text-slate-500 dark:text-slate-400 font-medium'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[10px]">Cuadratura</span>
              </button>
            )}
          </div>
        )}

        {/*
          El ticket de auditoría se portaliza a document.body: el overlay del terminal
          es .fixed y el CSS de impresión oculta .fixed !important, de modo que dentro
          del overlay el ticket nunca llegaba a imprimirse y acababa imprimiendo el
          ticket del dashboard. El id es propio de esta instancia para no colisionar.
        */}
        {createPortal(
          <TicketPrintView
            domId={STOCKCOUNT_TICKET_DOM_ID}
            items={itemsToPrintList}
            headers={['SKU', 'DESCRIPCION', 'CANTIDAD CONTADA', 'CANTIDAD TEORICA', 'DIFERENCIA', 'PROVEEDOR']}
            config={{
              general: {
                title: `AUDITORÍA PROVEEDOR - ${selectedProviderFilter === 'ALL' ? 'GENERAL' : selectedProviderFilter}`,
                paperWidth: '80mm',
                orientation: 'portrait',
                showDateTime: true,
                showTotalCount: true
              },
              columns: {
                SKU: { show: true, bold: true, size: 12 },
                DESCRIPCION: { show: true, bold: false, size: 11 },
                'CANTIDAD CONTADA': { show: true, bold: true, size: 11 },
                'CANTIDAD TEORICA': { show: true, bold: false, size: 10 },
                DIFERENCIA: { show: true, bold: true, size: 11 },
                PROVEEDOR: { show: true, bold: false, size: 10 }
              }
            }}
            activeView="main"
            mode={ticketPrintMode}
          />,
          document.body
        )}
        {/* ERP Snapshot Upload Modal */}
        <ErpSnapshotUploadModal
          isOpen={isErpUploadModalOpen}
          onClose={() => setIsErpUploadModalOpen(false)}
          campaigns={campaigns}
          activeCampaignId={activeCampaignIdState}
          sessions={sessions}
          onUpdateCampaigns={handleUpdateCampaigns}
          onSelectCampaign={handleSelectCampaign}
          onAutoSyncCloud={handleAutoSyncCampaignsToCloud}
          showToast={showToast}
        />

        {/* Guided Workflow Help Modal */}
        <StockCountWorkflowGuideModal
          isOpen={isWorkflowGuideModalOpen}
          onClose={() => setIsWorkflowGuideModalOpen(false)}
          onOpenUploadErp={() => setIsErpUploadModalOpen(true)}
          onOpenNewSession={() => setViewState('LIST')}
        />
      </div>
  );
};
