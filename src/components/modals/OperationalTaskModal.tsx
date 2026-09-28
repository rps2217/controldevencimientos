import React, { useState, useEffect } from 'react';
import { X, Calendar, Repeat, Sparkles } from 'lucide-react';
import { OperationalTask, OperationalTaskCategory, RecurrenceRule } from '../../types/calendar';

interface OperationalTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<OperationalTask, 'id' | 'createdAt' | 'completed'>) => void;
  initialDate?: string;
  taskToEdit?: OperationalTask | null;
}

const CATEGORIES: { id: OperationalTaskCategory; label: string; color: string }[] = [
  { id: 'ROTATIVO', label: 'Inventario Rotativo', color: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  { id: 'AUDITORIA', label: 'Auditoría & Mermas', color: 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  { id: 'PROVEEDOR', label: 'Gestión Proveedores', color: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  { id: 'REVISION', label: 'Control & Revisión', color: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  { id: 'OTRO', label: 'Otra Rutina', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
];

export const OperationalTaskModal: React.FC<OperationalTaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialDate,
  taskToEdit
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<OperationalTaskCategory>('ROTATIVO');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>('MONTHLY_DATE');

  useEffect(() => {
    if (isOpen) {
      if (taskToEdit) {
        setTitle(taskToEdit.title);
        setCategory(taskToEdit.category);
        setDate(taskToEdit.date);
        setDescription(taskToEdit.description || '');
        setAssignedTo(taskToEdit.assignedTo || '');
        setIsRecurring(taskToEdit.isRecurring);
        setRecurrenceRule(taskToEdit.recurrenceRule || 'MONTHLY_DATE');
      } else {
        setTitle('');
        setCategory('ROTATIVO');
        setDate(initialDate || new Date().toISOString().slice(0, 10));
        setDescription('');
        setAssignedTo('');
        setIsRecurring(false);
        setRecurrenceRule('MONTHLY_DATE');
      }
    }
  }, [isOpen, initialDate, taskToEdit]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;

    const dayNum = Number(date.split('-')[2]);

    onSave({
      title: title.trim(),
      category,
      date,
      description: description.trim() || undefined,
      assignedTo: assignedTo.trim() || undefined,
      isRecurring,
      recurrenceRule: isRecurring ? recurrenceRule : 'NONE',
      recurrenceDay: isRecurring ? (recurrenceRule === 'MONTHLY_DATE' ? dayNum : new Date(date).getDay()) : undefined
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base">
                {taskToEdit ? 'Editar Tarea Operativa' : 'Nueva Tarea u Operación Recurrente'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Agenda eventos de gestión interna y rutinas de bodega
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[80vh]">
          
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Título de la Tarea / Evento <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Auditoría de mermas, Cierre rotativo, Revisión de stock..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Categoría Operativa
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    category === cat.id
                      ? `${cat.color} ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900`
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Assigned To */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Fecha del Evento <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Responsable (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Jefe de Bodega, Equipo..."
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Recurrence Toggle */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Repetir periódicamente (Tarea Recurrente)
                </span>
              </div>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded-md focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {isRecurring && (
              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center gap-3 animate-in fade-in">
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Frecuencia:</span>
                <select
                  value={recurrenceRule}
                  onChange={(e) => setRecurrenceRule(e.target.value as RecurrenceRule)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold"
                >
                  <option value="MONTHLY_DATE">Todos los meses el día {date ? date.split('-')[2] : '1'}</option>
                  <option value="WEEKLY">Todas las semanas el mismo día</option>
                </select>
              </div>
            )}
          </div>

          {/* Description / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Observaciones / Instrucciones
            </label>
            <textarea
              rows={3}
              placeholder="Detalles adicionales para la ejecución de la tarea..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="mt-2 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {taskToEdit ? 'Guardar Cambios' : 'Agendar Tarea'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
