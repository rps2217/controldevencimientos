/**
 * Mide el escalado de la cuadratura de conteo con volumen real de farmacia.
 *
 * Por que existe: antes de reescribir el modulo de conteo (2.620 lineas) hay que
 * saber si el coste esta en el algoritmo o en el render. Esta prueba aisla el
 * algoritmo puro (`reconcileStockCountSession` + agregacion), que es lo que corre
 * en cada lectura, y comprueba que el escalado es lineal y no cuadratico.
 *
 * Uso: tsx tests/perf/count-scale.ts
 */
import { reconcileStockCountSession } from '../../src/utils/stockCountUtils';
import { groupSkuEntries, computeReconciliationMetrics } from '../../src/utils/countAggregation';
import type { StockCountSession, StockCountEntry, InventoryItem } from '../../src/types';

const HEADERS = ['SKU', 'DESCRIPCION', 'CANTIDAD', 'CU_VC', 'MM', 'YYYY'];

function buildSession(n: number, lecturasPorSku: number): StockCountSession {
  const conteos: StockCountEntry[] = [];
  for (let i = 0; i < n; i++) {
    const sku = `SKU-${String(i).padStart(6, '0')}`;
    for (let r = 0; r < lecturasPorSku; r++) {
      conteos.push({
        id: `${sku}-${r}`,
        sku,
        descripcion: `Producto ${i}`,
        cantidad: 1,
        timestamp: new Date().toISOString(),
        ubicacion: `MUEBLE-${i % 20}`,
      } as StockCountEntry);
    }
  }
  return {
    id: 'bench',
    nombre: 'Bench',
    modo: 'DOCUMENT',
    requiereVencimiento: false,
    hojaOrigen: 'main',
    snapshotTeorico: {},
    conteos,
    createdAt: new Date().toISOString(),
  } as unknown as StockCountSession;
}

function buildSheet(n: number): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      _rowIndex: i + 2,
      SKU: `SKU-${String(i).padStart(6, '0')}`,
      DESCRIPCION: `Producto ${i}`,
      CANTIDAD: 10,
    } as unknown as InventoryItem);
  }
  return items;
}

function medir(n: number, lecturasPorSku: number): { n: number; ms: number; filas: number } {
  const session = buildSession(n, lecturasPorSku);
  const sheet = buildSheet(n);
  const t0 = performance.now();
  const recon = reconcileStockCountSession(session, sheet, HEADERS);
  const grupos = groupSkuEntries(session);
  const metricas = computeReconciliationMetrics(recon);
  const ms = performance.now() - t0;
  if (grupos.length !== n) throw new Error(`grupos ${grupos.length} != ${n}`);
  if (metricas.totalContado !== n * lecturasPorSku) throw new Error(`totalContado ${metricas.totalContado}`);
  return { n, ms, filas: recon.length };
}

const LECTURAS = 3;
console.log(`Cuadratura: SKUs x ${LECTURAS} lecturas (cada lectura recalcula todo)\n`);
const puntos = [500, 1000, 2000, 4000, 8000].map(n => medir(n, LECTURAS));
for (const p of puntos) {
  const porSku = (p.ms / p.n) * 1000;
  console.log(`  ${String(p.n).padStart(5)} SKUs -> ${p.ms.toFixed(1).padStart(7)} ms  (${porSku.toFixed(2)} us/SKU)  ${p.filas} filas`);
}

// El escalado lineal se comprueba con la razon entre el punto mayor y el menor:
// duplicar los SKUs no debe cuadruplicar el tiempo.
const ratioN = puntos[puntos.length - 1].n / puntos[0].n;
const ratioMs = puntos[puntos.length - 1].ms / puntos[0].ms;
const factorLineal = ratioN;
const factorCuadratico = ratioN * ratioN;
console.log(`\nEscalado: ${ratioN}x SKUs -> ${ratioMs.toFixed(2)}x tiempo (lineal seria ~${factorLineal}x, cuadratico ~${factorCuadratico}x)`);
const esCuadratico = ratioMs > factorLineal * 2;
console.log(esCuadratico ? 'VEREDICTO: NO LINEAL - el algoritmo escala mal' : 'VEREDICTO: LINEAL - el algoritmo no es el cuello de botella');
process.exit(esCuadratico ? 1 : 0);
