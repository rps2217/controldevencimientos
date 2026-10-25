# Plan de Simplificación y Ergonomía Cognitiva Estilo AppSheet

## 1. Problema Identificado
- **Sobrecarga Cognitiva y Ruido Visual**: Múltiples modales y vistas contenían carruseles con colores estridentes (arcoíris de badges, contornos saturados, botones múltiples sin jerarquía visual), generando fatiga en el operador.
- **Ventana de Registros Relacionados Desconectada**: Al hacer clic en registros relacionados desde el acordeón/ficha, se abría un modal pegado al borde superior de la tabla en vez de una navegación integrada y natural.
- **Convivencia no deseada de fichas**: Al seleccionar la ficha inline o drawer, se requería garantizar exclusividad mutua absoluta (o una o la otra).
- **Error en orden de Hooks de React**: Llamadas condicionales a hooks dentro de `ItemDetailDrawer` provocaban error al cambiar de vista.

## 2. Soluciones Implementadas

### A. Vista Completa Integrada de Registros Relacionados (AppSheet Drill-down)
- **Navegación In-Place 100%**: Al pulsar "Expandir Vista Relacionada", el contenido toma el 100% del espacio del modal/drawer/acordeón activo (`expandedRelatedContext`), mostrando la tabla completa con paginación, filtros e información de contexto.
- **Barra de Navegación Ergonométrica**: Botón prominente "Volver a Ficha" con icono de retorno y contador exacto de registros (`X registros vinculados`).
- **Soporte Universal**: Funciona idénticamente en ficha Inline (acordeón en tabla), Drawer Lateral Derecho, Dock Inferior y Ventana Flotante (PiP).

### B. Exclusividad Mutua Estricta de Ubicaciones
- Si el usuario selecciona la ficha inline (`detailDrawerPosition === 'inline'`), el drawer flotante/lateral se desmonta automáticamente.
- Si se activa cualquier drawer (`right`, `bottom`, `floating`), el modo inline se apaga de inmediato, impidiendo estados duplicados.

### C. Rediseño Minimalista y Calmado Estilo AppSheet
1. **Radar / Reporte PM (`PmReportModal.tsx`)**:
   - Reemplazo del carrusel estridente de 6 tarjetas de colores por un selector limpio unificado con descripción contextual.
   - Indicadores numéricos inline sobrios (slate-600/slate-300).
   - Pie de acción unificado: grupo de exportación a la izquierda y botón principal azul `Copiar Reporte` a la derecha.
2. **Configuración Global (`GlobalConfigModal.tsx`)**:
   - Tarjetas de asignación de hojas uniformes en gris neutro (`slate-50`/`slate-800`).
   - Botón secundario "Cerrar" y primario "Aplicar y Recargar".
3. **Formulario de Ítem (`ItemFormModal.tsx`)**:
   - Divulgación progresiva: campos esenciales visibles directamente; campos secundarios y técnicos agrupados en panel colapsable limpio.
4. **Corrección de Reglas de Hooks de React**:
   - Eliminados retornos tempranos que precedían a `useMemo` en `ItemDetailDrawer.tsx`. Todos los hooks se ejecutan incondicionalmente en cada render.
