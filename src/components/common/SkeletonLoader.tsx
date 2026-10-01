import React from 'react';

export const SkeletonLoader: React.FC<{ type: 'table-row' | 'card' | 'text'; count?: number }> = ({ type, count = 1 }) => {
  if (type === 'table-row') {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} className="animate-pulse border-b border-slate-100 dark:border-slate-800">
            <td className="p-4"><div className="h-4 w-4 bg-slate-200 dark:bg-slate-700 rounded" /></td>
            <td className="p-4"><div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" /></td>
            <td className="p-4"><div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" /></td>
            <td className="p-4"><div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" /></td>
          </tr>
        ))}
      </>
    );
  }
  return <div className="animate-pulse bg-slate-200 dark:bg-slate-700 rounded-lg h-4 w-full" />;
};
