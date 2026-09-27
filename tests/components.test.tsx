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
import { CampaignMatrixTable } from '../src/components/campaign/CampaignMatrixTable';
import { CampaignProviderProgress } from '../src/components/campaign/CampaignProviderProgress';
import { useTableGrouping } from '../src/hooks/useTableGrouping';
import type { SheetConfig, CampaignAuditRow, CampaignConsolidationMatrix } from '../src/types';

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

async function testGroupingRestoredWhenConfigArrivesLate() {
  console.log('\n--- 4. La agrupación guardada se restaura aunque la config llegue tarde ---');

  // Escenario real: la config local no trae agrupación y la de la nube se aplica
  // después del montaje (fetchData resuelve tarde). Antes el efecto no volvía a
  // correr porque `tableGroupings` no era dependencia, y la agrupación se perdía.
  const base = { headers: HEADERS, activeSheetKey: 'main' } as unknown as SheetConfig;
  const withGrouping = {
    ...base,
    tableGroupings: { main: { groupByColumn: 'PROVEEDOR', groupByDirection: 'desc' } },
  } as unknown as SheetConfig;

  const probe = { col: 'none', dir: 'asc' as 'asc' | 'desc' };
  // El hook no expone la agrupación: la recibe y la escribe con los setters, que
  // aquí apuntan al estado del Probe. Ese estado es el observable real.
  function Probe({ config }: { config: SheetConfig }) {
    const [col, setCol] = React.useState('none');
    const [dir, setDir] = React.useState<'asc' | 'desc'>('asc');
    useTableGrouping({
      activeSheetKey: 'main',
      headers: HEADERS,
      visibleHeaders: HEADERS,
      sheetConfig: config,
      saveConfig: () => {},
      groupByColumn: col,
      setGroupByColumn: setCol,
      setGroupByDirection: setDir,
    });
    probe.col = col;
    probe.dir = dir;
    return <div data-col={col} data-dir={dir} />;
  }

  const view = await mount(<Probe config={base} />);
  assert(probe.col === 'none',
    'sin agrupación guardada arranca en "none"', probe);

  await view.update(<Probe config={withGrouping} />);
  assert(probe.col === 'PROVEEDOR',
    'al llegar la config con agrupación, se restaura la columna', probe);
  assert(probe.dir === 'desc',
    'y también la dirección guardada', probe);

  await view.unmount();
}
async function testPostCorteBadgeRenders() {
  console.log('\n--- 5. El badge POST-CORTE se pinta sólo en las filas marcadas ---');

  const rowBase: CampaignAuditRow = {
    sku: 'SKU-A',
    descripcion: 'Producto A',
    proveedor: 'Proveedor',
    stockTeorico: 100,
    stockFisicoTotal: 100,
    ventaRegistrada: 0,
    ajusteManualVenta: 0,
    stockTeoricoEfectivo: 100,
    diferenciaNeta: 0,
    estadoGlobal: 'VALIDADO_OK',
    conteoPosteriorAlCorte: true,
    esCerrado: false,
    sesionesDondeAparece: []
  };

  const matrix = {
    campaignId: 'c1', nombreCampana: 'Inv', fechaCalculo: '2026-09-19T00:00:00.000Z',
    corte: { fechaCorte: '2026-09-10T09:00:00.000Z', skusConLecturaPosterior: ['SKU-A'], skusPendientesDeConteo: [] },
    totalSkusTeoricos: 1, totalSkusFisicosAuditados: 1, porcentajeCobertura: 100,
    cuadradosCount: 1, discrepanciasCount: 0, nuncaPistoleadosCount: 0, hallazgosCount: 0,
    totalFisicoContado: 100, totalTeoricoEsperado: 100, diferenciaNetaTotal: 0,
    cuadrados: [rowBase], discrepancias: [], nuncaPistoleados: [], hallazgos: [],
    resumenPorUbicacion: []
  } as unknown as CampaignConsolidationMatrix;

  const props = {
    matrix,
    displayedRows: [rowBase],
    providerList: [],
    matrixFilter: 'ALL' as const,
    searchTerm: '',
    selectedProvider: '',
    onMatrixFilterChange: () => {},
    onSearchTermChange: () => {},
    onSelectedProviderChange: () => {},
    onQuickScan: () => {},
    onExportDiscrepancies: () => {},
    onLaunchTargetedRecount: () => {},
    onToggleCloseSku: () => {},
    onUpdateSalesAdjustment: () => {}
  };

  const conMarca = await mount(<CampaignMatrixTable {...props} />);
  assert(conMarca.text().includes('POST-CORTE'),
    'la fila marcada muestra el badge POST-CORTE en la tabla real', conMarca.text().slice(0, 120));
  await conMarca.unmount();

  const sinMarca = await mount(
    <CampaignMatrixTable {...props} displayedRows={[{ ...rowBase, conteoPosteriorAlCorte: false }]} />
  );
  assert(!sinMarca.text().includes('POST-CORTE'),
    'una fila sin la marca no muestra el badge (badge vivo, no decorativo)');
  await sinMarca.unmount();
}

