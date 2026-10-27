import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock('@/lib/security/urlGuard', async original => ({ ...await original<typeof import('@/lib/security/urlGuard')>(), safeFetch: mocks.safeFetch }));
import { getAdapter } from '@/lib/import/registry';
import { googleSheetExport } from '@/lib/import/adapters/gsheets';
import { parseHtmlTables } from '@/lib/import/htmlTable';
beforeEach(() => vi.clearAllMocks());
it('turns Google share/published links and gid fragments into canonical public CSV exports', async () => {
  expect(googleSheetExport('https://docs.google.com/spreadsheets/d/abc_123/edit?usp=sharing#gid=42')).toBe('https://docs.google.com/spreadsheets/d/abc_123/export?format=csv&gid=42');
  expect(googleSheetExport('https://docs.google.com/spreadsheets/d/e/published-123/pubhtml?gid=3')).toBe('https://docs.google.com/spreadsheets/d/e/published-123/pub?output=csv&gid=3');
  expect(() => googleSheetExport('https://docs.google.com.evil.example/spreadsheets/d/id/edit')).toThrow(/Google Sheets/);
  mocks.safeFetch.mockResolvedValue({ bytes: readFileSync('tests/fixtures/codeaudit.csv'), contentType: 'text/csv' });
  const table = await getAdapter('gsheets')!.parse('https://docs.google.com/spreadsheets/d/abc_123/edit');
  expect(table.rows).toHaveLength(3); expect(table.meta.sourceType).toBe('gsheets');
  const policy = mocks.safeFetch.mock.calls[0][1];
  expect(policy.maxRedirects).toBe(3);
  expect(policy.redirectHosts('export.googleusercontent.com')).toBe(true);
  expect(policy.redirectHosts('googleusercontent.com.evil.example')).toBe(false);
});
it('parses JSON APIs and optional paths, and CSV URLs through the existing guarded adapters', async () => {
  mocks.safeFetch.mockResolvedValueOnce({ bytes: readFileSync('tests/fixtures/codeaudit.json'), contentType: 'application/json' }).mockResolvedValueOnce({ bytes: readFileSync('tests/fixtures/codeaudit.csv'), contentType: 'text/csv' });
  const json = await getAdapter('url')!.parse('https://public.example/data', { jsonPath: '/tables/tools', headerName: 'X-API-Key', apiKey: 'synthetic-test-key' });
  expect(json.rows).toEqual([{ Item: 'Licenses', Estimated: 50, Actual: 40 }]);
  expect(mocks.safeFetch).toHaveBeenCalledWith('https://public.example/data', { headerName: 'X-API-Key', apiKey: 'synthetic-test-key' });
  expect((await getAdapter('url')!.parse('https://public.example/costs.csv')).rows).toHaveLength(3);
});
it('discovers web tables, selects them, and treats scripts as inert text that is removed', async () => {
  mocks.safeFetch.mockResolvedValue({ bytes: readFileSync('tests/fixtures/codeaudit-web.html'), contentType: 'text/html' });
  const first = await getAdapter('html')!.parse('https://public.example/costs');
  expect(first.meta.tables).toEqual(['1. Project costs', '2. Tools']);
  expect(first.rows[0]).toEqual({ Item: 'Cloud hosting', Estimated: '100', Actual: '80' });
  const second = await getAdapter('html')!.parse('https://public.example/costs', { tableIndex: 1 });
  expect(second.rows).toEqual([{ Item: 'Licenses', Actual: '40' }]);
  expect((await getAdapter('url')!.parse('https://public.example/costs', { autoDetect: true })).meta.sourceType).toBe('html');
  await expect(getAdapter('url')!.parse('https://public.example/costs')).rejects.toThrow(/Web page table/);
});
it('handles headerless/merged tables and rejects invalid or oversized tables', () => {
  const merged = parseHtmlTables(Buffer.from('<table><tr><th>Item</th><th>Actual</th></tr><tr><td rowspan="2">Cloud</td><td>80</td></tr><tr><td>90</td></tr></table>'));
  expect(merged.rows).toEqual([{ Item: 'Cloud', Actual: '80' }, { Item: 'Cloud', Actual: '90' }]);
  const headerless = parseHtmlTables(Buffer.from('<table><tr><td>Cloud</td><td>80</td></tr><tr><td>Tools</td><td>40</td></tr></table>'));
  expect(headerless.rows).toHaveLength(2); expect(headerless.columns).toEqual(['Column 1', 'Column 2']);
  expect(() => parseHtmlTables(Buffer.from('<html><p>No table</p></html>'))).toThrow(/No HTML tables/);
  expect(() => parseHtmlTables(readFileSync('tests/fixtures/codeaudit-web.html'), 99)).toThrow(/not found/);
  expect(() => parseHtmlTables(Buffer.from('<table><tr><th>Item</th></tr>'+'<tr><td>Cost</td></tr>'.repeat(5001)+'</table>'))).toThrow(/5,000/);
});
