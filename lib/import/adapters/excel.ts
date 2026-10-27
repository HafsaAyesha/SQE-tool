import * as XLSX from 'xlsx';
import { guardedAdapter, MAX_COLUMNS, MAX_ROWS } from '@/lib/security/fileGuard';
import { ImportError } from '../errors';
import { inputBytes, inputName, tableFromMatrix } from '../table';
export const excelAdapter = guardedAdapter({ id: 'excel', label: 'Excel / OpenDocument', icon: 'FileSpreadsheet', kind: 'structured', accepts: { extensions: ['.xlsx', '.xls', '.ods'], mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/vnd.oasis.opendocument.spreadsheet'] }, async parse(input, options) {
  const workbook = XLSX.read(await inputBytes(input), { type: 'buffer', cellDates: true, cellFormula: false, cellHTML: false, bookVBA: false, sheetRows: MAX_ROWS + 2 });
  if (!workbook.SheetNames.length || workbook.SheetNames.length > 200) throw new ImportError('This workbook has no readable sheets or more than 200 sheets. Export a smaller workbook.');
  const sheet = options?.sheet ?? workbook.SheetNames[0];
  if (!workbook.SheetNames.includes(sheet)) throw new ImportError('That sheet was not found. Choose a sheet from this workbook.');
  const worksheet = workbook.Sheets[sheet];
  const reference = worksheet['!fullref'] ?? worksheet['!ref'];
  if (!reference) throw new ImportError('The selected sheet is empty. Choose a sheet containing a header and data.');
  const range = XLSX.utils.decode_range(reference);
  if (range.e.r - range.s.r > MAX_ROWS) throw new ImportError('This sheet has more than 5,000 rows. Remove unused rows or export a smaller sheet.');
  if (range.e.c - range.s.c + 1 > MAX_COLUMNS) throw new ImportError('This sheet has more than 256 columns. Remove unused columns and retry.');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: null, blankrows: false });
  return tableFromMatrix(matrix, { sourceType: 'excel', fileName: inputName(input, options), sheet, sheets: workbook.SheetNames, warnings: ['Only cell values are imported. Formulas, macros and external links are never executed.'] });
} }, ['xlsx', 'xls', 'ods']);
