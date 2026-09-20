# Plan de Reforma Arquitectónica

Estado: **Fase 0 completada**. Fases 1–6 pendientes.
Regla de oro: una fase entra a `main` solo cuando la anterior está verde (`npm run verify`).
Protocolo Ponytail: cada fase busca el código mínimo efectivo, sin dependencias nuevas salvo justificación explícita.

---

## Arquitectura objetivo

Organización por **dominio** con dependencias apuntando hacia dentro:

```
src/
├── domain/            puro, sin DOM ni React
│   ├── vencimientos/    fechas, políticas, estados, acción por política
│   ├── inventario/      identidad de entidad, consolidación CU_VC
│   ├── conteo/          clasificador 4 estados, matriz de cuadratura
│   └── columnas/        alias semánticos, mapeo
├── data/              persistencia y sincronización
│   ├── storage/         puerta ÚNICA + validación zod
│   ├── sheets/          Apps Script client
│   ├── mirror/          espejo de backend
│   └── offline/         cola de mutaciones
├── platform/          worker, HTTP, IndexedDB, PWA
├── state/             contextos particionados + hooks de orquestación
└── ui/                por feature: inventory/ counting/ events/ settings/ common/
```

Grafo de dependencias: `ui → state → data/platform → domain`. Nunca al revés.
La estructura objetivo se alcanza **al final**, moviendo módulos ya limpios: mover y
refactorizar a la vez multiplica el riesgo.

---

## Fases

### Fase 0 — Red de seguridad · COMPLETADA

- [x] Infra de pruebas de componente: `jsdom` + `tests/harness.tsx`, reutilizando el
      arnés `tsx` existente (sin runner nuevo).
- [x] Pruebas de caracterización del cableado de agrupación (`tests/components.test.tsx`).
      Verificado que **fallan** si se reintroduce el no-op silencioso.
- [x] Regla ESLint `no-restricted-syntax` que prohíbe `props.X ?? dashboard.X` en código
      nuevo, con la lista actual de 11 archivos congelada en `overrides`.
- [x] Script `npm run verify` = `tsc --noEmit && eslint src tests && npm test`.

Nota: el DOM se instala con guarda de idempotencia y **solo** en las pruebas que lo
necesitan. Cargar jsdom globalmente cambiaría las ramas `typeof window` de
`stockCountUtils.ts`, `indexedDbService.ts` y `backendMirrorService.ts`, y debilitaría
la verificación existente.

### Fase 1 — Contexto: memoizar y particionar

#### Medición en navegador real (Chromium 152 via CDP, sin Playwright)

Instrumento: `tests/perf/profile.cjs` inyecta el hook de React DevTools antes del
primer script de la página, siembra 400 filas en `localStorage` y, tras esperar
estado ocioso, mide por acción: commits, fibras renderizadas y `actualDuration`
por componente. Uso:

```bash
npx vite --port=3000 --host=127.0.0.1 &
node tests/perf/profile.cjs http://127.0.0.1:3000/ /tmp/perf.json 4
node tests/perf/inspect.cjs http://127.0.0.1:3000/   # volcar el DOM si algo no cuadra
```

Acción medida: **abrir/cerrar el panel lateral "Vistas & Ajustes"**, que es UI
pura y no toca datos. Cualquier re-render de filas aquí es memoización rota.
Resultado con 400 ítems (25 filas visibles), medido 4 veces con conteos estables:

| Métrica | `c4a66c7` (antes) | HEAD (tras estabilizar handlers) |
| --- | --- | --- |
| Commits por apertura | 1 | 1 |
| Fibras renderizadas | ~1700 | ~1700 |
| `DashboardProvider` | ~210 ms | ~214 ms |
| `InventoryTable` | ~12 ms | ~12 ms |
| Celdas `tr`+`td` | 181 | 177 |

Conclusiones (corrigen el diagnóstico previo, que era una suposición):

1. **Estabilizar handlers fue correcto pero no movió la aguja.** HEAD y `c4a66c7`
   son indistinguibles dentro del ruido. Los props estables no ayudan si el
   consumidor se re-renderiza igual por la cascada del padre.
