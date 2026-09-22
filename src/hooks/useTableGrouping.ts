import { useCallback, useEffect, useMemo } from 'react';
import type { SheetConfig } from '../types';
import { VIRTUAL_COLUMNS } from '../utils/virtualColumns';

/**
 * Agrupación contextual de filas por columna, persistida por tabla en
 * `sheetConfig.tableGroupings`. Los handlers comparten la misma escritura de
 * configuración (fusionar el ajuste en la tabla activa y persistir), por eso se
 * agrupan aquí: es cohesión de dominio, no de frecuencia de cambio.
 */
export const useTableGrouping = ({
  activeSheetKey,
  headers,
  visibleHeaders,
  sheetConfig,
  saveConfig,
  groupByColumn,
  setGroupByColumn,
  setGroupByDirection
}: {
  activeSheetKey: string;
  headers: string[];
  visibleHeaders: string[];
  sheetConfig: SheetConfig;
  saveConfig: (config: SheetConfig) => void;
  groupByColumn: string;
  setGroupByColumn: (col: string) => void;
  setGroupByDirection: (dir: 'asc' | 'desc') => void;
}) => {
  const persistGrouping = useCallback((partial: { groupByColumn?: string; groupByDirection?: 'asc' | 'desc' }) => {
    const prevSetting = sheetConfig.tableGroupings?.[activeSheetKey] || {};
    saveConfig({
      ...sheetConfig,
      tableGroupings: {
        ...(sheetConfig.tableGroupings || {}),
        [activeSheetKey]: { ...prevSetting, ...partial }
      }
    });
  }, [activeSheetKey, sheetConfig, saveConfig]);

  const handleSetGroupByColumn = useCallback((col: string) => {
    setGroupByColumn(col);
    persistGrouping({ groupByColumn: col });
  }, [persistGrouping, setGroupByColumn]);

  const handleSetGroupByDirection = useCallback((dir: 'asc' | 'desc') => {
    setGroupByDirection(dir);
    persistGrouping({ groupByDirection: dir });
  }, [persistGrouping, setGroupByDirection]);

  useEffect(() => {
    const saved = sheetConfig.tableGroupings?.[activeSheetKey];
    if (saved && saved.groupByColumn) {
      const col = saved.groupByColumn;
      const dir = saved.groupByDirection || 'asc';
      const isVirtual = VIRTUAL_COLUMNS.some(v => v.label === col || v.id === col);
      const isHeader = headers.includes(col);
      if (col === 'none' || isHeader || isVirtual) {
        setGroupByColumn(col);
        setGroupByDirection(dir);
      } else {
        setGroupByColumn('none');
        setGroupByDirection('asc');
      }
    } else {
      setGroupByColumn('none');
      setGroupByDirection('asc');
    }
  }, [activeSheetKey, headers, setGroupByColumn, setGroupByDirection]);

  // La columna de agrupación se oculta del cuerpo de la tabla: ya aparece en la
  // cabecera del grupo, repetirla añade ruido.
  const effectiveVisibleHeaders = useMemo(() => {
    if (groupByColumn && groupByColumn !== 'none') {
      return visibleHeaders.filter(h => h !== groupByColumn);
    }
    return visibleHeaders;
  }, [visibleHeaders, groupByColumn]);

  return { handleSetGroupByColumn, handleSetGroupByDirection, effectiveVisibleHeaders };
};
