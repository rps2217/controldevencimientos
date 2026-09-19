export interface SheetProperties {
  sheetId: number;
  title: string;
  hidden?: boolean;
  gridProperties?: {
    rowCount: number;
    columnCount: number;
  };
}

export interface SheetMetadata {
  spreadsheetId?: string;
  title?: string;
  sheets: {
    sheetId?: number;
    title?: string;
    properties: SheetProperties;
  }[];
}

export type SpreadsheetMetadata = SheetMetadata;

export interface UserVirtualColumn {
  id: string;
  label: string;
  operation: 'concatenate' | 'sum' | 'diff_days';
  sourceColumns: string[];
}

export interface TableBulkActionSetting {
  enabled?: string[];
  disabled?: string[];
}

export interface TableGroupingSetting {
  groupByColumn?: string;
  groupByDirection?: 'asc' | 'desc';
}

export interface BackendMirrorConfig {
  enabled: boolean;
  provider: 'custom_rest' | 'supabase' | 'firebase' | 'postgresql';
  endpointUrl: string;
  apiKey?: string;
  syncMode: 'dual_write' | 'mirror_first' | 'backup_only';
  conflictStrategy: 'last_write_wins' | 'server_wins' | 'client_wins';
  lastSyncTimestamp?: string;
  autoSyncIntervalSec?: number;
}

export interface SheetConfig {
  main?: string;
  events?: string;
  products?: string;
  policies?: string;
  schema?: Record<string, Record<string, ColumnSchema>>;
  activeVirtualColumns?: string[];
  userVirtualColumns?: UserVirtualColumn[];
  customAliases?: Record<string, string[]>;
  tableBulkActions?: Record<string, TableBulkActionSetting>;
  tableGroupings?: Record<string, TableGroupingSetting>;
  slices?: TableSlice[];
  hiddenSliceIds?: string[];
  ticketPrintConfig?: GlobalTicketConfig;
  backendMirror?: BackendMirrorConfig;
  enableStickyColumns?: boolean;
  updatedAt?: string;
}

export type ColumnType = 'text' | 'longtext' | 'number' | 'date' | 'datetime' | 'enum' | 'enumlist' | 'ref' | 'calculated' | 'virtual';

export interface VirtualColumn {
  id: string;
  label: string;
  supportedViews?: Array<'main' | 'events' | 'products' | 'policies'>;
  calculate: (item: any, headers: any, allData?: any) => any;
}
export type ColumnBehavior = 'none' | 'auto_id' | 'calc_fecha_vc' | 'calc_retiro' | 'sku_lookup';

export type EventCategory = 
  | 'VENCIMIENTO' 
  | 'VENCIMIENTO_CERCANO' 
  | 'TRANSPORTE' 
  | 'DIFERENCIA' 
  | 'CAL_INTERNA'
  | 'CAL_EXTERNA'
  | 'AVERIA' 
  | 'DEVOLUCION' 
  | 'CANJES';

export interface EventTypeDefinition {
  id: EventCategory;
  rawCode: string;
  name: string;
  shortLabel: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cardBorder: string;
  cardBg: string;
  iconBg: string;
  isVencimiento?: boolean;
}

export interface ColumnSchema {
  visible: boolean;
  searchable: boolean;
  type: ColumnType;
  behavior: ColumnBehavior;
  options?: string; // Comma-separated options for enum and enumlist
  formula?: string;
  isKey?: boolean; // Primary key for table relation
  isLabel?: boolean; // Main display label when referenced
  label?: string; // Custom display label
  required?: boolean; // Whether input is required
  refTable?: string; // Target sheet name when type is 'ref'
  refKeyCol?: string; // Target key column
  refLabelCol?: string; // Target label column
}

export type ResolutionStatus = 'PENDIENTE' | 'REALIZADO';

export interface EventResolutionStatus {
  isResolved: boolean;
  status: ResolutionStatus;
  label: string;
  traspasoNumber: string;
  traspasoColumn?: string;
}

export interface InventoryItem {
  _rowIndex: number; // Row number in the sheet for update/delete operations
  _entityKey?: string; // Stable business primary key or composite identity
  _entityKeyCol?: string; // Column name that holds the primary key
  _isSyntheticKey?: boolean; // Whether the key was auto-generated or derived from business fields
  [key: string]: any; // Dynamic columns based on the sheet's headers
}


export interface TicketColumnConfig {
  show: boolean;
  size: number;
  bold: boolean;
}

export interface TicketGeneralSettings {
  title?: string;
  paperWidth?: '80mm' | '58mm';
  orientation?: 'portrait' | 'landscape'; // 'portrait' (Vertical - Predeterminado) | 'landscape' (Horizontal)
  showDateTime?: boolean;
  showTotalCount?: boolean;
  footerText?: string;
  includeSkuBarcode?: boolean;
  barcodeHeightMm?: number;
  showBarcodeTextInReport?: boolean;
  cutMarginMm?: number; // Margen de corte final (0mm = corte al ras / ahorro máximo, 2mm = recomendado, 5mm = holgado)
}