2. **`InventoryDashboard` es un componente monolítico de ~2.200 líneas con 54
   `useState`.** Abrir un panel de UI re-renderiza el dashboard **entero**: 1
   commit, ~1700 fibras, `InventoryDashboard` 39 ms y `DashboardProvider` 37 ms
   (con 400 filas, ~214 ms). El coste no está en las filas ni en las props, está
   en el cuerpo del dashboard.
3. **La memoización del value del contexto es imposible hoy, y esa es la causa
   raíz del warning de `saveConfig`.** El value de `DashboardProvider` no va en
   `useMemo`; es un literal de ~224 miembros construido en línea (línea ~2050) y
   se recrea en cada render. Por eso el lint señala `saveConfig` "causa que el
   value del contexto cambie en cada render": el value ya cambia siempre.
4. **El estado de UI vive en el value.** `isRightDrawerOpen` / `setIsRightDrawerOpen`
   son miembros del contexto (2072-2073), igual que docenas de flags de modales.
   Abrir el panel cambia una dependencia del value y **`InventoryTable` se
   re-renderiza dos veces por acción** (confirmado con contador en el cuerpo del
   componente; ver "Correcciones al diagnóstico" más abajo).
5. **La partición del contexto rinde poco por sí sola.** Ningún consumidor grande
   está en `React.memo` (`InventoryTable`, `ViewConfigControlDrawer`,
   `DashboardTopNav`, `DashboardFilterPanels`) y `DashboardTableContainer`
   tampoco, y es hijo directo del dashboard. La cascada del padre los
   re-renderiza con independencia del contexto.

#### Ejecutado: 1.1 — sacar el estado de UI del value (medido)

Se implementó **1.1** con el alcance mínimo que cierra la causa raíz medida, sin
tocar las otras ~200 entradas del value:

- Nuevo `src/context/RightDrawerContext.tsx`: `RightDrawerProvider` posee
  `isRightDrawerOpen` y `useRightDrawer()` lo expone con fallback no-op.
- `App.tsx` envuelve `<InventoryDashboard />` en `RightDrawerProvider`.
- `InventoryDashboard` **ya no declara** el `useState` ni lo publica en el value;
  los 3 abridores (`DashboardPageHeader`, `DashboardTopNav`, `ZenModeOverlay`) y
  el `ViewConfigControlDrawer` lo leen del contexto nuevo.

Resultado medido con el mismo instrumento, 4 repeticiones, conteos estables:

| Métrica (abrir/cerrar "Vistas & Ajustes") | `c4a66c7` | HEAD con 1.1 |
| --- | --- | --- |
| Commits por acción | 1 | 1 |
| `InventoryTable` renderiza | **2 de 2 veces** | **0 de 2 veces** |
| Filas (`InventoryTableRow`) | 0 | 0 |
| Trabajo por commit (suma de self-time) | **270 ms** | **70.6 ms** (−74%) |

#### Correcciones al diagnóstico anterior (la medición las desmiente)

1. **"Las 25 filas re-renderizan al abrir el panel" era falso.** Un contador
   temporal dentro de `InventoryTableRow` devolvió `0` renders tanto en `c4a66c7`
   como en HEAD. El `tr`=26 observado era un **artefacto de atribución**:
   `actualDuration` es inclusiva del subárbol y React la hereda en subárboles que
   no re-renderizan, así que un `<tr>` saltado aparece como "renderizado". El
   instrumento ahora calcula **self-time** (resta la duración de los hijos) y
   expone `commitsDetail` por commit; el hook además ya no trunca `byName` a 25
   entradas, que ocultaba componentes grandes en la lista.
2. **"`DashboardProvider` ~210 ms" medía el subárbol, no el provider.** Con
   self-time, `DashboardProvider` cuesta ~0 ms y `InventoryDashboard` ~0 ms: el
   costo real estaba repartido entre el drawer, el top nav y el page header.
3. **El ganador real es `InventoryTable` (2r → 0r)**, no las filas. La tabla se
   re-renderizaba dos veces por acción porque su padre directo
   (`DashboardTableContainer`, no memoizado) y ella misma consumen `useDashboard`
   y el value cambiaba al abrir el panel. Al dejar de cambiar el value, React
   corta la cascada.

