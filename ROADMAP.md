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

Diagnóstico corregido (medido, no supuesto):

1. **Estabilizar handlers primero es obligatorio.** El value del contexto se
   recrea en cada render y muchos de sus miembros vienen de hooks sin
   `useCallback`. Memoizar el value sin estabilizarlos no tendría efecto, porque
   las dependencias cambiarían en cada render.
2. **La partición del contexto rinde poco por sí sola.** Ningún consumidor
   grande está envuelto en `React.memo` (`InventoryTable`,
   `ViewConfigControlDrawer`, `DashboardTopNav`, `DashboardFilterPanels`) y
   `DashboardTableContainer` —que tampoco está memoizado— es hijo directo del
   dashboard. La cascada del padre los re-renderiza con independencia del
   contexto. Para que la partición sirva, el `memo` de esos consumidores debe
   ir junto a ella.
3. **El costo real está en las filas.** `InventoryTableRow` sí está memoizado y
   recibe handlers como props; cualquier prop inestable anula su `React.memo` y
   re-renderiza **todas** las filas visibles.

Hecho en esta fase:
- `useItemFormManager`: 6 handlers en `useCallback` + objeto de retorno en
  `useMemo` (alimenta ~10 miembros del contexto).
- `saveConfig` y `fetchData` a `useCallback` (deuda que el lint ya marcaba y que
  hacía cambiar de identidad a los `useCallback` que los dependen).
- `handleDelete` a `useCallback`: único handler de fila sin memoizar.
- `onOpenWhatsApp` / `onOpenEmail` extraídos del literal del contexto: eran
  flechas inline pasadas a cada fila.

Partir los 224 miembros por **frecuencia de cambio**: `DataContext`, `ViewContext`,
`ActionsContext`, `FlagsContext`. Cada value en `useMemo`, y envolver en
`React.memo` los consumidores grandes que hoy no lo están.

Medición: el conteo de commits se puede automatizar con
`tests/baseline.probe.tsx`, pero **sus milisegundos no son extrapolables al
navegador** (la tabla virtualizada mide 0 en jsdom). La decisión de rendimiento
debe tomarse con React DevTools Profiler en el navegador, no con esa sonda.
Disparador de escape: migrar `ViewContext` a `useSyncExternalStore` **solo** si el
profiler muestra que el cuerpo de la tabla sigue re-renderizando.

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