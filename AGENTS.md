# Documentación Técnica Integral - Gestor de Vencimientos e Incidencias

Esta documentación está diseñada para que cualquier agente de IA o desarrollador pueda comprender la arquitectura, lógica, estructura y flujos de trabajo de la aplicación **Gestor de Vencimientos e Incidencias**, permitiendo continuar el desarrollo sin ambigüedades.

---

## 1. Propósito y Visión General de la Aplicación

La aplicación es un sistema web avanzado para la **gestión de fechas de vencimiento, políticas de retiro de inventario, y control de eventos/incidencias** (transporte, diferencias de inventario, mermas, deterioros). Está optimizada para operaciones logísticas, retail y gestión de almacenes que manejan datos importados o sincronizados desde **Google Sheets** (vía Google Apps Script o archivos Excel/CSV).

### Características Principales:
- **Gestión de Inventario y Vencimientos**: Visualización de alertas de vencimiento y cálculo automático de días para retiro según políticas comerciales.
- **Registro de Eventos e Incidencias**: Categorización de incidencias (Transporte, Diferencias, Mermas, Calidad).
- **Detección Semántica Inteligente de Columnas**: Capacidad de interpretar encabezados de hojas de cálculo sin importar acentos, mayúsculas, espacios, subrayados o abreviaciones.
- **Parsing Universal de Fechas y Números**: Soporte para fechas ISO, formato latino (`DD/MM/YYYY`), formato mes/año (`MM/YYYY`), números de serie de Excel (ej. `45321`), y formateo robusto de números con separadores de miles y decimales.
- **Integración con Google Sheets**: Generación y exportación de código Google Apps Script para sincronización en tiempo real.
- **Reportes Gerenciales (PM / Drain Report)**: Generación de reportes de drenaje y resúmenes copiables para gestión operativa.

---

## 2. Estructura del Proyecto y Directorios

El proyecto sigue una estructura modular limpia construida en **React 18+**, **TypeScript**, **Vite** y **Tailwind CSS**.

```text
/
├── metadata.json                 # Metadatos de la app y capacidades
├── package.json                  # Dependencias y scripts de compilación
├── vite.config.ts                # Configuración de Vite y Tailwind
├── AGENTS.md                     # Esta guía de documentación para agentes
└── src/
    ├── App.tsx                   # Componente raíz y enrutador principal de vistas
    ├── main.tsx                  # Punto de montaje de React DOM
    ├── index.css                 # Estilos globales y directivas de Tailwind (@import "tailwindcss")
    ├── types.ts                  # Tipados globales (InventoryItem, EventCategory, ItemStatus, etc.)
    ├── db/
    │   └── indexedDbService.ts   # Motor de almacenamiento asíncrono Local-First y cola offline
    ├── workers/
    │   └── inventoryWorker.ts    # Web Worker de cómputo en segundo plano (filtrado, métricas, indexación)
    ├── hooks/
    │   ├── useBarcodeScanner.ts  # Ciclo de vida compartido de la cámara de lectura (Html5Qrcode)
    │   ├── useInventoryWorker.ts # Hook de comunicación no bloqueante con el Web Worker
    │   ├── useInventoryFiltering.ts # Orquestación de filtros, paginación y agrupación
    │   ├── useModuleViewState.ts # Persistencia y transiciones de estado por módulo/pestaña
    │   ├── useOfflineSync.ts     # Hook de sincronización y vaciado de cola offline
    │   └── useColumnResize.ts    # Manejo interactivo del ancho de columnas
    ├── utils/
    │   ├── appStorage.ts        # Fuente única de claves de localStorage (STORAGE_KEYS), migración e isDemoMode()
    │   ├── columnAliases.ts      # Motor de detección semántica de encabezados de columnas
    │   ├── pureCalculations.ts   # Cálculos puros y parsing de fechas y métricas (Zero-DOM/Web Worker compatible)
    │   ├── universalImporter.ts  # Parser universal de Excel/CSV/TSV y motor de auto-mapeo semántico
    │   ├── dateCalculations.tsx  # Badges de UI, iconos y renderizado de estados
    │   ├── stockCountUtils.ts    # Motor de sesiones de conteo, cuadratura y exportación
    │   ├── campaignUtils.ts      # Motor de campañas de inventario cíclico (separado del de sesiones)
    │   ├── campaignAggregation.ts # Agregación de la vista de consolidación de campaña (pura, sin React)
    │   └── countAggregation.ts   # Agregación pura del conteo: agrupación, KPIs, filtros (sin React)
    └── components/
        ├── InventoryDashboard.tsx# Vista principal de control y filtrado de inventario
        ├── views/
        │   └── SchemaEditorView.tsx# Vista de configuración y mapeo de esquema de columnas
        ├── campaign/
        │   ├── CampaignMatrixTable.tsx # Pestaña MATRIX de la consolidación de campaña (tabla, filtros, ajuste de venta)
        │   ├── CampaignKpiSemaphore.tsx # Semáforo de 4 estados, cobertura y muebles consolidados de la campaña
        │   └── CampaignSkuBadges.tsx # Badge ERP/Hallazgo compartido entre la vista móvil y de escritorio del terminal
        ├── modals/
        │   ├── GlobalConfigModal.tsx # Configuración global y credenciales
        │   ├── UniversalImportModal.tsx # Ingestión universal asistida (Excel, CSV, TSV, Portapapeles)
        │   ├── ItemFormModal.tsx     # Modal para crear/editar registros e ítems
        │   ├── PmReportModal.tsx     # Generador de reportes de drenaje y alertas
        │   └── ScriptCodeModal.tsx   # Visor y generador de código Google Apps Script
        └── drawers/
            └── ItemDetailDrawer.tsx  # Panel de detalle maestro-detalle (dock en escritorio, overlay en móvil)
```

---

## 3. Arquitectura y Lógica de Módulos Clave

### A. Tipos Globales (`src/types.ts`)
Define las estructuras de datos fundamentales para los ítems de inventario, eventos, políticas, estados de alerta y configuraciones de sincronización.

### B. Motor de Detección Semántica (`src/utils/columnAliases.ts`)
Resuelve el problema común de las hojas de cálculo con encabezados inconsistentes (ej. "F. Vto", "Fecha Vencimiento", "Vencimiento", "fecha_vc").
- **`KnownFieldSemantic`**: Tipos semánticos estandarizados (`sku`, `descripcion`, `fecha_vc`, `fecha_retiro`, `cantidad`, `lote`, `politica`, `tipo_evento`, `observacion`, `proveedor`, etc.).
- **`FIELD_PATTERNS`**: Diccionario de expresiones regulares por campo semántico que cubre variaciones ortográficas, acentos y abreviaciones.
- **`findColumnBySemantic(headers, semantic)`**: Busca en un arreglo de encabezados de columnas el que coincida semánticamente, permitiendo mapeo automático robusto.

### C. Cálculos y Utilidades de Fechas / Números (`src/utils/pureCalculations.ts` + `src/utils/dateCalculations.tsx`)
- **`parseAnyDate(dateVal)`** (en `pureCalculations.ts`): Soporta:
  1. Números de serie de Excel (ej. `45321`).
  2. Formatos ISO (`YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY.MM.DD`).
  3. Formatos Latinos (`DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`).
  4. Formatos compactos (`YYYYMMDD`).
  5. Formatos Mes/Año (`MM/YYYY` - calcula último día del mes).
  6. Objetos `Date` nativos o cadenas de texto estándar.
