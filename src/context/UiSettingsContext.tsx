import React, { createContext, useContext } from 'react';
import type { ThemeMode } from '../types';

/**
 * Acciones de configuración global que viven en `App.tsx` (fuera del dashboard) pero
 * se accionan desde la barra superior del dashboard.
 *
 * Existe para no duplicar la barra en dos niveles de componentes: el tema y la URL del
 * backend ya se gobernaban en `App` (el estado y el onboarding viven ahí), así que se
 * exponen hacia abajo en vez de subir el dashboard entero.
 *
 * Igual que `RightDrawerContext`, devuelve un valor neutro cuando no hay proveedor:
 * así los montajes de prueba de la barra no revientan al consultar las acciones.
 */
export interface UiSettingsContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  onEditBackendUrl: () => void;
}

const UiSettingsContext = createContext<UiSettingsContextType | null>(null);

export const UiSettingsProvider: React.FC<{
  value: UiSettingsContextType;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return <UiSettingsContext.Provider value={value}>{children}</UiSettingsContext.Provider>;
};

const NOOP = () => {};

export function useUiSettings(): UiSettingsContextType {
  return useContext(UiSettingsContext) ?? {
    themeMode: 'light',
    setThemeMode: NOOP,
    onEditBackendUrl: NOOP,
  };
}
