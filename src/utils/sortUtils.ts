import { InventoryItem, SortConfig } from '../types';
import { parseAnyDate, parseLocaleNumber } from './pureCalculations';

/**
 * Universal Multi-Type Column Comparator
 * Performs stable, intelligent type-aware sorting:
 * 1. Dates (native, ISO, DD/MM/YYYY, MM/YYYY, serial)
 * 2. Numbers (currency, floats, integers, formatted thousand strings)
 * 3. Strings / Text (natural Spanish collation, numeric-aware like SKU-2 vs SKU-10)
 * 4. Empty / Null values cleanly placed at the bottom
 */
export function compareItemValues(a: any, b: any, direction: 'asc' | 'desc' = 'asc'): number {
  const isAsc = direction === 'asc';
  const multiplier = isAsc ? 1 : -1;

  // 1. Null / Undefined / Empty string handling (always placed at end)
  const isAEmpty = a === undefined || a === null || String(a).trim() === '' || String(a).trim() === '-';
  const isBEmpty = b === undefined || b === null || String(b).trim() === '' || String(b).trim() === '-';

  if (isAEmpty && isBEmpty) return 0;
  if (isAEmpty) return 1; // Put empty at the bottom regardless of sort order
  if (isBEmpty) return -1;

  // 2. Check for Date values
  const dateA = parseAnyDate(a);
  const dateB = parseAnyDate(b);
  if (dateA && dateB) {
    const timeA = dateA.getTime();
    const timeB = dateB.getTime();
    if (timeA !== timeB) {
      return (timeA - timeB) * multiplier;
    }
  }

  // 3. Check for Numeric values (including currency and thousand separators)
  const isNumCandidateA = typeof a === 'number' || /^-?[$€£S/.]?\s*\d+([.,]\d+)*$/.test(String(a).trim());
  const isNumCandidateB = typeof b === 'number' || /^-?[$€£S/.]?\s*\d+([.,]\d+)*$/.test(String(b).trim());

  if (isNumCandidateA && isNumCandidateB) {
    const numA = typeof a === 'number' ? a : parseLocaleNumber(a, NaN);
    const numB = typeof b === 'number' ? b : parseLocaleNumber(b, NaN);

    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) {
        return (numA - numB) * multiplier;
      }
    }
  }

  // 4. Natural String collation (locale-aware + numeric natural sorting)
  const strA = String(a).trim();
  const strB = String(b).trim();
  return strA.localeCompare(strB, 'es', { numeric: true, sensitivity: 'base' }) * multiplier;
}

/**
 * Stable sort an array of InventoryItems with secondary index preservation
 */
export function sortInventoryItems(
  items: InventoryItem[], 
  sortConfig: SortConfig
): InventoryItem[] {
  if (!sortConfig.column || !sortConfig.direction) {
    return items;
  }

  const col = sortConfig.column;
  const dir = sortConfig.direction;

  // Create an indexed wrapper array to guarantee strict stability (preserving sheet row order)
  const indexed = items.map((item, originalIndex) => ({ item, originalIndex }));

  indexed.sort((a, b) => {
    const valA = a.item[col];
    const valB = b.item[col];

    const diff = compareItemValues(valA, valB, dir);
    if (diff !== 0) return diff;

    // Stability tie-breaker
    return a.originalIndex - b.originalIndex;
  });

  return indexed.map(entry => entry.item);
}
