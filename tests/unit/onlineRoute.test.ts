import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const mocks = vi.hoisted(() => ({ requireProject: vi.fn(), safeFetch: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/requireProject', () => ({ requireProject: mocks.requireProject }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock('@/lib/security/urlGuard', async original => ({ ...await original<typeof import('@/lib/security/urlGuard')>(), safeFetch: mocks.safeFetch }));
import { POST } from '@/app/api/projects/[id]/import/fetch/route';
import { decryptSourceConfig } from '@/lib/security/sourceEncryption';
const projectId = '33333333-3333-4333-8333-333333333333';
const sourceId = '44444444-4444-4444-8444-444444444444';
const context = { params: Promise.resolve({ id: projectId }) };
const input = { type: 'url', url: 'https://public.example/data?token=synthetic-query-key', headerName: 'X-API-Key', apiKey: 'synthetic-test-key' };
function request(input: unknown) { return new Request('http://localhost/api/projects/id/import/fetch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }); }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('SOURCE_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  mocks.requireProject.mockResolvedValue({ id: projectId });
  mocks.safeFetch.mockResolvedValue({ bytes: readFileSync('tests/fixtures/codeaudit.csv'), contentType: 'text/csv' });
  const query = { insert: mocks.insert, update: mocks.update, eq: mocks.eq, select: mocks.select, single: mocks.single };
  for (const mock of [mocks.from, mocks.insert, mocks.update, mocks.eq, mocks.select]) mock.mockReturnValue(query);
  mocks.single.mockResolvedValue({ data: { id: sourceId }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it('uses credentials transiently by default, with no DB write or credential echo', async () => {
  vi.stubEnv('SOURCE_ENCRYPTION_KEY', undefined);
  const result = await POST(request(input), context);
  expect(result.status).toBe(200);
  const body = await result.json(); expect(body.rows).toHaveLength(3);
  expect(JSON.stringify(body)).not.toContain('synthetic-test-key'); expect(JSON.stringify(body)).not.toContain('synthetic-query-key');
  expect(mocks.from).not.toHaveBeenCalled();
  expect(result.headers.get('cache-control')).toBe('private, no-store');
});
it('saves only an authenticated encrypted configuration under the authorized project', async () => {
  const result = await POST(request({ ...input, saveSource: true }), context);
  expect(result.status).toBe(200); expect((await result.json()).sourceId).toBe(sourceId);
  const stored = mocks.insert.mock.calls[0][0];
  expect(stored.project_id).toBe(projectId);
  expect(stored.last_imported_at).toBeUndefined();
  expect(JSON.stringify(stored)).not.toContain('synthetic-test-key'); expect(JSON.stringify(stored)).not.toContain('synthetic-query-key');
  expect(decryptSourceConfig(stored.config_encrypted, projectId, 'url')).toMatchObject({ ...input, saveSource: true });
});
it('updates saved selections with both source and project filters', async () => {
  expect((await POST(request({ ...input, saveSource: true, sourceId, jsonPath: '/tables/tools' }), context)).status).toBe(200);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.eq).toHaveBeenCalledWith('project_id', projectId); expect(mocks.eq).toHaveBeenCalledWith('id', sourceId);
});
it('fails closed before fetching when saved-source encryption is unconfigured', async () => {
  vi.stubEnv('SOURCE_ENCRYPTION_KEY', '');
  expect((await POST(request({ ...input, saveSource: true }), context)).status).toBe(503);
  expect(mocks.safeFetch).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
it('checks project ownership before fetching or parsing credentials', async () => {
  mocks.requireProject.mockRejectedValue(Object.assign(new Error('not found'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }));
  expect((await POST(request(input), context)).status).toBe(404);
  expect(mocks.safeFetch).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
it('rejects invalid bodies, header injection and oversized configurations', async () => {
  for (const bad of [{ ...input, type: 'invalid' }, { ...input, url: 'not-a-url' }, { ...input, headerName: 'Host' }, { ...input, apiKey: 'key\r\ninjection' }, { ...input, saveSource: 'true' }]) expect((await POST(request(bad), context)).status).toBe(400);
  expect((await POST(request({ ...input, apiKey: 'x'.repeat(40000) }), context)).status).toBe(413);
  expect(mocks.safeFetch).not.toHaveBeenCalled();
});
