import React, { useState } from 'react';
import { 
  X, 
  Paintbrush, 
  Plus, 
  Trash2, 
  Edit2, 
  RotateCcw, 
  Check, 
  AlertCircle, 
  Sparkles, 
  Eye,
  Sliders,
  Layers,
  ArrowRight
} from 'lucide-react';
import { FormatRule, FormatRuleOperator, SheetConfig } from '../../types';
import { 
  DEFAULT_BUILT_IN_FORMAT_RULES, 
  AVAILABLE_FORMAT_RULE_ICONS, 
  renderFormatRuleIcon,
  saveStoredFormatRules
} from '../../utils/formatRulesEngine';

interface FormatRulesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  formatRules: FormatRule[];
  onSaveRules: (rules: FormatRule[]) => void;
  headers: string[];
  currentTableKey: string;
}

const COLOR_PRESETS = [
  { label: 'Rojo Carmesí', text: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
  { label: 'Ámbar Alerta', text: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  { label: 'Azul Comercial', text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  { label: 'Esmeralda Aprobado', text: '#047857', bg: '#d1fae5', border: '#6ee7b7' },
  { label: 'Púrpura Especial', text: '#6d28d9', bg: '#f3e8ff', border: '#d8b4fe' },
  { label: 'Rosa Peligro', text: '#be123c', bg: '#fff1f2', border: '#fecdd3' },
  { label: 'Gris Neutro', text: '#334155', bg: '#f1f5f9', border: '#cbd5e1' }
];

export const FormatRulesManagerModal: React.FC<FormatRulesManagerModalProps> = ({
  isOpen,
  onClose,
  formatRules,
  onSaveRules,
  headers,
  currentTableKey
}) => {
  const [rules, setRules] = useState<FormatRule[]>(formatRules);
  const [editingRule, setEditingRule] = useState<FormatRule | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'editor'>('list');

  // Sync when prop changes
  React.useEffect(() => {
    setRules(formatRules);
  }, [formatRules]);

  if (!isOpen) return null;

  const handleToggleRule = (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(updated);
    onSaveRules(updated);
    saveStoredFormatRules(updated);
  };

  const handleDeleteRule = (id: string) => {
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    onSaveRules(updated);
    saveStoredFormatRules(updated);
    if (editingRule?.id === id) {
      setEditingRule(null);
      setActiveTab('list');
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('¿Deseas restablecer las reglas de formato a las plantillas estándar de AppSheet?')) {
      setRules(DEFAULT_BUILT_IN_FORMAT_RULES);
      onSaveRules(DEFAULT_BUILT_IN_FORMAT_RULES);
      saveStoredFormatRules(DEFAULT_BUILT_IN_FORMAT_RULES);
      setActiveTab('list');
      setEditingRule(null);
    }
  };

  const handleCreateNew = () => {
    const newRule: FormatRule = {
      id: `rule_custom_${Date.now()}`,
      name: 'Nueva Regla de Formato',
      enabled: true,
      tableKey: '*',
      columns: ['_row'],
      condition: {
        column: 'DIAS_PARA_VENCER',
        operator: 'less_equal',
        value: '7'
      },
      textColor: '#991b1b',
      backgroundColor: '#fee2e2',
      bold: true,
      icon: 'AlertTriangle',
      badge: true
    };
    setEditingRule(newRule);
    setActiveTab('editor');
  };

  const handleStartEdit = (rule: FormatRule) => {
    setEditingRule({ ...rule });
    setActiveTab('editor');
  };

  const handleSaveEditingRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    let updated: FormatRule[];
    const exists = rules.some(r => r.id === editingRule.id);
    if (exists) {
      updated = rules.map(r => r.id === editingRule.id ? editingRule : r);
    } else {
      updated = [...rules, editingRule];
    }

    setRules(updated);
    onSaveRules(updated);
    saveStoredFormatRules(updated);
    setEditingRule(null);
    setActiveTab('list');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Paintbrush className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Format Rules Declarativas</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold uppercase">
                  AppSheet Style
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Formato condicional inteligente para resaltar lotes, mermas y estados sin tocar código.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 text-xs font-bold">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                activeTab === 'list'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Reglas Activas ({rules.length})
            </button>
            <button
              onClick={handleCreateNew}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all ${
                activeTab === 'editor' && editingRule
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{editingRule && activeTab === 'editor' ? 'Editando Regla' : 'Nueva Regla'}</span>
            </button>
          </div>

          {activeTab === 'list' && (
            <button
              onClick={handleResetDefaults}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 font-normal"
              title="Restablecer a las 5 reglas de fábrica"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restablecer Fábrica</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'list' ? (
            <div className="space-y-3">
              {rules.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Paintbrush className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay reglas de formato definidas.</p>
                  <button
                    onClick={handleCreateNew}
                    className="mt-3 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-indigo-700"
                  >
                    Crear Primera Regla
                  </button>
                </div>
              ) : (
                rules.map((rule) => {
                  const hasIcon = Boolean(rule.icon);
                  return (
                    <div
                      key={rule.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        rule.enabled
                          ? 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 shadow-2xs'
                          : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Left: Toggle & Info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => handleToggleRule(rule.id)}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                {rule.name}
                              </span>
                              {rule.tableKey && rule.tableKey !== '*' && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 font-mono text-slate-600 dark:text-slate-300">
                                  {rule.tableKey}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <span>Condición:</span>
                              <span className="font-mono text-slate-600 dark:text-slate-300">
                                [{rule.condition.column}] {rule.condition.operator} "{rule.condition.value}"
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Style Preview & Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Mini Sample Preview Badge */}
                          <div
                            style={{
                              backgroundColor: rule.backgroundColor || '#f1f5f9',
                              color: rule.textColor || '#1e293b',
                              fontWeight: rule.bold ? 700 : 400,
                              fontStyle: rule.italic ? 'italic' : 'normal'
                            }}
                            className="px-2 py-0.5 rounded-lg text-xs flex items-center gap-1 border border-black/5"
                          >
                            {hasIcon && renderFormatRuleIcon(rule.icon, 'w-3 h-3')}
                            <span>Ejemplo</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleStartEdit(rule)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            title="Editar regla"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            title="Eliminar regla"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : editingRule ? (
            <form onSubmit={handleSaveEditingRule} className="space-y-4 text-xs">
              {/* Rule Name */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre descriptivo de la Regla
                </label>
                <input
                  type="text"
                  required
                  value={editingRule.name}
                  onChange={e => setEditingRule({ ...editingRule, name: e.target.value })}
                  placeholder="Ej: Lotes de Merma Directa o Días <= 7"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
              </div>

              {/* Scope & Target Columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ámbito de Tabla
                  </label>
                  <select
                    value={editingRule.tableKey || '*'}
                    onChange={e => setEditingRule({ ...editingRule, tableKey: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  >
                    <option value="*">Todas las tablas (*)</option>
                    <option value="main">Vencimientos (main)</option>
                    <option value="events">Incidencias y FRC (events)</option>
                    <option value="products">Catálogo Maestro (products)</option>
                    <option value="policies">Políticas de Retiro (policies)</option>
                    {currentTableKey && !['main', 'events', 'products', 'policies'].includes(currentTableKey) && (
                      <option value={currentTableKey}>{currentTableKey}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Destino del Estilo
                  </label>
                  <select
                    value={editingRule.columns.includes('_row') ? '_row' : editingRule.columns[0] || '_row'}
                    onChange={e => {
                      const val = e.target.value;
                      setEditingRule({
                        ...editingRule,
                        columns: val === '_row' ? ['_row'] : [val]
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 outline-hidden"
                  >
                    <option value="_row">Toda la fila completa (_row)</option>
                    {headers.filter(h => !h.startsWith('_')).map(h => (
                      <option key={h} value={h}>Solo columna: {h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Condition Builder */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">
                  Condición Lógica (Si esto se cumple...)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Column */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Columna</label>
                    <select
                      value={editingRule.condition.column}
                      onChange={e => setEditingRule({
                        ...editingRule,
                        condition: { ...editingRule.condition, column: e.target.value }
                      })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    >
                      <optgroup label="Columnas Inteligentes AppSheet">
                        <option value="DIAS_PARA_VENCER">DIAS_PARA_VENCER (Cálculo dinámico)</option>
                        <option value="ESTADO">ESTADO (Vencido, Crítico, En regla...)</option>
                        <option value="POLITICA">POLITICA (Canje, Merma...)</option>
                        <option value="CANTIDAD">CANTIDAD (Stock)</option>
                      </optgroup>
                      <optgroup label="Columnas de la Hoja">
                        {headers.filter(h => !h.startsWith('_')).map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Operator */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Operador</label>
                    <select
                      value={editingRule.condition.operator}
                      onChange={e => setEditingRule({
                        ...editingRule,
                        condition: { ...editingRule.condition, operator: e.target.value as FormatRuleOperator }
                      })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    >
                      <option value="less_equal">Menor o igual que (≤)</option>
                      <option value="less_than">Menor que (&lt;)</option>
                      <option value="greater_equal">Mayor o igual que (≥)</option>
                      <option value="greater_than">Mayor que (&gt;)</option>
                      <option value="equals">Es exactamente igual a (==)</option>
                      <option value="not_equals">No es igual a (!=)</option>
                      <option value="contains">Contiene texto</option>
                      <option value="not_contains">No contiene texto</option>
                      <option value="is_empty">Está vacío / en blanco</option>
                      <option value="is_not_empty">Tiene datos ingresados</option>
                    </select>
                  </div>

                  {/* Value */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Valor Esperado</label>
                    <input
                      type="text"
                      disabled={editingRule.condition.operator === 'is_empty' || editingRule.condition.operator === 'is_not_empty'}
                      value={editingRule.condition.value}
                      onChange={e => setEditingRule({
                        ...editingRule,
                        condition: { ...editingRule.condition, value: e.target.value }
                      })}
                      placeholder="Ej: 15, Canje, Pendiente"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs disabled:opacity-40"
                    />
                  </div>
                </div>
              </div>

              {/* Color & Icon Stylizer */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">
                  Estilo Visual Aplicado
                </span>

                {/* Presets */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Paletas Rápidas</label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditingRule({
                          ...editingRule,
                          textColor: p.text,
                          backgroundColor: p.bg
                        })}
                        style={{ backgroundColor: p.bg, color: p.text, borderColor: p.border }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-transform hover:scale-105"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Icon Selector */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Icono de Alerta</label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingRule({ ...editingRule, icon: undefined })}
                      className={`p-1.5 rounded-lg border text-[11px] flex items-center justify-center gap-1 ${
                        !editingRule.icon ? 'bg-indigo-600 text-white font-bold' : 'bg-white dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      Sin Icono
                    </button>
                    {AVAILABLE_FORMAT_RULE_ICONS.map(i => {
                      const IconComp = i.Icon;
                      const isSel = editingRule.icon === i.id;
                      return (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => setEditingRule({ ...editingRule, icon: i.id })}
                          className={`p-1.5 rounded-lg border text-[11px] flex items-center justify-center gap-1.5 truncate ${
                            isSel
                              ? 'bg-indigo-600 text-white font-bold'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                          title={i.label}
                        >
                          <IconComp className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{i.id}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Toggles: Bold & Badge */}
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingRule.bold)}
                      onChange={e => setEditingRule({ ...editingRule, bold: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="font-bold text-slate-700 dark:text-slate-300">Texto en Negrita</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingRule.badge)}
                      onChange={e => setEditingRule({ ...editingRule, badge: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="font-bold text-slate-700 dark:text-slate-300">Resaltar en Badge</span>
                  </label>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-2xl flex items-center justify-between">
                <span className="text-xs text-slate-500 font-bold flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Vista Previa:</span>
                </span>
                <div
                  style={{
                    backgroundColor: editingRule.backgroundColor,
                    color: editingRule.textColor,
                    fontWeight: editingRule.bold ? 700 : 400
                  }}
                  className="px-3 py-1 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs border border-black/5"
                >
                  {renderFormatRuleIcon(editingRule.icon, 'w-3.5 h-3.5')}
                  <span>SKU 2000210218 - Lote con Formato Condicional</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRule(null);
                    setActiveTab('list');
                  }}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Guardar Regla</span>
                </button>
              </div>
            </form>
          ) : null}
        </div>

      </div>
    </div>
  );
};
