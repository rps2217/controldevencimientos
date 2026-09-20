/**
 * Sonda de medición de re-renders (Fase 1).
 *
 * Monta el InventoryDashboard real (modo demostración, sin red) envuelto en el
 * <Profiler> de React y mide el COSTO de un cambio puramente de UI: cuántos
 * commits provoca y cuántos milisegundos acumula el subárbol del dashboard.
 *
 * Nota sobre la métrica: `onRender` se dispara una vez por commit del subárbol,
 * no una vez por componente. `actualDuration` es el tiempo total de render de
 * ese commit, que es lo que percibe el usuario. Se repite la misma acción para
 * descartar el costo de montaje del primer commit.
 *
 * LIMITACIÓN IMPORTANTE (por qué este archivo no entra en `npm test`):
 * jsdom no implementa `ResizeObserver`, y la tabla virtualizada colapsa a cero
 * filas cuando el contenedor mide altura 0. El subárbol medido es por tanto
 * mucho más pequeño que el real, así que los milisegundos de aquí NO son
 * extrapolables al navegador. Sirve para dos cosas: comprobar que el dashboard
 * monta en jsdom, y contar commits de forma determinista. Para decidir sobre
 * rendimiento hay que medir en el navegador con React DevTools Profiler.
 *
 * No se simula el patrón: se mide el dashboard real. Se conserva para poder
 * repetir la medición tras cada paso de la Fase 1.
 */
import React from 'react';
import { mount, setupDom } from './harness';
import { ToastProvider } from '../src/components/common/ToastContainer';
import { ConfirmProvider } from '../src/components/common/ConfirmDialog';

interface CommitInfo {
  label: string;
  commits: number;
  totalMs: number;
  maxMs: number;
}

const commits: CommitInfo[] = [];
let lastCommit: CommitInfo | null = null;

function onRender(
  _id: string,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number
) {
  if (!lastCommit) return;
  lastCommit.commits++;
  lastCommit.totalMs += actualDuration;
  lastCommit.maxMs = Math.max(lastCommit.maxMs, actualDuration);
}

async function snapshot(label: string, action: () => Promise<void>) {
  lastCommit = { label, commits: 0, totalMs: 0, maxMs: 0 };
  await action();
  commits.push(lastCommit);
  lastCommit = null;
}

async function main() {
  setupDom();

  console.log('========================================');
  console.log(' LÍNEA BASE DE RE-RENDERS (Fase 1)');
  console.log('========================================');

  const { InventoryDashboard } = await import('../src/components/InventoryDashboard');

  const view = await mount(
    <ToastProvider>
      <ConfirmProvider>
        <React.Profiler id="dashboard" onRender={onRender}>
          <InventoryDashboard />
        </React.Profiler>
      </ConfirmProvider>
    </ToastProvider>
  );

  // Dejar que la carga inicial (demo, sin red) se asiente.
  await view.run(async () => { await new Promise(r => setTimeout(r, 500)); });

  /**
   * Localiza el botón de "Vistas & Ajustes" en el DOM ACTUAL. Se re-consulta en
   * cada clic: React puede reemplazar el nodo al re-renderizar y una referencia
   * guardada quedaría desconectada, con lo que el clic no haría nada y la
   * medición daría 0 sin que el estado haya cambiado.
   */
  function findDrawerButton(): HTMLButtonElement | undefined {
    const buttons = Array.from(view.container.querySelectorAll('button')) as HTMLButtonElement[];
    return buttons.find(b => /Vistas & Ajustes/.test(b.textContent || ''));
  }

  /** Indica si el panel lateral está montado (cabecera "Ajustes de Vista"). */
  function isDrawerOpen(): boolean {
    return /Ajustes de Vista|Sin agrupar \(Lista plana\)/.test(view.container.textContent || '');
  }

  const initialBtn = findDrawerButton();
  console.log(`\nDashboard montado. Botón "Vistas & Ajustes" encontrado: ${!!initialBtn}`);
  console.log(`Panel lateral abierto al inicio: ${isDrawerOpen()}`);

  if (initialBtn) {
    // 4 alternancias (abrir/cerrar). Las dos primeras incluyen el costo de
    // montaje del panel; las dos últimas son estado estable y son la línea base.
    for (let i = 0; i < 4; i++) {
      const before = isDrawerOpen();
      await snapshot(`clic #${i + 1}`, async () => {
        await view.run(async () => {
          findDrawerButton()?.click();
          await new Promise(r => setTimeout(r, 50));
        });
      });
      const after = isDrawerOpen();
      console.log(`    (estado del panel: ${before} -> ${after})`);
    }
  }

  console.log('\n--- Costo en estado estable (misma acción repetida 3x) ---');
  for (const c of commits) {
    console.log(`  ${c.label}: ${c.commits} commit(s), ${c.totalMs.toFixed(1)}ms total, ${c.maxMs.toFixed(1)}ms máx`);
  }

  const steady = commits.slice(2);
  if (steady.length > 0) {
    const avgSteady = steady.reduce((a, c) => a + c.commits, 0) / steady.length;
    const avgMs = steady.reduce((a, c) => a + c.totalMs, 0) / steady.length;
    console.log(`\n  ESTADO ESTABLE: ${avgSteady.toFixed(2)} commit(s) y ${avgMs.toFixed(1)}ms por acción`);
    console.log('  (ms no extrapolables al navegador: la tabla virtualizada mide 0 en jsdom)');
  }

  // Salida explícita: useOfflineSync deja un temporizador vivo y, al no
  // desmontar el DOM, este proceso no terminaría por sí solo.
  console.log('\n========================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error no controlado en la sonda:', err);
  process.exit(1);
});