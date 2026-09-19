export const SAMPLE_HEADERS = [
  "SKU",
  "DESCRIPCION",
  "LOTE",
  "FECHA_VENCIMIENTO",
  "CANTIDAD",
  "PRECIO_COSTO",
  "PROVEEDOR",
  "FRC_EVEN",
  "N_TRASPASO",
  "OBSERVACION"
];

export const SAMPLE_ITEMS = [
  {
    _rowIndex: 2,
    SKU: "SKU-1001",
    DESCRIPCION: "Leche Entera UHT 1L",
    LOTE: "L-8821",
    FECHA_VENCIMIENTO: "2026-09-05",
    CANTIDAD: "320",
    PRECIO_COSTO: "1.25",
    PROVEEDOR: "Lácteos del Sur S.A.",
    FRC_EVEN: "VENC. CERC.",
    N_TRASPASO: "TR-88190",
    OBSERVACION: "Próximo a retiro comercial por política de 15 días"
  },
  {
    _rowIndex: 3,
    SKU: "SKU-1002",
    DESCRIPCION: "Yogurt Batido Fresa 125g",
    LOTE: "L-9012",
    FECHA_VENCIMIENTO: "2026-08-22",
    CANTIDAD: "85",
    PRECIO_COSTO: "0.60",
    PROVEEDOR: "Lácteos del Sur S.A.",
    FRC_EVEN: "VENC. CERC.",
    N_TRASPASO: "",
    OBSERVACION: "Alerta crítica: Retiro inmediato o liquidación PM (Sin traspaso)"
  },
  {
    _rowIndex: 4,
    SKU: "SKU-2045",
    DESCRIPCION: "Atún en Aceite Lata 140g",
    LOTE: "L-3310",
    FECHA_VENCIMIENTO: "2027-03-15",
    CANTIDAD: "1250",
    PRECIO_COSTO: "2.10",
    PROVEEDOR: "Pesquera Mar Azul",
    FRC_EVEN: "DET. PED",
    N_TRASPASO: "TR-99412",
    OBSERVACION: "Llegó con 3 latas abolladas por manipulación de transporte"
  },
  {
    _rowIndex: 5,
    SKU: "SKU-3091",
    DESCRIPCION: "Detergente Líquido 3L",
    LOTE: "L-5541",
    FECHA_VENCIMIENTO: "2028-01-10",
    CANTIDAD: "410",
    PRECIO_COSTO: "5.80",
    PROVEEDOR: "Kimberly Clean",
    FRC_EVEN: "DIF. PED",
    N_TRASPASO: "",
    OBSERVACION: "Diferencia de inventario física vs sistema: -5 unidades (Pendiente)"
  },
  {
    _rowIndex: 6,
    SKU: "SKU-4022",
    DESCRIPCION: "Pan de Molde Integral 500g",
    LOTE: "L-7719",
    FECHA_VENCIMIENTO: "2026-08-21",
    CANTIDAD: "45",
    PRECIO_COSTO: "1.80",
    PROVEEDOR: "Panificadora Central",
    FRC_EVEN: "CAL. INTER",
    N_TRASPASO: "TR-77210",
    OBSERVACION: "No conformidad en control de calidad interno. Traspaso ejecutado."
  }
];

export const SAMPLE_EVENTS_HEADERS = [
  "FRC_N",
  "SKU",
  "DESCRIPCION",
  "LOTE",
  "CANTIDAD",
  "FRC_EVEN",
  "N_TRASPASO",
  "PROVEEDOR",
  "OBSERVACION"
];

