import React, { useState, useMemo } from 'react';
import { X, ReceiptText, CheckCircle2, AlertCircle, ClipboardPaste } from 'lucide-react';
import { parseSalesAdjustmentsText, ParsedSalesAdjustmentResult } from '../../utils/stockCountUtils';
import { formatLocaleNumber } from '../../utils/pureCalculations';

export interface BulkSalesAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (adjustments: Record<string, number>, mode: 'ADD' | 'REPLACE') => void;
  title?: string;
  subtitle?: string;
  sourceContext?: 'CAMPAIGN' | 'SESSION';
}

export const BulkSalesAdjustmentModal: React.FC<BulkSalesAdjustmentModalProps> = ({
  isOpen,
  onClose,
  onApply,
  title = 'Cargar Ventas del Turno (Caja / POS)',
  subtitle = 'Pega el reporte de ventas del turno para descontar automáticamente del teórico esperado en góndola.',
  sourceContext = 'CAMPAIGN'
}) => {
  const [rawText, setRawText] = useState<string>('');
  const [applyMode, setApplyMode] = useState<'ADD' | 'REPLACE'>('ADD');

  // Interpretación en tiempo real del texto ingresado
  const parseResult: ParsedSalesAdjustmentResult = useMemo(() => {
    if (!rawText.trim()) {
      return {
        adjustments: {},
        totalUnits: 0,
        totalSkus: 0,
        unrecognizedLines: 0,
        previewRows: []
      };
    }
    return parseSalesAdjustmentsText(rawText);
  }, [rawText]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) setRawText(text);
      }
    } catch {}
  };

  const handleConfirmApply = () => {
    if (parseResult.totalSkus === 0) return;
    onApply(parseResult.adjustments, applyMode);
    onClose();
    setRawText('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full flex flex-col max-h-[90vh] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4 text-xs">
          
          {/* Formula Helper Card */}
          <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 rounded-xl flex items-start gap-2.5">
            <span className="text-base select-none">📐</span>
            <div className="flex-1">
              <span className="font-bold text-indigo-900 dark:text-indigo-200 block">
                Fórmula Operativa Ponytail:
              </span>
              <p className="text-indigo-800/90 dark:text-indigo-300/90 mt-0.5 leading-relaxed">
                {sourceContext === 'CAMPAIGN' ? (
                  <>
                    <strong>Teórico ERP</strong> - <strong>Venta en Caja</strong> = <strong>Teórico Efectivo</strong>.
                    <br />
                    <em>Ejemplo:</em> Si el sistema dice 10 unidades y se vendieron 2 en turno, se esperan <strong>8 unidades físicas</strong> en góndola.
                  </>
                ) : (
                  <>
                    <strong>Teórico Base</strong> - <strong>Ventas en Turno</strong> = <strong>Teórico Ajustado</strong>.
                    <br />
                    Las unidades vendidas se ingresan como positivos y el sistema descuenta automáticamente la cantidad del stock esperado.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Text Area Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Pega las columnas desde Excel o Reporte de Ventas:
              </label>
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Pegar del Portapapeles</span>
              </button>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Ejemplo copiado de Excel:&#10;780000123456	2&#10;780000987654	5&#10;780000555111	1"
              rows={5}
              className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 resize-y"
              autoFocus
            />
            <span className="text-[10px] text-slate-400">
              Formato admitido: Dos columnas (<strong>SKU</strong> y <strong>Cantidad Vendida</strong>) separadas por tabulación, coma, punto y coma o espacio.
            </span>
          </div>

          {/* Parse Summary Bar */}
          {rawText.trim() && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">SKUs Detectados</span>
                  <span className="text-base font-black text-slate-800 dark:text-slate-100">
                    {parseResult.totalSkus}
                  </span>
                </div>
                <div className="w-px h-6 bg-slate-300 dark:bg-slate-700"></div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Unidades Totales</span>
                  <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
                    {formatLocaleNumber(parseResult.totalUnits)}
                  </span>
                </div>
              </div>

              {parseResult.unrecognizedLines > 0 && (
                <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{parseResult.unrecognizedLines} líneas omitidas (no numéricas)</span>
                </div>
              )}
            </div>
          )}

          {/* Preview Table */}
          {parseResult.previewRows.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Vista previa de ajustes detectados:
              </span>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-32 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 text-[10px] font-bold text-slate-500 uppercase">
                    <tr>
                      <th className="py-1.5 px-3">Código SKU</th>
                      <th className="py-1.5 px-3 text-right">Venta Detectada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {parseResult.previewRows.map((r, i) => (
                      <tr key={r.sku + i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-1 px-3 text-slate-800 dark:text-slate-200 font-bold">{r.sku}</td>
                        <td className="py-1 px-3 text-right text-indigo-600 dark:text-indigo-400 font-bold">
                          +{formatLocaleNumber(r.qty)} u.
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Application Mode Radio */}
          <div className="flex items-center gap-4 pt-1">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Modo de aplicación:</span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="applyMode"
                value="ADD"
                checked={applyMode === 'ADD'}
                onChange={() => setApplyMode('ADD')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Sumar a ventas ya registradas</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="applyMode"
                value="REPLACE"
                checked={applyMode === 'REPLACE'}
                onChange={() => setApplyMode('REPLACE')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Reemplazar ventas anteriores</span>
            </label>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmApply}
            disabled={parseResult.totalSkus === 0}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Aplicar Ventas ({parseResult.totalSkus} SKUs)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
