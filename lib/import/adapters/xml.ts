import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { decodeText, guardedAdapter, rejectDTD } from '@/lib/security/fileGuard';
import { ImportError } from '../errors';
import { atPointer, findObjectArrays, inputBytes, inputName, objectRecord, tableFromRecords } from '../table';
export function parseXmlText(text: string): unknown {
  rejectDTD(text);
  let depth = 0;
  for (const match of text.matchAll(/<[^>]*>/g)) {
    const tag = match[0];
    if (/^<[!?]/.test(tag) || /\/>$/.test(tag)) continue;
    depth += tag.startsWith('</') ? -1 : 1;
    if (depth > 64) throw new ImportError('This XML is too deeply nested. Export a simpler document.');
  }
  if (XMLValidator.validate(text) !== true) throw new ImportError('This XML is not well formed. Check the tags and export it again.');
  return new XMLParser({ processEntities: false, removeNSPrefix: true, ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: true }).parse(text) as unknown;
}
export const xmlAdapter = guardedAdapter({ id: 'xml', label: 'XML', icon: 'FileCode', kind: 'structured', accepts: { extensions: ['.xml'], mimeTypes: ['application/xml', 'text/xml'] }, async parse(input, options) {
  const root = parseXmlText(decodeText(await inputBytes(input)));
  const paths = findObjectArrays(root);
  let rows: unknown = paths.length ? atPointer(root, options?.jsonPath ?? paths[0]) : root;
  if (options?.jsonPath !== undefined && !paths.includes(options.jsonPath)) throw new ImportError('Choose one of the available XML data paths.');
  if (!paths.length) {
    // A single-record XML document may have no repeated elements.
    for (let depth = 0; depth < 40 && objectRecord(rows) && Object.keys(rows).length === 1; depth++) { const child: unknown = Object.values(rows)[0]; if (objectRecord(child)) rows = child; else break; }
    if (objectRecord(rows) && Object.values(rows).every(value => !objectRecord(value) && !Array.isArray(value))) rows = [rows];
  }
  if (!Array.isArray(rows) || !rows.every(objectRecord)) throw new ImportError('No repeated records were found in this XML. Export a table of cost items.');
  return tableFromRecords(rows, { sourceType: 'xml', fileName: inputName(input, options), warnings: paths.length > 1 && options?.jsonPath === undefined ? ['Multiple tables were found. Confirm the data path before continuing.'] : [], ...(paths.length ? { jsonPaths: paths } : {}) });
} }, ['xml', 'msproject']);
