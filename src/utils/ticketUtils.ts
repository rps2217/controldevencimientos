import { 
  TicketColumnConfig, 
  TicketGeneralSettings, 
  ViewTicketConfig, 
  ViewTicketSettings, 
  GlobalTicketConfig 
} from '../types';
import { findColumnBySemantic } from './columnAliases';

export const LOCAL_STORAGE_TICKET_KEY = 'global_ticket_print_config';

/**
 * Returns default general ticket settings based on the view
 */
export function getDefaultTicketGeneralSettings(activeView: string = 'main'): TicketGeneralSettings {
  let title = 'REPORTE VENCIMIENTOS';
  if (activeView === 'events') {
    title = 'REGISTRO DE INCIDENCIAS';
  } else if (activeView === 'products') {
    title = 'CATÁLOGO DE PRODUCTOS';
  } else if (activeView === 'policies') {
    title = 'POLÍTICAS DE RETIRO';
  } else if (activeView !== 'main') {
    title = `REPORTE - ${activeView.toUpperCase()}`;
  }

  return {
    title,
    paperWidth: '80mm',
    orientation: 'portrait',
    showDateTime: true,
    showTotalCount: true,
    footerText: '--- FIN DEL REPORTE ---',
    includeSkuBarcode: false,
    barcodeHeightMm: 8,
    showBarcodeTextInReport: false,
    cutMarginMm: 2,
  };
}

/**
 * Returns intelligent default column configuration using semantic detection
 */
export function getDefaultColumnConfig(header: string): TicketColumnConfig {
  const isSku = findColumnBySemantic([header], 'sku') !== undefined;
  if (isSku) {
    return { show: true, size: 12, bold: true };
  }

  const isDesc = findColumnBySemantic([header], 'descripcion') !== undefined;
  if (isDesc) {
    return { show: true, size: 11, bold: false };
  }

  const isFechaVc = findColumnBySemantic([header], 'fecha_vc') !== undefined;
  if (isFechaVc) {
    return { show: true, size: 11, bold: true };
  }

  const isCant = findColumnBySemantic([header], 'cantidad') !== undefined;
  if (isCant) {
    return { show: true, size: 10, bold: true };
  }

  const isLote = findColumnBySemantic([header], 'lote') !== undefined;
  if (isLote) {
    return { show: true, size: 10, bold: false };
  }

  const isTipoEvento = findColumnBySemantic([header], 'tipo_evento') !== undefined;
  if (isTipoEvento) {
    return { show: true, size: 11, bold: true };
  }

  const isNTraspaso = findColumnBySemantic([header], 'n_traspaso') !== undefined;
  if (isNTraspaso) {
    return { show: true, size: 10, bold: false };
  }

  const isFrcBod = findColumnBySemantic([header], 'frc_bod') !== undefined;
  if (isFrcBod) {
    return { show: true, size: 10, bold: false };
  }

  // Default for non-primary columns
  return { show: false, size: 10, bold: false };
}

/**
 * Creates full default settings for all headers
 */
export function getDefaultViewTicketSettings(headers: string[], activeView: string = 'main'): ViewTicketSettings {
  const columns: Record<string, TicketColumnConfig> = {};
  headers.forEach(h => {
    columns[h] = getDefaultColumnConfig(h);
  });

  return {
    columns,
    general: getDefaultTicketGeneralSettings(activeView)
  };
}

/**
 * Normalizes any legacy or partial ticket config into a complete ViewTicketSettings object
 */
export function normalizeTicketConfig(
  rawConfig: ViewTicketConfig | undefined,
  headers: string[],
  activeView: string = 'main'
): ViewTicketSettings {
  const defaultGeneral = getDefaultTicketGeneralSettings(activeView);
  
  if (!rawConfig) {
    return getDefaultViewTicketSettings(headers, activeView);
  }

  let rawColumns: Record<string, any> = {};
  let generalSettings: TicketGeneralSettings = { ...defaultGeneral };

  if ('columns' in rawConfig && typeof rawConfig.columns === 'object' && rawConfig.columns !== null) {
    rawColumns = rawConfig.columns;
    if (rawConfig.general) {
      generalSettings = { ...defaultGeneral, ...rawConfig.general };
    }
  } else {
    // Legacy format: rawConfig is directly Record<string, TicketColumnConfig>
    rawColumns = rawConfig as Record<string, any>;
  }

  // Check if at least one column is configured or visible
  const hasAnyConfigured = Object.keys(rawColumns).length > 0;
  const hasAnyVisible = Object.values(rawColumns).some(c => c && c.show === true);

  const columns: Record<string, TicketColumnConfig> = {};

  headers.forEach(header => {
    if (rawColumns[header] && typeof rawColumns[header] === 'object') {
      columns[header] = {
        show: Boolean(rawColumns[header].show),
        size: Number(rawColumns[header].size) || 10,
        bold: Boolean(rawColumns[header].bold)
      };
    } else if (!hasAnyConfigured || !hasAnyVisible) {
      // If config was completely empty, apply smart defaults
      columns[header] = getDefaultColumnConfig(header);
    } else {
      columns[header] = { show: false, size: 10, bold: false };
    }
  });

  return {
    columns,
    general: generalSettings
  };
}

