import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { InventoryItem } from '../types';

export interface UseColumnResizeProps {
  activeSheetKey: string;
  items: InventoryItem[];
}

export function useColumnResize({ activeSheetKey, items }: UseColumnResizeProps) {
  const [colWidths, setColWidths] = useState<Record<string, Record<string, number>>>(() => {
    try {
      const saved = localStorage.getItem('appsheet_col_widths');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [resizingCol, setResizingCol] = useState<{
    sheetKey: string;
    colId: string;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null>(null);

  // Helper to compute default width for any column
  const getDefaultColWidth = (colId: string, headerName?: string, type?: string): number => {
    if (colId === '_row') return 70;
    if (colId === '_event_type') return 160;
    if (colId === '_status') return 190;
    const name = headerName || colId;
    if (type === 'number') return 120;
    if (type === 'date') return 150;
    if (type === 'enumlist') return 220;
    if (name.length <= 6) return 130;
    if (name.length <= 12) return 170;
    if (/observ|nota|descrip|motivo|detalle/i.test(name)) return 260;
    return 180;
  };

  // Get active width for a column in the current sheet
  const getColWidth = useCallback((colId: string, headerName?: string, type?: string): number => {
    if (resizingCol && resizingCol.sheetKey === activeSheetKey && resizingCol.colId === colId) {
      return resizingCol.currentWidth;
    }
    const custom = colWidths[activeSheetKey]?.[colId];
    if (typeof custom === 'number' && custom > 0) return custom;
    return getDefaultColWidth(colId, headerName, type);
  }, [resizingCol, activeSheetKey, colWidths]);

  // Start Resizing Column
  const handleStartResize = (colId: string, initialWidth: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol({
      sheetKey: activeSheetKey,
      colId,
      startX: e.clientX,
      startWidth: initialWidth,
      currentWidth: initialWidth
    });
  };

  // Window-level listeners for mousemove and mouseup during resizing
  useEffect(() => {
    if (!resizingCol) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingCol.startX;
      const minW = resizingCol.colId === '_row' ? 50 : 70;
      const maxW = 900;
      const newWidth = Math.max(minW, Math.min(maxW, Math.round(resizingCol.startWidth + deltaX)));
      setResizingCol(prev => prev ? { ...prev, currentWidth: newWidth } : null);
    };

    const handleMouseUp = () => {
      if (resizingCol) {
        const { sheetKey, colId, currentWidth } = resizingCol;
        setColWidths(prev => {
          const updated = {
            ...prev,
            [sheetKey]: {
              ...(prev[sheetKey] || {}),
              [colId]: currentWidth
            }
          };
          try {
            localStorage.setItem('appsheet_col_widths', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      }
      setResizingCol(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingCol]);

  // Auto-fit column on double click
  const handleAutoFitColumn = (colId: string, headerName?: string) => {
    const name = headerName || colId;
    let maxChars = name.length;
    
    if (colId === '_row') {
      maxChars = Math.max(maxChars, 4);
    } else if (colId === '_event_type' || colId === '_status') {
      maxChars = Math.max(maxChars, 18);
    } else {
      for (const item of items.slice(0, 60)) {
        const val = item[name];
        if (val !== undefined && val !== null) {
          maxChars = Math.max(maxChars, String(val).length);
        }
      }
    }

    const calculatedWidth = Math.min(650, Math.max(80, maxChars * 9 + 48));
    
    setColWidths(prev => {
      const updated = {
        ...prev,
        [activeSheetKey]: {
          ...(prev[activeSheetKey] || {}),
          [colId]: calculatedWidth
        }
      };
      try {
        localStorage.setItem('appsheet_col_widths', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Reset all custom column widths for active sheet
  const handleResetColWidths = () => {
    setColWidths(prev => {
      const updated = { ...prev };
      delete updated[activeSheetKey];
      try {
        localStorage.setItem('appsheet_col_widths', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const hasCustomColWidths = useMemo(() => {
    return !!(colWidths[activeSheetKey] && Object.keys(colWidths[activeSheetKey]).length > 0);
  }, [colWidths, activeSheetKey]);

  return {
    colWidths,
    resizingCol,
    getColWidth,
    handleStartResize,
    handleAutoFitColumn,
    handleResetColWidths,
    hasCustomColWidths
  };
}
