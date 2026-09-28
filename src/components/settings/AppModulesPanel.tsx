import React from 'react';
import { ToggleLeft, ToggleRight, Sparkles, Check, Ban } from 'lucide-react';
import { SheetConfig } from '../../types';
import { ALL_APP_MODULES, isModuleEnabled } from '../../utils/modulesRegistry';

export interface AppModulesPanelProps {
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
  saveConfig: (newConfig: SheetConfig) => void;
}

export const AppModulesPanel: React.FC<AppModulesPanelProps> = ({
  sheetConfig,
  setSheetConfig,
  saveConfig
}) => {
  const enabledModules = sheetConfig.enabledModules || {};

  const handleToggleModule = (moduleId: string) => {
    const isCurrentEnabled = isModuleEnabled(moduleId, enabledModules);
    const updatedModules = {
      ...enabledModules,
      [moduleId]: !isCurrentEnabled
    };

    const nextConfig = {
      ...sheetConfig,
      enabledModules: updatedModules
    };

    setSheetConfig(nextConfig);
    saveConfig(nextConfig);
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-150">
      
      {/* Intro Header Card */}
      <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-800/60 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider">
            Gestor de Módulos & Plugins Globales
          </span>
        </div>
        <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 leading-relaxed">
          Activa o desactiva de forma global los grandes módulos de navegación de la aplicación. Las vistas inactivas no se cargarán ni se mostrarán en la barra lateral para un entorno de trabajo simplificado y de mayor rendimiento.
        </p>
      </div>

      {/* Grid List */}
      <div className="space-y-3">
        {ALL_APP_MODULES.map(mod => {
          const isEnabled = isModuleEnabled(mod.id, enabledModules);
          const IconComponent = mod.icon;

          return (
            <div
              key={mod.id}
              className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                isEnabled
                  ? 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 shadow-2xs'
                  : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/80 opacity-70'
              }`}
            >
              <div className="flex gap-3.5 min-w-0">
                {/* Module Icon Container */}
                <div className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                  isEnabled
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                }`}>
                  <IconComponent className="w-5 h-5" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      {mod.label}
                    </span>
                    {isEnabled ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        <Check className="w-2.5 h-2.5" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        <Ban className="w-2.5 h-2.5" /> Desactivado
                      </span>
                    )}
                    {!mod.canBeDisabled && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        Requerido
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-normal">
                    {mod.description}
                  </p>
                </div>
              </div>

              {/* Toggle Switch Button */}
              {mod.canBeDisabled ? (
                <button
                  type="button"
                  onClick={() => handleToggleModule(mod.id)}
                  className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 cursor-pointer active:scale-95"
                  title={isEnabled ? 'Desactivar módulo' : 'Activar módulo'}
                >
                  {isEnabled ? (
                    <ToggleRight className="w-9 h-9 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <ToggleLeft className="w-9 h-9 text-slate-300 dark:text-slate-600" />
                  )}
                </button>
              ) : (
                <div className="shrink-0 p-1">
                  <ToggleRight className="w-9 h-9 text-slate-300 dark:text-slate-700 opacity-50 cursor-not-allowed" />
                </div>
              )}

            </div>
          );
        })}
      </div>

    </div>
  );
};
