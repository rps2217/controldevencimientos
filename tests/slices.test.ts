import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  getSlicesForTable, 
  getVisibleSlicesForTable, 
  getDeletedSlicesForTable,
  itemMatchesSlice,
  computeSliceCounts
} from '../src/utils/sliceRegistry';
import { resolveColumnInHeaders } from '../src/utils/columnAliases';
import { mergeCloudConfigs } from '../src/utils/dashboardConfigUtils';
import { TableSlice, SheetConfig, InventoryItem } from '../src/types';

test('Slices - Detección y filtrado básico de slices por capacidad', () => {
  const headers = ['SKU', 'DESCRIPCION', 'FECHA_VC', 'CANTIDAD'];
  const slices = getSlicesForTable('main', [], [], headers);

  assert(slices.length > 0, 'Debe devolver slices predeterminados para tabla de vencimientos');
  const retireNow = slices.find(s => s.id === 'builtin_main_retire_now');
  assert(retireNow !== undefined, 'Debe incluir slice Retiro Inmediato');
  assert.equal(retireNow?.isBuiltIn, true);
});

test('Slices - Eliminación de slices predeterminados del sistema', () => {
  const headers = ['SKU', 'DESCRIPCION', 'FECHA_VC', 'CANTIDAD'];
  const deletedSliceIds = ['builtin_main_retire_now', 'builtin_main_canje_proveedor'];

  const activeSlices = getSlicesForTable('main', [], [], headers, undefined, undefined, deletedSliceIds);
  assert(!activeSlices.some(s => s.id === 'builtin_main_retire_now'), 'Retiro Inmediato no debe aparecer en las activas');
  assert(!activeSlices.some(s => s.id === 'builtin_main_canje_proveedor'), 'Canje Proveedor no debe aparecer en las activas');

  const trashSlices = getDeletedSlicesForTable('main', [], [], deletedSliceIds, headers);
  assert.equal(trashSlices.length, 2, 'Debe listar los 2 slices en la papelera');
  assert(trashSlices.some(s => s.id === 'builtin_main_retire_now'), 'La papelera debe contener Retiro Inmediato');
});

test('Slices - Visibilidad de slices (getVisibleSlicesForTable)', () => {
  const headers = ['SKU', 'DESCRIPCION', 'FECHA_VC', 'CANTIDAD'];
  const hiddenSliceIds = ['builtin_main_retire_now'];
  const visible = getVisibleSlicesForTable('main', [], [], hiddenSliceIds, headers);

  assert(!visible.some(s => s.id === 'builtin_main_retire_now'), 'No debe aparecer el slice oculto');
  assert(visible.some(s => s.id === 'builtin_main_canje_proveedor'), 'Debe aparecer el slice no oculto');
});

test('Slices - Evaluación de item y conteo de slices (itemMatchesSlice, computeSliceCounts)', () => {
  const headers = ['SKU', 'DESCRIPCION', 'FECHA_VC', 'CANTIDAD'];
  const items: InventoryItem[] = [
    {
      _rowIndex: 2,
      SKU: '1001',
      DESCRIPCION: 'LECHE ENTERA 1L',
      FECHA_VC: '2026-10-04',
      CANTIDAD: 10
    }
  ];

  const customSlice: TableSlice = {
    id: 'slice_leche',
    name: 'Solo Leche',
    tableKey: 'main',
    filterConfig: {
      searchTerm: 'leche'
    }
  };

  const matches = itemMatchesSlice(items[0], customSlice, headers);
  assert.equal(matches, true, 'El item debe coincidir con la búsqueda "leche"');

  const counts = computeSliceCounts(items, [customSlice], headers);
  assert.equal(counts.slice_leche, 1, 'El contador debe reflejar 1 fila');
});

test('Slices - Restauración de slices eliminados', () => {
  const headers = ['SKU', 'DESCRIPCION', 'FECHA_VC', 'CANTIDAD'];
  let deletedSliceIds = ['builtin_main_retire_now'];

  let activeSlices = getSlicesForTable('main', [], [], headers, undefined, undefined, deletedSliceIds);
  assert(!activeSlices.some(s => s.id === 'builtin_main_retire_now'));

  // Restaurar
  deletedSliceIds = deletedSliceIds.filter(id => id !== 'builtin_main_retire_now');
  activeSlices = getSlicesForTable('main', [], [], headers, undefined, undefined, deletedSliceIds);
  assert(activeSlices.some(s => s.id === 'builtin_main_retire_now'), 'El slice debe reaparecer tras restaurarse');
});

