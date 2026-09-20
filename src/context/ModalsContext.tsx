import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { InventoryItem, TableSlice } from '../types';

/**
 * Estado de apertura de los modales y paneles de UI del dashboard.
 *
 * Antes vivían como ~19 `useState` dentro de `InventoryDashboard` y se
 * publicaban en el value del contexto. Medido en navegador real: abrir un modal
 * de UI pura ("Configuración global") costaba 2 renders del cuerpo del dashboard
 * (2.270 líneas) y 2 de `InventoryTable`, más una long task de ~54 ms. El
 * disparador es que el value del contexto cambiaba en el dashboard, que arrastra
 * por cascada la tabla, aunque el modal no muestre datos.
 *
 * El estado se separa de las acciones a propósito:
 *
 * - `ModalsStateContext` cambia al abrir/cerrar. Solo lo leen los componentes que
 *   realmente pintan según el flag (`DashboardModalsManager`, `DashboardMobileDrawer`).
 * - `ModalsActionsContext` es un bundle de setters de `useState` (identidad
 *   estable por contrato de React). Los componentes que solo *abren* modales
 *   (el dashboard, el top nav, la barra flotante…) lo consumen sin suscribirse
 *   al estado, así que abrir un modal ya no los re-renderiza.
 */
interface ModalsState {
  isPmReportOpen: boolean;
  isScriptModalOpen: boolean;
  isConfigOpen: boolean;
  isScannerOpen: boolean;
  isMobilePistoleoOpen: boolean;
  isBulkEditOpen: boolean;
  isGmailModalOpen: boolean;
  gmailModalItems: any[];
  isWhatsAppModalOpen: boolean;
  whatsAppModalItems: any[];
  isColumnManagerOpen: boolean;
  isQuickTraspasoOpen: boolean;
  quickTraspasoItem: InventoryItem | null;
  isTicketConfigOpen: boolean;
  isBulkImportOpen: boolean;
  isBulkActionsConfigOpen: boolean;
  isStockCountOpen: boolean;
  isSyncAuditOpen: boolean;
  isMobileMenuOpen: boolean;
  isSliceManagerOpen: boolean;
  isSliceModalOpen: boolean;
  editingSliceModalItem: TableSlice | null;
}

interface ModalsActions {
  setIsPmReportOpen: (open: boolean) => void;
  setIsScriptModalOpen: (open: boolean) => void;
  setIsConfigOpen: (open: boolean) => void;
  setIsScannerOpen: (open: boolean) => void;
  setIsMobilePistoleoOpen: (open: boolean) => void;
  setIsBulkEditOpen: (open: boolean) => void;
  setIsGmailModalOpen: (open: boolean) => void;
  setGmailModalItems: (items: any[]) => void;
  setIsWhatsAppModalOpen: (open: boolean) => void;
  setWhatsAppModalItems: (items: any[]) => void;
  setIsColumnManagerOpen: (open: boolean) => void;
  setIsQuickTraspasoOpen: (open: boolean) => void;
  setQuickTraspasoItem: (item: InventoryItem | null) => void;
  setIsTicketConfigOpen: (open: boolean) => void;
  setIsBulkImportOpen: (open: boolean) => void;
  setIsBulkActionsConfigOpen: (open: boolean) => void;
  setIsStockCountOpen: (open: boolean) => void;
  setIsSyncAuditOpen: (open: boolean) => void;
  setIsMobileMenuOpen: (open: boolean) => void;
  setIsSliceManagerOpen: (open: boolean) => void;
  setIsSliceModalOpen: (open: boolean) => void;
  setEditingSliceModalItem: (slice: TableSlice | null) => void;

  /** Abre el editor de slices con el slice a editar (o null para crear). */
  openSliceEditor: (slice: TableSlice | null) => void;

  /** Abre traspaso con el item ya cargado. Identidad estable: se pasa a cada fila. */
  openQuickTraspaso: (item: InventoryItem) => void;
  openWhatsApp: (item: InventoryItem) => void;
  openEmail: (item: InventoryItem) => void;
}

const ModalsStateContext = createContext<ModalsState | null>(null);
const ModalsActionsContext = createContext<ModalsActions | null>(null);

const NOOP_STATE: ModalsState = {
  isPmReportOpen: false, isScriptModalOpen: false, isConfigOpen: false,
  isScannerOpen: false, isMobilePistoleoOpen: false, isBulkEditOpen: false,
  isGmailModalOpen: false, gmailModalItems: [], isWhatsAppModalOpen: false,
  whatsAppModalItems: [], isColumnManagerOpen: false, isQuickTraspasoOpen: false,
  quickTraspasoItem: null, isTicketConfigOpen: false, isBulkImportOpen: false,
  isBulkActionsConfigOpen: false, isStockCountOpen: false, isSyncAuditOpen: false,
  isMobileMenuOpen: false, isSliceManagerOpen: false, isSliceModalOpen: false,
  editingSliceModalItem: null,
};

