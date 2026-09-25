import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Minus, Trash2, CheckCircle2, Calendar, Search, Layers, FileSpreadsheet, Barcode, Hash, MapPin, Lock, Unlock, ListTodo, Zap, Store, Camera, Cloud, Loader2, Undo2 } from 'lucide-react';
import { StockCountSession, StockCountEntry, InventoryItem, InventoryCampaign, SheetRecord } from '../../types';
import { generateCuVc, calculateLastDayOfMonthDateString, reconcileStockCountSession, buildVencimientosRowFromCount, buildAuditRowsFromSession, loadStockCountSessionsFromStorage, saveStockCountSessionsToStorage, saveStockCountSessionsToStorageDebounced, flushStockCountSessionsToStorage, exportStockCountToExcel, generateShortVcId, playBeep, getOrCreateDeviceId } from '../../utils/stockCountUtils';
import { loadCampaignsFromStorage, saveCampaignsToStorage, getActiveCampaignId, setActiveCampaignId } from '../../utils/campaignUtils';
import { saveAuditRowsToDedicatedSheet, syncCampaignsWithCloud } from '../../lib/sheets';
import { LazyFallback } from '../common/LazyFallback';
import { MobileCameraBarcodeScanner } from './MobileCameraBarcodeScanner';
import { MobileErpSnapshotView } from './MobileErpSnapshotView';
import { StockCountReconciliationView } from './StockCountReconciliationView';
import { StockCountSessionsListView, NewSessionConfig } from './StockCountSessionsListView';
import { CountNumpad } from './CountNumpad';
import { CampaignSkuErpBadge } from '../campaign/CampaignSkuBadges';
import { MobileReadingsList } from './MobileReadingsList';
import { LastScannedHeroCard } from './LastScannedHeroCard';
import { MobileExpiryPrompt, MONTHS_LIST } from './MobileExpiryPrompt';
import { buildMasterCatalogIndex, MasterProductSummary } from '../../utils/referenceResolver';
import { formatLocaleNumber } from '../../utils/pureCalculations';
import { groupSkuEntries, getLastScannedItem, filterGroupedEntries, filterChronoEntries, getReconciliationProviders, filterReconciliation, computeReconciliationMetrics, getPendingItems } from '../../utils/countAggregation';
import { copyTextToClipboard } from '../../utils/exportUtils';
import { executeThermalPrint } from '../../utils/ticketUtils';
import { TicketPrintView } from './TicketPrintView';
import { getErrorMessage } from '../../utils/pureCalculations';
import { useConfirm } from '../common/ConfirmDialog';

