import React, { useState, useEffect, useMemo } from 'react';
import { MessageSquare, X, Send, ExternalLink, Sparkles, UserCheck, PhoneCall, AlertCircle } from 'lucide-react';
import { findPhoneColumn } from '../../utils/columnAliases';
import { formatPhoneNumber } from '../../utils/pureCalculations';
import type { InventoryItem } from '../../types';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: InventoryItem[];
  headers: string[];
  activeViewTitle?: string;
  customAliases?: Record<string, string[]>;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  selectedItems,
  headers,
  customAliases,
}) => {
  const [selectedContactIndex, setSelectedContactIndex] = useState<number>(0);
  const [messageText, setMessageText] = useState<string>('');

  const phoneColumn = useMemo(() => {
    return findPhoneColumn(headers, customAliases);
  }, [headers, customAliases]);

  const nameColumn = useMemo(() => {
    return headers.find(h => /nombre|name|contacto|razon|cliente|proveedor/i.test(h)) || headers[0];
  }, [headers]);

  const validContacts = useMemo(() => {
    return selectedItems.filter(item => {
      const ph = phoneColumn ? item[phoneColumn] : '';
      return ph && String(ph).trim() !== '';
    });
  }, [selectedItems, phoneColumn]);

  const currentContact = validContacts[selectedContactIndex] || selectedItems[0];
  const currentPhone = phoneColumn && currentContact ? formatPhoneNumber(currentContact[phoneColumn]) : '';
  const currentName = nameColumn && currentContact ? String(currentContact[nameColumn] || 'Contacto') : 'Contacto';

  // Quick message template generator
  const applyTemplate = (templateType: 'vencimiento' | 'canje' | 'incidencia') => {
    const sku = currentContact?.SKU || currentContact?.sku || '';
    const desc = currentContact?.DESCRIPCION || currentContact?.descripcion || 'producto';
    const cant = currentContact?.CANTIDAD || currentContact?.cantidad || '';

    if (templateType === 'vencimiento') {
      setMessageText(`Estimado/a ${currentName}, le contactamos respecto al producto ${desc} (SKU: ${sku}). Favor coordinar retiro preventivo de ${cant} unidades.`);
    } else if (templateType === 'canje') {
      setMessageText(`Hola ${currentName}, requerimos gestionar el canje con proveedor para ${desc} (SKU: ${sku}, Cantidad: ${cant}). Quedamos atentos a la confirmación de retiro.`);
    } else if (templateType === 'incidencia') {
      setMessageText(`Estimado/a, reportamos incidencia operacional referente a ${desc} (SKU: ${sku}). Se solicita revisión urgente de este registro.`);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedContactIndex(0);
      if (validContacts.length > 0 && !messageText) {
        applyTemplate('vencimiento');
      }
    }
  }, [isOpen, validContacts]);

  const handleSendWhatsApp = (contactItem?: InventoryItem) => {
    const targetItem = contactItem || currentContact;
    if (!targetItem) return;

    const rawPhone = phoneColumn ? formatPhoneNumber(targetItem[phoneColumn]) : '';
    if (!rawPhone) {
      alert('El contacto seleccionado no cuenta con un número de teléfono válido.');
      return;
    }

    const url = `https://wa.me/${rawPhone}?text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');
  };

  const handleSendAll = () => {
    if (validContacts.length === 0) return;

    validContacts.forEach((item, idx) => {
      const rawPhone = phoneColumn ? formatPhoneNumber(item[phoneColumn]) : '';
      if (rawPhone) {
        const url = `https://wa.me/${rawPhone}?text=${encodeURIComponent(messageText)}`;
        setTimeout(() => {
          window.open(url, '_blank');
        }, idx * 600);
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl max-w-lg w-full overflow-hidden flex flex-col transition-all">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Gestión de Mensajes WhatsApp
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Envío de notificaciones directas a contactos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {/* Status Badge */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5 font-medium">
              <UserCheck className="w-4 h-4 text-emerald-500" />
              {validContacts.length} con teléfono de {selectedItems.length} seleccionado(s)
            </span>
            {validContacts.length === 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                <AlertCircle className="w-3.5 h-3.5" /> Sin teléfonos detectados
              </span>
            )}
          </div>

          {/* Contact Selector */}
          {validContacts.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Contacto Seleccionado ({selectedContactIndex + 1} de {validContacts.length})
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-all"
                value={selectedContactIndex}
                onChange={(e) => setSelectedContactIndex(Number(e.target.value))}
              >
                {validContacts.map((item, idx) => (
                  <option key={idx} value={idx}>
                    {nameColumn ? String(item[nameColumn] || `Contacto ${idx + 1}`) : `Contacto ${idx + 1}`} ({phoneColumn ? item[phoneColumn] : 'Sin teléfono'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Current Contact Preview Card */}
          {currentContact && (
            <div className="p-3.5 bg-gradient-to-r from-slate-50 to-emerald-50/30 dark:from-slate-800/60 dark:to-emerald-950/20 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-900 dark:text-slate-100">{currentName}</span>
                <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-1">
                  <PhoneCall className="w-3 h-3 text-emerald-500" />
                  {currentPhone || 'Sin número registrado'}
                </span>
              </div>
              {currentPhone && (
                <button
                  onClick={() => handleSendWhatsApp(currentContact)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Enviar Directo
                </button>
              )}
            </div>
          )}

          {/* Template Shortcuts */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" /> Plantillas Rápidas
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyTemplate('vencimiento')}
                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
              >
                Aviso Retiro
              </button>
              <button
                type="button"
                onClick={() => applyTemplate('canje')}
                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
              >
                Canje Proveedor
              </button>
              <button
                type="button"
                onClick={() => applyTemplate('incidencia')}
                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
              >
                Incidencia
              </button>
            </div>
          </div>

          {/* Message Textarea */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Contenido del Mensaje
            </label>
            <textarea
              rows={4}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 leading-relaxed resize-none transition-all font-medium"
              placeholder="Escribe el cuerpo del mensaje..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
          
          <div className="flex items-center gap-2">
            {validContacts.length > 1 && (
              <button
                onClick={handleSendAll}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Enviar a Todos ({validContacts.length})
              </button>
            )}
            <button
              onClick={() => handleSendWhatsApp()}
              disabled={!currentPhone}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:cursor-not-allowed shadow-xs"
            >
              <Send className="w-3.5 h-3.5" /> Abrir WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

