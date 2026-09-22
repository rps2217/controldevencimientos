import { updateRow, deleteRow, deleteRows } from '../lib/sheets';
import { InventoryItem, SheetConfig, EventCategory, SheetProperties } from '../types';
import type { OfflineMutation } from '../db/indexedDbService';
import type { FetchDataFn } from './useInventoryData';
import { resolveItemIdentity } from '../utils/entityIdentityResolver';
import { findColumnBySemantic } from '../utils/columnAliases';
import { EVENT_CATEGORIES } from '../utils/dateCalculations';
import { getErrorMessage } from '../utils/pureCalculations';
import { STORAGE_KEYS } from '../utils/appStorage';
import { saveStoredDemoItems } from '../utils/dashboardConfigUtils';
import { useToast } from '../components/common/ToastContainer';
import { useConfirm } from '../components/common/ConfirmDialog';

/**
 * Acciones masivas sobre las filas seleccionadas: edición en lote y eliminación
 * en lote. Comparten el mismo molde que la ingesta —optimismo local, escritura
 * fila a fila en Google Sheets y encolado de la mutación si la nube falla— pero
 * además calculan encabezados por semántica y remapean `_rowIndex` tras borrar.
 */
export const useInventoryBulkActions = ({
  activeSheet,
  activeView,
  sheetConfig,
  headers,
  items,
  allMainItems,
  selectedRowIds,
  setSelectedRowIds,
  setItems,
  setAllMainItems,
  setIsSaving,
  enqueueMutation,
  fetchData
}: {
  activeSheet: SheetProperties | null;
  activeView: string;
  sheetConfig: SheetConfig;
  headers: string[];
  items: InventoryItem[];
  allMainItems: InventoryItem[];
  selectedRowIds: number[];
  setSelectedRowIds: React.Dispatch<React.SetStateAction<number[]>>;
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setAllMainItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
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
}) => {
  const { showToast, updateToast } = useToast();
  const confirm = useConfirm();

  const handleApplyBulkEdit = async (values: { frc_n: string; n_traspaso: string; tipo_evento: string; frc_bod: string }) => {
    if (!activeSheet || selectedRowIds.length === 0) return;

    const findHeader = (target: string) => {
      const normTarget = target.replace(/[\s\-_]+/g, '').toLowerCase();
      for (const h of headers) {
        if (h.replace(/[\s\-_]+/g, '').toLowerCase() === normTarget) return h;
      }
      return undefined;
    };

    const colFrcN = findHeader('frc_n') || findHeader('folio') || findHeader('id_vc');
    const colTraspaso = findHeader('n_traspaso') || findHeader('traspaso');
    let colTipoEvento = findColumnBySemantic(headers, 'tipo_evento') || findHeader('tipo_de_evento') || findHeader('tipo_evento') || findHeader('tipo') || findHeader('incidencia');
    const colFrcBod = findHeader('frc_bod') || findHeader('bodega') || findHeader('frc_bodega');

    const currentHeaders = [...headers];
    if (values.tipo_evento && !colTipoEvento) {
      colTipoEvento = 'TIPO_EVENTO';
      currentHeaders.push(colTipoEvento);
      try {
        await updateRow(activeSheet.title, 1, currentHeaders);
      } catch (err) {
        console.warn('Could not auto-add TIPO_EVENTO header to sheet', err);
      }
    }

    const originalItems = [...items];

    try {
      setIsSaving(true);

      let resolvedTipoEvento = values.tipo_evento;
      if (values.tipo_evento) {
        const upper = values.tipo_evento.toUpperCase().trim();
        if (EVENT_CATEGORIES[upper as EventCategory]) {
          resolvedTipoEvento = EVENT_CATEGORIES[upper as EventCategory].name;
        } else if (upper === 'DIFERENCIAS') {
          resolvedTipoEvento = EVENT_CATEGORIES['DIFERENCIA'].name;
        } else if (upper === 'MERMAS') {
          resolvedTipoEvento = EVENT_CATEGORIES['AVERIA'].name;
        } else if (upper === 'CALIDAD') {
          resolvedTipoEvento = EVENT_CATEGORIES['DEVOLUCION'].name;
        }
      }

      const updatedItems = items.map(item => {
        if (!selectedRowIds.includes(item._rowIndex as number)) return item;
        const updated = { ...item };
        if (values.frc_n && colFrcN) updated[colFrcN] = values.frc_n;
        if (values.n_traspaso && colTraspaso) updated[colTraspaso] = values.n_traspaso;
        if (values.tipo_evento && colTipoEvento) updated[colTipoEvento] = resolvedTipoEvento;
        if (values.frc_bod && colFrcBod) updated[colFrcBod] = values.frc_bod;
        return updated;
      });

      setItems(updatedItems);

      const totalEdit = selectedRowIds.length;
      const toastId = showToast(`Actualizando registros... ${totalEdit} restantes`, 'loading', 'Edición Masiva', 0);
      let remainingEdit = totalEdit;

      for (const rawRowIndex of selectedRowIds) {
        const rowIndex = typeof rawRowIndex === 'number' ? rawRowIndex : parseInt(String(rawRowIndex), 10);
        if (!rowIndex || isNaN(rowIndex) || rowIndex < 2) continue;

        const itemToUpdate = updatedItems.find(i => i._rowIndex === rowIndex);
        if (itemToUpdate) {
          const rowValues = currentHeaders.map(h => itemToUpdate[h] || '');
          const ident = resolveItemIdentity(itemToUpdate, currentHeaders, activeSheet.title);
          try {
            await updateRow(activeSheet.title, rowIndex, rowValues, {
              entityKey: ident.keyValue,
              keyValue: ident.keyValue
            });
          } catch (err) {
            console.warn(`Error updating row ${rowIndex} in cloud, adding to offline queue`, err);
            await enqueueMutation({
              type: 'update',
              sheetTitle: activeSheet.title,
              rowIndex,
              entityKey: ident.keyValue,
              entityKeyCol: ident.keyColumn || undefined,
              keyValue: ident.keyValue,
              keyColumn: ident.keyColumn || undefined,
              headers: currentHeaders,
              values: rowValues
            });
          }
        }
        remainingEdit--;
        if (remainingEdit > 0) {
          updateToast(toastId, `Actualizando registros... ${remainingEdit} restantes`, 'loading', 'Edición Masiva', 0);
        }
      }

      setSelectedRowIds([]);
      await fetchData(sheetConfig, activeView, true);
      showToast(`¡Se actualizaron ${totalEdit} registros exitosamente con la información masiva!`, 'success', 'Edición Masiva');
    } catch (err: unknown) {
      setItems(originalItems);
      showToast(`Error en actualización masiva: ${getErrorMessage(err)}`, 'error', 'Error en Edición');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!activeSheet || selectedRowIds.length === 0) return;
    const count = selectedRowIds.length;
    const confirmed = await confirm({ title: 'Eliminación masiva', message: `¿Estás seguro de que deseas eliminar ${count} registros seleccionados? Esta acción no se puede deshacer.`, confirmLabel: `Eliminar ${count}` });
    if (!confirmed) return;

    const toastId = showToast(`Eliminando registros... ${count} restantes`, 'loading', 'Eliminación Masiva', 0);

    const originalItems = [...items];
    const originalMainItems = [...allMainItems];
    const isDemo = !localStorage.getItem(STORAGE_KEYS.SCRIPT_URL)?.trim();

    try {
      setIsSaving(true);

      const selectedSet = new Set(selectedRowIds);
      const remainingItems = items
        .filter(i => !selectedSet.has(i._rowIndex as number))
        .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));

      setItems(remainingItems);
      saveStoredDemoItems(activeView, remainingItems);

      if (activeView === 'main') {
        const remainingMain = allMainItems
          .filter(i => !selectedSet.has(i._rowIndex as number))
          .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));
        setAllMainItems(remainingMain);
        saveStoredDemoItems('main', remainingMain);
      }

      // Sort row indices in DESCENDING order so that deleting earlier rows doesn't shift later row indices
      const sortedRowIds = [...selectedRowIds].sort((a, b) => (b as number) - (a as number));

      if (isDemo) {
        setSelectedRowIds([]);
        updateToast(toastId, `¡Se eliminaron ${count} registros exitosamente!`, 'success', 'Eliminación Completada');
      } else {
        try {
          await deleteRows(activeSheet.sheetId, sortedRowIds, activeSheet.title);
        } catch (batchErr) {
          console.warn('deleteRows masivo falló o no soportado, ejecutando eliminaciones individuales descendentes:', batchErr);
          let remainingDelete = count;
          for (const rowIndex of sortedRowIds) {
            const itemToDelete = originalItems.find(i => i._rowIndex === rowIndex);
            const ident = itemToDelete ? resolveItemIdentity(itemToDelete, headers, activeSheet.title) : null;
            try {
              await deleteRow(activeSheet.sheetId, rowIndex, activeSheet.title);
            } catch (err) {
              console.warn(`Error al eliminar fila ${rowIndex} en la nube, agregando a cola offline`, err);
              await enqueueMutation({
                type: 'delete',
                sheetId: activeSheet.sheetId,
                sheetTitle: activeSheet.title,
                rowIndex,
                entityKey: ident?.keyValue,
                entityKeyCol: ident?.keyColumn || undefined,
                keyValue: ident?.keyValue,
                keyColumn: ident?.keyColumn || undefined,
                headers
              });
            }
            remainingDelete--;
            if (remainingDelete > 0) {
              updateToast(toastId, `Eliminando registros... ${remainingDelete} restantes`, 'loading', 'Eliminación Masiva', 0);
            }
          }
        }

        setSelectedRowIds([]);
        await fetchData(sheetConfig, activeView, true);
        updateToast(toastId, `¡Se eliminaron ${count} registros exitosamente en Google Sheets!`, 'success', 'Eliminación Completada');
      }
    } catch (err: unknown) {
      setItems(originalItems);
      setAllMainItems(originalMainItems);
      showToast(`Error en eliminación masiva: ${getErrorMessage(err)}`, 'error', 'Error de Eliminación');
    } finally {
      setIsSaving(false);
    }
  };

  return { handleApplyBulkEdit, handleBulkDelete };
};
