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

### 1.4 ✅ RESUELTO — 6 `confirm()` nativos reemplazados por `ConfirmDialog`

- **Estado**: nuevo `src/components/common/ConfirmDialog.tsx` con `ConfirmProvider` + `useConfirm(): Promise<boolean>` (mismo patrón que `ToastProvider`). Montado en `App.tsx` envolviendo a `ToastProvider`.
- **Sitios convertidos** (6, no 7): `SliceManagerModal`, `SliceEditorModal`, `InventoryDashboard` ×2 (`handleDelete`, `handleBulkDelete`), `StockCountTerminal` ×3 (incl. el `confirm` de `handleFinishAndBackupSession`, que ahora usa `await` correctamente).
- **API**: `await confirm({ title, message, confirmLabel, variant })` o `await confirm('mensaje')`. Variantes `danger` (por defecto) / `warning` / `default`. Cierra con Escape vía click en backdrop.
- **Nota**: los handlers síncronos (`handleDeleteSession`, `handleRemoveSkuAllEntries`, `onClick` de borrado en ambos modales de slices) pasaron a `async`; los callers son `void` por lo que no propaga cambios de firma.
- **Verificado en navegador**: el diálogo aparece, "Cancelar" cierra sin borrar (5 registros intactos).

### 1.5 ✅ RESUELTO — ESLint configurado (flat config)

- **Estado**: `eslint.config.mjs` (flat config, ESLint 9 + `typescript-eslint` + `eslint-plugin-react-hooks`).
- **Barrido inicial**: 113 errores → **0 errores** (23 `react-hooks/exhaustive-deps` en `warn`, pre-existentes).
- **Reglas**: `no-unused-vars` con `argsIgnorePattern`/`varsIgnorePattern: ^_` y `caughtErrors: 'none'` (los 20 catch vacíos eran deliberados: `localStorage` best-effort, `navigator.vibrate`); `no-empty` con `allowEmptyCatch: true`.
- **Bugs reales corregidos por el linter**:
  1. `universalImporter.ts` — char class `[▼▲▶◀•▪🔹]` sin flag `u` borraba emojis no relacionados (🔸). Añadido `+u`.
  2. `pureCalculations.ts` — regex escapada inútil `^[\(-]+|[\)]+$` → `^[(-]+|[)]+$`.
  3. `PmReportModal.tsx` — rama muerta `|| 'RUT'` (x2), eliminada sin cambio de conducta.
  4. `InventoryDashboard.tsx` — `handleSyncOfflineQueue` mostraba un toast `loading` con `duration: 0` que nunca se actualizaba (quedaba colgado para siempre). Ahora usa `updateToast`/`removeToast`.
  5. `barcodeGenerator.ts` — `isCodeC` se asignaba 3 veces y nunca se leía; `CODE_B_TO_C` nunca usado. Eliminados.
- **Código muerto purgado**: ~120 líneas (imports, alias de contexto sin uso, estado vestigial `pageSize`/`totalPages`/`isViewMenuOpen`, el `useEffect` de "click outside" de dropdowns `#actions-dropdown`/`#view-dropdown` que ya no existen en el DOM, 21 props destructuradas sin uso).
- **Pendiente de decisión del usuario**: `handleFinishAndBackupSession` en `StockCountTerminal.tsx` es funcionalidad real (~45 líneas: cierra sesión y sube manifiesto) que **nunca tuvo invocador** en ningún commit. Queda marcada con `TODO(ponytail)` + `eslint-disable`. Opciones: cablearla desde la vista LIST o eliminarla. **No es regresión de esta auditoría.**

---

## 2. Obligatorio a mediano plazo (incumple guardrails escritos en `AGENTS.md`)

Estos puntos **deben** abordarse porque el propio repo los declara no negociables.

### 2.1 ✅ COMPLETADO — `catch (e: any)` y `as any`

- **Evidencia**: 51 `catch` migrados a `unknown` + `getErrorMessage`. `as any`: **25 → 0** (uniones reales en `<select>`, `ViewKey` compartido, `emitFieldChange`, narrowing de torch/MSStream/AudioContext).
- **Restante**: ~200 `: any` en firmas de datos dinámicos (`referenceResolver`, `DashboardContext`, `pureCalculations`). Ver 1.1-bis para el veredicto YAGNI.

### 2.2 ✅ COMPLETADO — Brecha de timeout/abort

- **Evidencia**: nuevo `fetchWithTimeout(input, init, timeoutMs)` en `src/lib/http.ts`. Los 4 `fetch` sin cobertura (`gmailService`, 2× `backendMirrorService`) y los 2 AbortController manuales de `sheets.ts` lo reutilizan. `fetchFromScript` mantiene su AbortController explícito porque reintenta y necesita distinguir `AbortError` por intento.
- **Bug corregido de paso**: los AbortController manuales filtraban el `clearTimeout` en el camino de error (timer colgado); el `finally` del helper lo garantiza siempre.

### 2.3 ✅ CERRADO — Descomposición de monolitos (por sub-extracciones)

