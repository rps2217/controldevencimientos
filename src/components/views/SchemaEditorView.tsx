import React, { useState } from 'react';
import { VIRTUAL_COLUMNS } from '../../utils/virtualColumns';
import { 
  Sparkles, Code2, UploadCloud, Cloud, Sliders, CheckCircle2, Loader2, Key, Eye, EyeOff, Search, Link2, CheckSquare, Square, TableProperties, Layers
} from 'lucide-react';
import { SheetConfig, SpreadsheetMetadata, SheetProperties, ColumnSchema, ColumnType, ColumnBehavior, UserVirtualColumn } from '../../types';
import { getSheetData } from '../../lib/sheets';
import { VisualSchemaDesigner } from './VisualSchemaDesigner';

interface SchemaEditorViewProps {
  configStorageMode: 'properties' | 'sheet' | 'local';
  hasCloudConfigSheet: boolean;
  cloudConfigSheetName: string;
  syncSuccessMessage: string | null;
  isSyncingCloud: boolean;
  metadata: SpreadsheetMetadata | null;
  activeSheet: SheetProperties | null;
  setActiveSheet: (sheet: SheetProperties | null) => void;
  headers: string[];
  setHeaders: (headers: string[]) => void;
  isSchemaLoading: boolean;
  setIsSchemaLoading: (loading: boolean) => void;
  sheetConfig: SheetConfig;
  saveConfig: (newConfig: SheetConfig) => void;
  setIsScriptModalOpen: (open: boolean) => void;
  handlePushPropertiesConfig: () => Promise<void>;
  handlePushCloudConfig: () => Promise<void>;
  activeView: string;
}

