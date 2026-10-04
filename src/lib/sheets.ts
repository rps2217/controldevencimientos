/**
 * Cliente central y capa de abstracción para Google Sheets y Google Apps Script.
 * Modularizado en submódulos especializados (`sheetsClient`, `sheetsConfigSync`, `sheetsCampaignSync`, `sheetsAuditLog`)
 * para máxima mantenibilidad y pruebas aisladas.
 * 
 * Este archivo actúa como fachada (facade) re-exportando el 100% de la API pública para retrocompatibilidad total.
 */

export * from './sheetsTypes';
export * from './sheetsClient';
export * from './sheetsConfigSync';
export * from './sheetsCampaignSync';
export * from './sheetsAuditLog';
export { 
  APPS_SCRIPT_TEMPLATE, 
  APPS_SCRIPT_ADVANCED_PROPERTIES_CODE, 
  APPS_SCRIPT_RECOMMENDED_CODE 
} from './appsScriptTemplate';
