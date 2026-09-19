import React, { useState, useEffect, useMemo } from 'react';
import { MessageSquare, X, Send, ExternalLink } from 'lucide-react';
import { findPhoneColumn } from '../../utils/columnAliases';
import { formatPhoneNumber } from '../../utils/pureCalculations';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: any[];
  headers: string[];
  activeViewTitle?: string;
  customAliases?: Record<string, string[]>;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  selectedItems,
  headers,
  activeViewTitle = 'Contactos',
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

  useEffect(() => {
    if (isOpen) {
      setSelectedContactIndex(0);
      setMessageText('');
    }
  }, [isOpen]);

  const validContacts = useMemo(() => {
    return selectedItems.filter(item => {
      const ph = phoneColumn ? item[phoneColumn] : '';
      return ph && String(ph).trim() !== '';
    });
  }, [selectedItems, phoneColumn]);

  const currentContact = validContacts[selectedContactIndex] || selectedItems[0];
  const currentPhone = phoneColumn && currentContact ? formatPhoneNumber(currentContact[phoneColumn]) : '';
  const currentName = nameColumn && currentContact ? String(currentContact[nameColumn] || 'Contacto') : 'Contacto';

  const handleSendWhatsApp = (contactItem?: any) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Enviar Mensaje de WhatsApp
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {validContacts.length} contacto(s) con teléfono válido de {selectedItems.length} seleccionado(s)
          </div>

          {/* Contact Selector */}
          {validContacts.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Contacto Actual ({selectedContactIndex + 1} de {validContacts.length})
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
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
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-950 dark:text-slate-50">{currentName}</span>
                <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">{currentPhone || 'Sin teléfono'}</span>
              </div>
              {currentPhone && (
                <button
                  onClick={() => handleSendWhatsApp(currentContact)}
                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 text-emerald-700 font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Send className="w-3 h-3" /> Enviar
                </button>
              )}
            </div>
          )}

          {/* Message Area */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Mensaje a Enviar
            </label>
            <textarea
              rows={4}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed resize-none"
              placeholder="Escribe el cuerpo del mensaje..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
          
          <div className="flex items-center gap-2">
            {validContacts.length > 1 && (
              <button
                onClick={handleSendAll}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Enviar a Todos ({validContacts.length})
              </button>
            )}
            <button
              onClick={() => handleSendWhatsApp()}
              disabled={!currentPhone}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" /> Enviar WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
