import { ImportError } from './errors';
import type { ParseOptions, RawTable } from './schema';
import { MAX_COLUMNS, MAX_ROWS } from '@/lib/security/fileGuard';
export async function inputBytes(input: File | Buffer | string) {
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  return Buffer.isBuffer(input) ? input : Buffer.from(await input.arrayBuffer());
}
export function inputName(input: File | Buffer | string, options?: ParseOptions) {
  return typeof File !== 'undefined' && input instanceof File ? input.name : options?.fileName ?? 'import.txt';
}
function headers(values: unknown[], warnings: string[]) {
  const used = new Set<string>();
  return values.map((value, index) => {
    let name = String(value ?? '').trim();
    if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)) { name = `Column ${index + 1}`; warnings.push('Blank or reserved column names were replaced.'); }
    if (name.length > 256) throw new ImportError('Column names must be 256 characters or shorter.');
    const base = name;
    for (let suffix = 2; used.has(name); suffix++) name = `${base} (${suffix})`;
    if (name !== base) warnings.push('Duplicate column names were given unique suffixes.');
    used.add(name); return name;
  });
}
export function tableFromMatrix(matrix: unknown[][], meta: RawTable['meta']): RawTable {
  if (matrix.length < 2) throw new ImportError('No data rows were found. Include a header row followed by your cost data.');
  if (matrix.length - 1 > MAX_ROWS) throw new ImportError('This table has more than 5,000 rows. Split it into smaller files.');
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  if (width > MAX_COLUMNS) throw new ImportError('This table has more than 256 columns. Remove unused columns and retry.');
  const warnings = [...meta.warnings];
  if (matrix.some(row => row.length !== matrix[0].length)) warnings.push('Some rows have different column counts; missing values are blank and extra columns have generated names.');
  const columns = headers(Array.from({ length: width }, (_, i) => matrix[0][i]), warnings);
  const rows = matrix.slice(1).map(row => Object.fromEntries(columns.map((name, i) => [name, row[i] instanceof Date ? row[i].toISOString() : row[i] ?? null])));
  return { columns, rows, meta: { ...meta, warnings: [...new Set(warnings)].slice(0, 100) } };
}
export function tableFromRecords(records: Record<string, unknown>[], meta: RawTable['meta']): RawTable {
  if (!records.length) throw new ImportError('The selected table contains no rows. Choose a different data path.');
  if (records.length > MAX_ROWS) throw new ImportError('This table has more than 5,000 rows. Split it into smaller files.');
  const keys = [...new Set(records.flatMap(row => Object.keys(row)))];
  if (keys.length > MAX_COLUMNS) throw new ImportError('This table has more than 256 columns. Remove unused columns and retry.');
  if (!keys.length) throw new ImportError('The selected rows contain no columns.');
  const warnings = [...meta.warnings];
  const columns = headers(keys, warnings);
  return { columns, rows: records.map(row => Object.fromEntries(columns.map((name, index) => [name, Object.hasOwn(row, keys[index]) ? row[keys[index]] : null]))), meta: { ...meta, warnings: [...new Set(warnings)].slice(0, 100) } };
}
export function objectRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const escapePointer = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
export function findObjectArrays(root: unknown): string[] {
  const paths: string[] = [];
  const stack = [{ value: root, path: '', depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    if (++visited > 100000 || entry.depth > 40) throw new ImportError('This document is too deeply nested or complex. Export a simpler table.');
    if (Array.isArray(entry.value)) {
      if (entry.value.length && entry.value.every(objectRecord)) { paths.push(entry.path); if (paths.length > 100) throw new ImportError('This document has too many tables. Export only the cost data.'); }
      // Inspect nested structures without recursively growing the JavaScript call stack.
      for (let i = Math.min(entry.value.length, 100000) - 1; i >= 0; i--) if (typeof entry.value[i] === 'object' && entry.value[i] !== null) stack.push({ value: entry.value[i], path: `${entry.path}/${i}`, depth: entry.depth + 1 });
    } else if (objectRecord(entry.value)) {
      const keys = Object.keys(entry.value);
      for (let i = keys.length - 1; i >= 0; i--) { const key = keys[i]; if (typeof entry.value[key] === 'object' && entry.value[key] !== null) stack.push({ value: entry.value[key], path: `${entry.path}/${escapePointer(key)}`, depth: entry.depth + 1 }); }
    }
  }
  return paths;
}
export function atPointer(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;
  if (!pointer.startsWith('/')) throw new ImportError('Choose one of the available data paths.');
  let value = root;
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if ((!objectRecord(value) && !Array.isArray(value)) || !Object.hasOwn(value, key)) throw new ImportError('That data path was not found. Choose an available path.');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