test('Slices - Creación y persistencia de slices personalizados', () => {
  const customSlice: TableSlice = {
    id: 'custom_slice_1',
    name: 'Stock Mayor a 100',
    tableKey: 'main',
    color: 'emerald',
    icon: 'Package',
    filterConfig: {
      searchTerm: 'leche'
    }
  };

  const headers = ['SKU', 'DESCRIPCION', 'FECHA_VC', 'CANTIDAD'];
  const activeSlices = getSlicesForTable('main', [customSlice], [], headers);
  assert(activeSlices.some(s => s.id === 'custom_slice_1'), 'El slice personalizado debe estar presente');
});

test('Slices - Fusión en la nube multi-dispositivo (mergeCloudConfigs)', () => {
  const deviceAConfig: SheetConfig = {
    updatedAt: '2026-10-04T10:00:00.000Z',
    slices: [
      {
        id: 'custom_device_a',
        name: 'Vista Dispositivo A',
        tableKey: 'main',
        filterConfig: {}
      }
    ],
    hiddenSliceIds: ['builtin_main_en_regla'],
    deletedSliceIds: ['builtin_main_orphan_sku']
  };

  const deviceBConfig: SheetConfig = {
    updatedAt: '2026-10-04T10:05:00.000Z',
    slices: [
      {
        id: 'custom_device_b',
        name: 'Vista Dispositivo B',
        tableKey: 'main',
        filterConfig: {}
      }
    ],
    hiddenSliceIds: ['builtin_main_drainage_pm'],
    deletedSliceIds: ['builtin_main_retire_now']
  };

  const merged = mergeCloudConfigs(deviceAConfig, deviceBConfig);

  // Ambos slices personalizados deben persistir
  assert.equal(merged.slices?.length, 2, 'Debe fusionar los slices personalizados de ambos dispositivos');
  assert(merged.slices?.some(s => s.id === 'custom_device_a'));
  assert(merged.slices?.some(s => s.id === 'custom_device_b'));

  // Ambas eliminaciones deben preservarse
  assert(merged.deletedSliceIds?.includes('builtin_main_orphan_sku'), 'Debe conservar la eliminación del dispositivo A');
  assert(merged.deletedSliceIds?.includes('builtin_main_retire_now'), 'Debe conservar la eliminación del dispositivo B');

  // Ambas ocultaciones deben preservarse
  assert(merged.hiddenSliceIds?.includes('builtin_main_en_regla'), 'Debe conservar la ocultación del dispositivo A');
  assert(merged.hiddenSliceIds?.includes('builtin_main_drainage_pm'), 'Debe conservar la ocultación del dispositivo B');
});

test('Slices - Si un slice se elimina en un dispositivo, se purga de slices en la fusión', () => {
  const local: SheetConfig = {
    slices: [
      { id: 'slice_to_delete', name: 'Temporal', tableKey: 'main', filterConfig: {} }
    ],
    deletedSliceIds: []
  };

  const remote: SheetConfig = {
    slices: [],
    deletedSliceIds: ['slice_to_delete']
  };

  const merged = mergeCloudConfigs(local, remote);
  assert(!merged.slices?.some(s => s.id === 'slice_to_delete'), 'El slice eliminado no debe reaparecer en slices');
  assert(merged.deletedSliceIds?.includes('slice_to_delete'));
});

test('Slices - Resolución semántica e insensible a mayúsculas para agrupación', () => {
  const headers = ['SKU', 'DESCRIPCION', 'RUT PROVEEDOR', 'FECHA_VC'];

  // 1. Exact match
  assert.equal(resolveColumnInHeaders('SKU', headers), 'SKU');
  // 2. Case insensitive
  assert.equal(resolveColumnInHeaders('sku', headers), 'SKU');
  assert.equal(resolveColumnInHeaders('descripcion', headers), 'DESCRIPCION');
  // 3. Semantic match (proveedor -> RUT PROVEEDOR)
  assert.equal(resolveColumnInHeaders('proveedor', headers), 'RUT PROVEEDOR');
  assert.equal(resolveColumnInHeaders('PROVEEDOR', headers), 'RUT PROVEEDOR');
  // 4. 'none'
  assert.equal(resolveColumnInHeaders('none', headers), null);
});

test('Slices - Detección de capacidades en tabla FRC con FECHA_VC', () => {
  const frcHeaders = [
    'LOCAL', 'FRC_SKU', 'FRC_DESCRIPCION', 'FOLIO', 'FECHA_VC', 
    'OBSERVACION', 'CANTIDAD', 'FRC_EVEN', 'ID_FRC', 'FRC_ESTADO', 'FRC_FECHA_CREACION'
  ];
  const slices = getSlicesForTable('events', [], [], frcHeaders);
  assert(slices.length > 0, 'Debe devolver slices para la tabla FRC/Incidencias');
  const transporteSlice = slices.find(s => s.id === 'builtin_events_transporte');
  assert(transporteSlice !== undefined, 'Debe incluir slices de incidencias como Transporte & Chofer');
});