export const SchemaEditorView: React.FC<SchemaEditorViewProps> = ({
  configStorageMode,
  hasCloudConfigSheet,
  cloudConfigSheetName,
  syncSuccessMessage,
  isSyncingCloud,
  metadata,
  activeSheet,
  setActiveSheet,
  headers,
  setHeaders,
  isSchemaLoading,
  setIsSchemaLoading,
  sheetConfig,
  saveConfig,
  setIsScriptModalOpen,
  handlePushPropertiesConfig,
  handlePushCloudConfig,
  activeView
}) => {
  const [schemaSubView, setSchemaSubView] = useState<'visual' | 'table'>('visual');

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden p-6 max-w-6xl mx-auto transition-colors">
      
      {/* Cloud Sync Status Banner (PropertiesService vs Sheet vs Local) */}
      {configStorageMode === 'properties' ? (
        <div className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200 dark:shadow-none">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-2">
                Sincronización en la Nube Activa (Opción 2)
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-200/80 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-mono font-bold">
                  PropertiesService (Cero Hojas Extras)
                </span>
              </h4>
              <p className="text-xs text-emerald-800 dark:text-emerald-300/80 mt-0.5 leading-relaxed">
                Toda la estructura de columnas, claves ID y políticas se guardan en el motor de Apps Script. Tu Google Sheet se mantiene 100% limpio y protegido.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsScriptModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-all flex items-center gap-1.5"
            >
              <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Ver Código Script</span>
            </button>
            <button
              onClick={handlePushPropertiesConfig}
              disabled={isSyncingCloud}
              className="px-3.5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-sm shadow-emerald-200 dark:shadow-none transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSyncingCloud ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              <span>Guardar en Cloud</span>
            </button>
          </div>
        </div>
      ) : configStorageMode === 'sheet' || hasCloudConfigSheet ? (
        <div className="mb-6 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-teal-200 dark:shadow-none">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-teal-950 dark:text-teal-200 flex items-center gap-2">
                Sincronización en Pestaña Oculta (Opción 1)
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-teal-200 dark:bg-teal-900/60 text-teal-900 dark:text-teal-200 font-mono font-bold">
                  {cloudConfigSheetName}
                </span>
              </h4>
              <p className="text-xs text-teal-800 dark:text-teal-300/80 mt-0.5 leading-relaxed">
                La configuración está activa en la pestaña oculta <code className="font-mono font-bold">{cloudConfigSheetName}</code>. Puedes migrarla a <strong>PropertiesService (Opción 2)</strong> para no requerir pestañas extras.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setIsScriptModalOpen(true)}
              className="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-all flex items-center gap-1.5"
            >
              <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Ver Código</span>
            </button>
            <button
              onClick={handlePushPropertiesConfig}
              disabled={isSyncingCloud}
              title="Migrar y guardar directamente en Apps Script PropertiesService"
              className="px-3.5 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-200 dark:shadow-none transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Migrar a Opción 2</span>
            </button>
            <button
              onClick={handlePushCloudConfig}
              disabled={isSyncingCloud}
              className="px-3 py-2 text-xs font-bold bg-teal-700 text-white rounded-xl hover:bg-teal-800 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSyncingCloud ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              <span>Guardar en Hoja</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-6 bg-slate-900 dark:bg-slate-900 text-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md border border-slate-800">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                Configuración Local
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
                  Navegador
                </span>
              </h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                Guarda tu estructura en la nube con la <strong>Opción 2 (PropertiesService)</strong> para que todos los usuarios compartan la misma configuración sin alterar el Google Sheet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setIsScriptModalOpen(true)}
              className="px-3 py-2 text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700 rounded-xl hover:bg-slate-700 shadow-sm transition-all flex items-center gap-1.5"
            >
              <Code2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Instrucciones & Código</span>
            </button>
            <button
              onClick={handlePushPropertiesConfig}
              disabled={isSyncingCloud}
              className="px-3.5 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-500 shadow-sm shadow-blue-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSyncingCloud ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Activar Opción 2</span>
            </button>
          </div>
        </div>
      )}

      {syncSuccessMessage && (
        <div className="mb-6 bg-emerald-500 text-white rounded-xl p-3.5 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{syncSuccessMessage}</span>
        </div>
      )}

      <div className="mb-6 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <p className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
          <strong>Editor de Metadatos y Relaciones Relacionales:</strong> Define claves primarias (ID Key), referencias entre tablas (Ref), columnas indexables para el buscador, y reglas de cálculo para cada pestaña de tu Google Sheet.
        </p>
      </div>

      {/* Sub-view Toggle */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6">
        <button
          onClick={() => setSchemaSubView('visual')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            schemaSubView === 'visual'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Diseñador Relacional (Visual)</span>
        </button>
        <button
          onClick={() => setSchemaSubView('table')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            schemaSubView === 'table'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <TableProperties className="w-4 h-4" />
          <span>Configuración de Columnas (Pestaña)</span>
        </button>
      </div>

      {schemaSubView === 'visual' ? (
        <VisualSchemaDesigner
          sheetConfig={sheetConfig}
          saveConfig={saveConfig}
          metadata={metadata}
          activeSheetTitle={activeSheet?.title}
          activeSheetHeaders={headers}
        />
      ) : (
        <>
          <div className="mb-6">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Selecciona una pestaña para configurar:</label>
            <select 
              className="w-full max-w-sm border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 outline-none focus:ring-4 focus:ring-blue-500/10 shadow-sm bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-50"
              disabled={isSchemaLoading}
              onChange={async (e) => {
                const sheetTitle = e.target.value;
                if (sheetTitle) {
                  const sheetProp = metadata?.sheets.find((s: any) => s.properties.title === sheetTitle)?.properties || null;
                  setActiveSheet(sheetProp);
                  
                  if (sheetProp) {
                    setIsSchemaLoading(true);
                    try {
                      const rows = await getSheetData(sheetProp.title);
                      if (rows.length > 0) {
                        setHeaders(rows[0]);
                      } else {
                        setHeaders([]);
                      }
                    } catch (err) {
                      console.error(err);
                      setHeaders([]);
                    } finally {
                      setIsSchemaLoading(false);
                    }
                  }
                } else {
                  setActiveSheet(null);
                  setHeaders([]);
                }
              }}
              value={activeSheet?.title || ''}
            >
              <option value="">-- Seleccionar Pestaña --</option>
              {metadata?.sheets
                .filter((s: any) => !/^_/i.test(s.properties.title))
                .map((s: any) => (
                  <option key={s.properties.sheetId} value={s.properties.title}>{s.properties.title}</option>
                ))}
            </select>
          </div>

      {isSchemaLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        </div>
      )}
      
      {!isSchemaLoading && activeSheet && headers.length === 0 && (
        <div className="py-8 text-center text-slate-500 dark:text-slate-400">
          La pestaña seleccionada está vacía. Necesita al menos una fila de encabezados.
        </div>
      )}

      {!isSchemaLoading && activeSheet && headers.length > 0 && (
        <>
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-sm mb-6">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-4 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">Columna</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase text-center w-24">ID Key</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase text-center w-24">Visible</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase text-center w-28">Indexable</th>
                  <th className="px-5 py-4 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase w-48">Tipo de Dato</th>
                  <th className="px-5 py-4 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">Opciones / Referencia</th>
                  <th className="px-5 py-4 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase w-56">Automatización</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                {headers.map((header) => {
                  const isNaturalKey = /^ID_VC$|^ID_EVENTO$|^ID$|^SKU$/i.test(header.trim());
                  const schema: ColumnSchema = sheetConfig.schema?.[activeSheet.title]?.[header] || { 
                    visible: true, 
                    searchable: true, 
                    type: (/fecha|vencimiento|retiro/i.test(header) ? 'date' : (/sku/i.test(header) && activeView === 'main' ? 'ref' : 'text')), 
                    behavior: (isNaturalKey && /^ID_VC$/i.test(header.trim()) ? 'auto_id' : 'none'),
                    isKey: isNaturalKey,
                    options: '',
                    refTable: sheetConfig.products || ''
                  };
                  
                  const updateCol = (key: keyof ColumnSchema, value: any) => {
                    const newSchema = { ...sheetConfig.schema };
                    if (!newSchema[activeSheet.title]) newSchema[activeSheet.title] = {};
                    newSchema[activeSheet.title][header] = { ...schema, [key]: value };
                    saveConfig({ ...sheetConfig, schema: newSchema });
                  };

                  const isEnum = schema.type === 'enum' || schema.type === 'enumlist';
                  const isRef = schema.type === 'ref';

                  return (
                    <tr key={header} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="px-5 py-4 text-sm font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{header}</span>
                          {schema.isKey && (
                            <span className="text-[10px] bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                              <Key className="w-3 h-3 text-amber-600 dark:text-amber-400" /> KEY
                            </span>
                          )}
                          {schema.behavior !== 'none' && (
                            <span className="text-[10px] bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded font-mono font-bold">
                              {schema.behavior}
                            </span>
                          )}
                        </div>
                      </td>
                      
                      {/* Key Toggle */}
                      <td className="px-4 py-4 text-center">
                        <button 
                          onClick={() => updateCol('isKey', !schema.isKey)}
                          title={schema.isKey ? "Columna clave primaria (ID)" : "Marcar como clave primaria"}
                          className={`p-2 rounded-lg transition-colors ${schema.isKey ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 bg-amber-50/60 dark:bg-amber-900/30' : 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      </td>

                      {/* Visible Toggle */}
                      <td className="px-4 py-4 text-center">
                        <button 
                          onClick={() => updateCol('visible', schema.visible === false ? true : false)}
                          title={schema.visible !== false ? "Visible en la tabla principal" : "Oculto en la tabla principal"}
                          className={`p-2 rounded-lg transition-colors ${schema.visible !== false ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50' : 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                          {schema.visible !== false ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                        </button>
                      </td>

                      {/* Searchable Toggle */}
                      <td className="px-4 py-4 text-center">
                        <button 
                          onClick={() => updateCol('searchable', schema.searchable === false ? true : false)}
                          title={schema.searchable !== false ? "Indexado en el buscador universal" : "Ignorado en el buscador"}
                          className={`p-2 rounded-lg transition-colors ${schema.searchable !== false ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 bg-emerald-50/50 dark:bg-emerald-900/30' : 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                          <Search className="w-4 h-4 inline" />
                        </button>
                      </td>

                      {/* Data Type */}
                      <td className="px-5 py-4">
                        <select 
                          value={schema.type || 'text'}
                          onChange={(e) => updateCol('type', e.target.value as ColumnType)}
                          className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none font-medium"
                        >
                          <option value="text">Texto (Text)</option>
                          <option value="longtext">Texto Largo (LongText)</option>
                          <option value="number">Número (Number)</option>
                          <option value="date">Fecha (Date)</option>
                          <option value="datetime">Fecha y Hora (DateTime)</option>
                          <option value="enum">Selección Única (Enum)</option>
                          <option value="enumlist">Selección Múltiple (EnumList)</option>
                          <option value="ref">Referencia / Relación (Ref)</option>
                          <option value="calculated">Calculada (Calculated)</option>
                        </select>
                      </td>

                      {/* Options / Ref Config */}
                      <td className="px-5 py-4">
                        {isRef ? (
                          <div>
                            <select
                              value={schema.refTable || ''}
                              onChange={(e) => updateCol('refTable', e.target.value)}
                              className="w-full border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5 text-xs bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 focus:border-blue-500 outline-none font-medium"
                            >
                              <option value="">-- Tabla Destino (Ref) --</option>
                              {metadata?.sheets.map((s: any) => (
                                <option key={s.properties.sheetId} value={s.properties.title}>
                                  {s.properties.title}
                                </option>
                              ))}
                            </select>
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 block flex items-center gap-1">
                              <Link2 className="w-3 h-3" /> Relacionada por clave ID
                            </span>
                          </div>
                        ) : isEnum ? (
                          <div>
                            <input 
                              type="text"
                              placeholder="Ej: Activo, Pendiente, Cancelado"
                              value={schema.options || ''}
                              onChange={(e) => updateCol('options', e.target.value)}
                              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                            />
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 block">Separadas por coma</span>
                          </div>
                        ) : schema.type === 'calculated' ? (
                          <span className="text-xs text-slate-400 dark:text-slate-500 italic">Definida por automatización</span>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-slate-600 font-mono">-</span>
                        )}
                      </td>

                      {/* Behavior */}
                      <td className="px-5 py-4">
                        <select 
                          value={schema.behavior || 'none'}
                          onChange={(e) => updateCol('behavior', e.target.value as ColumnBehavior)}
                          className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 outline-none"
                        >
                          <option value="none">-- Sin automatización --</option>
                          <option value="auto_id">Generar ID Único (auto_id)</option>
                          <option value="calc_fecha_vc">Calcular Fecha VC (MM/YYYY)</option>
                          <option value="calc_retiro">Calcular Retiro (Política)</option>
                          <option value="sku_lookup">Autocompletar Relacional</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Virtual Columns Configuration */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Columnas Virtuales Activas (Sistema)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {VIRTUAL_COLUMNS.map((col) => {
                const isActive = sheetConfig.activeVirtualColumns?.includes(col.id);
                return (
                  <button
                    key={col.id}
                    onClick={() => {
                      const newActive = isActive
                        ? (sheetConfig.activeVirtualColumns || []).filter(id => id !== col.id)
                        : [...(sheetConfig.activeVirtualColumns || []), col.id];
                      saveConfig({ ...sheetConfig, activeVirtualColumns: newActive });
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-sm font-bold transition-all ${
                      isActive 
                        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200' 
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {isActive ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    <div className="flex flex-col text-left">
                      <span>{col.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User Virtual Columns Configuration */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Columnas Virtuales de Usuario (Personalizadas)
              </span>
              <button
                onClick={() => {
                  const newVirtualColumn: UserVirtualColumn = {
                    id: `uvc_${Date.now()}`,
                    label: 'Nueva Columna',
                    operation: 'concatenate',
                    sourceColumns: []
                  };
                  saveConfig({ ...sheetConfig, userVirtualColumns: [...(sheetConfig.userVirtualColumns || []), newVirtualColumn] });
                }}
                className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                + Crear Nueva
              </button>
            </h3>
            <div className="space-y-3">
              {(sheetConfig.userVirtualColumns || []).map((uvc, index) => (
                <div key={uvc.id} className="grid grid-cols-4 gap-3 items-center p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <input
                    value={uvc.label}
                    onChange={(e) => {
                      const updated = [...(sheetConfig.userVirtualColumns || [])];
                      updated[index].label = e.target.value;
                      saveConfig({ ...sheetConfig, userVirtualColumns: updated });
                    }}
                    className="col-span-1 px-3 py-2 text-sm border rounded-lg bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 outline-none"
                    placeholder="Nombre"
                  />
                  <select
                    value={uvc.operation}
                    onChange={(e) => {
                      const updated = [...(sheetConfig.userVirtualColumns || [])];
                      updated[index].operation = e.target.value as any;
                      saveConfig({ ...sheetConfig, userVirtualColumns: updated });
                    }}
                    className="col-span-1 px-3 py-2 text-sm border rounded-lg bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 outline-none"
                  >
                    <option value="concatenate">Concatenar</option>
                    <option value="sum">Suma</option>
                    <option value="diff_days">Diferencia Días</option>
                  </select>
                  <select
                    multiple
                    value={uvc.sourceColumns}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const selected = Array.from(e.target.selectedOptions as HTMLCollectionOf<HTMLOptionElement>).map(option => option.value);
                      const updated = [...(sheetConfig.userVirtualColumns || [])];
                      updated[index].sourceColumns = selected;
                      saveConfig({ ...sheetConfig, userVirtualColumns: updated });
                    }}
                    className="col-span-1 px-3 py-2 text-sm border rounded-lg bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 outline-none h-20"
                  >
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <button
                    onClick={() => {
                      const updated = (sheetConfig.userVirtualColumns || []).filter((_, i) => i !== index);
                      saveConfig({ ...sheetConfig, userVirtualColumns: updated });
                    }}
                    className="text-rose-600 text-xs font-bold"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )}
    </div>
  );
};
