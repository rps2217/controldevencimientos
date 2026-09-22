# Plan de Reforma Arquitectónica

Estado: **Fases 0 y 2 completadas**; Fase 1 (1.3 en curso), 3–6 pendientes. Deuda `any`
saldada en todo `src`: **1 solo `any`** declarado (la firma de índice de `SheetRecord`,
justificada abajo). Riesgo `xlsx` cerrado (alias a 0.20.3, `npm audit` limpio).
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
      nuevo. Sin `overrides`: tras cerrar la Fase 2 (11/11) la regla aplica a todo `src`.
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

#### Hecho: flags de modales extraídos a `ModalsContext` (1.3, primer corte)

Los 19 flags de los modales de UI pura (`isConfigOpen`, `isPmReportOpen`,
`isBulkImportOpen`, `isStockCountOpen`, `quickTraspasoItem`…) vivían en el value
del dashboard. Se extrajeron a `src/context/ModalsContext.tsx`, montado dentro de
`RightDrawerProvider` en `App.tsx`.

El diseño separa **estado** de **acciones** a propósito:

- `ModalsStateContext`: cambia al abrir/cerrar. Solo lo leen los dos componentes
  que de verdad pintan según el flag (`DashboardModalsManager`,
  `DashboardMobileDrawer`).
- `ModalsActionsContext`: bundle de setters de `useState` (identidad estable por
  contrato de React) más tres acciones compuestas (`openQuickTraspaso`,
  `openWhatsApp`, `openEmail`). Los componentes que solo *abren* modales (el
  dashboard, `DashboardTopNav`, `FloatingBulkActionBar`, `Sidebar`…) consumen solo
  esto, de modo que abrir un modal no los re-renderiza.

Medición en Chromium real (`tests/perf/modals.cjs`, sin contadores en el código de
la app), abrir "Configuración global":

| Métrica | Antes | Después |
| --- | --- | --- |
| Renders del dashboard | 2 | **0** |
| Renders de `InventoryTable` | 2 | **0** |
| Long tasks | 54 ms | **ninguna** |
| Commits | 1 | 1 |
| Encabezado visible del modal | — | "Configuración General y Diccionario" |

El último script ya no instrumenta los componentes: reporta commits y long tasks
del hook, más el encabezado visible para no medir un gesto que no abrió nada. El
hook por fibra atribuye mal los bailouts, así que los conteos de renders quedan como
evidencia histórica del diagnóstico, no como instrumento permanente.

**Bug latente corregido de paso**: `DashboardTopNav` hacía
`props.setIsMobileMenuOpen ?? (() => {})` y el dashboard nunca le pasaba la prop, así
que el botón de menú móvil era un no-op silencioso. Ahora cae en
`modalsActions.setIsMobileMenuOpen` y el drawer sí abre.

El neto es **−100 líneas** (178 borradas, 78 añadidas): el value del dashboard pierde
38 entradas y deja de recrear 19 `useState`.

#### Hecho: flags de Slices extraídos a `ModalsContext` (1.3, segundo corte)

Los tres flags del gestor/editor de Slices (`isSliceManagerOpen`, `isSliceModalOpen`,
`editingSliceModalItem`) tenían el mismo perfil que los de modales: los lee
únicamente `DashboardModalsManager`, y nadie los consulta dentro de `useTableSlices`
(solo se declaraban y devolvían). Pero al vivir en `useTableSlices`, que corre en el
cuerpo de `InventoryDashboard`, cambiarlos re-renderiza el dashboard entero (2.202
líneas) igual que antes de la Fase 1.

Se movieron a `ModalsContext` y se añadió la acción compuesta `openSliceEditor`, que
sustituye el par `setEditingSliceModalItem` + `setIsSliceModalOpen` repetido en tres
consumidores. El hook deja de declararlos y el value del dashboard pierde 6 entradas.

Medición en Chromium real (`tests/perf/modals.cjs`), abrir "Administrador de Vistas
(Slices)" con el encabezado verificado como montado:

| Métrica | Antes | Después |
| --- | --- | --- |
| Long tasks | 60 ms | **ninguna** |
| Commits | 1 | 1 |
| Encabezado visible del modal | "Administrador de Vistas (Slices)" | igual |

El mismo script cubre en una sola corrida "Configuración global", "Acción PM" (que
requiere seleccionar filas para que se monte la barra flotante) y el gestor de Slices;
las tres cerraron con **1 commit y ninguna long task**.

Criterio de aceptación (con verdad de terreno): abrir/cerrar "Vistas & Ajustes" deja el
dashboard en **0 renders** (cumplido) y `InventoryTable` en **0 renders** (cumplido).
El coste de escritura (teclear) bajó de ~1.032 ms a ~796 ms solo quitando el ticket
invisible, y **sigue siendo el verdadero cuello** (~200 ms por tecla por el re-render del
monolito). Medir siempre con `tests/perf/profile.cjs`, que reporta `tableRenders`/`rowRenders`
reales además del análisis por fibra. La impresión se verifica con
`tests/perf/printcheck.cjs`.

Nota (auditoría Ponytail): `tests/perf/ctxdiff.cjs` se **retiró**. Dependía de
`window.__ctxPrev`/`__ctxRenders`, instrumentación que se eliminó del código de
producción al cerrar el diagnóstico de Fase 1, así que reportaba `members: 0` y
acciones vacías: un instrumento muerto. Para medir coste de interacción usar
`modals.cjs` (commits + long tasks) y `profile.cjs` (renders reales de tabla/fila),
más `corruptcheck.cjs`/`startupcorruption.cjs` para robustez de arranque.

Nota sobre jsdom: `tests/baseline.probe.tsx` sirve para contar commits, pero sus
milisegundos no son extrapolables (la tabla virtualizada mide 0 sin
`ResizeObserver`). Para latencias, el instrumento CDP.

### Fase 2 — Eliminar el doble camino · COMPLETADA (11 de 11)

Migrar los 11 archivos a leer **solo** del contexto. Resultado: **168 → 0** ocurrencias
de `props.X ?? dashboard.X`; el `overrides` de ESLint se eliminó por completo.

**Hecho**: migrados `InventoryTable` (59), `DashboardTopNav` (23), `ViewConfigControlDrawer`
(22), `DashboardFilterPanels` (21), `FloatingBulkActionBar` (13), `DashboardTableContainer`
(8), `DashboardPageHeader` (6), `DashboardMobileDrawer` (4), `DashboardMobileFABs` (3) y
`ZenModeOverlay` (3). Todos se renderizan sin props (o, en el caso de la tabla, el
contenedor dejó de reenviar `{...props}`), así que la ruta por props era código muerto.

Se eliminaron además las interfaces `*Props` que quedaron huérfanas y los imports de tipos
que solo existían para declararlas. Las 3 advertencias `useMemo` que quedaban en
`InventoryTable`/`ViewConfigControlDrawer` salen de sus listas de dependencias.

**`Sidebar` (la excepción que se creía legítima)**: el aparente conflicto era clasificar
mal las props. Los **datos** —colapso, vista activa, catálogo— son idénticos para ambos
montajes y viven en el contexto; lo único propio del drawer móvil es **comportamiento**
(cerrar el menú al navegar, no ofrecer colapso). `SidebarProps` se reduce a dos props de
comportamiento (`forceExpanded`, `onNavigate`) y el componente resuelve una única fuente
de datos. La ruta doble era una confusión de categorías, no un requisito: se eliminó sin
contexto nuevo para un solo consumidor.

**Hallazgo colateral (código muerto real)**: `ViewConfigControlDrawer` tenía el botón
"Espejo Backend REST / Dual-Write" tras `props.onOpenBackendMirror &&`, prop que **nadie
pasaba y sin fallback de contexto**: nunca se renderizó. El acceso al espejo sigue en la
pestaña correspondiente de `GlobalConfigModal`, así que el botón se eliminó (y el icono
`Database` con él). Era el único prop de todo el repo con la forma `= props.X;` sin fallback.

