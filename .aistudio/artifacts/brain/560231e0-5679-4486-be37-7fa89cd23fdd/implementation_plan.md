# UI/UX Improvement Plan - Gestor de Vencimientos e Incidencias

## 1. Executive Summary & Design Vision
This plan outlines a comprehensive UI/UX overhaul for the **Gestor de Vencimientos e Incidencias** application. Grounded in the **Enterprise SaaS dashboard** aesthetic with professional slate and corporate blue accents, this redesign elevates usability, visual hierarchy, touch ergonomics, and data density while strictly adhering to the **Universal Frontend Design Constitution** (zero-pill metadata discipline, zero mechanical pseudo-technical clutter, and WCAG AA accessibility).

---

## 2. User-Selected Preferences (Clarification Phase)
- **Visual Aesthetic Style**: Enterprise SaaS dashboard with clean cards, structured hierarchy, and crisp data density.
- **Focus Areas**: Data tables, virtualized grid rendering, and quick action toolbars.
- **Color Accent**: Professional slate and corporate blue (Tailwind `slate`, `blue-600`, `indigo`).

---

## 3. Key UI/UX Improvement Pillars

### A. Data Grid & Table Ergonomics Overhaul
- **Refined Column Headers & Sticky Toolbar**: Clean, scannable table headers with subtle sorting indicators and responsive column resizing.
- **Zero-Pill Metadata & Clean Typography**: Replace any cluttered status badges or pill enclosures with clean unboxed metadata and typographic separators (`·`).
- **Interactive Quick Filter Bar**: Streamlined toolbar for quick chips, slice navigation, and search input with instant clear affordances.
- **Action Toolbar & Floating Batch Controls**: Contextual floating action bar for bulk operations (WhatsApp, Gmail, Ticket Printing, Bulk Edit, and Deletion) that appears smoothly only when items are selected.

### B. Navigation & Sidebar Polish
- **Sidebar Ergonomics**: Refined collapse/expand transitions, clean unboxed typography for module names, and clear visual indicators for active views.
- **Mobile Touch Drawers**: Enhanced bottom sheet and slide-over drawers for mobile users with minimum touch targets ($\ge 44\text{px}$).

### C. Master-Detail Panel & Modals
- **Master-Detail Drawer (`ItemDetailDrawer`)**: Docked panel on desktop and overlay drawer on mobile with clear section partitioning, reference links to master catalog, and rapid action buttons.
- **Form Modals**: Clean, accessible form layouts with clear validation states, numeric shortcuts (`+1`, `+5`, `+10`), and logical field grouping.

---

## 4. Implementation Steps

1. **Phase 1: Design Tokens & Typography Standardization**
   - Harmonize global color tokens around professional slate (`slate-900`/`slate-50`) and corporate blue (`blue-600`).
   - Audit and enforce clean typography pairings and zero-pill metadata across table cells and summary cards.

2. **Phase 2: Data Table & Toolbar Enhancements (`InventoryTable.tsx`, `DashboardTopNav.tsx`, `FloatingBulkActionBar.tsx`)**
   - Polish table row hover states, alternating density options (Compact, Comfortable, Ultra), and smooth virtualized scrolling.
   - Upgrade the search and filter header bar for maximum clarity and responsiveness.

3. **Phase 3: Drawer & Modal Usability Polish (`ItemDetailDrawer.tsx`, `ItemFormModal.tsx`)**
   - Ensure WCAG AA contrast compliance, keyboard accessibility (`Esc` to close, `Cmd+K` palette), and intuitive touch targets.

4. **Phase 4: Verification & Testing**
   - Compile and lint applet (`compile_applet`, `lint_applet`) to ensure zero regression in performance or types.

---

## 5. Verification Plan
- **Automated Verification**: Run `compile_applet` and `lint_applet` to confirm zero build errors.
- **Visual Verification**: Review responsive layouts across desktop (1440px) and mobile viewports.
