# Plan de Reforma Arquitectónica

Estado: **Fases 0, 2 y 4 completadas**; Fase 5 en curso (2 cortes hechos), Fase 6 con el
primer corte hecho, Fases 1.3 y 3 pendientes. **Fase 7 (multi-hoja por capacidades) anotada**
como fase futura, después de 5 y 6. Deuda `any`
saldada en todo `src`: **1 solo `any`** declarado (la firma de índice de `SheetRecord`,
justificada abajo). Riesgo `xlsx` cerrado (alias a 0.20.3, `npm audit` limpio).
Regla de oro: una fase entra a `main` solo cuando la anterior está verde (`npm run verify`).
Protocolo Ponytail: cada fase busca el código mínimo efectivo, sin dependencias nuevas salvo justificación explícita.

> **Para retomar mañana, leer directamente «Punto de arranque» al final del documento.**
> Ahí está el estado exacto, lo verificado y cuál es el siguiente corte con su medición.

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

#### Arnés del invariante del conteo (`countcheck.cjs`) — primera red de la Fase 5

La Fase 5 (dividir monolitos) apunta al archivo más grande y más frágil:
`StockCountTerminal.tsx` (2.751 líneas, 36 `useState`). Antes de cortar nada había que
poner la red, porque **ese archivo tenía cobertura cero** —0 referencias en pruebas
unitarias, de componente y E2E— y su historial lo confirma: 4 fixes de conteo, dos de
ellos de **pérdida de datos** (`de6cacc` "evitar pérdida de la última lectura" y
`8375865` "modo BLIND real…", este último de 87 líneas en el terminal y **sin una sola
prueba**).

El invariante no obvio: las sesiones se guardan con escritura **debounced de 300 ms**
para no congelar la UI durante el pistoleo, y el volcado inmediato en
`pagehide`/`visibilitychange` es lo que evita perder la última lectura. En una PDA eso
no es el borde, es el caso común: el operario pistolea y cambia de app enseguida. Un
refactor que mueva el efecto, cambie su orden o suspenda el componente reintroduce el
bug sin que ninguna prueba lo note.

La sonda es **determinista, no una carrera contra el timer**: se espera a que React
confirme el commit (señal observable: la UI ya anuncia "2 lecturas"), y entonces se lee
→ se dispara `pagehide` → se vuelve a leer dentro de la **misma tarea síncrona**. Un
timer no puede dispararse ahí, así que el resultado discrimina:

- con el flush: `antes = 1`, `despues = 2` → la lectura se salvó
- sin el flush: `antes = 1`, `despues = 1` → se perdió

Se añadió un **autocontrol** (`antes === 1`): si el debounce hubiera escrito antes de
sondear, el caso no probaría el flush y la prueba se invalidaría en vez de dar un falso
verde. También se fija la vía normal (el debounce persiste sin ayuda), para no confundir
"el flush salva la lectura" con "la persistencia no funciona en absoluto".

**Verificado que discrimina, no solo que pasa**: neutralizando el listener de `pagehide`
el arnés falla **solo** en el paso del invariante (exit 1, con el autocontrol aún en
`antes=1`); restaurado, vuelve a OK. Corre en CI dentro de `npm run test:e2e` (11 arneses).

### Fase 5 — Dividir monolitos

#### Corte 1 — `campaignUtils.ts`: separar el motor de campañas del de sesiones

`stockCountUtils.ts` mezclaba dos dominios que **no compartían una sola función**:
sesiones de conteo (`reconcileStockCountSession`, `buildVencimientosRowFromCount`, la
persistencia de sesiones) y el ciclo completo de campaña (`importPharmacySnapshotToCampaign`,
`computeCampaignConsolidationMatrix`, la separación de aguas, reportes, actas y su
persistencia). El grafo de dependencias lo dejó claro: el bloque de campañas tenía **cero
acoplamiento** con el resto y **cero consumidores internos**.

Se extrajo la sección completa `CAMPAÑA DE INVENTARIO CÍCLICO MULTISESIÓN` (13 exports,
~650 líneas) a `src/utils/campaignUtils.ts`, delimitada por su propio separador de sección.
Se actualizaron los 5 consumidores (`StockCountTerminal`, `CampaignConsolidationDashboard`,
`MobileErpSnapshotView`, `test-modules.ts`, `tests/xlsx.test.ts`) separando los imports por
dominio, en vez de dejar un re-export en `stockCountUtils` que habría ocultado la dependencia
real.

| | Antes | Después |
| --- | --- | --- |
| `stockCountUtils.ts` | 1.481 | 829 |
| `campaignUtils.ts` | — | 678 |

El corte dejó a la vista deuda preexistente que se corrigió en el mismo paso: cuatro imports
huérfanos tras la extracción (`rowToObject` y tres tipos de campaña) y un `import` de
`appStorage` que **partía en dos el docblock** de `generateCuVc`.

**Verificación de que es un movimiento puro, no una reescritura**: se comparó el cuerpo de
cada función movida (normalizando espacios y cortando en su llave de cierre) contra el
original; todas idénticas. `tsc` limpio, 0 imports huérfanos en ambos archivos, 180 pruebas,
11 arneses E2E incluido `countcheck`.

Monolitos restantes de la fase: `StockCountTerminal.tsx` (2.629 tras el corte 2) ·
`CampaignConsolidationDashboard.tsx` (1.399) · `InventoryDashboard.tsx` (1.377) ·
`SliceEditorModal.tsx` (1.186).

#### Corte 2 — `countAggregation.ts`: la agregación del conteo, fuera del terminal

Al encarar `StockCountTerminal.tsx` (2.751 líneas) el primer impulso fue extraer los bloques
de render —el móvil y el escritorio— como componentes. **Se midió antes de cortar y se
descartó**: el bloque de escritorio necesita **43** identidades del padre y el móvil **65**
(estado, setters, handlers y memoización). Un componente con esa superficie de props es más
difícil de leer que el JSX inline: no hay una costura, hay un agujero. Descartado por el
escalón 7 de la escalera.

La costura real estaba en la lógica. Ocho `useMemo` (~200 líneas) calculaban agregación pura
sobre la sesión —agrupar lecturas por SKU, KPIs de cuadratura, filtros de estado/proveedor,
checklist de pendientes— y **ninguno tenía una sola prueba**: la cuadratura se verificaba a
nivel de motor (`reconcileStockCountSession`) y de E2E, pero el cálculo de KPIs que ve el
operario no se cubría en ningún sitio.

Se extrajo a `src/utils/countAggregation.ts` con los cuerpos idénticos (las únicas
diferencias son parámetros renombrados y un tipo inline que pasó a ser `GroupedSkuEntry`,
misma forma). `StockCountReconciliationView` ya no declara `ReconciliationFilter` ni
`ReconciliationMetrics`: los importa del módulo, que es donde se calculan.

