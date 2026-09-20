import { useEffect, useState } from 'react';
import { InventoryItem, SheetConfig, GlobalTicketConfig, ViewTicketConfig, ViewTicketSettings, TicketGeneralSettings } from '../types';
import { ToastType } from '../components/common/ToastContainer';
import {
  loadTicketConfigFromStorage,
  saveTicketConfigToStorage,
  executeThermalPrint
} from '../utils/ticketUtils';

/**
 * Estado y acciones del ticket térmico (impresión y su configuración por vista).
 *
 * El hook se invoca después de `saveConfig` a propósito: `handleSaveTicketConfig`
 * persiste el cambio en la hoja, y `saveConfig` se declara más abajo en el
 * componente. Recibirla por parámetro evita la TDZ que impedía envolverlo.
 */
export function useTicketPrinting(params: {
  sheetConfig: SheetConfig;
  setSheetConfig: (config: SheetConfig) => void;
  saveConfig: (config: SheetConfig) => void;
  activeView: string;
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => string;
  closeTicketConfig: () => void;
}) {
  const { sheetConfig, setSheetConfig, saveConfig, activeView, showToast, closeTicketConfig } = params;

  const [globalTicketConfig, setGlobalTicketConfig] = useState<GlobalTicketConfig>(() => loadTicketConfigFromStorage());
  const [ticketPrintMode, setTicketPrintMode] = useState<'standard' | 'barcode'>('standard');
  const [itemsToPrintList, setItemsToPrintList] = useState<InventoryItem[] | null>(null);

  // Sincronizar la configuración de ticket cuando la hoja se actualiza desde la nube.
  useEffect(() => {
    if (sheetConfig.ticketPrintConfig) {
      setGlobalTicketConfig(prev => ({
        ...prev,
        ...sheetConfig.ticketPrintConfig
      }));
    }
  }, [sheetConfig.ticketPrintConfig]);

  const handleSaveTicketConfig = (view: string, viewConfig: ViewTicketConfig) => {
    setGlobalTicketConfig(prev => {
      const updated = { ...prev, [view]: viewConfig };
      saveTicketConfigToStorage(updated);

      const updatedSheetConfig: SheetConfig = {
        ...sheetConfig,
        ticketPrintConfig: updated
      };
      setSheetConfig(updatedSheetConfig);
      saveConfig(updatedSheetConfig);

      showToast(`Configuración de ticket para "${view}" guardada exitosamente`, 'success', 'Ticket Térmico');
      return updated;
    });
    closeTicketConfig();
  };

  const handlePrintTicket = (itemsToPrint: InventoryItem[], mode: 'standard' | 'barcode' = 'standard') => {
    if (itemsToPrint.length === 0) {
      alert("No hay registros para imprimir.");
      return;
    }
    setItemsToPrintList(itemsToPrint);
    setTicketPrintMode(mode);

    // Config activa para pasar el ancho de papel, la orientación y el margen de corte exactos.
    const activeConfig = globalTicketConfig[activeView] || sheetConfig.ticketPrintConfig?.[activeView];
    const generalSettings: TicketGeneralSettings =
      (activeConfig as ViewTicketSettings)?.general ?? (activeConfig as TicketGeneralSettings) ?? {};
    const paperWidth = generalSettings.paperWidth || '80mm';
    const orientation = generalSettings.orientation || 'portrait';
    const cutMarginMm = generalSettings.cutMarginMm !== undefined ? Number(generalSettings.cutMarginMm) : 2;

    executeThermalPrint({
      elementId: 'thermal-ticket-root',
      paperWidth,
      orientation,
      cutMarginMm
    });
  };

  return {
    globalTicketConfig,
    ticketPrintMode,
    itemsToPrintList,
    handleSaveTicketConfig,
    handlePrintTicket
  };
}