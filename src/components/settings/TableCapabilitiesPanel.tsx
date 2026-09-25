import React from 'react';
import { Check, Ban, Sparkles, RotateCcw, AlertTriangle } from 'lucide-react';
import { SheetConfig, TableCapability } from '../../types';
import {
  ALL_TABLE_CAPABILITIES,
  detectTableCapabilities,
  getCapabilityOverrideStatus,
  setTableCapabilityOverride,
  resetTableCapabilitiesToAuto
} from '../../utils/sliceRegistry';

export interface TableCapabilitiesPanelProps {
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
  saveConfig: (newConfig: SheetConfig) => void;
  /** Clave de la tabla activa: `activeView`, la misma que usan los slices. */
  tableKey: string;
  headers?: string[];
}

/**
 * Corrección manual de las capacidades que la app deduce de las columnas. El modo por
 * defecto es automático; aquí solo se corrige el caso ambiguo que la detección no puede
 * resolver (una columna `Fecha` genérica, o una hoja de vencimientos con datos sucios).
 */
export const TableCapabilitiesPanel: React.FC<TableCapabilitiesPanelProps> = ({
  sheetConfig,
  setSheetConfig,
  saveConfig,
  tableKey,
  headers = []
}) => {
  const detected = detectTableCapabilities(headers, sheetConfig.customAliases);
  const override = sheetConfig.tableCapabilities?.[tableKey];

  const handleSetOverride = (capability: TableCapability, status: 'auto' | 'enabled' | 'disabled') => {
    const updated = setTableCapabilityOverride(sheetConfig, tableKey, capability, status);
    setSheetConfig(updated);
    saveConfig(updated);
  };

  const handleResetToAuto = () => {
    const updated = resetTableCapabilitiesToAuto(sheetConfig, tableKey);
    setSheetConfig(updated);
    saveConfig(updated);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Detección automática de la hoja activa
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          La app mira qué columnas tiene la hoja y habilita los módulos que puede sostener. No
          hace falta configurar nada: una hoja de Clientes no recibe vencimientos ni conteo.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] text-slate-400 font-medium mr-1">Tabla:</span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
            {tableKey}
          </span>
          <span className="text-[11px] text-slate-400 font-medium ml-2 mr-1">Detectado:</span>
          {detected.size === 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700">
              <AlertTriangle className="w-3 h-3" />
              <span>Sin semántica de dominio</span>
            </span>
          ) : (
            Array.from(detected).map(cap => (
              <span
                key={cap}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
              >
                <Check className="w-3 h-3" />
                <span>{ALL_TABLE_CAPABILITIES.find(c => c.id === cap)?.label ?? cap}</span>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Módulos de dominio ({ALL_TABLE_CAPABILITIES.length})
        </span>
        <button
          onClick={handleResetToAuto}
          disabled={!override}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
          title="Devolver esta tabla a la detección automática por columnas"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restablecer a Auto
        </button>
      </div>

      <div className="space-y-3">
        {ALL_TABLE_CAPABILITIES.map(cap => {
          const status = getCapabilityOverrideStatus(cap.id, tableKey, sheetConfig);
          const isActive = status === 'enabled' || (status === 'auto' && detected.has(cap.id));

          return (
            <div
              key={cap.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isActive
                  ? 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 shadow-xs'
                  : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/80 opacity-80'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {cap.label}
                  </span>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                      <Check className="w-3 h-3" /> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      <Ban className="w-3 h-3" /> Inactivo
                    </span>
                  )}
                  {status === 'enabled' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                      Forzado
                    </span>
                  )}
                  {status === 'disabled' && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                      Excluido
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{cap.description}</p>
              </div>

              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0 self-end sm:self-center border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => handleSetOverride(cap.id, 'auto')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    status === 'auto'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Seguir la detección automática por columnas"
                >
                  Auto
                </button>
                <button
                  onClick={() => handleSetOverride(cap.id, 'enabled')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    status === 'enabled'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                  }`}
                  title="Habilitar el módulo aunque las columnas no lo sugieran"
                >
                  Incluir
                </button>
                <button
                  onClick={() => handleSetOverride(cap.id, 'disabled')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    status === 'disabled'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
                  }`}
                  title="Ocultar el módulo en esta tabla"
                >
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