| | Antes | Después |
| --- | --- | --- |
| `StockCountTerminal.tsx` | 2.751 | 2.629 |
| `countAggregation.ts` | — | 226 |

**Pruebas (14 nuevas, sección 19) con verificación por mutación.** Cada una se comprobó
rompiendo el código a propósito, no solo en verde:

| Mutación aplicada | Prueba que debe caer | Resultado |
| --- | --- | --- |
| Agrupar por `CU_VC` en vez de por SKU | agrupa por SKU aunque los CU_VC sean de meses distintos | falla |
| Quitar el `\|\| 1` del denominador de cobertura | cuadratura vacía da 0% y no NaN | falla |
| `DIF` = solo faltantes (olvida no catalogados) | DIF incluye faltantes y no catalogados | falla |

La primera mutación **no cayó** en el primer intento: el fixture usaba lecturas sin `cu_vc`,
así que ambos criterios de agrupación coincidían y la prueba pasaba en vacío. Se añadió el
caso de dos meses del mismo SKU, que la distingue; con eso, la mutación cae. Es el argumento
de por qué la verificación por mutación no es opcional.

Además se fijaron dos bordes que el código original ya resolvía pero nadie vigilaba: el
acumulado de la última lectura suma solo su SKU, y el teórico de los KPIs incluye
`ajusteMovimiento` (ventas del turno), que es lo que hace que la diferencia neta cuadre con
la operación real y no con el snapshot congelado.

Gate: `tsc` 0, `eslint` 0 errores, **206 unitarias** (14 nuevas) + 10 de componente + 18 de
hoja = 234, y 12 arneses E2E incluidos `countcheck` y `blindcheck`.


#### Red de la cuadratura y del modo BLIND: unitaria primero, E2E donde el DOM es el punto

Al separar el motor de campañas quedó a la vista un hueco mayor que el del terminal: el
**núcleo puro** de la cuadratura tenía cobertura cero. `reconcileStockCountSession` y
`buildVencimientosRowFromCount` —de donde salen los estados FALTANTE/SOBRANTE/CUADRADO, la
consolidación por `CU_VC` y las 14 columnas que se escriben en VENCIMIENTOS— no tenían una
sola prueba unitaria. Eso no se cubre con un arnés de navegador: es lógica pura y se prueba
en `test-modules.ts` (sección 18, 18 aserciones nuevas).

Los invariantes que fija, en orden de riesgo:

- **`CU_VC` como clave de entidad de la fila sincronizada.** Si `_entityKey` deja de fijarse,
  la cola offline no puede re-localizar la fila y cada sincronización **duplica** vencimientos
  (AGENTS.md §K: la unidad de vencimiento es SKU + MM/YYYY, sin lotes).
- **Consolidación por `CU_VC`, no por SKU.** Dos lecturas del mismo mes suman en una fila; el
  mismo SKU en meses distintos son dos vencimientos. Fusionarlos o no sumarlos rompe la
  cuadratura en silencio.
- **Cuadratura BLIND sin teórico.** Se probó como **par discriminante** (DOCUMENT mapea el
  teórico / BLIND no), no como aserción suelta: un gate roto que ocultara el teórico en *todos*
  los modos daría verde con una sola aserción.
- **Clasificación de estados**, incluidos los dos casos que no son diferencias aritméticas:
  SKU con teórico y cero lecturas es FALTANTE (nunca pistoleado), y SKU pistoleado ausente de
  la hoja es NO_CATALOGADO (hallazgo físico).

**Verificado que discrimina**: mutando el gate de BLIND (`session.modo !== 'BLIND'` → `true`) y
vaciando `_entityKey` fallan **exactamente** esas dos aserciones (168/170); restaurado, vuelve
a 170/170.

El arnés E2E `blindcheck.cjs` cubre la mitad que la prueba pura no puede ver: que el invariante
llegue a la **pantalla**. Mismo par discriminante sobre el DOM real —en DOCUMENT debe aparecer
el badge `ERP: <n> un`, en BLIND no—, sembrando catálogo maestro y campaña con snapshot porque
el badge solo se renderiza si el SKU se resuelve contra ambos. Un detalle que costó una
iteración: el gate `!isBlind` está duplicado en la rama de escritorio y en la de móvil; el arnés
corre a 1600 px, así que la mutación tiene que apuntar a la rama de escritorio o el arnés pasa
por la razón equivocada.

Corre en CI dentro de `npm run test:e2e` (12 arneses).

### Fase 6 — Rendimiento y empaquetado

Bundle principal 1.650 KB (455 KB gzip) y CSS 208 KB. `React.memo` donde el profiler lo
justifique; evaluar `manualChunks`. **No añadir `manualChunks` sin medir antes.**

#### Hecho: `html5-qrcode` fuera del chunk de arranque (−102 KB gzip, −22%)

Medido antes de tocar: la librería pesa **374 KB min / 110 KB gzip** (bundled con esbuild),
y estaba en el chunk de entrada porque `useBarcodeScanner` y `barcodeScannerConfig` la
importaban con `import` de valor. Es el **24%** del bundle inicial y solo se necesita al
abrir el escáner, así que una PWA de bodega la descargaba en cada arranque sin usarla.

| | antes | después |
| --- | --- | --- |
| Chunk inicial (gzip) | 457 KB | **355 KB** |
| Chunk del escáner | — (dentro del inicial) | 110 KB, cargado al abrir |

Corte aplicado, sin dependencias nuevas:
- `useBarcodeScanner.ts`: `import type { Html5Qrcode }` y `await import('html5-qrcode')`
  dentro de `start`, después de la guardia de época (si el arranque se canceló mientras
  cargaba, no se sigue).
- `barcodeScannerConfig.ts`: el enum `Html5QrcodeSupportedFormats` se replicaba con
  `import` de valor, que por sí solo ya arrastraba la librería. Ahora es `import type` y los
  valores viven en una tabla `satisfies Record<string, Html5QrcodeSupportedFormats>`, de modo
  que un valor equivocado **no compila** y `BARCODE_SUPPORTED_FORMATS` conserva su tipo
  ancho (el estrecho rompía `test-modules.ts`). Son el contrato público y estable del enum.

No se aplicó el `React.lazy` de los modales del escáner, que era el camino más obvio: el
terminal de pistoleo **conserva `sessionScans` al cerrarse**, así que montarlo condicionalmente
(o suspenderlo con un fallback que lo desmonte) perdería la sesión de conteo a medio turno.
Descartado por la escalera: la mejora no compensa el riesgo sobre datos de sesión.

