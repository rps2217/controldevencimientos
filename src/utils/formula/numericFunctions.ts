import { registerFormulaFunction, FUNCTION_REGISTRY } from './types';
import { parseLocaleNumber } from '../pureCalculations';
import { TokenEvaluator } from './arithmeticParser';

export function registerNumericFunctions(evaluateToken: TokenEvaluator) {
  registerFormulaFunction('NUMBER', (rawArgs, context) => {
    if (rawArgs.length >= 1) {
      const inner = evaluateToken(rawArgs[0], context);
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
      const inner = evaluateToken(rawArgs[0], context);
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
      const inner = evaluateToken(rawArgs[0], context);
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
      const inner = evaluateToken(rawArgs[0], context);
      const digits = rawArgs[1] ? Math.max(0, parseInt(evaluateToken(rawArgs[1], context).stringValue, 10) || 0) : 0;
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
      const inner = evaluateToken(rawArgs[0], context);
      const num = parseLocaleNumber(inner.value, NaN);
      const absVal = isNaN(num) ? 0 : Math.abs(num);
      return { value: absVal, stringValue: String(absVal), success: true };
    }
    return { value: 0, stringValue: '0', success: true };
  });

  registerFormulaFunction('MAX', (rawArgs, context) => {
    const nums: number[] = [];
    rawArgs.forEach(arg => {
      const res = evaluateToken(arg, context);
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
      const res = evaluateToken(arg, context);
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
      const res = evaluateToken(arg, context);
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
      const res = evaluateToken(arg, context);
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
      const res = evaluateToken(arg, context);
      if (Array.isArray(res.value)) {
        count += res.value.filter(v => v !== undefined && v !== null && String(v).trim() !== '').length;
      } else if (res.stringValue && res.stringValue.trim() !== '') {
        count += 1;
      }
    });
    return { value: count, stringValue: String(count), success: true };
  });

  registerFormulaFunction('CEILING', (rawArgs, context) => {
    if (rawArgs.length >= 1) {
      const n = parseLocaleNumber(evaluateToken(rawArgs[0], context).value, NaN);
      const ceil = isNaN(n) ? 0 : Math.ceil(n);
      return { value: ceil, stringValue: String(ceil), success: true };
    }
    return { value: 0, stringValue: '0', success: true };
  });

  registerFormulaFunction('FLOOR', (rawArgs, context) => {
    if (rawArgs.length >= 1) {
      const n = parseLocaleNumber(evaluateToken(rawArgs[0], context).value, NaN);
      const flr = isNaN(n) ? 0 : Math.floor(n);
      return { value: flr, stringValue: String(flr), success: true };
    }
    return { value: 0, stringValue: '0', success: true };
  });

  registerFormulaFunction('MOD', (rawArgs, context) => {
    if (rawArgs.length >= 2) {
      const n1 = parseLocaleNumber(evaluateToken(rawArgs[0], context).value, NaN);
      const n2 = parseLocaleNumber(evaluateToken(rawArgs[1], context).value, NaN);
      if (!isNaN(n1) && !isNaN(n2) && n2 !== 0) {
        const mod = n1 % n2;
        return { value: mod, stringValue: String(mod), success: true };
      }
    }
    return { value: 0, stringValue: '0', success: true };
  });

  registerFormulaFunction('POWER', (rawArgs, context) => {
    if (rawArgs.length >= 2) {
      const base = parseLocaleNumber(evaluateToken(rawArgs[0], context).value, NaN);
      const exp = parseLocaleNumber(evaluateToken(rawArgs[1], context).value, NaN);
      if (!isNaN(base) && !isNaN(exp)) {
        const pow = Math.pow(base, exp);
        return { value: pow, stringValue: String(pow), success: true };
      }
    }
    return { value: 0, stringValue: '0', success: true };
  });

  registerFormulaFunction('SQRT', (rawArgs, context) => {
    if (rawArgs.length >= 1) {
      const n = parseLocaleNumber(evaluateToken(rawArgs[0], context).value, NaN);
      const sqrt = isNaN(n) || n < 0 ? 0 : Math.sqrt(n);
      return { value: sqrt, stringValue: String(sqrt), success: true };
    }
    return { value: 0, stringValue: '0', success: true };
  });
}
