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
      // silencioso en ViewConfigControlDrawer). Los 11 archivos que lo usaban
      // ya leen solo del contexto; la regla aplica a todo `src` sin excepciones.
      // Los props de comportamiento (p. ej. `Sidebar.onNavigate`) siguen siendo
      // válidos: lo prohibido es duplicar la fuente del dato.
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
    // Harness de perfilado: se ejecuta en Node (WebSocket, process) y además
    // se inyecta en el navegador como script crudo (localStorage, console), así
    // que necesita ambos entornos de globals. Es herramienta de medición, no
    // código de la app: no aplican las reglas de módulos TS.
    files: ['tests/perf/**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    }
  },
);