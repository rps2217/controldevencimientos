import React, { useMemo } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, Wand2, Download, Upload, HelpCircle, Activity } from 'lucide-react';
import { SheetConfig, SpreadsheetMetadata, ColumnSchema } from '../../types';

interface SchemaHealthAuditProps {
  sheetConfig: SheetConfig;
  metadata: SpreadsheetMetadata | null;
  saveConfig: (newConfig: SheetConfig) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export interface HealthIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  sheetName: string;
  message: string;
  autoFix?: () => void;
  autoFixLabel?: string;
}

export const SchemaHealthAudit: React.FC<SchemaHealthAuditProps> = ({
  sheetConfig,
  metadata,
  saveConfig,
  showToast
}) => {
  // Analyze current schema health
  const { score, issues, checkedSheetsCount } = useMemo(() => {
    const sheetList = metadata?.sheets || [];
    const issuesList: HealthIssue[] = [];
    let passedChecks = 0;
    let totalChecks = 0;

    sheetList.forEach(sheet => {
      const sheetName = sheet.title;
      const schemaMap = sheetConfig.schema?.[sheetName] || {};
      const columns = Object.keys(schemaMap);

      totalChecks += 3;

      // 1. Primary Key check
      const hasKey = Object.values(schemaMap).some(col => col.isKey);
      if (!hasKey) {
        // Auto fix candidate: find SKU, ID, or first column
        const candidateKey = columns.find(c => /sku|id|codigo|folio|cu_vc/i.test(c)) || columns[0];
        issuesList.push({
          id: `no-key-${sheetName}`,
          severity: 'warning',
          sheetName,
          message: `La tabla no tiene definida una Clave Primaria (ID Key).`,
          autoFixLabel: candidateKey ? `Fijar "${candidateKey}" como Clave` : undefined,
          autoFix: candidateKey ? () => {
            const updatedSchema = { ...(sheetConfig.schema || {}) };
            const currentSheetSchema = { ...(updatedSchema[sheetName] || {}) };
            
            // Clear keys
            Object.keys(currentSheetSchema).forEach(k => {
              currentSheetSchema[k] = { ...currentSheetSchema[k], isKey: k === candidateKey };
            });

            updatedSchema[sheetName] = currentSheetSchema;
            saveConfig({ ...sheetConfig, schema: updatedSchema });
            showToast?.(`Clave primaria fijada en "${candidateKey}" para ${sheetName}`, 'success');
          } : undefined
        });
      } else {
        passedChecks++;
      }

      // 2. Column Types Check (check if everything is default Text)
      const nonTextTypes = Object.values(schemaMap).filter(col => col.type && col.type !== 'Text');
      if (columns.length > 0 && nonTextTypes.length === 0) {
        issuesList.push({
          id: `all-text-${sheetName}`,
          severity: 'info',
          sheetName,
          message: `Todas las columnas están con tipo genérico "Text". Puedes precisar fechas, números o relaciones.`,
          autoFixLabel: 'Auto-detectar Tipos',
          autoFix: () => {
            const updatedSchema = { ...(sheetConfig.schema || {}) };
            const currentSheetSchema = { ...(updatedSchema[sheetName] || {}) };

            Object.keys(currentSheetSchema).forEach(col => {
              const lower = col.toLowerCase();
              let inferredType: ColumnSchema['type'] = 'Text';
              if (/fecha|date|vto|venc|retiro/i.test(lower)) inferredType = 'Date';
              else if (/cantidad|cant|monto|precio|stock|total|dias|unidades/i.test(lower)) inferredType = 'Number';
              else if (/sku|codigo|ean|barcode/i.test(lower)) inferredType = 'Text';

              currentSheetSchema[col] = { ...currentSheetSchema[col], type: inferredType };
            });

            updatedSchema[sheetName] = currentSheetSchema;
            saveConfig({ ...sheetConfig, schema: updatedSchema });
            showToast?.(`Tipos de datos inferidos para la tabla ${sheetName}`, 'success');
          }
        }
        );
      } else {
        passedChecks++;
      }

      // 3. Search Indexing check
      const hasIndexed = Object.values(schemaMap).some(col => col.isIndexed !== false);
      if (!hasIndexed) {
        issuesList.push({
          id: `no-search-${sheetName}`,
          severity: 'info',
          sheetName,
          message: `Ninguna columna está marcada para el buscador universal.`
        });
      } else {
        passedChecks++;
      }
    });

    const calculatedScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

    return {
      score: calculatedScore,
      issues: issuesList,
      checkedSheetsCount: sheetList.length
    };
  }, [sheetConfig, metadata, saveConfig, showToast]);

  // Export Schema JSON Backup
  const handleExportSchemaJson = () => {
    const blob = new Blob([JSON.stringify(sheetConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esquema_relacional_config_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.('Esquema relacional exportado correctamente en formato JSON', 'success');
  };

  // Import Schema JSON Backup
  const handleImportSchemaJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === 'object') {
          saveConfig(parsed);
          showToast?.('Esquema relacional importado y aplicado con éxito', 'success');
        } else {
          showToast?.('El archivo JSON no contiene un esquema válido', 'error');
        }
      } catch {
        showToast?.('Error al leer el archivo JSON de esquema', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 sm:p-5 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl text-white shadow-xs ${
            score >= 90 ? 'bg-emerald-600' : score >= 70 ? 'bg-amber-500' : 'bg-rose-600'
          }`}>
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Auditoría de Salud del Esquema
              </h4>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                score >= 90 
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                  : score >= 70 
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300' 
                  : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
              }`}>
                {score}% Saludable
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Análisis automático sobre {checkedSheetsCount} tabla(s) del modelo de datos.
            </p>
          </div>
        </div>

        {/* Quick Schema Export & Import Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportSchemaJson}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Exportar archivo JSON con toda la estructura relacional"
          >
            <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Exportar JSON</span>
          </button>

          <label className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs">
            <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Cargar JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportSchemaJson}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Issues List & Quick Auto-Fix Actions */}
      {issues.length > 0 ? (
        <div className="pt-3.5 flex flex-col gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
            Recomendaciones de Estructura ({issues.length})
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {issues.map(issue => (
              <div
                key={issue.id}
                className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 flex items-start justify-between gap-2 shadow-2xs"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                    issue.severity === 'critical' ? 'text-rose-500' : issue.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                  }`} />
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase text-slate-400 block">
                      {issue.sheetName}
                    </span>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-snug">
                      {issue.message}
                    </p>
                  </div>
                </div>

                {issue.autoFix && (
                  <button
                    type="button"
                    onClick={issue.autoFix}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 text-[11px] font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3 text-blue-600" />
                    <span>{issue.autoFixLabel || 'Solucionar'}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="pt-3 flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4" />
          <span>¡Excelente! Tu estructura de datos relacional no presenta observaciones críticas.</span>
        </div>
      )}
    </div>
  );
};