Verificación: el chunk del escáner queda **precacheado por el service worker**, así que el
escáner sigue funcionando offline; `scannercheck` recorre el ciclo real (cámara falsa de
Chromium, RUNNING, stop → start) y pasa; `tsc` 0, `eslint` 0 errores, 180 pruebas y 10/10 E2E.


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

### Fase 7 — Multi-hoja por capacidades (una app, varias hojas)

**Origen y encuadre.** El usuario planteó acercarse a AppSheet. Al medir el árbol, la
conclusión cambió: no se trata de emular una plataforma no-code ni de vender a terceros,
sino de un objetivo concreto y propio — **poder apuntar la app a hojas de Google Sheets con
datos completamente distintos sin construir otra aplicación a medida cada vez**. Es reusar
*las características de esta app* en otras hojas, no que un tercero construya apps.

Esto refuerza la misma idea que sostiene el resto del plan: la capa genérica es **cañería**,
el dominio es el **producto**. Lo que cambia es que la cañería deja de estar cableada a las
cuatro hojas actuales.

#### El diagnóstico: el motor ya es genérico, la configuración no

`InventoryItem` **no** es un esquema rígido; es un objeto con claves por encabezado:

```ts
export interface InventoryItem {
  _rowIndex: number;
  _entityKey?: string;
  [key: string]: any;   // columnas dinámicas según los headers de la hoja
}
```

Consecuencia importante: **la tabla, los filtros, la búsqueda, la agrupación, el ordenamiento,
el redimensionado, los slices, las bulk actions, la importación y la edición de filas ya
funcionarían hoy con una hoja de datos distintos.** El motor de datos no es el obstáculo.

El obstáculo está en cuatro ataduras, medidas:

| Atadura | Magnitud |
| --- | --- |
| Referencias a `main` / `events` / `products` / `policies` | **139**, en >20 archivos, **sin constante centralizada** |
| `ViewKey` como tipo cerrado | `'main' \| 'events' \| 'products' \| 'policies'` |
| `SheetConfig` con 4 claves fijas | No admite una quinta tabla |
| `BUILT_IN_SLICES` con dominio dentro | "Retiro Inmediato", "Canje Proveedor", `pmRadarFilter` cableados a `tableKey: 'main'` |

Lectura de eso: apuntada a una hoja de "Clientes", la tabla y los filtros funcionan; lo que
no tiene sentido es que aparezcan slices de vencimientos, el radar PM o el terminal de conteo.
**No falta motor: falta separar el dominio del andamiaje.**

#### El mecanismo ya existe: activación por capacidades

El patrón no hay que inventarlo. `bulkActionsRegistry` ya lo usa:

> WhatsApp solo si hay columnas telefónicas o la hoja se llama Contactos/Clientes; Gmail solo
> si hay columnas de email.

Pregunta *qué columnas hay*, no *cómo se llama la tabla*. Y la primitiva está hecha:
`FIELD_PATTERNS` (`columnAliases.ts`) reconoce **31 semánticas** — `telefono`, `email`,
`fecha_vc`, `sku`, `cantidad`, `proveedor`, `venta`, `stock_critico`, `lote`, `pm`, `mundo`…

**Ese es el sistema de módulos.** La Fase 7 es extender la activación por capacidades desde
las acciones masivas hasta los módulos completos:

```
¿FECHA_VC / fecha de vencimiento?      →  Radar de Vencimientos, PM, retiro
¿SKU + CANTIDAD?                       →  Terminal de Conteo y Cuadratura
¿columnas del ERP (Venta/Ingreso…)?    →  Campañas y separación de aguas
¿TELEFONO / EMAIL?                     →  WhatsApp / Gmail
siempre                                →  tabla, filtros, agrupación, slices, edición, importar
```

Una hoja sin columnas de vencimiento no muestra nada de vencimientos. Sin configurar nada.

#### Ruta por pasos, cada uno con valor propio

1. **Centralizar las 4 claves.** Hoy están regadas en 139 sitios sin constante. Es mecánico,
   no cambia comportamiento, y es prerrequisito de lo demás. Vale por sí solo: el día que
   haga falta una quinta tabla, es un cambio de datos y no 139.
2. **Separar los slices nativos.** `BUILT_IN_SLICES` mezcla slices de dominio con la capa
   genérica; los de dominio pasan a depender de capacidad en vez de `tableKey: 'main'`. Con
   esto, una hoja nueva deja de mostrar "Canje Proveedor".
3. **Modo genérico.** Aceptar una tabla sin ninguna semántica de dominio y mostrar solo el
   andamiaje. Aquí por fin se abre una hoja de Clientes y funciona.
4. **Perfiles de tabla (opcional).** Declarar "esta hoja es de tipo X" para cuando la
   detección se equivoque.

Decisión de diseño pendiente de cerrar con el usuario antes del paso 3: **detección
automática sola** (elegante, se equivoca con hojas ambiguas) **vs. perfiles declarados**
(predecible, exige UI). Recomendación: detección automática **con corrección manual**, que es
lo que ya se hace con las bulk actions. Empezar por ahí, no por los perfiles.

#### Fuera de alcance a propósito

- **Lenguaje de fórmulas** y **relaciones N-a-N**. Ese es el camino a AppSheet y lleva el
  proyecto a meses; para el objetivo real (reusar las capacidades propias en otras hojas) no
  hace falta. `formula` y `type: 'calculated'` siguen **sin consumidores** (ver hallazgo
  abajo); cablearlos o eliminarlos es cirugía aparte, barata y de honestidad, no parte de
  esta fase.
- **Vender a terceros / plataforma no-code.** Descartado explícitamente por el usuario.

#### Relación con las fases en curso

El corte 3 de Fase 5 (`CampaignConsolidationDashboard.tsx`) es **trabajo preparatorio de
esta fase**: separar ese monolito es empezar a desenredar dominio de presentación, que es
justo lo que la Fase 7 necesita. La Fase 7 entra **después** de 5 y 6, y solo cuando el
usuario confirme el paso 1.

#### Deuda que esta fase deja a la vista

- `refTable` / `refKeyCol` / `refLabelCol` están declarados en `ColumnSchema` y **solo un
  consumidor los lee, y es cosmético** (`ItemFormModal.tsx:736` pinta una etiqueta). El motor
  de resolución (`referenceResolver.ts`, 828 líneas) **no los lee ni una vez**: recibe
  `products` y `policies` como parámetros con nombre propio y resuelve por inferencia
  semántica + heurísticas de seguridad escritas a mano. Es decir, hay **dos sistemas en
  paralelo**: un esquema declarado en buena parte inerte y un motor de inferencia que es el
  que realmente corre.
- `formula` y `type: 'calculated'`: **cero consumidores en todo `src`**. Prometen en la UI
  algo que no hacen.

