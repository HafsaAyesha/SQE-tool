import type { ImportAdapter, AdapterDescriptor } from './adapters/types';
import type { ParseOptions } from './schema';
import { extension, guardedAdapter, inspectFile } from '@/lib/security/fileGuard';
import { csvAdapter } from './adapters/csv';
import { excelAdapter } from './adapters/excel';
import { jsonAdapter } from './adapters/json';
import { xmlAdapter } from './adapters/xml';
import { msprojectAdapter } from './adapters/msproject';
import { gsheetsAdapter } from './adapters/gsheets';
import { urlAdapter } from './adapters/url';
import { htmlAdapter } from './adapters/html';
import { pasteAdapter } from './adapters/paste';
const adapters = new Map<string, ImportAdapter>();
export function registerAdapter(adapter: ImportAdapter) {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(adapter.id) || adapters.has(adapter.id)) throw new Error('Importer IDs must be valid and unique.');
  adapters.set(adapter.id, guardedAdapter(adapter));
}
export function listAdapters(): ImportAdapter[] { return [...adapters.values()]; }
export function adapterDescriptors(): AdapterDescriptor[] { return listAdapters().map(({ id, label, icon, accepts, kind }) => ({ id, label, icon, accepts, kind })); }
export function getAdapter(id: string) { return adapters.get(id) ?? null; }
export async function getAdapterFor(input: File | Buffer | string, options?: ParseOptions): Promise<ImportAdapter | null> {
  const file = await inspectFile(input, options);
  const all = listAdapters().filter(adapter => adapter.id !== 'paste' && adapter.kind !== 'online');
  const byMagic = file.format === 'msproject' ? getAdapter('msproject') : file.format === 'xml' ? getAdapter('xml') : file.format === 'json' ? getAdapter('json') : file.format !== 'text' ? all.find(adapter => adapter.accepts.extensions.some(ext => ext === `.${file.format}` || file.format === 'jpeg' && ext === '.jpg')) : null;
  if (byMagic) return byMagic;
  const compatible = all.filter(adapter => file.format !== 'text' || adapter.accepts.extensions.some(ext => ['.csv', '.tsv', '.txt', '.json', '.xml'].includes(ext)));
  return compatible.find(adapter => file.mimeType && adapter.accepts.mimeTypes.includes(file.mimeType)) ?? compatible.find(adapter => adapter.accepts.extensions.includes(`.${extension(file.fileName)}`)) ?? null;
}
for (const adapter of [csvAdapter, excelAdapter, jsonAdapter, xmlAdapter, msprojectAdapter, pasteAdapter, gsheetsAdapter, urlAdapter, htmlAdapter]) registerAdapter(adapter);
