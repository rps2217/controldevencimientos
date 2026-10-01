import { useState, useCallback } from 'react';
import { InventoryItem, SheetConfig, SheetRecord } from '../types';
import { appendRow, updateRow, deleteRow, clearSheetsCache } from '../lib/sheets';
import { rowToObject, getErrorMessage, parseLocaleNumber } from '../utils/pureCalculations';
import { findColumnBySemantic } from '../utils/columnAliases';
import { resolveItemIdentity } from '../utils/entityIdentityResolver';
import { findExistingItemByCuVc } from '../utils/cuVcConsolidator';
import { indexedDbService } from '../db/indexedDbService';
import { isDemoMode } from '../utils/appStorage';
import { saveStoredDemoItems } from '../utils/dashboardConfigUtils';
import { ToastType } from '../components/common/ToastContainer';
import { ConfirmOptions } from '../components/common/ConfirmDialog';

export interface UseInventoryMutationsParams {
  activeSheet: { sheetId: number; title: string; index?: number } | null;
  activeView: string;
  tableCapabilities: Set<string>;
  sheetConfig: SheetConfig;
  headers: string[];
  items: InventoryItem[];
  allMainItems: InventoryItem[];
  products: SheetRecord[];
  policies: SheetRecord[];
  editingItem: InventoryItem | null;
  formData: Record<string, string>;
  validateForm: () => Record<string, string>;
  setFormErrors: (errors: Record<string, string>) => void;
  handleCloseModal: () => void;
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setAllMainItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setProducts: React.Dispatch<React.SetStateAction<SheetRecord[]>>;
  setPolicies: React.Dispatch<React.SetStateAction<SheetRecord[]>>;
  enqueueMutation: (mutation: any) => Promise<any>;
  fetchData: (config?: SheetConfig, targetView?: string, forceRefresh?: boolean) => Promise<any>;
  showToast: (message: string, type?: ToastType, title?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export function useInventoryMutations({
  activeSheet,
  activeView,
  tableCapabilities,
  sheetConfig,
  headers,
  items,
  allMainItems,
  products: _products,
  policies: _policies,
  editingItem,
  formData,
  validateForm,
  setFormErrors,
  handleCloseModal,
  setItems,
  setAllMainItems,
  setProducts,
  setPolicies,
  enqueueMutation,
  fetchData,
  showToast,
  confirm
}: UseInventoryMutationsParams) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSheet || headers.length === 0) return;

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    const originalItems = [...items];
    const originalMainItems = [...allMainItems];
    const isDemo = isDemoMode();