Esto refuerza la dirección de la fase: el patrón correcto ya está probado en
`entityIdentityResolver` — **esquema declarado validado primero, inferencia semántica como
respaldo**. No hay que sustituir la tolerancia a planillas caóticas (es un invariante no
negociable, §6.5), sino estratificarla:

```
1. Esquema declarado  (si existe Y es válido)
2. Inferencia semántica  (respaldo: el comportamiento de hoy)
3. Sintético  (último recurso)
```

Con un detalle que no es adorno: **el escalón 1 hay que validarlo antes de confiar en él.** Si
un usuario declara mal una clave, hoy las heurísticas lo rescatan; con "esquema primero" a
secas, la declaración errónea gana y rompe. Hay que comprobar unicidad y no-vacío antes de
darle prioridad.

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


---

## Auditoría Ponytail (2026-09-19) — bug latente de agrupación (warning `exhaustive-deps` con causa real)

De los 17 warnings `exhaustive-deps` que quedaban, uno era un bug, no ruido:
`useTableGrouping.ts:69` no listaba `sheetConfig.tableGroupings` como dependencia. Revisados
los demás, el de `useModuleViewState` (14 faltantes) es **deliberado** —el efecto debe correr
sólo al cambiar de vista; añadirlos pisaría las ediciones del usuario— y el resto son setters
estables de React, donde añadir la dependencia no cambia nada. Sólo se tocó el que tenía causa.

**El bug (confirmado, no supuesto)**
- `sheetConfig` se hidrata de `localStorage` y `fetchData` lo reemplaza después, cuando
  responde la nube (PropertiesService o pestaña `_CONFIG_APP`). Si la config local no traía
  agrupación y la de la nube sí, el efecto no volvía a correr (su array no cambiaba) y la
  agrupación guardada **se perdía** hasta el siguiente cambio de hoja.
- **Por qué no lo cubría nada**: los E2E siembran `SCRIPT_URL` apuntando a un puerto que
  rechaza la conexión al instante, así que la app cae a su modo demo y la config de la nube
  **nunca** llega tarde. La ruta quedaba sin cobertura por diseño del arnés, no por descuido.

**La corrección (mínima)**
- Se leen los **primitivos** guardados (`savedGroupByColumn`, `savedGroupByDirection`) y se
  listan como dependencias. No se usa `tableGroupings` entero a propósito: cambia de
  identidad en cada guardado, así que como dependencia re-ejecutaría el efecto sin que el
  valor haya cambiado. Con primitivos, el efecto corre justo cuando la agrupación cambia.

**Prueba que discrimina (no pasa en vacío)**
- `tests/components.test.tsx`, caso 4: monta el hook y aplica la config **después** del
  montaje (el `update()` del arnés). Verificado contra el código viejo y el nuevo:
  **sin el fix falla** (`col: "none"` en vez de `PROVEEDOR`), **con el fix pasa**. Sin esa
  comprobación cruzada, una prueba así no demuestra nada.

**Verificación**
- `tsc` 0 errores; `eslint` 0 errores y **16 warnings** (bajó de 17: el de `useTableGrouping`
  desaparece porque la causa era el bug). Componentes: **10 pasadas, 0 falladas**.


## Auditoría Ponytail (2026-09-19) — barrido tras el corte de campañas

Barrido del árbol con la Escalera de Decisiones, después de extraer `campaignUtils.ts`.
Cada hallazgo va con la evidencia que lo sustenta; lo que no tiene evidencia no se afirma.

**Lo que se midió y está sano**

- **Deuda `any`: 1** (`src/types.ts:145`, el índice dinámico por encabezados de hoja). Es
  irreducible sin perder la naturaleza de hoja flexible, y está comentado como tal.
- **Cero dependencias nuevas**, y las 13 de producción tienen consumidor real: `motion`
  (2 archivos, vía `motion/react`), `recharts` (1), `zod` (4), `react-router-dom` (2),
  `html5-qrcode` (2, fuera del chunk de arranque), `@tanstack/react-virtual` (3). Ninguna
  es peso muerto.
- **Cero campos monetarios en la UI**: 0 menciones de precio/costo/monto en
  `src/components`. Se respeta la regla estricta de AGENTS.md §5.
- **La puerta de persistencia (Fase 4) se sostiene**: 0 lecturas con
  `JSON.parse(localStorage.getItem(...))` fuera de `appStorage.ts`. Toda lectura
  estructurada pasa por `readStorage`/`readRawStorage` con esquema Zod.
- **Sin capas duplicadas de cálculo**: `getItemStatus` **delega** en `computeItemRawStatus`;
  `dateCalculations.tsx` aporta los badges de UI y `pureCalculations.ts` la lógica pura.
  La separación es correcta, no duplicación.

**Hallazgo 1 — Dorsal: 10 exports sin consumidor externo (superficie, no código muerto)**

`encodeCode128`, `codesToBinaryString`, `normalizeHeaderString`, `consolidateBatchByCuVc`,
`normalizeRut`, `normalizeCleanText`, `itemMatchesSlice`, `getDefaultTicketGeneralSettings`,
`sanitizeHeader`, `loadCampaignsFromCloud` no se importan fuera de su archivo, pero **sí se
usan dentro** (2–7 referencias cada uno). No son código muerto: son funciones internas
exportadas de más. Coste real bajo (no entran al bundle si nadie las importa; un bundler
moderno las poda). **No se toca en este corte**: quitar el `export` es seguro pero ruidoso
y sin impacto medible; queda como limpieza oportunista, no como tarea.

**Hallazgo 2 — Dorsal: el mismo ternario de diferencia de color, 8 veces**

`diferencia > 0` con su rama de color se repite en `StockCountReconciliationView.tsx` (2),
`StockCountTerminal.tsx` (4) y las dos ramas de escritorio/móvil del badge de campaña.
Escalón 2 (reutilizar) aplica: un helper `getDifferenceBadgeClass(diferencia)` en
`pureCalculations.ts` es una función pura de una línea. **No se aplica en este corte**
porque los tres sitios usan **escalas de color distintas** (una `bg-*-200`, otra
`bg-*-100`, otra `bg-*-950`) mezcladas con textos distintos ("Sobran +" vs "+"). Unificar
exige antes decidir cuál es la canónica: es una decisión de diseño, no una extracción
mecánica. Se registra para no perderlo.

**Hallazgo 3 — Dorsal: la expresión "modo demo" escrita 5 veces**

`const isDemo = !localStorage.getItem(STORAGE_KEYS.SCRIPT_URL)?.trim();` aparece idéntica en
`useInventoryIngestion.ts`, `useInventoryBulkActions.ts` (1 c/u) e `InventoryDashboard.tsx`
(3). No existe helper. Escalón 3: es una expresión de una línea y un helper
`isDemoMode()` en `appStorage.ts` la centraliza sin abstracción especulativa. **Candidato
claro para el próximo corte**, de bajo riesgo y verificable.

