import { useCallback, useEffect, useMemo } from 'react';
import type { SheetConfig } from '../types';
import { findTableSchema } from '../utils/virtualColumnsEvaluator';
import { resolveColumnInHeaders } from '../utils/columnAliases';

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

  const handleSetGroupByColumn = useCallback((col: string, persist = true) => {
    const schemaForTable = findTableSchema(activeSheetKey, sheetConfig);
    const resolved = col === 'none' ? 'none' : (resolveColumnInHeaders(col, headers, schemaForTable, sheetConfig.customAliases) || col);
    setGroupByColumn(resolved);
    if (persist) {
      persistGrouping({ groupByColumn: resolved });
    }
  }, [activeSheetKey, headers, sheetConfig, persistGrouping, setGroupByColumn]);

  const handleSetGroupByDirection = useCallback((dir: 'asc' | 'desc', persist = true) => {
    setGroupByDirection(dir);
    if (persist) {
      persistGrouping({ groupByDirection: dir });
    }
  }, [persistGrouping, setGroupByDirection]);

  const savedGroupByColumn = sheetConfig.tableGroupings?.[activeSheetKey]?.groupByColumn;
  const savedGroupByDirection = sheetConfig.tableGroupings?.[activeSheetKey]?.groupByDirection;

  // Hidratar cuando cambia savedGroupByColumn (ej. config de la nube llega tarde) o al cambiar de hoja
  useEffect(() => {
    if (savedGroupByColumn && savedGroupByColumn !== 'none') {
      const schemaForTable = findTableSchema(activeSheetKey, sheetConfig);
      const resolved = resolveColumnInHeaders(savedGroupByColumn, headers, schemaForTable, sheetConfig.customAliases);
      if (resolved) {
        setGroupByColumn(resolved);
        setGroupByDirection(savedGroupByDirection || 'asc');
      } else {
        setGroupByColumn('none');
        setGroupByDirection('asc');
      }
    }
  }, [activeSheetKey, headers, savedGroupByColumn, savedGroupByDirection, setGroupByColumn, setGroupByDirection, sheetConfig]);

  // La columna de agrupación se oculta del cuerpo de la tabla: ya aparece en la
  // cabecera del grupo, repetirla añade ruido.
  const effectiveVisibleHeaders = useMemo(() => {
    if (groupByColumn && groupByColumn !== 'none') {
      const schemaForTable = findTableSchema(activeSheetKey, sheetConfig);
      const resolved = resolveColumnInHeaders(groupByColumn, headers, schemaForTable, sheetConfig.customAliases) || groupByColumn;
      const lowerGroup = resolved.toLowerCase().trim();
      return visibleHeaders.filter(h => h !== groupByColumn && h !== resolved && h.toLowerCase().trim() !== lowerGroup);
    }
    return visibleHeaders;
  }, [visibleHeaders, groupByColumn, headers, activeSheetKey, sheetConfig]);

  return { handleSetGroupByColumn, handleSetGroupByDirection, effectiveVisibleHeaders };
};