    try {
      setIsSaving(true);
      const now = new Date();
      const currentFormattedDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      // Intelligent CU_VC Collision Detection: solo donde la hoja tiene dominio de vencimiento
      let targetExistingItem = editingItem;
      let isConsolidatingWithExisting = false;

      if (!targetExistingItem && (tableCapabilities.has('vencimiento') || /vencimiento|caducidad|stock/i.test(activeSheet.title))) {
        const matched = findExistingItemByCuVc(formData, items, headers, sheetConfig.customAliases);
        if (matched.exists && matched.existingItem) {
          targetExistingItem = matched.existingItem;
          isConsolidatingWithExisting = true;
        }
      }

      // If consolidating with an existing row, sum up the quantities!
      const mergedFormData = { ...formData };
      if (isConsolidatingWithExisting && targetExistingItem) {
        const qtyCol = findColumnBySemantic(headers, 'cantidad') || headers.find(h => /cant|stock|unidades/i.test(h));
        if (qtyCol) {
          const currentQty = parseLocaleNumber(targetExistingItem[qtyCol]);
          const addQty = parseLocaleNumber(formData[qtyCol]);
          mergedFormData[qtyCol] = String(currentQty + addQty);
        }
      }

      const rowValues = headers.map(h => {
        const val = mergedFormData[h] !== undefined && mergedFormData[h] !== null ? String(mergedFormData[h]) : '';
        const colSchema = sheetConfig.schema?.[activeSheet.title]?.[h];
        if (!val && (colSchema?.type === 'datetime' || /timestamp|created_at|fecha_creaci[oó]n|fecha_registro/i.test(h))) {
          return currentFormattedDateTime;
        }
        return val;
      });

      // Calculate row index safely
      const validRowIndexes = items
        .map(i => (typeof i._rowIndex === 'number' ? i._rowIndex : parseInt(String(i._rowIndex || '0'), 10)))
        .filter(n => !isNaN(n) && n > 0);
      const nextRowIndex = targetExistingItem
        ? (targetExistingItem._rowIndex || 2)
        : (validRowIndexes.length ? Math.max(...validRowIndexes) + 1 : 2);

      // Optimistic update
      const newItem: InventoryItem = { ...rowToObject(headers, rowValues), _rowIndex: nextRowIndex };

      const identityInfo = resolveItemIdentity(newItem, headers, activeSheet.title);
      newItem._entityKey = identityInfo.keyValue;
      newItem._entityKeyCol = identityInfo.keyColumn || undefined;
      newItem._isSyntheticKey = identityInfo.isSynthetic;

      let nextItems: InventoryItem[];
      if (targetExistingItem) {
        nextItems = items.map(item => (item._rowIndex === targetExistingItem!._rowIndex ? newItem : item));
      } else {
        nextItems = [...items, newItem];
      }

      setItems(nextItems);
      if (activeView === 'main') setAllMainItems(nextItems);
      if (activeView === 'products') setProducts(nextItems);
      if (activeView === 'policies') setPolicies(nextItems);

      // Update persistent demo storage
      saveStoredDemoItems(activeView, nextItems);

      // Save to IndexedDB cached sheet
      try {
        const cachedRows = [
          headers,
          ...nextItems.map(it => headers.map(h => (it[h] !== undefined && it[h] !== null ? String(it[h]) : '')))
        ];
        await indexedDbService.saveCachedSheet(activeSheet.title, cachedRows);
      } catch (cacheErr) {
        console.warn('Error saving to IndexedDB:', cacheErr);
      }

      handleCloseModal();

      const isUpdate = Boolean(targetExistingItem && targetExistingItem._rowIndex && targetExistingItem._rowIndex > 1);
      const targetRowIndex = isUpdate ? targetExistingItem!._rowIndex : undefined;

      if (isDemo) {
        if (isConsolidatingWithExisting) {
          showToast('Registro consolidado con éxito: Se sumó la cantidad al vencimiento existente (Modo Local)', 'success', 'Consolidación Inteligente');
        } else {
          showToast(isUpdate ? 'Registro actualizado con éxito (Modo Local)' : 'Registro guardado con éxito (Modo Local)', 'success', 'Operación Exitosa');
        }
        return;
      }

      try {
        if (isUpdate && targetRowIndex) {
          await updateRow(activeSheet.title, targetRowIndex, rowValues, {
            entityKey: identityInfo.keyValue,
            keyValue: identityInfo.keyValue
          });
        } else {
          await appendRow(activeSheet.title, rowValues);
        }
        clearSheetsCache(activeSheet.title);
        if (isConsolidatingWithExisting) {
          showToast('Registro consolidado con éxito: Se sumó la cantidad en Google Sheets.', 'success', 'Consolidación Inteligente');
        } else {
          showToast(isUpdate ? 'Registro actualizado en Google Sheets con éxito.' : 'Registro guardado en Google Sheets con éxito.', 'success', 'Guardado');
        }
      } catch (saveErr) {
        console.warn('Network error during save, adding to offline queue:', saveErr);
        await enqueueMutation({
          type: isUpdate ? 'update' : 'append',
          sheetTitle: activeSheet.title,
          rowIndex: targetRowIndex,
          entityKey: identityInfo.keyValue,
          entityKeyCol: identityInfo.keyColumn || undefined,
          keyValue: identityInfo.keyValue,
          keyColumn: identityInfo.keyColumn || undefined,
          headers,
          values: rowValues
        });
        showToast('Sin conexión con Google Sheets. Los cambios se guardaron localmente en la cola offline.', 'info', 'Modo Offline');
      }
    } catch (err: unknown) {
      // Rollback
      setItems(originalItems);
      setAllMainItems(originalMainItems);
      showToast(`Error guardando datos (rollback aplicado): ${getErrorMessage(err)}`, 'error', 'Error');
    } finally {
      setIsSaving(false);
    }
  }, [
    activeSheet,
    headers,
    validateForm,
    setFormErrors,
    items,
    allMainItems,
    editingItem,
    tableCapabilities,
    formData,
    sheetConfig.customAliases,
    sheetConfig.schema,
    setItems,
    activeView,
    setAllMainItems,
    setProducts,
    setPolicies,
    handleCloseModal,
    showToast,
    enqueueMutation
  ]);

  const handleSavePistoleoItem = useCallback(async (formPayload: Record<string, string>, targetExistingItem?: InventoryItem) => {
    if (!activeSheet || headers.length === 0) return;
    setIsSaving(true);
    try {
      const isDemo = isDemoMode();
      const now = new Date();
      const currentFormattedDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      const rowValues = headers.map(h => {
        const val = formPayload[h] !== undefined && formPayload[h] !== null ? String(formPayload[h]) : '';
        const colSchema = sheetConfig.schema?.[activeSheet.title]?.[h];
        if (!val && (colSchema?.type === 'datetime' || /timestamp|created_at|fecha_creaci[oó]n|fecha_registro/i.test(h))) {
          return currentFormattedDateTime;
        }
        return val;
      });

      const validRowIndexes = items
        .map(i => (typeof i._rowIndex === 'number' ? i._rowIndex : parseInt(String(i._rowIndex || '0'), 10)))
        .filter(n => !isNaN(n) && n > 0);
      const nextRowIndex = targetExistingItem
        ? (targetExistingItem._rowIndex || 2)
        : (validRowIndexes.length ? Math.max(...validRowIndexes) + 1 : 2);

      const newItem: InventoryItem = { ...rowToObject(headers, rowValues), _rowIndex: nextRowIndex };

      const identityInfo = resolveItemIdentity(newItem, headers, activeSheet.title);
      newItem._entityKey = identityInfo.keyValue;
      newItem._entityKeyCol = identityInfo.keyColumn || undefined;
      newItem._isSyntheticKey = identityInfo.isSynthetic;

      let nextItems: InventoryItem[];
      if (targetExistingItem && targetExistingItem._rowIndex) {
        nextItems = items.map(item => (item._rowIndex === targetExistingItem._rowIndex ? newItem : item));
      } else {
        nextItems = [...items, newItem];
      }

      setItems(nextItems);
      if (activeView === 'main') setAllMainItems(nextItems);
      saveStoredDemoItems(activeView, nextItems);

      try {
        const cachedRows = [
          headers,
          ...nextItems.map(it => headers.map(h => (it[h] !== undefined && it[h] !== null ? String(it[h]) : '')))
        ];
        await indexedDbService.saveCachedSheet(activeSheet.title, cachedRows);
      } catch (cacheErr) {
        console.warn('Error saving pistoleo item to IndexedDB:', cacheErr);
      }

      if (isDemo) {
        showToast(targetExistingItem ? 'Registro de pistoleo actualizado' : 'Nuevo registro de pistoleo guardado', 'success', 'Pistoleo Exitoso');
        return;
      }

      if (targetExistingItem && targetExistingItem._rowIndex && targetExistingItem._rowIndex > 1) {
        try {
          await updateRow(activeSheet.title, targetExistingItem._rowIndex, rowValues, {
            entityKey: identityInfo.keyValue,
            keyValue: identityInfo.keyValue
          });
        } catch (err) {
          await enqueueMutation({
            type: 'update',
            sheetTitle: activeSheet.title,
            rowIndex: targetExistingItem._rowIndex,
            entityKey: identityInfo.keyValue,
            headers,
            values: rowValues
          });
        }
      } else {
        try {
          await appendRow(activeSheet.title, rowValues);
        } catch (err) {
          await enqueueMutation({
            type: 'append',
            sheetTitle: activeSheet.title,
            entityKey: identityInfo.keyValue,
            headers,
            values: rowValues
          });
        }
      }
      showToast('Cambios de pistoleo guardados en la nube', 'success', 'Sincronización');
    } catch (err: unknown) {
      showToast(`Error al guardar pistoleo: ${getErrorMessage(err)}`, 'error', 'Error');
    } finally {
      setIsSaving(false);
    }
  }, [
    activeSheet,
    headers,
    sheetConfig.schema,
    items,
    setItems,
    activeView,
    setAllMainItems,
    showToast,
    enqueueMutation
  ]);

  const handleDelete = useCallback(async (item: InventoryItem) => {
    if (!activeSheet) return;
    const confirmed = await confirm({
      title: 'Eliminar fila',
      message: `¿Estás seguro de que deseas eliminar la fila ${item._rowIndex}? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar'
    });
    if (!confirmed) return;

    const originalItems = [...items];
    const originalMainItems = [...allMainItems];
    const isDemo = isDemoMode();

    try {
      setIsSaving(true);

      const nextItems = items
        .filter(i => i._rowIndex !== item._rowIndex)
        .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));

      setItems(nextItems);
      saveStoredDemoItems(activeView, nextItems);

      if (activeView === 'main') {
        const nextMain = allMainItems
          .filter(i => i._rowIndex !== item._rowIndex)
          .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));
        setAllMainItems(nextMain);
        saveStoredDemoItems('main', nextMain);
      }

      if (isDemo) {
        showToast('Registro eliminado en modo demostración', 'success', 'Eliminación Completada');
      } else {
        const ident = resolveItemIdentity(item, headers, activeSheet.title);
        try {
          await deleteRow(activeSheet.sheetId, item._rowIndex as number, activeSheet.title, {
            entityKey: ident.keyValue,
            keyValue: ident.keyValue,
            entityKeyCol: ident.keyColumn || undefined,
          });
          showToast('Registro eliminado de Google Sheets', 'success', 'Eliminación Completada');
        } catch (delErr) {
          console.warn('Error al eliminar en la nube, agregando a cola offline:', delErr);
          await enqueueMutation({
            type: 'delete',
            sheetId: activeSheet.sheetId,
            sheetTitle: activeSheet.title,
            rowIndex: item._rowIndex as number,
            entityKey: ident.keyValue,
            entityKeyCol: ident.keyColumn || undefined,
            keyValue: ident.keyValue,
            keyColumn: ident.keyColumn || undefined,
            headers
          });
          showToast('Sin conexión. La eliminación se guardó localmente en cola offline.', 'info', 'Modo Offline');
        }
        await fetchData(sheetConfig, activeView, true);
      }
    } catch (err: unknown) {
      setItems(originalItems);
      setAllMainItems(originalMainItems);
      showToast(`Error al eliminar fila: ${getErrorMessage(err)}`, 'error', 'Error de Eliminación');
    } finally {
      setIsSaving(false);
    }
  }, [
    activeSheet,
    items,
    allMainItems,
    activeView,
    headers,
    sheetConfig,
    confirm,
    showToast,
    fetchData,
    setItems,
    setAllMainItems,
    enqueueMutation
  ]);

  return {
    isSaving,
    handleSave,
    handleSavePistoleoItem,
    handleDelete
  };
}
