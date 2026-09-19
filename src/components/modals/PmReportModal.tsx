import React, { useState, useMemo } from 'react';
import { 
  Flame, X, CheckCircle2, CheckCheck, Copy, Download, 
  Send, Building2, MessageSquare, Briefcase, FileText,
  Filter
} from 'lucide-react';
import { InventoryItem } from '../../types';
import { getItemStatus, formatDisplayDate } from '../../utils/dateCalculations';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { exportToExcel, copyTextToClipboard } from '../../utils/exportUtils';

interface PmReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  drainageReportItems: InventoryItem[];
}

type ReportTemplateType = 'PM' | 'PROVIDER_CANJE' | 'STORE_ADMIN';

export const PmReportModal: React.FC<PmReportModalProps> = ({
  isOpen,
  onClose,
  drainageReportItems
}) => {
  const [copiedReport, setCopiedReport] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateType>('PM');
  const [selectedProvider, setSelectedProvider] = useState<string>('ALL');

  // Extract unique providers for filtering
  const availableProviders = useMemo(() => {
    const set = new Set<string>();
    drainageReportItems.forEach(it => {
      const keys = Object.keys(it);
      const provCol = findColumnBySemantic(keys, 'proveedor') || 'PROVEEDOR' || 'RUT';
      const val = it[provCol] || it['PROVEEDOR'] || it['RUT'] || it['LABORATORIO'];
      if (val && String(val).trim()) {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort();
  }, [drainageReportItems]);

  // Filtered items by selected provider
  const filteredItems = useMemo(() => {
    if (selectedProvider === 'ALL') return drainageReportItems;
    return drainageReportItems.filter(it => {
      const keys = Object.keys(it);
      const provCol = findColumnBySemantic(keys, 'proveedor') || 'PROVEEDOR' || 'RUT';
      const val = it[provCol] || it['PROVEEDOR'] || it['RUT'] || it['LABORATORIO'];
      return String(val || '').trim() === String(selectedProvider || '').trim();
    });
  }, [drainageReportItems, selectedProvider]);

  if (!isOpen) return null;

  // Build formatted text report according to selected operational template
  const generateReportText = () => {
    const todayStr = new Date().toLocaleDateString('es-ES', { 
      day: '2-digit', month: '2-digit', year: 'numeric' 
    });

    if (selectedTemplate === 'PROVIDER_CANJE') {
      const provLabel = selectedProvider !== 'ALL' ? selectedProvider : 'PROVEEDOR';
      const lines = [
        `📦 *SOLICITUD FORMAL DE RETIRO Y CANJE POR VENCIMIENTO PRÓXIMO*`,
        `Destinatario: ${provLabel}`,
        `Fecha de emisión: ${todayStr}`,
        `Total ítems a canjear: ${filteredItems.length}`,
        `------------------------------------------------------------`,
        `Estimado Proveedor / Laboratorio:`,
        `Presentamos el listado de productos en custodia que se encuentran dentro de la ventana de retiro preventivo acordada comercialmente. Solicitamos coordinar fecha de retiro y reposición/nota de crédito:`,
        ``
      ];

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

        lines.push(`${idx + 1}. SKU ${sku} | ${desc}`);
        lines.push(`   Cant: ${qty} un. | Lote/CU: ${lote} | Vence: ${fVc} | Límite Retiro: ${fRet}`);
      });

      lines.push(``);
      lines.push(`------------------------------------------------------------`);
      lines.push(`*Nota:* Agradecemos confirmar retiro a la brevedad para evitar la merma directa del inventario.`);
      return lines.join('\n');
    }

    if (selectedTemplate === 'STORE_ADMIN') {
      const lines = [
        `📋 *INFORME OPERATIVO DE VENCIMIENTOS Y CONTROL DE SALA*`,
        `Fecha: ${todayStr}`,
        `Productos en ventana crítica: ${filteredItems.length}`,
        `Filtro Proveedor: ${selectedProvider !== 'ALL' ? selectedProvider : 'Todos'}`,
        `------------------------------------------------------------`,
        `Instrucción para equipo de sala/bodega:`,
        `Verificar físicamente en góndola/estantería y segregar para devolución o liquidación comercial:`,
        ``
      ];

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

        lines.push(`${idx + 1}. [${sku}] ${desc} (${qty} un.)`);
        lines.push(`   Vence: ${fVc} | Fecha Retiro: ${fRet} | Días rest: ${st.daysToRetire ?? '-'}d | [${st.actionLabel}]`);
      });

      lines.push(``);
      lines.push(`------------------------------------------------------------`);
      lines.push(`Responsable de auditoría: Administrador de Local / Jefe de Turno`);
      return lines.join('\n');
    }

    // Default: PM Drainage Template
    const lines = [
      `🚨 *ALERTA COMERCIAL / SOLICITUD DE DRENAJE PARA PRODUCT MANAGER*`,
      `Fecha: ${todayStr}`,
      `Total productos en ventana de retiro: ${filteredItems.length}`,
      `Filtro: ${selectedProvider !== 'ALL' ? selectedProvider : 'Todos los proveedores'}`,
      `------------------------------------------------------------`
    ];

    filteredItems.forEach((it, idx) => {
      const keys = Object.keys(it);
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
      const st = getItemStatus(it, keys);

      lines.push(`${idx + 1}. [SKU: ${sku}] ${desc} | Stock: ${qty} un. | Vence: ${fVc} | Retiro: ${fRet} | ${st.label} [Acción: ${st.actionLabel}]`);
    });

    lines.push(`------------------------------------------------------------`);
    lines.push(`Acción requerida: Definir liquidación comercial prioritaria o canje con proveedor antes del vencimiento del plazo de retiro.`);

    return lines.join('\n');
  };

  const copyReportToClipboard = () => {
    const text = generateReportText();
    copyTextToClipboard(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 3000);
  };

  const handleShareWhatsApp = () => {
    const text = generateReportText();
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
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
    const prefix = selectedTemplate === 'PROVIDER_CANJE' ? 'Canje_Proveedor' : selectedTemplate === 'STORE_ADMIN' ? 'Control_Sala' : 'Drenaje_PM';
    exportToExcel(`Reporte_${prefix}_${todayStr}.xlsx`, headers, filteredItems, 'Reporte');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500 text-white rounded-xl shadow-md shadow-orange-200 dark:shadow-none">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base md:text-lg">
                Centro de Reportes y Comunicaciones Operativas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Genera solicitudes de canje a proveedor, alertas comerciales para PM y actas de retiro para bodega.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template Selector & Filters Bar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          {/* Template tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => setSelectedTemplate('PM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedTemplate === 'PM'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Alerta PM / Comercial</span>
            </button>
            <button
              onClick={() => setSelectedTemplate('PROVIDER_CANJE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedTemplate === 'PROVIDER_CANJE'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Canje Proveedor</span>
            </button>
            <button
              onClick={() => setSelectedTemplate('STORE_ADMIN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedTemplate === 'STORE_ADMIN'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Control Sala / Bodega</span>
            </button>
          </div>

          {/* Provider Filter */}
          {availableProviders.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Proveedor:</label>
              <select
                value={selectedProvider}
                onChange={e => setSelectedProvider(e.target.value)}
                className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="ALL">Todos los Proveedores ({availableProviders.length})</option>
                {availableProviders.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Content Table */}
        <div className="p-6 overflow-y-auto flex-1">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h4 className="font-bold text-slate-700 dark:text-slate-300">¡Todo en orden!</h4>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {selectedProvider !== 'ALL' 
                  ? `No hay productos críticos para el proveedor ${selectedProvider}.`
                  : 'No hay productos en ventana crítica de retiro actualmente.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Producto / Descripción</th>
                    <th className="p-3">Vencimiento</th>
                    <th className="p-3">Fecha Retiro</th>
                    <th className="p-3">Días Rest.</th>
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

                    const sku = (skuCol && it[skuCol]) || it['SKU'] || '-';
                    const desc = (descCol && it[descCol]) || '-';
                    const fVc = vcCol && it[vcCol] ? formatDisplayDate(it[vcCol]) : '-';
                    const fRet = retCol && it[retCol] ? formatDisplayDate(it[retCol]) : '-';

                    return (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{sku}</td>
                        <td className="p-3 font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">{desc}</td>
                        <td className="p-3 font-medium text-slate-600 dark:text-slate-400">{fVc}</td>
                        <td className="p-3 font-medium text-slate-600 dark:text-slate-400">{fRet}</td>
                        <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">{st.daysToRetire ?? '-'}d</td>
                        <td className="p-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${st.color}`}>
                            {st.icon}
                            <span>{st.label}</span>
                          </span>
                        </td>
                        <td className="p-3">
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
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {filteredItems.length} registros seleccionados ({selectedTemplate === 'PM' ? 'Alerta PM' : selectedTemplate === 'PROVIDER_CANJE' ? 'Canje Proveedor' : 'Control Sala'})
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleExportExcel}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm shadow-emerald-200 dark:shadow-none disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button
              onClick={handleShareWhatsApp}
              disabled={filteredItems.length === 0}
              className="px-3.5 py-2 bg-green-600 text-white font-bold text-xs rounded-xl hover:bg-green-700 flex items-center gap-1.5 shadow-sm shadow-green-200 dark:shadow-none disabled:opacity-50 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
            <button
              onClick={copyReportToClipboard}
              disabled={filteredItems.length === 0}
              className="px-4 py-2 bg-orange-600 text-white font-bold text-xs rounded-xl hover:bg-orange-700 flex items-center gap-1.5 shadow-sm shadow-orange-200 dark:shadow-none disabled:opacity-50 transition-colors"
            >
              {copiedReport ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedReport ? '¡Texto Copiado!' : 'Copiar Reporte'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