**Hallazgo 4 — Dorsal/CI: `printcheck.cjs` da falsa confianza**

El arnés **existe, corre sobre el build y no falla**, pero **no asserta nada**: imprime
filas, checkbox, botón y el resultado de `window.__printProbe`, y termina siempre en
`die(0)`. Un `printcheck` rojo es imposible: solo puede informar. Está correctamente fuera
de la puerta (`run.cjs`), pero AGENTS.md lo listaba como si verificara "la vista de
impresión". Corregida la tabla para decir lo que hace (diagnóstico manual, no verificación).
Promoverlo a la puerta exige primero escribir sus asserts —no es trabajo de este corte.

**Hallazgo 5 — Duplicación de UI: el badge de campaña, escrito dos veces**

El bloque `!isBlind && (campaignSkuStats?.inErp ? ... ERP ... : ... Hallazgo ...)` está
**duplicado** entre la rama móvil (1627) y la de escritorio (2087), y el bloque de estado
de diferencia también (1639 / 2096). Un extraer a subcomponente estándar choca con que las
dos ramas usan **estilos y textos distintos** ("Hallazgo Físico" vs "Hallazgo", `bg-*-100`
vs `bg-*-950`). No es copia mecánica: son dos presentaciones. Extraer un componente con
props de variante sería abstraer por encima de dos usos y **añadir** código, contra el
escalón 7. Se documenta como duplicación intencional (layout responsivo), no como deuda.

**Hallazgo 6 — Dorsal: 3 escrituras a `SHEET_CONFIG` fuera de `appStorage`**

`useInventoryData.ts` (2) e `InventoryDashboard.tsx` (1) escriben `SHEET_CONFIG` con
`JSON.stringify` directo, en vez de `writeStorage`. Impacto real medido: **ninguno en
comportamiento** (las tres envuelven en `try/catch`, y `writeStorage` haría exactamente lo
mismo). Es inconsistencia de estilo, no bug. No se toca: cambiarlo obliga a importar
`writeStorage` en tres sitios para idéntico efecto.

**Veredicto del corte**

El árbol está en buen estado Ponytail: sin código muerto confirmado, sin dependencias
hinchadas, sin sobreingeniería nueva. Los seis hallazgos son dorsales (limpieza de
superficie) salvo el 4, que es un falso verde de documentación ya corregido. El único
candidato de valor inmediato es el **3** (`isDemoMode()`), y el **1** y **6** quedan como
limpieza oportunista. El **2** espera decisión de diseño y el **5** se cierra como
intencional.

Verificación del corte: `tsc` sin errores · `eslint` 0 errores / 16 warnings preexistentes ·
**170 + 10 + 18 pruebas** (198; +18 de la sección 18) · **12 arneses E2E** en verde.

---

## Auditoría Ponytail (2026-09-19) — Fase 5, corte 3: `CampaignConsolidationDashboard.tsx`

Aplicado el método de "medir antes de cortar" que quedó escrito en el cierre anterior. El
resultado invierte la recomendación previa del roadmap, y esa inversión es el hallazgo.

### La medición que decidió el corte

El punto de arranque sugería buscar "los cálculos de presentación y los filtros de la
matriz". **Se midió el bloque de render de la pestaña MATRIX (líneas 929–1161, 233 líneas)
antes de tocarlo**: 15 identidades del padre, y —lo decisivo— **cero lógica pura dentro**.
Todo el cálculo ya vivía en `campaignUtils.ts` y en los `useMemo` del padre.

Bajo la regla "por encima de ~10-15 props el componente es peor que el JSX inline", 15
identidades está justo en el umbral. Se extrajo igualmente, con un argumento que la regla no
cubre: **el coste no es trasladar 233 líneas a una interfaz, sino que esas 233 líneas son de
una sola pestaña de tres.** El padre es un orquestador de estado + modales; la tabla es una
hoja. La costura no estaba en la lógica (ya extraída) sino en el **render tabular completo**,
que no necesita ninguna identidad del padre salvo las que ya recibía.

### Extraído

**`src/components/campaign/CampaignMatrixTable.tsx` (274 líneas)** — bloque MATRIX verbatim,
dedentado. Interfaz de 15 props, todas de datos o callbacks ya existentes; ninguna nueva.

- `matrix`, `displayedRows`, `providerList`, `matrixFilter`, `searchTerm`, `selectedProvider`
- 7 callbacks: `onMatrixFilterChange`, `onSearchTermChange`, `onSelectedProviderChange`,
  `onQuickScan`, `onExportDiscrepancies`, `onLaunchTargetedRecount`, `onToggleCloseSku`,
  `onUpdateSalesAdjustment`

**`CampaignConsolidationDashboard.tsx`: 1.365 → 1.151 líneas (−214, −15,7 %)**, y los 10
iconos que solo usaba la tabla (`Search`, `Scan`, `Download`, `RotateCcw`, `Package`, `Check`,
`HelpCircle`, `Plus`, `AlertTriangle`, `MapPin`) salen del import del padre. `Search` y
`MapPin` quedaron huérfanos al mover el bloque; `eslint --no-unused-vars` los detectó.

### Red E2E antes de cortar: `campaigncheck.cjs`

El corte se hizo con red. El arnés existía de la jornada anterior pero **fallaba en el primer
paso**, y la causa era un falso negativo del propio arnés, no de la app.

**Diagnóstico.** El paso "la campana sembrada abre la vista de consolidación" buscaba
`children.length === 0 && /Cuadrados \/ Validados/`. `hasCampText` era `true` y la vista sí
abría: los rótulos de las tarjetas son `<span>` que contienen un icono lucide **más** texto,
así que nunca tienen `children.length === 0`. Peor: los tres `[title]` que el diagnóstico
encontró (`Cuadrados / Validados`, `Discrepancias`, `Nunca Pistoleados`) **no son las
tarjetas** — son los segmentos de la barra de progreso de cobertura, que no tienen texto. El
selector apuntaba al elemento equivocado y encima exigía una forma que las tarjetas no tienen.

**Corrección.** Se reescribieron las verificaciones contra el DOM real: las tarjetas son
`<button>` cuyo `textContent` lleva el rótulo y `N SKUs`; el filtro se restaura con el botón
"Ver Todos"; la búsqueda se escribe con el setter nativo de `HTMLInputElement.prototype` para
que React registre el `input`. La vista es `lazy`, así que el primer paso ahora sondea hasta
que monta en vez de leer una sola vez.

**12 verificaciones, todas contra comportamiento observable:**