export interface ViewTicketSettings {
  columns: Record<string, TicketColumnConfig>;
  general?: TicketGeneralSettings;
}

export type ViewTicketConfig = Record<string, TicketColumnConfig> | ViewTicketSettings;
export type GlobalTicketConfig = Record<string, ViewTicketConfig>;

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig {
  column: string | null;
  direction: SortDirection;
}

export type SliceColor = 'blue' | 'rose' | 'amber' | 'emerald' | 'purple' | 'indigo' | 'slate';

export interface DynamicMonthRange {
  startOffset: number; // Offset respecto al mes actual (0 = mes en curso, +1 = próximo mes, +2 = en 2 meses...)
  endOffset: number;   // Offset final inclusive (ej. +4 = hasta 4 meses adelante)
}

export interface SliceFilterConfig {
  searchTerm?: string;
  quickChip?: string | null;
  eventFilter?: string[];
  pmRadarFilter?: string[];
  eventResolutionFilter?: ('pending' | 'completed')[];
  frcBodFilter?: string[];
  columnFilters?: Record<string, string[]>;
  dynamicMonthFilter?: number[];
  dynamicMonthRange?: DynamicMonthRange;
}

export interface TableSlice {
  id: string;
  name: string;
  description?: string;
  tableKey: string; // 'main' | 'events' | 'products' | 'policies' or custom sheet title
  icon?: string; // Lucide icon identifier
  color?: SliceColor;
  isBuiltIn?: boolean;
  filterConfig: SliceFilterConfig;
  sortConfig?: SortConfig;
  groupByColumn?: string;
  groupByDirection?: 'asc' | 'desc';
  visibleColumns?: string[];
}

// ==========================================
// MÓDULO DE CONTEO MASIVO DE EXISTENCIAS
// ==========================================

export type StockCountMode = 'BLIND' | 'DOCUMENT';
export type StockCountStatus = 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED';

export interface StockCountEntry {
  id: string;                      // Identificador local de la lectura
  sku: string;                     // Código escaneado o digitado
  descripcion: string;             // De-referenciada del catálogo maestro o ingresada
  cu_vc?: string;                  // SKU_VC + YYYY + MM (ej: 2000210218569202712)
  mm?: string;                     // "01" a "12"
  yyyy?: string;                   // "2026", "2027", etc.
  fecha_vc?: string;               // "31/12/2027" (último día del mes)
  cantidad: number;                // Stock físico contado
  ubicacion?: string;              // Pasillo / Rack / Bodega (opcional)
  timestamp: string;               // Fecha/hora de la captura (ISO)
  // Campos maestros de-referenciados
  rutProveedor?: string;
  politica?: string;
  diasRetiro?: number | string;
  mundo?: string;
  pm?: string;
}

export interface StockCountSession {
  id: string;
  nombre: string;                  // Nombre identificador (ej: "Conteo Pasillo 3 - Lácteos")
  ubicacion?: string;              // Pasillo / Rack / Bodega (opcional)
  modo: StockCountMode;            // 'BLIND' o 'DOCUMENT'
  requiereVencimiento: boolean;    // Toggle MM/YYYY activable/desactivable a necesidad
  hojaOrigen: string;              // Pestaña de referencia (ej: 'main', 'products')
  estado: StockCountStatus;        // 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED'
  fechaInicio: string;             // ISO
  fechaCierre?: string;            // ISO
  conteos: StockCountEntry[];      // Lecturas físicas registradas
  notas?: string;
  rangoAnos?: { desde: number; hasta: number }; // Rango de años de interés para vencimiento
  snapshotTeorico?: Record<string, number>; // Snapshot congelado del teórico al iniciar/guardar sesión
  ajustesMovimiento?: Record<string, number>; // Ajustes de movimientos (ventas/entradas) durante el conteo
  deviceId?: string;               // Identificador único del dispositivo / terminal auditor
  auditor?: string;                // Nombre o firma del operario
  lastUpdated?: string;            // Timestamp de última mutación (ISO)
  sincronizadoNube?: boolean;      // Indicador si esta versión ya fue respaldada en la nube
  manifestId?: string;             // ID único del manifiesto de entrega
}

export interface CountManifest {
  manifestId: string;
  campaignId?: string;
  campaignName?: string;
  sessionId: string;
  sessionName: string;
  ubicacion?: string;
  deviceId: string;
  auditor?: string;
  totalSkus: number;
  totalUnidades: number;
  fechaInicio: string;
  fechaCierre?: string;
  estado: 'EN_CONTEO' | 'FINALIZADO_ENVIADO';
  resumenSkus?: Array<{ sku: string; descripcion: string; cantidad: number }>;
}

