import React from 'react';
import { Search, Scan, Download, RotateCcw, Package, Check, HelpCircle, Plus, AlertTriangle, MapPin } from 'lucide-react';
import { CampaignAuditRow, CampaignConsolidationMatrix } from '../../types';
import { formatLocaleNumber } from '../../utils/pureCalculations';

type MatrixFilter = 'ALL' | 'VALIDADO_OK' | 'DISCREPANCIA' | 'NUNCA_PISTOLEADO' | 'HALLAZGO';

interface CampaignMatrixTableProps {
  matrix: CampaignConsolidationMatrix | null;
  displayedRows: CampaignAuditRow[];
  providerList: string[];
  matrixFilter: MatrixFilter;
  searchTerm: string;
  selectedProvider: string;
  onMatrixFilterChange: (f: MatrixFilter) => void;
  onSearchTermChange: (t: string) => void;
  onSelectedProviderChange: (p: string) => void;
  onQuickScan: () => void;
  onExportDiscrepancies: () => void;
  onLaunchTargetedRecount: () => void;
  onToggleCloseSku: (row: CampaignAuditRow) => void;
  onUpdateSalesAdjustment: (sku: string, val: number) => void;
}

export const CampaignMatrixTable: React.FC<CampaignMatrixTableProps> = ({
  matrix,
  displayedRows,
  providerList,
  matrixFilter,
  searchTerm,
  selectedProvider,
  onMatrixFilterChange,
  onSearchTermChange,
  onSelectedProviderChange,
  onQuickScan,
  onExportDiscrepancies,
  onLaunchTargetedRecount,
  onToggleCloseSku,
  onUpdateSalesAdjustment
}) => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
      
      {/* Controls Bar: Search, Filters, Launch Targeted Recount */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              placeholder="Buscar por SKU, descripción o proveedor..."
              className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="button"
              onClick={() => onQuickScan()}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-600 dark:text-purple-400 hover:text-purple-700 p-1.5 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors cursor-pointer"
              title="Escanear con Pistola Verificadora"
            >
              <Scan className="w-4 h-4" />
            </button>
          </div>

          {/* Provider Filter */}
          {providerList.length > 0 && (
            <select
              value={selectedProvider}
              onChange={(e) => onSelectedProviderChange(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
            >
              <option value="ALL">Todos los Proveedores ({providerList.length})</option>
              {providerList.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </div>

        {/* Quick Action: Targeted 2nd Round Recount */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMatrixFilterChange('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              matrixFilter === 'ALL'
                ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            Ver Todos ({matrix ? matrix.totalSkusTeoricos + matrix.hallazgosCount : 0})
          </button>

          {matrix && matrix.discrepanciasCount > 0 && (
            <>
              <button
                onClick={onExportDiscrepancies}
                className="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Exportar planilla de 2do conteo para imprimir o llevar en papel"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Planilla 2do Conteo</span>
              </button>

              <button
                onClick={onLaunchTargetedRecount}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                title="Abrir terminal filtrada con solo los SKUs descuadrados"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Iniciar 2da Pasada ({matrix.discrepanciasCount})</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table of Consolidated Matrix */}
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-xs border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
            <tr>
              <th className="py-3 px-4 w-12 text-center">Estado</th>
              <th className="py-3 px-4 w-36">Código SKU</th>
              <th className="py-3 px-4 min-w-[240px]">Descripción / Proveedor</th>
              <th className="py-3 px-3 text-right w-24">Teórico ERP</th>
              <th className="py-3 px-3 text-right w-24">Físico Total</th>
              <th className="py-3 px-3 text-center w-28">Venta / Ajuste</th>
              <th className="py-3 px-3 text-right w-24">Diferencia</th>
              <th className="py-3 px-4 min-w-[180px]">Muebles / Sesiones</th>
              <th className="py-3 px-4 text-center w-28">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="font-semibold">No se encontraron productos en este estado o filtro</p>
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => {
                const isSquare = row.diferenciaNeta === 0;
                const isNeverScanned = row.estadoGlobal === 'NUNCA_PISTOLEADO';
                const isHallazgo = row.estadoGlobal === 'HALLAZGO';

                return (
                  <tr 
                    key={row.sku}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                      row.esCerrado ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''
                    }`}
                  >
                    {/* Estado Badge */}
                    <td className="py-2.5 px-4 text-center">
                      {row.esCerrado || isSquare ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400" title="Validado / Cuadrado">
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                      ) : isNeverScanned ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400" title="Nunca Pistoleado (Sin Lecturas Físicas)">
                          <HelpCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                      ) : isHallazgo ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400" title="Hallazgo Físico (No en ERP)">
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400" title="Discrepancia para 2da Pasada">
                          <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                      )}
                    </td>

                    {/* SKU */}
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {row.sku}
                    </td>

                    {/* Descripción & Proveedor */}
                    <td className="py-2.5 px-4">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block truncate max-w-sm" title={row.descripcion}>
                        {row.descripcion || 'Sin descripción'}
                      </span>
                      {row.proveedor && (
                        <span className="text-[11px] text-slate-400 block truncate">
                          {row.proveedor}
                        </span>
                      )}
                    </td>

                    {/* Stock Teórico ERP */}
                    <td className="py-2.5 px-3 text-right font-medium text-slate-600 dark:text-slate-400">
                      {formatLocaleNumber(row.stockTeorico)}
                    </td>

                    {/* Stock Físico Contado */}
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatLocaleNumber(row.stockFisicoTotal)}
                    </td>

                    {/* Venta en Turno / Ajuste Manual */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span className="text-[11px] text-slate-400 font-bold">V:</span>
                        <input
                          type="number"
                          min="0"
                          value={row.ajusteManualVenta || (row.ventaRegistrada > 0 ? row.ventaRegistrada : '')}
                          onChange={(e) => onUpdateSalesAdjustment(row.sku, parseInt(e.target.value, 10) || 0)}
                          placeholder="0"
                          title="Ingresa unidades vendidas en caja durante el conteo"
                          className="w-10 text-center font-bold text-slate-700 dark:text-slate-200 bg-transparent border-0 outline-none p-0 text-xs"
                        />
                      </div>
                    </td>

                    {/* Diferencia Neta */}
                    <td className="py-2.5 px-3 text-right font-black">
                      {row.diferenciaNeta === 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">0</span>
                      ) : row.diferenciaNeta > 0 ? (
                        <span className="text-blue-600 dark:text-blue-400">+{row.diferenciaNeta}</span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400">{row.diferenciaNeta}</span>
                      )}
                    </td>

                    {/* Muebles / Sesiones de Conteo */}
                    <td className="py-2.5 px-4">
                      {row.sesionesDondeAparece.length === 0 ? (
                        <span className="text-[11px] text-rose-500 italic font-medium">
                          Ningún mueble pistoleado
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.sesionesDondeAparece.map((s, idx) => (
                            <span 
                              key={idx} 
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                              title={`${s.nombreSesion} (${s.ubicacion || 'Sin ubicación'}) - ${s.cantidad} unidades`}
                            >
                              <MapPin className="w-2.5 h-2.5 text-blue-500" />
                              <span>{s.ubicacion || s.nombreSesion}: {s.cantidad}u</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Acción de Cierre / Validación */}
                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={() => onToggleCloseSku(row)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          row.esCerrado
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        }`}
                      >
                        {row.esCerrado ? 'Reabrir' : 'Dar por OK'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
