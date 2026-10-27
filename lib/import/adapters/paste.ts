import { guardedAdapter } from '@/lib/security/fileGuard';
import { parseDelimited } from './csv';
export const pasteAdapter = guardedAdapter({ id: 'paste', label: 'Paste data', icon: 'ClipboardPaste', kind: 'structured', accepts: { extensions: ['.txt', '.tsv'], mimeTypes: ['text/plain', 'text/tab-separated-values'] }, parse: (input, options) => parseDelimited(input, options, true) }, ['text']);
