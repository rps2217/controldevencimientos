import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, Sparkles, CheckCircle2, AlertTriangle, Flame, ShieldAlert,
  ArrowRight, Plus, Minus, Tag
} from 'lucide-react';
import { parseAnyDate, formatDisplayDate, formatInputDate, getEndOfMonthDateForYm } from '../../../utils/dateCalculations';
import { ResolvedItemPolicyInfo } from '../../../utils/referenceResolver';
import { extractCuVcFromRow } from '../../../utils/cuVcConsolidator';
import { SheetRecord } from '../../../types';

interface SmartExpirationInputProps {
  header: string;
  value: string;
  formData: Record<string, string>;
  headers: string[];
  resolvedPolicyInfo?: ResolvedItemPolicyInfo;
  disabled?: boolean;
  hasError?: boolean;
  customAliases?: Record<string, string[]>;
  onChangeValue: (fieldName: string, newValue: string) => void;
  onBatchUpdate?: (updates: Record<string, string>) => void;
}

export const SmartExpirationInput: React.FC<SmartExpirationInputProps> = ({
  header,
  value,
  formData,
  headers,
  resolvedPolicyInfo,
  disabled = false,
  hasError = false,
  customAliases,
  onChangeValue,
  onBatchUpdate
}) => {
  // Mode: 'month_year' (default, standard logistics/pharma) vs 'exact_date'
  const [inputMode, setInputMode] = useState<'month_year' | 'exact_date'>('month_year');

  // Parse current date to extract year, month, and day
  const parsedDate = useMemo(() => {
    return parseAnyDate(value);
  }, [value]);

  const now = useMemo(() => new Date(), []);
  const currentRealYear = now.getFullYear();

  // Internal state for Month / Year mode
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    if (parsedDate) return parsedDate.getMonth() + 1;
    // Check if formData has MM
    const rawM = formData.MM || formData.mes || formData.MES;
    if (rawM && !isNaN(Number(rawM))) {
      const m = parseInt(String(rawM), 10);
      if (m >= 1 && m <= 12) return m;
    }
    return now.getMonth() + 1;
  });

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (parsedDate) return parsedDate.getFullYear();
    // Check if formData has YYYY
    const rawY = formData.YYYY || formData.anio || formData.ANIO || formData.año || formData.AÑO;
    if (rawY && !isNaN(Number(rawY))) {
      const y = parseInt(String(rawY), 10);
      if (y >= 2000 && y <= 2100) return y;
    }
    return currentRealYear;
  });

  // Keep internal state in sync when external value changes
  useEffect(() => {
    if (parsedDate) {
      setSelectedMonth(parsedDate.getMonth() + 1);
      setSelectedYear(parsedDate.getFullYear());
    }
  }, [parsedDate]);

  // Operational Radar Metrics
  const radarMetrics = useMemo(() => {
    if (!parsedDate) {
      return null;
    }

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const diffMs = parsedDate.getTime() - todayMidnight.getTime();
    const daysToExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Days to retirement (using resolvedPolicyInfo days if available, else 30d default)
    const policyDays = resolvedPolicyInfo?.diasRetiro ?? 30;
    const daysToRetire = daysToExpiry - policyDays;

    let statusCode: 'EXPIRED' | 'RETIRE_NOW' | 'UPCOMING' | 'DRAINAGE_PM' | 'NORMAL' = 'NORMAL';
    let statusLabel = 'En Regla';
    let statusBg = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    let statusIcon = CheckCircle2;

    if (daysToExpiry <= 0) {
      statusCode = 'EXPIRED';
      statusLabel = 'Vencido';
      statusBg = 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700';
      statusIcon = Flame;
    } else if (daysToRetire <= 0) {
      statusCode = 'RETIRE_NOW';
      statusLabel = 'Retiro Inmediato';
      statusBg = 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      statusIcon = ShieldAlert;
    } else if (daysToRetire <= 30) {
      statusCode = 'UPCOMING';
      statusLabel = 'Próximo a Retiro';
      statusBg = 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800';
      statusIcon = AlertTriangle;
    } else if (daysToRetire <= 90) {
      statusCode = 'DRAINAGE_PM';
      statusLabel = 'Radar PM (Drenaje)';
      statusBg = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      statusIcon = Clock;
    }

    // Derived CU_VC
    const cuInfo = extractCuVcFromRow(
      { ...formData, [header]: formatInputDate(parsedDate) } as SheetRecord,
      headers,
      customAliases
    );

    return {
      daysToExpiry,
      daysToRetire,
      policyDays,
      statusCode,
      statusLabel,
      statusBg,
      statusIcon,
      cuVc: cuInfo.cuVc,
      formattedDate: formatDisplayDate(parsedDate)
    };
  }, [parsedDate, resolvedPolicyInfo, formData, header, headers, customAliases]);

  // Apply month and year changes to formData
  const applyMonthYear = (m: number, y: number) => {
    setSelectedMonth(m);
    setSelectedYear(y);

    const endOfMonth = getEndOfMonthDateForYm(y, m);
    if (!endOfMonth) return;

    const isoStr = formatInputDate(endOfMonth);
    const updates: Record<string, string> = {
      [header]: isoStr
    };

    // If active sheet has MM / MES columns
    const mmCol = headers.find(h => /^(mes|mm)$/i.test(h.trim()));
    if (mmCol) {
      updates[mmCol] = String(m).padStart(2, '0');
    }

    // If active sheet has YYYY / ANIO columns
    const yyyyCol = headers.find(h => /^(a[nñ]o|yyyy|year)$/i.test(h.trim()));
    if (yyyyCol) {
      updates[yyyyCol] = String(y);
    }

    if (onBatchUpdate) {
      onBatchUpdate(updates);
    } else {
      onChangeValue(header, isoStr);
    }
  };

  // Quick Expiry Presets (+3M, +6M, +12M, +18M, +24M, +36M)
  const applyRelativePreset = (monthsToAdd: number) => {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + monthsToAdd);
    const m = targetDate.getMonth() + 1;
    const y = targetDate.getFullYear();
    applyMonthYear(m, y);
  };

  const monthsList = [
    { num: 1, label: 'Ene', full: '01 - Enero' },
    { num: 2, label: 'Feb', full: '02 - Febrero' },
    { num: 3, label: 'Mar', full: '03 - Marzo' },
    { num: 4, label: 'Abr', full: '04 - Abril' },
    { num: 5, label: 'May', full: '05 - Mayo' },
    { num: 6, label: 'Jun', full: '06 - Junio' },
    { num: 7, label: 'Jul', full: '07 - Julio' },
    { num: 8, label: 'Ago', full: '08 - Agosto' },
    { num: 9, label: 'Sep', full: '09 - Septiembre' },
    { num: 10, label: 'Oct', full: '10 - Octubre' },
    { num: 11, label: 'Nov', full: '11 - Noviembre' },
    { num: 12, label: 'Dic', full: '12 - Diciembre' }
  ];

  const presets = [
    { label: '+3 meses', months: 3 },
    { label: '+6 meses', months: 6 },
    { label: '+1 año', months: 12 },
    { label: '+18 meses', months: 18 },
    { label: '+2 años', months: 24 },
    { label: '+3 años', months: 36 }
  ];

  return (
    <div className="space-y-2">
      {/* Input Mode Selector Bar */}
      <div className="flex items-center justify-between gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
        <button
          type="button"
          onClick={() => setInputMode('month_year')}
          className={`flex-1 py-1 px-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            inputMode === 'month_year'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs border border-slate-200/60 dark:border-slate-600'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Mes / Año (MM/AAAA)</span>
        </button>

        <button
          type="button"
          onClick={() => setInputMode('exact_date')}
          className={`flex-1 py-1 px-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            inputMode === 'exact_date'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs border border-slate-200/60 dark:border-slate-600'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Fecha Exacta (DD/MM/AAAA)</span>
        </button>
      </div>

      {inputMode === 'month_year' ? (
        /* ========================================================================= */
        /* MONTH / YEAR MODE (Standard Warehouse & Pharmacy Expiration Interface)    */
        /* ========================================================================= */
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
          {/* Year selector & Quick Month dropdown */}
          <div className="flex items-center gap-2">
            {/* Year Stepper */}
            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shrink-0 shadow-2xs">
              <button
                type="button"
                disabled={disabled || selectedYear <= 2020}
                onClick={() => applyMonthYear(selectedMonth, selectedYear - 1)}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
                title="Año anterior (-1)"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100 px-3 select-none">
                {selectedYear}
              </span>
              <button
                type="button"
                disabled={disabled || selectedYear >= 2035}
                onClick={() => applyMonthYear(selectedMonth, selectedYear + 1)}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
                title="Año siguiente (+1)"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Month Select */}
            <select
              disabled={disabled}
              value={selectedMonth}
              onChange={(e) => applyMonthYear(Number(e.target.value), selectedYear)}
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
            >
              {monthsList.map(m => (
                <option key={m.num} value={m.num}>
                  {m.full}
                </option>
              ))}
            </select>
          </div>

          {/* 12-Month Quick Grid (Compact Chips) */}
          <div className="grid grid-cols-6 gap-1">
            {monthsList.map(m => {
              const isSelected = selectedMonth === m.num;
              return (
                <button
                  key={m.num}
                  type="button"
                  disabled={disabled}
                  onClick={() => applyMonthYear(m.num, selectedYear)}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all text-center cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : 'bg-white dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border-slate-200/90 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Quick Relative Presets Bar */}
          <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-blue-500" />
                Vida Útil Frecuente
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {String(selectedMonth).padStart(2, '0')}/{selectedYear}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {presets.map(p => (
                <button
                  key={p.months}
                  type="button"
                  disabled={disabled}
                  onClick={() => applyRelativePreset(p.months)}
                  className="text-[10px] font-bold bg-white dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* EXACT DATE MODE (Native Calendar Picker + Direct Day Entry)              */
        /* ========================================================================= */
        <div className="space-y-2">
          <input
            type="date"
            name={header}
            value={formatInputDate(value)}
            disabled={disabled}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                onChangeValue(header, '');
                return;
              }
              const p = parseAnyDate(val);
              if (p) {
                const updates: Record<string, string> = { [header]: val };
                const mmCol = headers.find(h => /^(mes|mm)$/i.test(h.trim()));
                if (mmCol) updates[mmCol] = String(p.getMonth() + 1).padStart(2, '0');
                const yyyyCol = headers.find(h => /^(a[nñ]o|yyyy|year)$/i.test(h.trim()));
                if (yyyyCol) updates[yyyyCol] = String(p.getFullYear());
                if (onBatchUpdate) {
                  onBatchUpdate(updates);
                } else {
                  onChangeValue(header, val);
                }
              } else {
                onChangeValue(header, val);
              }
            }}
            className={`w-full border rounded-xl px-3.5 py-2 text-sm outline-none transition-all ${
              disabled
                ? 'bg-slate-100/80 dark:bg-slate-800/40 text-slate-500 cursor-not-allowed border-dashed border-slate-300 dark:border-slate-700'
                : hasError 
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100' 
                  : 'border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
            }`}
          />
          {/* Quick Date Helpers */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const today = new Date();
                onChangeValue(header, formatInputDate(today));
              }}
              className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
            >
              Hoy
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 30);
                onChangeValue(header, formatInputDate(d));
              }}
              className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
            >
              +30 días
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 90);
                onChangeValue(header, formatInputDate(d));
              }}
              className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
            >
              +90 días
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REAL-TIME OPERATIONAL EXPIRATION RADAR CARD                               */}
      {/* ========================================================================= */}
      {radarMetrics && (
        <div className="p-3 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-slate-900/40 rounded-xl border border-blue-200/80 dark:border-blue-800/60 shadow-2xs space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${radarMetrics.statusBg}`}>
                <radarMetrics.statusIcon className="w-3 h-3" />
                <span>{radarMetrics.statusLabel}</span>
              </span>
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
                {radarMetrics.formattedDate}
              </span>
            </div>

            {/* Remaining Days Counter */}
            <div className="text-right">
              {radarMetrics.daysToExpiry > 0 ? (
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  <strong className={radarMetrics.daysToExpiry <= 30 ? 'text-rose-600' : 'text-blue-600 dark:text-blue-400'}>
                    {radarMetrics.daysToExpiry}
                  </strong> días restantes
                </span>
              ) : (
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  ¡Vencido hace {Math.abs(radarMetrics.daysToExpiry)} días!
                </span>
              )}
            </div>
          </div>

          {/* Retirement & CU_VC Bar */}
          <div className="pt-2 border-t border-blue-100 dark:border-blue-900/50 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>
                Retiro preventivo:{' '}
                <strong className="text-slate-800 dark:text-slate-200 font-mono">
                  {resolvedPolicyInfo?.fechaRetiroDisplay || '-'}
                </strong>{' '}
                <span className="text-slate-400">({radarMetrics.policyDays}d)</span>
              </span>
            </div>

            {radarMetrics.cuVc && (
              <div className="flex items-center gap-1 bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300">
                <Tag className="w-3 h-3 text-slate-400" />
                <span>CU: {radarMetrics.cuVc}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
