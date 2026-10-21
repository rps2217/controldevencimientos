import React from 'react';
import { Loader2 } from 'lucide-react';

export const LazyFallback: React.FC<{ message?: string }> = ({ message }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50/60 dark:bg-slate-900/40 p-6">
    <Loader2 className="w-6 h-6 animate-spin text-slate-400 dark:text-slate-500" />
    {message && <span className="text-xs text-slate-500 dark:text-slate-400">{message}</span>}
  </div>
);
