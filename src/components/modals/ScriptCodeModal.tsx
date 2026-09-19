import React, { useState } from 'react';
import { Code2, X, Sparkles, CheckCheck, Copy } from 'lucide-react';
import { APPS_SCRIPT_RECOMMENDED_CODE, APPS_SCRIPT_ADVANCED_PROPERTIES_CODE } from '../../lib/sheets';

interface ScriptCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScriptCodeModal: React.FC<ScriptCodeModalProps> = ({
  isOpen,
  onClose
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [scriptTab, setScriptTab] = useState<'properties' | 'sheet'>('properties');

  if (!isOpen) return null;

  const handleCopyCode = () => {
    const code = scriptTab === 'properties' ? APPS_SCRIPT_ADVANCED_PROPERTIES_CODE : APPS_SCRIPT_RECOMMENDED_CODE;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-200 dark:shadow-none">
              <Code2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Código del Conector Apps Script</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Copia y pega este script en tu Google Sheet (Extensiones &gt; Apps Script)</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-4 pb-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <button
            onClick={() => setScriptTab('properties')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              scriptTab === 'properties'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200 dark:shadow-none'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Opción 2: PropertiesService (Recomendada - Cero Pestañas Extras)</span>
          </button>
          <button
            onClick={() => setScriptTab('sheet')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              scriptTab === 'sheet'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200 dark:shadow-none'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Opción 1: Pestaña Oculta _CONFIG_APP
          </button>
        </div>

        {/* Instructions & Code area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {scriptTab === 'properties' ? (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 text-xs text-emerald-950 dark:text-emerald-200 leading-relaxed">
              <strong className="block font-bold text-emerald-900 dark:text-emerald-300 text-sm mb-1">
                ⭐ ¿Por qué Opción 2 es la mejor arquitectura?
              </strong>
              Guarda el esquema de metadatos (visibilidad, claves ID, relaciones y automatizaciones) directamente en la memoria protegida de Google Apps Script.
              <ul className="list-disc list-inside mt-2 space-y-1 text-emerald-900 dark:text-emerald-300/90">
                <li>No ensucia tu libro de cálculo con hojas técnicas.</li>
                <li>Los usuarios o colaboradores no pueden alterar ni borrar accidentalmente la configuración.</li>
                <li>Totalmente sincronizado en la nube para todos los dispositivos.</li>
              </ul>
            </div>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-xs text-blue-950 dark:text-blue-200 leading-relaxed">
              <strong className="block font-bold text-blue-900 dark:text-blue-300 text-sm mb-1">
                Opción 1: Pestaña Técnica _CONFIG_APP
              </strong>
              Crea una pestaña llamada <code className="font-mono bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded font-bold">_CONFIG_APP</code> en tu Google Sheet para almacenar el JSON de configuración en la celda A1.
            </div>
          )}

          <div className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/80 rounded-2xl p-3 text-xs text-blue-900 dark:text-blue-200">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <p>
              <strong>Conector v2 de Alto Rendimiento:</strong> Incluye <strong>Carga en Lote (Batch Fetching)</strong> para traer múltiples hojas en un solo viaje HTTP, lectura nativa ultraveloz con <code className="font-mono bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded">getValues()</code> y <strong>desbloqueo de lecturas concurrentes</strong>.
            </p>
          </div>

          <div className="relative">
            <pre className="bg-slate-950 dark:bg-slate-950 border border-slate-800 text-slate-100 p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-[350px] leading-relaxed select-all">
              {scriptTab === 'properties' ? APPS_SCRIPT_ADVANCED_PROPERTIES_CODE : APPS_SCRIPT_RECOMMENDED_CODE}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Recuerda desplegar como <strong>Aplicación Web</strong> con acceso para <strong>Cualquiera (Anyone)</strong>.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cerrar
            </button>
            <button
              onClick={handleCopyCode}
              className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 flex items-center gap-1.5 shadow-sm shadow-blue-200 dark:shadow-none"
            >
              {copiedCode ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedCode ? '¡Código Copiado!' : 'Copiar Código'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
