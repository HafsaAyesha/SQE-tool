import { safeFetch, parsePublicUrl } from '@/lib/security/urlGuard';
import { guardedAdapter } from '@/lib/security/fileGuard';
import { ImportError } from '../errors';
import { csvAdapter } from './csv';
export function googleSheetExport(input: string) {
  const { url } = parsePublicUrl(input);
  const original = new URL(input);
  if (url.hostname !== 'docs.google.com' || url.protocol !== 'https:') throw new ImportError('Use a public Google Sheets share link from docs.google.com.');
  const published = url.pathname.match(/^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\/pub(?:html)?\/?$/);
  const shared = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (!published && (!shared || shared[1] === 'e')) throw new ImportError('This is not a supported Google Sheets share link.');
  const target = new URL(published ? `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub` : `https://docs.google.com/spreadsheets/d/${shared![1]}/export`);
  target.searchParams.set(published ? 'output' : 'format', 'csv');
  const gid = url.searchParams.get('gid') ?? new URLSearchParams(original.hash.slice(1)).get('gid');
  if (gid !== null) { if (!/^\d{1,20}$/.test(gid)) throw new ImportError('The Google Sheets tab identifier is invalid.'); target.searchParams.set('gid', gid); }
  return target.href;
}
export const gsheetsAdapter = guardedAdapter({ id: 'gsheets', label: 'Google Sheets', icon: 'FileSpreadsheet', kind: 'online', accepts: { extensions: [], mimeTypes: [] }, async parse(input, options) {
  if (typeof input !== 'string') throw new ImportError('Enter a Google Sheets share URL.');
  const result = await safeFetch(googleSheetExport(input), { headerName: options?.headerName, apiKey: options?.apiKey, maxRedirects: 3, redirectHosts: host => host === 'docs.google.com' || host.endsWith('.googleusercontent.com') });
  if (result.contentType.includes('html')) throw new ImportError('This sheet is not publicly downloadable. Enable link sharing or publish the sheet.');
  const table = await csvAdapter.parse(result.bytes, { fileName: 'google-sheet.csv', mimeType: 'text/csv' });
  return { ...table, meta: { ...table.meta, sourceType: 'gsheets' } };
} });