- **`parseLocaleNumber` / `formatLocaleNumber`** (en `pureCalculations.ts`): Conversión y formateo robusto de valores numéricos de stock/cantidad que contengan comas y puntos decimales europeos/americanos.
- **`getItemStatus(item, headers)`** (en `dateCalculations.tsx`): Calcula de manera inteligente el estado operativo de un ítem (ej. Vencido, Crítico por vencer, Próximo a retiro, En buen estado) comparando con la fecha actual.
- **`getEventCategory(item, headers)`** (en `pureCalculations.ts`): Clasifica automáticamente eventos e incidencias en categorías (`TRANSPORTE`, `DIFERENCIAS`, `MERMAS`, `CALIDAD`, etc.).

Nota: `pureCalculations.ts` no depende del DOM ni de React (es el módulo que consume el Web Worker); `dateCalculations.tsx` re-exporta sus funciones para no romper a los consumidores existentes y añade los envoltorios de UI.

### D. Registro y Configuración de Acciones Masivas (`src/utils/bulkActionsRegistry.ts`)
- **Control Contextual y Prevención de Ruido Visual**: Permite activar, desactivar o dejar en modo automático (`auto`, `enabled`, `disabled`) cualquier acción masiva (WhatsApp, Gmail, Ticket, Excel, Acción PM, Edición FRC, Eliminar) por tabla o vista específica.
- **Detección Contextual Inteligente (`defaultPredicate`)**: Si una acción está en modo `auto`, solo se muestra si la tabla contiene columnas relevantes (ej. WhatsApp solo si hay columnas telefónicas o la hoja se llama "Contactos/Clientes"; Gmail solo si hay columnas de email).
- **Persistencia en `SheetConfig`**: Se almacena en `sheetConfig.bulkActionSettings[tableKey][actionId]` y se sincroniza con el almacenamiento local y en la nube.
- **Panel Modular y Reutilizable (`TableBulkActionsPanel.tsx`)**: Componente centralizado que gestiona los selectores de tabla, badges de detección y controles de 3 estados, utilizado tanto en el modal específico `BulkActionsConfigModal.tsx` como en la pestaña de ajustes globales `GlobalConfigModal.tsx`.

### E. Detección Inteligente de Acción según Política: Canje Proveedor vs. Merma Directa
- **Lógica de Decisión Operativa (`detectPolicyActionType`)**:
  - Distingue automáticamente entre ítems que tienen política de retorno acordada con el proveedor (`CANJE_PROVEEDOR`), mermas directas sin retorno (`MERMA_DIRECTA`), y ventas prioritarias de liquidación comercial (`VENTA_DRENAJE`).
  - Reconoce patrones de texto e indicadores de políticas (`"Canje"`, `"Devolución"`, `"Garantía"`, `"Retorno"`, `"Sin Canje"`, `"Destrucción"`, `"Merma"`, o plazos contractuales en días).
  - Se integra en el Radar PM (`PmRadarCards.tsx`), badges de tabla (`InventoryTableRow.tsx`), panel de detalle (`ItemDetailDrawer.tsx`), reportes para PM (`PmReportModal.tsx`) y slices nativos (`sliceRegistry.ts`).

### F. Funcionalidades Avanzadas Estilo AppSheet (`Ref`, `Show_If` y `Valid_If`)
- **Referencias Cruzadas y De-referenciación (`src/utils/referenceResolver.ts`)**:
  - `findMasterProduct` y `searchMasterProducts`: Búsqueda tolerante e interactiva en el catálogo maestro (`products`) por SKU, nombre, proveedor o categoría.
  - `dereferenceMasterProduct`: Propagación atómica automática de campos maestros (Descripción, Proveedor, Categoría y Política) hacia las columnas correspondientes en la hoja activa al seleccionar o ingresar un SKU.
  - Sincronización instantánea de política comercial para el cálculo automático de la fecha de retiro preventivo.
  - Tarjeta de enlace maestro (`Ref: Catálogo Maestro`) visible tanto en el formulario (`ItemFormModal`) como en el panel de detalle (`ItemDetailDrawer`).
- **Formularios Dinámicos y Reglas de Visibilidad (`src/utils/dynamicFormRules.ts`)**:
  - `evaluateShowIf`: Evalúa la visibilidad condicional de campos según la categoría de evento seleccionada (`TRANSPORTE`, `DIFERENCIA`, `AVERIA`, `CALIDAD`, `CANJES`, `VENCIMIENTO`).
  - Mantiene siempre visibles los identificadores primarios y campos con datos ingresados, reduciendo la fricción cognitiva al ocultar campos no relevantes para la categoría activa.
  - Selector en barra de control de formulario para alternar entre "Campos Relevantes" y "Mostrar Todos".
  - `getOperationalSuggestions` (`Valid_If` contextual): Sugerencias operativas rápidas con un clic para alimentar las observaciones de bodega según la incidencia.
  - Atajos numéricos para cantidades (`+1`, `+5`, `+10`, `+25`, `+50`) y asistente de folios de traspaso (`TR-xxxxx` / `Marcar Pendiente`).

### F. Slices y Vistas Personalizadas Estilo AppSheet (`src/utils/sliceRegistry.ts`)
- **Concepto de Slice**: En AppSheet, un "Slice" es una vista filtrada de una tabla que define un subconjunto de filas (criterios y filtros guardados), un ordenamiento predeterminado, una columna de agrupación opcional y una selección personalizada de columnas visibles.
- **Slices Nativos Preconfigurados (`BUILT_IN_SLICES`)**: 12 en total, y **no se eligen por nombre de pestaña sino por capacidad detectada en las columnas** (ver abajo).
  - Capacidad `vencimiento` (6): *Retiro Inmediato*, *Canje Proveedor*, *Merma Directa*, *Radar PM (Drenaje)*, *Próximos a Vencer*, *Inventario en Regla*.
  - Capacidad `incidencia` (6): *Traspasos Pendientes*, *Transporte & Chofer*, *Diferencias Stock*, *Mermas y Averías*, *Canjes y Devoluciones*, *Regularizados*.
- **Selección por capacidad, no por nombre de pestaña**: cada slice nativo declara `requiredCapability` (`'vencimiento' | 'incidencia'`). `detectTableCapabilities(headers, customAliases)` deduce la capacidad de la hoja reutilizando `findColumnBySemantic`: `fecha_vc` / `fecha_retiro` / `mes`+`anio` dan `vencimiento`; `tipo_evento` da `incidencia`; sin nada, la hoja no recibe slices nativos. Esto permite que una hoja **no canónica** (ej. "Bodega Sur" con columna `Fecha Vto`) reciba los slices de vencimiento sin configurar nada, y que una hoja sin dominio (ej. Clientes) no reciba ninguno.
  - La precedencia `vencimiento > incidencia` es deliberada: `getEventCategory` asume `VENCIMIENTO` por defecto y `main` sí trae `FRC_EVEN`; sin ella, `main` heredaría los slices de incidencias.
  - **Partición estricta de dominio**: el radar de vencimientos sólo admite `getEventCategory === 'VENCIMIENTO'` (vencimiento puro) y el registro FRC todo lo demás. `VENC. CERC.` es un **evento FRC** (mercadería recibida con poca vida útil), no una categoría de vencimiento: cuenta en `eventMetrics.vencimientoCercano` y **no** suma a `eventMetrics.vencimientos`. El mismo gate vive en `sliceRegistry.itemMatchesSlice`, en el worker y en el fallback síncrono de `useInventoryFiltering`; los tres deben moverse juntos. Las métricas `vencimientos` + `vencimientoCercano` + el resto de categorías cubren todas las filas sin solaparse.
  - `customAliases` (Ajustes) se pasa a la detección: un alias declarado por el usuario cuenta como capacidad.
  - Los slices **personalizados** no declaran capacidad y nunca se restringen.
