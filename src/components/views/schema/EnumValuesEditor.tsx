import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, ArrowUp, ArrowDown, ListPlus, Check, 
  FileText, Sparkles, X, AlignLeft, Eye, HelpCircle
} from 'lucide-react';
import { 
  EnumOption, parseEnumOptions, serializeEnumOptions, ENUM_COLOR_MAP 
} from '../../../utils/enumColorHelper';

interface EnumValuesEditorProps {
  options: string;
  onChange: (newOptionsString: string) => void;
  isEnumList?: boolean;
}

export const EnumValuesEditor: React.FC<EnumValuesEditorProps> = ({
  options = '',
  onChange,
  isEnumList = false
}) => {
  // Mode toggle: 'list' (interactive rows with + Add) vs 'raw' (comma-separated textarea)
  const [mode, setMode] = useState<'list' | 'raw'>('list');
  const [rawText, setRawText] = useState<string>(options || '');
  
  const [items, setItems] = useState<EnumOption[]>(() => parseEnumOptions(options));
  const lastInputRef = useRef<HTMLInputElement | null>(null);
  const [justAddedIndex, setJustAddedIndex] = useState<number | null>(null);

  // Sync with external options change if different
  useEffect(() => {
    const parsed = parseEnumOptions(options);
    const serializedParsed = serializeEnumOptions(parsed);
    const serializedCurrent = serializeEnumOptions(items);
    if (serializedParsed !== serializedCurrent) {
      setItems(parsed);
      setRawText(options);
    }
  }, [options]);

  // Focus newly added input
  useEffect(() => {
    if (justAddedIndex !== null && lastInputRef.current) {
      lastInputRef.current.focus();
      lastInputRef.current.select();
      setJustAddedIndex(null);
    }
  }, [justAddedIndex, items.length]);

  // Propagate changes to parent
  const commitItems = (newItems: EnumOption[]) => {
    setItems(newItems);
    const serialized = serializeEnumOptions(newItems);
    setRawText(serialized);
    onChange(serialized);
  };

  // Update a single item value
  const handleItemChange = (index: number, val: string) => {
    // If the user pastes text with commas or newlines, split automatically
    if (val.includes(',') || val.includes('\n')) {
      const parts = val.split(/[,\n]/).map(p => p.trim()).filter(Boolean);
      const newOpts = parts.map(p => ({ value: p }));
      const updated = [...items];
      updated.splice(index, 1, ...newOpts);
      commitItems(updated);
      return;
    }

    const updated = [...items];
    updated[index] = { ...updated[index], value: val };
    commitItems(updated);
  };

  // Update item color
  const handleItemColorChange = (index: number, color: string | undefined) => {
    const updated = [...items];
    updated[index] = { ...updated[index], color: color || undefined };
    commitItems(updated);
  };

  // Add a new empty item row
  const handleAddItem = () => {
    const updated = [...items, { value: '' }];
    commitItems(updated);
    setJustAddedIndex(updated.length - 1);
  };

  // Remove an item row
  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    commitItems(updated);
  };

  // Move item up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...items];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    commitItems(updated);
  };

  // Move item down
  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const updated = [...items];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    commitItems(updated);
  };

  // Handle keydown in item inputs (Enter to add next, Backspace on empty to delete)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    } else if (e.key === 'Backspace' && items[index]?.value === '' && items.length > 1) {
      e.preventDefault();
      handleRemoveItem(index);
    }
  };

  // Apply raw text changes
  const handleRawTextChange = (val: string) => {
    setRawText(val);
    const parsed = parseEnumOptions(val);
    setItems(parsed);
    onChange(val);
  };

  // Common quick template suggestions
  const QUICK_TEMPLATES = [
    { label: 'Estados Operativos', values: ['PENDIENTE', 'EN PROCESO', 'REALIZADO', 'CANCELADO'] },
    { label: 'Sí / No', values: ['SI', 'NO'] },
    { label: 'Prioridades', values: ['ALTA', 'MEDIA', 'BAJA'] },
    { label: 'Categorías FRC', values: ['TRANSPORTE', 'DIFERENCIAS', 'MERMAS', 'CALIDAD'] }
  ];

  const applyTemplate = (templateValues: string[]) => {
    commitItems(templateValues.map(v => ({ value: v })));
  };

  return (
    <div className="w-full bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 space-y-3.5">
      
      {/* Header with Title and Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Valores Permitidos ({isEnumList ? 'EnumList - Múltiple' : 'Enum - Simple'})
            </span>
            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
              {items.filter(o => o.value).length} valores
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Define las opciones que el usuario podrá seleccionar en los formularios.
          </p>
        </div>

        {/* Mode Toggle (Lista + Add vs Texto CSV) */}
        <div className="flex items-center bg-white dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => setMode('list')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              mode === 'list'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ListPlus className="w-3.5 h-3.5" />
            <span>Lista (+ Add)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('raw')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              mode === 'raw'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <AlignLeft className="w-3.5 h-3.5" />
            <span>Texto Rápido</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Interactive AppSheet-style List with + Add rows */}
      {mode === 'list' ? (
        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="p-6 text-center bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-500 dark:text-slate-400">
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                No hay opciones agregadas todavía.
              </p>
              <p className="text-[11px] text-slate-400 mb-3">
                Haz clic en <strong>+ Add (Agregar Valor)</strong> o selecciona una plantilla rápida abajo.
              </p>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Primer Valor</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {items.map((item, index) => {
                const isLast = index === items.length - 1;
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xs hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
                  >
                    {/* Index Sequence Badge */}
                    <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-mono text-[10px] font-black flex items-center justify-center shrink-0">
                      {index + 1}
                    </div>

                    {/* Value Input Box */}
                    <input
                      ref={isLast ? lastInputRef : null}
                      type="text"
                      value={item.value}
                      onChange={(e) => handleItemChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      placeholder={`Opción #${index + 1} (ej. PENDIENTE)...`}
                      className="flex-1 bg-transparent px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none placeholder-slate-400 min-w-0"
                    />

                    {/* Beautiful Native-styled Color Dropdown Pill */}
                    <select
                      value={item.color || ''}
                      onChange={(e) => handleItemColorChange(index, e.target.value || undefined)}
                      className={`text-[11px] font-black px-2 py-1 rounded-lg border outline-none cursor-pointer transition-colors shrink-0 max-w-[120px] ${
                        item.color && ENUM_COLOR_MAP[item.color]
                          ? ENUM_COLOR_MAP[item.color].badge
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      }`}
                      title="Asignar color a este valor de Enum"
                    >
                      <option value="" className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-200 font-semibold">Sin Color</option>
                      <option value="slate" className="bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">Slate / Gris</option>
                      <option value="red" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200">Rojo</option>
                      <option value="orange" className="bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-200">Naranja</option>
                      <option value="amber" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200">Ámbar</option>
                      <option value="yellow" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">Amarillo</option>
                      <option value="green" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-200">Verde</option>
                      <option value="emerald" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">Esmeralda</option>
                      <option value="teal" className="bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200">Teal</option>
                      <option value="blue" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">Azul</option>
                      <option value="indigo" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">Índigo</option>
                      <option value="purple" className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-200">Púrpura</option>
                      <option value="pink" className="bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-200">Rosa</option>
                    </select>

                    {/* Action Controls: Move Up, Move Down, Delete */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                        title="Subir posición"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === items.length - 1}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                        title="Bajar posición"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer transition-colors"
                        title="Eliminar opción"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Option Button (AppSheet-Style "+ Add") */}
          <div className="pt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleAddItem}
              className="px-4 py-2 text-xs font-bold bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add (Agregar Opción)</span>
            </button>

            <span className="text-[10px] text-slate-400 italic">
              Tip: Presiona <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono font-bold text-[9px]">Enter</kbd> para agregar la siguiente opción.
            </span>
          </div>
        </div>
      ) : (
        /* Mode 2: Quick CSV / Multiline Textarea */
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Ingresa o pega las opciones (pueden usar opcionalmente el formato Valor::color, ej. SI::green, NO::red):
          </label>
          <textarea
            rows={4}
            value={rawText}
            onChange={(e) => handleRawTextChange(e.target.value)}
            placeholder="PENDIENTE::amber, EN PROCESO::blue, REALIZADO::emerald"
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 leading-relaxed"
          />
          <p className="text-[10px] text-slate-400">
            Puedes copiar y pegar listas completas desde Excel, Google Sheets o texto plano.
          </p>
        </div>
      )}

      {/* Quick Templates Bar */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Plantillas Rápidas:
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TEMPLATES.map((tmpl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => applyTemplate(tmpl.values)}
              className="px-2.5 py-1 text-[11px] font-medium bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition-colors cursor-pointer shadow-2xs"
            >
              {tmpl.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Form Preview of Enum Chips with Custom Colors */}
      {items.filter(o => o.value).length > 0 && (
        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Vista Previa en Formulario:
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
            {items.filter(o => o.value).map((opt, i) => {
              const style = opt.color && ENUM_COLOR_MAP[opt.color]
                ? ENUM_COLOR_MAP[opt.color].badge
                : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
              return (
                <span
                  key={i}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${style}`}
                >
                  {opt.value}
                </span>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
