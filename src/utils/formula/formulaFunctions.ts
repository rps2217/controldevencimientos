import { parseAnyDate, formatInputDate, formatInputDateTime, parseLocaleNumber } from '../pureCalculations';
import {
  registerFormulaFunction,
  executeLookup,
  normalizeToken,
  resolveRowValue,
  FUNCTION_REGISTRY
} from './formulaTypes';
import {
  evaluateSingleTokenOrExpression,
  evaluateAppSheetFormula,
  evaluateBooleanCondition,
  stripQuotes
} from './formulaParser';
import { SheetRecord } from '../../types';

/* ========================================================================= */
/* INITIALIZATION OF PLUGGABLE FORMULA FUNCTION REGISTRY                     */
/* ========================================================================= */

// --- Numeric Functions ---
registerFormulaFunction('NUMBER', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const strVal = String(inner.stringValue ?? '').trim();
    if (strVal === '' || inner.value === null || inner.value === undefined) {
      return { value: '', stringValue: '', success: true };
    }
    const num = parseLocaleNumber(strVal, NaN);
    if (isNaN(num)) return { value: 0, stringValue: '0', success: true };
    const intVal = Math.trunc(num);
    return { value: intVal, stringValue: String(intVal), success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('DECIMAL', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const strVal = String(inner.stringValue ?? '').trim();
    if (strVal === '' || inner.value === null || inner.value === undefined) {
      return { value: '', stringValue: '', success: true };
    }
    const num = parseLocaleNumber(strVal, NaN);
    if (isNaN(num)) return { value: 0, stringValue: '0', success: true };
    return { value: num, stringValue: String(num), success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('INT', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const strVal = String(inner.stringValue ?? '').trim();
    if (strVal === '' || inner.value === null || inner.value === undefined) {
      return { value: '', stringValue: '', success: true };
    }
    const num = parseLocaleNumber(strVal, NaN);
    if (isNaN(num)) return { value: 0, stringValue: '0', success: true };
    const intVal = Math.floor(num);
    return { value: intVal, stringValue: String(intVal), success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('ROUND', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const digits = rawArgs[1] ? Math.max(0, parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 0) : 0;
    const num = parseLocaleNumber(inner.value, NaN);
    if (isNaN(num)) return { value: 0, stringValue: '0', success: true };
    const factor = Math.pow(10, digits);
    const rounded = Math.round(num * factor) / factor;
    return { value: rounded, stringValue: String(rounded), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('ABS', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const num = parseLocaleNumber(inner.value, NaN);
    const absVal = isNaN(num) ? 0 : Math.abs(num);
    return { value: absVal, stringValue: String(absVal), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('MAX', (rawArgs, context) => {
  const nums: number[] = [];
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      res.value.forEach(v => {
        const n = parseLocaleNumber(v, NaN);
        if (!isNaN(n)) nums.push(n);
      });
    } else {
      const n = parseLocaleNumber(res.value, NaN);
      if (!isNaN(n)) nums.push(n);
    }
  });
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return { value: max, stringValue: String(max), success: true };
});

registerFormulaFunction('MIN', (rawArgs, context) => {
  const nums: number[] = [];
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      res.value.forEach(v => {
        const n = parseLocaleNumber(v, NaN);
        if (!isNaN(n)) nums.push(n);
      });
    } else {
      const n = parseLocaleNumber(res.value, NaN);
      if (!isNaN(n)) nums.push(n);
    }
  });
  const min = nums.length > 0 ? Math.min(...nums) : 0;
  return { value: min, stringValue: String(min), success: true };
});

registerFormulaFunction('SUM', (rawArgs, context) => {
  const nums: number[] = [];
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      res.value.forEach(v => {
        const n = parseLocaleNumber(v, NaN);
        if (!isNaN(n)) nums.push(n);
      });
    } else {
      const n = parseLocaleNumber(res.value, NaN);
      if (!isNaN(n)) nums.push(n);
    }
  });
  const sum = nums.reduce((a, b) => a + b, 0);
  return { value: sum, stringValue: String(sum), success: true };
});

registerFormulaFunction('AVG', (rawArgs, context) => {
  return FUNCTION_REGISTRY.get('AVERAGE')!(rawArgs, context);
});

registerFormulaFunction('AVERAGE', (rawArgs, context) => {
  const nums: number[] = [];
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      res.value.forEach(v => {
        const n = parseLocaleNumber(v, NaN);
        if (!isNaN(n)) nums.push(n);
      });
    } else {
      const n = parseLocaleNumber(res.value, NaN);
      if (!isNaN(n)) nums.push(n);
    }
  });
  const avg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  return { value: avg, stringValue: String(avg), success: true };
});

