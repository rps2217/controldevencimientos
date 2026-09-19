# Plan de Continuidad — Auditoría Ponytail

Estado tras la rama `ponytail-audit-strict-types` (commits `7650255`, `a823189`, `4a7e8ff`, `57cbae7`,
más `rowToObject`, `getErrorMessage`, `fetchWithTimeout` y eliminación total de `as any`).
Verificado: `tsc --noEmit` limpio · 42/42 tests · build OK.

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
| 7 | Helper puro `rowToObject` (10 mapeos fila→objeto unificados) | 42 tests |
| 8 | `getErrorMessage` centralizado; 51 `catch (e: any)` → `unknown` | `tsc`, 42 tests |
| 9 | `fetchWithTimeout` en los 4 `fetch` sin timeout (+ `clearTimeout` en error) | `src/lib/http.ts`; 42 tests |

---

## 1. Nuevos hallazgos de esta auditoría

### 1.1 ✅ RESUELTO — El botón "Conteo" del nav superior abre el terminal

- **Evidencia**: `DashboardTopNav.tsx:104,327` usa `dashboard.setIsStockCountOpen?.(true)`; verificado en navegador: el click abre "Muebles & Pasillos" / "Pistola Conteo".

### 1.1-bis 🟢 Contrato central `DashboardContext` con 25 `any`

- **Evidencia**: `products`/`policies`/`gmailModalItems`/`testConnectionHealth`/`syncQueue`/`eventMetrics`/`pmMetrics`/`virtualRows` etc. sin tipar.
- **Veredicto Ponytail**: 41 `Record<string, any>` y 1 sola index signature (`InventoryItem`) indican que el modelo ya es dinámico por diseño; tipar el contrato es un refactor de riesgo medio-alto y **sin síntoma observable** (no hay bugs asociados). YAGNI: no hacerlo de forma aislada. Atacar sólo los parámetros públicos cuando se toque cada función.
- **Prioridad**: Baja.

### 1.2 ✅ RESUELTO — Duplicación fila de planilla → objeto

- **Evidencia**: helper puro `rowToObject(headers, row)` en `pureCalculations.ts`, re-exportado; reemplaza los 10 mapeos de `InventoryDashboard.tsx` y `UniversalImportModal.tsx`.
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

### 2.1 ✅ COMPLETADO — `catch (e: any)` y `as any`

- **Evidencia**: 51 `catch` migrados a `unknown` + `getErrorMessage`. `as any`: **25 → 0** (uniones reales en `<select>`, `ViewKey` compartido, `emitFieldChange`, narrowing de torch/MSStream/AudioContext).
- **Restante**: ~200 `: any` en firmas de datos dinámicos (`referenceResolver`, `DashboardContext`, `pureCalculations`). Ver 1.1-bis para el veredicto YAGNI.

### 2.2 ✅ COMPLETADO — Brecha de timeout/abort

- **Evidencia**: nuevo `fetchWithTimeout(input, init, timeoutMs)` en `src/lib/http.ts`. Los 4 `fetch` sin cobertura (`gmailService`, 2× `backendMirrorService`) y los 2 AbortController manuales de `sheets.ts` lo reutilizan. `fetchFromScript` mantiene su AbortController explícito porque reintenta y necesita distinguir `AbortError` por intento.
- **Bug corregido de paso**: los AbortController manuales filtraban el `clearTimeout` en el camino de error (timer colgado); el `finally` del helper lo garantiza siempre.

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

1. **2.3** descomposición restante de `StockCountTerminal` (LIST ≈310 líneas → COUNTING ≈1.510).
2. **1.4** `window.confirm` → modales propios (7 sitios).
3. **1.3** prefijos de `localStorage` (requiere migración).
4. **1.5** ESLint/Prettier (acordar con el usuario antes de instalar).
5. **1.1-bis** tipado incremental del contrato sólo si aparece un síntoma.

**Invariante para todos**: `tsc --noEmit` + `npm test` + `npm run build` en verde antes de cada commit. No hay ESLint, así que `tsc` es la única red de seguridad automática.