| Verificación | Qué fija |
| --- | --- |
| abre la vista de consolidación | el montaje lazy no rompe el arranque en campaña |
| tarjetas cuadrados / nunca / hallazgos | `computeCampaignConsolidationMatrix` clasifica los 4 estados |
| los 4 SKUs en la matriz | no se pierde ninguna fila en la agregación |
| fila del discrepante | 50 teórico vs 40 físico se muestran en la fila |
| filtro "Nunca Pistoleados" | deja exactamente SKU-E2E-C |
| "Ver Todos" | restaura las 4 filas |
| búsqueda por SKU | filtra a 1 fila |
| búsqueda sin coincidencias | tabla vacía |
| estado + búsqueda | se acumulan (cuadrado no aparece bajo Nunca) |
| campo de ajuste de venta | existe en la fila discrepante |
| ajuste recalcula la diferencia | `V:-10` → `V:-5` al ingresar 5 unidades |
| ajuste persiste en `localStorage` | sobrevive recarga, no es solo pantalla |

**Verificado por mutación (el arnés no es decorativo).** Mutado `filterAuditRows` para que el
filtro `ALL` devolviera solo `matrix.cuadrados`: **7 de 12 verificaciones caen** y el arnés
termina en `FALLO`. Restaurado, 12/12 en verde. Un arnés que no puede fallar no es una red.

### Verificación del corte

`tsc --noEmit` 0 errores · `eslint` 0 errores (1 warning `exhaustive-deps` preexistente) ·
**234 + 10 + 18 = 262 pruebas** en verde · **13 arneses E2E** en verde (los 12 previos + el
nuevo, ahora sí en la puerta) · build de producción 0.

### Lo que la medición deja como lección

La regla de "~10-15 props" es una **guía de lógica**, no de presentación. Aplicada a un
bloque de render sin lógica dentro, el coste de la interfaz es real pero acotado, y se paga
a cambio de que una pestaña deje de compartir archivo con las otras dos. La regla sigue
valiendo donde nació: **no partir `StockCountTerminal.tsx` por móvil/escritorio**, porque
esos bloques sí arrastran 43 y 65 identidades.

---



## Auditoría Ponytail (2026-09-19) — Fase 5, corte 4: `CampaignKpiSemaphore.tsx`

El corte 3 dejó anotado que el corte 4 debía seguir "la costura por pestaña" (`SNAPSHOT_UPLOAD`
y `CAMPAIGN_SETTINGS`). **La medición desmintió esa recomendación**, y evitarla es el valor de
medir antes de cortar.

### La medición que invirtió el plan

Se midieron los tres bloques candidatos por identidades del padre, no por tamaño:

| Bloque | Líneas | Identidades | Dentro del umbral (~10-15) |
| --- | --- | --- | --- |
| HEADER | 195 | 16 | no, por encima |
| KPI + progreso | 218 | **9** | **sí, el mejor ratio** |
| SNAPSHOT_UPLOAD | 125 | 11 | sí, pero es una sola pestaña pequeña |

`CAMPAIGN_SETTINGS` **no existe como bloque**: se declara en el tipo de `activeTab` (línea 41)
pero no hay `{activeTab === 'CAMPAIGN_SETTINGS' && ...}` en el render. Es un estado muerto del
tipo, no una pestaña. El corte 3 lo dio por pendiente sin comprobarlo; la medición lo descarta.

El mejor corte no era el que el plan sugería (`SNAPSHOT_UPLOAD`, 125 líneas y una sola
pestaña), sino el **KPI + progreso**: 218 líneas, 74 % más de código, con menos identidades
(9, la mitad) y cubierto por la red E2E que ya existe. Máximo código por mínimo acoplamiento.

### Extraído

**`src/components/campaign/CampaignKpiSemaphore.tsx` (253 líneas)** — aviso de destino de
guardado, cobertura global, muebles consolidados y semáforo de 4 estados. Interfaz de 7 props,
ninguna nueva:

- `matrix`, `sessions`, `matrixFilter`, `lastCloudSyncDate`
- `onNavigateToSessionList`, `onSwitchToTerminal`
- `onSelectFilter(f)` — el padre lo compone como `setActiveTab('MATRIX'); setMatrixFilter(f)`
- `isMatrixTabActive` — sustituye al `activeTab === 'MATRIX'` que resaltaba la tarjeta activa.
  Un booleano con nombre propio en vez de pasar la pestaña entera: la tarjeta no necesita saber
  en qué pestaña está la vista, solo si es la suya.

El componente **auto-guarda con `if (!matrix) return null`**, así que el padre ya no envuelve en
`{matrix && ...}`. El early-return es la guarda correcta: la matriz es precondición del bloque,
no una condición de conveniencia.

**`CampaignConsolidationDashboard.tsx`: 1.151 → 947 líneas (−204, −17,7 %)**, y otros 5 iconos
salen del import del padre (`CheckCircle2`, `AlertTriangle`, `HelpCircle`, `Package`,
`ShieldCheck`), detectados por `eslint` tras mover el bloque. Acumulado de los cortes 3 y 4:
**1.365 → 947 (−418, −30,6 %)**.

### Verificación por mutación

Mutado `onSelectFilter` en el padre para que solo hiciera `setActiveTab('MATRIX')` y perdiera
`setMatrixFilter(f)`: **caen 2 verificaciones** (`el filtro de Nunca Pistoleados deja solo el
SKU sin lecturas` y `estado y busqueda se acumulan`). Restaurado, 12/12 en verde. El callback
que compone el padre es exactamente lo que el arnés fija.

**Nota de método.** La primera corrida mutada falló en el paso 1 y no en el 2 y 9, lo que
parecía indicar que la mutación no se cubría. El log decía `reintentando tras liberar recursos`:
era **contención de recursos** al correr dos Chromium a la vez, no un falso negativo. Repetida
con el build servido en aislamiento, la mutación falla donde debe. Lección: un fallo en un paso
que el cambio no toca es señal de entorno, no de cobertura; conviene aislarlo antes de concluir.

### Verificación del corte

`tsc --noEmit` 0 errores · `eslint` 0 errores (16 warnings preexistentes) · **234 + 10 + 18 =
262 pruebas** · **13 arneses E2E** · build 0 · `verify:all` exit 0.

### Alternativa descartada

Extraer también HEADER (16 identidades) no se justifica: está **por encima del umbral**, son
dos filas de 16 identidades cada una, y su valor de corte es menor que el ya hecho. El padre
puede caber con cabecera inline. Si en un corte futuro se desea, la medida ya está tomada.

---




## Auditoría Ponytail (2026-09-19) — limpieza oportunista + medición de Fase 6

