import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle,
  AlertTriangle, Clock, Trash2, Edit, User, Package, X
} from 'lucide-react';
import { InventoryItem } from '../../types';
import { parseAnyDate } from '../../utils/pureCalculations';
import { getItemStatus } from '../../utils/dateCalculations';
import { useOperationalTasks } from '../../hooks/useOperationalTasks';
import { OperationalTask, OperationalTaskCategory } from '../../types/calendar';
import { OperationalTaskModal } from '../modals/OperationalTaskModal';

interface OperationalCalendarViewProps {
  items: InventoryItem[];
  headers?: string[];
  onSelectItem?: (item: InventoryItem) => void;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const CATEGORY_BADGES: Record<OperationalTaskCategory, { label: string; color: string }> = {
  ROTATIVO: { label: 'Rotativo', color: 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  AUDITORIA: { label: 'Auditoría', color: 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  PROVEEDOR: { label: 'Proveedor', color: 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  REVISION: { label: 'Revisión', color: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  OTRO: { label: 'Rutina', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
};

export const OperationalCalendarView: React.FC<OperationalCalendarViewProps> = ({
  items,
  headers = [],
  onSelectItem
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [showExpirations, setShowExpirations] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);

  // Task modal states
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalInitialDate, setTaskModalInitialDate] = useState<string | undefined>();
  const [taskToEdit, setTaskToEdit] = useState<OperationalTask | null>(null);

  const {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskCompletion,
    getTasksForDate
  } = useOperationalTasks();

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Map inventory items by expiration date (YYYY-MM-DD)
  const itemsByDateMap = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const item of items) {
      // Find date field: FECHA_VC, FECHA_RETIRO, or any date field
      const rawDate = item.FECHA_VC || item.FECHA_RETIRO || item.FECHA || item.fecha_vc || item.fecha_retiro;
      if (!rawDate) continue;

      const parsed = parseAnyDate(rawDate);
      if (parsed) {
        const yearStr = parsed.getFullYear();
        const monthStr = String(parsed.getMonth() + 1).padStart(2, '0');
        const dayStr = String(parsed.getDate()).padStart(2, '0');
        const dateKey = `${yearStr}-${monthStr}-${dayStr}`;

        const existing = map.get(dateKey) || [];
        existing.push(item);
        map.set(dateKey, existing);
      }
    }
    return map;
  }, [items]);

  // Calendar Grid Generation
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    // Day of week for 1st of month: 0=Sun, 1=Mon... convert to 0=Mon, 6=Sun
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = lastDayOfMonth.getDate();

    const todayStr = new Date().toISOString().slice(0, 10);
    const cells = [];

    // Previous month padding
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevDate = new Date(currentYear, currentMonth - 1, dayNum);
      const dateStr = prevDate.toISOString().slice(0, 10);
      cells.push({
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr
      });
    }

    // Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const yearStr = currentYear;
      const monthStr = String(currentMonth + 1).padStart(2, '0');
      const dStr = String(dayNum).padStart(2, '0');
      const dateStr = `${yearStr}-${monthStr}-${dStr}`;

      cells.push({
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: true,
        isToday: dateStr === todayStr
      });
    }

