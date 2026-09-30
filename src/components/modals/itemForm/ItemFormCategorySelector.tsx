import React from 'react';
import { Info } from 'lucide-react';
import { EventCategory } from '../../../types';
import { EVENT_CATEGORIES, renderEventIcon } from '../../../utils/dateCalculations';

interface ItemFormCategorySelectorProps {
  selectedEventCategory: EventCategory;
  onSelectEventCategory: (category: EventCategory) => void;
}

export const ItemFormCategorySelector: React.FC<ItemFormCategorySelectorProps> = ({
  selectedEventCategory,
  onSelectEventCategory
}) => {
  const categoryDef = EVENT_CATEGORIES[selectedEventCategory] || EVENT_CATEGORIES.VENCIMIENTO;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
          Tipo de Registro / Evento:
        </label>
        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
          Adapta campos (Show_If)
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(Object.keys(EVENT_CATEGORIES) as EventCategory[]).map(catKey => {
          const cat = EVENT_CATEGORIES[catKey];
          const isSelected = selectedEventCategory === catKey;
          return (
            <button
              key={catKey}
              type="button"
              onClick={() => onSelectEventCategory(catKey)}
              className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                isSelected 
                  ? `${cat.cardBorder} bg-white dark:bg-slate-800 shadow-xs` 
                  : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className={`p-1 rounded-lg ${cat.iconBg} shrink-0`}>
                {renderEventIcon(catKey, 'w-3.5 h-3.5')}
              </div>
              <div className="overflow-hidden min-w-0">
                <span className={`text-[11px] font-bold block truncate ${isSelected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>
                  {cat.shortLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2.5 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        <span>{categoryDef.description}</span>
      </p>
    </div>
  );
};
