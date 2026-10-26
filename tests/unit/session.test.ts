import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createServerClient: vi.fn(), config: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('@/lib/supabase/config', () => ({ getSupabaseConfig: mocks.config }));
import { updateSession } from '@/lib/supabase/middleware';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ url: 'https://example.supabase.co', anonKey: 'public-test-key' });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
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
});