**Evidencia**: `npm run verify` verde (152 unitarias + 7 de componente + 18 de hoja de
cálculo, 0 fallos), 0 errores de ESLint, build PWA OK. E2E sobre el build de producción:
9 arneses OK, incluido el nuevo `sidebarcheck.cjs` que cubre colapso/expansión en
escritorio y el drawer móvil (forzado expandido, sin colapso, cierra al navegar).

### Fase 3 — Delgazar `InventoryDashboard.tsx` (~2.190 líneas, ~34 `useState`)

Extraer a hooks: `useInventoryData`, `useDashboardViewState`, `useInventoryActions`,
`useDashboardModals`. Objetivo: componente orquestador ≤400 líneas.

**Por qué esta fase importa, y no estabilizar callbacks**: se midió que memoizar los
handlers del `value` **no mejora el tecleo**. El disparador es `searchTerm`, miembro del
`value`: mientras sea así, ningún `useMemo` lo estabiliza, y tocar 9 handlers que
**escriben datos** (riesgo de closures obsoletos) no paga. El coste del tecleo está en el
re-render en cascada del shell, no en la identidad de los callbacks.

#### Hecho — buscador con respuesta inmediata y propagación diferida

`useDebouncedSearch` (`src/hooks/useDebouncedSearch.ts`), aplicado en `DashboardTopNav` y
`ZenModeOverlay`. El input deja de estar controlado por el estado del contexto: refleja
la tecla al instante (estado local) y sólo el valor diferido dispara el re-render caro.
`useDeferredValue` no resuelve esto —difiere el render del propio componente, no el
re-render en cascada hacia arriba—, por eso no se reutilizó.

Medido en A/B contra el código anterior (mismo dataset, 25 filas, perfilador CDP):

| Métrica | Antes | Después |
|---|---|---|
| Commits al teclear "PARA" | 14 / 16 | 8 / 10 |
| Trabajo del perfilador | 771 / 775 ms | 486 / 631 ms |
| Latencia por tecla (mediana) | 29 ms | 22 ms |
| Latencia por tecla (p95) | 69 ms | 22 ms |

Honestidad sobre estos números: **22 ms es el suelo de `requestAnimationFrame`**, no
trabajo real, así que la mediana no demuestra por sí sola una mejora; el dato que sí la
demuestra es el p95 (69→22, ya sin picos de jank) y la caída de commits y trabajo. En un
dataset de 25 filas el tecleo ya era tolerable; el ahorro escala con el tamaño de la
tabla, que es donde el commit de ~79 fibras pesa.

La corrección funcional se verificó con `tests/perf/searchcheck.cjs`, que es una prueba de
comportamiento, no de milisegundos: escribe un SKU existente (la tabla pasa de 23 a 1
fila), confirma que el texto permanece en el input y que el botón global "Limpiar todos
los filtros" lo vacía dejando la tabla coherente. Es el caso de mayor riesgo del input no
controlado: si la sincronización externa fallara, el texto quedaría en pantalla mientras
la tabla ya no filtra.

#### Observación abierta — resuelta (era un artefacto de medición)

Se investigó si el raíz se re-renderizaba de verdad al teclear. **No lo hace**: con el
debounce, las 4 teclas no provocan ninguna ejecución del cuerpo de `InventoryDashboard`;
las 4 pasadas reales (×2 por StrictMode) llegan ~250 ms después, al propagarse el valor.

El perfilador **sí listaba** `InventoryDashboard` en cada commit de tecleo, y eso llevó a
una contradicción útil: un contador dentro del cuerpo del componente (que sólo corre si
React ejecuta la función de render) decía cero renders durante el tecleo, mientras el
hook de DevTools decía uno por tecla. Volcando los campos del fiber en esos commits se
entendió: llegan con `lanes=0` y `childLanes=0`, es decir, el componente no se re-renderiza
por sí mismo; el hook lo cuenta igual porque `walkOne` suma fibras con `actualDuration > 0`,
y una fibra con bailout conserva la duración de su pasada anterior.

**Consecuencia para medir**: las cifras de `self`/`renders` **por componente** del hook
están infladas por esa atribución; sirven para commits (que son reales) y para el total,
pero no para decidir qué componente renderizó. Un filtro por `actualStartTime >= 0`, que
en teoría descartaría las fibras con bailout, **no** corrige el problema en React 19. Para
saber si un componente renderiza de verdad, instrumentar su cuerpo o usar el Profiler de
React DevTools en la UI, no este hook.

**Pendiente de esta fase**: la extracción de `useInventoryData`/`useDashboardViewState`/
`useInventoryActions`/`useDashboardModals`. Con la observación resuelta, no queda palanca
grande conocida en el tecleo, así que la prioridad pasa a la Fase 4 restante.

#### Re-auditoría Ponytail — corroboración con señales independientes (Fase 1.3)

Se re-midió el tecleo con tres señales que **no** dependen del hook de DevTools, para
cerrar la palanca sin reabrirla:

| Señal (build de producción, sin StrictMode) | Resultado |
| --- | --- |
| `PerformanceObserver` de `longtask` al teclear 8 caracteres | **0 tareas largas**, peor frame **42 ms** |
| Mutaciones DOM reales por propagación de búsqueda | **31 atributos**, **0** nodos de fila |
| Latencia percibida (última tecla → la tabla cambia de filas) | **~205 ms** (≈ el debounce de 250 ms) |

Las tres coinciden con la conclusión anterior: **no hay jank de tecleo**. El "5 commits y
6.166 fibras por tecla" que el hook reporta en el peor caso es el artefacto de atribución
ya descrito, no trabajo real.

Se evaluó y **descartó** el refactor propuesto para esta fase (envolver en `useCallback`
los handlers del `value` y/o particionar el contexto): los handlers inestables no son el
disparador del re-render (lo es `searchTerm`, miembro del contexto), así que cambiar su
identidad no mueve la métrica percibida, y particionar por frecuencia de cambio agrega
superficie de estado sin beneficio medido. Aplica la Escalera de Ponytail: si no mejora lo
medido, no se escribe.

**Consecuencia**: la palanca de tecleo queda cerrada con evidencia; la Fase 1.3 se reduce a
la extracción de hooks antes listada, que es trabajo de mantenibilidad, no de performance.

#### Hecho: `useCloudConfigSync` y `useTicketPrinting` (1.3, cortes por cohesión)

Los cortes por "frecuencia de cambio" (`DataContext`/`ViewContext`/…) se descartaron por no
mover lo medido. La extracción se hizo por **cohesión de dominio**, que sí reduce el archivo
sin riesgo de comportamiento:

- **`useCloudConfigSync`** (68 líneas): los 4 estados de la configuración en la nube
  (`hasCloudConfigSheet`, `cloudConfigSheetName`, `configStorageMode`, `syncSuccessMessage`)
  y los dos empujes (PropertiesService y pestaña `_CONFIG_APP`). El estado vive en el hook
  porque `fetchData` y los handlers comparten el dato de *dónde se encontró* la configuración,
  que decide a dónde se reescribe; los setters se exponen para que la carga lo registre.
- **`useTicketPrinting`** (89 líneas): estado e impresión del ticket térmico. Al invocarlo
  **después** de `saveConfig` y recibirla por parámetro, desaparece la TDZ que impedía
  envolver `handleSaveTicketConfig` en `useCallback`.

`InventoryDashboard.tsx`: **2.190 → 2.120 líneas**. El diff neto es de −70 (28 inserciones,
98 borrados). Sin cambios de comportamiento: `npm run verify` verde y los E2E
`printcheck`, `modals`, `groupcheck` y `searchcheck` en OK sobre el build de producción.
Además baja de 9 a 8 las advertencias `exhaustive-deps` del archivo (una se va con el código
movido), y no se añade ninguna.

Queda pendiente el resto de la extracción (`useInventoryData`, `useDashboardViewState`,
`useInventoryActions`, `useDashboardModals`), a abordar con el mismo criterio: cortes
cohesionados, cada uno verificado contra `verify` + los E2E aplicables.

