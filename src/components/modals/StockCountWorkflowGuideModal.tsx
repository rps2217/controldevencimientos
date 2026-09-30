import React from 'react';
import { 
  X, 
  UploadCloud, 
  Layers, 
  Zap, 
  CheckCircle2, 
  Store, 
  ArrowRight, 
  HelpCircle,
  FileSpreadsheet,
  Scan,
  RotateCcw,
  Sparkles
} from 'lucide-react';

interface StockCountWorkflowGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUploadErp: () => void;
  onOpenNewSession: () => void;
}

export const StockCountWorkflowGuideModal: React.FC<StockCountWorkflowGuideModalProps> = ({
  isOpen,
  onClose,
  onOpenUploadErp,
  onOpenNewSession
}) => {
  if (!isOpen) return null;

  const steps = [
    {
      step: 'Paso 0',
      title: 'Foto ERP / Stock Teórico',
      icon: UploadCloud,
      color: 'bg-blue-600 text-white',
      badgeColor: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      desc: 'Carga tu archivo Excel (.xlsx / .csv) o pega los saldos de stock desde el sistema de farmacia/POS. Esto establece la "foto teórica" con la que se compararán los conteos.',
      action: {
        label: 'Cargar Archivo ERP',
        onClick: () => {
          onClose();
          onOpenUploadErp();
        }
      }
    },
    {
      step: 'Paso 1',
      title: 'Muebles y Zonas',
      icon: Layers,
      color: 'bg-indigo-600 text-white',
      badgeColor: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      desc: 'Organiza el conteo creando sesiones por Mueble, Pasillo, Zona o Proveedor (ej. "Mueble 1", "Refrigerados", "Laboratorio Bagó"). Permite auditar en paralelo.',
      action: {
        label: 'Crear o Elegir Mueble',
        onClick: () => {
          onClose();
          onOpenNewSession();
        }
      }
    },
    {
      step: 'Paso 2',
      title: 'Pistoleo y Captura',
      icon: Zap,
      color: 'bg-amber-500 text-slate-950',
      badgeColor: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      desc: 'El operario escanea con lector láser Bluetooth, cámara del celular o teclado táctil. Muestra en pantalla el acumulado en tiempo real y alerta si el ítem es un hallazgo nuevo.',
      action: null
    },
    {
      step: 'Paso 3',
      title: 'Cuadratura de Mueble',
      icon: CheckCircle2,
      color: 'bg-emerald-600 text-white',
      badgeColor: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      desc: 'Revisa de inmediato los ítems Cuadrados, Sobrantes y Faltantes de ese mueble específico antes de pasar al siguiente sector.',
      action: null
    },
    {
      step: 'Paso 4',
      title: 'Tienda Completa y Cierre',
      icon: Store,
      color: 'bg-purple-600 text-white',
      badgeColor: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      desc: 'Consolida todos los muebles en la Matriz General, aplica ventas del turno en caja, exporta el reporte a Excel o sincroniza los datos a la hoja de Vencimientos.',
      action: null
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-md shadow-indigo-500/20">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Guía de Flujo: ¿Cómo funciona el Módulo de Conteo?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Flujo paso a paso desde la carga del ERP hasta el cierre y exportación final.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps List */}
        <div className="p-5 flex-1 overflow-y-auto space-y-3.5">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div 
                key={s.step} 
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all hover:border-slate-300 dark:hover:border-slate-600"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className={`p-2.5 rounded-2xl shrink-0 shadow-xs ${s.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-black border ${s.badgeColor}`}>
                        {s.step}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {s.title}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {s.desc}
                    </p>
                  </div>
                </div>

                {s.action && (
                  <button
                    type="button"
                    onClick={s.action.onClick}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0 self-end sm:self-center flex items-center gap-1.5 active:scale-95"
                  >
                    <span>{s.action.label}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Puedes cargar o actualizar el archivo ERP en cualquier momento del turno.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            ¡Entendido!
          </button>
        </div>

      </div>
    </div>
  );
};
