import React from 'react';
import { Package, ChevronRight, AlertTriangle, Check } from 'lucide-react';
import { ProviderProgress } from '../../utils/campaignAggregation';
import { formatLocaleNumber } from '../../utils/pureCalculations';

interface CampaignProviderProgressProps {
  providers: ProviderProgress[];
  selectedProvider: string;
  onSelectProvider: (proveedor: string) => void;
}

/**
 * Avance de la auditoría por proveedor.
 *
 * El operario recorre la tienda de un laboratorio a la vez, así que necesita ver
 * cuánto le falta de cada uno sin abrir la tabla. Tocar un proveedor filtra la
 * matriz por él (mismo `selectedProvider` del desplegable, una sola fuente de verdad).
 *
 * No lanza una sesión de conteo a propósito: `onStartTargetedRecount` crea sesiones
 * de 2da vuelta (`esSegundaVuelta: true`), y un conteo nuevo por proveedor debe
 * SUMAR, no reemplazar. Usarlo aquí corrompería la cuadratura.
 */
export const CampaignProviderProgress: React.FC<CampaignProviderProgressProps> = ({
  providers,
  selectedProvider,
  onSelectProvider,
}) => {
  if (providers.length === 0) return null;

  const conPendientes = providers.filter(p => p.pendientes > 0).length;

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
          const completo = p.pendientes === 0;
          return (
            <button
              key={p.proveedor}
              type="button"
              onClick={() => onSelectProvider(p.proveedor)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                activo ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
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
                      {formatLocaleNumber(p.pendientes)} por contar
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
          );
        })}
      </div>
    </div>
  );
};