Corte de cierre de los dos hallazgos baratos de la lista de pendientes ('hallazgos Ponytail
que quedaron fuera') y de la medición que pedía la Fase 6. Sin frente nuevo.

### 1. Badge de campaña des-duplicado (`CampaignSkuBadges.tsx`)

- **Qué se unificó**: el badge de stock teórico del ERP / hallazgo físico. Estaba copiado casi
  literal en la vista móvil y en la de escritorio de `StockCountTerminal.tsx`, dentro de
  `{!isBlind && (campaignSkuStats?.inErp ? ... : ...)}`. Extraído a `CampaignSkuErpBadge` con
  la prop `compact` para la variante de escritorio.
- **Qué NO se unificó, a propósito**: el badge de *diferencia* que acompaña a cada uno. La vista
  móvil usa emoji y verbo (`🟢 Cuadrado`, `🟡 Sobran +n`, `🔴 Faltan n`, colores `-200`, y solo
  en el pill bar bajo la descripción); la de escritorio usa el signo (`+n`, colores `-100`,
  inline). Cada uno vive en una sola vista, así que unificarlo habría sido una abstracción con
  dos modos para un solo consumidor: se dejó duplicado (YAGNI).
- **Trampa encontrada y evitada**: el bloque móvil de diferencia parecía parte del pill bar,
  pero el arreglo correcto era sustituir solo el badge ERP. Un primer intento de reescribir
  también el bloque de diferencia desalineó el cierre JSX; revertido.
- **Validación por mutación**: forzar `inErp=false` en el componente compartido hace caer
  `DOCUMENT SI muestra el stock teorico del ERP (control positivo)` en `blindcheck.cjs`
  (móvil y escritorio comparten el mismo punto). Restaurado, verde otra vez.

### 2. `printcheck.cjs` promovido a la puerta

- **Qué era**: un arnés que corría a mano, imprimía diagnósticos por consola y **siempre** salía
  `exit 0`; no podía fallar. Estaba fuera de la lista `HARNESSES` de `run.cjs`.
- **Por qué no se eliminó**: recorría una ruta viva (`FloatingBulkActionBar` → `handlePrintTicket`
  → `TicketPrintView`) y producía datos útiles (`window.__printCalls=1`, root montado, texto).
  Solo le faltaba asertar.
- **Qué se hizo**: 5 aserciones (tabla lista y seleccionable; barra ofrece imprimir; `print()`
  se dispara 1 vez; el ticket existe en el DOM en el instante del disparo; el ticket tiene
  contenido, no monta vacío) y entrada a `HARNESSES`. La puerta pasó de 13 a 14 arneses.
- **Validación por mutación**: gatear el montaje de `TicketPrintView` con `itemsToPrintList.length > 0`
  (el estado *pendiente*, justo el bug que el arnés debe detener) hace caer las dos aserciones
  del ticket y da `RESULTADO: FALLO` / `exit 1`. Restaurado, verde.

### 3. Fase 6 — medición del bundle (sin cambios de config)

Medición con `manualChunks` temporal **solo para atribuir peso**, revertido tras medir (la regla
de la fase prohíbe añadir `manualChunks` sin medir antes). Resultado del arranque (entrada
`index-vxHktdJW.js`, 353,20 KB gzip) + su chunk estático compartido:

| Origen | Tamaño gzip |
|---|---|
| React + ReactDOM + scheduler | 69,45 KB |
| motion | 42,38 KB |
| zod | 26,61 KB |
| react-router | 13,92 KB |
| lucide-react | 10,28 KB |
| (resto: app, contextos, estilos) | ~190,12 KB |

**Conclusión medida (no aplicada):** partirlos con `manualChunks` **no reduce el arranque**;
solo reparte el mismo peso en más ficheros (190 + 69 + 42 + 27 + 14 + 10 ≈ 352 KB ≈ 353 KB).
El orden de carga no cambia. Lo único que bajaría arranque de verdad es hacer *lazy* un
consumidor, y los candidatos no lo permiten hoy: `motion` lo usan `ConfirmDialog` y
`ToastContainer` (montados en el árbol raíz; su import debe subir al arranque) y `zod` valida
la config persistida antes de renderizar. `xlsx` (163,12 KB) y `html5-qrcode`
(`index-rt81CstL.js`, 110,58 KB) **ya son diferibles** por `await import`.
**Recomendación:** no tocar `manualChunks`; el arranque ya está razonablemente diferido. Si
algún día se quiere bajar más, el costo es real (lazy de un consumidor raíz) y hay que decidirlo
con el usuario antes.

---

## Punto de arranque (2026-09-19, cierre de jornada)

Sección pensada para leer primero mañana. Resume qué está hecho, qué está verificado y por
dónde sigue el trabajo, sin tener que reconstruirlo leyendo todo el documento.

### Dónde está el repo

| | |
| --- | --- |
| Rama | `main` |
| Último commit | cortes 3 y 4 de Fase 5 (`CampaignMatrixTable.tsx`, `CampaignKpiSemaphore.tsx`) |
| CI | `verify.yml` verde sobre los commits previos |
| Gate actual | `tsc` 0 · `eslint` 0 errores (16 warnings preexistentes) · **234 + 10 + 18 = 262 pruebas** · **14 arneses E2E** |

Pendiente de commit en la jornada de cierre (sin frente nuevo): badge de campaña des-duplicado
(`CampaignSkuBadges.tsx`), `printcheck.cjs` promovido a la puerta con aserciones, y la medición
de Fase 6. Detalle en "limpieza oportunista + medición de Fase 6".

Commits de la jornada, de más reciente a más antiguo:

1. `f5a04f4` — `refactor(conteo)`: agregación del conteo a `countAggregation.ts` (Fase 5, corte 2).
2. `9e7abe7` — `refactor(storage)`: helper `isDemoMode()` (hallazgo 3 de la auditoría Ponytail).
3. `f17fcdc` — `docs(auditoria)`: barrido Ponytail.
4. `5334eed` — `test(count)`: cuadratura, sync a VENCIMIENTOS y modo BLIND.
5. `e4e0e64` — `refactor(count)`: motor de campañas a `campaignUtils.ts` (Fase 5, corte 1).

### Lo hecho hoy, en una línea cada cosa

- **Auditoría Ponytail cerrada**, con 6 hallazgos y evidencia. En `ROADMAP.md`.
- **`isDemoMode()`**: la definición de "no hay backend" estaba escrita igual en 5 sitios; ahora
  vive en `appStorage.ts` con 4 pruebas que fijan el contrato (ausente, vacío, solo espacios,
  URL real). Verificada por mutación: quitar el `.trim()` rompe el caso de espacios.
- **Fase 5, corte 2** — el trabajo principal de la jornada. Detalle en su sección.

### El resultado que más importa para mañana: medir antes de cortar

Al encarar `StockCountTerminal.tsx` el impulso natural era partir el JSX en componentes
(móvil / escritorio). **Se midió y se descartó**: 43 y 65 identidades del padre
respectivamente. Quedó como método, no como anécdota:

> Antes de extraer un bloque de render, contar cuántas identidades del padre necesita.
> Por encima de ~10-15 props, el componente resultante es **peor** que el JSX inline:
> traslada el acoplamiento a una interfaz en vez de reducirlo. La costura suele estar en
> la **lógica pura**, no en la presentación.

El corte que sí se hizo sacó ~200 líneas de lógica de agregación con interfaz estrecha
(entra sesión + filtros, sale filas) y **sin cobertura previa**.

### Lo que sigue, medido y en orden de valor

1. **Fase 5, cortes 3 y 4 — `CampaignConsolidationDashboard.tsx`.** ✅ **Hechos** (2026-09-19,
   ver sus secciones). Corte 3: la pestaña MATRIX a `CampaignMatrixTable.tsx` (274 líneas).
   Corte 4: el semáforo y la cobertura a `CampaignKpiSemaphore.tsx` (253 líneas). El padre
   bajó de **1.365 a 947 líneas (−30,6 %)**. La medición desmintió el plan del corte 3:
   `CAMPAIGN_SETTINGS` no existe como bloque (estado muerto del tipo), y el mejor corte no
   era `SNAPSHOT_UPLOAD` (125 líneas, 11 identidades) sino KPI+progreso (218 líneas, 9
   identidades). Red E2E `campaigncheck.cjs` en la puerta, 12 verificaciones, validada por
   mutación en ambos cortes.
   **Lo que queda en el padre**: la cabecera (195 líneas, 16 identidades — por encima del
   umbral) y `SNAPSHOT_UPLOAD` (125 líneas, 11 identidades), ambos extraíbles si se desea.
   La medida de cada uno ya está tomada.
2. **Fase 6 — medir el bundle restante.** ✅ **Medido** (2026-09-19, ver "limpieza oportunista +
   medición de Fase 6"). El arranque son **353 KB gzip** (entry + un chunk estático compartido).
   **`manualChunks` no reduce**: solo reparte el mismo peso. `xlsx` y `html5-qrcode` ya son
   diferibles; `motion` y `zod` no pueden serlo sin *lazy* de un consumidor raíz. Recomendación:
   no tocar la config.
3. **Hallazgos Ponytail que quedaron fuera** (limpieza oportunista, no bloquean nada):
   - Escrituras directas a `SHEET_CONFIG` fuera de `appStorage`: 3 sitios reales
     (`useInventoryData.ts:193` y `:208`, `InventoryDashboard.tsx:351`). El de
     `useOfflineSync.ts:208` es una **lectura**, no una escritura: no cuenta.
   - `!isBlind` duplicado entre la vista móvil y la de escritorio del terminal. ✅ **Resuelto
     (2026-09-19)**, y la duplicación era mayor que el solo `!isBlind`: el markup completo del
     badge ERP/Hallazgo estaba copiado en las dos vistas. Extraído a `CampaignSkuErpBadge`
     (`src/components/campaign/CampaignSkuBadges.tsx`). El badge de *diferencia* que lo
     acompañaba en cada vista usa colores, formato y texto distintos (emoji+verbo vs. signo) y
     solo se usa en su propia vista: unificarlo habría sido abstracción de un solo uso, así que
     se dejó duplicado a propósito (YAGNI). Validado por mutación: forzar `inErp=false` hace
     caer `DOCUMENT SI muestra el stock teorico del ERP` en `blindcheck.cjs`.
   - `printcheck.cjs`: arnés huérfano (no está en la puerta de CI) y **no assertaba** (siempre
     `exit 0`). ✅ **Resuelto (2026-09-19)**: convertido en 5 aserciones reales y promovido a la
     puerta. Validado por mutación (gatear el montaje de `TicketPrintView` con el estado
     pendiente hace caer las dos comprobaciones del ticket). La puerta pasó de 13 a **14 arneses**.
4. **Fases 1.3 y 3** — cerrar lo que quedó a medias sin abrir frente nuevo.
   En Fase 3 quedan `useDashboardViewState`, `useInventoryActions` y `useDashboardModals`.
   Ojo: al medir `useInventoryActions` la interfaz daba ~23 parámetros, señal de que traslada
   el problema en vez de reducir acoplamiento. Cortar por sub-bloques cohesionados (los ya
   hechos fueron de 9, 13 y 15), no en bloque.
5. **Fase 7 — multi-hoja por capacidades** (anotada 2026-09-19, ver su sección). Objetivo del
   usuario: apuntar la app a **otras hojas de Google Sheets con datos distintos** sin
   construir otra app a medida. Diagnóstico: el motor ya es genérico (las filas son objetos
   por encabezado), lo que está atado son las **4 claves de tabla** (139 referencias sin
   constante) y los slices de dominio. El mecanismo a extender ya existe: activación por
   capacidades, como hacen las bulk actions con teléfono/email.
   **Entra después de 5 y 6.** El corte 3 de Fase 5 es trabajo preparatorio.
   Antes del paso 3 hay que cerrar con el usuario una decisión: detección automática sola
   vs. perfiles de tabla declarados (recomendación: automática con corrección manual).

### Deuda y trampas conocidas (no reabrir sin síntoma real)

- **1 solo `any`** en todo `src`: la firma de índice de `SheetRecord`. Es deliberada
  (heterogeneidad de columnas); cerrarla a unión produjo ~15 errores en cascada y se revirtió.
- **`xlsx`** viene de un artifact vendorizado (`vendor/xlsx-0.20.3.tgz`). No cambiar por
  `xlsx@latest` ni alias npm: la de npm es 0.18.5, vulnerable y sin fix.
- **Los 8 `JSON.parse` de `lib/sheets.ts`** son respuestas de red, no almacenamiento local.
  Validarlas con esquema quedó fuera de alcance a propósito (Fase 4).
- **`React.lazy` de los modales del escáner**: descartado a propósito. El terminal de
  pistoleo conserva `sessionScans` al cerrarse; montarlo condicionalmente perdería la sesión
  de conteo a medio turno.
- **Regla de push**: `git push origin main` y nada más. No empujar el mismo commit a una
  segunda rama; no dejar ramas de PR tras el merge.
- **`git push` pide contraseña** si el token del remote quedó viejo. Se arregla con
  `git remote set-url origin "https://${GITHUB_TOKEN}@github.com/rps2217/controldevencimientos.git"`.

### Cómo verificar antes de commitear

```bash
npm run verify        # tsc + eslint + unitarias. Se corre en cada paso.
npm run verify:all    # + build + 12 arneses E2E. Obligatorio antes de commitear.
```

Tarda varios minutos: conviene lanzarlo en segundo plano y escribir el `EXIT=` a un log
(el patrón usado hoy), porque la salida final se pierde si la consola corta.

