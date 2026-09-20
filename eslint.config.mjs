import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test-modules.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      // Los catch vacíos son deliberados (localStorage best-effort, navigator.vibrate).
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none'
      }],
      // Fase 2 del plan de arquitectura: el patrón `props.X ?? dashboard.X` da
      // dos rutas para el mismo dato y ya provocó un bug (fallback a no-op
      // silencioso en ViewConfigControlDrawer). Congelado en los archivos que
      // aún lo usan (ver `overrides` al final); prohibido en el resto. La lista
      // se reduce a medida que cada archivo lee solo del contexto.
      'no-restricted-syntax': ['error', {
        selector: "LogicalExpression[operator='??'][left.object.name='props'][right.object.name='dashboard']",
        message:
          'Patrón doble-camino (props.X ?? dashboard.X) prohibido en código nuevo. ' +
          'Lee exclusivamente del contexto (useDashboard) o de las props, no de ambos. ' +
          'Ver Fase 2 del plan de arquitectura.'
      }]
    }
  },
  {
    // Deuda técnica congelada (Fase 2). Estos archivos todavía usan el patrón
    // doble-camino; la lista solo puede ENCOGER. Al migrar uno, quitar su línea.
    files: [
      'src/components/InventoryTable.tsx',
      'src/components/navigation/DashboardTopNav.tsx',
      'src/components/drawers/ViewConfigControlDrawer.tsx',
      'src/components/views/DashboardFilterPanels.tsx',
      'src/components/dashboard/FloatingBulkActionBar.tsx',
      'src/components/dashboard/DashboardTableContainer.tsx',
      'src/components/navigation/DashboardPageHeader.tsx',
      'src/components/navigation/Sidebar.tsx',
      'src/components/dashboard/DashboardMobileDrawer.tsx',
      'src/components/dashboard/ZenModeOverlay.tsx',
      'src/components/dashboard/DashboardMobileFABs.tsx',
    ],
    rules: {
      'no-restricted-syntax': 'off'
    }
  },
);