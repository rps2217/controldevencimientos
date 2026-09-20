import React, { createContext, useContext, useMemo, useState } from 'react';

/**
 * Estado de apertura del panel lateral "Vistas & Ajustes".
 *
 * Antes vivía como `useState` dentro de `InventoryDashboard`. Eso tenía un
 * costo medido: el dashboard tiene ~2.200 líneas y 54 `useState`, así que
 * cambiar cualquier flag de UI re-renderiza su cuerpo entero y arrastra por
 * cascada la tabla y sus filas (medido en navegador: 1 commit, ~1700 fibras,
 * 25 filas re-renderizadas al abrir un panel que no muestra datos).
 *
 * Al poseer aquí el estado, abrir o cerrar solo re-renderiza este provider y
 * los pocos componentes que consumen este contexto, no el dashboard completo.
 */
interface RightDrawerContextType {
  isRightDrawerOpen: boolean;
  setIsRightDrawerOpen: (open: boolean) => void;
}

const RightDrawerContext = createContext<RightDrawerContextType | null>(null);

export const RightDrawerProvider: React.FC<{ children: React.ReactNode; initialOpen?: boolean }> = ({ children, initialOpen = false }) => {
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(initialOpen);
  const value = useMemo(() => ({ isRightDrawerOpen, setIsRightDrawerOpen }), [isRightDrawerOpen]);
  return <RightDrawerContext.Provider value={value}>{children}</RightDrawerContext.Provider>;
};

/**
 * Devuelve el estado del panel. Si no hay provider, devuelve un no-op en vez de
 * lanzar: los componentes que lo consumen siguen funcionando de forma aislada
 * en pruebas o en cualquier montaje sin el provider.
 */
export function useRightDrawer(): RightDrawerContextType {
  return useContext(RightDrawerContext) ?? { isRightDrawerOpen: false, setIsRightDrawerOpen: () => {} };
}