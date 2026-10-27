import * as cheerio from 'cheerio';
import { ImportError } from './errors';
import { decodeText } from '@/lib/security/fileGuard';
import { MAX_DOCUMENT_BYTES, MAX_ROWS, MAX_COLUMNS } from './limits';
import { tableFromMatrix } from './table';
export function parseHtmlTables(bytes: Buffer, tableIndex = 0) {
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new ImportError('The web page exceeds the 10 MB limit.', 413);
  const $ = cheerio.load(decodeText(bytes), { xml: false });
  $('script,style,noscript,iframe,object,template').remove();
  const tables = $('table').filter((_, element) => $(element).parents('table').length === 0).toArray();
  if (!tables.length) throw new ImportError('No HTML tables were found on this page. Choose a page containing a data table.');
  if (tables.length > 100) throw new ImportError('This page contains too many tables. Use a direct CSV or JSON export.');
  if (!tables[tableIndex]) throw new ImportError('That table was not found. Choose an available table.');
  const names = tables.map((element, i) => `${i+1}. ${$(element).children('caption').text().replace(/\s+/g, ' ').trim().slice(0, 240) || `Table ${i+1}`}`);
  const selected = tables[tableIndex];
  const sourceRows = $(selected).find('tr').filter((_, element) => $(element).closest('table')[0] === selected).toArray();
  if (sourceRows.length > MAX_ROWS + 1) throw new ImportError('This web table has more than 5,000 rows. Use a smaller export.');
  const matrix: string[][] = sourceRows.map(() => []);
  let merged = false;
  sourceRows.forEach((element, row) => {
    let column = 0;
    $(element).children('th,td').each((_, cell) => {
      while (matrix[row][column] !== undefined) column++;
      const colspan = Number($(cell).attr('colspan') || 1), rowspan = Number($(cell).attr('rowspan') || 1);
      if (!Number.isInteger(colspan) || colspan < 1 || column + colspan > MAX_COLUMNS || !Number.isInteger(rowspan) || rowspan < 1 || rowspan > MAX_ROWS + 1) throw new ImportError('This web table has unsupported merged cells or too many columns.');
      const clone = $(cell).clone(); clone.find('table').remove();
      const text = clone.text().replace(/\s+/g, ' ').trim();
      merged ||= colspan > 1 || rowspan > 1;
      for (let r = row; r < Math.min(row + rowspan, matrix.length); r++) for (let c = column; c < column + colspan; c++) { if (matrix[r][c] !== undefined) throw new ImportError('This web table has overlapping merged cells.'); matrix[r][c] = text; }
      column += colspan;
    });
  });
  const warnings: string[] = [];
  if (merged) warnings.push('Merged table cells were repeated across their spanned positions. Review the column mapping.');
  if (!sourceRows.length) throw new ImportError('The selected web table has no rows.');
  if (!$(sourceRows[0]).children('th').length) { matrix.unshift(Array.from({ length: matrix.reduce((max, row) => Math.max(max, row.length), 0) }, (_, i) => `Column ${i+1}`)); warnings.push('This table had no header cells; column names were generated.'); }
  return tableFromMatrix(matrix, { sourceType: 'html', fileName: 'web-table.html', tables: names, tableIndex, warnings });
}
