import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ColumnSchema, SheetRecord } from '../../../types';
import { MasterProductSummary, findMasterProduct, searchMasterProducts } from '../../../utils/referenceResolver';
import { QUICK_QUANTITY_PRESETS, getOperationalSuggestions } from '../../../utils/dynamicFormRules';
import { formatInputDate, formatInputDateTime } from '../../../utils/dateCalculations';
import { findColumnBySemantic } from '../../../utils/columnAliases';
import { AlertCircle, Search, CheckCircle2, Package, ClipboardPaste, X } from 'lucide-react';

interface ItemFormFieldInputProps {
  header: string;
  colSchema?: ColumnSchema;
  isKey?: boolean;
  canExpire: boolean;
  formData: Record<string, string>;
  formErrors: Record<string, string>;
  masterSummaries: MasterProductSummary[];
  selectedEventCategory: string;
  resolvedRetiroDisplay?: string;
  policySuggestions?: string[];
  providerSuggestions?: string[];
  products?: SheetRecord[];
  customAliases?: Record<string, string[]>;
  onSelectMasterProduct?: (selected: MasterProductSummary) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onApplySuggestion: (header: string, suggestion: string) => void;
  onAdjustQuantity: (header: string, delta: number) => void;
  onGenerateTraspaso: (header: string) => void;
  onClearTraspaso: (header: string) => void;
}

