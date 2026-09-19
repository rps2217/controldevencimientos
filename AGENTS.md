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
    │   ├── useInventoryWorker.ts # Hook de comunicación no bloqueante con el Web Worker
    │   ├── useInventoryFiltering.ts # Orquestación de filtros, paginación y agrupación
    │   ├── useModuleViewState.ts # Persistencia y transiciones de estado por módulo/pestaña
    │   ├── useOfflineSync.ts     # Hook de sincronización y vaciado de cola offline
    │   └── useColumnResize.ts    # Manejo interactivo del ancho de columnas
    ├── utils/
    │   ├── columnAliases.ts      # Motor de detección semántica de encabezados de columnas
    │   ├── pureCalculations.ts   # Cálculos puros y parsing de fechas y métricas (Zero-DOM/Web Worker compatible)
    │   ├── universalImporter.ts  # Parser universal de Excel/CSV/TSV y motor de auto-mapeo semántico
    │   └── dateCalculations.tsx  # Badges de UI, iconos y renderizado de estados
    └── components/
        ├── InventoryDashboard.tsx# Vista principal de control y filtrado de inventario
        ├── views/
        │   └── SchemaEditorView.tsx# Vista de configuración y mapeo de esquema de columnas
        ├── modals/
        │   ├── GlobalConfigModal.tsx # Configuración global y credenciales
        │   ├── UniversalImportModal.tsx # Ingestión universal asistida (Excel, CSV, TSV, Portapapeles)
        │   ├── ItemFormModal.tsx     # Modal para crear/editar registros e ítems
        │   ├── PmReportModal.tsx     # Generador de reportes de drenaje y alertas
        │   └── ScriptCodeModal.tsx   # Visor y generador de código Google Apps Script
        └── drawers/
            └── ItemDetailDrawer.tsx  # Panel lateral detallado para un SKU/producto específico