import { STORAGE_KEYS } from '../../utils/appStorage';
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
  // Campaigns list & active campaign
  const [campaigns, setCampaigns] = useState<InventoryCampaign[]>(() => loadCampaignsFromStorage());
  const [activeCampaignIdState, setActiveCampaignIdState] = useState<string | null>(() => getActiveCampaignId());

  // Cloud Auto-Sync with Office PC & Google Sheets
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [lastCloudSyncDate, setLastCloudSyncDate] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.LAST_CAMPAIGN_CLOUD_SYNC);
    } catch {
      return null;
    }
  });

  // Active campaign entity
  const activeCampaign = useMemo(() => {
    if (!activeCampaignIdState && campaigns.length > 0) {
      return campaigns[0];
    }
    return campaigns.find(c => c.id === activeCampaignIdState) || null;
  }, [campaigns, activeCampaignIdState]);

  // Cloud sync handler (Two-Way Merging between this device and Google Sheets)
  const handleCloudSync = async (silent: boolean = false) => {
    setIsSyncingCloud(true);
    try {
      const res = await syncCampaignsWithCloud({
        campaigns,
        activeCampaignId: activeCampaignIdState,
        sessions
      });

      if (res && res.success) {
        setCampaigns(res.mergedCampaigns);
        setSessions(res.mergedSessions);
        saveCampaignsToStorage(res.mergedCampaigns);
        saveStockCountSessionsToStorage(res.mergedSessions);

        if (res.activeCampaignId) {
          setActiveCampaignIdState(res.activeCampaignId);
          setActiveCampaignId(res.activeCampaignId);
        }

        const nowStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        setLastCloudSyncDate(nowStr);
        try {
          localStorage.setItem(STORAGE_KEYS.LAST_CAMPAIGN_CLOUD_SYNC, nowStr);
        } catch {}

        if (!silent) {
          playBeep('success');
          showToast(
            `¡Sincronizado con oficina! ${res.mergedSessions.length} muebles y ${res.mergedCampaigns.length} campaña(s) consolidadas.`,
            'success',
            'Sincronización Exitosa'
          );
        }
      } else if (!silent) {
        showToast('No se pudo conectar a Google Sheets.', 'warning');
      }
    } catch (e: unknown) {
      if (!silent) {
        showToast(`Error al consultar la nube: ${getErrorMessage(e)}`, 'error');
      }
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Respaldar manifiesto de una sesión / mueble específico a la nube
  const handleBackupSessionToCloud = async (sessionToBackup: StockCountSession) => {
    setIsSyncingCloud(true);
    try {
      showToast(`Respaldando manifiesto de "${sessionToBackup.nombre}" en la nube...`, 'info', 'Respaldo Nube');
      const updatedSession: StockCountSession = {
        ...sessionToBackup,
        sincronizadoNube: true,
        lastUpdated: new Date().toISOString(),
        deviceId: sessionToBackup.deviceId || getOrCreateDeviceId()
      };
      const updatedSessions = sessions.map(s => s.id === sessionToBackup.id ? updatedSession : s);
      setSessions(updatedSessions);
      saveStockCountSessionsToStorage(updatedSessions);

      const res = await syncCampaignsWithCloud({
        campaigns,
        activeCampaignId: activeCampaignIdState,
        sessions: updatedSessions
      });

      if (res && res.success) {
        setCampaigns(res.mergedCampaigns);
        setSessions(res.mergedSessions);
        saveCampaignsToStorage(res.mergedCampaigns);
        saveStockCountSessionsToStorage(res.mergedSessions);
        playBeep('success');
        showToast(
          `✅ Manifiesto de "${sessionToBackup.nombre}" respaldado en la nube (${sessionToBackup.conteos.length} lecturas).`,
          'success',
          'Manifiesto Guardado'
        );
      } else {
        showToast('Guardado localmente. Se respaldará en la nube cuando haya conexión.', 'warning');
      }
    } catch (err: unknown) {
      showToast(`Error de respaldo: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Auto-sync on mount to pull any fresh theoretical stock uploaded in the office PC
  useEffect(() => {
    handleCloudSync(true);
  }, []);

  // Session list & active session
  const [sessions, setSessions] = useState<StockCountSession[]>(() => loadStockCountSessionsFromStorage());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  // Navigation view inside modal: 'CAMPAIGN' | 'LIST' | 'COUNTING' | 'RECONCILIATION'
  const [viewState, setViewState] = useState<'CAMPAIGN' | 'LIST' | 'COUNTING' | 'RECONCILIATION'>(() => {
    const savedCampaigns = loadCampaignsFromStorage();
    return savedCampaigns.length > 0 ? 'CAMPAIGN' : 'LIST';
  });

  // Mobile layout detection & optional full desktop toggle
  const [forceDesktopCampaignView, setForceDesktopCampaignView] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Persist campaigns
  const handleUpdateCampaigns = (updated: InventoryCampaign[]) => {
    setCampaigns(updated);
    saveCampaignsToStorage(updated);
  };

  const handleSelectCampaign = (id: string) => {
    setActiveCampaignIdState(id);
    setActiveCampaignId(id);
  };

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
      conteos: []
    };

    // Update sessions
    const updatedSessions = [newSession, ...sessions];
    setSessions(updatedSessions);
    saveStockCountSessionsToStorage(updatedSessions);

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

  // New session creation form states

  // Active counting terminal form states
  const [scannedSku, setScannedSku] = useState('');
  const [selectedProductDesc, setSelectedProductDesc] = useState('');
  const [countQuantity, setCountQuantity] = useState<number>(1);
  const [countLocation, setCountLocation] = useState<string>('');
  const [isLocationLocked, setIsLocationLocked] = useState<boolean>(false);
  const [isBurstScanMode, setIsBurstScanMode] = useState<boolean>(true); // Fast burst scanning (+1 auto)
  const [isSummaryCopied, setIsSummaryCopied] = useState<boolean>(false);

  // Expiry prompt states for sequential 2-step flow
  const [expiryPromptSku, setExpiryPromptSku] = useState<string | null>(null);
  const [tempMm, setTempMm] = useState<string>('');
  const [tempYyyy, setTempYyyy] = useState<string>('');
  
  // Right panel view & anti-bounce scanner ref
  const [rightTab, setRightTab] = useState<'READINGS' | 'PENDING'>('READINGS');
  const [pendingSearch, setPendingSearch] = useState<string>('');
  const lastScanRef = useRef<{ sku: string; timestamp: number } | null>(null);

  // Autocomplete / Search dropdown
  const [catalogSearchResults, setCatalogSearchResults] = useState<MasterProductSummary[]>([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const skuInputRef = useRef<HTMLInputElement>(null);

  // Mobile / PDA camera scanner state
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  // Real-time Campaign status for scanned SKU across all pharmacy sessions & ERP snapshot
  const campaignSkuStats = useMemo(() => {
    if (!scannedSku || !scannedSku.trim()) return null;
    const sku = scannedSku.trim();
    const itemInErp = activeCampaign?.snapshotTeoricoActual?.[sku];
    let totalFisicoCampana = 0;
    sessions.forEach(sess => {
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
      totalFisicoCampana,
      diferencia,
      isValidatedInCampaign
    };
  }, [scannedSku, activeCampaign, sessions]);

  // Readings view mode: 'GROUPED' (consolidated by SKU) vs 'CHRONO' (chronological individual log)
  const [readingsViewMode, setReadingsViewMode] = useState<'GROUPED' | 'CHRONO'>('GROUPED');
  
  // Mobile dedicated tab when in active counting session: 'SCAN' (Scanner / Keypad) | 'READINGS' (Full-screen readings list)
  const [mobileCountingTab, setMobileCountingTab] = useState<'SCAN' | 'READINGS'>('SCAN');
  const [readingsSearch, setReadingsSearch] = useState<string>('');

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

  // Mobile Numpad & Packaging Multiplier mode: 'NUMPAD' | 'CHIPS'
  const [mobileEntryMode, setMobileEntryMode] = useState<'NUMPAD' | 'CHIPS'>('NUMPAD');
  const [packMultiplierCategory, setPackMultiplierCategory] = useState<'UNITS' | 'PACKS'>('UNITS');

  // Master catalog pre-indexed for lightning-fast O(1) lookups on low-end PDAs
  const masterCatalogIndex = useMemo(() => {
    return buildMasterCatalogIndex(masterProducts);
  }, [masterProducts]);

  // Industrial Numpad Digit Input
  const handleNumpadDigit = (digit: string) => {
    playBeep('skip');
    setCountQuantity(prev => {
      if (digit === '00') {
        const next = prev * 100;
        return next > 99999 ? prev : next;
      }
      if (prev === 1 || prev === 0) {
        return parseInt(digit, 10) || 1;
      }
      const str = `${prev}${digit}`;
      const parsed = parseInt(str, 10);
      return isNaN(parsed) || parsed > 99999 ? prev : parsed;
    });
  };

  // Industrial Numpad Backspace
  const handleNumpadBackspace = () => {
    playBeep('skip');
    setCountQuantity(prev => {
      const str = prev.toString();
      if (str.length <= 1) return 1;
      return parseInt(str.slice(0, -1), 10) || 1;
    });
  };

  // Industrial Numpad Clear
  const handleNumpadClear = () => {
    playBeep('skip');
    setCountQuantity(1);
  };

  // Presentation Multipliers (e.g. x6, x10, x20, x30, x50, x100)
  const handleApplyPackagingMultiplier = (factor: number) => {
    playBeep('success');
    triggerVisualFlash('SUCCESS');
    setCountQuantity(prev => {
      if (prev === 1) return factor;
      return prev * factor;
    });
    showToast(`Empaque ×${factor} aplicado`, 'info');
  };

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return sessions.find(s => s.id === activeSessionId) || null;
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

  // Handle master product search / SKU matching with O(1) exact lookup & debounced multi-match
  const handleSkuChange = (val: string) => {
    setScannedSku(val);
    const clean = val.trim();
    if (!clean) {
      setSelectedProductDesc('');
      setCatalogSearchResults([]);
      setIsSearchDropdownOpen(false);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      return;
    }

    // 1. Instant O(1) exact match check
    const exact = masterCatalogIndex.getBySku(clean);
    if (exact) {
      setSelectedProductDesc(exact.name);
      setIsSearchDropdownOpen(false);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      return;
    }

    // 2. Debounced multi-match search (200ms) to avoid CPU lockup during fast typing / scanning
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const results = masterCatalogIndex.search(clean, 6);
      setCatalogSearchResults(results);
      setIsSearchDropdownOpen(results.length > 0);
    }, 200);
  };

  const handleSelectProductFromCatalog = (product: MasterProductSummary) => {
    setScannedSku(product.sku);
    setSelectedProductDesc(product.name);
    setIsSearchDropdownOpen(false);
    skuInputRef.current?.focus();
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
      deviceId: getOrCreateDeviceId(),
      lastUpdated: new Date().toISOString(),
      sincronizadoNube: false
    };

    setSessions(prev => {
      const updated = [newSession, ...prev];
      saveStockCountSessionsToStorage(updated);
      return updated;
    });

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

  // Switch to the active counting terminal, resuming an in-progress session if needed
  const handleSwitchToTerminal = (targetSku?: string) => {
    if (targetSku) {
      setScannedSku(targetSku);
      handleSkuChange(targetSku);
    }
    if (currentSession && currentSession.estado !== 'COMPLETED') {
      setViewState('COUNTING');
    } else if (sessions.length > 0) {
      const inProgress = sessions.find(s => s.estado !== 'COMPLETED') || sessions[0];
      setActiveSessionId(inProgress.id);
      setViewState('COUNTING');
    } else {
      setViewState('LIST');
    }
  };

  // Delete session
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirm({ title: 'Eliminar sesión', message: '¿Estás seguro de eliminar esta sesión de conteo?', confirmLabel: 'Eliminar' })) {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setViewState('LIST');
      }
      showToast('Sesión de conteo eliminada', 'info');
    }
  };

  // Record a physical count entry with full business logic and validation
  const commitCountEntry = (sku: string, mmVal?: string, yyyyVal?: string, isOmitted: boolean = false) => {
    if (!currentSession) return;

    const cleanSku = sku.trim();
    const qty = countQuantity;

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
    setIsSearchDropdownOpen(false);

    // Dynamic beep and toast confirmation
    if (!summary) {
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

  const handleSkuScannedOrEntered = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentSession) return;

    const cleanSku = scannedSku.trim();
    if (!cleanSku) {
      playBeep('error');
      showToast('Ingresa o escanea un SKU válido', 'warning');
      skuInputRef.current?.focus();
      return;
    }

    if (countQuantity <= 0) {
      playBeep('error');
      showToast('La cantidad debe ser mayor a 0', 'warning');
      return;
    }

    // Anti-rebounce (debouncing) scanner check (800ms threshold)
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.sku === cleanSku && (now - lastScanRef.current.timestamp) < 800) {
      playBeep('error');
      showToast(`Escaneo duplicado por rebote de pistola ignorado (${cleanSku})`, 'warning');
      setScannedSku('');
      return;
    }
    lastScanRef.current = { sku: cleanSku, timestamp: now };

    // Fetch product name in O(1)
    const summary = masterCatalogIndex.getBySku(cleanSku);
    const finalDesc = selectedProductDesc || (summary ? summary.name : 'Producto sin descripción');
    setSelectedProductDesc(finalDesc);

    // Validate requirement for expiry date
    if (currentSession.requiereVencimiento) {
      // PER-PRODUCT MEMORY: Check if SKU has already been scanned in this active session with an associated date
      const previousMatch = currentSession.conteos.find(c => c.sku === cleanSku && c.mm && c.yyyy);
      if (previousMatch) {
        // Auto-apply this pre-associated date and commit instantly!
        commitCountEntry(cleanSku, previousMatch.mm, previousMatch.yyyy, false);
      } else {
        // No previous date found, trigger sequential prompt
        setExpiryPromptSku(cleanSku);
        setTempMm('');
        setTempYyyy('');
      }
    } else {
      // Expiry not required, save immediately
      commitCountEntry(cleanSku, undefined, undefined, false);
    }
  };

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

  // Group count entries by SKU for consolidated view on mobile/desktop
  const groupedSkuEntries = useMemo(() => groupSkuEntries(currentSession), [currentSession]);

  // Last scanned item with cumulative quantity for instant visual feedback on mobile
  const lastScannedItem = useMemo(() => getLastScannedItem(currentSession), [currentSession]);

  // Filtered grouped entries for search
  const filteredGroupedSkuEntries = useMemo(
    () => filterGroupedEntries(groupedSkuEntries, readingsSearch),
    [groupedSkuEntries, readingsSearch]);

  // Filtered chronological entries for search
  const filteredChronoEntries = useMemo(
    () => filterChronoEntries(currentSession, readingsSearch),
    [currentSession, readingsSearch]);

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
  const handleRemoveSkuAllEntries = async (sku: string, desc: string) => {
    if (!currentSession) return;
    if (await confirm({ title: 'Eliminar lecturas', message: `¿Eliminar todas las lecturas registradas para el SKU ${sku} (${desc})?`, confirmLabel: 'Eliminar' })) {
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

  // Reconciled items for the active session (computed lazily only in RECONCILIATION view to optimize scan performance)
  const reconciliation = useMemo(() => {
    if (!currentSession || viewState !== 'RECONCILIATION') return [];
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
  const pendingItems = useMemo(() => getPendingItems(currentSession, reconciliation, pendingSearch), [currentSession, reconciliation, pendingSearch]);

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
        {/* HEADER                                                  */}
        {/* ======================================================== */}
        <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="p-2 sm:p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20 shrink-0">
                <Barcode className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base md:text-lg font-bold tracking-tight truncate">
                    Conteo de Existencias
                  </h2>
                  {currentSession && viewState !== 'CAMPAIGN' && (
                    <span className={`text-[10px] sm:text-[11px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                      currentSession.modo === 'BLIND' 
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                    }`}>
                      {currentSession.modo === 'BLIND' ? 'A Ciegas' : 'Contra Doc.'}
                    </span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                  {viewState === 'CAMPAIGN' && 'Consolidación global, snapshots de ERP y cuadratura de farmacia.'}
                  {viewState === 'LIST' && 'Administra sesiones de conteo por mueble o pasillo.'}
                  {viewState === 'COUNTING' && `${currentSession?.nombre || 'Sesión activa'} • ${currentSession?.conteos.length || 0} lecturas`}
                  {viewState === 'RECONCILIATION' && `Cuadratura: ${currentSession?.nombre || ''}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Cloud Sync Button */}
              <button
                type="button"
                onClick={() => handleCloudSync(false)}
                disabled={isSyncingCloud}
                className="px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                title="Sincronizar campañas y stock teórico desde el PC de oficina (Google Sheets)"
              >
                {isSyncingCloud ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                ) : (
                  <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                )}
                <span className="hidden sm:inline">
                  {isSyncingCloud ? 'Sincronizando...' : 'Oficina / Nube'}
                </span>
                {lastCloudSyncDate && (
                  <span className="text-[10px] text-blue-500/80 dark:text-blue-400/80 font-mono hidden md:inline">
                    ({lastCloudSyncDate})
                  </span>
                )}
              </button>

              <button
                onClick={() => onClose ? onClose() : navigate('/')}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Cerrar módulo de conteo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sub-bar Navigation Pills (Horizontally Scrollable on Mobile) */}
          <div className="px-3 sm:px-6 py-1.5 bg-slate-100/70 dark:bg-slate-900/60 border-t border-slate-200/70 dark:border-slate-800/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {/* Tab: Campaña Farmacia / Foto ERP (oculto durante pistoleo a ciegas) */}
            {!(isBlind && viewState === 'COUNTING') && (
            <button
              onClick={() => {
                setForceDesktopCampaignView(false);
                setViewState('CAMPAIGN');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                viewState === 'CAMPAIGN'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>{isMobile ? 'Foto ERP' : 'Matriz Campaña'}</span>
            </button>
            )}

            {/* Tab: Sesiones por Mueble */}
            <button
              onClick={() => setViewState('LIST')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                viewState === 'LIST'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Muebles & Pasillos ({sessions.length})</span>
            </button>

            {/* Tab: Active Pistoleo */}
            <button
              onClick={() => handleSwitchToTerminal()}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                viewState === 'COUNTING'
                  ? 'bg-amber-500 text-white shadow-xs font-black'
                  : currentSession
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${currentSession ? 'text-amber-500 fill-amber-500' : ''}`} />
              <span>Pistola Conteo {currentSession ? `(${currentSession.conteos.length})` : ''}</span>
            </button>

            {/* Tab: Cuadratura (if session exists) */}
            {currentSession && (
              <button
                onClick={() => setViewState('RECONCILIATION')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  viewState === 'RECONCILIATION'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Cuadratura</span>
              </button>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* BODY - VIEW 0: CAMPAIGN CONSOLIDATION DASHBOARD          */}
        {/* ======================================================== */}
        {viewState === 'CAMPAIGN' && (
          isMobile && !forceDesktopCampaignView ? (
            <MobileErpSnapshotView
              campaigns={campaigns}
              activeCampaignId={activeCampaignIdState}
              sessions={sessions}
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
                sessions={sessions}
                onUpdateCampaigns={handleUpdateCampaigns}
                onSelectCampaign={handleSelectCampaign}
                onStartTargetedRecount={handleStartTargetedRecount}
                showToast={showToast}
                onUpdateSessions={setSessions}
                onNavigateToSessionList={() => setViewState('LIST')}
                onSwitchToTerminal={handleSwitchToTerminal}
              />
            </Suspense>
          )
        )}

        {/* ======================================================== */}
        {/* BODY - VIEW 1: SESSIONS LIST & NEW SESSION CREATOR       */}
        {/* ======================================================== */}
        {viewState === 'LIST' && (
          <StockCountSessionsListView
            sessions={sessions}
            isSyncingCloud={isSyncingCloud}
            onCreateSession={handleCreateSession}
            onOpenSession={handleOpenSession}
            onDeleteSession={handleDeleteSession}
            onBackupSessionToCloud={handleBackupSessionToCloud}
            onCloudSync={handleCloudSync}
          />
        )}

        {/* ======================================================== */}
        {/* BODY - VIEW 2: ACTIVE COUNTING TERMINAL                  */}
        {/* ======================================================== */}
        {viewState === 'COUNTING' && currentSession && (
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
            
            {/* ======================================================== */}
            {/* MOBILE VIEW (< md): DEDICATED HIGH-PERFORMANCE SCREEN    */}
            {/* ======================================================== */}
            <div className="flex-1 flex flex-col overflow-hidden md:hidden pb-20">
              
              {/* Context Header Bar for Mobile PDA */}
              <div className="px-3.5 py-2.5 bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    {currentSession.nombre}
                  </span>
                </div>

                {/* Real-time Session Counter Pills */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleUndoLastEntry}
                    disabled={currentSession.conteos.length === 0}
                    className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all cursor-pointer"
                    title="Deshacer la última lectura"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <span className="px-2 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 text-[11px] font-black">
                    {groupedSkuEntries.length} SKUs
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[11px] font-black font-mono">
                    {currentSession.conteos.reduce((a, b) => a + b.cantidad, 0)} unids
                  </span>
                </div>
              </div>

              {/* Mobile Mode Switcher Bar */}
              <div className="px-3 py-1.5 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/80 flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileCountingTab('SCAN')}
                  className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    mobileCountingTab === 'SCAN'
                      ? 'bg-amber-500 text-white shadow-xs font-black'
                      : 'bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Pistolear</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileCountingTab('READINGS')}
                  className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    mobileCountingTab === 'READINGS'
                      ? 'bg-blue-600 text-white shadow-xs font-black'
                      : 'bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <ListTodo className="w-3.5 h-3.5" />
                  <span>Lecturas ({currentSession.conteos.length})</span>
                </button>
                {!isBlind && (
                  <button
                    type="button"
                    onClick={() => {
                      setForceDesktopCampaignView(false);
                      setViewState('CAMPAIGN');
                    }}
                    className="py-1.5 px-2.5 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Consultar Foto ERP"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-[11px] font-extrabold">Foto ERP</span>
                  </button>
                )}
              </div>

              {/* MOBILE TAB 1: SCANNER & KEYPAD PAD */}
              {mobileCountingTab === 'SCAN' && (
                <div className="flex-1 p-3.5 overflow-y-auto flex flex-col gap-3.5">
                  
                  {/* Location & Burst Mode Quick Bar */}
                  <div className="flex items-center gap-2">
                    {/* Location Input with Lock */}
                    <div className="flex-1 p-2 bg-slate-50 dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 shadow-xs">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={countLocation}
                        onChange={(e) => setCountLocation(e.target.value)}
                        placeholder="Pasillo / Ubicación..."
                        className="w-full bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const nextLock = !isLocationLocked;
                          setIsLocationLocked(nextLock);
                          playBeep('skip');
                          showToast(nextLock ? 'Ubicación fijada' : 'Ubicación libre', 'info');
                        }}
                        className={`p-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                          isLocationLocked
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                        title={isLocationLocked ? 'Ubicación FIJA' : 'Ubicación LIBRE'}
                      >
                        {isLocationLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Mode Toggle: Ráfaga +1 vs Manual */}
                    <button
                      type="button"
                      onClick={() => {
                        const nextBurst = !isBurstScanMode;
                        setIsBurstScanMode(nextBurst);
                        playBeep('success');
                        showToast(nextBurst ? 'Modo Ráfaga (+1 directo)' : 'Modo Manual', 'info');
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shrink-0 min-h-[42px] border ${
                        isBurstScanMode
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Zap className={`w-3.5 h-3.5 ${isBurstScanMode ? 'fill-current animate-pulse' : ''}`} />
                      <span>{isBurstScanMode ? 'Ráfaga +1' : 'Manual'}</span>
                    </button>
                  </div>

                  {/* Expiry Prompt Modal / Step inside Mobile */}
                  {expiryPromptSku ? (
                    <MobileExpiryPrompt
                      sku={expiryPromptSku}
                      quantity={countQuantity}
                      yearsList={yearsList}
                      tempYyyy={tempYyyy}
                      tempMm={tempMm}
                      onSelectYear={(y) => {
                        setTempYyyy(y);
                        if (tempMm) commitCountEntry(expiryPromptSku, tempMm, y, false);
                      }}
                      onSelectMonth={(m) => {
                        setTempMm(m);
                        if (tempYyyy) commitCountEntry(expiryPromptSku, m, tempYyyy, false);
                      }}
                      onSkip={() => commitCountEntry(expiryPromptSku, undefined, undefined, true)}
                      onClose={() => {
                        setExpiryPromptSku(null);
                        playBeep('skip');
                      }}
                    />
                  ) : (
                    /* Mobile Scanner & Entry Form */
                    <form onSubmit={handleSkuScannedOrEntered} className="flex flex-col gap-3">
                      
                      {/* SKU / Barcode input & Camera Trigger */}
                      <div className="relative">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Barcode className="w-4 h-4 text-blue-600" />
                            <span>Código SKU o Barra (Láser / Teclado)</span>
                          </label>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              ref={skuInputRef}
                              type="text"
                              value={scannedSku}
                              onChange={(e) => handleSkuChange(e.target.value)}
                              placeholder="Pistolea o escribe código..."
                              className="w-full pl-3.5 pr-9 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-lg font-mono font-black text-slate-800 dark:text-slate-100 focus:border-blue-600 outline-none shadow-sm min-h-[50px]"
                              autoComplete="off"
                            />
                            {scannedSku && (
                              <button
                                type="button"
                                onClick={() => handleSkuChange('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                aria-label="Limpiar SKU"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Camera Scanner Trigger Button */}
                          <button
                            type="button"
                            onClick={() => setIsCameraScannerOpen(true)}
                            className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-md shadow-blue-500/25 active:scale-95 transition-all flex items-center gap-1.5 font-black text-xs shrink-0 cursor-pointer min-h-[50px]"
                            title="Abrir cámara móvil"
                          >
                            <Camera className="w-5 h-5" />
                            <span>Cámara</span>
                          </button>
                        </div>

                        {/* Matched product title if found in catalog */}
                        {selectedProductDesc && (
                          <div className="mt-1.5 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 flex flex-col gap-1.5 text-xs text-emerald-800 dark:text-emerald-300 font-bold shadow-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 truncate flex-1">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span className="truncate">{selectedProductDesc}</span>
                              </div>
                              {!isBlind && <CampaignSkuErpBadge stats={campaignSkuStats} />}
                            </div>

                            {/* Campaign Status Pill Bar */}
                            {!isBlind && campaignSkuStats && (
                              <div className="pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-between text-[11px]">
                                <span className="text-slate-600 dark:text-slate-300 font-medium">
                                  Total Farmacia: <strong className="font-mono text-slate-800 dark:text-slate-100">{campaignSkuStats.totalFisicoCampana}</strong> un
                                </span>
                                {campaignSkuStats.isValidatedInCampaign ? (
                                  <span className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black">
                                    ✓ Validado en Campaña
                                  </span>
                                ) : campaignSkuStats.diferencia !== null ? (
                                  <span className={`px-2 py-0.5 rounded-lg font-black text-[10px] ${
                                    campaignSkuStats.diferencia === 0
                                      ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200'
                                      : campaignSkuStats.diferencia > 0
                                      ? 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200'
                                      : 'bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200'
                                  }`}>
                                    {campaignSkuStats.diferencia === 0 ? '🟢 Cuadrado' : `${campaignSkuStats.diferencia > 0 ? '🟡 Sobran +' : '🔴 Faltan '}${campaignSkuStats.diferencia}`}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Autocomplete dropdown from master catalog */}
                        {isSearchDropdownOpen && catalogSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-30 max-h-52 overflow-y-auto p-1.5">
                            {catalogSearchResults.map(prod => (
                              <button
                                key={prod.sku}
                                type="button"
                                onClick={() => handleSelectProductFromCatalog(prod)}
                                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-between text-xs transition-colors"
                              >
                                <div className="truncate pr-2">
                                  <span className="font-bold text-blue-600 dark:text-blue-400 font-mono mr-2">{prod.sku}</span>
                                  <span className="text-slate-700 dark:text-slate-200 font-medium">{prod.name}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Industrial Quantity Control & Multipliers */}
                      <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        {/* Header: Mode selector & Current Qty */}
                        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-900/80 p-0.5 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setMobileEntryMode('NUMPAD')}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                                mobileEntryMode === 'NUMPAD'
                                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                              }`}
                            >
                              ⌨️ Teclado PDA
                            </button>
                            <button
                              type="button"
                              onClick={() => setMobileEntryMode('CHIPS')}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                                mobileEntryMode === 'CHIPS'
                                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                              }`}
                            >
                              ⚡ Rápido
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Total:</span>
                            <span className="text-sm font-mono font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                              {countQuantity} un
                            </span>
                          </div>
                        </div>

                        {/* Large Touch Stepper & Value Display */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setCountQuantity(Math.max(1, countQuantity - 1));
                              playBeep('skip');
                            }}
                            className="w-13 h-12 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-xl font-black text-xl text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 shadow-xs flex items-center justify-center cursor-pointer active:scale-90 transition-all shrink-0"
                            title="Descontar 1 unidad"
                          >
                            <Minus className="w-5 h-5" />
                          </button>

                          <div className="flex-1 py-1 px-3 text-center rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-inner flex items-center justify-center min-h-[48px]">
                            <span className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400 tracking-tight">
                              {countQuantity}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setCountQuantity(countQuantity + 1);
                              playBeep('skip');
                            }}
                            className="w-13 h-12 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-xl font-black text-xl text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 shadow-xs flex items-center justify-center cursor-pointer active:scale-90 transition-all shrink-0"
                            title="Sumar 1 unidad"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Packaging Multipliers / Presets Selector */}
                        <div className="mb-2.5">
                          <div className="flex items-center justify-between mb-1.5 px-0.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                              {packMultiplierCategory === 'UNITS' ? 'Incremento por Unidades (+)' : 'Multiplicador por Empaque (×)'}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] font-extrabold">
                              <button
                                type="button"
                                onClick={() => setPackMultiplierCategory('UNITS')}
                                className={`px-1.5 py-0.5 rounded ${packMultiplierCategory === 'UNITS' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                + Unids
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => setPackMultiplierCategory('PACKS')}
                                className={`px-1.5 py-0.5 rounded ${packMultiplierCategory === 'PACKS' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                × Cajas
                              </button>
                            </div>
                          </div>

                          {packMultiplierCategory === 'UNITS' ? (
                            <div className="grid grid-cols-5 gap-1">
                              {[1, 5, 10, 25, 50].map(inc => (
                                <button
                                  key={inc}
                                  type="button"
                                  onClick={() => {
                                    setCountQuantity(inc);
                                    playBeep('skip');
                                  }}
                                  className={`py-2 text-xs font-black rounded-xl transition-all border cursor-pointer ${
                                    countQuantity === inc
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  +{inc}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="grid grid-cols-4 gap-1">
                              {[
                                { factor: 6, label: '×6' },
                                { factor: 10, label: '×10 Blíster' },
                                { factor: 14, label: '×14' },
                                { factor: 20, label: '×20 Caja' },
                                { factor: 28, label: '×28 Mes' },
                                { factor: 30, label: '×30 Estándar' },
                                { factor: 50, label: '×50 Pack' },
                                { factor: 100, label: '×100 Hosp' }
                              ].map(pack => (
                                <button
                                  key={pack.factor}
                                  type="button"
                                  onClick={() => handleApplyPackagingMultiplier(pack.factor)}
                                  className="py-1.5 px-1 text-[11px] font-black rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer active:scale-95 text-center truncate"
                                  title={`Multiplicar por ${pack.factor}`}
                                >
                                  {pack.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* On-Screen Industrial Numeric Keypad (PDA Touch-Optimized) */}
                        {mobileEntryMode === 'NUMPAD' && (
                          <CountNumpad
                            onDigit={handleNumpadDigit}
                            onClear={handleNumpadClear}
                            onBackspace={handleNumpadBackspace}
                            onMultiply={handleApplyPackagingMultiplier}
                            onIncrement={() => {
                              setCountQuantity(prev => prev + 1);
                              playBeep('skip');
                            }}
                          />
                        )}
                      </div>

                      {/* Primary Submit Button */}
                      <button
                        type="submit"
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-base rounded-2xl shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[52px]"
                      >
                        <Plus className="w-5 h-5" />
                        <span>REGISTRAR (+{countQuantity} un)</span>
                      </button>
                    </form>
                  )}

                  <LastScannedHeroCard
                    entry={lastScannedItem}
                    onIncrement={handleIncrementSkuQuantity}
                    onDecrement={handleDecrementSkuQuantity}
                  />

                </div>
              )}

              {/* MOBILE TAB 2: FULL READINGS LIST */}
              {/* MOBILE TAB 2: FULL READINGS LIST */}
              {mobileCountingTab === 'READINGS' && (
                <MobileReadingsList
                  currentSession={currentSession}
                  readingsSearch={readingsSearch}
                  onReadingsSearchChange={setReadingsSearch}
                  readingsViewMode={readingsViewMode}
                  onReadingsViewModeChange={setReadingsViewMode}
                  groupedSkuEntries={groupedSkuEntries}
                  filteredGroupedSkuEntries={filteredGroupedSkuEntries}
                  filteredChronoEntries={filteredChronoEntries}
                  onGoToScan={() => setMobileCountingTab('SCAN')}
                  onDecrementSku={handleDecrementSkuQuantity}
                  onIncrementSku={handleIncrementSkuQuantity}
                  onRemoveSkuAllEntries={handleRemoveSkuAllEntries}
                  onRemoveEntry={handleRemoveEntry}
                />
              )}

            </div>

            {/* ======================================================== */}
            {/* DESKTOP VIEW (>= md): SIDE-BY-SIDE POWER TERMINAL        */}
            {/* ======================================================== */}
            <div className="hidden md:flex flex-1 overflow-hidden flex-row">
              
              {/* Left: Input & Keypad Terminal */}
              <div className="flex-1 p-6 overflow-y-auto border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  {/* Session Context & Location Bar */}
                  <div className="flex flex-row gap-2 mb-4">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between flex-1">
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="text-xs font-bold text-slate-500 shrink-0">Sesión:</span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{currentSession.nombre}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleUndoLastEntry}
                          disabled={currentSession.conteos.length === 0}
                          className="px-3 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                          title="Deshacer la última lectura registrada"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>Deshacer</span>
                        </button>
                        <button
                          onClick={() => setViewState('RECONCILIATION')}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Cuadratura</span>
                        </button>
                      </div>
                    </div>

                    {/* Active Location / Pasillo with Lock Toggle & Burst Mode */}
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={countLocation}
                        onChange={(e) => setCountLocation(e.target.value)}
                        placeholder="Ubicación..."
                        className="w-36 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const nextLock = !isLocationLocked;
                          setIsLocationLocked(nextLock);
                          playBeep('skip');
                          showToast(nextLock ? 'Ubicación fijada' : 'Ubicación libre', 'info');
                        }}
                        className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          isLocationLocked
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                        }`}
                        title={isLocationLocked ? 'Ubicación FIJA' : 'Ubicación LIBRE'}
                      >
                        {isLocationLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>

                      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

                      <button
                        type="button"
                        onClick={() => {
                          const nextBurst = !isBurstScanMode;
                          setIsBurstScanMode(nextBurst);
                          playBeep('success');
                          showToast(nextBurst ? 'Modo Ráfaga activado (+1)' : 'Modo Manual activado', 'info');
                        }}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          isBurstScanMode
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                        }`}
                        title={isBurstScanMode ? 'Modo Ráfaga: escaneo continuo con +1 automático' : 'Modo Manual: ajuste de cantidad'}
                      >
                        <Zap className={`w-3.5 h-3.5 ${isBurstScanMode ? 'fill-current' : ''}`} />
                        <span className="text-[11px] font-bold">{isBurstScanMode ? 'Ráfaga' : 'Manual'}</span>
                      </button>
                    </div>
                  </div>

                  {expiryPromptSku ? (
                    <div className="bg-blue-50/80 dark:bg-slate-800 p-6 rounded-2xl border-2 border-blue-400 dark:border-blue-900 shadow-lg animate-in zoom-in-95 duration-150">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400 block">
                            Asistente de Vencimiento
                          </span>
                          <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                            ¿Cuándo vence {selectedProductDesc || 'este producto'}?
                          </h3>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">
                            SKU: {expiryPromptSku} • Cantidad: {countQuantity} {countLocation ? `• Ubic: ${countLocation}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setExpiryPromptSku(null);
                            playBeep('skip');
                          }}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                          aria-label="Omitir vencimiento"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Expiry Selector (Mes / Año) */}
                      <div className="flex flex-col gap-4 mb-4">
                        {/* Year Selector */}
                        <div>
                          <span className="text-xs font-bold text-slate-500 mb-1.5 block">1. Selecciona Año</span>
                          <div className="flex flex-wrap gap-1.5">
                            {yearsList.map(y => {
                              const isSelected = tempYyyy === y;
                              return (
                                <button
                                  key={y}
                                  type="button"
                                  onClick={() => {
                                    setTempYyyy(y);
                                    if (tempMm) {
                                      commitCountEntry(expiryPromptSku, tempMm, y, false);
                                    } else {
                                      showToast('Ahora selecciona el mes', 'info');
                                    }
                                  }}
                                  className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all border cursor-pointer ${
                                    isSelected
                                      ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-[1.03]'
                                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {y}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Month Selector */}
                        <div>
                          <span className="text-xs font-bold text-slate-500 mb-1.5 block">2. Selecciona Mes</span>
                          <div className="grid grid-cols-6 gap-1.5">
                            {MONTHS_LIST.map(m => {
                              const isSelected = tempMm === m.val;
                              return (
                                <button
                                  key={m.val}
                                  type="button"
                                  onClick={() => {
                                    setTempMm(m.val);
                                    if (tempYyyy) {
                                      commitCountEntry(expiryPromptSku, m.val, tempYyyy, false);
                                    } else {
                                      showToast('Ahora selecciona el año', 'info');
                                    }
                                  }}
                                  className={`py-2 px-1 rounded-xl text-xs font-extrabold transition-all text-center border cursor-pointer ${
                                    isSelected
                                      ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-[1.02]'
                                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {m.label.split(' - ')[0]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2.5 border-t border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => commitCountEntry(expiryPromptSku, undefined, undefined, true)}
                          className="flex-1 py-2.5 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>Omitir Fecha (Sin Vencimiento)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSkuScannedOrEntered} className="flex flex-col gap-4">
                      
                      {/* SKU / Barcode input */}
                      <div className="relative">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                            <Barcode className="w-4 h-4 text-blue-600" />
                            <span>Escanear Código / SKU</span>
                          </label>
                          {selectedProductDesc && (
                            <div className="flex items-center gap-2 truncate max-w-[420px]">
                              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 truncate">
                                ✓ {selectedProductDesc}
                              </span>
                              {!isBlind && <CampaignSkuErpBadge stats={campaignSkuStats} compact />}
                              {!isBlind && campaignSkuStats && campaignSkuStats.diferencia !== null && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${
                                  campaignSkuStats.diferencia === 0
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : campaignSkuStats.diferencia > 0
                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                    : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                }`}>
                                  {campaignSkuStats.diferencia === 0 ? 'Cuadrado' : `${campaignSkuStats.diferencia > 0 ? '+' : ''}${campaignSkuStats.diferencia}`}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              ref={skuInputRef}
                              type="text"
                              value={scannedSku}
                              onChange={(e) => handleSkuChange(e.target.value)}
                              placeholder="Escanear o buscar SKU..."
                              className="w-full pl-3.5 pr-9 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-base font-bold text-slate-800 dark:text-slate-100 focus:border-blue-600 outline-none transition-all shadow-inner"
                              autoComplete="off"
                            />
                            {scannedSku && (
                              <button
                                type="button"
                                onClick={() => handleSkuChange('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                aria-label="Limpiar SKU"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Mobile Camera Scan Launcher Button */}
                          <button
                            type="button"
                            onClick={() => setIsCameraScannerOpen(true)}
                            className="px-3.5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-md shadow-blue-500/25 active:scale-95 transition-all flex items-center gap-1.5 font-bold text-xs shrink-0 cursor-pointer min-h-[44px]"
                            title="Abrir lector con cámara de celular o PDA"
                          >
                            <Camera className="w-4 h-4" />
                            <span>Cámara / PDA</span>
                          </button>
                        </div>

                        {/* Autocomplete dropdown from master catalog */}
                        {isSearchDropdownOpen && catalogSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto p-1.5">
                            <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                              Catálogo Maestro de Productos
                            </div>
                            {catalogSearchResults.map(prod => (
                              <button
                                key={prod.sku}
                                type="button"
                                onClick={() => handleSelectProductFromCatalog(prod)}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-between text-xs transition-colors cursor-pointer"
                              >
                                <div className="truncate pr-2">
                                  <span className="font-bold text-blue-600 dark:text-blue-400 font-mono mr-2">{prod.sku}</span>
                                  <span className="text-slate-700 dark:text-slate-200 font-medium">{prod.name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0 font-medium">{prod.provider || prod.category}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Expiry Status Indicator for Fast Scanners */}
                      {currentSession.requiereVencimiento && (
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 leading-tight flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                          <span>
                            Solicita vencimiento en la 1ra lectura por SKU y lo reutiliza de forma automática en los siguientes escaneos.
                          </span>
                        </div>
                      )}

                      {/* Quantity Stepper & Direct Input */}
                      <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5 text-blue-600" />
                            <span>Cantidad Contada</span>
                          </span>
                        </label>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCountQuantity(Math.max(1, countQuantity - 1))}
                            className="p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-200 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                            aria-label="Disminuir cantidad"
                          >
                            <Minus className="w-5 h-5" />
                          </button>

                          <input
                            type="number"
                            min="1"
                            value={countQuantity}
                            onChange={(e) => setCountQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            className="flex-1 py-3 text-center rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xl font-extrabold text-blue-600 dark:text-blue-400 focus:border-blue-600 outline-none"
                          />

                          <button
                            type="button"
                            onClick={() => setCountQuantity(countQuantity + 1)}
                            className="p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-200 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                            aria-label="Aumentar cantidad"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Quick increment buttons & Packaging multipliers */}
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between mb-1.5 px-0.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                              {packMultiplierCategory === 'UNITS' ? 'Incremento por Unidades (+)' : 'Multiplicador por Empaque (×)'}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] font-extrabold">
                              <button
                                type="button"
                                onClick={() => setPackMultiplierCategory('UNITS')}
                                className={`px-1.5 py-0.5 rounded ${packMultiplierCategory === 'UNITS' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                + Unids
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => setPackMultiplierCategory('PACKS')}
                                className={`px-1.5 py-0.5 rounded ${packMultiplierCategory === 'PACKS' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-slate-400 hover:text-slate-600'}`}
                              >
                                × Cajas
                              </button>
                            </div>
                          </div>

                          {packMultiplierCategory === 'UNITS' ? (
                            <div className="grid grid-cols-5 gap-1.5">
                              {[1, 5, 10, 25, 50].map(inc => (
                                <button
                                  key={inc}
                                  type="button"
                                  onClick={() => {
                                    setCountQuantity(inc);
                                    playBeep('skip');
                                  }}
                                  className={`py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer min-h-[38px] ${
                                    countQuantity === inc
                                      ? 'bg-blue-600 text-white shadow-xs'
                                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  +{inc}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                { factor: 6, label: '×6' },
                                { factor: 10, label: '×10 Blíster' },
                                { factor: 14, label: '×14' },
                                { factor: 20, label: '×20 Caja' },
                                { factor: 28, label: '×28 Mes' },
                                { factor: 30, label: '×30 Estándar' },
                                { factor: 50, label: '×50 Pack' },
                                { factor: 100, label: '×100 Hosp' }
                              ].map(pack => (
                                <button
                                  key={pack.factor}
                                  type="button"
                                  onClick={() => handleApplyPackagingMultiplier(pack.factor)}
                                  className="py-1.5 px-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold rounded-lg transition-all cursor-pointer truncate text-center min-h-[38px]"
                                  title={`Multiplicar por ${pack.factor}`}
                                >
                                  {pack.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer mt-0.5 min-h-[48px]"
                      >
                        <Plus className="w-5 h-5" />
                        <span>Registrar Lectura</span>
                      </button>
                    </form>
                  )}
                </div>

                {/* Bottom Quick KPI (Desktop view) */}
                <div className="flex mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 items-center justify-between text-xs">
                  <span className="text-slate-500">Total en sesión:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {currentSession.conteos.length} lecturas • {formatLocaleNumber(currentSession.conteos.reduce((a, b) => a + b.cantidad, 0))} unidades
                  </span>
                </div>
              </div>

              {/* Right: Readings History & Pending Checklist Tabs */}
              <div className="w-80 lg:w-96 bg-slate-50 dark:bg-slate-800/40 p-4 flex flex-col border-l border-slate-200 dark:border-slate-800">
                {/* Tab Selector Header */}
                <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-900 rounded-xl mb-2.5">
                  <button
                    type="button"
                    onClick={() => setRightTab('READINGS')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      rightTab === 'READINGS'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Lecturas ({currentSession.conteos.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRightTab('PENDING')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      rightTab === 'PENDING'
                        ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-800'
                    }`}
                  >
                    <ListTodo className="w-3.5 h-3.5" />
                    <span>Pendientes ({pendingItems.length})</span>
                  </button>
                </div>

                {rightTab === 'READINGS' ? (
                  /* READINGS LIST */
                  currentSession.conteos.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <Barcode className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-xs font-semibold">Esperando primera lectura...</p>
                      <p className="text-[11px] mt-1 text-slate-400">Escanea o ingresa un SKU para comenzar.</p>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* View Switcher: Agrupado por SKU vs Cronológico */}
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                          {readingsViewMode === 'GROUPED' ? `${groupedSkuEntries.length} SKUs Únicos` : `${currentSession.conteos.length} Lecturas`}
                        </span>

                        <div className="flex items-center bg-slate-200/80 dark:bg-slate-900 rounded-lg p-0.5 text-[11px] font-bold">
                          <button
                            type="button"
                            onClick={() => setReadingsViewMode('GROUPED')}
                            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                              readingsViewMode === 'GROUPED'
                                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Agrupado
                          </button>
                          <button
                            type="button"
                            onClick={() => setReadingsViewMode('CHRONO')}
                            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                              readingsViewMode === 'CHRONO'
                                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Historial
                          </button>
                        </div>
                      </div>

                      {/* Grouped View (Consolidated by SKU) */}
                      {readingsViewMode === 'GROUPED' ? (
                        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                          {groupedSkuEntries.map(group => (
                            <div
                              key={group.sku}
                              className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between text-xs"
                            >
                              <div className="truncate pr-2 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{group.sku}</span>
                                  {group.mm && group.yyyy && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                                      {group.mm}/{group.yyyy}
                                    </span>
                                  )}
                                  {group.ubicaciones.length > 0 && (
                                    <span className="text-[9px] font-semibold text-slate-400 flex items-center gap-0.5">
                                      <MapPin className="w-2.5 h-2.5" /> {group.ubicaciones.join(', ')}
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-700 dark:text-slate-200 truncate font-medium mt-0.5 text-xs">
                                  {group.descripcion}
                                </p>
                                <span className="text-[10px] text-slate-400">
                                  {group.readingsCount} {group.readingsCount === 1 ? 'escaneo' : 'escaneos'}
                                </span>
                              </div>

                              {/* Quick Steppers & Actions */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleDecrementSkuQuantity(group.sku)}
                                  className="w-7 h-7 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-extrabold text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer active:scale-95 transition-all text-xs"
                                  title="Reducir 1 unidad"
                                >
                                  -
                                </button>

                                <span className="font-extrabold text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-1 rounded-lg min-w-[36px] text-center">
                                  {group.totalCantidad}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleIncrementSkuQuantity(group.sku)}
                                  className="w-7 h-7 bg-blue-100 dark:bg-blue-900/60 hover:bg-blue-200 dark:hover:bg-blue-800/60 rounded-lg font-extrabold text-blue-700 dark:text-blue-300 flex items-center justify-center cursor-pointer active:scale-95 transition-all text-xs"
                                  title="Sumar 1 unidad (+1)"
                                >
                                  +
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveSkuAllEntries(group.sku, group.descripcion)}
                                  className="text-slate-400 hover:text-red-600 p-1 transition-colors ml-0.5 cursor-pointer"
                                  title="Eliminar todas las lecturas de este SKU"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* Chronological View (Individual Scans) */
                        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                          {currentSession.conteos.map(entry => (
                            <div
                              key={entry.id}
                              className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between text-xs"
                            >
                              <div className="truncate pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{entry.sku}</span>
                                  {entry.mm && entry.yyyy && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                                      {entry.mm}/{entry.yyyy}
                                    </span>
                                  )}
                                  {entry.ubicacion && (
                                    <span className="text-[9px] font-semibold text-slate-400 flex items-center gap-0.5">
                                      <MapPin className="w-2.5 h-2.5" /> {entry.ubicacion}
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-600 dark:text-slate-300 truncate font-medium mt-0.5">
                                  {entry.descripcion}
                                </p>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(entry.timestamp).toLocaleTimeString('es-CL')}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                  +{entry.cantidad}
                                </span>
                                <button
                                  onClick={() => handleRemoveEntry(entry.id)}
                                  className="text-slate-400 hover:text-red-600 p-1 transition-colors cursor-pointer"
                                  title="Eliminar lectura"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  /* PENDING ITEMS CHECKLIST */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="relative mb-2 shrink-0">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={pendingSearch}
                        onChange={(e) => setPendingSearch(e.target.value)}
                        placeholder="Buscar SKU o nombre..."
                        className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold outline-none focus:border-blue-500 text-slate-800 dark:text-slate-100"
                      />
                    </div>

                    {pendingItems.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                        <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-500 opacity-60" />
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">¡Sin pendientes!</p>
                        <p className="text-[11px] mt-1 text-slate-400">Todos los productos teóricos han sido contados.</p>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                        {pendingItems.map(item => (
                          <div
                            key={item.sku}
                            className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-amber-200/60 dark:border-amber-900/40 shadow-sm flex items-center justify-between text-xs"
                          >
                            <div className="truncate pr-2">
                              <span className="font-mono font-bold text-amber-700 dark:text-amber-400 block">{item.sku}</span>
                              <p className="text-slate-600 dark:text-slate-300 truncate font-medium mt-0.5">
                                {item.descripcion}
                              </p>
                              <span className="text-[10px] font-bold text-slate-400">
                                Teórico: {formatLocaleNumber(item.teorico)} unids
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                handleSkuChange(item.sku);
                                setSelectedProductDesc(item.descripcion);
                                skuInputRef.current?.focus();
                                showToast(`SKU cargado: ${item.sku}`, 'info');
                              }}
                              className="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-800 dark:text-amber-300 font-bold rounded-lg border border-amber-200 dark:border-amber-800 transition-all text-[11px] shrink-0 cursor-pointer"
                            >
                              Cargar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Fixed Mobile Bottom Action & Navigation Bar (3 dedicated touch tabs) */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-around shadow-2xl safe-bottom">
              
              {/* Tab 1: Pistolear */}
              <button
                type="button"
                onClick={() => {
                  setViewState('COUNTING');
                  setMobileCountingTab('SCAN');
                }}
                className={`flex-1 py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  viewState === 'COUNTING' && mobileCountingTab === 'SCAN'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 scale-[1.02]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Barcode className="w-5 h-5" />
                <span className="text-[11px] font-black tracking-tight">Pistolear</span>
              </button>

              {/* Tab 2: Lecturas */}
              <button
                type="button"
                onClick={() => {
                  setViewState('COUNTING');
                  setMobileCountingTab('READINGS');
                }}
                className={`flex-1 py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  viewState === 'COUNTING' && mobileCountingTab === 'READINGS'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 scale-[1.02]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <div className="relative">
                  <Layers className="w-5 h-5" />
                  {groupedSkuEntries.length > 0 && (
                    <span className="absolute -top-1 -right-2 bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full">
                      {groupedSkuEntries.length}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-black tracking-tight">
                  Lecturas ({currentSession.conteos.reduce((a, b) => a + b.cantidad, 0)})
                </span>
              </button>

              {/* Tab 3: Cuadratura */}
              <button
                type="button"
                onClick={() => setViewState('RECONCILIATION')}
                className="flex-1 py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-[11px] font-black tracking-tight">Cuadratura</span>
              </button>

            </div>

          </div>
        )}

        {/* ======================================================== */}
        {/* BODY - VIEW 3: RECONCILIATION & SHEET SYNCHRONIZATION    */}
        {/* ======================================================== */}
        {viewState === 'RECONCILIATION' && currentSession && (
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
              <span className="text-[10px]">Muebles ({sessions.length})</span>
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
      </div>
  );
};