    // Next month padding to complete 35 or 42 cells
    const totalCells = cells.length > 35 ? 42 : 35;
    const remaining = totalCells - cells.length;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const nextDate = new Date(currentYear, currentMonth + 1, dayNum);
      const dateStr = nextDate.toISOString().slice(0, 10);
      cells.push({
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr
      });
    }

    return cells;
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setSelectedDayStr(new Date().toISOString().slice(0, 10));
  };

  const openNewTaskModal = (dateStr?: string) => {
    setTaskToEdit(null);
    setTaskModalInitialDate(dateStr || new Date().toISOString().slice(0, 10));
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task: OperationalTask) => {
    setTaskToEdit(task);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = (taskData: Omit<OperationalTask, 'id' | 'createdAt' | 'completed'>) => {
    if (taskToEdit) {
      updateTask({
        ...taskToEdit,
        ...taskData
      });
    } else {
      addTask(taskData);
    }
  };

  // Selected Day Details Data
  const selectedDayItems = selectedDayStr ? (itemsByDateMap.get(selectedDayStr) || []) : [];
  const selectedDayTasks = selectedDayStr ? getTasksForDate(selectedDayStr) : [];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
      
      {/* HEADER BAR */}
      <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
        
        {/* Month Navigation */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all cursor-pointer"
              title="Mes Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-extrabold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-xl transition-all cursor-pointer"
            >
              Hoy
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all cursor-pointer"
              title="Mes Siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <h2 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {MONTH_NAMES[currentMonth]} {currentYear}
          </h2>
        </div>

        {/* View Controls & Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Expiration Toggle */}
          <button
            onClick={() => setShowExpirations(!showExpirations)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
              showExpirations
                ? 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Vencimientos ({items.length})
          </button>

          {/* Tasks Toggle */}
          <button
            onClick={() => setShowTasks(!showTasks)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
              showTasks
                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Rutinas & Tareas ({tasks.length})
          </button>

          {/* Add Task Button */}
          <button
            onClick={() => openNewTaskModal()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ml-auto sm:ml-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva Tarea Operativa</span>
            <span className="sm:hidden">Tarea</span>
          </button>

        </div>

      </div>

      {/* CALENDAR BODY + DAY DETAIL PANEL */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        
        {/* CALENDAR GRID CONTAINER */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-3 sm:p-5">
          
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1.5 mb-2 text-center">
            {WEEKDAY_NAMES.map(day => (
              <div key={day} className="py-1.5 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {day}
              </div>
            ))}
          </div>

          {/* Month Cells Grid */}
          <div className="grid grid-cols-7 gap-1.5 flex-1 min-h-[480px]">
            {calendarCells.map((cell) => {
              const dayItems = showExpirations ? (itemsByDateMap.get(cell.dateStr) || []) : [];
              const dayTasks = showTasks ? getTasksForDate(cell.dateStr) : [];
              const isSelected = selectedDayStr === cell.dateStr;

              const criticalCount = dayItems.filter(i => {
                const st = getItemStatus(i, headers);
                return st.code === 'EXPIRED' || st.code === 'RETIRE_NOW';
              }).length;

              const pendingTasksCount = dayTasks.filter(t => !t.completed).length;

              return (
                <div
                  key={cell.dateStr}
                  onClick={() => setSelectedDayStr(cell.dateStr)}
                  className={`min-h-[85px] sm:min-h-[105px] p-1.5 sm:p-2 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                    isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                      : cell.isToday
                        ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80'
                        : cell.isCurrentMonth
                          ? 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-2xs'
                          : 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800/50 opacity-40'
                  }`}
                >
                  {/* Cell Top Bar */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black px-1.5 py-0.5 rounded-lg ${
                      cell.isToday
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : cell.isCurrentMonth
                          ? 'text-slate-800 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-600'
                    }`}>
                      {cell.dayNumber}
                    </span>

                    {/* Indicator Dots */}
                    <div className="flex items-center gap-1">
                      {criticalCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title={`${criticalCount} Críticos`} />
                      )}
                      {pendingTasksCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-blue-500" title={`${pendingTasksCount} Tareas`} />
                      )}
                    </div>
                  </div>

                  {/* Cell Content Summary Badges */}
                  <div className="flex flex-col gap-1 my-1 overflow-hidden">
                    
                    {/* Inventory Items Badge */}
                    {dayItems.length > 0 && (
                      <div className={`px-1.5 py-0.5 rounded-lg text-[10px] font-extrabold truncate flex items-center justify-between ${
                        criticalCount > 0
                          ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                          : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}>
                        <span className="truncate">📦 {dayItems.length} vto(s)</span>
                      </div>
                    )}

                    {/* Operational Tasks Badges */}
                    {dayTasks.slice(0, 2).map((task) => (
                      <div
                        key={task.id}
                        className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold truncate border flex items-center gap-1 ${
                          task.completed
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 line-through border-slate-200 dark:border-slate-700'
                            : CATEGORY_BADGES[task.category].color
                        }`}
                      >
                        <span className="truncate">{task.completed ? '✓ ' : ''}{task.title}</span>
                      </div>
                    ))}

                    {dayTasks.length > 2 && (
                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 pl-1">
                        +{dayTasks.length - 2} rutina(s)
                      </span>
                    )}

                  </div>

                  {/* Bottom Hover Hint */}
                  <div className="text-[9px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity text-right">
                    Ver detalle →
                  </div>

                </div>
              );
            })}
          </div>

        </div>

        {/* DAY DETAIL SIDE PANEL */}
        {selectedDayStr ? (
          <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col min-h-0 animate-in slide-in-from-right-5 duration-200">
            
            {/* Side Panel Header */}
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Detalle del Día
                </span>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm">
                  {new Date(`${selectedDayStr}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDayStr(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Side Panel Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
              
              {/* SECTION A: INVENTORY EXPIRATIONS */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-500" />
                    Vencimientos / Retiros ({selectedDayItems.length})
                  </h4>
                </div>

                {selectedDayItems.length === 0 ? (
                  <div className="p-3 text-center rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-400">
                    Sin vencimientos ni retiros programados para esta fecha.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedDayItems.map((item, idx) => {
                      const status = getItemStatus(item, headers);
                      const sku = item.SKU || item.sku || 'N/A';
                      const desc = item.DESCRIPCION || item.descripcion || 'Producto sin descripción';
                      const cant = item.CANTIDAD || item.cantidad || item.STOCK || '0';

                      return (
                        <div
                          key={idx}
                          onClick={() => onSelectItem?.(item)}
                          className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 transition-all cursor-pointer shadow-2xs group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                              {sku}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              status.code === 'EXPIRED' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' :
                              status.code === 'RETIRE_NOW' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                              'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}>
                              {status.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-1 font-medium">
                            {desc}
                          </p>
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                            <span>Cantidad: <strong className="text-slate-800 dark:text-slate-200">{cant}</strong></span>
                            <span className="text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">Ver en Drawer →</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION B: OPERATIONAL TASKS */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    Rutinas & Tareas Operativas ({selectedDayTasks.length})
                  </h4>
                  <button
                    onClick={() => openNewTaskModal(selectedDayStr)}
                    className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>

                {selectedDayTasks.length === 0 ? (
                  <div className="p-4 text-center rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex flex-col items-center gap-2">
                    <Clock className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                    <p className="text-xs text-slate-400 font-medium">No hay tareas o rutinas de bodega agendadas.</p>
                    <button
                      onClick={() => openNewTaskModal(selectedDayStr)}
                      className="mt-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold border border-blue-200 dark:border-blue-800"
                    >
                      + Agendar Rutina
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedDayTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-3 rounded-2xl border transition-all flex flex-col gap-2 ${
                          task.completed
                            ? 'bg-slate-100/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60'
                            : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={() => toggleTaskCompletion(task.id, selectedDayStr)}
                            className="mt-0.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer shrink-0"
                            title={task.completed ? "Marcar pendiente" : "Marcar completada"}
                          >
                            {task.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${CATEGORY_BADGES[task.category].color}`}>
                                {CATEGORY_BADGES[task.category].label}
                              </span>
                              {task.isRecurring && (
                                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded-md">
                                  ↻ Recurrente
                                </span>
                              )}
                            </div>
                            
                            <h5 className={`text-xs font-bold mt-1 ${task.completed ? 'line-through text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                              {task.title}
                            </h5>

                            {task.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                {task.description}
                              </p>
                            )}

                            {task.assignedTo && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                                <User className="w-3 h-3" /> {task.assignedTo}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEditTaskModal(task)}
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                              title="Editar"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>
        ) : (
          <div className="hidden lg:flex w-72 border-l border-slate-200/80 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 p-6 flex-col items-center justify-center text-center text-slate-400">
            <CalendarIcon className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Selecciona un día en la grilla</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Verás el desglose de productos por vencer y las rutinas agendadas.
            </p>
          </div>
        )}

      </div>

      {/* OPERATIONAL TASK MODAL */}
      <OperationalTaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        initialDate={taskModalInitialDate}
        taskToEdit={taskToEdit}
      />

    </div>
  );
};
