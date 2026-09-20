/**
 * Pruebas de caracterización de la Fase 0 (red de seguridad).
 *
 * No prueban funciones puras: prueban el *cableado* de componentes, que es donde
 * se escapó el bug de agrupación. `ViewConfigControlDrawer` se monta sin props en
 * InventoryDashboard, así que su único camino real de datos es el contexto. Estas
 * pruebas montan el componente exactamente como lo hace la app (sin props, con
 * DashboardProvider) y verifican que la acción del usuario llega al handler del
 * dashboard en vez de caer en un no-op silencioso.
 */
import React from 'react';
import { mount, makeContext, teardownDom } from './harness';
import { DashboardProvider } from '../src/context/DashboardContext';
import { RightDrawerProvider } from '../src/context/RightDrawerContext';
import { ViewConfigControlDrawer } from '../src/components/drawers/ViewConfigControlDrawer';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ FALLIDA: ${testName}`);
    if (detail !== undefined) console.error(`      detalle: ${JSON.stringify(detail)}`);
  }
}

const HEADERS = ['SKU', 'DESCRIPCION', 'PROVEEDOR', 'CANTIDAD'];

async function testGroupingWiring() {
  console.log('\n--- 1. Agrupación de filas conectada al contexto (bug corregido) ---');

  const calls: string[] = [];
  const ctx = makeContext({
    headers: HEADERS,
    activeView: 'main',
    groupByColumn: 'none',
    groupByDirection: 'asc',
    handleSetGroupByColumn: (col: string) => { calls.push(`col:${col}`); },
    handleSetGroupByDirection: (dir: string) => { calls.push(`dir:${dir}`); },
  });

  // Montaje idéntico al de la app: sin props, solo contexto.
  const view = await mount(
    <RightDrawerProvider initialOpen>
      <DashboardProvider value={ctx}>
        <ViewConfigControlDrawer />
      </DashboardProvider>
    </RightDrawerProvider>
  );

  // El valor mostrado viene del contexto.
  assert(view.selectValue() === 'none',
    'el selector arranca en "none" leyendo el contexto', view.selectValue());

  // La acción del usuario debe llegar al handler del dashboard.
  await view.chooseSelect('PROVEEDOR');
  assert(calls.includes('col:PROVEEDOR'),
    'elegir PROVEEDOR invoca handleSetGroupByColumn del dashboard', calls);

  // Regresión del bug: antes caía en un no-op y `calls` quedaba vacío.
  assert(calls.length > 0,
    'la selección no se pierde en un no-op silencioso (regresión del bug)', calls);

  await view.unmount();
}

async function testGroupingDirectionToggle() {
  console.log('\n--- 2. Toggle de dirección de agrupación ---');

  const calls: string[] = [];
  const ctx = makeContext({
    headers: HEADERS,
    activeView: 'main',
    groupByColumn: 'PROVEEDOR',
    groupByDirection: 'asc',
    handleSetGroupByColumn: (col: string) => { calls.push(`col:${col}`); },
    handleSetGroupByDirection: (dir: string) => { calls.push(`dir:${dir}`); },
  });

  const view = await mount(
    <RightDrawerProvider initialOpen>
      <DashboardProvider value={ctx}>
        <ViewConfigControlDrawer />
      </DashboardProvider>
    </RightDrawerProvider>
  );

  // El botón de dirección se renderiza como icono (sin texto) y expone su
  // estado por el atributo title; por eso se busca por ahí y no por contenido.
  const buttons = Array.from(view.container.querySelectorAll('button')) as HTMLButtonElement[];
  const toggle = buttons.find(b => /^Orden de grupo:/.test(b.getAttribute('title') || ''));
  assert(!!toggle,
    'el botón de orden aparece cuando la agrupación está activa', buttons.map(b => b.getAttribute('title')));

  assert(/A a Z/.test(toggle?.getAttribute('title') || ''),
    'con dirección "asc" el botón anuncia orden A a Z', toggle?.getAttribute('title'));

  // Y al pulsarlo debe invertir la dirección del contexto (asc -> desc).
  if (toggle) {
    await view.run(() => { toggle.click(); });
  }
  assert(calls.includes('dir:desc'),
    'pulsar el orden invierte la dirección vía handleSetGroupByDirection', calls);

  await view.unmount();
}

async function testDrawerClosedRendersNothing() {
  console.log('\n--- 3. El drawer cerrado no monta el selector ---');

  const ctx = makeContext({
    headers: HEADERS,
    activeView: 'main',
    groupByColumn: 'none',
  });

  const view = await mount(
    <RightDrawerProvider>
      <DashboardProvider value={ctx}>
        <ViewConfigControlDrawer />
      </DashboardProvider>
    </RightDrawerProvider>
  );

  assert(view.container.querySelectorAll('select').length === 0,
    'con el drawer cerrado no hay selects montados');

  await view.unmount();
}

async function main() {
  console.log('========================================');
  console.log(' PRUEBAS DE COMPONENTE (Fase 0)');
  console.log('========================================');

  await testGroupingWiring();
  await testGroupingDirectionToggle();
  await testDrawerClosedRendersNothing();

  teardownDom();

  console.log('\n========================================');
  console.log(`RESULTADOS DE COMPONENTE: ${passed} PASADAS, ${failed} FALLADAS`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Error no controlado en las pruebas de componente:', err);
  process.exit(1);
});