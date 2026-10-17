import React, { createContext, useContext } from 'react';

export interface DashboardUIContextType {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  isSaving: boolean;
  loading: boolean;
  isOffline: boolean;
  isSyncing: boolean;
  activeView: string;
  setActiveView: (view: string, searchTermOverride?: string) => void;
}

const DashboardUIContext = createContext<DashboardUIContextType | undefined>(undefined);

export const DashboardUIProvider: React.FC<{ children: React.ReactNode, value: DashboardUIContextType }> = ({ children, value }) => (
  <DashboardUIContext.Provider value={value}>{children}</DashboardUIContext.Provider>
);

export const useDashboardUI = () => {
  const context = useContext(DashboardUIContext);
  if (!context) throw new Error('useDashboardUI must be used within a DashboardUIProvider');
  return context;
};
