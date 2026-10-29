import { safeFetch } from '@/lib/security/urlGuard';
import { guardedAdapter, decodeText } from '@/lib/security/fileGuard';
import { ImportError } from '../errors';
import { parseHtmlSource } from '../htmlExtraction';
import { csvAdapter } from './csv';
import { jsonAdapter } from './json';
export const urlAdapter = guardedAdapter({ id: 'url', label: 'JSON / CSV / REST API', icon: 'Globe', kind: 'online', accepts: { extensions: [], mimeTypes: [] }, async parse(input, options) {
  if (typeof input !== 'string') throw new ImportError('Enter a public JSON or CSV URL.');
  const result = await safeFetch(input, { headerName: options?.headerName, apiKey: options?.apiKey });
  const text = decodeText(result.bytes).trimStart();
  if (result.contentType.includes('html') || /^<(?:!doctype\s+html|html\b)/i.test(text)) {
    if (!options?.autoDetect) throw new ImportError('This URL contains a web page. Choose Web page table as its source type.');
    return parseHtmlSource(result.bytes, options);
  }
  if (/^[\[{]/.test(text) || result.contentType.includes('json')) {
    const table = await jsonAdapter.parse(result.bytes, { fileName: 'remote-source.json', jsonPath: options?.jsonPath });
    return { ...table, meta: { ...table.meta, sourceType: 'url' } };
  }
  const table = await csvAdapter.parse(result.bytes, { fileName: 'remote-source.csv', mimeType: result.contentType });
  return { ...table, meta: { ...table.meta, sourceType: 'url' } };
} });