export const ModalsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPmReportOpen, setIsPmReportOpen] = useState(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isMobilePistoleoOpen, setIsMobilePistoleoOpen] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isGmailModalOpen, setIsGmailModalOpen] = useState(false);
  const [gmailModalItems, setGmailModalItems] = useState<any[]>([]);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppModalItems, setWhatsAppModalItems] = useState<any[]>([]);
  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false);
  const [isQuickTraspasoOpen, setIsQuickTraspasoOpen] = useState(false);
  const [quickTraspasoItem, setQuickTraspasoItem] = useState<InventoryItem | null>(null);
  const [isTicketConfigOpen, setIsTicketConfigOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isBulkActionsConfigOpen, setIsBulkActionsConfigOpen] = useState(false);
  const [isStockCountOpen, setIsStockCountOpen] = useState(false);
  const [isSyncAuditOpen, setIsSyncAuditOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSliceManagerOpen, setIsSliceManagerOpen] = useState(false);
  const [isSliceModalOpen, setIsSliceModalOpen] = useState(false);
  const [editingSliceModalItem, setEditingSliceModalItem] = useState<TableSlice | null>(null);

  const state = useMemo<ModalsState>(() => ({
    isPmReportOpen, isScriptModalOpen, isConfigOpen, isScannerOpen,
    isMobilePistoleoOpen, isBulkEditOpen, isGmailModalOpen, gmailModalItems,
    isWhatsAppModalOpen, whatsAppModalItems, isColumnManagerOpen,
    isQuickTraspasoOpen, quickTraspasoItem, isTicketConfigOpen, isBulkImportOpen,
    isBulkActionsConfigOpen, isStockCountOpen, isSyncAuditOpen, isMobileMenuOpen,
    isSliceManagerOpen, isSliceModalOpen, editingSliceModalItem,
  }), [
    isPmReportOpen, isScriptModalOpen, isConfigOpen, isScannerOpen,
    isMobilePistoleoOpen, isBulkEditOpen, isGmailModalOpen, gmailModalItems,
    isWhatsAppModalOpen, whatsAppModalItems, isColumnManagerOpen,
    isQuickTraspasoOpen, quickTraspasoItem, isTicketConfigOpen, isBulkImportOpen,
    isBulkActionsConfigOpen, isStockCountOpen, isSyncAuditOpen, isMobileMenuOpen,
    isSliceManagerOpen, isSliceModalOpen, editingSliceModalItem,
  ]);

  const openSliceEditor = useCallback((slice: TableSlice | null) => {
    setEditingSliceModalItem(slice);
    setIsSliceModalOpen(true);
  }, []);

  const openQuickTraspaso = useCallback((item: InventoryItem) => {
    setQuickTraspasoItem(item);
    setIsQuickTraspasoOpen(true);
  }, []);

  const openWhatsApp = useCallback((item: InventoryItem) => {
    setWhatsAppModalItems([item]);
    setIsWhatsAppModalOpen(true);
  }, []);

  const openEmail = useCallback((item: InventoryItem) => {
    setGmailModalItems([item]);
    setIsGmailModalOpen(true);
  }, []);

  // Los setters de useState son estables; listarlos como dependencias mantiene
  // el value inmutable entre renders sin engañar a exhaustive-deps.
  const actions = useMemo<ModalsActions>(() => ({
    setIsPmReportOpen, setIsScriptModalOpen, setIsConfigOpen, setIsScannerOpen,
    setIsMobilePistoleoOpen, setIsBulkEditOpen, setIsGmailModalOpen, setGmailModalItems,
    setIsWhatsAppModalOpen, setWhatsAppModalItems, setIsColumnManagerOpen,
    setIsQuickTraspasoOpen, setQuickTraspasoItem, setIsTicketConfigOpen,
    setIsBulkImportOpen, setIsBulkActionsConfigOpen, setIsStockCountOpen,
    setIsSyncAuditOpen, setIsMobileMenuOpen,
    setIsSliceManagerOpen, setIsSliceModalOpen, setEditingSliceModalItem,
    openSliceEditor, openQuickTraspaso, openWhatsApp, openEmail,
  }), [openSliceEditor, openQuickTraspaso, openWhatsApp, openEmail]);

  return (
    <ModalsActionsContext.Provider value={actions}>
      <ModalsStateContext.Provider value={state}>{children}</ModalsStateContext.Provider>
    </ModalsActionsContext.Provider>
  );
};

/** Estado de los modales. Solo para quien pinta según el flag. */
export function useModalsState(): ModalsState {
  return useContext(ModalsStateContext) ?? NOOP_STATE;
}

/** Setters. Identidad estable: consumirlo no re-renderiza al abrir un modal. */
export function useModalsActions(): ModalsActions {
  const ctx = useContext(ModalsActionsContext);
  return ctx ?? NOOP_ACTIONS;
}

const noop = () => {};
const NOOP_ACTIONS: ModalsActions = {
  setIsPmReportOpen: noop, setIsScriptModalOpen: noop, setIsConfigOpen: noop,
  setIsScannerOpen: noop, setIsMobilePistoleoOpen: noop, setIsBulkEditOpen: noop,
  setIsGmailModalOpen: noop, setGmailModalItems: noop, setIsWhatsAppModalOpen: noop,
  setWhatsAppModalItems: noop, setIsColumnManagerOpen: noop, setIsQuickTraspasoOpen: noop,
  setQuickTraspasoItem: noop, setIsTicketConfigOpen: noop, setIsBulkImportOpen: noop,
  setIsBulkActionsConfigOpen: noop, setIsStockCountOpen: noop, setIsSyncAuditOpen: noop,
  setIsMobileMenuOpen: noop, setIsSliceManagerOpen: noop, setIsSliceModalOpen: noop,
  setEditingSliceModalItem: noop, openSliceEditor: noop,
  openQuickTraspaso: noop, openWhatsApp: noop, openEmail: noop,
};