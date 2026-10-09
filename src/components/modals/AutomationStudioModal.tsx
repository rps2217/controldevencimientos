import React, { useState } from 'react';
import { X, Bot, Play, CheckCircle2, ShieldCheck, Zap, ToggleLeft, ToggleRight, Sparkles, Activity } from 'lucide-react';
import { AutomationBotRule, DEFAULT_AUTOMATION_BOTS, BotExecutionLogEntry, evaluateAutomationBots } from '../../utils/appSheetAutomationEngine';
import { InventoryItem } from '../../types';

interface AutomationStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  sampleItems?: InventoryItem[];
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AutomationStudioModal: React.FC<AutomationStudioModalProps> = ({
  isOpen,
  onClose,
  sampleItems = [],
  showToast
}) => {
  const [bots, setBots] = useState<AutomationBotRule[]>(DEFAULT_AUTOMATION_BOTS);
  const [activeTab, setActiveTab] = useState<'bots' | 'logs'>('bots');
  const [executionLogs, setExecutionLogs] = useState<BotExecutionLogEntry[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  if (!isOpen) return null;

  const handleToggleBot = (botId: string) => {
    setBots(prev => prev.map(b => b.id === botId ? { ...b, enabled: !b.enabled } : b));
    showToast('Estado del Bot actualizado correctamente', 'success');
  };

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const testItem: InventoryItem = sampleItems[0] || {
        _rowIndex: 1,
        SKU: '200021021',
        DESCRIPCION: 'PARACETAMOL 500MG TAB X16',
        CANTIDAD: '25',
        FRC_EVEN: 'TRANSPORTE',
        PROVEEDOR: 'LABORATORIOS BAGO'
      };

      const triggeredLogs = evaluateAutomationBots(testItem, 'ON_INCIDENCE_LOGGED', bots);
      setExecutionLogs(prev => [...triggeredLogs, ...prev]);
      setIsSimulating(false);
      showToast(`Simulación completada: ${triggeredLogs.length} acciones de bot disparadas`, 'success');
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl flex flex-col overflow-hidden transition-all max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-purple-50/80 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-xl shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">AppSheet++ Automation Bots</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Motor Autónomo
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatizaciones inteligentes basadas en eventos, condiciones lógicas y reglas de negocio operativas.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-xl transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs & Actions */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('bots')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'bots'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> Bots Configurados ({bots.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> Historial de Ejecuciones ({executionLogs.length})
            </button>
          </div>

          <button
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSimulating ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            <span>Probar Bots en Vivo</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'bots' ? (
            <div className="space-y-3">
              {bots.map(bot => (
                <div 
                  key={bot.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    bot.enabled 
                      ? 'bg-white dark:bg-slate-800/80 border-purple-200 dark:border-purple-900/50 shadow-sm'
                      : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {bot.trigger}
                        </span>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{bot.name}</h4>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{bot.description}</p>
                      
                      <div className="pt-2 flex items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        <span>Condición: <strong className="text-purple-600 dark:text-purple-400">{bot.conditionExpression}</strong></span>
                        <span>•</span>
                        <span>Acción: <strong className="text-emerald-600 dark:text-emerald-400">{bot.actionType}</strong></span>
                        <span>•</span>
                        <span>Ejecuciones: <strong className="text-blue-600 dark:text-blue-400">{bot.executionCount}</strong></span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleBot(bot.id)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                        bot.enabled
                          ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {bot.enabled ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                          <span>Activo</span>
                        </>
                      ) : (
                        <span>Desactivado</span>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {executionLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Activity className="w-10 h-10 mx-auto opacity-40" />
                  <p className="text-xs font-medium">No hay ejecuciones registradas todavía. Haz clic en "Probar Bots en Vivo" para simular eventos.</p>
                </div>
              ) : (
                executionLogs.map(log => (
                  <div key={log.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-purple-600 dark:text-purple-400">{log.botName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{new Date(log.triggeredAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">SKU Afectado: <code className="text-blue-600 dark:text-blue-400">{log.itemSku}</code></p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 font-mono">
                      {log.resultMessage}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Motor de automatización ejecutándose con cero latencia local.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