#### Hecho: `useDashboardChromeState` (3, corte por presentación pura)

Siguiente corte por cohesión: los flags de **chrome** sin relación con los datos
(`isSidebarCollapsed`, `areFiltersVisible`, `isSchemaLoading`, `isSummaryView`, `isZenMode`,
`tableDensity`) más sus dos efectos (persistencia y atajo `Escape`) y el
`handleToggleSummaryView`. Se agrupan porque su perfil es idéntico y ninguno participa del
ciclo de carga de datos.

Ganancia colateral de la Fase 4: la densidad de tabla persistía con `localStorage` crudo
(`safeParse` a mano y un `setItem` en `try/catch`); ahora pasa por la puerta de
`appStorage`. **Ojo con el formato**: la densidad se guardaba como **cadena cruda**
(`ultra`), no como JSON, así que enviarla por `readStorage`/`writeStorage` habría hecho
`JSON.parse("ultra")` → fallback silencioso y habría perdido la preferencia ya elegida.
En vez de migrar el formato en disco (riesgo sin beneficio), se añadieron
`readRawStorage`/`writeRawStorage` a la puerta, que validan contra el esquema sin
reinterpretar el contenido. 4 aserciones nuevas en `test-modules.ts` lo fijan.

`InventoryDashboard.tsx`: **2.120 → 2.081 líneas** (39 menos; el hook nuevo tiene 96).
`tsc` limpio, ESLint sin errores (20 warnings preexistentes), 152 + 7 pruebas en verde y
los E2E `groupcheck`, `modals` y `searchcheck` en OK sobre el build de producción.

#### Hecho: `useInventoryData` (3, corte por cohesión del ciclo de carga)

El corte pendiente de mayor valor era `fetchData` (283 líneas), pero no se había abordado
porque ocupaba el centro de un **ciclo real entre hooks**: `useOfflineSync` necesita
`fetchData` para recargar tras vaciar la cola, y `fetchData` necesita `setIsOffline` y
`setLastCachedAt` de `useOfflineSync`. El hook nuevo agrupa los 11 estados de datos
(`metadata`, `activeSheet`, `headers`, `items`, `allMainItems`, `products`, `policies`,
`isRelationalActive`, `loading`, `error`, `isBackgroundSyncing`) y el ciclo de carga
*stale-while-revalidate*.

**Cómo se rompió el ciclo**: `useOfflineSync` ya guardaba su callback en un `useRef`
interno, así que basta con darle un puente equivalente. El componente declara
`fetchDataRef` y lo asigna *después* de `useInventoryData` (`fetchDataRef.current = fetchData`);
el callback de sincronización lee `fetchDataRef.current?.(...)` al vaciar la cola, es decir
en tiempo de evento, no de render. No hay closure obsoleta (el ref siempre apunta a la
última versión) y no se creó ninguna dependencia circular entre hooks. La opción de
duplicar los setters de estado offline dentro del hook se descartó: rompería la única
fuente de verdad.

Los estados de datos se movieron a **antes** de sus consumidores tempranos (`frcBodCol` los
usa en el render, `useItemFormModal` los recibe por parámetro), lo que obligó a reordenar
`sheetConfig` + `useCloudConfigSync` un poco más arriba. `setMetadata`, `setLoading`,
`setError` y `setIsRelationalActive` sólo se usan dentro del hook: no se re-exponen.

`InventoryDashboard.tsx`: **2.081 → 1.818 líneas** (263 menos; el hook nuevo tiene 381).
`tsc` limpio, ESLint sin errores (20 warnings preexistentes), **177 pruebas en verde**
(152 + 7 + 18), `npm run build` OK y los E2E `searchcheck`, `groupcheck`, `modals`,
`startupcorruption` y `latency` en OK sobre el build de producción (mediana de tecleo
22 ms, sin regresión).

#### Red de seguridad antes de `useInventoryActions`: `mutcheck.cjs`

Antes de mover los handlers de mutación (guardar, editar y eliminar) se midió su
cobertura: **cero**. Ninguna prueba unitaria ni E2E tocaba `handleSave`, `handleDelete`,
`handleBulkDelete`, `handleApplyBulkEdit` ni `handleUniversalImportConfirmed`, que son la
ruta crítica de pérdida de datos y las que mueven la cola offline y el rollback. Mover ese
código sin red habría incumplido un guardrail no negociable (`AGENTS.md` §5).

Se añadió `tests/perf/mutcheck.cjs`, conductual y en modo demostración (sin red), con tres
casos sobre el DOM real:

| Caso | Señal exigida |
| --- | --- |
| Crear | Se guarda un SKU nuevo y una búsqueda posterior lo encuentra (1 fila). |
| Editar | Al cambiar la descripción desde el drawer, el valor nuevo aparece en la tabla. |
| Eliminar | Tras confirmar, el SKU ya no aparece (0 filas). |

Dos decisiones de diseño del arnés, por señales que engañaban:
- **No contar filas totales**: la paginación rellena la página, así que el total no cambia
  de forma observable al crear/eliminar. Se aísla cada caso con el buscador, que es una
  señal independiente de la paginación.
- **Desambiguar el botón de confirmación**: el drawer tiene su propio botón "Eliminar" y el
  diálogo monta otro con el mismo texto. Se selecciona por `autoFocus`, que el primario del
  diálogo tiene y el del drawer no.

Resultado verificado: 3/3 en OK. La extracción de `useInventoryActions` queda ahora con
red; su interfaz sería de ~23 parámetros (medido), así que se abordará por sub-bloques
cohesionados y no en una sola pieza.

#### Corte `useTableGrouping`

Segundo corte de Fase 3, sobre un sub-bloque **cohesionado** en vez del bloque entero de
acciones. Se extrajeron a `src/hooks/useTableGrouping.ts` (81 líneas) los dos handlers de
agrupación, el efecto de carga por tabla y el cálculo de `effectiveVisibleHeaders`.
El motivo fue doble:

- **Cohesión de dominio**: los dos handlers repetían la misma escritura de configuración
  (fusionar el ajuste en `tableGroupings[tabla]` y persistir). Ahora comparten un
  `persistGrouping` privado; la duplicación desaparece.
- **Interfaz pequeña**: 9 parámetros, frente a los ~23 del bloque de acciones completo.
  Por la escalera de Ponytail, extraer lo barato primero evita la abstracción especulativa.

`InventoryDashboard.tsx`: **1.818 → 1.773 líneas**. Verificado: `tsc` limpio, ESLint 0
errores (20 warnings preexistentes, sin cambios), 177/177 pruebas, build OK y los E2E
`groupcheck`, `searchcheck` y `mutcheck` en OK.

#### Corte `useInventoryIngestion`

Tercer corte de Fase 3, también por sub-bloque cohesionado. Se extrajo a
`src/hooks/useInventoryIngestion.ts` (304 líneas) todo el **ingesta de filas externas**:
`handleSaveQuickTraspaso`, `handleUniversalImportConfirmed` y `handleSyncRowsToVencimientos`.
Los tres comparten la misma mecánica —normalizar filas, escribir en la nube y, al fallar,
encolar la mutación— y por eso forman una unidad de dominio real.

- **Interfaz de 15 parámetros** para 238 líneas trasladadas, la mejor proporción de los
  cuatro bloques medidos (import+sync 15, `handleSave` 22, bulk-edit/delete 23).
- Se movió **verbatim**; el único ajuste fue tipar `enqueueMutation` como
  `Promise<OfflineMutation>` y `fetchData` como `FetchDataFn`, ambos tipos reales ya
  existentes, en vez de inventar firmas.

`InventoryDashboard.tsx`: **1.773 → 1.549 líneas** (acumulado Fase 3: 2.081 → 1.549, −26%).