- **Slices Personalizados Creados por el Usuario**:
  - El usuario puede capturar en un clic sus filtros, agrupaciones, columnas visibles y ordenamiento actual con el modal `SliceEditorModal.tsx`.
  - Personalización de color, icono, nombre y descripción explicativa.
  - Persistencia doble: en `localStorage` (`appsheet_custom_slices`) y en `sheetConfig.slices` para sincronización en la nube con Google Sheets/PropertiesService.
- **Barra Selectora de Slices (`SliceSelectorBar.tsx`)**:
  - Ubicada directamente sobre la tabla principal con navegación horizontal fluida.
  - Contadores de filas en tiempo real (`computeSliceCounts`) calculados en una sola pasada de alto rendimiento.
  - Badges cromáticos personalizables con acceso rápido a edición, eliminación y restablecimiento de vista ("Todas las Filas").

### H. Resolución de Identidad de Entidad y Cola de Mutación Robusta (`src/utils/entityIdentityResolver.ts`)
- **Resolución de Claves Primarias (`resolveItemIdentity`)**:
  - Supera la fragilidad de depender exclusivamente de `_rowIndex` (que se desincroniza ante ordenamientos, filtros o inserciones externas en Google Sheets).
  - Jerarquía de identificación optimizada para la operación real:
    1. Columna configurada como `isKey` en `SheetConfig.schema`.
    2. Columna directa de código único `CU_VC` (ej. `SKU_VC` + `YYYY` + `MM` = `2000210218569202712`) o ID semántico natural (`ID_VC`, `ID_EVENTO`, `FOLIO`, `ID`).
    3. Clave compuesta de negocio: `SKU` + `YYYY` + `MM` (o `SKU` + `FECHA_VC` / `LOTE` como respaldo secundario).
    4. Identificador sintético con prefijo de hoja y fila de respaldo.
- **Re-resolución Dinámica en Cola Offline (`matchRowIndexByIdentity`)**:
  - Al vaciar mutaciones (`update` o `delete`) en `useOfflineSync.ts`, el sistema re-localiza dinámicamente el `rowIndex` exacto en los datos frescos de Google Sheets mediante la clave de entidad o coincidencia de `CU_VC` / `SKU`+`YYYY`+`MM`, previniendo sobreescrituras o eliminaciones accidentales de filas contiguas.
- **Invariante: la identidad manda sobre el índice obsoleto (servidor)**:
  - El `rowIndex` lo calcula el cliente sobre una lectura previa. Si la hoja se movió entretanto (otra terminal borró una fila, alguien insertó/ordenó en Sheets), escribir por posición corrompe la fila **vecina** sin dar error: `updateRow` sobreescribe datos ajenos y `deleteRow` los destruye.
  - Por eso el template de Apps Script (`src/lib/sheets.ts`) **re-localiza por clave antes de escribir**, no solo cuando el índice es inválido. El cliente envía `entityKey` + `entityKeyCol`.
  - Al buscar la clave se usa **solo la columna de la clave** (`entityKeyCol`). Escanear toda la fila es peligroso con SKU numéricos: un código corto (`"100"`) coincide con una celda de `CANTIDAD` de otra fila y la escritura iría al registro equivocado. Sin columna conocida se exige coincidencia **única** en toda la fila; una ambigüedad conserva el índice en vez de reubicar mal.
  - Clasificación de claves en el servidor: **de celda** (se reubica), **compuesta** (`SKU::FECHA`, se verifica el contenido antes de borrar) y **sintética** (`_ROW_`, deriva del propio índice: no aporta información, se usa el índice).
  - Congelado por `tests/perf/rowidentity-template.ts`, que ejecuta el **template real** con stubs de Apps Script (no un mock) y cubre los 9 casos, incluidos los falsos positivos numéricos. `tests/perf/rowidentity.cjs` cubre el ida y vuelta HTTP contra el backend falso.


### I. Módulo de Conteo Masivo de Existencias y Cuadratura Virtualizada (`src/utils/stockCountUtils.ts` & `StockCountTerminal.tsx`)
- **Virtualización de Cuadratura**: La tabla de reconciliación y cuadratura física vs. teórica utiliza `@tanstack/react-virtual` (`useVirtualizer`), permitiendo auditar cientos o miles de SKUs sin degradación de memoria ni lag en el scroll.
- **Dos Modalidades Operativas**:
  - **Conteo a Ciegas (`BLIND`)**: Auditoría limpia donde el operario registra lecturas y cantidades físicas sin ver el stock teórico en pantalla, previniendo sesgos de conteo.
  - **Conteo Contra Documento (`DOCUMENT`)**: Comparación en tiempo real contra la hoja de inventario activa, mostrando cobertura y estado de avance.
- **Captura Opcional de Vencimiento (Mes/Año)**:
  - Toggle activable/desactivable por sesión para registrar `MM` (01-12) y `YYYY`.
  - Generación automática de `CU_VC` (`${SKU}${YYYY}${MM}`) para evitar duplicados.
  - Cálculo automático de `FECHA_VC` en formato latino (`DD/MM/YYYY`) fijada en el último día del mes correspondiente.
- **Búsqueda y De-referenciación en Catálogo Maestro (`products`)**:
  - Coincidencia exacta instantánea por SKU o autocompletado en tiempo real al escribir nombre/código.
  - Asignación atómica de descripción, RUT del proveedor, política de canje, días de retiro preventivo, departamento/mundo y jefe de producto (PM).
- **Cuadratura y Sincronización con VENCIMIENTOS**:
  - Comparativa de métricas: Total Físico vs. Teórico, Diferencia Neta, Cuadrados, Faltantes, Sobrantes y No Catalogados.
  - Exportación directa a planilla Excel (`.xlsx`).
  - Botón de sincronización con la pestaña `VENCIMIENTOS` que estructura automáticamente las 14 columnas canónicas y encola mutaciones offline/online de manera segura.

### J. Arquitectura Modular del Dashboard y Espejo de Backend
- **Modularización de `InventoryDashboard.tsx`**:
  - **`FloatingBulkActionBar.tsx`**: Barra flotante contextual desacoplada para operaciones masivas (tickets, código de barras, exportación Excel, borrador Gmail, WhatsApp, edición en lote y eliminación).
  - **`DashboardModalsManager.tsx`**: Administrador centralizado de modales y drawers que libera al dashboard principal de sobrecarga de estado visual.
- **Espejo de Backend REST (`src/services/backendMirrorService.ts` & `BackendMirrorPanel.tsx`)**:
  - Resuelve las limitaciones de latencia (~2.500ms en Google Apps Script) y la falta de bloqueos de concurrencia a nivel de fila durante conteos masivos en farmacia.
  - Soporte para un backend espejo secundario vía endpoint REST personalizado.
  - Estrategias de sincronización: **Escritura Dual (Dual-Write)** en paralelo con Google Sheets, **Espejo Primero (Mirror-First)** para latencia sub-150ms con volcado asíncrono, o **Solo Respaldo (Backup-Only)**.
  - Telemetría en tiempo real, test de latencia de red, identificador único de terminal/dispositivo (`deviceId`) y resolución de conflictos por timestamp atómico (`last_write_wins`).