registerFormulaFunction('COUNT', (rawArgs, context) => {
  let count = 0;
  rawArgs.forEach(arg => {
    const res = evaluateSingleTokenOrExpression(arg, context);
    if (Array.isArray(res.value)) {
      count += res.value.filter(v => v !== undefined && v !== null && String(v).trim() !== '').length;
    } else if (res.stringValue && res.stringValue.trim() !== '') {
      count += 1;
    }
  });
  return { value: count, stringValue: String(count), success: true };
});

// --- Text Functions ---
registerFormulaFunction('CONCATENATE', (rawArgs, context) => {
  const str = rawArgs.map(a => evaluateSingleTokenOrExpression(a, context).stringValue).join('');
  return { value: str, stringValue: str, success: true };
});

registerFormulaFunction('TEXT', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const inner = evaluateSingleTokenOrExpression(rawArgs[0], context);
    return { value: inner.stringValue, stringValue: inner.stringValue, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('UPPER', (rawArgs, context) => {
  const str = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue : '';
  return { value: str.toUpperCase(), stringValue: str.toUpperCase(), success: true };
});

registerFormulaFunction('LOWER', (rawArgs, context) => {
  const str = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue : '';
  return { value: str.toLowerCase(), stringValue: str.toLowerCase(), success: true };
});

registerFormulaFunction('TRIM', (rawArgs, context) => {
  const str = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue : '';
  return { value: str.trim(), stringValue: str.trim(), success: true };
});

registerFormulaFunction('LEFT', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const str = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
  const count = rawArgs[1] ? parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 0 : 1;
  const res = str.slice(0, count);
  return { value: res, stringValue: res, success: true };
});

registerFormulaFunction('RIGHT', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const str = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
  const count = rawArgs[1] ? parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 0 : 1;
  const res = str.slice(Math.max(0, str.length - count));
  return { value: res, stringValue: res, success: true };
});

registerFormulaFunction('MID', (rawArgs, context) => {
  if (rawArgs.length < 2) return { value: '', stringValue: '', success: true };
  const str = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
  const start = Math.max(1, parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 1) - 1;
  const len = rawArgs[2] ? parseInt(evaluateSingleTokenOrExpression(rawArgs[2], context).stringValue, 10) || 0 : str.length;
  const res = str.slice(start, start + len);
  return { value: res, stringValue: res, success: true };
});

registerFormulaFunction('LEN', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: 0, stringValue: '0', success: true };
  const str = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
  return { value: str.length, stringValue: String(str.length), success: true };
});

registerFormulaFunction('CONTAINS', (rawArgs, context) => {
  if (rawArgs.length < 2) return { value: false, stringValue: 'false', success: true };
  const haystack = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue.toLowerCase();
  const needle = evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue.toLowerCase();
  const found = haystack.includes(needle);
  return { value: found, stringValue: String(found), success: true };
});

