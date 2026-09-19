import React, { useState } from 'react';
import { Settings, X, Database, FileSpreadsheet, Package, FileText, CheckCircle2, Sliders, BookOpen, Plus, Trash2, Server } from 'lucide-react';
import { SheetConfig, SpreadsheetMetadata } from '../../types';
import { TableBulkActionsPanel } from '../settings/TableBulkActionsPanel';
import { BackendMirrorPanel } from '../settings/BackendMirrorPanel';

interface GlobalConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetConfig: SheetConfig;
  setSheetConfig: React.Dispatch<React.SetStateAction<SheetConfig>>;
  saveConfig: (newConfig: SheetConfig) => void;
  metadata: SpreadsheetMetadata | null;
  fetchData: (config?: SheetConfig, view?: string) => Promise<void>;
  activeView: string;
  activeSheetTitle?: string;
  headers?: string[];
  initialTab?: 'sheets' | 'dictionary' | 'bulkActions' | 'backendMirror';
}

const SEMANTIC_FIELDS = [
  { key: 'sku', label: 'SKU / Código de Producto' },
  { key: 'descripcion', label: 'Descripción / Nombre' },
  { key: 'fecha_vc', label: 'Fecha de Vencimiento (Vto)' },
  { key: 'fecha_retiro', label: 'Fecha de Retiro / Canje' },
  { key: 'tipo_evento', label: 'Tipo de Incidencia / Evento (FRC)' },
  { key: 'frc_bod', label: 'Bodega / FRC Bodega (FRC_BOD)' },
  { key: 'cantidad', label: 'Cantidad / Unidades' },
  { key: 'lote', label: 'Lote / Batch' },
  { key: 'n_traspaso', label: 'N° de Traspaso / Resolución' },
  { key: 'observacion', label: 'Observación / Comentarios' },
  { key: 'proveedor', label: 'Proveedor / Laboratorio' },
  { key: 'telefono', label: 'Teléfono / WhatsApp / Contacto' },
  { key: 'email', label: 'Correo Electrónico / Email' },
  { key: 'precio', label: 'Precio / Costo' },
  { key: 'id', label: 'ID / Folio' }
];