/**
 * Loads ticket configs from localStorage
 */
export function loadTicketConfigFromStorage(): GlobalTicketConfig {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_TICKET_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load global ticket config from storage', e);
  }
  return {};
}

/**
 * Saves ticket configs to localStorage
 */
export function saveTicketConfigToStorage(config: GlobalTicketConfig): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_TICKET_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save global ticket config to storage', e);
  }
}

export interface ThermalPrintOptions {
  elementId?: string;
  paperWidth?: '80mm' | '58mm';
  orientation?: 'portrait' | 'landscape';
  cutMarginMm?: number;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
}

/**
 * Executes a clean thermal print job without leaving excessive blank paper.
 * Measures the exact rendered height of the ticket DOM element, calculates
 * exact millimeters, and injects a dynamic @page CSS rule so the printer
 * cuts immediately after the ticket footer, avoiding wasteful 11-inch/A4 feeds.
 * Also forces portrait/vertical or landscape orientation at the driver level.
 */
export function executeThermalPrint(options: ThermalPrintOptions = {}): void {
  const {
    elementId = 'thermal-ticket-root',
    paperWidth = '80mm',
    orientation = 'portrait',
    cutMarginMm = 2,
    onBeforePrint,
    onAfterPrint
  } = options;

  if (onBeforePrint) onBeforePrint();

  // Give React 100ms to mount/update the ticket DOM if needed
  setTimeout(() => {
    const el = document.getElementById(elementId);
    let calculatedHeightMm = 0;

    if (el) {
      // Temporarily measure if display is none
      const prevDisplay = el.style.display;
      const prevPosition = el.style.position;
      const prevVisibility = el.style.visibility;
      const prevLeft = el.style.left;

      const isHidden = window.getComputedStyle(el).display === 'none';
      if (isHidden) {
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        el.style.top = '0';
        el.style.visibility = 'hidden';
        el.style.display = 'block';
      }

      // Exact pixel height of the full ticket
      const heightPx = Math.max(
        el.scrollHeight || 0,
        el.offsetHeight || 0,
        Math.ceil(el.getBoundingClientRect().height || 0)
      );

      // Restore inline styles immediately
      if (isHidden) {
        el.style.display = prevDisplay;
        el.style.position = prevPosition;
        el.style.visibility = prevVisibility;
        el.style.left = prevLeft;
      }

      // Convert standard CSS pixels (96 DPI) to millimeters: 1px = 25.4 / 96 = ~0.264583 mm
      if (heightPx > 0) {
        calculatedHeightMm = Math.ceil(heightPx * 0.264583) + Math.max(0, cutMarginMm);
      }
    }

    // Inject or update dynamic page style tag in head
    let styleTag = document.getElementById('thermal-print-dynamic-page-style') as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'thermal-print-dynamic-page-style';
      document.head.appendChild(styleTag);
    }

    const effectiveMargin = Math.max(0, cutMarginMm);
    const orientationKeyword = orientation === 'landscape' ? 'landscape' : 'portrait';
    const isLandscape = orientation === 'landscape';

    // When landscape, the width becomes the larger dimension or auto
    const sizeRule = calculatedHeightMm > 10
      ? `size: ${isLandscape ? `${calculatedHeightMm}mm ${paperWidth}` : `${paperWidth} ${calculatedHeightMm}mm`} ${orientationKeyword};`
      : `size: ${paperWidth} auto ${orientationKeyword};`;

    styleTag.textContent = `
      @media print {
        @page {
          ${sizeRule}
          margin: 0mm;
        }
        html, body {
          width: ${paperWidth} !important;
          ${calculatedHeightMm > 10 ? `height: ${calculatedHeightMm}mm !important; max-height: ${calculatedHeightMm}mm !important;` : 'height: auto !important;'}
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        #${elementId} {
          padding-bottom: ${effectiveMargin}mm !important;
          box-sizing: border-box !important;
        }
      }
    `;

    // Trigger browser print dialog
    window.print();

    // Clean up dynamic style element after printing
    const cleanup = () => {
      if (styleTag && styleTag.parentNode) {
        styleTag.parentNode.removeChild(styleTag);
      }
      window.removeEventListener('afterprint', cleanup);
      if (onAfterPrint) onAfterPrint();
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    // Safety fallback cleanup in case afterprint does not fire in some browsers
    setTimeout(cleanup, 4000);
  }, 120);
}
