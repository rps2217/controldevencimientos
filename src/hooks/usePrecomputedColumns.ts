import { useMemo } from 'react';
import { findColumnBySemantic } from '../utils/columnAliases';

export interface ColumnMetadata {
  header: string;
  isSku: boolean;
  isEventCol: boolean;
  isTraspasoCol: boolean;
  isBodCol: boolean;
  isDateCol: boolean;
}

export function usePrecomputedColumns(
  headers: string[],
  visibleHeaders: string[],
  frcBodCol: string | null
): {
  visibleColumnMeta: ColumnMetadata[];
  skuCol: string | null;
  eventCol: string | null;
  traspasoCol: string | null;
  bodCol: string | null;
} {
  return useMemo(() => {
    const skuCol = findColumnBySemantic(headers, 'sku') || headers.find(h => /sku|código|codigo/i.test(h)) || null;
    const eventCol = findColumnBySemantic(headers, 'tipo_evento') || headers.find(h => /^frc(_|\s)?even/i.test(h.trim())) || null;
    const traspasoCol = findColumnBySemantic(headers, 'n_traspaso') || headers.find(h => /traspaso/i.test(h)) || null;
    const bodCol = frcBodCol || findColumnBySemantic(headers, 'frc_bod') || headers.find(h => /^frc(_|\s)?bod/i.test(h.trim()) || /bodega/i.test(h.trim())) || null;

    const visibleColumnMeta: ColumnMetadata[] = visibleHeaders.map(header => {
      const isSku = header === skuCol || /sku|código|codigo/i.test(header);
      const isEventCol = header === eventCol || /^frc(_|\s)?even/i.test(header.trim());
      const isTraspasoCol = header === traspasoCol || /traspaso/i.test(header);
      const isBodCol = header === bodCol || header === frcBodCol || /^frc(_|\s)?bod/i.test(header.trim()) || /bodega/i.test(header.trim());
      const isDateCol = 
        findColumnBySemantic([header], 'fecha_vc') === header ||
        findColumnBySemantic([header], 'fecha_retiro') === header ||
        /fecha|vencimiento|caducidad|f_vto|f_venc|f\.vto|f\.venc|exp_date/i.test(header.trim());

      return {
        header,
        isSku,
        isEventCol,
        isTraspasoCol,
        isBodCol,
        isDateCol
      };
    });

    return {
      visibleColumnMeta,
      skuCol,
      eventCol,
      traspasoCol,
      bodCol
    };
  }, [headers, visibleHeaders, frcBodCol]);
}