export const ItemFormFieldInput: React.FC<ItemFormFieldInputProps> = ({
  header,
  colSchema,
  isKey,
  canExpire,
  formData,
  formErrors,
  masterSummaries,
  selectedEventCategory,
  resolvedRetiroDisplay,
  policySuggestions = [],
  providerSuggestions = [],
  products = [],
  customAliases,
  onSelectMasterProduct,
  onChange,
  onApplySuggestion,
  onAdjustQuantity,
  onGenerateTraspaso,
  onClearTraspaso
}) => {
  const hasFormula = Boolean(colSchema?.formula && colSchema.formula.trim());
  const isEditableLocked = colSchema?.editable === false;
  const isAutoCalc = hasFormula ||
                     isEditableLocked ||
                     Boolean(colSchema?.isVirtual) ||
                     (colSchema?.behavior === 'calc_fecha_vc' && canExpire) || 
                     (colSchema?.behavior === 'calc_retiro' && canExpire) || 
                     colSchema?.behavior === 'auto_id' || 
                     colSchema?.type === 'calculated' || 
                     /^ID_VC$/i.test(String(header).trim()) ||
                     /^ID_FRC$/i.test(String(header).trim()) ||
                     /^CU_VC$/i.test(String(header).trim()) ||
                     /^CU$/i.test(String(header).trim()) ||
                     /^CODIGO_UNICO$/i.test(String(header).trim()) ||
                     /FECHA_RETIRO_CALC/i.test(String(header).trim());

  // Semantic Detections
  const isSkuField = Boolean(findColumnBySemantic([header], 'sku', customAliases)) || 
                     /^(frc_)?sku$|código|codigo|cod_prod/i.test(header);

  const isDescField = Boolean(findColumnBySemantic([header], 'descripcion', customAliases)) || 
                      /^(frc_)?desc|descripci[oó]n|producto|art[ií]culo|nombre/i.test(header);

  const isObs = /observ|nota|motivo|detalle|coment|causa/i.test(header);
  const isCant = /^cant|unidades|stock/i.test(header);
  
  const isDaysColumn = /dias|días|days|anticipacion|anticipaci[oó]n|cant|stock|unidades|num/i.test(header) || 
                       /^retiro$/i.test(String(header).trim());

  const isDateCol = (colSchema?.type === 'date' && !isDaysColumn) || 
                    (/fecha|vencimiento|vence|retiro/i.test(header) && 
                     !/time/i.test(header) && 
                     !isDaysColumn);
  const isDateTimeCol = colSchema?.type === 'datetime' || /timestamp|created_at/i.test(header);
  const isTraspasoCol = /traspaso/i.test(header);
  const traspasoVal = String(formData[header] || '').trim();
  const isTraspasoFilled = traspasoVal !== '' && traspasoVal !== '-' && traspasoVal !== '0';

  const isPolicyCol = /pol[ií]tica|politica|regla/i.test(header);
  const isProviderCol = /proveedor|lab|fabricante/i.test(header);
  
  const hasError = !!formErrors[header];
  const errorMsg = formErrors[header];

  // Description Search State
  const [descSearchOpen, setDescSearchOpen] = useState(false);
  const descContainerRef = useRef<HTMLDivElement>(null);
  const currentValue = formData[header] !== undefined ? formData[header] : '';

  // Close description dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (descContainerRef.current && !descContainerRef.current.contains(e.target as Node)) {
        setDescSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Description search results from Master Catalog
  const descSearchResults = useMemo(() => {
    if (!isDescField || !descSearchOpen || !currentValue || currentValue.trim().length < 2 || products.length === 0) {
      return [];
    }
    return searchMasterProducts(currentValue, products, 6, customAliases);
  }, [isDescField, descSearchOpen, currentValue, products, customAliases]);

  // SKU Verification with Master Catalog
  const matchedSkuProduct = useMemo(() => {
    if (!isSkuField || !currentValue || currentValue.trim().length < 2 || products.length === 0) {
      return null;
    }
    return findMasterProduct(currentValue.trim(), products, customAliases);
  }, [isSkuField, currentValue, products, customAliases]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { value } = e.target;
    if (isCant && !isNaN(Number(value)) && Number(value) < 0) {
        return;
    }
    onChange(e);

    // If typing in Description, open dropdown
    if (isDescField) {
      if (value && value.trim().length >= 2) {
        setDescSearchOpen(true);
      } else {
        setDescSearchOpen(false);
      }
    }
  };

  const handlePasteSku = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          onChange({
            target: { name: header, value: text.trim() }
          } as React.ChangeEvent<HTMLInputElement>);

          // Auto dereference if matching SKU
          if (products.length > 0 && onSelectMasterProduct) {
            const prod = findMasterProduct(text.trim(), products, customAliases);
            if (prod) {
              const summary: MasterProductSummary = {
                sku: text.trim(),
                name: String(prod.DESCRIPCION || prod.PRODUCTO || prod.NOMBRE || prod.A || '').trim(),
                provider: String(prod.PROVEEDOR || prod.LABORATORIO || prod.B || '').trim(),
                category: String(prod.CATEGORIA || prod.FAMILIA || '').trim(),
                raw: prod
              };
              onSelectMasterProduct(summary);
            }
          }
        }
      }
    } catch {
      // Clipboard access denied or unsupported; user can still paste via standard Ctrl+V
    }
  };

  const handleSelectDescSuggestion = (summary: MasterProductSummary) => {
    setDescSearchOpen(false);
    if (onSelectMasterProduct) {
      onSelectMasterProduct(summary);
    } else {
      onChange({
        target: { name: header, value: summary.name || summary.sku }
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  return (
    <div 
      ref={isDescField ? descContainerRef : undefined}
      className={`flex flex-col gap-1.5 relative ${
        isObs ? 'sm:col-span-2' : ''
      } ${isTraspasoCol ? 'sm:col-span-2 bg-slate-50/80 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700' : ''}`}
    >
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
          <span>{colSchema?.label || header}</span>
          {colSchema?.label && colSchema.label !== header && (
            <span className="text-[10px] text-slate-400 font-mono font-normal">({header})</span>
          )}
          {(colSchema?.required || isKey) && (
            <span className="text-rose-500 font-bold" title="Campo obligatorio">*</span>
          )}
          {isKey && (
            <span className="text-[9px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-1 py-0.2 rounded font-mono font-bold">
              KEY
            </span>
          )}
          {hasFormula && (
            <span 
              className="text-[9px] bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-1.5 py-0.2 rounded font-mono font-bold flex items-center gap-1"
              title={`Fórmula AppSheet: =${colSchema?.formula}`}
            >
              ✨ App Formula
            </span>
          )}
          {colSchema?.isVirtual && (
            <span 
              className="text-[9px] bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-1.5 py-0.2 rounded font-mono font-bold flex items-center gap-1"
              title="Columna Virtual Calculada (AppSheet)"
            >
              ⚡ Virtual
            </span>
          )}
          {!hasFormula && isAutoCalc && (
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded font-mono font-bold">
              {isEditableLocked ? '🔒 Bloqueado' : 'auto'}
            </span>
          )}
          {colSchema?.scannable && (
            <span 
              className="text-[9px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 rounded font-mono font-semibold"
              title="Campo habilitado para escaneo con pistola / cámara"
            >
              📷 SCAN
            </span>
          )}
        </label>

        {/* Traspaso status badge */}
        {isTraspasoCol && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            isTraspasoFilled 
              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' 
              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
          }`}>
            {isTraspasoFilled ? '✅ Estado: Realizado' : '⏳ Estado: Pendiente'}
          </span>
        )}
      </div>

      {/* Input Element */}
      {isSkuField ? (
        /* ========================================================================= */
        /* SKU INPUT: Pure Text Input with Full Paste/Type & Catalog Verification   */
        /* ========================================================================= */
        <div className="space-y-1">
          <div className="relative flex items-center">
            <input
              type="text"
              name={header}
              value={currentValue}
              onChange={handleChange}
              placeholder={`Ingresar o pegar ${header}...`}
              className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl pl-3.5 pr-16 py-2 text-sm font-mono font-bold text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none transition-all ${
                hasError 
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                  : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
              }`}
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              {currentValue ? (
                <button
                  type="button"
                  onClick={() => onChange({ target: { name: header, value: '' } } as React.ChangeEvent<HTMLInputElement>)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Limpiar código"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePasteSku}
                  className="px-2 py-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-bold rounded-lg flex items-center gap-1 transition-colors"
                  title="Pegar código desde portapapeles"
                >
                  <ClipboardPaste className="w-3 h-3" />
                  <span>Pegar</span>
                </button>
              )}
            </div>
          </div>

          {/* Real-time Catalog Feedback for SKU */}
          {matchedSkuProduct ? (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 px-1 py-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {String(matchedSkuProduct.DESCRIPCION || matchedSkuProduct.PRODUCTO || matchedSkuProduct.NOMBRE || matchedSkuProduct.A || 'Producto Catálogo')}
                {matchedSkuProduct.PROVEEDOR ? ` · ${matchedSkuProduct.PROVEEDOR}` : ''}
              </span>
            </div>
          ) : currentValue && currentValue.trim().length >= 2 ? (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 px-1 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>Código libre (no registrado en Catálogo Maestro)</span>
            </div>
          ) : null}
        </div>
      ) : isDescField ? (
        /* ========================================================================= */
        /* DESCRIPTION INPUT: Interactive Typeahead Search with Master Catalog       */
        /* ========================================================================= */
        <div className="relative space-y-1">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              name={header}
              value={currentValue}
              onChange={handleChange}
              onFocus={() => {
                if (currentValue && currentValue.trim().length >= 2) {
                  setDescSearchOpen(true);
                }
              }}
              placeholder="Buscar producto por nombre o escribir descripción..."
              className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl pl-9 pr-8 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none transition-all ${
                hasError 
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                  : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
              }`}
            />
            {currentValue && (
              <button
                type="button"
                onClick={() => {
                  onChange({ target: { name: header, value: '' } } as React.ChangeEvent<HTMLInputElement>);
                  setDescSearchOpen(false);
                }}
                className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {descSearchOpen && descSearchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/60 max-h-56 overflow-y-auto animate-in fade-in-50 zoom-in-95 duration-100">
              <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/60 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Coincidencias en Catálogo Maestro</span>
                <span className="font-normal">{descSearchResults.length} sugerencias</span>
              </div>
              {descSearchResults.map((prod) => (
                <button
                  key={prod.sku}
                  type="button"
                  onClick={() => handleSelectDescSuggestion(prod)}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                      {prod.name || 'Sin descripción'}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-2">
                      <span className="font-mono text-slate-600 dark:text-slate-300 font-semibold">{prod.sku}</span>
                      {prod.provider && <span>· {prod.provider}</span>}
                      {prod.category && <span>· {prod.category}</span>}
                    </div>
                  </div>
                  <Package className="w-4 h-4 text-slate-400 group-hover:text-blue-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : colSchema?.type === 'ref' ? (
        /* Ref type dropdown for generic references */
        <div className="relative">
          <input
            type="text"
            name={header}
            list={`datalist-ref-${header}`}
            value={currentValue}
            onChange={handleChange}
            placeholder={`Seleccionar o escribir de ${colSchema.refTable || 'tabla relacionada'}...`}
            className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none transition-all ${
              hasError 
                ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
            }`}
          />
          <datalist id={`datalist-ref-${header}`}>
            {masterSummaries.map((summary, idx) => {
              if (!summary.sku) return null;
              return (
                <option key={`ref-${idx}-${summary.sku}`} value={summary.sku}>
                  {summary.name ? `${summary.sku} - ${summary.name}` : summary.sku}
                </option>
              );
            })}
          </datalist>
        </div>
      ) : isObs ? (
        <div className="space-y-2">
          <textarea
            name={header}
            rows={2}
            value={formData[header] || ''}
            onChange={handleChange}
            placeholder={`Detalles de ${header.toLowerCase()}...`}
            className={`w-full app-input px-3.5 py-2 text-sm resize-none ${
              hasError 
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10' 
                : ''
            }`}
          />
          {/* Quick Operational Suggestions (Valid_If) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Sugerencias:
            </span>
            {getOperationalSuggestions(selectedEventCategory as any).map(sugg => (
              <button
                key={sugg}
                type="button"
                onClick={() => onApplySuggestion(header, sugg)}
                className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
              >
                + {sugg}
              </button>
            ))}
          </div>
        </div>
      ) : isTraspasoCol ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              name={header}
              value={formData[header] || ''}
              onChange={onChange}
              placeholder="Ej: TR-84920 (o dejar vacío si está pendiente)"
              className={`flex-1 bg-white dark:bg-slate-900 border rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none transition-all ${
                hasError 
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                  : 'border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
              }`}
            />
            <button
              type="button"
              onClick={() => onGenerateTraspaso(header)}
              className="px-3 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold rounded-xl transition-colors shrink-0"
              title="Generar folio TR aleatorio"
            >
              Generar TR
            </button>
            {isTraspasoFilled && (
              <button
                type="button"
                onClick={() => onClearTraspaso(header)}
                className="px-2.5 py-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold rounded-xl transition-colors shrink-0"
                title="Marcar como pendiente"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      ) : isCant ? (
        <div className="space-y-1.5">
          <input
            type="number"
            name={header}
            min={0}
            step="any"
            value={formData[header] !== undefined ? formData[header] : ''}
            onChange={handleChange}
            placeholder="0"
            className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-slate-800 dark:text-slate-100 outline-none transition-all ${
              hasError 
                ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
            }`}
          />
          {/* Quantity Presets */}
          <div className="flex items-center gap-1">
            {QUICK_QUANTITY_PRESETS.map(delta => (
              <button
                key={delta}
                type="button"
                onClick={() => onAdjustQuantity(header, delta)}
                className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
              >
                +{delta}
              </button>
            ))}
          </div>
        </div>
      ) : isDateCol ? (
        <input
          type="date"
          name={header}
          value={formatInputDate(formData[header])}
          onChange={handleChange}
          className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none transition-all ${
            hasError 
              ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
              : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
          }`}
        />
      ) : isDateTimeCol ? (
        <input
          type="datetime-local"
          name={header}
          value={formatInputDateTime(formData[header])}
          onChange={handleChange}
          className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none transition-all ${
            hasError 
              ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
              : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
          }`}
        />
      ) : isPolicyCol && policySuggestions.length > 0 && !isAutoCalc ? (
        <select
          name={header}
          value={formData[header] || ''}
          onChange={handleChange}
          className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none transition-all ${
            hasError 
              ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
              : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
          }`}
        >
          <option value="">-- Seleccionar Política Comercial --</option>
          {policySuggestions.map((sugg, idx) => (
            <option key={idx} value={sugg}>
              {sugg}
            </option>
          ))}
          {formData[header] && !policySuggestions.includes(formData[header]) && (
            <option value={formData[header]}>
              {formData[header]} (Personalizada)
            </option>
          )}
        </select>
      ) : (
        <>
          <input
            type="text"
            name={header}
            list={isProviderCol && providerSuggestions.length > 0 ? `datalist-provider` : undefined}
            value={formData[header] !== undefined ? formData[header] : (header === 'FECHA_RETIRO_CALC' ? (resolvedRetiroDisplay || '') : '')}
            onChange={handleChange}
            readOnly={isAutoCalc}
            placeholder={isAutoCalc ? 'Calculado automáticamente' : `Ingresar ${header.toLowerCase()}...`}
            className={`w-full border rounded-xl px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none transition-all ${
              isAutoCalc 
                ? 'bg-slate-100/80 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 cursor-not-allowed border-dashed border-slate-300 dark:border-slate-700' 
                : hasError 
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 bg-slate-50 dark:bg-slate-800' 
                  : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-slate-50 dark:bg-slate-800'
            }`}
          />
          {isProviderCol && providerSuggestions.length > 0 && (
            <datalist id="datalist-provider">
              {providerSuggestions.map((sugg, idx) => (
                <option key={idx} value={sugg} />
              ))}
            </datalist>
          )}
        </>
      )}

      {colSchema?.description && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
          {colSchema.description}
        </span>
      )}

      {hasError && (
        <span className="text-[11px] text-rose-500 flex items-center gap-1 mt-0.5">
          <AlertCircle className="w-3 h-3" />
          {errorMsg}
        </span>
      )}
    </div>
  );
};
