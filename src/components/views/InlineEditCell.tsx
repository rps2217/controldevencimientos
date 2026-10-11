import React, { useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';

interface InlineEditCellProps {
  value: string;
  onSave: (newValue: string) => void;
  type?: 'text' | 'number' | 'date';
}

export const InlineEditCell: React.FC<InlineEditCellProps> = ({ value, onSave, type = 'text' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  if (!isEditing) {
    return (
      <div 
        className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 p-1 rounded"
        onClick={() => setIsEditing(true)}
      >
        {value || <span className="text-slate-400 italic">Vacío</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type={type}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(tempValue);
            setIsEditing(false);
          } else if (e.key === 'Escape') {
            setTempValue(value);
            setIsEditing(false);
          }
        }}
        className="w-full px-2 py-1 rounded border border-blue-500 text-xs focus:outline-none"
      />
      <button onClick={() => { onSave(tempValue); setIsEditing(false); }} className="text-emerald-600"><Check size={14} /></button>
      <button onClick={() => { setTempValue(value); setIsEditing(false); }} className="text-red-600"><X size={14} /></button>
    </div>
  );
};
