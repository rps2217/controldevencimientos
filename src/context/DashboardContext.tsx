import React, { createContext, useContext, useMemo } from 'react';
import { DashboardDataProvider, DashboardDataContextType } from './DashboardDataProvider';
import { DashboardFilterProvider, DashboardFilterContextType } from './DashboardFilterProvider';
import { DashboardUIProvider, DashboardUIContextType } from './DashboardUIProvider';
import { DashboardContextType } from '../types'; // I need to move the type definition or keep it here. Let's keep it here for now.

// Redefining the unified type here as a projection of the individual context types
export type UnifiedDashboardContextType = DashboardDataContextType & DashboardFilterContextType & DashboardUIContextType & {
  // Add other shared context types not covered by specific providers if necessary (e.g. methods)
  [key: string]: any; 
};

// Internal unified context for components that need everything
const DashboardContext = createContext<UnifiedDashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode, value: UnifiedDashboardContextType }> = ({ children, value }) => {
  const dataValue = useMemo(() => value as DashboardDataContextType, [value]);
  const filterValue = useMemo(() => value as DashboardFilterContextType, [value]);
  const uiValue = useMemo(() => value as DashboardUIContextType, [value]);

  return (
    <DashboardDataProvider value={dataValue}>
      <DashboardFilterProvider value={filterValue}>
        <DashboardUIProvider value={uiValue}>
          <DashboardContext.Provider value={value}>
            {children}
          </DashboardContext.Provider>
        </DashboardUIProvider>
      </DashboardFilterProvider>
    </DashboardDataProvider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) throw new Error('useDashboard must be used within a DashboardProvider');
  return context;
};