### K. Consolidación Inteligente por CU_VC (Control sin Lotes)
- **Regla Operativa**: No se trabaja con lotes. La unidad de vencimiento es unívocamente `SKU` + `MM/YYYY` (`CU_VC`).
- **Motor `cuVcConsolidator.ts`**:
  - `findExistingItemByCuVc`: Detecta colisiones en tiempo real al ingresar o editar items en `ItemFormModal`.
  - `reconcileImportWithInventory`: En importaciones masivas (Excel/CSV/Portapapeles), previene duplicación consolidando cantidades (`consolidate_sum`), sobrescribiendo, omitiendo o agregando.
  - En `handleSave` y `handleUniversalImportConfirmed` de `InventoryDashboard.tsx`, actualiza la fila existente (`updateRow`) sumando stock en lugar de generar filas duplicadas.

### L. Componentes de UI
- **`App.tsx`**: Administra el estado global de los datos de inventario, pestañas activas (Dashboard vs Schema Editor), modales y conectividad con Google Sheets / datos locales.
- **`InventoryDashboard.tsx`**: Tabla interactiva con filtros avanzados, búsqueda rápida, tarjetas de resumen KPI y botones de acción rápida.
- **`ItemDetailDrawer.tsx`**: Drawer lateral que agrupa toda la trazabilidad de un SKU (historial de vencimientos, lotes y eventos relacionados).
- **`PmReportModal.tsx`**: Genera reportes listos para copiar al portapapeles o exportar para jefaturas de producto/operaciones.

### M. Sistema de Campañas de Inventario Cíclico y Matriz de Consolidación (Farmacia en Movimiento)
- **Propósito**: Auditorías de inventario completas en farmacias con stock en constante movimiento (atención al público simultánea), dividiendo el trabajo en múltiples días y sesiones por mueble/pasillo.
- **Estructura de la Información de Farmacia**:
  - Reconocimiento nativo de las columnas oficiales del ERP: `Local`, `Código SKU`, `Descripción`, `Proveedor`, `Stock`, `Inv. Inicial`, `Egreso`, `Ingreso`, `Venta`, `Stock Min`, `Stock Max`, `Stock Crítico`.
- **Arquitectura de "Separación de Aguas" (4 Estados de Auditoría)**:
  1. 🟢 **Cuadrados / Validados (`VALIDADO_OK`)**: SKUs auditados cuyo stock físico coincide con el teórico (o validados manualmente por el operario).
  2. 🟡 **Discrepancias (`DISCREPANCIA`)**: SKUs con diferencias (faltantes o sobrantes) pendientes de revisión de ventas en caja o de una 2da vuelta de conteo.
  3. 🔴 **Nunca Pistoleados (`NUNCA_PISTOLEADO`)**: SKUs con stock teórico en el ERP pero con cero lecturas registradas en todas las sesiones.
  4. 🔵 **Hallazgos Físicos (`HALLAZGO`)**: SKUs pistoleados físicamente en los muebles pero no registrados en el snapshot del ERP.
- **Herramientas Clave**:
  - **Ajuste de Ventas en Vivo**: Permite ingresar ventas registradas en caja durante el turno para recalcular en tiempo real el stock teórico efectivo y la diferencia neta.
  - **Validación con un Clic**: Permite marcar un SKU como cerrado/conforme, fijando su estado en la matriz global.
  - **Exportación de Planilla de 2do Conteo (.xlsx)**: Genera una planilla limpia con únicamente los SKUs discrepantes para el equipo de revisión.
  - **Exportación de Acta de Cierre Oficial (.xlsx)**: Genera el informe final consolidado con desglose por mueble y auditoría.
  - **Lanzador de 2da Vuelta Directa**: Crea automáticamente una sesión de conteo focalizada en los SKUs descuadrados.

### N. Modularización del Conteo por Dominio (Fase 5)
- **`src/utils/stockCountUtils.ts`**: solo el **ciclo de sesión** de conteo —`reconcileStockCountSession`, `buildVencimientosRowFromCount`, `generateCuVc`, la persistencia de sesiones y la exportación a Excel—.
- **`src/utils/campaignUtils.ts`**: el **ciclo de campaña** completo (13 exports, ~680 líneas): `importPharmacySnapshotToCampaign`, `computeCampaignConsolidationMatrix`, la separación de aguas, reportes, actas y su persistencia. Se separó porque tenía **cero acoplamiento** con el resto y **cero consumidores internos**.
- **`src/utils/campaignAggregation.ts`**: la **agregación de la vista de consolidación de campaña**, sin React. Cuatro funciones que antes eran `useMemo` dentro de `CampaignConsolidationDashboard.tsx`:
  - `resolveActiveCampaign` — elige la campaña activa por id y, si no la encuentra, cae a la primera. La vista no debe quedarse en blanco con un id huérfano.
  - `collectAllAuditRows` — une los cuatro estados de la separación de aguas en el orden canónico: discrepancias, nunca pistoleados, cuadrados, hallazgos. El orden importa para la matriz.
  - `getAuditProviders` — proveedores distintos de las filas auditadas, ordenados, para el filtro desplegable.
  - `filterAuditRows` — aplica estado, proveedor y búsqueda (SKU, descripción o proveedor) sobre las filas ya consolidadas.
- **`src/components/campaign/CampaignMatrixTable.tsx`**: la pestaña **MATRIX** de la consolidación (tabla, barra de filtros, buscador, ajuste de venta por fila). Se extrajo del dashboard en la Fase 5, corte 3: 15 props, todas de datos o callbacks existentes.
- **`src/components/campaign/CampaignKpiSemaphore.tsx`**: el **semáforo de 4 estados**, la cobertura global y los muebles consolidados de la campaña. Se extrajo en el corte 4: 7 props. Incluye su propia guarda `if (!matrix) return null`, así que el padre no lo envuelve en condicional.
- **`src/components/campaign/CampaignSkuBadges.tsx`**: el badge de **stock teórico del ERP / hallazgo físico** del terminal de conteo, antes duplicado entre la vista móvil y la de escritorio (`StockCountTerminal.tsx`). `CampaignSkuErpBadge` toma `stats` (`inErp`, `stockTeorico`) y `compact` para la variante de escritorio. El badge de *diferencia* que lo acompaña **no** se unificó: cada vista tenía su propio formato (emoji+verbo vs. signo) y un solo consumidor (YAGNI).
- **`src/utils/countAggregation.ts`**: la **agregación pura del conteo**, sin React. Ocho funciones que antes eran `useMemo` dentro de `StockCountTerminal.tsx` (~200 líneas) y no tenían cobertura:
  - `groupSkuEntries` / `filterGroupedEntries` / `filterChronoEntries` — agrupan y filtran las lecturas. **Agrupan por `SKU`, no por `CU_VC`**: dos meses del mismo SKU se ven como un solo grupo. El motor de cuadratura sí separa por `CU_VC`, así que son criterios distintos a propósito.
  - `getLastScannedItem` — acumulado de la última lectura. Depende del orden de `conteos`: el terminal inserta al frente, así que `conteos[0]` es la más reciente.
  - `computeReconciliationMetrics` — KPIs. El teórico incluye `ajusteMovimiento` (ventas del turno), que es lo que hace cuadrar la diferencia neta con la operación real y no con el snapshot congelado. La cobertura usa `|| 1` en el denominador para no dar `NaN` con sesión vacía.
  - `getReconciliationProviders` / `filterReconciliation` / `getPendingItems` — proveedores distintos, filtros de estado y proveedor (`DIF` = todo lo que no está cuadrado, **no** solo faltantes), y checklist de pendientes (`teorico > 0 && contado === 0`).
  - `StockCountReconciliationView` ya no declara `ReconciliationFilter` ni `ReconciliationMetrics`: los importa de este módulo.
