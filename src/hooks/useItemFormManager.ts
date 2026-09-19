import { useState } from 'react';
import { z } from 'zod';
import { InventoryItem, SheetConfig, SheetProperties, EventCategory } from '../types';
import { findColumnBySemantic } from '../utils/columnAliases';
import { getEventCategory, formatInputDate, formatInputDateTime, parseLocaleNumber, parseAnyDate, EVENT_CATEGORIES } from '../utils/dateCalculations';
import { autoCalculateItemFormData } from '../utils/referenceResolver';

interface UseItemFormManagerParams {
  headers: string[];
  activeSheet: SheetProperties | null;
  activeView: string;
  sheetConfig: SheetConfig;
  products: any[];
  policies: any[];
  eventFilter: string[];
  onBeforeOpen?: () => void;
}

export function useItemFormManager({
  headers,
  activeSheet,
  activeView,
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

  const handleSelectEventCategory = (cat: EventCategory) => {
    setSelectedEventCategory(cat);
    const eventCol = findColumnBySemantic(headers, 'tipo_evento') || headers.find(h => /^frc(_|\s)?even/i.test(h.trim()));
    if (eventCol) {
      setFormData(prev => ({
        ...prev,
        [eventCol]: EVENT_CATEGORIES[cat].rawCode || EVENT_CATEGORIES[cat].name
      }));
    }
  };

  const handleOpenModal = (item?: InventoryItem, prefillSku?: string, initialCategory?: EventCategory) => {
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
      const calculatedData = autoCalculateItemFormData(initialData, headers, products, policies, sheetConfig);
      setFormData(calculatedData);
    } else {
      setEditingItem(null);
      const cat: EventCategory = initialCategory || (Array.isArray(eventFilter) && eventFilter.length === 1 && (eventFilter[0] in EVENT_CATEGORIES) ? (eventFilter[0] as EventCategory) : 'VENCIMIENTO');
      setSelectedEventCategory(cat);

      const initialData: Record<string, string> = {};
      
      const idVcCol = headers.find(h => /^ID_VC$/i.test(h.trim()));
      const skuCol = headers.find(h => /sku|código|codigo/i.test(h));
      const eventCol = headers.find(h => /tipo.*evento|evento|tipo.*registro|incidencia|categor[ií]a/i.test(h));
      
      headers.forEach(h => {
        const colSchema = activeSheet ? sheetConfig.schema?.[activeSheet.title]?.[h] : undefined;
        if (colSchema?.type === 'datetime' || /timestamp|created_at|fecha_creaci[oó]n|fecha_registro|fecha_ingreso/i.test(h)) {
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

      if (eventCol) {
        initialData[eventCol] = EVENT_CATEGORIES[cat].name;
      }

      if (prefillSku && skuCol) {
        initialData[skuCol] = prefillSku;
      }
      
      const calculatedData = autoCalculateItemFormData(initialData, headers, products, policies, sheetConfig);
      setFormData(calculatedData);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({});
    setFormErrors({});
  };

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!activeSheet) return errors;

    const currentSchema = sheetConfig.schema?.[activeSheet.title] || {};
    const isEventsSheet = activeView === 'events' || /frc|evento|incidenc|averia|merma|diferencia|transporte/i.test(activeSheet.title);
    
    // Dynamic Zod Schema generation based on our internal types
    const zSchemaShape: Record<string, z.ZodTypeAny> = {};

    headers.forEach(header => {
      const colSchema = currentSchema[header];
      const isDateName = /fecha|vencimiento|vence|retiro/i.test(header) && !/dias|días|cant|stock|unidades|num/i.test(header);
      const effectiveType = colSchema?.type || (isDateName ? 'date' : 'text');
      const isAutoCalculated = colSchema?.behavior === 'auto_id' || 
                               colSchema?.behavior === 'calc_fecha_vc' || 
                               colSchema?.behavior === 'calc_retiro' || 
                               effectiveType === 'calculated' || 
                               /^ID_VC$/i.test(header.trim());

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
      if (effectiveType === 'number' || /^cant|unidades|stock|dias|precio/i.test(header)) {
        fieldSchema = fieldSchema.refine((val: any) => {
          if (!isRequired && (!val || String(val).trim() === '' || String(val).trim() === '-')) return true;
          const num = parseLocaleNumber(val);
          return !isNaN(num);
        }, 'Debe ser un número válido.');
      } else if (effectiveType === 'date' || (/fecha|vencimiento|vence|retiro/i.test(header) && !/dias|días|cant|stock|unidades|num/i.test(header))) {
        fieldSchema = fieldSchema.refine((val: any) => {
          if (!isRequired && (!val || String(val).trim() === '' || String(val).trim() === '-' || String(val).trim() === 'N/A')) return true;
          return parseAnyDate(val) !== null;
        }, 'Formato de fecha inválido.');
      } else if (effectiveType === 'datetime' || /timestamp/i.test(header)) {
        fieldSchema = fieldSchema.refine((val: any) => {
          if (!isRequired && (!val || String(val).trim() === '' || String(val).trim() === '-' || String(val).trim() === 'N/A')) return true;
          return !isNaN(new Date(val).getTime()) || parseAnyDate(val) !== null;
        }, 'Formato de fecha y hora inválido.');
      }

      // Custom validations for Vencimiento
      if (selectedEventCategory === 'VENCIMIENTO') {
        if (/^MM$/i.test(header.trim())) {
          fieldSchema = fieldSchema.refine((val: any) => {
            if (!val && !isRequired) return true;
            const num = parseInt(String(val).trim(), 10);
            return !isNaN(num) && num >= 1 && num <= 12;
          }, 'El mes debe estar entre 1 y 12.');
        } else if (/^YYYY$/i.test(header.trim())) {
          fieldSchema = fieldSchema.refine((val: any) => {
            if (!val && !isRequired) return true;
            const num = parseInt(String(val).trim(), 10);
            return !isNaN(num) && num >= 1990 && num <= 2100;
          }, 'El año debe ser válido (ej. 2026).');
        }
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
    const normalizedFormData: Record<string, any> = {};
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
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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
      
      if (descriptionCol) newForm[descriptionCol] = '';
      if (providerCol) newForm[providerCol] = '';
      if (policyCol) newForm[policyCol] = '';
      if (diasRetiroCol) newForm[diasRetiroCol] = '';
    }

    newForm = autoCalculateItemFormData(newForm, headers, products, policies, sheetConfig);
    setFormData(newForm);
  };

  const handleBatchFormUpdate = (updates: Record<string, string>) => {
    let newForm = { ...formData, ...updates };

    const skuCol = findColumnBySemantic(headers, 'sku', sheetConfig?.customAliases) || 
                   headers.find(h => /sku|código|codigo/i.test(h));
    
    if (skuCol && updates[skuCol] !== undefined) {
      const descriptionCol = findColumnBySemantic(headers, 'descripcion', sheetConfig?.customAliases);
      const providerCol = findColumnBySemantic(headers, 'proveedor', sheetConfig?.customAliases);
      const policyCol = findColumnBySemantic(headers, 'politica', sheetConfig?.customAliases);
      const diasRetiroCol = findColumnBySemantic(headers, 'dias_retiro', sheetConfig?.customAliases) || 
                            findColumnBySemantic(headers, 'dias_anticipacion', sheetConfig?.customAliases);
      
      if (descriptionCol && !updates[descriptionCol]) newForm[descriptionCol] = '';
      if (providerCol && !updates[providerCol]) newForm[providerCol] = '';
      if (policyCol && !updates[policyCol]) newForm[policyCol] = '';
      if (diasRetiroCol && !updates[diasRetiroCol]) newForm[diasRetiroCol] = '';
    }

    if (Object.keys(updates).some(k => formErrors[k])) {
      setFormErrors(prev => {
        const next = { ...prev };
        Object.keys(updates).forEach(k => delete next[k]);
        return next;
      });
    }

    newForm = autoCalculateItemFormData(newForm, headers, products, policies, sheetConfig);
    setFormData(newForm);
  };

  return {
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
    handleCloseModal,
    handleSelectEventCategory,
    validateForm,
    handleFormChange,
    handleBatchFormUpdate
  };
}
