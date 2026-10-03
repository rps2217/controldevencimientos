import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Code2, UploadCloud, Cloud, Sliders, CheckCircle2, Loader2, 
  TableProperties, ShieldCheck, AlertTriangle, Database
} from 'lucide-react';
import { SheetConfig, SpreadsheetMetadata, SheetProperties, SheetRecord } from '../../types';
import { SchemaHealthAudit } from './SchemaHealthAudit';
import { AppSheetColumnStudio } from './AppSheetColumnStudio';

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
  products?: SheetRecord[];
  policies?: SheetRecord[];
  sampleItems?: any[];
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
  handlePushCloudConfig: _handlePushCloudConfig,
  activeView,
  products = [],
  policies = [],
  sampleItems = []
}) => {
  const [showAuditPanel, setShowAuditPanel] = useState<boolean>(false);

  // Quick audit calculation for the header badge
  const auditSummary = useMemo(() => {
    const sheetsWithSchema = Object.keys(sheetConfig.schema || {});
    let missingKeyCount = 0;
    
    sheetsWithSchema.forEach(sheetName => {
      const colMap = sheetConfig.schema?.[sheetName] || {};
      const hasKey = Object.values(colMap).some(col => col.isKey);
      if (!hasKey && Object.keys(colMap).length > 0) {
        missingKeyCount++;
      }
    });

    return {
      totalConfiguredTables: sheetsWithSchema.length,
      missingKeyCount,
      isHealthy: missingKeyCount === 0
    };
  }, [sheetConfig.schema]);

  return (
    <div className="w-full flex flex-col space-y-4 transition-colors">
      
      {/* ========================================================================= */}
      {/* 🧭 BARRA SUPERIOR EJECUTIVA (Full Width Toolbar)                         */}
      {/* ========================================================================= */}
      <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        {/* Left: Module Title & Status Badges */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
            <Database className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Estructura de Datos
              </h2>
              
              {/* Cloud Sync Status Pill */}
              {configStorageMode === 'properties' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <Cloud className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  Cloud PropertiesService
                </span>
              ) : configStorageMode === 'sheet' || hasCloudConfigSheet ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800">
                  <Cloud className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                  Hoja: {cloudConfigSheetName}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                  <Sliders className="w-3 h-3 text-slate-500" />
                  Almacenamiento Local
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Gestor de columnas físicas y virtuales, claves primarias, fórmulas AppSheet y restricciones.
            </p>
          </div>
        </div>

        {/* Right: Actions Toolbar */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Health Audit Toggle */}
          <button
            type="button"
            onClick={() => setShowAuditPanel(!showAuditPanel)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
              showAuditPanel
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                : auditSummary.isHealthy
                  ? 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
            }`}
            title="Ver auditoría y diagnóstico de salud del esquema"
          >
            {auditSummary.isHealthy ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            )}
            <span>Auditoría</span>
            {!auditSummary.isHealthy && (
              <span className="text-[10px] bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-1.5 py-0.2 rounded-full font-mono">
                {auditSummary.missingKeyCount}
              </span>
            )}
          </button>

          {/* Script Code Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsScriptModalOpen(true)}
            className="px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Ver código Apps Script para sincronización automática"
          >
            <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">Código Script</span>
          </button>

          {/* Push to Cloud Button */}
          <button
            type="button"
            onClick={handlePushPropertiesConfig}
            disabled={isSyncingCloud}
            className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Guardar esquema en la nube con Google Apps Script PropertiesService"
          >
            {isSyncingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UploadCloud className="w-3.5 h-3.5" />
            )}
            <span>Guardar en Cloud</span>
          </button>
        </div>
      </div>

      {/* Sync Success Notification */}
      {syncSuccessMessage && (
        <div className="w-full bg-emerald-500 text-white rounded-xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{syncSuccessMessage}</span>
        </div>
      )}

      {/* Optional Collapsible Schema Health Audit */}
      {showAuditPanel && (
        <div className="w-full animate-in fade-in duration-200">
          <SchemaHealthAudit
            sheetConfig={sheetConfig}
            metadata={metadata}
            saveConfig={saveConfig}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🚀 CONTENIDO PRINCIPAL A TODO EL ANCHO (100% Full Width Protagonism)      */}
      {/* ========================================================================= */}
      <div className="w-full flex-1 min-w-0">
        <AppSheetColumnStudio
          metadata={metadata}
          activeSheet={activeSheet}
          setActiveSheet={setActiveSheet}
          headers={headers}
          setHeaders={setHeaders}
          isSchemaLoading={isSchemaLoading}
          setIsSchemaLoading={setIsSchemaLoading}
          sheetConfig={sheetConfig}
          saveConfig={saveConfig}
          activeView={activeView}
          products={products}
          policies={policies}
          sampleItems={sampleItems}
        />
      </div>

    </div>
  );
};
