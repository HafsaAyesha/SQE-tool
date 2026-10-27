import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_DOCUMENT_BYTES } from '@/lib/import/limits';
const auth = vi.hoisted(() => ({ requireProject: vi.fn() }));
vi.mock('@/lib/supabase/requireProject', () => ({ requireProject: auth.requireProject }));
import { POST } from '@/app/api/projects/[id]/import/parse/route';
const context = { params: Promise.resolve({ id: '33333333-3333-4333-8333-333333333333' }) };
beforeEach(() => { vi.clearAllMocks(); auth.requireProject.mockResolvedValue({ id: 'project' }); });
function request(name: string, bytes: string | Buffer, options: Record<string, string> = {}) {
  const form = new FormData(); form.set('file', new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name));
  for (const [key, value] of Object.entries(options)) form.set(key, value);
  return new Request('http://localhost/api/projects/id/import/parse', { method: 'POST', body: form });
}
it('returns only 200 preview rows, correct total count, and no-store', async () => {
  const data = 'Item,Actual\n'+Array.from({ length: 501 }, (_, i) => `Cost ${i},10`).join('\n');
  const response = await POST(request('costs.csv', data), context);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.rows).toHaveLength(200);
  expect(body.totalCount).toBe(501);
  expect(body.previewLimit).toBe(200);
  expect(body.columns).toEqual(['Item', 'Actual']);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(auth.requireProject).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
});
it.each(['fake.csv', 'huge.csv', 'bomb.xlsx', 'doctype.xml'])('rejects bad upload %s with a friendly JSON error', async name => {
  const response = await POST(request(name, readFileSync(`tests/fixtures/${name}`)), context);
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(typeof body.error).toBe('string');
  expect(body.rows).toBeUndefined();
});
it('accepts sheet/path options and explicit tab-separated paste', async () => {
  const excel = await POST(request('costs.xlsx', readFileSync('tests/fixtures/codeaudit.xlsx'), { sheet: 'Tools' }), context);
  expect(excel.status).toBe(200);
  expect((await excel.json()).rows[0].Item).toBe('Licenses');
  const json = await POST(request('costs.json', readFileSync('tests/fixtures/codeaudit.json'), { jsonPath: '/tables/tools' }), context);
  expect(json.status).toBe(200);
  expect((await json.json()).totalCount).toBe(1);
  const paste = await POST(request('paste.txt', 'Item\tActual\nCloud\t80', { adapterId: 'paste' }), context);
  expect(paste.status).toBe(200);
  expect((await paste.json()).meta.sourceType).toBe('paste');
});
it('checks ownership before reading invalid uploads and returns 404', async () => {
  auth.requireProject.mockRejectedValue(Object.assign(new Error('not found'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }));
  const response = await POST(new Request('http://localhost/api/projects/id/import/parse', { method: 'POST' }), context);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'Project not found.' });
});
it('rejects declared and streamed oversized bodies, even without Content-Length', async () => {
  const declared = new Request('http://localhost/api/projects/id/import/parse', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(MAX_DOCUMENT_BYTES + 65537) }, body: 'small' });
  expect((await POST(declared, context)).status).toBe(413);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_DOCUMENT_BYTES + 65537)); }, cancel() { cancelled = true; } });
  const streamed = new Request('http://localhost/api/projects/id/import/parse', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' });
  expect((await POST(streamed, context)).status).toBe(413);
  expect(cancelled).toBe(true);
});
it('rejects missing files, multiple files and invalid options', async () => {
  const missing = new FormData(); missing.set('sheet', 'Tools');
  expect((await POST(new Request('http://localhost/api/projects/id/import/parse', { method: 'POST', body: missing }), context)).status).toBe(400);
  const multiple = new FormData(); multiple.append('file', new File(['a\nb'], 'a.csv')); multiple.append('file', new File(['a\nb'], 'b.csv'));
  expect((await POST(new Request('http://localhost/api/projects/id/import/parse', { method: 'POST', body: multiple }), context)).status).toBe(400);
  expect((await POST(request('costs.csv', 'a\nb', { adapterId: '__proto__' }), context)).status).toBe(400);
});
