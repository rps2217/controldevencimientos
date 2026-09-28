import React from 'react';
import { MapPin, ChevronRight } from 'lucide-react';
import { formatLocaleNumber } from '../../utils/pureCalculations';

interface LocationProgressItem {
  ubicacion: string;
  sesionesCount: number;
  skusContados: number;
  totalUnidades: number;
}

interface CampaignLocationProgressProps {
  locations: LocationProgressItem[];
  selectedLocation: string;
  onSelectLocation: (ubicacion: string) => void;
}

/**
 * Avance físico de la auditoría por mueble, pasillo o góndola (resumenPorUbicacion).
 *
 * Complementa la vista comercial por proveedor permitiendo al operario o jefe de local
 * ver el barrido físico de la tienda mueble por mueble.
 */
export const CampaignLocationProgress: React.FC<CampaignLocationProgressProps> = ({
  locations,
  selectedLocation,
  onSelectLocation,
}) => {
  if (!locations || locations.length === 0) return null;

  const totalUnidadesGlobal = locations.reduce((acc, l) => acc + l.totalUnidades, 0);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-500" />
          Barrido Físico por Mueble / Ubicación
        </span>
        <span className="text-[11px] font-semibold text-slate-400">
          {locations.length} ubicaciones · {formatLocaleNumber(totalUnidadesGlobal)} unids contadas
        </span>
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {locations.map(loc => {
          const activo = selectedLocation === loc.ubicacion;
          const porcentaje = totalUnidadesGlobal > 0 ? Math.round((loc.totalUnidades / totalUnidadesGlobal) * 100) : 0;

          return (
            <div
              key={loc.ubicacion}
              className={`w-full flex items-center gap-2 pr-3 transition-colors ${
                activo ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectLocation(loc.ubicacion)}
                className="flex-1 min-w-0 text-left pl-4 py-2.5 flex items-center gap-3 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                      {loc.ubicacion || 'General'}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 shrink-0">
                      {loc.sesionesCount} {loc.sesionesCount === 1 ? 'sesión' : 'sesiones'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(100, porcentaje)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 tabular-nums shrink-0">
                      {porcentaje}% del físico
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                    <span>{formatLocaleNumber(loc.skusContados)} SKUs contados</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {formatLocaleNumber(loc.totalUnidades)} unidades físicas
                    </span>
                  </div>
                </div>

                <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${activo ? 'rotate-90 text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'}`} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
