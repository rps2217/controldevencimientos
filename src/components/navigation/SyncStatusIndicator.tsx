import React from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

export const SyncStatusIndicator: React.FC = () => {
  const dashboard = useDashboard();
  const isOffline = dashboard.isOffline ?? false;
  const isSyncing = dashboard.isSyncing ?? false;

  return (
    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all ${
      isOffline 
        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' 
        : isSyncing
        ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
    }`}>
      {isOffline ? (
        <>
          <WifiOff className="w-3 h-3" />
          <span className="hidden sm:inline">Offline</span>
        </>
      ) : isSyncing ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="hidden sm:inline">Sincronizando...</span>
        </>
      ) : (
        <>
          <Wifi className="w-3 h-3" />
          <span className="hidden sm:inline">Online</span>
        </>
      )}
    </div>
  );
};
