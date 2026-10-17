import React, { createContext, useContext, useMemo, useState } from 'react';
import { SliceFilterConfig, SortConfig } from '../types';

export interface DashboardFilterContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  activeSliceId: string | null;
  setActiveSliceId: (id: string | null) => void;
  columnFilters: Record<string, string[]>;
  setColumnFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  sortConfig: SortConfig;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig>>;
  groupByColumn: string | null;
  setGroupByColumn: (col: string | null) => void;
  groupByDirection: 'asc' | 'desc';
  setGroupByDirection: (dir: 'asc' | 'desc') => void;
}

const DashboardFilterContext = createContext<DashboardFilterContextType | undefined>(undefined);

export const DashboardFilterProvider: React.FC<{ children: React.ReactNode, value: DashboardFilterContextType }> = ({ children, value }) => (
  <DashboardFilterContext.Provider value={value}>{children}</DashboardFilterContext.Provider>
);

export const useDashboardFilter = () => {
  const context = useContext(DashboardFilterContext);
  if (!context) throw new Error('useDashboardFilter must be used within a DashboardFilterProvider');
  return context;
};
