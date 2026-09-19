# Plan de Continuidad — Auditoría Ponytail

Estado tras la rama `ponytail-audit-strict-types` (commits `7650255`, `a823189`, `4a7e8ff`, `57cbae7`).
Verificado: `tsc --noEmit` limpio · 36/36 tests · build OK.

Cada punto indica **evidencia reproducible** y **veredicto Ponytail** (YAGNI, reutilizar, mínimo código efectivo).

---

## 0. Completado (no reabrir)

| # | Trabajo | Verificación |
|---|---|---|
| 1 | Code-splitting de 3 vistas pesadas (`React.lazy` + `Suspense`) | Entrada 2.627 → 1.649 KB; recharts fuera del chunk inicial |
| 2 | Activación de `strict: true` y corrección de 24 errores | `tsc --noEmit` |
| 3 | Eliminación de `precio`/`costo` (guardrail) | `grep` sin coincidencias en UI |
| 4 | Script `npm test` para los 36 asserts existentes | `npm test` |
| 5 | Tipado del borde Google Sheets (`lib/sheets.ts`) | `CellValue`/`SheetRow`/`SheetMatrix`, catches `unknown` |
| 6 | Extracción de la vista RECONCILIATION de `StockCountTerminal` | JSX byte-idéntico; 3.831 → 3.409 líneas |

---

## 1. Nuevos hallazgos de esta auditoría

### 1.1 🔴 BUG FUNCIONAL — El botón "Conteo" del nav superior no hace nada

- **Evidencia**: `DashboardTopNav.tsx:327` ejecuta `navigate('/conteo')`; `App.tsx:303` define `<Route path="/conteo" element={<Navigate to="/" replace />} />`. La navegación vuelve a `/` sin abrir el terminal.
- **Impacto**: En desktop, el terminal de conteo es inaccesible desde el nav superior. Solo se abre por el `Sidebar` y el drawer móvil, que sí llaman `dashboard.setIsStockCountOpen(true)`.
- **Fix Ponytail (1 línea)**: reemplazar `onClick={() => navigate('/conteo')}` por `onClick={() => setIsStockCountOpen(true)}` usando el contexto ya disponible (`DashboardContext`), o pasar `onOpenStockCount` por props como hacen `Sidebar`/`DashboardMobileDrawer`.
- **Prioridad**: Alta — funcionalidad existente inaccesible, corrección mínima.

### 1.2 🟡 Duplicación: fila de planilla → objeto (10 sitios, 3 variantes)

- **Evidencia**: `InventoryDashboard.tsx` líneas 879, 903, 915, 1030, 1045, 1060, 1083, 1302, 1465; `UniversalImportModal.tsx:111`. Variantes `obj[header] = row[i] || ''` con y sin `String(header)`.
- **Veredicto Ponytail**: paso 2 de la escalera (reutilizar). Un único helper puro `rowToObject(headers, row)` en `src/utils/` elimina la duplicación y centraliza la normalización de encabezados. Es el mismo patrón que ya usan `pureCalculations.ts`/`columnAliases.ts`.
- **Prioridad**: Media — deuda real, bajo riesgo, ~10 líneas de helper.

### 1.3 🟡 18 claves de `localStorage` con 3 prefijos inconsistentes

- **Evidencia**: `app_*` (22 usos), `appsheet_*` (14), `appsheet_clone_*` (32). Ej.: `appsheet_config` vs `appsheet_clone_config`.
- **Veredicto Ponytail**: real, pero refactor de riesgo medio (migración de claves). El paso correcto es un módulo central de storage **cuando se toque ese código**, con migración de claves antiguas.
- **Prioridad**: Media — no hacer de forma aislada.

### 1.4 🟡 6 `confirm()` nativos contradicen el sistema de diseño

- **Evidencia**: `SliceManagerModal.tsx:262`, `SliceEditorModal.tsx:1131`, `InventoryDashboard.tsx:1643` y `:1852`, `StockCountTerminal.tsx:558` y `:887`.
- **Veredicto Ponytail**: ya existe `ToastProvider` y modales propios; `window.confirm` rompe el lenguaje visual. Bajo impacto funcional, ruido de cambio moderado.
- **Prioridad**: Baja-Media.

