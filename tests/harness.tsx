/**
 * Arnés de pruebas de componente para la Fase 0 del plan de arquitectura.
 *
 * Vive aparte de test-modules.ts a propósito: aquel corre en Node "puro" y varias
 * utilidades ramifican sobre `typeof window` / `typeof document`. Cargar jsdom de
 * forma global cambiaría esas ramas y volvería menos fiable su verificación.
 * Aquí el DOM se instala solo dentro de las pruebas que lo necesitan, y de forma
 * idempotente: si una prueba previa ya lo instaló, se reutiliza el mismo objeto.
 */
import { JSDOM } from 'jsdom';
import React from 'react';
import type { DashboardContextType } from '../src/context/DashboardContext';

let dom: JSDOM | null = null;

/** Instala jsdom y publica sus globals de forma idempotente. Devuelve el DOM activo. */
export function setupDom(): JSDOM {
  if (dom) return dom;

  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const g = globalThis as any;
  const expose = (key: string, value: unknown) => {
    // Algunos globals de Node (p. ej. `navigator`) son getters de solo lectura:
    // la asignación directa falla, así que se redefinen como propiedad configurable.
    Object.defineProperty(g, key, { value, writable: true, configurable: true });
  };

  expose('window', dom.window);
  expose('document', dom.window.document);
  expose('navigator', dom.window.navigator);
  expose('HTMLElement', dom.window.HTMLElement);
  expose('HTMLInputElement', dom.window.HTMLInputElement);
  expose('HTMLSelectElement', dom.window.HTMLSelectElement);
  expose('Element', dom.window.Element);
  expose('Node', dom.window.Node);
  expose('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
  expose('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
  expose('cancelAnimationFrame', (id: number) => clearTimeout(id));
  expose('IS_REACT_ACT_ENVIRONMENT', true);

  return dom;
}

/** Vuelve a Node puro. Necesario antes de delegar en test-modules.ts. */
export function teardownDom(): void {
  if (!dom) return;
  const g = globalThis as any;
  for (const key of [
    'window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement',
    'HTMLSelectElement', 'Element', 'Node', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT',
  ]) {
    delete g[key];
  }
  dom = null;
}

export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Monta un componente dentro de un contenedor y devuelve helpers de consulta.
 * Se evita @testing-library para no arrastrar su ciclo de limpieza global: el
 * proyecto ya tiene su propio arnés y aquí solo se necesita montar y consultar.
 */
export async function mount(element: React.ReactElement) {
  setupDom();
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return {
    container,
    /** Re-renderiza dentro de act() (React 19 no aplica actualizaciones fuera de act). */
    async update(next: React.ReactElement) {
      await act(async () => { root.render(next); });
    },
    /** Ejecuta un callback dentro de act() y deja correr los efectos. */
    async run(fn: () => void | Promise<void>) {
      await act(async () => { await fn(); });
    },
    text: () => container.textContent || '',
    /** Valor actual del único <select> montado (el caso del bug de agrupación). */
    selectValue: () => (container.querySelector('select') as HTMLSelectElement | null)?.value,
    /** Dispara un cambio de valor en el <select>, como haría el usuario. */
    async chooseSelect(value: string) {
      const select = container.querySelector('select') as HTMLSelectElement | null;
      if (!select) throw new Error('No se encontró ningún <select> montado');
      await act(async () => {
        select.value = value;
        select.dispatchEvent(new dom!.window.Event('change', { bubbles: true }));
      });
    },
    async unmount() {
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

/**
 * Construye un valor de DashboardContextType con lo que cada prueba necesita.
 * Los miembros no declarados quedan en `undefined`, igual que un contexto real
 * parcial: así el componente ejerce sus propios defaults (`?? []`, `?.`) en vez
 * de recibir valores falsos que ocultarían esas ramas.
 */
export function makeContext(overrides: Partial<DashboardContextType> = {}): DashboardContextType {
  return { ...overrides } as DashboardContextType;
}