Lección de método: la instrumentación por fibra sola induce a error. Toda
conclusión sobre "quién re-renderiza" debe confirmarse con un contador en el
cuerpo del componente (verdad de terreno) antes de escribirla.

#### Nuevo hallazgo medido: la vista de impresión se renderizaba siempre (Fase 1.1-bis)

Al medir el escenario opuesto —**teclear en la búsqueda**, que sí mueve datos— apareció
el coste dominante de la app y no tenía nada que ver con el contexto:

| Métrica (teclear 4 caracteres) | Antes | Después |
| --- | --- | --- |
| Trabajo total | **1.032 ms** (~100 ms por tecla) | **796 ms** |
| `TicketPrintView` | **434 ms, 10 renders** | **0 ms** |

**Causa**: `InventoryDashboard` montaba `TicketPrintView` siempre, con *todas* las filas
filtradas por defecto (400 ítems), oculto solo por la clase `hidden`. `display:none` no
evita que React construya el árbol: cada tecla reconstruía ~1.500 fibras de ticket
invisible. El propio comentario del código decía "HIDDEN UNLESS PRINTING", pero el
`items` por defecto contradecía la intención.

**Fix (2 líneas)**: `items={itemsToPrintList ?? []}`. Al arrancar en `null`, la vista no
se monta y se monta sola al imprimir. No es una idea nueva: es el patrón que
`StockCountTerminal` **ya usaba** (`useState<InventoryItem[]>([])`). Se alineó el
dashboard a la convención existente.

**Por qué la impresión no se rompe** (verificado, no asumido): `handlePrintTicket` hace
`setItemsToPrintList(items)` y después llama a `executeThermalPrint`, que mide el DOM
dentro de un `setTimeout(120ms)`. React agrupa ambos `setState` y hace commit antes de
que corra ese temporizador, así que el ticket ya está montado. Comprobado interceptando
`window.print()` en Chromium: al dispararse, `#thermal-ticket-root` existe y contiene
"REPORTE VENCIMIENTOS… Total ítems: 1… [SKU-1000]… Lote: L-9000".

**Limitación conocida (documentada, no arreglada)**: `itemsToPrintList` nunca se limpia,
así que **después de imprimir una vez el ticket queda montado** y el coste reaparece
(proporcional a los ítems impresos, no a las 400 filas). No se limpia en `onAfterPrint`
a propósito: varios navegadores disparan `afterprint` antes de rasterizar y se arriesga
una impresión en blanco, que es un fallo peor que el rendimiento. Candidato futuro.

**Residual (siguiente cuello, Fase 3)**: quedan ~200 ms por tecla porque el dashboard
re-renderiza su cuerpo entero y arrastra la tabla. Atacarlo es trabajo de Fase 3
(monolito de 53 `useState`), no del contexto.

#### Verificación de la Fase 1.2: memoizar el value NO sirve por sí solo (medido)

Se intentó primero lo que pedía el plan (1.2: envolver el value en `useMemo`) y **se
descartó con evidencia** antes de escribirlo. Se instrumentó el value con un contador de
miembros cambiados por render:

- **Abrir "Vistas & Ajustes": 0 renders del dashboard y 0 de los 220 miembros cambian.**
  Tras 1.1 el panel ya no toca el dashboard en absoluto.
- **Teclear: 14 renders y 233 cambios de miembros** (unos 16 por render).

Esos 16 no son ruido: **9 son handlers sin `useCallback`** (`handleSave`,
`handleApplyBulkEdit`, `handlePrintTicket`, `handleBulkDelete`, `handleSyncOfflineQueue`,
`handleStartResize`, `handleAutoFitColumn`, `handleResetColWidths`, `handleSaveTicketConfig`)
más `otherSheets`, que se deriva en cada render.