- **Evidencia**: `StockCountTerminal.tsx` 3.409 → **2.851 líneas** (CAMPAIGN/LIST/RECONCILIATION ya extraídos; COUNTING aún en el padre); `InventoryDashboard.tsx` 2.328; `stockCountUtils.ts` 1.515; `CampaignConsolidationDashboard.tsx` 1.397.
- **Cita del guardrail §6**: *"No introduzcas lógica pesada ni componentes monolíticos"*.
- **Enfoque**: continuar la receta ya probada en el punto 6 completado — extraer cada bloque `viewState === 'X'` a su propio componente, con props tipadas y verificando que el JSX sea idéntico. Orden sugerido por autonomía: CAMPAIGN (≈60 líneas) → LIST (≈310) → COUNTING (≈1.510, el más acoplado, dejar para el final).

#### Avance: sub-extracción dentro del bloque COUNTING

El bloque COUNTING (≈1.500 líneas) **no** se puede extraer de una sola pieza sin riesgo desproporcionado: comparte 59 identificadores con el padre (cámara `MobileCameraBarcodeScanner`, nav inferior móvil y contenedor de ticket térmico viven **fuera** del bloque) y la vista COUNTING se solapa con las vistas CAMPAIGN/LIST ya extraídas. Se procedió, por YAGNI, con sub-extracciones presentacionales puras y autocontenidas:

- ✅ `CountNumpad.tsx` (88 líneas): teclado numérico táctil. Props: `onDigit`, `onClear`, `onBackspace`, `onMultiply`, `onIncrement`. −82 líneas del padre.
- ✅ `MobileReadingsList.tsx` (187 líneas): pestaña móvil "Lecturas" (búsqueda, conmutador Agrupado/Historial, steppers y borrado). 13 props. −155 líneas del padre.
- 🧹 Se eliminaron además 8 imports de `lucide-react` que ya estaban sin uso desde antes de esta sesión (no introducidos aquí).

- ✅ `LastScannedHeroCard.tsx` (60 líneas): hero "Último Producto Registrado" móvil, con steppers ±1. Props: `entry`, `onIncrement`, `onDecrement`. −52 líneas del padre.
- ✅ `MobileExpiryPrompt.tsx` (108 líneas): asistente Mes/Año móvil de la 2da lectura. Props: `sku`, `quantity`, `yearsList`, `tempYyyy`, `tempMm`, `onSelectYear`, `onSelectMonth`, `onSkip`, `onClose`; expone además `MONTHS_LIST` (definición única, el padre la importa). −88 líneas del padre.
- **Restante del bloque COUNTING**: el formulario de escaneo y el panel derecho de escritorio. Antes de intentar la extracción completa hay que **mover también** la cámara, la nav inferior y el ticket térmico al nuevo componente (o dejarlos como puentes), para que el estado viaje con el JSX.

#### Veredicto YAGNI sobre la extracción completa de COUNTING

Se midió el acoplamiento real: el bloque `viewState === 'COUNTING'` comparte **56 identificadores** (26 handlers/setters + 30 estados/memos) con el padre. Extraerlo de una pieza exigiría una interfaz de ~56 props o un contexto dedicado — precisamente la abstracción especulativa que Ponytail prohíbe (§5, regla 1). Se cierra el ítem 2.3 con la receta de sub-extracciones presentacionales; la extracción monolítica queda **descartada por diseño**, no por falta de tiempo.

- **Duplicación detectada (no atacada aún)**: entre los paneles móvil y escritorio hay ~33% de líneas equivalentes; el selector Mes/Año y el selector de multiplicadores/saltos están escritos dos veces con estilos distintos (tokens táctiles vs. compactos). Candidato a un componente con variante de tono, pero los estilos difieren lo suficiente como para exigir un diseño común primero — no hacerlo a lo bruto con ternarios.

---

## 3. Lo que NO hay que tocar

Aplico YAGNI también a las mejoras. Estas piezas están bien resueltas:

- **Cola offline e `indexedDbService`**: cubre el guardrail de "prevención de pérdida de datos". Funciona; no reescribir.
- **Cache y Web Worker de `useInventoryWorker`/`inventoryWorker.ts`**: correcto y ya separado.
- **`columnAliases.ts`, `pureCalculations.ts`, `universalImporter.ts`**: núcleo puro y testeado (36 asserts). Reutilizar, no refactorizar.
- **`motion` para el toast** (`ToastContainer.tsx`): tree-shaken, impacto mínimo. No vale el cambio.

---

## 4. Orden de ejecución sugerido

1. **1.3** prefijos de `localStorage` (requiere migración).
2. **1.1-bis** tipado incremental del contrato sólo si aparece un síntoma.

**Invariante para todos**: `tsc --noEmit` + `npm test` + `npm run build` en verde antes de cada commit. Desde 1.5 hay además `npx eslint src` como red de seguridad automática (0 errores exigidos; las 23 advertencias `exhaustive-deps` son deuda conocida).