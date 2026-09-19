import React, { useState, useMemo } from 'react';
import { 
  Sliders, 
  Check, 
  Ban, 
  Sparkles, 
  RotateCcw, 
  Phone, 
  Mail, 
  Calendar, 
  TableProperties
} from 'lucide-react';
import { SheetConfig, SpreadsheetMetadata } from '../../types';
import { 
  ALL_BULK_ACTIONS, 
  buildBulkActionContext, 
  isActionEnabledForTable, 
  getActionOverrideStatus, 
  setTableActionOverride, 
  resetTableBulkActionsToAuto 
} from '../../utils/bulkActionsRegistry';

export interface TableBulkActionsPanelProps {
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
  saveConfig: (newConfig: SheetConfig) => void;
  activeSheetTitle?: string;
  activeView?: string;
  headers?: string[];
  metadata?: SpreadsheetMetadata | null;
}

export const TableBulkActionsPanel: React.FC<TableBulkActionsPanelProps> = ({
  sheetConfig,
  setSheetConfig,
  saveConfig,
  activeSheetTitle = '',
  activeView = '',
  headers = [],
  metadata = null
}) => {
  // Current selected table
  const initialTableKey = activeSheetTitle || activeView || 'Vencimientos';
  const [selectedTableKey, setSelectedTableKey] = useState<string>(initialTableKey);

  // Available sheets list
  const availableSheets = useMemo(() => {
    const list: string[] = [];
    if (metadata && metadata.sheets) {
      metadata.sheets.forEach(s => {
        if (s.properties?.title && !list.includes(s.properties.title)) {
          list.push(s.properties.title);
        }
      });
    }
    if (sheetConfig.main && !list.includes(sheetConfig.main)) list.push(sheetConfig.main);
    if (sheetConfig.events && !list.includes(sheetConfig.events)) list.push(sheetConfig.events);
    if (sheetConfig.products && !list.includes(sheetConfig.products)) list.push(sheetConfig.products);
    if (sheetConfig.policies && !list.includes(sheetConfig.policies)) list.push(sheetConfig.policies);
    
    // Default standard names if empty
    if (list.length === 0) {
      list.push('Vencimientos', 'Incidencias FRC', 'Contactos', 'Catálogo');
    }
    return list;
  }, [metadata, sheetConfig]);

  // Context for selected table
  const evalContext = useMemo(() => {
    const currentTable = activeSheetTitle || activeView;
    const isCurrent = selectedTableKey === currentTable;
    const targetHeaders = isCurrent ? headers : [];
    return buildBulkActionContext(targetHeaders, activeView, selectedTableKey);
  }, [selectedTableKey, activeSheetTitle, activeView, headers]);

  const handleSetOverride = (actionId: string, override: 'auto' | 'enabled' | 'disabled') => {
    const updated = setTableActionOverride(sheetConfig, selectedTableKey, actionId, override);
    setSheetConfig(updated);
    saveConfig(updated);
  };

  const handleResetToAuto = () => {
    const updated = resetTableBulkActionsToAuto(sheetConfig, selectedTableKey);
    setSheetConfig(updated);
    saveConfig(updated);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Table Selector & Context Detection Header */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TableProperties className="w-4 h-4 text-slate-500" />
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Configurando Tabla / Pestaña:
            </label>
          </div>
          <select
            value={selectedTableKey}
            onChange={(e) => setSelectedTableKey(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-xs"
          >
            {availableSheets.map(title => (
              <option key={title} value={title}>
                {title} {title === (activeSheetTitle || activeView) ? '★ (Tabla Actual)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Context Detection Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
          <span className="text-[11px] text-slate-400 font-medium mr-1">Detección contextual:</span>
          
          <div className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${
            evalContext.hasPhoneColumn 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
          }`}>
            <Phone className="w-3 h-3" />
            <span>{evalContext.hasPhoneColumn ? 'Teléfono detectado' : 'Sin teléfono'}</span>
          </div>

          <div className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${
            evalContext.hasEmailColumn 
              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
              : 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
          }`}>
            <Mail className="w-3 h-3" />
            <span>{evalContext.hasEmailColumn ? 'Email detectado' : 'Sin email'}</span>
          </div>

          <div className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${
            evalContext.hasDateColumn 
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              : 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
          }`}>
            <Calendar className="w-3 h-3" />
            <span>{evalContext.hasDateColumn ? 'Fechas detectadas' : 'Sin fechas'}</span>
          </div>
        </div>
      </div>

      {/* Actions List Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Acciones y Herramientas ({ALL_BULK_ACTIONS.length})
        </span>
        <button
          onClick={handleResetToAuto}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
          title="Restablecer todas las acciones de esta tabla al modo inteligente automático"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restablecer a Auto
        </button>
      </div>

      {/* Cards List */}
      <div className="space-y-3">
        {ALL_BULK_ACTIONS.map(action => {
          const Icon = action.icon;
          const overrideStatus = getActionOverrideStatus(action.id, selectedTableKey, sheetConfig);
          const isCurrentlyActive = isActionEnabledForTable(action.id, evalContext, sheetConfig);
          const contextualReason = action.getContextualReason(evalContext);

          return (
            <div 
              key={action.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isCurrentlyActive 
                  ? 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 shadow-xs' 
                  : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/80 opacity-80'
              }`}
            >
              {/* Action Info */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                  isCurrentlyActive 
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {action.label}
                    </span>
                    
                    {/* Active Status Badge */}
                    {isCurrentlyActive ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        <Check className="w-3 h-3" /> Visible
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        <Ban className="w-3 h-3" /> Oculta
                      </span>
                    )}

                    {/* Manual Override Indicator */}
                    {overrideStatus === 'enabled' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                        Forzada
                      </span>
                    )}
                    {overrideStatus === 'disabled' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                        Excluida
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {action.description}
                  </p>
                  
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1 italic">
                    <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" />
                    {contextualReason}
                  </p>
                </div>
              </div>

              {/* 3-State Controls: Auto | Incluir | Excluir */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0 self-end sm:self-center border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => handleSetOverride(action.id, 'auto')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    overrideStatus === 'auto'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Seguir regla inteligente automática según las columnas de la tabla"
                >
                  Auto
                </button>

                <button
                  onClick={() => handleSetOverride(action.id, 'enabled')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    overrideStatus === 'enabled'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                  }`}
                  title="Mostrar siempre en esta tabla"
                >
                  Incluir
                </button>

                <button
                  onClick={() => handleSetOverride(action.id, 'disabled')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    overrideStatus === 'disabled'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
                  }`}
                  title="Excluir y ocultar de esta tabla para evitar ruido"
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
