import { findColumnBySemantic, KnownFieldSemantic } from '../utils/columnAliases';
import { 
  formatDisplayDate, 
  parseAnyDate, 
  getEventCategory, 
  getItemStatus, 
  getItemResolutionStatus,
  EVENT_CATEGORIES 
} from '../utils/dateCalculations';

function createMimeMessage({
  to,
  subject,
  bodyHtml,
  bodyText
}: {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}) {
  const boundary = "=====" + Date.now().toString(16) + "=====";
  const nl = "\r\n";
  const str = [
    `To: ${to}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(bodyText || ''))),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(bodyHtml))),
    ``,
    `--${boundary}--`
  ].join(nl);

  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createGmailDraft(
  accessToken: string,
  params: { to: string; subject: string; bodyHtml: string; bodyText?: string }
) {
  const rawMessage = createMimeMessage(params);
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        raw: rawMessage
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Error al crear borrador en Gmail');
  }

  return await response.json();
}

/**
 * Intelligent helper to extract a field value from an item using semantic matching,
 * regex candidate matching across all object keys, and direct key checks.
 */
function extractFieldValue(
  item: any,
  candidateKeys: string[],
  semantic: KnownFieldSemantic,
  customAliases?: Record<string, string[]>,
  regexFallbacks: RegExp[] = []
): string {
  if (!item || typeof item !== 'object') return '';

  // 1. Direct explicit property checks on the item
  const itemKeys = Object.keys(item);
  
  // Specific direct checks based on semantic
  if (semantic === 'sku') {
    for (const k of ['SKU', 'sku', 'Sku', 'COD PRODUCTO', 'COD_PRODUCTO', 'CODIGO', 'CÓDIGO', 'COD', 'FRC_N', 'FRC/N', 'FRC', 'Item', 'ITEM', 'Articulo', 'ARTICULO', 'ID', 'id']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  if (semantic === 'descripcion') {
    for (const k of ['DESCRIPCION', 'DESCRIPCIÓN', 'Descripcion', 'Descripción', 'PRODUCTO', 'Producto', 'ARTICULO', 'Articulo', 'NOMBRE', 'Nombre', 'DETALLE', 'Detalle', 'DENOMINACION', 'Denominacion', 'Item_Name', 'ITEM_NAME']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  if (semantic === 'lote') {
    for (const k of ['LOTE', 'Lote', 'lote', 'BATCH', 'Batch', 'batch', 'LOT', 'Lot', 'NRO_LOTE', 'NUM_LOTE']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  if (semantic === 'cantidad') {
    for (const k of ['CANTIDAD', 'Cantidad', 'cantidad', 'CANTIDAD AFECTADA', 'CANTIDAD_AFECTADA', 'STOCK', 'Stock', 'UNIDADES', 'Unidades', 'QTY', 'Qty', 'qty', 'CANT', 'Cant']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  if (semantic === 'fecha_vc') {
    for (const k of ['FECHA_VENCIMIENTO', 'FECHA_VC', 'FECHA VC', 'FECHA VENCIMIENTO', 'VENCIMIENTO', 'Vto', 'VTO', 'F_VTO', 'F_VENC', 'FECHA_VTO', 'FECHA VTO', 'CADUCIDAD', 'EXP_DATE']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  if (semantic === 'fecha_retiro') {
    for (const k of ['FECHA_RETIRO', 'FECHA RETIRO', 'RETIRO', 'F_RETIRO', 'FECHA_CANJE', 'CANJE', 'fecha_retiro_calc', '_virtual_fecha_retiro']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  if (semantic === 'proveedor') {
    for (const k of ['PROVEEDOR', 'Proveedor', 'proveedor', 'LABORATORIO', 'Laboratorio', 'MARCA', 'Marca', 'FABRICANTE', 'Fabricante', 'VENDOR', 'Vendor', 'SUPPLIER', 'Supplier']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  if (semantic === 'tipo_evento') {
    for (const k of ['FRC_EVEN', 'FRC EVEN', 'TIPO_EVENTO', 'TIPO EVENTO', 'MOTIVO / INCIDENCIA', 'MOTIVO/INCIDENCIA', 'INCIDENCIA', 'EVENTO', 'MOTIVO', 'CONCEPTO']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  if (semantic === 'observacion') {
    for (const k of ['OBSERVACION', 'OBSERVACIONES', 'Observacion', 'Observaciones', 'OBS', 'Obs', 'COMENTARIOS', 'NOTAS', 'DETALLE']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  if (semantic === 'n_traspaso') {
    for (const k of ['N_TRASPASO', 'N TRASPASO', 'N_DE_TRASPASO', 'N° TRASPASO', 'TRASPASO', 'FOLIO', 'NUM_TRASPASO', 'NRO_TRASPASO']) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        return String(item[k]).trim();
      }
    }
  }

  // 2. Try finding via semantic alias engine
  const matchedCol = findColumnBySemantic(candidateKeys, semantic, customAliases);
  if (matchedCol && item[matchedCol] !== undefined && item[matchedCol] !== null) {
    const val = String(item[matchedCol]).trim();
    if (val !== '') return val;
  }

  // 3. Direct regex matches on all item object keys
  for (const key of itemKeys) {
    if (key.startsWith('_')) continue;
    for (const pattern of regexFallbacks) {
      if (pattern.test(key.trim())) {
        const val = item[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }

  return '';
}

export interface RelationalContext {
  allMainItems?: any[];
  products?: any[];
  policies?: any[];
}

/**
 * Escapes special characters for safe inclusion in HTML bodies and templates
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatVirtualHeaderLabel(header: string): string {
  switch (header) {
    case '_virtual_dias_vencimiento':
      return 'Días Vto';
    case '_virtual_estado_vencimiento':
      return 'Estado';
    case '_virtual_dias_retiro':
      return 'Días Retiro';
    case '_virtual_fecha_retiro':
      return 'F. Retiro';
    case '_virtual_politica':
      return 'Política';
    case '_virtual_estado_resolucion':
      return 'Resolución';
    default:
      return header.replace(/^_virtual_/, '').replace(/_/g, ' ');
  }
}

export function generateItemsHtmlTable(
  items: any[],
  headers: string[] = [],
  customAliases?: Record<string, string[]>,
  relationalContext?: RelationalContext,
  visibleColumns?: string[]
): string {
  if (!items || items.length === 0) {
    return `<p style="color: #64748b; font-style: italic;">(No hay productos seleccionados)</p>`;
  }

  const { allMainItems = [], products = [] } = relationalContext || {};

  // Clean candidate headers (ignore internal non-renderable keys)
  const candidateHeaders = (headers && headers.length > 0)
    ? headers.filter(h => !h.startsWith('_virtual_acciones') && h !== '_rowIndex')
    : (items[0] ? Object.keys(items[0]).filter(k => !k.startsWith('_')) : []);

  // Determine active columns
  const activeHeaders = (visibleColumns && visibleColumns.length > 0)
    ? visibleColumns.filter(c => candidateHeaders.includes(c) || c.startsWith('_virtual_'))
    : candidateHeaders;

  if (activeHeaders.length === 0) {
    return `<p style="color: #64748b; font-style: italic;">(No hay columnas seleccionadas para la tabla)</p>`;
  }

  // Pre-process items and render table rows
  let tableRows = '';

  items.forEach((item, index) => {
    const bgClass = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const itemKeys = Object.keys(item || {}).filter(k => !k.startsWith('_'));
    const allSearchKeys = Array.from(new Set([...candidateHeaders, ...itemKeys]));

    // Extract core identifiers for relational lookups
    const itemSku = extractFieldValue(item, allSearchKeys, 'sku', customAliases);
    const itemLote = extractFieldValue(item, allSearchKeys, 'lote', customAliases);

    const cellsHtml = activeHeaders.map(header => {
      // 1. Virtual Columns
      if (header.startsWith('_virtual_')) {
        if (header === '_virtual_estado_vencimiento') {
          const itemStatus = getItemStatus(item, allSearchKeys);
          let badge = '';
          if (itemStatus.code === 'EXPIRED') {
            badge = `<span style="background-color: #fff1f2; color: #be123c; border: 1px solid #fecdd3; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; display: inline-block;">Vencido</span>`;
          } else if (itemStatus.code === 'RETIRE_NOW') {
            badge = `<span style="background-color: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; display: inline-block;">Retirar Ahora</span>`;
          } else if (itemStatus.code === 'UPCOMING') {
            badge = `<span style="background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; display: inline-block;">Próximo Retiro</span>`;
          } else if (itemStatus.code === 'DRAINAGE_PM') {
            badge = `<span style="background-color: #fff7ed; color: #c2410c; border: 1px solid #ffedd5; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; display: inline-block;">Alerta Drenaje PM</span>`;
          } else {
            badge = `<span style="background-color: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; display: inline-block;">En Regla</span>`;
          }
          return `<td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">${badge}</td>`;
        }

        if (header === '_virtual_estado_resolucion') {
          const res = getItemResolutionStatus(item, allSearchKeys);
          const badge = res.isResolved
            ? `<span style="background-color: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; display: inline-block;">Realizado</span>`
            : `<span style="background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; display: inline-block;">Pendiente</span>`;
          return `<td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">${badge}</td>`;
        }

        if (header === '_virtual_dias_vencimiento') {
          const itemStatus = getItemStatus(item, allSearchKeys);
          const days = itemStatus.daysToExpiry !== null ? itemStatus.daysToExpiry : 0;
          const color = days < 0 ? '#dc2626' : days <= 30 ? '#d97706' : '#1e293b';
          return `<td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: ${color}; white-space: nowrap;">${days} d</td>`;
        }

        if (header === '_virtual_dias_retiro') {
          const itemStatus = getItemStatus(item, allSearchKeys);
          const days = itemStatus.daysToRetire !== null ? itemStatus.daysToRetire : '-';
          return `<td style="padding: 10px 12px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #d97706; white-space: nowrap;">${days}</td>`;
        }

        if (header === '_virtual_fecha_retiro') {
          const rawVc = extractFieldValue(item, allSearchKeys, 'fecha_vc', customAliases);
          const rawRet = extractFieldValue(item, allSearchKeys, 'fecha_retiro', customAliases);
          let retFormatted = '-';
          if (rawRet) {
            const d = parseAnyDate(rawRet);
            retFormatted = d ? formatDisplayDate(d) : String(rawRet);
          } else if (rawVc) {
            const dVc = parseAnyDate(rawVc);
            if (dVc) {
              const dRet = new Date(dVc);
              dRet.setDate(dRet.getDate() - 30);
              retFormatted = formatDisplayDate(dRet);
            }
          }
          return `<td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #d97706; font-weight: 600; white-space: nowrap;">${escapeHtml(retFormatted)}</td>`;
        }

        // Generic fallback for virtual columns
        const val = item[header] !== undefined && item[header] !== null ? String(item[header]) : '-';
        return `<td style="padding: 10px 12px; border: 1px solid #e2e8f0;">${escapeHtml(val)}</td>`;
      }

      // 2. Real Table Header from the active sheet
      let cellVal = item[header] !== undefined && item[header] !== null ? String(item[header]).trim() : '';

      // Check semantic meaning of this specific header
      const isDescCol = findColumnBySemantic([header], 'descripcion', customAliases) !== null || /desc|producto|nombre.*art|detalle/i.test(header);
      const isSkuCol = findColumnBySemantic([header], 'sku', customAliases) !== null || /^sku$|^c[oó]digo/i.test(header);
      const isLoteCol = findColumnBySemantic([header], 'lote', customAliases) !== null || /^lote$|^batch$/i.test(header);
      const isDateCol = findColumnBySemantic([header], 'fecha_vc', customAliases) !== null || findColumnBySemantic([header], 'fecha_retiro', customAliases) !== null || (/^fecha/i.test(header) && !/evento|incidencia|tipo/i.test(header));
      const isCantCol = findColumnBySemantic([header], 'cantidad', customAliases) !== null || /cant|stock|qty|unidades/i.test(header);
      const isTraspasoCol = findColumnBySemantic([header], 'n_traspaso', customAliases) !== null || /traspaso/i.test(header);
      const isPriceCol = findColumnBySemantic([header], 'precio', customAliases) !== null || /precio|costo|val_unit/i.test(header);
      const isEventCol = findColumnBySemantic([header], 'tipo_evento', customAliases) !== null || /frc_even|evento|incidencia|motivo/i.test(header);

      // If description column is empty on this row, look up in products or allMainItems
      if (isDescCol && (!cellVal || cellVal === '')) {
        if (itemSku) {
          const cleanSku = itemSku.trim().toLowerCase();
          const pMatch = products.find(p => {
            const pKeys = Object.keys(p);
            const pSku = extractFieldValue(p, pKeys, 'sku', customAliases) || p['COD PRODUCTO'] || p['SKU'] || p['Código'];
            return pSku && String(pSku).trim().toLowerCase() === cleanSku;
          });
          if (pMatch) {
            const pKeys = Object.keys(pMatch);
            cellVal = extractFieldValue(pMatch, pKeys, 'descripcion', customAliases) || pMatch['DESCRIPCION'] || pMatch['Producto'] || '';
          }
          if (!cellVal) {
            const mMatch = allMainItems.find(m => {
              const mKeys = Object.keys(m);
              const mSku = extractFieldValue(m, mKeys, 'sku', customAliases) || m['SKU'] || m['COD PRODUCTO'];
              return mSku && String(mSku).trim().toLowerCase() === cleanSku;
            });
            if (mMatch) {
              const mKeys = Object.keys(mMatch);
              cellVal = extractFieldValue(mMatch, mKeys, 'descripcion', customAliases) || mMatch['DESCRIPCION'] || mMatch['Producto'] || '';
            }
          }
        }
        if (!cellVal && itemLote) {
          const cleanLote = itemLote.trim().toLowerCase();
          const matchByLote = allMainItems.find(m => {
            const mKeys = Object.keys(m);
            const mLote = extractFieldValue(m, mKeys, 'lote', customAliases) || m['LOTE'] || m['Lote'];
            return mLote && String(mLote).trim().toLowerCase() === cleanLote;
          });
          if (matchByLote) {
            const mKeys = Object.keys(matchByLote);
            cellVal = extractFieldValue(matchByLote, mKeys, 'descripcion', customAliases) || matchByLote['DESCRIPCION'] || matchByLote['Producto'] || '';
          }
        }
      }

      // Format Date values strictly only if it is a real date column
      if (cellVal && isDateCol) {
        const parsed = parseAnyDate(cellVal);
        if (parsed) {
          cellVal = formatDisplayDate(parsed);
        }
      }

      // Display empty fallback (escaped)
      const displayVal = cellVal !== '' ? escapeHtml(cellVal) : '-';

      // Style cell based on type
      if (isTraspasoCol && displayVal !== '-') {
        return `<td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: center;"><span style="background-color: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-family: Consolas, Monaco, monospace; font-size: 12px; display: inline-block;">${displayVal}</span></td>`;
      }
      if (isSkuCol) {
        return `<td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-family: Consolas, Monaco, monospace; font-weight: bold; color: #0f172a; white-space: nowrap;">${displayVal}</td>`;
      }
      if (isDescCol) {
        return `<td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #0f172a;">${displayVal}</td>`;
      }
      if (isLoteCol) {
        return `<td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-family: Consolas, Monaco, monospace; color: #0f172a;">${displayVal}</td>`;
      }
      if (isDateCol) {
        const isVc = /venc|vc|caduc/i.test(header);
        const color = isVc ? '#dc2626' : '#d97706';
        return `<td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: ${color}; font-weight: 600; white-space: nowrap; text-align: center;">${displayVal}</td>`;
      }
      if (isCantCol) {
        return `<td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #0f172a; white-space: nowrap;">${displayVal}</td>`;
      }
      if (isPriceCol) {
        return `<td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #0f172a; white-space: nowrap;">${displayVal.startsWith('$') ? displayVal : `$${displayVal}`}</td>`;
      }
      if (isEventCol) {
        return `<td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-size: 12px; font-weight: 500; color: #334155;">${displayVal}</td>`;
      }

      // Default normal cell
      return `<td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #334155;">${displayVal}</td>`;
    }).join('');

    tableRows += `
      <tr style="background-color: ${bgClass}; font-size: 13px; color: #334155;">
        ${cellsHtml}
      </tr>
    `;
  });

  // Build the table headers using EXACT column names
  const headerThs = activeHeaders.map(header => {
    const isVirtual = header.startsWith('_virtual_');
    const label = isVirtual ? formatVirtualHeaderLabel(header) : header;
    const isCant = findColumnBySemantic([header], 'cantidad', customAliases) !== null || /cant|stock|qty/i.test(header) || isVirtual;
    const isPrice = findColumnBySemantic([header], 'precio', customAliases) !== null || /precio|costo/i.test(header);
    const isDate = findColumnBySemantic([header], 'fecha_vc', customAliases) !== null || findColumnBySemantic([header], 'fecha_retiro', customAliases) !== null || /^fecha/i.test(header);
    const align = isCant || isDate ? 'text-align: center;' : isPrice ? 'text-align: right;' : 'text-align: left;';
    return `<th style="padding: 10px 12px; border: 1px solid #334155; ${align} white-space: nowrap; font-size: 12px; font-weight: bold; background-color: #0f172a; color: #ffffff;">${escapeHtml(label)}</th>`;
  }).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; text-align: left; border: 1px solid #cbd5e1;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff; font-size: 12px;">
          ${headerThs}
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
}
