// Column Aliases and Smart Header Detection Engine
// Allows matching sheet headers regardless of accents, case, underscores, or abbreviations

export type KnownFieldSemantic = 
  | 'id'
  | 'sku'
  | 'descripcion'
  | 'fecha_vc'
  | 'fecha_retiro'
  | 'mes'
  | 'anio'
  | 'cantidad'
  | 'lote'
  | 'politica'
  | 'tipo_evento'
  | 'frc_bod'
  | 'precio'
  | 'observacion'
  | 'proveedor'
  | 'dias_anticipacion'
  | 'dias_retiro'
  | 'n_traspaso'
  | 'telefono'
  | 'email'
  | 'categoria'
  | 'mundo'
  | 'pm'
  | 'ubicacion'
  | 'local'
  | 'venta'
  | 'ingreso'
  | 'egreso'
  | 'inv_inicial'
  | 'stock_min'
  | 'stock_max'
  | 'stock_critico';

export const FIELD_PATTERNS: Record<KnownFieldSemantic, RegExp[]> = {
  local: [
    /^local$/i,
    /^sucursal$/i,
    /^farmacia$/i,
    /^tienda$/i,
    /^cod(_|\s)?local$/i,
    /^nro(_|\s)?local$/i
  ],
  venta: [
    /^venta(s)?$/i,
    /^ventas(_|\s)?(del(_|\s)?periodo|periodo|turno|dia|d[ií]a)?$/i,
    /^unidades(_|\s)?vendidas$/i,
    /^cant(_|\s)?venta$/i
  ],
  ingreso: [
    /^ingreso(s)?$/i,
    /^recepci[oó]n$/i,
    /^entradas$/i,
    /^cant(_|\s)?ingreso$/i
  ],
  egreso: [
    /^egreso(s)?$/i,
    /^salida(s)?$/i,
    /^merma(s)?$/i,
    /^cant(_|\s)?egreso$/i
  ],
  inv_inicial: [
    /^inv(\.|\s)?inicial$/i,
    /^inventario(_|\s)?inicial$/i,
    /^stock(_|\s)?inicial$/i,
    /^saldo(_|\s)?inicial$/i
  ],
  stock_min: [
    /^stock(_|\s)?min(imo)?$/i,
    /^stock_min$/i,
    /^minimo$/i
  ],
  stock_max: [
    /^stock(_|\s)?max(imo)?$/i,
    /^stock_max$/i,
    /^maximo$/i
  ],
  stock_critico: [
    /^stock(_|\s)?cr[ií]tico$/i,
    /^stock_critico$/i,
    /^critico$/i
  ],
  ubicacion: [
    /^ubicaci[oó]n(_|\s)?(bod|bodega|almacen|pasillo)?$/i,
    /^pasillo$/i,
    /^estante$/i,
    /^posici[oó]n$/i,
    /^bin$/i,
    /^rack$/i,
    /^locaci[oó]n$/i
  ],
  id: [
    /^cu(_|\s)?(vc|calculado)?$/i,
    /^codigo(_|\s)?unico$/i,
    /^clave(_|\s)?unica$/i,
    /^id_vc$/i,
    /^id_evento$/i,
    /^id_incidencia$/i,
    /^id_row$/i,
    /^id$/i,
    /^key$/i,
    /^codigo_id$/i,
    /^registro_id$/i,
    /^id_registro$/i,
    /^folio$/i,
    /^nro_registro$/i,
    /^frc(_|\/|\s)?n(ro)?$/i,
    /^frc$/i,
    /^n(_|\s)?frc$/i,
    /^nro(_|\s)?frc$/i,
    /^folio(_|\s)?frc$/i,
    /^frc(_|\s)?folio$/i,
    /^numero(_|\s)?frc$/i
  ],
  sku: [
    /^sku(_|\s)?(vc|calculado)?$/i,
    /^sku$/i,
    /^ean(_|\s)?(13|8|code)?$/i,
    /^c[oó]d(igo)?(_|\s)?(de)?(_|\s)?barra(s)?$/i,
    /^barcode$/i,
    /^c[oó]digo(_|\s)?sku$/i,
    /^cod(_|\s)?sku$/i,
    /^c[oó]digo$/i,
    /^cod$/i,
    /^cod(_|\s)?(prod|producto|art|articulo|item|mat|material)?(_|\s)?(vc|calculado)?$/i,
    /^codigo(_|\s)?(de|del)?(_|\s)?(producto|articulo|item|material)?(_|\s)?(vc|calculado)?$/i,
    /^item(_|\s)?(code|id|num)?(_|\s)?(vc|calculado)?$/i,
    /^product(_|\s)?(id|code)?(_|\s)?(vc|calculado)?$/i,
    /^clave(_|\s)?(prod|producto)?(_|\s)?(vc|calculado)?$/i,
    /^cod_art$/i,
    /^codigo_articulo$/i,
    /^nro(_|\s)?(de)?(_|\s)?(articulo|prod)$/i
  ],
  descripcion: [
    /^descripci[oó]n(_|\s)?(de|del)?(_|\s)?(producto|articulo|item|material)?(_|\s)?(vc|calculado)?$/i,
    /^desc(_|\s)?(vc|calculado)?$/i,
    /^producto(_|\s)?(vc|calculado)?$/i,
    /^articulo(_|\s)?(vc|calculado)?$/i,
    /^art[ií]culo(_|\s)?(vc|calculado)?$/i,
    /^item(_|\s)?(name)?(_|\s)?(vc|calculado)?$/i,
    /^nombre(_|\s)?(de|del)?(_|\s)?(producto|articulo|item)?(_|\s)?(vc|calculado)?$/i,
    /^detalle(_|\s)?(producto)?(_|\s)?(vc|calculado)?$/i,
    /^denominaci[oó]n(_|\s)?(vc|calculado)?$/i,
    /^descripci[oó]n$/i
  ],
  fecha_vc: [
    /^fecha(_|\s)?(vc|vencimiento|caducidad|exp|expiracion|expiraci[oó]n|vto|vcto)$/i,
    /^vencimiento$/i,
    /^caducidad$/i,
    /^expiraci[oó]n$/i,
    /^f(_|\s)?(venc|vto|vcto|cad|exp)$/i,
    /^vto$/i,
    /^vcto$/i,
    /^fecha(_|\s)?(vto|vcto)$/i,
    /^expiry(_|\s)?date$/i,
    /^exp(_|\s)?date$/i
  ],
  fecha_retiro: [
    /^fecha(_|\s)?retiro(_|\s)?(calc|calculada)?$/i,
    /^fecha(_|\s)?(retiro|canje|limite|l[ií]mite)$/i,
    /^retiro$/i,
    /^canje$/i,
    /^f(_|\s)?(retiro|canje)$/i,
    /^fecha(_|\s)?(limite|l[ií]mite)(_|\s)?(de)?(_|\s)?(retiro|canje)?$/i,
    /^withdrawal(_|\s)?date$/i,
    /^limit(_|\s)?date$/i
  ],
  mes: [
    /^mm$/i,
    /^mes$/i,
    /^month$/i,
    /^mes(_|\s)?(vc|vencimiento|caducidad)?$/i
  ],
  anio: [
    /^yyyy$/i,
    /^yy$/i,
    /^a[ñn]o$/i,
    /^an?io$/i,
    /^year$/i,
    /^(an?io|a[ñn]o)(_|\s)?(vc|vencimiento|caducidad)?$/i
  ],
  cantidad: [
    /^cantidad$/i,
    /^cant$/i,
    /^unidades$/i,
    /^unid$/i,
    /^qty$/i,
    /^quantity$/i,
    /^stock$/i,
    /^saldo$/i,
    /^saldo(_|\s)?(actual|disponible|stock)?$/i,
    /^existencia(s)?$/i,
    /^stock(_|\s)?(actual|te[oó]rico|sistema|disp|disponible|total)?$/i,
    /^cant(idad)?(_|\s)?(disp|disponible|stock|te[oó]rico|f[ií]sico)?$/i,
    /^total(_|\s)?unidades$/i,
    /^piezas$/i,
    /^pzas$/i,
    /^bultos$/i,
    /^cajas$/i,
    /^cantidad(_|\s)?(afectada|reportada|recibida|faltante|sobrante|averiada)?$/i
  ],
  lote: [
    /^lote$/i,
    /^batch$/i,
    /^n[uú]mero(_|\s)?(de)?(_|\s)?lote$/i,
    /^num(_|\s)?lote$/i,
    /^nro(_|\s)?lote$/i,
    /^no(_|\s)?lote$/i,
    /^lot(_|\s)?(number|no|num)?$/i
  ],
  politica: [
    /^canje(_|\s)?solo(_|\s)?por(_|\s)?vencimiento(s)?(_|\s)?dia(s)?$/i,
    /^canje(_|\s)?solo$/i,
    /^pol[ií]tica$/i,
    /^pol[ií]tica(_|\s)?(de)?(_|\s)?(canje|retiro|devolucion|devoluci[oó]n)?$/i,
    /^tipo(_|\s)?(de)?(_|\s)?(pol[ií]tica|canje)$/i,
    /^regla(_|\s)?(canje|retiro)?$/i,
    /^policy$/i
  ],
  dias_anticipacion: [
    /^retiro(_|\s)?\((_|\s)?d[ií]as(_|\s)?\)$/i,
    /^retiro(_|\s)?d[ií]as$/i,
    /^d[ií]as(_|\s)?(de)?(_|\s)?(anticipaci[oó]n|anticipacion|canje|retiro)?$/i,
    /^dias$/i,
    /^d[ií]as$/i,
    /^anticipaci[oó]n$/i,
    /^lead(_|\s)?time$/i,
    /^days$/i
  ],
  dias_retiro: [
    /^retiro(_|\s)?\((_|\s)?d[ií]as(_|\s)?\)$/i,
    /^retiro(_|\s)?d[ií]as$/i,
    /^d[ií]as(_|\s)?(de)?(_|\s)?(retiro|canje|limite|l[ií]mite)?(_|\s)?(vc|calculado)?$/i,
    /^retiro(_|\s)?d[ií]as(_|\s)?(vc|calculado)?$/i,
    /^dias(_|\s)?retiro(_|\s)?(vc|calculado)?$/i,
    /^days(_|\s)?withdrawal$/i
  ],
  tipo_evento: [
    /^frc(_|\s)?even(to)?$/i,
    /^frc_even$/i,
    /^even$/i,
    /^tipo(_|\s)?(de)?(_|\s)?(evento|registro|incidencia|fallo|novedad)$/i,
    /^evento$/i,
    /^incidencia$/i,
    /^categor[ií]a(_|\s)?(evento|incidencia)?$/i,
    /^tipo$/i,
    /^motivo$/i,
    /^concepto$/i,
    /^event(_|\s)?type$/i
  ],
  precio: [
    /^precio$/i,
    /^costo$/i,
    /^precio(_|\s)?(unitario|venta|lista|compra|promedio)?$/i,
    /^costo(_|\s)?(unitario|promedio)?$/i,
    /^valor$/i,
    /^importe$/i,
    /^monto$/i,
    /^total$/i,
    /^price$/i,
    /^cost$/i
  ],
  observacion: [
    /^observaci[oó]n(es)?$/i,
    /^comentario(s)?$/i,
    /^nota(s)?$/i,
    /^detalle(_|\s)?(incidencia|adicional|evento)?$/i,
    /^descripci[oó]n(_|\s)?(falla|problema|incidencia)?$/i,
    /^remarks?$/i,
    /^notes?$/i,
    /^comments?$/i
  ],
  proveedor: [
    /^proveedor$/i,
    /^prov$/i,
    /^rut(_|\s)?(del?(_|\s)?)?proveedor$/i,
    /^rut$/i,
    /^nombre(_|\s)?(del?(_|\s)?)?proveedor$/i,
    /^fabricante$/i,
    /^laboratorio$/i,
    /^distribuidor$/i,
    /^vendor$/i,
    /^supplier$/i
  ],
  n_traspaso: [
    /^n(_|\s)?traspaso$/i,
    /^nro(_|\s)?traspaso$/i,
    /^num(_|\s)?traspaso$/i,
    /^n(_|\s)?de(_|\s)?traspaso$/i,
    /^n°(_|\s)?traspaso$/i,
    /^numero(_|\s)?(de)?(_|\s)?traspaso$/i,
    /^traspaso(_|\s)?(id|num|nro|n)?$/i,
    /^traspaso$/i,
    /^fol(_|\s)?traspaso$/i,
    /^folio(_|\s)?traspaso$/i,
    /^resoluci[oó]n$/i,
    /^nro(_|\s)?resoluci[oó]n$/i,
    /^transfer(_|\s)?(num|no|id)?$/i
  ],
  frc_bod: [
    /^frc(_|\s)?bod(_|\s)?(ega)?$/i,
    /^frc_bod$/i,
    /^bodega$/i,
    /^bod$/i,
    /^destino(_|\s)?traspaso$/i,
    /^destino$/i,
    /^warehouse$/i,
    /frc.*bod/i,
    /bod/i
  ],
  telefono: [
    /^tel[eé]fono$/i,
    /^telefono$/i,
    /^tel$/i,
    /^celular$/i,
    /^cel$/i,
    /^phone$/i,
    /^whatsapp$/i,
    /^wsp$/i,
    /^fono$/i,
    /^m[oó]vil$/i,
    /^movil$/i,
    /^numero(_|\s)?(de)?(_|\s)?contacto$/i,
    /^contacto(_|\s)?tel[eé]fono$/i,
    /^tel[eé]fono(_|\s)?contacto$/i
  ],
  email: [
    /^email$/i,
    /^e-mail$/i,
    /^correo$/i,
    /^correo(_|\s)?electr[oó]nico$/i,
    /^correo(_|\s)?contacto$/i,
    /^mail$/i
  ],
  categoria: [
    /^categor[ií]a$/i,
    /^familia$/i,
    /^rubro$/i,
    /^departamento$/i,
    /^l[ií]nea$/i,
    /^category$/i,
    /^subcategor[ií]a$/i,
    /^grupo$/i
  ],
  mundo: [
    /^mundo$/i,
    /^zona$/i,
    /^division$/i,
    /^segmento$/i,
    /^area$/i
  ],
  pm: [
    /^pm$/i,
    /^product(_|\s)?manager$/i,
    /^responsable$/i,
    /^comprador$/i,
    /^gestor$/i
  ]
};