export const SAMPLE_EVENTS_ITEMS = [
  {
    _rowIndex: 2,
    FRC_N: "FRC-2026-001",
    SKU: "SKU-2045",
    DESCRIPCION: "Atún en Aceite Lata 140g",
    LOTE: "L-3310",
    CANTIDAD: "12",
    FRC_EVEN: "DET. PED",
    N_TRASPASO: "TR-89201",
    PROVEEDOR: "Pesquera Mar Azul",
    OBSERVACION: "Llegó con 12 latas abolladas. Traspasado a merma de transporte."
  },
  {
    _rowIndex: 3,
    FRC_N: "FRC-2026-002",
    SKU: "SKU-3091",
    DESCRIPCION: "Detergente Líquido 3L",
    LOTE: "L-5541",
    CANTIDAD: "5",
    FRC_EVEN: "DIF. PED",
    N_TRASPASO: "",
    PROVEEDOR: "Kimberly Clean",
    OBSERVACION: "Faltante físico en recepción vs factura. Pendiente de resolución con bodega central."
  },
  {
    _rowIndex: 4,
    FRC_N: "FRC-2026-003",
    SKU: "SKU-4022",
    DESCRIPCION: "Pan de Molde Integral 500g",
    LOTE: "L-7719",
    CANTIDAD: "45",
    FRC_EVEN: "CAL. INTER",
    N_TRASPASO: "TR-89215",
    PROVEEDOR: "Panificadora Central",
    OBSERVACION: "No conformidad en control de calidad interno. Traspaso ejecutado a cuarentena."
  },
  {
    _rowIndex: 5,
    FRC_N: "FRC-2026-004",
    SKU: "SKU-1002",
    DESCRIPCION: "Yogurt Batido Fresa 125g",
    LOTE: "L-9012",
    CANTIDAD: "85",
    FRC_EVEN: "VENC. CERC.",
    N_TRASPASO: "",
    PROVEEDOR: "Lácteos del Sur S.A.",
    OBSERVACION: "Retiro inmediato sugerido. Esperando número de traspaso de sistema externo."
  },
  {
    _rowIndex: 6,
    FRC_N: "FRC-2026-005",
    SKU: "SKU-1001",
    DESCRIPCION: "Leche Entera UHT 1L",
    LOTE: "L-8821",
    CANTIDAD: "50",
    FRC_EVEN: "CANJES",
    N_TRASPASO: "TR-89330",
    PROVEEDOR: "Lácteos del Sur S.A.",
    OBSERVACION: "Canje comercial acordado y ejecutado con proveedor."
  },
  {
    _rowIndex: 7,
    FRC_N: "FRC-2026-006",
    SKU: "SKU-5011",
    DESCRIPCION: "Aceite de Oliva Extra Virgen 500ml",
    LOTE: "L-1102",
    CANTIDAD: "8",
    FRC_EVEN: "AVERIA",
    N_TRASPASO: "",
    PROVEEDOR: "Oleícola del Valle",
    OBSERVACION: "Botellas quebradas en pasillo 4 de almacén. Pendiente registrar N° Traspaso a merma."
  }
];

export const SAMPLE_PRODUCTS = [
  { SKU: "SKU-1001", DESCRIPCION: "Leche Entera UHT 1L", PRECIO_COSTO: "1.25", PROVEEDOR: "Lácteos del Sur S.A." },
  { SKU: "SKU-1002", DESCRIPCION: "Yogurt Batido Fresa 125g", PRECIO_COSTO: "0.60", PROVEEDOR: "Lácteos del Sur S.A." },
  { SKU: "SKU-2045", DESCRIPCION: "Atún en Aceite Lata 140g", PRECIO_COSTO: "2.10", PROVEEDOR: "Pesquera Mar Azul" },
  { SKU: "SKU-3091", DESCRIPCION: "Detergente Líquido 3L", PRECIO_COSTO: "5.80", PROVEEDOR: "Kimberly Clean" },
  { SKU: "SKU-4022", DESCRIPCION: "Pan de Molde Integral 500g", PRECIO_COSTO: "1.80", PROVEEDOR: "Panificadora Central" }
];

export const SAMPLE_POLICIES = [
  { FAMILIA: "Lácteos", DIAS_RETIRO: "15", ACCION: "Liquidación PM / Donación" },
  { FAMILIA: "Abarrotes", DIAS_RETIRO: "30", ACCION: "Devolución a Proveedor" },
  { FAMILIA: "Limpieza", DIAS_RETIRO: "60", ACCION: "Revision de Calidad" }
];