async function testIconoCoherenteConEstado() {
  console.log('\n--- 6. El icono de fila sigue a estadoGlobal, no a diferenciaNeta ---');

  // Un SKU del ERP con stock 0 y cero lecturas tiene diferenciaNeta 0, pero NO está
  // validado: es NUNCA_PISTOLEADO. El icono verde "Validado / Cuadrado" contradecía
  // al KPI rojo para el mismo SKU.
  const rowNunca: CampaignAuditRow = {
    sku: 'SKU-CERO',
    descripcion: 'Sin stock',
    proveedor: '',
    stockTeorico: 0,
    stockFisicoTotal: 0,
    ventaRegistrada: 0,
    ajusteManualVenta: 0,
    stockTeoricoEfectivo: 0,
    diferenciaNeta: 0,
    estadoGlobal: 'NUNCA_PISTOLEADO',
    conteoPosteriorAlCorte: false,
    esCerrado: false,
    sesionesDondeAparece: []
  };

  const matrix = {
    campaignId: 'c1', nombreCampana: 'Inv', fechaCalculo: '2026-09-19T00:00:00.000Z',
    corte: { fechaCorte: null, skusConLecturaPosterior: [], skusPendientesDeConteo: [] },
    totalSkusTeoricos: 1, totalSkusFisicosAuditados: 0, porcentajeCobertura: 0,
    cuadradosCount: 0, discrepanciasCount: 0, nuncaPistoleadosCount: 1, hallazgosCount: 0,
    totalFisicoContado: 0, totalTeoricoEsperado: 0, diferenciaNetaTotal: 0,
    cuadrados: [], discrepancias: [], nuncaPistoleados: [rowNunca], hallazgos: [],
    resumenPorUbicacion: []
  } as unknown as CampaignConsolidationMatrix;

  const props = {
    matrix,
    displayedRows: [rowNunca],
    providerList: [],
    matrixFilter: 'ALL' as const,
    searchTerm: '',
    selectedProvider: '',
    onMatrixFilterChange: () => {},
    onSearchTermChange: () => {},
    onSelectedProviderChange: () => {},
    onQuickScan: () => {},
    onExportDiscrepancies: () => {},
    onLaunchTargetedRecount: () => {},
    onToggleCloseSku: () => {},
    onUpdateSalesAdjustment: () => {}
  };

  const view = await mount(<CampaignMatrixTable {...props} />);
  const html = view.container.innerHTML;
  assert(!html.includes('Validado / Cuadrado'),
    'un SKU NUNCA_PISTOLEADO con diferencia 0 NO muestra el check verde de validado');
  assert(html.includes('Nunca Pistoleado'),
    'muestra el icono rojo de nunca pistoleado, coherente con el KPI');
  await view.unmount();
}

async function testProviderPanelFiltra() {
  console.log('\n--- 7. El panel por proveedor se pinta y filtra la matriz ---');

  const providers = [
    { proveedor: 'Lab Norte', totalSkus: 2, contados: 2, cuadrados: 1, discrepancias: 1,
      pendientes: 0, hallazgos: 0, cobertura: 100, totalTeorico: 150, totalFisico: 140 },
    { proveedor: 'Lab Centro', totalSkus: 1, contados: 0, cuadrados: 0, discrepancias: 0,
      pendientes: 1, hallazgos: 0, cobertura: 0, totalTeorico: 30, totalFisico: 0 }
  ];

  let elegido = '';
  const view = await mount(
    <CampaignProviderProgress
      providers={providers}
      selectedProvider="ALL"
      onSelectProvider={(p) => { elegido = p; }}
    />
  );
  const texto = view.text();
  assert(texto.includes('Lab Norte') && texto.includes('Lab Centro'),
    'el panel lista los proveedores de la campana', texto.slice(0, 100));
  assert(texto.includes('100%') && texto.includes('0%'),
    'el panel muestra la cobertura de cada proveedor');
  assert(texto.includes('1 por contar'),
    'el panel destaca cuanto falta por contar, no solo el porcentaje');

  const botones = view.container.querySelectorAll('button');
  assert(botones.length === 2, 'hay un boton por proveedor');
  (botones[1] as HTMLButtonElement).click();
  await view.run(() => {});
  assert(elegido === 'Lab Centro',
    'tocar un proveedor lo selecciona para filtrar la matriz (no es un panel decorativo)');
  await view.unmount();
}



async function main() {
  console.log('========================================');
  console.log(' PRUEBAS DE COMPONENTE (Fase 0)');
  console.log('========================================');

  await testGroupingWiring();
  await testGroupingDirectionToggle();
  await testDrawerClosedRendersNothing();
  await testGroupingRestoredWhenConfigArrivesLate();
  await testPostCorteBadgeRenders();
  await testIconoCoherenteConEstado();
  await testProviderPanelFiltra();

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