```

---

## 3. Arquitectura y Lógica de Módulos Clave

### A. Tipos Globales (`src/types.ts`)
Define las estructuras de datos fundamentales para los ítems de inventario, eventos, políticas, estados de alerta y configuraciones de sincronización.

### B. Motor de Detección Semántica (`src/utils/columnAliases.ts`)
Resuelve el problema común de las hojas de cálculo con encabezados inconsistentes (ej. "F. Vto", "Fecha Vencimiento", "Vencimiento", "fecha_vc").
- **`KnownFieldSemantic`**: Tipos semánticos estandarizados (`sku`, `descripcion`, `fecha_vc`, `fecha_retiro`, `cantidad`, `lote`, `politica`, `tipo_evento`, `precio`, `observacion`, `proveedor`, etc.).
- **`FIELD_PATTERNS`**: Diccionario de expresiones regulares por campo semántico que cubre variaciones ortográficas, acentos y abreviaciones.
- **`findColumnBySemantic(headers, semantic)`**: Busca en un arreglo de encabezados de columnas el que coincida semánticamente, permitiendo mapeo automático robusto.

### C. Cálculos y Utilidades de Fechas / Números (`src/utils/dateCalculations.tsx`)
- **`parseAnyDate(dateVal)`**: Soporta:
  1. Números de serie de Excel (ej. `45321`).
  2. Formatos ISO (`YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY.MM.DD`).
  3. Formatos Latinos (`DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`).
  4. Formatos compactos (`YYYYMMDD`).
  5. Formatos Mes/Año (`MM/YYYY` - calcula último día del mes).
  6. Objetos `Date` nativos o cadenas de texto estándar.
- **`parseLocaleNumber` / `formatLocaleNumber`**: Conversión y formateo robusto de valores numéricos monetarios o de stock que contengan comas y puntos decimales europeos/americanos.
- **`getItemStatus(item, headers)`**: Calcula de manera inteligente el estado operativo de un ítem (ej. Vencido, Crítico por vencer, Próximo a retiro, En buen estado) comparando con la fecha actual.
- **`getEventCategory(item, headers)`**: Clasifica automáticamente eventos e incidencias en categorías (`TRANSPORTE`, `DIFERENCIAS`, `MERMAS`, `CALIDAD`, etc.).

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
  - `dereferenceMasterProduct`: Propagación atómica automática de campos maestros (Descripción, Proveedor, Costo/Precio, Categoría y Política) hacia las columnas correspondientes en la hoja activa al seleccionar o ingresar un SKU.
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
- **Slices Nativos Preconfigurados (`BUILT_IN_SLICES`)**:
  - Para `main` (Radar de Vencimientos): *Vencidos & Críticos*, *Próximos a Retiro*, *Lotes con Alto Stock*, *Pendientes de Liquidación/PM*.
  - Para `events` (FRC / Incidencias): *Averías & Deterioro Transporte*, *Diferencias Pendientes Traspaso*, *Pendientes de Resolución*, *Incidencias de Calidad*.
  - Para `products`: *Productos con Política Asignada*, *Sin Política Comercial*.
  - Para `policies`: *Políticas con Mayor Anticipación (>60d)*.
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
- **Espejo de Backend / Multi-Database (`src/services/backendMirrorService.ts` & `BackendMirrorPanel.tsx`)**:
  - Resuelve las limitaciones de latencia (~2.500ms en Google Apps Script) y la falta de bloqueos de concurrencia a nivel de fila durante conteos masivos en farmacia.
  - Soporte para proveedores secundarios: Custom REST API, Supabase (PostgreSQL), PostgreSQL directo o Firebase / Firestore.
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
  - Reconocimiento nativo de las columnas oficiales del ERP: `Local`, `Código SKU`, `Descripción`, `Proveedor`, `Stock`, `Inv. Inicial`, `Egreso`, `Ingreso`, `Venta`, `Stock Min`, `Stock Max`, `Stock Crítico`, `Precio de Lista`.
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
3. **Cero Dependencias Innecesarias**: No instales paquetes nuevos si la funcionalidad se puede lograr con la biblioteca estándar de TypeScript o las dependencias existentes (`lucide-react`, `recharts`, `motion`, `@tanstack/react-virtual`).
4. **Líneas Mínimas y Concisas**: Prefiere código conciso, legible y directo sobre patrones complejos con múltiples capas de wrappers o interfaces redundantes.
5. **Sin Costos Monetarios (Estricto)**: Esta aplicación está diseñada estrictamente para la gestión operativa y logística de fechas de vencimiento y de incidencias. No se manejan costos monetarios ni precios de ningún tipo. No se deben crear o reintroducir campos, tarjetas o métricas financieras en ninguna parte de la UI (vistas, modales, drawers o tablas).

### Invariantes de Seguridad y Calidad (Guardrails No Negociables):
- **Prevención de Pérdida de Datos**: Conservar siempre el soporte offline y las colas de sincronización para Google Sheets.
- **Validación de Datos**: Mantener sanitización, manejo de errores `try/catch` con `AbortController` y parsing seguro de formatos heterogéneos de fechas y números.
- **Accesibilidad y Rendimiento**: Respetar contraste visual WCAG AA, virtualización de listas grandes (`@tanstack/react-virtual`) y tipado estricto en TypeScript sin `any` injustificados.

---

## 6. Guías para el Próximo Agente / Desarrollador

1. **Mantener la Modularidad**: No introduzcas lógica pesada ni componentes monolíticos en `App.tsx`. Extiende o crea submódulos en `src/components/` o `src/utils/`.
2. **Iconos**: Utiliza exclusivamente iconos provenientes de `lucide-react`.
3. **Estilos**: Emplea únicamente clases utilitarias de Tailwind CSS (configurado con `@import "tailwindcss";` en `src/index.css`). No crees archivos CSS adicionales.
4. **Tipado Estricto**: Asegúrate de que todo código nuevo mantenga compatibilidad estricta con TypeScript (`npm run lint` pasa sin errores de `tsc --noEmit`).
5. **Robustez en Hojas de Cálculo**: Siempre que proceses datos tabulares externos, utiliza el motor de `columnAliases.ts` en lugar de buscar nombres de columnas fijos (`item['SKU']`), garantizando tolerancia a variaciones en los archivos del usuario.
6. **Aplicar la Escalera de Ponytail**: Antes de escribir una sola línea de código, pregúntate si puedes reutilizar lo que ya existe o resolverlo con la menor cantidad de código posible.
