import React from 'react';

interface CampaignSkuBadgeData {
  inErp: boolean;
  stockTeorico: number | null;
}

/**
 * Badge de stock teorico del ERP o, si el SKU no esta en el snapshot, de hallazgo
 * fisico. Se comparte entre la vista movil y la de escritorio del terminal, que
 * tenian el mismo markup duplicado. `compact` es la variante de escritorio.
 */
export function CampaignSkuErpBadge({ stats, compact = false }: { stats: CampaignSkuBadgeData | null; compact?: boolean }) {
  const base = compact ? 'px-1.5 py-0.5 rounded' : 'px-2 py-0.5 rounded-lg';
  return stats?.inErp ? (
    <span className={`${base} bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 text-[10px] font-black shrink-0`}>
      ERP: {stats.stockTeorico} un
    </span>
  ) : (
    <span className={`${base} bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 text-[10px] font-black shrink-0`}>
      {compact ? 'Hallazgo' : 'Hallazgo Físico'}
    </span>
  );
}
