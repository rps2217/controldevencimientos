import React, { useState, useMemo } from 'react';
import { 
  Flame, X, CheckCircle2, CheckCheck, Copy, Download, Building2, 
  MessageSquare, Briefcase, FileText, Search, Printer, 
  Mail, ShieldAlert, Truck, Layers, UserCheck
} from 'lucide-react';
import { InventoryItem } from '../../types';
import { getItemStatus, formatDisplayDate, parseLocaleNumber, formatLocaleNumber } from '../../utils/dateCalculations';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { exportToExcel, copyTextToClipboard } from '../../utils/exportUtils';

interface PmReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  drainageReportItems: InventoryItem[];
}

export type ReportTemplateType = 
  | 'PM' 
  | 'PROVIDER_CANJE' 
  | 'STORE_ADMIN' 
  | 'LOGISTICS_TRANSFER' 
  | 'QUALITY_RECALL' 
  | 'EXECUTIVE_SUMMARY';

export type ReportViewMode = 'TABLE' | 'DRAFT' | 'PRINT';

export const PmReportModal: React.FC<PmReportModalProps> = ({
  isOpen,
  onClose,
  drainageReportItems
}) => {
  const [copiedReport, setCopiedReport] = useState(false);
  const [copiedMailSubject, setCopiedMailSubject] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateType>('PM');
  const [viewMode, setViewMode] = useState<ReportViewMode>('TABLE');
  const [selectedProvider, setSelectedProvider] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'CANJE_ONLY' | 'MERMA_ONLY'>('ALL');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedItemIndices, setSelectedItemIndices] = useState<Record<number, boolean>>({});
  
  // Custom draft fields
  const [customNote, setCustomNote] = useState<string>('');
  const [issuerName, setIssuerName] = useState<string>('Jefatura de Operaciones / Bodega');
  const [transferFolio, setTransferFolio] = useState<string>(() => `TR-${Date.now().toString().slice(-6)}`);
  const [driverName, setDriverName] = useState<string>('');

  // Extract unique providers for filtering
  const availableProviders = useMemo(() => {
    const set = new Set<string>();
    drainageReportItems.forEach(it => {
      const keys = Object.keys(it);
      const provCol = findColumnBySemantic(keys, 'proveedor') || 'PROVEEDOR';
      const val = it[provCol] || it['PROVEEDOR'] || it['RUT'] || it['LABORATORIO'];
      if (val && String(val).trim()) {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort();
  }, [drainageReportItems]);

  // Filter items by provider, search term, and severity
  const filteredItems = useMemo(() => {
    return drainageReportItems.filter((it, originalIdx) => {
      const keys = Object.keys(it);
      
      // Provider filter
      if (selectedProvider !== 'ALL') {
        const provCol = findColumnBySemantic(keys, 'proveedor') || 'PROVEEDOR';
        const val = it[provCol] || it['PROVEEDOR'] || it['RUT'] || it['LABORATORIO'];
        if (String(val || '').trim() !== String(selectedProvider || '').trim()) {
          return false;
        }
      }

      // Severity / Policy filter
      if (severityFilter !== 'ALL') {
        const st = getItemStatus(it, keys);
        if (severityFilter === 'CRITICAL') {
          if (st.code !== 'EXPIRED' && st.code !== 'RETIRE_NOW' && (st.daysToRetire === null || st.daysToRetire > 7)) {
            return false;
          }
        } else if (severityFilter === 'CANJE_ONLY') {
          if (st.actionType !== 'CANJE_PROVEEDOR') return false;
        } else if (severityFilter === 'MERMA_ONLY') {
          if (st.actionType !== 'MERMA_DIRECTA') return false;
        }
      }

      // Search filter
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const skuCol = findColumnBySemantic(keys, 'sku');
        const descCol = findColumnBySemantic(keys, 'descripcion');
        const loteCol = findColumnBySemantic(keys, 'lote');
        const sku = String((skuCol && it[skuCol]) || it['SKU'] || '').toLowerCase();
        const desc = String((descCol && it[descCol]) || '').toLowerCase();
        const lote = String((loteCol && it[loteCol]) || it['LOTE'] || '').toLowerCase();
        if (!sku.includes(q) && !desc.includes(q) && !lote.includes(q)) {
          return false;
        }
      }

      // Individual selection (if explicit selection map is active)
      if (Object.keys(selectedItemIndices).length > 0 && selectedItemIndices[originalIdx] === false) {
        return false;
      }

      return true;
    });
  }, [drainageReportItems, selectedProvider, severityFilter, searchFilter, selectedItemIndices]);

  // Calculate high-level metrics for badges
  const reportMetrics = useMemo(() => {
    let totalUnits = 0;
    let criticalCount = 0;
    let canjeCount = 0;
    let mermaCount = 0;

    filteredItems.forEach(it => {
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
  }, [filteredItems]);

  if (!isOpen) return null;

  const selectAllFiltered = () => {
    setSelectedItemIndices({});
  };

  // Build formatted subject & body according to selected template
  const getReportData = () => {
    const todayStr = new Date().toLocaleDateString('es-CL', { 
      day: '2-digit', month: '2-digit', year: 'numeric' 
    });

    let subject = '';
    const lines: string[] = [];

    switch (selectedTemplate) {
      case 'PROVIDER_CANJE': {
        const provLabel = selectedProvider !== 'ALL' ? selectedProvider : 'PROVEEDOR / LABORATORIO';
        subject = `[SOLICITUD CANJE] Retiro de Vencimientos Próximos - ${provLabel} (${todayStr})`;
        lines.push(`📦 *SOLICITUD FORMAL DE RETIRO Y CANJE POR VENCIMIENTO PRÓXIMO*`);
        lines.push(`🏢 *Destinatario:* ${provLabel}`);
        lines.push(`📅 *Fecha de Emisión:* ${todayStr}`);
        lines.push(`📊 *Total Ítems:* ${filteredItems.length} SKUs (${reportMetrics.totalUnits} un.)`);
        lines.push(`👤 *Emisor:* ${issuerName}`);
        lines.push(`------------------------------------------------------------`);
        lines.push(`Estimado Proveedor / Laboratorio:`);
        lines.push(`Presentamos el listado de productos en custodia que se encuentran dentro de la ventana contractual de retiro preventivo acordada. Solicitamos coordinar fecha de retiro físico y emisión de Nota de Crédito o Reposición:`);
        lines.push(``);

        filteredItems.forEach((it, idx) => {
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
        lines.push(`📊 *Total Bultos / Unidades:* ${reportMetrics.totalUnits} un. en ${filteredItems.length} líneas`);
        lines.push(`------------------------------------------------------------`);
        lines.push(`Detalle de mercadería segregada por vencimiento / canje para consolidación en matriz:`);
        lines.push(``);

        filteredItems.forEach((it, idx) => {
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

        filteredItems.forEach((it) => {
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

        filteredItems.forEach((it, idx) => {
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
        lines.push(`• Total SKUs en riesgo: ${filteredItems.length} líneas`);
        lines.push(`• Total unidades físicas: ${reportMetrics.totalUnits} unidades`);
        lines.push(`• En riesgo crítico / inmediato: ${reportMetrics.criticalCount} SKUs`);
        lines.push(`• Con política de Canje a Proveedor: ${reportMetrics.canjeCount} SKUs`);
        lines.push(`• Merma Directa (Sin Canje): ${reportMetrics.mermaCount} SKUs`);
        lines.push(`------------------------------------------------------------`);
        lines.push(`Detalle de los principales ítems:`);
        lines.push(``);

        filteredItems.slice(0, 20).forEach((it, idx) => {
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

        if (filteredItems.length > 20) {
          lines.push(`... y ${filteredItems.length - 20} ítems adicionales.`);
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
        lines.push(`📊 *Total SKUs en Ventana de Retiro:* ${filteredItems.length} (${reportMetrics.totalUnits} un.)`);
        lines.push(`🏢 *Filtro Proveedor:* ${selectedProvider !== 'ALL' ? selectedProvider : 'Todos los proveedores'}`);
        lines.push(`👤 *Emisor:* ${issuerName}`);
        lines.push(`------------------------------------------------------------`);
        lines.push(`Se solicita evaluar liquidación comercial prioritaria, rebaja de margen o activación de canje con proveedor para los siguientes productos:`);
        lines.push(``);

        filteredItems.forEach((it, idx) => {
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
          lines.push(`📝 *Nota para Jefatura Comercial:* ${customNote.trim()}`);
        }
        lines.push(``);
        lines.push(`------------------------------------------------------------`);
        lines.push(`*Acción Requerida:* Definir estrategia comercial antes del cumplimiento del plazo fatal de retiro preventivo.`);
        break;
      }
    }

    return { subject, text: lines.join('\n') };
  };

  const copyReportToClipboard = () => {
    const { text } = getReportData();
    copyTextToClipboard(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 3000);
  };

  const copySubjectToClipboard = () => {
    const { subject } = getReportData();
    copyTextToClipboard(subject);
    setCopiedMailSubject(true);
    setTimeout(() => setCopiedMailSubject(false), 3000);
  };

  const handleShareWhatsApp = () => {
    const { text } = getReportData();
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  const handleSendMailto = () => {
    const { subject, text } = getReportData();
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(text);
    window.open(`mailto:?subject=${encodedSubject}&body=${encodedBody}`, '_blank');
  };

  const handlePrintDocument = () => {
    window.print();
  };

  const handleExportExcel = () => {
    if (filteredItems.length === 0) return;
    const sampleKeys = Object.keys(filteredItems[0]);
    const headers = [
      findColumnBySemantic(sampleKeys, 'sku') || 'SKU',
      findColumnBySemantic(sampleKeys, 'descripcion') || 'DESCRIPCION',
      findColumnBySemantic(sampleKeys, 'fecha_vc') || 'FECHA_VC',
      findColumnBySemantic(sampleKeys, 'fecha_retiro') || 'FECHA_RETIRO',
      findColumnBySemantic(sampleKeys, 'cantidad') || 'CANTIDAD',
      findColumnBySemantic(sampleKeys, 'lote') || 'LOTE',
      findColumnBySemantic(sampleKeys, 'proveedor') || 'PROVEEDOR'
    ].filter(Boolean);

    const todayStr = new Date().toISOString().slice(0, 10);
    const prefix = selectedTemplate === 'PROVIDER_CANJE' 
      ? 'Canje_Proveedor' 
      : selectedTemplate === 'LOGISTICS_TRANSFER'
      ? 'Acta_Traspaso'
      : selectedTemplate === 'QUALITY_RECALL'
      ? 'Bloqueo_Calidad'
      : selectedTemplate === 'STORE_ADMIN' 
      ? 'Control_Sala' 
      : 'Drenaje_PM';

    exportToExcel(`Reporte_${prefix}_${todayStr}.xlsx`, headers, filteredItems, 'Reporte_Operativo');
  };

  const currentReportData = getReportData();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150 print:border-none print:shadow-none print:max-h-none print:h-auto">
        
        {/* ======================================================== */}
        {/* HEADER BAR                                               */}
        {/* ======================================================== */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-orange-500 to-amber-600 text-white rounded-xl shadow-md shadow-orange-500/20">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm md:text-base">
                  Centro de Reportes y Comunicaciones Operativas
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 text-[10px] font-extrabold font-mono">
                  {filteredItems.length} SKUs ({reportMetrics.totalUnits} un.)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Generador inteligente de actas, solicitudes de canje, pautas de sala y alertas comerciales.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'TABLE'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Tabla</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('DRAFT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'DRAFT'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Redactor</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('PRINT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'PRINT'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Acta Física</span>
              </button>
            </div>

            <button 
              onClick={onClose} 
              className="text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-xl transition-colors cursor-pointer"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* TEMPLATE CAROUSEL & QUICK FILTER BAR                      */}
        {/* ======================================================== */}
        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-2 shrink-0 print:hidden">
          {/* Template pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedTemplate('PM')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedTemplate === 'PM'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Alerta Comercial PM</span>
            </button>

            <button
              onClick={() => setSelectedTemplate('PROVIDER_CANJE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedTemplate === 'PROVIDER_CANJE'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Canje Proveedor</span>
            </button>

            <button
              onClick={() => setSelectedTemplate('STORE_ADMIN')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedTemplate === 'STORE_ADMIN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Control Sala / Góndola</span>
            </button>

            <button
              onClick={() => setSelectedTemplate('LOGISTICS_TRANSFER')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedTemplate === 'LOGISTICS_TRANSFER'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Acta de Traspaso</span>
            </button>

            <button
              onClick={() => setSelectedTemplate('QUALITY_RECALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedTemplate === 'QUALITY_RECALL'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Bloqueo / Cuarentena</span>
            </button>

            <button
              onClick={() => setSelectedTemplate('EXECUTIVE_SUMMARY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedTemplate === 'EXECUTIVE_SUMMARY'
                  ? 'bg-slate-800 text-white shadow-xs dark:bg-slate-200 dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Resumen Ejecutivo</span>
            </button>
          </div>

          {/* Secondary Filter & Search Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              {/* Search box */}
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  placeholder="Buscar SKU, descripción o lote..."
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Provider select */}
              {availableProviders.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedProvider}
                    onChange={e => setSelectedProvider(e.target.value)}
                    className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500 max-w-[200px] truncate"
                  >
                    <option value="ALL">Todos los Proveedores ({availableProviders.length})</option>
                    {availableProviders.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Severity / Policy Filter */}
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value as any)}
                className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="ALL">Todos los Estados</option>
                <option value="CRITICAL">Solo Críticos / Vencidos (&le; 7d)</option>
                <option value="CANJE_ONLY">Solo con Canje Proveedor</option>
                <option value="MERMA_ONLY">Solo Merma Directa</option>
              </select>
            </div>

            {/* Quick Summary Pill Counters */}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Críticos: <strong className="text-rose-600 dark:text-rose-400">{reportMetrics.criticalCount}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                Canjes: <strong className="text-indigo-600">{reportMetrics.canjeCount}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                Mermas: <strong className="text-rose-600">{reportMetrics.mermaCount}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MAIN BODY VIEW CONTAINER                                 */}
        {/* ======================================================== */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-slate-50/50 dark:bg-slate-950/30 print:p-0 print:bg-white">
          
          {/* -------------------------------------------------------- */}
          {/* VIEW 1: INTERACTIVE TABLE MODE                          */}
          {/* -------------------------------------------------------- */}
          {viewMode === 'TABLE' && (
            filteredItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">¡Sin registros para el filtro seleccionado!</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
                  No hay productos que coincidan con el proveedor, severidad o búsqueda indicada.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProvider('ALL');
                    setSeverityFilter('ALL');
                    setSearchFilter('');
                    selectAllFiltered();
                  }}
                  className="mt-4 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Restablecer Filtros
                </button>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 select-none">
                    <tr>
                      <th className="p-3 w-10 text-center">#</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Producto / Descripción</th>
                      <th className="p-3 text-right">Cant.</th>
                      <th className="p-3">Vencimiento</th>
                      <th className="p-3">Límite Retiro</th>
                      <th className="p-3 text-center">Días Rest.</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Acción Sugerida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredItems.map((it, idx) => {
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
                      const rawQty = (qtyCol && it[qtyCol]) || it['CANTIDAD'] || '1';
                      const qty = formatLocaleNumber(parseLocaleNumber(rawQty) || 1);

                      return (
                        <tr 
                          key={idx} 
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                        >
                          <td className="p-3 text-center font-mono text-[11px] text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                            {sku}
                          </td>
                          <td className="p-3 font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">
                            {desc}
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {qty} un.
                          </td>
                          <td className="p-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {fVc}
                          </td>
                          <td className="p-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {fRet}
                          </td>
                          <td className="p-3 text-center font-mono font-extrabold whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[11px] ${
                              st.daysToRetire !== null && st.daysToRetire <= 0
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : st.daysToRetire !== null && st.daysToRetire <= 7
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {st.daysToRetire !== null ? `${st.daysToRetire}d` : '-'}
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${st.color}`}>
                              {st.icon}
                              <span>{st.label}</span>
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${st.actionColor}`}>
                              {st.actionIcon}
                              <span>{st.actionLabel}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* -------------------------------------------------------- */}
          {/* VIEW 2: LIVE DRAFT & REDACTOR MODE                       */}
          {/* -------------------------------------------------------- */}
          {viewMode === 'DRAFT' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Form customizer */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-orange-500" />
                    <span>Personalizar Contenido del Reporte</span>
                  </h4>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Emisor / Responsable:
                    </label>
                    <input
                      type="text"
                      value={issuerName}
                      onChange={e => setIssuerName(e.target.value)}
                      placeholder="Ej. Jefatura de Bodega Central"
                      className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-orange-500"
                    />
                  </div>

                  {selectedTemplate === 'LOGISTICS_TRANSFER' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Folio de Traspaso / Documento:
                        </label>
                        <input
                          type="text"
                          value={transferFolio}
                          onChange={e => setTransferFolio(e.target.value)}
                          placeholder="TR-123456"
                          className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 font-mono focus:ring-1 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Chofer / Empresa de Transporte:
                        </label>
                        <input
                          type="text"
                          value={driverName}
                          onChange={e => setDriverName(e.target.value)}
                          placeholder="Nombre transportista / Patente"
                          className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-orange-500"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Observaciones / Instrucciones Específicas:
                    </label>
                    <textarea
                      rows={4}
                      value={customNote}
                      onChange={e => setCustomNote(e.target.value)}
                      placeholder="Agrega comentarios del turno, acuerdos verbales, estado de cajas o detalles de la solicitud..."
                      className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-orange-500 resize-none"
                    />
                  </div>
                </div>

                {/* Subject Box with Copy */}
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Asunto / Título:</span>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{currentReportData.subject}</p>
                  </div>
                  <button
                    type="button"
                    onClick={copySubjectToClipboard}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                    title="Copiar solo el asunto"
                  >
                    {copiedMailSubject ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedMailSubject ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Textarea preview */}
              <div className="lg:col-span-7 flex flex-col">
                <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 flex flex-col flex-1 shadow-lg border border-slate-800 min-h-[360px]">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs">
                    <span className="font-mono text-slate-400">Previsualización de Mensaje ({currentReportData.text.length} caracteres)</span>
                    <button
                      type="button"
                      onClick={copyReportToClipboard}
                      className="px-2.5 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copiedReport ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedReport ? '¡Copiado!' : 'Copiar Texto'}</span>
                    </button>
                  </div>
                  <pre className="font-mono text-[11px] text-slate-300 whitespace-pre-wrap overflow-y-auto max-h-[420px] flex-1 leading-relaxed select-all">
                    {currentReportData.text}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------- */}
          {/* VIEW 3: PRINT / FORMAL PHYSICAL REPORT MODE             */}
          {/* -------------------------------------------------------- */}
          {viewMode === 'PRINT' && (
            <div className="bg-white text-slate-900 p-8 rounded-2xl border border-slate-200 shadow-sm max-w-4xl mx-auto print:border-none print:shadow-none print:p-0">
              
              {/* Document Header */}
              <div className="border-b-2 border-slate-900 pb-4 mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                    {selectedTemplate === 'PROVIDER_CANJE' 
                      ? 'Acta Formal de Solicitud de Canje y Retiro' 
                      : selectedTemplate === 'LOGISTICS_TRANSFER'
                      ? 'Acta de Traspaso y Custodia de Mercadería'
                      : selectedTemplate === 'QUALITY_RECALL'
                      ? 'Acta de Retención Preventiva y Cuarentena'
                      : selectedTemplate === 'STORE_ADMIN'
                      ? 'Pauta de Auditoría y Control de Sala'
                      : 'Reporte Gerencial de Vencimientos y Mermas'}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    Gestor de Vencimientos e Incidencias &bull; Departamento de Control de Existencias
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold bg-slate-100 px-2.5 py-1 rounded border border-slate-300">
                    FOLIO: {transferFolio}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Fecha: {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-3 gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Emisor / Responsable:</span>
                  <span className="font-bold text-slate-900">{issuerName}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Proveedor / Destinatario:</span>
                  <span className="font-bold text-slate-900">{selectedProvider !== 'ALL' ? selectedProvider : 'General / Todos'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Total Mercadería:</span>
                  <span className="font-bold text-slate-900">{filteredItems.length} SKUs &bull; {reportMetrics.totalUnits} Unidades</span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left text-xs border-collapse border border-slate-300 mb-6">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300 text-center w-8">#</th>
                    <th className="p-2 border-r border-slate-300 w-24">SKU</th>
                    <th className="p-2 border-r border-slate-300">Descripción de Producto</th>
                    <th className="p-2 border-r border-slate-300 text-center w-20">Lote/CU</th>
                    <th className="p-2 border-r border-slate-300 text-right w-16">Cant.</th>
                    <th className="p-2 border-r border-slate-300 text-center w-24">F. Vence</th>
                    <th className="p-2 text-center w-24">F. Retiro</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it, idx) => {
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
                    const lote = (loteCol && it[loteCol]) || it['LOTE'] || '-';
                    const qty = (qtyCol && it[qtyCol]) || it['CANTIDAD'] || '1';

                    return (
                      <tr key={idx} className="border-b border-slate-200 text-[11px]">
                        <td className="p-2 border-r border-slate-200 text-center font-mono">{idx + 1}</td>
                        <td className="p-2 border-r border-slate-200 font-mono font-bold">{sku}</td>
                        <td className="p-2 border-r border-slate-200 font-medium">{desc}</td>
                        <td className="p-2 border-r border-slate-200 text-center font-mono">{lote}</td>
                        <td className="p-2 border-r border-slate-200 text-right font-mono font-bold">{qty}</td>
                        <td className="p-2 border-r border-slate-200 text-center">{fVc}</td>
                        <td className="p-2 text-center">{fRet}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Custom Note in Print */}
              {customNote.trim() && (
                <div className="mb-8 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <span className="font-bold text-slate-700 block mb-0.5">Observaciones adicionales:</span>
                  <p className="text-slate-600">{customNote.trim()}</p>
                </div>
              )}

              {/* Formal Signature Blocks */}
              <div className="grid grid-cols-3 gap-8 pt-10 mt-6 border-t border-slate-300 text-center text-xs">
                <div className="flex flex-col items-center">
                  <div className="w-full border-b border-slate-400 mb-2 h-12" />
                  <span className="font-bold text-slate-800">Entregado Por</span>
                  <span className="text-[10px] text-slate-500">Bodega / Operaciones</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-full border-b border-slate-400 mb-2 h-12" />
                  <span className="font-bold text-slate-800">Recibido Conforme</span>
                  <span className="text-[10px] text-slate-500">Transportista / Proveedor</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-full border-b border-slate-400 mb-2 h-12" />
                  <span className="font-bold text-slate-800">V°B° Administración</span>
                  <span className="text-[10px] text-slate-500">Jefe de Local / Auditoría</span>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* ======================================================== */}
        {/* FOOTER MULTI-CHANNEL ACTIONS BAR                         */}
        {/* ======================================================== */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-wrap items-center justify-between gap-2.5 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Destino: <strong className="text-slate-800 dark:text-slate-200 font-bold">{
                selectedTemplate === 'PROVIDER_CANJE' ? 'Proveedor' :
                selectedTemplate === 'LOGISTICS_TRANSFER' ? 'Bodega Central' :
                selectedTemplate === 'QUALITY_RECALL' ? 'Calidad / Cuarentena' :
                selectedTemplate === 'STORE_ADMIN' ? 'Equipo de Sala' : 'Product Manager'
              }</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={handlePrintDocument}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs shadow-emerald-600/20 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={handleSendMailto}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs shadow-blue-600/20 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs shadow-green-600/20 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={copyReportToClipboard}
              disabled={filteredItems.length === 0}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs shadow-orange-600/25 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {copiedReport ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedReport ? '¡Texto Copiado!' : 'Copiar Reporte'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
