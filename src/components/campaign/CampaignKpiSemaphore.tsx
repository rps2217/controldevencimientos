import React from 'react';
import { ShieldCheck, Layers, Database, Cloud, CheckCircle2, AlertTriangle, HelpCircle, Package } from 'lucide-react';
import { StockCountSession, CampaignConsolidationMatrix } from '../../types';
import { formatLocaleNumber } from '../../utils/pureCalculations';

type MatrixFilter = 'ALL' | 'VALIDADO_OK' | 'DISCREPANCIA' | 'NUNCA_PISTOLEADO' | 'HALLAZGO';

interface CampaignKpiSemaphoreProps {
  matrix: CampaignConsolidationMatrix | null;
  sessions: StockCountSession[];
  matrixFilter: MatrixFilter;
  lastCloudSyncDate: string | null;
  onNavigateToSessionList?: () => void;
  onSwitchToTerminal: () => void;
  onSelectFilter: (f: MatrixFilter) => void;
  isMatrixTabActive: boolean;
}

/**
 * Cabecera de lectura de la campaña: aviso de destino de guardado, cobertura de la
 * auditoría, muebles consolidados y el semáforo de 4 estados. Los conteos vienen ya
 * calculados en `matrix`; aquí solo se pintan y se elige el filtro de la matriz.
 */
