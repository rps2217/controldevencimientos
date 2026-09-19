import React from 'react';

export const SkeletonLoader: React.FC = () => {
  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F8FAFC] dark:bg-slate-950 p-6 animate-pulse">
      {/* Sidebar Skeleton */}
      <div className="hidden lg:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          <div className="space-y-2 flex-1">
            <div className="w-24 h-4 bg-slate-200 dark:bg-slate-800 rounded"></div>
            <div className="w-16 h-3 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
          </div>
        </div>
        <div className="space-y-2 pt-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="w-full h-10 bg-slate-100 dark:bg-slate-800/60 rounded-xl"></div>
          ))}
        </div>
      </div>

      {/* Main Content Area Skeleton */}
      <div className="flex-1 flex flex-col space-y-6 overflow-hidden pl-0 lg:pl-6">
        {/* Header bar skeleton */}
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
            <div className="w-48 h-5 bg-slate-200 dark:bg-slate-800 rounded"></div>
          </div>
          <div className="flex gap-2">
            <div className="w-24 h-9 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
            <div className="w-32 h-9 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          </div>
        </div>

        {/* KPI Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="w-20 h-3 bg-slate-200 dark:bg-slate-800 rounded"></div>
              <div className="w-16 h-7 bg-slate-300 dark:bg-slate-700 rounded"></div>
              <div className="w-32 h-3 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
            </div>
          ))}
        </div>

        {/* Table Skeleton */}
        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <div className="w-48 h-9 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
            <div className="flex gap-2">
              <div className="w-24 h-9 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
              <div className="w-24 h-9 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
            </div>
          </div>
          <div className="p-4 space-y-3 flex-1">
            <div className="w-full h-10 bg-slate-100 dark:bg-slate-800/80 rounded-lg"></div>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="w-full h-12 bg-slate-50 dark:bg-slate-800/40 rounded-lg flex items-center px-4 gap-4">
                <div className="w-6 h-6 bg-slate-200 dark:bg-slate-700 rounded"></div>
                <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                <div className="flex-1 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                <div className="w-16 h-6 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
