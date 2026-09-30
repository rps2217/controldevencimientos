import React from 'react';
import { SliceColor } from '../../../types';
import { Tag, Sparkles } from 'lucide-react';
import { SliceIcon } from '../../slices/SliceSelectorBar';

interface SliceGeneralTabProps {
  name: string;
  setName: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  icon: string;
  setIcon: (val: string) => void;
  color: SliceColor;
  setColor: (val: SliceColor) => void;
  availableIcons: string[];
  availableColors: SliceColor[];
  errors: { name?: string };
  filterSummary: string[];
}

export const SliceGeneralTab: React.FC<SliceGeneralTabProps> = ({
  name,
  setName,
  description,
  setDescription,
  icon,
  setIcon,
  color,
  setColor,
  availableIcons,
  availableColors,
  errors,
  filterSummary
}) => {
  return (
    <div className="space-y-4">
      {/* Captured filters summary pill */}
      {filterSummary.length > 0 && (
        <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 rounded-2xl space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-300">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span>Filtros y criterios capturados de la tabla actual:</span>
          </div>
          <ul className="text-xs text-blue-800/90 dark:text-blue-200/90 space-y-0.5 pl-5 list-disc">
            {filterSummary.map((sum, i) => (
              <li key={i}>{sum}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Name Input */}
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
          Nombre de la Vista <span className="text-rose-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Mermas del Mes, Proveedor X, Retiro Urgente..."
          className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none transition-all ${
            errors.name 
              ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
              : 'border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
          }`}
        />
        {errors.name && (
          <p className="text-xs text-rose-500 font-semibold mt-1">
            {errors.name}
          </p>
        )}
      </div>

      {/* Description Input */}
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
          Descripción Opcional
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Breve nota explicativa sobre qué muestra esta vista..."
          className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-all"
        />
      </div>

      {/* Icon Picker */}
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">
          Icono Representativo
        </label>
        <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
          {availableIcons.map(iconName => {
            const isSelected = icon === iconName;
            return (
              <button
                key={iconName}
                type="button"
                onClick={() => setIcon(iconName)}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  isSelected 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-xs font-bold' 
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <SliceIcon iconName={iconName} className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Color Picker */}
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">
          Color del Distintivo (Badge)
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {availableColors.map(c => {
            const isSelected = color === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold capitalize transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected 
                    ? 'border-slate-900 dark:border-slate-100 shadow-xs scale-105' 
                    : 'border-slate-200 dark:border-slate-700 hover:opacity-80'
                }`}
              >
                <span className={`w-3 h-3 rounded-full ${
                  c === 'blue' ? 'bg-blue-500' :
                  c === 'rose' ? 'bg-rose-500' :
                  c === 'amber' ? 'bg-amber-500' :
                  c === 'emerald' ? 'bg-emerald-500' :
                  c === 'purple' ? 'bg-purple-500' :
                  c === 'indigo' ? 'bg-indigo-500' : 'bg-slate-500'
                }`} />
                <span>{c}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
