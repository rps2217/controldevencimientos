import { useState, useEffect, useCallback } from 'react';
import { OperationalTask } from '../types/calendar';

const STORAGE_KEY = 'appsheet_operational_tasks';
const COMPLETED_DATES_KEY = 'appsheet_operational_tasks_completed_dates';

// Default initial tasks for demo/testing
const DEFAULT_INITIAL_TASKS: OperationalTask[] = [
  {
    id: 'task-demo-1',
    title: 'Auditoría mensual de mermas y averías',
    description: 'Revisión y cuadratura de productos dados de baja en bodega principal',
    date: new Date(new Date().getFullYear(), new Date().getMonth(), 5).toISOString().slice(0, 10),
    category: 'AUDITORIA',
    isRecurring: true,
    recurrenceRule: 'MONTHLY_DATE',
    recurrenceDay: 5,
    completed: false,
    assignedTo: 'Jefe de Bodega',
    createdAt: new Date().toISOString()
  },
  {
    id: 'task-demo-2',
    title: 'Revisión de cámaras de frío y temperaturas',
    description: 'Verificación de sensores e informe de temperatura semanal',
    date: new Date(new Date().getFullYear(), new Date().getMonth(), 12).toISOString().slice(0, 10),
    category: 'REVISION',
    isRecurring: true,
    recurrenceRule: 'MONTHLY_DATE',
    recurrenceDay: 12,
    completed: false,
    assignedTo: 'Control de Calidad',
    createdAt: new Date().toISOString()
  },
  {
    id: 'task-demo-3',
    title: 'Cierre de inventario rotativo mensual',
    description: 'Conteo físico de SKUs clase A y consolidación con ERP',
    date: new Date(new Date().getFullYear(), new Date().getMonth(), 25).toISOString().slice(0, 10),
    category: 'ROTATIVO',
    isRecurring: true,
    recurrenceRule: 'MONTHLY_DATE',
    recurrenceDay: 25,
    completed: false,
    assignedTo: 'Equipo de Inventario',
    createdAt: new Date().toISOString()
  }
];

export function useOperationalTasks() {
  const [tasks, setTasks] = useState<OperationalTask[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return DEFAULT_INITIAL_TASKS;
  });

  const [completedDates, setCompletedDates] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(COMPLETED_DATES_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(COMPLETED_DATES_KEY, JSON.stringify(completedDates));
    } catch {
      // ignore
    }
  }, [completedDates]);

  const addTask = useCallback((newTask: Omit<OperationalTask, 'id' | 'createdAt' | 'completed'>) => {
    const created: OperationalTask = {
      ...newTask,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      completed: false,
      createdAt: new Date().toISOString()
    };
    setTasks(prev => [...prev, created]);
    return created;
  }, []);

  const updateTask = useCallback((updatedTask: OperationalTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const toggleTaskCompletion = useCallback((taskId: string, targetDateStr: string) => {
    setCompletedDates(prev => {
      const key = `${taskId}_${targetDateStr}`;
      const newStatus = !prev[key];
      return {
        ...prev,
        [key]: newStatus
      };
    });

    setTasks(prev => prev.map(t => {
      if (t.id === taskId && t.date === targetDateStr) {
        return {
          ...t,
          completed: !t.completed,
          completedAt: !t.completed ? new Date().toISOString() : undefined
        };
      }
      return t;
    }));
  }, []);

  /**
   * Generates tasks applicable to a specific date string (YYYY-MM-DD)
   * taking recurring rules into account.
   */
  const getTasksForDate = useCallback((dateStr: string): OperationalTask[] => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const targetDate = new Date(year, month - 1, day);
    const dayOfWeek = targetDate.getDay(); // 0 = Sun, 1 = Mon ...

    const result: OperationalTask[] = [];

    for (const task of tasks) {
      const completionKey = `${task.id}_${dateStr}`;
      const isCompletedOnDate = completedDates[completionKey] ?? (task.date === dateStr ? task.completed : false);

      if (task.date === dateStr) {
        result.push({
          ...task,
          completed: isCompletedOnDate
        });
      } else if (task.isRecurring) {
        let matches = false;

        if (task.recurrenceRule === 'MONTHLY_DATE' && task.recurrenceDay === day) {
          matches = true;
        } else if (task.recurrenceRule === 'WEEKLY' && task.recurrenceDay === dayOfWeek) {
          matches = true;
        }

        if (matches) {
          result.push({
            ...task,
            date: dateStr,
            completed: isCompletedOnDate
          });
        }
      }
    }

    return result;
  }, [tasks, completedDates]);

  return {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskCompletion,
    getTasksForDate
  };
}