**Red de seguridad nueva**: `tests/perf/importcheck.cjs` recorre la ruta completa por la
UI —cambiar a *Incidencias & FRC*, abrir el modal, pegar un TSV, analizar y confirmar— y
exige dos señales sólidas: que aparezca el aviso de consolidación (el handler procesó las
filas) y que el modal se cierre (su `onClose` sólo corre tras resolver el `await
onImportConfirmed`, luego no lanzó).

Dos correcciones de método en esa prueba, por aserciones que engañaban:

- **No buscar el SKU importado en la tabla.** En modo demostración, al cambiar de vista los
  `items` de `main` siguen en estado y la carga de datos de `events` no ocurre, así que la
  tabla no refleja la inserción. La aserción habría fallado por una limitación del modo
  demo, no por el refactor.
- **No exigir el aviso final.** Se autodesvanece antes de una instantánea fiable.

#### Corte `useInventoryBulkActions`

Cuarto corte de Fase 3. Se extrajo a `src/hooks/useInventoryBulkActions.ts` (253 líneas) el
bloque de **acciones masivas**: `handleApplyBulkEdit` y `handleBulkDelete`. Es el bloque de
~23 dependencias que se había dejado pendiente por su tamaño; separarlo en su propia unidad
de dominio —edición y borrado en lote sobre `selectedRowIds`— lo vuelve manejable.

- **Interfaz de 13 parámetros** (no 23): `confirm` y los *toasts* no se pasan como props. El
  hook los obtiene de sus propios contextos (`useConfirm`, `useToast`), evitando engordar la
  interfaz con estado que ya vive en un provider.
- **Tipos reales, no inventados**: `activeSheet: SheetProperties | null` y
  `selectedRowIds: number[]`, tomados del dashboard en vez de uniones defensivas.
- Se movió **verbatim**; los imports que quedaron huérfanos en el dashboard
  (`deleteRows`, `EventCategory`, `EVENT_CATEGORIES`) se retiraron.

`InventoryDashboard.tsx`: **1.549 → 1.377 líneas** (acumulado Fase 3: 2.081 → 1.377, −34%).

**Red de seguridad nueva**: `tests/perf/bulkcheck.cjs`. Prueba la edición masiva en
*Incidencias & FRC* (única vista que la habilita por defecto) y la eliminación en la vista
principal. Señales elegidas para no engañar: el modal de edición se cierra **sólo** después
de resolver `await onApply(...)`, y el borrado se verifica por el **almacén persistido**
(`app_demo_items_main` 400 → 399), no por el conteo de nodos del DOM — la tabla está
virtualizada y sólo renderiza ~23 filas de 400. Igual que en `importcheck`, los *toasts* no
se asertan porque se autodesvanecen antes de una lectura fiable.

Estado acumulado de hooks extraídos en Fase 3: `useInventoryData`, `useTableGrouping`,
`useInventoryIngestion` y `useInventoryBulkActions`.

### Fase 4 — Puerta única de persistencia (**iniciada**)

Corrección de la premisa del plan: **no son "20 archivos saltándose `STORAGE_KEYS`"**.
Sólo **2** archivos usan `localStorage` sin `STORAGE_KEYS` (`ErrorBoundary.tsx` y
`dashboardConfigUtils.ts`); la puerta de claves ya estaba bastante establecida. El riesgo
real son los **28 `JSON.parse` sueltos**, 12 de ellos sin validación.

**Hecho — puerta única de lectura validada (`src/utils/appStorage.ts`)**, reutilizando el
`zod` ya instalado y ya usado en `useItemFormManager`:

- `readStorage(clave, esquema, fallback)` — parsea y **valida con esquema**. Devuelve el
  fallback si el dato está corrupto en vez de lanzar: una preferencia dañada no debe
  impedir arrancar. El tipo no se toma del llamante (eso mentiría); se aplica validando.
- `readStorageValidated(...)` — igual, pero informa `valid`. Distingue **"ausente"** de
  **"corrupto"**: es lo que permite limpiar o avisar sin confundir el primer arranque.
- `writeStorage(clave, valor)` — escritura tolerante (modo privado / cuota llena).
- Esquemas reutilizables: `preferencesObjectSchema`, `stringArrayMapSchema`, `moduleStatesSchema`.

**Migrados** (`useColumnResize`, `useColumnManager`, `useModuleViewState`): 5 lecturas y
5 escrituras. `useColumnResize` era el caso más expuesto: `colWidths[hoja][col]` indexaba
en profundidad sobre un `any` sin comprobar forma.

**Evidencia de que el cambio protege (medido, no asumido)**: con el código anterior, un
localStorage con varias claves corruptas a la vez **rompía el arranque** —
`TypeError: Cannot read properties of null (reading 'main')` en `useColumnManager` y la
app no montaba. Con la puerta validada, los 6 escenarios de corrupción (forma inválida,
JSON malformado, array donde se espera mapa, valor no-objeto, combinación) montan sin un
solo error. Reproducible con `tests/perf/corruptcheck.cjs` (que sirve como prueba de
regresión real, no de laboratorio) y con 9 aserciones nuevas en `test-modules.ts`.

**Corrección de la premisa**: el `null` de `SHEET_CONFIG` **sí era un bug real de
arranque**, no sólo "forma inesperada". Con `appsheet_clone_config = "null"`, el dashboard
hacía `sheetConfig.ticketPrintConfig` sobre `null` y **la app no montaba**
(`TypeError: Cannot read properties of null`, verificado con `startupcorruption.cjs` contra
el código anterior: 0 filas y el error boundary atrapando la excepción). Reparado.

**Migrados también** (arranque del dashboard y preferencias):

- `InventoryDashboard`: `SHEET_CONFIG` (esquema de forma, sólo objeto plano),
  `ZEN_MODE` (`z.boolean()`) y `TABLE_DENSITY` (cadena cruda —no JSON— validada contra
  los tres valores admitidos; antes un valor basura pasaba tal cual).
- `ticketUtils`: `TICKET_CONFIG` devolvía `null`/array como config y reventaba al leer un
  campo. Ahora exige forma de objeto.
- `sliceRegistry`: `HIDDEN_SLICE_IDS` se leía sin guarda; un string suelto (en vez de un
  array) se desparramaba en **caracteres sueltos como IDs ocultos** con `[...localHidden]`.

**Esquema de forma, no campo a campo, a propósito**: `sheetConfigShapeSchema` sólo exige
un objeto plano. Validar sus ~18 campos descartaría configuración válida de versiones
anteriores (y campos que escribe la nube vía PropertiesService), que es el daño que se
quiere evitar; lo que rompía el arranque era `null`/array, y eso se corta igual.

**Evidencia**: `tests/perf/startupcorruption.cjs` siembra `SHEET_CONFIG=null`,
`TABLE_DENSITY=gigante`, `HIDDEN_SLICE_IDS="vencidos"` y `ZEN_MODE=null` a la vez y
comprueba que la tabla monta con 23 filas y **cero** errores de consola; contra el código
anterior falla. 7 aserciones nuevas en `test-modules.ts` (138 pasan, 0 fallan).

**Datos operativos migrados** (misma clase de fallo, verificado contra el código anterior):

- `dashboardConfigUtils.getStoredDemoItems`: un objeto suelto en vez de lista rompía el
  filtrado con `TypeError: sample.forEach is not a function` en `useInventoryFiltering`.
- `indexedDbService`: cola offline (`OFFLINE_QUEUE`) y bitácora (`AUDIT_LOG`) devolvían
  `null` como lista; reventaba en `req.onsuccess (reading 'length')`.
- `stockCountUtils`: sesiones de conteo y campañas. Ya tenían guarda `Array.isArray`, pero
  compartían el JSON.parse suelto; ahora usan la misma puerta (mismo comportamiento válido,
  sin el parse crudo).
- `useOfflineSync`: la config para el espejo de backend se lee por la puerta.
- `ItemDetailDrawer`: campos ocultos, mapa de booleanos.

