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

### Fase 2 — Eliminar el doble camino

Migrar los 11 archivos a leer **solo** del contexto. Al terminar, `grep -c "?? dashboard\."`
= 0 y la lista de `overrides` en `eslint.config.mjs` debe quedar vacía.

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