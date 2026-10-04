import { InventoryItem, SheetRecord } from '../types';
import { getFieldLabel } from '../utils/columnAliases';
import { formatDisplayDate } from '../utils/pureCalculations';

export function escapeHtml(str: string | undefined | null): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatVirtualHeaderLabel(header: string, customAliases?: Record<string, string[]>): string {
  return getFieldLabel(header, customAliases);
}

export function generateItemsHtmlTable(
  items: InventoryItem[],
  headers: string[],
  customAliases?: Record<string, string[]>,
  _options?: { allMainItems?: SheetRecord[]; products?: SheetRecord[]; policies?: SheetRecord[] },
  overrideVisibleColumns?: string[]
): string {
  if (!items || items.length === 0) return '<p>No hay registros seleccionados.</p>';
  const cols = overrideVisibleColumns && overrideVisibleColumns.length > 0 ? overrideVisibleColumns : headers;

  const ths = cols
    .map(h => `<th style="padding: 8px 12px; text-align: left; background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase;">${escapeHtml(getFieldLabel(h, customAliases))}</th>`)
    .join('');

  const trs = items.map((item, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const tds = cols.map(h => {
      let val = item[h];
      if (val instanceof Date) {
        val = formatDisplayDate(val);
      } else if (val === undefined || val === null) {
        val = '';
      }
      return `<td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b;">${escapeHtml(String(val))}</td>`;
    }).join('');
    return `<tr style="background-color: ${bg};">${tds}</tr>`;
  }).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <thead>
        <tr>${ths}</tr>
      </thead>
      <tbody>
        ${trs}
      </tbody>
    </table>
  `;
}

export interface GmailDraftPayload {
  to?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
}

export function createMimeMessage(options: { to?: string; subject?: string; bodyHtml?: string; bodyText?: string }): string {
  const rawTo = options.to || '';
  const cleanTo = rawTo.replace(/[\r\n]+/g, ' ');
  const rawSubject = options.subject || '';
  const cleanSubject = rawSubject.replace(/[\r\n]+/g, ' ');
  const bodyHtml = options.bodyHtml || '';
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(cleanSubject)))}?=`;
  const emailLines = [
    `To: ${cleanTo}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    bodyHtml
  ];
  const mimeStr = emailLines.join('\r\n');
  return btoa(unescape(encodeURIComponent(mimeStr)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createGmailDraft(
  accessToken: string,
  arg2: string | GmailDraftPayload,
  subject?: string,
  htmlBody?: string
): Promise<{ id: string }> {
  if (!accessToken) {
    throw new Error('No hay Token de Acceso de Google OAuth2 activo.');
  }

  let toEmail = '';
  let sub = '';
  let body = '';

  if (typeof arg2 === 'object' && arg2 !== null) {
    toEmail = arg2.to || '';
    sub = arg2.subject || '';
    body = arg2.bodyHtml || arg2.bodyText || '';
  } else {
    toEmail = arg2 || '';
    sub = subject || '';
    body = htmlBody || '';
  }

  const encodedEmail = createMimeMessage({ to: toEmail, subject: sub, bodyHtml: body });

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        raw: encodedEmail
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg = errorData?.error?.message || `Error HTTP ${response.status}: ${response.statusText}`;
    throw new Error(`Fallo al crear borrador en Gmail: ${msg}`);
  }

  return await response.json();
}
