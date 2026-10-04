import { registerFormulaFunction } from './types';
import { TokenEvaluator } from './arithmeticParser';

export function registerTextFunctions(evaluateToken: TokenEvaluator) {
  registerFormulaFunction('CONCATENATE', (rawArgs, context) => {
    const str = rawArgs.map(a => evaluateToken(a, context).stringValue).join('');
    return { value: str, stringValue: str, success: true };
  });

  registerFormulaFunction('TEXT', (rawArgs, context) => {
    if (rawArgs.length >= 1) {
      const inner = evaluateToken(rawArgs[0], context);
      return { value: inner.stringValue, stringValue: inner.stringValue, success: true };
    }
    return { value: '', stringValue: '', success: true };
  });

  registerFormulaFunction('UPPER', (rawArgs, context) => {
    const str = rawArgs.length > 0 ? evaluateToken(rawArgs[0], context).stringValue : '';
    return { value: str.toUpperCase(), stringValue: str.toUpperCase(), success: true };
  });

  registerFormulaFunction('LOWER', (rawArgs, context) => {
    const str = rawArgs.length > 0 ? evaluateToken(rawArgs[0], context).stringValue : '';
    return { value: str.toLowerCase(), stringValue: str.toLowerCase(), success: true };
  });

  registerFormulaFunction('TRIM', (rawArgs, context) => {
    const str = rawArgs.length > 0 ? evaluateToken(rawArgs[0], context).stringValue : '';
    return { value: str.trim(), stringValue: str.trim(), success: true };
  });

  registerFormulaFunction('LEFT', (rawArgs, context) => {
    if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
    const str = evaluateToken(rawArgs[0], context).stringValue;
    const count = rawArgs[1] ? parseInt(evaluateToken(rawArgs[1], context).stringValue, 10) || 0 : 1;
    const res = str.slice(0, count);
    return { value: res, stringValue: res, success: true };
  });

  registerFormulaFunction('RIGHT', (rawArgs, context) => {
    if (rawArgs.length === 0) return { value: '', stringValue: '', success: true };
    const str = evaluateToken(rawArgs[0], context).stringValue;
    const count = rawArgs[1] ? parseInt(evaluateToken(rawArgs[1], context).stringValue, 10) || 0 : 1;
    const res = str.slice(Math.max(0, str.length - count));
    return { value: res, stringValue: res, success: true };
  });

  registerFormulaFunction('MID', (rawArgs, context) => {
    if (rawArgs.length < 2) return { value: '', stringValue: '', success: true };
    const str = evaluateToken(rawArgs[0], context).stringValue;
    const start = Math.max(1, parseInt(evaluateToken(rawArgs[1], context).stringValue, 10) || 1) - 1;
    const len = rawArgs[2] ? parseInt(evaluateToken(rawArgs[2], context).stringValue, 10) || 0 : str.length;
    const res = str.slice(start, start + len);
    return { value: res, stringValue: res, success: true };
  });

  registerFormulaFunction('LEN', (rawArgs, context) => {
    if (rawArgs.length === 0) return { value: 0, stringValue: '0', success: true };
    const str = evaluateToken(rawArgs[0], context).stringValue;
    return { value: str.length, stringValue: String(str.length), success: true };
  });

  registerFormulaFunction('CONTAINS', (rawArgs, context) => {
    if (rawArgs.length < 2) return { value: false, stringValue: 'false', success: true };
    const haystack = evaluateToken(rawArgs[0], context).stringValue.toLowerCase();
    const needle = evaluateToken(rawArgs[1], context).stringValue.toLowerCase();
    const found = haystack.includes(needle);
    return { value: found, stringValue: String(found), success: true };
  });

  registerFormulaFunction('SUBSTITUTE', (rawArgs, context) => {
    if (rawArgs.length >= 3) {
      const text = evaluateToken(rawArgs[0], context).stringValue;
      const oldStr = evaluateToken(rawArgs[1], context).stringValue;
      const newStr = evaluateToken(rawArgs[2], context).stringValue;
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
      const text = evaluateToken(rawArgs[0], context).stringValue;
      const start = Math.max(1, parseInt(evaluateToken(rawArgs[1], context).stringValue, 10) || 1) - 1;
      const len = Math.max(0, parseInt(evaluateToken(rawArgs[2], context).stringValue, 10) || 0);
      const newText = evaluateToken(rawArgs[3], context).stringValue;
      const replaced = text.slice(0, start) + newText + text.slice(start + len);
      return { value: replaced, stringValue: replaced, success: true };
    }
    return { value: '', stringValue: '', success: true };
  });

  registerFormulaFunction('ENCODEURL', (rawArgs, context) => {
    if (rawArgs.length >= 1) {
      const text = evaluateToken(rawArgs[0], context).stringValue;
      const encoded = encodeURIComponent(text);
      return { value: encoded, stringValue: encoded, success: true };
    }
    return { value: '', stringValue: '', success: true };
  });
}
