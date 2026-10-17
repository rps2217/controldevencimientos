import React, { createContext, useContext, useMemo, useState } from 'react';
import { InventoryItem, SheetConfig, SheetRecord, SpreadsheetMetadata, SheetProperties } from '../types';

export interface DashboardDataContextType {
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
  metadata: SpreadsheetMetadata | null;
  activeSheet: SheetProperties | null;
  setActiveSheet: React.Dispatch<React.SetStateAction<SheetProperties | null>>;
  allMainItems: InventoryItem[];
  items: InventoryItem[];
  setAllMainItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  products: SheetRecord[];
  setProducts: React.Dispatch<React.SetStateAction<SheetRecord[]>>;
  policies: SheetRecord[];
  setPolicies: React.Dispatch<React.SetStateAction<SheetRecord[]>>;
}

const DashboardDataContext = createContext<DashboardDataContextType | undefined>(undefined);

export const DashboardDataProvider: React.FC<{ children: React.ReactNode, value: DashboardDataContextType }> = ({ children, value }) => (
  <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>
);

export const useDashboardData = () => {
  const context = useContext(DashboardDataContext);
  if (!context) throw new Error('useDashboardData must be used within a DashboardDataProvider');
  return context;
};