Esquemas nuevos compartidos: `objectArraySchema` (lista de objetos planos) y
`booleanMapSchema`. Validan **contenedor y forma de cada elemento**, no sus campos: estos
DTO evolucionan entre versiones y algunos los escribe la nube; lo que revienta es un
`null`, un objeto suelto o una lista de escalares donde se espera una lista de objetos.

**Pendiente de Fase 4**: los `JSON.parse` de caché por pestaña (`sheetCacheKey`) y los DTO
de red (`lib/sheets.ts`), que ya se validan aguas abajo; los 2 archivos con acceso directo
a `localStorage`, revisar aparte.

#### Hecho: caché L1 validada, escritura de demo y reset sin pérdida (Fase 4, cierre)

Tres cabos sueltos de la fase, los tres en el camino de arranque:

- **`indexedDbService.getLocalStorageFallback`** hacía `JSON.parse` crudo y devolvía el
  resultado con un tipo mentido (`{ rows: any[][] }`). Un `rows: [1,2,3]` (lista de
  escalares) pasaba el parse y reventaba en `InventoryDashboard` con
  **`TypeError: headers.find is not a function`**, dejando la app sin montar. Ahora usa
  `readStorage` con `cachedSheetSchema` (valida contenedor y que cada fila sea lista de
  celdas). `timestamp` es opcional a propósito: entradas de versiones anteriores pueden no
  traerlo y siguen siendo caché válido.
- **`saveStoredDemoItems`** escribía con `localStorage.setItem` directo; pasa por
  `writeStorage`.
- **`ErrorBoundary.handleClearStorageAndReload`** ("Restablecer Datos Locales") hacía
  `localStorage.clear()`, que **borra el respaldo de la cola offline**. En modo privado
  (sin IndexedDB) ese respaldo *es* la cola, así que el botón de recuperación podía
  destruir mutaciones sin sincronizar. Ahora preserva `OFFLINE_QUEUE` y `AUDIT_LOG`
  alrededor del `clear()`.

**Evidencia (la sonda no es vacía)**: `tests/perf/corruptcheck.cjs` gana 4 casos de caché.
Contra el código anterior, el caso `rows` de escalares da `montada: false` con 2 errores de
consola (`headers.find is not a function`); contra el corregido, los 10 casos montan con
**cero** errores. Se fijó también un control de caché válido, para no confundir "descarta
basura" con "descarta todo". 4 aserciones nuevas en `test-modules.ts` (148 pasan, 0 fallan).

Pendiente real que queda: los 8 `JSON.parse` de **`lib/sheets.ts`** son **respuestas de
red** (Web App de Apps Script), no almacenamiento local: validarlas con esquema es otro
trabajo, y hoy se validan aguas abajo. No se tocaron para no ampliar el alcance.

### Los arneses E2E, convertidos en puerta de CI (2026-09-19)

Decisión tras auditar el árbol: la Fase 4 estaba **esencialmente cerrada** —sus tres
pendientes (caché por pestaña, `JSON.parse` de `lib/sheets.ts` y los 2 accesos directos a
`localStorage`) ya tienen guarda de forma aguas arriba o `try/catch` en el mismo sitio—,
así que seguir ahí era bajo valor. El hueco real era otro, y de más peso:

**Los arneses que protegen la invariante "no perder datos" eran utilidades manuales;
ninguno corría en CI.** Es decir, todo el trabajo de Fase 4 (resiliencia a corrupción,
importación, mutaciones) tenía evidencia que solo se ejecutaba si alguien se acordaba.

Además se encontró un defecto de método: **`corruptcheck.cjs` y `groupcheck.cjs` salían
siempre con código 0**, incluso al fallar, porque nunca calculaban un veredicto. No eran
puertas de regresión, eran informes. Corregidos: ambos emiten `RESULTADO` y devuelven
código distinto de cero si algún caso falla.

**Puerta unificada — `tests/perf/run.cjs` + `npm run test:e2e`**:

- Arranca el build de producción (`vite preview`) y espera a que acepte conexiones antes de
  correr nada; si no levanta, falla en vez de dar falso verde.
- Ejecuta los **8 arneses de integridad**: `corruptcheck`, `startupcorruption`, `offlinecheck`, `mutcheck`,
  `importcheck`, `groupcheck`, `searchcheck`, `bulkcheck`.
- Devuelve código distinto de cero si alguno falla. Sin dependencias nuevas: mismo protocolo
  CDP y el Chrome ya instalado (o `CHROME_BIN`).
- CI (`verify.yml`) gana el job `e2e`, que usa el Google Chrome preinstalado del runner.
  `npm run verify:all` = `verify` + `build` + `test:e2e`, el gate completo local.

Verificado de punta a punta: `npm run verify:all` → `tsc` limpio, ESLint 0 errores, 177
pruebas, build OK y **8 arneses E2E OK**.

#### Arnés del replay offline (`offlinecheck.cjs`)

La ruta más crítica —el vaciado de la cola en `useOfflineSync`— no tenía cobertura E2E.
Las primitivas (`matchRowIndexByIdentity`, `sortQueueFifo`, `isFailedMutation`) sí estaban
probadas, pero la orquestación (qué pasa cuando el backend rechaza una escritura) no.

El arnés levanta un **backend Apps Script simulado en el mismo proceso**, que responde el
protocolo real que habla `fetchFromScript` (`getMetadata`, `getSheetData`, `appendRow`,
`updateRow`, `deleteRow`...), y apunta la app a él. Así puede forzar el fallo de escritura
a voluntad, algo imposible con el backend real.

Dos invariantes verificadas:

1. **Un fallo de red no pierde la mutación**: con el backend rechazando `appendRow`, la
   mutación queda en la cola marcada `failed` con `attempts: 1`; la cola sigue con 1
   elemento.
2. **El reintento drena la cola**: con el backend sano, `Reintentar Conflictos` aplica la
   escritura y la cola queda a 0.

Señales robustas: el estado de la cola se lee del respaldo persistido
(`appsheet_clone_offline_queue`), no de un contador de UI, y el éxito del replay se confirma
por los `appendRow` recibidos en el backend simulado. El único `console.error` esperado (el
rechazo deliberado) se excluye explícitamente para no enmascarar regresiones reales. La
cola de siembra se apoya en el respaldo en `localStorage`, que `getOfflineQueue` migra a
IndexedDB: evita una carrera con el arranque de la app que sí tendría escribir en la BD
directamente.

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

- ~~`xlsx` con vulnerabilidad alta sin fix~~ **RESUELTO**. El fix de SheetJS (0.20.2+)
  existe pero nunca se publicó en npm, por eso `npm audit` reportaba "no fix
  available". Se instala el **artifact oficial** de SheetJS
  (`vendor/xlsx-0.20.3.tgz`) como dependencia `file:`, sin dependencias nuevas ni
  cambios de código. Ver "Riesgo de seguridad" más abajo.
- 20 warnings de `react-hooks/exhaustive-deps` preexistentes, varios ligados a la
  inestabilidad del contexto (Fase 1 los cierra).

---

## Auditoría Ponytail (2026-09-19)

Barrido del repo contra la Escalera de Decisiones. Resultado global: **el árbol está
sano**; la deuda grande ya está inventariada en las fases de arriba y no aparecieron
patologías nuevas. Lo verificado y lo descartado:

**Cierre del riesgo `xlsx` (segunda pasada)**

La premisa registrada ("reemplazar por un lector propio") resultó ser la escalera
resuelta en el escalón equivocado: el fix oficial ya existe, solo que fuera de npm.
- Mitigación aplicada: `file:vendor/xlsx-0.20.3.tgz`, el artifact oficial de SheetJS.
  Ver "Riesgo de seguridad" para la procedencia y el hash.
- El lector propio y `exceljs`/`read-excel-file` se descartaron: dependencia nueva o
  cientos de líneas para un fix que ya está empaquetado. YAGNI.
- Se eliminó el **import estático** de `xlsx` en `MobileErpSnapshotView` (era el único
  que lo metía en el bundle inicial) y se unificó su parseo en `parseSpreadsheetFile`.