Conclusión: un `useMemo` con 220 dependencias solo estabiliza el value si **ninguna**
cambia, y en escritura cambian 16 fuentes por render. **1.2 aislado no puede rendir.**
El orden correcto es: sacar los flags de UI del value (1.1, hecho) → estabilizar o
extraer las ~9 funciones → *entonces* memoizar. Se evitó escribir un `useMemo` inútil
y frágil (220 dependencias es una deuda que se pudre sola).

#### Pendiente de la Fase 1 (1.2 y 1.3)

- **1.2 — Envolver el value en `useMemo`.** No se hizo, y la medición explica por qué:
  con 220 dependencias y 16 fuentes inestables por render, rinde ~0 por sí solo. Antes hay
  que estabilizar o extraer las ~9 funciones sin `useCallback` (ver la sección anterior).
- **1.3 — Particionar por frecuencia de cambio** (`DataContext`, `ViewContext`,
  `ActionsContext`, `FlagsContext`) y memoizar los consumidores grandes
  (`InventoryTable`, `DashboardFilterPanels`) con `React.memo`.
- Los flags de modales restantes (docenas) siguen en el value: la misma cirugía
  de 1.1 aplica a cada uno, y es el siguiente candidato por volumen.

Criterio de aceptación (con verdad de terreno): abrir/cerrar "Vistas & Ajustes" deja el
dashboard en **0 renders** (cumplido) y `InventoryTable` en **0 renders** (cumplido).
El coste de escritura (teclear) bajó de ~1.032 ms a ~796 ms solo quitando el ticket
invisible, y **sigue siendo el verdadero cuello** (~200 ms por tecla por el re-render del
monolito). Medir siempre con `tests/perf/profile.cjs`, que reporta `tableRenders`/`rowRenders`
reales además del análisis por fibra, y `tests/perf/ctxdiff.cjs` para el recambio de miembros
del value. La impresión se verifica con `tests/perf/printcheck.cjs`.

Nota sobre jsdom: `tests/baseline.probe.tsx` sirve para contar commits, pero sus
milisegundos no son extrapolables (la tabla virtualizada mide 0 sin
`ResizeObserver`). Para latencias, el instrumento CDP.

### Fase 2 — Eliminar el doble camino

Migrar los 11 archivos a leer **solo** del contexto. Al terminar, `grep -c "?? dashboard\."`
= 0 y la lista de `overrides` en `eslint.config.mjs` debe quedar vacía.

### Fase 3 — Delgazar `InventoryDashboard.tsx` (2.275 líneas, 54 `useState`)

Extraer a hooks: `useInventoryData`, `useDashboardViewState`, `useInventoryActions`,
`useDashboardModals`. Objetivo: componente orquestador ≤400 líneas.

### Fase 4 — Puerta única de persistencia

20 archivos acceden a `localStorage` saltándose `STORAGE_KEYS`; 28 `JSON.parse` sin
validar, con `zod` instalado. Centralizar y validar en el borde. Paralelizable con Fase 3.

### Fase 5 — Dividir monolitos

`stockCountUtils.ts` (1.487) · `StockCountTerminal.tsx` (2.751) ·
`CampaignConsolidationDashboard.tsx` (1.399) · `SliceEditorModal.tsx` (1.186).

### Fase 6 — Rendimiento y empaquetado

Bundle principal 1.650 KB (455 KB gzip) y CSS 208 KB. `React.memo` donde el profiler lo
justifique; evaluar `manualChunks`. **No añadir `manualChunks` sin medir antes.**

---

## Guardarraíles (Ponytail)

- **No** añadir Redux/Zustand/MobX. Contexto particionado + `useSyncExternalStore` cubre el caso.
- **No** reescribir a carpetas por feature de golpe.
- **No** tocar la cola offline ni la máquina de estados del conteo sin necesidad:
  ahí vive la invariante de prevención de pérdida de datos.
- **No** optimizar por corazonada: cada cambio de rendimiento se justifica con el profiler.

---

## Deuda conocida (no introducida por este plan)

- `xlsx` tiene una vulnerabilidad de severidad alta sin fix disponible
  (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). Revisar alternativa en Fase 6.
- 20 warnings de `react-hooks/exhaustive-deps` preexistentes, varios ligados a la
  inestabilidad del contexto (Fase 1 los cierra).