import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { costRowSchema, rawTableSchema } from '@/lib/import/schema';
import { getAdapter, getAdapterFor, listAdapters, registerAdapter } from '@/lib/import/registry';
import { MAX_DOCUMENT_BYTES, MAX_EXPANDED_BYTES, inspectFile } from '@/lib/security/fileGuard';
import { ImportError } from '@/lib/import/errors';
const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`);
const file = (name: string, type = '') => new File([fixture(name)], name, { type });

describe('structured importer fixtures', () => {
  it.each(['codeaudit.csv', 'codeaudit.tsv', 'codeaudit.xlsx', 'codeaudit.xls', 'codeaudit.ods', 'codeaudit.json', 'codeaudit.xml', 'codeaudit-msproject.xml'])('parses %s into a guarded RawTable', async name => {
    const upload = file(name);
    const adapter = await getAdapterFor(upload);
    expect(adapter).not.toBeNull();
    const result = await adapter!.parse(upload);
    expect(rawTableSchema.safeParse(result).success).toBe(true);
    expect(result.rows).toHaveLength(3);
    expect(result.meta.fileName).toBe(name);
    expect(result.columns.length).toBeGreaterThan(1);
  });
  it('parses tab-separated clipboard text without writing a file', async () => {
    const table = await getAdapter('paste')!.parse(fixture('codeaudit-paste.txt').toString(), { fileName: 'clipboard.txt' });
    expect(table.meta.sourceType).toBe('paste');
    expect(table.rows[1]).toMatchObject({ Item: 'Cloud hosting', Actual: '80' });
  });
  it('returns workbook sheet names and switches sheets', async () => {
    for (const name of ['codeaudit.xlsx', 'codeaudit.ods', 'codeaudit.xls']) {
      const result = await getAdapter('excel')!.parse(file(name), { sheet: 'Tools' });
      expect(result.meta.sheets).toEqual(['Costs', 'Tools']);
      expect(result.meta.sheet).toBe('Tools');
      expect(result.rows).toEqual([expect.objectContaining({ Item: 'Licenses', Actual: 40 })]);
    }
  });
  it('discovers JSON arrays and switches by JSON Pointer', async () => {
    const initial = await getAdapter('json')!.parse(file('codeaudit.json'));
    expect(initial.meta.jsonPaths).toEqual(['/tables/costs', '/tables/tools']);
    const result = await getAdapter('json')!.parse(file('codeaudit.json'), { jsonPath: '/tables/tools' });
    expect(result.rows).toEqual([{ Item: 'Licenses', Estimated: 50, Actual: 40 }]);
    await expect(getAdapter('json')!.parse(file('codeaudit.json'), { jsonPath: '/__proto__' })).rejects.toThrow(/available JSON/);
  });
  it('converts MS Project hundredths and reads the primary baseline, WBS and Start', async () => {
    const result = await getAdapter('msproject')!.parse(file('codeaudit-msproject.xml'));
    expect(result.columns).toEqual(['Name', 'WBS', 'OutlineLevel', 'BaselineCost', 'ActualCost', 'Cost', 'Start']);
    expect(result.rows[0]).toEqual({ Name: 'Development', WBS: '1.1', OutlineLevel: '2', BaselineCost: 3000, ActualCost: 2800, Cost: 3000, Start: '2026-10-01T09:00:00' });
    expect(result.rows.some(row => row.Name === 'CodeAudit summary')).toBe(false);
  });
  it('auto-detects delimiters and preserves quoted newlines', async () => {
    const result = await getAdapter('csv')!.parse('Item;Actual\n"Cloud\nhosting";80\n', { fileName: 'test.csv' });
    expect(result.rows).toEqual([{ Item: 'Cloud\nhosting', Actual: '80' }]);
  });
  it('renames duplicate/reserved headers and fills missing cells', async () => {
    const result = await getAdapter('csv')!.parse('__proto__,Item,Item\nunsafe,Cloud,other\nmissing\n', { fileName: 'test.csv' });
    expect(result.columns).toEqual(['Column 1', 'Item', 'Item (2)']);
    expect(result.rows[1]).toEqual({ 'Column 1': 'missing', Item: null, 'Item (2)': null });
    expect(result.meta.warnings.length).toBeGreaterThan(0);
    expect(Object.getPrototypeOf(result.rows[0])).toBe(Object.prototype);
  });
});
describe('detection and file safety', () => {
  it.each([
    ['fake.csv', /Executable files/], ['huge.csv', /5,000 rows/], ['bomb.xlsx', /32 MB safety limit/], ['doctype.xml', /DOCTYPE/],
  ])('rejects bad fixture %s with a friendly ImportError', async (name, message) => {
    try { const upload = file(name as string); const adapter = await getAdapterFor(upload); await adapter!.parse(upload); throw new Error('unsafe acceptance'); }
    catch (error) { expect(error).toBeInstanceOf(ImportError); expect((error as Error).message).toMatch(message as RegExp); }
  });
  it('prefers magic over MIME/extensions, then MIME over extension', async () => {
    expect((await getAdapterFor(new File([fixture('codeaudit.xlsx')], 'mislabeled.csv', { type: 'text/csv' })))?.id).toBe('excel');
    expect((await getAdapterFor(new File([fixture('codeaudit.json')], 'mislabeled.csv', { type: 'text/csv' })))?.id).toBe('json');
    expect((await getAdapterFor(new File(['not-json-yet'], 'mislabeled.csv', { type: 'application/json' })))?.id).toBe('json');
    expect((await getAdapterFor(file('codeaudit.csv', 'application/octet-stream')))?.id).toBe('csv');
    await expect(getAdapter('csv')!.parse(new File([fixture('codeaudit.xlsx')], 'mislabeled.csv'))).rejects.toThrow(/contents do not match/);
  });
  it('checks the 10 MB limit and rejects unknown/executable types in direct adapters', async () => {
    await expect(getAdapter('csv')!.parse(Buffer.alloc(MAX_DOCUMENT_BYTES + 1), { fileName: 'large.csv' })).rejects.toThrow(/10 MB/);
    await expect(getAdapter('csv')!.parse(fixture('fake.csv'), { fileName: 'data.csv' })).rejects.toThrow(/Executable/);
    await expect(getAdapter('csv')!.parse('Item\nCloud', { fileName: 'data.exe' })).rejects.toThrow(/supported/);
  });
  it('rejects encrypted/corrupt ZIPs, misleading sizes, XML entities inside workbooks and traversal paths', async () => {
    const archive = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook/>'), 'xl/a.xml': strToU8('<a>'+ 'A'.repeat(10000) +'</a>') });
    const lied = Buffer.from(archive);
    for (let pos = 0; pos < lied.length - 46; pos++) if (lied.readUInt32LE(pos) === 0x02014b50 && lied.readUInt32LE(pos + 24) > 1000) lied.writeUInt32LE(1, pos + 24);
    await expect(inspectFile(lied, { fileName: 'bad.xlsx' })).rejects.toThrow(/declared size|safety limit/);
    const dtd = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<!DOCTYPE workbook><workbook/>') });
    await expect(inspectFile(Buffer.from(dtd), { fileName: 'bad.xlsx' })).rejects.toThrow(/DOCTYPE/);
    const traversal = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook/>'), '../evil': strToU8('bad') });
    await expect(inspectFile(Buffer.from(traversal), { fileName: 'bad.xlsx' })).rejects.toThrow(/damaged|unsupported/);
    expect(MAX_EXPANDED_BYTES).toBe(32 * 1024 * 1024);
  });
  it('accepts exactly 5,000 rows and rejects excess rows across CSV, JSON and XML', async () => {
    const csv = 'Item,Actual\n'+Array.from({ length: 5000 }, (_, i) => `Cost ${i},1`).join('\n');
    expect((await getAdapter('csv')!.parse(csv, { fileName: 'limit.csv' })).rows).toHaveLength(5000);
    const records = Array.from({ length: 5001 }, () => ({ Item: 'Cost', Actual: 1 }));
    await expect(getAdapter('json')!.parse(JSON.stringify(records), { fileName: 'limit.json' })).rejects.toThrow(/5,000 rows/);
    await expect(getAdapter('xml')!.parse('<Rows>'+records.map(() => '<Row><Item>Cost</Item></Row>').join('')+'</Rows>', { fileName: 'limit.xml' })).rejects.toThrow(/5,000 rows/);
  });
  it('rejects encryption flags, truncated archives and excessive text/XML shape', async () => {
    const archive = Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook/>') }));
    for (let pos = 0; pos < archive.length - 46; pos++) if (archive.readUInt32LE(pos) === 0x02014b50) archive.writeUInt16LE(1, pos + 8);
    await expect(inspectFile(archive, { fileName: 'encrypted.xlsx' })).rejects.toThrow(/Encrypted/);
    await expect(inspectFile(Buffer.from([80,75,3,4]), { fileName: 'truncated.xlsx' })).rejects.toThrow(/damaged/);
    await expect(getAdapter('csv')!.parse(Array.from({ length: 257 }, (_, i) => `c${i}`).join(',')+'\n'+Array.from({ length: 257 }, () => '1').join(','), { fileName: 'wide.csv' })).rejects.toThrow(/256 columns/);
    await expect(getAdapter('xml')!.parse('<a>'.repeat(70)+'x'+'</a>'.repeat(70), { fileName: 'deep.xml' })).rejects.toThrow(/deeply nested/);
  });
  it('handles UTF-16 MS Project XML and rejects UTF-16 DTD declarations', async () => {
    const valid = Buffer.concat([Buffer.from([255, 254]), Buffer.from(fixture('codeaudit-msproject.xml').toString(), 'utf16le')]);
    expect((await getAdapter('msproject')!.parse(valid, { fileName: 'project.xml' })).rows).toHaveLength(3);
    const bad = Buffer.concat([Buffer.from([255, 254]), Buffer.from(fixture('doctype.xml').toString(), 'utf16le')]);
    await expect(getAdapter('xml')!.parse(bad, { fileName: 'bad.xml' })).rejects.toThrow(/DOCTYPE/);
  });
  it('rejects malformed JSON/XML/CSV and invalid selection options', async () => {
    await expect(getAdapter('json')!.parse('{oops', { fileName: 'bad.json' })).rejects.toThrow(/JSON is not valid/);
    await expect(getAdapter('xml')!.parse('<a><b></a>', { fileName: 'bad.xml' })).rejects.toThrow(/not well formed/);
    await expect(getAdapter('csv')!.parse('Item,Actual\n"bad,2', { fileName: 'bad.csv' })).rejects.toThrow(/malformed quoted/);
    await expect(getAdapter('excel')!.parse(file('codeaudit.xlsx'), { sheet: 'Missing' })).rejects.toThrow(/sheet was not found/);
    await expect(getAdapter('json')!.parse('[{"Item":"a"}]', { fileName: 'deep.json', jsonPath: '/constructor' })).rejects.toThrow(/available JSON/);
  });
  it('guards runtime registrations and rejects duplicate IDs', async () => {
    registerAdapter({ id: 'test-plugin', label: 'Test plugin', icon: 'File', kind: 'structured', accepts: { extensions: ['.txt'], mimeTypes: ['text/plain'] }, parse: async () => ({ columns: ['Item'], rows: Array.from({ length: 5001 }, () => ({ Item: 'bad' })), meta: { sourceType: 'test-plugin', fileName: 'test.txt', warnings: [] } }) });
    expect(listAdapters().some(adapter => adapter.id === 'test-plugin')).toBe(true);
    await expect(getAdapter('test-plugin')!.parse('Item\nCloud', { fileName: 'test.txt' })).rejects.toThrow(/5,000 rows/);
    expect(() => registerAdapter(getAdapter('test-plugin')!)).toThrow(/unique/);
  });
});
it('defines the complete standard CostRow and rejects extra/invalid fields', () => {
  const row = { item: 'Cloud', group: null, category: null, estimated: null, actual: 0, date: '2026-10-01', notes: null, sourceRef: null, confidence: 0.8 };
  expect(costRowSchema.parse(row)).toEqual({ ...row, currency: 'USD' });
  expect(costRowSchema.safeParse({ ...row, confidence: 1.1 }).success).toBe(false);
  expect(costRowSchema.safeParse({ ...row, extra: true }).success).toBe(false);
});
