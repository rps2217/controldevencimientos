import { updateRow, deleteRow, deleteRows } from '../lib/sheets';
import { InventoryItem, SheetConfig, EventCategory, SheetProperties, SheetRecord } from '../types';
import type { OfflineMutation, MutationValues } from '../db/indexedDbService';
import type { FetchDataFn } from './useInventoryData';
import { resolveItemIdentity } from '../utils/entityIdentityResolver';
import { findColumnBySemantic } from '../utils/columnAliases';
import { EVENT_CATEGORIES } from '../utils/dateCalculations';
import { getErrorMessage } from '../utils/pureCalculations';
import { isDemoMode } from '../utils/appStorage';
import { saveStoredDemoItems } from '../utils/dashboardConfigUtils';
import { useToast } from '../components/common/ToastContainer';
import { useConfirm } from '../components/common/ConfirmDialog';
import { findMasterProduct, dereferenceMasterProduct, resolveItemPolicyAndRetiro } from '../utils/referenceResolver';

/**
 * Acciones masivas sobre las filas seleccionadas: edición en lote, reconciliación
 * con catálogo maestro y eliminación en lote. Comparten el mismo molde que la
 * ingesta —optimismo local, escritura fila a fila en Google Sheets y encolado de la
 * mutación si la nube falla— pero además calculan encabezados por semántica.
 */