// Normalize text removing diacritics and special spaces for fuzzy comparisons
export function normalizeHeaderString(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-_]+/g, '_')
    .toLowerCase();
}

// Lightweight memoization cache for header semantics resolution (O(1) after first lookup)
const headerSemanticsCache = new WeakMap<string[], Partial<Record<KnownFieldSemantic, string>>>();

/**
 * Finds the first column in the provided headers array that matches a semantic field
 */
export function findColumnBySemantic(
  headers: string[], 
  semantic: KnownFieldSemantic, 
  customAliases?: Record<string, string[]>
): string | undefined {
  if (!headers || !Array.isArray(headers) || headers.length === 0) return undefined;

  // Check cache for headers array reference when no customAliases are passed (most common case)
  if (!customAliases) {
    let cachedMap = headerSemanticsCache.get(headers);
    if (cachedMap && semantic in cachedMap) {
      return cachedMap[semantic];
    }
  }
  
  const patterns = [...(FIELD_PATTERNS[semantic] || [])];
  
  if (customAliases && customAliases[semantic]) {
    for (const alias of customAliases[semantic]) {
      if (alias && String(alias).trim()) {
        const trimmed = String(alias).trim();
        // Exact match regex and case-insensitive substring regex
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        patterns.push(new RegExp(`^${escaped}$`, 'i'));
        patterns.push(new RegExp(escaped, 'i'));
      }
    }
  }

  let matched: string | undefined = undefined;

  // 1. Direct regex match
  for (const header of headers) {
    if (header === null || header === undefined) continue;
    const cleanHeader = String(header).trim();
    if (!cleanHeader) continue;
    for (const pattern of patterns) {
      if (pattern.test(cleanHeader)) {
        matched = header;
        break;
      }
    }
    if (matched) break;
  }

  // 2. Normalized fallback check if not matched
  if (!matched) {
    for (const header of headers) {
      if (header === null || header === undefined) continue;
      const norm = normalizeHeaderString(header);
      if (!norm) continue;
      for (const pattern of patterns) {
        if (pattern.test(norm)) {
          matched = header;
          break;
        }
      }
      if (matched) break;
    }
  }

  // Store in cache for subsequent O(1) lookups
  if (!customAliases && typeof headers === 'object') {
    let cachedMap = headerSemanticsCache.get(headers);
    if (!cachedMap) {
      cachedMap = {};
      headerSemanticsCache.set(headers, cachedMap);
    }
    cachedMap[semantic] = matched;
  }

  return matched;
}