**Bugs reales de pérdida de datos encontrados al cubrir el camino de importación**
1. `importPharmacySnapshotToCampaign` recibía matrices 2D (`string[][]`) de la vista
   móvil y de la campaña de consolidation, pero solo leía registros (`row[col]`) →
   **importaba 0 SKUs en silencio**. Ahora normaliza ambas formas en su único punto de
   entrada con `rowToObject`.
2. `parseExcelBuffer` usaba `raw: false`, que entrega el texto *formateado* de la celda:
   un EAN/SKU exportado como número grande se leía como `"1.23457E+12"`, corrompiendo el
   identificador primario. Corregido a `raw: true` + normalización explícita de celdas
   `Date` a ISO local (evita `String(Date)` y desfases por zona horaria).
3. Al fusionar (1) y (2) se corrigió el residual de fechas: las celdas de fecha nativas
   ya no llegan como `"Mon Jun 30 2025 …"`.

Cobertura añadida: `tests/xlsx.test.ts` (18 casos) con fixtures `.xlsx` **generados por
openpyxl**, un productor independiente de la librería bajo prueba, incluidos seriales de
Excel, fechas nativas, SKUs numéricos grandes y round-trip de escritura. Integrado en
`npm test`/`npm run verify`.

**Lo que se corrigió en esta pasada**
- Rama remota stale `ponytail-audit-strict-types`: ancestro de `main` (19 commits
  atrás), residuo del PR #1 ya fusionado. Eliminada. Era la causa de la confusión
  "duplicación de acciones en push". Regla operativa: `git push origin main`, nada más.
- Verificación E2E de la agrupación por columna (`groupcheck.cjs`), que era el último
  cabo suelto de la solicitud original (b).

**Reutilización (escalón 2) — sin hallazgos nuevos**
- `dateCalculations.tsx` parecía una capa de re-export redundante sobre
  `pureCalculations.ts`, pero es la fachada legítima: 16 consumidores la usan de forma
  mixta (funciones puras + badges de UI como `EVENT_CATEGORIES`). No se toca.
- El bloque `JSON.parse` de `indexedDbService.getSetting` es el fallback genérico
  ya cubierto por Fase 4; los de `lib/sheets.ts` son red (ver arriba).
- `InventoryDashboard.tsx:1660` tiene una normalización inline `findHeader` que
  **parece** duplicar `normalizeHeaderString`, pero **no son equivalentes**: la inline
  elimina separadores (`[\s\-_]+` → `''`) y la del helper los convierte en `_`. Unificar
  cambiaría el matching. Se deja como está a propósito.

**Código muerto (escalón 1) — nada accionable**
- Se descartaron ~13 exports marcados inicialmente como "muertos": todos tienen
  consumidor interno o en tests (`encodeCode128`, `consolidateBatchByCuVc`,
  `itemMatchesSlice`, `FAILED_ATTEMPTS_THRESHOLD`, `FIELD_PATTERNS`,
  `normalizeHeaderString`, etc.). Solo son `export` de conveniencia, no residuos.
- 0 `TODO`/`FIXME`; 1 solo `console.log` en `src`.

**Dependencias (escalón 5) — todas justificadas**
- Las 12 dependencias declaradas tienen uso real en `src`. No hay paquetes zombis.
- `dist/` está correctamente ignorado en git (0 archivos versionados).

**Riesgo de seguridad `xlsx` — mitigado (actualizado)**
- `xlsx@0.18.5`: 2 avisos de severidad alta (**Prototype Pollution** GHSA-4r6h-8v6p-xvw6 y
  **ReDoS** GHSA-5pgg-2g8v-p4x9). Se usaba en **2** archivos de producción (no 9):
  `universalImporter.ts` (lectura) y `exportUtils.ts` (escritura).
- El "sin fix disponible" **era un artefacto del registro npm**, no del código: SheetJS
  publica las versiones parcheadas (0.19.3 / 0.20.2+) en su CDN, no en npm. Se vendoriza
  el **artifact oficial** (`vendor/xlsx-0.20.3.tgz`, 2.4 MB, versionado en el repo) y se
  declara como `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`: cero dependencias nuevas, cero
  cambios de código y sin intermediarios.
