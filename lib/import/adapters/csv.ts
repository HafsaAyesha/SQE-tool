import Papa from 'papaparse';
import type { ParseOptions, RawTable } from '../schema';
import { ImportError } from '../errors';
import { inputBytes, inputName, tableFromMatrix } from '../table';
import { decodeText, guardedAdapter, MAX_ROWS } from '@/lib/security/fileGuard';
export async function parseDelimited(input: File | Buffer | string, options?: ParseOptions, pasted = false): Promise<RawTable> {
  const text = decodeText(await inputBytes(input));
  const result = Papa.parse<string[]>(text, { delimiter: pasted ? '\t' : '', skipEmptyLines: 'greedy', preview: MAX_ROWS + 2 });
  if (result.errors.some(error => error.code !== 'UndetectableDelimiter')) throw new ImportError('This delimited file contains a malformed quoted value. Check the quotes and export it again.');
  const warnings = result.errors.length ? ['No delimiter was detected; the data was read as a single column.'] : [];
  return tableFromMatrix(result.data, { sourceType: pasted ? 'paste' : 'csv', fileName: inputName(input, options), warnings });
}
export const csvAdapter = guardedAdapter({ id: 'csv', label: 'CSV / TSV / text', icon: 'FileSpreadsheet', kind: 'structured', accepts: { extensions: ['.csv', '.tsv', '.txt'], mimeTypes: ['text/csv', 'application/csv', 'text/tab-separated-values', 'text/plain'] }, parse: parseDelimited }, ['text']);
