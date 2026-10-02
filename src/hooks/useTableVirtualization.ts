import { useRef, useCallback, RefObject } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { DisplayRow } from './useInventoryFiltering';

export interface UseTableVirtualizationResult {
  tableContainerRef: RefObject<HTMLDivElement | null>;
  virtualRows: VirtualItem[];
  paddingTop: number;
  paddingBottom: number;
  measureElement: (node: Element | null) => void;
  rowVirtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
}

export function useTableVirtualization(paginatedDisplayRows: DisplayRow[]): UseTableVirtualizationResult {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: paginatedDisplayRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => {
      const row = paginatedDisplayRows[index];
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      if (row && row.type === 'header') return isMobile ? 60 : 44;
      return isMobile ? 160 : 60;
    },
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end 
    : 0;

  const measureElement = useCallback((node: Element | null) => {
    if (node) {
      requestAnimationFrame(() => {
        rowVirtualizer.measureElement(node);
      });
    }
  }, [rowVirtualizer]);

  return {
    tableContainerRef,
    virtualRows,
    paddingTop,
    paddingBottom,
    measureElement,
    rowVirtualizer
  };
}