export const GlobalConfigModal: React.FC<GlobalConfigModalProps> = ({
  isOpen,
  onClose,
  sheetConfig,
  setSheetConfig,
  saveConfig,
  metadata,
  fetchData,
  activeView,
  activeSheetTitle = '',
  headers = [],
  initialTab = 'sheets'
}) => {
  const [activeTab, setActiveTab] = useState<'sheets' | 'dictionary' | 'bulkActions' | 'backendMirror'>(initialTab);
  const [selectedField, setSelectedField] = useState<string>('sku');
  const [newAliasInput, setNewAliasInput] = useState<string>('');

  if (!isOpen) return null;

  const handleAddAlias = () => {
    if (!newAliasInput.trim()) return;
    const currentAliases = sheetConfig.customAliases || {};
    const fieldAliases = currentAliases[selectedField] || [];
    if (fieldAliases.includes(newAliasInput.trim())) return;

    const updatedAliases = {
      ...currentAliases,
      [selectedField]: [...fieldAliases, newAliasInput.trim()]
    };
    const next = { ...sheetConfig, customAliases: updatedAliases };
    setSheetConfig(next);
    saveConfig(next);
    setNewAliasInput('');
  };

  const handleRemoveAlias = (fieldKey: string, aliasToRemove: string) => {
    const currentAliases = sheetConfig.customAliases || {};
    const fieldAliases = currentAliases[fieldKey] || [];
    const updatedFieldAliases = fieldAliases.filter(a => a !== aliasToRemove);
    const updatedAliases = {
      ...currentAliases,
      [fieldKey]: updatedFieldAliases
    };
    const next = { ...sheetConfig, customAliases: updatedAliases };
    setSheetConfig(next);
    saveConfig(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">Configuración General y Diccionario</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Administra pestañas de Google Sheets y alias de columnas dinámicas</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            onClick={() => setActiveTab('sheets')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'sheets'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Mapeo de Pestañas</span>
          </button>
          <button
            onClick={() => setActiveTab('dictionary')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'dictionary'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Diccionario de Cabeceras (Aliases)</span>
          </button>
          <button
            onClick={() => setActiveTab('bulkActions')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'bulkActions'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Acciones Masivas</span>
          </button>
          <button
            onClick={() => setActiveTab('backendMirror')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'backendMirror'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Espejo Backend</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'sheets' ? (
            <>
              {/* Main / Vencimientos */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1">
                  <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>1. Vencimientos & Radar Principal</span>
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Pestaña con las fechas de caducidad, MM/YYYY y retiro preventivo.</p>
                <select
                  value={sheetConfig.main || ''}
                  onChange={(e) => {
                    const next = { ...sheetConfig, main: e.target.value };
                    setSheetConfig(next);
                    saveConfig(next);
                  }}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="">-- Seleccionar Pestaña --</option>
                  {metadata?.sheets
                    .filter((s: any) => !/^_/i.test(s.properties.title))
                    .map((s: any) => (
                      <option key={s.properties.sheetId} value={s.properties.title}>{s.properties.title}</option>
                    ))}
                </select>
              </div>

              {/* Events / Incidencias */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1">
                  <FileSpreadsheet className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>2. Incidencias & FRC</span>
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Pestaña para registrar deterioros de transporte, averías, mermas o diferencias.</p>
                <select
                  value={sheetConfig.events || ''}
                  onChange={(e) => {
                    const next = { ...sheetConfig, events: e.target.value };
                    setSheetConfig(next);
                    saveConfig(next);
                  }}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="">-- (Opcional) Misma hoja principal o pestaña dedicada --</option>
                  {metadata?.sheets
                    .filter((s: any) => !/^_/i.test(s.properties.title))
                    .map((s: any) => (
                      <option key={s.properties.sheetId} value={s.properties.title}>{s.properties.title}</option>
                    ))}
                </select>
              </div>

              {/* Products / Maestro */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>3. Catálogo Maestro de Productos</span>
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Pestaña maestra con SKU, descripción, marca y política de canje asociada.</p>
                <select
                  value={sheetConfig.products || ''}
                  onChange={(e) => {
                    const next = { ...sheetConfig, products: e.target.value };
                    setSheetConfig(next);
                    saveConfig(next);
                  }}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="">-- Seleccionar Pestaña --</option>
                  {metadata?.sheets
                    .filter((s: any) => !/^_/i.test(s.properties.title))
                    .map((s: any) => (
                      <option key={s.properties.sheetId} value={s.properties.title}>{s.properties.title}</option>
                    ))}
                </select>
              </div>

              {/* Policies / Canjes */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>4. Políticas de Canje / Retiro</span>
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Pestaña con los días de anticipación de retiro (ej. 30, 60, 90 días).</p>
                <select
                  value={sheetConfig.policies || ''}
                  onChange={(e) => {
                    const next = { ...sheetConfig, policies: e.target.value };
                    setSheetConfig(next);
                    saveConfig(next);
                  }}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="">-- Seleccionar Pestaña --</option>
                  {metadata?.sheets
                    .filter((s: any) => !/^_/i.test(s.properties.title))
                    .map((s: any) => (
                      <option key={s.properties.sheetId} value={s.properties.title}>{s.properties.title}</option>
                    ))}
                </select>
              </div>
            </>
          ) : activeTab === 'dictionary' ? (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-2xl p-4 text-xs text-blue-700 dark:text-blue-300">
                <p className="font-bold mb-1">Diccionario de Mapeo Dinámico</p>
                <p>Agrega los nombres exactos de las cabeceras que utilizas en tus formularios externos (Google Forms, Excel, etc.). Cualquier alias registrado aquí se guardará en la nube y será reconocido automáticamente por la aplicación en cualquier dispositivo.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Campo Semántico</label>
                  <select
                    value={selectedField}
                    onChange={(e) => setSelectedField(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                  >
                    {SEMANTIC_FIELDS.map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Nuevo Alias / Cabecera en Hoja</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAliasInput}
                      onChange={(e) => setNewAliasInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
                      placeholder="Ej. FOLIO_EXTERNO_FRC"
                      className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      onClick={handleAddAlias}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition-all shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* List of custom aliases for selected field */}
              <div className="mt-4 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/60 dark:bg-slate-800/40">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                  Alias personalizados para: <span className="text-blue-600 dark:text-blue-400">{SEMANTIC_FIELDS.find(f => f.key === selectedField)?.label}</span>
                </h4>
                {(!sheetConfig.customAliases || !sheetConfig.customAliases[selectedField] || sheetConfig.customAliases[selectedField].length === 0) ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2">No hay alias personalizados configurados para este campo aún.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {sheetConfig.customAliases[selectedField].map(alias => (
                      <span key={alias} className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-mono px-3 py-1.5 rounded-xl shadow-sm">
                        <span>{alias}</span>
                        <button
                          onClick={() => handleRemoveAlias(selectedField, alias)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                          title="Eliminar alias"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'bulkActions' ? (
            <TableBulkActionsPanel
              sheetConfig={sheetConfig}
              setSheetConfig={setSheetConfig}
              saveConfig={saveConfig}
              activeSheetTitle={activeSheetTitle}
              activeView={activeView}
              headers={headers}
              metadata={metadata}
            />
          ) : (
            <BackendMirrorPanel
              sheetConfig={sheetConfig}
              setSheetConfig={setSheetConfig}
              saveConfig={saveConfig}
              activeSheetTitle={activeSheetTitle}
              headers={headers}
            />
          )}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-2">
          <button
            onClick={() => {
              onClose();
              fetchData(sheetConfig, activeView);
            }}
            className="px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-200 dark:shadow-none transition-all flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Aplicar y Recargar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

