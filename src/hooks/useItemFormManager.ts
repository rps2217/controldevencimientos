import { useState, useCallback, useMemo } from 'react';
import { z } from 'zod';
import { InventoryItem, SheetConfig, SheetProperties, EventCategory, SheetRecord } from '../types';
import { findColumnBySemantic } from '../utils/columnAliases';
import { getEventCategory, getCategoryFromEventValue, formatInputDate, formatInputDateTime, parseLocaleNumber, parseAnyDate, EVENT_CATEGORIES } from '../utils/dateCalculations';
import { autoCalculateItemFormData } from '../utils/referenceResolver';
import { evaluateAppSheetFormula, evaluateBooleanCondition } from '../utils/appSheetFormulaEngine';

interface UseItemFormManagerParams {
  headers: string[];
  activeSheet: SheetProperties | null;
  /** Capacidad de incidencia: relaja la obligatoriedad de SKU en hojas de eventos. */
  canLogEvents: boolean;
  sheetConfig: SheetConfig;
  products: SheetRecord[];
  policies: SheetRecord[];
  eventFilter: string[];
  onBeforeOpen?: () => void;
}

export function useItemFormManager({
  headers,
  activeSheet,
  canLogEvents,
  sheetConfig,
  products,
  policies,
  eventFilter,
  onBeforeOpen
}: UseItemFormManagerParams) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedEventCategory, setSelectedEventCategory] = useState<EventCategory>('VENCIMIENTO');

  const handleSelectEventCategory = useCallback((cat: EventCategory) => {
    setSelectedEventCategory(cat);
    const eventCol = findColumnBySemantic(headers, 'tipo_evento') || headers.find(h => /^frc(_|\s)?even/i.test(h.trim()));
    if (eventCol) {
      const val = EVENT_CATEGORIES[cat]?.rawCode || EVENT_CATEGORIES[cat]?.name || cat;
      setFormData(prev => ({
        ...prev,
        [eventCol]: val
      }));
    }
  }, [headers]);

  const handleOpenModal = useCallback((item?: InventoryItem, prefillSku?: string, initialCategory?: EventCategory) => {
    if (onBeforeOpen) onBeforeOpen();
    setFormErrors({});
    if (item) {
      setEditingItem(item);
      const cat = getEventCategory(item, headers);
      setSelectedEventCategory(cat);
      const initialData: Record<string, string> = {};
      headers.forEach(h => {
        const colSchema = activeSheet ? sheetConfig.schema?.[activeSheet.title]?.[h] : undefined;
        const isDateTime = colSchema?.type === 'datetime' || /timestamp|created_at|fecha_creaci[oó]n|fecha_registro/i.test(h);
        const isDate = colSchema?.type === 'date' || (/fecha|vencimiento|vence|retiro/i.test(h) && !/time/i.test(h));
        const raw = item[h] !== undefined && item[h] !== null ? String(item[h]).trim() : '';

        if (isDateTime && raw) {
          initialData[h] = formatInputDateTime(raw) || raw;
        } else if (isDate && raw) {
          initialData[h] = formatInputDate(raw) || raw;
        } else {
          initialData[h] = raw;
        }
      });
      const calculatedData = autoCalculateItemFormData(initialData, headers, products, policies, sheetConfig, activeSheet?.title);
      setFormData(calculatedData);
    } else {
      setEditingItem(null);
      const cat: EventCategory = initialCategory || (Array.isArray(eventFilter) && eventFilter.length === 1 && (eventFilter[0] in EVENT_CATEGORIES) ? (eventFilter[0] as EventCategory) : 'VENCIMIENTO');
      setSelectedEventCategory(cat);

      const initialData: Record<string, string> = {};
      
      const idVcCol = headers.find(h => /^ID_VC$/i.test(h.trim()));
      const idFrcCol = headers.find(h => /^ID_FRC$/i.test(h.trim()));
      const skuCol = headers.find(h => /sku|código|codigo/i.test(h));
      const eventCol = headers.find(h => /tipo.*evento|evento|tipo.*registro|incidencia|categor[ií]a/i.test(h));
      
      headers.forEach(h => {
        const colSchema = activeSheet ? sheetConfig.schema?.[activeSheet.title]?.[h] : undefined;
        if (colSchema?.initialValue && colSchema.initialValue.trim()) {
          const initRes = evaluateAppSheetFormula(colSchema.initialValue, {
            row: initialData,
            headers,
            products,
            policies
          });
          initialData[h] = initRes.stringValue || colSchema.initialValue;
        } else if (colSchema?.type === 'datetime' || /timestamp|created_at|fecha_creaci[oó]n|fecha_registro|fecha_ingreso/i.test(h)) {
          const now = new Date();
          const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
          initialData[h] = localISO;
        } else {
          initialData[h] = '';
        }
      });
      
      if (idVcCol) {
        initialData[idVcCol] = `VC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      }
      if (idFrcCol) {
        initialData[idFrcCol] = `FRC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      }

      if (eventCol) {
        initialData[eventCol] = EVENT_CATEGORIES[cat]?.name || cat;
      }

      if (prefillSku && skuCol) {
        initialData[skuCol] = prefillSku;
      }
      
      const calculatedData = autoCalculateItemFormData(initialData, headers, products, policies, sheetConfig, activeSheet?.title);
      setFormData(calculatedData);
    }
    setIsModalOpen(true);
  }, [onBeforeOpen, headers, activeSheet, sheetConfig, products, policies, eventFilter]);

  const handleOpenCopyModal = useCallback((item: InventoryItem) => {
    if (onBeforeOpen) onBeforeOpen();
    setFormErrors({});
    
    // We are creating a NEW record based on copy, so editingItem is null
    setEditingItem(null);
    
    const cat = getEventCategory(item, headers);
    setSelectedEventCategory(cat);
    
    const initialData: Record<string, string> = {};
    headers.forEach(h => {
      const colSchema = activeSheet ? sheetConfig.schema?.[activeSheet.title]?.[h] : undefined;
      const isDateTime = colSchema?.type === 'datetime' || /timestamp|created_at|fecha_creaci[oó]n|fecha_registro/i.test(h);
      const isDate = colSchema?.type === 'date' || (/fecha|vencimiento|vence|retiro/i.test(h) && !/time/i.test(h));
      const raw = item[h] !== undefined && item[h] !== null ? String(item[h]).trim() : '';

      if (isDateTime && raw) {
        initialData[h] = formatInputDateTime(raw) || raw;
      } else if (isDate && raw) {
        initialData[h] = formatInputDate(raw) || raw;
      } else {
        initialData[h] = raw;
      }
    });

    // Clear primary key, synthetic, or unique identifier fields
    const keyCol = activeSheet ? Object.keys(sheetConfig.schema?.[activeSheet.title] || {}).find(k => sheetConfig.schema?.[activeSheet.title]?.[k]?.isKey) : undefined;
    
    headers.forEach(h => {
      const isAutoId = h.match(/^ID_VC$/i) || h.match(/^ID_FRC$/i);
      const isUserUnique = h.match(/sku|código|codigo/i) || h === keyCol;
      const isCompositeOrRow = h.match(/^CU_VC$/i) || h.match(/^_row/i);

      if (isAutoId) {
        const prefix = h.match(/VC/i) ? 'VC' : 'FRC';
        initialData[h] = `${prefix}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      } else if (isUserUnique || isCompositeOrRow) {
        initialData[h] = '';
      }
    });

    const calculatedData = autoCalculateItemFormData(initialData, headers, products, policies, sheetConfig, activeSheet?.title);
    setFormData(calculatedData);
    setIsModalOpen(true);
  }, [onBeforeOpen, headers, activeSheet, sheetConfig, products, policies]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({});
    setFormErrors({});
  }, []);

  const validateForm = useCallback((): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!activeSheet) return errors;

    if (!selectedEventCategory) {
      errors.__event_category = 'Debe definir obligatoriamente el tipo de registro / evento.';
    }

    const currentSchema = sheetConfig.schema?.[activeSheet.title] || {};
    const isEventsSheet = canLogEvents || /frc|evento|incidenc|averia|merma|diferencia|transporte/i.test(activeSheet.title);
    
    // Dynamic Zod Schema generation based on our internal types
    const zSchemaShape: Record<string, z.ZodTypeAny> = {};

    headers.forEach(header => {
      const colSchema = currentSchema[header];
      const isDateName = /fecha|vencimiento|vence|retiro/i.test(header) && !/dias|días|cant|stock|unidades|num/i.test(header);
      const effectiveType = colSchema?.type || (isDateName ? 'date' : 'text');
      const isAutoCalculated = Boolean(colSchema?.formula && colSchema.formula.trim()) ||
                               colSchema?.behavior === 'auto_id' || 
                               colSchema?.behavior === 'calc_fecha_vc' || 
                               colSchema?.behavior === 'calc_retiro' || 
                               effectiveType === 'calculated' || 
                               /^ID_VC$/i.test(header.trim()) ||
                               /^ID_FRC$/i.test(header.trim());

      // If auto calculated, we don't strictly validate user input (it's read-only)
      if (isAutoCalculated) {
        zSchemaShape[header] = z.any();
        return;
      }

      // Base string schema
      let fieldSchema: z.ZodTypeAny = z.string().trim();

      const isDateOrTimeCol = effectiveType === 'date' || effectiveType === 'datetime' || (/fecha|vencimiento|vence|retiro|timestamp/i.test(header) && !/dias|días|cant|stock|unidades|num/i.test(header));

      const isRequired = Boolean(
        colSchema?.isKey || 
        colSchema?.required || 
        (!isEventsSheet && !isDateOrTimeCol && /^(sku|c[oó]digo)$/i.test(header.trim()))
      );

      if (!isRequired) {
        fieldSchema = z.string().trim().optional().or(z.literal(''));
      } else {
        fieldSchema = z.string().trim().min(1, 'Este campo es obligatorio.');
      }

      // Type specific validation
      if (effectiveType === 'number' || /^cant|unidades|stock|dias/i.test(header)) {
        fieldSchema = fieldSchema.refine((val: unknown) => {
          if (!isRequired && (!val || String(val).trim() === '' || String(val).trim() === '-')) return true;
          const num = parseLocaleNumber(val);
          return !isNaN(num);
        }, 'Debe ser un número válido.');
      } else if (effectiveType === 'date' || (/fecha|vencimiento|vence|retiro/i.test(header) && !/dias|días|cant|stock|unidades|num/i.test(header))) {
        fieldSchema = fieldSchema.refine((val: unknown) => {
          if (!isRequired && (!val || String(val).trim() === '' || String(val).trim() === '-' || String(val).trim() === 'N/A')) return true;
          return parseAnyDate(val) !== null;
        }, 'Formato de fecha inválido.');
      } else if (effectiveType === 'datetime' || /timestamp/i.test(header)) {
        fieldSchema = fieldSchema.refine((val: unknown) => {
          if (!isRequired && (!val || String(val).trim() === '' || String(val).trim() === '-' || String(val).trim() === 'N/A')) return true;
          return !isNaN(new Date(String(val)).getTime()) || parseAnyDate(val) !== null;
        }, 'Formato de fecha y hora inválido.');
      }

      // Custom validations for Vencimiento
      if (selectedEventCategory === 'VENCIMIENTO') {
        if (/^MM$/i.test(header.trim())) {
          fieldSchema = fieldSchema.refine((val: unknown) => {
            if (!val && !isRequired) return true;
            const num = parseInt(String(val).trim(), 10);
            return !isNaN(num) && num >= 1 && num <= 12;
          }, 'El mes debe estar entre 1 y 12.');
        } else if (/^YYYY$/i.test(header.trim())) {
          fieldSchema = fieldSchema.refine((val: unknown) => {
            if (!val && !isRequired) return true;
            const num = parseInt(String(val).trim(), 10);
            return !isNaN(num) && num >= 1990 && num <= 2100;
          }, 'El año debe ser válido (ej. 2026).');
        }
      }

      // AppSheet Valid_If custom validation rule
      if (colSchema?.validIfRule && colSchema.validIfRule.trim()) {
        const ruleExpr = colSchema.validIfRule.trim();
        const customMsg = colSchema.validIfMessage || `El valor no cumple con la regla de validación: ${ruleExpr}`;
        fieldSchema = fieldSchema.refine((val: unknown) => {
          const rowSnapshot = { ...formData, [header]: String(val ?? '') };
          return evaluateBooleanCondition(ruleExpr, {
            row: rowSnapshot,
            headers,
            products,
            policies
          });
        }, customMsg);
      }

      zSchemaShape[header] = fieldSchema;
    });

    const formSchema = z.object(zSchemaShape).superRefine((data, ctx) => {
      // Cross-field validation: Expiration vs Withdrawal Date
      if (selectedEventCategory === 'VENCIMIENTO') {
        const fechaVcHeader = headers.find(h => /^FECHA_VC$/i.test(h.trim()) || sheetConfig.schema?.[activeSheet.title]?.[h]?.behavior === 'calc_fecha_vc');
        const withdrawalHeader = headers.find(h => /retiro/i.test(h) || sheetConfig.schema?.[activeSheet.title]?.[h]?.behavior === 'calc_retiro');
        
        if (fechaVcHeader && withdrawalHeader) {
          const vcVal = data[fechaVcHeader] as string;
          const retVal = data[withdrawalHeader] as string;
          
          if (vcVal && retVal) {
            const vcDate = parseAnyDate(vcVal);
            const retDate = parseAnyDate(retVal);
            
            if (vcDate && retDate && retDate > vcDate) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'La fecha de retiro no puede ser posterior al vencimiento.',
                path: [withdrawalHeader]
              });
            }
          }
        }
      }
    });

    // Normalize formData so undefined values become empty strings for z.string().trim()
    const normalizedFormData: Record<string, string> = {};
    headers.forEach(h => {
      normalizedFormData[h] = formData[h] !== undefined ? formData[h] : '';
    });

    const parseResult = formSchema.safeParse(normalizedFormData);
    
    if (!parseResult.success) {
      parseResult.error.issues.forEach(issue => {
        const key = issue.path[0] as string;
        if (!errors[key]) {
          errors[key] = issue.message;
        }
      });
    }

    return errors;
  }, [activeSheet, sheetConfig, canLogEvents, headers, selectedEventCategory, formData]);

  const hasFormula = useCallback((colName: string | undefined) => {
    if (!colName || !sheetConfig?.schema) return false;
    return Object.values(sheetConfig.schema).some(s => s?.[colName]?.formula && s[colName].formula.trim());
  }, [sheetConfig?.schema]);

  const handleFormChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let newForm = { ...formData, [name]: value };
    
    if (formErrors[name]) {
      setFormErrors(prev => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }

    const skuCol = findColumnBySemantic(headers, 'sku', sheetConfig?.customAliases) || 
                   headers.find(h => /sku|código|codigo/i.test(h));
    
    if (skuCol && name === skuCol) {
      const descriptionCol = findColumnBySemantic(headers, 'descripcion', sheetConfig?.customAliases);
      const providerCol = findColumnBySemantic(headers, 'proveedor', sheetConfig?.customAliases);
      const policyCol = findColumnBySemantic(headers, 'politica', sheetConfig?.customAliases);
      const diasRetiroCol = findColumnBySemantic(headers, 'dias_retiro', sheetConfig?.customAliases) || 
                            findColumnBySemantic(headers, 'dias_anticipacion', sheetConfig?.customAliases);
      
      if (descriptionCol && !hasFormula(descriptionCol)) newForm[descriptionCol] = '';
      if (providerCol && !hasFormula(providerCol)) newForm[providerCol] = '';
      if (policyCol && !hasFormula(policyCol)) newForm[policyCol] = '';
      if (diasRetiroCol && !hasFormula(diasRetiroCol)) newForm[diasRetiroCol] = '';
    }

    const eventCol = findColumnBySemantic(headers, 'tipo_evento', sheetConfig?.customAliases) || 
                     headers.find(h => /^frc(_|\s)?even/i.test(h.trim()));
    if (eventCol && name === eventCol) {
      const parsedCat = getCategoryFromEventValue(value) || 'VENCIMIENTO';
      setSelectedEventCategory(parsedCat);
    }

    newForm = autoCalculateItemFormData(newForm, headers, products, policies, sheetConfig, activeSheet?.title);
    setFormData(newForm);
  }, [formData, formErrors, headers, sheetConfig, products, policies, hasFormula, activeSheet?.title]);

  const handleBatchFormUpdate = useCallback((updates: Record<string, string>) => {
    let newForm = { ...formData, ...updates };

    const skuCol = findColumnBySemantic(headers, 'sku', sheetConfig?.customAliases) || 
                   headers.find(h => /sku|código|codigo/i.test(h));
    
    if (skuCol && updates[skuCol] !== undefined) {
      const descriptionCol = findColumnBySemantic(headers, 'descripcion', sheetConfig?.customAliases);
      const providerCol = findColumnBySemantic(headers, 'proveedor', sheetConfig?.customAliases);
      const policyCol = findColumnBySemantic(headers, 'politica', sheetConfig?.customAliases);
      const diasRetiroCol = findColumnBySemantic(headers, 'dias_retiro', sheetConfig?.customAliases) || 
                            findColumnBySemantic(headers, 'dias_anticipacion', sheetConfig?.customAliases);
      
      if (descriptionCol && !updates[descriptionCol] && !hasFormula(descriptionCol)) newForm[descriptionCol] = '';
      if (providerCol && !updates[providerCol] && !hasFormula(providerCol)) newForm[providerCol] = '';
      if (policyCol && !updates[policyCol] && !hasFormula(policyCol)) newForm[policyCol] = '';
      if (diasRetiroCol && !updates[diasRetiroCol] && !hasFormula(diasRetiroCol)) newForm[diasRetiroCol] = '';
    }

    const eventCol = findColumnBySemantic(headers, 'tipo_evento', sheetConfig?.customAliases) || 
                     headers.find(h => /^frc(_|\s)?even/i.test(h.trim()));
    if (eventCol && updates[eventCol] !== undefined) {
      const parsedCat = getCategoryFromEventValue(updates[eventCol]) || 'VENCIMIENTO';
      setSelectedEventCategory(parsedCat);
    }

    if (Object.keys(updates).some(k => formErrors[k])) {
      setFormErrors(prev => {
        const next = { ...prev };
        Object.keys(updates).forEach(k => delete next[k]);
        return next;
      });
    }

    newForm = autoCalculateItemFormData(newForm, headers, products, policies, sheetConfig, activeSheet?.title);
    setFormData(newForm);
  }, [formData, formErrors, headers, sheetConfig, products, policies, hasFormula, activeSheet?.title]);

  // El objeto se recreaba en cada render y alimenta ~10 miembros del contexto.
  // Devolver una referencia estable es requisito para que el value del
  // DashboardContext pueda memoizarse (Fase 1).
  return useMemo(() => ({
    isModalOpen,
    setIsModalOpen,
    editingItem,
    setEditingItem,
    formData,
    setFormData,
    formErrors,
    setFormErrors,
    selectedEventCategory,
    setSelectedEventCategory,
    handleOpenModal,
    handleOpenCopyModal,
    handleCloseModal,
    handleSelectEventCategory,
    validateForm,
    handleFormChange,
    handleBatchFormUpdate
  }), [
    isModalOpen, editingItem, formData, formErrors, selectedEventCategory,
    handleOpenModal, handleOpenCopyModal, handleCloseModal, handleSelectEventCategory, validateForm,
    handleFormChange, handleBatchFormUpdate
  ]);
}