/**
 * Extract a map of all detected semantic fields from headers
 */
export function detectAllColumnSemantics(
  headers: string[], 
  customAliases?: Record<string, string[]>
): Partial<Record<KnownFieldSemantic, string>> {
  if (!headers || headers.length === 0) return {};

  if (!customAliases) {
    const cached = headerSemanticsCache.get(headers);
    if (cached && Object.keys(cached).length >= 10) {
      return cached;
    }
  }

  const map: Partial<Record<KnownFieldSemantic, string>> = {};
  const semantics: KnownFieldSemantic[] = [
    'id', 'sku', 'descripcion', 'fecha_vc', 'fecha_retiro', 'mes', 'anio', 
    'cantidad', 'lote', 'politica', 'dias_anticipacion', 'dias_retiro', 'tipo_evento', 
    'frc_bod', 'precio', 'observacion', 'proveedor', 'n_traspaso', 'telefono', 'email', 'categoria', 'mundo', 'pm', 'ubicacion'
  ];

  semantics.forEach(semantic => {
    const matched = findColumnBySemantic(headers, semantic, customAliases);
    if (matched) {
      map[semantic] = matched;
    }
  });

  if (!customAliases && typeof headers === 'object') {
    headerSemanticsCache.set(headers, map);
  }

  return map;
}

/**
 * Helper to find phone/whatsapp column
 */
export function findPhoneColumn(headers: string[], customAliases?: Record<string, string[]>): string | undefined {
  if (!headers || !Array.isArray(headers) || headers.length === 0) return undefined;
  return findColumnBySemantic(headers, 'telefono', customAliases) 
    || headers.find(h => h && /tel|cel|phone|whatsapp|wsp|m[oó]vil|fono/i.test(String(h)));
}

/**
 * Helper to find email column
 */
export function findEmailColumn(headers: string[], customAliases?: Record<string, string[]>): string | undefined {
  if (!headers || !Array.isArray(headers) || headers.length === 0) return undefined;
  return findColumnBySemantic(headers, 'email', customAliases)
    || headers.find(h => h && /email|e-mail|correo|mail/i.test(String(h)));
}

