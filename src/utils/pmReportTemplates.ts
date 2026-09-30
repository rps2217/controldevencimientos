import { InventoryItem } from '../types';
import { getItemStatus, formatDisplayDate, parseLocaleNumber } from './dateCalculations';
import { findColumnBySemantic } from './columnAliases';

export type ReportTemplateType = 
  | 'PM' 
  | 'PROVIDER_CANJE' 
  | 'STORE_ADMIN' 
  | 'LOGISTICS_TRANSFER' 
  | 'QUALITY_RECALL' 
  | 'EXECUTIVE_SUMMARY';

export interface PmReportMetrics {
  totalUnits: number;
  criticalCount: number;
  canjeCount: number;
  mermaCount: number;
}

export interface BuildReportOptions {
  template: ReportTemplateType;
  items: InventoryItem[];
  selectedProvider: string;
  issuerName: string;
  customNote?: string;
  transferFolio?: string;
  driverName?: string;
  reportDate?: Date;
}

export interface ReportDraftResult {
  subject: string;
  body: string;
  lines: string[];
  metrics: PmReportMetrics;
}

/**
 * Calcula las métricas acumuladas de unidades y severidad para el reporte de drenaje / PM.
 */
export function computePmReportMetrics(items: InventoryItem[]): PmReportMetrics {
  let totalUnits = 0;
  let criticalCount = 0;
  let canjeCount = 0;
  let mermaCount = 0;

  items.forEach(it => {
    const keys = Object.keys(it);
    const qtyCol = findColumnBySemantic(keys, 'cantidad');
    const rawQty = (qtyCol && it[qtyCol]) || it['CANTIDAD'] || '1';
    totalUnits += parseLocaleNumber(rawQty) || 1;

    const st = getItemStatus(it, keys);
    if (st.code === 'EXPIRED' || st.code === 'RETIRE_NOW' || (st.daysToRetire !== null && st.daysToRetire <= 7)) {
      criticalCount++;
    }
    if (st.actionType === 'CANJE_PROVEEDOR') canjeCount++;
    if (st.actionType === 'MERMA_DIRECTA') mermaCount++;
  });

  return { totalUnits, criticalCount, canjeCount, mermaCount };
}

/**
 * Construye el asunto y cuerpo estructurado del reporte según la plantilla seleccionada (Lógica Zero-DOM).
 */
