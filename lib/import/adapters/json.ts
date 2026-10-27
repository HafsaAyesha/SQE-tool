import { decodeText, guardedAdapter } from '@/lib/security/fileGuard';
import { ImportError } from '../errors';
import { atPointer, findObjectArrays, inputBytes, inputName, objectRecord, tableFromRecords } from '../table';
export const jsonAdapter = guardedAdapter({ id: 'json', label: 'JSON', icon: 'Braces', kind: 'structured', accepts: { extensions: ['.json'], mimeTypes: ['application/json', 'text/json'] }, async parse(input, options) {
  let root: unknown;
  try { root = JSON.parse(decodeText(await inputBytes(input))); } catch { throw new ImportError('This JSON is not valid. Check its syntax and export it again.'); }
  const paths = findObjectArrays(root);
  if (!paths.length) throw new ImportError('No array of objects was found in this JSON. Export your records as a JSON array.');
  const pointer = options?.jsonPath ?? paths[0];
  if (!paths.includes(pointer)) throw new ImportError('Choose one of the available JSON data paths.');
  const rows = atPointer(root, pointer);
  if (!Array.isArray(rows) || !rows.every(objectRecord)) throw new ImportError('That JSON path does not contain a table of objects.');
  return tableFromRecords(rows, { sourceType: 'json', fileName: inputName(input, options), warnings: paths.length > 1 && options?.jsonPath === undefined ? ['Multiple tables were found. Confirm the data path before continuing.'] : [], jsonPaths: paths });
} }, ['json']);
