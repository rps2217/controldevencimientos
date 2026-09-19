import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { InventoryItem, EventCategory } from '../../types';
import { getEventCategory, getItemStatus, parseAnyDate } from '../../utils/dateCalculations';
import { findColumnBySemantic } from '../../utils/columnAliases';
import { Activity, AlertTriangle, TrendingUp, PackageX } from 'lucide-react';

interface AnalyticsDashboardProps {
  items: InventoryItem[];
  headers: string[];
}

const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ items, headers }) => {
  // Aggregate data for incidents
  const incidentData = useMemo(() => {
    let transporte = 0;
    let diferencia = 0;
    let calInterna = 0;
    let calExterna = 0;
    let averia = 0;
    let devolucion = 0;
    let vencimientoCercano = 0;
    let canjes = 0;

    items.forEach(item => {
      const cat = getEventCategory(item, headers);
      if (cat === 'TRANSPORTE') transporte++;
      if (cat === 'DIFERENCIA') diferencia++;
      if (cat === 'CAL_INTERNA') calInterna++;
      if (cat === 'CAL_EXTERNA') calExterna++;
      if (cat === 'AVERIA') averia++;
      if (cat === 'DEVOLUCION') devolucion++;
      if (cat === 'VENCIMIENTO_CERCANO') vencimientoCercano++;
      if (cat === 'CANJES') canjes++;
    });

    return [
      { name: 'Det. Pedido', value: transporte, color: '#f59e0b' }, // amber
      { name: 'Dif. Pedido', value: diferencia, color: '#8b5cf6' }, // purple
      { name: 'Cal. Interna', value: calInterna, color: '#10b981' }, // emerald
      { name: 'Cal. Externa', value: calExterna, color: '#06b6d4' }, // cyan
      { name: 'Avería', value: averia, color: '#f43f5e' }, // rose
      { name: 'Devolución', value: devolucion, color: '#14b8a6' }, // teal
      { name: 'Venc. Cercano', value: vencimientoCercano, color: '#6366f1' }, // indigo
      { name: 'Canjes', value: canjes, color: '#ec4899' }, // pink
    ].filter(d => d.value > 0);
  }, [items, headers]);

  // Aggregate data for expirations by month/year
  const expirationData = useMemo(() => {
    const monthsMap: Record<string, number> = {};
    const vcHeader = findColumnBySemantic(headers, 'fecha_vc') || headers.find(h => /^FECHA_VC$|vencimiento|caducidad/i.test(h));

    if (!vcHeader) return [];

    items.forEach(item => {
      const cat = getEventCategory(item, headers);
      if (cat !== 'VENCIMIENTO') return;

      const dateVal = item[vcHeader];
      if (!dateVal) return;
      const d = parseAnyDate(dateVal);
      if (!d || isNaN(d.getTime())) return;

      const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsMap[monthYear] = (monthsMap[monthYear] || 0) + 1;
    });

    return Object.entries(monthsMap)
      .map(([name, vencimientos]) => ({ name, vencimientos }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12); // Next 12 months max
  }, [items, headers]);

  // Aggregate item status
  const statusData = useMemo(() => {
    let drainage = 0;
    let upcoming = 0;
    let retireNow = 0;
    let good = 0;

    items.forEach(item => {
      const cat = getEventCategory(item, headers);
      if (cat !== 'VENCIMIENTO') return;
      const st = getItemStatus(item, headers);
      if (st.code === 'DRAINAGE_PM') drainage++;
      else if (st.code === 'UPCOMING') upcoming++;
      else if (st.code === 'RETIRE_NOW' || st.code === 'EXPIRED') retireNow++;
      else good++;
    });

    return [
      { name: 'En Regla', value: good, color: '#10b981' }, // green
      { name: 'Drenaje PM', value: drainage, color: '#f97316' }, // orange
      { name: 'Próximo', value: upcoming, color: '#eab308' }, // yellow
      { name: 'Retirar/Vencido', value: retireNow, color: '#ef4444' }, // red
    ];
  }, [items, headers]);

  return (
    <div className="p-6 bg-slate-50 dark:bg-slate-950 flex-1 overflow-y-auto w-full h-full transition-colors">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/60 rounded-xl flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">Total Registros</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">{items.length}</h3>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-950/60 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">Alertas Críticas</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {statusData.find(d => d.name === 'Retirar/Vencido')?.value || 0}
              </h3>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/60 rounded-xl flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">Casos Drenaje PM</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {statusData.find(d => d.name === 'Drenaje PM')?.value || 0}
              </h3>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950/60 rounded-xl flex items-center justify-center shrink-0">
              <PackageX className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">Incidencias (FRC)</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {incidentData.reduce((acc, curr) => acc + curr.value, 0)}
              </h3>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expiration Timeline */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6">Proyección de Vencimientos</h3>
            {expirationData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expirationData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }}
                      cursor={{ fill: 'rgba(51, 65, 85, 0.1)' }}
                    />
                    <Bar dataKey="vencimientos" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-slate-400">
                No hay datos de vencimientos con fechas válidas.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Status Breakdown */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6">Estado del Radar (Vencimientos)</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '12px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ color: '#94a3b8' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Incident Types */}
            {incidentData.length > 0 && (
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6">Tipos de Incidencia (FRC)</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={incidentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {incidentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: '12px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ color: '#94a3b8' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
