import React from 'react';
import { Loader2 } from 'lucide-react';

export const LazyFallback: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center bg-slate-50/60 dark:bg-slate-900/40">
    <Loader2 className="w-6 h-6 animate-spin text-slate-400 dark:text-slate-500" />
  </div>
);