export function buildReportData(options: BuildReportOptions): ReportDraftResult {
  const {
    template,
    items,
    selectedProvider,
    issuerName,
    customNote = '',
    transferFolio = `TR-${Date.now().toString().slice(-6)}`,
    driverName = '',
    reportDate = new Date()
  } = options;

  const metrics = computePmReportMetrics(items);
  const todayStr = reportDate.toLocaleDateString('es-CL', { 
    day: '2-digit', month: '2-digit', year: 'numeric' 
  });

  let subject = '';
  const lines: string[] = [];

  switch (template) {
    case 'PROVIDER_CANJE': {
      const provLabel = selectedProvider !== 'ALL' ? selectedProvider : 'PROVEEDOR / LABORATORIO';
      subject = `[SOLICITUD CANJE] Retiro de Vencimientos Próximos - ${provLabel} (${todayStr})`;
      lines.push(`📦 *SOLICITUD FORMAL DE RETIRO Y CANJE POR VENCIMIENTO PRÓXIMO*`);
      lines.push(`🏢 *Destinatario:* ${provLabel}`);
      lines.push(`📅 *Fecha de Emisión:* ${todayStr}`);
      lines.push(`📊 *Total Ítems:* ${items.length} SKUs (${metrics.totalUnits} un.)`);
      lines.push(`👤 *Emisor:* ${issuerName}`);
      lines.push(`------------------------------------------------------------`);
      lines.push(`Estimado Proveedor / Laboratorio:`);
      lines.push(`Presentamos el listado de productos en custodia que se encuentran dentro de la ventana contractual de retiro preventivo acordada. Solicitamos coordinar fecha de retiro físico y emisión de Nota de Crédito o Reposición:`);
      lines.push(``);

      items.forEach((it, idx) => {
        const keys = Object.keys(it);
        const skuCol = findColumnBySemantic(keys, 'sku');
        const descCol = findColumnBySemantic(keys, 'descripcion');
        const vcCol = findColumnBySemantic(keys, 'fecha_vc');
        const retCol = findColumnBySemantic(keys, 'fecha_retiro');
        const qtyCol = findColumnBySemantic(keys, 'cantidad');
        const loteCol = findColumnBySemantic(keys, 'lote');

        const sku = (skuCol && it[skuCol]) || it['SKU'] || '-';
        const desc = (descCol && it[descCol]) || '-';
        const fVc = vcCol && it[vcCol] ? formatDisplayDate(it[vcCol]) : '-';
        const fRet = retCol && it[retCol] ? formatDisplayDate(it[retCol]) : '-';
        const qty = (qtyCol && it[qtyCol]) || it['CANTIDAD'] || '1';
        const lote = (loteCol && it[loteCol]) || it['LOTE'] || '-';

        lines.push(`${idx + 1}. *SKU ${sku}* | ${desc}`);
        lines.push(`   📦 Cantidad: ${qty} un. | 🏷️ Lote/CU: ${lote} | ⏳ Vence: ${fVc} | ⛔ Límite Retiro: ${fRet}`);
      });

      if (customNote.trim()) {
        lines.push(``);
        lines.push(`📝 *Observaciones adicionales:* ${customNote.trim()}`);
      }

      lines.push(``);
      lines.push(`------------------------------------------------------------`);
      lines.push(`*Agradecemos confirmar fecha de retiro a la brevedad para evitar mermas operativas.*`);
      break;
    }

    case 'LOGISTICS_TRANSFER': {
      subject = `[ACTA TRASPASO ${transferFolio}] Devolución a Bodega Central (${todayStr})`;
      lines.push(`🚚 *ACTA DE TRASPASO Y DEVOLUCIÓN A BODEGA CENTRAL*`);
      lines.push(`📄 *Folio Traspaso:* ${transferFolio}`);
      lines.push(`📅 *Fecha de Despacho:* ${todayStr}`);
      lines.push(`👤 *Responsable Despacho:* ${issuerName}`);
      if (driverName.trim()) lines.push(`🚛 *Transportista / Chofer:* ${driverName.trim()}`);
      lines.push(`📊 *Total Bultos / Unidades:* ${metrics.totalUnits} un. en ${items.length} líneas`);
      lines.push(`------------------------------------------------------------`);
      lines.push(`Detalle de mercadería segregada por vencimiento / canje para consolidación en matriz:`);
      lines.push(``);

      items.forEach((it, idx) => {
        const keys = Object.keys(it);
        const skuCol = findColumnBySemantic(keys, 'sku');
        const descCol = findColumnBySemantic(keys, 'descripcion');
        const vcCol = findColumnBySemantic(keys, 'fecha_vc');
        const qtyCol = findColumnBySemantic(keys, 'cantidad');
        const provCol = findColumnBySemantic(keys, 'proveedor') || 'PROVEEDOR';

        const sku = (skuCol && it[skuCol]) || it['SKU'] || '-';
        const desc = (descCol && it[descCol]) || '-';
        const fVc = vcCol && it[vcCol] ? formatDisplayDate(it[vcCol]) : '-';
        const qty = (qtyCol && it[qtyCol]) || it['CANTIDAD'] || '1';
        const prov = it[provCol] || '-';

        lines.push(`${idx + 1}. SKU [${sku}] ${desc} (${qty} un.) | Prov: ${prov} | Vence: ${fVc}`);
      });

      if (customNote.trim()) {
        lines.push(``);
        lines.push(`📝 *Instrucciones de Recepción:* ${customNote.trim()}`);
      }
      lines.push(``);
      lines.push(`------------------------------------------------------------`);
      lines.push(`*Control de Custodia:* Mercadería verificada físicamente al 100%.`);
      break;
    }

    case 'QUALITY_RECALL': {
      subject = `[ALERTA CALIDAD] Bloqueo y Cuarentena Preventiva de Lotes (${todayStr})`;
      lines.push(`⚠️ *NOTIFICACIÓN DE BLOQUEO / CUARENTENA PREVENTIVA POR CALIDAD*`);
      lines.push(`📅 *Fecha de Notificación:* ${todayStr}`);
      lines.push(`👤 *Emitido por:* ${issuerName}`);
      lines.push(`🚨 *Nivel de Urgencia:* RETIRO INMEDIATO DE SALA Y BODEGA`);
      lines.push(`------------------------------------------------------------`);
      lines.push(`Instrucción formal: Proceder a la retención física y bloqueo de sistema para los siguientes ítems:`);
      lines.push(``);

      items.forEach((it) => {
        const keys = Object.keys(it);
        const skuCol = findColumnBySemantic(keys, 'sku');
        const descCol = findColumnBySemantic(keys, 'descripcion');
        const loteCol = findColumnBySemantic(keys, 'lote');
        const qtyCol = findColumnBySemantic(keys, 'cantidad');

        const sku = (skuCol && it[skuCol]) || it['SKU'] || '-';
        const desc = (descCol && it[descCol]) || '-';
        const lote = (loteCol && it[loteCol]) || it['LOTE'] || '-';
        const qty = (qtyCol && it[qtyCol]) || it['CANTIDAD'] || '1';

        lines.push(`🔴 SKU [${sku}] ${desc} | Lote: ${lote} | Cantidad en cuarentena: ${qty} un.`);
      });

      if (customNote.trim()) {
        lines.push(``);
        lines.push(`⚠️ *Motivo del Bloqueo:* ${customNote.trim()}`);
      }
      lines.push(``);
      lines.push(`------------------------------------------------------------`);
      lines.push(`*Queda estrictamente prohibida la comercialización o dispensación de estos lotes.*`);
      break;
    }

    case 'STORE_ADMIN': {
      subject = `[PAUTA CONTROL SALA] Retiro Preventivo de Góndola (${todayStr})`;
      lines.push(`📋 *PAUTA OPERATIVA DE RETIRO Y CONTROL DE SALA / BODEGA*`);
      lines.push(`📅 *Fecha:* ${todayStr}`);
      lines.push(`🎯 *Objetivo:* Segregar productos en fecha límite antes del vencimiento`);
      lines.push(`👤 *Responsable de Auditoría:* ${issuerName}`);
      lines.push(`------------------------------------------------------------`);
      lines.push(`Pauta para reponedores y equipo de local:`);
      lines.push(``);

      items.forEach((it, idx) => {
        const keys = Object.keys(it);
        const st = getItemStatus(it, keys);
        const skuCol = findColumnBySemantic(keys, 'sku');
        const descCol = findColumnBySemantic(keys, 'descripcion');
        const vcCol = findColumnBySemantic(keys, 'fecha_vc');
        const retCol = findColumnBySemantic(keys, 'fecha_retiro');
        const qtyCol = findColumnBySemantic(keys, 'cantidad');

        const sku = (skuCol && it[skuCol]) || it['SKU'] || '-';
        const desc = (descCol && it[descCol]) || '-';
        const fVc = vcCol && it[vcCol] ? formatDisplayDate(it[vcCol]) : '-';
        const fRet = retCol && it[retCol] ? formatDisplayDate(it[retCol]) : '-';
        const qty = (qtyCol && it[qtyCol]) || it['CANTIDAD'] || '-';

        lines.push(`${idx + 1}. [${sku}] ${desc} (Stock: ${qty} un.)`);
        lines.push(`   Vence: ${fVc} | Retiro límite: ${fRet} | Días restantes: ${st.daysToRetire ?? '-'}d | [${st.actionLabel}]`);
      });

      if (customNote.trim()) {
        lines.push(``);
        lines.push(`📝 *Notas operativas:* ${customNote.trim()}`);
      }
      lines.push(``);
      lines.push(`------------------------------------------------------------`);
      lines.push(`*Verificar físicamente contra estantería y confirmar retiro en sistema.*`);
      break;
    }

    case 'EXECUTIVE_SUMMARY': {
      subject = `[RESUMEN EJECUTIVO] Diagnóstico de Mermas y Riesgo de Vencimiento (${todayStr})`;
      lines.push(`📊 *RESUMEN GERENCIAL: DIAGNÓSTICO DE VENCIMIENTOS Y MERMAS*`);
      lines.push(`📅 *Fecha de Corte:* ${todayStr}`);
      lines.push(`👤 *Preparado por:* ${issuerName}`);
      lines.push(`------------------------------------------------------------`);
      lines.push(`📈 *INDICADORES CONSOLIDADOS:*`);
      lines.push(`• Total SKUs en riesgo: ${items.length} líneas`);
      lines.push(`• Total unidades físicas: ${metrics.totalUnits} unidades`);
      lines.push(`• En riesgo crítico / inmediato: ${metrics.criticalCount} SKUs`);
      lines.push(`• Con política de Canje a Proveedor: ${metrics.canjeCount} SKUs`);
      lines.push(`• Merma Directa (Sin Canje): ${metrics.mermaCount} SKUs`);
      lines.push(`------------------------------------------------------------`);
      lines.push(`Detalle de los principales ítems:`);
      lines.push(``);

      items.slice(0, 20).forEach((it, idx) => {
        const keys = Object.keys(it);
        const st = getItemStatus(it, keys);
        const skuCol = findColumnBySemantic(keys, 'sku');
        const descCol = findColumnBySemantic(keys, 'descripcion');
        const qtyCol = findColumnBySemantic(keys, 'cantidad');

        const sku = (skuCol && it[skuCol]) || it['SKU'] || '-';
        const desc = (descCol && it[descCol]) || '-';
        const qty = (qtyCol && it[qtyCol]) || it['CANTIDAD'] || '-';

        lines.push(`${idx + 1}. [${sku}] ${desc} | ${qty} un. | ${st.label} [${st.actionLabel}]`);
      });

      if (items.length > 20) {
        lines.push(`... y ${items.length - 20} ítems adicionales.`);
      }

      if (customNote.trim()) {
        lines.push(``);
        lines.push(`📝 *Conclusiones / Recomendación:* ${customNote.trim()}`);
      }
      break;
    }

    case 'PM':
    default: {
      subject = `[ALERTA DRENAJE PM] Vencimientos Próximos para Gestión Comercial (${todayStr})`;
      lines.push(`🚨 *ALERTA COMERCIAL / SOLICITUD DE DRENAJE PARA PRODUCT MANAGER*`);
      lines.push(`📅 *Fecha de Emisión:* ${todayStr}`);
      lines.push(`📊 *Total SKUs en Ventana de Retiro:* ${items.length} (${metrics.totalUnits} un.)`);
      lines.push(`🏢 *Filtro Proveedor:* ${selectedProvider !== 'ALL' ? selectedProvider : 'Todos los proveedores'}`);
      lines.push(`👤 *Emisor:* ${issuerName}`);
      lines.push(`------------------------------------------------------------`);
      lines.push(`Se solicita evaluar liquidación comercial prioritaria, rebaja de margen o activación de canje con proveedor para los siguientes productos:`);
      lines.push(``);

      items.forEach((it, idx) => {
        const keys = Object.keys(it);
        const skuCol = findColumnBySemantic(keys, 'sku');
        const descCol = findColumnBySemantic(keys, 'descripcion');
        const vcCol = findColumnBySemantic(keys, 'fecha_vc');
        const retCol = findColumnBySemantic(keys, 'fecha_retiro');
        const qtyCol = findColumnBySemantic(keys, 'cantidad');
        const st = getItemStatus(it, keys);

        const sku = (skuCol && it[skuCol]) || it['SKU'] || '-';
        const desc = (descCol && it[descCol]) || '-';
        const fVc = vcCol && it[vcCol] ? formatDisplayDate(it[vcCol]) : '-';
        const fRet = retCol && it[retCol] ? formatDisplayDate(it[retCol]) : '-';
        const qty = (qtyCol && it[qtyCol]) || it['CANTIDAD'] || '-';

        lines.push(`${idx + 1}. [SKU: ${sku}] ${desc} | Cant: ${qty} un. | Vence: ${fVc} | Retiro: ${fRet} | ${st.label} [Acción: ${st.actionLabel}]`);
      });

      if (customNote.trim()) {
        lines.push(``);
        lines.push(`📝 *Estrategia / Nota de Operación:* ${customNote.trim()}`);
      }
      lines.push(``);
      lines.push(`------------------------------------------------------------`);
      lines.push(`*Reporte generado desde Gestor de Vencimientos para acción comercial inmediata.*`);
      break;
    }
  }

  const body = lines.join('\n');
  return { subject, body, lines, metrics };
}
