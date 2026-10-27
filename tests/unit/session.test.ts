import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createServerClient: vi.fn(), config: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('@/lib/supabase/config', () => ({ getSupabaseConfig: mocks.config }));
import { updateSession } from '@/lib/supabase/middleware';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ url: 'https://example.supabase.co', anonKey: 'public-test-key' });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle };
  for (const mock of [mocks.from, mocks.select, mocks.eq]) mock.mockReturnValue(query);
  mocks.maybeSingle.mockResolvedValue({ data: { id: 'project' }, error: null });
  mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
});
describe('session middleware', () => {
  it('fails closed without configuration', async () => {
    mocks.config.mockReturnValue(null);
    const response = await updateSession(new NextRequest('http://localhost/projects'));
    expect(response.headers.get('location')).toBe('http://localhost/login');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
  it('redirects unauthenticated nested workspace routes', async () => {
    const response = await updateSession(new NextRequest('http://localhost/projects/id/import'));
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });
  it('lets verified users through and refreshes response and request cookies', async () => {
    const request = new NextRequest('http://localhost/projects');
    mocks.getUser.mockImplementation(async () => {
      mocks.createServerClient.mock.calls[0][2].cookies.setAll([{ name: 'refreshed-session', value: 'test-session', options: { httpOnly: true, path: '/' } }]);
      return { data: { user: { id: 'owner' } }, error: null };
    });
    const response = await updateSession(request);
    expect(response.headers.get('location')).toBeNull();
    expect(request.cookies.get('refreshed-session')?.value).toBe('test-session');
    expect(response.cookies.get('refreshed-session')?.value).toBe('test-session');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('keeps cleared or refreshed cookies when redirecting a signed-out user', async () => {
    mocks.getUser.mockImplementation(async () => {
      mocks.createServerClient.mock.calls[0][2].cookies.setAll([{ name: 'expired-session', value: '', options: { maxAge: 0, path: '/' } }]);
      return { data: { user: null }, error: null };
    });
    const response = await updateSession(new NextRequest('http://localhost/reports'));
    expect(response.headers.get('location')).toBe('http://localhost/login');
    expect(response.cookies.get('expired-session')?.value).toBe('');
  });
  it('checks project and owner IDs before rendering an authorized project URL', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
    const id = '33333333-3333-4333-8333-333333333333';
    const response = await updateSession(new NextRequest(`http://localhost/projects/${id}`));
    expect(response.status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith('id', id);
    expect(mocks.eq).toHaveBeenCalledWith('owner_id', 'owner');
  });
  it('returns a real uncached 404 and preserves refreshed cookies for inaccessible projects', async () => {
    mocks.getUser.mockImplementation(async () => {
      mocks.createServerClient.mock.calls[0][2].cookies.setAll([{ name: 'session', value: 'refreshed-test', options: { path: '/' } }]);
      return { data: { user: { id: 'other-owner' } }, error: null };
    });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await updateSession(new NextRequest('http://localhost/projects/33333333-3333-4333-8333-333333333333'));
    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBe('http://localhost/not-found');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.cookies.get('session')?.value).toBe('refreshed-test');
  });
  it('returns 404 for malformed project IDs without querying Postgres', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
    const response = await updateSession(new NextRequest('http://localhost/projects/invalid'));
    expect(response.status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('reports database failures as unavailable rather than as missing projects', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: 'unavailable' } });
    const response = await updateSession(new NextRequest('http://localhost/projects/33333333-3333-4333-8333-333333333333'));
    expect(response.status).toBe(503);
    logger.mockRestore();
  });

});
