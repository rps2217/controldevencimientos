import React, { useState, useEffect, useMemo } from 'react';
import { Mail, X, Check, Copy, Download, ExternalLink, Loader2, Sparkles, AlertCircle, FileText, Send, User, Columns, Plus, RotateCcw } from 'lucide-react';
import { 
  createGmailDraft, 
  generateItemsHtmlTable,
  formatVirtualHeaderLabel,
  escapeHtml
} from '../../lib/gmailService';

declare global {
  interface Window {
    google?: any;
    __GOOGLE_CLIENT_ID__?: string;
  }
}

interface GmailDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: any[];
  headers: string[];
  customAliases?: Record<string, string[]>;
  activeViewTitle?: string;
  allMainItems?: any[];
  products?: any[];
  policies?: any[];
}

export const GmailDraftModal: React.FC<GmailDraftModalProps> = ({
  isOpen,
  onClose,
  selectedItems,
  headers,
  customAliases,
  activeViewTitle = 'Vencimientos e Incidencias',
  allMainItems,
  products,
  policies
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [introText, setIntroText] = useState('');
  const [footerText, setFooterText] = useState('');
  
  // Clean table headers available for selection
  const availableColumns = useMemo(() => {
    const rawCols = (headers && headers.length > 0)
      ? headers
      : (selectedItems[0] ? Object.keys(selectedItems[0]) : []);
    return rawCols.filter(h => !h.startsWith('_virtual_acciones') && h !== '_rowIndex');
  }, [headers, selectedItems]);

  // Selected table columns (1:1 with actual sheet headers)
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Initialize defaults on open
  useEffect(() => {
    if (isOpen) {
      setDraftSuccess(null);
      setErrorMessage(null);
      setVisibleColumns(availableColumns);
      
      const count = selectedItems.length;
      const todayStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      
      setSubject(`[Notificación Logística] Detalle de ${count} producto(s) - ${todayStr}`);
      setIntroText(`Estimados,\n\nJunto con saludar, comparto el detalle de los productos seleccionados (${activeViewTitle}) para su revisión, gestión de canje o retiro preventivo:`);
      setFooterText(`Quedamos atentos a la confirmación de la fecha de retiro o recepción de la orden de cambio.\n\nSaludos cordiales,`);
      
      // Auto detect email if present in any selected item field
      let detectedEmail = '';
      for (const item of selectedItems) {
        for (const val of Object.values(item)) {
          if (typeof val === 'string' && val.includes('@') && val.includes('.')) {
            detectedEmail = val.trim();
            break;
          }
        }
        if (detectedEmail) break;
      }
      setToEmail(detectedEmail);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => {
      if (prev.includes(col)) {
        return prev.filter(k => k !== col);
      } else {
        return [...prev, col];
      }
    });
  };

  const removeColumn = (col: string) => {
    setVisibleColumns(prev => prev.filter(k => k !== col));
  };

  const resetDefaultColumns = () => {
    setVisibleColumns(availableColumns);
  };

  const selectAllColumns = () => {
    setVisibleColumns(availableColumns);
  };

  const clearAllColumns = () => {
    setVisibleColumns([]);
  };

  const tableHtml = visibleColumns.length > 0 ? generateItemsHtmlTable(
    selectedItems, 
    headers, 
    customAliases, 
    {
      allMainItems,
      products,
      policies
    },
    visibleColumns
  ) : '';

  const safeIntro = escapeHtml(introText);
  const safeFooter = escapeHtml(footerText);

  const fullHtmlBody = `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #111827; line-height: 1.5; text-align: left; margin: 0; padding: 0;">
      <p style="white-space: pre-line; margin: 0 0 16px 0; color: #111827; font-size: 14px; line-height: 1.5; text-align: left;">${safeIntro}</p>
      ${tableHtml}
      <p style="white-space: pre-line; margin: 16px 0 0 0; color: #111827; font-size: 14px; line-height: 1.5; text-align: left;">${safeFooter}</p>
      <p style="margin: 24px 0 0 0; font-size: 11px; color: #94a3b8; font-style: italic; text-align: left;">Generado automáticamente desde el Gestor de Vencimientos e Incidencias.</p>
    </div>
  `;

  const requestGoogleToken = (onSuccess: (token: string) => void) => {
    setErrorMessage(null);
    const clientId = window.__GOOGLE_CLIENT_ID__;

    if (window.google?.accounts?.oauth2 && clientId) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/gmail.compose',
          callback: (response: any) => {
            if (response.error) {
              setErrorMessage('Error al autorizar con Google: ' + response.error);
              return;
            }
            if (response.access_token) {
              setAccessToken(response.access_token);
              onSuccess(response.access_token);
            }
          },
        });
        client.requestAccessToken();
        return;
      } catch (err: any) {
        console.error('GIS Error:', err);
      }
    }

    // Fallback if client_id is not available yet or GIS script is loading
    const userToken = prompt('Por favor, ingresa tu Access Token de Google OAuth:');
    if (userToken) {
      setAccessToken(userToken);
      onSuccess(userToken);
    } else {
      setErrorMessage('No se obtuvo token de acceso de Google.');
    }
  };

  const handleSendDraftWithToken = async (token: string) => {
    try {
      setIsCreatingDraft(true);
      setErrorMessage(null);
      await createGmailDraft(token, {
        to: toEmail.trim(),
        subject: subject.trim(),
        bodyHtml: fullHtmlBody,
        bodyText: `${introText}${visibleColumns.length > 0 ? '\n\n[Ver tabla adjunta en HTML]\n\n' : '\n\n'}${footerText}`
      });
      setDraftSuccess('¡Borrador creado exitosamente en tu cuenta de Gmail!');
    } catch (err: any) {
      console.error(err);
      if (err.message && (err.message.includes('401') || err.message.includes('Invalid Credentials'))) {
        setAccessToken(null);
        setErrorMessage('La sesión expiró. Por favor, vuelve a intentar autorizar.');
      } else {
        setErrorMessage(err.message || 'Error al crear el borrador en Gmail.');
      }
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleCreateDraft = () => {
    if (accessToken) {
      handleSendDraftWithToken(accessToken);
    } else {
      requestGoogleToken((token) => {
        handleSendDraftWithToken(token);
      });
    }
  };

  const handleCopyRichText = async () => {
    try {
      // 1. Modern Async Clipboard API with text/html MIME type
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const typeHtml = 'text/html';
        const typePlain = 'text/plain';
        const blobHtml = new Blob([fullHtmlBody], { type: typeHtml });
        const plainTextFallback = `${introText}\n\n[Tabla de ${selectedItems.length} ítems adjunta]\n\n${footerText}`;
        const blobPlain = new Blob([plainTextFallback], { type: typePlain });
        
        const data = [
          new ClipboardItem({
            [typeHtml]: blobHtml,
            [typePlain]: blobPlain
          })
        ];
        await navigator.clipboard.write(data);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
        return;
      }
    } catch (e) {
      console.warn('Async ClipboardItem write failed, trying DOM selection fallback:', e);
    }

    // 2. DOM Selection fallback (ensures rich formatting in all browser environments)
    try {
      const container = document.createElement('div');
      container.innerHTML = fullHtmlBody;
      container.style.position = 'fixed';
      container.style.pointerEvents = 'none';
      container.style.opacity = '0';
      container.style.left = '-9999px';
      document.body.appendChild(container);

      const range = document.createRange();
      range.selectNodeContents(container);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
        const successful = document.execCommand('copy');
        selection.removeAllRanges();
        document.body.removeChild(container);
        if (successful) {
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
          return;
        }
      }
      if (container.parentNode) document.body.removeChild(container);
    } catch (domErr) {
      console.error('DOM copy fallback failed:', domErr);
    }

    // 3. Last fallback: plain text
    try {
      await navigator.clipboard.writeText(fullHtmlBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Copy failed completely:', err);
    }
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([fullHtmlBody], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Borrador_Productos_${selectedItems.length}_items.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Crear Borrador en Gmail</h3>
                <span className="bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-bold px-2 py-0.5 rounded-full">
                  {selectedItems.length} ítems
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Personaliza la información antes de generar el correo en tu bandeja</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs & Account Bar */}
        <div className="px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Vista Previa del Correo</span>
            </button>
            <button
              onClick={() => setActiveTab('edit')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'edit'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Editar Textos</span>
            </button>
          </div>

          {/* Token / Auth indicator */}
          <div className="flex items-center gap-2">
            {accessToken ? (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 px-3 py-1 rounded-xl text-xs font-medium">
                <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-bold">Google Conectado</span>
                <button
                  onClick={() => setAccessToken(null)}
                  className="text-slate-400 hover:text-red-500 ml-1 text-[10px] underline"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                onClick={() => requestGoogleToken(() => {})}
                className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-2 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span>Conectar con Google</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {draftSuccess && (
            <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 flex items-center justify-between gap-3 text-emerald-800 dark:text-emerald-200 text-sm">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <p className="font-bold">{draftSuccess}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Puedes abrir tu cuenta de Gmail para revisar y enviar el correo cuando lo desees.</p>
                </div>
              </div>
              <a
                href="https://mail.google.com/mail/u/0/#drafts"
                target="_blank"
                rel="noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 transition-all shrink-0 shadow-sm"
              >
                <span>Ir a Borradores</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {errorMessage && (
            <div className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center gap-3 text-red-800 dark:text-red-200 text-sm">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form Top Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Para (Destinatario / Proveedor):
              </label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="ejemplo@proveedor.com, bodega@empresa.com"
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Asunto del Correo:
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Asunto del correo"
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Tab View */}
          {activeTab === 'edit' ? (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Texto de Encabezado (Introducción):
                </label>
                <textarea
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                  rows={3}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 leading-relaxed font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Texto de Cierre (Firma / Despedida):
                </label>
                <textarea
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  rows={3}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 leading-relaxed font-sans"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Previsualización del Correo a Generar
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                  Así lucirá exactamente en Gmail
                </span>
              </div>

              {/* Interactive Column Selector */}
              <div className="bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <Columns className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Columnas de la Tabla ({visibleColumns.length}/{availableColumns.length})</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={clearAllColumns}
                      className="text-[11px] font-semibold text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 flex items-center gap-1 transition-colors"
                      title="Quitar todas las columnas"
                    >
                      <X className="w-3 h-3" />
                      <span>Sin Tabla</span>
                    </button>
                    <button
                      onClick={resetDefaultColumns}
                      className="text-[11px] font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
                      title="Seleccionar todas las columnas"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Todas</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {availableColumns.map((col) => {
                    const isSelected = visibleColumns.includes(col);
                    const isVirtual = col.startsWith('_virtual_');
                    const label = isVirtual ? formatVirtualHeaderLabel(col) : col;
                    return (
                      <button
                        key={col}
                        onClick={() => toggleColumn(col)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white shadow-xs font-semibold'
                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                        }`}
                      >
                        {isSelected ? (
                          <Check className="w-3 h-3 text-white stroke-[2.5]" />
                        ) : (
                          <Plus className="w-3 h-3 text-slate-400" />
                        )}
                        <span>{label}</span>
                        {isSelected && visibleColumns.length > 1 && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              removeColumn(col);
                            }}
                            className="ml-0.5 hover:bg-blue-700 rounded p-0.5 text-blue-100 hover:text-white"
                            title="Quitar columna"
                          >
                            <X className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rendered HTML Container (Email Paper Canvas Preview) */}
              <div className="bg-white text-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-md max-h-[420px] overflow-y-auto">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3 pb-2 border-b border-slate-200 flex items-center justify-between">
                  <span>Borrador de Correo (Vista Previa)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Formato Gmail / Outlook</span>
                </div>
                <div 
                  className="prose max-w-none text-slate-900 leading-relaxed font-sans"
                  dangerouslySetInnerHTML={{ __html: fullHtmlBody }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyRichText}
              className={`border font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                copied
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
              title="Copia el contenido con formato visual (tabla, colores y bordes) listo para pegar con Ctrl+V en Gmail o Outlook"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '¡Copiado con formato!' : 'Copiar (Pegar en Correo)'}</span>
            </button>
            <button
              onClick={handleDownloadHtml}
              className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar HTML</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateDraft}
              disabled={isCreatingDraft}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-red-500/20 transition-all"
            >
              {isCreatingDraft ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Crear Borrador en Gmail</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
