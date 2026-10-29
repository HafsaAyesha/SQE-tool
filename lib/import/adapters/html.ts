import { safeFetch } from '@/lib/security/urlGuard';
import { guardedAdapter } from '@/lib/security/fileGuard';
import { ImportError } from '../errors';
import { parseHtmlSource } from '../htmlExtraction';
export const htmlAdapter = guardedAdapter({ id: 'html', label: 'Web page table', icon: 'Table2', kind: 'online', accepts: { extensions: [], mimeTypes: [] }, async parse(input, options) {
  if (typeof input !== 'string') throw new ImportError('Enter a public web page URL.');
  const result = await safeFetch(input, { headerName: options?.headerName, apiKey: options?.apiKey });
  return parseHtmlSource(result.bytes, options);
} });