export const useInventoryBulkActions = ({
  activeSheet,
  activeView,
  sheetConfig,
  headers,
  items,
  allMainItems,
  products = [],
  policies = [],
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
  products?: SheetRecord[];
  policies?: SheetRecord[];
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
    values?: MutationValues;
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

      const selectedSet = new Set(selectedRowIds.map(Number));
      const updatedItems = items.map(item => {
        if (!selectedSet.has(Number(item._rowIndex))) return item;
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

        const itemToUpdate = updatedItems.find(i => Number(i._rowIndex) === Number(rowIndex));
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
    const isDemo = isDemoMode();

    try {
      setIsSaving(true);

      const selectedSet = new Set(selectedRowIds.map(Number));
      const remainingItems = items
        .filter(i => !selectedSet.has(Number(i._rowIndex)))
        .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));

      setItems(remainingItems);
      saveStoredDemoItems(activeView, remainingItems);

      if (activeView === 'main') {
        const remainingMain = allMainItems
          .filter(i => !selectedSet.has(Number(i._rowIndex)))
          .map((it, idx) => ({ ...it, _rowIndex: idx + 2 }));
        setAllMainItems(remainingMain);
        saveStoredDemoItems('main', remainingMain);
      }

      // Sort row indices in DESCENDING order so that deleting earlier rows doesn't shift later row indices
      const sortedRowIds = [...selectedRowIds].map(Number).sort((a, b) => b - a);

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
            const itemToDelete = originalItems.find(i => Number(i._rowIndex) === Number(rowIndex));
            const ident = itemToDelete ? resolveItemIdentity(itemToDelete, headers, activeSheet.title) : null;
            try {
              await deleteRow(activeSheet.sheetId, rowIndex, activeSheet.title, {
                entityKey: ident?.keyValue,
                keyValue: ident?.keyValue,
                entityKeyCol: ident?.keyColumn || undefined,
              });
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

  const handleReconcileWithCatalog = async () => {
    if (!activeSheet || selectedRowIds.length === 0) return;

    if (!products || products.length === 0) {
      showToast('El Catálogo de Productos está vacío o no se ha cargado aún.', 'warning', 'Catálogo no disponible');
      return;
    }

    const skuCol = findColumnBySemantic(headers, 'sku', sheetConfig.customAliases) || 
                   headers.find(h => /sku|código|codigo/i.test(h));
    if (!skuCol) {
      showToast('No se encontró una columna de SKU en la tabla para reconciliar con el catálogo.', 'warning', 'Sin columna SKU');
      return;
    }

    const count = selectedRowIds.length;
    const confirmed = await confirm({
      title: 'Reconciliar con Catálogo Maestro',
      message: `¿Deseas actualizar los datos maestros (descripción, proveedor y política comercial) de ${count} fila(s) seleccionada(s) con la versión actual del Catálogo de Productos?`,
      confirmLabel: `Reconciliar ${count} filas`
    });
    if (!confirmed) return;

    const originalItems = [...items];
    const originalMainItems = [...allMainItems];
    const isDemo = isDemoMode();

    try {
      setIsSaving(true);
      const toastId = showToast(`Reconciliando con catálogo... ${count} registros`, 'loading', 'Reconciliación', 0);

      let reconciledCount = 0;
      let orphanCount = 0;
      const updatedRowsToSave: { rowIndex: number; rowValues: string[]; entityKey: string }[] = [];

      const selectedSet = new Set(selectedRowIds.map(Number));
      const updatedItems = items.map(item => {
        if (!selectedSet.has(Number(item._rowIndex))) return item;

        const rawSku = item[skuCol] || item.SKU || item.sku;
        const cleanSku = rawSku !== undefined && rawSku !== null ? String(rawSku).trim() : '';

        if (!cleanSku) {
          orphanCount++;
          return item;
        }

        const masterProd = findMasterProduct(cleanSku, products, sheetConfig.customAliases);
        if (!masterProd) {
          orphanCount++;
          return item;
        }

        // De-referenciar campos maestros hacia los encabezados de la hoja activa
        const dereferenced = dereferenceMasterProduct(masterProd, headers, sheetConfig.customAliases);
        const policyInfo = resolveItemPolicyAndRetiro(
          { ...item, ...dereferenced },
          headers,
          products,
          policies,
          sheetConfig.customAliases
        );

        const updated: InventoryItem = { ...item, ...dereferenced, _isOrphan: false };

        // Actualizar política y retiro si la tabla tiene esas columnas
        const polCol = findColumnBySemantic(headers, 'politica', sheetConfig.customAliases);
        if (polCol && policyInfo.policy) {
          updated[polCol] = policyInfo.policy;
        }
        const diasCol = findColumnBySemantic(headers, 'dias_retiro', sheetConfig.customAliases);
        if (diasCol && policyInfo.diasRetiro) {
          updated[diasCol] = String(policyInfo.diasRetiro);
        }
        const retCol = findColumnBySemantic(headers, 'fecha_retiro', sheetConfig.customAliases);
        if (retCol && policyInfo.fechaRetiroDisplay && policyInfo.fechaRetiroDisplay !== '-') {
          updated[retCol] = policyInfo.fechaRetiroDisplay;
        }

        reconciledCount++;
        const rowValues = headers.map(h => updated[h] !== undefined && updated[h] !== null ? String(updated[h]) : '');
        const ident = resolveItemIdentity(updated, headers, activeSheet.title);
        updatedRowsToSave.push({
          rowIndex: item._rowIndex as number,
          rowValues,
          entityKey: ident.keyValue
        });

        return updated;
      });

      if (reconciledCount === 0) {
        showToast('Ninguna de las filas seleccionadas tiene ficha en el catálogo maestro.', 'info', 'Sin cambios');
        return;
      }

      setItems(updatedItems);
      if (activeView === 'main') {
        const updatedMain = allMainItems.map(item => {
          const match = updatedItems.find(u => u._rowIndex === item._rowIndex);
          return match || item;
        });
        setAllMainItems(updatedMain);
        if (isDemo) saveStoredDemoItems('main', updatedMain);
      }
      if (isDemo) saveStoredDemoItems(activeView, updatedItems);

      // Guardar en la nube o encolar offline
      if (!isDemo) {
        let remaining = updatedRowsToSave.length;
        for (const rowData of updatedRowsToSave) {
          try {
            await updateRow(activeSheet.title, rowData.rowIndex, rowData.rowValues, {
              entityKey: rowData.entityKey,
              keyValue: rowData.entityKey
            });
          } catch (err) {
            console.warn(`Error al actualizar fila ${rowData.rowIndex} en reconciliación, agregando a cola offline`, err);
            await enqueueMutation({
              type: 'update',
              sheetTitle: activeSheet.title,
              rowIndex: rowData.rowIndex,
              entityKey: rowData.entityKey,
              keyValue: rowData.entityKey,
              headers,
              values: rowData.rowValues
            });
          }
          remaining--;
          if (remaining > 0) {
            updateToast(toastId, `Reconciliando... ${remaining} restantes`, 'loading', 'Reconciliación', 0);
          }
        }
      }

      // Audio feedback sutil de éxito
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      } catch {}

      setSelectedRowIds([]);
      await fetchData(sheetConfig, activeView, true);

      const msg = orphanCount > 0
        ? `¡Se reconciliaron ${reconciledCount} filas! (${orphanCount} no encontradas en catálogo)`
        : `¡Se reconciliaron ${reconciledCount} filas exitosamente con el catálogo maestro!`;
      updateToast(toastId, msg, 'success', 'Reconciliación Exitosa');
    } catch (err: unknown) {
      setItems(originalItems);
      setAllMainItems(originalMainItems);
      showToast(`Error durante la reconciliación: ${getErrorMessage(err)}`, 'error', 'Error');
    } finally {
      setIsSaving(false);
    }
  };

  return { handleApplyBulkEdit, handleBulkDelete, handleReconcileWithCatalog };
};