### 1.5 🟡 Ausencia total de linting/formatting

- **Evidencia**: no existe `.eslintrc*`, `eslint.config.*`, `.prettierrc*` ni `prettier.config.*`. El único filtro es `tsc --noEmit`.
- **Veredicto Ponytail**: herramienta justificada, no sobreingeniería. Sin linter, los `any`/imports muertos reaparecen silenciosamente (ya se limpiaron 176 imports a mano una vez).
- **Prioridad**: Media — pero es una decisión de tooling que conviene acordar con el usuario antes de instalar.

---

## 2. Obligatorio a mediano plazo (incumple guardrails escritos en `AGENTS.md`)

Estos puntos **deben** abordarse porque el propio repo los declara no negociables.

### 2.1 Eliminar `any` injustificados

- **Evidencia**: 283 ocurrencias de `: any`/`as any`/`<any>`; 51 `catch (e: any)`.
- **Cita del guardrail**: *"tipado estricto en TypeScript sin `any` injustificados"*.
- **Enfoque**: `catch (e: any)` → `catch (e: unknown)` + narrowing (patrón ya aplicado en `lib/sheets.ts`). Luego atacar por archivo, empezando por los peores: `InventoryDashboard.tsx` (28), `referenceResolver.ts` (27), `DashboardContext.tsx` (27).
- **No hacer**: una sola pasada masiva de 283 cambios sin tests por medio. Hacerlo por módulo, con `tsc` entre cada uno.

### 2.2 Cerrar la brecha de `AbortController`

- **Evidencia**: 6 `fetch`, solo 3 `AbortController`. Sin cobertura: `gmailService.ts` (1), `backendMirrorService.ts` (2).
- **Cita del guardrail**: *"manejo de errores `try/catch` con `AbortController`"*.
- **Enfoque**: reutilizar el helper de timeout/abort ya existente en `lib/sheets.ts` en lugar de reimplementarlo.

### 2.3 Terminar de descomponer los monolitos

- **Evidencia**: `StockCountTerminal.tsx` 3.409 líneas (faltan los bloques CAMPAIGN/LIST/COUNTING); `InventoryDashboard.tsx` 2.328; `stockCountUtils.ts` 1.515; `CampaignConsolidationDashboard.tsx` 1.397.
- **Cita del guardrail §6**: *"No introduzcas lógica pesada ni componentes monolíticos"*.
- **Enfoque**: continuar la receta ya probada en el punto 6 completado — extraer cada bloque `viewState === 'X'` a su propio componente, con props tipadas y verificando que el JSX sea idéntico. Orden sugerido por autonomía: CAMPAIGN (≈60 líneas) → LIST (≈310) → COUNTING (≈1.510, el más acoplado, dejar para el final).

---

## 3. Lo que NO hay que tocar

Aplico YAGNI también a las mejoras. Estas piezas están bien resueltas:

- **Cola offline e `indexedDbService`**: cubre el guardrail de "prevención de pérdida de datos". Funciona; no reescribir.
- **Cache y Web Worker de `useInventoryWorker`/`inventoryWorker.ts`**: correcto y ya separado.
- **`columnAliases.ts`, `pureCalculations.ts`, `universalImporter.ts`**: núcleo puro y testeado (36 asserts). Reutilizar, no refactorizar.
- **`motion` para el toast** (`ToastContainer.tsx`): tree-shaken, impacto mínimo. No vale el cambio.

---

## 4. Orden de ejecución sugerido

1. **1.1** bug del botón "Conteo" (1 línea, corrige funcionalidad rota).
2. **2.3** extracción CAMPAIGN y LIST de `StockCountTerminal` (mecánico, bajo riesgo).
3. **1.2** helper `rowToObject` y reemplazo en los 10 sitios.
4. **2.1** `any` por módulo, empezando por `catch` sin tipo.
5. **2.2** `AbortController` faltante.
6. **1.4**, **1.3**, **1.5** según retorno y acuerdo previo.

**Invariante para todos**: `tsc --noEmit` + `npm test` + `npm run build` en verde antes de cada commit. No hay ESLint, así que `tsc` es la única red de seguridad automática.