export const CampaignKpiSemaphore: React.FC<CampaignKpiSemaphoreProps> = ({
  matrix,
  sessions,
  matrixFilter,
  lastCloudSyncDate,
  onNavigateToSessionList,
  onSwitchToTerminal,
  onSelectFilter,
  isMatrixTabActive
}) => {
  if (!matrix) return null;
  return (
<div className="px-6 py-4 bg-white/70 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 shrink-0 backdrop-blur-xs">
  
  {/* Storage & Separation Notice */}
  <div className="mb-3 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
    <div className="flex items-center gap-2">
      <Database className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
      <span>
        <strong className="text-slate-700 dark:text-slate-200">Destino de Guardado:</strong> Pestaña <code className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-[11px] font-bold">_AUDITORIA_INVENTARIO</code> y Nube. La pestaña <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[11px]">VENCIMIENTOS</code> permanece aislada para fechas de vencimiento.
      </span>
    </div>
    {lastCloudSyncDate && (
      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 shrink-0">
        <Cloud className="w-3.5 h-3.5" /> Sincronizado ({lastCloudSyncDate})
      </span>
    )}
  </div>

  {/* Progress Bar */}
  <div className="mb-4">
    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
      <span className="text-slate-700 dark:text-slate-200 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-blue-600" />
        <span>Cobertura Global de Auditoría de la Farmacia</span>
      </span>
      <span className="text-blue-600 dark:text-blue-400 text-sm font-extrabold">
        {matrix.porcentajeCobertura}% Auditado ({matrix.totalSkusTeoricos - matrix.nuncaPistoleadosCount} de {matrix.totalSkusTeoricos} SKUs)
      </span>
    </div>
    <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
      <div 
        style={{ width: `${matrix.totalSkusTeoricos > 0 ? (matrix.cuadradosCount / matrix.totalSkusTeoricos) * 100 : 0}%` }} 
        className="bg-emerald-500 h-full transition-all duration-500" 
        title="Cuadrados / Validados"
      />
      <div 
        style={{ width: `${matrix.totalSkusTeoricos > 0 ? (matrix.discrepanciasCount / matrix.totalSkusTeoricos) * 100 : 0}%` }} 
        className="bg-amber-500 h-full transition-all duration-500" 
        title="Discrepancias"
      />
      <div 
        style={{ width: `${matrix.totalSkusTeoricos > 0 ? (matrix.nuncaPistoleadosCount / matrix.totalSkusTeoricos) * 100 : 0}%` }} 
        className="bg-rose-400/80 h-full transition-all duration-500" 
        title="Nunca Pistoleados"
      />
    </div>
  </div>

  {/* Ribbon: Muebles y Dispositivos Consolidados en esta Campaña */}
  <div className="mb-4 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex flex-col gap-2">
    <div className="flex items-center justify-between px-1">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-indigo-500" />
        <span>Muebles Consolidados ({sessions.length}):</span>
        <span className="text-[11px] text-slate-400 font-normal">Lecturas de todos los dispositivos combinadas en la matriz</span>
      </span>
      <button
        type="button"
        onClick={() => onNavigateToSessionList ? onNavigateToSessionList() : onSwitchToTerminal()}
        className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
      >
        <span>+ Agregar Mueble</span>
      </button>
    </div>

    {sessions.length === 0 ? (
      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl text-xs text-slate-400 text-center border border-dashed border-slate-200 dark:border-slate-700">
        Aún no hay muebles pistoleados. Pulsa <strong className="text-blue-600">"Pistolear Mueble"</strong> para iniciar el primer conteo.
      </div>
    ) : (
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {sessions.map(s => {
          const unids = s.conteos.reduce((acc, c) => acc + c.cantidad, 0);
          const isCompleted = s.estado === 'COMPLETED';
          const deviceLabel = s.deviceId ? (s.deviceId.includes('movil') ? '📱 ' + s.deviceId : '💻 ' + s.deviceId) : 'Dispositivo';

          return (
            <div
              key={s.id}
              onClick={() => onSwitchToTerminal()}
              className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5 shrink-0 shadow-2xs hover:border-blue-500 transition-all cursor-pointer group"
              title={`${s.nombre} - ${unids} unidades - Clic para abrir`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${isCompleted ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`} />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 truncate max-w-[150px]">
                  {s.nombre}
                </span>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{formatLocaleNumber(unids)} unids</span>
                  <span>•</span>
                  <span className="truncate max-w-[90px]">{deviceLabel}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>

  {/* 4 Semáforo KPI Cards */}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
    
    {/* Card 1: 🟢 Cuadrados / Validados */}
    <button
      onClick={() => { onSelectFilter('VALIDADO_OK'); }}
      className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
        matrixFilter === 'VALIDADO_OK' && isMatrixTabActive
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300'
      }`}
    >
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Cuadrados / OK
        </span>
        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
          Cerrados
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
          {formatLocaleNumber(matrix.cuadradosCount)}
        </span>
        <span className="text-xs text-slate-400">SKUs</span>
      </div>
      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
        Pistoleados y conformes. No requieren más revisión.
      </span>
    </button>

    {/* Card 2: 🟡 Discrepancias */}
    <button
      onClick={() => { onSelectFilter('DISCREPANCIA'); }}
      className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
        matrixFilter === 'DISCREPANCIA' && isMatrixTabActive
          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-500/20'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-300'
      }`}
    >
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" /> Discrepancias
        </span>
        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
          2da Pasada
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
          {formatLocaleNumber(matrix.discrepanciasCount)}
        </span>
        <span className="text-xs text-slate-400">SKUs</span>
      </div>
      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
        Diferencias (+ o -). Revisar ventas o 2do conteo.
      </span>
    </button>

    {/* Card 3: 🔴 Nunca Pistoleados */}
    <button
      onClick={() => { onSelectFilter('NUNCA_PISTOLEADO'); }}
      className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
        matrixFilter === 'NUNCA_PISTOLEADO' && isMatrixTabActive
          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 ring-2 ring-rose-500/20'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-rose-300'
      }`}
    >
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4" /> Nunca Pistoleados
        </span>
        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
          Pendientes
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
          {formatLocaleNumber(matrix.nuncaPistoleadosCount)}
        </span>
        <span className="text-xs text-slate-400">SKUs</span>
      </div>
      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
        Figuran en ERP pero 0 lecturas en todas las sesiones.
      </span>
    </button>

    {/* Card 4: 🔵 Hallazgos / No en ERP */}
    <button
      onClick={() => { onSelectFilter('HALLAZGO'); }}
      className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
        matrixFilter === 'HALLAZGO' && isMatrixTabActive
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300'
      }`}
    >
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
          <Package className="w-4 h-4" /> Hallazgos Físicos
        </span>
        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
          Sobrantes
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
          {formatLocaleNumber(matrix.hallazgosCount)}
        </span>
        <span className="text-xs text-slate-400">SKUs</span>
      </div>
      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
        Pistoleados en físico pero no figuran en el ERP.
      </span>
    </button>
  </div>
</div>
  );
};
