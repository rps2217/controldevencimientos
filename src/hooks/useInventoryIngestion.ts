import {
  appendRow,
  updateRow,
  clearSheetsCache
} from '../lib/sheets';
import { InventoryItem, SheetConfig } from '../types';
import type { OfflineMutation } from '../db/indexedDbService';
import type { FetchDataFn } from './useInventoryData';
import { resolveItemIdentity } from '../utils/entityIdentityResolver';
import {
  findColumnBySemantic
} from '../utils/columnAliases';
import {
  reconcileImportWithInventory,
  ImportConsolidationMode
} from '../utils/cuVcConsolidator';
import { rowToObject, getErrorMessage } from '../utils/pureCalculations';
import { indexedDbService } from '../db/indexedDbService';
import { STORAGE_KEYS } from '../utils/appStorage';
import { saveStoredDemoItems } from '../utils/dashboardConfigUtils';

/**
 * Ingesta de filas externas hacia la hoja activa: alta rápida de N° de traspaso,
 * importación universal (con consolidación por CU_VC) y sincronización por lote
 * desde el terminal de conteo. Las tres comparten la misma mecánica —normalizar,
 * escribir en la nube y, si falla, encolar la mutación— por eso viven juntas.
 */
export const useInventoryIngestion = ({
  activeSheet,
  activeView,
  sheetConfig,
  headers,
  items,
  setItems,
  setAllMainItems,
  setProducts,
  setPolicies,
  setIsSaving,
  enqueueMutation,
  fetchData,
  showToast
}: {
  activeSheet: { title: string; sheetId?: number } | null;
  activeView: string;
  sheetConfig: SheetConfig;
  headers: string[];
  items: InventoryItem[];
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setAllMainItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setProducts: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setPolicies: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  enqueueMutation: (mutation: {
    type: 'append' | 'update' | 'delete';
    sheetTitle: string;
    sheetId?: number;
    rowIndex?: number;
    entityKey?: string;
    entityKeyCol?: string;
    keyValue?: string;
    keyColumn?: string;
    headers?: string[];
    values?: any;
  }) => Promise<OfflineMutation>;
  fetchData: FetchDataFn;
  showToast: (msg: string, type: 'info' | 'success' | 'error', title?: string, duration?: number) => void;
}) => {
  const handleSaveQuickTraspaso = async (targetItem: InventoryItem, traspasoNumber: string) => {
    const traspasoCol = findColumnBySemantic(headers, 'n_traspaso') || 'N_TRASPASO';
    const updatedItem = { ...targetItem, [traspasoCol]: traspasoNumber };
    const identity = resolveItemIdentity(updatedItem, headers, activeSheet?.title);

    setItems(prev => prev.map(it => (it._rowIndex === targetItem._rowIndex ? updatedItem : it)));

    if (activeSheet && updatedItem._rowIndex && updatedItem._rowIndex > 1) {
      const rowValues = headers.map(h => updatedItem[h] || '');
      try {
        await updateRow(activeSheet.title, updatedItem._rowIndex, rowValues, {
          entityKey: identity.keyValue,
          keyValue: identity.keyValue
        });
      } catch (saveErr) {
        console.warn('Network error during quick transfer save, adding to offline queue:', saveErr);
        await enqueueMutation({
          type: 'update',
          sheetTitle: activeSheet.title,
          rowIndex: updatedItem._rowIndex,
          entityKey: identity.keyValue,
          entityKeyCol: identity.keyColumn || undefined,
          keyValue: identity.keyValue,
          keyColumn: identity.keyColumn || undefined,
          headers,
          values: rowValues
        });
      }
    }
  };

  const handleUniversalImportConfirmed = async (
    mappedData: Record<string, any>[],
    mode: ImportConsolidationMode = 'consolidate_sum'
  ) => {
    if (!activeSheet || headers.length === 0) {
      showToast('No hay una hoja activa configurada.', 'error', 'Importación');
      return;
    }
    try {
      setIsSaving(true);
      const isDemo = !localStorage.getItem(STORAGE_KEYS.SCRIPT_URL)?.trim();

      const isVencimientosTable = activeView === 'main' || /vencimiento|caducidad|stock/i.test(activeSheet.title);

      if (isVencimientosTable && mode !== 'append') {
        const reconciliation = reconcileImportWithInventory(
          mappedData,
          items,
          headers,
          sheetConfig.customAliases,
          mode
        );

        const totalUpdates = reconciliation.rowsToUpdate.length;
        const totalAppends = reconciliation.rowsToAppend.length;

        showToast(
          `Consolidando importación: ${totalUpdates} a actualizar y ${totalAppends} nuevos registros...`,
          'info',
          'Consolidación Inteligente'
        );

        let updatedItemsList = [...items];
        for (const updateOp of reconciliation.rowsToUpdate) {
          const rowValues = headers.map(h => updateOp.updatedItem[h] !== undefined ? String(updateOp.updatedItem[h]) : '');
          updatedItemsList = updatedItemsList.map(it => it._rowIndex === updateOp.rowIndex ? { ...it, ...updateOp.updatedItem } : it);

          if (!isDemo) {
            try {
              await updateRow(activeSheet.title, updateOp.rowIndex, rowValues);
            } catch (err) {
              console.warn(`Error updating row ${updateOp.rowIndex} in cloud, adding to offline queue:`, err);
              await enqueueMutation({
                type: 'update',
                sheetTitle: activeSheet.title,
                rowIndex: updateOp.rowIndex,
                entityKey: updateOp.cuVc,
                entityKeyCol: 'CU_VC',
                headers,
                values: rowValues
              });
            }
          }
        }

        const validRowIndexes = updatedItemsList.map(i => typeof i._rowIndex === 'number' ? i._rowIndex : parseInt(String(i._rowIndex || '0'), 10)).filter(n => !isNaN(n) && n > 0);
        let nextRowIndex = validRowIndexes.length ? Math.max(...validRowIndexes) + 1 : 2;

        for (const newRow of reconciliation.rowsToAppend) {
          const rowValues = headers.map(h => newRow[h] !== undefined ? String(newRow[h]) : '');
          const newItem: InventoryItem = { _rowIndex: nextRowIndex++, ...newRow };
          const identityInfo = resolveItemIdentity(newItem, headers, activeSheet.title);
          newItem._entityKey = identityInfo.keyValue;
          newItem._entityKeyCol = identityInfo.keyColumn || undefined;
          newItem._isSyntheticKey = identityInfo.isSynthetic;
          updatedItemsList.push(newItem);

          if (!isDemo) {
            try {
              await appendRow(activeSheet.title, rowValues);
            } catch (err) {
              console.warn('Error appending row in cloud, adding to offline queue:', err);
              await enqueueMutation({
                type: 'append',
                sheetTitle: activeSheet.title,
                headers,
                values: rowValues
              });
            }
          }
        }

        setItems(updatedItemsList);
        if (activeView === 'main') setAllMainItems(updatedItemsList);
        saveStoredDemoItems(activeView, updatedItemsList);
        if (activeView === 'main') saveStoredDemoItems('main', updatedItemsList);

        try {
          const cachedRows = [headers, ...updatedItemsList.map(it => headers.map(h => it[h] !== undefined && it[h] !== null ? String(it[h]) : ''))];
          await indexedDbService.saveCachedSheet(activeSheet.title, cachedRows);
        } catch (cErr) {
          console.warn('Error caching imported items in IndexedDB:', cErr);
        }

        showToast(
          `¡Importación completada! ${totalUpdates} registros existentes consolidados y ${totalAppends} nuevos agregados sin duplicados de CU_VC.`,
          'success',
          'Importación Inteligente'
        );

      } else {
        const validRowIndexes = items.map(i => typeof i._rowIndex === 'number' ? i._rowIndex : parseInt(String(i._rowIndex || '0'), 10)).filter(n => !isNaN(n) && n > 0);
        let nextRowIndex = validRowIndexes.length ? Math.max(...validRowIndexes) + 1 : 2;
        const updatedItemsList = [...items];

        for (const item of mappedData) {
          const rowValues = headers.map(h => item[h] !== undefined ? String(item[h]) : '');
          const newItem: InventoryItem = { ...rowToObject(headers, rowValues), _rowIndex: nextRowIndex++ };
          const identityInfo = resolveItemIdentity(newItem, headers, activeSheet.title);
          newItem._entityKey = identityInfo.keyValue;
          newItem._entityKeyCol = identityInfo.keyColumn || undefined;
          newItem._isSyntheticKey = identityInfo.isSynthetic;
          updatedItemsList.push(newItem);

          if (!isDemo) {
            try {
              await appendRow(activeSheet.title, rowValues);
            } catch (saveErr) {
              console.warn('Network error during bulk import append, adding to offline queue:', saveErr);
              await enqueueMutation({
                type: 'append',
                sheetTitle: activeSheet.title,
                values: rowValues
              });
            }
          }
        }

        setItems(updatedItemsList);
        if (activeView === 'main') setAllMainItems(updatedItemsList);
        if (activeView === 'products') setProducts(updatedItemsList);
        if (activeView === 'policies') setPolicies(updatedItemsList);
        saveStoredDemoItems(activeView, updatedItemsList);
        if (activeView === 'main') saveStoredDemoItems('main', updatedItemsList);
        if (activeView === 'products') saveStoredDemoItems('products', updatedItemsList);
        if (activeView === 'policies') saveStoredDemoItems('policies', updatedItemsList);

        try {
          const cachedRows = [headers, ...updatedItemsList.map(it => headers.map(h => it[h] !== undefined && it[h] !== null ? String(it[h]) : ''))];
          await indexedDbService.saveCachedSheet(activeSheet.title, cachedRows);
        } catch (cErr) {
          console.warn('Error caching imported items in IndexedDB:', cErr);
        }

        showToast(`Se importaron ${mappedData.length} registros exitosamente en "${activeSheet.title}".`, 'success', 'Importación Exitosa');
      }

      if (!isDemo) {
        clearSheetsCache(activeSheet.title);
        await fetchData(sheetConfig, activeView, true);
      }
    } catch (err: unknown) {
      showToast(`Error al importar registros: ${getErrorMessage(err)}`, 'error', 'Error de Importación');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncRowsToVencimientos = async (rows: Record<string, any>[]) => {
    if (!activeSheet) return;
    const targetTitle = activeSheet.title;
    try {
      showToast(`Sincronizando ${rows.length} registros con ${targetTitle}...`, 'info', 'Sincronización');
      for (const row of rows) {
        const rowValues = headers.map(h => row[h] !== undefined ? String(row[h]) : '');
        const cuVc = row.CU_VC || row.cu_vc;
        const existingItem = items.find(it => (cuVc && it.CU_VC === cuVc) || (it.SKU_VC === row.SKU_VC && it.MM === row.MM && it.YYYY === row.YYYY));

        if (existingItem && existingItem._rowIndex) {
          try {
            await updateRow(targetTitle, existingItem._rowIndex, rowValues);
          } catch (err) {
            await enqueueMutation({
              type: 'update',
              sheetTitle: targetTitle,
              rowIndex: existingItem._rowIndex,
              entityKey: existingItem._entityKey || cuVc,
              entityKeyCol: existingItem._entityKeyCol || 'CU_VC',
              headers,
              values: rowValues
            });
          }
        } else {
          try {
            await appendRow(targetTitle, rowValues);
          } catch (err) {
            await enqueueMutation({
              type: 'append',
              sheetTitle: targetTitle,
              entityKey: cuVc,
              entityKeyCol: 'CU_VC',
              headers,
              values: rowValues
            });
          }
        }
      }
      showToast(`${rows.length} registros sincronizados exitosamente con ${targetTitle}`, 'success', 'Sincronización Completa');
      await fetchData(sheetConfig, activeView, true);
    } catch (err: unknown) {
      showToast(`Error durante sincronización: ${getErrorMessage(err)}`, 'error', 'Error');
    }
  };

  return { handleSaveQuickTraspaso, handleUniversalImportConfirmed, handleSyncRowsToVencimientos };
};
