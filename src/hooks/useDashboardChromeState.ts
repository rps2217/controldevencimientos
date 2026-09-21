import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { STORAGE_KEYS, readStorage, writeStorage, tableDensitySchema } from '../utils/appStorage';

export interface TableDensity {
  tableDensity: 'comfortable' | 'compact' | 'ultra';
  setTableDensity: (density: 'comfortable' | 'compact' | 'ultra') => void;
}

/**
 * Estado de "chrome" del dashboard: sidebar, visibilidad de filtros, modo Zen,
 * densidad de tabla y vista resumida. Son flags de presentación puros, sin
 * relación con los datos, por lo que se agrupan y persisten de forma aislada.
 */
export const useDashboardChromeState = ({
  headers,
  setVisibleColumns,
  showAllColumns,
  showToast
}: {
  headers: string[];
  setVisibleColumns: (cols: string[]) => void;
  showAllColumns: () => void;
  showToast: (msg: string, type: 'info' | 'success' | 'error', title?: string) => void;
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(true);
  const [areFiltersVisible, setAreFiltersVisible] = useState<boolean>(false);
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);
  const [isSummaryView, setIsSummaryView] = useState<boolean>(false);

  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact' | 'ultra'>(() =>
    readStorage<'comfortable' | 'compact' | 'ultra'>(
      STORAGE_KEYS.TABLE_DENSITY,
      tableDensitySchema,
      'compact'
    )
  );

  useEffect(() => {
    writeStorage(STORAGE_KEYS.TABLE_DENSITY, tableDensity);
  }, [tableDensity]);

  const [isZenMode, setIsZenMode] = useState<boolean>(() =>
    readStorage<boolean>(STORAGE_KEYS.ZEN_MODE, z.boolean(), false)
  );

  useEffect(() => {
    writeStorage(STORAGE_KEYS.ZEN_MODE, isZenMode);
  }, [isZenMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isZenMode) {
        setIsZenMode(false);
        showToast('Modo Zen desactivado', 'info', 'Enfoque');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZenMode, showToast]);

  const handleToggleSummaryView = useCallback(() => {
    if (!isSummaryView) {
      const keyCols = headers.filter(h => {
        const clean = h.toLowerCase();
        return /sku|código|codigo|descrip|producto|cant|unidades|stock|vencimiento|fecha_vc|pol[ií]tica|estado/i.test(clean);
      });
      if (keyCols.length > 0) {
        setVisibleColumns(keyCols);
      }
      setIsSummaryView(true);
      showToast('Vista Resumida activada: mostrando columnas indispensables', 'info', 'Densidad de Vista');
    } else {
      showAllColumns();
      setIsSummaryView(false);
      showToast('Vista Completa activada: mostrando todas las columnas', 'info', 'Densidad de Vista');
    }
  }, [isSummaryView, headers, setVisibleColumns, showAllColumns, showToast]);

  return {
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    areFiltersVisible,
    setAreFiltersVisible,
    isSchemaLoading,
    setIsSchemaLoading,
    isSummaryView,
    setIsSummaryView,
    tableDensity,
    setTableDensity,
    isZenMode,
    setIsZenMode,
    handleToggleSummaryView
  };
};