- **Procedencia verificada**: es el tarball de `cdn.sheetjs.com`, con `name: "xlsx"` y
  `version: "0.20.3"` (no un espejo de terceros). `sha256`
  `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.
  Licencia Apache-2.0 preservada.
- Se evaluó antes un alias npm a un espejo público (`@e965/xlsx`), verificado byte a byte
  contra el oficial; se descartó por depender de la continuidad de un republicador
  ajeno. El `file:` no tiene ese riesgo.
- `npm audit --omit=dev`: **0 vulnerabilidades**. Sin hallazgos adicionales.
- Cargado solo con `import()` dinámico, así que no entra al bundle inicial.

**Tipado estricto — deuda `any` (actualizado 2026-09-23)**
- **1 `any` en todo `src`** (eran 201 el 2026-09-19, 163 el 2026-09-22), 0 `as any`. El
  único remanente es la firma de índice de `SheetRecord` en `types.ts`, deliberada: las
  columnas de una hoja son heterogéneas por diseño (invariante AGENTS.md §6.5). Se
  intentó cerrarla a `string | number | boolean | null` y el compilador produjo ~15
  errores en cascada (solo `string | number | undefined` es asignable a `SheetRecord`
  cuando ambos tienen firma de índice); el intento se revirtió con `tsc` en verde.
- Barrido de esta pasada: `DashboardModalsManager.tsx` (19 → 0), `cuVcConsolidator.ts`
  (12 → 0), `pureCalculations.ts` (8 → 0), `useItemFormManager.ts` (8 → 0),
  `GlobalConfigModal.tsx` (8 → 0), `universalImporter.ts` y `SchemaEditorView.tsx`
  (7/5 → 0), etc. Total: **39 archivos** tocados, 162 `any` eliminados por mapeo a tipos
  ya existentes (`SheetRecord`, `InventoryItem`, `EventCategory`, `SheetRow`,
  `CellValue`, `VirtualColumnDataContext` —este último nuevo, en `types.ts`—).
- Cero dependencias nuevas. `tsc --noEmit` y `eslint src` (0 errores) en verde;
  152 + 7 + 18 pruebas y 8 arneses E2E OK.

**Monolitos (escalón 7) — ya en Fase 5**
- Sin cambios: `StockCountTerminal.tsx` (2.751), `InventoryDashboard.tsx` (2.190),
  `stockCountUtils.ts` (1.475). No se dividen sin motivo: la Fase 5 lo cubre.

---

## Auditoría Ponytail (2026-09-22)

Barrido dirigido tras saldar la deuda `any` de contexto y resolutor. El árbol sigue
sano: no aparecieron patologías nuevas y lo verificado se corrobora con señales
independientes (conteos, herramientas, CI).

**Lo que se corrigió en esta pasada**
- `referenceResolver.ts`: 27 → **0** `any`. Firmas migradas a `SheetRecord[]`; el `?? null`
  que cierra la unión `SheetRecord | undefined` del `Array.find`.
- `DashboardContext.tsx`: 21 → **0** `any`. Cada campo pasó a un tipo que ya existía en el
  repo, no a un `any` renombrado. Efecto lateral valioso: varios campos estaban **peor
  tipados de lo que el runtime admite**, y el compilador destapó dos desalineaciones
  reales (ver abajo).
- `SliceFilterConfig.eventResolutionFilter` alineado a `string[]` (la UI ya lo trataba
  así: `useState<string[]>` → `ColumnFilterMenu.selectedValues`); `dynamicMonthRange`
  admite `null`, como lo emite el filtro.
- `FilterOption` admite `disabled`: los menús ya insertaban separadores con esa clave,
  que hasta ahora viajaba fuera del tipo.

**Alineaciones que el tipado destapó (no son cosméticas)**
1. `groupedItems` **no** es un `Map` sino `Array<[clave, items]>`; `DashboardTableContainer`
   usa `.length`, correcto. Se tipó el arreglo, no se cambió el código.
2. Los props de métricas (`EventResolutionCards`, `EventFilterChips`, `PmRadarCards`)
   ahora toleran `undefined` explícitamente: el contexto puede no traerlas mientras el
   worker procesa. Se resuelven con guarda interna (default / `return null`), sin
   fabricar métricas falsas.

**Verificación**
- `npm run verify`: tsc 0 errores, eslint 0 errores (21 warnings preexistentes de
  `exhaustive-deps`), 152 + 7 + 18 pruebas en verde.
- `npm run build` y `npm run test:e2e` (8 arneses) en verde. CI `verify` reejecutada en
  GitHub Actions sobre el commit del corte: jobs `verify` y `e2e` en **success**.

**Escalones con "sin hallazgos"**
- Código muerto (1): 0 `TODO`/`FIXME`; 1 `console.log` en `src`; los ~13 exports
  "huérfanos" siguen teniendo consumidor interno o en tests.
- Duplicación (2): 0 funciones con el mismo nombre en archivos distintos.
- Dependencias (5): las 12 declaradas tienen uso real; `xlsx` solo por `import()` dinámico.
- Monolitos (7): sin cambio de criterio; los divide la Fase 5.

**Observación abierta (no accionable hoy)**
- 28 escrituras directas a `localStorage` fuera de la puerta `appStorage`
  (`App.tsx` 8, `stockCountUtils.ts` 4, `CampaignConsolidationDashboard.tsx` 4). Es
  exactamente lo que cierra la Fase 4 (puerta única de persistencia); no se toca suelto.

**Siguiente palanca**
- Agotada la deuda `any` de `src` (1 declarado, deliberado). Las palancas siguientes son
  las fases abiertas: Fase 2 (patrón `props.X ?? dashboard.X`), Fase 3 (hooks restantes),
  Fase 4 (escrituras directas a `localStorage`) y Fase 5 (monolitos), en ese orden.

---

## Auditoría Ponytail (2026-09-23)

Barrido de cierre tras agotar la deuda `any`. Todos los conteos son **medidos**, no
estimados, y están anclados a `git show HEAD:<archivo>` para que sean reproducibles.

**Lo que se corrigió en esta pasada**
- Deuda `any`: **163 → 1** (`grep -rhoE ": any|<any>|as any|any\[\]|any>" src`). 39
  archivos tocados. El único remanente es la firma de índice de `SheetRecord`, cuya
  unión falló con ~15 errores en cascada y se revirtió (intento registrado arriba).
- Correcciones de compilación asociadas: `SheetRecord` importado donde faltaba
  (`ViewConfigControlDrawer`, `FloatingBulkActionBar`, `Sidebar` ya de cortes previos);
  `virtualData` tipado como `Record<string, string | number>`; `VirtualColumnDataContext`
  creado en `types.ts` en vez de `any` en la firma de `calculate`.

**Verificación (no asumida)**
- `npm run verify`: tsc 0 errores, eslint 0 errores (20 warnings `exhaustive-deps`
  preexistentes), 152 + 7 + 18 pruebas en verde.
- `npm run build` y `npm run test:e2e` (**8 arneses**) en verde.

**Escalones con "sin hallazgos" (segunda corroboración)**
- Duplicación (2): 0 nombres exportados repetidos entre archivos.
- Código muerto (1): 0 `TODO`/`FIXME`; 1 `console.log` (auto-sync de la cola offline,
  traza operativa deliberada). Los ~13 exports "huérfanos" mantienen consumidor interno
  (p. ej. `normalizeCleanText` con 6 usos propios, `getOffsetMonthName` con 15) o son
  fachada de tests/plantillas embebidas (`APPS_SCRIPT_TEMPLATE`).
- Dependencias (5): sin cambios; las 12 declaradas tienen uso real.

**Desviación de documentación detectada**
- `AGENTS.md` declaraba 7 arneses E2E; son **8** (`groupcheck.cjs` está en el `run.cjs`
  desde el corte anterior). Corregido en la tabla de comandos.
- `ROADMAP.md` declaraba 183 usos de `any`; el conteo real era 163 por el redondeo de
  "usos" vs. firmas tipadas. Unificado al criterio de conteo reproducible de arriba.

## Auditoría Ponytail (2026-09-19) — cierre de Fase 2 y barrido de duplicación

Barrido sobre el árbol con los 9 arneses E2E en verde. Contiene un hallazgo nuevo de
duplicación que las pasadas anteriores no vieron, porque estas buscaban **nombres**
exportados repetidos; esta buscó **cuerpos** de función normalizados.

**Fase 2 cerrada (11/11)**
- El patrón `props.X ?? dashboard.X` llega a **0** (`grep` medido). El `overrides` de
  `eslint.config.mjs` se eliminó: la regla aplica a todo `src`.
- La excepción que se creía legítima (`Sidebar`) era una **confusión de categorías**:
  los datos (colapso, vista activa, catálogo) son idénticos en ambos montajes y viven en
  el contexto; lo propio del drawer móvil es **comportamiento** (cerrar al navegar, no
  ofrecer colapso). Se resolvió con dos props de comportamiento y una fuente única de
  datos, sin contexto nuevo para un solo consumidor.
- Sonda E2E nueva `sidebarcheck.cjs` (registrada en `run.cjs`): 6 pasos que cubren
  colapso/expansión en escritorio y el ciclo del drawer móvil. La sonda **no es vacía**:
  falla si el botón de colapso reaparece en el drawer o si `onNavigate` no cierra el menú.

**Hallazgo de duplicación (real, ya corregido)**
- El **ciclo de vida del escáner de cámara** (`Html5Qrcode`) estaba duplicado en
  `MobileCameraBarcodeScanner.tsx` y `MobilePistoleoTerminalModal.tsx` (y una tercera
  variante en `BarcodeScannerModal.tsx`): `stopScanner`/`stopCameraScanner` eran idénticos
  carácter a carácter y `handleToggleTorch` también; el arranque (selección de cámara
  trasera, `formatsToSupport`, `fps`, `qrbox`, `aspectRatio`, lectura de capacidades de
  *torch*) repetía la misma secuencia con mensajes de error distintos. **Resuelto**:
  extraído a `src/hooks/useBarcodeScanner.ts`, con los tres lectores migrados. Ver
  "Corte: unificación del lector de cámara" más abajo.
- `useOfflineSync.ts` (2 cuerpos) y `SliceEditorModal.tsx` (3 *toggles* de la misma forma)
  son duplicación **estructural**, no literal: cada copia opera sobre un campo distinto
  (`pmRadarFilter`, `eventFilter`, `eventResolutionFilter`) y unificarlas con un helper
  genérico añadiría indirección sin reducir el número de líneas de forma clara.
  Descartado por la Escalera (escalón 7: no hay ganancia medible).

**Corte: unificación del lector de cámara (`useBarcodeScanner`)**
- **Qué se unificó**: la secuencia completa del lector —elegir cámara trasera, arrancar
  con los formatos de bodega, leer capacidades de linterna, debounce de lecturas, parar y
  liberar— más el estado de `status`/`error`/`cameras`/`torch` que cada lector mantenía por
  su cuenta. Las diferencias legítimas (ventana anti-ráfaga, `qrbox`, relación de aspecto,
  detección optimista de linterna, parar tras un disparo) son opciones del hook.
- **Riesgos que el hook elimina**, no sólo líneas: los tres lectores podían dejar la
  cámara encendida al cambiar de modo o desmontar; ahora `stop` se ejecuta también en el
  `cleanup` del efecto. Una **época** (`epoch`) descarta arranques asíncronos que terminen
  después de una parada, así que una cámara ya detenida no revive. Las opciones que cambian
  por render (`qrbox` suele ser una función en línea) viven en un ref: si entraran en las
  dependencias de `start`, el efecto reiniciaría la cámara en bucle.
- **Medición**: −377 líneas en los tres componentes (`BarcodeScannerModal` 236 → 119,
  `MobileCameraBarcodeScanner` 368 → 223, `MobilePistoleoTerminalModal` 967 → 860) contra
  un hook nuevo de ~230 líneas y su lector compartido. Neto: **una** implementación en vez
  de tres. Muere de paso la API especulativa `meta.first` que sólo un consumidor hipotético
  habría usado (YAGNI).
- **Red de seguridad nueva, no vacía**: `scannercheck.cjs` (registrado en `run.cjs`) lanza
  Chrome con `--use-fake-device-for-media-stream`, así que la cámara **arranca de verdad**.
  Verifica que el botón abre el modal, que aparece un `<video>` con estado RUNNING sin
  overlay de carga, que cerrar y reabrir reinicia el lector sin fugas y que no hay errores
  de consola. Antes de este corte la ruta de cámara no tenía ninguna guardia: los E2E no
  podían abrir un dispositivo.
- **Efecto lateral en lint**: los 3 warnings `exhaustive-deps` de los lectores desaparecen
  (20 → 17 en total), porque el ciclo de vida dejó de estar en `useEffect` de componentes.


**Escalones con "sin hallazgos"**
- Dependencias (5): las 13 declaradas tienen uso real (`motion/react`, `xlsx` diferido en
  `exportUtils`/`universalImporter`, `react-router-dom` en `App` + `StockCountTerminal`).
- Código muerto (1): 0 `TODO`/`FIXME`, 0 `ts-ignore`/`eslint-disable`, 0 exports huérfanos
  (el barrido por nombres dio 0). El único `console.log` es la traza deliberada de la cola.
- `any` (2): sigue en **1** (la firma de índice de `SheetRecord`).
- Monetario (regla estricta del protocolo): **0** campos ni métricas de precio en la UI.
  El ERP de farmacia se consume con `Stock`, `Inv. Inicial`, `Egreso`, `Ingreso`, `Venta`,
  `Stock Min/Max/Crítico`; `AGENTS.md` (§2.M) lista justo esas columnas, sin precio. La
  regla se cumple en código y en documentación.

**Desviación de documentación detectada y corregida**
- `AGENTS.md` (§2.C) situaba `parseAnyDate` y `getEventCategory` en
  `dateCalculations.tsx`; viven en `pureCalculations.ts` (compatible con Web Worker) y
  `dateCalculations.tsx` sólo los re-exporta. `getItemStatus` **sí** se define en el
  `.tsx` (es envoltorio de UI). Corregido en ambos archivos, con la nota de por qué existe
  el re-export (no romper consumidores).
- `AGENTS.md` decía que **toda** lectura/escritura de `localStorage` pasaba por
  `readStorage`/`writeStorage`. Hay **71** operaciones directas fuera de `appStorage.ts`
  (18 archivos; 13 en `indexedDbService`, 13 en `App`). El dato que importa: **0
  `JSON.parse` sin validar**, así que el riesgo que motivó la puerta (forma equivocada que
  revienta lejos de la causa) está cerrado. Los accesos directos son cadenas planas
  (`SCRIPT_URL`, `DARK_MODE`, …) y la cola offline —que la invariante pide no tocar—.
  El guardarraíl se reescribió como "todo dato **estructurado** pasa por la puerta
  validada", que es lo que el código cumple.

**Verificación (no asumida)**
- `npm run verify:all` en verde: tsc 0 errores, eslint 0 errores (20 warnings
  `exhaustive-deps` preexistentes), 152 + 7 + 18 pruebas, build PWA y **9 arneses E2E**.
- Nota de estabilidad del arnés: una corrida intermedia hizo fallar `startupcorruption` y
  `mutcheck` con `filasRenderizadas: 0`; con el árbol limpio dieron 8/8 y con los cambios
  9/9. Fue contención de recursos por lanzar Chrome en paralelo, no una regresión; se
  documenta porque un falso rojo en CI cuesta más de diagnosticar que un fallo real.

---

## Auditoría Ponytail (2026-09-19) — corte del lector de cámara

Retomado el hallazgo de duplicación que quedó documentado sin corregir. El corte se hizo
bajo la Escalera: primero reutilizar lo que ya existía (`barcodeScannerConfig`, que ya
centralizaba formatos y selección de cámara trasera), después escribir sólo la secuencia
que de verdad estaba repetida.

**Lo que se corrigió**
- `src/hooks/useBarcodeScanner.ts` (nuevo): una sola implementación del ciclo de vida del
  lector (`getCameras` → cámara trasera → `start` con los formatos de bodega → capacidades
  de linterna → `stop`/`clear`), más el estado asociado. Las diferencias reales entre
  lectores son opciones (`repeatWindowMs`, `throttleMs`, `stopOnScan`, `torchOptimistic`,
  `qrbox`, `aspectRatio`, `fps`).
- Migrados los **tres** consumidores: `BarcodeScannerModal` (236 → 119),
  `MobileCameraBarcodeScanner` (368 → 223) y `MobilePistoleoTerminalModal` (967 → 860).
  Neto: **−377 líneas** contra ~230 del hook. Una implementación en vez de tres.
- API especulativa retirada antes de publicarla: `onScan` recibía un `meta.first` que
  ningún consumidor usaba. Es exactamente el escalón 1 (¿esto necesita existir?).

**Riesgos reales que desaparecen, no sólo líneas**
- La cámara ya no puede quedar encendida al desmontar: el `cleanup` del efecto llama
  `stop`. Antes, `MobileCameraBarcodeScanner` detenía en el cleanup pero
  `MobilePistoleoTerminalModal` dependía de una bandera `isMounted` manual.
- Condición de carrera eliminada con una **época**: un `start` asíncrono que resuelva
  después de un `stop` no reactiva el lector.
- Bucle de reinicio evitado: las opciones que cambian por render (`qrbox` es una función
  en línea) viven en un `ref`; si fueran dependencias de `start`, cada render relanzaría
  la cámara.
- Mensajes de error unificados con la misma clasificación de permiso
  (`NotAllowedError`/`Permission`/`denegado`) en los tres lectores.

**Red de seguridad nueva (no vacía)**
- `tests/perf/scannercheck.cjs`, registrado en `run.cjs`. Arranca Chromium con
  `--use-fake-device-for-media-stream` y comprueba, sobre el DOM real: el botón abre el
  modal, aparece un `<video>` con estado RUNNING sin overlay de carga, cerrar y reabrir
  reinicia el lector, y no hay errores de consola. La ruta de cámara no tenía ninguna
  guardia previa porque los E2E no podían abrir un dispositivo. El arnés se verificó
  primero contra el árbol ya migrado (no se escribió "para que pasara en vacío").

**Verificación (medida)**
- `tsc --noEmit`: 0 errores. `eslint src tests`: 0 errores y **17 warnings** (bajó de 20:
  los 3 `exhaustive-deps` de los lectores desaparecen).
- `npm test`: 152 + 7 + 18 pruebas en verde.
- `npm run build` en verde y `npm run test:e2e` con **10 arneses** en verde, incluido el
  nuevo. (Una corrida intermedia falló `importcheck` porque un servidor de preview manual
  ocupaba el puerto 4173; con el puerto libre pasó. Se anota porque un falso rojo cuesta
  más de diagnosticar que un fallo real.)

**Siguiente palanca**
- Sin cambios de criterio: quedan Fase 1.2/1.3 (hooks restantes), Fase 3 (extracción de
  `useInventoryData`/`useDashboardViewState`/`useInventoryActions`/`useDashboardModals`),
  Fase 4 (escrituras directas a `localStorage`) y Fase 5 (monolitos:
  `StockCountTerminal` 2.751, `stockCountUtils` 1.481, `CampaignConsolidationDashboard`
  1.399, `SliceEditorModal` 1.186, `InventoryDashboard` 1.377).

