import React, { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useInventoryData } from '../../hooks/useInventoryData';

export const RecepBultosTableView: React.FC = () => {
  const { data } = useInventoryData('RECEP_BULTOS');
  
  // Asumimos columnas: TIMESTAMP, CODIGO_BULTO
  const rows = useMemo(() => data?.rows || [], [data]);

  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full w-full overflow-auto bg-white dark:bg-slate-900">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
          <tr>
            <th className="p-3 text-left">Fecha/Hora</th>
            <th className="p-3 text-left">Código Bulto</th>
          </tr>
        </thead>
        <tbody>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <tr 
                key={virtualRow.key}
                style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
                className="absolute w-full border-b border-slate-100 dark:border-slate-800"
              >
                <td className="p-3">{row[0]}</td>
                <td className="p-3 font-mono font-bold">{row[1]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