- **`isDemoMode()` en `appStorage.ts`**: fuente única de "no hay backend configurado" (`!localStorage.getItem(STORAGE_KEYS.SCRIPT_URL)?.trim()`). Estaba escrita idéntica en 5 sitios. El `.trim()` no es adorno: `SCRIPT_URL` con solo espacios es modo demo.
- **`hasDemoEntry()` / `setDemoEntry()` en `appStorage.ts`**: la elección explícita de "explorar la demostración" desde el onboarding (`appsheet_clone_demoEntry === '1'`). Es **independiente** de `SCRIPT_URL`: entrar a demo no escribe una URL falsa, porque entonces la app creería tener backend y encolaría mutaciones contra un endpoint inexistente. El modo demo sigue definiéndolo `isDemoMode` (ausencia de `SCRIPT_URL`); esta bandera sólo evita volver a pedir la URL en cada recarga. `handleSetupSubmit` la limpia al conectar de verdad, para que borrar la URL después devuelva al onboarding. Antes, la única forma de ver la app sin backend era escribir una URL con la forma de Apps Script: el modo demostración existía pero era inalcanzable desde la UI (`tests/perf/seed.js` lo sembraba a mano).

---

### O. Capacidades de Tabla (Fase 7 — multi-hoja por capacidades)

**Idea central:** una hoja se trata según **qué columnas tiene**, no según **cómo se llama**. Es
el mismo principio que las bulk actions, extendido a los módulos completos. Así la misma app
sirve datos que no son de vencimientos (una hoja de Clientes, una bitácora ajena) sin construir
otra a medida.

- **`detectTableCapabilities(headers, customAliases?)`** (`src/utils/sliceRegistry.ts`) devuelve
  un `Set<TableCapability>` y reutiliza `findColumnBySemantic` (nunca compara nombres fijos):
  - `vencimiento` — hay `fecha_vc`, `fecha_retiro`, o `mes`+`anio`.
  - `incidencia` — hay `tipo_evento`. **Solo si no hay `vencimiento`** (precedencia deliberada:
    `getEventCategory` asume `VENCIMIENTO` por defecto y `main` trae `FRC_EVEN`; sin la
    precedencia, `main` heredaría los slices de incidencia).
  - `conteo` — hay **`sku` Y `cantidad`** (ambas; son las que el terminal necesita para
    reconciliar). Es **aditiva**: convive con las otras dos.
  - `catalogo` — hay **`sku` Y `descripcion`**, y no se detectó `vencimiento` ni `incidencia`.
    Es la **rama final** (`vencimiento` > `incidencia` > `catalogo`): describe productos es lo
    que queda cuando la hoja no tiene fechas ni registra eventos. Alimenta los chips de
    proveedor/categoría y la marca DETALLE del SKU.
- **No existe capacidad `politicas`** (deliberado): una hoja de políticas no gatea ningún
  comportamiento propio — `resolveItemPolicyAndRetiro` consume `policies` si están, sea cual
  sea la vista. Añadirla sería una capacidad sin efecto (YAGNI).
- **`tipo_evento` exige calificador:** `/^categor[ií]a(_|\s)?(evento|incidencia|falla|novedad)$/i`.
  `CATEGORIA` pelado es la categoría de *producto* (semántico `categoria`), no el tipo de evento.
  Sin esta restricción una hoja de catálogo con columna `CATEGORIA` se clasificaba como incidencia.
- **`TableCapability`** (`src/types.ts`) es el tipo. `TableSlice.requiredCapability` lo usa para
  filtrar slices nativos; los personalizados **no** declaran capacidad y nunca se restringen.
- **UI gateada por capacidad:** el contexto publica `dashboard.tableCapabilities`; los
  consumidores preguntan `has('conteo')` (Conteo/Pistoleo en `DashboardTopNav`,
  `DashboardMobileFABs` y `Sidebar`). Antes esa UI se ofrecía en toda hoja.
- **Detección única:** `detectTableCapabilities(headers, customAliases?)`
  (`src/utils/sliceRegistry.ts`) es la fuente de verdad: pregunta **qué columnas hay**, nunca
  cómo se llama la tabla. El dashboard la resuelve **una sola vez** con `useMemo` y publica el
  `Set` en `dashboard.tableCapabilities`; los consumidores no repiten la regla.
- **Sin respaldo por identidad ni nombre de hoja.** Existió
  `resolveTableCapabilities(headers, …, sheetTitle, activeView)`, que añadía capacidad cuando el
  nombre de hoja o la identidad de vista eran de dominio, para tapar que en modo demo/offline
  `headers` y `activeSheet` quedaban obsoletos al cambiar de vista. Corregida la causa raíz en
  `useInventoryData` (`renderedViewRef`), se probó por mutación que el gate E2E seguía verde sin
  el respaldo, y se eliminó: era andamiaje y además un falso positivo latente (una hoja llamada
  "Stock General" sin columnas de vencimiento heredaba la capacidad). `democheck.cjs` es ahora
  la guardia directa de esa causa raíz, sin nada que la enmascare.
- **Degradación segura:** sin `headers` no se detecta ninguna capacidad (0 slices nativos, no
  excepción). Cualquier llamada nueva **debe** pasar `headers` y, si aplica, `customAliases`.

**Regla al añadir un módulo de dominio:** no lo actives por `activeView === '...'`. Declara su
capacidad en `detectTableCapabilities` y gatea por ella, para que una hoja no canónica no lo
arrastre. Si el gate vive en un componente, usa `dashboard.tableCapabilities` (ya efectivas) y
`has(...)`, sin releer `activeView`. Tras el paso 6 quedan **42** despachos por identidad
(`grep -rEn "activeView\s*===\s*['\"]|tableKey\s*===\s*['\"]" src`), frente a **83** en el mismo
`grep` sobre el baseline: deuda medida, no un patrón a imitar (ver ROADMAP, Fase 7). El paso 6
quitó 2 (`quickChips` y la marca DETALLE del SKU en `InventoryTableRow`).

---

## 4. Integración con Google Sheets y Google Apps Script

La aplicación está diseñada para operar tanto con datos de ejemplo locales como con conexiones reales a Google Sheets a través de un script de Google Apps Script. El componente `ScriptCodeModal.tsx` proporciona el script necesario para desplegar como Web App en Google Sheets, permitiendo la sincronización bidireccional mediante JSON endpoints.

---

## 5. Protocolo de Vibe Coding y Reglas de Desarrollo Eficiente (Inspirado en Ponytail)

Para garantizar un código limpio, sin sobreingeniería (*anti-bloat*) y con el menor volumen de código efectivo posible, todo agente o desarrollador que trabaje en esta aplicación debe someter cada cambio a la **Escalera de Decisiones de Ponytail (Decision Ladder)**:

```text
               ┌────────────────────────────────────────────────────────┐
               │ 1. ¿Esto realmente necesita existir? (YAGNI)          │
               └──────────────────────────┬─────────────────────────────┘
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │ 2. ¿Ya existe en este proyecto? (Reutilizar)          │
               └──────────────────────────┬─────────────────────────────┘
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │ 3. ¿Lo resuelve la librería estándar de JS/TS?        │
               └──────────────────────────┬─────────────────────────────┘
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │ 4. ¿Existe una función nativa del navegador/DOM?       │
               └──────────────────────────┬─────────────────────────────┘
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │ 5. ¿Lo resuelve una dependencia ya instalada?          │
               └──────────────────────────┬─────────────────────────────┘
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │ 6. ¿Puede resolverse en una sola línea o función pura? │
               └──────────────────────────┬─────────────────────────────┘
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │ 7. Escribir únicamente el código mínimo que funcione   │
               └────────────────────────────────────────────────────────┘
```