// --- Logical & Conditional Functions ---
registerFormulaFunction('SWITCH', (rawArgs, context) => {
  if (rawArgs.length >= 3) {
    const targetVal = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue.trim().toUpperCase();
    const hasDefault = (rawArgs.length - 1) % 2 === 1;
    const casesEnd = hasDefault ? rawArgs.length - 1 : rawArgs.length;
    
    for (let i = 1; i < casesEnd; i += 2) {
      const caseVal = evaluateSingleTokenOrExpression(rawArgs[i], context).stringValue.trim().toUpperCase();
      if (targetVal === caseVal) {
        return evaluateSingleTokenOrExpression(rawArgs[i + 1], context);
      }
    }
    if (hasDefault) {
      return evaluateSingleTokenOrExpression(rawArgs[rawArgs.length - 1], context);
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('IFS', (rawArgs, context) => {
  for (let i = 0; i < rawArgs.length; i += 2) {
    if (i + 1 < rawArgs.length) {
      const condStr = rawArgs[i].trim();
      const isTrue = evaluateBooleanCondition(condStr, context);
      if (isTrue) {
        return evaluateSingleTokenOrExpression(rawArgs[i + 1], context);
      }
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('IF', (rawArgs, context) => {
  if (rawArgs.length >= 2) {
    const condRes = evaluateBooleanCondition(rawArgs[0], context);
    if (condRes) {
      return evaluateSingleTokenOrExpression(rawArgs[1], context);
    } else if (rawArgs[2]) {
      return evaluateSingleTokenOrExpression(rawArgs[2], context);
    } else {
      return { value: '', stringValue: '', success: true };
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('ISBLANK', (rawArgs, context) => {
  const inner = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context) : { stringValue: '' };
  const isBlank = !inner.stringValue || inner.stringValue.trim() === '';
  return { value: isBlank, stringValue: isBlank ? 'true' : 'false', success: true };
});

registerFormulaFunction('ISNOTBLANK', (rawArgs, context) => {
  const inner = rawArgs.length > 0 ? evaluateSingleTokenOrExpression(rawArgs[0], context) : { stringValue: '' };
  const isNotBlank = Boolean(inner.stringValue && inner.stringValue.trim() !== '');
  return { value: isNotBlank, stringValue: isNotBlank ? 'true' : 'false', success: true };
});

// --- Date & Time Functions ---
registerFormulaFunction('TODAY', () => {
  const today = new Date();
  const formatted = formatInputDate(today);
  return { value: today, stringValue: formatted, success: true };
});

registerFormulaFunction('NOW', () => {
  const now = new Date();
  const formatted = formatInputDateTime(now);
  return { value: now, stringValue: formatted, success: true };
});

registerFormulaFunction('EOMONTH', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const dateRes = evaluateAppSheetFormula(rawArgs[0], context);
    const parsedDate = parseAnyDate(dateRes.value || dateRes.stringValue);
    let offset = 0;
    if (rawArgs[1]) {
      const offsetRes = evaluateAppSheetFormula(rawArgs[1], context);
      offset = Math.round(parseLocaleNumber(offsetRes.value || offsetRes.stringValue, 0));
    }
    if (parsedDate) {
      const lastDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth() + 1 + offset, 0);
      const formatted = formatInputDate(lastDay);
      return { value: lastDay, stringValue: formatted, success: true };
    }
  }
  return { value: '', stringValue: '', success: false, error: 'Fecha inválida en EOMONTH' };
});

registerFormulaFunction('DATE', (rawArgs, context) => {
  if (rawArgs.length === 3) {
    const y = parseInt(evaluateAppSheetFormula(rawArgs[0], context).stringValue, 10);
    const m = parseInt(evaluateAppSheetFormula(rawArgs[1], context).stringValue, 10);
    const d = parseInt(evaluateAppSheetFormula(rawArgs[2], context).stringValue, 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const dateObj = new Date(y, m - 1, d);
      const formatted = formatInputDate(dateObj);
      return { value: dateObj, stringValue: formatted, success: true };
    }
  } else if (rawArgs.length === 1) {
    const innerRes = evaluateAppSheetFormula(rawArgs[0], context);
    const parsedDate = parseAnyDate(innerRes.value || innerRes.stringValue);
    if (parsedDate) {
      const formatted = formatInputDate(parsedDate);
      return { value: parsedDate, stringValue: formatted, success: true };
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('YEAR', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const d = parseAnyDate(evaluateSingleTokenOrExpression(rawArgs[0], context).value);
  const val = d ? d.getFullYear() : '';
  return { value: val, stringValue: String(val), success: true };
});

registerFormulaFunction('MONTH', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const d = parseAnyDate(evaluateSingleTokenOrExpression(rawArgs[0], context).value);
  const val = d ? d.getMonth() + 1 : '';
  return { value: val, stringValue: String(val), success: true };
});

registerFormulaFunction('DAY', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const d = parseAnyDate(evaluateSingleTokenOrExpression(rawArgs[0], context).value);
  const val = d ? d.getDate() : '';
  return { value: val, stringValue: String(val), success: true };
});

// --- Relational & Collection Functions ---
registerFormulaFunction('LOOKUP', (rawArgs, context) => {
  if (rawArgs.length >= 4) {
    const needle = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
    const table = stripQuotes(rawArgs[1]);
    const searchCol = stripQuotes(rawArgs[2]);
    const returnCol = stripQuotes(rawArgs[3]);
    const val = executeLookup(needle, table, searchCol, returnCol, context);
    return { value: val, stringValue: val, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('SELECT', (rawArgs, context) => {
  if (rawArgs.length < 1) return { value: [], stringValue: '', success: true };
  const targetColExpr = rawArgs[0].trim();
  const filterCondExpr = rawArgs[1] ? rawArgs[1].trim() : '';

  let targetTable = context.tableName || '';
  let targetCol = targetColExpr;
  const tMatch = targetColExpr.match(/^([A-Za-z0-9_]+)\[([^\]]+)\]$/);
  if (tMatch) {
    targetTable = tMatch[1].trim();
    targetCol = tMatch[2].trim();
  } else if (targetColExpr.startsWith('[') && targetColExpr.endsWith(']')) {
    targetCol = targetColExpr.slice(1, -1).trim();
  }

  let records: SheetRecord[] = [];
  const normTable = normalizeToken(targetTable);
  if (normTable.includes('product') || normTable.includes('catalogo') || normTable.includes('maestro')) {
    records = context.products || [];
  } else if (normTable.includes('politic') || normTable.includes('canje')) {
    records = context.policies || [];
  } else if (context.allSheetsData && context.allSheetsData[targetTable]) {
    records = context.allSheetsData[targetTable];
  } else if (context.allSheetsData) {
    const foundKey = Object.keys(context.allSheetsData).find(k => normalizeToken(k) === normTable);
    if (foundKey) records = context.allSheetsData[foundKey];
  }

  if (records.length === 0 && context.row) {
    records = [context.row];
  }

  const results: any[] = [];
  records.forEach(rec => {
    let matches = true;
    if (filterCondExpr) {
      matches = evaluateBooleanCondition(filterCondExpr, {
        ...context,
        row: rec
      });
    }
    if (matches) {
      const val = resolveRowValue(rec, targetCol);
      if (val !== undefined && val !== null && val !== '') {
        results.push(val);
      }
    }
  });

  const joined = results.map(String).join(', ');
  return { value: results, stringValue: joined, success: true };
});

registerFormulaFunction('FILTER', (rawArgs, context) => {
  return FUNCTION_REGISTRY.get('SELECT')!(rawArgs, context);
});

registerFormulaFunction('ANY', (rawArgs, context) => {
  if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
  const res = evaluateSingleTokenOrExpression(rawArgs[0], context);
  if (Array.isArray(res.value)) {
    const first = res.value.length > 0 ? res.value[0] : '';
    return { value: first, stringValue: String(first ?? ''), success: true };
  }
  const str = res.stringValue || '';
  const firstElem = str.includes(',') ? str.split(',')[0].trim() : str;
  return { value: firstElem, stringValue: firstElem, success: true };
});

registerFormulaFunction('IN', (rawArgs, context) => {
  if (rawArgs.length < 2) return { value: false, stringValue: 'false', success: true };
  const needle = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue.trim().toUpperCase();
  const listRes = evaluateSingleTokenOrExpression(rawArgs[1], context);
  let isFound = false;
  if (Array.isArray(listRes.value)) {
    isFound = listRes.value.some(item => String(item ?? '').trim().toUpperCase() === needle);
  } else {
    const parts = (listRes.stringValue || '').split(',').map(s => s.trim().toUpperCase());
    isFound = parts.includes(needle);
  }
  return { value: isFound, stringValue: isFound ? 'true' : 'false', success: true };
});

registerFormulaFunction('INDEX', (rawArgs, context) => {
  if (rawArgs.length < 2) return { value: '', stringValue: '', success: true };
  const listRes = evaluateSingleTokenOrExpression(rawArgs[0], context);
  const idx = Math.max(1, parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 1) - 1;
  let val: any = '';
  if (Array.isArray(listRes.value)) {
    val = listRes.value[idx] ?? '';
  } else {
    const parts = (listRes.stringValue || '').split(',').map(s => s.trim());
    val = parts[idx] ?? '';
  }
  return { value: val, stringValue: String(val ?? ''), success: true };
});

registerFormulaFunction('CEILING', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const n = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const ceil = isNaN(n) ? 0 : Math.ceil(n);
    return { value: ceil, stringValue: String(ceil), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('FLOOR', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const n = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const flr = isNaN(n) ? 0 : Math.floor(n);
    return { value: flr, stringValue: String(flr), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('MOD', (rawArgs, context) => {
  if (rawArgs.length >= 2) {
    const n1 = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const n2 = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[1], context).value, NaN);
    if (!isNaN(n1) && !isNaN(n2) && n2 !== 0) {
      const mod = n1 % n2;
      return { value: mod, stringValue: String(mod), success: true };
    }
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('POWER', (rawArgs, context) => {
  if (rawArgs.length >= 2) {
    const base = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const exp = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[1], context).value, NaN);
    if (!isNaN(base) && !isNaN(exp)) {
      const pow = Math.pow(base, exp);
      return { value: pow, stringValue: String(pow), success: true };
    }
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('SQRT', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const n = parseLocaleNumber(evaluateSingleTokenOrExpression(rawArgs[0], context).value, NaN);
    const sqrt = isNaN(n) || n < 0 ? 0 : Math.sqrt(n);
    return { value: sqrt, stringValue: String(sqrt), success: true };
  }
  return { value: 0, stringValue: '0', success: true };
});

registerFormulaFunction('WORKDAY', (rawArgs, context) => {
  if (rawArgs.length >= 2) {
    const dateRes = evaluateSingleTokenOrExpression(rawArgs[0], context);
    const daysRes = evaluateSingleTokenOrExpression(rawArgs[1], context);
    const d = parseAnyDate(dateRes.value || dateRes.stringValue);
    const numDays = Math.round(parseLocaleNumber(daysRes.value || daysRes.stringValue, 0));
    if (d && !isNaN(numDays)) {
      const cur = new Date(d.getTime());
      let added = 0;
      const step = numDays >= 0 ? 1 : -1;
      const target = Math.abs(numDays);
      while (added < target) {
        cur.setDate(cur.getDate() + step);
        const dayOfWeek = cur.getDay(); // 0 = Sun, 6 = Sat
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          added++;
        }
      }
      const formatted = formatInputDate(cur);
      return { value: cur, stringValue: formatted, success: true };
    }
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('SUBSTITUTE', (rawArgs, context) => {
  if (rawArgs.length >= 3) {
    const text = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
    const oldStr = evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue;
    const newStr = evaluateSingleTokenOrExpression(rawArgs[2], context).stringValue;
    if (oldStr) {
      const replaced = text.split(oldStr).join(newStr);
      return { value: replaced, stringValue: replaced, success: true };
    }
    return { value: text, stringValue: text, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('REPLACE', (rawArgs, context) => {
  if (rawArgs.length >= 4) {
    const text = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
    const start = Math.max(1, parseInt(evaluateSingleTokenOrExpression(rawArgs[1], context).stringValue, 10) || 1) - 1;
    const len = Math.max(0, parseInt(evaluateSingleTokenOrExpression(rawArgs[2], context).stringValue, 10) || 0);
    const newText = evaluateSingleTokenOrExpression(rawArgs[3], context).stringValue;
    const replaced = text.slice(0, start) + newText + text.slice(start + len);
    return { value: replaced, stringValue: replaced, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

registerFormulaFunction('ENCODEURL', (rawArgs, context) => {
  if (rawArgs.length >= 1) {
    const text = evaluateSingleTokenOrExpression(rawArgs[0], context).stringValue;
    const encoded = encodeURIComponent(text);
    return { value: encoded, stringValue: encoded, success: true };
  }
  return { value: '', stringValue: '', success: true };
});

/**
 * No-op helper to guarantee registration has executed if explicitly called
 */
export function ensureFormulaFunctionsRegistered() {
  // Functions registered upon module import
  return FUNCTION_REGISTRY.size;
}