export interface StockCountReconciliationItem {
  itemKey: string;                 // CU_VC (si aplica vencimiento) o SKU
  sku: string;
  descripcion: string;
  cu_vc?: string;
  mm?: string;
  yyyy?: string;
  fecha_vc?: string;
  teorico: number;                 // Cantidad teórica según la hoja (o snapshot congelado)
  contado: number;                 // Cantidad física total contada
  diferencia: number;              // contado - (teorico + ajusteMovimiento)
  estado: 'CUADRADO' | 'FALTANTE' | 'SOBRANTE' | 'NO_CATALOGADO';
  rutProveedor?: string;
  politica?: string;
  diasRetiro?: number | string;
  mundo?: string;
  pm?: string;
  rowIndexOriginal?: number;       // Fila original en la hoja si ya existía
  ajusteMovimiento: number;        // Ajuste por stock en movimiento (ventas - recepciones durante el conteo)
  teoricoOriginal?: number;        // Cantidad teórica en tiempo real de la planilla
}

// ==========================================
// CAMPAÑA DE INVENTARIO CÍCLICO MULTISESIÓN
// ==========================================

export type CampaignStatus = 'ACTIVA' | 'PAUSADA' | 'CERRADA';
export type CampaignItemAuditStatus = 'VALIDADO_OK' | 'DISCREPANCIA' | 'NUNCA_PISTOLEADO' | 'HALLAZGO';

export interface CampaignSnapshotItem {
  sku: string;
  descripcion: string;
  proveedor?: string;
  stockTeorico: number;
  invInicial?: number;
  egreso?: number;
  ingreso?: number;
  venta?: number;
  stockMin?: number;
  stockMax?: number;
  stockCritico?: number;
  local?: string;
  fechaCarga: string;
}

export interface CampaignSnapshotRecord {
  id: string;
  nombreArchivo: string;
  fechaCarga: string;
  totalSkus: number;
  totalStockTeorico: number;
  totalVentasRegistradas?: number;
}

export interface ClosedAuditItem {
  sku: string;
  itemKey: string;
  fechaValidacion: string;
  sesionId?: string;
  ubicacion?: string;
  stockTeoricoValidado: number;
  stockFisicoValidado: number;
  diferenciaValidada: number;
  nota?: string;
}

export interface InventoryCampaign {
  id: string;
  nombre: string;                                   // Ej: "Inventario General Farmacia Local 121 - Septiembre 2026"
  local?: string;                                   // Ej: "LOCAL 121"
  fechaInicio: string;                              // ISO
  fechaActualizacion: string;                       // ISO
  fechaCierre?: string;                             // ISO
  estado: CampaignStatus;                           // 'ACTIVA' | 'PAUSADA' | 'CERRADA'
  snapshotTeoricoActual: Record<string, CampaignSnapshotItem>; // Mapeo SKU -> Item teórico más reciente
  historialSnapshots: CampaignSnapshotRecord[];     // Registro de archivos Excel subidos en distintos días
  sessionIds: string[];                             // IDs de sesiones de conteo vinculadas a esta campaña
  itemsValidadosCerrados: Record<string, ClosedAuditItem>; // SKUs ya validados/cerrados como OK
  ajustesVentaManual: Record<string, number>;       // Ajustes de ventas en caja durante el conteo
  notasCierre?: string;
}

export interface CampaignAuditRow {
  sku: string;
  descripcion: string;
  proveedor: string;
  local?: string;
  stockTeorico: number;
  stockFisicoTotal: number;
  ventaRegistrada: number;
  ajusteManualVenta: number;
  stockTeoricoEfectivo: number;                     // stockTeorico - ajusteManualVenta (o + ajuste)
  diferenciaNeta: number;                           // stockFisicoTotal - stockTeoricoEfectivo
  estadoGlobal: CampaignItemAuditStatus;            // 🟢 VALIDADO_OK | 🟡 DISCREPANCIA | 🔴 NUNCA_PISTOLEADO | 🔵 HALLAZGO
  esCerrado: boolean;
  fechaCierre?: string;
  sesionesDondeAparece: Array<{
    sesionId: string;
    nombreSesion: string;
    ubicacion?: string;
    cantidad: number;
    timestamp: string;
  }>;
}

export interface CampaignConsolidationMatrix {
  campaignId: string;
  nombreCampana: string;
  fechaCalculo: string;
  totalSkusTeoricos: number;
  totalSkusFisicosAuditados: number;
  porcentajeCobertura: number;                      // % de SKUs teóricos que ya tienen al menos 1 lectura física o están validados
  cuadradosCount: number;
  discrepanciasCount: number;
  nuncaPistoleadosCount: number;
  hallazgosCount: number;
  totalFisicoContado: number;
  totalTeoricoEsperado: number;
  diferenciaNetaTotal: number;
  cuadrados: CampaignAuditRow[];                    // 🟢 Pistoleados y coinciden (o marcados como cerrados)
  discrepancias: CampaignAuditRow[];                // 🟡 Pistoleados pero no coinciden
  nuncaPistoleados: CampaignAuditRow[];             // 🔴 En snapshot pero 0 lecturas en todas las sesiones
  hallazgos: CampaignAuditRow[];                    // 🔵 Pistoleados físicamente pero no en snapshot
  resumenPorUbicacion: Array<{
    ubicacion: string;
    sesionesCount: number;
    skusContados: number;
    totalUnidades: number;
  }>;
}