### Reglas Clave del Protocolo Ponytail:
1. **Principio YAGNI Estricto**: No agregues opciones de configuración hipotéticas, abstracciones especulativas ni botones de acciones no solicitadas.
2. **Reutilización Obligatoria**: Antes de crear un helper o función nueva, consulta `src/utils/dateCalculations.tsx`, `src/utils/columnAliases.ts` y `src/utils/exportUtils.ts`.
2-bis. **Claves de `localStorage`**: nunca escribas una clave literal. Usa `STORAGE_KEYS` (y `sheetCacheKey()` / `demoItemsKey()` para las dinámicas) desde `src/utils/appStorage.ts`. Un desajuste de prefijo entre lector y escritor fue un bug real (`appsheet_config` vs `appsheet_clone_config`).
3. **Cero Dependencias Innecesarias**: No instales paquetes nuevos si la funcionalidad se puede lograr con la biblioteca estándar de TypeScript o las dependencias existentes (`lucide-react`, `recharts`, `motion`, `@tanstack/react-virtual`).
4. **Líneas Mínimas y Concisas**: Prefiere código conciso, legible y directo sobre patrones complejos con múltiples capas de wrappers o interfaces redundantes.
5. **Sin Costos Monetarios (Estricto)**: Esta aplicación está diseñada estrictamente para la gestión operativa y logística de fechas de vencimiento y de incidencias. No se manejan costos monetarios ni precios de ningún tipo. No se deben crear o reintroducir campos, tarjetas o métricas financieras en ninguna parte de la UI (vistas, modales, drawers o tablas).

### Invariantes de Seguridad y Calidad (Guardrails No Negociables):
- **Prevención de Pérdida de Datos**: Conservar siempre el soporte offline y las colas de sincronización para Google Sheets.
- **Validación de Datos**: Mantener sanitización, manejo de errores `try/catch` con `AbortController` y parsing seguro de formatos heterogéneos de fechas y números.
- **Accesibilidad y Rendimiento**: Respetar contraste visual WCAG AA, virtualización de listas grandes (`@tanstack/react-virtual`) y tipado estricto en TypeScript sin `any` injustificados.
- **Secretos fuera de recursos compartidos**: La pestaña `_CONFIG_APP` la lee cualquiera con acceso a la hoja, así que **nunca** debe contener credenciales. `saveCloudConfig` redacta `backendMirror.apiKey` con `redactSecretsForCloudSheet` antes de escribirla; Script Properties (privado) sí conserva la config íntegra, por eso se serializan por separado. `mergeCloudConfigs` repone la clave local cuando gana un remoto que no la trae: sin eso, la redacción la borraría en silencio en cada revalidación. Congelado en `test-modules.ts` §24.

---

## 6. Guías para el Próximo Agente / Desarrollador

1. **Mantener la Modularidad**: No introduzcas lógica pesada ni componentes monolíticos en `App.tsx`. Extiende o crea submódulos en `src/components/` o `src/utils/`.
2. **Iconos**: Utiliza exclusivamente iconos provenientes de `lucide-react`.
3. **Estilos**: Emplea únicamente clases utilitarias de Tailwind CSS (configurado con `@import "tailwindcss";` en `src/index.css`). No crees archivos CSS adicionales.
4. **Tipado Estricto**: Asegúrate de que todo código nuevo mantenga compatibilidad estricta con TypeScript (`npm run lint` pasa sin errores de `tsc --noEmit`).
5. **Robustez en Hojas de Cálculo**: Siempre que proceses datos tabulares externos, utiliza el motor de `columnAliases.ts` en lugar de buscar nombres de columnas fijos (`item['SKU']`), garantizando tolerancia a variaciones en los archivos del usuario.
6. **Aplicar la Escalera de Ponytail**: Antes de escribir una sola línea de código, pregúntate si puedes reutilizar lo que ya existe o resolverlo con la menor cantidad de código posible.
7. **Leer del contexto, no de dos sitios**: `ViewConfigControlDrawer` y `DashboardPageHeader` se montan **sin props**; su única ruta real de datos es `useDashboard()`. El patrón `props.X ?? dashboard.X` da dos caminos para el mismo valor y ya causó un bug real (el fallback `?? (() => {})` del selector de agrupación dejaba la acción en un no-op silencioso). ESLint lo prohíbe en todo `src`, sin excepciones. **Datos vs. comportamiento**: las props sólo pueden describir *comportamiento* (p. ej. `Sidebar.onNavigate` para cerrar el drawer móvil); nunca duplicar la fuente de un dato. Aplicar esa distinción fue lo que permitió cerrar la Fase 2 en `Sidebar` sin añadir contexto.
8. **Antes de tocar el contexto o el dashboard**: ejecuta `npm run verify`. El contexto (`DashboardContextType`) declara ~180 miembros y `InventoryDashboard.tsx` tiene ~34 `useState`; el plan de reforma está en `ROADMAP.md` y debe seguirse por fases.

---

## 7. Estado Operativo y Continuidad

Esta sección es memoria para el próximo agente. El **plan vigente es `ROADMAP.md`**
(fases 0–6) y manda sobre `PLAN_CONTINUIDAD.md`, que describe una auditoría Ponytail
anterior ya absorbida. Antes de escribir código, leer `ROADMAP.md`; la escalera de
Ponytail (§5) sigue siendo obligatoria.

> **Retomar el trabajo**: la sección **«Punto de arranque»** al final de `ROADMAP.md` tiene
> el estado exacto (rama, último commit, gate), lo hecho y el siguiente corte medido.
> Es lo primero que hay que leer. Esta sección §7 queda para comandos y trampas.

### Dirección de producto: cañería vs. producto (contexto para decidir)

La app **no** busca emular AppSheet ni venderse como plataforma no-code. Su identidad es una
**herramienta especializada de control de vencimientos y conteo cíclico de inventario** para
retail y farmacia, alimentada desde Google Sheets.

Al medir el árbol, la proporción real es ~5.900 líneas de capa genérica (esquema, slices,
referencias, alias, identidad, bulk actions, importador) frente a ~9.300 de dominio propio
(vencimientos, conteo, campañas, cuadratura, CU_VC, farmacia). Regla práctica al dudar si algo
pertenece a la app:

> ¿Esto ayuda a **tragar datos sucios** (planillas de ERP, encabezados inconsistentes), o me
> acerca a **un AppSheet peor**? Lo primero es cañería necesaria; lo segundo es lastre.

Un objetivo concreto que sí es propio: **poder apuntar la app a otras hojas con datos
distintos sin construir otra app a medida** → **Fase 7** de `ROADMAP.md`. Se apoya en el
patrón de *activación por capacidades* que ya usan las bulk actions (¿hay columnas de
teléfono? → WhatsApp), no en un lenguaje de fórmulas ni relaciones N-a-N.

### Método al dividir monolitos (aprendido en la Fase 5)

Al extraer un bloque de render a un componente, **medir antes cuántas identidades del padre
necesita**. En `StockCountTerminal.tsx` los bloques móvil y escritorio pedían 43 y 65; un
componente con esa superficie de props es peor que el JSX inline, porque traslada el
acoplamiento a una interfaz en vez de reducirlo. Se descartó por el escalón 7. La costura
rentable suele estar en la **lógica pura** (entra estado, salen filas), no en la presentación.

