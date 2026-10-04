export interface EnumOption {
  value: string;
  color?: string; // e.g. 'red', 'blue', etc.
}

export const ENUM_COLOR_MAP: Record<string, { badge: string; dot: string }> = {
  slate: {
    badge: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
    dot: 'bg-slate-500'
  },
  red: {
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50',
    dot: 'bg-red-500'
  },
  orange: {
    badge: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/50',
    dot: 'bg-orange-500'
  },
  amber: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
    dot: 'bg-amber-500'
  },
  yellow: {
    badge: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900/50',
    dot: 'bg-yellow-500'
  },
  green: {
    badge: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900/50',
    dot: 'bg-green-500'
  },
  emerald: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
    dot: 'bg-emerald-500'
  },
  teal: {
    badge: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/50',
    dot: 'bg-teal-500'
  },
  blue: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
    dot: 'bg-blue-500'
  },
  indigo: {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50',
    dot: 'bg-indigo-500'
  },
  purple: {
    badge: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/50',
    dot: 'bg-purple-500'
  },
  pink: {
    badge: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900/50',
    dot: 'bg-pink-500'
  }
};

/**
 * Parse an options string like "PENDIENTE::amber, REALIZADO::emerald, OTRA" into structured EnumOption elements
 */
export function parseEnumOptions(optionsStr: string): EnumOption[] {
  if (!optionsStr || !optionsStr.trim()) return [];
  return optionsStr.split(',').map(s => {
    const parts = s.trim().split('::');
    const value = parts[0].trim();
    const color = parts[1] ? parts[1].trim().toLowerCase() : undefined;
    return { value, color };
  }).filter(o => o.value);
}

/**
 * Serialize EnumOptions back into a single config string
 */
export function serializeEnumOptions(options: EnumOption[]): string {
  return options
    .map(o => o.color ? `${o.value}::${o.color}` : o.value)
    .join(', ');
}

/**
 * Get styling for a given enum value based on the column's options schema
 */
export function getEnumStyle(value: string | undefined, optionsStr: string): { badge: string; dot: string } | null {
  if (!value) return null;
  const normalizedVal = value.trim().toUpperCase();
  const parsed = parseEnumOptions(optionsStr);
  const match = parsed.find(o => o.value.trim().toUpperCase() === normalizedVal);
  if (match && match.color && ENUM_COLOR_MAP[match.color]) {
    return ENUM_COLOR_MAP[match.color];
  }
  return null;
}
