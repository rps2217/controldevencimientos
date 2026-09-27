import React from 'react';
import { Package, ChevronRight, AlertTriangle, Check, Play } from 'lucide-react';
import { ProviderProgress } from '../../utils/campaignAggregation';
import { formatLocaleNumber } from '../../utils/pureCalculations';

interface CampaignProviderProgressProps {
  providers: ProviderProgress[];
  selectedProvider: string;
  onSelectProvider: (proveedor: string) => void;
  /**
   * Lanza un conteo NUEVO acotado al proveedor (sus SKUs pendientes). Es distinto de
   * `onStartTargetedRecount`, que abre una 2da vuelta para CORREGIR discrepancias: aquí
   * las lecturas SUMAN a la matriz, no reemplazan. Solo se ofrece si hay algo por contar.
   */
  onStartCount?: (proveedor: string) => void;
}

/**
 * Avance de la auditoría por proveedor.
 *
 * El operario recorre la tienda de un laboratorio a la vez, así que necesita ver
 * cuánto le falta de cada uno sin abrir la tabla. Tocar un proveedor filtra la
 * matriz por él (mismo `selectedProvider` del desplegable, una sola fuente de verdad).
 *
 * Lanzar un conteo por proveedor NO puede usar `onStartTargetedRecount`: ese camino
 * crea sesiones de 2da vuelta (`esSegundaVuelta: true`), que REEMPLAZAN el físico del
 * SKU. Un conteo nuevo por proveedor debe SUMAR, así que va por `onStartCount`.
 */
export const CampaignProviderProgress: React.FC<CampaignProviderProgressProps> = ({
  providers,
  selectedProvider,
  onSelectProvider,
  onStartCount,
}) => {
  if (providers.length === 0) return null;

  const conPendientes = providers.filter(p => p.porContar > 0).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-500" />
          Avance por Proveedor
        </span>
        <span className="text-[11px] font-semibold text-slate-400">
          {providers.length} proveedores
          {conPendientes > 0 && ` · ${conPendientes} con pendientes`}
        </span>
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {providers.map(p => {
          const activo = selectedProvider === p.proveedor;
          const completo = p.porContar === 0;
          return (
            <div
              key={p.proveedor}
              className={`w-full flex items-center gap-2 pr-3 transition-colors ${
                activo ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectProvider(p.proveedor)}
                className="flex-1 min-w-0 text-left pl-4 py-2.5 flex items-center gap-3 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                      {p.proveedor}
                    </span>
                    {completo ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-600 dark:text-amber-400 shrink-0">
                        <AlertTriangle className="w-3 h-3" />
                        {formatLocaleNumber(p.porContar)} por contar
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${completo ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${p.cobertura}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 tabular-nums shrink-0">
                      {p.cobertura}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                    <span>{formatLocaleNumber(p.contados)}/{formatLocaleNumber(p.totalSkus)} SKUs</span>
                    {p.discrepancias > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        {formatLocaleNumber(p.discrepancias)} descuadres
                      </span>
                    )}
                    <span>{formatLocaleNumber(p.totalFisico)}/{formatLocaleNumber(p.totalTeorico)} unids</span>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 ${activo ? 'text-indigo-500' : 'text-slate-300'}`} />
              </button>
              {onStartCount && !completo && (
                <button
                  type="button"
                  title={`Iniciar conteo de ${p.proveedor} (${p.porContar} SKUs por contar)`}
                  onClick={() => onStartCount(p.proveedor)}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" />
                  Contar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