Plantilla del patrón que funcionó: `src/utils/countAggregation.ts` — funciones puras, un
`export interface` por forma de salida, sus pruebas en una sección propia de
`test-modules.ts`. Y **verificar cada prueba nueva por mutación**: en el corte 2, una prueba
pasaba en vacío porque el fixture no distinguía los dos criterios de agrupación posibles.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run verify` | `tsc --noEmit && eslint src tests && npm test`. Gate estático + unitario. |
| `npm run verify:all` | `verify` + `build` + `test:e2e`. Gate completo antes de dar algo por cerrado. |
| `npm run test:e2e` | Arranca el build de producción y corre los 24 arneses de integridad (`tests/perf/run.cjs`). |
| `npm test` | `tsx test-modules.ts && tsx tests/components.test.tsx && tsx tests/xlsx.test.ts`. |
| `npm run dev` | Vite. En este entorno el puerto 3000 suele estar ocupado: usar `--port 3001`. |
| `npm run build` | Build de producción. |

### Hoja de cálculo: procedencia de `xlsx` y fixtures

- `xlsx` se instala desde el **artifact oficial** de SheetJS vendorizado en el repo:
  `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`. npm solo tiene 0.18.5, vulnerable a Prototype
  Pollution y ReDoS, y **no** recibirá el fix. No lo cambies por `xlsx@latest` ni por un
  alias npm: el tarball del CDN es la única fuente parcheada.
- Para actualizar la librería: descarga el `.tgz` del CDN oficial, **verifica el hash**,
  reemplaza `vendor/xlsx-*.tgz`, actualiza el `file:` en `package.json` y corre
  `npm install && npm run verify`. No edites el tarball.
- `tests/fixtures/*.xlsx` se generan con **openpyxl** (`tests/fixtures/generate.py`), no
  con la propia librería, para que las pruebas no sean un eco del lector. Están
  versionados; CI no ejecuta el generador.
- Al leer `.xlsx` usa `raw: true` y normaliza celdas con un helper de fecha: `raw: false`
  devuelve el texto *formateado* y corrompe identificadores numéricos grandes
  (`"1.23457E+12"` en vez del EAN real).
- `parseSpreadsheetFile(file)` es el punto de entrada único para archivos subidos
  (binario o texto). No reimplementes parseo en las vistas.
- `importPharmacySnapshotToCampaign` acepta registros **y** matrices 2D; normaliza en su
  único punto de entrada. Si añades llamadores, no asumas la forma.

### Arneses de medición (`tests/perf/`, requieren Chromium y un build servido)

Son pruebas de comportamiento, no solo de milisegundos. **Puerta unificada**:
`npm run test:e2e` arranca el preview y corre los 24 arneses que cubren integridad de
datos y navegación; devuelve código distinto de cero si alguno falla. El binario de Chrome
se toma de `CHROME_BIN` o de las rutas habituales (`/usr/bin/chromium`, `google-chrome`,
etc.).

Para correr uno solo: `node tests/perf/<script>.cjs http://127.0.0.1:4173/`.
Un arnés anunciado en `NEED_FAKE_BACKEND` (`run.cjs`) recibe además el puerto del backend
falso que levanta el propio runner.

| Script | En la puerta | Para qué sirve |
|---|---|---|
| `corruptcheck.cjs` | sí | LocalStorage corrupto no rompe el arranque (10 casos). |
| `startupcorruption.cjs` | sí | Igual, sembrando varias claves a la vez. |
| `offlinecheck.cjs` | sí | Replay de la cola offline: un fallo de red no pierde la mutación y el reintento la drena. |
| `mutcheck.cjs` | sí | Crear, editar y eliminar registros (rutas de pérdida de datos). |
| `importcheck.cjs` | sí | Importación universal de punta a punta. |
| `groupcheck.cjs` | sí | Agrupación por columna de punta a punta (solicitud original b). |
| `searchcheck.cjs` | sí | El buscador filtra y se sincroniza con el contexto. |
| `bulkcheck.cjs` | sí | Edición y eliminación masivas (rutas de pérdida de datos). |
| `sidebarcheck.cjs` | sí | El sidebar resuelve datos del contexto y props solo de comportamiento (colapso y drawer móvil). |
| `scannercheck.cjs` | sí | Ciclo de vida del lector de cámara con dispositivo falso: arranque real, cierre sin fugas y reapertura. |
| `countcheck.cjs` | sí | El debounce de 300 ms no pierde la última lectura al descargar la página. |
| `blindcheck.cjs` | sí | En BLIND no se filtra el stock del ERP a la pantalla (par discriminante con DOCUMENT). |
| `campaigncheck.cjs` | sí | Matriz de consolidación de campaña: clasificación de los 4 estados, filtros, búsqueda acumulada y ajuste de venta persistido (12 verificaciones). |
| `printcheck.cjs` | sí | Vista de impresión: el ticket solo monta con un registro pendiente (5 aserciones). |
| `titlecheck.cjs` | sí | Título del ticket por columnas (Fase 7 Hallazgo 1): una hoja no canónica de catálogo imprime «CATÁLOGO DE PRODUCTOS», no su nombre de pestaña. Discriminante (verificado por mutación). Requiere el backend falso. |
| `detailcheck.cjs` | sí | Master-detail del panel lateral: la tabla sigue viva con el panel abierto y el detalle se actualiza sin cerrarse. |
| `democheck.cjs` | sí | Bug latente de `headers`/`activeSheet` obsoletos en modo demo: guardia directa de la causa raíz en `useInventoryData`. |
| `demoentrycheck.cjs` | sí | Puerta de demostración del onboarding: sin sembrar `SCRIPT_URL`, el arranque limpio muestra el onboarding, el botón «Explorar con datos de demostración» entra al dashboard con datos, la elección sobrevive a la recarga y sigue existiendo la salida a configurar la URL (7 verificaciones, discriminante por mutación). |
| `domaincheck.cjs` | sí | Partición de dominio (`VENC. CERC.` es evento FRC, no vencimiento): siembra una hoja mixta (vencimientos puros + códigos FRC) y exige que el radar no aloje ninguno de esos códigos, que su píldora «Todas» coincida con sus filas visibles, y que `VENC. CERC.` reaparezca en FRC con su propia píldora coherente (discriminante por mutación del gate). |
| `genericcheck.cjs` | sí | Modo genérico (Fase 7 paso 3): una hoja sin dominio carga sus filas, no arrastra slices ni el terminal de conteo, y conserva las bulk actions por capacidad. Requiere el backend falso. |
| `bodegacheck.cjs` | sí | Gateo de UI de dominio por capacidad (Fase 7 paso 3b): una hoja no canónica con columnas de vencimiento recibe el módulo; una sin dominio no. Requiere el backend falso. |
| `capabilitycheck.cjs` | sí | Corrección manual de capacidades (Fase 7 paso 4): tri-estado `auto`/`enabled`/`disabled` persistido y reversible. Requiere el backend falso. |
| `genericpersonalitycheck.cjs` | sí | El núcleo decide por columnas, no por pestaña (Fase 7 paso 5): chips de filtro rápido por capacidad. Requiere el backend falso. |
| `catalogpersonalitycheck.cjs` | sí | Personalidad de catálogo por columnas (Fase 7 paso 6): una hoja de productos no canónica recibe sus chips; la canónica conserva el suyo; una sin dominio no inventa ninguno. Requiere el backend falso. |
| `modals.cjs` | no | Abrir modales: commits, long tasks y encabezado visible. |
| `profile.cjs` | no | Renders reales de tabla/fila (tecleo). |

`tests/perf/fake-backend.cjs` no es un arnés: es el backend de Apps Script en falso que
levanta el runner para medir hojas no canónicas (el modo demostración solo sirve las 4 fijas).
`tests/perf/ctxdiff.cjs` **se retiró** (dependía de instrumentación ya eliminada).

### Robustez de arranque: la puerta de persistencia

Todo dato **estructurado** (objetos, listas, mapas) en `localStorage` debe pasar por
`readStorage`/`readStorageValidated` (`src/utils/appStorage.ts`), y su escritura por
`writeStorage`. El motivo está medido: un valor con forma equivocada pasaba el `JSON.parse`
y reventaba lejos de la causa, dejando la app sin montar. Los esquemas
(`cachedSheetSchema`, `objectArraySchema`, `sheetConfigShapeSchema`, `moduleStatesSchema`,
…) validan **contenedor y forma de cada elemento**, no cada campo: esos DTO evolucionan
entre versiones y algunos los escribe la nube.

Las cadenas planas (credenciales como `SCRIPT_URL`/`SECURITY_TOKEN`, banderas como
`DARK_MODE`) y los accesos de la **cola offline** —que la invariante pide no tocar— siguen
usando `localStorage` directo; para esos no aplica el parseo con esquema.

Al añadir una clave nueva: definir el esquema en `appStorage.ts`, no parsear a mano.

### Invariante no negociable

La **cola offline** (`OFFLINE_QUEUE`) y su respaldo en `localStorage` no se tocan sin
necesidad. Hay un caso real resuelto: el botón "Restablecer Datos Locales" del
`ErrorBoundary` hacía `localStorage.clear()` y borraba la cola; ahora preserva
`OFFLINE_QUEUE` y `AUDIT_LOG`.

### CI

`.github/workflows/verify.yml` corre `npm ci && npm run verify && npm run build` (job
`verify`) y `npm ci && npm run build && npm run test:e2e` (job `e2e`) en push a `main` y en
PR. Node 22. Sin secrets. El job `e2e` usa el Google Chrome preinstalado del runner.

### Pendiente al momento de escribir esto

1. **Solicitudes originales del usuario**:
   - (a) **Duplicación de acciones en dev/push a GitHub**: **CERRADA**. La queja
     original ("duplicas tus acciones tanto en dev como en los push") era sobre las
     acciones del *agente*, no un defecto de la app. Evidencia y causa raíz:
     - **Push a dos refs**: se empujaba el mismo commit a `main` *y* a la rama
       `ponytail-audit-strict-types` → dos deployments en Vercel (producción +
       preview) por un solo cambio. La rama quedó como residuo tras el PR #1, que ya
       se había fusionado.
     - **Rama remota stale**: `ponytail-audit-strict-types` (`b664b6e`) era
       **ancestro directo de `main`**; `git merge-base --is-ancestor` lo confirma y
       `main` iba 19 commits por delante. Cero trabajo en riesgo. **Eliminada** vía
       API (204). El remoto hoy solo tiene `main`. Esa rama fantasma era la fuente de
       la confusión "¿qué queda por mergear?".
     - **StrictMode**: en dev React invoca dos veces render/efectos/updaters a
       propósito. Los efectos de arranque (`useOfflineSync`) son lecturas idempotentes
       con limpieza correcta, así que el doble disparo no duplica acciones reales. No
       se toca: es comportamiento esperado.
     - **TicketPrintView**: ya no puede imprimirse por duplicado. El `TicketPrintView`
       del dashboard devuelve `null` sin ítems y el del terminal se portaliza con
       `domId` propio (`STOCKCOUNT_TICKET_DOM_ID`), no con `#thermal-ticket-root`.
     - **CI**: un único workflow registrado (`verify.yml`), un run por commit.
       Verificado por API: 4/4 commits con exactamente 1 run. Sin duplicación de CI.
     - **Regla para no repetirlo**: `git push origin main` y **nada más**. No empujar
       el mismo commit a una segunda rama; no dejar ramas de PR tras el merge.
   - (b) **Agrupación de filas por columna en "Vistas y Ajustes"**: **CERRADA**. El
     cableado funcionaba y ahora hay verificación de punta a punta en navegador con
     `tests/perf/groupcheck.cjs` (10 pasos: el selector existe, arranca en `none`,
     la columna es elegible, elegirla produce "Agrupado en N grupos (PROVEEDOR)", se
     renderiza la cabecera con el valor real, el botón de orden existe, alternarlo
     reordena los grupos, y volver a `none` desactiva). La sonda **no es vacía**: con
     el no-op reintroducido en `ViewConfigControlDrawer.tsx:153` fallan 4 pasos.
     El patrón doble-camino ya no existe (ver punto 2), así que el objetivo no queda oculto.
2. **Fase 2** — CERRADA (11/11). Los 11 archivos del patrón `props.X ?? dashboard.X` leen
   solo del contexto; el `overrides` de `eslint.config.mjs` se eliminó y la regla aplica a
   todo `src`. En `Sidebar` la clave fue separar **datos** (contexto) de **comportamiento**
   (`forceExpanded`, `onNavigate`). Sonda E2E nueva: `sidebarcheck.cjs`.
3. **Fase 3** — extracción de hooks. **`useInventoryData`, `useTableGrouping`,
   `useInventoryIngestion` y `useInventoryBulkActions` HECHOS** (ver `ROADMAP.md`;
   `InventoryDashboard.tsx` 2.081 → 1.377 líneas, −34%). El bloque de acciones masivas se
   cerró como sub-bloque cohesionado con 13 parámetros —no los ~23 del bloque entero— porque
   `confirm` y los *toasts* se resuelven desde sus contextos en vez de pasarse como props.
   Quedan `useDashboardViewState`, `useInventoryActions` y `useDashboardModals`. Al abordar
   `useInventoryActions`, la interfaz del hook sería de ~23 parámetros (medido), señal de que
   traslada el problema de archivo en vez de reducir acoplamiento; por la escalera de Ponytail
   conviene seguir cortando por sub-bloques cohesionados y no en bloque (los cortes ya hechos
   iban de 9, 13 y 15 parámetros). Los arneses `mutcheck.cjs`, `importcheck.cjs` y
   `bulkcheck.cjs` dan red de seguridad a esas rutas.
4. **Fase 4 — CERRADA (2026-09-19)**: sus tres pendientes (caché por pestaña, `JSON.parse`
   de `lib/sheets.ts`, y los 2 accesos directos a `localStorage`) ya tenían guarda aguas
   arriba o `try/catch` en el mismo sitio. Al auditarla se encontró y cerró un hueco de más
   peso: los arneses E2E eran utilidades manuales y **ninguno corría en CI**, así que toda la
   evidencia de "no perder datos" solo se ejecutaba si alguien se acordaba. Hoy corren como
   job `e2e`.
5. **Fases 5 y 6** — dividir monolitos y rendimiento/empaquetado. Fase 5 lleva 2 cortes
   (`campaignUtils.ts`, `countAggregation.ts`); Fase 6 sacó `html5-qrcode` del chunk de
   arranque (457 → 355 KB gzip). **No añadir `manualChunks` sin medir antes.**
   Método y siguiente corte en «Punto de arranque» de `ROADMAP.md`.
6. **Deuda `any` de `src`: CERRADA (2026-09-19)**. Queda **1** `any` declarado, la firma
   de índice de `SheetRecord` (`types.ts`), deliberada por la heterogeneidad de columnas
   (invariante §6.5); su cierre a unión produjo ~15 errores en cascada y se revirtió. No
   reabrir sin un síntoma real. Detalle y barrido por archivo en `ROADMAP.md`.
