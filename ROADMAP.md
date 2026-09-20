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
   Abrir el panel cambia una dependencia del value y arrastra a todos los
   consumidores: **las 25 filas visibles (`tr`=26, `td`=151) re-renderizan** al
   abrir un panel que no muestra datos.
5. **La partición del contexto rinde poco por sí sola.** Ningún consumidor grande
   está en `React.memo` (`InventoryTable`, `ViewConfigControlDrawer`,
   `DashboardTopNav`, `DashboardFilterPanels`) y `DashboardTableContainer`
   tampoco, y es hijo directo del dashboard. La cascada del padre los
   re-renderiza con independencia del contexto.

#### Consecuencia para el plan: la Fase 1 se reformula

Extraer el estado de UI del value y repartir el contexto en 4 no sirve de nada
mientras el dashboard siga re-renderizando su cuerpo entero en cada cambio de
cualquier flag. El orden correcto es el inverso al planteado:

- **1.1 — Aislar el estado de UI de los modales/drawers.** Agrupar los flags de
  UI en un único `useReducer`/objeto de estado (o moverlos a los componentes que
  los poseen: el drawer puede poseer su propio `isOpen` con `children` para no
  desmontar). Objetivo: que `isRightDrawerOpen` deje de formar parte del value.
- **1.2 — Extraer el cuerpo a un componente memoizado.** Con el value estable y
  el estado de UI fuera, envolver los consumidores grandes en `React.memo`.
- **1.3 — Envolver el value en `useMemo`** y recién entonces particionar por
  frecuencia de cambio (`DataContext`, `ViewContext`, `ActionsContext`,
  `FlagsContext`). Particionar antes de 1.1 y 1.2 no produce mejora medible.

Hecho en esta fase (higiene válida, sin mejora medible atribuible):
- `useItemFormManager`: 6 handlers en `useCallback` + objeto de retorno en
  `useMemo` (alimenta ~10 miembros del contexto).
- `saveConfig` y `fetchData` a `useCallback` (deuda que el lint ya marcaba).
- `handleDelete` a `useCallback`: único handler de fila sin memoizar.
- `onOpenWhatsApp` / `onOpenEmail` extraídos del literal del contexto: eran
  flechas inline pasadas a cada fila del literal.

Criterio de aceptación de la Fase 1 (medido con el instrumento de arriba):
abrir/cerrar "Vistas & Ajustes" debe dejar de re-renderizar `InventoryTable` y
las filas (`tr`+`td` ≈ 0), y el commit debe bajar de ~1700 a un orden de cientos
de fibras. Medir antes y después con el mismo comando; no dar por bueno ningún
cambio sin esa comparación.

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